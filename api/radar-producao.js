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
// ROTA: BUSCAR SUGESTÕES DE PRODUTOS
// GET /api/radar-producao/buscar?termo=...
// ==========================================================================
router.get('/buscar', async (req, res) => {
    const { termo, page = 1, limit = 5 } = req.query;
    if (!termo) {
        return res.status(400).json({
            rows: [],
            pagination: { currentPage: 1, totalPages: 1, totalItems: 0 }
        });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // --- LÓGICA DE TERMOS DE BUSCA ---
        const termoPrincipal = `%${termo.replace(/\s+/g, '%')}%`;
        let termoAlternativo = null;

        // Gera o termo alternativo se a busca for por "sortido" ou "sortida"
        if (termo.toLowerCase().includes('sortido')) {
            termoAlternativo = `%${termo.toLowerCase().replace('sortido', 'sortida').replace(/\s+/g, '%')}%`;
        } else if (termo.toLowerCase().includes('sortida')) {
            termoAlternativo = `%${termo.toLowerCase().replace('sortida', 'sortido').replace(/\s+/g, '%')}%`;
        }
        // --- FIM DA LÓGICA DE TERMOS ---

        const limitNum = parseInt(limit);
        const offset = (parseInt(page) - 1) * limitNum;

        // --- QUERY BASE DINÂMICA ---
        // A query agora se ajusta se houver um termo alternativo
        const baseQuery = `
            FROM produtos p
            INNER JOIN (
                SELECT DISTINCT produto_id, variante FROM arremates
                UNION
                SELECT DISTINCT produto_embalado_id as produto_id, variante_embalada_nome as variante FROM embalagens_realizadas
                UNION
                SELECT DISTINCT produto_id, variante_nome as variante FROM estoque_movimentos
            ) AS ativos ON p.id = ativos.produto_id
            LEFT JOIN jsonb_to_recordset(p.grade) AS g(sku TEXT, variacao TEXT, imagem TEXT) 
                ON (g.variacao = ativos.variante OR (g.variacao IS NULL AND ativos.variante IS NULL))
            WHERE 
                g.sku NOT IN (SELECT produto_ref_id FROM estoque_itens_arquivados)
                AND (
                    (
                        unaccent(g.variacao) ILIKE unaccent($1)
                        OR unaccent(p.nome || ' ' || g.variacao) ILIKE unaccent($1)
                        OR unaccent(g.sku) ILIKE unaccent($1)
                    )
                    ${termoAlternativo ? `
                    OR (
                        unaccent(g.variacao) ILIKE unaccent($2)
                        OR unaccent(p.nome || ' ' || g.variacao) ILIKE unaccent($2)
                        OR unaccent(g.sku) ILIKE unaccent($2)
                    )
                    ` : ''}
                )
        `;
        
        // --- PARÂMETROS DINÂMICOS ---
        const params = [termoPrincipal];
        if (termoAlternativo) {
            params.push(termoAlternativo);
        }
        
        // --- QUERY DE CONTAGEM ---
        const countQuery = `SELECT COUNT(*) ${baseQuery}`;
        const countResult = await dbClient.query(countQuery, params);
        const totalItems = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / limitNum) || 1;

        // --- QUERY DE DADOS ---
        // Adiciona os parâmetros de paginação (LIMIT e OFFSET)
        const dataParams = [...params, limitNum, offset];
        // Ajusta os placeholders de LIMIT e OFFSET
        const limitPlaceholder = `$${params.length + 1}`;
        const offsetPlaceholder = `$${params.length + 2}`;

        const dataQuery = `
            SELECT p.id as produto_id, p.nome, g.variacao as variante, g.sku, COALESCE(g.imagem, p.imagem) as imagem
            ${baseQuery}
            ORDER BY p.nome, g.variacao
            LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
        `;
        const dataResult = await dbClient.query(dataQuery, dataParams);
        
        console.log(`[LOG BACK-END /buscar] Para o termo "${termo}", a query encontrou:`, dataResult.rows);
        
        res.status(200).json({
            rows: dataResult.rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages: totalPages,
                totalItems: totalItems
            }
        });

    } catch (error) {
        console.error('[API /radar-producao/buscar] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar produtos.', details: error.message });
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
        
        // --- INÍCIO DA CORREÇÃO ---
        // A query agora é dividida em duas partes para priorizar a busca por SKU
        const produtoQuery = `
            WITH EncontradoPorSKU AS (
                -- 1. Tenta encontrar uma correspondência EXATA de SKU primeiro
                SELECT 
                    p.id as produto_id, p.nome, p.is_kit, p.grade, 
                    g.variacao as variante, g.sku, 
                    COALESCE(g.imagem, p.imagem) as imagem
                FROM produtos p, jsonb_to_recordset(p.grade) AS g(sku TEXT, variacao TEXT, imagem TEXT, composicao JSONB)
                WHERE g.sku = $1
                LIMIT 1
            ),
            EncontradoPorNome AS (
                -- 2. Se não encontrar por SKU, tenta por nome/variação (busca aproximada)
                SELECT 
                    p.id as produto_id, p.nome, p.is_kit, p.grade, 
                    g.variacao as variante, g.sku, 
                    COALESCE(g.imagem, p.imagem) as imagem
                FROM produtos p
                LEFT JOIN jsonb_to_recordset(p.grade) AS g(sku TEXT, variacao TEXT, imagem TEXT, composicao JSONB) ON true
                WHERE 
                    unaccent(p.nome || ' ' || g.variacao) ILIKE unaccent($2)
                    AND NOT EXISTS (SELECT 1 FROM EncontradoPorSKU) -- Só executa se a primeira busca falhar
                LIMIT 1
            )
            -- Junta os resultados (apenas um deles terá dados)
            SELECT * FROM EncontradoPorSKU
            UNION ALL
            SELECT * FROM EncontradoPorNome;
        `;
        // --- FIM DA CORREÇÃO ---

        // Passamos a busca como dois parâmetros: um para a busca exata de SKU, outro para a busca aproximada
        const produtoResult = await dbClient.query(produtoQuery, [busca, `%${busca.replace(/\s+/g, '%')}%`]);

        if (produtoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Nenhum produto encontrado.' });
        }
        
        const produtoInfo = produtoResult.rows[0];

        // --- LÓGICA HELPER REUTILIZÁVEL ---
        const calcularSaldosParaItem = async (prodId, prodVariante) => {
            const [opsResult, arrematesResult, sessoesResult, embalagemResult, estoqueResult] = await Promise.all([
                dbClient.query("SELECT numero, quantidade, etapas FROM ordens_de_producao WHERE status = 'finalizado' AND produto_id = $1 AND (variante = $2 OR (variante IS NULL AND $2 IS NULL))", [prodId, prodVariante]),
                dbClient.query("SELECT op_numero, SUM(quantidade_arrematada) as total FROM arremates WHERE tipo_lancamento IN ('PRODUCAO', 'PERDA') AND produto_id = $1 AND (variante = $2 OR (variante IS NULL AND $2 IS NULL)) GROUP BY op_numero", [prodId, prodVariante]),
                dbClient.query("SELECT COALESCE(SUM(quantidade_entregue), 0)::integer as total FROM sessoes_trabalho_arremate WHERE status = 'EM_ANDAMENTO' AND produto_id = $1 AND (variante = $2 OR (variante IS NULL AND $2 IS NULL))", [prodId, prodVariante]),
                dbClient.query("SELECT COALESCE(SUM(quantidade_arrematada - quantidade_ja_embalada), 0)::integer as total FROM arremates WHERE tipo_lancamento = 'PRODUCAO' AND produto_id = $1 AND (variante = $2 OR (variante IS NULL AND $2 IS NULL))", [prodId, prodVariante]),
                dbClient.query("SELECT COALESCE(SUM(quantidade), 0)::integer as total FROM estoque_movimentos WHERE produto_id = $1 AND (variante_nome = $2 OR (variante_nome IS NULL AND $2 IS NULL))", [prodId, prodVariante])
            ]);

            const obterQuantidadeFinalProduzida = (op) => {
                if (!op || !Array.isArray(op.etapas) || op.etapas.length === 0) return parseInt(op?.quantidade, 10) || 0;
                for (let i = op.etapas.length - 1; i >= 0; i--) { const etapa = op.etapas[i]; if (etapa && etapa.lancado && etapa.quantidade !== null && etapa.quantidade !== undefined) { const qtdString = String(etapa.quantidade).trim(); if (qtdString !== '') { const qtdNumerica = parseInt(qtdString, 10); if (!isNaN(qtdNumerica) && qtdNumerica >= 0) return qtdNumerica; } } }
                return parseInt(op.quantidade, 10) || 0;
            };
            const arrematadoMap = new Map(arrematesResult.rows.map(ar => [ar.op_numero, parseInt(ar.total, 10)]));
            let saldoBrutoArremate = 0;
            opsResult.rows.forEach(op => { const produzido = obterQuantidadeFinalProduzida(op); const jaArrematado = arrematadoMap.get(op.numero) || 0; if (produzido - jaArrematado > 0) saldoBrutoArremate += (produzido - jaArrematado); });
            
            const noArremate = Math.max(0, saldoBrutoArremate - sessoesResult.rows[0].total);
            const naEmbalagem = embalagemResult.rows[0].total;
            const emEstoque = estoqueResult.rows[0].total;

            return { noArremate, naEmbalagem, emEstoque };
        };

        // --- CÁLCULO DO FUNIL DO PRODUTO PRINCIPAL ---
        const saldosPrincipais = await calcularSaldosParaItem(produtoInfo.produto_id, produtoInfo.variante);
        const niveisResult = await dbClient.query("SELECT * FROM produto_niveis_estoque_alerta WHERE produto_ref_id = $1 AND ativo = TRUE LIMIT 1", [produtoInfo.sku]);
        const niveisEstoque = niveisResult.rows[0] || null;
        const nivelIdeal = niveisEstoque?.nivel_estoque_ideal || 0;
        const necessidadeProducao = Math.max(0, nivelIdeal - (saldosPrincipais.emEstoque + saldosPrincipais.naEmbalagem + saldosPrincipais.noArremate));

        const funilPrincipal = {
            emEstoque: { qtd: saldosPrincipais.emEstoque },
            naEmbalagem: { qtd: saldosPrincipais.naEmbalagem },
            noArremate: { qtd: saldosPrincipais.noArremate },
            paraProduzir: { qtd: necessidadeProducao }
        };

        // --- BUSCAS ADICIONAIS: HISTÓRICO E COMPONENTES ---
        let historicoEstoque = [];
        let componentesKit = null;

        const historicoResult = await dbClient.query(
            `SELECT id, data_movimento, tipo_movimento, quantidade, usuario_responsavel, observacao 
             FROM estoque_movimentos 
             WHERE produto_id = $1 AND (variante_nome = $2 OR (variante_nome IS NULL AND $2 IS NULL)) 
             ORDER BY data_movimento DESC LIMIT 10`,
            [produtoInfo.produto_id, produtoInfo.variante]
        );
        historicoEstoque = historicoResult.rows;
        
        if (produtoInfo.is_kit) {
            const variacaoKit = (produtoInfo.grade || []).find(g => g.sku === produtoInfo.sku);
            if (variacaoKit && variacaoKit.composicao) {
                componentesKit = [];
                let potencialMontagem = Infinity;

                for (const componenteDef of variacaoKit.composicao) {
                    const saldosComponente = await calcularSaldosParaItem(componenteDef.produto_id, componenteDef.variacao);
                    
                    componentesKit.push({
                        produto_id: componenteDef.produto_id,
                        // ===================================
                        nome: componenteDef.produto_nome,
                        variante: componenteDef.variacao,
                        quantidade_no_kit: componenteDef.quantidade,
                        saldoArremate: saldosComponente.noArremate,
                        saldoEmbalagem: saldosComponente.naEmbalagem
                    });

                    const podeMontarComEste = Math.floor(saldosComponente.naEmbalagem / (componenteDef.quantidade || 1));
                    if (podeMontarComEste < potencialMontagem) {
                        potencialMontagem = podeMontarComEste;
                    }
                }
                produtoInfo.potencial_montagem = potencialMontagem;
            }
        }
        
        // --- RESPOSTA FINAL E COMPLETA ---
        res.status(200).json({
            produto: produtoInfo,
            funil: funilPrincipal,
            niveisEstoque: niveisEstoque,
            historicoEstoque: historicoEstoque,
            componentes: componentesKit
        });

    } catch (error) {
        console.error('[API /radar-producao/funil] Erro:', error);
        res.status(500).json({ error: 'Erro ao consultar o funil do produto.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;