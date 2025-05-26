// api/produtos.js
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
    ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : undefined,
    timezone: 'UTC', // Boa prática
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarTokenOriginal
const verificarTokenOriginal = (reqOriginal) => {
    const authHeader = reqOriginal.headers.authorization;
    if (!authHeader) throw new Error('Token não fornecido');
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('Token mal formatado');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // console.log('[api/produtos - verificarTokenOriginal] Token decodificado:', decoded);
        return decoded;
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
// A gestão de conexão DB e verificação de permissões detalhadas fica em cada rota.
router.use(async (req, res, next) => {
    try {
        // console.log(`[router/produtos MID] Recebida ${req.method} em ${req.originalUrl}`);
        // Para rotas que não sejam GET, o token é obrigatório
        if (req.method !== 'GET') {
            req.usuarioLogado = verificarTokenOriginal(req);
        } else {
            // Para GET, o token é opcional. Se fornecido e válido, req.usuarioLogado será definido.
            // Se não fornecido ou inválido, req.usuarioLogado permanecerá undefined.
            // A rota GET decidirá se o acesso público é permitido ou se requer autenticação/permissão.
            if (req.headers.authorization) {
                try {
                    req.usuarioLogado = verificarTokenOriginal(req);
                } catch (tokenError) {
                    // console.warn('[router/produtos MID] Token inválido ou ausente para GET, continuando sem usuário logado.');
                    req.usuarioLogado = null; // Garante que é null se o token falhar
                }
            } else {
                req.usuarioLogado = null; // Sem token, sem usuário logado
            }
        }
        next();
    } catch (error) { // Erro vindo de verificarTokenOriginal para métodos não-GET
        console.error('[router/produtos MID] Erro no middleware (provavelmente token):', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/produtos/
router.get('/', async (req, res) => {
    // req.usuarioLogado pode ser null aqui se o GET for público e sem token
    const { usuarioLogado } = req;
    let dbClient;

    try {
        dbClient = await pool.connect();

        // OPCIONAL: Adicionar verificação de permissão se a listagem de produtos não for pública
        // if (usuarioLogado) { // Só verifica permissão se houver um usuário logado
        //     const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        //     if (!permissoesCompletas.includes('ver-lista-produtos')) { // Exemplo de permissão
        //         return res.status(403).json({ error: 'Permissão negada para visualizar produtos.' });
        //     }
        // } else {
        //     // Se a rota GET *exige* login, mesmo que para verificar permissão, você negaria aqui.
        //     // Se for pública, não faz nada.
        // }

        // console.log('[router/produtos GET] Buscando produtos...');
        const queryText = 'SELECT id, nome, sku, gtin, unidade, estoque, imagem, tipos, variacoes, estrutura, etapas, "etapastiktik" AS "etapasTiktik", grade, is_kit, data_atualizacao FROM produtos ORDER BY nome ASC';
        const result = await dbClient.query(queryText);
        // console.log('[router/produtos GET] Produtos buscados:', result.rows.length);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/produtos GET] Erro:', error.message, error.stack ? error.stack.substring(0,300) : "");
        res.status(500).json({ error: 'Erro ao buscar produtos', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/produtos/ (Criar ou Atualizar produto - UPSERT)
router.post('/', async (req, res) => {
    const { usuarioLogado } = req; // req.usuarioLogado foi definido no middleware se não for GET
    let dbClient;

    if (!usuarioLogado) { // Segurança extra: métodos não-GET devem ter usuário logado
        return res.status(401).json({ error: "Autenticação necessária para esta ação." });
    }

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API Produtos POST] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('gerenciar-produtos')) {
             return res.status(403).json({ error: 'Permissão negada para gerenciar produtos.' });
        }

        const produto = req.body;
        if (!produto.nome) {
            return res.status(400).json({ error: "O nome do produto é obrigatório." });
        }
        const isKitValue = produto.is_kit === true || (Array.isArray(produto.tipos) && produto.tipos.includes('kits'));

        // Adicionando data_criacao e data_atualizacao no INSERT se não existir, e atualizando data_atualizacao no UPDATE
        const query = `
            INSERT INTO produtos (
                nome, sku, gtin, unidade, estoque, imagem,
                tipos, variacoes, estrutura, etapas, "etapastiktik", grade,
                is_kit, data_criacao, data_atualizacao 
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
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
            produto.nome, produto.sku || null, produto.gtin || null,
            produto.unidade || null, produto.estoque || 0, produto.imagem || null,
            JSON.stringify(produto.tipos || []), JSON.stringify(produto.variacoes || []),
            JSON.stringify(produto.estrutura || []), JSON.stringify(produto.etapas || []),
            JSON.stringify(produto.etapasTiktik || []), JSON.stringify(produto.grade || []),
            isKitValue
        ];

        const result = await dbClient.query(query, values);
        // console.log('[router/produtos POST] Produto salvo/atualizado:', result.rows[0].nome);
        res.status(200).json(result.rows[0]); // Retorna 200 para UPSERT que pode ser CREATE ou UPDATE

    } catch (error) {
        console.error('[router/produtos POST] Erro:', error.message, error.stack ? error.stack.substring(0,300) : "");
        const dbErrorCode = error.code;
        if (dbErrorCode === '23505') { // Unique violation
            res.status(409).json({ error: 'Erro de conflito (ex: nome de produto duplicado).', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro interno ao salvar/atualizar produto', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Se você tiver rotas PUT (para atualização parcial por ID) ou DELETE, aplique o mesmo padrão:
// 1. Obtenha dbClient com pool.connect()
// 2. Chame getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id)
// 3. Verifique a permissão específica (ex: 'gerenciar-produtos' ou 'excluir-produto')
// 4. Execute a lógica da rota
// 5. Libere dbClient no finally

export default router;