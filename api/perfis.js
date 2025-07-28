// api/perfis.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação
router.use(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação ausente.' });
        }
        const token = authHeader.split(' ')[1];
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
});

// Rota GET /api/perfis/meu-perfil - Busca todos os dados do perfil do usuário logado
router.get('/meu-perfil', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;

    try {
        dbClient = await pool.connect();

        // Query 1: Busca os dados básicos e o badge em destaque
        const usuarioQuery = `
            SELECT id, nome, email, nivel, avatar_url, badge_destaque_id 
            FROM usuarios WHERE id = $1;
        `;
        const usuarioResult = await dbClient.query(usuarioQuery, [usuarioId]);
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        const perfil = usuarioResult.rows[0];

        // Query 2: Busca TODAS as conquistas disponíveis no sistema
        const todasConquistasResult = await dbClient.query('SELECT * FROM conquistas ORDER BY categoria, nome;');
        const todasConquistas = todasConquistasResult.rows;

        // Query 3: Busca apenas as conquistas que o usuário DESBLOQUEOU
        const conquistasUsuarioResult = await dbClient.query(
        'SELECT id_conquista, data_desbloqueio FROM usuario_conquistas WHERE id_usuario = $1;', 
        [usuarioId]
        );

        // Crie um Map para fácil acesso à data
        const conquistasDesbloqueadasMap = new Map(
            conquistasUsuarioResult.rows.map(r => [r.id_conquista, r.data_desbloqueio])
        );
        
        // Combina as informações: adiciona um campo 'desbloqueada: true/false' a cada conquista
        perfil.conquistas = todasConquistas.map(conquista => ({
            ...conquista,
            desbloqueada: conquistasDesbloqueadasMap.has(conquista.id),
            data_desbloqueio: conquistasDesbloqueadasMap.get(conquista.id) || null
        }));

        res.status(200).json(perfil);

    } catch (error) {
        console.error('[API GET /meu-perfil] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao buscar dados do perfil.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;