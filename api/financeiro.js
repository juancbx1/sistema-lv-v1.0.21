// api/financeiro.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js'; // Importe a função de permissões

console.log('✅ [API Financeiro] Arquivo api/financeiro.js carregado pelo servidor.');

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// --- Função para verificar o token internamente ---
const verificarTokenInterna = (reqOriginal) => {
    const authHeader = reqOriginal.headers.authorization;
    if (!authHeader) throw new Error('Token não fornecido');
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('Token mal formatado');
    try {
        const decoded = jwt.verify(token, SECRET_KEY, { ignoreExpiration: false });
        return decoded;
    } catch (error) {
        const newError = new Error(error.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido');
        newError.statusCode = 401;
        if (error.name === 'TokenExpiredError') newError.details = 'jwt expired';
        throw newError;
    }
};

async function registrarLog(dbClient, idUsuario, nomeUsuario, acao, dados) {
    try {
        let detalhes = '';
        let dadosAlterados = null;

        // Função interna para buscar nomes a partir de IDs
        const getInfo = async (lancamento) => {
            if (!lancamento) return { nomeCategoria: 'N/A', nomeConta: 'N/A', nomeFavorecido: 'N/A' };
            const [categoriaRes, contaRes, favorecidoRes] = await Promise.all([
                lancamento.id_categoria ? dbClient.query('SELECT nome FROM fc_categorias WHERE id = $1', [lancamento.id_categoria]) : Promise.resolve({ rows: [] }),
                lancamento.id_conta_bancaria ? dbClient.query('SELECT nome_conta FROM fc_contas_bancarias WHERE id = $1', [lancamento.id_conta_bancaria]) : Promise.resolve({ rows: [] }),
                lancamento.id_contato ? dbClient.query('SELECT nome FROM fc_contatos WHERE id = $1', [lancamento.id_contato]) : Promise.resolve({ rows: [] })
            ]);
            return {
                nomeCategoria: categoriaRes.rows[0]?.nome || 'N/A',
                nomeConta: contaRes.rows[0]?.nome_conta || 'N/A',
                nomeFavorecido: favorecidoRes.rows[0]?.nome || 'N/A'
            };
        };

        const valorFormatado = dados.lancamento ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dados.lancamento.valor) : '';

        switch(acao) {
             case 'CRIACAO_LANCAMENTO': {
                const info = await getInfo(dados.lancamento);
                // Lógica condicional para a preposição
                const preposicao = dados.lancamento.tipo === 'RECEITA' ? 'recebido de' : 'para';
                detalhes = `Criou ${dados.lancamento.tipo.toLowerCase()} [#${dados.lancamento.id}] de ${valorFormatado} na categoria "${info.nomeCategoria}" ${preposicao} "${info.nomeFavorecido}" na conta "${info.nomeConta}".`;
                dadosAlterados = { depois: dados.lancamento };
                break;
            }
            case 'CRIACAO_LOTE_AGENDAMENTO': {
                const { lote } = dados;
                const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lote.valor);
                detalhes = `Criou o lote de agendamento #${lote.id} ("${lote.descricao}") com ${lote.parcelas} parcelas, totalizando ${valorFormatado}.`;
                dadosAlterados = dados;
                break;
            }
            case 'EDICAO_DIRETA_LANCAMENTO': {
                const info = await getInfo(dados.depois);
                detalhes = `Editou diretamente o lançamento #${dados.depois.id} para o valor de ${formatCurrency(dados.depois.valor)} na categoria "${info.nomeCategoria}".`;
                dadosAlterados = { antes: dados.antes, depois: dados.depois };
                break;
            }
            case 'SOLICITACAO_EDICAO_LANCAMENTO':
                detalhes = `Solicitou edição para o lançamento #${dados.id_lancamento}.`;
                dadosAlterados = { solicitacao: dados.solicitacao };
                break;
            case 'SOLICITACAO_EXCLUSAO_LANCAMENTO':
                 detalhes = `Solicitou exclusão para o lançamento #${dados.id_lancamento}.`;
                 dadosAlterados = { solicitacao: dados.solicitacao };
                break;        
            case 'APROVACAO_EDICAO': {
                const info = await getInfo(dados.solicitacao.dados_novos);
                detalhes = `Aprovou a edição do lançamento #${dados.solicitacao.id_lancamento}, agora na categoria "${info.nomeCategoria}".`;
                dadosAlterados = { aprovacao: dados.solicitacao };
                break;
            }
            case 'CRIACAO_LANCAMENTO_DETALHADO': {
                const { lancamento } = dados;
                const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lancamento.valor);
                detalhes = `Criou a compra detalhada #${lancamento.id} ("${lancamento.descricao}") com ${lancamento.itens} itens, totalizando ${valorFormatado}.`;
                dadosAlterados = dados;
                break;
            }
            case 'APROVACAO_EXCLUSAO':
                detalhes = `Aprovou a exclusão do lançamento #${dados.solicitacao.id_lancamento} ("${dados.solicitacao.dados_antigos.descricao || 'sem descrição'}").`;
                dadosAlterados = { aprovacao: dados.solicitacao };
                break;
            case 'REJEICAO_SOLICITACAO':
                detalhes = `Rejeitou a solicitação para o lançamento #${dados.solicitacao.id_lancamento}. Motivo: ${dados.motivo}`;
                dadosAlterados = { rejeicao: dados.solicitacao, motivo: dados.motivo };
                break;
            default:
                detalhes = 'Ação de auditoria não especificada.';
        }
        
        const query = `
            INSERT INTO fc_logs_auditoria (id_usuario, nome_usuario, acao, detalhes, dados_alterados)
            VALUES ($1, $2, $3, $4, $5);
        `;
        await dbClient.query(query, [idUsuario, nomeUsuario, acao, detalhes, dadosAlterados]);

    } catch (logError) {
        console.error("ERRO CRÍTICO AO REGISTRAR LOG DE AUDITORIA:", logError);
    }
}

// --- Middleware de Autenticação e Conexão para o Módulo Financeiro ---
// Este "porteiro" verifica se o usuário tem a permissão MÍNIMA para acessar qualquer coisa do financeiro.
router.use(async (req, res, next) => {
    try {
        req.usuarioLogado = verificarTokenInterna(req);
        const dbClient = await pool.connect();
        try {
            const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
            // A permissão base para este módulo
            if (!permissoesCompletas.includes('acesso-financeiro')) {
                return res.status(403).json({ error: 'Permissão negada para acessar o módulo financeiro.' });
            }
            req.permissoesUsuario = permissoesCompletas; // Anexa as permissões para uso nas rotas
            next(); // Se tiver permissão, pode prosseguir para a rota específica
        } finally {
            dbClient.release();
        }
    } catch (error) {
        console.error('[router/financeiro MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

// GET /api/financeiro/concessionarias-vt
router.get('/concessionarias-vt', async (req, res) => {
    let dbClient;
    try {
        console.log("[BACKEND /concessionarias-vt] Rota acionada."); // LOG
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM config_concessionarias_vt ORDER BY nome');
        
        console.log(`[BACKEND /concessionarias-vt] Encontradas ${result.rowCount} concessionárias.`); // LOG
        
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("[BACKEND /concessionarias-vt] ERRO:", error); // LOG
        res.status(500).json({ error: 'Erro ao buscar concessionárias.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/financeiro/concessionarias-vt
router.post('/concessionarias-vt', async (req, res) => {
    // Vamos criar uma permissão específica para isso
    if (!req.permissoesUsuario.includes('gerenciar-taxas-vt')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { nome, taxa_recarga_percentual } = req.body;
    if (!nome || taxa_recarga_percentual === undefined) {
        return res.status(400).json({ error: 'Nome e taxa são obrigatórios.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `INSERT INTO config_concessionarias_vt (nome, taxa_recarga_percentual) VALUES ($1, $2) RETURNING *`;
        const result = await dbClient.query(query, [nome, taxa_recarga_percentual]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Erro de nome único
            return res.status(409).json({ error: 'Já existe uma concessionária com este nome.' });
        }
        res.status(500).json({ error: 'Erro ao criar concessionária.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/financeiro/concessionarias-vt/:id
router.put('/concessionarias-vt/:id', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-taxas-vt')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { id } = req.params;
    const { nome, taxa_recarga_percentual, ativo } = req.body;

    if (!nome || taxa_recarga_percentual === undefined || ativo === undefined) {
        return res.status(400).json({ error: 'Nome, taxa e status de ativo são obrigatórios.' });
    }
    
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `UPDATE config_concessionarias_vt SET nome = $1, taxa_recarga_percentual = $2, ativo = $3, updated_at = NOW() WHERE id = $4 RETURNING *`;
        const result = await dbClient.query(query, [nome, taxa_recarga_percentual, ativo, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Concessionária não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Já existe uma concessionária com este nome.' });
        }
        res.status(500).json({ error: 'Erro ao atualizar concessionária.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// --- ROTA PARA O DASHBOARD (FERRAMENTA 4) ---
router.get('/dashboard', async (req, res) => {
    if (!req.permissoesUsuario.includes('visualizar-financeiro')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Calcular saldos de todas as contas ativas
        // Esta query é mais complexa: ela soma todas as entradas e subtrai todas as saídas para cada conta.
        const saldosQuery = `
            SELECT 
                cb.id,
                cb.nome_conta,
                cb.saldo_inicial + COALESCE(SUM(
                    CASE 
                        WHEN l.tipo = 'RECEITA' THEN l.valor 
                        ELSE -l.valor 
                    END
                ), 0) as saldo_atual
            FROM fc_contas_bancarias cb
            LEFT JOIN fc_lancamentos l ON l.id_conta_bancaria = cb.id
            WHERE cb.ativo = true
            GROUP BY cb.id, cb.nome_conta, cb.saldo_inicial
            ORDER BY cb.nome_conta;
        `;

        // 2. Contar alertas de contas a pagar
        const alertasQuery = `
            SELECT 
                -- Contas a pagar hoje
                COUNT(*) FILTER (WHERE tipo = 'A_PAGAR' AND data_vencimento = CURRENT_DATE) as a_pagar_hoje_count,
                COALESCE(SUM(valor) FILTER (WHERE tipo = 'A_PAGAR' AND data_vencimento = CURRENT_DATE), 0) as a_pagar_hoje_total,
                
                -- Contas a pagar nos próximos 3 dias (incluindo amanhã)
                COUNT(*) FILTER (WHERE tipo = 'A_PAGAR' AND data_vencimento > CURRENT_DATE AND data_vencimento <= CURRENT_DATE + INTERVAL '3 days') as a_pagar_3d_count,
                COALESCE(SUM(valor) FILTER (WHERE tipo = 'A_PAGAR' AND data_vencimento > CURRENT_DATE AND data_vencimento <= CURRENT_DATE + INTERVAL '3 days'), 0) as a_pagar_3d_total,

                -- Contas a pagar nos próximos 5 dias (depois dos 3 dias)
                COUNT(*) FILTER (WHERE tipo = 'A_PAGAR' AND data_vencimento > CURRENT_DATE + INTERVAL '3 days' AND data_vencimento <= CURRENT_DATE + INTERVAL '5 days') as a_pagar_5d_count,
                COALESCE(SUM(valor) FILTER (WHERE tipo = 'A_PAGAR' AND data_vencimento > CURRENT_DATE + INTERVAL '3 days' AND data_vencimento <= CURRENT_DATE + INTERVAL '5 days'), 0) as a_pagar_5d_total

            FROM fc_contas_agendadas
            WHERE status = 'PENDENTE';
        `;

        // Executa as duas queries em paralelo
        const [saldosResult, alertasResult] = await Promise.all([
            dbClient.query(saldosQuery),
            dbClient.query(alertasQuery)
        ]);
        
        res.status(200).json({
            saldos: saldosResult.rows,
            alertas: alertasResult.rows[0] // Alertas query sempre retorna uma única linha
        });

    } catch (error) {
        console.error('[API GET /dashboard] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar dados do dashboard.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// --- ROTAS DA FERRAMENTA 1: CONFIGURAÇÕES ---

// GET /api/financeiro/configuracoes - Rota para buscar todas as configurações iniciais
router.get('/configuracoes', async (req, res) => {
    // A permissão 'acesso-financeiro' já foi checada no middleware, então aqui é seguro prosseguir.
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // Usamos Promise.all para fazer as 3 buscas no banco de dados em paralelo, é mais rápido!
        const [contasResult, gruposResult, categoriasResult] = await Promise.all([
            dbClient.query('SELECT * FROM fc_contas_bancarias WHERE ativo = true ORDER BY nome_conta'),
            dbClient.query('SELECT * FROM fc_grupos_financeiros ORDER BY tipo, nome'),
            dbClient.query('SELECT * FROM fc_categorias ORDER BY nome')
        ]);

        res.status(200).json({
            contas: contasResult.rows,
            grupos: gruposResult.rows,
            categorias: categoriasResult.rows
        });

    } catch (error) {
        console.error('[API /financeiro/configuracoes] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar configurações financeiras.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// --- ROTAS PARA GERENCIAR CONTAS BANCÁRIAS ---
router.post('/contas', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-contas')) {
        return res.status(403).json({ error: 'Permissão negada para criar contas bancárias.' });
    }
    const { nome_conta, banco, agencia, numero_conta, saldo_inicial } = req.body;
    if (!nome_conta) {
        return res.status(400).json({ error: 'O nome da conta é obrigatório.' });
    }
    
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO fc_contas_bancarias (nome_conta, banco, agencia, numero_conta, saldo_inicial)
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const result = await dbClient.query(query, [nome_conta, banco, agencia, numero_conta, saldo_inicial || 0]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar conta bancária.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.put('/contas/:id', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-contas')) {
        return res.status(403).json({ error: 'Permissão negada para editar contas bancárias.' });
    }
    const { id } = req.params;
    // CORREÇÃO: Recebendo o campo 'ativo' do body
    const { nome_conta, banco, agencia, numero_conta, ativo } = req.body;

    if (!nome_conta) {
        return res.status(400).json({ error: 'O nome da conta é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        // CORREÇÃO: Adicionando 'ativo' no SET da query. 
        // Não permitimos mais editar o saldo inicial aqui.
        const query = `
            UPDATE fc_contas_bancarias
            SET nome_conta = $1, banco = $2, agencia = $3, numero_conta = $4, ativo = $5, atualizado_em = NOW()
            WHERE id = $6 RETURNING *;
        `;
        // CORREÇÃO: Passando 'ativo' como parâmetro.
        const result = await dbClient.query(query, [nome_conta, banco, agencia, numero_conta, ativo, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Conta bancária não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar conta bancária.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// --- ROTAS PARA GERENCIAR GRUPOS FINANCEIROS ---
router.post('/grupos', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-categorias')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { nome, tipo } = req.body;
    if (!nome || !tipo || !['RECEITA', 'DESPESA'].includes(tipo)) {
        return res.status(400).json({ error: 'Nome e tipo (RECEITA ou DESPESA) são obrigatórios.' });
    }
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `INSERT INTO fc_grupos_financeiros (nome, tipo) VALUES ($1, $2) RETURNING *;`;
        const result = await dbClient.query(query, [nome, tipo]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar grupo financeiro.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.put('/grupos/:id', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-categorias')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { id } = req.params;
    const { nome, tipo } = req.body;
    if (!nome || !tipo || !['RECEITA', 'DESPESA'].includes(tipo)) {
        return res.status(400).json({ error: 'Nome e tipo (RECEITA ou DESPESA) são obrigatórios.' });
    }
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `UPDATE fc_grupos_financeiros SET nome = $1, tipo = $2, atualizado_em = NOW() WHERE id = $3 RETURNING *;`;
        const result = await dbClient.query(query, [nome, tipo, id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Grupo não encontrado.' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar grupo financeiro.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// --- ROTAS PARA GERENCIAR CATEGORIAS ---
router.post('/categorias', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-categorias')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { nome, id_grupo } = req.body;
    if (!nome || !id_grupo) {
        return res.status(400).json({ error: 'Nome da categoria e ID do grupo são obrigatórios.' });
    }
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `INSERT INTO fc_categorias (nome, id_grupo) VALUES ($1, $2) RETURNING *;`;
        const result = await dbClient.query(query, [nome, id_grupo]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar categoria.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.put('/categorias/:id', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-categorias')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { id } = req.params;
    const { nome, id_grupo } = req.body;
    if (!nome || !id_grupo) {
        return res.status(400).json({ error: 'Nome da categoria e ID do grupo são obrigatórios.' });
    }
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `UPDATE fc_categorias SET nome = $1, id_grupo = $2, atualizado_em = NOW() WHERE id = $3 RETURNING *;`;
        const result = await dbClient.query(query, [nome, id_grupo, id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada.' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar categoria.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// --- ROTAS PARA LANÇAMENTOS (FERRAMENTA 2) ---
router.get('/lancamentos', async (req, res) => {
    if (!req.permissoesUsuario.includes('visualizar-financeiro')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    
    const { limit = 50, page = 1, dataInicio, dataFim, tipo, idConta, termoBusca } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let dbClient;
    try {
        dbClient = await pool.connect();

        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        if (dataInicio) {
            whereClauses.push(`l.data_transacao >= $${paramIndex++}`);
            params.push(dataInicio);
        }
        if (dataFim) {
            whereClauses.push(`l.data_transacao <= $${paramIndex++}`);
            params.push(dataFim);
        }
        if (tipo) {
            whereClauses.push(`l.tipo = $${paramIndex++}`);
            params.push(tipo);
        }
        if (idConta) {
            whereClauses.push(`l.id_conta_bancaria = $${paramIndex++}`);
            params.push(idConta);
        }
        if (termoBusca) {
            if (termoBusca.startsWith('#')) {
                const idNumerico = parseInt(termoBusca.substring(1), 10);
                if (!isNaN(idNumerico)) {
                    whereClauses.push(`l.id = $${paramIndex++}`);
                    params.push(idNumerico);
                }
            } else {
                whereClauses.push(`(l.descricao ILIKE $${paramIndex} OR fav.nome ILIKE $${paramIndex})`);
                params.push(`%${termoBusca}%`);
                paramIndex++;
            }
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const baseQuery = `
            FROM fc_lancamentos l
            JOIN fc_contas_bancarias cb ON l.id_conta_bancaria = cb.id
            LEFT JOIN fc_categorias cat ON l.id_categoria = cat.id
            LEFT JOIN fc_contatos fav ON l.id_contato = fav.id
            JOIN usuarios u ON l.id_usuario_lancamento = u.id
        `;
        
        const query = `
            SELECT 
        l.*, 
        cb.nome_conta,
        cat.nome as nome_categoria,
        u.nome as nome_usuario, 
        fav.nome as nome_favorecido,
        (
            SELECT json_agg(json_build_object(
                'id', li.id,
                'descricao_item', li.descricao_item,
                'valor_item', li.valor_item,
                'id_categoria', li.id_categoria,
                'nome_categoria', cat_item.nome,
                'id_contato_item', li.id_contato_item,
                'nome_contato_item', contato_item.nome
            ))
            FROM fc_lancamento_itens li
            -- Join opcional para a categoria do item, caso ainda exista
            LEFT JOIN fc_categorias cat_item ON li.id_categoria = cat_item.id
            -- Join opcional para o contato do item (o sub-favorecido)
            LEFT JOIN fc_contatos contato_item ON li.id_contato_item = contato_item.id
            WHERE li.id_lancamento_pai = l.id
        ) as itens
            ${baseQuery}
            ${whereString}
            ORDER BY l.data_transacao DESC, l.id DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++};
        `;
        params.push(limit, offset);
        
        const countQuery = `SELECT COUNT(l.id) ${baseQuery} ${whereString};`;
        const countParams = params.slice(0, -2);
        
        const [result, countResult] = await Promise.all([
             dbClient.query(query, params),
             dbClient.query(countQuery, countParams)
        ]);

        const total = parseInt(countResult.rows[0].count, 10);
        
        res.status(200).json({
            lancamentos: result.rows,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit) || 1
        });

    } catch (error) {
        console.error('[API GET /lancamentos] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar lançamentos.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/lancamentos', async (req, res) => {
    if (!req.permissoesUsuario.includes('lancar-transacao')) {
        return res.status(403).json({ error: 'Permissão negada para criar lançamentos.' });
    }
    
    const { id_conta_bancaria, id_categoria, tipo, valor, data_transacao, descricao, id_contato } = req.body;
    
    if (!id_conta_bancaria || !id_categoria || !tipo || !valor || !data_transacao) {
        return res.status(400).json({ error: 'Campos obrigatórios estão faltando.' });
    }
    
    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const query = `
            INSERT INTO fc_lancamentos 
                (id_conta_bancaria, id_categoria, tipo, valor, data_transacao, descricao, id_contato, id_usuario_lancamento)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *;
        `;
        const result = await dbClient.query(query, [
            id_conta_bancaria,
            id_categoria,
            tipo,
            valor,
            data_transacao,
            descricao,
            id_contato || null,
            req.usuarioLogado.id
        ]);
        const novoLancamento = result.rows[0];

        await registrarLog(
            dbClient,
            req.usuarioLogado.id,
            req.usuarioLogado.nome,
            'CRIACAO_LANCAMENTO',
            { lancamento: novoLancamento } // Passa o objeto para a função de log
        );

        await dbClient.query('COMMIT');
        res.status(201).json(novoLancamento);

    } catch (error) {
        if(dbClient) await dbClient.query('ROLLBACK');
        console.error("[API POST /lancamentos] Erro:", error);
        res.status(500).json({ error: 'Erro ao criar lançamento.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// --- ROTAS PARA CONTATOS (CLIENTES/FORNECEDORES) ---
router.get('/contatos', async (req, res) => {
    // A verificação de permissão é mantida, pois é uma boa prática de segurança.
    if (!req.permissoesUsuario.includes('visualizar-financeiro')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    
    const termoBusca = req.query.q;
    
    if (!termoBusca || termoBusca.trim() === '') {
        return res.status(200).json([]); 
    }

    let dbClient;
    try {
        dbClient = await pool.connect();

        // Alteramos a query para selecionar também a coluna 'tipo'
        const query = 'SELECT id, nome, tipo FROM fc_contatos WHERE nome ILIKE $1 AND ativo = true ORDER BY nome LIMIT 10';
        const params = [`%${termoBusca.trim()}%`];

        const result = await dbClient.query(query, params);
        
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API GET /contatos] Erro na execução da query:', error);
        res.status(500).json({ error: 'Erro interno ao buscar favorecidos.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// Listar TODOS os contatos para a tela de gerenciamento
router.get('/contatos/all', async (req, res) => {
    if (!req.permissoesUsuario.includes('visualizar-financeiro')) { // Usando uma permissão base
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM fc_contatos ORDER BY nome');
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar todos os contatos.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/contatos', async (req, res) => {
    if (!req.permissoesUsuario.includes('criar-favorecido')) {
        return res.status(403).json({ error: 'Permissão negada para criar novos favorecidos.' });
    }
    
    const { nome, tipo, cpf_cnpj, observacoes } = req.body;
    const tiposValidos = ['CLIENTE', 'FORNECEDOR', 'EMPREGADO', 'EX_EMPREGADO', 'SOCIOS', 'AMBOS'];
    
    if (!nome || !tipo || !tiposValidos.includes(tipo)) {
        return res.status(400).json({ error: `Nome e tipo são obrigatórios. O tipo deve ser um de: ${tiposValidos.join(', ')}.` });
    }
    
    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. VERIFICA SE JÁ EXISTE um contato com o mesmo nome e tipo.
        const checkQuery = 'SELECT id FROM fc_contatos WHERE nome = $1 AND tipo = $2';
        const existingContact = await dbClient.query(checkQuery, [nome, tipo]);

        // 2. SE EXISTIR, retorna um erro amigável (409 Conflict).
        if (existingContact.rows.length > 0) {
            return res.status(409).json({ error: 'Este contato já está cadastrado com este tipo.' });
        }

        // 3. SE NÃO EXISTIR, prossegue com a criação.
        const insertQuery = 'INSERT INTO fc_contatos (nome, tipo, cpf_cnpj, observacoes) VALUES ($1, $2, $3, $4) RETURNING *;';
        const result = await dbClient.query(insertQuery, [nome, tipo, cpf_cnpj, observacoes]);
        
        res.status(201).json(result.rows[0]);

    } catch (error) {
        // Este catch agora é para erros inesperados, não para duplicidade.
        console.error('[API POST /contatos] Erro inesperado:', error);
        res.status(500).json({ error: 'Erro ao criar contato.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// NOVA ROTA: Atualizar um contato
router.put('/contatos/:id', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-categorias')) { // Usando permissão de categorias por enquanto
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { id } = req.params;
    const { nome, tipo, cpf_cnpj, observacoes } = req.body;
    const tiposValidos = ['CLIENTE', 'FORNECEDOR', 'EMPREGADO', 'EX_EMPREGADO', 'SOCIOS', 'AMBOS'];
    if (!nome || !tipo || !tiposValidos.includes(tipo)) {
        return res.status(400).json({ error: 'Dados inválidos.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            UPDATE fc_contatos 
            SET nome = $1, tipo = $2, cpf_cnpj = $3, observacoes = $4 
            WHERE id = $5 RETURNING *;
        `;
        const result = await dbClient.query(query, [nome, tipo, cpf_cnpj, observacoes, id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Contato não encontrado.' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar contato.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// INATIVAR/REATIVAR em vez de deletar
router.put('/contatos/:id/status', async (req, res) => {
    if (!req.permissoesUsuario.includes('gerenciar-categorias')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { id } = req.params;
    const { ativo } = req.body; // Espera receber { "ativo": false } ou { "ativo": true }

    if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'O status "ativo" (true/false) é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = 'UPDATE fc_contatos SET ativo = $1 WHERE id = $2 RETURNING *;';
        const result = await dbClient.query(query, [ativo, id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Favorecido não encontrado.' });
        
        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao alterar status do favorecido.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.put('/lancamentos/:id', async (req, res) => {
    if (!req.permissoesUsuario.includes('editar-transacao')) {
        return res.status(403).json({ error: 'Permissão negada para editar lançamentos.' });
    }

    const { id } = req.params;
    const novosDados = req.body; // O corpo agora contém apenas os novos dados do lançamento
    
    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const lancamentoOriginalRes = await dbClient.query('SELECT * FROM fc_lancamentos WHERE id = $1 FOR UPDATE', [id]);
        if (lancamentoOriginalRes.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Lançamento não encontrado.' });
        }
        
        const lancamentoOriginal = lancamentoOriginalRes.rows[0];
        
        if (req.permissoesUsuario.includes('aprovar-alteracao-financeira')) {
            // FLUXO DO ADMIN: Edita diretamente
            console.log(`[Lançamento #${id}] Edição direta por usuário com permissão: ${req.usuarioLogado.nome}`);
            const { valor, data_transacao, id_categoria, id_conta_bancaria, descricao, id_contato } = novosDados;
            
            const queryUpdate = `
                UPDATE fc_lancamentos 
                SET valor=$1, data_transacao=$2, id_categoria=$3, id_conta_bancaria=$4, descricao=$5, id_contato=$6, status_edicao='OK', motivo_rejeicao=NULL 
                WHERE id = $7 RETURNING *;`;
            const updatedResult = await dbClient.query(queryUpdate, [valor, data_transacao, id_categoria, id_conta_bancaria, descricao, id_contato, id]);
            
            await registrarLog(dbClient, req.usuarioLogado.id, req.usuarioLogado.nome, 'EDICAO_DIRETA_LANCAMENTO', { antes: lancamentoOriginal, depois: updatedResult.rows[0] });
            
            await dbClient.query('COMMIT');
            return res.status(200).json({ 
                message: 'Lançamento atualizado com sucesso.',
                lancamento: updatedResult.rows[0]
            });
        } else {
            // FLUXO DO USUÁRIO COMUM: Sempre solicita aprovação
            console.log(`[Lançamento #${id}] Solicitação de edição por usuário comum: ${req.usuarioLogado.nome}`);
            const solRes = await dbClient.query(
                `INSERT INTO fc_solicitacoes_alteracao 
                    (id_lancamento, tipo_solicitacao, dados_antigos, dados_novos, id_usuario_solicitante) 
                 VALUES ($1, 'EDICAO', $2, $3, $4) RETURNING *;`, 
                [id, JSON.stringify(lancamentoOriginal), JSON.stringify(novosDados), req.usuarioLogado.id]
            );
            await dbClient.query(`UPDATE fc_lancamentos SET status_edicao = 'PENDENTE_APROVACAO', motivo_rejeicao=NULL WHERE id = $1`, [id]);
            
            await registrarLog(dbClient, req.usuarioLogado.id, req.usuarioLogado.nome, 'SOLICITACAO_EDICAO_LANCAMENTO', { id_lancamento: id, solicitacao: solRes.rows[0] });
            
            await dbClient.query('COMMIT');
            return res.status(202).json({ message: 'Edição solicitada e aguardando aprovação.' });
        }
    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error("[API PUT /lancamentos/:id] Erro:", error);
        res.status(500).json({ error: 'Erro ao processar edição do lançamento.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/lancamentos/:id/solicitar-exclusao', async (req, res) => {
    if (!req.permissoesUsuario.includes('editar-transacao')) {
        return res.status(403).json({ error: 'Permissão negada para solicitar exclusão.' });
    }
    const { id } = req.params;
    const { justificativa } = req.body;

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const lancamentoOriginalRes = await dbClient.query('SELECT * FROM fc_lancamentos WHERE id = $1 FOR UPDATE', [id]);
        if (lancamentoOriginalRes.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Lançamento não encontrado.' });
        }
        
        const lancamentoOriginal = lancamentoOriginalRes.rows[0];

        if (req.permissoesUsuario.includes('aprovar-alteracao-financeira')) {
            console.log(`[ADMIN FLOW] Tentando excluir diretamente o lançamento #${id}...`);
            await registrarLog(dbClient, req.usuarioLogado.id, req.usuarioLogado.nome, 'EXCLUSAO_DIRETA_LANCAMENTO', { lancamento: lancamentoOriginal });

            // PASSO 1: Desvincular de contas agendadas (se houver vínculo)
            await dbClient.query("UPDATE fc_contas_agendadas SET id_lancamento_efetivado = NULL, status = 'PENDENTE' WHERE id_lancamento_efetivado = $1", [id]);
            
            // PASSO 2: Deletar itens filhos (rateio)
            await dbClient.query('DELETE FROM fc_lancamento_itens WHERE id_lancamento_pai = $1', [id]);
            
            // PASSO 3: Deletar o lançamento pai
            await dbClient.query('DELETE FROM fc_lancamentos WHERE id = $1', [id]);
            
            await dbClient.query('COMMIT');
            return res.status(200).json({ message: 'Lançamento excluído com sucesso. A conta agendada original, se existir, voltou a ficar pendente.' });
        } else {
            // FLUXO DO USUÁRIO COMUM (sem alteração)
            console.log(`[USER FLOW] Solicitação de exclusão para o lançamento #${id}...`);
            if (!justificativa || justificativa.trim() === '') {
                await dbClient.query('ROLLBACK');
                return res.status(400).json({ error: 'A justificativa é obrigatória para solicitar a exclusão.' });
            }
            await dbClient.query("UPDATE fc_lancamentos SET status_edicao = 'PENDENTE_EXCLUSAO', motivo_rejeicao = NULL WHERE id = $1", [id]);
            const solRes = await dbClient.query(
                `INSERT INTO fc_solicitacoes_alteracao (id_lancamento, tipo_solicitacao, dados_antigos, id_usuario_solicitante, justificativa_solicitante) VALUES ($1, 'EXCLUSAO', $2, $3, $4) RETURNING *;`, 
                [id, JSON.stringify(lancamentoOriginal), req.usuarioLogado.id, justificativa.trim()]
            );
            await registrarLog(dbClient, req.usuarioLogado.id, req.usuarioLogado.nome, 'SOLICITACAO_EXCLUSAO_LANCAMENTO', { id_lancamento: id, solicitacao: solRes.rows[0] });
            await dbClient.query('COMMIT');
            return res.status(202).json({ message: 'Solicitação de exclusão enviada para aprovação.' });
        }
    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error(`[API /solicitar-exclusao] ERRO CRÍTICO no processamento da exclusão do lançamento #${id}:`, error);
        res.status(500).json({ error: 'Erro interno ao processar solicitação de exclusão.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/lancamentos/detalhado', async (req, res) => {
    if (!req.permissoesUsuario.includes('lancar-transacao')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }

    const { dados_pai, itens_filho, tipo_rateio } = req.body;

    if (!dados_pai || !Array.isArray(itens_filho) || itens_filho.length === 0) {
        return res.status(400).json({ error: 'Estrutura de dados inválida.' });
    }
    
    // Calcula o valor total a partir da soma dos filhos
    const valor_total_calculado = itens_filho.reduce((acc, item) => acc + parseFloat(item.valor_item || 0), 0);
    if (valor_total_calculado <= 0) {
        return res.status(400).json({ error: 'O valor total do lançamento deve ser maior que zero.' });
    }

    // Validações dos dados do "pai"
    const { id_conta_bancaria, data_transacao, id_contato, id_categoria, descricao } = dados_pai;
    if (!id_conta_bancaria || !data_transacao) {
        return res.status(400).json({ error: 'Conta bancária e data são obrigatórios.' });
    }
    // Validações específicas por tipo de rateio
    if (tipo_rateio === 'DETALHADO' && (!id_contato || !id_categoria)) {
         return res.status(400).json({ error: 'Para rateio detalhado, o favorecido e a categoria geral são obrigatórios.' });
    }
     if (tipo_rateio === 'COMPRA' && !id_contato) {
         return res.status(400).json({ error: 'Para compra detalhada, o fornecedor é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        // 1. Insere o lançamento "pai"
        const lancamentoPaiQuery = `
            INSERT INTO fc_lancamentos 
                (id_conta_bancaria, tipo, valor, data_transacao, descricao, id_contato, id_categoria, id_usuario_lancamento, tipo_rateio)
            VALUES ($1, 'DESPESA', $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id;
        `;
        const lancamentoPaiResult = await dbClient.query(lancamentoPaiQuery, [
            id_conta_bancaria, valor_total_calculado, data_transacao, descricao, 
            id_contato, 
            // Para 'COMPRA', a categoria do pai é nula. Para 'DETALHADO', usamos a categoria geral.
            tipo_rateio === 'COMPRA' ? null : id_categoria,
            req.usuarioLogado.id, 
            tipo_rateio || null
        ]);
        const novoLancamentoId = lancamentoPaiResult.rows[0].id;

        // 2. Itera sobre cada item "filho" e o insere
        for (const item of itens_filho) {
            if (!item.valor_item) {
                throw new Error('Cada item detalhado deve ter um valor.');
            }
            
            // Validação de campos obrigatórios por tipo de rateio
            if (tipo_rateio === 'COMPRA' && !item.id_categoria) {
                 throw new Error('Cada item da compra deve ter uma categoria.');
            }
            if (tipo_rateio === 'DETALHADO' && !item.id_contato_item) {
                throw new Error('Cada item do rateio deve ter um favorecido.');
            }
            
            // Query de inserção agora é a mesma para ambos, mas com valores diferentes
            const itemQuery = `
                INSERT INTO fc_lancamento_itens (id_lancamento_pai, id_categoria, descricao_item, valor_item, id_contato_item)
                VALUES ($1, $2, $3, $4, $5);
            `;
            await dbClient.query(itemQuery, [
                novoLancamentoId, 
                item.id_categoria, // CORREÇÃO: Passa a categoria do item
                item.descricao_item, 
                item.valor_item, 
                item.id_contato_item || null // Garante que será null se não for fornecido
            ]);
        }
        
        await registrarLog(
            dbClient,
            req.usuarioLogado.id,
            req.usuarioLogado.nome,
            'CRIACAO_LANCAMENTO_DETALHADO',
            { lancamento: { id: novoLancamentoId, descricao: descricao, valor: valor_total_calculado, itens: itens_filho.length, tipo_rateio: tipo_rateio } }
        );

        await dbClient.query('COMMIT');
        res.status(201).json({ message: `Lançamento detalhado #${novoLancamentoId} com ${itens_filho.length} itens registrado com sucesso.` });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error("[API POST /lancamentos/detalhado] Erro:", error);
        res.status(500).json({ error: 'Erro ao registrar lançamento detalhado.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/financeiro/contas-agendadas - Listar contas
router.get('/contas-agendadas', async (req, res) => {
    if (!req.permissoesUsuario.includes('visualizar-financeiro')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    
    // Filtro por status (ex: /contas-agendadas?status=PENDENTE)
    const { status } = req.query;
    let dbClient;
    try {
        dbClient = await pool.connect();
        let query = `
            SELECT 
                ca.*, 
                cat.nome as nome_categoria, 
                c.nome as nome_favorecido,
                u.nome as nome_usuario_agendamento -- CAMPO ADICIONADO
            FROM fc_contas_agendadas ca
            JOIN fc_categorias cat ON ca.id_categoria = cat.id
            LEFT JOIN fc_contatos c ON ca.id_contato = c.id
            JOIN usuarios u ON ca.id_usuario_agendamento = u.id -- JOIN ADICIONADO
        `;
        const params = [];
        if (status) {
            query += ' WHERE ca.status = $1';
            params.push(status);
        }
        query += ' ORDER BY ca.data_vencimento ASC;';

        const result = await dbClient.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar contas agendadas.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/financeiro/contas-agendadas - Agendar nova conta
router.post('/contas-agendadas', async (req, res) => {
    if (!req.permissoesUsuario.includes('lancar-transacao')) {
        return res.status(403).json({ error: 'Permissão negada para agendar contas.' });
    }
    const { id_categoria, id_contato, tipo, descricao, valor, data_vencimento } = req.body;
    if (!id_categoria || !tipo || !descricao || !valor || !data_vencimento) {
        return res.status(400).json({ error: 'Campos obrigatórios estão faltando.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO fc_contas_agendadas (id_categoria, id_contato, tipo, descricao, valor, data_vencimento, id_usuario_agendamento)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;
        `;
        const result = await dbClient.query(query, [
            id_categoria, id_contato || null, tipo, descricao, valor, data_vencimento, req.usuarioLogado.id
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao agendar conta.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/financeiro/contas-agendadas/:id/baixar - Dar baixa (pagar/receber)
router.post('/contas-agendadas/:id/baixar', async (req, res) => {
    if (!req.permissoesUsuario.includes('aprovar-pagamento')) {
        return res.status(403).json({ error: 'Permissão negada para dar baixa em contas.' });
    }

    const { id } = req.params;
    const { id_conta_bancaria, data_transacao } = req.body;
    if (!id_conta_bancaria || !data_transacao) {
        return res.status(400).json({ error: 'É necessário informar a conta bancária e a data do pagamento/recebimento.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN'); // INICIA A TRANSAÇÃO

        // 1. Busca a conta agendada e bloqueia a linha para evitar dupla baixa (FOR UPDATE)
        const contaAgendadaRes = await dbClient.query('SELECT * FROM fc_contas_agendadas WHERE id = $1 FOR UPDATE', [id]);
        if (contaAgendadaRes.rows.length === 0) throw new Error('Conta agendada não encontrada.');
        
        const contaAgendada = contaAgendadaRes.rows[0];
        if (contaAgendada.status !== 'PENDENTE') throw new Error(`Esta conta já possui o status "${contaAgendada.status}".`);

        // 2. Cria o lançamento real na tabela fc_lancamentos
        const tipoLancamento = contaAgendada.tipo === 'A_PAGAR' ? 'DESPESA' : 'RECEITA';
        const lancamentoQuery = `
            INSERT INTO fc_lancamentos (id_conta_bancaria, id_categoria, tipo, valor, data_transacao, descricao, id_contato, id_usuario_lancamento)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;
        `;
        const lancamentoRes = await dbClient.query(lancamentoQuery, [
            id_conta_bancaria,
            contaAgendada.id_categoria,
            tipoLancamento,
            contaAgendada.valor,
            data_transacao,
            `Baixa da conta agendada #${id}: ${contaAgendada.descricao}`,
            contaAgendada.id_contato,
            req.usuarioLogado.id
        ]);
        const novoLancamentoId = lancamentoRes.rows[0].id;

        // 3. Atualiza a conta agendada com o status "PAGO" e o ID do lançamento
        const updateQuery = 'UPDATE fc_contas_agendadas SET status = $1, id_lancamento_efetivado = $2, atualizado_em = NOW() WHERE id = $3';
        await dbClient.query(updateQuery, ['PAGO', novoLancamentoId, id]);

        await dbClient.query('COMMIT'); // FINALIZA A TRANSAÇÃO
        res.status(200).json({ message: 'Baixa da conta realizada com sucesso!' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // DESFAZ TUDO EM CASO DE ERRO
        res.status(500).json({ error: 'Erro ao dar baixa na conta.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/financeiro/contas-agendadas/lote - Cria múltiplas parcelas
router.post('/contas-agendadas/lote', async (req, res) => {
    if (!req.permissoesUsuario.includes('lancar-transacao')) {
        return res.status(403).json({ error: 'Permissão negada para agendar contas.' });
    }

    const { descricao_lote, valor_total, parcelas } = req.body;
    if (!descricao_lote || !valor_total || !Array.isArray(parcelas) || parcelas.length === 0) {
        return res.status(400).json({ error: 'Dados inválidos para agendamento em lote.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN'); // INICIA A TRANSAÇÃO

        // 1. Cria o registro do Lote principal
        const loteQuery = `
            INSERT INTO fc_lotes_agendamento (descricao_lote, valor_total, id_usuario_criacao)
            VALUES ($1, $2, $3) RETURNING id;
        `;
        const loteResult = await dbClient.query(loteQuery, [descricao_lote, valor_total, req.usuarioLogado.id]);
        const novoLoteId = loteResult.rows[0].id;

        // 2. Itera sobre cada parcela e a insere no banco, vinculando ao Lote
        for (const parcela of parcelas) {
            const { id_categoria, id_contato, tipo, descricao, valor, data_vencimento } = parcela;
            // Validação de cada parcela
            if (!id_categoria || !tipo || !descricao || !valor || !data_vencimento) {
                throw new Error(`Dados incompletos para uma das parcelas: ${descricao}`);
            }

            const parcelaQuery = `
                INSERT INTO fc_contas_agendadas 
                    (id_lote, id_categoria, id_contato, tipo, descricao, valor, data_vencimento, id_usuario_agendamento)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
            `;
            await dbClient.query(parcelaQuery, [
                novoLoteId,
                id_categoria,
                id_contato || null,
                tipo,
                descricao,
                valor,
                data_vencimento,
                req.usuarioLogado.id
            ]);
        }
        
        // 3. Registra um único log de auditoria para a criação do lote
        await registrarLog(
            dbClient,
            req.usuarioLogado.id,
            req.usuarioLogado.nome,
            'CRIACAO_LOTE_AGENDAMENTO',
            { lote: { id: novoLoteId, descricao: descricao_lote, parcelas: parcelas.length, valor: valor_total } }
        );

        await dbClient.query('COMMIT'); // FINALIZA A TRANSAÇÃO
        res.status(201).json({ message: `${parcelas.length} parcelas agendadas com sucesso no lote #${novoLoteId}.` });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // DESFAZ TUDO EM CASO DE ERRO
        console.error("[API POST /contas-agendadas/lote] Erro:", error);
        res.status(500).json({ error: 'Erro ao agendar parcelas.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/financeiro/aprovacoes-pendentes
router.get('/aprovacoes-pendentes', async (req, res) => {
    console.log('[API GET /aprovacoes-pendentes] Rota acessada.');

    if (!req.permissoesUsuario || !req.permissoesUsuario.includes('aprovar-alteracao-financeira')) {
        console.error('[API GET /aprovacoes-pendentes] Falha de permissão. Usuário não tem "aprovar-alteracao-financeira".');
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    console.log('[API GET /aprovacoes-pendentes] Verificação de permissão OK.');
    
    let dbClient;
    try {
        console.log('[API GET /aprovacoes-pendentes] Conectando ao banco...');
        dbClient = await pool.connect();
        console.log('[API GET /aprovacoes-pendentes] Conexão com banco OK.');

        const query = `
            SELECT sa.*, u.nome as nome_solicitante
            FROM fc_solicitacoes_alteracao sa
            JOIN usuarios u ON sa.id_usuario_solicitante = u.id
            WHERE sa.status = 'PENDENTE'
            ORDER BY sa.data_solicitacao ASC;
        `;
        
        console.log('[API GET /aprovacoes-pendentes] Executando query...');
        const result = await dbClient.query(query);
        console.log(`[API GET /aprovacoes-pendentes] Query executada com sucesso. Encontradas ${result.rowCount} solicitações.`);
        
        res.status(200).json(result.rows);

    } catch (error) {
        // Este log é o mais importante em caso de erro 500
        console.error('[API GET /aprovacoes-pendentes] ERRO CRÍTICO DURANTE EXECUÇÃO:', error);
        res.status(500).json({ error: 'Erro interno no servidor ao buscar solicitações pendentes.', details: error.message });
    } finally {
        if (dbClient) {
            dbClient.release();
            console.log('[API GET /aprovacoes-pendentes] Conexão com banco liberada.');
        }
    }
});


// POST /api/financeiro/aprovacoes/:id/aprovar
router.post('/aprovacoes/:id/aprovar', async (req, res) => {
    if (!req.permissoesUsuario.includes('aprovar-alteracao-financeira')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { id } = req.params;
    let dbClient;
    let idLancamento;

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const solRes = await dbClient.query("SELECT * FROM fc_solicitacoes_alteracao WHERE id = $1 AND status = 'PENDENTE' FOR UPDATE", [id]);
        if (solRes.rows.length === 0) throw new Error(`Solicitação #${id} não encontrada ou já processada.`);
        const solicitacao = solRes.rows[0];
        idLancamento = solicitacao.id_lancamento;

        let acaoLog = '';
        let mensagemNotificacao = '';

        if (solicitacao.tipo_solicitacao === 'EDICAO') {
            acaoLog = 'APROVACAO_EDICAO';
            const { valor, data_transacao, id_categoria, id_conta_bancaria, descricao, id_contato } = solicitacao.dados_novos;
            await dbClient.query(
                `UPDATE fc_lancamentos SET valor=$1, data_transacao=$2, id_categoria=$3, id_conta_bancaria=$4, descricao=$5, id_contato=$6, status_edicao='EDITADO_APROVADO', motivo_rejeicao=NULL WHERE id = $7;`, 
                [valor, data_transacao, id_categoria, id_conta_bancaria, descricao, id_contato, idLancamento]
            );
            mensagemNotificacao = `Sua edição para o lançamento <strong>#${idLancamento}</strong> foi APROVADA.`;
        
        } else if (solicitacao.tipo_solicitacao === 'EXCLUSAO') {
            acaoLog = 'APROVACAO_EXCLUSAO';
            
            // PASSO 1: Desvincular de contas agendadas (se houver vínculo)
            await dbClient.query("UPDATE fc_contas_agendadas SET id_lancamento_efetivado = NULL, status = 'PENDENTE' WHERE id_lancamento_efetivado = $1", [idLancamento]);

            // PASSO 2: Deletar os itens filhos (rateio)
            await dbClient.query('DELETE FROM fc_lancamento_itens WHERE id_lancamento_pai = $1', [idLancamento]);
            
            // PASSO 3: Deletar o lançamento pai
            await dbClient.query('DELETE FROM fc_lancamentos WHERE id = $1', [idLancamento]);
            
            mensagemNotificacao = `Sua solicitação para excluir o lançamento <strong>#${idLancamento}</strong> foi APROVADA.`;
        }

        // Atualiza a solicitação para APROVADO
        await dbClient.query("UPDATE fc_solicitacoes_alteracao SET status = 'APROVADO', id_usuario_aprovador = $1, data_decisao = NOW() WHERE id = $2", [req.usuarioLogado.id, id]);
        
        await dbClient.query("INSERT INTO fc_notificacoes (id_usuario_destino, tipo, mensagem) VALUES ($1, 'SUCESSO', $2);", [solicitacao.id_usuario_solicitante, mensagemNotificacao]);
        
        await registrarLog(dbClient, req.usuarioLogado.id, req.usuarioLogado.nome, acaoLog, { solicitacao });
        
        await dbClient.query('COMMIT');
        res.status(200).json({ message: 'Solicitação aprovada com sucesso.' });
    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error(`[API /aprovacoes/aprovar] ERRO CRÍTICO ao aprovar solicitação #${id} para lançamento #${idLancamento}:`, error);
        res.status(500).json({ error: 'Erro interno ao aprovar solicitação.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/financeiro/aprovacoes/:id/rejeitar
router.post('/aprovacoes/:id/rejeitar', async (req, res) => {
    if (!req.permissoesUsuario.includes('aprovar-alteracao-financeira')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo || motivo.trim() === '') {
        return res.status(400).json({error: 'O motivo da rejeição é obrigatório.'});
    }
    
    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const solRes = await dbClient.query("SELECT * FROM fc_solicitacoes_alteracao WHERE id = $1 AND status = 'PENDENTE' FOR UPDATE", [id]);
        if (solRes.rows.length === 0) throw new Error('Solicitação não encontrada ou já processada.');
        const solicitacao = solRes.rows[0];

        // Atualiza o lançamento para o status 'EDICAO_REJEITADA' e salva o motivo da rejeição
        await dbClient.query(
            "UPDATE fc_lancamentos SET status_edicao = 'EDICAO_REJEITADA', motivo_rejeicao = $1 WHERE id = $2", 
            [motivo.trim(), solicitacao.id_lancamento]
        );

        // Atualiza a solicitação para 'REJEITADO'
        await dbClient.query(
            "UPDATE fc_solicitacoes_alteracao SET status = 'REJEITADO', id_usuario_aprovador = $1, motivo_rejeicao = $2, data_decisao = NOW() WHERE id = $3", 
            [req.usuarioLogado.id, motivo.trim(), id]
        );
        
        const mensagemNotificacao = `Sua solicitação para alterar o lançamento <strong>#${solicitacao.id_lancamento} ("${solicitacao.dados_antigos.descricao || 'sem descrição'}")</strong> foi REJEITADA. Motivo: ${motivo.trim()}`;
        await dbClient.query("INSERT INTO fc_notificacoes (id_usuario_destino, tipo, mensagem) VALUES ($1, 'REJEICAO', $2);", [solicitacao.id_usuario_solicitante, mensagemNotificacao]);
        
        await registrarLog(dbClient, req.usuarioLogado.id, req.usuarioLogado.nome, 'REJEICAO_SOLICITACAO', { solicitacao, motivo: motivo.trim() });
        
        await dbClient.query('COMMIT');
        res.status(200).json({ message: 'Solicitação rejeitada com sucesso.' });
    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error("[API /aprovacoes/rejeitar] Erro:", error);
        res.status(500).json({ error: 'Erro ao rejeitar solicitação.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/financeiro/notificacoes - Busca as notificações do usuário logado
router.get('/notificacoes', async (req, res) => {
    const { id: idUsuario } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            SELECT * FROM fc_notificacoes 
            WHERE id_usuario_destino = $1 
            ORDER BY criado_em DESC 
            LIMIT 30; -- Limita para as 30 mais recentes para não sobrecarregar
        `;
        const result = await dbClient.query(query, [idUsuario]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API GET /notificacoes] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar notificações.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/financeiro/notificacoes/:id/marcar-como-lida
router.post('/notificacoes/:id/marcar-como-lida', async (req, res) => {
    const { id: idUsuario } = req.usuarioLogado;
    const { id: idNotificacao } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = 'UPDATE fc_notificacoes SET lida = true WHERE id = $1 AND id_usuario_destino = $2';
        await dbClient.query(query, [idNotificacao, idUsuario]);
        res.status(204).send(); // 204 No Content, sucesso sem corpo de resposta
    } catch (error) {
        console.error('[API POST /notificacoes/marcar-como-lida] Erro:', error);
        res.status(500).json({ error: 'Erro ao marcar notificação como lida.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/financeiro/notificacoes/marcar-todas-como-lidas
router.post('/notificacoes/marcar-todas-como-lidas', async (req, res) => {
    const { id: idUsuario } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('UPDATE fc_notificacoes SET lida = true WHERE id_usuario_destino = $1', [idUsuario]);
        res.status(204).send();
    } catch (error) {
        console.error('[API POST /notificacoes/marcar-todas-como-lidas] Erro:', error);
        res.status(500).json({ error: 'Erro ao marcar todas as notificações como lidas.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/financeiro/logs - Busca os logs de auditoria
router.get('/logs', async (req, res) => {
    // A permissão para ver logs pode ser a mesma de aprovar
    if (!req.permissoesUsuario.includes('aprovar-alteracao-financeira')) {
        return res.status(403).json({ error: 'Permissão negada.' });
    }
    
    const { limit = 100 } = req.query; // Pega os 100 logs mais recentes
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            SELECT * FROM fc_logs_auditoria
            ORDER BY data_evento DESC
            LIMIT $1;
        `;
        const result = await dbClient.query(query, [limit]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("[API GET /logs] Erro:", error);
        res.status(500).json({ error: 'Erro ao buscar histórico de auditoria.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.post('/transferencias', async (req, res) => {
    // Validação de permissão (vamos usar 'lancar-transacao' por enquanto)
    if (!req.permissoesUsuario.includes('lancar-transacao')) {
        return res.status(403).json({ error: 'Permissão negada para realizar transferências.' });
    }

    const { id_conta_origem, id_conta_destino, valor, data_transacao, descricao, id_categoria_transferencia } = req.body;

    // Validação dos dados recebidos
    if (!id_conta_origem || !id_conta_destino || !valor || !data_transacao || !id_categoria_transferencia) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }
    if (id_conta_origem === id_conta_destino) {
        return res.status(400).json({ error: 'A conta de origem e destino não podem ser a mesma.' });
    }
    if (valor <= 0) {
        return res.status(400).json({ error: 'O valor da transferência deve ser positivo.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN'); // Inicia a transação

        // 1. Cria o lançamento de SAÍDA (Despesa)
        const saidaQuery = `
            INSERT INTO fc_lancamentos (id_conta_bancaria, id_categoria, tipo, valor, data_transacao, descricao, id_usuario_lancamento)
            VALUES ($1, $2, 'DESPESA', $3, $4, $5, $6) RETURNING id;
        `;
        const descricaoSaida = `Transferência para conta destino. ${descricao || ''}`;
        const resSaida = await dbClient.query(saidaQuery, [id_conta_origem, id_categoria_transferencia, valor, data_transacao, descricaoSaida, req.usuarioLogado.id]);
        const idLancamentoSaida = resSaida.rows[0].id;

        // 2. Cria o lançamento de ENTRADA (Receita)
        const entradaQuery = `
            INSERT INTO fc_lancamentos (id_conta_bancaria, id_categoria, tipo, valor, data_transacao, descricao, id_usuario_lancamento)
            VALUES ($1, $2, 'RECEITA', $3, $4, $5, $6) RETURNING id;
        `;
        const descricaoEntrada = `Transferência entre contas. ${descricao || ''}`;
        const resEntrada = await dbClient.query(entradaQuery, [id_conta_destino, id_categoria_transferencia, valor, data_transacao, descricaoEntrada, req.usuarioLogado.id]);
        const idLancamentoEntrada = resEntrada.rows[0].id;

        // 3. ATUALIZA os dois lançamentos para VINCULÁ-LOS
        await dbClient.query('UPDATE fc_lancamentos SET id_transferencia_vinculada = $1 WHERE id = $2', [idLancamentoEntrada, idLancamentoSaida]);
        await dbClient.query('UPDATE fc_lancamentos SET id_transferencia_vinculada = $1 WHERE id = $2', [idLancamentoSaida, idLancamentoEntrada]);

        await dbClient.query('COMMIT'); // Confirma a transação
        res.status(201).json({ message: 'Transferência realizada com sucesso!' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // Desfaz tudo em caso de erro
        console.error('[API POST /transferencias] Erro:', error);
        res.status(500).json({ error: 'Erro ao processar transferência.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


export default router;