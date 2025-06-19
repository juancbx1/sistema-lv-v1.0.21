// api/producao-promessas.js
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

// Middleware de Autenticação
router.use(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) throw new Error('Token não fornecido');
        const token = authHeader.split(' ')[1];
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
});

// GET /api/producao-promessas -> Busca todas as promessas ativas
router.get('/', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        // Busca apenas as promessas que ainda não expiraram
        const result = await dbClient.query('SELECT * FROM producao_promessas WHERE data_expiracao > NOW()');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API GET /producao-promessas] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar promessas de produção.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/producao-promessas -> Cria uma nova promessa
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { produto_ref_id } = req.body;

    if (!produto_ref_id) {
        return res.status(400).json({ error: 'O produto_ref_id é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoes.includes('gerenciar-fila-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada para iniciar produção.' });
        }

        // Calcula a data de expiração (4 horas a partir de agora)
        const dataExpiracao = new Date(Date.now() + 4 * 60 * 60 * 1000);

        const query = `
            INSERT INTO producao_promessas (produto_ref_id, data_expiracao, usuario_id, usuario_nome)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (produto_ref_id) DO UPDATE SET
                data_promessa = NOW(),
                data_expiracao = EXCLUDED.data_expiracao,
                usuario_id = EXCLUDED.usuario_id,
                usuario_nome = EXCLUDED.usuario_nome
            RETURNING *;
        `;
        const values = [produto_ref_id, dataExpiracao, usuarioLogado.id, (usuarioLogado.nome || usuarioLogado.nome_usuario)];
        const result = await dbClient.query(query, values);

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API POST /producao-promessas] Erro:', error);
        res.status(500).json({ error: 'Erro ao criar promessa de produção.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/producao-promessas/:id -> Anula/deleta uma promessa
router.delete('/:id', async (req, res) => {
    const { usuarioLogado } = req;
    const { id } = req.params;

    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoes.includes('anular-promessa-producao')) {
            return res.status(403).json({ error: 'Permissão negada para anular promessas.' });
        }

        const result = await dbClient.query('DELETE FROM producao_promessas WHERE id = $1', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Promessa não encontrada ou já anulada.' });
        }

        res.status(200).json({ message: 'Promessa anulada com sucesso.' });

    } catch (error) {
        console.error(`[API DELETE /producao-promessas/${id}] Erro:`, error);
        res.status(500).json({ error: 'Erro ao anular a promessa.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;