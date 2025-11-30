// api/ordens-de-producao.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importar a função de buscar permissões completas
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

const verificarTokenOriginal = (reqOriginal) => {
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
        return jwt.verify(token, SECRET_KEY);
    }
    catch (err) {
        const error = new Error('Token inválido ou expirado');
        error.statusCode = 401;
        if (err.name === 'TokenExpiredError') error.details = 'jwt expired';
        throw error;
    }
};

// Middleware para este router: Apenas autentica o token.
router.use(async (req, res, next) => {
    try {
        req.usuarioLogado = verificarTokenOriginal(req);
        next();
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/ordens-de-producao/ (Listar OPs com filtros e paginação)
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { query } = req;
    let dbClient; 

    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        if (query.getNextNumber === 'true') {
            const result = await dbClient.query(`SELECT numero FROM ordens_de_producao ORDER BY CAST(NULLIF(REGEXP_REPLACE(numero, '\\D', '', 'g'), '') AS INTEGER) DESC NULLS LAST, numero DESC`);
            return res.status(200).json(result.rows.map(row => row.numero));
        }

        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;
        const offset = (page - 1) * limit;

        const queryTextBase = `
        SELECT 
            op.id, op.numero, op.variante, op.quantidade, op.data_entrega, 
            op.observacoes, op.status, op.edit_id, op.etapas, op.data_final,
            op.produto_id, -- INCLUINDO O ID
            p.nome AS produto
        FROM ordens_de_producao op
        LEFT JOIN produtos p ON op.produto_id = p.id
    `;
        
        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        // --- A LÓGICA DO FILTRO CORRIGIDA ESTÁ AQUI ---
        if (query.status && query.status !== 'todas') {
            // Se um status específico (e diferente de 'todas') for enviado, use-o
            whereClauses.push(`op.status = $${paramIndex++}`);
            params.push(query.status);
        } else {
            // Se o status for 'todas' ou se nenhum status for enviado,
            // aplica o filtro padrão para mostrar apenas 'em-aberto' e 'produzindo'.
            whereClauses.push(`op.status IN ('em-aberto', 'produzindo')`);
        }

        if (query.search) {
            const searchTerm = `%${query.search}%`;
            whereClauses.push(`(op.numero ILIKE $${paramIndex} OR p.nome ILIKE $${paramIndex + 1} OR op.variante ILIKE $${paramIndex + 2})`);
            params.push(searchTerm, searchTerm, searchTerm);
            paramIndex += 3;
        }
        
        const whereCondition = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
        
        const countQuery = `SELECT COUNT(op.id) FROM ordens_de_producao op LEFT JOIN produtos p ON op.produto_id = p.id ${whereCondition}`;
        const dataQuery = `${queryTextBase} ${whereCondition} ORDER BY op.id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        
        const countParams = params.slice();
        params.push(limit, offset);

        const totalResult = await dbClient.query(countQuery, countParams);
        const total = parseInt(totalResult.rows[0].count);
        const result = await dbClient.query(dataQuery, params);

        res.status(200).json({
            rows: result.rows,
            total: total,
            page: page,
            pages: Math.ceil(total / limit) || 1,
        });

    } catch (error) {
        console.error('[router/ordens-de-producao GET /] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar ordens de produção.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/ordens-de-producao/:id (Buscar uma ÚNICA OP por edit_id ou numero)
router.get('/:id', async (req, res) => {
    const { usuarioLogado } = req;
    const opIdentifier = req.params.id;
    let dbClient; 

    try {
        console.log(`\n--- INÍCIO: GET /ordens-de-producao/${opIdentifier} ---`);

        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        // 1. Busca a OP principal (como antes)
        const opQuery = `
            SELECT op.*, p.nome as produto
            FROM ordens_de_producao op
            LEFT JOIN produtos p ON op.produto_id = p.id
            WHERE op.edit_id = $1 OR op.numero = $1
        `;
        const opResult = await dbClient.query(opQuery, [opIdentifier]);

        if (opResult.rows.length === 0) {
            return res.status(404).json({ error: 'Ordem de Produção não encontrada.' });
        }
        
        let op = opResult.rows[0];

        // --- INÍCIO DA NOVA LÓGICA DE ENRIQUECIMENTO ---
        // 2. Busca todos os lançamentos de produção para esta OP
        const lancamentosResult = await dbClient.query(
            'SELECT etapa_index, quantidade, funcionario, funcionario_id FROM producoes WHERE op_numero = $1',
            [op.numero]
        );
        console.log(`1. Encontrados ${lancamentosResult.rowCount} registros em 'producoes' para a OP #${op.numero}:`, lancamentosResult.rows);

        // 3. Agrupa os lançamentos por etapa para somar as quantidades
        const lancamentosPorEtapa = lancamentosResult.rows.reduce((acc, lancamento) => {
            const index = lancamento.etapa_index;
            if (!acc[index]) {
                acc[index] = {
                    quantidadeTotal: 0,
                    // Vamos assumir o último funcionário que lançou como o "dono" da etapa
                    funcionario: lancamento.funcionario,
                    funcionario_id: lancamento.funcionario_id,
                };
            }
            acc[index].quantidadeTotal += lancamento.quantidade;
            return acc;
        }, {});
        console.log("2. Lançamentos agrupados por etapa_index:", lancamentosPorEtapa);

        // 4. Mapeia as etapas da OP, atualizando com os dados dos lançamentos
        if (Array.isArray(op.etapas)) {
            op.etapas = op.etapas.map((etapa, index) => {
                const lancamentoInfo = lancamentosPorEtapa[index];
                if (lancamentoInfo) {
                    return {
                        ...etapa,
                        lancado: true,
                        quantidade: lancamentoInfo.quantidadeTotal,
                        // O usuário já é o ID, vindo da tabela de produções
                        usuario: lancamentoInfo.funcionario_id 
                    };
                }
                return etapa; // Retorna a etapa como está se não houver lançamento
            });
        }
        console.log("3. Objeto 'etapas' final enviado para o frontend:", op.etapas);
        // --- FIM DA NOVA LÓGICA DE ENRIQUECIMENTO ---

        console.log("--- FIM: GET /ordens-de-producao/:id ---");
        res.status(200).json(op);

    } catch (error) {
        console.error(`[router/ordens-de-producao GET /:id] Erro:`, error);
        res.status(500).json({ error: 'Erro ao buscar detalhes da OP.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// POST /api/ordens-de-producao/ (Criar nova OP)
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        console.log("[API POST OP V3] Corpo recebido:", JSON.stringify(req.body, null, 2));

        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoes.includes('criar-op')) {
            throw new Error('Permissão negada.');
        }
        
        // Agora esperamos o 'corte_origem_id'
        const { numero, data_entrega, observacoes, corte_origem_id } = req.body;
        
        if (!numero || !data_entrega || !corte_origem_id) {
            throw new Error('Dados incompletos: Número da OP, data de entrega e ID do corte de origem são obrigatórios.');
        }
        
        // 1. BUSCAR E TRAVAR O CORTE DE ORIGEM
        const corteResult = await dbClient.query('SELECT * FROM cortes WHERE id = $1 FOR UPDATE', [corte_origem_id]);
        if (corteResult.rows.length === 0) throw new Error('Corte de origem não encontrado.');
        const corte = corteResult.rows[0];
        if (corte.op) throw new Error(`Este corte (PC: ${corte.pn}) já foi utilizado na OP #${corte.op}.`);

        // 2. BUSCAR DETALHES DO PRODUTO (ETAPAS)
        const produtoResult = await dbClient.query('SELECT etapas FROM produtos WHERE id = $1', [corte.produto_id]);
        if (produtoResult.rows.length === 0) throw new Error('Produto do corte não encontrado.');
        const etapasConfig = produtoResult.rows[0].etapas || [];

        // 3. CRIAR A NOVA OP
        const opPayload = {
            numero,
            produto_id: corte.produto_id,
            variante: corte.variante,
            quantidade: corte.quantidade,
            data_entrega,
            observacoes,
            status: 'produzindo', // JÁ NASCE PRODUZINDO
            edit_id: `${Date.now()}${Math.random().toString(36).substring(2, 7)}`,
            etapas: etapasConfig.map(e => ({ processo: (e.processo || e), lancado: false, quantidade: 0, usuario: '' }))
        };
        const opInsertResult = await dbClient.query(
            `INSERT INTO ordens_de_producao (numero, produto_id, variante, quantidade, data_entrega, observacoes, status, edit_id, etapas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [opPayload.numero, opPayload.produto_id, opPayload.variante, opPayload.quantidade, opPayload.data_entrega, opPayload.observacoes, opPayload.status, opPayload.edit_id, JSON.stringify(opPayload.etapas)]
        );
        const opCriada = opInsertResult.rows[0];

        // 4. VINCULAR O CORTE À OP CRIADA
        await dbClient.query('UPDATE cortes SET op = $1, status = \'usado\' WHERE id = $2', [opCriada.numero, corte_origem_id]);

        // 5. LANÇAR AUTOMATICAMENTE A ETAPA DE CORTE NA TABELA 'producoes'
        const etapaCorteIndex = etapasConfig.findIndex(e => (e.processo || e).toLowerCase() === 'corte');
        
        if (etapaCorteIndex !== -1) {
            const etapaConfigCorte = etapasConfig[etapaCorteIndex];
            const maquinaDoCorte = etapaConfigCorte?.maquina || 'Não Definida';
            const cortadorInfo = await dbClient.query('SELECT id FROM usuarios WHERE nome ILIKE $1', [corte.cortador]);
            const cortadorId = cortadorInfo.rows.length > 0 ? cortadorInfo.rows[0].id : null;
            
            const idProducaoTexto = `prod_${Date.now()}`;

            // --- INÍCIO DA CORREÇÃO ---
            await dbClient.query(
                // Removemos a coluna 'data_final' da lista
                `INSERT INTO producoes (id, op_numero, etapa_index, processo, produto_id, variacao, maquina, quantidade, funcionario, funcionario_id, data, lancado_por)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, // A contagem de parâmetros agora vai até $12
                // Removemos o 'NOW()' do final da lista de valores
                [idProducaoTexto, opCriada.numero, etapaCorteIndex, 'Corte', corte.produto_id, corte.variante, maquinaDoCorte, corte.quantidade, corte.cortador, cortadorId, corte.data, usuarioLogado.nome]
            );
            // --- FIM DA CORREÇÃO ---
        }

        await dbClient.query('COMMIT');
        res.status(201).json(opCriada);

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API POST OP V3 - ERRO]', error);
        res.status(500).json({ error: 'Erro ao criar Ordem de Produção.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

//GET /api/ordens-de-producao/check-op-filha/:numeroMae
router.get('/check-op-filha/:numeroMae', async (req, res) => {
    const { usuarioLogado } = req; // <<< Verifique se o middleware está passando isso
    const { numeroMae } = req.params;
    let dbClient;

    try {
        dbClient = await pool.connect();
        
        // Verificação de permissão (opcional, mas bom ter)
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }
        
        const textoBusca = `OP gerada em conjunto com a OP mãe #${numeroMae}`;

        const query = `
            SELECT EXISTS (
                SELECT 1 
                FROM ordens_de_producao 
                WHERE observacoes = $1 AND status NOT IN ('cancelada', 'excluido')
            ) as "filhaExiste";
        `;
        
        const result = await dbClient.query(query, [textoBusca]);
        const { filhaExiste } = result.rows[0];

        res.status(200).json({ existe: filhaExiste });

    } catch (error) {
        console.error(`[API check-op-filha] Erro ao verificar OP filha para mãe #${numeroMae}:`, error);
        // Não retorne o erro HTML, retorne um JSON de erro
        res.status(500).json({ error: 'Erro ao verificar OP filha.', existe: true });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// PUT /api/ordens-de-producao/ (Atualizar OP existente)
router.put('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN'); // <<< 1. INICIA A TRANSAÇÃO NO COMEÇO

        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        const opData = req.body;
        const { edit_id, numero, status, produto_id } = opData;

        if (!edit_id) {
            throw new Error('O campo "edit_id" é obrigatório para atualização.');
        }
        if (!produto_id && status !== 'cancelada') {
            throw new Error('O campo "produto_id" é obrigatório para atualização.');
        }

        let permissaoConcedida = false;
        if (status === 'cancelada' && permissoesCompletas.includes('cancelar-op')) permissaoConcedida = true;
        else if (status === 'finalizado' && permissoesCompletas.includes('finalizar-op')) permissaoConcedida = true;
        else if (permissoesCompletas.includes('editar-op')) permissaoConcedida = true;

        if (!permissaoConcedida) {
            return res.status(403).json({ error: 'Permissão negada para realizar esta alteração.' });
        }
        
        // --- INÍCIO DA NOVA LÓGICA DE LIMPEZA DE STATUS ---
        if (status === 'finalizado' || status === 'cancelada') {
            console.log(`[API OP PUT] Iniciando limpeza para OP #${numero} (Status: ${status})`);
            
            // 1. Buscamos SESSÕES de trabalho ativas (Inteiros), não produções passadas (Texto).
            // Isso corrige o erro de tipo "integer = text".
            const sessoesAtivasResult = await dbClient.query(
                `SELECT id, funcionario_id FROM sessoes_trabalho_producao 
                 WHERE op_numero = $1 AND status = 'EM_ANDAMENTO'`, 
                [numero]
            );
            
            console.log(`[API OP PUT] Encontradas ${sessoesAtivasResult.rowCount} sessões ativas presas nesta OP.`);

            if (sessoesAtivasResult.rows.length > 0) {
                const idsSessoes = sessoesAtivasResult.rows.map(r => r.id);
                console.log(`[API OP PUT] IDs das sessões (Inteiros) para liberar:`, idsSessoes);

                // 2. Agora podemos usar ::int[] com segurança, pois estamos comparando
                // id_sessao_trabalho_atual (Inteiro) com idsSessoes (Inteiros).
                const updateUserResult = await dbClient.query(
                    `UPDATE usuarios 
                     SET status_atual = 'LIVRE', id_sessao_trabalho_atual = NULL 
                     WHERE id_sessao_trabalho_atual = ANY($1::int[])`,
                    [idsSessoes]
                );
                
                // 3. Opcional: Marcar essas sessões como CANCELADAS ou FINALIZADAS no banco
                // para não ficarem "EM_ANDAMENTO" para sempre órfãs.
                await dbClient.query(
                    `UPDATE sessoes_trabalho_producao 
                     SET status = 'FINALIZADA_FORCADA', data_fim = NOW() 
                     WHERE id = ANY($1::int[])`,
                    [idsSessoes]
                );

                console.log(`[API OP PUT] SUCESSO: ${updateUserResult.rowCount} usuários foram liberados e suas sessões encerradas.`);
            } else {
                console.log(`[API OP PUT] Nenhum usuário estava preso nesta OP. Nenhuma ação necessária.`);
            }
        }
        // --- FIM DA NOVA LÓGICA DE LIMPEZA DE STATUS ---

        let finalizedChildrenNumbers = [];
        if (status === 'cancelada') {
            await dbClient.query(`UPDATE cortes SET status = 'excluido' WHERE op = $1`, [numero]);
        } else if (status === 'finalizado') {
            const textoBusca = `OP gerada em conjunto com a OP mãe #${numero}`;
            const filhasResult = await dbClient.query(
                `UPDATE ordens_de_producao SET status = 'finalizado', data_final = CURRENT_TIMESTAMP WHERE observacoes = $1 AND status != 'finalizado' RETURNING numero`,
                [textoBusca]
            );
            if (filhasResult.rowCount > 0) {
                finalizedChildrenNumbers = filhasResult.rows.map(r => r.numero);
            }
        }
        
        const queryText = `
            UPDATE ordens_de_producao
             SET numero = $1, produto_id = $2, variante = $3, quantidade = $4, data_entrega = $5,
                 observacoes = $6, status = $7, etapas = $8, data_final = $9, 
                 data_atualizacao = CURRENT_TIMESTAMP
             WHERE edit_id = $10 RETURNING *`;
        
        const values = [
            opData.numero, parseInt(produto_id), opData.variante || null, parseInt(opData.quantidade), 
            opData.data_entrega, opData.observacoes || '', status, 
            JSON.stringify(opData.etapas || []), opData.data_final || null, edit_id
        ];

        const result = await dbClient.query(queryText, values);

        if (result.rows.length === 0) {
            throw new Error('Ordem de Produção não encontrada para atualização.');
        }

        const opAtualizada = { ...result.rows[0], finalizedChildren: finalizedChildrenNumbers };
        
        await dbClient.query('COMMIT'); // <<< 2. CONFIRMA TUDO NO FINAL
        res.status(200).json(opAtualizada);

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // <<< 3. DESFAZ TUDO EM CASO DE ERRO
        console.error('[router/ordens-de-producao PUT] Erro:', error);
        // O res.status(403) já é enviado antes, aqui tratamos outros erros.
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erro ao atualizar Ordem de Produção.', details: error.message });
        }
    } finally {
        if (dbClient) {
            dbClient.release();
        }
    }
});

export default router;