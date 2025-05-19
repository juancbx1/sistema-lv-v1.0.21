// api/ops-para-embalagem.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express'; // <<< ADICIONADO

const router = express.Router(); // <<< ADICIONADO
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

if (!SECRET_KEY) {
    console.error('[router/ops-para-embalagem] ERRO CRÍTICO: JWT_SECRET não definida!');
}

// Função verificarToken (Reutilizada - pode ser movida para utils)
const verificarTokenInterna = (reqOriginal) => {
    console.log('[router/ops-para-embalagem - verificarTokenInterna] Verificando token...');
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
        return decoded;
    } catch (error) {
        console.error('[router/ops-para-embalagem - verificarTokenInterna] Erro ao verificar token:', error.message);
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};

// Middleware para este router
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/ops-para-embalagem] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenInterna(req);
        console.log('[router/ops-para-embalagem middleware] Usuário autenticado:', req.usuarioLogado.nome);

        if (!req.usuarioLogado.permissoes || !req.usuarioLogado.permissoes.includes('acesso-embalagem-de-produtos')) {
            console.warn(`[router/ops-para-embalagem middleware] Permissão 'acesso-embalagem-de-produtos' negada para ${req.usuarioLogado.nome}`);
            const err = new Error('Permissão negada para acessar OPs para embalagem.');
            err.statusCode = 403;
            throw err;
        }
        
        cliente = await pool.connect();
        req.dbCliente = cliente;
        console.log('[router/ops-para-embalagem middleware] Conexão com o banco estabelecida.');
        next();
    } catch (error) {
        console.error('[router/ops-para-embalagem middleware] Erro:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// GET /api/ops-para-embalagem/
router.get('/', async (req, res) => {
    const { dbCliente } = req; // req.usuarioLogado já validado
    const { query } = req; // req.query já contém os parâmetros da URL
    try {
        console.log('[router/ops-para-embalagem GET] Processando...');
        // Parâmetros da Query
        const fetchAll = query.all === 'true';
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 50; // Ajuste conforme sua necessidade
        const offset = (page - 1) * limit;

        // Construir a Query SQL
        const baseQuery = `FROM ordens_de_producao WHERE status = 'finalizado'`;
        const orderBy = `ORDER BY data_final DESC NULLS LAST, CAST(numero AS INTEGER) DESC`;

        let queryText = `SELECT * ${baseQuery} ${orderBy}`;
        let queryParams = [];

        let totalQuery = `SELECT COUNT(*) AS count ${baseQuery}`; // Adicionado alias 'count'
        // totalParams não é necessário aqui, pois não há placeholders em baseQuery

        if (!fetchAll) {
            queryText += ` LIMIT $1 OFFSET $2`;
            queryParams = [limit, offset];
        } else {
            console.log('[router/ops-para-embalagem GET] Buscando todas as OPs finalizadas (all=true).');
        }

        console.log('[router/ops-para-embalagem GET] Executando query principal:', queryText, queryParams);
        const result = await dbCliente.query(queryText, queryParams);

        console.log('[router/ops-para-embalagem GET] Executando query de contagem:', totalQuery);
        const totalResult = await dbCliente.query(totalQuery);
        const total = parseInt(totalResult.rows[0].count); // Acessa pelo alias 'count'
        const pages = fetchAll ? 1 : (limit > 0 ? Math.ceil(total / limit) : 1);

        console.log(`[router/ops-para-embalagem GET] ${result.rows.length} OPs finalizadas encontradas (Total: ${total}).`);
        res.status(200).json({
            rows: result.rows,
            total: total,
            page: fetchAll ? 1 : page,
            pages: pages,
        });

    } catch (error) {
        console.error('[router/ops-para-embalagem GET] Erro não tratado:', {
            message: error.message,
            stack: error.stack,
        });
        res.status(error.statusCode || 500).json({ error: error.message || 'Erro interno ao buscar OPs para embalagem.' });
    } finally {
        if (dbCliente) {
            console.log('[router/ops-para-embalagem GET] Liberando cliente do banco.');
            dbCliente.release();
        }
    }
});

export default router; // <<< EXPORTAR O ROUTER