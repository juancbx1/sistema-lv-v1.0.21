// api/comunicacoes.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Assumindo que o caminho está correto

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

// ==========================================================
// ROTAS - ORDEM CORRIGIDA
// ==========================================================

// Rota 1: GET /admin (Específica, vem primeiro)
router.get('/admin', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('gerenciar-comunicacoes')) {
            return res.status(403).json({ error: 'Permissão negada para acessar esta lista.' });
        }
        const queryText = `
            SELECT c.*, u.nome as nome_autor
            FROM comunicacoes c
            JOIN usuarios u ON c.id_autor = u.id
            WHERE c.tipo_post = 'Mural Geral'
            ORDER BY c.is_fixado DESC, c.data_criacao DESC;
        `;
        const result = await dbClient.query(queryText);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API GET /api/comunicacoes/admin] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao buscar comunicados do mural.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota 2: GET / (Geral)
router.get('/', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;

    try {
        dbClient = await pool.connect();

        const queryText = `
            SELECT 
                c.*,
                u.nome as nome_autor,
                EXISTS (
                    SELECT 1 FROM comunicacoes_lidos cl 
                    WHERE cl.id_comunicacao = c.id AND cl.id_usuario = $1
                ) as lido,
                (
                    SELECT COUNT(*) 
                    FROM comunicacao_reacoes cr 
                    WHERE cr.id_comunicacao = c.id AND cr.tipo_reacao = 'like'
                )::int as total_likes,
                EXISTS (
                    SELECT 1 FROM comunicacao_reacoes cr
                    WHERE cr.id_comunicacao = c.id AND cr.id_usuario = $1 AND cr.tipo_reacao = 'like'
                ) as usuario_curtiu,
                
                -- NOVA SUBQUERY PARA CONTAR COMENTÁRIOS --
                (
                    SELECT COUNT(*)
                    FROM comunicacao_comentarios cc
                    WHERE cc.id_comunicacao_pai = c.id
                )::int as total_comentarios

            FROM 
                comunicacoes c
            JOIN 
                usuarios u ON c.id_autor = u.id
            WHERE
                c.tipo_post = 'Mural Geral'
                OR
                (c.tipo_post IN ('Ponto de Atenção', 'Resposta Supervisor') AND c.id_autor = $1)
                OR
                (c.tipo_post = 'Resposta Supervisor' AND c.destinatario_id = $1)
            ORDER BY
                c.is_fixado DESC, c.data_criacao DESC;
        `;

        const result = await dbClient.query(queryText, [usuarioId]);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API GET /api/comunicacoes] Erro na rota:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar comunicações.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// Rota 3: POST / (Geral)
router.post('/', async (req, res) => {
    const { id: autorId } = req.usuarioLogado;
    let dbClient;
    try {
        const { titulo, conteudo, is_fixado, tipo_post, imagem_url } = req.body;
        if (!titulo || !conteudo) {
            return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
        }
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, autorId);
        let tipoPostFinal = (tipo_post === 'Mural Geral' && permissoes.includes('gerenciar-comunicacoes')) 
                          ? 'Mural Geral' 
                          : 'Ponto de Atenção';
        const queryText = `
            INSERT INTO comunicacoes (titulo, conteudo, id_autor, tipo_post, is_fixado, imagem_url)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
        const values = [titulo, conteudo, autorId, tipoPostFinal, is_fixado || false, imagem_url || null];
        const result = await dbClient.query(queryText, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API POST /api/comunicacoes] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao criar comunicação.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota 4: POST /:id/marcar-como-lido (Com parâmetro)
router.post('/:id/marcar-como-lido', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    const { id: comunicacaoId } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const queryText = `
            INSERT INTO comunicacoes_lidos (id_comunicacao, id_usuario)
            VALUES ($1, $2) ON CONFLICT (id_comunicacao, id_usuario) DO NOTHING;
        `;
        await dbClient.query(queryText, [comunicacaoId, usuarioId]);
        res.status(200).json({ message: 'Comunicação marcada como lida.' });
    } catch (error) {
        console.error('[API POST /:id/marcar-como-lido] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao marcar comunicação como lida.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/:id/reagir', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    const { id: comunicacaoId } = req.params;
    const { tipo_reacao = 'like' } = req.body; // Default para 'like'
    let dbClient;

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        // 1. Tenta deletar uma reação existente (processo de "unlike")
        const deleteResult = await dbClient.query(
            `DELETE FROM comunicacao_reacoes 
             WHERE id_comunicacao = $1 AND id_usuario = $2 AND tipo_reacao = $3`,
            [comunicacaoId, usuarioId, tipo_reacao]
        );

        // 2. Se nada foi deletado, significa que o usuário não tinha reagido. Então, insere a reação.
        if (deleteResult.rowCount === 0) {
            await dbClient.query(
                `INSERT INTO comunicacao_reacoes (id_comunicacao, id_usuario, tipo_reacao) 
                 VALUES ($1, $2, $3)`,
                [comunicacaoId, usuarioId, tipo_reacao]
            );
        }

        // 3. Após a ação (like ou unlike), conta o novo total de likes para retornar ao frontend.
        const countResult = await dbClient.query(
            `SELECT COUNT(*) FROM comunicacao_reacoes WHERE id_comunicacao = $1 AND tipo_reacao = $2`,
            [comunicacaoId, tipo_reacao]
        );
        const novoTotalLikes = parseInt(countResult.rows[0].count, 10);

        await dbClient.query('COMMIT');

        res.status(200).json({
            message: 'Reação processada.',
            total_likes: novoTotalLikes
        });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API POST /:id/reagir] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao processar reação.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota para BUSCAR comentários de um post
router.get('/:id/comentarios', async (req, res) => {
    const { id: comunicacaoId } = req.params;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const queryText = `
            SELECT 
                cc.*,
                u.nome as nome_autor,
                u.avatar_url
            FROM 
                comunicacao_comentarios cc
            JOIN 
                usuarios u ON cc.id_autor = u.id
            WHERE 
                cc.id_comunicacao_pai = $1
            ORDER BY 
                cc.data_criacao ASC;
        `;
        const result = await dbClient.query(queryText, [comunicacaoId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API GET /:id/comentarios] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar comentários.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});



// Rota para ADICIONAR um comentário a um post
router.post('/:id/comentarios', async (req, res) => {
    const { id: autorId } = req.usuarioLogado;
    const { id: comunicacaoId } = req.params;
    const { conteudo } = req.body;
    let dbClient;

    if (!conteudo || conteudo.trim() === '') {
        return res.status(400).json({ error: 'O conteúdo do comentário não pode ser vazio.' });
    }

    try {
        dbClient = await pool.connect();
        const queryText = `
            INSERT INTO comunicacao_comentarios (id_comunicacao_pai, id_autor, conteudo)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const result = await dbClient.query(queryText, [comunicacaoId, autorId, conteudo]);
        
        // Para uma resposta mais rica, buscamos os dados do autor recém-inserido
        const comentarioCompletoQuery = `
            SELECT cc.*, u.nome as nome_autor, u.avatar_url
            FROM comunicacao_comentarios cc
            JOIN usuarios u ON cc.id_autor = u.id
            WHERE cc.id = $1;
        `;
        const comentarioCompletoResult = await dbClient.query(comentarioCompletoQuery, [result.rows[0].id]);
        
        res.status(201).json(comentarioCompletoResult.rows[0]);
    } catch (error) {
        console.error('[API POST /:id/comentarios] Erro:', error);
        res.status(500).json({ error: 'Erro ao postar comentário.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota para EDITAR um comentário
router.put('/comentarios/:id_comentario', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    const { id_comentario } = req.params;
    const { conteudo } = req.body;
    let dbClient;

    if (!conteudo || conteudo.trim() === '') {
        return res.status(400).json({ error: 'O conteúdo do comentário não pode ser vazio.' });
    }

    try {
        dbClient = await pool.connect();
        
        // Verifica se o comentário existe e se pertence ao usuário que está tentando editar
        const checkResult = await dbClient.query(
            `SELECT id_autor FROM comunicacao_comentarios WHERE id = $1`, 
            [id_comentario]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Comentário não encontrado.' });
        }

        if (checkResult.rows[0].id_autor !== usuarioId) {
            // Aqui você poderia permitir que admins/supervisores editem, se quisesse.
            // Por enquanto, apenas o próprio autor pode editar.
            return res.status(403).json({ error: 'Você não tem permissão para editar este comentário.' });
        }
        
        // Atualiza o comentário
        const updateResult = await dbClient.query(
            `UPDATE comunicacao_comentarios SET conteudo = $1, data_criacao = CURRENT_TIMESTAMP 
             WHERE id = $2 RETURNING *`,
            [conteudo, id_comentario]
        );
        
        res.status(200).json(updateResult.rows[0]);

    } catch (error) {
        console.error('[API PUT /comentarios/:id_comentario] Erro:', error);
        res.status(500).json({ error: 'Erro ao editar comentário.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota 5: DELETE /:id (Com parâmetro)
router.delete('/:id', async (req, res) => {
    const { usuarioLogado } = req;
    const { id: comunicacaoId } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('gerenciar-comunicacoes')) {
            return res.status(403).json({ error: 'Permissão negada para excluir comunicados.' });
        }
        const deleteResult = await dbClient.query('DELETE FROM comunicacoes WHERE id = $1 RETURNING *', [comunicacaoId]);
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: 'Comunicado não encontrado para exclusão.' });
        }
        res.status(200).json({ message: 'Comunicado excluído com sucesso.', comunicado: deleteResult.rows[0] });
    } catch (error) {
        console.error('[API DELETE /api/comunicacoes/:id] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao excluir o comunicado.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;