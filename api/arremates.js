// api/arremates.js
 console.log('--- [DEBUG] O ARQUIVO api/arremates.js FOI CARREGADO PELO SERVIDOR ---');

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
    console.log('--- [API GET /arremates com Filtros e Paginação] ---');
    
    const { 
        produto_id, 
        variante,
        page = 1,
        limit = 6,
        fetchAll = 'false'
    } = req.query;

    const varianteDecodificada = variante ? variante.replace(/\+/g, ' ') : null;

    let dbClient;
    try {
        dbClient = await pool.connect();

        console.log(`[API GET /arremates] Parâmetros recebidos: produto_id=${produto_id}, variante="${variante}" (decodificada para: "${varianteDecodificada}")`);

        let whereClauses = [
            // <<< FILTRO DE SALDO ADICIONADO DIRETAMENTE NA QUERY >>>
            "(a.quantidade_arrematada - a.quantidade_ja_embalada) > 0",
            "a.tipo_lancamento = 'PRODUCAO'"
        ];
        let queryParams = [];
        let paramIndex = 1;

        if (produto_id) {
            whereClauses.push(`a.produto_id = $${paramIndex++}`);
            queryParams.push(parseInt(produto_id));
        }

        // <<< VARIÁVEL CORRIGIDA  >>>
        if (varianteDecodificada && varianteDecodificada !== '-') {
            whereClauses.push(`a.variante = $${paramIndex++}`);
            queryParams.push(varianteDecodificada); // << Usa a variável decodificada
        } else if (variante === '-') { // << Aqui mantemos 'variante' para o caso especial
            whereClauses.push(`(a.variante IS NULL OR a.variante = '-' OR a.variante = '')`);
        }

        const whereString = `WHERE ${whereClauses.join(' AND ')}`;

        const countQuery = `SELECT COUNT(*) FROM arremates a ${whereString}`;
        const countResult = await dbClient.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count, 10);
        
        const limitNum = parseInt(limit);
        const offset = (parseInt(page) - 1) * limitNum;
        const totalPages = Math.ceil(totalItems / limitNum) || 1;


        
        // <<< LÓGICA DE PAGINAÇÃO CONDICIONAL >>>
        let paginationClause = '';
        if (fetchAll === 'false') {
            const limitNum = parseInt(limit);
            const offset = (parseInt(page) - 1) * limitNum;
            paginationClause = `LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            queryParams.push(limitNum, offset);
        }

        let dataQuery = `
            SELECT a.*, p.nome as produto 
            FROM arremates a 
            JOIN produtos p ON a.produto_id = p.id
            ${whereString}
            ORDER BY a.data_lancamento DESC
            ${paginationClause} -- <<< APLICA A PAGINAÇÃO AQUI (ou não) >>>
        `;


        const dataResult = await dbClient.query(dataQuery, queryParams);

        // <<< LOG DE DEPURAÇÃO 4: RESULTADO >>>
        console.log(`%c[API GET /arremates] A query retornou ${dataResult.rowCount} linhas.`, 'color: blue; font-weight: bold;');

        // Se for fetchAll, não precisamos de dados de paginação na resposta.
        if (fetchAll === 'true') {
            return res.status(200).json({ rows: dataResult.rows, pagination: {} });
        }
        
        res.status(200).json({
            rows: dataResult.rows,
            pagination: { currentPage: parseInt(page), totalPages, totalItems }
        });

    } catch (error) {
        console.error('[API Arremates GET / Paginado] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao buscar arremates.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA: GET /api/arremates/historico
router.get('/historico', async (req, res) => {
    console.log('\n--- [API GET /historico] INÍCIO DA REQUISIÇÃO ---');
    console.log('[LOG 1] Query Params Recebidos:', req.query);
    
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
        console.log('[LOG 2] Cláusula WHERE construída:', whereString);
        console.log('[LOG 3] Parâmetros para WHERE:', queryParams);

        // Query de Contagem
        const countQuery = `SELECT COUNT(*) FROM arremates a LEFT JOIN produtos p ON a.produto_id = p.id ${whereString}`;
        const countResult = await dbClient.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count, 10);
        console.log(`[LOG 4] Contagem de itens (total): ${totalItems}`);

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
        
        console.log('[LOG 5] Query de Dados Final:', dataQuery.replace(/\s+/g, ' ').trim());
        console.log('[LOG 6] Parâmetros Finais (com paginação):', finalQueryParams);
        
        const dataResult = await dbClient.query(dataQuery, finalQueryParams);
        console.log(`[LOG 7] Query de Dados retornou ${dataResult.rowCount} linhas.`);
        
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
    console.log('--- [API GET /arremates/fila] REQUISIÇÃO (LÓGICA JS NO BACKEND) ---');
    
    const { 
        search, 
        sortBy = 'data_op_mais_recente', 
        page = 1, 
        limit = 6 
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
        
        // --- INÍCIO DA MUDANÇA ---

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

        // 6. APLICAR PAGINAÇÃO SOBRE O RESULTADO JÁ FILTRADO E ORDENADO
        const limitNum = parseInt(limit);
        const offset = (parseInt(page) - 1) * limitNum;
        const totalPages = Math.ceil(resultados.length / limitNum) || 1;
        const paginatedResults = resultados.slice(offset, offset + limitNum);

        // 7. ENVIAR A RESPOSTA COM OS TOTAIS GERAIS
        res.status(200).json({
            rows: paginatedResults, // Os dados da página atual
            pagination: {
                currentPage: parseInt(page),
                totalPages: totalPages,
                totalItems: totalGruposDeProdutos, // <<< TOTAL DE GRUPOS ANTES DA PAGINAÇÃO
                totalPecas: totalPecasPendentes,    // <<< SOMA TOTAL DE PEÇAS ANTES DA PAGINAÇÃO
                limit: limitNum
            }
        });

        // --- FIM DA MUDANÇA ---

    } catch (error) {
        console.error('[API GET /arremates/fila] Erro na lógica JS do backend:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao processar a fila de arremates.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/arremates/estornar - ENDPOINT PARA ESTORNAR UM LANÇAMENTO
router.post('/estornar', async (req, res) => {
    console.log('--- [DEBUG] REQUISIÇÃO CHEGOU EM: POST /api/arremates/estornar (LÓGICA LOG + DELETE) ---');
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
        console.log('[DEBUG] Criando registro de log de ESTORNO...');
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
        console.log(`[DEBUG] Apagando o arremate original com ID: ${id_arremate}`);
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

export default router;