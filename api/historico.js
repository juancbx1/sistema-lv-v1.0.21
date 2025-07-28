// api/historico.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação (reutilizado em todas as rotas de API)
router.use(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação ausente.' });
        }
        const token = authHeader.split(' ')[1];
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
});

/**
 * Rota para buscar o histórico de pagamentos de comissão do usuário logado.
 * Permite filtrar por ciclo_nome.
 */
router.get('/comissoes', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    const { ciclo_nome } = req.query; // Filtro opcional
    let dbClient;

    try {
        dbClient = await pool.connect();

        // Query base para buscar os pagamentos de comissão não estornados
        let queryText = `
            SELECT 
                id,
                ciclo_nome,
                data_pagamento,
                valor_liquido_pago,
                detalhes_pagamento
            FROM 
                historico_pagamentos_funcionarios
            WHERE 
                usuario_id = $1 
                AND detalhes_pagamento->'detalhes'->>'tipoPagamento' = 'COMISSAO'
                AND estornado_em IS NULL
        `;
        const queryParams = [usuarioId];

        // Adiciona o filtro de ciclo se ele for fornecido
        if (ciclo_nome) {
            queryText += ` AND ciclo_nome = $2`;
            queryParams.push(ciclo_nome);
        }

        queryText += ` ORDER BY data_pagamento DESC;`;
        
        const result = await dbClient.query(queryText, queryParams);
        
        // Retorna os dados para o frontend
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API /historico/comissoes] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao buscar histórico de comissões.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

/**
 * Rota para buscar a lista de todos os ciclos em que o usuário recebeu comissão.
 * Usado para popular o <select> de filtro na página.
 */
router.get('/ciclos-pagos', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;

    try {
        dbClient = await pool.connect();
        
        const queryText = `
            SELECT DISTINCT ciclo_nome 
            FROM historico_pagamentos_funcionarios
            WHERE 
                usuario_id = $1
                AND detalhes_pagamento->'detalhes'->>'tipoPagamento' = 'COMISSAO'
                AND estornado_em IS NULL
                AND ciclo_nome IS NOT NULL
            ORDER BY ciclo_nome DESC;
        `;
        
        const result = await dbClient.query(queryText, [usuarioId]);
        // Mapeia para um array de strings simples
        const ciclos = result.rows.map(row => row.ciclo_nome);
        
        res.status(200).json(ciclos);

    } catch (error) {
        console.error('[API /historico/ciclos-pagos] Erro:', error);
        res.status(500).json({ error: 'Erro interno ao buscar lista de ciclos.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


export default router;