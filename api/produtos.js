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
    ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : undefined, // Configuração SSL para NeonDB
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarTokenOriginal (usada pelo middleware)
const verificarTokenOriginal = (reqOriginal) => {
    const authHeader = reqOriginal.headers.authorization;
    if (!authHeader) {
        // Para GET, não lançamos erro aqui, a rota decidirá se autenticação é obrigatória
        if (reqOriginal.method !== 'GET') {
            const error = new Error('Token não fornecido');
            error.statusCode = 401;
            throw error;
        }
        return null; // Retorna null se não houver token para GET
    }
    const token = authHeader.split(' ')[1];
    if (!token && reqOriginal.method !== 'GET') { // Token mal formatado só é erro se não for GET opcional
        const error = new Error('Token mal formatado');
        error.statusCode = 401;
        throw error;
    }
    if (!token && reqOriginal.method === 'GET') return null; // Sem token, mas é GET opcional

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // console.log('[api/produtos - verificarTokenOriginal] Token decodificado:', decoded);
        return decoded;
    } catch (err) {
        // Se for GET e o token for inválido, não lança erro aqui, req.usuarioLogado será null
        if (reqOriginal.method !== 'GET') {
            const error = new Error('Token inválido ou expirado');
            error.statusCode = 401;
            if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
            throw error;
        }
        console.warn('[api/produtos - verificarTokenOriginal] Token inválido para GET, continuando sem usuário.');
        return null; // Token inválido para GET, trata como não autenticado
    }
};

// Middleware para este router: Apenas autentica o token (se presente).
router.use(async (req, res, next) => {
    try {
        // console.log(`[router/produtos MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenOriginal(req); // Define req.usuarioLogado (pode ser null para GETs)
        next();
    } catch (error) { // Erro vindo de verificarTokenOriginal para métodos não-GET que exigem token
        console.error('[router/produtos MID] Erro no middleware (provavelmente token obrigatório ausente/inválido):', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/produtos/
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        if (!usuarioLogado || !usuarioLogado.id) {
            return res.status(401).json({ error: 'Autenticação necessária para visualizar produtos.' });
        }

        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoesCompletas.includes('ver-lista-produtos')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar a lista de produtos.' });
        }

        // ***** CORREÇÃO NA QUERY: Removido data_criacao e data_atualizacao *****
        const queryText = `
            SELECT id, nome, sku, gtin, unidade, estoque, imagem, 
                   tipos, variacoes, estrutura, etapas, 
                   "etapastiktik" AS "etapasTiktik", 
                   grade, is_kit 
            FROM produtos ORDER BY nome ASC`;
            // Removi , data_criacao, data_atualizacao da linha acima
            
        const result = await dbClient.query(queryText);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/produtos GET] Erro:', error.message, error.stack ? error.stack.substring(0,300) : "");
        const errorMessage = (process.env.NODE_ENV === 'production' && (!error.statusCode || error.statusCode === 500))
                           ? 'Erro interno ao buscar produtos.'
                           : error.message;
        res.status(error.statusCode || 500).json({ error: errorMessage, details: process.env.NODE_ENV !== 'production' ? error.detail : undefined });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Rota POST /api/produtos/ (Criar ou Atualizar produto - UPSERT)
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    if (!usuarioLogado || !usuarioLogado.id) {
        return res.status(401).json({ error: "Autenticação necessária para gerenciar produtos." });
    }

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoesCompletas.includes('gerenciar-produtos')) {
             return res.status(403).json({ error: 'Permissão negada para gerenciar produtos.' });
        }

        const produto = req.body;
        if (!produto.nome) {
            return res.status(400).json({ error: "O nome do produto é obrigatório." });
        }
        const isKitValue = produto.is_kit === true || (Array.isArray(produto.tipos) && produto.tipos.includes('kits'));

        // ***** CORREÇÃO NA QUERY POST: Removido data_criacao e data_atualizacao do INSERT direto *****
        // Se você não tem as colunas no DB, não pode tentar inserir/atualizar explicitamente.
        // Se elas tivessem DEFAULT no DB, o DB cuidaria disso no INSERT.
        // Para UPDATE, um gatilho seria o ideal para data_atualizacao.
        // Por agora, vamos remover a tentativa de gerenciá-las pela aplicação se elas não existem.
        const query = `
            INSERT INTO produtos (
                nome, sku, gtin, unidade, estoque, imagem,
                tipos, variacoes, estrutura, etapas, "etapastiktik", grade,
                is_kit 
                ${produto.data_criacao ? ', data_criacao' : ''} -- Adiciona data_criacao apenas se fornecido
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13 ${produto.data_criacao ? ', $14' : ''})
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
                is_kit = EXCLUDED.is_kit
                -- data_atualizacao = CURRENT_TIMESTAMP  // Removido se a coluna não existe ou se há gatilho
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

        if (produto.data_criacao) { // Adiciona ao array de valores se existir
            values.push(produto.data_criacao);
        }


        const result = await dbClient.query(query, values);
        res.status(result.command === 'INSERT' && !produto.data_criacao ? 201 : 200).json(result.rows[0]); // Ajuste do status

    } catch (error) {
        console.error('[router/produtos POST] Erro:', error.message, error.stack ? error.stack.substring(0,300) : "");
        const dbErrorCode = error.code;
        const dbErrorDetail = error.detail;
        if (dbErrorCode === '23505') {
            res.status(409).json({ error: 'Erro de conflito (ex: nome de produto duplicado).', details: dbErrorDetail });
        } else if (error.message.includes('column "data_criacao" does not exist') || error.message.includes('column "data_atualizacao" does not exist')) {
            // Erro específico se ainda houver tentativa de usar as colunas
            console.error("Tentativa de usar colunas de data inexistentes na tabela produtos:", error.message);
            res.status(500).json({ error: 'Erro de configuração da tabela produtos (colunas de data ausentes).', details: error.message });
        }
         else {
            res.status(500).json({ error: 'Erro interno ao salvar/atualizar produto', details: dbErrorDetail || error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// Adicione suas rotas PUT (para atualização por ID) e DELETE aqui,
// seguindo o mesmo padrão:
// 1. Verificar se usuarioLogado existe (obrigatório).
// 2. Conectar dbClient.
// 3. Chamar getPermissoesCompletasUsuarioDB.
// 4. Verificar a permissão específica (ex: 'gerenciar-produtos' ou 'excluir-produto').
// 5. Executar a lógica da rota.
// 6. Liberar dbClient no finally.

export default router;