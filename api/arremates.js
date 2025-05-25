// api/arremates.js
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

if (!SECRET_KEY) {
    console.error('[router/arremates] ERRO CRÍTICO: JWT_SECRET não está definida!');
}

// Função verificarToken (pode ser movida para um arquivo utilitário se usada em vários routers)
const verificarTokenInterna = (reqOriginal) => {
    console.log('[router/arremates - verificarTokenInterna] Verificando token...');
    const authHeader = reqOriginal.headers.authorization;
    if (!authHeader) {
        const error = new Error('Token não fornecido');
        error.statusCode = 401; // Adiciona statusCode para o error handler do Express
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
        console.error('[router/arremates - verificarTokenInterna] Erro ao verificar token:', error.message);
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired'; // Para consistência com outros routers
        throw newError;
    }
};

// Middleware para este router: autenticação e conexão com banco
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/arremates] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenInterna(req); // Armazena dados do usuário no objeto req
        console.log('[router/arremates middleware] Usuário autenticado:', req.usuarioLogado.nome);

        // Verifica permissão GERAL para acessar esta funcionalidade DE ARREMATES
        if (!req.usuarioLogado.permissoes || !req.usuarioLogado.permissoes.includes('acesso-embalagem-de-produtos')) {
             console.warn(`[router/arremates middleware] Permissão 'acesso-embalagem-de-produtos' negada para ${req.usuarioLogado.nome}`);
             // Lança erro para ser pego pelo catch e respondido adequadamente
             const err = new Error('Permissão negada para acessar esta funcionalidade.');
             err.statusCode = 403;
             throw err;
        }

        cliente = await pool.connect();
        req.dbCliente = cliente; // Adiciona cliente do banco ao objeto req
        console.log('[router/arremates middleware] Conexão com o banco estabelecida.');
        next(); // Passa para a próxima rota/middleware
    } catch (error) {
        console.error('[router/arremates middleware] Erro:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details; // Adiciona detalhes se houver
        res.status(statusCode).json(responseError);
    }
});

// POST /api/arremates/
router.post('/', async (req, res) => {
    // req.usuarioLogado e req.dbCliente já estão disponíveis aqui por causa do middleware
    const { usuarioLogado, dbCliente } = req;
    try {
        console.log('[router/arremates POST] Processando...');
        // Verifica permissão específica para lançar arremate
        if (!usuarioLogado.permissoes.includes('lancar-arremate')) {
            console.warn(`[router/arremates POST] Permissão 'lancar-arremate' negada para ${usuarioLogado.nome}`);
            return res.status(403).json({ error: 'Permissão negada para lançar arremate.' });
        }

        const {
            op_numero,
            op_edit_id,
            produto,
            variante,
            quantidade_arrematada,
            usuario_tiktik
        } = req.body;
        console.log('[router/arremates POST] Dados recebidos:', req.body);

        if (!op_numero || !produto || !quantidade_arrematada || !usuario_tiktik) {
            console.error('[router/arremates POST] Dados incompletos:', { op_numero, produto, quantidade_arrematada, usuario_tiktik });
            return res.status(400).json({ error: 'Dados incompletos. Campos obrigatórios: op_numero, produto, quantidade_arrematada, usuario_tiktik.' });
        }
        const quantidadeNum = parseInt(quantidade_arrematada);
        if (isNaN(quantidadeNum) || quantidadeNum <= 0) {
            console.error('[router/arremates POST] Quantidade inválida:', quantidade_arrematada);
            return res.status(400).json({ error: 'Quantidade arrematada deve ser um número positivo.' });
        }

        console.log(`[router/arremates POST] Inserindo novo registro de arremate para OP ${op_numero} com quantidade ${quantidadeNum}...`);
        const result = await dbCliente.query(
            `INSERT INTO arremates (op_numero, op_edit_id, produto, variante, quantidade_arrematada, usuario_tiktik, data_lancamento)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING *`,
            [op_numero, op_edit_id || null, produto, variante || null, quantidadeNum, usuario_tiktik]
        );

        if (result.rows.length === 0) {
            throw new Error('Falha ao inserir o registro de arremate, nenhum dado retornado.');
        }

        console.log('[router/arremates POST] Novo arremate salvo com sucesso:', result.rows[0]);
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[router/arremates POST] Erro não tratado:', {
            message: error.message,
            stack: error.stack, // Para debug
        });
        // O middleware de erro global do Express pode tratar isso, mas podemos ser específicos aqui.
        // Se o erro já tiver statusCode (como de permissão no middleware), ele será usado.
        res.status(error.statusCode || 500).json({ error: error.message || 'Erro interno ao salvar arremate.' });
    } finally {
        if (dbCliente) {
            console.log('[router/arremates POST] Liberando cliente do banco.');
            dbCliente.release();
        }
    }
});

// GET /api/arremates/
// GET /api/arremates/
router.get('/', async (req, res) => {
    const { dbCliente } = req;
    const { op_numero } = req.query;
    try {
        console.log('[router/arremates GET] Processando...');
        let queryText;
        let queryParams = [];

        // ATENÇÃO: Se quiser ser explícito e otimizar, mude o `SELECT *` para isto:
        // `SELECT id, op_numero, op_edit_id, produto, variante, quantidade_arrematada, quantidade_ja_embalada, usuario_tiktik, data_lancamento FROM arremates ...`
        // Por agora, `SELECT *` funciona se a coluna foi adicionada.
        if (op_numero) {
            console.log(`[router/arremates GET] Buscando arremates para OP específica: ${op_numero}`);
            queryText = 'SELECT * FROM arremates WHERE op_numero = $1 ORDER BY data_lancamento DESC';
            queryParams = [String(op_numero)];
        } else {
            console.log('[router/arremates GET] Buscando todos os arremates...');
            queryText = 'SELECT * FROM arremates ORDER BY data_lancamento DESC';
        }

        const result = await dbCliente.query(queryText, queryParams);
        console.log(`[router/arremates GET] ${result.rows.length} arremates encontrados.`);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/arremates GET] Erro não tratado:', {
            message: error.message,
            stack: error.stack,
        });
        res.status(error.statusCode || 500).json({ error: error.message || 'Erro interno ao buscar arremates.' });
    } finally {
        if (dbCliente) {
            console.log('[router/arremates GET] Liberando cliente do banco.');
            dbCliente.release();
        }
    }
});

router.put('/:id_arremate/registrar-embalagem', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    const { id_arremate } = req.params; // Pega o ID do arremate da URL
    const { quantidade_que_foi_embalada_desta_vez } = req.body;

    // Permissão: Quem pode chamar isso? Geralmente quem tem permissão para 'lancar-embalagem'
    if (!usuarioLogado.permissoes?.includes('lancar-embalagem')) {
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

    try {
        await dbCliente.query('BEGIN'); // Inicia uma transação

        // 1. Buscar o arremate para verificar a quantidade total arrematada e a já embalada
        const arremateResult = await dbCliente.query(
            'SELECT id, quantidade_arrematada, quantidade_ja_embalada FROM arremates WHERE id = $1 FOR UPDATE', // FOR UPDATE para bloquear a linha
            [idArremateNum]
        );

        if (arremateResult.rows.length === 0) {
            await dbCliente.query('ROLLBACK');
            return res.status(404).json({ error: `Arremate com ID ${idArremateNum} não encontrado.` });
        }

        const arremate = arremateResult.rows[0];
        const { quantidade_arrematada, quantidade_ja_embalada } = arremate;

        if (quantidade_ja_embalada + qtdEmbaladaNestaVez > quantidade_arrematada) {
            await dbCliente.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Quantidade a embalar excede o saldo disponível neste arremate.',
                saldoDisponivel: quantidade_arrematada - quantidade_ja_embalada,
                tentativaEmbalar: qtdEmbaladaNestaVez
            });
        }

        // 2. Atualizar a quantidade_ja_embalada
        const novaQtdJaEmbalada = quantidade_ja_embalada + qtdEmbaladaNestaVez;
        const updateResult = await dbCliente.query(
            'UPDATE arremates SET quantidade_ja_embalada = $1 WHERE id = $2 RETURNING *',
            [novaQtdJaEmbalada, idArremateNum]
        );

        await dbCliente.query('COMMIT'); // Finaliza a transação

        console.log(`[router/arremates PUT /:id/registrar-embalagem] Arremate ID ${idArremateNum} atualizado. Nova qtd_ja_embalada: ${novaQtdJaEmbalada}`);
        res.status(200).json({
            message: 'Arremate atualizado com sucesso.',
            arremateAtualizado: updateResult.rows[0]
        });

    } catch (error) {
        await dbCliente.query('ROLLBACK'); // Desfaz em caso de erro
        console.error(`[router/arremates PUT /:id/registrar-embalagem] Erro para Arremate ID ${idArremateNum}:`, error.message, error.stack);
        res.status(500).json({ error: 'Erro ao atualizar arremate.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;