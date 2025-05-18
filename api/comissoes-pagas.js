// api/comissoes-pagas.js
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

// --- Funções de Autenticação (copie de outra API sua ou crie/importe) ---
const verificarToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401;
        throw error;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        const error = new Error('Token mal formatado');
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

const verificarPermissao = (usuarioLogado, permissaoNecessaria) => {
    if (!usuarioLogado || !Array.isArray(usuarioLogado.permissoes) || !usuarioLogado.permissoes.includes(permissaoNecessaria)) {
        const error = new Error('Permissão negada');
        error.statusCode = 403;
        throw error;
    }
};
// --------------------------------------------------------------------------

// Middleware para este router
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[API /comissoes-pagas] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarToken(req);
        cliente = await pool.connect();
        req.dbCliente = cliente;
        next();
    } catch (error) {
        console.error('[API /comissoes-pagas] Erro no middleware:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// GET /api/comissoes-pagas
router.get('/', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    try {
        // Ajuste a permissão conforme necessário, ex: 'acesso-relatorio-de-comissao'
        verificarPermissao(usuarioLogado, 'acesso-relatorio-de-comissao');

        const { costureira_nome, mes_pagamento } = req.query; // mes_pagamento no formato YYYY-MM

        let queryText = 'SELECT * FROM comissoes_pagas';
        const conditions = [];
        const queryParams = [];
        let paramIndex = 1;

        if (costureira_nome) {
            conditions.push(`costureira_nome = $${paramIndex++}`);
            queryParams.push(costureira_nome);
        }
        if (mes_pagamento) {
            // Validar formato YYYY-MM
            if (!/^\d{4}-\d{2}$/.test(mes_pagamento)) {
                return res.status(400).json({ error: "Formato de mes_pagamento inválido. Use YYYY-MM." });
            }
            const [ano, mes] = mes_pagamento.split('-');
            conditions.push(`EXTRACT(YEAR FROM data_pagamento_efetivo) = $${paramIndex++} AND EXTRACT(MONTH FROM data_pagamento_efetivo) = $${paramIndex++}`);
            queryParams.push(parseInt(ano), parseInt(mes));
        }

        if (conditions.length > 0) {
            queryText += ' WHERE ' + conditions.join(' AND ');
        }
        queryText += ' ORDER BY data_pagamento_efetivo DESC, created_at DESC';

        console.log(`[API GET /comissoes-pagas] Query: ${queryText}`, queryParams);
        const result = await dbCliente.query(queryText, queryParams);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API GET /comissoes-pagas] Erro:', error.message, error.stack);
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/comissoes-pagas
router.post('/', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    try {
        verificarPermissao(usuarioLogado, 'confirmar-pagamento-comissao');

        const {
            costureira_nome,
            ciclo_nome,
            ciclo_inicio,
            ciclo_fim,
            valor_pago,
            data_prevista_pagamento,
            data_pagamento_efetivo, // Será a data/hora atual da confirmação
            confirmado_por_nome,
            observacoes
        } = req.body;

        if (!costureira_nome || !ciclo_nome || !ciclo_inicio || !ciclo_fim || valor_pago === undefined) {
            return res.status(400).json({ error: 'Campos obrigatórios ausentes (costureira, ciclo, valor).' });
        }
        if (isNaN(parseFloat(valor_pago)) || parseFloat(valor_pago) < 0) { // Permite 0 se for o caso
             return res.status(400).json({ error: 'Valor pago inválido.' });
        }

        const queryText = `
            INSERT INTO comissoes_pagas 
            (costureira_nome, ciclo_nome, ciclo_inicio, ciclo_fim, valor_pago, data_prevista_pagamento, data_pagamento_efetivo, confirmado_por_nome, observacoes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `;
        const values = [
            costureira_nome,
            ciclo_nome,
            ciclo_inicio,
            ciclo_fim,
            parseFloat(valor_pago),
            data_prevista_pagamento || null,
            data_pagamento_efetivo || new Date().toISOString(), // Usa a data/hora atual se não fornecida
            confirmado_por_nome || usuarioLogado.nome, // Usa o usuário logado se não fornecido
            observacoes || null
        ];

        console.log(`[API POST /comissoes-pagas] Inserindo:`, values);
        const result = await dbCliente.query(queryText, values);
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API POST /comissoes-pagas] Erro:', error.message, error.stack);
        if (error.code === '23505') { // unique_violation (costureira_nome, ciclo_nome)
            return res.status(409).json({ error: 'Este pagamento de comissão já foi registrado para esta costureira e ciclo.', details: error.detail });
        }
        res.status(error.statusCode || 500).json({ error: error.message, details: error.detail });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;