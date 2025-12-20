// api/precificacao-config.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : undefined,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação e permissão
router.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token mal formatado' });
    
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.usuarioLogado = decoded;

        const dbClient = await pool.connect();
        try {
            const permissoesUsuario = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
            if (!permissoesUsuario.includes('gerenciar-precificacao')) {
                return res.status(403).json({ error: 'Permissão negada para gerenciar configurações de precificação.' });
            }
            next();
        } finally {
            dbClient.release();
        }
    } catch (err) {
        let message = 'Token inválido ou expirado';
        if (err.name === 'TokenExpiredError') message = 'Token expirado';
        return res.status(401).json({ error: message, details: err.name });
    }
});

// --- ROTAS PARA COMPOSIÇÃO DE MATÉRIA-PRIMA DO PRODUTO ---

// GET /api/precificacao-config/:produtoRefId/composicao-mp
router.get('/:produtoRefId/composicao-mp', async (req, res) => {
    const { produtoRefId } = req.params; // Vem da URL
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            SELECT pcm.id, pcm.produto_ref_id, pcm.materia_prima_id, mp.nome as materia_prima_nome, 
                   pcm.quantidade_utilizada, pcm.unidade_medida_utilizada, 
                   mp.unidade_medida as materia_prima_unidade_base, 
                   mp.preco_por_unidade as materia_prima_preco
            FROM produto_composicao_mp pcm
            JOIN materias_primas mp ON pcm.materia_prima_id = mp.id
            WHERE pcm.produto_ref_id = $1  -- Usa o produtoRefId (SKU da variação)
            ORDER BY mp.nome ASC;
        `;
        const result = await dbClient.query(query, [produtoRefId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/precificacao-config GET composicao-mp] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar composição de matéria-prima do produto', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/precificacao-config/:produtoRefId/composicao-mp - Adicionar/Atualizar UMA matéria-prima na composição
// Para atualizar múltiplas, o frontend pode enviar várias requisições ou podemos criar uma rota batch.
// Vamos começar com uma por vez (UPSERT).
router.post('/:produtoRefId/composicao-mp', async (req, res) => {
    const { produtoRefId } = req.params;
    const { materia_prima_id, quantidade_utilizada, unidade_medida_utilizada } = req.body;

    if (!materia_prima_id || quantidade_utilizada === undefined) {
        return res.status(400).json({ error: 'ID da matéria-prima e quantidade utilizada são obrigatórios.' });
    }
    if (isNaN(parseFloat(quantidade_utilizada)) || parseFloat(quantidade_utilizada) <= 0) {
        return res.status(400).json({ error: 'Quantidade utilizada deve ser um número positivo.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        // UPSERT: Tenta inserir, se já existir a combinação produto_ref_id e materia_prima_id, atualiza.
        const query = `
            INSERT INTO produto_composicao_mp (produto_ref_id, materia_prima_id, quantidade_utilizada, unidade_medida_utilizada)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (produto_ref_id, materia_prima_id) 
            DO UPDATE SET 
                quantidade_utilizada = EXCLUDED.quantidade_utilizada,
                unidade_medida_utilizada = EXCLUDED.unidade_medida_utilizada,
                atualizado_em = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const values = [produtoRefId, parseInt(materia_prima_id), parseFloat(quantidade_utilizada), unidade_medida_utilizada || null];
        const result = await dbClient.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API/precificacao-config POST composicao-mp] Erro:', error);
        if (error.code === '23503') { // Foreign key violation on materia_prima_id
            res.status(400).json({ error: 'Matéria-prima com o ID fornecido não existe.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao salvar composição de matéria-prima', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/precificacao-config/composicao-mp/:composicaoId - Remover uma MP da composição
router.delete('/composicao-mp/:composicaoId', async (req, res) => {
    const { composicaoId } = req.params;
    if (isNaN(parseInt(composicaoId))) {
        return res.status(400).json({ error: 'ID da composição inválido.'});
    }
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('DELETE FROM produto_composicao_mp WHERE id = $1 RETURNING *;', [parseInt(composicaoId)]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Registro de composição não encontrado.' });
        }
        res.status(200).json({ message: 'Componente removido da composição com sucesso.', deletedItem: result.rows[0]});
    } catch (error) {
        console.error('[API/precificacao-config DELETE composicao-mp] Erro:', error);
        res.status(500).json({ error: 'Erro ao remover componente da composição.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// --- ROTAS PARA CUSTO DE MÃO DE OBRA DO PRODUTO --- (Similar à composição de MP)

// GET /api/precificacao-config/:produtoRefId/custo-mao-de-obra
router.get('/:produtoRefId/custo-mao-de-obra', async (req, res) => {
    const { produtoRefId } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            SELECT pcmo.id, pcmo.produto_ref_id, pcmo.tipo_mao_de_obra_id, tmo.nome_tipo as mao_de_obra_nome,
                   pcmo.tempo_minutos_producao
            FROM produto_custo_mao_de_obra pcmo
            JOIN tipos_mao_de_obra tmo ON pcmo.tipo_mao_de_obra_id = tmo.id
            WHERE pcmo.produto_ref_id = $1
            ORDER BY tmo.nome_tipo ASC;
        `;
        const result = await dbClient.query(query, [produtoRefId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/precificacao-config GET custo-mao-de-obra] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar custo de mão de obra do produto', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/precificacao-config/:produtoRefId/custo-mao-de-obra (UPSERT)
router.post('/:produtoRefId/custo-mao-de-obra', async (req, res) => {
    const { produtoRefId } = req.params;
    const { tipo_mao_de_obra_id, tempo_minutos_producao } = req.body;

    if (!tipo_mao_de_obra_id || tempo_minutos_producao === undefined) {
        return res.status(400).json({ error: 'ID do tipo de mão de obra e tempo de produção são obrigatórios.' });
    }
    if (isNaN(parseFloat(tempo_minutos_producao)) || parseFloat(tempo_minutos_producao) <= 0) {
        return res.status(400).json({ error: 'Tempo de produção deve ser um número positivo.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO produto_custo_mao_de_obra (produto_ref_id, tipo_mao_de_obra_id, tempo_minutos_producao)
            VALUES ($1, $2, $3)
            ON CONFLICT (produto_ref_id, tipo_mao_de_obra_id) 
            DO UPDATE SET 
                tempo_minutos_producao = EXCLUDED.tempo_minutos_producao,
                atualizado_em = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const values = [produtoRefId, parseInt(tipo_mao_de_obra_id), parseFloat(tempo_minutos_producao)];
        const result = await dbClient.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API/precificacao-config POST custo-mao-de-obra] Erro:', error);
         if (error.code === '23503') { // Foreign key violation
            res.status(400).json({ error: 'Tipo de mão de obra com o ID fornecido não existe.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao salvar custo de mão de obra do produto', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/precificacao-config/custo-mao-de-obra/:custoMoId
router.delete('/custo-mao-de-obra/:custoMoId', async (req, res) => {
    const { custoMoId } = req.params;
     if (isNaN(parseInt(custoMoId))) {
        return res.status(400).json({ error: 'ID do custo de M.O. inválido.'});
    }
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('DELETE FROM produto_custo_mao_de_obra WHERE id = $1 RETURNING *;', [parseInt(custoMoId)]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Registro de custo de M.O. não encontrado.' });
        }
        res.status(200).json({ message: 'Custo de M.O. removido do produto com sucesso.', deletedItem: result.rows[0]});
    } catch (error) {
        console.error('[API/precificacao-config DELETE custo-mao-de-obra] Erro:', error);
        res.status(500).json({ error: 'Erro ao remover custo de M.O. do produto.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// --- ROTAS PARA CONFIGURAÇÕES DE PRECIFICACAO (produto_precificacao_configs) ---

// GET /api/precificacao-config/:produtoRefId/canal/:canalId - Obter config de precificação de um produto para um canal
router.get('/:produtoRefId/canal/:canalId', async (req, res) => {
    const { produtoRefId, canalId } = req.params;
     if (isNaN(parseInt(canalId))) {
        return res.status(400).json({ error: 'ID do canal inválido.'});
    }
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            SELECT * FROM produto_precificacao_configs
            WHERE produto_ref_id = $1 AND canal_venda_id = $2;
        `;
        const result = await dbClient.query(query, [produtoRefId, parseInt(canalId)]);
        if (result.rows.length === 0) {
            // Pode retornar 404 ou um objeto vazio/default se a precificação ainda não foi configurada
            return res.status(200).json(null); // Indica que não há config salva
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('[API/precificacao-config GET config canal] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar configuração de precificação do produto para o canal', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/precificacao-config/:produtoRefId/todas-configs - Obter todas as configs de um produto
router.get('/:produtoRefId/todas-configs', async (req, res) => {
    const { produtoRefId } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            SELECT pc.*, cvc.nome_canal 
            FROM produto_precificacao_configs pc
            JOIN canais_venda_config cvc ON pc.canal_venda_id = cvc.id
            WHERE pc.produto_ref_id = $1
            ORDER BY cvc.nome_canal ASC;
        `;
        const result = await dbClient.query(query, [produtoRefId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API/precificacao-config GET todas-configs] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar todas as configurações de precificação do produto', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});


// POST /api/precificacao-config/:produtoRefId/canal/:canalId - Salvar/Atualizar config de precificação (UPSERT)
router.post('/:produtoRefId/canal/:canalId', async (req, res) => {
    const { produtoRefId, canalId } = req.params;
    const {
        custo_embalagem_unitario,
        custo_operacional_unitario_atribuido,
        imposto_percentual_aplicado,
        margem_lucro_desejada_percentual,
        preco_venda_manual_definido,
        observacoes
    } = req.body;

    if (isNaN(parseInt(canalId))) {
        return res.status(400).json({ error: 'ID do canal inválido.' });
    }
    // Adicionar mais validações para os campos numéricos aqui, se necessário

    let dbClient;
    try {
        dbClient = await pool.connect();
        const query = `
            INSERT INTO produto_precificacao_configs (
                produto_ref_id, canal_venda_id, custo_embalagem_unitario, 
                custo_operacional_unitario_atribuido, imposto_percentual_aplicado, 
                margem_lucro_desejada_percentual, preco_venda_manual_definido, observacoes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (produto_ref_id, canal_venda_id) 
            DO UPDATE SET 
                custo_embalagem_unitario = EXCLUDED.custo_embalagem_unitario,
                custo_operacional_unitario_atribuido = EXCLUDED.custo_operacional_unitario_atribuido,
                imposto_percentual_aplicado = EXCLUDED.imposto_percentual_aplicado,
                margem_lucro_desejada_percentual = EXCLUDED.margem_lucro_desejada_percentual,
                preco_venda_manual_definido = EXCLUDED.preco_venda_manual_definido,
                observacoes = EXCLUDED.observacoes,
                atualizado_em = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const values = [
            produtoRefId,
            parseInt(canalId),
            parseFloat(custo_embalagem_unitario || 0),
            parseFloat(custo_operacional_unitario_atribuido || 0),
            parseFloat(imposto_percentual_aplicado || 0),
            parseFloat(margem_lucro_desejada_percentual || 0),
            preco_venda_manual_definido ? parseFloat(preco_venda_manual_definido) : null, // Aceita null
            observacoes || null
        ];
        const result = await dbClient.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('[API/precificacao-config POST config canal] Erro:', error);
        if (error.code === '23503') { // Foreign key violation on canal_venda_id
            res.status(400).json({ error: 'Canal de venda com o ID fornecido não existe.', details: error.detail });
        } else {
            res.status(500).json({ error: 'Erro ao salvar configuração de precificação', details: error.message });
        }
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;