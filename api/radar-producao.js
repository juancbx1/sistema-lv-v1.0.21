// api/radar-producao.js
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import jwt from 'jsonwebtoken';
import express from 'express';

// ==========================================================================
// FUNÇÃO HELPER REUTILIZÁVEL PARA CALCULAR SALDO DE ARREMATE
// ==========================================================================
async function getSaldoArremate(dbClient, produtoId, variante) {
    const query = `
        WITH ProducaoRealOP AS (
            SELECT 
                numero,
                COALESCE(
                    (SELECT NULLIF(TRIM(e->>'quantidade'), '')::numeric
                     FROM jsonb_array_elements(etapas) e 
                     WHERE e->>'lancado' = 'true' AND e->>'quantidade' IS NOT NULL 
                     ORDER BY e->>'data_lancamento' DESC NULLS LAST LIMIT 1),
                    quantidade
                ) as quantidade_real_produzida
            FROM ordens_de_producao
            WHERE status = 'finalizado' AND produto_id = $1 AND variante = $2
        ),
        ArrematadoPorOP AS (
            SELECT op_numero, SUM(quantidade_arrematada) as total_arrematado
            FROM arremates 
            WHERE tipo_lancamento IN ('PRODUCAO', 'PERDA') AND produto_id = $1 AND variante = $2
            GROUP BY op_numero
        ),
        SessoesAtivas AS (
            SELECT COALESCE(SUM(quantidade_entregue), 0)::integer as total_em_trabalho
            FROM sessoes_trabalho_arremate 
            WHERE status = 'EM_ANDAMENTO' AND produto_id = $1 AND variante = $2
        )
        SELECT 
            GREATEST(0, COALESCE(
                (SELECT SUM(p_real.quantidade_real_produzida - COALESCE(ar.total_arrematado, 0))
                 FROM ProducaoRealOP p_real
                 LEFT JOIN ArrematadoPorOP ar ON p_real.numero = ar.op_numero
                 WHERE (p_real.quantidade_real_produzida - COALESCE(ar.total_arrematado, 0)) > 0), 0)
            ) - (SELECT total_em_trabalho FROM SessoesAtivas)
            AS saldo_final;
    `;
    const result = await dbClient.query(query, [produtoId, variante]);
    return result.rows[0].saldo_final || 0;
}

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;



// --- Middleware de Autenticação (copiado de outros arquivos para consistência) ---
router.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token mal formatado' });
    }
    try {
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
});


// ==========================================================================
// ROTA 1: ALERTAS DE ESTOQUE (ZERADO E BAIXO)
// GET /api/radar-producao/alertas
// ==========================================================================
router.get('/alertas', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // --- ETAPA 1: BUSCAR TODOS OS DADOS BRUTOS DE UMA SÓ VEZ ---
        const [opsResult, arrematesResult, sessoesResult, estoqueResult, produtosResult, arquivadosResult] = await Promise.all([
            dbClient.query("SELECT numero, produto_id, variante, quantidade, etapas FROM ordens_de_producao WHERE status = 'finalizado'"),
            dbClient.query("SELECT produto_id, variante, op_numero, quantidade_arrematada, quantidade_ja_embalada, tipo_lancamento FROM arremates"),
            dbClient.query("SELECT produto_id, variante, quantidade_entregue FROM sessoes_trabalho_arremate WHERE status = 'EM_ANDAMENTO'"),
            dbClient.query(`SELECT produto_id, variante_nome, SUM(quantidade)::integer as saldo_atual FROM estoque_movimentos GROUP BY produto_id, variante_nome`),
            dbClient.query("SELECT id, nome, sku, imagem, grade FROM produtos"),
            dbClient.query("SELECT produto_ref_id FROM estoque_itens_arquivados")
        ]);

        // Helper para obter a quantidade real
        const obterQuantidadeFinalProduzida = (op) => {
            // Caso base: se não houver OP ou etapas, usa a quantidade principal
            if (!op || !Array.isArray(op.etapas) || op.etapas.length === 0) {
                return parseInt(op?.quantidade, 10) || 0;
            }
            
            // Procura a última etapa lançada que tenha uma quantidade válida
            for (let i = op.etapas.length - 1; i >= 0; i--) {
                const etapa = op.etapas[i];
                
                // Verifica se a etapa e a quantidade existem (não são null/undefined)
                if (etapa && etapa.lancado && etapa.quantidade !== null && etapa.quantidade !== undefined) {
                    // Converte para string para poder usar .trim() com segurança
                    const qtdString = String(etapa.quantidade).trim();
                    
                    if (qtdString !== '') {
                        const qtdNumerica = parseInt(qtdString, 10);
                        if (!isNaN(qtdNumerica) && qtdNumerica >= 0) {
                            return qtdNumerica; // Retorna a primeira quantidade válida que encontrar
                        }
                    }
                }
            }
            
            // Se não encontrar nenhuma quantidade válida nas etapas, retorna a da OP
            return parseInt(op.quantidade, 10) || 0;
        };
        
        const produtosMap = new Map(produtosResult.rows.map(p => [p.id, p]));
        const skusArquivados = new Set(arquivadosResult.rows.map(r => r.produto_ref_id));
        
        const arrematadoPorOp = new Map();
        arrematesResult.rows.forEach(ar => {
            if (ar.tipo_lancamento === 'PRODUCAO' || ar.tipo_lancamento === 'PERDA') {
                const atual = arrematadoPorOp.get(ar.op_numero) || 0;
                arrematadoPorOp.set(ar.op_numero, atual + ar.quantidade_arrematada);
            }
        });

        const sessoesPorProduto = new Map();
        sessoesResult.rows.forEach(s => {
            const chave = `${s.produto_id}|${s.variante}`;
            sessoesPorProduto.set(chave, (sessoesPorProduto.get(chave) || 0) + s.quantidade_entregue);
        });

        const saldoArremateFinal = new Map();
        opsResult.rows.forEach(op => {
            const produzido = obterQuantidadeFinalProduzida(op);
            const arrematado = arrematadoPorOp.get(op.numero) || 0;
            const saldoOp = produzido - arrematado;
            if (saldoOp > 0) {
                const chave = `${op.produto_id}|${op.variante}`;
                saldoArremateFinal.set(chave, (saldoArremateFinal.get(chave) || 0) + saldoOp);
            }
        });
        saldoArremateFinal.forEach((saldo, chave) => {
            const emTrabalho = sessoesPorProduto.get(chave) || 0;
            saldoArremateFinal.set(chave, saldo - emTrabalho);
        });

        const saldoEmbalagemFinal = new Map();
        arrematesResult.rows.forEach(ar => {
            if (ar.tipo_lancamento === 'PRODUCAO') {
                const chave = `${ar.produto_id}|${ar.variante}`;
                const saldo = ar.quantidade_arrematada - ar.quantidade_ja_embalada;
                if (saldo > 0) {
                    saldoEmbalagemFinal.set(chave, (saldoEmbalagemFinal.get(chave) || 0) + saldo);
                }
            }
        });

        // --- ETAPA 3: MONTAR O RESULTADO FINAL ---
        const itensEnriquecidos = estoqueResult.rows
            .filter(item => item.saldo_atual <= 3 && item.produto_id)
            .map(item => {
                const produtoInfo = produtosMap.get(item.produto_id);
                if (!produtoInfo) return null; // Produto não existe mais, ignora

                const chave = `${item.produto_id}|${item.variante_nome}`;
                const g = (produtoInfo.grade || []).find(g => g.variacao === item.variante_nome);
                const sku = g?.sku || produtoInfo.sku;

                return {
                    produto_id: item.produto_id,
                    nome: produtoInfo.nome,
                    variante: item.variante_nome,
                    saldo_atual: item.saldo_atual,
                    saldo_arremate: Math.max(0, saldoArremateFinal.get(chave) || 0),
                    saldo_embalagem: saldoEmbalagemFinal.get(chave) || 0,
                    sku: sku,
                    imagem: g?.imagem || produtoInfo.imagem
                };
            })
            .filter(item => item && !skusArquivados.has(item.sku)); // Filtra nulos e arquivados
        
        const zerado = itensEnriquecidos.filter(item => item.saldo_atual === 0).sort((a,b) => a.nome.localeCompare(b.nome));
        const baixo = itensEnriquecidos.filter(item => item.saldo_atual > 0).sort((a,b) => a.nome.localeCompare(b.nome));

        res.status(200).json({ zerado, baixo });

    } catch (error) {
        console.error('[API /radar-producao/alertas] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar alertas de estoque.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ==========================================================================
// ROTA 2: CONSULTA DE FUNIL DE PRODUÇÃO
// GET /api/radar-producao/funil?busca=...
// ==========================================================================
router.get('/funil', async (req, res) => {
    const { busca } = req.query;
    if (!busca) {
        return res.status(400).json({ error: 'Parâmetro de busca é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const termoBusca = `%${busca}%`;

        // Passo 1: Encontrar o produto correspondente (sem alterações)
        const produtoQuery = `
            SELECT 
                p.id as produto_id, p.nome,
                g.variacao as variante, g.sku,
                COALESCE(g.imagem, p.imagem) as imagem
            FROM produtos p
            LEFT JOIN jsonb_to_recordset(p.grade) AS g(sku TEXT, variacao TEXT, imagem TEXT) ON true
            WHERE 
                (p.sku ILIKE $1) OR (g.sku ILIKE $1) OR
                (p.nome ILIKE $1 AND g.variacao IS NULL) OR 
                (p.nome ILIKE $1 AND g.variacao ILIKE $1) OR
                (g.variacao ILIKE $1)
            LIMIT 1;
        `;
        const produtoResult = await dbClient.query(produtoQuery, [termoBusca]);

        if (produtoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Nenhum produto encontrado.' });
        }
        const produtoInfo = produtoResult.rows[0];

        // --- INÍCIO DA NOVA LÓGICA DE CÁLCULO "BULK DATA" PARA UM ÚNICO PRODUTO ---
        
        const { produto_id, variante } = produtoInfo;

        const [opsResult, arrematesResult, sessoesResult, embalagemResult, estoqueResult] = await Promise.all([
            dbClient.query("SELECT numero, quantidade, etapas FROM ordens_de_producao WHERE status = 'finalizado' AND produto_id = $1 AND variante = $2", [produto_id, variante]),
            dbClient.query("SELECT op_numero, quantidade_arrematada, tipo_lancamento FROM arremates WHERE tipo_lancamento IN ('PRODUCAO', 'PERDA') AND produto_id = $1 AND variante = $2", [produto_id, variante]),
            dbClient.query("SELECT COALESCE(SUM(quantidade_entregue), 0)::integer as total FROM sessoes_trabalho_arremate WHERE status = 'EM_ANDAMENTO' AND produto_id = $1 AND variante = $2", [produto_id, variante]),
            dbClient.query("SELECT COALESCE(SUM(quantidade_arrematada - quantidade_ja_embalada), 0)::integer as total FROM arremates WHERE tipo_lancamento = 'PRODUCAO' AND produto_id = $1 AND variante = $2", [produto_id, variante]),
            dbClient.query("SELECT COALESCE(SUM(quantidade), 0)::integer as total FROM estoque_movimentos WHERE produto_id = $1 AND variante_nome = $2", [produto_id, variante])
        ]);

        const obterQuantidadeFinalProduzida = (op) => {
            if (!op || !Array.isArray(op.etapas) || op.etapas.length === 0) return parseInt(op?.quantidade, 10) || 0;
            for (let i = op.etapas.length - 1; i >= 0; i--) {
                const etapa = op.etapas[i];
                if (etapa && etapa.lancado && etapa.quantidade !== null && etapa.quantidade !== undefined) {
                    const qtdString = String(etapa.quantidade).trim();
                    if (qtdString !== '') {
                        const qtdNumerica = parseInt(qtdString, 10);
                        if (!isNaN(qtdNumerica) && qtdNumerica >= 0) return qtdNumerica;
                    }
                }
            }
            return parseInt(op.quantidade, 10) || 0;
        };

        const arrematadoMap = new Map();
        arrematesResult.rows.forEach(ar => {
            arrematadoMap.set(ar.op_numero, (arrematadoMap.get(ar.op_numero) || 0) + ar.quantidade_arrematada);
        });

        let saldoBrutoTotal = 0;
        opsResult.rows.forEach(op => {
            const produzido = obterQuantidadeFinalProduzida(op);
            const jaArrematado = arrematadoMap.get(op.numero) || 0;
            const saldoOp = produzido - jaArrematado;
            if (saldoOp > 0) {
                saldoBrutoTotal += saldoOp;
            }
        });
        
        const quantidadeEmTrabalho = sessoesResult.rows[0].total;
        const saldoFinalArremate = saldoBrutoTotal - quantidadeEmTrabalho;
        
        // --- FIM DA NOVA LÓGICA DE CÁLCULO ---

        res.status(200).json({
            produto: produtoInfo,
            funil: {
                arremate: { qtd: Math.max(0, saldoFinalArremate), info: "" },
                embalagem: { qtd: embalagemResult.rows[0].total, info: "" },
                estoque: { qtd: estoqueResult.rows[0].total, info: "" }
            }
        });

    } catch (error) {
        console.error('[API /radar-producao/funil] Erro:', error);
        res.status(500).json({ error: 'Erro ao consultar o funil do produto.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;