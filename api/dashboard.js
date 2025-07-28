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
        console.log(`[API Desempenho] Iniciando para Usuário ID: ${usuarioId}`);
        dbClient = await pool.connect();

        // >>> A CORREÇÃO ESTÁ AQUI: dbClient em vez de db.client <<<
        const userResult = await dbClient.query('SELECT nome, email, tipos, nivel, avatar_url FROM usuarios WHERE id = $1', [usuarioId]);
        if (userResult.rows.length === 0) {
            console.error(`[API Desempenho] ERRO: Usuário com ID ${usuarioId} não encontrado no banco.`);
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        
        const usuario = userResult.rows[0];
        const tipoUsuario = usuario.tipos?.[0] || null;
        console.log(`[API Desempenho] Usuário encontrado: ${usuario.nome}, Tipo: ${tipoUsuario}`);

        // 1. ACHAR OS CICLOS RELEVANTES
        const hoje = new Date();
        const cicloAtual = getObjetoCicloCompletoAtual(hoje);
        const ultimoFechado = findUltimoCicloFechado(hoje);

        console.log(`[API Desempenho] Ciclo Atual: ${cicloAtual?.nome || 'Nenhum'}`);
        console.log(`[API Desempenho] Último Ciclo Fechado: ${ultimoFechado?.nome || 'Nenhum'}`);
        
        // Com base na sua observação, o cicloAtual nunca deve ser nulo.
        // Adicionamos uma proteção caso isso aconteça por algum motivo inesperado.
        if (!cicloAtual) {
            console.error("[API Desempenho] ERRO CRÍTICO: Nenhum ciclo atual foi encontrado para a data de hoje. Verifique o arquivo ciclos.js.");
            return res.status(500).json({ error: 'Erro de configuração: nenhum ciclo de trabalho ativo encontrado.' });
        }
        
        // Lógica de datas simplificada graças à sua observação
        let dataInicioBusca = cicloAtual.semanas[0].inicio;
        let dataFimBusca = cicloAtual.semanas[cicloAtual.semanas.length - 1].fim;
        
        if (ultimoFechado) {
            dataInicioBusca = ultimoFechado.semanas[0].inicio;
        }
        console.log(`[API Desempenho] Período de busca no DB: ${dataInicioBusca} a ${dataFimBusca}`);

        // 2. QUERY OTIMIZADA
        let queryParams = [usuario.nome, dataInicioBusca, dataFimBusca];
        const campoAssinada = tipoUsuario === 'tiktik' ? 'pr.assinada_por_tiktik' : 'pr.assinada';

        let queryText = `
            SELECT 'OP' as tipo_origem, pr.id::text as id_original, pr.data, pr.variacao, pr.quantidade, pr.pontos_gerados, pr.op_numero, pr.processo,
            p.nome as produto, ${campoAssinada} as assinada,
            EXISTS (SELECT 1 FROM log_divergencias ld WHERE ld.id_producao_original = pr.id AND ld.status = 'Pendente') as divergencia_pendente
            FROM producoes pr JOIN produtos p ON pr.produto_id = p.id 
            WHERE pr.funcionario = $1 AND pr.data BETWEEN $2 AND $3
        `;

        if (tipoUsuario === 'tiktik') {
            queryText += `
                UNION ALL 
                SELECT 'Arremate' as tipo_origem, ar.id::text as id_original, ar.data_lancamento as data, ar.variante as variacao, ar.quantidade_arrematada as quantidade, ar.pontos_gerados, ar.op_numero, 'Arremate' as processo,
                p.nome as produto, ar.assinada as assinada,
                EXISTS (SELECT 1 FROM log_divergencias ld WHERE ld.id_arremate_original = ar.id AND ld.status = 'Pendente') as divergencia_pendente
                FROM arremates ar JOIN produtos p ON ar.produto_id = p.id 
                WHERE ar.usuario_tiktik = $1 AND ar.tipo_lancamento = 'PRODUCAO' AND ar.data_lancamento BETWEEN $2 AND $3
            `;
        }
        
        const desempenhoResult = await dbClient.query(queryText, queryParams);
        const todasAtividades = desempenhoResult.rows;
        console.log(`[API Desempenho] Query executada. Total de atividades encontradas: ${todasAtividades.length}`);

        // 3. SEPARAR ATIVIDADES POR CICLO
        let atividadesCicloFechado = [];
        if (ultimoFechado) {
            const inicio = new Date(ultimoFechado.semanas[0].inicio + 'T00:00:00');
            const fim = new Date(ultimoFechado.semanas[ultimoFechado.semanas.length - 1].fim + 'T23:59:59');
            atividadesCicloFechado = todasAtividades.filter(atv => {
                const dataAtv = new Date(atv.data);
                return dataAtv >= inicio && dataAtv <= fim;
            });
        }

        const inicioAtual = new Date(cicloAtual.semanas[0].inicio + 'T00:00:00');
        const fimAtual = new Date(cicloAtual.semanas[cicloAtual.semanas.length - 1].fim + 'T23:59:59');
        const atividadesCicloAtual = todasAtividades.filter(atv => {
             const dataAtv = new Date(atv.data);
             return dataAtv >= inicioAtual && dataAtv <= fimAtual;
        });
        
        // 4. MONTAR A RESPOSTA ESTRUTURADA
        const resposta = {
            usuario: { ...usuario, tipo: tipoUsuario },
            cicloFechado: ultimoFechado ? { ...ultimoFechado, atividades: atividadesCicloFechado } : null,
            cicloAtual: { ...cicloAtual, atividades: atividadesCicloAtual }
        };
        
        console.log(`[API Desempenho] Resposta enviada com sucesso para ${usuario.nome}.`);
        res.status(200).json(resposta);

    } catch (error) {
        console.error('[API Desempenho] ERRO FATAL NA ROTA:', error.message, error.stack);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;