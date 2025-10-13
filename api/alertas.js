// NOVO ARQUIVO: api/alertas.js

import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { getPermissoesCompletasUsuarioDB } from './usuarios.js';

const { Pool } = pg;
const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

const SECRET_KEY = process.env.JWT_SECRET;

function formatarMinutos(totalMinutos) {
    if (totalMinutos < 60) {
        return `${Math.floor(totalMinutos)} min`;
    }
    const horas = Math.floor(totalMinutos / 60);
    const minutos = Math.floor(totalMinutos % 60);
    return `${horas}h ${minutos}min`;
}

// Middleware de Autenticação (pode ser copiado de outros arquivos de API)
router.use(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) throw new Error('Token não fornecido');
        const token = authHeader.split(' ')[1];
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
});

// GET /api/alertas/configuracoes - Busca todas as configurações de alerta
router.get('/configuracoes', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        // Qualquer usuário logado pode ler as configurações para o motor de alertas funcionar
        const result = await dbClient.query('SELECT * FROM configuracoes_alertas ORDER BY id');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API /alertas/configuracoes GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar configurações de alerta.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/alertas/configuracoes - Salva as configurações em lote
router.put('/configuracoes', async (req, res) => {
    let dbClient;
    const configuracoes = req.body; // Espera um array de objetos de configuração

    if (!Array.isArray(configuracoes) || configuracoes.length === 0) {
        return res.status(400).json({ error: 'Formato de dados inválido. Esperado um array de configurações.' });
    }

    try {
        dbClient = await pool.connect();
        // Apenas usuários com alta permissão podem alterar as configurações
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
        if (!permissoes.includes('gerenciar-permissoes')) { // Reutilizando permissão de admin
            return res.status(403).json({ error: 'Permissão negada para alterar configurações de alerta.' });
        }

        await dbClient.query('BEGIN');

        // Itera sobre cada configuração e executa um "UPSERT"
        for (const config of configuracoes) {
        const { id, ativo, gatilho_minutos, acao_popup, acao_notificacao, intervalo_repeticao_minutos } = config;
        
        const query = `
            UPDATE configuracoes_alertas 
            SET 
                ativo = $1, 
                gatilho_minutos = $2, 
                acao_popup = $3, 
                acao_notificacao = $4,
                intervalo_repeticao_minutos = $5, -- <<< E AQUI >>>
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $6; -- <<< O ÍNDICE DO 'id' MUDA PARA $6 >>>
        `;
        await dbClient.query(query, [
            Boolean(ativo),
            parseInt(gatilho_minutos) || 5,
            Boolean(acao_popup),
            Boolean(acao_notificacao),
            parseInt(intervalo_repeticao_minutos) || 15, // <<< E AQUI >>>
            parseInt(id)
        ]);
    }

        await dbClient.query('COMMIT');
        res.status(200).json({ message: 'Configurações de alerta salvas com sucesso!' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API /alertas/configuracoes PUT] Erro:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/alertas/dias-trabalho
router.get('/dias-trabalho', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();
        const result = await dbClient.query("SELECT valor FROM alertas_configuracoes_gerais WHERE chave = 'dias_de_trabalho'");
        if (result.rows.length === 0) {
            // Fallback caso a linha não exista no banco
            return res.status(200).json({ chave: 'dias_de_trabalho', valor: {} });
        }
        res.status(200).json({ chave: 'dias_de_trabalho', valor: result.rows[0].valor });
    } catch (error) {
        console.error('[API /dias-trabalho GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar dias de trabalho.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// PUT /api/alertas/dias-trabalho
router.put('/dias-trabalho', async (req, res) => {
    let dbClient;
    const { valor } = req.body;
    try {
        dbClient = await pool.connect();
        const permissoes = await getPermissoesCompletasUsuarioDB(dbClient, req.usuarioLogado.id);
        if (!permissoes.includes('gerenciar-permissoes')) {
            return res.status(403).json({ error: 'Permissão negada.' });
        }

        const query = `
            INSERT INTO alertas_configuracoes_gerais (chave, valor) 
            VALUES ('dias_de_trabalho', $1)
            ON CONFLICT (chave) 
            DO UPDATE SET valor = $1;
        `;
        await dbClient.query(query, [valor]);
        res.status(200).json({ message: 'Dias de trabalho atualizados.' });

    } catch (error) {
        console.error('[API /dias-trabalho PUT] Erro:', error);
        res.status(500).json({ error: 'Erro ao salvar dias de trabalho.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/alertas/verificar-status - O motor principal de verificação de alertas
router.get('/verificar-status', async (req, res) => {
    let dbClient;
    try {
        dbClient = await pool.connect();

        const diasTrabalhoResult = await dbClient.query("SELECT valor FROM alertas_configuracoes_gerais WHERE chave = 'dias_de_trabalho'");
        const hoje = new Date();
        const diaDaSemana = hoje.getDay();
        const diasDeTrabalho = diasTrabalhoResult.rows[0]?.valor || {};
        
        if (!diasDeTrabalho[diaDaSemana.toString()]) {
            return res.status(200).json([]);
        }

        const configResult = await dbClient.query('SELECT * FROM configuracoes_alertas WHERE ativo = TRUE');
        const configs = configResult.rows;
        
        const alertasParaDisparar = [];
        const queriesDeAtualizacao = [];

        // =====================================================================
        // VERIFICAÇÃO DE ALERTAS DE ARREMATE
        // =====================================================================
        
        const configOciosidade = configs.find(c => c.tipo_alerta === 'OCIOSIDADE_ARREMATE');
        const configLentidao = configs.find(c => c.tipo_alerta === 'LENTIDAO_CRITICA_ARREMATE');

        if (configOciosidade || configLentidao) {
            const tiktiksResult = await dbClient.query(`
                SELECT 
                    u.id, u.nome, u.status_atual, u.status_data_modificacao,
                    u.ultimo_alerta_ociosidade_em, u.ultimo_alerta_lentidao_em,
                    s.data_inicio, s.produto_id, s.quantidade_entregue,
                    (
                        SELECT MAX(s2.data_fim) 
                        FROM sessoes_trabalho_arremate s2 
                        WHERE s2.usuario_tiktik_id = u.id 
                          AND s2.status = 'FINALIZADA'
                          AND s2.data_fim >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo')
                    ) as data_ultima_tarefa_finalizada_hoje
                FROM usuarios u
                LEFT JOIN sessoes_trabalho_arremate s ON u.id_sessao_trabalho_atual = s.id
                WHERE 'tiktik' = ANY(u.tipos) AND u.data_demissao IS NULL
            `);
            const tiktiks = tiktiksResult.rows;

            const temposResult = await dbClient.query('SELECT produto_id, tempo_segundos_por_peca FROM tempos_padrao_arremate');
            const temposMap = new Map(temposResult.rows.map(row => [row.produto_id, parseFloat(row.tempo_segundos_por_peca)]));

            for (const tiktik of tiktiks) {
                // --- Verificação de Ociosidade (LÓGICA CORRIGIDA) ---
                if (configOciosidade && tiktik.status_atual === 'LIVRE') {
                    const agoraMs = hoje.getTime();
                    const ultimoAlerta = tiktik.ultimo_alerta_ociosidade_em ? new Date(tiktik.ultimo_alerta_ociosidade_em).getTime() : 0;
                    const minutosDesdeUltimoAlerta = (agoraMs - ultimoAlerta) / (1000 * 60);

                    if (minutosDesdeUltimoAlerta >= configOciosidade.intervalo_repeticao_minutos) {
                        
                        // --- LÓGICA DE PONTO DE PARTIDA CORRIGIDA (VERSÃO FINAL) ---
                        
                        const dataModificacao = tiktik.status_data_modificacao ? new Date(tiktik.status_data_modificacao).getTime() : 0;
                        const dataUltimaTarefa = tiktik.data_ultima_tarefa_finalizada_hoje ? new Date(tiktik.data_ultima_tarefa_finalizada_hoje).getTime() : 0;

                        // O início da ociosidade é o evento MAIS RECENTE que aconteceu
                        const inicioOciosidadeMs = Math.max(dataModificacao, dataUltimaTarefa);

                        if (inicioOciosidadeMs > 0) {
                            const minutosOcioso = (agoraMs - inicioOciosidadeMs) / (1000 * 60);

                            if (minutosOcioso >= configOciosidade.gatilho_minutos) {
                                alertasParaDisparar.push({
                                    tipo: 'OCIOSIDADE_ARREMATE',
                                    mensagem: `Atenção: ${tiktik.nome} está ocioso(a) há mais de ${formatarMinutos(minutosOcioso)}.`,
                                    config: configOciosidade
                                });
                                queriesDeAtualizacao.push(
                                    dbClient.query(`UPDATE usuarios SET ultimo_alerta_ociosidade_em = NOW() WHERE id = $1`, [tiktik.id])
                                );
                            }
                        }
                    }
                }

                // --- Verificação de Lentidão Crítica (LÓGICA COMPLETA) ---
                if (configLentidao && tiktik.status_atual === 'PRODUZINDO' && tiktik.data_inicio) {
                    const agoraMs = hoje.getTime();
                    const ultimoAlerta = tiktik.ultimo_alerta_lentidao_em ? new Date(tiktik.ultimo_alerta_lentidao_em).getTime() : 0;
                    const minutosDesdeUltimoAlerta = (agoraMs - ultimoAlerta) / (1000 * 60);
                    
                    if (minutosDesdeUltimoAlerta >= configLentidao.intervalo_repeticao_minutos) {
                        const tpe = temposMap.get(tiktik.produto_id);
                        if (tpe) {
                            const dataInicio = new Date(tiktik.data_inicio);
                            const minutosEmTarefa = (agoraMs - dataInicio.getTime()) / (1000 * 60);
                            
                            if (minutosEmTarefa >= configLentidao.gatilho_minutos) {
                                const tempoDecorridoSegundos = minutosEmTarefa * 60;
                                const tempoTotalEstimado = tpe * tiktik.quantidade_entregue;
                                const progressoTempo = (tempoDecorridoSegundos / tempoTotalEstimado) * 100;

                                if (progressoTempo >= 120) {
                                    alertasParaDisparar.push({
                                        tipo: 'LENTIDAO_CRITICA_ARREMATE',
                                        mensagem: `🐢 Performance Baixa: ${tiktik.nome} está com ritmo lento há mais de ${Math.floor(minutosEmTarefa)} minutos.`,
                                        config: configLentidao,
                                        nivel: 'erro'
                                    });
                                    queriesDeAtualizacao.push(
                                        dbClient.query(`UPDATE usuarios SET ultimo_alerta_lentidao_em = NOW() WHERE id = $1`, [tiktik.id])
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // --- LÓGICA DE VERIFICAÇÃO DE EVENTOS (COM LOGS DE DEPURAÇÃO) ---
        const eventosResult = await dbClient.query("SELECT * FROM eventos_sistema WHERE lido = false ORDER BY criado_em ASC");
        if (eventosResult.rows.length > 0) {
            console.log(`[LOG EVENTOS] ${eventosResult.rows.length} evento(s) não lido(s) encontrado(s).`);
            const idsEventosLidos = [];
            for (const evento of eventosResult.rows) {
                console.log(`[LOG EVENTOS] Processando evento tipo: "${evento.tipo_evento}"`);
                const configDoEvento = configs.find(c => c.tipo_alerta === evento.tipo_evento);
                console.log('[LOG EVENTOS] Configuração correspondente encontrada:', configDoEvento ? 'SIM' : 'NÃO');

                if (configDoEvento) {
                    console.log('[LOG EVENTOS] Adicionando evento à fila de disparo.');
                    alertasParaDisparar.push({
                        tipo: evento.tipo_evento,
                        mensagem: evento.mensagem,
                        config: configDoEvento,
                        nivel: evento.tipo_evento === 'META_BATIDA_ARREMATE' ? 'sucesso' : 'aviso'
                    });
                    idsEventosLidos.push(evento.id);
                }
            }
            if (idsEventosLidos.length > 0) {
                console.log('[LOG EVENTOS] Marcando eventos como lidos:', idsEventosLidos);
                await dbClient.query("UPDATE eventos_sistema SET lido = true WHERE id = ANY($1::int[])", [idsEventosLidos]);
            }
        }

        if (queriesDeAtualizacao.length > 0) {
            await Promise.all(queriesDeAtualizacao);
        }

        if (alertasParaDisparar.length > 0) {
            console.log(`[API /verificar-status] Enviando ${alertasParaDisparar.length} alerta(s) para o frontend:`, alertasParaDisparar);
        }

        res.status(200).json(alertasParaDisparar);

    } catch (error) {
        console.error('[API /alertas/verificar-status GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao verificar status para alertas.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;