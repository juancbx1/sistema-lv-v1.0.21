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
    // req.usuarioLogado já foi validado e anexado pelo middleware.
    // A permissão 'acesso-embalagem-de-produtos' também já foi validada pelo middleware.
    const { query } = req;
    let dbClienteRota; // Cliente específico para esta rota

    try {
        dbClienteRota = await pool.connect(); // Pega uma nova conexão para a rota
        // console.log('[router/ops-para-embalagem GET] Processando...');
        
        const fetchAll = query.all === 'true';
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 50;
        const offset = (page - 1) * limit;

        const baseQuery = `FROM ordens_de_producao WHERE status = 'finalizado'`;
        // Ajuste na ordenação para OPs com número não puramente numérico
        const orderBy = `ORDER BY data_final DESC NULLS LAST, CAST(NULLIF(REGEXP_REPLACE(numero, '\\D', '', 'g'), '') AS INTEGER) DESC NULLS LAST, numero DESC`;


        let queryText = `SELECT * ${baseQuery} ${orderBy}`;
        let queryParams = [];
        let totalQuery = `SELECT COUNT(*) AS count ${baseQuery}`;

        if (!fetchAll) {
            queryText += ` LIMIT $1 OFFSET $2`;
            queryParams = [limit, offset];
        } else {
            // console.log('[router/ops-para-embalagem GET] Buscando todas as OPs finalizadas (all=true).');
        }

        // console.log('[router/ops-para-embalagem GET] Executando query principal:', queryText, queryParams);
        const result = await dbClienteRota.query(queryText, queryParams);

        // console.log('[router/ops-para-embalagem GET] Executando query de contagem:', totalQuery);
        const totalResult = await dbClienteRota.query(totalQuery); // Não precisa de params aqui
        const total = parseInt(totalResult.rows[0].count);
        
        const totalPages = limit > 0 ? Math.ceil(total / limit) : (total > 0 ? 1 : 0);

        // console.log(`[router/ops-para-embalagem GET] ${result.rows.length} OPs finalizadas encontradas (Total: ${total}).`);
        res.status(200).json({
            rows: result.rows,
            total: total,
            page: fetchAll ? 1 : page,
            pages: totalPages,
        });

    } catch (error) {
        console.error('[router/ops-para-embalagem GET] Erro não tratado:', error.message, error.stack ? error.stack.substring(0,300):"");
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message || 'Erro interno ao buscar OPs para embalagem.' });
    } finally {
        if (dbClienteRota) {
            dbClienteRota.release();
            // console.log('[router/ops-para-embalagem GET] Cliente DB da rota liberado.');
        }
    }
});

export default router;