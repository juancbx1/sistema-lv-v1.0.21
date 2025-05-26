// api/configuracao-pontos.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importar a função de buscar permissões completas
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Verifique o caminho

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC', // Adicionado
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarToken (mantenha ou centralize)
const verificarToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error('Token não fornecido');
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('Token mal formatado');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // console.log('[api/config-pontos - verificarToken] Token decodificado:', decoded);
        return decoded;
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
router.use(async (req, res, next) => {
    try {
        // console.log(`[router/configuracao-pontos MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarToken(req);
        next();
    } catch (error) {
        console.error('[router/configuracao-pontos MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// GET /api/configuracao-pontos/padrao
router.get('/padrao', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        if (!permissoesCompletas.includes('acesso-ponto-por-processo')) {
            return res.status(403).json({ error: 'Permissão negada para acessar configurações de pontos.' });
        }
        
        const { produto_nome, processo_nome } = req.query;
        let query = 'SELECT id, produto_nome, processo_nome, pontos_padrao, ativo FROM configuracoes_pontos_processos';
        const queryParams = [];
        const conditions = [];
        let paramIndex = 1; // Inicia o contador de parâmetros para esta query

        if (produto_nome) {
            queryParams.push(`%${produto_nome}%`); // Adiciona % para ILIKE
            conditions.push(`produto_nome ILIKE $${paramIndex++}`);
        }
        if (processo_nome) {
            queryParams.push(`%${processo_nome}%`); // Adiciona % para ILIKE
            conditions.push(`processo_nome ILIKE $${paramIndex++}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY produto_nome, processo_nome';

        const result = await dbCliente.query(query, queryParams);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API GET /configuracao-pontos/padrao] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/configuracao-pontos/padrao
router.post('/padrao', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        if (!permissoesCompletas.includes('acesso-ponto-por-processo')) { // Ou uma permissão mais específica como 'editar-ponto-por-processo'
            return res.status(403).json({ error: 'Permissão negada para criar/atualizar configuração de pontos.' });
        }

        const { produto_nome, processo_nome, pontos_padrao } = req.body;
        if (!produto_nome || !processo_nome || pontos_padrao === undefined || pontos_padrao === null) {
            return res.status(400).json({ error: 'Campos produto_nome, processo_nome e pontos_padrao são obrigatórios.' });
        }
        const pontosFloat = parseFloat(pontos_padrao);
        if (isNaN(pontosFloat) || pontosFloat <= 0) {
            return res.status(400).json({ error: 'pontos_padrao deve ser um número positivo.' });
        }

        const result = await dbCliente.query(
            `INSERT INTO configuracoes_pontos_processos (produto_nome, processo_nome, pontos_padrao, ativo, data_criacao, data_atualizacao)
             VALUES ($1, $2, $3, TRUE, NOW(), NOW())
             ON CONFLICT (produto_nome, processo_nome)
             DO UPDATE SET pontos_padrao = EXCLUDED.pontos_padrao, ativo = TRUE, data_atualizacao = CURRENT_TIMESTAMP
             RETURNING id, produto_nome, processo_nome, pontos_padrao, ativo;`,
            [produto_nome, processo_nome, pontosFloat]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API POST /configuracao-pontos/padrao] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        const statusCode = error.statusCode || (error.code === '23505' ? 409 : 500);
        const errorMessage = error.code === '23505' ? 'Erro de conflito: Já existe uma configuração para este produto e processo.' : error.message;
        res.status(statusCode).json({ error: errorMessage, details: error.detail });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// PUT /api/configuracao-pontos/padrao/:id
router.put('/padrao/:id', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        if (!permissoesCompletas.includes('acesso-ponto-por-processo')) { // Ou 'editar-ponto-por-processo'
            return res.status(403).json({ error: 'Permissão negada para atualizar configuração de pontos.' });
        }

        const configId = parseInt(req.params.id, 10);
        const { pontos_padrao, ativo } = req.body;

        if (isNaN(configId)) {
            return res.status(400).json({ error: 'ID inválido fornecido na URL.' });
        }
        if (pontos_padrao === undefined && ativo === undefined) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar fornecido (pontos_padrao ou ativo).' });
        }
        if (pontos_padrao !== undefined && (isNaN(parseFloat(pontos_padrao)) || parseFloat(pontos_padrao) <= 0)) {
            return res.status(400).json({ error: 'Se fornecido, pontos_padrao deve ser um número positivo.' });
        }
        if (ativo !== undefined && typeof ativo !== 'boolean') {
            return res.status(400).json({ error: 'Se fornecido, ativo deve ser um booleano (true ou false).' });
        }

        const fieldsToUpdate = [];
        const values = []; // Primeiro valor será o ID para o WHERE
        let paramIndex = 1;

        if (pontos_padrao !== undefined) {
            fieldsToUpdate.push(`pontos_padrao = $${paramIndex++}`);
            values.push(parseFloat(pontos_padrao));
        }
        if (ativo !== undefined) {
            fieldsToUpdate.push(`ativo = $${paramIndex++}`);
            values.push(ativo);
        }
        
        values.push(configId); // Adiciona o ID ao final para a cláusula WHERE
        const queryText = `UPDATE configuracoes_pontos_processos SET ${fieldsToUpdate.join(', ')}, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *;`;
        
        const result = await dbCliente.query(queryText, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Configuração de pontos padrão não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[API PUT /configuracao-pontos/padrao/:id] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// DELETE /api/configuracao-pontos/padrao/:id
router.delete('/padrao/:id', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        if (!permissoesCompletas.includes('acesso-ponto-por-processo')) { // Ou 'excluir-ponto-por-processo'
            return res.status(403).json({ error: 'Permissão negada para excluir configuração de pontos.' });
        }

        const configId = parseInt(req.params.id, 10);
        if (isNaN(configId)) {
            return res.status(400).json({ error: 'ID inválido fornecido na URL.' });
        }
        const result = await dbCliente.query(
            'DELETE FROM configuracoes_pontos_processos WHERE id = $1 RETURNING *;',
            [configId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Configuração de pontos padrão não encontrada.' });
        }
        res.status(200).json({ message: 'Configuração de pontos padrão excluída com sucesso.', deletedItem: result.rows[0] });
    } catch (error) {
        console.error('[API DELETE /configuracao-pontos/padrao/:id] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;