// api/configuracao-pontos.js
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
    timezone: 'UTC', // Adicionado
});
const SECRET_KEY = process.env.JWT_SECRET;

// Função verificarToken (mantenha ou centralize)
const verificarToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error('Token não fornecido');
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('Token mal formatado');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // console.log('[api/config-pontos - verificarToken] Token decodificado:', decoded);
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
        // console.log(`[router/configuracao-pontos MID] Recebida ${req.method} em ${req.originalUrl}`);
        req.usuarioLogado = verificarToken(req);
        next();
    } catch (error) {
        console.error('[router/configuracao-pontos MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        const responseError = { error: error.message };
        if (error.details) responseError.details = error.details;
        res.status(statusCode).json(responseError);
    }
});

router.get('/padrao', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        // Permissão para ver qualquer config de ponto. Dashboard Tiktik usará ?tipo_atividade=arremate_tiktik
        if (!permissoesCompletas.includes('acesso-ponto-por-processo')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }
        
        const { produto_nome, processo_nome, tipo_atividade, ativo } = req.query; // Adicionado tipo_atividade e ativo
        let query = 'SELECT id, produto_nome, processo_nome, tipo_atividade, pontos_padrao, ativo, data_criacao, data_atualizacao, atualizado_em FROM configuracoes_pontos_processos';
        const queryParams = [];
        const conditions = [];
        let paramIndex = 1;

        if (produto_nome) {
            queryParams.push(`%${produto_nome}%`);
            conditions.push(`produto_nome ILIKE $${paramIndex++}`);
        }
        if (processo_nome) {
            queryParams.push(`%${processo_nome}%`);
            conditions.push(`processo_nome ILIKE $${paramIndex++}`);
        }
        if (tipo_atividade) { // NOVO FILTRO
            queryParams.push(tipo_atividade);
            conditions.push(`tipo_atividade = $${paramIndex++}`);
        }
        if (ativo !== undefined) { // NOVO FILTRO para buscar apenas ativos ou inativos
            queryParams.push(ativo === 'true'); // Converte string 'true'/'false' para boolean
            conditions.push(`ativo = $${paramIndex++}`);
        }


        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY produto_nome, tipo_atividade, processo_nome'; // Adicionado tipo_atividade na ordenação

        const result = await dbCliente.query(query, queryParams);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API GET /configuracao-pontos/padrao] Erro:', error.message);
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});


// POST /api/configuracao-pontos/padrao
// ROTA ATUALIZADA PARA INCLUIR tipo_atividade e usar "Arremate (Config)"
router.post('/padrao', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);
        if (!permissoesCompletas.includes('acesso-ponto-por-processo')) { // Ou sua permissão de edição
            return res.status(403).json({ error: 'Permissão negada para gerenciar configurações de pontos.' });
        }

        const { produto_nome, processo_nome, pontos_padrao, tipo_atividade, ativo = true } = req.body;

        if (!produto_nome || !pontos_padrao || !tipo_atividade) {
            return res.status(400).json({ error: 'Campos produto_nome, tipo_atividade e pontos_padrao são obrigatórios.' });
        }
        
        // Se tipo_atividade for 'arremate_tiktik', processo_nome não é obrigatório vindo do frontend.
        // Se for outro tipo, processo_nome é obrigatório.
        if (tipo_atividade !== 'arremate_tiktik' && !processo_nome) {
            return res.status(400).json({ error: 'Campo processo_nome é obrigatório para este tipo de atividade.' });
        }

        const pontosFloat = parseFloat(pontos_padrao);
        if (isNaN(pontosFloat) || pontosFloat <= 0) {
            return res.status(400).json({ error: 'pontos_padrao deve ser um número positivo.' });
        }

        // *** AJUSTE CHAVE AQUI ***
        // Define o finalProcessoNome:
        // Se for 'arremate_tiktik', usa "Arremate (Config)" (ou o nome padrão que você preferir).
        // Caso contrário, usa o processo_nome fornecido.
        const finalProcessoNome = (tipo_atividade === 'arremate_tiktik') 
                                    ? "Arremate (Config)" 
                                    : processo_nome;

        const upsertQuery = `
            INSERT INTO configuracoes_pontos_processos 
                (produto_nome, processo_nome, tipo_atividade, pontos_padrao, ativo, data_criacao, data_atualizacao, atualizado_em)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
            ON CONFLICT (produto_nome, processo_nome, tipo_atividade) 
            DO UPDATE SET 
                pontos_padrao = EXCLUDED.pontos_padrao, 
                ativo = EXCLUDED.ativo, 
                data_atualizacao = CURRENT_TIMESTAMP,
                atualizado_em = CURRENT_TIMESTAMP
            RETURNING *;`; 
            // A constraint UNIQUE (produto_nome, processo_nome, tipo_atividade) agora funciona bem com isso.

        const result = await dbCliente.query(upsertQuery,
            [produto_nome, finalProcessoNome, tipo_atividade, pontosFloat, ativo]
        );
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[API POST /configuracao-pontos/padrao] Erro:', error.message);
        const statusCode = error.statusCode || (error.code === '23505' ? 409 : 500); // 23505 é unique_violation
        const errorMessage = error.code === '23505' 
            ? 'Erro de conflito: Já existe uma configuração para este produto, processo e tipo de atividade.' 
            : error.message;
        res.status(statusCode).json({ error: errorMessage, details: error.detail });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// PUT /api/configuracao-pontos/padrao/:id
router.put('/padrao/:id', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        if (!permissoesCompletas.includes('acesso-ponto-por-processo')) { // Ou uma permissão mais granular como 'editar-configuracao-ponto'
            return res.status(403).json({ error: 'Permissão negada para atualizar configuração de pontos.' });
        }

        const configId = parseInt(req.params.id, 10);
        const { produto_nome, processo_nome, tipo_atividade, pontos_padrao, ativo } = req.body;

        if (isNaN(configId)) {
            return res.status(400).json({ error: 'ID inválido fornecido na URL.' });
        }

        // Verifica se pelo menos um campo para atualizar foi fornecido
        if (produto_nome === undefined && processo_nome === undefined && tipo_atividade === undefined && pontos_padrao === undefined && ativo === undefined) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar fornecido.' });
        }

        // Validações para campos fornecidos
        if (pontos_padrao !== undefined && (isNaN(parseFloat(pontos_padrao)) || parseFloat(pontos_padrao) <= 0)) {
            return res.status(400).json({ error: 'Se fornecido, pontos_padrao deve ser um número positivo.' });
        }
        if (ativo !== undefined && typeof ativo !== 'boolean') {
            return res.status(400).json({ error: 'Se fornecido, ativo deve ser um booleano (true ou false).' });
        }
        // Adicionar mais validações para produto_nome, processo_nome, tipo_atividade se eles puderem ser atualizados
        // e se tiverem formatos/valores específicos.

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (produto_nome !== undefined) {
            updateFields.push(`produto_nome = $${paramIndex++}`);
            updateValues.push(produto_nome);
        }
        if (processo_nome !== undefined) { // Se você permitir que seja null para arremate, o frontend deve enviar null
            updateFields.push(`processo_nome = $${paramIndex++}`);
            updateValues.push(processo_nome);
        } else if (req.body.hasOwnProperty('processo_nome') && processo_nome === null && tipo_atividade === 'arremate_tiktik') {
            // Caso especial: permitir setar processo_nome para NULL se for um arremate
            updateFields.push(`processo_nome = $${paramIndex++}`);
            updateValues.push(null); // Ou seu valor padrão como "Arremate (Config)"
        }

        if (tipo_atividade !== undefined) {
            updateFields.push(`tipo_atividade = $${paramIndex++}`);
            updateValues.push(tipo_atividade);
        }
        if (pontos_padrao !== undefined) {
            updateFields.push(`pontos_padrao = $${paramIndex++}`);
            updateValues.push(parseFloat(pontos_padrao));
        }
        if (ativo !== undefined) {
            updateFields.push(`ativo = $${paramIndex++}`);
            updateValues.push(ativo);
        }
        
        // Sempre atualizar as datas de modificação
        updateFields.push(`data_atualizacao = CURRENT_TIMESTAMP`);
        updateFields.push(`atualizado_em = CURRENT_TIMESTAMP`); // Se o gatilho não cuidar disso

        if (updateFields.length <= 2 && !req.body.hasOwnProperty('pontos_padrao') && !req.body.hasOwnProperty('ativo') && !req.body.hasOwnProperty('produto_nome') && !req.body.hasOwnProperty('processo_nome') && !req.body.hasOwnProperty('tipo_atividade') ) {
             // Se apenas data_atualizacao e atualizado_em foram adicionados e nenhum outro campo veio no body
            return res.status(400).json({ error: "Nenhum campo de dados válido para atualização." });
        }

        updateValues.push(configId); // Adiciona o ID ao final para a cláusula WHERE
        
        const queryText = `UPDATE configuracoes_pontos_processos SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *;`;
        
        const result = await dbCliente.query(queryText, updateValues);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Configuração de pontos não encontrada para atualização.' });
        }
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error(`[API PUT /configuracao-pontos/padrao/${req.params.id}] Erro:`, error.message);
        // Tratar erro de violação de constraint UNIQUE se produto_nome/processo_nome/tipo_atividade forem alterados
        if (error.code === '23505') { // Código para unique_violation
            return res.status(409).json({ error: 'Erro de conflito: A combinação de produto, processo e tipo de atividade já existe.', details: error.detail });
        }
        res.status(error.statusCode || 500).json({ error: 'Erro interno ao atualizar configuração de pontos.', details: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

// DELETE /api/configuracao-pontos/padrao/:id
router.delete('/padrao/:id', async (req, res) => {
    const { usuarioLogado } = req;
    let dbCliente;
    try {
        dbCliente = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbCliente, usuarioLogado.id);

        if (!permissoesCompletas.includes('acesso-ponto-por-processo')) { // Ou 'excluir-ponto-por-processo'
            return res.status(403).json({ error: 'Permissão negada para excluir configuração de pontos.' });
        }

        const configId = parseInt(req.params.id, 10);
        if (isNaN(configId)) {
            return res.status(400).json({ error: 'ID inválido fornecido na URL.' });
        }
        const result = await dbCliente.query(
            'DELETE FROM configuracoes_pontos_processos WHERE id = $1 RETURNING *;',
            [configId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Configuração de pontos padrão não encontrada.' });
        }
        res.status(200).json({ message: 'Configuração de pontos padrão excluída com sucesso.', deletedItem: result.rows[0] });
    } catch (error) {
        console.error('[API DELETE /configuracao-pontos/padrao/:id] Erro:', error.message, error.stack ? error.stack.substring(0,300):"");
        res.status(error.statusCode || 500).json({ error: error.message });
    } finally {
        if (dbCliente) dbCliente.release();
    }
});

export default router;