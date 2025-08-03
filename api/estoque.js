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
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('acesso-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar saldo do estoque.' });
        }

        // --- QUERY ATUALIZADA ---
        const queryText = `
            WITH SaldosAgregados AS (
                SELECT
                    produto_id,
                    variante_nome,
                    SUM(
                        CASE 
                            WHEN tipo_movimento LIKE 'ENTRADA%' OR tipo_movimento = 'AJUSTE_BALANCO_POSITIVO' OR tipo_movimento LIKE 'ESTORNO%' THEN quantidade
                            WHEN tipo_movimento LIKE 'SAIDA%' OR tipo_movimento = 'AJUSTE_BALANCO_NEGATIVO' THEN -ABS(quantidade) 
                            ELSE 0 
                        END
                    ) AS saldo_atual,
                    MAX(data_movimento) as ultima_data_movimento
                FROM estoque_movimentos
                GROUP BY produto_id, variante_nome
            )
            SELECT
                s.produto_id,
                p.nome AS produto_nome,
                COALESCE(s.variante_nome, '-') AS variante_nome,
                s.saldo_atual,
                s.ultima_data_movimento,
                COALESCE(g.sku, p.sku, p.id::text) AS produto_ref_id
            FROM SaldosAgregados s
            JOIN produtos p ON s.produto_id = p.id
            LEFT JOIN jsonb_to_recordset(p.grade) AS g(sku TEXT, variacao TEXT) ON g.variacao = s.variante_nome
            
            -- ** A LÓGICA DE FILTRO É APLICADA AQUI ** --
            WHERE COALESCE(g.sku, p.sku, p.id::text) NOT IN (SELECT produto_ref_id FROM estoque_itens_arquivados)

            ORDER BY s.ultima_data_movimento DESC, p.nome ASC;
        `;

        const result = await dbClient.query(queryText);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[router/estoque GET /saldo] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar saldo do estoque.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// NOVA ROTA: POST /api/estoque/arquivar-item
router.post('/arquivar-item', async (req, res) => {
    const { usuarioLogado } = req;
    const { produto_ref_id } = req.body;

    console.log(`[API /arquivar-item] Recebida requisição para arquivar SKU: ${produto_ref_id}`);

    if (!produto_ref_id) {
        console.warn("[API /arquivar-item] Requisição inválida: produto_ref_id não foi fornecido.");
        return res.status(400).json({ error: 'O ID de referência do produto (produto_ref_id) é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        if (!permissoesCompletas.includes('arquivar-produto-do-estoque')) { // Verifique se o nome da permissão está correto
            console.warn(`[API /arquivar-item] Permissão negada para o usuário ID ${usuarioLogado.id}.`);
            return res.status(403).json({ error: 'Permissão negada para arquivar itens do estoque.' });
        }

        const query = `
            INSERT INTO estoque_itens_arquivados (produto_ref_id, usuario_responsavel_id)
            VALUES ($1, $2)
            ON CONFLICT (produto_ref_id) DO NOTHING;
        `;
        
        console.log(`[API /arquivar-item] Executando query: INSERT INTO estoque_itens_arquivados com SKU: ${produto_ref_id} e user_id: ${usuarioLogado.id}`);
        const result = await dbClient.query(query, [produto_ref_id, usuarioLogado.id]);

        if (result.rowCount > 0) {
            console.log(`[API /arquivar-item] SUCESSO: SKU ${produto_ref_id} inserido na tabela de arquivados.`);
            res.status(200).json({ message: `Item com SKU ${produto_ref_id} foi arquivado com sucesso.` });
        } else {
            console.log(`[API /arquivar-item] INFO: SKU ${produto_ref_id} já estava arquivado (ON CONFLICT DO NOTHING).`);
            res.status(200).json({ message: `Item com SKU ${produto_ref_id} já se encontra arquivado.` });
        }

    } catch (error) {
        console.error('[API /arquivar-item] Erro ao arquivar o item:', error);
        res.status(500).json({ error: 'Erro interno ao arquivar o item.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// POST /api/estoque/entrada-producao
// POST /api/estoque/entrada-producao - VERSÃO CORRIGIDA
router.post('/entrada-producao', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('lancar-embalagem')) {
            return res.status(403).json({ error: 'Permissão negada para registrar entrada de produção.' });
        }

        // Recebe os campos do body
        const { produto_id, variante_nome, quantidade_entrada, id_arremate_origem, observacao, produto_ref_id } = req.body;

        // Validações
        if (!produto_id || quantidade_entrada === undefined || !produto_ref_id) {
            return res.status(400).json({ error: 'Campos obrigatórios: produto_id, quantidade_entrada e produto_ref_id (SKU).' });
        }
        const quantidade = parseInt(quantidade_entrada);
        if (isNaN(quantidade) || quantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade de entrada deve ser um número positivo.' });
        }

        const varianteParaDB = (variante_nome === '' || variante_nome === '-' || variante_nome === undefined) ? null : variante_nome;
        
        await dbClient.query('BEGIN');

        // <<< A CORREÇÃO ESTÁ AQUI >>>
        // A query agora tem 7 colunas e 7 placeholders ($1 a $7)
        const movimentoQueryText = `
            INSERT INTO estoque_movimentos 
                (produto_id, variante_nome, quantidade, tipo_movimento, origem_arremate_id, usuario_responsavel, observacao)
            VALUES ($1, $2, $3, 'ENTRADA_PRODUCAO', $4, $5, $6)
            RETURNING id;
        `;
        // O tipo de movimento pode ser simplesmente 'ENTRADA_PRODUCAO'
        const movimentoResult = await dbClient.query(movimentoQueryText, [
            parseInt(produto_id), 
            varianteParaDB, 
            quantidade,
            id_arremate_origem || null, // Passando o ID do arremate
            (usuarioLogado.nome || usuarioLogado.nome_usuario),
            observacao || `Embalagem de ${quantidade} unidade(s)`
        ]);

        if (movimentoResult.rows.length === 0) {
            throw new Error("Falha ao inserir movimento no estoque, não retornou ID.");
        }
        const novoMovimentoId = movimentoResult.rows[0].id;

        // O resto da lógica para inserir em 'embalagens_realizadas' já está correta no seu código
        const embalagemQueryText = `
            INSERT INTO embalagens_realizadas
                (tipo_embalagem, produto_embalado_id, variante_embalada_nome, produto_ref_id, quantidade_embalada, 
                usuario_responsavel_id, observacao, movimento_estoque_id, status)
            VALUES ('UNIDADE', $1, $2, $3, $4, $5, $6, $7, 'ATIVO');
        `;
        await dbClient.query(embalagemQueryText, [
            parseInt(produto_id),
            varianteParaDB,
            produto_ref_id,
            quantidade,
            usuarioLogado.id,
            observacao || null,
            novoMovimentoId
        ]);

        await dbClient.query('COMMIT'); 

        res.status(201).json({ 
            message: 'Entrada de produção registrada com sucesso.',
            movimento_estoque_id: novoMovimentoId 
        });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /estoque/entrada-producao] Erro:', error);
        res.status(500).json({ error: 'Erro ao registrar entrada no estoque.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/estoque/movimentos
router.get('/movimentos', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        
        if (!permissoesCompletas.includes('acesso-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar histórico de movimentos.' });
        }

        const { produto_id, tipo_movimento, data_inicio, data_fim, limit = 10, page = 1 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let varianteNomeTratadaParaSQL = req.query.variante_nome ? req.query.variante_nome.replace(/\+/g, ' ') : null;

        let queryText = `SELECT em.*, p.nome as produto_nome FROM estoque_movimentos em JOIN produtos p ON em.produto_id = p.id`;
        let countQueryText = `SELECT COUNT(*) as count FROM estoque_movimentos em JOIN produtos p ON em.produto_id = p.id`;
        
        const queryParams = [];
        const whereClauses = [];
        let paramIndex = 1;

        if (produto_id) {
            whereClauses.push(`em.produto_id = $${paramIndex++}`); 
            queryParams.push(parseInt(produto_id));
        }
        
        // A lógica da variante permanece a mesma, pois ela é um texto
        if (req.query.variante_nome) { 
            if (varianteNomeTratadaParaSQL === '-' || varianteNomeTratadaParaSQL === 'Padrão') {
                whereClauses.push(`(em.variante_nome IS NULL OR em.variante_nome = '-' OR em.variante_nome = 'Padrão')`);
            } else {
                whereClauses.push(`em.variante_nome = $${paramIndex++}`);
                queryParams.push(varianteNomeTratadaParaSQL); 
            }
        } else {
             whereClauses.push(`em.variante_nome IS NULL`);
        }
        
        if (tipo_movimento) {
            whereClauses.push(`em.tipo_movimento = $${paramIndex++}`);
            queryParams.push(tipo_movimento);
        }
        if (data_inicio) {
            whereClauses.push(`DATE(em.data_movimento AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') >= $${paramIndex++}`);
            queryParams.push(data_inicio);
        }
        if (data_fim) {
            whereClauses.push(`DATE(em.data_movimento AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') <= $${paramIndex++}`);
            queryParams.push(data_fim);
        }

        const whereCondition = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';
        queryText += whereCondition;
        countQueryText += whereCondition;
        
        const countParams = [...queryParams]; 
        queryText += ` ORDER BY em.id DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(parseInt(limit), offset); 

        const result = await dbCliente.query(queryText, queryParams);
        const totalResult = await dbCliente.query(countQueryText, countParams); 
        const total = totalResult.rows[0] ? parseInt(totalResult.rows[0].count) : 0;
        const pages = Math.ceil(total / parseInt(limit)) || 1;

        res.status(200).json({ rows: result.rows, total, page: parseInt(page), pages });

    } catch (error) {
        console.error('[API /movimentos] Erro na rota:', error);
        res.status(500).json({ error: 'Erro ao buscar movimentos do estoque.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});
// --- FIM ROTA GET /movimentos ---


// POST /api/estoque/movimento-manual
router.post('/movimento-manual', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
    
        if (!permissoesCompletas.includes('gerenciar-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para realizar movimentos manuais de estoque.' });
        }

        const { produto_id, variante_nome, quantidade_movimentada, tipo_operacao, observacao } = req.body;

        if (!produto_id || quantidade_movimentada === undefined || !tipo_operacao) {
            return res.status(400).json({ error: 'Campos obrigatórios: produto_id, quantidade_movimentada, tipo_operacao.' });
        }
        const qtdMov = parseInt(quantidade_movimentada);
        if (isNaN(qtdMov) || qtdMov <= 0) {
            return res.status(400).json({ error: 'A quantidade movimentada deve ser um número positivo.' });
        }

        const varianteParaDB = (variante_nome === '' || variante_nome === '-' || variante_nome === undefined) ? null : variante_nome;
        let movimentoReal;
        let tipoMovimentoDB;
        let observacaoFinal = observacao || null; // Começa com a observação do usuário ou nulo

        // --- LÓGICA ATUALIZADA PARA OS TIPOS DE OPERAÇÃO E OBSERVAÇÃO ---
        switch (tipo_operacao) {
            case 'ENTRADA_MANUAL':
                movimentoReal = qtdMov;
                tipoMovimentoDB = 'ENTRADA_MANUAL';
                break;
            case 'SAIDA_MANUAL':
                movimentoReal = -qtdMov;
                tipoMovimentoDB = 'SAIDA_MANUAL';
                break;
            case 'DEVOLUCAO':
                movimentoReal = qtdMov;
                tipoMovimentoDB = 'ENTRADA_DEVOLUCAO';
                // --- AJUSTE NA OBSERVAÇÃO ---
                // Cria um texto padrão para a devolução
                const textoPadraoDevolucao = "[DEVOLUÇÃO REGISTRADA]";
                // Concatena com a observação do usuário, se houver
                observacaoFinal = observacao ? `${textoPadraoDevolucao} ${observacao}` : textoPadraoDevolucao;
                break;
            default:
                return res.status(400).json({ error: 'Tipo de operação inválido.' });
        }
        
        const result = await dbClient.query(
            `INSERT INTO estoque_movimentos 
                (produto_id, variante_nome, quantidade, tipo_movimento, usuario_responsavel, observacao, data_movimento)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING *;`,
            [
                produto_id, 
                varianteParaDB, 
                movimentoReal, 
                tipoMovimentoDB,
                (usuarioLogado.nome || usuarioLogado.nome_usuario),
                observacaoFinal // Usa a observação final (que pode ter sido modificada)
            ]
        );
        
        console.log(`[API /estoque/movimento-manual] Movimento (${tipoMovimentoDB}) registrado:`, result.rows[0]);
        res.status(201).json({
            message: `Movimento de '${tipo_operacao}' registrado com sucesso.`,
            movimentoRegistrado: result.rows[0]
        });

    } catch (error) {
        console.error('[API /estoque/movimento-manual] Erro:', error.message);
        res.status(500).json({ error: 'Erro ao registrar movimento manual de estoque.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

//POST /api/estoque/movimento-em-lote
router.post('/movimento-em-lote', async (req, res) => {
    const { usuarioLogado } = req;
    const { itens, tipo_operacao, observacao } = req.body;

    if (!Array.isArray(itens) || itens.length === 0 || !tipo_operacao) {
        return res.status(400).json({ error: 'Dados inválidos. É necessário um array de itens e um tipo de operação.' });
    }
    
    // Validação mais flexível do tipo de operação
    if (!tipo_operacao.startsWith('SAIDA_PEDIDO_')) {
        return res.status(400).json({ error: 'Tipo de operação inválido para movimentação em lote.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        if (!permissoesCompletas.includes('gerenciar-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para realizar esta operação.' });
        }

        await dbClient.query('BEGIN'); // Inicia a transação

        for (const item of itens) {
            if (!item.produto_id || !item.quantidade_movimentada || item.quantidade_movimentada <= 0) {
                // Se algum item for inválido, desfaz a transação inteira.
                throw new Error(`Item inválido no lote: ${item.produto_nome}. Verifique os dados.`);
            }

            const varianteParaDB = (item.variante_nome === '-' || !item.variante_nome) ? null : item.variante_nome;
            // Para saídas, a quantidade é sempre negativa
            const quantidadeNegativa = -Math.abs(parseInt(item.quantidade_movimentada));

            const query = `
                INSERT INTO estoque_movimentos 
                    (produto_id, variante_nome, quantidade, tipo_movimento, usuario_responsavel, observacao, data_movimento)
                VALUES ($1, $2, $3, $4, $5, $6, NOW());
            `;
            await dbClient.query(query, [
                item.produto_id,
                varianteParaDB,
                quantidadeNegativa,
                tipo_operacao,
                (usuarioLogado.nome || usuarioLogado.nome_usuario),
                observacao || null
            ]);
        }

        await dbClient.query('COMMIT'); // Confirma a transação se tudo deu certo

        res.status(201).json({ message: `${itens.length} movimentações de estoque registradas com sucesso.` });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // Desfaz tudo em caso de erro
        console.error('[router/estoque POST /movimento-em-lote] Erro:', error);
        res.status(500).json({ error: 'Erro ao registrar movimentos em lote.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


router.post('/estornar-movimento', async (req, res) => {
    const { usuarioLogado } = req;
    const { id_movimento_original, quantidade_a_estornar } = req.body;

    if (!id_movimento_original || !quantidade_a_estornar) {
        return res.status(400).json({ error: 'ID do movimento e quantidade a estornar são obrigatórios.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        if (!permissoesCompletas.includes('gerenciar-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para estornar movimentos.' });
        }

        await dbClient.query('BEGIN');

        // 1. Busca os dados do movimento original, incluindo o produto_id
        const movimentoOriginalRes = await dbClient.query(
            'SELECT * FROM estoque_movimentos WHERE id = $1 FOR UPDATE', 
            [id_movimento_original]
        );
        
        if (movimentoOriginalRes.rows.length === 0) throw new Error('Movimento original não encontrado.');
        
        const movOriginal = movimentoOriginalRes.rows[0];
        const saldoDisponivelParaEstorno = Math.abs(movOriginal.quantidade) - (movOriginal.quantidade_estornada || 0);

        // --- VALIDAÇÕES APRIMORADAS ---
        // 2a. Valida se é um movimento de saída
        if (movOriginal.quantidade >= 0) {
            throw new Error('Apenas movimentos de SAÍDA podem ser estornados.');
        }
        
        // 2b. NOVO: Valida se o movimento JÁ É UM ESTORNO
        if (movOriginal.tipo_movimento.startsWith('ESTORNO_')) {
            // Retorna um erro 400 Bad Request, pois a requisição é logicamente inválida.
            const err = new Error('Não é possível estornar um movimento que já é um estorno.');
            err.statusCode = 400; // Define o status code para o erro
            throw err;
        }

        // 2c. Valida se ainda há saldo para estornar
        if (saldoDisponivelParaEstorno <= 0) {
            throw new Error('Este movimento já foi totalmente estornado.');
        }

        // 2d. Valida a quantidade solicitada
        if (parseInt(quantidade_a_estornar) > saldoDisponivelParaEstorno) {
            throw new Error(`Quantidade a estornar (${quantidade_a_estornar}) inválida. Saldo disponível para estorno: ${saldoDisponivelParaEstorno}.`);
        }
        
        // 3. Cria a nova movimentação de estorno (entrada)
        const tipoMovimentoEstorno = `ESTORNO_${movOriginal.tipo_movimento}`;
        const observacaoEstorno = `Estorno referente ao movimento #${id_movimento_original}.`;

        // --- QUERY DE INSERT CORRIGIDA ---
        const insertQuery = `
            INSERT INTO estoque_movimentos 
                (produto_id, variante_nome, quantidade, tipo_movimento, usuario_responsavel, observacao)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
        const novoMovimentoRes = await dbClient.query(insertQuery, [
            movOriginal.produto_id, // << USA O ID DO MOVIMENTO ORIGINAL
            movOriginal.variante_nome, 
            parseInt(quantidade_a_estornar),
            tipoMovimentoEstorno, 
            (usuarioLogado.nome || usuarioLogado.nome_usuario), 
            observacaoEstorno
        ]);

        // 4. Atualiza o movimento original com a nova quantidade estornada
        const novaQtdTotalEstornada = (movOriginal.quantidade_estornada || 0) + parseInt(quantidade_a_estornar);
        await dbClient.query('UPDATE estoque_movimentos SET quantidade_estornada = $1 WHERE id = $2', [novaQtdTotalEstornada, id_movimento_original]);

        await dbClient.query('COMMIT');

        res.status(201).json({ 
            message: 'Movimento estornado com sucesso.', 
            movimentoDeEstorno: novoMovimentoRes.rows[0] 
        });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /estornar-movimento] Erro:', error);
        res.status(error.message.includes('inválida') ? 400 : 500).json({ error: 'Erro ao estornar movimento.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// 1. ROTA PARA LISTAR TODOS OS ITENS ARQUIVADOS
router.get('/arquivados', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        if (!permissoes.includes('gerenciar-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar itens arquivados.' });
        }

        // --- QUERY CORRIGIDA ---
        const queryText = `
            SELECT 
                aia.produto_ref_id,
                -- Usa COALESCE para pegar o nome do produto pai, seja do join direto ou do join via grade
                COALESCE(p.nome, p_grade.nome) AS produto_nome,
                COALESCE(g.variacao, '-') AS variante_nome,
                -- Usa COALESCE para pegar a imagem da variação primeiro, senão a do produto principal
                COALESCE(g.imagem, p.imagem, p_grade.imagem) as imagem
            FROM 
                estoque_itens_arquivados aia
            -- JOIN com produtos para SKUs que estão no produto principal
            LEFT JOIN produtos p ON p.sku = aia.produto_ref_id
            -- JOIN com uma subquery que extrai dados da grade, INCLUINDO A IMAGEM
            LEFT JOIN (
                SELECT 
                    p_sub.id as produto_id,
                    gr.sku,
                    gr.variacao,
                    gr.imagem -- << CAMPO DE IMAGEM AGORA INCLUÍDO
                FROM 
                    produtos p_sub, 
                    jsonb_to_recordset(p_sub.grade) AS gr(sku TEXT, variacao TEXT, imagem TEXT) -- << DEFINIÇÃO DA ESTRUTURA DO JSON
            ) AS g ON g.sku = aia.produto_ref_id
            -- JOIN secundário com produtos para obter o nome do produto pai quando o SKU é da grade
            LEFT JOIN produtos p_grade ON p_grade.id = g.produto_id
            WHERE 
                COALESCE(p.nome, p_grade.nome) IS NOT NULL
            ORDER BY 
                produto_nome, variante_nome;
        `;
        
        const result = await dbClient.query(queryText);

        // A query agora retorna uma única coluna de imagem, vamos ajustar o frontend para usar isso
        // Esta parte do backend está correta, mas vou notar a mudança para o frontend
        const rows = result.rows.map(row => ({
            produto_ref_id: row.produto_ref_id,
            produto_nome: row.produto_nome,
            variante_nome: row.variante_nome,
            imagem: row.imagem // Apenas uma coluna 'imagem' agora
        }));

        res.status(200).json(rows);

    } catch (error) {
        console.error('[API /estoque/arquivados GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar itens arquivados.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// 2. ROTA PARA RESTAURAR (DESARQUIVAR) UM ITEM
router.delete('/arquivados/:produto_ref_id', async (req, res) => {
    const { usuarioLogado } = req;
    const { produto_ref_id } = req.params; // Pega o SKU da URL

    console.log(`[API /estoque/arquivados DELETE] Recebida requisição para restaurar SKU: ${produto_ref_id}`);

    if (!produto_ref_id) {
        return res.status(400).json({ error: "O SKU do item a ser restaurado é obrigatório." });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        if (!permissoes.includes('gerenciar-estoque')) {
            return res.status(403).json({ error: 'Permissão negada para restaurar itens.' });
        }

        const queryText = 'DELETE FROM estoque_itens_arquivados WHERE produto_ref_id = $1';
        const result = await dbClient.query(queryText, [produto_ref_id]);

        if (result.rowCount === 0) {
            console.warn(`[API /estoque/arquivados DELETE] SKU ${produto_ref_id} não encontrado na tabela de arquivados para exclusão.`);
            return res.status(404).json({ error: 'Item não encontrado na lista de arquivados.' });
        }

        console.log(`[API /estoque/arquivados DELETE] SUCESSO: SKU ${produto_ref_id} restaurado (removido da tabela).`);
        res.status(200).json({ message: 'Item restaurado para o estoque com sucesso!' });

    } catch (error) {
        console.error('[API /estoque/arquivados DELETE] Erro:', error);
        res.status(500).json({ error: 'Erro ao restaurar o item.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;