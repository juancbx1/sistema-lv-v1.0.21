// api/ops-para-embalagem.js
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
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
    console.error('[router/ops-para-embalagem] ERRO CRÍTICO: JWT_SECRET não definida!');
}

// Função verificarTokenInterna (mantenha a sua ou use uma centralizada)
const verificarTokenInterna = (reqOriginal) => {
    // console.log('[router/ops-para-embalagem - verificarTokenInterna] Verificando token...');
    const authHeader = reqOriginal.headers.authorization;
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
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        // console.log('[router/ops-para-embalagem - verificarTokenInterna] Token decodificado:', decoded);
        return decoded; // Retorna o payload do token
    } catch (error) {
        // console.error('[router/ops-para-embalagem - verificarTokenInterna] Erro ao verificar token:', error.message);
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};

// Middleware para este router
router.use(async (req, res, next) => {
    let clienteConectado; // Cliente para o middleware
    try {
        // console.log(`[router/ops-para-embalagem MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenInterna(req); // req.usuarioLogado é o payload do token
        // console.log(`[router/ops-para-embalagem MID] Usuário autenticado: ${req.usuarioLogado.nome || req.usuarioLogado.nome_usuario}`);

        clienteConectado = await pool.connect(); // Conecta para buscar permissões
        // Não anexamos a req.dbCliente aqui, pois getPermissoesCompletasUsuarioDB gerencia seu cliente
        // E a rota GET / também vai pegar seu próprio cliente.

        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(clienteConectado, req.usuarioLogado.id);
        // console.log(`[router/ops-para-embalagem MID] Permissões DB para ${req.usuarioLogado.nome || req.usuarioLogado.nome_usuario}:`, permissoesCompletas);
        
        if (!permissoesCompletas.includes('acesso-embalagem-de-produtos')) {
            // console.warn(`[router/ops-para-embalagem MID] Permissão 'acesso-embalagem-de-produtos' negada para ${req.usuarioLogado.nome || req.usuarioLogado.nome_usuario}.`);
            const err = new Error('Permissão negada para acessar OPs para embalagem.');
            err.statusCode = 403;
            throw err; // Será pego pelo catch abaixo
        }
        
        // Se chegou aqui, tem permissão.
        // A rota GET obterá seu próprio cliente DB.
        next();
    } catch (error) {
        console.error('[router/ops-para-embalagem MID] Erro no middleware:', error.message, error.stack ? error.stack.substring(0,300):"");
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    } finally {
        if (clienteConectado) {
            clienteConectado.release(); // Libera o cliente usado pelo middleware
            // console.log('[router/ops-para-embalagem MID] Cliente DB do middleware liberado.');
        }
    }
});

// GET /api/ops-para-embalagem/
router.get('/', async (req, res) => {
    const { query } = req;
    let dbClienteRota;

    try {
        dbClienteRota = await pool.connect();
        
        const fetchAll = query.all === 'true';
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 50;
        const offset = (page - 1) * limit;

        // --- QUERY CORRIGIDA COM JOIN ---
        // Agora ela busca o produto_id e também o nome do produto
        const baseQuery = `
            FROM ordens_de_producao op
            LEFT JOIN produtos p ON op.produto_id = p.id
            WHERE op.status = 'finalizado'
        `;
        
        const selectFields = `
            SELECT 
                op.id, op.numero, op.variante, op.quantidade, op.data_entrega, 
                op.observacoes, op.status, op.edit_id, op.etapas, op.data_final,
                op.produto_id, 
                p.nome AS produto
        `;

        const orderBy = `ORDER BY op.data_final DESC NULLS LAST, op.id DESC`;

        let queryText = `${selectFields} ${baseQuery} ${orderBy}`;
        let queryParams = [];
        let totalQuery = `SELECT COUNT(op.id) AS count ${baseQuery}`;

        if (!fetchAll) {
            queryText += ` LIMIT $1 OFFSET $2`;
            queryParams = [limit, offset];
        }

        const result = await dbClienteRota.query(queryText, queryParams);
        const totalResult = await dbClienteRota.query(totalQuery);
        const total = parseInt(totalResult.rows[0].count);
        const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

        res.status(200).json({
            rows: result.rows,
            total: total,
            page: fetchAll ? 1 : page,
            pages: totalPages,
        });

    } catch (error) {
        console.error('[router/ops-para-embalagem GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar OPs para embalagem.', details: error.message });
    } finally {
        if (dbClienteRota) {
            dbClienteRota.release();
        }
    }
});

export default router;