// api/demandas.js
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import jwt from 'jsonwebtoken';
import express from 'express';

// 1. Inicialização do Express Router e do Pool de Conexão com o Banco
const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// 2. Middleware de Autenticação (copiado de outras APIs para consistência)
// Garante que apenas usuários logados possam acessar as rotas deste arquivo.
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


// POST /api/demandas/
router.post('/', async (req, res) => {
    // Pega as informações do usuário logado que vieram do token
    const { usuarioLogado } = req;
    let dbClient;

    try {
        // Pega uma conexão do pool para usar no banco
        dbClient = await pool.connect();

        // Extrai os dados que o frontend vai enviar no corpo da requisição
        const { produto_sku, quantidade_solicitada, observacoes } = req.body;

        // --- Validação dos Dados de Entrada ---
        if (!produto_sku || !quantidade_solicitada) {
            return res.status(400).json({ error: 'SKU do produto e quantidade são obrigatórios.' });
        }
        const quantidade = parseInt(quantidade_solicitada);
        if (isNaN(quantidade) || quantidade <= 0) {
            return res.status(400).json({ error: 'A quantidade solicitada deve ser um número positivo.' });
        }

        // --- Inserção no Banco de Dados ---
        const insertQuery = `
            INSERT INTO demandas_producao
                (produto_sku, quantidade_solicitada, solicitado_por, observacoes)
            VALUES
                ($1, $2, $3, $4)
            RETURNING *; -- 'RETURNING *' faz com que o banco retorne a linha que acabou de ser inserida
        `;

        const result = await dbClient.query(insertQuery, [
            produto_sku,
            quantidade,
            usuarioLogado.nome, // Pega o nome do usuário do token
            observacoes || null // Se não houver observação, insere NULL
        ]);

        // Retorna o status 201 (Created) e os dados da nova demanda criada
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API /demandas POST] Erro ao criar demanda:', error);
        res.status(500).json({ error: 'Erro interno ao criar a demanda.', details: error.message });
    } finally {
        // ESSENCIAL: Libera a conexão de volta para o pool, ocorrendo erro ou não.
        if (dbClient) {
            dbClient.release();
        }
    }
});

// GET /api/demandas/
router.get('/', async (req, res) => {
    let dbClient;

    try {
        dbClient = await pool.connect();

        // A query busca todas as demandas que não estão com o status 'concluidas'.
        // A ordenação é a chave para o nosso painel de prioridades:
        // 1. Ordena pelo campo 'prioridade' em ordem crescente (1, 2, 3...).
        // 2. Se duas demandas tiverem a mesma prioridade, a mais antiga (data_solicitacao) aparece primeiro.
        const selectQuery = `
            SELECT * FROM demandas_producao
            WHERE status IN ('pendente', 'em_atendimento')
            ORDER BY prioridade ASC, data_solicitacao ASC;
        `;

        const result = await dbClient.query(selectQuery);

        // Retorna o status 200 (OK) e a lista de demandas encontradas em formato JSON
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API /demandas GET] Erro ao listar demandas:', error);
        res.status(500).json({ error: 'Erro interno ao listar as demandas.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
        }
    }
});


// GET /api/demandas/diagnostico-completo
router.get('/diagnostico-completo', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();

        // --- INÍCIO DA ESTRATÉGIA "BULK DATA" (INSPIRADA NO SEU radar-producao.js) ---

        // 1. BUSCAR TODOS OS DADOS BRUTOS (INGREDIENTES) EM PARALELO
        const [
            demandasResult,
            opsResult,
            arrematesResult,
            sessoesResult,
            estoqueResult,
            produtosResult
        ] = await Promise.all([
            dbClient.query(`SELECT * FROM demandas_producao WHERE status IN ('pendente', 'em_atendimento') ORDER BY prioridade ASC, data_solicitacao ASC`),
            dbClient.query("SELECT numero, produto_id, variante, quantidade, etapas, data_final FROM ordens_de_producao WHERE status = 'finalizado'"),
            dbClient.query("SELECT produto_id, variante, op_numero, quantidade_arrematada, quantidade_ja_embalada, tipo_lancamento FROM arremates"),
            dbClient.query("SELECT produto_id, variante, quantidade_entregue FROM sessoes_trabalho_arremate WHERE status = 'EM_ANDAMENTO'"),
            dbClient.query(`SELECT produto_id, variante_nome, SUM(quantidade)::integer as saldo_atual FROM estoque_movimentos GROUP BY produto_id, variante_nome`),
            dbClient.query("SELECT id, nome, sku, is_kit, grade, imagem FROM produtos")
        ]);
        
        const demandasAtivas = demandasResult.rows;
        if (demandasAtivas.length === 0) {
            return res.status(200).json([]);
        }

        // 2. PREPARAR A "RECEITA" EM JAVASCRIPT (PROCESSAR OS DADOS EM MEMÓRIA)
        
        // Helper para obter a quantidade real produzida (exatamente como no seu radar)
        const obterQuantidadeFinalProduzida = (op) => {
            if (!op || !Array.isArray(op.etapas) || op.etapas.length === 0) return parseInt(op?.quantidade, 10) || 0;
            for (let i = op.etapas.length - 1; i >= 0; i--) { const etapa = op.etapas[i]; if (etapa && etapa.lancado && etapa.quantidade !== null && etapa.quantidade !== undefined) { const qtdString = String(etapa.quantidade).trim(); if (qtdString !== '') { const qtdNumerica = parseInt(qtdString, 10); if (!isNaN(qtdNumerica) && qtdNumerica >= 0) return qtdNumerica; } } }
            return parseInt(op.quantidade, 10) || 0;
        };
        
        // Mapear produtos por ID para acesso rápido
        const produtosMapById = new Map(produtosResult.rows.map(p => [p.id, p]));
        
        // --- Cálculo do Saldo de Arremate ---
        const arrematadoPorOp = new Map();
        arrematesResult.rows.forEach(ar => {
            if (ar.tipo_lancamento === 'PRODUCAO' || ar.tipo_lancamento === 'PERDA') {
                const chave = `${ar.op_numero}|${ar.variante || '-'}`;
                arrematadoPorOp.set(chave, (arrematadoPorOp.get(chave) || 0) + ar.quantidade_arrematada);
            }
        });

        const sessoesPorProduto = new Map();
        sessoesResult.rows.forEach(s => {
            const chave = `${s.produto_id}|${s.variante || '-'}`;
            sessoesPorProduto.set(chave, (sessoesPorProduto.get(chave) || 0) + s.quantidade_entregue);
        });

        const saldoArremateFinal = new Map();
        opsResult.rows.forEach(op => {
            const produzido = obterQuantidadeFinalProduzida(op);
            const chaveOp = `${op.numero}|${op.variante || '-'}`;
            const arrematado = arrematadoPorOp.get(chaveOp) || 0;
            const saldoOp = produzido - arrematado;
            if (saldoOp > 0) {
                const chaveProduto = `${op.produto_id}|${op.variante || '-'}`;
                saldoArremateFinal.set(chaveProduto, (saldoArremateFinal.get(chaveProduto) || 0) + saldoOp);
            }
        });
        saldoArremateFinal.forEach((saldo, chave) => {
            const emTrabalho = sessoesPorProduto.get(chave) || 0;
            saldoArremateFinal.set(chave, Math.max(0, saldo - emTrabalho));
        });

        // --- Cálculo do Saldo de Embalagem ---
        const saldoEmbalagemFinal = new Map();
        arrematesResult.rows.forEach(ar => {
            if (ar.tipo_lancamento === 'PRODUCAO') {
                const saldo = ar.quantidade_arrematada - ar.quantidade_ja_embalada;
                if (saldo > 0) {
                    const chave = `${ar.produto_id}|${ar.variante || '-'}`;
                    saldoEmbalagemFinal.set(chave, (saldoEmbalagemFinal.get(chave) || 0) + saldo);
                }
            }
        });
        
        // --- Mapeamento do Saldo de Estoque ---
        const saldoEstoqueFinal = new Map(estoqueResult.rows.map(item => [`${item.produto_id}|${item.variante_nome || '-'}`, item.saldo_atual]));
        
        // Função Helper para buscar os saldos já calculados nos mapas
        const getSaldosFromMaps = (produtoId, variante) => {
            const chave = `${produtoId}|${variante || '-'}`;
            return {
                saldoArremate: saldoArremateFinal.get(chave) || 0,
                saldoEmbalagem: saldoEmbalagemFinal.get(chave) || 0,
                saldoEstoque: saldoEstoqueFinal.get(chave) || 0,
            };
        };

        // 3. MONTAR A RESPOSTA FINAL (USANDO OS DADOS JÁ PROCESSADOS)
        
        // Criar um mapa de produtos por SKU para encontrar o produto principal da demanda
        const produtosMapBySku = new Map();
        produtosResult.rows.forEach(p => {
            // Mapeia o produto principal pelo seu SKU
            if (p.sku) {
                produtosMapBySku.set(p.sku, p);
            }
            // Mapeia cada variação da grade pelo seu SKU
            if (p.grade) {
                p.grade.forEach(g => {
                    if (g.sku) {
                        // O valor salvo agora é o produto pai INTEIRO + a informação da grade
                        produtosMapBySku.set(g.sku, {
                            ...p, // Inclui id, nome_pai, is_kit, etc.
                            gradeInfo: g // Adiciona a informação específica da variação
                        });
                    }
                });
            }
        });
        
        const diagnosticoFinal = [];
        for (const demanda of demandasAtivas) {
            const produtoPrincipal = produtosMapBySku.get(demanda.produto_sku);
            if (!produtoPrincipal) continue;
            
            const gradeInfo = produtoPrincipal.grade?.find(g => g.sku === demanda.produto_sku);
            const variantePrincipal = gradeInfo?.variacao;

            const diagnosticoDemanda = { 
                ...demanda, 
                produto_id: produtoPrincipal.id, // <-- ADICIONA O ID CORRETO AQUI
                produto_nome: produtoPrincipal.gradeInfo ? `${produtoPrincipal.nome} (${produtoPrincipal.gradeInfo.variacao})` : produtoPrincipal.nome, 
                produto_imagem: produtoPrincipal.gradeInfo?.imagem || produtoPrincipal.imagem, 
                is_kit: produtoPrincipal.is_kit, 
                componentes: [], 
                diagnostico_geral: {} 
            };

            if (!produtoPrincipal.is_kit) {
                // A 'variantePrincipal' para um produto simples é a informação da sua própria gradeInfo
                const varianteSimples = produtoPrincipal.gradeInfo?.variacao;
                const saldos = getSaldosFromMaps(produtoPrincipal.id, varianteSimples);
                const totalDisponivel = saldos.saldoArremate + saldos.saldoEmbalagem + saldos.saldoEstoque;
                
                diagnosticoDemanda.diagnostico_geral = {
                    ...saldos,
                    total_disponivel: totalDisponivel,
                    deficit_producao: Math.max(0, demanda.quantidade_solicitada - totalDisponivel)
                };

            } else {
                if (!gradeInfo || !gradeInfo.composicao) continue;

                // 1. ESTOQUE DO KIT PRONTO:
                const chaveEstoqueKit = `${produtoPrincipal.id}|${variantePrincipal || '-'}`;
                const kitsProntosEmEstoque = saldoEstoqueFinal.get(chaveEstoqueKit) || 0;

                // 2. POTENCIAL DE MONTAGEM (CHÃO DE FÁBRICA):
                let potencialMontagemChaoFabrica = Infinity;
                for (const componente of gradeInfo.composicao) {
                    const saldosComponente = getSaldosFromMaps(componente.produto_id, componente.variacao);
                    const disponivelChaoFabrica = saldosComponente.saldoArremate + saldosComponente.saldoEmbalagem;
                    const potencialComponente = Math.floor(disponivelChaoFabrica / componente.quantidade);
                    
                    if (potencialComponente < potencialMontagemChaoFabrica) {
                        potencialMontagemChaoFabrica = potencialComponente;
                    }
                }
                if (potencialMontagemChaoFabrica === Infinity) potencialMontagemChaoFabrica = 0;

                // 3. CÁLCULO DO DÉFICIT REAL DO KIT:
                const totalKitsADisposicao = kitsProntosEmEstoque + potencialMontagemChaoFabrica;
                const deficitKitsReal = Math.max(0, demanda.quantidade_solicitada - totalKitsADisposicao);

                diagnosticoDemanda.diagnostico_geral = {
                    kits_prontos_estoque: kitsProntosEmEstoque,
                    potencial_montagem_chao_fabrica: potencialMontagemChaoFabrica,
                    total_disponivel: totalKitsADisposicao,
                    deficit_producao: deficitKitsReal
                };

                // 4. DIAGNÓSTICO DETALHADO DOS COMPONENTES
                for (const componente of gradeInfo.composicao) {
                    const saldosComponente = getSaldosFromMaps(componente.produto_id, componente.variacao);
                    const disponivelChaoFabrica = saldosComponente.saldoArremate + saldosComponente.saldoEmbalagem;
                    const quantidadeNecessariaParaDeficit = deficitKitsReal * componente.quantidade;
                    const deficitComponente = Math.max(0, quantidadeNecessariaParaDeficit - disponivelChaoFabrica);

                    const produtoComponente = produtosMapById.get(componente.produto_id);

                    diagnosticoDemanda.componentes.push({
                        ...componente,
                        produto_nome: produtoComponente ? produtoComponente.nome : 'Componente não encontrado',
                        saldos: saldosComponente, 
                        disponivel_chao_fabrica: disponivelChaoFabrica,
                        quantidade_necessaria_para_deficit: quantidadeNecessariaParaDeficit,
                        deficit_producao: deficitComponente
                    });
                }
            }
            diagnosticoFinal.push(diagnosticoDemanda);
        }

    // ======================= INÍCIO DA NOVA LÓGICA DE AGREGAÇÃO =======================

        const componentesAgregados = new Map();
        // Etapa 1: Calcular a NECESSIDADE BRUTA de cada componente em todas as demandas
        const necessidadeBruta = new Map();
        for (const demanda of diagnosticoFinal) {
            const produtoPrincipal = produtosMapBySku.get(demanda.produto_sku);
            if (!produtoPrincipal) continue;

            if (produtoPrincipal.is_kit) {
                const gradeInfo = produtoPrincipal.gradeInfo; // Usar a gradeInfo que já temos
                if (!gradeInfo || !gradeInfo.composicao) continue;

                for (const componente of gradeInfo.composicao) {
                    const chave = `${componente.produto_id}|${componente.variacao || '-'}`;
                    const necessidadeAtual = necessidadeBruta.get(chave) || 0;
                    necessidadeBruta.set(chave, necessidadeAtual + (demanda.quantidade_solicitada * componente.quantidade));
                }
            } else { // É um produto simples
                const variante = produtoPrincipal.gradeInfo?.variacao;
                const chave = `${produtoPrincipal.id}|${variante || '-'}`;
                const necessidadeAtual = necessidadeBruta.get(chave) || 0;
                necessidadeBruta.set(chave, necessidadeAtual + demanda.quantidade_solicitada);
            }
        }

        // Etapa 2: Para cada componente com necessidade, calcular o déficit real e agregar
        for (const [chave, necessidadeTotal] of necessidadeBruta.entries()) {
            const [produtoIdStr, ...variacaoParts] = chave.split('|'); // Lida com o '|' no nome da variação
            const produtoId = parseInt(produtoIdStr);
            const variacao = variacaoParts.join('|'); // Remonta a variação completa

            const produtoInfo = produtosMapById.get(produtoId);
            if (!produtoInfo) continue;

            // Busca os saldos já calculados usando a chave correta e completa
            const saldos = getSaldosFromMaps(produtoId, variacao === '-' ? null : variacao);
            const disponivelTotal = saldos.saldoArremate + saldos.saldoEmbalagem + saldos.saldoEstoque;
            const deficitReal = Math.max(0, necessidadeTotal - disponivelTotal);

            if (deficitReal > 0) {
                // Lógica para encontrar a imagem correta (da variação, se existir)
                const gradeInfo = produtoInfo.grade?.find(g => g.variacao === (variacao === '-' ? null : variacao));
                const imagemCorreta = gradeInfo?.imagem || produtoInfo.imagem;

                if (!componentesAgregados.has(chave)) {
                    componentesAgregados.set(chave, {
                        produto_id: produtoId,
                        variacao: variacao,
                        produto_nome: produtoInfo.nome,
                        imagem: imagemCorreta,
                        necessidade_total_producao: 0,
                        saldo_disponivel_arremate: saldos.saldoArremate,
                        saldo_disponivel_embalagem: saldos.saldoEmbalagem,
                        saldo_disponivel_estoque: saldos.saldoEstoque,
                        demandas_dependentes: []
                    });
                }
                
                const agregado = componentesAgregados.get(chave);
                // A necessidade de produção é o próprio déficit real que calculamos
                agregado.necessidade_total_producao = deficitReal;
            }
        }

        // Etapa 3: Preencher as demandas dependentes
        for (const demanda of demandasAtivas) {
            const produtoPrincipal = produtosMapBySku.get(demanda.produto_sku);
            if (!produtoPrincipal) continue;

            const nomeDemanda = produtoPrincipal.gradeInfo ? `${produtoPrincipal.nome} (${produtoPrincipal.gradeInfo.variacao})` : produtoPrincipal.nome;

            if (produtoPrincipal.is_kit) {
                const gradeInfo = produtoPrincipal.gradeInfo;
                if (!gradeInfo || !gradeInfo.composicao) continue;
                for (const componente of gradeInfo.composicao) {
                    const chave = `${componente.produto_id}|${componente.variacao || '-'}`;
                    if (componentesAgregados.has(chave)) {
                        const agregado = componentesAgregados.get(chave);
                        if (!agregado.demandas_dependentes.includes(nomeDemanda)) {
                            agregado.demandas_dependentes.push(nomeDemanda);
                        }
                    }
                }
            } else {
                const variante = produtoPrincipal.gradeInfo?.variacao;
                const chave = `${produtoPrincipal.id}|${variante || '-'}`;
                if (componentesAgregados.has(chave)) {
                    const agregado = componentesAgregados.get(chave);
                    if (!agregado.demandas_dependentes.includes(nomeDemanda)) {
                        agregado.demandas_dependentes.push(nomeDemanda);
                    }
                }
            }
        }

        const diagnosticoAgregadoFinal = Array.from(componentesAgregados.values())
            .sort((a, b) => b.necessidade_total_producao - a.necessidade_total_producao);

            res.status(200).json({
                diagnosticoPorDemanda: diagnosticoFinal,
                diagnosticoAgregado: diagnosticoAgregadoFinal
            });


    // ======================= FIM DA NOVA LÓGICA DE AGREGAÇÃO =======================


    } catch (error) {
        console.error('[API /demandas/diagnostico-completo GET] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao gerar diagnóstico.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/demandas/:id
router.delete('/:id', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const { id } = req.params; // Pega o ID da URL (ex: /api/demandas/5)

        // OPCIONAL, MAS RECOMENDADO: Verificar permissões específicas para deleção
        // Se você tiver uma permissão como 'gerenciar-demandas', poderia checar aqui.

        const deleteQuery = 'DELETE FROM demandas_producao WHERE id = $1';
        const result = await dbClient.query(deleteQuery, [id]);

        // O 'result.rowCount' nos diz quantas linhas foram afetadas.
        if (result.rowCount === 0) {
            // Se for 0, significa que não encontrou uma demanda com aquele ID.
            return res.status(404).json({ error: 'Demanda não encontrada.' });
        }

        // Se chegou aqui, a deleção foi bem-sucedida.
        res.status(200).json({ message: 'Demanda removida com sucesso.' });

    } catch (error) {
        console.error('[API /demandas DELETE] Erro ao deletar demanda:', error);
        res.status(500).json({ error: 'Erro interno ao remover a demanda.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
        }
    }
});

export default router;