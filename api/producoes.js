// api/producoes.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

const verificarToken = (reqOriginal) => {
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
        if (err.name === 'TokenExpiredError') {
            error.details = 'jwt expired';
        }
        throw error;
    }
};

// Middleware para este router: Adquire a conexão e verifica o token
router.use(async (req, res, next) => {
    try {
        console.log(`[router/producoes] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarToken(req);
        req.dbClient = await pool.connect();
        next();
    } catch (error) {
        console.error('[router/producoes] Erro no middleware:', error.message);
        if (req.dbClient) req.dbClient.release(); // Libera em caso de erro no middleware
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// POST /api/producoes/
router.post('/', async (req, res) => {
    const { usuarioLogado, dbClient } = req;

    try {
        console.log('[router/producoes POST] Iniciando lançamento de produção...');
        // Permissão para lançar produção
        if (!usuarioLogado.permissoes.includes('lancar-producao')) {
            return res.status(403).json({ error: 'Permissão negada para lançar produção' });
        }

        const {
            id, opNumero, etapaIndex, processo, produto, variacao,
            maquina, quantidade, funcionario, data, lancadoPor
        } = req.body;

        if (!id || !opNumero || etapaIndex === undefined || !processo || !produto || quantidade === undefined || !funcionario || !data || !lancadoPor) {
            return res.status(400).json({ error: 'Dados incompletos para lançamento de produção.' });
        }
        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade inválida.' });
        }

        let parsedDate;
        try {
            if (data && !data.includes('-03')) parsedDate = `${data}-03:00`;
            else parsedDate = data;
            const dateTest = new Date(parsedDate);
            if (isNaN(dateTest.getTime())) throw new Error('Formato de data inválido para produção.');
        } catch (error) {
            console.error('[router/producoes POST] Erro ao processar data:', error.message);
            return res.status(400).json({ error: 'Formato de data inválido para produção.' });
        }

        let valorPontoAplicado = 1.00;

        console.log(`[router/producoes POST] Buscando configuração de pontos para Produto: "${produto}", Processo: "${processo}"`);
        const configPontosQuery = `
            SELECT pontos_padrao
            FROM configuracoes_pontos_processos
            WHERE produto_nome = $1 AND processo_nome = $2 AND ativo = TRUE
            LIMIT 1;
        `;
        const configPontosResult = await dbClient.query(configPontosQuery, [produto, processo]);

        if (configPontosResult.rows.length > 0) {
            valorPontoAplicado = parseFloat(configPontosResult.rows[0].pontos_padrao);
            console.log(`[router/producoes POST] Configuração de pontos encontrada. Valor Ponto Aplicado: ${valorPontoAplicado}`);
        } else {
            console.log(`[router/producoes POST] Nenhuma configuração de pontos ativa encontrada. Usando default: ${valorPontoAplicado}`);
        }

        const pontosGerados = parsedQuantidade * valorPontoAplicado;
        console.log(`[router/producoes POST] Quantidade: ${parsedQuantidade}, Pontos Gerados: ${pontosGerados}`);

        console.log('[router/producoes POST] Inserindo produção no banco...');
        const insertProducaoQuery = `
            INSERT INTO producoes (
                id, op_numero, etapa_index, processo, produto, variacao, maquina,
                quantidade, funcionario, data, lancado_por,
                valor_ponto_aplicado, pontos_gerados
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;
        const result = await dbClient.query(insertProducaoQuery, [
            id, opNumero, etapaIndex, processo, produto, variacao, maquina,
            parsedQuantidade, funcionario, parsedDate, lancadoPor,
            valorPontoAplicado, pontosGerados
        ]);

        console.log('[router/producoes POST] Produção lançada com sucesso:', result.rows[0].id);
        res.status(201).json({ ...result.rows[0], id: id });

    } catch (error) {
        console.error('[router/producoes POST] Erro detalhado:', error.message, error.stack);
        const dbErrorDetail = error.detail || error.message;
        const dbErrorCode = error.code;
        if (dbErrorCode === '23505') {
             res.status(409).json({ error: 'Erro de conflito ao salvar produção (ex: ID duplicado).', details: dbErrorDetail, code: dbErrorCode });
        } else {
            res.status(500).json({ error: 'Erro interno ao salvar produção.', details: dbErrorDetail, code: dbErrorCode });
        }
    } finally {
        if (dbClient) dbClient.release(); // LIBERA O CLIENTE AQUI
    }
});

// GET /api/producoes/
router.get('/', async (req, res) => {
    const { usuarioLogado, dbClient } = req;
    try {
        if (!usuarioLogado.permissoes.includes('acesso-gerenciar-producao') && !usuarioLogado.tipos.includes('costureira')) {
            return res.status(403).json({ error: 'Permissão negada' });
        }
        let queryText;
        let queryParams = [];
        const opNumeroRaw = req.query.op_numero;
        const opNumero = opNumeroRaw ? String(opNumeroRaw).trim() : undefined;

        if (opNumero) {
            queryText = 'SELECT * FROM producoes WHERE op_numero = $1 ORDER BY data DESC';
            queryParams = [opNumero];
        } else if (usuarioLogado.tipos.includes('costureira') && !usuarioLogado.permissoes.includes('acesso-gerenciar-producao')) {
            queryText = 'SELECT * FROM producoes WHERE funcionario = $1 ORDER BY data DESC';
            queryParams = [usuarioLogado.nome];
        } else {
            queryText = 'SELECT * FROM producoes ORDER BY data DESC';
        }
        const result = await dbClient.query(queryText, queryParams);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/producoes] Erro no GET:', error);
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbClient) dbClient.release(); // LIBERA O CLIENTE AQUI
    }
});

// PUT /api/producoes/
router.put('/', async (req, res) => {
    const { usuarioLogado, dbClient } = req;
    try {
        console.log('[router/producoes] Processando PUT...');
        const { id, quantidade, edicoes, assinada } = req.body;

        if (!id || (quantidade === undefined && assinada === undefined && edicoes === undefined)) {
            return res.status(400).json({ error: 'Dados incompletos. Pelo menos id e um campo para atualizar (quantidade, edicoes ou assinada) são necessários.' });
        }

        const checkResult = await dbClient.query('SELECT * FROM producoes WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Produção não encontrada' });
        }
        const producao = checkResult.rows[0];
        const isCostureira = usuarioLogado.tipos.includes('costureira');
        const isOwner = producao.funcionario === usuarioLogado.nome;
        const onlySigning = quantidade === undefined && edicoes === undefined && assinada !== undefined;

        if (!usuarioLogado.permissoes.includes('editar-registro-producao') && !(isCostureira && isOwner && onlySigning)) {
            return res.status(403).json({ error: 'Permissão negada' });
        }

        const result = await dbClient.query(
            `UPDATE producoes
             SET quantidade = COALESCE($1, quantidade),
                 edicoes = COALESCE($2, edicoes),
                 assinada = COALESCE($3, assinada)
             WHERE id = $4 RETURNING *`,
            [quantidade, edicoes, assinada, id]
        );
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[router/producoes] Erro no PUT:', error);
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbClient) dbClient.release(); // LIBERA O CLIENTE AQUI
    }
});

// DELETE /api/producoes/
router.delete('/', async (req, res) => {
    const { usuarioLogado, dbClient } = req;
    try {
        console.log('[router/producoes] Processando DELETE...');
        if (!usuarioLogado.permissoes.includes('excluir-registro-producao')) {
            return res.status(403).json({ error: 'Permissão negada' });
        }
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'ID não fornecido no corpo da requisição' });
        }
        const deleteResult = await dbClient.query(
            'DELETE FROM producoes WHERE id = $1 RETURNING *',
            [id]
        );
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: 'Produção não encontrada para exclusão.' });
        }
        res.status(200).json(deleteResult.rows[0] || { message: 'Registro excluído com sucesso', id });
    } catch (error) {
        console.error('[router/producoes] Erro no DELETE:', error);
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbClient) dbClient.release(); // LIBERA O CLIENTE AQUI
    }
});

export default router;