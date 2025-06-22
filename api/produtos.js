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

        const queryText = `
        SELECT id, nome, sku, gtin, unidade, estoque, imagem, 
           tipos, variacoes, estrutura, etapas, 
           "etapastiktik" AS "etapasTiktik",
           grade, is_kit,
           criado_em AS "dataCriacao",
           data_atualizacao AS "dataAtualizacao"
        FROM produtos ORDER BY nome ASC`;
            
        const result = await dbClient.query(queryText);

        // ***** ADICIONA HEADERS DE CACHE *****
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // HTTP 1.1.
        res.setHeader('Pragma', 'no-cache'); // HTTP 1.0.
        res.setHeader('Expires', '0'); // Proxies.
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

router.get('/por-nome', async (req, res) => {
    const { nome } = req.query;

    if (!nome) {
        return res.status(400).json({ error: 'O parâmetro "nome" é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const queryText = `SELECT * FROM produtos WHERE nome = $1 LIMIT 1`;
        const result = await dbClient.query(queryText, [nome]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }
        
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error(`[API GET /produtos/por-nome] Erro:`, error);
        res.status(500).json({ error: 'Erro ao buscar produto.', details: error.message });
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

        // ***** CORREÇÃO NA QUERY POST *****
        // Removido 'data_criacao' do INSERT direto (assumindo que o DB lida com 'criado_em' via DEFAULT)
        // Adicionado 'data_atualizacao = CURRENT_TIMESTAMP' no DO UPDATE SET
        // Adicionado aliases no RETURNING para consistência com o GET
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
            data_atualizacao = CURRENT_TIMESTAMP  -- Linha correta, sem os '<'
        RETURNING 
            id, nome, sku, gtin, unidade, estoque, imagem, 
            tipos, variacoes, estrutura, etapas, 
            "etapastiktik" AS "etapasTiktik", 
            grade, is_kit,
            criado_em AS "dataCriacao",
            data_atualizacao AS "dataAtualizacao";
            `;
        const values = [
            produto.nome, produto.sku || null, produto.gtin || null,
            produto.unidade || null, produto.estoque || 0, produto.imagem || null,
            JSON.stringify(produto.tipos || []), JSON.stringify(produto.variacoes || []),
            JSON.stringify(produto.estrutura || []), JSON.stringify(produto.etapas || []),
            JSON.stringify(produto.etapasTiktik || []), JSON.stringify(produto.grade || []),
            isKitValue
        ];
        // Não precisamos mais de lógica condicional para values.push(produto.data_criacao)

        const result = await dbClient.query(query, values);
        // Determinar se foi INSERT ou UPDATE para o status code
        // Se 'data_atualizacao' no resultado for NULL ou igual a 'criado_em' (aproximadamente),
        // é provável que tenha sido um INSERT novo.
        // Se 'data_atualizacao' tiver um valor e for diferente de 'criado_em', foi um UPDATE.
        // Uma forma mais simples: se o xmax do sistema (pg_xact_commit_timestamp(xmin) != pg_xact_commit_timestamp(xmax)) for diferente
        // ou verificar se data_atualizacao é NOT NULL no resultado, já que no INSERT ele seria NULL (a menos que o update o definisse)
        
        const produtoRetornado = result.rows[0];
        let statusCode = 200; // Padrão para UPDATE

        // Se dataAtualizacao está nula E dataCriacao existe, provavelmente foi um INSERT
        // (A lógica exata para 201 vs 200 pode ser complexa sem saber o xmax do registro antes da query)
        // Por simplicidade, vamos basear no que foi enviado versus o que foi retornado.
        // Se o frontend enviou um ID e esse ID já existia, é um update.
        // Mas a query é por 'nome', então se o 'nome' já existia, é um update.
        // A Vercel/Neon pode não retornar xmax diretamente, então uma heurística:
        // Se a 'dataAtualizacao' retornada for muito próxima de agora e diferente de 'dataCriacao', foi um UPDATE.
        // Se 'dataAtualizacao' for NULL ou igual a 'dataCriacao', foi um INSERT.
        // Como 'data_atualizacao' é setada no DO UPDATE, se ela tiver um valor, foi um update.
        // Se ela for NULL, foi um INSERT (e o RETURNING pegou o valor NULL de data_atualizacao).
        if (produtoRetornado.dataAtualizacao === null) { // Ou seja, o DO UPDATE não foi executado.
            statusCode = 201; // Created
        }

        res.status(statusCode).json(produtoRetornado);

    } catch (error) {
        console.error('[router/produtos POST] Erro:', error.message, error.stack ? error.stack.substring(0,300) : "");
        const dbErrorCode = error.code;
        const dbErrorDetail = error.detail;
        if (dbErrorCode === '23505') { // Unique constraint (ex: nome duplicado)
            res.status(409).json({ error: 'Erro de conflito (ex: nome de produto duplicado).', details: dbErrorDetail });
        } else {
            res.status(500).json({ error: 'Erro interno ao salvar/atualizar produto', details: dbErrorDetail || error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { usuarioLogado } = req;
    let dbClient;

    if (!usuarioLogado || !usuarioLogado.id) {
        return res.status(401).json({ error: "Autenticação necessária." });
    }

    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('gerenciar-produtos')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        const produto = req.body;
        if (!produto.nome) {
            return res.status(400).json({ error: "O nome do produto é obrigatório." });
        }
        
        const isKitValue = produto.is_kit === true || (Array.isArray(produto.tipos) && produto.tipos.includes('kits'));

        const query = `
            UPDATE produtos SET
                nome = $1, sku = $2, gtin = $3, unidade = $4, estoque = $5, 
                imagem = $6, tipos = $7, variacoes = $8, estrutura = $9, 
                etapas = $10, "etapastiktik" = $11, grade = $12, is_kit = $13,
                data_atualizacao = CURRENT_TIMESTAMP
            WHERE id = $14
            RETURNING *;
        `;
        const values = [
            produto.nome, produto.sku || null, produto.gtin || null,
            produto.unidade || null, produto.estoque || 0, produto.imagem || null,
            JSON.stringify(produto.tipos || []), JSON.stringify(produto.variacoes || []),
            JSON.stringify(produto.estrutura || []), JSON.stringify(produto.etapas || []),
            JSON.stringify(produto.etapasTiktik || []), JSON.stringify(produto.grade || []),
            isKitValue,
            id
        ];

        const result = await dbClient.query(query, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Produto não encontrado para atualização.' });
        }
        
        res.status(200).json(result.rows[0]);

    } catch (error) {
        // ... (código de tratamento de erro, igual ao da sua rota POST)
        console.error('[API PUT /produtos/:id] Erro:', error);
        res.status(500).json({ error: 'Erro ao atualizar produto.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});



export default router;