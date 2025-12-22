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

    let valorPontoAplicado = 1.00;
    if (quantidade > 0 && tipoAtividadeParaConfigPontos) {
        const configPontosResult = await dbClient.query(
            `SELECT pontos_padrao FROM configuracoes_pontos_processos
             WHERE produto_id = $1 AND processo_nome = $2 AND tipo_atividade = $3 AND ativo = TRUE LIMIT 1;`,
            [produto_id, processo, tipoAtividadeParaConfigPontos]
        );

        if (configPontosResult.rows.length > 0 && configPontosResult.rows[0].pontos_padrao !== null) {
            valorPontoAplicado = parseFloat(configPontosResult.rows[0].pontos_padrao);
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

router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient; 
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        let { funcionario_id, opNumero, produto_id, variante, processo, quantidade, funcionario } = req.body;

        // Validação básica
        if (!funcionario_id || !opNumero || !produto_id || !processo || !quantidade) {
            throw new Error("Dados insuficientes para iniciar sessão.");
        }

        // Verifica se usuário já está ocupado
        const userStatusResult = await dbClient.query('SELECT id_sessao_trabalho_atual FROM usuarios WHERE id = $1 FOR UPDATE', [funcionario_id]);
        if (userStatusResult.rows[0]?.id_sessao_trabalho_atual !== null) {
            throw new Error('Empregado já ocupado.');
        }

        // Busca nome se não vier
        if (!funcionario) {
             const u = await dbClient.query('SELECT nome FROM usuarios WHERE id = $1', [funcionario_id]);
             funcionario = u.rows[0]?.nome || 'Desconhecido';
        }

        // CRIA A SESSÃO (Vinculada à OP principal, mas com qtd total)
        // O "Abatimento Global" na rota /fila-de-tarefas cuidará de descontar o saldo corretamente
        const sessaoQuery = `
            INSERT INTO sessoes_trabalho_producao 
                (funcionario_id, op_numero, produto_id, variante, processo, quantidade_atribuida, status, data_inicio)
            VALUES ($1, $2, $3, $4, $5, $6, 'EM_ANDAMENTO', NOW())
            RETURNING id;
        `;
        const sessaoResult = await dbClient.query(sessaoQuery, [
            funcionario_id, opNumero, produto_id, variante || null, processo, quantidade
        ]);
        const novaSessaoId = sessaoResult.rows[0].id;

        // Atualiza status do usuário
        await dbClient.query(
            `UPDATE usuarios SET status_atual = 'PRODUZINDO', id_sessao_trabalho_atual = $1 WHERE id = $2`,
            [novaSessaoId, funcionario_id]
        );

        await dbClient.query('COMMIT');
        res.status(201).json({ message: 'Sessão iniciada!', sessaoId: novaSessaoId });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API POST /producoes] Erro:', error);
        res.status(500).json({ error: error.message });
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
        await dbClient.query('BEGIN'); // <<< 1. INICIA A TRANSAÇÃO

        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('excluir-registro-producao')) {
            await dbClient.query('ROLLBACK');
            return res.status(403).json({ error: 'Permissão negada para excluir registro de produção.' });
        }

        const { id } = req.body;
        if (!id) {
            await dbClient.query('ROLLBACK');
            return res.status(400).json({ error: 'ID não fornecido.' });
        }

        const deleteResult = await dbClient.query('DELETE FROM producoes WHERE id = $1 RETURNING *', [id]);
        
        if (deleteResult.rowCount === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Produção não encontrada para exclusão.' });
        }

        const producaoExcluida = deleteResult.rows[0];

        // --- INÍCIO DA NOVA LÓGICA DE LIMPEZA ---
        await dbClient.query(
            `UPDATE usuarios 
             SET status_atual = 'LIVRE', id_sessao_trabalho_atual = NULL 
             WHERE id = $1 AND id_sessao_trabalho_atual = $2`,
            [producaoExcluida.funcionario_id, producaoExcluida.id]
        );
        // --- FIM DA NOVA LÓGICA DE LIMPEZA ---

        await dbClient.query('COMMIT'); // <<< 2. CONFIRMA AS ALTERAÇÕES

        res.status(200).json(producaoExcluida);

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // <<< 3. DESFAZ EM CASO DE ERRO
        console.error('[router/producoes DELETE] Erro:', error.message);
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

// ========= NOVA ROTA PARA FINALIZAR UMA TAREFA DE PRODUÇÃO (OTIMIZADA) =========
router.put('/finalizar', async (req, res) => {
    const { usuarioLogado } = req;
    const { id_sessao, quantidade_finalizada } = req.body;
    let dbClient;

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');
        
        // 1. Busca a sessão e trava
        const sessaoResult = await dbClient.query('SELECT * FROM sessoes_trabalho_producao WHERE id = $1 FOR UPDATE', [id_sessao]);
        if (sessaoResult.rows.length === 0) throw new Error('Sessão não encontrada.');
        const sessao = sessaoResult.rows[0];
        if (sessao.status !== 'EM_ANDAMENTO') throw new Error('Tarefa já finalizada.');

        // 2. Busca dados do funcionário (UMA VEZ SÓ)
        const funcRes = await dbClient.query('SELECT nome, tipos FROM usuarios WHERE id = $1', [sessao.funcionario_id]);
        const dadosFuncionario = funcRes.rows[0] || { nome: 'Desconhecido', tipos: [] };
        const nomeFuncionario = dadosFuncionario.nome;

        // 3. Define Configuração de Pontos (Inferência de Tipo)
        let tipoAtividadeParaConfig = null;
        if (dadosFuncionario.tipos.includes('costureira')) tipoAtividadeParaConfig = 'costura_op_costureira';
        else if (dadosFuncionario.tipos.includes('tiktik')) tipoAtividadeParaConfig = 'processo_op_tiktik';

        // 4. Busca Máquina Correta
        const produtoResult = await dbClient.query('SELECT etapas FROM produtos WHERE id = $1', [sessao.produto_id]);
        const etapasDoProduto = produtoResult.rows[0]?.etapas || [];
        const etapaConfigProduto = etapasDoProduto.find(e => (e.processo || e) === sessao.processo);
        const maquinaCorreta = (etapaConfigProduto && typeof etapaConfigProduto === 'object') ? (etapaConfigProduto.maquina || 'Não Definida') : 'Não Definida';

        // console.log(`[FINALIZAR] Distribuindo ${quantidade_finalizada} peças...`); // Log opcional, pode tirar se quiser limpar
        
        let quantidadeRestante = parseInt(quantidade_finalizada);
        
        // 5. Busca OPs candidatas
        const opsDisponiveisResult = await dbClient.query(`
            SELECT numero, etapas, quantidade 
            FROM ordens_de_producao 
            WHERE produto_id = $1 
              AND (variante = $2 OR ($2 IS NULL AND variante IS NULL))
              AND status IN ('em-aberto', 'produzindo')
            ORDER BY numero ASC
        `, [sessao.produto_id, sessao.variante]);
        
        const opsCandidatas = opsDisponiveisResult.rows;

        // SE NÃO TIVER OP DISPONÍVEL, TEMOS QUE LANÇAR SEM OP OU NA OP ORIGINAL MESMO QUE FECHADA
        // Para evitar erro 500, vamos buscar a OP original se ela não veio na lista de abertas
        let opOriginalFallback = null;
        if (opsCandidatas.length === 0) {
             const opOrigRes = await dbClient.query('SELECT numero, etapas FROM ordens_de_producao WHERE numero = $1', [sessao.op_numero]);
             if (opOrigRes.rows.length > 0) opOriginalFallback = opOrigRes.rows[0];
        }

        // 6. Mapeia saldos
        const numerosOps = opsCandidatas.map(op => op.numero);
        let mapaSaldo = new Map();
        
        if (numerosOps.length > 0) {
            const lancamentosAnt = await dbClient.query(`
                SELECT op_numero, etapa_index, SUM(quantidade) as total
                FROM producoes WHERE op_numero = ANY($1::text[]) GROUP BY op_numero, etapa_index
            `, [numerosOps]);
            lancamentosAnt.rows.forEach(r => mapaSaldo.set(`${r.op_numero}-${r.etapa_index}`, parseInt(r.total)));
        }

        const logAuditoria = []; 

        // 7. Distribuição (Só roda se tiver OPs ativas)
        for (const op of opsCandidatas) {
            if (quantidadeRestante <= 0) break;

            const etapaIndex = op.etapas.findIndex(e => (e.processo || e) === sessao.processo);
            if (etapaIndex === -1) continue;

            let entrada = (etapaIndex === 0) ? parseInt(op.quantidade) : (mapaSaldo.get(`${op.numero}-${etapaIndex - 1}`) || 0);
            let saida = mapaSaldo.get(`${op.numero}-${etapaIndex}`) || 0;
            
            const disponivel = Math.max(0, entrada - saida);

            if (disponivel > 0) {
                const qtdLancar = Math.min(quantidadeRestante, disponivel);
                const { pontosGerados, valorPontoAplicado } = await calcularPontosProducao(dbClient, sessao.produto_id, sessao.processo, qtdLancar, sessao.funcionario_id);

                await dbClient.query(
                    `INSERT INTO producoes (id, op_numero, etapa_index, processo, produto_id, variacao, maquina, quantidade, funcionario, funcionario_id, data, lancado_por, valor_ponto_aplicado, pontos_gerados)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, $13)`,
                    [`prod_${Date.now()}_${Math.random().toString(36).substr(2,4)}`, op.numero, etapaIndex, sessao.processo, sessao.produto_id, sessao.variante, maquinaCorreta, qtdLancar, nomeFuncionario, sessao.funcionario_id, usuarioLogado.nome, valorPontoAplicado, pontosGerados]
                );
                logAuditoria.push(`OP #${op.numero}: ${qtdLancar}`);
                quantidadeRestante -= qtdLancar;
                mapaSaldo.set(`${op.numero}-${etapaIndex}`, saida + qtdLancar);
            }
        }

        // 8. Sobra (Estouro)
        if (quantidadeRestante > 0) {
             // Tenta achar a OP original nas candidatas, ou usa o fallback (mesmo que fechada)
             const opAlvo = opsCandidatas.find(o => o.numero === sessao.op_numero) || opsCandidatas[0] || opOriginalFallback;
             
             if (opAlvo) { // <--- VERIFICAÇÃO DE SEGURANÇA
                const idx = opAlvo.etapas.findIndex(e => (e.processo || e) === sessao.processo);

                const { pontosGerados, valorPontoAplicado } = await calcularPontosProducao(
                    dbClient, sessao.produto_id, sessao.processo, quantidadeRestante, sessao.funcionario_id
                );

                await dbClient.query(
                    `INSERT INTO producoes (id, op_numero, etapa_index, processo, produto_id, variacao, maquina, quantidade, funcionario, funcionario_id, data, lancado_por, valor_ponto_aplicado, pontos_gerados)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, $13)`,
                    [`prod_force_${Date.now()}`, opAlvo.numero, idx, sessao.processo, sessao.produto_id, sessao.variante, maquinaCorreta, quantidadeRestante, nomeFuncionario, sessao.funcionario_id, usuarioLogado.nome, valorPontoAplicado, pontosGerados]
                );
                
                logAuditoria.push(`FORÇADO OP #${opAlvo.numero}: ${quantidadeRestante}`);
             } else {
                 // Caso extremo: Não achou NENHUMA OP (nem a original existe mais?).
                 // Lança sem OP ou dá erro? Vamos lançar com OP '0000' para não perder a produção.
                 console.warn("Nenhuma OP encontrada para lançar a sobra. Usando OP de contingência.");
                 const { pontosGerados, valorPontoAplicado } = await calcularPontosProducao(dbClient, sessao.produto_id, sessao.processo, quantidadeRestante, sessao.funcionario_id);
                 
                 await dbClient.query(
                    `INSERT INTO producoes (id, op_numero, etapa_index, processo, produto_id, variacao, maquina, quantidade, funcionario, funcionario_id, data, lancado_por, valor_ponto_aplicado, pontos_gerados)
                     VALUES ($1, '0000', -1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11)`,
                    [`prod_orphan_${Date.now()}`, sessao.processo, sessao.produto_id, sessao.variante, maquinaCorreta, quantidadeRestante, nomeFuncionario, sessao.funcionario_id, usuarioLogado.nome, valorPontoAplicado, pontosGerados]
                );
             }
        }

        // 9. Finaliza sessão e libera usuário
        await dbClient.query(
            `UPDATE sessoes_trabalho_producao SET status = 'FINALIZADA', data_fim = NOW(), quantidade_finalizada = $1 WHERE id = $2`,
            [quantidade_finalizada, id_sessao]
        );
        await dbClient.query(
            `UPDATE usuarios SET status_atual = 'LIVRE', id_sessao_trabalho_atual = NULL WHERE id = $1`,
            [sessao.funcionario_id]
        );

        await dbClient.query('COMMIT');
        
        // Log leve apenas no console do servidor (sem query extra)
        // console.log(`[FINALIZAR] Sucesso para ${nomeFuncionario}. Detalhes:`, logAuditoria.join(' | '));

        // A RESPOSTA VEM POR ÚLTIMO
        res.status(200).json({ message: 'Tarefa finalizada e distribuída com pontos calculados!' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API PUT /finalizar] Erro:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;