// api/usuarios.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// --- Sua função verificarToken (ou uma versão centralizada dela) ---
const verificarTokenOriginal = (reqOriginal) => {
    const token = reqOriginal.headers.authorization?.split(' ')[1];
    if (!token) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401;
        throw error;
    }
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};
// ---------------------------------------------------------------

// Middleware para este router
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/usuarios] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenOriginal(req);
        cliente = await pool.connect();
        req.dbCliente = cliente;
        next();
    } catch (error) {
        console.error('[router/usuarios] Erro no middleware:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// GET /api/usuarios/me
router.get('/me', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        const result = await dbCliente.query(
            'SELECT id, nome, nome_usuario, email, tipos, nivel, permissoes FROM usuarios WHERE id = $1',
            [usuarioLogado.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[router/usuarios/me] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar dados do usuário', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// GET /api/usuarios
router.get('/', async (req, res) => {
    const { dbCliente } = req;
    try {
        const result = await dbCliente.query('SELECT id, nome, nome_usuario, email, tipos, nivel, permissoes FROM usuarios ORDER BY nome ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/usuarios GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao listar usuários', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/usuarios
router.post('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        if (!usuarioLogado.permissoes.includes('acesso-cadastrar-usuarios')) { // <<< VERIFICAR SE ESSA É A PERMISSÃO CORRETA PARA CRIAR
            return res.status(403).json({ error: 'Permissão negada para criar usuários' });
        }
        const { nome, nomeUsuario, email, senha, tipos, nivel } = req.body;
        if (!nome || !nomeUsuario || !email || !senha || !tipos) {
            return res.status(400).json({ error: "Campos nome, nomeUsuario, email, senha e tipos são obrigatórios." });
        }
        const senhaHash = await bcrypt.hash(senha, 10);
        // Ao criar um novo usuário, geralmente não se define 'data_atualizacao'.
        // Se você tiver 'data_criacao', ela pode ser DEFAULT CURRENT_TIMESTAMP na tabela.
        const result = await dbCliente.query(
            'INSERT INTO usuarios (nome, nome_usuario, email, senha, tipos, nivel, permissoes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, nome, nome_usuario, email, tipos, nivel, permissoes',
            [nome, nomeUsuario, email, senhaHash, tipos, nivel || null, []] // Permissões iniciais vazias
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[router/usuarios POST] Erro:', error);
        if (error.code === '23505') {
             res.status(409).json({ error: 'Usuário ou email já cadastrado.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao criar usuário', details: error.message });
        }
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// PUT /api/usuarios (para atualizar um usuário por ID no corpo)
router.put('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        if (!usuarioLogado.permissoes.includes('editar-usuarios')) {
            return res.status(403).json({ error: 'Permissão negada para editar usuários' });
        }
        const { id, nome, nomeUsuario, email, tipos, nivel } = req.body;
        if (!id) {
            return res.status(400).json({ error: "O ID do usuário é obrigatório para atualização." });
        }

        const fieldsToUpdate = [];
        const values = [];
        let paramIndex = 1;

        if (nome !== undefined) { fieldsToUpdate.push(`nome = $${paramIndex++}`); values.push(nome); }
        if (nomeUsuario !== undefined) { fieldsToUpdate.push(`nome_usuario = $${paramIndex++}`); values.push(nomeUsuario); }
        if (email !== undefined) { fieldsToUpdate.push(`email = $${paramIndex++}`); values.push(email); }
        if (tipos !== undefined) { fieldsToUpdate.push(`tipos = $${paramIndex++}`); values.push(tipos); }
        if (nivel !== undefined) { fieldsToUpdate.push(`nivel = $${paramIndex++}`); values.push(nivel || null); }

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: "Nenhum campo fornecido para atualização." });
        }

        values.push(id);

        // MODIFICAÇÃO AQUI: Removido ", data_atualizacao = CURRENT_TIMESTAMP"
        const queryText = `UPDATE usuarios SET ${fieldsToUpdate.join(', ')} WHERE id = $${paramIndex} RETURNING id, nome, nome_usuario, email, tipos, nivel, permissoes`;

        const result = await dbCliente.query(queryText, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[router/usuarios PUT] Erro:', error);
         if (error.code === '23505') {
             res.status(409).json({ error: 'Nome de usuário ou email já em uso por outro usuário.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao atualizar usuário', details: error.message });
        }
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// PUT /api/usuarios/batch (atualizar permissões em lote)
router.put('/batch', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        if (!usuarioLogado.permissoes.includes('gerenciar-permissoes')) { // <<< VERIFICAR SE ESSA É A PERMISSÃO CORRETA
            return res.status(403).json({ error: 'Permissão negada para gerenciar permissões' });
        }
        const usuariosParaAtualizar = req.body;
        if (!Array.isArray(usuariosParaAtualizar) || usuariosParaAtualizar.length === 0) {
            return res.status(400).json({ error: 'Corpo da requisição inválido: esperado um array de usuários' });
        }

        await dbCliente.query('BEGIN');
        try {
            for (const usuario of usuariosParaAtualizar) {
                const { id, permissoes } = usuario;
                if (id === undefined || !Array.isArray(permissoes)) {
                    throw new Error('Formato inválido: id ou permissoes ausentes/inválidos para um dos usuários.');
                }
                // MODIFICAÇÃO AQUI: Removido ", data_atualizacao = CURRENT_TIMESTAMP"
                await dbCliente.query(
                    'UPDATE usuarios SET permissoes = $1 WHERE id = $2',
                    [permissoes, id]
                );
            }
            await dbCliente.query('COMMIT');
            res.status(200).json({ message: 'Permissões atualizadas com sucesso' });
        } catch (transactionError) {
            await dbCliente.query('ROLLBACK');
            console.error('[router/usuarios/batch] Erro na transação:', transactionError);
            const message = transactionError.message.startsWith('Formato inválido:') ? transactionError.message : 'Erro ao salvar permissões durante a transação.';
            // Retornando o erro original do banco se ele existir e for relevante (como o column does not exist)
            const details = transactionError.message; // Mantém a mensagem original do erro do banco.
            res.status(400).json({ error: message, details: details });
        }
    } catch (error) {
        console.error('[router/usuarios/batch] Erro geral:', error);
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// DELETE /api/usuarios (ID no corpo)
router.delete('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        if (!usuarioLogado.permissoes.includes('excluir-usuarios')) { // <<< VERIFICAR SE ESSA É A PERMISSÃO CORRETA
            return res.status(403).json({ error: 'Permissão negada para excluir usuários' });
        }
        const { id } = req.body;
        if (!id) {
             return res.status(400).json({ error: 'ID do usuário é obrigatório para exclusão.' });
        }
        const result = await dbCliente.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        res.status(200).json({ message: 'Usuário excluído com sucesso.', id: result.rows[0].id });
    } catch (error) {
        console.error('[router/usuarios DELETE] Erro:', error);
        res.status(500).json({ error: 'Erro ao excluir usuário', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;