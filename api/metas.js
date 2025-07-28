// /api/metas.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação (igual ao que você já usa)
router.use(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação ausente.' });
        }
        const token = authHeader.split(' ')[1];
        jwt.verify(token, SECRET_KEY); // Apenas verifica, não precisa dos dados do usuário aqui
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
});

// A rota principal que busca as metas
router.get('/', async (req, res) => {
    // A data de referência virá como um parâmetro na URL, ex: /api/metas?data=2025-07-15
    // Se não vier, usamos a data de hoje.
    const dataReferencia = req.query.data ? new Date(req.query.data) : new Date();

    if (isNaN(dataReferencia.getTime())) {
        return res.status(400).json({ error: 'Formato de data inválido.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // 1. Encontrar a ID da versão correta para a data de referência
        const versaoQuery = `
            SELECT id FROM metas_versoes
            WHERE data_inicio_vigencia <= $1
            ORDER BY data_inicio_vigencia DESC
            LIMIT 1;
        `;
        const versaoResult = await dbClient.query(versaoQuery, [dataReferencia]);

        if (versaoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Nenhuma configuração de meta encontrada para a data fornecida.' });
        }
        const idVersaoCorreta = versaoResult.rows[0].id;

        // 2. Buscar todas as regras pertencentes a essa versão
        const regrasQuery = `
            SELECT 
                tipo_usuario, 
                nivel, 
                pontos_meta, 
                valor_comissao AS valor, -- Renomeando para 'valor' para manter consistência com o frontend
                descricao_meta AS descricao -- Renomeando para 'descricao'
            FROM metas_regras
            WHERE id_versao = $1
            ORDER BY tipo_usuario, nivel, pontos_meta ASC;
        `;
        const regrasResult = await dbClient.query(regrasQuery, [idVersaoCorreta]);
        const regras = regrasResult.rows;

        // 3. Reorganizar os dados no formato que o frontend espera (igual ao seu metasConfig antigo)
        const metasConfigFormatado = {};
        for (const regra of regras) {
            // Padronizamos a chave para minúsculas e sem espaços extras.
            const tipoUsuarioChave = regra.tipo_usuario.toLowerCase().trim();
            const { nivel, ...dadosMeta } = regra;
            
            // Removemos a propriedade antiga para não ser incluída no 'dadosMeta'
            delete dadosMeta.tipo_usuario; 
            
            if (!metasConfigFormatado[tipoUsuarioChave]) {
                metasConfigFormatado[tipoUsuarioChave] = {};
            }
            if (!metasConfigFormatado[tipoUsuarioChave][nivel]) {
                metasConfigFormatado[tipoUsuarioChave][nivel] = [];
            }

            // Converte os valores numéricos que vêm como string do BD
            dadosMeta.pontos_meta = parseInt(dadosMeta.pontos_meta, 10);
            dadosMeta.valor = parseFloat(dadosMeta.valor);
            
            metasConfigFormatado[tipoUsuarioChave][nivel].push(dadosMeta);
        }

        res.status(200).json(metasConfigFormatado);

    } catch (error) {
        console.error('[API /api/metas] Erro na rota:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;