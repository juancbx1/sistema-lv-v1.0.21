// api/cron.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import express from 'express';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

// Endpoint que a Vercel vai chamar
router.get('/arquivar-concluidas', async (req, res) => {
    // SEGURANÇA: Verifica se quem chamou foi o Cron da Vercel
    // A Vercel envia esse header automaticamente. Isso impede que um usuário qualquer chame essa URL.
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        // Em localhost (teste) permitimos, em produção bloqueamos se não tiver a senha
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // Arquiva demandas concluídas ANTES de hoje (ou seja, ontem pra trás)
        const result = await dbClient.query(`
            UPDATE demandas_producao 
            SET status = 'arquivada' 
            WHERE status = 'concluida' 
              AND data_conclusao::date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
        `);
        
        res.status(200).json({ success: true, archived_count: result.rowCount });

    } catch (error) {
        console.error('[CRON] Erro:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;