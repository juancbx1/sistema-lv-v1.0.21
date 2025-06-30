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
    const { usuarioLogado: requisitante } = req; // Renomeado para clareza
    let dbClient; 

    try {
        console.log('--- INÍCIO: ROTA POST /api/producoes ---');
        console.log('[1. DADOS RECEBIDOS] Corpo da requisição:', JSON.stringify(req.body, null, 2));

        dbClient = await pool.connect();
        const permissoesRequisitante = await getPermissoesCompletasUsuarioDB(dbClient, requisitante.id);
        if (!permissoesRequisitante.includes('lancar-producao')) {
            return res.status(403).json({ error: 'Permissão negada para lançar produção.' });
        }

        const {
            id, opNumero, etapaIndex, processo, produto_id, variacao,
            maquina, quantidade, funcionario, // 'funcionario' é o nome de quem realizou a produção
            data, lancadoPor
        } = req.body;

        console.log(`[2. VALIDAÇÃO] Validando dados... Produto ID recebido: ${produto_id}, Funcionário: ${funcionario}`);
        if (!id || !opNumero || etapaIndex === undefined || !processo || !produto_id || !funcionario || quantidade === undefined || !data || !lancadoPor) {
            return res.status(400).json({ error: 'Dados incompletos. Todos os campos são obrigatórios, incluindo produto_id e funcionário.' });
        }
        
        const parsedProdutoId = parseInt(produto_id);
        if (isNaN(parsedProdutoId) || parsedProdutoId <= 0) {
            return res.status(400).json({ error: 'produto_id inválido.' });
        }

        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade < 0) { // Permitir 0 se for um lançamento de "não fez nada"
            return res.status(400).json({ error: 'Quantidade inválida.' });
        }
        console.log('[2. VALIDAÇÃO] Dados básicos validados com sucesso.');

        // --- LÓGICA DE PONTOS COM TIPO DE ATIVIDADE INFERIDO ---
        console.log(`[3. PONTOS] Iniciando cálculo de pontos para Produto ID: ${parsedProdutoId}, Processo: "${processo}", Funcionário: "${funcionario}"`);

        // 3a. Buscar o tipo do usuário 'funcionario' para determinar o 'tipo_atividade'
        const funcionarioInfoResult = await dbClient.query(
            'SELECT tipos FROM usuarios WHERE nome = $1 LIMIT 1',
            [funcionario]
        );

        let tipoAtividadeParaConfigPontos;
        if (funcionarioInfoResult.rows.length > 0 && funcionarioInfoResult.rows[0].tipos) {
            const tiposFuncionario = funcionarioInfoResult.rows[0].tipos; // Ex: ['costureira'] ou ['tiktik']
            if (tiposFuncionario.includes('costureira')) {
                tipoAtividadeParaConfigPontos = 'costura_op_costureira';
            } else if (tiposFuncionario.includes('tiktik')) {
                // Assumindo que esta rota NÃO é para "arremate_tiktik", mas sim para outros processos de OP feitos por tiktiks
                tipoAtividadeParaConfigPontos = 'processo_op_tiktik';
            } else {
                console.warn(`[3. PONTOS] Funcionário "${funcionario}" não tem um tipo ('costureira' ou 'tiktik') definido em seus 'tipos' para determinar a atividade. Usando fallback se houver ou ponto padrão.`);
                // Você pode definir um tipo padrão aqui ou deixar que a busca de configuração falhe (e use valorPontoAplicado = 1.00)
                // tipoAtividadeParaConfigPontos = 'tipo_desconhecido'; // Ou algo que não encontrará config
            }
        } else {
            console.warn(`[3. PONTOS] Informações do funcionário "${funcionario}" não encontradas ou sem tipos definidos. Não é possível determinar tipo_atividade para pontos.`);
            // Decida o comportamento: erro ou ponto padrão. Por segurança, ponto padrão.
        }
        console.log(`[3. PONTOS] Tipo de Atividade determinado para busca de pontos: "${tipoAtividadeParaConfigPontos}"`);
        
        let valorPontoAplicado = 1.00; // Valor padrão
        let pontosGerados = parsedQuantidade * valorPontoAplicado; // Cálculo padrão inicial

        if (tipoAtividadeParaConfigPontos && parsedQuantidade > 0) { // Só busca config se o tipo foi determinado e há quantidade
            const configPontosResult = await dbClient.query(
                `SELECT pontos_padrao FROM configuracoes_pontos_processos
                 WHERE produto_id = $1 AND processo_nome = $2 AND tipo_atividade = $3 AND ativo = TRUE LIMIT 1;`,
                [parsedProdutoId, processo, tipoAtividadeParaConfigPontos]
            );

            if (configPontosResult.rows.length > 0 && configPontosResult.rows[0].pontos_padrao !== null) {
                valorPontoAplicado = parseFloat(configPontosResult.rows[0].pontos_padrao);
                pontosGerados = parsedQuantidade * valorPontoAplicado; // Recalcula com o ponto da config
                console.log(`[3. PONTOS] Configuração de pontos encontrada. Valor do ponto: ${valorPontoAplicado}. Pontos gerados recalculados: ${pontosGerados}`);
            } else {
                console.log(`[3. PONTOS] Nenhuma configuração de pontos encontrada para Produto ID: ${parsedProdutoId}, Processo: "${processo}", Tipo Atividade: "${tipoAtividadeParaConfigPontos}". Usando valor de ponto padrão: ${valorPontoAplicado}. Pontos gerados (padrão): ${pontosGerados}`);
            }
        } else if (parsedQuantidade === 0) {
            valorPontoAplicado = 0; // Se a quantidade for zero, os pontos são zero
            pontosGerados = 0;
            console.log(`[3. PONTOS] Quantidade é 0. Pontos gerados definidos como 0.`);
        } else {
             console.log(`[3. PONTOS] Tipo de atividade não pôde ser determinado para o funcionário '${funcionario}'. Usando valor de ponto padrão ${valorPontoAplicado}. Pontos gerados (padrão): ${pontosGerados}`);
        }
        // --- FIM DA LÓGICA DE PONTOS ---

        const queryText = `
            INSERT INTO producoes (
                id, op_numero, etapa_index, processo, produto_id, variacao, maquina,
                quantidade, funcionario, data, lancado_por, valor_ponto_aplicado, pontos_gerados
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;`;
        
        const values = [
            id, opNumero, etapaIndex, processo, parsedProdutoId, variacao || null, maquina,
            parsedQuantidade, funcionario, data, lancadoPor, 
            parseFloat(valorPontoAplicado.toFixed(2)), // Garante 2 casas decimais
            parseFloat(pontosGerados.toFixed(2))     // Garante 2 casas decimais
        ];

        console.log('[4. BANCO DE DADOS] Executando query INSERT com valores:', values);
        const result = await dbClient.query(queryText, values);
        console.log('[5. SUCESSO] Inserção no banco de dados bem-sucedida.');

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('--- ERRO NA ROTA POST /api/producoes ---');
        console.error('[ERRO DETALHADO] Mensagem:', error.message, error.stack);
        if (error.message.includes("violates not-null constraint") && error.message.includes("pontos_gerados")) {
             console.error("[ERRO ESPECÍFICO] A coluna 'pontos_gerados' ou 'valor_ponto_aplicado' na tabela 'producoes' pode estar configurada como NOT NULL e não está recebendo um valor válido em todos os cenários.");
        }
        res.status(500).json({ error: 'Erro interno ao salvar produção.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
            console.log('--- FIM: ROTA POST /api/producoes (conexão liberada) ---');
        }
    }
});

// GET /api/producoes/
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        const podeGerenciarTudo = permissoesCompletas.includes('acesso-gerenciar-producao');
        const podeVerProprias = permissoesCompletas.includes('ver-proprias-producoes');

        if (!podeGerenciarTudo && !podeVerProprias) {
            return res.status(403).json({ error: 'Permissão negada para visualizar produções.' });
        }

        // << MUDANÇA: Query base com JOIN para buscar o nome do produto >>
        const baseSelect = `
        SELECT 
            pr.id, 
            pr.op_numero, 
            pr.etapa_index, 
            pr.processo, 
            pr.variacao,
            pr.maquina, 
            pr.quantidade, 
            pr.funcionario, 
            pr.data, 
            pr.lancado_por,
            pr.valor_ponto_aplicado, -- << ADICIONADO
            pr.pontos_gerados,       -- << ADICIONADO
            p.nome AS produto        -- Nome do produto do JOIN
        FROM producoes pr
        LEFT JOIN produtos p ON pr.produto_id = p.id
    `;

        let queryText;
        let queryParams = [];
        const { op_numero: opNumero } = req.query;

        if (opNumero) {
            queryText = `${baseSelect} WHERE pr.op_numero = $1 ORDER BY pr.data DESC`;
            queryParams = [opNumero];
        } else if (podeGerenciarTudo) {
            queryText = `${baseSelect} ORDER BY pr.data DESC`;
        } else if (podeVerProprias) {
            const nomeFuncionario = usuarioLogado.nome;
            if (!nomeFuncionario) {
                return res.status(400).json({ error: "Falha ao identificar funcionário para filtro." });
            }
            queryText = `${baseSelect} WHERE pr.funcionario = $1 ORDER BY pr.data DESC`;
            queryParams = [nomeFuncionario];
        } else {
            return res.status(403).json({ error: 'Configuração de acesso inválida.' });
        }
        
        const result = await dbClient.query(queryText, queryParams);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API Producoes GET /] Erro na rota:', error);
        res.status(500).json({ error: 'Erro interno ao buscar produções.' });
    } finally {
        if (dbClient) dbClient.release();
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