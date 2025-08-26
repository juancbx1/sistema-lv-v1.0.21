// api/arremates.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const router = express.Router(); 
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

const verificarTokenInterna = (reqOriginal) => {
    const authHeader = reqOriginal.headers.authorization;
    if (!authHeader) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401;
        throw error;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        const error = new Error('Token mal formatado');
        error.statusCode = 401;
        throw error;
    }
    try {
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        return decoded;
    } catch (error) {
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};


// Middleware para este router: Apenas autentica o token.
// A gestão de conexão DB e verificação de permissões detalhadas fica em cada rota.
router.use(async (req, res, next) => {
    try {
        req.usuarioLogado = verificarTokenInterna(req); 
        next(); 
    } catch (error) {
        console.error('[router/arremates MID] Erro no middleware:', error.message, error.stack ? error.stack.substring(0,500) : '');
        const statusCode = error.statusCode || 500;
        const errorMsg = (error.message === 'jwt expired' || error.message === 'Token expirado' || error.message === 'Token inválido') 
                       ? 'Sessão inválida ou expirada. Faça login novamente.' 
                       : error.message;
        res.status(statusCode).json({ error: errorMsg });
    }
});

// POST /api/arremates/
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient; 

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('lancar-arremate')) {
            return res.status(403).json({ error: 'Permissão negada para lançar arremate.' });
        }

        const { 
            op_numero, op_edit_id, produto_id, variante, quantidade_arrematada, 
            usuario_tiktik, // Nome do Tiktik
            usuario_tiktik_id // <<< NOVO: ID do Tiktik
        } = req.body;
        
        // <<< MUDANÇA: Adicionada validação para usuario_tiktik_id >>>
        if (!op_numero || !produto_id || quantidade_arrematada === undefined || !usuario_tiktik || !usuario_tiktik_id) {
            return res.status(400).json({ error: 'Dados incompletos: op_numero, produto_id, quantidade, tiktik e tiktik_id são obrigatórios.' });
        }
        
        const quantidadeNum = parseInt(quantidade_arrematada);
        if (isNaN(quantidadeNum) || quantidadeNum <= 0) {
            return res.status(400).json({ error: 'Quantidade arrematada deve ser um número positivo.' });
        }

        // --- LÓGICA DE PONTOS ---
        let valorPontoAplicado = 1.00;
        const configPontosQuery = `
            SELECT pontos_padrao FROM configuracoes_pontos_processos
            WHERE produto_id = $1 AND tipo_atividade = 'arremate_tiktik' AND ativo = TRUE LIMIT 1;
        `;
        const configResult = await dbClient.query(configPontosQuery, [produto_id]);

        if (configResult.rows.length > 0 && configResult.rows[0].pontos_padrao !== null) {
            valorPontoAplicado = parseFloat(configResult.rows[0].pontos_padrao);
        }
        const pontosGerados = quantidadeNum * valorPontoAplicado;
        
        const nomeDoLancador = usuarioLogado.nome || 'Sistema';

        const result = await dbClient.query(
    `INSERT INTO arremates (op_numero, op_edit_id, produto_id, variante, quantidade_arrematada, usuario_tiktik, usuario_tiktik_id, lancado_por, valor_ponto_aplicado, pontos_gerados, tipo_lancamento)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
        op_numero, op_edit_id || null, parseInt(produto_id), variante || null, 
        quantidadeNum, usuario_tiktik, usuario_tiktik_id, nomeDoLancador,
        valorPontoAplicado, pontosGerados,
        'PRODUCAO' // o o valor 'PRODUCAO' que corresponde ao placeholder $11.
    ]
    );
        
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API Arremates POST] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao salvar arremate.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/arremates/
router.get('/', async (req, res) => {
    const { 
        produto_id, 
        variante,
        fetchAll = 'false',
        page = 1,
        limit = 6 
    } = req.query;

    const varianteDecodificada = variante ? variante.replace(/\+/g, ' ') : null;

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // A base da query agora não tem mais o filtro de saldo,
        // pois fetchAll pode precisar de todos, e a paginação só dos com saldo.
        let whereClauses = []; 
        let queryParams = [];
        let paramIndex = 1;

        if (produto_id) {
            whereClauses.push(`a.produto_id = $${paramIndex++}`);
            queryParams.push(parseInt(produto_id));
        }

        if (varianteDecodificada && varianteDecodificada !== '-') {
            whereClauses.push(`a.variante = $${paramIndex++}`);
            queryParams.push(varianteDecodificada);
        } else if (variante === '-') {
            whereClauses.push(`(a.variante IS NULL OR a.variante = '-' OR a.variante = '')`);
        }

        // --- LÓGICA CONDICIONAL: A CHAVE DA CORREÇÃO ---
        if (fetchAll === 'true') {
            // LÓGICA ANTIGA PARA COMPATIBILIDADE: Retorna todos os arremates (com e sem saldo)
            // A sua função buscarArrematesDetalhados já faz o filtro de saldo no JS depois
            const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
            
            const dataQuery = `
                SELECT a.*, p.nome as produto 
                FROM arremates a 
                JOIN produtos p ON a.produto_id = p.id
                ${whereString}
                ORDER BY a.data_lancamento DESC
            `;
            
            const dataResult = await dbClient.query(dataQuery, queryParams);

            // **RETORNA NO FORMATO ANTIGO E ESPERADO PELO fetchAll**
            return res.status(200).json({ rows: dataResult.rows });

        } else {
            // LÓGICA NOVA PARA A PAGINAÇÃO NA ABA "VOLTAR PARA ARREMATE"
            // Adiciona o filtro de saldo aqui, pois esta chamada só quer itens pendentes
            whereClauses.push("(a.quantidade_arrematada - a.quantidade_ja_embalada) > 0");
            whereClauses.push("a.tipo_lancamento = 'PRODUCAO'");
            
            const whereString = `WHERE ${whereClauses.join(' AND ')}`;

            const countQuery = `SELECT COUNT(a.id) as total_count FROM arremates a ${whereString}`;
            const countResult = await dbClient.query(countQuery, queryParams);
            const totalItems = parseInt(countResult.rows[0].total_count, 10);
            
            const limitNum = parseInt(limit);
            const totalPages = Math.ceil(totalItems / limitNum) || 1;
            const offset = (parseInt(page) - 1) * limitNum;

            const dataQuery = `
                SELECT 
                    a.*, 
                    COALESCE(op.numero, a.op_numero) as op_numero 
                FROM arremates a 
                LEFT JOIN ordens_de_producao op ON a.op_numero = op.numero
                ${whereString}
                ORDER BY a.data_lancamento DESC
                LIMIT $${paramIndex++} OFFSET $${paramIndex++}
            `;
            queryParams.push(limitNum, offset);
            
            const dataResult = await dbClient.query(dataQuery, queryParams);
            
            // **RETORNA NO FORMATO NOVO ESPERADO PELA PAGINAÇÃO**
            return res.status(200).json({
                rows: dataResult.rows,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: totalPages,
                    totalItems: totalItems
                }
            });
        }
    } catch (error) {
        console.error('[API Arremates GET / Híbrido] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao buscar arremates.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA: GET /api/arremates/historico
router.get('/historico', async (req, res) => {    
    const { 
        busca,
        tipoEvento = 'todos',
        periodo = '7d',
        page = 1,
        limit = 10
    } = req.query;
    
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        let queryParams = [];
        let whereClauses = [];

        // Filtro de Período
        if (periodo === 'hoje') {
            whereClauses.push(`a.data_lancamento >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo')`);
        } else if (periodo === '30d') {
            whereClauses.push(`a.data_lancamento >= NOW() - INTERVAL '30 days'`);
        } else if (periodo === 'mes_atual') {
            whereClauses.push(`date_trunc('month', a.data_lancamento AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')`);
        } else {
            whereClauses.push(`a.data_lancamento >= NOW() - INTERVAL '7 days'`);
        }
        
        // Filtro por Tipo de Evento
        if (tipoEvento !== 'todos') {
            if (tipoEvento === 'ESTORNO') {
                whereClauses.push(`a.tipo_lancamento IN ('ESTORNO', 'PRODUCAO_ANULADA')`);
            } else {
                whereClauses.push(`a.tipo_lancamento = $${queryParams.length + 1}`);
                queryParams.push(tipoEvento);
            }
        } else {
             whereClauses.push(`a.tipo_lancamento IN ('PRODUCAO', 'PERDA', 'ESTORNO', 'PRODUCAO_ANULADA')`);
        }
        
        // Filtro de Busca por Texto
        if (busca) {
            const searchTerm = `%${busca}%`;
            whereClauses.push(`(p.nome ILIKE $${queryParams.length + 1} OR a.usuario_tiktik ILIKE $${queryParams.length + 1} OR a.lancado_por ILIKE $${queryParams.length + 1})`);
            queryParams.push(searchTerm);
        }
        
        const whereString = `WHERE ${whereClauses.join(' AND ')}`;

        // Query de Contagem
        const countQuery = `SELECT COUNT(*) FROM arremates a LEFT JOIN produtos p ON a.produto_id = p.id ${whereString}`;
        const countResult = await dbClient.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count, 10);

        // Query de Dados com Paginação
        const limitNum = parseInt(limit);
        const offset = (parseInt(page) - 1) * limitNum;
        const totalPages = Math.ceil(totalItems / limitNum) || 1;
        
        const finalQueryParams = [...queryParams, limitNum, offset];
        
        const dataQuery = `
            SELECT a.*, p.nome as produto
            FROM arremates a
            LEFT JOIN produtos p ON a.produto_id = p.id
            ${whereString}
            ORDER BY a.data_lancamento DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        
        
        const dataResult = await dbClient.query(dataQuery, finalQueryParams);
        
        res.status(200).json({
            rows: dataResult.rows,
            pagination: { currentPage: parseInt(page), totalPages, totalItems }
        });

    } catch (error) {
        console.error('[API /arremates/historico] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico de arremates.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/arremates/:id_arremate/registrar-embalagem
router.put('/:id_arremate/registrar-embalagem', async (req, res) => {
    const { usuarioLogado } = req; // Do token
    const { id_arremate } = req.params;
    const { quantidade_que_foi_embalada_desta_vez } = req.body;
    let dbClient;

    try {
        dbClient = await pool.connect(); // Obtém conexão para esta rota
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoesCompletas.includes('lancar-embalagem')) { // Ou uma permissão mais específica se necessário
            return res.status(403).json({ error: 'Permissão negada para registrar embalagem de arremate.' });
        }

        if (quantidade_que_foi_embalada_desta_vez === undefined) {
            return res.status(400).json({ error: 'Campo obrigatório: quantidade_que_foi_embalada_desta_vez.' });
        }
        const qtdEmbaladaNestaVez = parseInt(quantidade_que_foi_embalada_desta_vez);
        if (isNaN(qtdEmbaladaNestaVez) || qtdEmbaladaNestaVez <= 0) {
            return res.status(400).json({ error: 'Quantidade embalada deve ser um número positivo.' });
        }
        const idArremateNum = parseInt(id_arremate);
        if (isNaN(idArremateNum)) {
            return res.status(400).json({ error: 'ID do arremate inválido.' });
        }

        await dbClient.query('BEGIN'); 

        const arremateResult = await dbClient.query(
            'SELECT id, quantidade_arrematada, quantidade_ja_embalada FROM arremates WHERE id = $1 FOR UPDATE',
            [idArremateNum]
        );

        if (arremateResult.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: `Arremate com ID ${idArremateNum} não encontrado.` });
        }

        const arremate = arremateResult.rows[0];
        const { quantidade_arrematada, quantidade_ja_embalada } = arremate;

        if (quantidade_ja_embalada + qtdEmbaladaNestaVez > quantidade_arrematada) {
            await dbClient.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Quantidade a embalar excede o saldo disponível neste arremate.',
                saldoDisponivel: quantidade_arrematada - quantidade_ja_embalada,
                tentativaEmbalar: qtdEmbaladaNestaVez
            });
        }

        const novaQtdJaEmbalada = quantidade_ja_embalada + qtdEmbaladaNestaVez;
        // ***** CORREÇÃO AQUI: Removido data_atualizacao *****
        const updateResult = await dbClient.query(
            'UPDATE arremates SET quantidade_ja_embalada = $1 WHERE id = $2 RETURNING *',
            [novaQtdJaEmbalada, idArremateNum]
        );

        await dbClient.query('COMMIT'); 

        res.status(200).json({
            message: 'Arremate atualizado com sucesso.',
            arremateAtualizado: updateResult.rows[0]
        });

    } catch (error) {
        if (dbClient) { // Só tenta rollback se dbClient foi conectado
            try {
                await dbClient.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('[router/arremates PUT /:id/registrar-embalagem] Erro ao tentar executar ROLLBACK:', rollbackError);
            }
        }
        console.error(`[router/arremates PUT /:id/registrar-embalagem] Erro Arremate ID ${id_arremate}:`, error.message, error.stack ? error.stack.substring(0,500):"");
        // Evita enviar uma nova resposta se uma já foi enviada (ex: pelo rollback de saldo insuficiente)
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erro ao atualizar arremate.', details: error.message });
        }
    } finally {
        if (dbClient) {
            dbClient.release();
        }
    }
});

//ENDPOINT PARA TIKTIK ASSINAR UM LOTE DE ARREMATES
router.put('/assinar-lote', async (req, res) => {
    const { usuarioLogado } = req;
    // NOVO: Recebe o objeto 'dadosColetados'
    const { ids_arremates, dadosColetados } = req.body;
    let dbClient;

    if (!Array.isArray(ids_arremates) || ids_arremates.length === 0) {
        return res.status(400).json({ error: 'Lista de IDs de arremates é obrigatória.' });
    }

    try {
        dbClient = await pool.connect();
        const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        // Assumi que você criará esta permissão
        if (!permissoesUsuario.includes('assinar-arremate-tiktik')) {
             return res.status(403).json({ error: 'Permissão negada para assinar arremates.' });
        }

        // Inicia a transação
        await dbClient.query('BEGIN');

        // 1. Atualiza todos os arremates do lote para 'assinada = true'
        const updateResult = await dbClient.query(
            `UPDATE arremates SET assinada = TRUE 
             WHERE id = ANY($1::int[]) 
             AND usuario_tiktik = $2 
             AND assinada = FALSE -- Garante que não estamos re-assinando
             RETURNING id, assinada`,
            [ids_arremates, usuarioLogado.nome] 
        );

        if (updateResult.rowCount === 0) {
            // Se nenhum registro foi atualizado, pode ser que já estivessem assinados ou não pertencem ao usuário.
            // Não é um erro, então não damos rollback, apenas informamos.
            await dbClient.query('COMMIT'); // Finaliza a transação vazia
            return res.status(200).json({ 
                message: 'Nenhum arremate novo foi assinado. Eles podem já ter sido assinados ou os IDs são inválidos.',
                atualizados: []
            });
        }
        
        // 2. Para cada arremate que foi efetivamente atualizado, insere um log
        const idsAtualizados = updateResult.rows.map(r => r.id);
        const logInsertPromises = idsAtualizados.map(arremateId => {
            return dbClient.query(
                `INSERT INTO log_assinaturas (id_usuario, id_arremate, dados_coletados) VALUES ($1, $2, $3)`,
                [usuarioLogado.id, arremateId, dadosColetados || null]
            );
        });

        // Executa todas as inserções de log em paralelo
        await Promise.all(logInsertPromises);

        // Confirma a transação
        await dbClient.query('COMMIT');
        
        res.status(200).json({ 
            message: `${updateResult.rowCount} arremate(s) assinado(s) com sucesso.`,
            atualizados: updateResult.rows 
        });

    } catch (error) {
        // Se der erro, desfaz a transação
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /arremates/assinar-lote PUT] Erro:', error.message);
        res.status(500).json({ error: 'Erro interno ao assinar arremates.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/registrar-perda', async (req, res) => {
    const { usuarioLogado } = req;
    // << MUDANÇA: Recebe 'produto_id' do frontend >>
    const { produto_id, variante, quantidadePerdida, motivo, observacao, opsOrigem } = req.body;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('registrar-perda-arremate')) {
            return res.status(403).json({ error: 'Permissão negada para registrar perdas.' });
        }
        
        // << MUDANÇA: Validação para produto_id >>
        if (!produto_id || !motivo || !quantidadePerdida || quantidadePerdida <= 0) {
            return res.status(400).json({ error: "Dados para registro de perda estão incompletos (produto_id, motivo, quantidade)." });
        }
        
        // Busca o nome do produto para salvar na tabela de perdas (se ela ainda usa o nome)
        const produtoInfo = await dbClient.query('SELECT nome FROM produtos WHERE id = $1', [produto_id]);
        if (produtoInfo.rows.length === 0) {
            throw new Error(`Produto com ID ${produto_id} não encontrado.`);
        }
        const nomeDoProduto = produtoInfo.rows[0].nome;

        await dbClient.query('BEGIN');

        // 1. Insere o registro na tabela de perdas
        const perdaQuery = `
            INSERT INTO arremate_perdas (produto_nome, variante_nome, quantidade_perdida, motivo, observacao, usuario_responsavel)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;
        `;
        const perdaResult = await dbClient.query(perdaQuery, [
            nomeDoProduto, // Salva o nome na tabela de perdas
            variante,
            quantidadePerdida,
            motivo,
            observacao,
            usuarioLogado.nome || 'Sistema'
        ]);
        const perdaId = perdaResult.rows[0].id;

        // 2. Cria um lançamento de arremate do tipo 'PERDA' para abater do saldo
        let quantidadeRestanteParaAbater = quantidadePerdida;
        const opsOrdenadas = opsOrigem.sort((a, b) => a.numero - b.numero);

        for (const op of opsOrdenadas) {
            if (quantidadeRestanteParaAbater <= 0) break;
            
            const qtdAbaterDaOP = Math.min(quantidadeRestanteParaAbater, op.quantidade_pendente_nesta_op);
            if (qtdAbaterDaOP > 0) {
                // << MUDANÇA: Insere produto_id na tabela 'arremates' >>
                const lancamentoPerdaQuery = `
                    INSERT INTO arremates (op_numero, produto_id, variante, quantidade_arrematada, usuario_tiktik, lancado_por, tipo_lancamento, id_perda_origem, assinada)
                    VALUES ($1, $2, $3, $4, $5, $6, 'PERDA', $7, TRUE);
                `;
                await dbClient.query(lancamentoPerdaQuery, [
                    op.numero,
                    produto_id, // Insere o ID aqui
                    variante,
                    qtdAbaterDaOP,
                    'Sistema (Perda)',
                    usuarioLogado.nome,
                    perdaId
                ]);
                quantidadeRestanteParaAbater -= qtdAbaterDaOP;
            }
        }

        await dbClient.query('COMMIT');
        res.status(201).json({ message: 'Registro de perda efetuado com sucesso.' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /arremates/registrar-perda] Erro:', error);
        res.status(500).json({ error: 'Erro ao registrar a perda.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.get('/fila', async (req, res) => {
    const { 
        search, 
        sortBy = 'data_op_mais_recente', 
        page = 1, 
        limit = 6,
        fetchAll = 'false'
    } = req.query;

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // 1. BUSCAR TODAS AS OPS FINALIZADAS
        const opsQuery = `
            SELECT 
                op.produto_id, op.variante, p.nome as produto, op.etapas, op.quantidade, op.data_final, op.numero, op.edit_id
            FROM ordens_de_producao op
            JOIN produtos p ON op.produto_id = p.id
            WHERE op.status = 'finalizado';
        `;
        const opsResult = await dbClient.query(opsQuery);
        const opsFinalizadas = opsResult.rows;

        // 2. BUSCAR TODOS OS ARREMATES JÁ FEITOS
        const arrematesQuery = `
            SELECT produto_id, variante, op_numero, quantidade_arrematada
            FROM arremates
            WHERE tipo_lancamento = 'PRODUCAO' OR tipo_lancamento = 'PERDA';
        `;
        const arrematesResult = await dbClient.query(arrematesQuery);
        const arrematesFeitos = arrematesResult.rows;

        // 3. PROCESSAR OS DADOS EM JAVASCRIPT (LÓGICA SEGURA)
        const obterQuantidadeFinalProduzida = (op) => {
            if (!op || !op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) {
                return parseInt(op?.quantidade) || 0;
            }
            for (let i = op.etapas.length - 1; i >= 0; i--) {
                const etapa = op.etapas[i];
                if (etapa && etapa.lancado && typeof etapa.quantidade !== 'undefined' && etapa.quantidade !== null) {
                    const qtdEtapa = parseInt(etapa.quantidade, 10);
                    if (!isNaN(qtdEtapa) && qtdEtapa >= 0) {
                        return qtdEtapa;
                    }
                }
            }
            return parseInt(op.quantidade) || 0;
        };
        
        const arrematadoPorOp = new Map();
        arrematesFeitos.forEach(arr => {
            const chave = `${arr.op_numero}|${arr.variante || '-'}`;
            arrematadoPorOp.set(chave, (arrematadoPorOp.get(chave) || 0) + arr.quantidade_arrematada);
        });

        const pendenciasAgregadas = new Map();
        opsFinalizadas.forEach(op => {
            const qtdProduzida = obterQuantidadeFinalProduzida(op);
            const chaveOp = `${op.numero}|${op.variante || '-'}`;
            const qtdArrematada = arrematadoPorOp.get(chaveOp) || 0;
            const saldoOp = qtdProduzida - qtdArrematada;

            if (saldoOp > 0) {
                const chaveAgregada = `${op.produto_id}|${op.variante || '-'}`;
                if (!pendenciasAgregadas.has(chaveAgregada)) {
                    pendenciasAgregadas.set(chaveAgregada, {
                        produto_id: op.produto_id,
                        produto_nome: op.produto,
                        variante: op.variante || '-',
                        saldo_para_arrematar: 0,
                        ops_detalhe: [],
                        data_op_mais_recente: new Date(0)
                    });
                }

                const item = pendenciasAgregadas.get(chaveAgregada);
                item.saldo_para_arrematar += saldoOp;
                item.ops_detalhe.push({
                    numero: op.numero,
                    edit_id: op.edit_id,
                    saldo_op: saldoOp
                });
                const dataOp = op.data_final ? new Date(op.data_final) : new Date(0);
                if (dataOp > item.data_op_mais_recente) {
                    item.data_op_mais_recente = dataOp;
                }
            }
        });
        
        let resultados = Array.from(pendenciasAgregadas.values());
        
        // 4. CALCULAR TOTAIS GERAIS ANTES DE FILTRAR E PAGINAR
        const totalGruposDeProdutos = resultados.length;
        const totalPecasPendentes = resultados.reduce((total, item) => total + item.saldo_para_arrematar, 0);

        // 5. APLICAR FILTROS DE BUSCA E ORDENAÇÃO
        if (search) {
            const searchTermLower = search.toLowerCase();
            resultados = resultados.filter(item =>
                item.produto_nome.toLowerCase().includes(searchTermLower) ||
                (item.variante && item.variante.toLowerCase().includes(searchTermLower))
            );
        }

        switch (sortBy) {
            case 'maior_quantidade': resultados.sort((a, b) => b.saldo_para_arrematar - a.saldo_para_arrematar); break;
            case 'menor_quantidade': resultados.sort((a, b) => a.saldo_para_arrematar - b.saldo_para_arrematar); break;
            case 'alfabetica': resultados.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome)); break;
            default: resultados.sort((a, b) => new Date(b.data_op_mais_recente) - new Date(a.data_op_mais_recente)); break;
        }

        // 6. DECIDIR O FORMATO DA RESPOSTA (TUDO ou PAGINADO)
            if (fetchAll === 'true') {
                // Se o frontend pediu tudo, simplesmente retorne a lista de resultados completa.
                // O frontend que pediu "tudo" (nosso modal) não precisa dos dados de paginação.
                res.status(200).json({
                    rows: resultados 
                });
            } else {
                // Se não, execute a lógica de paginação que você já tinha.
                // Esta é a chamada padrão da sua "Fila de Arremate" principal.
                const limitNum = parseInt(limit);
                const offset = (parseInt(page) - 1) * limitNum;
                const totalPages = Math.ceil(resultados.length / limitNum) || 1;
                const paginatedResults = resultados.slice(offset, offset + limitNum);

                // Envie a resposta no formato paginado que a sua view principal espera.
                res.status(200).json({
                    rows: paginatedResults,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: totalPages,
                        totalItems: totalGruposDeProdutos,
                        totalPecas: totalPecasPendentes,
                        limit: limitNum
                    }
                });
            }

    } catch (error) {
        console.error('[API GET /arremates/fila] Erro na lógica JS do backend:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao processar a fila de arremates.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA PRINCIPAL: GET /api/arremates/status-tiktiks
router.get('/status-tiktiks', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
        if (!permissoes.includes('acesso-ordens-de-arremates')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        // 1. Resetar status "FALTOU" de dias anteriores
        // A cláusula `WHERE status_data_modificacao < CURRENT_DATE` garante que só resetamos faltas antigas.
        await dbClient.query(`
    UPDATE usuarios 
        SET status_atual = 'LIVRE', status_data_modificacao = NULL
        WHERE 
            status_atual = 'FALTOU' 
            AND status_data_modificacao IS NOT NULL
            AND status_data_modificacao < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
    `);

        // 2. Buscar todos os usuários Tiktik com seus dados e sessões atuais
        const query = `
            SELECT 
                u.id, u.nome, u.avatar_url, u.status_atual, u.status_data_modificacao,
                u.horario_entrada_1, u.horario_saida_1, u.horario_entrada_2, u.horario_saida_2, u.horario_entrada_3, u.horario_saida_3,
                s.id as id_sessao, s.produto_id, s.variante, s.quantidade_entregue, s.data_inicio,
                p.nome as produto_nome
            FROM usuarios u
            LEFT JOIN sessoes_trabalho_arremate s ON u.id_sessao_trabalho_atual = s.id
            LEFT JOIN produtos p ON s.produto_id = p.id
            WHERE 'tiktik' = ANY(u.tipos)
            ORDER BY u.nome ASC;
        `;
        const result = await dbClient.query(query);

        // 3. Processar os dados (calcular médias, etc.)
        const tiktiksComStatus = await Promise.all(result.rows.map(async (tiktik) => {
            let media_tempo_por_peca = null;

            if (tiktik.status_atual === 'TRABALHANDO' && tiktik.produto_id) {
                // Busca a média para o produto (ignorando variante)
                const mediaQuery = `
                    SELECT AVG(EXTRACT(EPOCH FROM (data_fim - data_inicio)) / quantidade_finalizada) as media
                    FROM sessoes_trabalho_arremate
                    WHERE status = 'FINALIZADA' AND produto_id = $1 AND quantidade_finalizada > 0;
                `;
                const mediaResult = await dbClient.query(mediaQuery, [tiktik.produto_id]);
                if (mediaResult.rows[0].media) {
                    media_tempo_por_peca = parseFloat(mediaResult.rows[0].media);
                }
            }
            
            return { ...tiktik, media_tempo_por_peca };
        }));

        res.status(200).json(tiktiksComStatus);

    } catch (error) {
        console.error('[API /status-tiktiks] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar status dos Tiktiks.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA: POST /api/arremates/sessoes/iniciar
router.post('/sessoes/iniciar', async (req, res) => {
    let dbClient;
    try {
        const { usuario_tiktik_id, produto_id, variante, quantidade_entregue, dados_ops } = req.body;
        
        const qtdEntregueNum = parseInt(quantidade_entregue);
        if (!usuario_tiktik_id || !produto_id || isNaN(qtdEntregueNum) || qtdEntregueNum <= 0 || !Array.isArray(dados_ops) || dados_ops.length === 0) {
            return res.status(400).json({ error: 'Dados insuficientes. Verifique todos os campos.' });
        }

        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        // --- TRAVA DE CONCORRÊNCIA COM ADVISORY LOCK ---
        const varianteAsNumber = variante ? variante.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
        const lockKey = parseInt(produto_id) + varianteAsNumber;

        const lockResult = await dbClient.query('SELECT pg_try_advisory_xact_lock(12345, $1)', [lockKey]);
        const lockAcquired = lockResult.rows[0].pg_try_advisory_xact_lock;

        if (!lockAcquired) {
            await dbClient.query('ROLLBACK');
            return res.status(409).json({ error: `Este produto está sendo atribuído por outro supervisor. Por favor, tente novamente em alguns segundos.` });
        }
        
        const agoraStr = (new Date()).toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute:'2-digit' });

        const sessaoAtivaQuery = `
            SELECT
                s.id,
                u.nome as tiktik_nome
            FROM sessoes_trabalho_arremate s
            JOIN usuarios u ON s.usuario_tiktik_id = u.id
            WHERE s.produto_id = $1
            AND (s.variante = $2 OR (s.variante IS NULL AND $2 IS NULL))
            AND s.status = 'EM_ANDAMENTO'
            AND (
                -- Considera a sessão ativa APENAS SE o Tiktik estiver DENTRO do seu horário de trabalho
                (u.horario_entrada_1 IS NOT NULL AND u.horario_saida_1 IS NOT NULL AND $3 BETWEEN u.horario_entrada_1 AND u.horario_saida_1) OR
                (u.horario_entrada_2 IS NOT NULL AND u.horario_saida_2 IS NOT NULL AND $3 BETWEEN u.horario_entrada_2 AND u.horario_saida_2) OR
                (u.horario_entrada_3 IS NOT NULL AND u.horario_saida_3 IS NOT NULL AND $3 BETWEEN u.horario_entrada_3 AND u.horario_saida_3)
            )
            LIMIT 1
        `;
        const sessaoAtivaResult = await dbClient.query(sessaoAtivaQuery, [produto_id, variante, agoraStr]);

        if (sessaoAtivaResult.rows.length > 0) {
            const sessaoExistente = sessaoAtivaResult.rows[0];
            await dbClient.query('ROLLBACK');
            return res.status(409).json({
                error: `Este produto já está em uma tarefa ativa com o Tiktik '${sessaoExistente.tiktik_nome}'. Finalize a tarefa atual antes de iniciar uma nova.`
            });
        }

        // Se passou, continua com a verificação de saldo...
        const opNumeros = dados_ops.map(op => op.numero);
        const opsResult = await dbClient.query( `SELECT numero, etapas, quantidade FROM ordens_de_producao WHERE numero = ANY($1::varchar[])`, [opNumeros]);
        const opsDoBanco = opsResult.rows;
        
        const arrematadoResult = await dbClient.query(
            `SELECT
                op_numero,
                SUM(
                    CASE
                        WHEN tipo_lancamento = 'PRODUCAO' THEN quantidade_arrematada
                        WHEN tipo_lancamento = 'PERDA' THEN quantidade_arrematada
                        WHEN tipo_lancamento = 'ESTORNO' THEN -quantidade_arrematada
                        ELSE 0
                    END
                )::integer as total_arrematado_liquido
            FROM arremates
            WHERE op_numero = ANY($1::varchar[])
            GROUP BY op_numero`,
            [opNumeros]
        );
        const arrematadoMap = new Map(arrematadoResult.rows.map(r => [r.op_numero, parseInt(r.total_arrematado_liquido, 10)]));
        
        let saldoRealDisponivel = 0;
        const obterQuantidadeFinalProduzida = (op) => {
            if (!op || !op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) {
                return parseInt(op?.quantidade) || 0;
            }
            for (let i = op.etapas.length - 1; i >= 0; i--) {
                const etapa = op.etapas[i];
                if (etapa && etapa.lancado && typeof etapa.quantidade !== 'undefined' && etapa.quantidade !== null) {
                    const qtdEtapa = parseInt(etapa.quantidade, 10);
                    if (!isNaN(qtdEtapa) && qtdEtapa >= 0) {
                        return qtdEtapa;
                    }
                }
            }
            return parseInt(op.quantidade) || 0;
        };
        
        // Agora iteramos sobre as OPs que buscamos do banco
        for (const op of opsDoBanco) {
            const produzido = obterQuantidadeFinalProduzida(op); // Usamos a função correta
            const jaArrematado = arrematadoMap.get(op.numero) || 0;
            const saldoOpReal = produzido - jaArrematado;

            // Somamos apenas o saldo positivo ao total
            if (saldoOpReal > 0) {
                saldoRealDisponivel += saldoOpReal;
            }
        }
        
        // A trava final
        if (qtdEntregueNum > saldoRealDisponivel) {
            await dbClient.query('ROLLBACK');
            return res.status(409).json({
                error: `Conflito de saldo! A quantidade solicitada (${qtdEntregueNum}) é maior que o saldo disponível real (${saldoRealDisponivel}). Atualize a página e tente novamente.`
            });
        }

        // Se passou, continua com a criação da sessão...
        const op_numero_ref = dados_ops[0].numero;
        const op_edit_id_ref = dados_ops[0].edit_id;
        
        const sessaoQuery = `INSERT INTO sessoes_trabalho_arremate (usuario_tiktik_id, produto_id, variante, quantidade_entregue, op_numero, op_edit_id, dados_ops) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`;
        const sessaoParams = [usuario_tiktik_id, produto_id, variante, qtdEntregueNum, op_numero_ref, op_edit_id_ref, JSON.stringify(dados_ops)];
        const sessaoResult = await dbClient.query(sessaoQuery, sessaoParams);
        const novaSessaoId = sessaoResult.rows[0].id;
        
        await dbClient.query(`UPDATE usuarios SET status_atual = 'TRABALHANDO', id_sessao_trabalho_atual = $1 WHERE id = $2`, [novaSessaoId, usuario_tiktik_id]);

        await dbClient.query('COMMIT');
        res.status(201).json({ message: 'Sessão iniciada com sucesso!', sessaoId: novaSessaoId });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /sessoes/iniciar] Erro:', error);
        res.status(500).json({ error: 'Erro ao iniciar sessão.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// ROTA: POST /api/arremates/sessoes/finalizar
router.post('/sessoes/finalizar', async (req, res) => {
    let dbClient;
    const { id_sessao, quantidade_finalizada } = req.body;

    if (!id_sessao || quantidade_finalizada === undefined) {
        return res.status(400).json({ error: 'ID da sessão e quantidade finalizada são obrigatórios.' });
    }
    
    const qtdFinalizadaNum = parseInt(quantidade_finalizada);
    if (isNaN(qtdFinalizadaNum) || qtdFinalizadaNum < 0) {
        return res.status(400).json({ error: 'Quantidade finalizada deve ser um número não-negativo.' });
    }

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const sessaoQuery = `SELECT * FROM sessoes_trabalho_arremate WHERE id = $1 FOR UPDATE`;
        const sessaoResult = await dbClient.query(sessaoQuery, [id_sessao]);

        if (sessaoResult.rows.length === 0) throw new Error('Sessão não encontrada.');
        const sessao = sessaoResult.rows[0];
    
        if (sessao.status === 'FINALIZADA') throw new Error('Esta sessão de trabalho já foi finalizada.');

        const userTiktikResult = await dbClient.query(`SELECT nome FROM usuarios WHERE id = $1`, [sessao.usuario_tiktik_id]);
        const lancadorResult = await dbClient.query(`SELECT nome FROM usuarios WHERE id = $1`, [req.usuarioLogado.id]);
        if (userTiktikResult.rows.length === 0 || lancadorResult.rows.length === 0) throw new Error('Usuário Tiktik ou Lançador não encontrado.');
        const nomeTiktik = userTiktikResult.rows[0].nome;
        const nomeLancador = lancadorResult.rows[0].nome;

        let idsArrematesGerados = [];

        if (qtdFinalizadaNum > 0) {
            
            let valorPontoAplicado = 1.00;
            const configPontosQuery = `
                SELECT pontos_padrao FROM configuracoes_pontos_processos
                WHERE produto_id = $1 AND tipo_atividade = 'arremate_tiktik' AND ativo = TRUE LIMIT 1;
            `;
            const configResult = await dbClient.query(configPontosQuery, [sessao.produto_id]);
            if (configResult.rows.length > 0 && configResult.rows[0].pontos_padrao !== null) {
                valorPontoAplicado = parseFloat(configResult.rows[0].pontos_padrao);
            }

            let quantidadeRestanteParaLancar = qtdFinalizadaNum;
            
            // ✨✨✨ LÓGICA DE LEITURA 100% SEGURA ✨✨✨
            const opsDeOrigem = (sessao && Array.isArray(sessao.dados_ops)) ? sessao.dados_ops : [];
            const opsOrdenadas = opsDeOrigem.sort((a, b) => a.numero - b.numero);

            if (opsOrdenadas.length === 0) {
                console.error(`ERRO: A sessão ${id_sessao} foi finalizada, mas a coluna 'dados_ops' estava vazia ou inválida.`);
                throw new Error("Não foi possível finalizar: os dados das OPs de origem não foram encontrados nesta sessão.");
            }

            for (const op of opsOrdenadas) {
                if (quantidadeRestanteParaLancar <= 0) break;
                const qtdParaEstaOP = Math.min(quantidadeRestanteParaLancar, op.saldo_op);
                
                if (qtdParaEstaOP > 0) {
                    const pontosGeradosParaEstaOP = qtdParaEstaOP * valorPontoAplicado;
                    const arremateResult = await dbClient.query(
                        `INSERT INTO arremates (op_numero, op_edit_id, produto_id, variante, quantidade_arrematada, usuario_tiktik_id, usuario_tiktik, lancado_por, tipo_lancamento, valor_ponto_aplicado, pontos_gerados)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PRODUCAO', $9, $10) RETURNING id`,
                        [
                            op.numero, op.edit_id, sessao.produto_id, sessao.variante, 
                            qtdParaEstaOP, sessao.usuario_tiktik_id, nomeTiktik, nomeLancador,
                            valorPontoAplicado, pontosGeradosParaEstaOP
                        ]
                    );
                    idsArrematesGerados.push(arremateResult.rows[0].id);
                    quantidadeRestanteParaLancar -= qtdParaEstaOP;
                }
            }
            
            if (quantidadeRestanteParaLancar > 0) {
                throw new Error(`Tentativa de lançar ${qtdFinalizadaNum} peças, mas o saldo disponível nas OPs de origem era insuficiente. Lançamento cancelado.`);
            }
        }
        
        await dbClient.query(
            `UPDATE sessoes_trabalho_arremate SET data_fim = NOW(), status = 'FINALIZADA', quantidade_finalizada = $1, id_arremate_gerado = $2 WHERE id = $3`,
            [qtdFinalizadaNum, idsArrematesGerados.length > 0 ? idsArrematesGerados[0] : null, id_sessao]
        );
        
        await dbClient.query(
            `UPDATE usuarios SET status_atual = 'LIVRE', id_sessao_trabalho_atual = NULL WHERE id = $1`,
            [sessao.usuario_tiktik_id]
        );
        
        await dbClient.query('COMMIT');
        res.status(200).json({ 
            message: 'Sessão finalizada e arremate(s) registrado(s) com sucesso!', 
            arremateIds: idsArrematesGerados 
        });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /sessoes/finalizar] Erro:', error);
        res.status(500).json({ error: 'Erro ao finalizar sessão.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA: PUT /api/arremates/usuarios/:id/status (poderia estar em usuarios.js)
router.put('/usuarios/:id/status', async (req, res) => {
    let dbClient;
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatus = ['LIVRE', 'FALTOU', 'PAUSA_MANUAL'];
        if (!status || !validStatus.includes(status)) {
            console.error(`[API PUT /usuarios/${id}/status] Status inválido: ${status}`);
            return res.status(400).json({ error: 'Status inválido.' });
        }

        dbClient = await pool.connect();
        
        // Ao definir um status manual, atualizamos a data
        const query = `UPDATE usuarios SET status_atual = $1, status_data_modificacao = CURRENT_DATE WHERE id = $2 RETURNING id, nome, status_atual, status_data_modificacao`;
        const result = await dbClient.query(query, [status, id]);

        if (result.rowCount > 0) {
            console.log(`[API PUT /usuarios/${id}/status] Sucesso! Usuário atualizado no banco:`, result.rows[0]);
        } else {
            console.warn(`[API PUT /usuarios/${id}/status] Atenção: A query foi executada mas nenhuma linha foi atualizada. O usuário com id ${id} existe?`);
        }
        
        res.status(200).json({ message: `Status do usuário atualizado para ${status}.` });

    } catch (error) {
        console.error('[API /usuarios/:id/status] Erro:', error);
        res.status(500).json({ error: 'Erro ao atualizar status do usuário.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// POST /api/arremates/estornar - ENDPOINT PARA ESTORNAR UM LANÇAMENTO
router.post('/estornar', async (req, res) => {
    const { usuarioLogado } = req;
    const { id_arremate } = req.body;
    let dbClient;

    if (!id_arremate) {
        return res.status(400).json({ error: "O ID do arremate a ser estornado é obrigatório." });
    }

    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('estornar-arremate')) {
            return res.status(403).json({ error: 'Permissão negada para estornar arremates.' });
        }

        await dbClient.query('BEGIN');

        // 1. Busca o registro original.
        const arremateResult = await dbClient.query(`SELECT * FROM arremates WHERE id = $1`, [id_arremate]);
        if (arremateResult.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Lançamento de arremate não encontrado.' });
        }
        const arremateOriginal = arremateResult.rows[0];
        
        // Validações ...

        // 2. CRIA UM NOVO REGISTRO DE LOG DO TIPO 'ESTORNO'
        const logEstornoQuery = `
            INSERT INTO arremates 
                (op_numero, op_edit_id, produto_id, variante, quantidade_arrematada, 
                 usuario_tiktik, usuario_tiktik_id, lancado_por, tipo_lancamento, assinada, id_perda_origem)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ESTORNO', true, $9)
        `;

        // <<< A CORREÇÃO ESTÁ AQUI >>>
        await dbClient.query(logEstornoQuery, [
            arremateOriginal.op_numero,
            arremateOriginal.op_edit_id,
            arremateOriginal.produto_id,
            arremateOriginal.variante,
            arremateOriginal.quantidade_arrematada,
            arremateOriginal.usuario_tiktik,
            arremateOriginal.usuario_tiktik_id,
            usuarioLogado.nome || 'Sistema',
            null // CORRIGIDO: id_perda_origem deve ser nulo para um estorno.
        ]);
        
        // 3. APAGA o registro de arremate original.
        const deleteResult = await dbClient.query(`DELETE FROM arremates WHERE id = $1`, [id_arremate]);
        if (deleteResult.rowCount === 0) {
            throw new Error("Falha ao apagar o registro de arremate original.");
        }
        
        await dbClient.query('COMMIT');
        
        res.status(200).json({ message: 'Arremate estornado com sucesso!' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /arremates/estornar - LÓGICA LOG + DELETE] Erro:', error.message, error.stack);
        res.status(500).json({ error: 'Erro interno ao estornar o arremate.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/arremates/contagem-hoje - ENDPOINT PARA O DASHBOARD
router.get('/contagem-hoje', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // A query soma a 'quantidade_arrematada' de todos os lançamentos
        // do tipo PRODUCAO que foram criados hoje.
        // Usamos a conversão de timezone para 'America/Sao_Paulo' para garantir
        // que o "hoje" seja calculado corretamente, independentemente do servidor.
        const query = `
            SELECT COALESCE(SUM(quantidade_arrematada), 0) as total
            FROM arremates
            WHERE 
                tipo_lancamento = 'PRODUCAO' AND
                data_lancamento >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AND
                data_lancamento < date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day';
        `;
        
        const result = await dbClient.query(query);
        const totalArrematadoHoje = parseInt(result.rows[0].total) || 0;

        res.status(200).json({ total: totalArrematadoHoje });

    } catch (error) {
        console.error('[API /arremates/contagem-hoje] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar contagem de arremates de hoje.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/arremates/historico-produto - PARA A ABA DE HISTÓRICO DA TELA DE DETALHES
router.get('/historico-produto', async (req, res) => {
    const { 
        produto_id, 
        variante,
        page = 1,
        limit = 8 // Um limite baixo, ideal para uma aba de modal
    } = req.query;

    if (!produto_id) {
        return res.status(400).json({ error: "ID do produto é obrigatório." });
    }

    const varianteDecodificada = variante ? variante.replace(/\+/g, ' ') : null;

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        let whereClauses = ['produto_id = $1'];
        const params = [parseInt(produto_id)];
        let paramIndex = 2;

        if (varianteDecodificada && varianteDecodificada !== '-') {
            whereClauses.push(`variante = $${paramIndex++}`);
            params.push(varianteDecodificada);
        } else {
            whereClauses.push("(variante IS NULL OR variante = '' OR variante = '-')");
        }
        
        const whereString = `WHERE ${whereClauses.join(' AND ')}`;

        // Query de Contagem
        const countQuery = `SELECT COUNT(*) FROM arremates ${whereString}`;
        const countResult = await dbClient.query(countQuery, params);
        const totalItems = parseInt(countResult.rows[0].count, 10);

        // Query de Dados com Paginação
        const limitNum = parseInt(limit);
        const offset = (parseInt(page) - 1) * limitNum;
        const totalPages = Math.ceil(totalItems / limitNum) || 1;
        
        const dataQuery = `
            SELECT data_lancamento, tipo_lancamento, quantidade_arrematada, usuario_tiktik, op_numero 
            FROM arremates 
            ${whereString}
            ORDER BY data_lancamento DESC 
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        params.push(limitNum, offset);

        const result = await dbClient.query(dataQuery, params);
        
        // Retorna a resposta no formato paginado
        res.status(200).json({
            rows: result.rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages: totalPages,
                totalItems: totalItems
            }
        });

    } catch (error) {
        console.error("[API /historico-produto] Erro:", error.message);
        res.status(500).json({ error: "Erro ao buscar histórico do produto." });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.get('/desempenho-diario/:usuarioId', async (req, res) => {
    const { usuarioId } = req.params;
    const { data } = req.query; // Permite buscar por uma data específica, ex: '2024-08-23'
    let dbClient;

    try {
        dbClient = await pool.connect();
        
        // Determina a data de referência no fuso horário do Brasil
        // Se uma data for fornecida, usa ela. Senão, usa a data de 'hoje'.
        const dataReferencia = data ? data : (new Date()).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        // 1. Busca todas as sessões do usuário para a data específica
        const sessoesQuery = `
            SELECT 
                s.*,
                p.nome as produto_nome
            FROM sessoes_trabalho_arremate s
            JOIN produtos p ON s.produto_id = p.id
            WHERE 
                s.usuario_tiktik_id = $1 AND
                s.data_inicio::date = $2::date
            ORDER BY s.data_inicio ASC;
        `;
        const sessoesResult = await dbClient.query(sessoesQuery, [usuarioId, dataReferencia]);
        const sessoesDoDia = sessoesResult.rows;

        // 2. Busca os horários de jornada do usuário
        const usuarioQuery = `
            SELECT nome, horario_entrada_1, horario_saida_1, horario_entrada_2, horario_saida_2, horario_entrada_3, horario_saida_3 
            FROM usuarios WHERE id = $1;
        `;
        const usuarioResult = await dbClient.query(usuarioQuery, [usuarioId]);
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        const dadosUsuario = usuarioResult.rows[0];

        // 3. Processar os dados para gerar métricas e a timeline (LÓGICA NO BACKEND)
        let totalPecas = 0;
        let tempoTrabalhadoTotalSegundos = 0;
        const timeline = [];

        sessoesDoDia.forEach(sessao => {
            if (sessao.status === 'FINALIZADA' && sessao.data_fim) {
                const qtd = sessao.quantidade_finalizada || 0;
                totalPecas += qtd;

                const duracaoSegundos = (new Date(sessao.data_fim) - new Date(sessao.data_inicio)) / 1000;
                tempoTrabalhadoTotalSegundos += duracaoSegundos;
                
                // Adiciona o bloco de trabalho à timeline
                timeline.push({
                    tipo: 'TRABALHO',
                    inicio: sessao.data_inicio,
                    fim: sessao.data_fim,
                    duracao: duracaoSegundos,
                    detalhes: `${qtd}x ${sessao.produto_nome} (${sessao.variante || 'Padrão'})`
                });
            }
        });
        
        // Calcula a eficiência média do dia
        const eficienciaMediaHoje = totalPecas > 0 ? tempoTrabalhadoTotalSegundos / totalPecas : 0;

        const responsePayload = {
            usuario: {
                id: usuarioId,
                nome: dadosUsuario.nome,
                jornada: {
                    entrada1: dadosUsuario.horario_entrada_1, saida1: dadosUsuario.horario_saida_1,
                    entrada2: dadosUsuario.horario_entrada_2, saida2: dadosUsuario.horario_saida_2,
                    entrada3: dadosUsuario.horario_entrada_3, saida3: dadosUsuario.horario_saida_3,
                }
            },
            metricas: {
                totalPecasArrematadas: totalPecas,
                tempoTotalTrabalhadoSegundos: tempoTrabalhadoTotalSegundos,
                eficienciaMediaPorPecaSegundos: eficienciaMediaHoje
            },
            sessoes: sessoesDoDia, // Envia as sessões brutas também
            // A timeline de pausas e ociosidade será calculada no frontend para maior precisão visual
        };

        res.status(200).json(responsePayload);

    } catch (error) {
        console.error(`[API /desempenho-diario/${usuarioId}] Erro:`, error);
        res.status(500).json({ error: 'Erro ao buscar dados de desempenho.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;