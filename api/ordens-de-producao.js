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

        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) {
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
        } else if (statusFilter) {
            whereClausesNew.push(`status = $${currentParamIdx++}`);
            dynamicParams.push(statusFilter);
        } else {
            whereClausesNew.push(`status IN ('em-aberto', 'produzindo')`);
        }

        if (searchTerm) {
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

        const result = await dbClient.query(queryText, queryParamsForData);

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

        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) { // Ou uma permissão mais específica como 'ver-detalhe-op'
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
        const { edit_id, numero, status } = opData;

        if (!edit_id) {
            return res.status(400).json({ error: 'O campo "edit_id" é obrigatório para atualização.' });
        }

        // --- LÓGICA DE PERMISSÃO CORRIGIDA ---
        let permissaoConcedida = false;
        if (status === 'cancelada' && permissoesCompletas.includes('cancelar-op')) {
            permissaoConcedida = true;
        } else if (status === 'finalizado' && permissoesCompletas.includes('finalizar-op')) {
            permissaoConcedida = true;
        } else if (permissoesCompletas.includes('editar-op')) {
            // Permissão genérica para qualquer outra mudança que não seja cancelar/finalizar
            permissaoConcedida = true;
        }

        if (!permissaoConcedida) {
            return res.status(403).json({ error: 'Permissão negada para realizar esta alteração na Ordem de Produção.' });
        }

        // --- LÓGICA DE CASCATA (CANCELAR OU FINALIZAR) ---
        let finalizedChildrenNumbers = [];

        if (status === 'cancelada') {
            console.log(`[API OPs PUT] OP #${numero} está sendo cancelada. Marcando corte associado como 'excluido'...`);
            // Procura o corte associado pelo número da OP e muda seu status.
            await dbClient.query(
                `UPDATE cortes SET status = 'excluido' WHERE op = $1`,
                [numero]
            );
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
            } else {
                console.log(`[API OPs PUT] Nenhuma OP filha encontrada para a OP #${numero}.`);
            }
        }
        
        // --- EXECUÇÃO DO UPDATE PRINCIPAL ---
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
                opData.numero, 
                opData.produto, 
                opData.variante || null, 
                opData.quantidade, 
                opData.data_entrega, 
                opData.observacoes || '', 
                opData.status, 
                JSON.stringify(opData.etapas || []), 
                opData.data_final || null, 
                edit_id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ordem de Produção não encontrada para atualização.' });
        }

        const opAtualizada = result.rows[0];

        // Adiciona a informação das filhas finalizadas à resposta
        res.status(200).json({
            ...opAtualizada,
            finalizedChildren: finalizedChildrenNumbers 
        });

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
        }
    }
});

export default router;