// api/dashboard.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

// Importa as funções de ciclos que agora usaremos no backend
import { ciclos, getObjetoCicloCompletoAtual } from '../public/js/utils/ciclos.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

// --- FUNÇÃO AUXILIAR PARA ENCONTRAR O ÚLTIMO CICLO FECHADO ---
function findUltimoCicloFechado(dataReferencia = new Date()) {
    const hoje = new Date(dataReferencia.getFullYear(), dataReferencia.getMonth(), dataReferencia.getDate());
    
    let ultimoCicloFechado = null;

    for (const ciclo of ciclos) {
        const fimCicloStr = ciclo.semanas[ciclo.semanas.length - 1].fim;
        const dataFimCiclo = new Date(fimCicloStr + 'T23:59:59');

        if (dataFimCiclo < hoje) {
            ultimoCicloFechado = ciclo; // Continua atualizando para pegar o mais recente
        } else {
            // Assim que encontramos um ciclo que ainda não terminou, o anterior é o que queremos.
            break;
        }
    }
    return ultimoCicloFechado;
}


// Middleware de autenticação (sem alterações)
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
        const userResult = await dbClient.query('SELECT nome, email, tipos, nivel, avatar_url FROM usuarios WHERE id = $1', [usuarioId]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        
        const usuario = userResult.rows[0];
        const tipoUsuario = usuario.tipos?.[0] || null;

        // 1. ACHAR OS CICLOS RELEVANTES
        const cicloAtual = getObjetoCicloCompletoAtual(new Date());
        const ultimoFechado = findUltimoCicloFechado(new Date());

        let dataInicioBusca = null;
        let dataFimBusca = null;

        if (cicloAtual) {
            dataInicioBusca = cicloAtual.semanas[0].inicio; // Início do ciclo atual
            dataFimBusca = cicloAtual.semanas[cicloAtual.semanas.length - 1].fim; // Fim do ciclo atual
        }
        if (ultimoFechado) {
            // Expande o período de busca para incluir também o último ciclo fechado
            dataInicioBusca = ultimoFechado.semanas[0].inicio;
        }

        if (!dataInicioBusca) {
            // Se não há ciclo atual nem fechado, não busca nada
            return res.status(200).json({
                usuario: { ...usuario, tipo: tipoUsuario },
                cicloFechado: null,
                cicloAtual: null
            });
        }
        
        // 2. QUERY OTIMIZADA: Busca atividades apenas no período relevante
        let queryParams = [usuario.nome, dataInicioBusca, dataFimBusca];
        let queryText = `
            SELECT 'OP' as tipo_origem, pr.*, p.nome as produto, 
            (CASE WHEN '${tipoUsuario}' = 'tiktik' THEN pr.assinada_por_tiktik ELSE pr.assinada END) as assinada,
            EXISTS (SELECT 1 FROM log_divergencias ld WHERE ld.id_producao_original = pr.id AND ld.status = 'Pendente') as divergencia_pendente
            FROM producoes pr JOIN produtos p ON pr.produto_id = p.id 
            WHERE pr.funcionario = $1 AND pr.data BETWEEN $2 AND $3
        `;

        if (tipoUsuario === 'tiktik') {
            queryText += `
                UNION ALL 
                SELECT 'Arremate' as tipo_origem, ar.*, p.nome as produto, ar.assinada,
                EXISTS (SELECT 1 FROM log_divergencias ld WHERE ld.id_arremate_original = ar.id AND ld.status = 'Pendente') as divergencia_pendente
                FROM arremates ar JOIN produtos p ON ar.produto_id = p.id 
                WHERE ar.usuario_tiktik = $1 AND ar.tipo_lancamento = 'PRODUCAO' AND ar.data_lancamento BETWEEN $2 AND $3
            `;
        }
        
        const desempenhoResult = await dbClient.query(queryText, queryParams);
        const todasAtividades = desempenhoResult.rows;

        // 3. SEPARAR ATIVIDADES POR CICLO
        let atividadesCicloFechado = [];
        if (ultimoFechado) {
            const inicio = new Date(ultimoFechado.semanas[0].inicio + 'T00:00:00');
            const fim = new Date(ultimoFechado.semanas[ultimoFechado.semanas.length - 1].fim + 'T23:59:59');
            atividadesCicloFechado = todasAtividades.filter(atv => new Date(atv.data) >= inicio && new Date(atv.data) <= fim);
        }

        let atividadesCicloAtual = [];
        if (cicloAtual) {
            const inicio = new Date(cicloAtual.semanas[0].inicio + 'T00:00:00');
            const fim = new Date(cicloAtual.semanas[cicloAtual.semanas.length - 1].fim + 'T23:59:59');
            atividadesCicloAtual = todasAtividades.filter(atv => new Date(atv.data) >= inicio && new Date(atv.data) <= fim);
        }
        
        // 4. MONTAR A RESPOSTA ESTRUTURADA
        const resposta = {
            usuario: { ...usuario, tipo: tipoUsuario },
            cicloFechado: ultimoFechado ? {
                ...ultimoFechado,
                atividades: atividadesCicloFechado
            } : null,
            cicloAtual: cicloAtual ? {
                ...cicloAtual,
                atividades: atividadesCicloAtual
            } : null
        };
        
        res.status(200).json(resposta);
    } catch (error) {
        console.error('[API /api/dashboard/desempenho] Erro na rota:', error.message, error.stack);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;