// api/niveis-estoque.js
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
            if (!permissoesUsuario.includes('gerenciar-niveis-alerta-estoque')) {
                return res.status(403).json({ error: 'Permissão negada para gerenciar níveis de alerta de estoque.' });
            }
            next();
        } finally {
            dbClient.release();
        }
    } catch (err) {
        res.status(401).json({ error: 'Token inválido ou expirado', details: err.name });
    }
});

// GET /api/niveis-estoque - Listar todas as configurações de níveis
router.get('/', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query(`SELECT * FROM produto_niveis_estoque_alerta WHERE ativo = TRUE`);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar configurações de níveis', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/niveis-estoque/:produtoRefId - Obter configuração para um produto
router.get('/:produtoRefId', async (req, res) => {
    // Esta rota pode não ser mais necessária com a lógica de lote, mas mantemos por enquanto.
    const { produtoRefId } = req.params;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query('SELECT * FROM produto_niveis_estoque_alerta WHERE produto_ref_id = $1 AND ativo = TRUE LIMIT 1', [produtoRefId]);
        res.status(200).json(result.rows.length > 0 ? result.rows[0] : null);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar configuração de nível do produto', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// POST /api/niveis-estoque/batch - Criar/Atualizar configurações em lote (ATUALIZADO)
router.post('/batch', async (req, res) => {
    const { configs } = req.body;
    if (!Array.isArray(configs) || configs.length === 0) {
        return res.status(400).json({ error: 'Array de configurações "configs" é obrigatório.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const resultados = [];
        for (const config of configs) {
            const { produto_ref_id, nivel_estoque_baixo, nivel_reposicao_urgente, nivel_estoque_ideal, ativo } = config;

            // Validação
            if (!produto_ref_id) { throw new Error('Dados incompletos, produto_ref_id é obrigatório.'); }
            
            const nivelBaixo = nivel_estoque_baixo !== null ? parseInt(nivel_estoque_baixo) : null;
            const nivelUrgente = nivel_reposicao_urgente !== null ? parseInt(nivel_reposicao_urgente) : null;
            const nivelIdeal = nivel_estoque_ideal !== null ? parseInt(nivel_estoque_ideal) : null;

            if ((nivelBaixo !== null && (isNaN(nivelBaixo) || nivelBaixo < 0)) ||
                (nivelUrgente !== null && (isNaN(nivelUrgente) || nivelUrgente < 0)) ||
                (nivelIdeal !== null && (isNaN(nivelIdeal) || nivelIdeal < 0))) {
                throw new Error(`Níveis inválidos para ${produto_ref_id}. Devem ser números não negativos.`);
            }
            if (nivelUrgente !== null && nivelBaixo !== null && nivelUrgente > nivelBaixo) {
                throw new Error(`Para ${produto_ref_id}, nível urgente não pode ser > nível baixo.`);
            }
            if (nivelBaixo !== null && nivelIdeal !== null && nivelBaixo > nivelIdeal) {
                throw new Error(`Para ${produto_ref_id}, nível baixo não pode ser > nível ideal.`);
            }
            
            const query = `
                INSERT INTO produto_niveis_estoque_alerta 
                    (produto_ref_id, nivel_estoque_baixo, nivel_reposicao_urgente, nivel_estoque_ideal, ativo)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (produto_ref_id) 
                DO UPDATE SET 
                    nivel_estoque_baixo = EXCLUDED.nivel_estoque_baixo,
                    nivel_reposicao_urgente = EXCLUDED.nivel_reposicao_urgente,
                    nivel_estoque_ideal = EXCLUDED.nivel_estoque_ideal,
                    ativo = EXCLUDED.ativo,
                    atualizado_em = CURRENT_TIMESTAMP
                RETURNING *;
            `;
            const values = [produto_ref_id, nivelBaixo, nivelUrgente, nivelIdeal, ativo === undefined ? true : Boolean(ativo)];
            const result = await dbClient.query(query, values);
            resultados.push(result.rows[0]);
        }

        await dbClient.query('COMMIT');
        res.status(201).json({ message: `${configs.length} configurações salvas.`, data: resultados });
    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API/niveis-estoque POST /batch] Erro:', error);
        res.status(400).json({ error: 'Erro ao salvar configurações em lote', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// ROTA para atualizar prioridades em lote
router.post('/prioridade', async (req, res) => {
    // Espera um array de objetos: [{ produto_ref_id: 'SKU123', prioridade: 1 }, { produto_ref_id: 'SKU456', prioridade: 2 }, ...]
    const { prioridades } = req.body;

    if (!Array.isArray(prioridades)) {
        return res.status(400).json({ error: 'O corpo da requisição deve conter um array "prioridades".' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        // Uma forma eficiente de fazer múltiplos updates no PostgreSQL
        const query = `
            UPDATE produto_niveis_estoque_alerta as pnea SET
                prioridade = c.prioridade
            FROM (VALUES
                ${prioridades.map((_, i) => `($${i*2 + 1}::text, $${i*2 + 2}::integer)`).join(', ')}
            ) AS c(produto_ref_id, prioridade)
            WHERE c.produto_ref_id = pnea.produto_ref_id;
        `;

        const values = prioridades.flatMap(p => [p.produto_ref_id, p.prioridade]);

        await dbClient.query(query, values);
        
        await dbClient.query('COMMIT');
        res.status(200).json({ message: 'Prioridades atualizadas com sucesso.' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API/niveis-estoque POST /prioridade] Erro:', error);
        res.status(500).json({ error: 'Erro ao atualizar prioridades.', details: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;