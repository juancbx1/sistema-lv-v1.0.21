// api/avatares.js
import express from 'express';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function getToken(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;
    return authHeader.split(' ')[1];
}

// ROTA 1: GET /api/avatares - Buscar todos os avatares do usuário logado
router.get('/', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Acesso não autorizado' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        const { rows: avatares } = await sql`
            SELECT id, url_blob, ativo FROM avatares_usuarios
            WHERE id_usuario = ${userId}
            ORDER BY data_criacao DESC;
        `;
        res.status(200).json(avatares);
    } catch (error) {
        console.error('Erro ao buscar avatares:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// ROTA 2: POST /api/avatares/upload - Fazer upload de um novo avatar
router.post('/upload', upload.single('foto'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo recebido.' });

    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Acesso não autorizado' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        // Verificar limite de 3 avatares
        const { rowCount } = await sql`SELECT id FROM avatares_usuarios WHERE id_usuario = ${userId};`;
        if (rowCount >= 3) {
            return res.status(403).json({ error: 'Limite de 3 avatares atingido. Exclua um para adicionar outro.' });
        }

        // Upload para o Vercel Blob
        const file = req.file;
        const blob = await put(
            `avatares/usuario-${userId}-${Date.now()}.jpg`,
            file.buffer,
            { access: 'public', contentType: file.mimetype }
        );

        // Inserir no banco de dados
        const { rows: [novoAvatar] } = await sql`
            INSERT INTO avatares_usuarios (id_usuario, url_blob)
            VALUES (${userId}, ${blob.url})
            RETURNING id, url_blob, ativo;
        `;
        
        res.status(201).json(novoAvatar);
    } catch (error) {
        console.error('Erro no upload do avatar:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// ROTA 3: PUT /api/avatares/definir-ativo/:id - Definir um avatar como ativo
router.put('/definir-ativo/:id', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Acesso não autorizado' });

    const { id: avatarId } = req.params;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        // Transação: garantir que as duas operações (ou nenhuma) aconteçam
        await sql.query('BEGIN');
        // 1. Desativar todos os avatares do usuário
        await sql`UPDATE avatares_usuarios SET ativo = FALSE WHERE id_usuario = ${userId};`;
        // 2. Ativar o avatar escolhido
        const { rows: [avatarAtivo] } = await sql`
            UPDATE avatares_usuarios SET ativo = TRUE
            WHERE id = ${avatarId} AND id_usuario = ${userId}
            RETURNING url_blob;
        `;
        await sql.query('COMMIT');

        if (!avatarAtivo) {
             await sql.query('ROLLBACK');
             return res.status(404).json({ error: 'Avatar não encontrado ou não pertence a este usuário.' });
        }

        // 3. Atualizar a coluna principal na tabela de usuários para acesso rápido
        await sql`UPDATE usuarios SET avatar_url = ${avatarAtivo.url_blob} WHERE id = ${userId};`;
        
        res.status(200).json({ success: true, newAvatarUrl: avatarAtivo.url_blob });

    } catch (error) {
        await sql.query('ROLLBACK');
        console.error('Erro ao definir avatar ativo:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// ROTA 4: DELETE /api/avatares/:id - Excluir um avatar (VERSÃO CORRIGIDA)
router.delete('/:id', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Acesso não autorizado' });

    const { id: avatarId } = req.params;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
        let avatarUrlCleared = false;

        // Buscar os dados do avatar para garantir que pertence ao usuário e pegar a URL
        const { rows: [avatarParaExcluir] } = await sql`
            SELECT url_blob, ativo FROM avatares_usuarios
            WHERE id = ${avatarId} AND id_usuario = ${userId};
        `;

        if (!avatarParaExcluir) {
            return res.status(404).json({ error: 'Avatar não encontrado ou não pertence a este usuário.' });
        }

        // --- LÓGICA CORRIGIDA ---
        // Se o avatar a ser excluído for o ativo, limpa a referência na tabela de usuários.
        if (avatarParaExcluir.ativo) {
            await sql`UPDATE usuarios SET avatar_url = NULL WHERE id = ${userId};`;
            avatarUrlCleared = true;
        }

        // Excluir do Vercel Blob
        await del(avatarParaExcluir.url_blob);

        // Excluir do banco de dados (tabela de avatares)
        await sql`DELETE FROM avatares_usuarios WHERE id = ${avatarId};`;
        
        res.status(200).json({ success: true, avatarUrlCleared: avatarUrlCleared });

    } catch (error) {
        console.error('Erro ao excluir avatar:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

export default router;