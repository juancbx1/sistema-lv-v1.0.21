// api/producoes.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express'; // <<< ADICIONADO

const router = express.Router(); // <<< ADICIONADO
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// --- Suas funções verificarToken (pode ser movida para utils se repetida) ---
const verificarToken = (reqOriginal) => { // Renomeado para evitar conflito com req do Express
    // No Express, req já é o objeto da requisição, não precisa passar.
    // Se for usar como middleware do Express, o 'req' já estará disponível.
    // Para este exemplo, vamos assumir que o middleware abaixo o chamará.
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
// --------------------------------------------------------------------------

// <<< ADICIONADO: Middleware para este router >>>
router.use(async (req, res, next) => {
    let cliente;
    try {
        console.log(`[router/producoes] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarToken(req); // Usar o 'req' do Express aqui
        cliente = await pool.connect();
        req.dbCliente = cliente;
        next();
    } catch (error) {
        console.error('[router/producoes] Erro no middleware:', error.message);
        if (cliente) cliente.release();
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});



// POST /api/producoes/
router.post('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;

    try {
        console.log('[router/producoes POST] Iniciando lançamento de produção...');
        if (!usuarioLogado.permissoes.includes('lancar-producao')) {
            return res.status(403).json({ error: 'Permissão negada para lançar produção' });
        }

        const { 
            id, opNumero, etapaIndex, processo, produto, variacao, 
            maquina, quantidade, funcionario, data, lancadoPor 
        } = req.body;

        // Validações básicas (como você já tem)
        if (!id || !opNumero || etapaIndex === undefined || !processo || !produto || quantidade === undefined || !funcionario || !data || !lancadoPor) {
            return res.status(400).json({ error: 'Dados incompletos para lançamento de produção.' });
        }
        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade inválida.' });
        }

        let parsedDate; // Lógica de data como você já tem
        try {
            if (data && !data.includes('-03')) parsedDate = `${data}-03:00`; // Ajuste para seu fuso se necessário
            else parsedDate = data;
            const dateTest = new Date(parsedDate);
            if (isNaN(dateTest.getTime())) throw new Error('Formato de data inválido para produção.');
        } catch (error) {
            console.error('[router/producoes POST] Erro ao processar data:', error.message);
            return res.status(400).json({ error: 'Formato de data inválido para produção.' });
        }

        // --- LÓGICA PARA PONTOS ---
        let valorPontoAplicado = 1.00; // Default

        console.log(`[router/producoes POST] Buscando configuração de pontos para Produto: "${produto}", Processo: "${processo}"`);
        const configPontosQuery = `
            SELECT pontos_padrao 
            FROM configuracoes_pontos_processos
            WHERE produto_nome = $1 AND processo_nome = $2 AND ativo = TRUE
            LIMIT 1;
        `;
        const configPontosResult = await dbCliente.query(configPontosQuery, [produto, processo]);

        if (configPontosResult.rows.length > 0) {
            valorPontoAplicado = parseFloat(configPontosResult.rows[0].pontos_padrao);
            console.log(`[router/producoes POST] Configuração de pontos encontrada. Valor Ponto Aplicado: ${valorPontoAplicado}`);
        } else {
            console.log(`[router/producoes POST] Nenhuma configuração de pontos ativa encontrada. Usando default: ${valorPontoAplicado}`);
        }

        const pontosGerados = parsedQuantidade * valorPontoAplicado;
        console.log(`[router/producoes POST] Quantidade: ${parsedQuantidade}, Pontos Gerados: ${pontosGerados}`);
        // --- FIM DA LÓGICA PARA PONTOS ---

        // Verificar duplicidade (como você já tem, se necessário)
        // const checkDuplicate = await dbCliente.query(...);
        // if (checkDuplicate.rows.length > 0) {
        //     return res.status(409).json({ error: 'Lançamento duplicado detectado.' });
        // }

        console.log('[router/producoes POST] Inserindo produção no banco...');
        const insertProducaoQuery = `
            INSERT INTO producoes (
                id, op_numero, etapa_index, processo, produto, variacao, maquina, 
                quantidade, funcionario, data, lancado_por, 
                valor_ponto_aplicado, pontos_gerados 
                /* Adicione outras colunas como edicoes, assinada, version se você as preenche aqui */
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
            RETURNING *;
        `;
        // Ajuste os placeholders e o array de values conforme as colunas da sua tabela
        const result = await dbCliente.query(insertProducaoQuery, [
            id, opNumero, etapaIndex, processo, produto, variacao, maquina,
            parsedQuantidade, funcionario, parsedDate, lancadoPor,
            valorPontoAplicado, pontosGerados
        ]);
        
        console.log('[router/producoes POST] Produção lançada com sucesso:', result.rows[0].id);
        // Retornar o ID do frontend (id) junto com os dados do banco,
        // pois o ID do frontend é usado para controle de `lancamentosEmAndamento`
        res.status(201).json({ ...result.rows[0], id: id }); 

    } catch (error) {
        console.error('[router/producoes POST] Erro detalhado:', error.message, error.stack);
        const dbErrorDetail = error.detail || error.message;
        const dbErrorCode = error.code;
        // Tratar erro de constraint unique (chave primária 'id' por exemplo)
        if (dbErrorCode === '23505') { // unique_violation
             res.status(409).json({ error: 'Erro de conflito ao salvar produção (ex: ID duplicado).', details: dbErrorDetail, code: dbErrorCode });
        } else {
            res.status(500).json({ error: 'Erro interno ao salvar produção.', details: dbErrorDetail, code: dbErrorCode });
        }
    } finally {
        if (dbCliente) dbCliente.release();
    }
});



// <<< MODIFICADO: GET /api/producoes/ >>>
router.get('/', async (req, res) => {
    const { usuarioLogado, dbCliente } = req;
    try {
        // ... (sua lógica de permissão e query) ...
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
        const result = await dbCliente.query(queryText, queryParams);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/producoes] Erro no GET:', error);
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// <<< MODIFICADO: PUT /api/producoes/:id (ou pode ser PUT / e ID no corpo) >>>
// Se o ID estiver na URL, mude para router.put('/:id', ...)
router.put('/', async (req, res) => { // Assumindo ID no corpo, como antes
    const { usuarioLogado, dbCliente } = req;
    try {
        console.log('[router/producoes] Processando PUT...');
        const { id, quantidade, edicoes, assinada } = req.body;
        // ... (sua lógica de validação e permissão) ...
        if (!id || (quantidade === undefined && assinada === undefined && edicoes === undefined)) { // edicoes também pode ser opcional
            return res.status(400).json({ error: 'Dados incompletos. Pelo menos id e um campo para atualizar (quantidade, edicoes ou assinada) são necessários.' });
        }

        const checkResult = await dbCliente.query('SELECT * FROM producoes WHERE id = $1', [id]);
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

        const result = await dbCliente.query(
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
        if (dbCliente) dbCliente.release();
    }
});


// <<< MODIFICADO: DELETE /api/producoes/:id (ou pode ser DELETE / e ID no corpo) >>>
// Se o ID estiver na URL, mude para router.delete('/:id', ...)
router.delete('/', async (req, res) => { // Assumindo ID no corpo, como antes
    const { usuarioLogado, dbCliente } = req;
    try {
        console.log('[router/producoes] Processando DELETE...');
        if (!usuarioLogado.permissoes.includes('excluir-registro-producao')) {
            return res.status(403).json({ error: 'Permissão negada' });
        }
        const { id } = req.body; // ID vem do corpo da requisição
        if (!id) {
            return res.status(400).json({ error: 'ID não fornecido no corpo da requisição' });
        }
        const deleteResult = await dbCliente.query(
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
        if (dbCliente) dbCliente.release();
    }
});

export default router; // <<< EXPORTAR O ROUTER