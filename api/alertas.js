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
        // Se não configurado (objeto vazio), considera sempre dia de trabalho
        const diasConfigurados = Object.keys(diasDeTrabalho).length > 0;
        const ehDiaDeTrabalho = !diasConfigurados || !!diasDeTrabalho[diaDaSemana.toString()];
        // Alertas baseados em eventos (DEMANDA_NOVA etc.) sempre disparam independente do dia.
        // Apenas os alertas de tempo (ociosidade, lentidão) respeitam o calendário.

        const configResult = await dbClient.query('SELECT * FROM configuracoes_alertas WHERE ativo = TRUE');
        const configs = configResult.rows;

        const alertasParaDisparar = [];
        const queriesDeAtualizacao = [];

        // =====================================================================
        // ALERTAS DE TEMPO — só verificar em dias de trabalho configurados
        // =====================================================================
        if (ehDiaDeTrabalho) {

        // ─── Arremate ───────────────────────────────────────────────────────
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
                                    config: configOciosidade,
                                    nivel: 'critico'
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
                                        nivel: 'aviso'
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
        
        // =====================================================================
        // VERIFICAÇÃO DE ALERTAS DE COSTURA
        // =====================================================================

        const configOciosidadeCostureira = configs.find(c => c.tipo_alerta === 'OCIOSIDADE_COSTUREIRA');
        const configLentidaoCostureira   = configs.find(c => c.tipo_alerta === 'LENTIDAO_COSTUREIRA');

        if (configOciosidadeCostureira || configLentidaoCostureira) {
            const costureirasResult = await dbClient.query(`
                SELECT
                    u.id, u.nome, u.status_atual, u.status_data_modificacao,
                    u.ultimo_alerta_ociosidade_em, u.ultimo_alerta_lentidao_em,
                    s.data_inicio as sessao_data_inicio,
                    (
                        SELECT MAX(s2.data_fim)
                        FROM sessoes_trabalho_producao s2
                        WHERE s2.funcionario_id = u.id
                          AND s2.status IN ('FINALIZADA', 'FINALIZADA_FORCADA')
                          AND s2.data_fim >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo')
                    ) as data_ultima_tarefa_finalizada_hoje
                FROM usuarios u
                LEFT JOIN sessoes_trabalho_producao s ON u.id_sessao_trabalho_atual = s.id
                WHERE 'costureira' = ANY(u.tipos) AND u.data_demissao IS NULL
            `);

            for (const costureira of costureirasResult.rows) {
                // --- Ociosidade ---
                if (configOciosidadeCostureira && costureira.status_atual === 'LIVRE') {
                    const agoraMs = hoje.getTime();
                    const ultimoAlerta = costureira.ultimo_alerta_ociosidade_em
                        ? new Date(costureira.ultimo_alerta_ociosidade_em).getTime() : 0;
                    const minutosDesdeUltimoAlerta = (agoraMs - ultimoAlerta) / (1000 * 60);

                    if (minutosDesdeUltimoAlerta >= configOciosidadeCostureira.intervalo_repeticao_minutos) {
                        const dataModificacao = costureira.status_data_modificacao
                            ? new Date(costureira.status_data_modificacao).getTime() : 0;
                        const dataUltimaTarefa = costureira.data_ultima_tarefa_finalizada_hoje
                            ? new Date(costureira.data_ultima_tarefa_finalizada_hoje).getTime() : 0;
                        const inicioOciosidadeMs = Math.max(dataModificacao, dataUltimaTarefa);

                        if (inicioOciosidadeMs > 0) {
                            const minutosOciosa = (agoraMs - inicioOciosidadeMs) / (1000 * 60);
                            if (minutosOciosa >= configOciosidadeCostureira.gatilho_minutos) {
                                alertasParaDisparar.push({
                                    tipo: 'OCIOSIDADE_COSTUREIRA',
                                    mensagem: `Atenção: ${costureira.nome} está ociosa há mais de ${formatarMinutos(minutosOciosa)}.`,
                                    config: configOciosidadeCostureira,
                                    nivel: 'critico'
                                });
                                queriesDeAtualizacao.push(
                                    dbClient.query(`UPDATE usuarios SET ultimo_alerta_ociosidade_em = NOW() WHERE id = $1`, [costureira.id])
                                );
                            }
                        }
                    }
                }

                // --- Lentidão ---
                if (configLentidaoCostureira && costureira.status_atual === 'PRODUZINDO' && costureira.sessao_data_inicio) {
                    const agoraMs = hoje.getTime();
                    const ultimoAlerta = costureira.ultimo_alerta_lentidao_em
                        ? new Date(costureira.ultimo_alerta_lentidao_em).getTime() : 0;
                    const minutosDesdeUltimoAlerta = (agoraMs - ultimoAlerta) / (1000 * 60);

                    if (minutosDesdeUltimoAlerta >= configLentidaoCostureira.intervalo_repeticao_minutos) {
                        const minutosEmTarefa = (agoraMs - new Date(costureira.sessao_data_inicio).getTime()) / (1000 * 60);
                        if (minutosEmTarefa >= configLentidaoCostureira.gatilho_minutos) {
                            alertasParaDisparar.push({
                                tipo: 'LENTIDAO_COSTUREIRA',
                                mensagem: `Performance: ${costureira.nome} está na mesma tarefa há ${formatarMinutos(minutosEmTarefa)}.`,
                                config: configLentidaoCostureira,
                                nivel: 'aviso'
                            });
                            queriesDeAtualizacao.push(
                                dbClient.query(`UPDATE usuarios SET ultimo_alerta_lentidao_em = NOW() WHERE id = $1`, [costureira.id])
                            );
                        }
                    }
                }
            }
        }

        // ─── Demandas não iniciadas ──────────────────────────────────────────
        const configDemandaNaoIniciada = configs.find(c => c.tipo_alerta === 'DEMANDA_NAO_INICIADA');

        if (configDemandaNaoIniciada) {
            const demandasParadasResult = await dbClient.query(`
                SELECT COUNT(*) as total
                FROM demandas_producao
                WHERE status = 'pendente'
                  AND prioridade = 2
                  AND criado_em < NOW() - INTERVAL '${parseInt(configDemandaNaoIniciada.gatilho_minutos)} minutes'
            `);
            const totalParadas = parseInt(demandasParadasResult.rows[0]?.total || 0);

            if (totalParadas > 0) {
                const mensagem = totalParadas === 1
                    ? `1 demanda aguardando início há mais de ${configDemandaNaoIniciada.gatilho_minutos} minutos.`
                    : `${totalParadas} demandas aguardando início há mais de ${configDemandaNaoIniciada.gatilho_minutos} minutos.`;
                alertasParaDisparar.push({
                    tipo: 'DEMANDA_NAO_INICIADA',
                    mensagem,
                    config: configDemandaNaoIniciada,
                    nivel: 'aviso'
                });
            }
        }

        // =====================================================================
        // FIM DOS ALERTAS DE TEMPO (dias de trabalho)
        // =====================================================================
        } // end if (ehDiaDeTrabalho)

        // =====================================================================
        // ALERTAS DE EVENTOS — sempre disparam (independente do dia)
        // =====================================================================
        // Busca todos os eventos não lidos e os agrupa por tipo (evita flood de N alertas iguais)
        const eventosResult = await dbClient.query("SELECT * FROM eventos_sistema WHERE lido = false ORDER BY criado_em ASC");
        if (eventosResult.rows.length > 0) {
            console.log(`[LOG EVENTOS] ${eventosResult.rows.length} evento(s) não lido(s) encontrado(s).`);
            const idsEventosLidos = [];

            // Agrupa por tipo para não disparar 10x o mesmo alerta
            const eventosPorTipo = new Map();
            for (const evento of eventosResult.rows) {
                if (!eventosPorTipo.has(evento.tipo_evento)) {
                    eventosPorTipo.set(evento.tipo_evento, []);
                }
                eventosPorTipo.get(evento.tipo_evento).push(evento);
            }

            for (const [tipoEvento, eventosDoTipo] of eventosPorTipo) {
                const configDoEvento = configs.find(c => c.tipo_alerta === tipoEvento);
                if (!configDoEvento) continue;

                const nivel = tipoEvento === 'META_BATIDA_ARREMATE'  ? 'info'    :
                              tipoEvento === 'DEMANDA_PRIORITARIA'   ? 'critico' :
                              tipoEvento === 'DEMANDA_NOVA'          ? 'critico' : 'aviso';

                let mensagem;
                if (eventosDoTipo.length === 1) {
                    mensagem = eventosDoTipo[0].mensagem;
                } else {
                    // Mensagem agrupada
                    const exemplos = eventosDoTipo.slice(-2).map(e => e.mensagem.split('—')[0].replace('Nova demanda: ', '').trim()).join(', ');
                    mensagem = `${eventosDoTipo.length} novas demandas aguardando início (últimas: ${exemplos}…)`;
                }

                alertasParaDisparar.push({ tipo: tipoEvento, mensagem, config: configDoEvento, nivel });
                eventosDoTipo.forEach(e => idsEventosLidos.push(e.id));
                console.log(`[LOG EVENTOS] Tipo "${tipoEvento}": ${eventosDoTipo.length} evento(s) → 1 alerta agrupado.`);
            }

            if (idsEventosLidos.length > 0) {
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