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
        return jwt.verify(token, SECRET_KEY);
    }
    catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
router.use(async (req, res, next) => {
    try {
        req.usuarioLogado = verificarTokenOriginal(req);
        next();
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/ordens-de-producao/ (Listar OPs com filtros e paginação)
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { query } = req;
    let dbClient; 

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        if (query.getNextNumber === 'true') {
            const result = await dbClient.query(`SELECT numero FROM ordens_de_producao ORDER BY CAST(NULLIF(REGEXP_REPLACE(numero, '\\D', '', 'g'), '') AS INTEGER) DESC NULLS LAST, numero DESC`);
            return res.status(200).json(result.rows.map(row => row.numero));
        }

        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;
        const offset = (page - 1) * limit;

        const queryTextBase = `
        SELECT 
            op.id, op.numero, op.variante, op.quantidade, op.data_entrega, 
            op.observacoes, op.status, op.edit_id, op.etapas, op.data_final,
            op.produto_id, -- INCLUINDO O ID
            p.nome AS produto
        FROM ordens_de_producao op
        LEFT JOIN produtos p ON op.produto_id = p.id
    `;
        
        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        // --- A LÓGICA DO FILTRO CORRIGIDA ESTÁ AQUI ---
        if (query.status && query.status !== 'todas') {
            // Se um status específico (e diferente de 'todas') for enviado, use-o
            whereClauses.push(`op.status = $${paramIndex++}`);
            params.push(query.status);
        } else {
            // Se o status for 'todas' ou se nenhum status for enviado,
            // aplica o filtro padrão para mostrar apenas 'em-aberto' e 'produzindo'.
            whereClauses.push(`op.status IN ('em-aberto', 'produzindo')`);
        }

        if (query.search) {
            const searchTerm = `%${query.search}%`;
            whereClauses.push(`(op.numero ILIKE $${paramIndex} OR p.nome ILIKE $${paramIndex + 1} OR op.variante ILIKE $${paramIndex + 2})`);
            params.push(searchTerm, searchTerm, searchTerm);
            paramIndex += 3;
        }
        
        const whereCondition = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
        
        const countQuery = `SELECT COUNT(op.id) FROM ordens_de_producao op LEFT JOIN produtos p ON op.produto_id = p.id ${whereCondition}`;
        const dataQuery = `${queryTextBase} ${whereCondition} ORDER BY op.id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        
        const countParams = params.slice();
        params.push(limit, offset);

        const totalResult = await dbClient.query(countQuery, countParams);
        const total = parseInt(totalResult.rows[0].count);
        const result = await dbClient.query(dataQuery, params);

        res.status(200).json({
            rows: result.rows,
            total: total,
            page: page,
            pages: Math.ceil(total / limit) || 1,
        });

    } catch (error) {
        console.error('[router/ordens-de-producao GET /] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar ordens de produção.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/ordens-de-producao/:id (Buscar uma ÚNICA OP por edit_id ou numero)
router.get('/:id', async (req, res) => {
    const { usuarioLogado } = req;
    const opIdentifier = req.params.id;
    let dbClient; 

    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        const query = `
        SELECT 
            op.id, op.numero, op.variante, op.quantidade, op.data_entrega, 
            op.observacoes, op.status, op.edit_id, op.etapas, op.data_final,
            op.produto_id, -- INCLUINDO O ID
            p.nome as produto
        FROM ordens_de_producao op
        LEFT JOIN produtos p ON op.produto_id = p.id
        WHERE op.edit_id = $1 OR op.numero = $1
    `;
        const result = await dbClient.query(query, [opIdentifier]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
        }
        
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error(`[router/ordens-de-producao GET /:id] Erro:`, error);
        res.status(500).json({ error: 'Erro ao buscar detalhes da OP.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// POST /api/ordens-de-producao/ (Criar nova OP)
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        // Log inicial para ver exatamente o que o backend recebeu
        console.log('[API POST OP] Corpo da requisição recebido:', JSON.stringify(req.body, null, 2));

        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('criar-op')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }
        
        const { numero, produto_id, variante, quantidade, data_entrega, observacoes, status, etapas, edit_id } = req.body;
        
        if (!numero || !produto_id || quantidade === undefined || !data_entrega) {
            return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
        }
        
        // Inicia a transação
        await dbClient.query('BEGIN');
        console.log('[API POST OP] Transação iniciada (BEGIN).');

        const final_edit_id = edit_id || Date.now().toString() + Math.random().toString(36).substring(2, 7);

        const queryText = `
            INSERT INTO ordens_de_producao (
                numero, produto_id, variante, quantidade, data_entrega, 
                observacoes, status, edit_id, etapas
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
            RETURNING *
        `;

        const values = [
            numero, 
            parseInt(produto_id),
            variante || null, 
            parseInt(quantidade),
            data_entrega, 
            observacoes || '', 
            status || 'em-aberto', 
            final_edit_id, 
            JSON.stringify(etapas || [])
        ];

        console.log('[API POST OP] Query a ser executada:', queryText);
        console.log('[API POST OP] Valores para a query:', values);

        const result = await dbClient.query(queryText, values);

        // Confirma a transação
        await dbClient.query('COMMIT');
        console.log('[API POST OP] Transação confirmada (COMMIT).');
        
        // Se o resultado voltou, loga o que foi inserido
        if (result.rows[0]) {
            console.log('[API POST OP] Linha retornada pelo banco:', result.rows[0]);
        }

        res.status(201).json(result.rows[0]);

    } catch (error) {
        if (dbClient) {
            // Se der erro, desfaz a transação
            await dbClient.query('ROLLBACK');
            console.error('[API POST OP] ERRO! Transação desfeita (ROLLBACK).');
        }
        console.error('[API POST OP] Erro detalhado:', error);
        res.status(500).json({ error: 'Erro ao criar Ordem de Produção.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
        }
    }
});

//GET /api/ordens-de-producao/check-op-filha/:numeroMae
router.get('/check-op-filha/:numeroMae', async (req, res) => {
    const { usuarioLogado } = req; // <<< Verifique se o middleware está passando isso
    const { numeroMae } = req.params;
    let dbClient;

    try {
        dbClient = await pool.connect();
        
        // Verificação de permissão (opcional, mas bom ter)
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }
        
        const textoBusca = `OP gerada em conjunto com a OP mãe #${numeroMae}`;

        const query = `
            SELECT EXISTS (
                SELECT 1 
                FROM ordens_de_producao 
                WHERE observacoes = $1 AND status NOT IN ('cancelada', 'excluido')
            ) as "filhaExiste";
        `;
        
        const result = await dbClient.query(query, [textoBusca]);
        const { filhaExiste } = result.rows[0];

        res.status(200).json({ existe: filhaExiste });

    } catch (error) {
        console.error(`[API check-op-filha] Erro ao verificar OP filha para mãe #${numeroMae}:`, error);
        // Não retorne o erro HTML, retorne um JSON de erro
        res.status(500).json({ error: 'Erro ao verificar OP filha.', existe: true });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// PUT /api/ordens-de-producao/ (Atualizar OP existente)
router.put('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        const opData = req.body;
        const { edit_id, numero, status, produto_id } = opData;

        // Validação de dados essenciais
        if (!edit_id) {
            return res.status(400).json({ error: 'O campo "edit_id" é obrigatório para atualização.' });
        }
        if (!produto_id && status !== 'cancelada') { // Permite cancelar mesmo sem produto_id (caso de erro antigo)
            return res.status(400).json({ error: 'O campo "produto_id" é obrigatório para atualização.' });
        }

        // Lógica de permissão para a ação específica
        let permissaoConcedida = false;
        if (status === 'cancelada' && permissoesCompletas.includes('cancelar-op')) {
            permissaoConcedida = true;
        } else if (status === 'finalizado' && permissoesCompletas.includes('finalizar-op')) {
            permissaoConcedida = true;
        } else if (permissoesCompletas.includes('editar-op')) {
            permissaoConcedida = true;
        }

        if (!permissaoConcedida) {
            return res.status(403).json({ error: 'Permissão negada para realizar esta alteração na Ordem de Produção.' });
        }

        // Lógica de cascata para cancelar ou finalizar OPs filhas
        let finalizedChildrenNumbers = [];
        if (status === 'cancelada') {
            console.log(`[API OPs PUT] OP #${numero} está sendo cancelada. Marcando corte associado como 'excluido'...`);
            await dbClient.query(`UPDATE cortes SET status = 'excluido' WHERE op = $1`, [numero]);
        } else if (status === 'finalizado') {
            console.log(`[API OPs PUT] OP Mãe #${numero} está sendo finalizada. Verificando por OPs filhas...`);
            const textoBusca = `OP gerada em conjunto com a OP mãe #${numero}`;
            const filhasResult = await dbClient.query(
                `UPDATE ordens_de_producao 
                 SET status = 'finalizado', data_final = CURRENT_TIMESTAMP
                 WHERE observacoes = $1 AND status != 'finalizado'
                 RETURNING numero`,
                [textoBusca]
            );
            if (filhasResult.rowCount > 0) {
                finalizedChildrenNumbers = filhasResult.rows.map(r => r.numero);
                console.log(`[API OPs PUT] Sucesso! OPs filhas finalizadas: ${finalizedChildrenNumbers.join(', ')}`);
            }
        }
        
        // Query de atualização principal
        const queryText = `
            UPDATE ordens_de_producao
             SET numero = $1, 
                 produto_id = $2,
                 variante = $3, 
                 quantidade = $4, 
                 data_entrega = $5,
                 observacoes = $6, 
                 status = $7, 
                 etapas = $8, 
                 data_final = $9, 
                 data_atualizacao = CURRENT_TIMESTAMP
             WHERE edit_id = $10 RETURNING *`;
        
        const values = [
            opData.numero, 
            parseInt(produto_id), 
            opData.variante || null, 
            parseInt(opData.quantidade), 
            opData.data_entrega, 
            opData.observacoes || '', 
            status, 
            JSON.stringify(opData.etapas || []), 
            opData.data_final || null, 
            edit_id
        ];

        const result = await dbClient.query(queryText, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ordem de Produção não encontrada para atualização.' });
        }

        // Adiciona a informação das filhas finalizadas à resposta, se houver
        const opAtualizada = {
            ...result.rows[0],
            finalizedChildren: finalizedChildrenNumbers 
        };
        
        res.status(200).json(opAtualizada);

    } catch (error) {
        console.error('[router/ordens-de-producao PUT] Erro:', error);
        res.status(500).json({ error: 'Erro ao atualizar Ordem de Produção.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
        }
    }
});

export default router;