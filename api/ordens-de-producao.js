// api/ordens-de-producao.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarToken (deve estar definida ou importada)
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
    try { return jwt.verify(token, SECRET_KEY); }
    catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/ordens-de-producao] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenOriginal(req);
        cliente = await pool.connect();
        req.dbCliente = cliente;
        console.log('[router/ordens-de-producao middleware] Conexão com o banco estabelecida.');
        next();
    } catch (error) {
        console.error('[router/ordens-de-producao middleware] Erro:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/ordens-de-producao/
router.get('/', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    const { query } = req;
    try {
        if (!usuarioLogado.permissoes.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        const fetchAll = query.all === 'true';
        const getNextNumber = query.getNextNumber === 'true';
        const noStatusFilter = query.noStatusFilter === 'true';
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;
        const offset = (page - 1) * limit;
        const statusFilter = query.status;
        const searchTerm = query.search ? String(query.search).trim() : null;

        if (getNextNumber) {
            console.log('[API OPs GET] Branch: getNextNumber');
            const getNextNumberQueryText = `SELECT numero FROM ordens_de_producao ORDER BY CAST(numero AS INTEGER) DESC`; // Nome diferente para evitar conflito
            const result = await dbCliente.query(getNextNumberQueryText);
            if (dbCliente) dbCliente.release();
            return res.status(200).json(result.rows.map(row => row.numero));
        }

        const queryTextBase = 'SELECT * FROM ordens_de_producao';
        const countQueryTextBase = 'SELECT COUNT(*) FROM ordens_de_producao';

        // <<< DECLARE AS VARIÁVEIS AQUI FORA >>>
        let queryText;
        let countQueryText;
        let queryParams = []; // Inicialize como array vazio
        let countQueryParams = []; // Inicialize como array vazio
        let whereClausesNew = [];
        let dynamicParams = [];
        let currentParamIdx = 1;
        // <<< FIM DAS DECLARAÇÕES EXTERNAS >>>

        // Filtro de Status
        if (noStatusFilter) {
            console.log('[API OPs GET] Branch: noStatusFilter (REALMENTE TODAS)');
            /* nada a adicionar em whereClausesNew ou dynamicParams */
        } else if (statusFilter) {
            console.log(`[API OPs GET] Branch: statusFilter = ${statusFilter}`);
            whereClausesNew.push(`status = $${currentParamIdx++}`);
            dynamicParams.push(statusFilter);
        } else {
            console.log('[API OPs GET] Branch: Filtro PADRÃO de status (em-aberto, produzindo)');
            whereClausesNew.push(`status IN ('em-aberto', 'produzindo')`);
            // Nenhum parâmetro dinâmico para este caso, a string já está completa
        }

        // Filtro de Busca (SearchTerm)
        if (searchTerm) {
            console.log(`[API OPs GET] Aplicando searchTerm: ${searchTerm}`);
            whereClausesNew.push(`(
                numero ILIKE $${currentParamIdx++} OR
                produto ILIKE $${currentParamIdx++} OR
                COALESCE(variante, '') ILIKE $${currentParamIdx++}
            )`);
            const likeSearchTerm = `%${searchTerm}%`;
            dynamicParams.push(likeSearchTerm, likeSearchTerm, likeSearchTerm);
        }

        const finalWhereCondition = whereClausesNew.length > 0 ? `WHERE ${whereClausesNew.join(' AND ')}` : '';
        queryText = `${queryTextBase} ${finalWhereCondition} ORDER BY CAST(numero AS INTEGER) DESC`;
        countQueryText = `${countQueryTextBase} ${finalWhereCondition}`;

        // Atribui os parâmetros construídos dinamicamente
        // Estes já estão corretos por causa do escopo e da modificação acima
        queryParams = [...dynamicParams];
        countQueryParams = [...dynamicParams];


        if (!fetchAll) {
            queryText += ` LIMIT $${currentParamIdx++} OFFSET $${currentParamIdx++}`;
            queryParams.push(limit, offset); // Adiciona ao array de queryParams principal
            // countQueryParams não precisa de limit/offset
        }
        // Se fetchAll for true, não adicionamos LIMIT e OFFSET,
        // e queryParams/countQueryParams (que são cópias de dynamicParams) estão corretos para as queries sem paginação.


        console.log('[API OPs GET] Query Principal:', queryText, queryParams);
        const result = await dbCliente.query(queryText, queryParams);

        console.log('[API OPs GET] Query de Contagem:', countQueryText, countQueryParams);
        const totalResult = await dbCliente.query(countQueryText, countQueryParams);
        const total = parseInt(totalResult.rows[0].count);

        res.status(200).json({
            rows: result.rows,
            total: total,
            page: fetchAll ? 1 : page,
            pages: fetchAll ? (limit > 0 && total > 0 ? Math.ceil(total / limit) : 1) : (limit > 0 ? Math.ceil(total / limit) : 1),
        });

    } catch (error) {
        console.error('[router/ordens-de-producao GET] Erro detalhado:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao buscar ordens de produção', details: error.message });
    } finally {
        if (dbCliente) {
            console.log('[router/ordens-de-producao GET] Liberando cliente do banco.');
            dbCliente.release();
        }
    }
});

// POST /api/ordens-de-producao/
router.post('/', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    try {
        if (!usuarioLogado.permissoes.includes('criar-op')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }
        const { numero, produto, variante, quantidade, data_entrega, observacoes, status, etapas, edit_id: fornecido_edit_id } = req.body;
        if (!numero || !produto || quantidade === undefined || !data_entrega) {
            return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
        }
        if (typeof quantidade !== 'number' || quantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade deve ser positiva.' });
        }
        const editId = fornecido_edit_id || Date.now().toString() + Math.random().toString(36).substring(2, 7);
        const checkExists = await dbCliente.query('SELECT 1 FROM ordens_de_producao WHERE numero = $1', [numero]);
        if (checkExists.rowCount > 0) {
            return res.status(409).json({ error: 'Número da OP já existe.' });
        }
        const result = await dbCliente.query(
            `INSERT INTO ordens_de_producao (numero, produto, variante, quantidade, data_entrega, observacoes, status, edit_id, etapas, data_criacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP) RETURNING *`,
            [numero, produto, variante || null, quantidade, data_entrega, observacoes || '', status || 'em-aberto', editId, JSON.stringify(etapas || [])]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[router/ordens-de-producao POST] Erro:', error.message, error.stack);
        if (error.code === '23505') return res.status(409).json({ error: 'Conflito de dados.', details: error.detail });
        res.status(500).json({ error: 'Erro ao criar OP.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// PUT /api/ordens-de-producao/
router.put('/', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    try {
        if (!usuarioLogado.permissoes.includes('editar-op')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }
        const { edit_id, numero, produto, variante, quantidade, data_entrega, observacoes, status, etapas, data_final } = req.body;
        if (!edit_id) return res.status(400).json({ error: 'edit_id é obrigatório.' });
        const result = await dbCliente.query(
            `UPDATE ordens_de_producao 
             SET numero = $1, produto = $2, variante = $3, quantidade = $4, data_entrega = $5, 
                 observacoes = $6, status = $7, etapas = $8, data_final = $9, data_atualizacao = CURRENT_TIMESTAMP
             WHERE edit_id = $10 RETURNING *`,
            [numero, produto, variante || null, quantidade, data_entrega, observacoes || '', status, JSON.stringify(etapas || []), data_final || null, edit_id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'OP não encontrada.' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[router/ordens-de-producao PUT] Erro:', error.message, error.stack);
        if (error.code === '23505') return res.status(409).json({ error: 'Conflito de dados.', details: error.detail });
        res.status(500).json({ error: 'Erro ao atualizar OP.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;