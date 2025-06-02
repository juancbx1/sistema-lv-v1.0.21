// api/materias-primas.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Certifique-se que o caminho está correto

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : undefined,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação e permissão base para este router
router.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token mal formatado' });
    }
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.usuarioLogado = decoded; // Anexa o payload do token (incluindo id do usuário) à requisição

        // Verificação de permissão básica para acessar qualquer rota de matérias-primas
        // Você pode querer permissões mais granulares (ver, criar, editar, excluir) depois
        const dbClient = await pool.connect();
        try {
            const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
            // Crie uma permissão como 'gerenciar-materias-primas' ou 'acesso-precificacao'
            if (!permissoesUsuario.includes('gerenciar-precificacao')) { // Exemplo de permissão
                return res.status(403).json({ error: 'Permissão negada para gerenciar matérias-primas.' });
            }
            next();
        } finally {
            dbClient.release();
        }
    } catch (err) {
        let message = 'Token inválido ou expirado';
        if (err.name === 'TokenExpiredError') message = 'Token expirado';
        return res.status(401).json({ error: message, details: err.name });
    }
});

// GET /api/materias-primas - Listar todas as matérias-primas
router.get('/', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM materias_primas ORDER BY nome ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/materias-primas GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar matérias-primas', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/materias-primas - Criar nova matéria-prima
router.post('/', async (req, res) => {
    const { nome, unidade_medida, preco_por_unidade, observacoes } = req.body;
    if (!nome || !preco_por_unidade) {
        return res.status(400).json({ error: 'Nome e preço por unidade são obrigatórios.' });
    }
    if (isNaN(parseFloat(preco_por_unidade)) || parseFloat(preco_por_unidade) < 0) {
        return res.status(400).json({ error: 'Preço por unidade deve ser um número não negativo.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO materias_primas (nome, unidade_medida, preco_por_unidade, observacoes)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const values = [nome, unidade_medida || null, parseFloat(preco_por_unidade), observacoes || null];
        const result = await dbClient.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API/materias-primas POST] Erro:', error);
        if (error.code === '23505') { // Unique violation (nome da matéria-prima)
            res.status(409).json({ error: 'Matéria-prima com este nome já existe.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao criar matéria-prima', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/materias-primas/:id - Atualizar matéria-prima existente
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, unidade_medida, preco_por_unidade, observacoes } = req.body;

    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
    }
    if (!nome && !unidade_medida && preco_por_unidade === undefined && !observacoes) {
        return res.status(400).json({ error: 'Nenhum campo fornecido para atualização.' });
    }
    if (preco_por_unidade !== undefined && (isNaN(parseFloat(preco_por_unidade)) || parseFloat(preco_por_unidade) < 0)) {
        return res.status(400).json({ error: 'Preço por unidade deve ser um número não negativo, se fornecido.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        // Construir a query de update dinamicamente (melhor para não sobrescrever com null se não enviado)
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (nome !== undefined) { fields.push(`nome = $${paramCount++}`); values.push(nome); }
        if (unidade_medida !== undefined) { fields.push(`unidade_medida = $${paramCount++}`); values.push(unidade_medida); }
        if (preco_por_unidade !== undefined) { fields.push(`preco_por_unidade = $${paramCount++}`); values.push(parseFloat(preco_por_unidade)); }
        if (observacoes !== undefined) { fields.push(`observacoes = $${paramCount++}`); values.push(observacoes); }
        
        if (fields.length === 0) { // Dupla verificação, já feita acima, mas bom ter
             return res.status(400).json({ error: "Nenhum campo válido fornecido para atualização." });
        }
        // 'atualizado_em' será atualizado pelo trigger

        values.push(parseInt(id)); // Adiciona o ID para a cláusula WHERE
        const query = `
            UPDATE materias_primas
            SET ${fields.join(', ')} 
            WHERE id = $${paramCount}
            RETURNING *;
        `;
        
        const result = await dbClient.query(query, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Matéria-prima não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[API/materias-primas PUT] Erro:', error);
        if (error.code === '23505') { // Unique violation (nome)
            res.status(409).json({ error: 'Já existe uma matéria-prima com este nome.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao atualizar matéria-prima', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/materias-primas/:id - Deletar matéria-prima
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('DELETE FROM materias_primas WHERE id = $1 RETURNING *;', [parseInt(id)]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Matéria-prima não encontrada para exclusão.' });
        }
        res.status(200).json({ message: 'Matéria-prima excluída com sucesso.', deletedItem: result.rows[0] });
    } catch (error) {
        console.error('[API/materias-primas DELETE] Erro:', error);
        if (error.code === '23503') { // Foreign key violation
             res.status(409).json({ error: 'Não é possível excluir. Esta matéria-prima está sendo usada na composição de um ou mais produtos.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao excluir matéria-prima', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;