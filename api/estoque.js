// api/estoque.js
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

// --- Middleware de Autenticação e Conexão ---
const verificarTokenInterna = (reqOriginal) => {
    console.log('[router/estoque - verificarTokenInterna] Verificando token...');
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
        console.error('[router/estoque - verificarTokenInterna] Erro ao verificar token:', error.message);
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};

router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/estoque] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarTokenInterna(req);
        console.log('[router/estoque middleware] Usuário autenticado:', req.usuarioLogado.nome);

        const podeAcessarEstoque = req.usuarioLogado.permissoes?.includes('acesso-estoque');
        const podeLancarEmbalagem = req.usuarioLogado.permissoes?.includes('lancar-embalagem');
        const podeGerenciarEstoque = req.usuarioLogado.permissoes?.includes('gerenciar-estoque'); // Nova permissão sugerida

        // Ajuste fino das permissões dependendo da rota que será acessada
        // O middleware geral apenas estabelece a conexão se houver alguma permissão relacionada ao estoque.
        // As rotas específicas farão verificações mais granulares.
        if (!podeAcessarEstoque && !podeLancarEmbalagem && !podeGerenciarEstoque) {
             console.warn(`[router/estoque middleware] Nenhuma permissão de estoque encontrada para ${req.usuarioLogado.nome}`);
             const err = new Error('Permissão negada para acessar funcionalidades de estoque.');
             err.statusCode = 403;
             throw err;
        }
        
        cliente = await pool.connect();
        req.dbCliente = cliente;
        console.log('[router/estoque middleware] Conexão com o banco estabelecida.');
        next();
    } catch (error) {
        console.error('[router/estoque middleware] Erro:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// --- Rotas do Estoque ---

// GET /api/estoque/saldo - Listar saldo atual dos itens em estoque
router.get('/saldo', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    // Permissão para visualizar saldo
    if (!usuarioLogado.permissoes?.includes('acesso-estoque')) {
        return res.status(403).json({ error: 'Permissão negada para visualizar saldo do estoque.' });
    }

    const { produto_nome, variante_nome } = req.query;
    try {
        console.log('[router/estoque GET /saldo] Buscando saldo do estoque...');
        let queryText = `
            SELECT 
                produto_nome, 
                COALESCE(variante_nome, '-') as variante_nome,  -- Mostrar '-' se variante_nome for NULL
                SUM(quantidade) AS saldo_atual 
            FROM estoque_movimentos
        `;
        const queryParams = [];
        const whereClauses = [];
        let paramIndex = 1;

        if (produto_nome) {
            whereClauses.push(`produto_nome ILIKE $${paramIndex++}`);
            queryParams.push(`%${produto_nome}%`);
        }
        if (variante_nome && variante_nome !== '-') { // Se buscar por variante específica
            whereClauses.push(`variante_nome ILIKE $${paramIndex++}`);
            queryParams.push(`%${variante_nome}%`);
        } else if (variante_nome === '-') { // Se buscar por itens sem variante
            whereClauses.push(`variante_nome IS NULL`);
        }


        if (whereClauses.length > 0) {
            queryText += ' WHERE ' + whereClauses.join(' AND ');
        }
        queryText += ' GROUP BY produto_nome, variante_nome ORDER BY produto_nome, variante_nome';

        const result = await dbCliente.query(queryText, queryParams);
        console.log(`[router/estoque GET /saldo] ${result.rows.length} agrupamentos de saldo encontrados.`);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/estoque GET /saldo] Erro:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao buscar saldo do estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// POST /api/estoque/entrada-producao - Registrar entrada de produção no estoque
router.post('/entrada-producao', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    if (!usuarioLogado.permissoes?.includes('lancar-embalagem')) {
        return res.status(403).json({ error: 'Permissão negada para registrar entrada de produção no estoque.' });
    }

    const { produto_nome, variante_nome, quantidade_entrada, id_arremate_origem } = req.body;

    if (!produto_nome || quantidade_entrada === undefined) {
        return res.status(400).json({ error: 'Campos obrigatórios: produto_nome, quantidade_entrada.' });
    }
    const quantidade = parseInt(quantidade_entrada);
    if (isNaN(quantidade) || quantidade <= 0) {
        return res.status(400).json({ error: 'Quantidade de entrada deve ser um número positivo.' });
    }

    try {
        const varianteParaDB = (variante_nome === '' || variante_nome === '-') ? null : variante_nome;
        console.log(`[router/estoque POST /entrada-producao] Registrando movimento: P:${produto_nome} V:${varianteParaDB || '-'} Qtd:${quantidade} OrigemArremateID:${id_arremate_origem}`);
        
        const queryText = `
            INSERT INTO estoque_movimentos 
                (produto_nome, variante_nome, quantidade, tipo_movimento, origem_arremate_id, usuario_responsavel)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        
        const result = await dbCliente.query(queryText, [
            produto_nome, 
            varianteParaDB, 
            quantidade, // Positivo para entrada
            'ENTRADA_PRODUCAO_ARREMATE',
            id_arremate_origem || null,
            usuarioLogado.nome 
        ]);

        console.log('[router/estoque POST /entrada-producao] Movimento de entrada registrado com sucesso:', result.rows[0]);
        res.status(201).json({
            message: 'Entrada no estoque registrada com sucesso.',
            movimentoRegistrado: result.rows[0],
            // id_arremate_processado: id_arremate_origem // 'movimentoRegistrado' já contém origem_arremate_id
        });

    } catch (error) {
        console.error('[router/estoque POST /entrada-producao] Erro:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao registrar entrada no estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});


// GET /api/estoque/movimentos - Listar todos os movimentos de estoque (para auditoria/histórico)
router.get('/movimentos', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    // Permissão para visualizar movimentos (geralmente mais restrita)
    if (!usuarioLogado.permissoes?.includes('gerenciar-estoque') && !usuarioLogado.permissoes?.includes('acesso-estoque-completo')) { // Exemplo de permissão
        return res.status(403).json({ error: 'Permissão negada para visualizar histórico de movimentos do estoque.' });
    }

    // Adicionar filtros de data, produto, tipo, etc., se necessário, via req.query
    const { produto_nome, variante_nome, tipo_movimento, data_inicio, data_fim, limit = 50, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    try {
        console.log('[router/estoque GET /movimentos] Buscando histórico de movimentos...');
        let queryText = `SELECT * FROM estoque_movimentos`;
        let countQueryText = `SELECT COUNT(*) FROM estoque_movimentos`;
        
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
            whereClauses.push(`data_movimento >= $${paramIndex++}`);
            queryParams.push(data_inicio); // Espera formato 'YYYY-MM-DD'
        }
        if (data_fim) {
            whereClauses.push(`data_movimento <= $${paramIndex++}`);
            queryParams.push(data_fim + 'T23:59:59.999Z'); // Inclui o dia todo
        }

        if (whereClauses.length > 0) {
            const condition = ' WHERE ' + whereClauses.join(' AND ');
            queryText += condition;
            countQueryText += condition;
        }
        queryText += ` ORDER BY data_movimento DESC, id DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(limit, offset);

        const result = await dbCliente.query(queryText, queryParams);
        const totalResult = await dbCliente.query(countQueryText, queryParams.slice(0, paramIndex - 3)); // Remove limit e offset dos params da contagem
        
        const total = parseInt(totalResult.rows[0].count);
        const pages = Math.ceil(total / limit);

        console.log(`[router/estoque GET /movimentos] ${result.rows.length} movimentos encontrados (Total: ${total}).`);
        res.status(200).json({
            rows: result.rows,
            total,
            page: parseInt(page),
            pages
        });
    } catch (error) {
        console.error('[router/estoque GET /movimentos] Erro:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao buscar movimentos do estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// NOVA ROTA: POST /api/estoque/movimento-manual
router.post('/movimento-manual', async (req, res) => {
    const { dbCliente, usuarioLogado } = req;
    
    // Permissão para gerenciar estoque (ex: 'gerenciar-estoque')
    if (!usuarioLogado.permissoes?.includes('gerenciar-estoque')) {
        return res.status(403).json({ error: 'Permissão negada para realizar movimentos manuais de estoque.' });
    }

    const { 
        produto_nome, 
        variante_nome, 
        quantidade_movimentada, // Quantidade a ser somada/subtraída, ou novo valor para balanço
        tipo_operacao, // Ex: 'ENTRADA_MANUAL', 'SAIDA_MANUAL', 'BALANCO'
        observacao 
    } = req.body;

    if (!produto_nome || quantidade_movimentada === undefined || !tipo_operacao) {
        return res.status(400).json({ error: 'Campos obrigatórios: produto_nome, quantidade_movimentada, tipo_operacao.' });
    }

    const qtdMov = parseInt(quantidade_movimentada);
    // Para balanço, qtdMov é o novo saldo. Para entrada/saída, é o delta.
    // A validação de qtdMov <= 0 só se aplica para entrada/saída diretas.
    if ((tipo_operacao === 'ENTRADA_MANUAL' || tipo_operacao === 'SAIDA_MANUAL') && (isNaN(qtdMov) || qtdMov <= 0)) {
        return res.status(400).json({ error: 'Quantidade para entrada/saída manual deve ser um número positivo.' });
    }
    if (tipo_operacao === 'BALANCO' && (isNaN(qtdMov) || qtdMov < 0)) {
        return res.status(400).json({ error: 'Quantidade para balanço deve ser um número positivo ou zero.' });
    }

    const varianteParaDB = (variante_nome === '' || variante_nome === '-') ? null : variante_nome;
    let movimentoReal; // Quantidade a ser registrada no movimento
    let tipoMovimentoDB;

    try {
        await dbCliente.query('BEGIN');

        if (tipo_operacao === 'BALANCO') {
            // Calcular saldo atual para determinar a diferença
            const saldoAtualQuery = await dbCliente.query(
                `SELECT COALESCE(SUM(quantidade), 0) AS saldo 
                 FROM estoque_movimentos 
                 WHERE produto_nome = $1 AND 
                       ( ($2::text IS NULL AND variante_nome IS NULL) OR variante_nome = $2 )`,
                [produto_nome, varianteParaDB]
            );
            const saldoAtual = parseInt(saldoAtualQuery.rows[0].saldo);
            
            movimentoReal = qtdMov - saldoAtual; // qtdMov é o novo saldo desejado
            tipoMovimentoDB = movimentoReal >= 0 ? 'AJUSTE_BALANCO_POSITIVO' : 'AJUSTE_BALANCO_NEGATIVO';
            if (movimentoReal === 0) {
                await dbCliente.query('ROLLBACK');
                return res.status(2_0).json({ message: 'Nenhum ajuste necessário, saldo já confere.', saldo_atual: saldoAtual, novo_saldo_desejado: qtdMov });
            }
        } else if (tipo_operacao === 'ENTRADA_MANUAL') {
            movimentoReal = qtdMov; // Positivo
            tipoMovimentoDB = 'ENTRADA_MANUAL';
        } else if (tipo_operacao === 'SAIDA_MANUAL') {
            movimentoReal = -qtdMov; // Negativo
            tipoMovimentoDB = 'SAIDA_MANUAL';

            // Opcional: Verificar se há saldo suficiente para a saída manual
            const saldoAtualQuery = await dbCliente.query(
                `SELECT COALESCE(SUM(quantidade), 0) AS saldo FROM estoque_movimentos WHERE produto_nome = $1 AND ( ($2::text IS NULL AND variante_nome IS NULL) OR variante_nome = $2 )`,
                [produto_nome, varianteParaDB]
            );
            if (parseInt(saldoAtualQuery.rows[0].saldo) < qtdMov) {
                await dbCliente.query('ROLLBACK');
                return res.status(400).json({ error: `Saldo insuficiente para saída manual. Saldo atual: ${saldoAtualQuery.rows[0].saldo}`});
            }
        } else {
            await dbCliente.query('ROLLBACK');
            return res.status(400).json({ error: 'Tipo de operação inválido.' });
        }
        
        const result = await dbCliente.query(
            `INSERT INTO estoque_movimentos 
                (produto_nome, variante_nome, quantidade, tipo_movimento, usuario_responsavel, observacao)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *;`,
            [
                produto_nome, 
                varianteParaDB, 
                movimentoReal, 
                tipoMovimentoDB,
                usuarioLogado.nome,
                observacao || null
            ]
        );

        await dbCliente.query('COMMIT');
        console.log(`[router/estoque POST /movimento-manual] Movimento manual (${tipoMovimentoDB}) registrado:`, result.rows[0]);
        res.status(201).json({
            message: `Movimento de '${tipo_operacao}' registrado com sucesso.`,
            movimentoRegistrado: result.rows[0]
        });

    } catch (error) {
        await dbCliente.query('ROLLBACK');
        console.error('[router/estoque POST /movimento-manual] Erro:', error.message, error.stack);
        res.status(500).json({ error: 'Erro ao registrar movimento manual de estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;