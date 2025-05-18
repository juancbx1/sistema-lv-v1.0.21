// api/produtos.js
import 'dotenv/config'; // Garante que .env seja carregado
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    // Usando POSTGRES_URL para consistência com os outros routers.
    // Se sua variável de ambiente for DATABASE_URL, mude aqui.
    connectionString: process.env.POSTGRES_URL,
    ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : undefined // SSL apenas se POSTGRES_URL estiver definido e for uma conexão remota
});

const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarToken (pode ser movida para um utilitário)
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

// Middleware para este router
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/produtos] Recebida ${req.method} em ${req.originalUrl}`);
        // Para GET /api/produtos (listagem), o token pode ser opcional ou não necessário.
        // Para POST, PUT, DELETE, geralmente é necessário.
        // Vamos verificar o token aqui, mas as rotas específicas podem ter lógicas de permissão.
        if (req.method !== 'GET') { // Exige token para POST, PUT, DELETE etc.
            req.usuarioLogado = verificarTokenOriginal(req);
        } else {
            // Para GET, tenta verificar o token, mas não falha se não houver (a menos que seja uma rota GET protegida)
            // Isso permite que o frontend carregue a lista de produtos sem token se for o caso.
            // Se uma rota GET específica precisar de token, ela pode verificar req.usuarioLogado.
            try {
                if (req.headers.authorization) {
                    req.usuarioLogado = verificarTokenOriginal(req);
                }
            } catch (tokenError) {
                // Ignora erro de token para GETs públicos, a menos que a rota específica o exija.
                console.warn('[router/produtos middleware] Token inválido para GET, mas continuando (rota pode ser pública).');
            }
        }
        cliente = await pool.connect();
        req.dbCliente = cliente;
        console.log('[router/produtos middleware] Conexão com o banco estabelecida.');
        next();
    } catch (error) {
        console.error('[router/produtos middleware] Erro:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/produtos/
router.get('/', async (req, res) => {
    const { dbCliente } = req;
    try {
        // A verificação de token (se aplicável) foi feita no middleware.
        // Adicione verificações de permissão aqui se o usuárioLogado for necessário para esta rota.
        // Ex: if (req.usuarioLogado && !req.usuarioLogado.permissoes.includes('ver-produtos')) { ... }

        console.log('[router/produtos GET] Tentando buscar produtos do banco...');
        // Selecionando colunas explicitamente e usando alias para "etapastiktik"
        const queryText = 'SELECT id, nome, sku, gtin, unidade, estoque, imagem, tipos, variacoes, estrutura, etapas, "etapastiktik" AS "etapasTiktik", grade, is_kit, data_atualizacao FROM produtos ORDER BY nome ASC';
        const result = await dbCliente.query(queryText);
        
        console.log('[router/produtos GET] Produtos buscados com sucesso:', result.rows.length);
        // if (result.rows.length > 0) {
        //     console.log('[router/produtos GET] Primeiro produto:', result.rows[0]);
        //     console.log('[router/produtos GET] Conteúdo de etapasTiktik no primeiro produto:', result.rows[0].etapasTiktik);
        // }
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/produtos GET] Erro detalhado:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao buscar produtos', details: error.message });
    } finally {
        if (dbCliente) {
            console.log('[router/produtos GET] Liberando cliente do banco.');
            dbCliente.release();
        }
    }
});

// api/produtos.js - Rota POST /
// Certifique-se de que sua rota POST está assim:

// api/produtos.js
// ...
// api/produtos.js
// ...
router.post('/', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    try {
        if (!usuarioLogado || !usuarioLogado.permissoes.includes('gerenciar-produtos')) {
             return res.status(403).json({ error: 'Permissão negada para gerenciar produtos.' });
        }

        const produto = req.body;
        // console.log('[router/produtos POST] Produto recebido (completo):', JSON.stringify(produto, null, 2)); // Mantenha se útil

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
                tipos = EXCLUDED.tipos,                 /* JSONB */
                variacoes = EXCLUDED.variacoes,         /* JSONB */
                estrutura = EXCLUDED.estrutura,         /* JSONB */
                etapas = EXCLUDED.etapas,               /* JSONB */
                "etapastiktik" = EXCLUDED."etapastiktik", /* JSONB */
                grade = EXCLUDED.grade,                 /* JSONB */
                is_kit = EXCLUDED.is_kit
            RETURNING *; 
        `;
        const values = [
            produto.nome,                           // $1
            produto.sku || null,                    // $2
            produto.gtin || null,                   // $3
            produto.unidade || null,                // $4
            produto.estoque || 0,                   // $5
            produto.imagem || null,                 // $6
            JSON.stringify(produto.tipos || []),        // $7 - JSONB
            JSON.stringify(produto.variacoes || []),    // $8 - JSONB
            JSON.stringify(produto.estrutura || []),    // $9 - JSONB
            JSON.stringify(produto.etapas || []),       // $10 - JSONB
            JSON.stringify(produto.etapasTiktik || []), // $11 - JSONB
            JSON.stringify(produto.grade || []),        // $12 - JSONB
            isKitValue                              // $13
        ];
                
        const result = await dbCliente.query(query, values);
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
        if (dbCliente) {
            dbCliente.release();
        }
    }
});

// Adicione rotas para PUT (atualização específica por ID) e DELETE se necessário
// router.put('/:id', async (req, res) => { /* ... */ });
// router.delete('/:id', async (req, res) => { /* ... */ });

export default router;