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
    const { usuarioLogado } = req;
    let dbClient; 

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('lancar-arremate')) {
            return res.status(403).json({ error: 'Permissão negada para lançar arremate.' });
        }

        const { 
            op_numero, op_edit_id, produto_id, variante, quantidade_arrematada, 
            usuario_tiktik, // Nome do Tiktik
            usuario_tiktik_id // <<< NOVO: ID do Tiktik
        } = req.body;
        
        // <<< MUDANÇA: Adicionada validação para usuario_tiktik_id >>>
        if (!op_numero || !produto_id || quantidade_arrematada === undefined || !usuario_tiktik || !usuario_tiktik_id) {
            return res.status(400).json({ error: 'Dados incompletos: op_numero, produto_id, quantidade, tiktik e tiktik_id são obrigatórios.' });
        }
        
        const quantidadeNum = parseInt(quantidade_arrematada);
        if (isNaN(quantidadeNum) || quantidadeNum <= 0) {
            return res.status(400).json({ error: 'Quantidade arrematada deve ser um número positivo.' });
        }

        // --- LÓGICA DE PONTOS ---
        let valorPontoAplicado = 1.00;
        const configPontosQuery = `
            SELECT pontos_padrao FROM configuracoes_pontos_processos
            WHERE produto_id = $1 AND tipo_atividade = 'arremate_tiktik' AND ativo = TRUE LIMIT 1;
        `;
        const configResult = await dbClient.query(configPontosQuery, [produto_id]);

        if (configResult.rows.length > 0 && configResult.rows[0].pontos_padrao !== null) {
            valorPontoAplicado = parseFloat(configResult.rows[0].pontos_padrao);
        }
        const pontosGerados = quantidadeNum * valorPontoAplicado;
        
        const nomeDoLancador = usuarioLogado.nome || 'Sistema';

        // <<< MUDANÇA: Adicionada a coluna "usuario_tiktik_id" na query INSERT >>>
        const result = await dbClient.query(
            `INSERT INTO arremates (op_numero, op_edit_id, produto_id, variante, quantidade_arrematada, usuario_tiktik, usuario_tiktik_id, lancado_por, valor_ponto_aplicado, pontos_gerados)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
                op_numero, op_edit_id || null, parseInt(produto_id), variante || null, 
                quantidadeNum, usuario_tiktik, usuario_tiktik_id, nomeDoLancador,
                valorPontoAplicado, pontosGerados
            ]
        );
        
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API Arremates POST] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao salvar arremate.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/arremates/
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    // <<< MUDANÇA: Parâmetro do query agora é usuario_tiktik_id >>>
    const { op_numero, usuario_tiktik_id: queryUsuarioTiktikIdParam } = req.query;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        const podeAcessarEmbalagemGeral = permissoesCompletas.includes('acesso-embalagem-de-produtos');
        const podeVerPropriosArremates = permissoesCompletas.includes('ver-proprios-arremates');
        const idUsuarioLogado = usuarioLogado.id;

        if (!podeAcessarEmbalagemGeral && !podeVerPropriosArremates) {
            return res.status(403).json({ error: 'Permissão negada para visualizar arremates.' });
        }

        // <<< MUDANÇA: Adicionada a coluna "usuario_tiktik_id" na query SELECT >>>
        const baseSelect = `
        SELECT 
            a.id, a.op_numero, a.op_edit_id, a.variante, a.quantidade_arrematada,
            a.usuario_tiktik, a.usuario_tiktik_id, -- <<< ADICIONADO
            a.data_lancamento, a.quantidade_ja_embalada, a.assinada,
            a.valor_ponto_aplicado, a.pontos_gerados, a.lancado_por, a.tipo_lancamento,
            a.produto_id,
            p.nome AS produto
        FROM arremates a
        LEFT JOIN produtos p ON a.produto_id = p.id
    `;
        
        let queryText;
        let queryParams = [];

        if (op_numero) {
            queryText = `${baseSelect} WHERE a.op_numero = $1 ORDER BY a.data_lancamento DESC`;
            queryParams = [String(op_numero)];
        // <<< MUDANÇA: Filtro agora usa o ID, não o nome >>>
        } else if (queryUsuarioTiktikIdParam) {
            if (podeAcessarEmbalagemGeral || (podeVerPropriosArremates && parseInt(queryUsuarioTiktikIdParam) === idUsuarioLogado)) {
                queryText = `${baseSelect} WHERE a.usuario_tiktik_id = $1 ORDER BY a.data_lancamento DESC`;
                queryParams = [parseInt(queryUsuarioTiktikIdParam)];
            } else {
                return res.status(403).json({ error: 'Você só pode visualizar os arremates especificados ou os seus próprios.' });
            }
        } else if (podeAcessarEmbalagemGeral) {
            queryText = `${baseSelect} ORDER BY a.data_lancamento DESC`;
        } else if (podeVerPropriosArremates) {
            if (!idUsuarioLogado) return res.status(400).json({ error: "Falha ao identificar usuário para filtro." });
            queryText = `${baseSelect} WHERE a.usuario_tiktik_id = $1 ORDER BY a.data_lancamento DESC`;
            queryParams = [idUsuarioLogado];
        } else {
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

// ROTA: GET /api/arremates/historico
router.get('/historico', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        const query = `
            SELECT 
                a.id, a.op_numero, a.variante, a.quantidade_arrematada,
                a.usuario_tiktik, a.lancado_por, a.data_lancamento,
                a.tipo_lancamento, a.id_perda_origem,
                p.nome as produto
            FROM arremates a
            LEFT JOIN produtos p ON a.produto_id = p.id
            WHERE a.data_lancamento >= NOW() - INTERVAL '7 days'
            ORDER BY a.data_lancamento DESC;
        `;
        const result = await dbClient.query(query);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API /arremates/historico] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico de arremates.' });
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

//ENDPOINT PARA TIKTIK ASSINAR UM LOTE DE ARREMATES
router.put('/assinar-lote', async (req, res) => {
    const { usuarioLogado } = req;
    // NOVO: Recebe o objeto 'dadosColetados'
    const { ids_arremates, dadosColetados } = req.body;
    let dbClient;

    if (!Array.isArray(ids_arremates) || ids_arremates.length === 0) {
        return res.status(400).json({ error: 'Lista de IDs de arremates é obrigatória.' });
    }

    try {
        dbClient = await pool.connect();
        const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        // Assumi que você criará esta permissão
        if (!permissoesUsuario.includes('assinar-arremate-tiktik')) {
             return res.status(403).json({ error: 'Permissão negada para assinar arremates.' });
        }

        // Inicia a transação
        await dbClient.query('BEGIN');

        // 1. Atualiza todos os arremates do lote para 'assinada = true'
        const updateResult = await dbClient.query(
            `UPDATE arremates SET assinada = TRUE 
             WHERE id = ANY($1::int[]) 
             AND usuario_tiktik = $2 
             AND assinada = FALSE -- Garante que não estamos re-assinando
             RETURNING id, assinada`,
            [ids_arremates, usuarioLogado.nome] 
        );

        if (updateResult.rowCount === 0) {
            // Se nenhum registro foi atualizado, pode ser que já estivessem assinados ou não pertencem ao usuário.
            // Não é um erro, então não damos rollback, apenas informamos.
            await dbClient.query('COMMIT'); // Finaliza a transação vazia
            return res.status(200).json({ 
                message: 'Nenhum arremate novo foi assinado. Eles podem já ter sido assinados ou os IDs são inválidos.',
                atualizados: []
            });
        }
        
        // 2. Para cada arremate que foi efetivamente atualizado, insere um log
        const idsAtualizados = updateResult.rows.map(r => r.id);
        const logInsertPromises = idsAtualizados.map(arremateId => {
            return dbClient.query(
                `INSERT INTO log_assinaturas (id_usuario, id_arremate, dados_coletados) VALUES ($1, $2, $3)`,
                [usuarioLogado.id, arremateId, dadosColetados || null]
            );
        });

        // Executa todas as inserções de log em paralelo
        await Promise.all(logInsertPromises);

        // Confirma a transação
        await dbClient.query('COMMIT');
        
        res.status(200).json({ 
            message: `${updateResult.rowCount} arremate(s) assinado(s) com sucesso.`,
            atualizados: updateResult.rows 
        });

    } catch (error) {
        // Se der erro, desfaz a transação
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /arremates/assinar-lote PUT] Erro:', error.message);
        res.status(500).json({ error: 'Erro interno ao assinar arremates.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/registrar-perda', async (req, res) => {
    const { usuarioLogado } = req;
    // << MUDANÇA: Recebe 'produto_id' do frontend >>
    const { produto_id, variante, quantidadePerdida, motivo, observacao, opsOrigem } = req.body;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('registrar-perda-arremate')) {
            return res.status(403).json({ error: 'Permissão negada para registrar perdas.' });
        }
        
        // << MUDANÇA: Validação para produto_id >>
        if (!produto_id || !motivo || !quantidadePerdida || quantidadePerdida <= 0) {
            return res.status(400).json({ error: "Dados para registro de perda estão incompletos (produto_id, motivo, quantidade)." });
        }
        
        // Busca o nome do produto para salvar na tabela de perdas (se ela ainda usa o nome)
        const produtoInfo = await dbClient.query('SELECT nome FROM produtos WHERE id = $1', [produto_id]);
        if (produtoInfo.rows.length === 0) {
            throw new Error(`Produto com ID ${produto_id} não encontrado.`);
        }
        const nomeDoProduto = produtoInfo.rows[0].nome;

        await dbClient.query('BEGIN');

        // 1. Insere o registro na tabela de perdas
        const perdaQuery = `
            INSERT INTO arremate_perdas (produto_nome, variante_nome, quantidade_perdida, motivo, observacao, usuario_responsavel)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;
        `;
        const perdaResult = await dbClient.query(perdaQuery, [
            nomeDoProduto, // Salva o nome na tabela de perdas
            variante,
            quantidadePerdida,
            motivo,
            observacao,
            usuarioLogado.nome || 'Sistema'
        ]);
        const perdaId = perdaResult.rows[0].id;

        // 2. Cria um lançamento de arremate do tipo 'PERDA' para abater do saldo
        let quantidadeRestanteParaAbater = quantidadePerdida;
        const opsOrdenadas = opsOrigem.sort((a, b) => a.numero - b.numero);

        for (const op of opsOrdenadas) {
            if (quantidadeRestanteParaAbater <= 0) break;
            
            const qtdAbaterDaOP = Math.min(quantidadeRestanteParaAbater, op.quantidade_pendente_nesta_op);
            if (qtdAbaterDaOP > 0) {
                // << MUDANÇA: Insere produto_id na tabela 'arremates' >>
                const lancamentoPerdaQuery = `
                    INSERT INTO arremates (op_numero, produto_id, variante, quantidade_arrematada, usuario_tiktik, lancado_por, tipo_lancamento, id_perda_origem, assinada)
                    VALUES ($1, $2, $3, $4, $5, $6, 'PERDA', $7, TRUE);
                `;
                await dbClient.query(lancamentoPerdaQuery, [
                    op.numero,
                    produto_id, // Insere o ID aqui
                    variante,
                    qtdAbaterDaOP,
                    'Sistema (Perda)',
                    usuarioLogado.nome,
                    perdaId
                ]);
                quantidadeRestanteParaAbater -= qtdAbaterDaOP;
            }
        }

        await dbClient.query('COMMIT');
        res.status(201).json({ message: 'Registro de perda efetuado com sucesso.' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /arremates/registrar-perda] Erro:', error);
        res.status(500).json({ error: 'Erro ao registrar a perda.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;