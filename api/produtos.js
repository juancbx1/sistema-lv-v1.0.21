// api/produtos.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : undefined
});

const SECRET_KEY = process.env.JWT_SECRET;

const verificarTokenOriginal = (reqOriginal) => {
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
        const decoded = jwt.verify(token, SECRET_KEY);
        return decoded;
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Adquire a conexão e verifica o token (opcional para GET)
router.use(async (req, res, next) => {
    try {
        console.log(`[router/produtos] Recebida ${req.method} em ${req.originalUrl}`);
        if (req.method !== 'GET') { // Exige token para POST, PUT, DELETE etc.
            req.usuarioLogado = verificarTokenOriginal(req);
        } else {
            try {
                if (req.headers.authorization) {
                    req.usuarioLogado = verificarTokenOriginal(req);
                }
            } catch (tokenError) {
                console.warn('[router/produtos middleware] Token inválido para GET, mas continuando (rota pode ser pública).');
            }
        }
        req.dbClient = await pool.connect();
        console.log('[router/produtos middleware] Conexão com o banco estabelecida.');
        next();
    } catch (error) {
        console.error('[router/produtos middleware] Erro:', error.message);
        if (req.dbClient) req.dbClient.release(); // Libera em caso de erro no middleware
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/produtos/
router.get('/', async (req, res) => {
    const { dbClient } = req;
    try {
        // Se esta rota GET precisasse de permissão, você verificaria aqui:
        // if (!req.usuarioLogado || !req.usuarioLogado.permissoes.includes('ver-produtos')) { /* ... */ }

        console.log('[router/produtos GET] Tentando buscar produtos do banco...');
        const queryText = 'SELECT id, nome, sku, gtin, unidade, estoque, imagem, tipos, variacoes, estrutura, etapas, "etapastiktik" AS "etapasTiktik", grade, is_kit, data_atualizacao FROM produtos ORDER BY nome ASC';
        const result = await dbClient.query(queryText);

        console.log('[router/produtos GET] Produtos buscados com sucesso:', result.rows.length);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/produtos GET] Erro detalhado:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao buscar produtos', details: error.message });
    } finally {
        if (dbClient) {
            console.log('[router/produtos GET] Liberando cliente do banco.');
            dbClient.release(); // LIBERA O CLIENTE AQUI
        }
    }
});

router.post('/', async (req, res) => {
    const { dbClient, usuarioLogado } = req;
    try {
        if (!usuarioLogado || !usuarioLogado.permissoes.includes('gerenciar-produtos')) {
             return res.status(403).json({ error: 'Permissão negada para gerenciar produtos.' });
        }

        const produto = req.body;

        if (!produto.nome) {
            return res.status(400).json({ error: "O nome do produto é obrigatório." });
        }

        const isKitValue = produto.is_kit === true || (Array.isArray(produto.tipos) && produto.tipos.includes('kits'));

        const query = `
            INSERT INTO produtos (
                nome, sku, gtin, unidade, estoque, imagem,
                tipos, variacoes, estrutura, etapas, "etapastiktik", grade,
                is_kit
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (nome)
            DO UPDATE SET
                sku = EXCLUDED.sku,
                gtin = EXCLUDED.gtin,
                unidade = EXCLUDED.unidade,
                estoque = EXCLUDED.estoque,
                imagem = EXCLUDED.imagem,
                tipos = EXCLUDED.tipos,
                variacoes = EXCLUDED.variacoes,
                estrutura = EXCLUDED.estrutura,
                etapas = EXCLUDED.etapas,
                "etapastiktik" = EXCLUDED."etapastiktik",
                grade = EXCLUDED.grade,
                is_kit = EXCLUDED.is_kit,
                data_atualizacao = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const values = [
            produto.nome,
            produto.sku || null,
            produto.gtin || null,
            produto.unidade || null,
            produto.estoque || 0,
            produto.imagem || null,
            JSON.stringify(produto.tipos || []),
            JSON.stringify(produto.variacoes || []),
            JSON.stringify(produto.estrutura || []),
            JSON.stringify(produto.etapas || []),
            JSON.stringify(produto.etapasTiktik || []),
            JSON.stringify(produto.grade || []),
            isKitValue
        ];

        const result = await dbClient.query(query, values);
        console.log('[router/produtos POST] Produto salvo/atualizado com sucesso:', result.rows[0].nome);
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error('[router/produtos POST] Erro detalhado:', error.message, error.stack);
        const dbErrorDetail = error.detail || error.message;
        const dbErrorCode = error.code;
        if (dbErrorCode === '23505') {
            res.status(409).json({ error: 'Erro de conflito (ex: nome duplicado).', details: dbErrorDetail, code: dbErrorCode });
        } else {
            res.status(500).json({ error: 'Erro interno ao salvar/atualizar produto', details: dbErrorDetail, code: dbErrorCode });
        }
    } finally {
        if (dbClient) {
            dbClient.release(); // LIBERA O CLIENTE AQUI
        }
    }
});

export default router;