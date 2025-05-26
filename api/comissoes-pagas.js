// api/comissoes-pagas.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importar a função de buscar permissões completas
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Verifique o caminho

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC', // Adicionado para consistência
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarToken (mantenha ou centralize)
const verificarToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error('Token não fornecido');
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('Token mal formatado');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // console.log('[api/comissoes-pagas - verificarToken] Token decodificado:', decoded);
        return decoded;
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
router.use(async (req, res, next) => {
    try {
        // console.log(`[API /comissoes-pagas MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarToken(req);
        next();
    } catch (error) {
        console.error('[API /comissoes-pagas MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// GET /api/comissoes-pagas
router.get('/', async (req, res) => {
    const { usuarioLogado } = req; // Do token
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        // console.log(`[API Comissoes GET /] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('acesso-relatorio-de-comissao')) {
            return res.status(403).json({ error: 'Permissão negada para acessar relatório de comissões.' });
        }

        const { costureira_nome, mes_pagamento } = req.query;
        let queryText = 'SELECT * FROM comissoes_pagas';
        const conditions = [];
        const queryParams = [];
        let paramIndex = 1;

        if (costureira_nome) {
            conditions.push(`costureira_nome = $${paramIndex++}`);
            queryParams.push(costureira_nome);
        }
        if (mes_pagamento) {
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

        // console.log(`[API GET /comissoes-pagas] Query: ${queryText}`, queryParams);
        const result = await dbCliente.query(queryText, queryParams);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API GET /comissoes-pagas] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/comissoes-pagas
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        // console.log(`[API Comissoes POST /] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('confirmar-pagamento-comissao')) {
            return res.status(403).json({ error: 'Permissão negada para confirmar pagamento de comissão.' });
        }

        const {
            costureira_nome, ciclo_nome, ciclo_inicio, ciclo_fim, valor_pago,
            data_prevista_pagamento, data_pagamento_efetivo, // data_pagamento_efetivo pode vir ou ser NOW()
            confirmado_por_nome, observacoes
        } = req.body;

        if (!costureira_nome || !ciclo_nome || !ciclo_inicio || !ciclo_fim || valor_pago === undefined) {
            return res.status(400).json({ error: 'Campos obrigatórios ausentes (costureira, ciclo, valor).' });
        }
        const valorPagoFloat = parseFloat(valor_pago);
        if (isNaN(valorPagoFloat) || valorPagoFloat < 0) {
             return res.status(400).json({ error: 'Valor pago inválido.' });
        }

        const queryText = `
            INSERT INTO comissoes_pagas 
            (costureira_nome, ciclo_nome, ciclo_inicio, ciclo_fim, valor_pago, 
             data_prevista_pagamento, data_pagamento_efetivo, 
             confirmado_por_nome, observacoes, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING *;
        `;
        const values = [
            costureira_nome, ciclo_nome, ciclo_inicio, ciclo_fim, valorPagoFloat,
            data_prevista_pagamento || null,
            data_pagamento_efetivo || new Date().toISOString(), 
            confirmado_por_nome || (usuarioLogado.nome || usuarioLogado.nome_usuario),
            observacoes || null
        ];

        // console.log(`[API POST /comissoes-pagas] Inserindo:`, values);
        const result = await dbCliente.query(queryText, values);
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API POST /comissoes-pagas] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        if (error.code === '23505') { 
            return res.status(409).json({ error: 'Este pagamento de comissão já foi registrado.', details: error.detail });
        }
        res.status(error.statusCode || 500).json({ error: error.message, details: error.detail });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;