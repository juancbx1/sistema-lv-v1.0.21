// api/configuracoes.js
import express from 'express';
import 'dotenv/config';

const router = express.Router();

// Rota que retorna configurações públicas do ambiente
router.get('/publicas', (req, res) => {
    try {
        res.status(200).json({
            DEFAULT_PRODUCT_IMAGE_URL: process.env.DEFAULT_PRODUCT_IMAGE_URL,
            DEFAULT_AVATAR_URL: process.env.DEFAULT_AVATAR_URL
            // Adicione outras configs públicas aqui no futuro
        });
    } catch (error) {
        console.error('[API /configuracoes/publicas] Erro:', error);
        res.status(500).json({ error: 'Erro ao carregar configurações.' });
    }
});

export default router;