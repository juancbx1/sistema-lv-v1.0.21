// api/producoes.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importe a função de buscar permissões completas
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; 

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarToken
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
        // console.log('[api/producoes - verificarToken] Token decodificado:', decoded);
        return decoded;
    } catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
router.use(async (req, res, next) => {
    try {
        // console.log(`[router/producoes MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarToken(req);
        next();
    } catch (error) {
        console.error('[router/producoes MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

// POST /api/producoes/
router.post('/', async (req, res) => {
    const { usuarioLogado } = req; // Do token
    let dbClient; 

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API Producoes POST] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('lancar-producao')) {
            return res.status(403).json({ error: 'Permissão negada para lançar produção.' });
        }

        const {
            id, opNumero, etapaIndex, processo, produto, variacao,
            maquina, quantidade, funcionario, data, lancadoPor
        } = req.body;

        if (!id || !opNumero || etapaIndex === undefined || !processo || !produto || quantidade === undefined || !funcionario || !data || !lancadoPor) {
            return res.status(400).json({ error: 'Dados incompletos para lançamento de produção.' });
        }
        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade < 0) { 
            return res.status(400).json({ error: 'Quantidade inválida (deve ser um número >= 0).' });
        }
        // Se o frontend já garante que a quantidade > 0 para não-tiktik, a validação acima é suficiente.

        let parsedDate;
        try {
            parsedDate = data; 
            const dateTest = new Date(parsedDate);
            if (isNaN(dateTest.getTime())) throw new Error('Formato de data inválido para produção.');
        } catch (error) {
            console.error('[router/producoes POST] Erro ao processar data:', error.message);
            return res.status(400).json({ error: 'Formato de data inválido para produção.' });
        }

        let valorPontoAplicado = 1.00; // Default
        const configPontosResult = await dbClient.query(
            `SELECT pontos_padrao FROM configuracoes_pontos_processos
             WHERE produto_nome = $1 AND processo_nome = $2 AND ativo = TRUE LIMIT 1;`,
            [produto, processo]
        );

        if (configPontosResult.rows.length > 0) {
            valorPontoAplicado = parseFloat(configPontosResult.rows[0].pontos_padrao);
        } else {
        }

        const pontosGerados = parsedQuantidade * valorPontoAplicado;

        const result = await dbClient.query(
            `INSERT INTO producoes (
                id, op_numero, etapa_index, processo, produto, variacao, maquina,
                quantidade, funcionario, data, lancado_por,
                valor_ponto_aplicado, pontos_gerados
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;`,
            [
                id, opNumero, etapaIndex, processo, produto, variacao, maquina,
                parsedQuantidade, funcionario, parsedDate, lancadoPor,
                valorPontoAplicado, pontosGerados
            ]
        );

        // console.log('[router/producoes POST] Produção lançada com sucesso:', result.rows[0].id);
        res.status(201).json({ ...result.rows[0], id: id }); // Retorna o ID original do frontend

    } catch (error) {
        console.error('[router/producoes POST] Erro detalhado:', error.message, error.stack ? error.stack.substring(0,500):"");
        const dbErrorCode = error.code;
        if (dbErrorCode === '23505') { // Unique constraint violation
             res.status(409).json({ error: 'Erro de conflito ao salvar produção (ex: ID duplicado).', details: error.detail, code: dbErrorCode });
        } else {
            res.status(500).json({ error: 'Erro interno ao salvar produção.', details: error.message, code: dbErrorCode });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/producoes/
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        dbClient = await pool.connect();
        // console.log(`[API Producoes GET /] Usuário do token: ${usuarioLogado.nome || usuarioLogado.nome_usuario}, ID: ${usuarioLogado.id}`);

        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API Producoes GET /] Permissões Completas DB para ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        const podeGerenciarTudo = permissoesCompletas.includes('acesso-gerenciar-producao');
        const podeVerProprias = permissoesCompletas.includes('ver-proprias-producoes');

        if (!podeGerenciarTudo && !podeVerProprias) {
            // console.log('[API Producoes GET /] Acesso negado.');
            return res.status(403).json({ error: 'Permissão negada para visualizar produções.' });
        }

        let queryText;
        let queryParams = [];
        const opNumeroRaw = req.query.op_numero;
        const opNumero = opNumeroRaw ? String(opNumeroRaw).trim() : undefined;

        if (opNumero) {
            queryText = 'SELECT * FROM producoes WHERE op_numero = $1 ORDER BY data DESC';
            queryParams = [opNumero];
            // console.log(`[API Producoes GET /] Buscando por OP específica: ${opNumero}`);
        } else if (podeGerenciarTudo) {
            queryText = 'SELECT * FROM producoes ORDER BY data DESC';
            // console.log(`[API Producoes GET /] Usuário ${usuarioLogado.nome || usuarioLogado.nome_usuario} (com acesso-gerenciar-producao) buscando todas.`);
        } else if (podeVerProprias) {
            const nomeFuncionario = usuarioLogado.nome; 
            if (!nomeFuncionario) {
                console.error("[API Producoes GET /] ERRO: Campo 'nome' não encontrado no token JWT para filtrar produções próprias.");
                return res.status(400).json({ error: "Falha ao identificar funcionário para filtro de produções." });
            }
            queryText = 'SELECT * FROM producoes WHERE funcionario = $1 ORDER BY data DESC';
            queryParams = [nomeFuncionario];
            // console.log(`[API Producoes GET /] Usuário ${nomeFuncionario} (com ver-proprias-producoes) buscando apenas as suas.`);
        } else {
            // console.warn('[API Producoes GET /] Lógica de permissão não cobriu um caso. Negando acesso.');
            return res.status(403).json({ error: 'Configuração de acesso inválida para produções.' });
        }
        
        const result = await dbClient.query(queryText, queryParams);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API Producoes GET /] Erro na rota:', error.message, error.stack ? error.stack.substring(0,500):"");
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message || 'Erro interno ao buscar produções.' });
    } finally {
        if (dbClient) {
            dbClient.release();
            // console.log('[API Producoes GET /] Cliente DB liberado.');
        }
    }
});

// PUT /api/producoes/
router.put('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletasDoUsuarioLogado = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        const { id, quantidade, edicoes, assinada, funcionario } = req.body; // Desestruturação

        // ***** NOVOS LOGS DETALHADOS *****
        console.log(`[API Producoes PUT] req.body recebido:`, JSON.stringify(req.body));
        console.log(`[API Producoes PUT] Valores desestruturados: id=${id} (tipo: ${typeof id}), quantidade=${quantidade} (tipo: ${typeof quantidade}), edicoes=${edicoes} (tipo: ${typeof edicoes}), assinada=${assinada} (tipo: ${typeof assinada})`);
        // ***** FIM DOS NOVOS LOGS *****

        if (!id) {
            return res.status(400).json({ error: 'ID da produção é obrigatório.' });
        }
        if (assinada === undefined && quantidade === undefined && edicoes === undefined) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar fornecido.' });
        }

        const producaoResult = await dbClient.query('SELECT funcionario FROM producoes WHERE id = $1', [id]);
        if (producaoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Produção não encontrada para atualização.' });
        }
        const funcionarioDaProducao = producaoResult.rows[0].funcionario;
        const nomeUsuarioLogado = usuarioLogado.nome || usuarioLogado.nome_usuario;
        
        const isOwner = funcionarioDaProducao === nomeUsuarioLogado;
        // Condição para 'apenas assinar': 'assinada' deve ser explicitamente true, e os outros campos de dados não devem estar presentes
        const isAttemptingToSignOnly = (assinada === true && quantidade === undefined && edicoes === undefined);

        console.log(`[API Producoes PUT] Detalhes para decisão: isOwner=${isOwner}, isAttemptingToSignOnly=${isAttemptingToSignOnly}, temPermissaoAssinar=${permissoesCompletasDoUsuarioLogado.includes('assinar-propria-producao-costureira')}, temPermissaoEditarGeral=${permissoesCompletasDoUsuarioLogado.includes('editar-registro-producao')}`);

        let podeProsseguir = false;
        let acaoPermitida = null;

        if (permissoesCompletasDoUsuarioLogado.includes('editar-registro-producao')) {
            podeProsseguir = true;
            acaoPermitida = 'editar_tudo';
            console.log(`[API Producoes PUT] Acesso 'editar_tudo' permitido para user: ${nomeUsuarioLogado} via 'editar-registro-producao'.`);
        } else if (
            isOwner &&
            isAttemptingToSignOnly && // Usa a nova variável combinada
            permissoesCompletasDoUsuarioLogado.includes('assinar-propria-producao-costureira')
        ) {
            podeProsseguir = true;
            acaoPermitida = 'apenas_assinar';
            console.log(`[API Producoes PUT] Acesso 'apenas_assinar' permitido para costureira ${nomeUsuarioLogado}.`);
        }

        if (!podeProsseguir) {
            // O console.warn anterior já mostrava os dados, podemos mantê-lo ou usar o novo log de detalhes acima
            console.warn(`[API Producoes PUT] Permissão REALMENTE negada. (Ver log 'Detalhes para decisão' acima)`);
            return res.status(403).json({ error: 'Permissão negada para alterar este registro de produção.' });
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (acaoPermitida === 'editar_tudo') {
            if (quantidade !== undefined) {
                updateFields.push(`quantidade = $${paramIndex++}`);
                updateValues.push(quantidade);
            }
            if (edicoes !== undefined) {
                updateFields.push(`edicoes = $${paramIndex++}`);
                updateValues.push(JSON.stringify(edicoes)); // Lembre de converter para JSON se for um objeto/array
            }
            if (assinada !== undefined) {
                updateFields.push(`assinada = $${paramIndex++}`);
                updateValues.push(assinada);
            }
            
            if (funcionario !== undefined && funcionario.trim() !== '') {
                updateFields.push(`funcionario = $${paramIndex++}`);
                updateValues.push(funcionario);
            }

        } else if (acaoPermitida === 'apenas_assinar') {
            if (assinada === true) { // Garante que está realmente assinando
                updateFields.push(`assinada = $${paramIndex++}`);
                updateValues.push(true);
            } else {
                console.error("[API Producoes PUT] Erro lógico: 'apenas_assinar' permitido, mas 'assinada' não é true no body.");
                return res.status(400).json({ error: "Dados inválidos para assinatura (campo 'assinada' esperado como true)." });
            }
        }

         if (updateFields.length === 0) {
            return res.status(400).json({ error: "Nenhum campo válido para atualização." });
        }
        
        updateValues.push(id); 
        const queryUpdate = `UPDATE producoes SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        
        const result = await dbClient.query(queryUpdate, updateValues);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Produção não encontrada após verificações (não deveria acontecer)." });
        }
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error('[router/producoes PUT] Erro:', error.message, error.stack ? error.stack.substring(0,500):"");
        res.status(500).json({ error: 'Erro ao atualizar produção.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});



// DELETE /api/producoes/
router.delete('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        // console.log(`[API Producoes DELETE] Permissões de ${usuarioLogado.nome || usuarioLogado.nome_usuario}:`, permissoesCompletas);

        if (!permissoesCompletas.includes('excluir-registro-producao')) {
            return res.status(403).json({ error: 'Permissão negada para excluir registro de produção.' });
        }
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'ID não fornecido.' });
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
        console.error('[router/producoes DELETE] Erro:', error.message, error.stack ? error.stack.substring(0,500):"");
        res.status(500).json({ error: 'Erro ao excluir produção.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

//ENDPOINT PARA TIKTIK ASSINAR UMA OP (PRODUÇÃO)
router.put('/assinar-tiktik-op', async (req, res) => {
    const { usuarioLogado } = req; 
    const { id_producao_op } = req.body;
    let dbClient;

    if (!id_producao_op) {
        return res.status(400).json({ error: 'ID da produção da OP é obrigatório.' });
    }

    try {
        dbClient = await pool.connect();
        const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        // Verificar se o usuário é um Tiktik e tem permissão para assinar suas próprias OPs
        // (Você pode criar uma permissão específica como 'assinar-propria-op-tiktik')
        // Por agora, vamos verificar se ele é o funcionário da OP.
        if (!permissoesUsuario.includes('assinar-propria-producao-tiktik')) { // CRIE ESSA PERMISSÃO
             return res.status(403).json({ error: 'Permissão negada para assinar esta produção de OP.' });
        }

        const producaoResult = await dbClient.query(
            'SELECT funcionario FROM producoes WHERE id = $1',
            [id_producao_op]
        );

        if (producaoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Produção da OP não encontrada.' });
        }

        const funcionarioDaProducao = producaoResult.rows[0].funcionario;
        if (funcionarioDaProducao !== usuarioLogado.nome) {
            return res.status(403).json({ error: 'Você só pode assinar produções de OP feitas por você.' });
        }

        const updateResult = await dbClient.query(
            'UPDATE producoes SET assinada_por_tiktik = TRUE WHERE id = $1 RETURNING *',
            [id_producao_op]
        );

        if (updateResult.rowCount === 0) {
            // Isso não deveria acontecer se a verificação acima passou, mas é uma segurança
            return res.status(404).json({ error: 'Falha ao atualizar assinatura da produção da OP (não encontrada após verificação).' });
        }
        res.status(200).json({ message: 'Produção da OP assinada com sucesso pelo Tiktik.', producao: updateResult.rows[0] });

    } catch (error) {
        console.error('[API /producoes/assinar-tiktik-op PUT] Erro:', error.message);
        res.status(500).json({ error: 'Erro interno ao assinar produção da OP.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;