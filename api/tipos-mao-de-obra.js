// api/tipos-mao-de-obra.js
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
        req.usuarioLogado = decoded;

        const dbClient = await pool.connect();
        try {
            const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
            // Usaremos a mesma permissão 'gerenciar-precificacao' por enquanto.
            // Você pode criar 'gerenciar-mao-de-obra' se quiser mais granularidade.
            if (!permissoesUsuario.includes('gerenciar-precificacao')) {
                return res.status(403).json({ error: 'Permissão negada para gerenciar tipos de mão de obra.' });
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

// GET /api/tipos-mao-de-obra - Listar todos os tipos de mão de obra
router.get('/', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM tipos_mao_de_obra ORDER BY nome_tipo ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/tipos-mao-de-obra GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar tipos de mão de obra', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/tipos-mao-de-obra - Criar novo tipo de mão de obra
router.post('/', async (req, res) => {
    const { 
        nome_tipo, 
        salario_base, 
        custo_vt_mensal, 
        custo_vr_va_mensal, 
        percentual_encargos, 
        horas_trabalhadas_mes,
        ativo 
    } = req.body;

    if (!nome_tipo || salario_base === undefined || horas_trabalhadas_mes === undefined) {
        return res.status(400).json({ error: 'Nome do tipo, salário base e horas trabalhadas/mês são obrigatórios.' });
    }
    // Validações numéricas (adicione mais conforme necessário)
    if (isNaN(parseFloat(salario_base)) || parseFloat(salario_base) < 0) {
         return res.status(400).json({ error: 'Salário base deve ser um número não negativo.' });
    }
    if (isNaN(parseInt(horas_trabalhadas_mes)) || parseInt(horas_trabalhadas_mes) <= 0) {
         return res.status(400).json({ error: 'Horas trabalhadas/mês deve ser um número positivo.' });
    }
    if (percentual_encargos !== undefined && (isNaN(parseFloat(percentual_encargos)) || parseFloat(percentual_encargos) < 0 || parseFloat(percentual_encargos) > 1)) {
        return res.status(400).json({ error: 'Percentual de encargos deve ser um número entre 0 e 1 (ex: 0.3 para 30%).' });
    }


    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO tipos_mao_de_obra 
                (nome_tipo, salario_base, custo_vt_mensal, custo_vr_va_mensal, percentual_encargos, horas_trabalhadas_mes, ativo)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        const values = [
            nome_tipo,
            parseFloat(salario_base),
            parseFloat(custo_vt_mensal || 0),
            parseFloat(custo_vr_va_mensal || 0),
            parseFloat(percentual_encargos || 0),
            parseInt(horas_trabalhadas_mes),
            ativo === undefined ? true : Boolean(ativo) // Default true se não enviado
        ];
        const result = await dbClient.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API/tipos-mao-de-obra POST] Erro:', error);
        if (error.code === '23505') { // Unique violation (nome_tipo)
            res.status(409).json({ error: 'Já existe um tipo de mão de obra com este nome.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao criar tipo de mão de obra', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/tipos-mao-de-obra/:id - Atualizar tipo de mão de obra
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        nome_tipo, 
        salario_base, 
        custo_vt_mensal, 
        custo_vr_va_mensal, 
        percentual_encargos, 
        horas_trabalhadas_mes,
        ativo
    } = req.body;

    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
    }
    
    // Validações para campos numéricos se forem fornecidos
    if (salario_base !== undefined && (isNaN(parseFloat(salario_base)) || parseFloat(salario_base) < 0)) {
         return res.status(400).json({ error: 'Salário base deve ser um número não negativo.' });
    }
    if (horas_trabalhadas_mes !== undefined && (isNaN(parseInt(horas_trabalhadas_mes)) || parseInt(horas_trabalhadas_mes) <= 0)) {
         return res.status(400).json({ error: 'Horas trabalhadas/mês deve ser um número positivo.' });
    }
    if (percentual_encargos !== undefined && (isNaN(parseFloat(percentual_encargos)) || parseFloat(percentual_encargos) < 0 || parseFloat(percentual_encargos) > 1)) {
        return res.status(400).json({ error: 'Percentual de encargos deve ser um número entre 0 e 1.' });
    }
    if (custo_vt_mensal !== undefined && (isNaN(parseFloat(custo_vt_mensal)) || parseFloat(custo_vt_mensal) < 0)) {
        return res.status(400).json({ error: 'Custo VT deve ser um número não negativo.' });
    }
    if (custo_vr_va_mensal !== undefined && (isNaN(parseFloat(custo_vr_va_mensal)) || parseFloat(custo_vr_va_mensal) < 0)) {
        return res.status(400).json({ error: 'Custo VR/VA deve ser um número não negativo.' });
    }


    let dbClient;
    try {
        dbClient = await pool.connect();
        
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (nome_tipo !== undefined) { fields.push(`nome_tipo = $${paramCount++}`); values.push(nome_tipo); }
        if (salario_base !== undefined) { fields.push(`salario_base = $${paramCount++}`); values.push(parseFloat(salario_base)); }
        if (custo_vt_mensal !== undefined) { fields.push(`custo_vt_mensal = $${paramCount++}`); values.push(parseFloat(custo_vt_mensal)); }
        if (custo_vr_va_mensal !== undefined) { fields.push(`custo_vr_va_mensal = $${paramCount++}`); values.push(parseFloat(custo_vr_va_mensal)); }
        if (percentual_encargos !== undefined) { fields.push(`percentual_encargos = $${paramCount++}`); values.push(parseFloat(percentual_encargos)); }
        if (horas_trabalhadas_mes !== undefined) { fields.push(`horas_trabalhadas_mes = $${paramCount++}`); values.push(parseInt(horas_trabalhadas_mes)); }
        if (ativo !== undefined) { fields.push(`ativo = $${paramCount++}`); values.push(Boolean(ativo)); }
        
        if (fields.length === 0) {
             return res.status(400).json({ error: "Nenhum campo válido fornecido para atualização." });
        }

        values.push(parseInt(id));
        const query = `
            UPDATE tipos_mao_de_obra
            SET ${fields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *;
        `;
        
        const result = await dbClient.query(query, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tipo de mão de obra não encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[API/tipos-mao-de-obra PUT] Erro:', error);
        if (error.code === '23505') { 
            res.status(409).json({ error: 'Já existe um tipo de mão de obra com este nome.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao atualizar tipo de mão de obra', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/tipos-mao-de-obra/:id - Deletar tipo de mão de obra
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID inválido.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('DELETE FROM tipos_mao_de_obra WHERE id = $1 RETURNING *;', [parseInt(id)]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tipo de mão de obra não encontrado para exclusão.' });
        }
        res.status(200).json({ message: 'Tipo de mão de obra excluído com sucesso.', deletedItem: result.rows[0] });
    } catch (error) {
        console.error('[API/tipos-mao-de-obra DELETE] Erro:', error);
         if (error.code === '23503') { // Foreign key violation
             res.status(409).json({ error: 'Não é possível excluir. Este tipo de mão de obra está sendo usado na precificação de um ou mais produtos.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao excluir tipo de mão de obra', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;