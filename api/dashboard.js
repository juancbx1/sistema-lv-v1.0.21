// api/dashboard.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importa a função de ciclos.
import { getObjetoCicloCompletoAtual } from '../public/js/utils/ciclos.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação
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

// Rota GET /api/dashboard/desempenho
router.get('/desempenho', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();
        const userResult = await dbClient.query('SELECT nome, email, tipos, nivel FROM usuarios WHERE id = $1', [usuarioId]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        
        const usuario = userResult.rows[0];
        const tipoUsuario = usuario.tipos?.[0] || null;

        if (tipoUsuario !== 'costureira' && tipoUsuario !== 'tiktik') {
            return res.status(403).json({ error: 'Dashboard destinado a costureiras e tiktiks.' });
        }
        
        // *** INÍCIO DA MUDANÇA: REMOVER FILTRO DE DATA ***
        
        // O parâmetro da query agora é APENAS o nome do usuário.
        const queryParams = [usuario.nome];

        console.log(`[API Desempenho] Buscando TODAS as atividades para o usuário: "${usuario.nome}"`);
        
        let queryText;
        if (tipoUsuario === 'costureira') {
            // A query agora NÃO tem mais a cláusula 'BETWEEN'
            queryText = `
                SELECT 'OP' as tipo_origem, pr.id::text as id_original, pr.data, p.nome as produto, pr.variacao, pr.quantidade, 
                       pr.pontos_gerados, pr.valor_ponto_aplicado, pr.op_numero, pr.processo, pr.assinada 
                FROM producoes pr 
                JOIN produtos p ON pr.produto_id = p.id 
                WHERE pr.funcionario = $1
            `;
        } else { // tipoUsuario === 'tiktik'
            // A query agora NÃO tem mais a cláusula 'BETWEEN'
            queryText = `
                SELECT 'OP' as tipo_origem, pr.id::text as id_original, pr.data, p.nome as produto, pr.variacao, pr.quantidade, 
                       pr.pontos_gerados, pr.valor_ponto_aplicado, pr.op_numero, pr.processo, pr.assinada_por_tiktik as assinada 
                FROM producoes pr 
                JOIN produtos p ON pr.produto_id = p.id 
                WHERE pr.funcionario = $1 
                
                UNION ALL 
                
                SELECT 'Arremate' as tipo_origem, ar.id::text as id_original, ar.data_lancamento as data, p.nome as produto, 
                       ar.variante as variacao, ar.quantidade_arrematada as quantidade, ar.pontos_gerados, 
                       ar.valor_ponto_aplicado, ar.op_numero, 'Arremate' as processo, ar.assinada 
                FROM arremates ar 
                JOIN produtos p ON ar.produto_id = p.id 
                WHERE ar.usuario_tiktik = $1 AND ar.tipo_lancamento = 'PRODUCAO'
            `;
        }
        
        // *** FIM DA MUDANÇA ***
        
        const desempenhoResult = await dbClient.query(queryText, queryParams);
        const todasAsAtividades = desempenhoResult.rows;

        console.log(`[API Desempenho] Query executada. Número TOTAL de atividades encontradas: ${todasAsAtividades.length}`);
        
        // Os cálculos de pontos e período agora serão feitos no frontend,
        // pois dependem da semana selecionada pelo usuário.
        // A API agora só entrega os dados brutos.
        const resposta = {
            usuario: { nome: usuario.nome, email: usuario.email, tipo: tipoUsuario, nivel: usuario.nivel },
            // Enviamos um array vazio para 'atividades', o frontend preencherá
            desempenho: { 
                atividades: todasAsAtividades.sort((a,b) => new Date(b.data) - new Date(a.data))
            }
        };
        
        res.status(200).json(resposta);
    } catch (error) {
        console.error('[API /api/dashboard/desempenho] Erro na rota:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;