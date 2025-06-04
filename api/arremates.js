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

        const { op_numero, op_edit_id, produto, variante, quantidade_arrematada, usuario_tiktik } = req.body;

        if (!op_numero || !produto || quantidade_arrematada === undefined || !usuario_tiktik) {
            return res.status(400).json({ error: 'Dados incompletos. Campos obrigatórios: op_numero, produto, quantidade_arrematada, usuario_tiktik.' });
        }
        const quantidadeNum = parseInt(quantidade_arrematada);
        if (isNaN(quantidadeNum) || quantidadeNum <= 0) {
            return res.status(400).json({ error: 'Quantidade arrematada deve ser um número positivo.' });
        }

        // --- CÁLCULO DE PONTOS NO MOMENTO DO LANÇAMENTO ---
        let valorPontoAplicado; // Será definido abaixo
        
        const configPontosQuery = `
            SELECT pontos_padrao FROM configuracoes_pontos_processos
            WHERE produto_nome = $1 
              AND tipo_atividade = 'arremate_tiktik' 
            /* E processo_nome = 'Arremate (Config)' -- Se você padronizou assim */
              AND ativo = TRUE 
            LIMIT 1;
        `;
        const configResult = await dbClient.query(configPontosQuery, [produto]);

        if (configResult.rows.length > 0 && configResult.rows[0].pontos_padrao !== null) {
            const pontosPadraoConfig = parseFloat(configResult.rows[0].pontos_padrao);
            // Garante que o ponto da configuração seja um número positivo
            if (!isNaN(pontosPadraoConfig) && pontosPadraoConfig > 0) {
                valorPontoAplicado = pontosPadraoConfig;
            } else {
                console.warn(`[API Arremates POST] Configuração de pontos inválida (valor: ${configResult.rows[0].pontos_padrao}) para arremate do produto: ${produto}. Usando valor padrão 1.00.`);
                valorPontoAplicado = 1.00;
            }
        } else {
            console.warn(`[API Arremates POST] Configuração de pontos não encontrada ou inativa para arremate do produto: ${produto}. Usando valor padrão 1.00.`);
            valorPontoAplicado = 1.00; // Padrão se não houver configuração ou se o valor for inválido
        }
           
        const pontosGerados = quantidadeNum * valorPontoAplicado;
        // --- FIM DO CÁLCULO DE PONTOS ---

        const result = await dbClient.query(
            `INSERT INTO arremates 
                (op_numero, op_edit_id, produto, variante, quantidade_arrematada, usuario_tiktik, data_lancamento, valor_ponto_aplicado, pontos_gerados, assinada)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, FALSE)
             RETURNING *`,
            [op_numero, op_edit_id || null, produto, variante || null, quantidadeNum, usuario_tiktik, valorPontoAplicado, pontosGerados]
        );

        if (result.rows.length === 0) {
            throw new Error('Falha ao inserir o registro de arremate, nenhum dado retornado.');
        }
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API Arremates POST] Erro:', error.message);
        const statusCode = error.statusCode || (error.code === '23505' ? 409 : 500);
        const errorMsg = error.code === '23505' ? 'Conflito de dados.' : (error.message || 'Erro interno ao salvar arremate.');
        res.status(statusCode).json({ error: errorMsg, details: error.detail });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/arremates/
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { op_numero, usuario_tiktik: queryUsuarioTiktikParam } = req.query;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        const podeAcessarEmbalagemGeral = permissoesCompletas.includes('acesso-embalagem-de-produtos');
        const podeVerPropriosArremates = permissoesCompletas.includes('ver-proprios-arremates');
        const nomeUsuarioNoToken = usuarioLogado.nome; // Assegure que 'nome' está no token

        // Validação de Acesso Principal para a Rota GET
        if (!podeAcessarEmbalagemGeral && !podeVerPropriosArremates) {
            return res.status(403).json({ error: 'Permissão negada para visualizar arremates.' });
        }

        let queryText;
        let queryParams = [];

        // console.log(`[router/arremates GET] User: ${nomeUsuarioNoToken}, EmbalagemGeral: ${podeAcessarEmbalagemGeral}, VerProprios: ${podeVerPropriosArremates}, QueryTiktik: ${queryUsuarioTiktikParam}`);

        if (op_numero) {
            queryText = 'SELECT * FROM arremates WHERE op_numero = $1 ORDER BY data_lancamento DESC';
            queryParams = [String(op_numero)];
        } else if (queryUsuarioTiktikParam) {
            if (podeAcessarEmbalagemGeral || (podeVerPropriosArremates && queryUsuarioTiktikParam === nomeUsuarioNoToken)) {
                queryText = 'SELECT * FROM arremates WHERE usuario_tiktik = $1 ORDER BY data_lancamento DESC';
                queryParams = [String(queryUsuarioTiktikParam)];
            } else {
                return res.status(403).json({ error: 'Você só pode visualizar os arremates especificados ou os seus próprios.' });
            }
        } else if (podeAcessarEmbalagemGeral) {
            queryText = 'SELECT * FROM arremates ORDER BY data_lancamento DESC';
        } else if (podeVerPropriosArremates) { // Se não tem acesso geral, mas pode ver os próprios, e não filtrou por nada.
            if (!nomeUsuarioNoToken) return res.status(400).json({ error: "Falha ao identificar usuário para filtro." });
            queryText = 'SELECT * FROM arremates WHERE usuario_tiktik = $1 ORDER BY data_lancamento DESC';
            queryParams = [nomeUsuarioNoToken];
        } else {
             // Este caso não deveria ser alcançado por causa da validação de acesso principal acima.
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
    const { usuarioLogado } = req; // Do token (Tiktik)
    const { ids_arremates } = req.body; // Espera um array de IDs
    let dbClient;

    if (!Array.isArray(ids_arremates) || ids_arremates.length === 0) {
        return res.status(400).json({ error: 'Lista de IDs de arremates é obrigatória.' });
    }

    try {
        dbClient = await pool.connect();
        const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        // Verificar se o usuário é um Tiktik e tem permissão para assinar seus arremates
        // (Você pode criar uma permissão específica como 'assinar-proprio-arremate')
        if (!permissoesUsuario.includes('assinar-proprio-arremate')) { // CRIE ESSA PERMISSÃO
             return res.status(403).json({ error: 'Permissão negada para assinar arremates.' });
        }

        // Garantir que todos os arremates pertencem ao Tiktik logado antes de atualizar
        // Isso é uma camada extra de segurança, embora a query de UPDATE também filtre.
        const checkOwnerQuery = `
            SELECT id FROM arremates 
            WHERE id = ANY($1::int[]) AND usuario_tiktik != $2; 
        `;
        // Converte para INT se seus IDs são numéricos. Se forem UUIDs/TEXT, ajuste o ::int[]
        const nonOwnedArremates = await dbClient.query(checkOwnerQuery, [ids_arremates, usuarioLogado.nome]);

        if (nonOwnedArremates.rows.length > 0) {
            return res.status(403).json({ 
                error: 'Alguns dos arremates selecionados não pertencem a você ou não existem.',
                detalhes: nonOwnedArremates.rows.map(r => r.id)
            });
        }
        
        const updateResult = await dbClient.query(
            'UPDATE arremates SET assinada = TRUE WHERE id = ANY($1::int[]) AND usuario_tiktik = $2 RETURNING id, assinada',
            // Ajuste $1::int[] para $1::text[] se seus IDs de arremate forem strings/UUIDs
            [ids_arremates, usuarioLogado.nome] 
        );

        if (updateResult.rowCount === 0) {
            return res.status(404).json({ error: 'Nenhum arremate foi atualizado. Verifique os IDs ou se já estavam assinados.' });
        }
        
        // Se precisar retornar todos os arremates atualizados, pode fazer um SELECT depois.
        // Por ora, uma mensagem de sucesso e a contagem.
        res.status(200).json({ 
            message: `${updateResult.rowCount} arremate(s) assinado(s) com sucesso.`,
            atualizados: updateResult.rows 
        });

    } catch (error) {
        console.error('[API /arremates/assinar-lote PUT] Erro:', error.message);
        res.status(500).json({ error: 'Erro interno ao assinar arremates.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;