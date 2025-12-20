// api/cortes.js
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

// Função verificarTokenOriginal (mantenha a sua ou use uma centralizada)
const verificarTokenOriginal = (reqOriginal) => {
    const token = reqOriginal.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Token não fornecido');
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
        req.usuarioLogado = verificarTokenOriginal(req);
        next();
    } catch (error) {
        console.error('[router/cortes MID] Erro no middleware:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message, details: error.details });
    }
});

router.get('/next-pc-number', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // CORREÇÃO DEFINITIVA COM LIMITADOR:
        // 1. pn ~ '^[0-9]+$': Pega apenas PNs que são puramente números (sem letras, sem traços).
        // 2. LENGTH(pn) < 10: FATOR LIMITADOR. Ignora qualquer número absurdo (maior que 999 milhões).
        // Isso impede que erros ou timestamps entrem na conta.
        const query = `
            SELECT pn FROM cortes 
            WHERE pn ~ '^[0-9]+$' 
            AND LENGTH(pn) < 10
            ORDER BY pn::integer DESC
            LIMIT 1;
        `;
        const result = await dbClient.query(query);

        let nextNumber = 10000; // Começa em 10.000 se não tiver nada
        
        if (result.rows.length > 0) {
            const lastPn = parseInt(result.rows[0].pn, 10);
            if (!isNaN(lastPn)) {
                nextNumber = lastPn + 1;
            }
        }
        
        // Retorna como string para manter padrão
        res.status(200).json({ nextPC: nextNumber.toString() });

    } catch (error) {
        console.error('[API Cortes GET /next-pc-number] Erro:', error);
        res.status(500).json({ error: 'Erro ao gerar próximo número de PC.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/cortes
router.get('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        if (!permissoesCompletas.includes('acesso-ordens-de-producao')) {
            return res.status(403).json({ error: 'Permissão negada para visualizar cortes.' });
        }

        const { status } = req.query;

       const baseSelect = `
            SELECT 
                c.id, c.pn, c.variante, c.quantidade, c.data, c.cortador,
                c.status, c.op, c.data_atualizacao, c.produto_id,
                p.nome AS produto,
                p.imagem AS imagem_produto
            FROM cortes c
            LEFT JOIN produtos p ON c.produto_id = p.id
        `;

        let queryText = `${baseSelect} WHERE c.status != $1`;
        let queryParams = ['excluido'];

        if (status) {
            queryText += ' AND c.status = $2';
            queryParams.push(status);
        }

        queryText += ' ORDER BY c.data DESC, c.id DESC';
        
        const result = await dbClient.query(queryText, queryParams);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[router/cortes GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar cortes.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/cortes
router.post('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);

        // Permite criar corte se tiver permissão específica ou se estiver criando uma OP
        if (!permissoesCompletas.includes('registrar-corte') && !permissoesCompletas.includes('criar-op')) {
            return res.status(403).json({ error: 'Permissão negada para registrar corte.' });
        }

        const {
            produto_id, // Recebe o ID do produto
            variante,
            quantidade,
            data,
            status = 'pendente',
            op = null,
            pn,
            cortador,
            demanda_id
        } = req.body;

        if (!produto_id || quantidade === undefined || !data || !status || !pn) {
            return res.status(400).json({ error: 'Dados incompletos: produto_id, quantidade, data, status e pn são obrigatórios.' });
        }

        const parsedQuantidade = parseInt(quantidade, 10);
        if (isNaN(parsedQuantidade) || parsedQuantidade <= 0) {
            return res.status(400).json({ error: 'Quantidade deve ser um número positivo.' });
        }

        const varianteFinal = (variante === undefined || variante === null || String(variante).trim() === '') ? null : String(variante).trim();
        
        const queryText = `
            INSERT INTO cortes (produto_id, variante, quantidade, data, status, op, pn, cortador, demanda_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [
            parseInt(produto_id),
            varianteFinal,
            parsedQuantidade,
            data,
            status,
            op,
            pn,
            cortador,
            demanda_id || null // Salva no banco
        ];

        const result = await dbClient.query(queryText, values);
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('[router/cortes POST] Erro:', error);
        if (error.code === '23505') { // Erro de violação de chave única (ex: pn duplicado)
            return res.status(409).json({ error: 'Conflito de dados. O Pedido de Corte (PC/PN) já existe.', details: error.detail });
        }
        res.status(500).json({ error: 'Erro interno ao criar o corte.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/cortes
router.put('/', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        if (!permissoesCompletas.includes('marcar-como-cortado') && !permissoesCompletas.includes('editar-op')) {
            return res.status(403).json({ error: 'Permissão negada para atualizar este corte.' });
        }

        const { id, status, cortador, op, quantidade, produto_id, variante } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'ID do corte é obrigatório para atualização.' });
        }

        const fieldsToUpdate = [];
        const updateValues = [];
        let paramCount = 1;

        if (status !== undefined) { fieldsToUpdate.push(`status = $${paramCount++}`); updateValues.push(status); }
        if (cortador !== undefined) { fieldsToUpdate.push(`cortador = $${paramCount++}`); updateValues.push(cortador); }
        if (op !== undefined) { fieldsToUpdate.push(`op = $${paramCount++}`); updateValues.push(op); }
        if (quantidade !== undefined) { fieldsToUpdate.push(`quantidade = $${paramCount++}`); updateValues.push(parseInt(quantidade)); }
        if (produto_id !== undefined) { fieldsToUpdate.push(`produto_id = $${paramCount++}`); updateValues.push(parseInt(produto_id)); }
        if (variante !== undefined) { fieldsToUpdate.push(`variante = $${paramCount++}`); updateValues.push(variante === '' ? null : variante); }

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'Nenhum campo fornecido para atualização.' });
        }

        fieldsToUpdate.push(`data_atualizacao = CURRENT_TIMESTAMP`);
        updateValues.push(id);
        
        const queryText = `UPDATE cortes SET ${fieldsToUpdate.join(', ')} WHERE id = $${paramCount} RETURNING *`;

        const result = await dbClient.query(queryText, updateValues);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corte não encontrado.' });
        }
        res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error('[router/cortes PUT] Erro:', error);
        res.status(500).json({ error: 'Erro ao atualizar corte', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// DELETE /api/cortes
router.delete('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { id } = req.body;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const permissoesCompletas = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        if (!id) return res.status(400).json({ error: 'ID do corte é obrigatório.' });

        // 1. "Soft delete" do corte e pega seus dados completos
        const result = await dbClient.query(
            `UPDATE cortes SET status = 'excluido' WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'Corte não encontrado.' });

        const corteExcluido = result.rows[0];        
        // 2. LÓGICA DE CASCATA
        const opNumeroParaCancelar = corteExcluido.op;

        if (opNumeroParaCancelar) {            
            const opCancelResult = await dbClient.query(
                `UPDATE ordens_de_producao SET status = 'cancelada' WHERE numero = $1 AND status NOT IN ('finalizado', 'cancelada')`,
                [String(opNumeroParaCancelar)] // Força para string por segurança
            );

            if (opCancelResult.rowCount > 0) {
            } else {
                console.warn(`[API Cortes DELETE] AVISO: A OP #${opNumeroParaCancelar} não foi encontrada ou já estava finalizada/cancelada.`);
            }
        } else {
        }

        res.status(200).json({ message: 'Corte marcado como excluído.', corte: corteExcluido });

    } catch (error) {
        console.error('[router/cortes DELETE] Erro:', error);
        res.status(500).json({ error: 'Erro interno na exclusão do corte.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.delete('/', async (req, res) => {
    const { usuarioLogado } = req;
    const { id } = req.body;
    let dbClient;

    try {
        dbClient = await pool.connect();        
        if (!id) {
            return res.status(400).json({ error: 'ID do corte é obrigatório.' });
        }

        // 1. FAZEMOS O "SOFT DELETE" E PEGAMOS OS DADOS DO CORTE
        const result = await dbClient.query(
            `UPDATE cortes SET status = 'excluido' WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Corte não encontrado para exclusão.' });
        }

        const corteExcluido = result.rows[0];

        // 2. LÓGICA DE CASCATA REFORÇADA
        // A OP associada está no campo `corteExcluido.op`.
        // Vamos verificar se ele existe e não é uma string vazia ou nula.
        const opNumeroParaCancelar = corteExcluido.op;

        if (opNumeroParaCancelar) {            
            // Query para cancelar a OP associada.
            // A condição `status NOT IN ('finalizado', 'cancelada')` é CRUCIAL para não
            // reabrir ou alterar uma OP que já foi concluída ou cancelada por outro motivo.
            const opCancelResult = await dbClient.query(
                `UPDATE ordens_de_producao 
                 SET status = 'cancelada' 
                 WHERE numero = $1 AND status NOT IN ('finalizado', 'cancelada')`,
                [opNumeroParaCancelar]
            );

            if(opCancelResult.rowCount > 0) {
            } else {
                console.warn(`[API Cortes DELETE] AVISO: A OP #${opNumeroParaCancelar} associada não foi encontrada para cancelamento ou seu status já era 'finalizado' ou 'cancelada'.`);
            }
        } else {
        }

        // 3. Responde ao frontend com sucesso.
        res.status(200).json({ message: 'Corte marcado como excluído com sucesso.', corte: corteExcluido });

    } catch (error) {
        console.error('[router/cortes DELETE] Erro ao marcar corte como excluído:', error);
        res.status(500).json({ error: 'Erro interno ao processar a exclusão do corte.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


export default router;