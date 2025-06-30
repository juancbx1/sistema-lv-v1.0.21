// api/auditoria.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação para este router
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

// Rota GET /api/auditoria/assinaturas
router.get('/assinaturas', async (req, res) => {
    const { usuarioLogado } = req;
    let dbClient;

    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, usuarioLogado.id);
        
        // Crie esta permissão no seu arquivo permissoes.js
        if (!permissoes.includes('acesso-conferencia-e-auditoria')) {
            return res.status(403).json({ error: 'Permissão negada para acessar o relatório de assinaturas.' });
        }

        const { dataInicio, dataFim, idUsuario } = req.query;
        let queryParams = [];
        let whereClauses = [];

        // Lógica de Filtros
        if (dataInicio) {
            queryParams.push(dataInicio);
            whereClauses.push(`log.timestamp_assinatura >= $${queryParams.length}`);
        }
        if (dataFim) {
            // A MÁGICA ESTÁ AQUI: Adicionamos a hora final ao dia
            // Isso garante que estamos buscando até o final do dia selecionado.
            const dataFimAjustada = `${dataFim} 23:59:59`;
            queryParams.push(dataFimAjustada);
            whereClauses.push(`log.timestamp_assinatura <= $${queryParams.length}`);
        }
        if (idUsuario) {
            queryParams.push(idUsuario);
            whereClauses.push(`log.id_usuario = $${queryParams.length}`);
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Query principal que une todas as informações necessárias
        const queryText = `
            SELECT 
                log.id,
                log.timestamp_assinatura,
                log.dados_coletados,
                u.nome as nome_funcionario,
                -- Usa COALESCE para pegar o primeiro valor não nulo, identificando o item
                COALESCE(prod.op_numero, arremate.op_numero) as op_numero,
                COALESCE(p_prod.nome, p_arremate.nome) as nome_produto,
                COALESCE(prod.variacao, arremate.variante) as variacao,
                COALESCE(prod.processo, 'Arremate') as processo,
                -- Identifica o tipo do registro para o frontend
                CASE 
                    WHEN log.id_producao IS NOT NULL THEN 'Produção'
                    WHEN log.id_arremate IS NOT NULL THEN 'Arremate'
                    ELSE 'Desconhecido'
                END as tipo_registro
            FROM 
                log_assinaturas log
            JOIN 
                usuarios u ON log.id_usuario = u.id
            LEFT JOIN 
                producoes prod ON log.id_producao = prod.id
            LEFT JOIN 
                arremates arremate ON log.id_arremate = arremate.id
            LEFT JOIN
                produtos p_prod ON prod.produto_id = p_prod.id
            LEFT JOIN
                produtos p_arremate ON arremate.produto_id = p_arremate.id
            ${whereString}
            ORDER BY 
                log.timestamp_assinatura DESC;
        `;

        const result = await dbClient.query(queryText, queryParams);
        res.status(200).json(result.rows);

    } catch (error) {
        console.error('[API /api/auditoria/assinaturas] Erro na rota:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar logs de assinatura.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;