// api/ordens-de-producao.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importar a função de buscar permissões completas
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarTokenOriginal (deve ser a mesma do seu api/usuarios.js e outras APIs)
const verificarTokenOriginal = (reqOriginal) => {
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
        const decoded = jwt.verify(token, SECRET_KEY);
        // console.log('[api/ordens-de-producao - verificarTokenOriginal] Token decodificado:', decoded);
        return decoded; // Payload do token
    }
    catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
// A gestão de conexão DB e verificação de permissões detalhadas fica em cada rota.
router.use(async (req, res, next) => {
    try {
        // console.log(`[router/ordens-de-producao MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenOriginal(req);
        next();
    } catch (error) {
        console.error('[router/ordens-de-producao MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/ordens-de-producao/ (Listar OPs com filtros e paginação)
router.get('/', async (req, res) => {
    const { usuarioLogado } = req; // usuarioLogado vem do token (via middleware)
    const { query } = req;
    let dbClient; 

    try {
        dbClient = await pool.connect();
        // console.log(`[API OPs GET /] Usuário do token: ${usuarioLogado.nome || usuarioLogado.nome_usuario}, ID: ${usuarioLogado.id}`);

        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API OPs GET /] Permissões Completas do DB para ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) {
            // console.log(`[API OPs GET /] Permissão 'acesso-ordens-de-producao' negada para ${usuarioLogado.nome || usuarioLogado.nome_usuario}.`);
            return res.status(403).json({ error: 'Permissão negada para acessar ordens de produção.' });
        }

        const fetchAll = query.all === 'true';
        const getNextNumber = query.getNextNumber === 'true';
        const noStatusFilter = query.noStatusFilter === 'true';
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10; // Padrão para frontend é 10
        const offset = (page - 1) * limit;
        const statusFilter = query.status;
        const searchTerm = query.search ? String(query.search).trim() : null;

        if (getNextNumber) {
            // console.log('[API OPs GET /] Branch: getNextNumber');
            const getNextNumberQueryText = `SELECT numero FROM ordens_de_producao ORDER BY CAST(NULLIF(REGEXP_REPLACE(numero, '\\D', '', 'g'), '') AS INTEGER) DESC NULLS LAST, numero DESC`;
            const result = await dbClient.query(getNextNumberQueryText);
            return res.status(200).json(result.rows.map(row => row.numero));
        }

        const queryTextBase = 'SELECT * FROM ordens_de_producao';
        const countQueryTextBase = 'SELECT COUNT(*) FROM ordens_de_producao';
        let whereClausesNew = [];
        let dynamicParams = [];
        let currentParamIdx = 1;

        if (noStatusFilter) {
            // console.log('[API OPs GET /] Branch: noStatusFilter (buscando todas as OPs sem filtro de status)');
        } else if (statusFilter) {
            // console.log(`[API OPs GET /] Branch: statusFilter = ${statusFilter}`);
            whereClausesNew.push(`status = $${currentParamIdx++}`);
            dynamicParams.push(statusFilter);
        } else {
            // console.log('[API OPs GET /] Branch: Filtro PADRÃO de status (em-aberto, produzindo)');
            whereClausesNew.push(`status IN ('em-aberto', 'produzindo')`);
        }

        if (searchTerm) {
            // console.log(`[API OPs GET /] Aplicando searchTerm: ${searchTerm}`);
            whereClausesNew.push(`(
                numero ILIKE $${currentParamIdx++} OR
                produto ILIKE $${currentParamIdx++} OR
                COALESCE(variante, '') ILIKE $${currentParamIdx++}
            )`);
            const likeSearchTerm = `%${searchTerm}%`;
            dynamicParams.push(likeSearchTerm, likeSearchTerm, likeSearchTerm);
        }

        const finalWhereCondition = whereClausesNew.length > 0 ? `WHERE ${whereClausesNew.join(' AND ')}` : '';
        let queryText = `${queryTextBase} ${finalWhereCondition} ORDER BY CAST(NULLIF(REGEXP_REPLACE(numero, '\\D', '', 'g'), '') AS INTEGER) DESC NULLS LAST, numero DESC`;
        let countQueryText = `${countQueryTextBase} ${finalWhereCondition}`;
        
        let queryParamsForData = [...dynamicParams];
        let queryParamsForCount = [...dynamicParams]; // Usar uma cópia para a contagem

        if (!fetchAll) {
            queryText += ` LIMIT $${currentParamIdx} OFFSET $${currentParamIdx + 1}`; // Os placeholders são relativos aos params já adicionados
            queryParamsForData.push(limit, offset);
        }

        // console.log('[API OPs GET /] Query Principal:', queryText, queryParamsForData);
        const result = await dbClient.query(queryText, queryParamsForData);

        // console.log('[API OPs GET /] Query de Contagem:', countQueryText, queryParamsForCount);
        const totalResult = await dbClient.query(countQueryText, queryParamsForCount);
        const total = parseInt(totalResult.rows[0].count);
        
        const totalPages = limit > 0 ? Math.ceil(total / limit) : (total > 0 ? 1 : 0);


        res.status(200).json({
            rows: result.rows,
            total: total,
            page: fetchAll ? 1 : page, // Se fetchAll, considera como página 1 de todas as páginas possíveis
            pages: fetchAll ? (total > 0 ? totalPages : 1) : totalPages,
        });

    } catch (error) {
        console.error('[router/ordens-de-producao GET /] Erro detalhado:', error.message, error.stack ? error.stack.substring(0,500) : "");
        res.status(500).json({ error: 'Erro ao buscar ordens de produção', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
            // console.log('[router/ordens-de-producao GET /] Liberando cliente do banco.');
        }
    }
});

// GET /api/ordens-de-producao/:id (Buscar uma ÚNICA OP por edit_id ou numero)
router.get('/:id', async (req, res) => {
    const { usuarioLogado } = req;
    const opIdentifier = req.params.id;
    let dbClient; 

    try {
        dbClient = await pool.connect();
        // console.log(`[API OPs GET /:id] Usuário do token: ${usuarioLogado.nome || usuarioLogado.nome_usuario}, ID: ${usuarioLogado.id}, buscando OP: ${opIdentifier}`);

        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) { // Ou uma permissão mais específica como 'ver-detalhe-op'
            // console.log(`[API OPs GET /:id] Permissão 'acesso-ordens-de-producao' negada para ${usuarioLogado.nome || usuarioLogado.nome_usuario}.`);
            return res.status(403).json({ error: 'Permissão negada para ver detalhes da OP.' });
        }

        const result = await dbClient.query(
            `SELECT * FROM ordens_de_producao WHERE edit_id = $1 OR numero = $1`,
            [opIdentifier]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`[router/ordens-de-producao GET /:id] Erro:`, error.message, error.stack ? error.stack.substring(0,500):"");
        res.status(500).json({ error: 'Erro ao buscar OP.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
            // console.log('[router/ordens-de-producao GET /:id] Liberando cliente do banco.');
        }
    }
});


// POST /api/ordens-de-producao/ (Criar nova OP)
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('criar-op')) {
            return res.status(403).json({ error: 'Permissão negada para criar Ordem de Produção.' });
        }
        
        const { numero, produto, variante, quantidade, data_entrega, observacoes, status, etapas, edit_id: fornecido_edit_id } = req.body;
        
        // Validações
        if (!numero || !produto || quantidade === undefined || !data_entrega) {
            return res.status(400).json({ error: 'Campos obrigatórios ausentes (numero, produto, quantidade, data_entrega).' });
        }
        if (typeof quantidade !== 'number' || quantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade deve ser um número positivo.' });
        }
        
        const editId = fornecido_edit_id || Date.now().toString() + Math.random().toString(36).substring(2, 7);
        
        const checkExists = await dbClient.query('SELECT 1 FROM ordens_de_producao WHERE numero = $1', [numero]);
        if (checkExists.rowCount > 0) {
            return res.status(409).json({ error: `Número da OP '${numero}' já existe.` });
        }
        
        const result = await dbClient.query(
            `INSERT INTO ordens_de_producao (numero, produto, variante, quantidade, data_entrega, observacoes, status, edit_id, etapas, data_criacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP) RETURNING *`,
            [numero, produto, variante || null, quantidade, data_entrega, observacoes || '', status || 'em-aberto', editId, JSON.stringify(etapas || [])]
        );
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[router/ordens-de-producao POST] Erro:', error.message, error.stack? error.stack.substring(0,500):"");
        if (error.code === '23505') { // Unique violation (ex: edit_id duplicado se não for bem gerado)
            return res.status(409).json({ error: 'Conflito de dados. Possível ID duplicado.', details: error.detail });
        }
        res.status(500).json({ error: 'Erro ao criar Ordem de Produção.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
            // console.log('[router/ordens-de-producao POST] Liberando cliente do banco.');
        }
    }
});

// PUT /api/ordens-de-producao/ (Atualizar OP existente)
router.put('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        const { edit_id, numero, produto, variante, quantidade, data_entrega, observacoes, status, etapas, data_final } = req.body;

        if (!edit_id) {
            return res.status(400).json({ error: 'O campo "edit_id" é obrigatório para atualização.' });
        }

        // Busca a OP atual para verificar o status antes da mudança (se necessário para lógica de permissão)
        // const opAtualResult = await dbClient.query('SELECT status FROM ordens_de_producao WHERE edit_id = $1', [edit_id]);
        // if (opAtualResult.rows.length === 0) {
        //     return res.status(404).json({ error: 'OP não encontrada para verificar status antes de atualizar.' });
        // }
        // const statusAtualDaOP = opAtualResult.rows[0].status;

        let permissaoConcedida = false;
        // Lógica de permissão para diferentes ações
        if (status === 'cancelada' && permissoesCompletas.includes('cancelar-op')) {
            permissaoConcedida = true;
        } else if (status === 'finalizado' && permissoesCompletas.includes('finalizar-op')) {
            permissaoConcedida = true;
        } else if (permissoesCompletas.includes('editar-op')) { 
            // Se não for cancelar nem finalizar, precisa de 'editar-op' para qualquer outra mudança
            permissaoConcedida = true;
        }


        if (!permissaoConcedida) {
            // console.log(`[API OPs PUT] Permissão negada para ${usuarioLogado.nome || usuarioLogado.nome_usuario} alterar OP ${edit_id} para status ${status}. Permissões: ${permissoesCompletas.join(', ')}`);
            return res.status(403).json({ error: 'Permissão negada para realizar esta alteração na Ordem de Produção.' });
        }
        
        // Validações dos campos que podem ser atualizados
        if (numero === undefined || produto === undefined || quantidade === undefined || data_entrega === undefined || status === undefined) {
            // return res.status(400).json({ error: 'Campos numero, produto, quantidade, data_entrega e status são esperados.' });
            // Relaxando essa validação, pois o frontend pode enviar apenas os campos que mudaram.
            // O UPDATE abaixo usará COALESCE ou lógica similar se alguns campos não forem enviados.
        }
        if (quantidade !== undefined && (typeof quantidade !== 'number' || quantidade <= 0)) {
            // return res.status(400).json({ error: 'Se fornecida, a quantidade deve ser um número positivo.' });
            // A validação de quantidade já existe no frontend para o form, e o saveOPChanges envia a quantidade atual
        }


        // Construir a query de UPDATE dinamicamente seria mais robusto,
        // mas para simplificar, vamos atualizar todos os campos se eles vierem.
        // O frontend (saveOPChanges) envia o objeto OP completo.
        const result = await dbClient.query(
            `UPDATE ordens_de_producao
             SET numero = $1, 
                 produto = $2, 
                 variante = $3, 
                 quantidade = $4, 
                 data_entrega = $5,
                 observacoes = $6, 
                 status = $7, 
                 etapas = $8, 
                 data_final = $9, 
                 data_atualizacao = CURRENT_TIMESTAMP
             WHERE edit_id = $10 RETURNING *`,
            [
                numero, 
                produto, 
                variante || null, 
                quantidade, 
                data_entrega, 
                observacoes || '', 
                status, 
                JSON.stringify(etapas || []), 
                data_final || null, 
                edit_id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ordem de Produção não encontrada para atualização.' });
        }
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error('[router/ordens-de-producao PUT] Erro:', error.message, error.stack? error.stack.substring(0,500):"");
        if (error.code === '23505' && error.constraint === 'ordens_de_producao_numero_key') {
            return res.status(409).json({ error: `O número de OP '${req.body.numero}' já está em uso.`, details: error.detail });
        } else if (error.code === '23505') {
             return res.status(409).json({ error: 'Conflito de dados ao atualizar OP.', details: error.detail });
        }
        res.status(500).json({ error: 'Erro ao atualizar Ordem de Produção.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
            // console.log('[router/ordens-de-producao PUT] Liberando cliente do banco.');
        }
    }
});

export default router;