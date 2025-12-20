// /api/real-producao.js

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC', // Mantemos UTC para consistência no banco
});
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação (padrão que você já usa)
// Garante que apenas usuários logados e com token válido podem acessar a rota.
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

// ==========================================================================
// O CORAÇÃO DA NOSSA NOVA PÁGINA: O ENDPOINT QUE BUSCA TUDO
// ==========================================================================
router.get('/diaria', async (req, res) => {
    let dbClient;
    try {
        const dataQuery = req.query.data;
        // Lógica de data para evitar problemas de fuso, como planejado.
        // O JS no frontend enviará YYYY-MM-DD.
        const dataReferencia = dataQuery ? new Date(`${dataQuery}T12:00:00.000Z`) : new Date();
        
        const dataFiltroSQL = dataReferencia.toISOString().split('T')[0];
        
        // NOVO: Calcula a data de ontem para a segunda query
        const ontem = new Date(dataReferencia);
        ontem.setDate(ontem.getDate() - 1);
        const ontemFiltroSQL = ontem.toISOString().split('T')[0];

        dbClient = await pool.connect();

        // --- ETAPA 1: BUSCAR ATIVIDADES DO DIA ATUAL ---
        const atividadesQuery = `
            WITH producoes_dia AS (
                SELECT
                    p.funcionario_id, u.nome AS nome_funcionario, u.avatar_url, u.tipos AS tipo_funcionario, u.nivel,
                    'processo' AS tipo_atividade, p.processo AS nome_atividade, prod.nome AS nome_produto,
                    p.quantidade, p.pontos_gerados, p.data AS data_hora,
                    p.variacao,
                    -- Lógica para extrair a imagem da grade JSON do produto
                    COALESCE(
                        (SELECT g.value ->> 'imagem' 
                        FROM jsonb_array_elements(prod.grade) AS g 
                        WHERE g.value ->> 'variacao' = p.variacao 
                        LIMIT 1), 
                        prod.imagem
                    ) AS imagem_url
                FROM producoes p
                JOIN usuarios u ON p.funcionario_id = u.id
                JOIN produtos prod ON p.produto_id = prod.id
                WHERE p.data AT TIME ZONE 'America/Sao_Paulo' >= $1::date
                AND p.data AT TIME ZONE 'America/Sao_Paulo' < ($1::date + INTERVAL '1 day')
                AND u.tipos && ARRAY['costureira', 'tiktik']
            ),
            arremates_dia AS (
                SELECT
                    a.usuario_tiktik_id AS funcionario_id, u.nome AS nome_funcionario, u.avatar_url, u.tipos AS tipo_funcionario, u.nivel,
                    'arremate' AS tipo_atividade, 'Arremate' AS nome_atividade, prod.nome AS nome_produto,
                    a.quantidade_arrematada AS quantidade, a.pontos_gerados, a.data_lancamento AS data_hora,
                    a.variante AS variacao,
                    -- Lógica para extrair a imagem da grade JSON do produto
                    COALESCE(
                        (SELECT g.value ->> 'imagem' 
                        FROM jsonb_array_elements(prod.grade) AS g 
                        WHERE g.value ->> 'variacao' = a.variante 
                        LIMIT 1), 
                        prod.imagem
                    ) AS imagem_url
                FROM arremates a
                JOIN usuarios u ON a.usuario_tiktik_id = u.id
                JOIN produtos prod ON a.produto_id = prod.id
                WHERE a.data_lancamento AT TIME ZONE 'America/Sao_Paulo' >= $1::date
                AND a.data_lancamento AT TIME ZONE 'America/Sao_Paulo' < ($1::date + INTERVAL '1 day')
                AND a.tipo_lancamento = 'PRODUCAO'
            )
            SELECT * FROM producoes_dia
            UNION ALL
            SELECT * FROM arremates_dia
            ORDER BY data_hora DESC;
        `;
        const atividadesResult = await dbClient.query(atividadesQuery, [dataFiltroSQL]);
        const atividadesDoDia = atividadesResult.rows;

        // --- NOVO: ETAPA 1.5: BUSCAR TOTAIS DO DIA ANTERIOR ---
        const totaisOntemQuery = `
            SELECT
                COALESCE(SUM(CASE WHEN u.tipos @> ARRAY['costureira'] THEN T.quantidade ELSE 0 END), 0) AS pecas_costura,
                COALESCE(SUM(CASE WHEN u.tipos @> ARRAY['tiktik'] AND T.tipo_atividade = 'processo' THEN T.quantidade ELSE 0 END), 0) AS processos_tiktik,
                COALESCE(SUM(CASE WHEN u.tipos @> ARRAY['tiktik'] AND T.tipo_atividade = 'arremate' THEN T.quantidade ELSE 0 END), 0) AS arremates_tiktik
            FROM (
                SELECT funcionario_id, quantidade, 'processo' as tipo_atividade FROM producoes WHERE data AT TIME ZONE 'America/Sao_Paulo' >= $1::date AND data AT TIME ZONE 'America/Sao_Paulo' < ($1::date + INTERVAL '1 day')
                UNION ALL
                SELECT usuario_tiktik_id, quantidade_arrematada, 'arremate' as tipo_atividade FROM arremates WHERE data_lancamento AT TIME ZONE 'America/Sao_Paulo' >= $1::date AND data_lancamento AT TIME ZONE 'America/Sao_Paulo' < ($1::date + INTERVAL '1 day') AND tipo_lancamento = 'PRODUCAO'
            ) AS T
            JOIN usuarios u ON T.funcionario_id = u.id;
        `;
        const totaisOntemResult = await dbClient.query(totaisOntemQuery, [ontemFiltroSQL]);
        const totaisDiaAnterior = {
             processosCostura: parseInt(totaisOntemResult.rows[0].pecas_costura, 10),
             processosTiktik: parseInt(totaisOntemResult.rows[0].processos_tiktik, 10),
             arremates: parseInt(totaisOntemResult.rows[0].arremates_tiktik, 10),
        };
        // Adiciona o total de itens finalizados de ontem
        totaisDiaAnterior.totalFinalizados = totaisDiaAnterior.arremates;


        // --- ETAPA 2: BUSCAR AS REGRAS DE METAS (sem alterações) ---
        const versaoQuery = `
            SELECT id FROM metas_versoes WHERE data_inicio_vigencia <= $1 ORDER BY data_inicio_vigencia DESC LIMIT 1;
        `;
        const versaoResult = await dbClient.query(versaoQuery, [dataReferencia]);
        let regrasDeMetas = {};
        if (versaoResult.rows.length > 0) {
            const idVersaoCorreta = versaoResult.rows[0].id;
            const regrasQuery = `
                SELECT tipo_usuario, nivel, pontos_meta, valor_comissao, descricao_meta
                FROM metas_regras WHERE id_versao = $1 ORDER BY tipo_usuario, nivel, pontos_meta ASC;
            `;
            const regrasResult = await dbClient.query(regrasQuery, [idVersaoCorreta]);
            for (const regra of regrasResult.rows) {
                const tipoUsuarioChave = regra.tipo_usuario.toLowerCase().trim();
                if (!regrasDeMetas[tipoUsuarioChave]) regrasDeMetas[tipoUsuarioChave] = {};
                if (!regrasDeMetas[tipoUsuarioChave][regra.nivel]) regrasDeMetas[tipoUsuarioChave][regra.nivel] = [];
                regrasDeMetas[tipoUsuarioChave][regra.nivel].push({
                    pontos_meta: parseInt(regra.pontos_meta, 10),
                    valor: parseFloat(regra.valor_comissao),
                    descricao: regra.descricao_meta
                });
            }
        }

        // --- ETAPA 3: ENVIAR O PACOTE DE DADOS COMPLETO (com os dados de ontem) ---
        res.status(200).json({
            dataReferencia: dataFiltroSQL,
            regrasDeMetas: regrasDeMetas,
            atividadesDoDia: atividadesDoDia,
            totaisDiaAnterior: totaisDiaAnterior // <-- NOVO DADO ENVIADO
        });

    } catch (error) {
        console.error('[API /real-producao/diaria] Erro na rota:', error.message, error.stack);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar dados da produção.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.get('/desempenho-historico', async (req, res) => {
    let dbClient;
    try {
        // Recebe o ID do funcionário pela query string. Ex: ?funcionarioId=5
        const { funcionarioId } = req.query;
        if (!funcionarioId) {
            return res.status(400).json({ error: 'O ID do funcionário é obrigatório.' });
        }

        dbClient = await pool.connect();

        const queryHistorico = `
            WITH atividades_agrupadas AS (
                -- Junta produções e arremates dos últimos 7 dias para o funcionário
                SELECT 
                    data::date AS dia,
                    data AS data_hora,
                    pontos_gerados
                FROM producoes
                WHERE funcionario_id = $1 AND data >= NOW() - INTERVAL '7 days'
                
                UNION ALL

                SELECT 
                    data_lancamento::date AS dia,
                    data_lancamento AS data_hora,
                    pontos_gerados
                FROM arremates
                WHERE usuario_tiktik_id = $1 AND data_lancamento >= NOW() - INTERVAL '7 days'
            ),
            metricas_diarias AS (
                -- Para cada dia, calcula o total de pontos e as horas trabalhadas
                SELECT
                    dia,
                    SUM(pontos_gerados) AS total_pontos_dia,
                    -- Calcula a diferença em horas entre a primeira e a última atividade
                    EXTRACT(EPOCH FROM (MAX(data_hora) - MIN(data_hora))) / 3600.0 AS horas_trabalhadas
                FROM atividades_agrupadas
                GROUP BY dia
            )
            -- Calcula a média final de Pontos por Hora (PPH)
            SELECT
                -- AVG(total_pontos_dia / horas_trabalhadas) AS media_pph
                -- Correção: Evita divisão por zero se o trabalho foi instantâneo
                AVG(CASE WHEN horas_trabalhadas > 0.1 THEN total_pontos_dia / horas_trabalhadas ELSE NULL END) AS media_pph
            FROM metricas_diarias;
        `;
        
        const result = await dbClient.query(queryHistorico, [funcionarioId]);
        
        // O resultado pode ser null se não houver dados históricos, então tratamos isso
        const mediaPPH = result.rows[0]?.media_pph ? parseFloat(result.rows[0].media_pph) : null;
        
        res.status(200).json({
            funcionarioId: funcionarioId,
            mediaPphHistorica: mediaPPH
        });

    } catch (error) {
        console.error('[API /desempenho-historico] Erro na rota:', error.message);
        res.status(500).json({ error: 'Erro interno ao buscar desempenho histórico.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});


export default router;