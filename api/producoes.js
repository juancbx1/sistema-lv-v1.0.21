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

/**
 * Calcula os pontos de uma produção com base nos parâmetros fornecidos.
 * @param {object} dbClient - A conexão ativa com o banco de dados.
 * @param {number} produto_id - O ID do produto.
 * @param {string} processo - O nome do processo (ex: "Bainha").
 * @param {number} quantidade - A quantidade produzida.
 * @param {number} funcionario_id - O ID do funcionário que realizou a tarefa.
 * @returns {Promise<object>} Uma promessa que resolve para um objeto { pontosGerados, valorPontoAplicado }.
 */
async function calcularPontosProducao(dbClient, produto_id, processo, quantidade, funcionario_id) {
    console.log(`[calcularPontosProducao] Iniciando cálculo para Produto ID: ${produto_id}, Processo: "${processo}", Qtd: ${quantidade}, Func. ID: ${funcionario_id}`);

    // Validação de segurança
    if (!produto_id || !processo || quantidade < 0 || !funcionario_id) {
        console.warn('[calcularPontosProducao] Dados de entrada inválidos. Retornando 0 pontos.');
        return { pontosGerados: 0, valorPontoAplicado: 0 };
    }

    const funcionarioInfoResult = await dbClient.query(
        'SELECT tipos FROM usuarios WHERE id = $1 LIMIT 1',
        [funcionario_id]
    );

    let tipoAtividadeParaConfigPontos;
    if (funcionarioInfoResult.rows.length > 0 && funcionarioInfoResult.rows[0].tipos) {
        const tiposFuncionario = funcionarioInfoResult.rows[0].tipos;
        if (tiposFuncionario.includes('costureira')) {
            tipoAtividadeParaConfigPontos = 'costura_op_costureira';
        } else if (tiposFuncionario.includes('tiktik')) {
            tipoAtividadeParaConfigPontos = 'processo_op_tiktik';
        }
    }

    console.log(`[calcularPontosProducao] Tipo de Atividade inferido: "${tipoAtividadeParaConfigPontos}"`);

    let valorPontoAplicado = 1.00;
    if (quantidade > 0 && tipoAtividadeParaConfigPontos) {
        const configPontosResult = await dbClient.query(
            `SELECT pontos_padrao FROM configuracoes_pontos_processos
             WHERE produto_id = $1 AND processo_nome = $2 AND tipo_atividade = $3 AND ativo = TRUE LIMIT 1;`,
            [produto_id, processo, tipoAtividadeParaConfigPontos]
        );

        if (configPontosResult.rows.length > 0 && configPontosResult.rows[0].pontos_padrao !== null) {
            valorPontoAplicado = parseFloat(configPontosResult.rows[0].pontos_padrao);
            console.log(`[calcularPontosProducao] Configuração de pontos encontrada. Valor do ponto: ${valorPontoAplicado}`);
        } else {
            console.log(`[calcularPontosProducao] Nenhuma configuração de pontos encontrada. Usando valor de ponto padrão: ${valorPontoAplicado}`);
        }
    } else if (quantidade === 0) {
        valorPontoAplicado = 0;
    }

    const pontosGerados = quantidade * valorPontoAplicado;

    return {
        pontosGerados: parseFloat(pontosGerados.toFixed(2)),
        valorPontoAplicado: parseFloat(valorPontoAplicado.toFixed(2))
    };
}


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
            maquina, quantidade, 
            funcionario, // Nome do funcionário
            funcionario_id, // <<< NOVO: ID do funcionário
            data, lancadoPor
        } = req.body;

        console.log(`[2. VALIDAÇÃO] Validando dados... Produto ID: ${produto_id}, Funcionário ID: ${funcionario_id}`);
        if (!id || !opNumero || etapaIndex === undefined || !processo || !produto_id || !funcionario || !funcionario_id || quantidade === undefined || !data || !lancadoPor) {
            return res.status(400).json({ error: 'Dados incompletos. Todos os campos são obrigatórios, incluindo funcionario_id.' });
        }
        
        const parsedProdutoId = parseInt(produto_id);
        if (isNaN(parsedProdutoId) || parsedProdutoId <= 0) {
            return res.status(400).json({ error: 'produto_id inválido.' });
        }

        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade < 0) {
            return res.status(400).json({ error: 'Quantidade inválida.' });
        }
        console.log('[2. VALIDAÇÃO] Dados básicos validados com sucesso.');

        // ---------------------------------------------------------------------
        // <<< MUDANÇA AQUI: A LÓGICA ANTIGA FOI SUBSTITUÍDA POR ESTA CHAMADA >>>
        // ---------------------------------------------------------------------
        // --- LÓGICA DE PONTOS USANDO A FUNÇÃO REUTILIZÁVEL ---
        const { pontosGerados, valorPontoAplicado } = await calcularPontosProducao(
            dbClient,
            parsedProdutoId,
            processo,
            parsedQuantidade,
            funcionario_id
        );
        // --- FIM DA LÓGICA DE PONTOS ---
        // ---------------------------------------------------------------------

        const queryText = `
            INSERT INTO producoes (
                id, op_numero, etapa_index, processo, produto_id, variacao, maquina,
                quantidade, funcionario, funcionario_id, data, lancado_por, valor_ponto_aplicado, pontos_gerados
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *;`;
        
        const values = [
            id, opNumero, etapaIndex, processo, parsedProdutoId, variacao || null, maquina,
            parsedQuantidade, funcionario, funcionario_id, data, lancadoPor, 
            valorPontoAplicado, // Já é float
            pontosGerados     // Já é float
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

        // <<< MUDANÇA: Adicionada a coluna "funcionario_id" na query SELECT >>>
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
            pr.funcionario_id, -- <<< ADICIONADO
            pr.data, 
            pr.lancado_por,
            pr.valor_ponto_aplicado,
            pr.pontos_gerados,
            p.nome AS produto
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
            // <<< MUDANÇA: Filtra pelo ID do usuário logado, não pelo nome >>>
            const idFuncionario = usuarioLogado.id;
            if (!idFuncionario) {
                return res.status(400).json({ error: "Falha ao identificar ID do usuário para filtro." });
            }
            queryText = `${baseSelect} WHERE pr.funcionario_id = $1 ORDER BY pr.data DESC`;
            queryParams = [idFuncionario];
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
        const permissoesDoUsuario = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        // <<< MUDANÇA: Adicionamos o 'id' ao nome do funcionário para clareza >>>
        const { id, quantidade, edicoes, assinada, funcionario: novoNomeFuncionario, dadosColetados } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'ID da produção é obrigatório.' });
        }

        // <<< MUDANÇA: Buscamos mais dados do registro original >>>
        const producaoResult = await dbClient.query(
            'SELECT * FROM producoes WHERE id = $1', 
            [id]
        );

        if (producaoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Produção não encontrada para atualização.' });
        }

        const producaoOriginal = producaoResult.rows[0];
        const nomeUsuarioLogado = usuarioLogado.nome || usuarioLogado.nome_usuario;
        
        const isOwner = producaoOriginal.funcionario === nomeUsuarioLogado;
        const isAttemptingToSignOnly = (assinada === true && quantidade === undefined && novoNomeFuncionario === undefined);
        const podeEditarGeral = permissoesDoUsuario.includes('editar-registro-producao');
        const podeAssinarPropria = permissoesDoUsuario.includes('assinar-producao-costureira');

        // CASO 1: Assinatura de Costureira
        if (isOwner && isAttemptingToSignOnly && podeAssinarPropria) {
            if (producaoOriginal.assinada) {
                return res.status(400).json({ error: 'Este item já foi assinado.' });
            }
            await dbClient.query('BEGIN');
            const updateResult = await dbClient.query(`UPDATE producoes SET assinada = TRUE WHERE id = $1 RETURNING *`, [id]);
            await dbClient.query(`INSERT INTO log_assinaturas (id_usuario, id_producao, dados_coletados) VALUES ($1, $2, $3)`, [usuarioLogado.id, id, dadosColetados || null]);
            await dbClient.query('COMMIT');
            return res.status(200).json(updateResult.rows[0]);
        } 
        
        // CASO 2: Edição Geral (Admin/Supervisor) - AQUI ESTÁ A CORREÇÃO!
        else if (podeEditarGeral) {
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;

            let recalcularPontos = false;
            let idFuncionarioParaCalculo = producaoOriginal.funcionario_id;
            let quantidadeParaCalculo = producaoOriginal.quantidade;

            if (quantidade !== undefined && quantidade !== producaoOriginal.quantidade) {
                updateFields.push(`quantidade = $${paramIndex++}`);
                updateValues.push(quantidade);
                quantidadeParaCalculo = quantidade; // Usa a nova quantidade para o cálculo
                recalcularPontos = true;
            }
            
            // <<< MUDANÇA: Lógica para quando o funcionário é alterado >>>
            if (novoNomeFuncionario !== undefined && novoNomeFuncionario !== producaoOriginal.funcionario) {
                const novoFuncionarioResult = await dbClient.query('SELECT id FROM usuarios WHERE nome = $1', [novoNomeFuncionario]);
                if (novoFuncionarioResult.rows.length === 0) {
                    return res.status(404).json({ error: `Funcionário '${novoNomeFuncionario}' não encontrado.` });
                }
                const novoFuncionarioId = novoFuncionarioResult.rows[0].id;

                updateFields.push(`funcionario = $${paramIndex++}`);
                updateValues.push(novoNomeFuncionario);
                updateFields.push(`funcionario_id = $${paramIndex++}`);
                updateValues.push(novoFuncionarioId);
                
                idFuncionarioParaCalculo = novoFuncionarioId; // Usa o novo funcionário para o cálculo
                recalcularPontos = true;
            }

            if (edicoes !== undefined) {
                updateFields.push(`edicoes = $${paramIndex++}`);
                updateValues.push(edicoes);
            }
            
            // <<< MUDANÇA: Se precisa recalcular, chama a nossa nova função! >>>
            if (recalcularPontos) {
                const { pontosGerados, valorPontoAplicado } = await calcularPontosProducao(
                    dbClient,
                    producaoOriginal.produto_id,
                    producaoOriginal.processo,
                    quantidadeParaCalculo,
                    idFuncionarioParaCalculo
                );

                updateFields.push(`pontos_gerados = $${paramIndex++}`);
                updateValues.push(pontosGerados);
                updateFields.push(`valor_ponto_aplicado = $${paramIndex++}`);
                updateValues.push(valorPontoAplicado);
                console.log(`[PUT /api/producoes] Pontos recalculados para Produção ID ${id}. Novos pontos: ${pontosGerados}`);
            }

            // O resto da lógica de assinatura continua igual
            if (assinada !== undefined) {
                updateFields.push(`assinada = $${paramIndex++}`);
                updateValues.push(assinada);
            }

            if (updateFields.length === 0) {
                return res.status(200).json(producaoOriginal); // Nenhuma alteração, retorna o original
            }

            updateValues.push(id); 
            const queryUpdate = `UPDATE producoes SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
            const result = await dbClient.query(queryUpdate, updateValues);
            return res.status(200).json(result.rows[0]);
        }
        
        // CASO 3: Permissão negada
        else {
            return res.status(403).json({ error: 'Permissão negada para alterar este registro de produção.' });
        }

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
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
    // NOVO: Recebe o objeto 'dadosColetados'
    const { id_producao_op, dadosColetados } = req.body;
    let dbClient;

    if (!id_producao_op) {
        return res.status(400).json({ error: 'ID da produção da OP é obrigatório.' });
    }

    try {
        dbClient = await pool.connect();
        const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        // Assumi que você criará esta permissão como planejado
        if (!permissoesUsuario.includes('assinar-producao-tiktik')) {
             return res.status(403).json({ error: 'Permissão negada para assinar esta produção de OP.' });
        }

        const producaoResult = await dbClient.query(
            'SELECT funcionario, assinada_por_tiktik FROM producoes WHERE id = $1',
            [id_producao_op]
        );

        if (producaoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Produção da OP não encontrada.' });
        }

        const { funcionario, assinada_por_tiktik } = producaoResult.rows[0];
        if (funcionario !== usuarioLogado.nome) {
            return res.status(403).json({ error: 'Você só pode assinar produções de OP feitas por você.' });
        }
        if (assinada_por_tiktik) {
            return res.status(400).json({ error: 'Esta produção de OP já foi assinada por você.' });
        }

        // Inicia a transação
        await dbClient.query('BEGIN');
        
        // 1. Atualiza a produção
        const updateResult = await dbClient.query(
            'UPDATE producoes SET assinada_por_tiktik = TRUE WHERE id = $1 RETURNING *',
            [id_producao_op]
        );
        
        // 2. Insere o log da assinatura
        await dbClient.query(
            'INSERT INTO log_assinaturas (id_usuario, id_producao, dados_coletados) VALUES ($1, $2, $3)',
            [usuarioLogado.id, id_producao_op, dadosColetados || null]
        );

        // Confirma a transação
        await dbClient.query('COMMIT');

        res.status(200).json({ message: 'Produção da OP assinada com sucesso pelo Tiktik.', producao: updateResult.rows[0] });

    } catch (error) {
        // Se der erro, desfaz a transação
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /producoes/assinar-tiktik-op PUT] Erro:', error.message);
        res.status(500).json({ error: 'Erro interno ao assinar produção da OP.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;