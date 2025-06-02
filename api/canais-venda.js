// api/canais-venda.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : undefined,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação e permissão
router.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token mal formatado' });
    
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.usuarioLogado = decoded;

        const dbClient = await pool.connect();
        try {
            const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
            if (!permissoesUsuario.includes('gerenciar-precificacao')) { // Reutilizando permissão
                return res.status(403).json({ error: 'Permissão negada para gerenciar canais de venda.' });
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

// GET /api/canais-venda - Listar todos os canais ativos
router.get('/', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM canais_venda_config WHERE ativo = TRUE ORDER BY nome_canal ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/canais-venda GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar canais de venda', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/canais-venda/todas - Listar TODOS os canais (incluindo inativos)
router.get('/todas', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM canais_venda_config ORDER BY ativo DESC, nome_canal ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/canais-venda GET /todas] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar todos os canais de venda', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/canais-venda - Criar novo canal de venda
router.post('/', async (req, res) => {
    const { 
        nome_canal, 
        taxa_percentual, 
        taxa_fixa, 
        taxa_adicional_percentual, 
        ativo 
    } = req.body;

    if (!nome_canal) {
        return res.status(400).json({ error: 'Nome do canal é obrigatório.' });
    }
    // Validações numéricas (devem ser entre 0 e 1 para percentuais, e >= 0 para fixas)
    if (taxa_percentual !== undefined && (isNaN(parseFloat(taxa_percentual)) || parseFloat(taxa_percentual) < 0 || parseFloat(taxa_percentual) > 1)) {
        return res.status(400).json({ error: 'Taxa percentual deve ser um número entre 0 e 1 (ex: 0.22 para 22%).' });
    }
    if (taxa_fixa !== undefined && (isNaN(parseFloat(taxa_fixa)) || parseFloat(taxa_fixa) < 0)) {
        return res.status(400).json({ error: 'Taxa fixa deve ser um número não negativo.' });
    }
    if (taxa_adicional_percentual !== undefined && (isNaN(parseFloat(taxa_adicional_percentual)) || parseFloat(taxa_adicional_percentual) < 0 || parseFloat(taxa_adicional_percentual) > 1)) {
        return res.status(400).json({ error: 'Taxa adicional percentual deve ser um número entre 0 e 1.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO canais_venda_config 
                (nome_canal, taxa_percentual, taxa_fixa, taxa_adicional_percentual, ativo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const values = [
            nome_canal,
            parseFloat(taxa_percentual || 0),
            parseFloat(taxa_fixa || 0),
            parseFloat(taxa_adicional_percentual || 0),
            ativo === undefined ? true : Boolean(ativo)
        ];
        const result = await dbClient.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API/canais-venda POST] Erro:', error);
        if (error.code === '23505') { // Unique violation (nome_canal)
            res.status(409).json({ error: 'Já existe um canal de venda com este nome.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao criar canal de venda', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/canais-venda/:id - Atualizar canal de venda
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        nome_canal, 
        taxa_percentual, 
        taxa_fixa, 
        taxa_adicional_percentual, 
        ativo 
    } = req.body;

    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
    }
    // Validações similares ao POST para os campos que podem ser atualizados
    if (taxa_percentual !== undefined && (isNaN(parseFloat(taxa_percentual)) || parseFloat(taxa_percentual) < 0 || parseFloat(taxa_percentual) > 1)) {
        return res.status(400).json({ error: 'Taxa percentual deve ser um número entre 0 e 1.' });
    }
    if (taxa_fixa !== undefined && (isNaN(parseFloat(taxa_fixa)) || parseFloat(taxa_fixa) < 0)) {
        return res.status(400).json({ error: 'Taxa fixa deve ser um número não negativo.' });
    }
    if (taxa_adicional_percentual !== undefined && (isNaN(parseFloat(taxa_adicional_percentual)) || parseFloat(taxa_adicional_percentual) < 0 || parseFloat(taxa_adicional_percentual) > 1)) {
        return res.status(400).json({ error: 'Taxa adicional percentual deve ser um número entre 0 e 1.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (nome_canal !== undefined) { fields.push(`nome_canal = $${paramCount++}`); values.push(nome_canal); }
        if (taxa_percentual !== undefined) { fields.push(`taxa_percentual = $${paramCount++}`); values.push(parseFloat(taxa_percentual)); }
        if (taxa_fixa !== undefined) { fields.push(`taxa_fixa = $${paramCount++}`); values.push(parseFloat(taxa_fixa)); }
        if (taxa_adicional_percentual !== undefined) { fields.push(`taxa_adicional_percentual = $${paramCount++}`); values.push(parseFloat(taxa_adicional_percentual)); }
        if (ativo !== undefined) { fields.push(`ativo = $${paramCount++}`); values.push(Boolean(ativo)); }
        
        if (fields.length === 0) {
             return res.status(400).json({ error: "Nenhum campo válido fornecido para atualização." });
        }

        values.push(parseInt(id));
        const query = `
            UPDATE canais_venda_config
            SET ${fields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *;
        `;
        
        const result = await dbClient.query(query, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Canal de venda não encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[API/canais-venda PUT] Erro:', error);
        if (error.code === '23505') { 
            res.status(409).json({ error: 'Já existe um canal de venda com este nome.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao atualizar canal de venda', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/canais-venda/:id - Desativar canal de venda (soft delete)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query(
            'UPDATE canais_venda_config SET ativo = false, atualizado_em = NOW() WHERE id = $1 RETURNING *;', 
            [parseInt(id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Canal de venda não encontrado para desativar.' });
        }
        res.status(200).json({ message: 'Canal de venda desativado com sucesso.', itemDesativado: result.rows[0] });
    } catch (error) {
        console.error('[API/canais-venda DELETE/DESATIVAR] Erro:', error);
        // A constraint ON DELETE CASCADE na tabela produto_precificacao_configs fará com que as precificações
        // associadas a este canal sejam deletadas se você fizer um DELETE físico.
        // Com soft delete (ativo=false), as precificações permanecem, mas você precisaria filtrar por canal ativo no frontend.
        res.status(500).json({ error: 'Erro ao desativar canal de venda', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;