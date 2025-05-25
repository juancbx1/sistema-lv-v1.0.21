// api/estoque.js
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

// --- Função verificarTokenInterna (mantenha ou centralize) ---
const verificarTokenInterna = (reqOriginal) => {
    // ... (código da sua função verificarTokenInterna, igual à de api/kits.js)
    const authHeader = reqOriginal.headers.authorization;
    if (!authHeader) throw new Error('Token não fornecido');
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('Token mal formatado');
    try {
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        // console.log('[router/estoque - verificarTokenInterna] Token decodificado:', decoded);
        return decoded;
    } catch (error) {
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};

// --- Middleware de Autenticação e Conexão ---
router.use(async (req, res, next) => {
    // Apenas autentica o token. Permissões específicas são checadas nas rotas.
    try {
        // console.log(`[router/estoque MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenInterna(req);
        // console.log(`[router/estoque MID] Usuário autenticado: ${req.usuarioLogado.nome || req.usuarioLogado.nome_usuario}`);
        next();
    } catch (error) {
        console.error('[router/estoque MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// --- Rotas do Estoque ---

// GET /api/estoque/saldo
router.get('/saldo', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        if (!permissoesCompletas.includes('acesso-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar saldo do estoque.' });
        }

        const { produto_nome, variante_nome } = req.query;
        // console.log('[router/estoque GET /saldo] Buscando saldo...');
        let queryText = `
            SELECT 
                produto_nome, 
                COALESCE(variante_nome, '-') as variante_nome,
                SUM(CASE 
                    WHEN tipo_movimento LIKE 'ENTRADA%' OR tipo_movimento = 'AJUSTE_BALANCO_POSITIVO' THEN quantidade
                    WHEN tipo_movimento LIKE 'SAIDA%' OR tipo_movimento = 'AJUSTE_BALANCO_NEGATIVO' THEN -ABS(quantidade) 
                    ELSE 0 
                END) AS saldo_atual
            FROM estoque_movimentos
        `; // Ajustado para somar entradas e subtrair saídas
        const queryParams = [];
        const whereClauses = [];
        let paramIndex = 1;

        if (produto_nome) {
            whereClauses.push(`produto_nome ILIKE $${paramIndex++}`);
            queryParams.push(`%${produto_nome}%`);
        }
        if (variante_nome && variante_nome !== '-') {
            whereClauses.push(`variante_nome ILIKE $${paramIndex++}`);
            queryParams.push(`%${variante_nome}%`);
        } else if (variante_nome === '-') {
            whereClauses.push(`variante_nome IS NULL`);
        }

        if (whereClauses.length > 0) {
            queryText += ' WHERE ' + whereClauses.join(' AND ');
        }
        queryText += ' GROUP BY produto_nome, variante_nome ORDER BY produto_nome, variante_nome';

        const result = await dbCliente.query(queryText, queryParams);
        // console.log(`[router/estoque GET /saldo] ${result.rows.length} agrupamentos de saldo encontrados.`);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/estoque GET /saldo] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(500).json({ error: 'Erro ao buscar saldo do estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/estoque/entrada-producao
router.post('/entrada-producao', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        if (!permissoesCompletas.includes('lancar-embalagem')) { // Ou uma permissão mais específica como 'registrar-entrada-estoque-producao'
            return res.status(403).json({ error: 'Permissão negada para registrar entrada de produção no estoque.' });
        }

        const { produto_nome, variante_nome, quantidade_entrada, id_arremate_origem, observacao_opcional } = req.body;

        if (!produto_nome || quantidade_entrada === undefined) {
            return res.status(400).json({ error: 'Campos obrigatórios: produto_nome, quantidade_entrada.' });
        }
        const quantidade = parseInt(quantidade_entrada);
        if (isNaN(quantidade) || quantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade de entrada deve ser um número positivo.' });
        }

        const varianteParaDB = (variante_nome === '' || variante_nome === '-' || variante_nome === undefined) ? null : variante_nome;
        // console.log(`[router/estoque POST /entrada-producao] Registrando: P:${produto_nome} V:${varianteParaDB || '-'} Qtd:${quantidade} OrigemArremateID:${id_arremate_origem}`);
        
        const queryText = `
            INSERT INTO estoque_movimentos 
                (produto_nome, variante_nome, quantidade, tipo_movimento, origem_arremate_id, usuario_responsavel, observacao, data_movimento)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *;
        `;
        
        const result = await dbCliente.query(queryText, [
            produto_nome, varianteParaDB, quantidade,
            'ENTRADA_PRODUCAO_ARREMATE', // Tipo de movimento
            id_arremate_origem || null,
            (usuarioLogado.nome || usuarioLogado.nome_usuario),
            observacao_opcional || `Entrada de produção finalizada (Arremate ID: ${id_arremate_origem || 'N/A'})`
        ]);

        // console.log('[router/estoque POST /entrada-producao] Movimento de entrada registrado:', result.rows[0]);
        res.status(201).json({
            message: 'Entrada no estoque registrada com sucesso.',
            movimentoRegistrado: result.rows[0],
        });

    } catch (error) {
        console.error('[router/estoque POST /entrada-producao] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(500).json({ error: 'Erro ao registrar entrada no estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});


// GET /api/estoque/movimentos
router.get('/movimentos', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        
        if (!permissoesCompletas.includes('gerenciar-estoque') && !permissoesCompletas.includes('acesso-estoque-completo')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar histórico de movimentos do estoque.' });
        }

        const { produto_nome, variante_nome, tipo_movimento, data_inicio, data_fim, limit = 50, page = 1 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // console.log('[router/estoque GET /movimentos] Buscando histórico...');
        let queryText = `SELECT * FROM estoque_movimentos`;
        let countQueryText = `SELECT COUNT(*) as count FROM estoque_movimentos`; // Adicionado alias
        
        const queryParams = [];
        const whereClauses = [];
        let paramIndex = 1;

        if (produto_nome) {
            whereClauses.push(`produto_nome ILIKE $${paramIndex++}`);
            queryParams.push(`%${produto_nome}%`);
        }
        if (variante_nome && variante_nome !== '-') {
            whereClauses.push(`variante_nome ILIKE $${paramIndex++}`);
            queryParams.push(`%${variante_nome}%`);
        } else if (variante_nome === '-') {
            whereClauses.push(`variante_nome IS NULL`);
        }
        if (tipo_movimento) {
            whereClauses.push(`tipo_movimento = $${paramIndex++}`);
            queryParams.push(tipo_movimento);
        }
        if (data_inicio) {
            whereClauses.push(`DATE(data_movimento) >= $${paramIndex++}`); // Compara apenas a data
            queryParams.push(data_inicio);
        }
        if (data_fim) {
            whereClauses.push(`DATE(data_movimento) <= $${paramIndex++}`); // Compara apenas a data
            queryParams.push(data_fim);
        }

        const whereCondition = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';
        queryText += whereCondition;
        countQueryText += whereCondition;
        
        queryText += ` ORDER BY data_movimento DESC, id DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(parseInt(limit), offset);

        const result = await dbCliente.query(queryText, queryParams);
        const totalResult = await dbCliente.query(countQueryText, queryParams.slice(0, paramIndex - 3)); // Remove limit e offset dos params
        
        const total = parseInt(totalResult.rows[0].count);
        const pages = Math.ceil(total / parseInt(limit));

        // console.log(`[router/estoque GET /movimentos] ${result.rows.length} movimentos encontrados (Total: ${total}).`);
        res.status(200).json({ rows: result.rows, total, page: parseInt(page), pages });
    } catch (error) {
        console.error('[router/estoque GET /movimentos] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(500).json({ error: 'Erro ao buscar movimentos do estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/estoque/movimento-manual
router.post('/movimento-manual', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
    
        if (!permissoesCompletas.includes('gerenciar-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para realizar movimentos manuais de estoque.' });
        }

        const { produto_nome, variante_nome, quantidade_movimentada, tipo_operacao, observacao } = req.body;

        if (!produto_nome || quantidade_movimentada === undefined || !tipo_operacao) {
            return res.status(400).json({ error: 'Campos obrigatórios: produto_nome, quantidade_movimentada, tipo_operacao.' });
        }
        const qtdMov = parseInt(quantidade_movimentada);
        if ((tipo_operacao === 'ENTRADA_MANUAL' || tipo_operacao === 'SAIDA_MANUAL') && (isNaN(qtdMov) || qtdMov <= 0)) {
            return res.status(400).json({ error: 'Quantidade para entrada/saída manual deve ser um número positivo.' });
        }
        if (tipo_operacao === 'BALANCO' && (isNaN(qtdMov) || qtdMov < 0)) {
            return res.status(400).json({ error: 'Quantidade para balanço deve ser um número positivo ou zero.' });
        }

        const varianteParaDB = (variante_nome === '' || variante_nome === '-' || variante_nome === undefined) ? null : variante_nome;
        let movimentoReal;
        let tipoMovimentoDB;

        await dbCliente.query('BEGIN');
        if (tipo_operacao === 'BALANCO') {
            const saldoAtualQuery = await dbCliente.query(
                `SELECT COALESCE(SUM(CASE 
                                    WHEN tipo_movimento LIKE 'ENTRADA%' OR tipo_movimento = 'AJUSTE_BALANCO_POSITIVO' THEN quantidade
                                    WHEN tipo_movimento LIKE 'SAIDA%' OR tipo_movimento = 'AJUSTE_BALANCO_NEGATIVO' THEN -ABS(quantidade)
                                    ELSE 0 
                                 END), 0) AS saldo 
                 FROM estoque_movimentos 
                 WHERE produto_nome = $1 AND 
                       ( ($2::text IS NULL AND variante_nome IS NULL) OR variante_nome = $2 )`,
                [produto_nome, varianteParaDB]
            );
            const saldoAtual = parseInt(saldoAtualQuery.rows[0].saldo);
            movimentoReal = qtdMov - saldoAtual;
            tipoMovimentoDB = movimentoReal >= 0 ? 'AJUSTE_BALANCO_POSITIVO' : 'AJUSTE_BALANCO_NEGATIVO';
            if (movimentoReal === 0) {
                await dbCliente.query('ROLLBACK'); // Não precisa de commit se não houve alteração
                return res.status(200).json({ message: 'Nenhum ajuste necessário, saldo já confere.', saldo_atual: saldoAtual, novo_saldo_desejado: qtdMov });
            }
        } else if (tipo_operacao === 'ENTRADA_MANUAL') {
            movimentoReal = qtdMov;
            tipoMovimentoDB = 'ENTRADA_MANUAL';
        } else if (tipo_operacao === 'SAIDA_MANUAL') {
            movimentoReal = -qtdMov; // Saída é negativa
            tipoMovimentoDB = 'SAIDA_MANUAL';
            // Opcional: Verificar se há saldo suficiente
        } else {
            await dbCliente.query('ROLLBACK');
            return res.status(400).json({ error: 'Tipo de operação inválido.' });
        }
        
        const result = await dbCliente.query(
            `INSERT INTO estoque_movimentos 
                (produto_nome, variante_nome, quantidade, tipo_movimento, usuario_responsavel, observacao, data_movimento)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING *;`,
            [
                produto_nome, varianteParaDB, movimentoReal, tipoMovimentoDB,
                (usuarioLogado.nome || usuarioLogado.nome_usuario),
                observacao || null
            ]
        );
        await dbCliente.query('COMMIT');
        // console.log(`[router/estoque POST /movimento-manual] Movimento manual (${tipoMovimentoDB}) registrado:`, result.rows[0]);
        res.status(201).json({
            message: `Movimento de '${tipo_operacao}' registrado com sucesso.`,
            movimentoRegistrado: result.rows[0]
        });
    } catch (error) {
        if(dbCliente) await dbClient.query('ROLLBACK');
        console.error('[router/estoque POST /movimento-manual] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(500).json({ error: 'Erro ao registrar movimento manual de estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;