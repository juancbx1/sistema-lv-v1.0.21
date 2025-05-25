// api/arremates.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const router = express.Router(); 
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

const verificarTokenInterna = (reqOriginal) => {
    // console.log('[router/arremates - verificarTokenInterna] Verificando token...');
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
        // console.log('[router/arremates - verificarTokenInterna] Token decodificado:', decoded);
        return decoded;
    } catch (error) {
        // console.error('[router/arremates - verificarTokenInterna] Erro ao verificar token:', error.message);
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};


// Middleware para este router: Apenas autentica o token.
// A gestão de conexão DB e verificação de permissões detalhadas fica em cada rota.
router.use(async (req, res, next) => {
    try {
        // console.log(`[router/arremates MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenInterna(req); 
        // console.log(`[router/arremates MID] Usuário autenticado (nome do token): ${req.usuarioLogado.nome || req.usuarioLogado.nome_usuario}`);
        next(); 
    } catch (error) {
        console.error('[router/arremates MID] Erro no middleware:', error.message, error.stack ? error.stack.substring(0,500) : '');
        const statusCode = error.statusCode || 500;
        const errorMsg = (error.message === 'jwt expired' || error.message === 'Token expirado' || error.message === 'Token inválido') 
                       ? 'Sessão inválida ou expirada. Faça login novamente.' 
                       : error.message;
        res.status(statusCode).json({ error: errorMsg });
    }
});

// POST /api/arremates/
router.post('/', async (req, res) => {
    const { usuarioLogado } = req; // Do token
    let dbClient; 

    try {
        dbClient = await pool.connect(); // Obtém conexão para esta rota
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API Arremates POST] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('lancar-arremate')) {
            // console.warn(`[router/arremates POST] Permissão 'lancar-arremate' negada para ${usuarioLogado.nome || usuarioLogado.nome_usuario}`);
            return res.status(403).json({ error: 'Permissão negada para lançar arremate.' });
        }

        const {
            op_numero, op_edit_id, produto, variante,
            quantidade_arrematada, usuario_tiktik
        } = req.body;
        // console.log('[router/arremates POST] Dados recebidos:', req.body);

        if (!op_numero || !produto || quantidade_arrematada === undefined || !usuario_tiktik) { // quantidade_arrematada pode ser 0? Se não, >=0
            // console.error('[router/arremates POST] Dados incompletos:', { op_numero, produto, quantidade_arrematada, usuario_tiktik });
            return res.status(400).json({ error: 'Dados incompletos. Campos obrigatórios: op_numero, produto, quantidade_arrematada, usuario_tiktik.' });
        }
        const quantidadeNum = parseInt(quantidade_arrematada);
        if (isNaN(quantidadeNum) || quantidadeNum <= 0) { // Assume que arremate tem que ser > 0
            // console.error('[router/arremates POST] Quantidade inválida:', quantidade_arrematada);
            return res.status(400).json({ error: 'Quantidade arrematada deve ser um número positivo.' });
        }

        // console.log(`[router/arremates POST] Inserindo arremate para OP ${op_numero} com qtd ${quantidadeNum}...`);
        const result = await dbClient.query( // Usa o dbClient desta rota
            `INSERT INTO arremates (op_numero, op_edit_id, produto, variante, quantidade_arrematada, usuario_tiktik, data_lancamento)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING *`,
            [op_numero, op_edit_id || null, produto, variante || null, quantidadeNum, usuario_tiktik]
        );

        if (result.rows.length === 0) {
            throw new Error('Falha ao inserir o registro de arremate, nenhum dado retornado.');
        }

        // console.log('[router/arremates POST] Novo arremate salvo:', result.rows[0]);
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[router/arremates POST] Erro não tratado:', error.message, error.stack ? error.stack.substring(0,500):"");
        const statusCode = error.statusCode || 500; // Mantém o status code original, se houver
        const errorMsg = error.code === '23505' ? 'Conflito de dados (arremate já existe?).' : (error.message || 'Erro interno ao salvar arremate.');
        res.status(statusCode).json({ error: errorMsg, details: error.detail });
    } finally {
        if (dbClient) {
            dbClient.release();
            // console.log('[router/arremates POST] Cliente DB liberado.');
        }
    }
});

// GET /api/arremates/
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { op_numero, usuario_tiktik: queryUsuarioTiktikParam } = req.query;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        const podeAcessarEmbalagemGeral = permissoesCompletas.includes('acesso-embalagem-de-produtos');
        const podeVerPropriosArremates = permissoesCompletas.includes('ver-proprios-arremates');
        const nomeUsuarioNoToken = usuarioLogado.nome; // Assegure que 'nome' está no token

        // Validação de Acesso Principal para a Rota GET
        if (!podeAcessarEmbalagemGeral && !podeVerPropriosArremates) {
            return res.status(403).json({ error: 'Permissão negada para visualizar arremates.' });
        }

        let queryText;
        let queryParams = [];

        // console.log(`[router/arremates GET] User: ${nomeUsuarioNoToken}, EmbalagemGeral: ${podeAcessarEmbalagemGeral}, VerProprios: ${podeVerPropriosArremates}, QueryTiktik: ${queryUsuarioTiktikParam}`);

        if (op_numero) {
            queryText = 'SELECT * FROM arremates WHERE op_numero = $1 ORDER BY data_lancamento DESC';
            queryParams = [String(op_numero)];
        } else if (queryUsuarioTiktikParam) {
            if (podeAcessarEmbalagemGeral || (podeVerPropriosArremates && queryUsuarioTiktikParam === nomeUsuarioNoToken)) {
                queryText = 'SELECT * FROM arremates WHERE usuario_tiktik = $1 ORDER BY data_lancamento DESC';
                queryParams = [String(queryUsuarioTiktikParam)];
            } else {
                return res.status(403).json({ error: 'Você só pode visualizar os arremates especificados ou os seus próprios.' });
            }
        } else if (podeAcessarEmbalagemGeral) {
            queryText = 'SELECT * FROM arremates ORDER BY data_lancamento DESC';
        } else if (podeVerPropriosArremates) { // Se não tem acesso geral, mas pode ver os próprios, e não filtrou por nada.
            if (!nomeUsuarioNoToken) return res.status(400).json({ error: "Falha ao identificar usuário para filtro." });
            queryText = 'SELECT * FROM arremates WHERE usuario_tiktik = $1 ORDER BY data_lancamento DESC';
            queryParams = [nomeUsuarioNoToken];
        } else {
             // Este caso não deveria ser alcançado por causa da validação de acesso principal acima.
            return res.status(403).json({ error: 'Acesso a arremates não configurado corretamente.' });
        }
        
        const result = await dbClient.query(queryText, queryParams);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/arremates GET] Erro na rota:', error.message, error.stack ? error.stack.substring(0,500) : '');
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message || 'Erro interno ao buscar arremates.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/arremates/:id_arremate/registrar-embalagem
router.put('/:id_arremate/registrar-embalagem', async (req, res) => {
    const { usuarioLogado } = req; // Do token
    const { id_arremate } = req.params;
    const { quantidade_que_foi_embalada_desta_vez } = req.body;
    let dbClient;

    try {
        dbClient = await pool.connect(); // Obtém conexão para esta rota
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API Arremates PUT /:id/registrar-embalagem] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('lancar-embalagem')) { // Ou uma permissão mais específica se necessário
            return res.status(403).json({ error: 'Permissão negada para registrar embalagem de arremate.' });
        }

        if (quantidade_que_foi_embalada_desta_vez === undefined) {
            return res.status(400).json({ error: 'Campo obrigatório: quantidade_que_foi_embalada_desta_vez.' });
        }
        const qtdEmbaladaNestaVez = parseInt(quantidade_que_foi_embalada_desta_vez);
        if (isNaN(qtdEmbaladaNestaVez) || qtdEmbaladaNestaVez <= 0) {
            return res.status(400).json({ error: 'Quantidade embalada deve ser um número positivo.' });
        }
        const idArremateNum = parseInt(id_arremate);
        if (isNaN(idArremateNum)) {
            return res.status(400).json({ error: 'ID do arremate inválido.' });
        }

        await dbClient.query('BEGIN'); 

        const arremateResult = await dbClient.query(
            'SELECT id, quantidade_arrematada, quantidade_ja_embalada FROM arremates WHERE id = $1 FOR UPDATE',
            [idArremateNum]
        );

        if (arremateResult.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: `Arremate com ID ${idArremateNum} não encontrado.` });
        }

        const arremate = arremateResult.rows[0];
        const { quantidade_arrematada, quantidade_ja_embalada } = arremate;

        if (quantidade_ja_embalada + qtdEmbaladaNestaVez > quantidade_arrematada) {
            await dbClient.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Quantidade a embalar excede o saldo disponível neste arremate.',
                saldoDisponivel: quantidade_arrematada - quantidade_ja_embalada,
                tentativaEmbalar: qtdEmbaladaNestaVez
            });
        }

        const novaQtdJaEmbalada = quantidade_ja_embalada + qtdEmbaladaNestaVez;
        // ***** CORREÇÃO AQUI: Removido data_atualizacao *****
        const updateResult = await dbClient.query(
            'UPDATE arremates SET quantidade_ja_embalada = $1 WHERE id = $2 RETURNING *',
            [novaQtdJaEmbalada, idArremateNum]
        );

        await dbClient.query('COMMIT'); 

        // console.log(`[router/arremates PUT /:id/registrar-embalagem] Arremate ID ${idArremateNum} atualizado. Nova qtd_ja_embalada: ${novaQtdJaEmbalada}`);
        res.status(200).json({
            message: 'Arremate atualizado com sucesso.',
            arremateAtualizado: updateResult.rows[0]
        });

    } catch (error) {
        if (dbClient) { // Só tenta rollback se dbClient foi conectado
            try {
                await dbClient.query('ROLLBACK');
                // console.log('[router/arremates PUT /:id/registrar-embalagem] ROLLBACK executado devido a erro.');
            } catch (rollbackError) {
                console.error('[router/arremates PUT /:id/registrar-embalagem] Erro ao tentar executar ROLLBACK:', rollbackError);
            }
        }
        console.error(`[router/arremates PUT /:id/registrar-embalagem] Erro Arremate ID ${id_arremate}:`, error.message, error.stack ? error.stack.substring(0,500):"");
        // Evita enviar uma nova resposta se uma já foi enviada (ex: pelo rollback de saldo insuficiente)
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erro ao atualizar arremate.', details: error.message });
        }
    } finally {
        if (dbClient) {
            dbClient.release();
            // console.log('[router/arremates PUT /:id/registrar-embalagem] Cliente DB liberado.');
        }
    }
});

export default router;