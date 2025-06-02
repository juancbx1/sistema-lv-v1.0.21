// api/despesas-operacionais.js
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
                return res.status(403).json({ error: 'Permissão negada para gerenciar despesas operacionais.' });
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

// GET /api/despesas-operacionais - Listar todas as despesas
router.get('/', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        // Adicionado filtro para 'ativo = TRUE' e ordenação
        const result = await dbClient.query('SELECT * FROM despesas_operacionais WHERE ativo = TRUE ORDER BY tipo ASC, descricao ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/despesas-operacionais GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar despesas operacionais', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/despesas-operacionais/todas - Listar TODAS as despesas (incluindo inativas)
// (Opcional: criar uma rota separada se precisar ver as inativas em algum lugar)
router.get('/todas', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM despesas_operacionais ORDER BY ativo DESC, tipo ASC, descricao ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/despesas-operacionais GET /todas] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar todas as despesas operacionais', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// POST /api/despesas-operacionais - Criar nova despesa
router.post('/', async (req, res) => {
    const { descricao, valor_mensal, tipo, ativo } = req.body;

    if (!descricao || valor_mensal === undefined) {
        return res.status(400).json({ error: 'Descrição e valor mensal são obrigatórios.' });
    }
    if (isNaN(parseFloat(valor_mensal)) || parseFloat(valor_mensal) < 0) {
        return res.status(400).json({ error: 'Valor mensal deve ser um número não negativo.' });
    }
    const tiposValidos = ['Fixa', 'Variável', 'Outra'];
    if (tipo && !tiposValidos.includes(tipo)) {
        return res.status(400).json({ error: `Tipo de despesa inválido. Valores permitidos: ${tiposValidos.join(', ')}.` });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO despesas_operacionais (descricao, valor_mensal, tipo, ativo)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const values = [
            descricao,
            parseFloat(valor_mensal),
            tipo || 'Outra', // Default para 'Outra' se não especificado
            ativo === undefined ? true : Boolean(ativo)
        ];
        const result = await dbClient.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API/despesas-operacionais POST] Erro:', error);
        // Não há constraint UNIQUE em 'descricao' por padrão, mas se houvesse:
        // if (error.code === '23505') { 
        //     res.status(409).json({ error: 'Já existe uma despesa com esta descrição.', details: error.detail });
        // } else {
        res.status(500).json({ error: 'Erro ao criar despesa operacional', details: error.message });
        // }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/despesas-operacionais/:id - Atualizar despesa
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { descricao, valor_mensal, tipo, ativo } = req.body;

    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
    }
    if (valor_mensal !== undefined && (isNaN(parseFloat(valor_mensal)) || parseFloat(valor_mensal) < 0)) {
        return res.status(400).json({ error: 'Valor mensal deve ser um número não negativo, se fornecido.' });
    }
    const tiposValidos = ['Fixa', 'Variável', 'Outra'];
    if (tipo && !tiposValidos.includes(tipo)) {
        return res.status(400).json({ error: `Tipo de despesa inválido. Valores permitidos: ${tiposValidos.join(', ')}.` });
    }


    let dbClient;
    try {
        dbClient = await pool.connect();
        
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (descricao !== undefined) { fields.push(`descricao = $${paramCount++}`); values.push(descricao); }
        if (valor_mensal !== undefined) { fields.push(`valor_mensal = $${paramCount++}`); values.push(parseFloat(valor_mensal)); }
        if (tipo !== undefined) { fields.push(`tipo = $${paramCount++}`); values.push(tipo); }
        if (ativo !== undefined) { fields.push(`ativo = $${paramCount++}`); values.push(Boolean(ativo)); }
        
        if (fields.length === 0) {
             return res.status(400).json({ error: "Nenhum campo válido fornecido para atualização." });
        }

        values.push(parseInt(id));
        const query = `
            UPDATE despesas_operacionais
            SET ${fields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *;
        `;
        
        const result = await dbClient.query(query, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Despesa operacional não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[API/despesas-operacionais PUT] Erro:', error);
        res.status(500).json({ error: 'Erro ao atualizar despesa operacional', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/despesas-operacionais/:id - Deletar despesa
// (Considerar soft delete, mudando 'ativo' para false, em vez de exclusão física)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        // Em vez de DELETE, podemos fazer um UPDATE para 'ativo = false'
        // const result = await dbClient.query('DELETE FROM despesas_operacionais WHERE id = $1 RETURNING *;', [parseInt(id)]);
        const result = await dbClient.query(
            'UPDATE despesas_operacionais SET ativo = false, atualizado_em = NOW() WHERE id = $1 RETURNING *;', 
            [parseInt(id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Despesa operacional não encontrada para desativar.' });
        }
        res.status(200).json({ message: 'Despesa operacional desativada com sucesso.', itemDesativado: result.rows[0] });
    } catch (error) {
        console.error('[API/despesas-operacionais DELETE/DESATIVAR] Erro:', error);
        res.status(500).json({ error: 'Erro ao desativar despesa operacional', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;