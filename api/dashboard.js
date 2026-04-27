// api/dashboard.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPeriodoFiscalAtual, gerarBlocosSemanais, contarDiasUteis } from '../public/js/utils/periodos-fiscais.js';

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    timezone: 'UTC',
});
const SECRET_KEY = process.env.JWT_SECRET;

router.use(async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Token ausente.' });
        const token = authHeader.split(' ')[1];
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido.' });
    }
});

// --- FUNÇÃO DE AUDITORIA DO COFRE (COM RESET DE CICLO) ---
async function auditarCofrePontos(dbClient, usuarioId, historicoDias, metasConfiguradas, periodoInicio) {
    // 0. Identifica o Ciclo Atual (Ex: "Janeiro/2026")
    const periodoAtual = getPeriodoFiscalAtual(new Date());
    const nomeCicloAtual = periodoAtual.nomeCompetencia; // Ex: "Janeiro 2026"
    
    // 1. Busca Saldo
    let saldoRes = await dbClient.query('SELECT * FROM banco_pontos_saldo WHERE usuario_id = $1', [usuarioId]);
    
    if (saldoRes.rows.length === 0) {
        // Cria novo com o ciclo atual marcado
        saldoRes = await dbClient.query(
            'INSERT INTO banco_pontos_saldo (usuario_id, ciclo_referencia) VALUES ($1, $2) RETURNING *', 
            [usuarioId, nomeCicloAtual]
        );
    }
    
    const saldoAtual = saldoRes.rows[0];
    let novoSaldo = parseFloat(saldoAtual.saldo_atual);
    let novosUsos = saldoAtual.usos_neste_ciclo;
    
    // 2. VERIFICAÇÃO DE VIRADA DE CICLO (RESET)
    // Se o ciclo salvo no banco for diferente do atual, ZERA TUDO.
    if (saldoAtual.ciclo_referencia !== nomeCicloAtual) {        
        // Zera variáveis locais
        novoSaldo = 0;
        novosUsos = 0;
        
        // Registra o reset no log para auditoria
        await dbClient.query(
            `INSERT INTO banco_pontos_log (usuario_id, tipo, quantidade, descricao) VALUES ($1, 'RESET', 0, $2)`,
            [usuarioId, `Início do ciclo ${nomeCicloAtual}`]
        );
        
        // Atualiza a referência no banco imediatamente
        await dbClient.query(
            `UPDATE banco_pontos_saldo SET saldo_atual = 0, usos_neste_ciclo = 0, ciclo_referencia = $1, ultimo_calculo = NOW() WHERE usuario_id = $2`,
            [nomeCicloAtual, usuarioId]
        );
    }

    // 3. Define a Meta Máxima (Para cálculo de sobras)
    const metaMaxima = metasConfiguradas[metasConfiguradas.length - 1];
    if (!metaMaxima) return { saldo: novoSaldo, usos: novosUsos };

    // Ordena metas
    const metasOrdenadas = [...metasConfiguradas].sort((a, b) => a.pontos_meta - b.pontos_meta);

    // 4. Varredura de Dias (Auditoria de Ganhos)
    const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let houveAtualizacao = false;

    for (const dia of historicoDias) {
        if (dia.data >= hojeStr) continue;
        const dataDia = new Date(dia.data);
        if (dataDia < periodoInicio) continue;

        const pontosFeitos = parseFloat(dia.pontos);
        
        let indiceMetaBatida = -1;
        for (let i = metasOrdenadas.length - 1; i >= 0; i--) {
            if (pontosFeitos >= metasOrdenadas[i].pontos_meta) {
                indiceMetaBatida = i;
                break;
            }
        }

        if (indiceMetaBatida >= 1) {
            const metaBatida = metasOrdenadas[indiceMetaBatida];
            const sobra = pontosFeitos - metaBatida.pontos_meta;

            if (sobra > 0) {
                // Verifica se já foi pago
                const logRes = await dbClient.query(
                    `SELECT 1 FROM banco_pontos_log WHERE usuario_id = $1 AND tipo = 'GANHO' AND descricao LIKE $2`,
                    [usuarioId, `%${dia.data}%`]
                );

                if (logRes.rowCount === 0) {
                    await dbClient.query(
                        `INSERT INTO banco_pontos_log (usuario_id, tipo, quantidade, descricao) VALUES ($1, 'GANHO', $2, $3)`,
                        [usuarioId, sobra, `Sobra do dia ${dia.data} (${metaBatida.descricao_meta})`]
                    );
                    novoSaldo += sobra;
                    houveAtualizacao = true;
                }
            }
        }
    }

    if (houveAtualizacao) {
        await dbClient.query(
            `UPDATE banco_pontos_saldo SET saldo_atual = $1, ultimo_calculo = NOW() WHERE usuario_id = $2`,
            [novoSaldo, usuarioId]
        );
    }

    // Conta resgates da semana atual (Seg–Dom, horário SP)
    const agoraSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const diaSemana = agoraSP.getDay();
    const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
    const inicioSemanaAtual = new Date(agoraSP);
    inicioSemanaAtual.setDate(agoraSP.getDate() - diasDesdeSegunda);
    inicioSemanaAtual.setHours(0, 0, 0, 0);

    const resgatesSemanaisRes = await dbClient.query(
        `SELECT COUNT(*)::int as total FROM banco_pontos_log
         WHERE usuario_id = $1 AND tipo = 'RESGATE' AND data_evento >= $2`,
        [usuarioId, inicioSemanaAtual]
    );
    const usosEssaSemana = resgatesSemanaisRes.rows[0].total;

    return { saldo: novoSaldo, usos: novosUsos, usosEssaSemana };
}

router.get('/desempenho', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Busca Usuário (Com ID explícito)
        const userRes = await dbClient.query('SELECT id, nome, tipos, nivel, avatar_url, dias_trabalho FROM usuarios WHERE id = $1', [usuarioId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        const usuario = userRes.rows[0];
        const tipoUsuario = usuario.tipos?.[0] || 'costureira';
        const nivelUsuario = usuario.nivel || 1;

        // 2. Busca Metas
        const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const versaoMetaRes = await dbClient.query(
            `SELECT id FROM metas_versoes WHERE data_inicio_vigencia <= $1 ORDER BY data_inicio_vigencia DESC LIMIT 1`, 
            [hojeSP]
        );
        let metasConfiguradas = [];
        if (versaoMetaRes.rows.length > 0) {
            const regrasRes = await dbClient.query(
                `SELECT pontos_meta, valor_comissao, descricao_meta FROM metas_regras WHERE id_versao = $1 AND tipo_usuario = $2 AND nivel = $3 ORDER BY pontos_meta ASC`,
                [versaoMetaRes.rows[0].id, tipoUsuario, nivelUsuario]
            );
            metasConfiguradas = regrasRes.rows;
        }

        // 3. Período Fiscal
        const periodo = getPeriodoFiscalAtual(new Date());
        
        // 4. Busca Atividades (CORRIGIDO: USANDO ID)
        let queryText = `
            SELECT pr.id::text as id_original, pr.data, pr.pontos_gerados, pr.op_numero, pr.processo, p.nome as produto, pr.quantidade, pr.variacao, 'OP' as tipo_origem
            FROM producoes pr JOIN produtos p ON pr.produto_id = p.id 
            WHERE pr.funcionario_id = $1 AND pr.data BETWEEN $2 AND $3
        `;
        if (tipoUsuario === 'tiktik') {
            queryText += `
                UNION ALL
                SELECT ar.id::text as id_original, ar.data_lancamento as data, ar.pontos_gerados, ar.op_numero, 'Arremate' as processo, p.nome as produto, ar.quantidade_arrematada as quantidade, ar.variante as variacao, 'Arremate' as tipo_origem
                FROM arremates ar JOIN produtos p ON ar.produto_id = p.id
                WHERE ar.usuario_tiktik_id = $1 AND ar.tipo_lancamento = 'PRODUCAO' AND ar.data_lancamento BETWEEN $2 AND $3
            `;
        }
        queryText += `
            UNION ALL
            SELECT pe.id::text as id_original, pe.data_referencia as data, pe.pontos as pontos_gerados, NULL::text as op_numero, 'Pontos Extras' as processo, 'Bônus' as produto, 0 as quantidade, NULL as variacao, 'PontosExtra' as tipo_origem
            FROM pontos_extras pe
            WHERE pe.funcionario_id = $1 AND pe.data_referencia BETWEEN $2::date AND $3::date AND pe.cancelado = FALSE
        `;

        const atividadesRes = await dbClient.query(queryText, [usuario.id, periodo.inicio, periodo.fim]);
        const atividades = atividadesRes.rows;

        // 5. Cálculo Diário
        const diasCalculados = {};
        atividades.forEach(atv => {
            const diaStr = new Date(atv.data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            if (!diasCalculados[diaStr]) diasCalculados[diaStr] = 0;
            diasCalculados[diaStr] += parseFloat(atv.pontos_gerados || 0);
        });

        // Busca Resgates
        const resgatesRes = await dbClient.query(
            `SELECT data_evento, quantidade FROM banco_pontos_log WHERE usuario_id = $1 AND tipo = 'RESGATE' AND data_evento BETWEEN $2 AND $3`,
            [usuario.id, periodo.inicio, periodo.fim]
        );
        resgatesRes.rows.forEach(r => {
            const diaResgateStr = new Date(r.data_evento).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            if (!diasCalculados[diaResgateStr]) diasCalculados[diaResgateStr] = 0;
            diasCalculados[diaResgateStr] += parseFloat(r.quantidade);
        });

        let totalGanhoPeriodo = 0;
        const historicoDias = Object.keys(diasCalculados).map(diaStr => {
            const pontosFeitos = diasCalculados[diaStr];
            let metaBatida = null;
            for (let i = metasConfiguradas.length - 1; i >= 0; i--) {
                if (pontosFeitos >= metasConfiguradas[i].pontos_meta) {
                    metaBatida = metasConfiguradas[i];
                    break;
                }
            }
            const ganhoDia = metaBatida ? parseFloat(metaBatida.valor_comissao) : 0;
            totalGanhoPeriodo += ganhoDia;
            // Nível da meta atingida naquele dia (para o calendário)
            const idxMeta = metaBatida ? metasConfiguradas.findIndex(m => m.pontos_meta === metaBatida.pontos_meta) : -1;
            const ultimoIdx = metasConfiguradas.length - 1;
            const nivelMeta = idxMeta < 0
                ? (pontosFeitos > 0 ? 'nao_bateu' : null)
                : idxMeta === ultimoIdx ? 'ouro'
                : idxMeta === ultimoIdx - 1 && ultimoIdx >= 2 ? 'prata'
                : 'bronze';
            return { data: diaStr, pontos: pontosFeitos, ganho: ganhoDia, nivelMeta };
        });

        // 6. MÉTRICAS DO CICLO
        const inicioCicloStr = periodo.inicio.toISOString().slice(0, 10);
        const fimCicloStr    = periodo.fim.toISOString().slice(0, 10);

        // Feriados e folgas gerais visíveis na dashboard — usados em 12-D e 12-E
        const feriadosCicloRes = await dbClient.query(`
            SELECT data::text AS data FROM calendario_empresa
            WHERE data BETWEEN $1 AND $2
              AND tipo IN ('feriado_nacional', 'feriado_regional', 'folga_empresa')
              AND funcionario_id IS NULL
              AND visivel_dashboard = true
        `, [inicioCicloStr, fimCicloStr]);
        const datasExcluidas = new Set(feriadosCicloRes.rows.map(r => r.data.slice(0, 10)));

        // Todos os eventos do ciclo visíveis ao empregado (para o calendário da dashboard)
        const eventosCalendarioRes = await dbClient.query(`
            SELECT data::text AS data, tipo, descricao
            FROM calendario_empresa
            WHERE data BETWEEN $1 AND $2
              AND visivel_dashboard = true
              AND (funcionario_id IS NULL OR funcionario_id = $3)
            ORDER BY data
        `, [inicioCicloStr, fimCicloStr, usuario.id]);
        const eventosCalendario = eventosCalendarioRes.rows.map(r => ({ ...r, data: r.data.slice(0, 10) }));

        // 12-E: dias úteis genéricos do ciclo (Seg-Sex, sem feriados visíveis)
        const diasUteisNoCiclo = (() => {
            let count = 0;
            let cursor = new Date(periodo.inicio.toISOString().slice(0,10) + 'T12:00:00');
            const fimDate = new Date(periodo.fim.toISOString().slice(0,10) + 'T12:00:00');
            while (cursor <= fimDate) {
                const dow = cursor.getDay();
                const dateStr = cursor.toISOString().slice(0, 10);
                if (dow !== 0 && dow !== 6 && !datasExcluidas.has(dateStr)) count++;
                cursor.setDate(cursor.getDate() + 1);
            }
            return count;
        })();

        // 12-D: dias úteis reais do empregado (considera dias_trabalho + feriados visíveis)
        const diasTrabalhoMap = usuario.dias_trabalho || { "1": true, "2": true, "3": true, "4": true, "5": true };
        const diasUteisRealDoEmpregadoNoCiclo = (() => {
            let count = 0;
            let cursor = new Date(periodo.inicio.toISOString().slice(0,10) + 'T12:00:00');
            const fimDate = new Date(periodo.fim.toISOString().slice(0,10) + 'T12:00:00');
            while (cursor <= fimDate) {
                const dow = cursor.getDay();
                const dateStr = cursor.toISOString().slice(0, 10);
                if (diasTrabalhoMap[String(dow)] === true && !datasExcluidas.has(dateStr)) count++;
                cursor.setDate(cursor.getDate() + 1);
            }
            return count;
        })();

        const diasTrabalhadosNoCiclo = historicoDias.filter(d => d.pontos > 0).length;

        // 7. PROCESSA O COFRE AUTOMATICAMENTE
        const dadosCofre = await auditarCofrePontos(dbClient, usuario.id, historicoDias, metasConfiguradas, periodo.inicio);

        // 7. Blocos Semanais
        const blocos = gerarBlocosSemanais(periodo.inicio, periodo.fim);
        const blocosComDados = blocos.map(bloco => {
            const diasNoBloco = historicoDias.filter(d => {
                const dataDia = new Date(d.data + 'T00:00:00');
                return dataDia >= bloco.inicio && dataDia <= bloco.fim;
            });
            return {
                ...bloco,
                ganho: diasNoBloco.reduce((acc, d) => acc + d.ganho, 0),
                pontos: diasNoBloco.reduce((acc, d) => acc + d.pontos, 0),
            };
        });

        const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const dadosHoje = historicoDias.find(d => d.data === hojeStr) || { pontos: 0, ganho: 0 };
        const proximaMetaHoje = metasConfiguradas.find(m => m.pontos_meta > dadosHoje.pontos) || metasConfiguradas[metasConfiguradas.length - 1];

        // 8. CÁLCULO DO CICLO ANTERIOR (LIMPO E SEM LOGS)
        const fimCicloAnterior = new Date(periodo.inicio);
        fimCicloAnterior.setDate(fimCicloAnterior.getDate() - 1); // 20/12
        fimCicloAnterior.setHours(23, 59, 59, 999);

        const inicioCicloAnterior = new Date(fimCicloAnterior);
        inicioCicloAnterior.setDate(21);
        inicioCicloAnterior.setMonth(inicioCicloAnterior.getMonth() - 1);
        inicioCicloAnterior.setHours(0, 0, 0, 0);
        
        let valorCicloAnterior = 0;
        let dataPagamentoAnterior = null;

        if (fimCicloAnterior >= inicioCicloAnterior) {
            const dPag = new Date(fimCicloAnterior);
            dPag.setMonth(dPag.getMonth() + 1);
            dPag.setDate(15);
            dataPagamentoAnterior = dPag.toLocaleDateString('pt-BR');

            // Busca Produção Anterior (POR ID)
            const ativAntRes = await dbClient.query(queryText, [usuario.id, inicioCicloAnterior, fimCicloAnterior]);
            
            // Busca Resgates Anteriores (Com cast de data para segurança)
            const resgAntRes = await dbClient.query(
                `SELECT data_evento, quantidade 
                 FROM banco_pontos_log 
                 WHERE usuario_id = $1 
                   AND tipo = 'RESGATE' 
                   AND data_evento::date >= $2::date 
                   AND data_evento::date <= $3::date`,
                [usuario.id, inicioCicloAnterior, fimCicloAnterior]
            );

            // Mapeia Pontos
            const mapaAnt = {};

            ativAntRes.rows.forEach(r => {
                const d = new Date(r.data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                if (!mapaAnt[d]) mapaAnt[d] = 0;
                mapaAnt[d] += parseFloat(r.pontos_gerados);
            });

            resgAntRes.rows.forEach(r => {
                const d = new Date(r.data_evento).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                if (!mapaAnt[d]) mapaAnt[d] = 0;
                mapaAnt[d] += parseFloat(r.quantidade);
            });

            // Busca Metas da Época
            const versaoAntRes = await dbClient.query(
                `SELECT id FROM metas_versoes WHERE data_inicio_vigencia <= $1 ORDER BY data_inicio_vigencia DESC LIMIT 1`,
                [fimCicloAnterior.toISOString().substring(0,10)]
            );
            
            let metasAnt = [];
            if (versaoAntRes.rows.length > 0) {
                const regrasAntRes = await dbClient.query(
                    `SELECT pontos_meta, valor_comissao, descricao_meta FROM metas_regras WHERE id_versao = $1 AND tipo_usuario = $2 AND nivel = $3 ORDER BY pontos_meta ASC`,
                    [versaoAntRes.rows[0].id, tipoUsuario, nivelUsuario]
                );
                metasAnt = regrasAntRes.rows;
            }

            // Calcula Valor
            Object.values(mapaAnt).forEach(pontosDia => {
                let valDia = 0;
                for (let i = metasAnt.length - 1; i >= 0; i--) {
                    if (pontosDia >= metasAnt[i].pontos_meta) {
                        valDia = parseFloat(metasAnt[i].valor_comissao);
                        break;
                    }
                }
                valorCicloAnterior += valDia;
            });
        }

        // 9. BUSCA PARA LISTA DE DETALHAMENTO (LIVRE DE CICLO)
        // Busca as últimas 100 atividades independente da data (para histórico visual)
        let queryLista = `
            SELECT pr.id::text as id_original, pr.data, pr.pontos_gerados, pr.op_numero, pr.processo, p.nome as produto, pr.quantidade, pr.variacao, 'OP' as tipo_origem
            FROM producoes pr JOIN produtos p ON pr.produto_id = p.id 
            WHERE pr.funcionario_id = $1
        `;
        if (tipoUsuario === 'tiktik') {
            queryLista += `
                UNION ALL
                SELECT ar.id::text as id_original, ar.data_lancamento as data, ar.pontos_gerados, ar.op_numero, 'Arremate' as processo, p.nome as produto, ar.quantidade_arrematada as quantidade, ar.variante as variacao, 'Arremate' as tipo_origem
                FROM arremates ar JOIN produtos p ON ar.produto_id = p.id
                WHERE ar.usuario_tiktik_id = $1 AND ar.tipo_lancamento = 'PRODUCAO'
            `;
        }
        queryLista += `
            UNION ALL
            SELECT pe.id::text as id_original, pe.data_referencia as data, pe.pontos as pontos_gerados, NULL::text as op_numero, 'Pontos Extras' as processo, 'Bônus' as produto, 0 as quantidade, NULL as variacao, 'PontosExtra' as tipo_origem
            FROM pontos_extras pe
            WHERE pe.funcionario_id = $1 AND pe.cancelado = FALSE
        `;
        // Ordena por data decrescente e limita
        queryLista += ` ORDER BY data DESC LIMIT 100`;

        const listaRes = await dbClient.query(queryLista, [usuario.id]);
        const atividadesParaLista = listaRes.rows;

        // 10. DATA EXATA DE PAGAMENTO (12-F)
        // Usa o mesmo ciclo que será exibido em pagamentoPendente
        const fimCicloExibido = totalGanhoPeriodo > 0 ? periodo.fim
                              : valorCicloAnterior > 0 ? fimCicloAnterior
                              : null;

        let dataPagamentoExata = null;
        let dataPagamentoFormatada = null;

        if (fimCicloExibido) {
            // Mês seguinte ao fim do ciclo
            const fimStr = fimCicloExibido.toISOString().slice(0, 10);
            let [anoRef, mesRef] = fimStr.split('-').map(Number);
            mesRef += 1;
            if (mesRef > 12) { mesRef = 1; anoRef++; }

            const primeiroDiaPgto = new Date(Date.UTC(anoRef, mesRef - 1, 1));
            const ultimoDiaPgto   = new Date(Date.UTC(anoRef, mesRef, 0));

            // Feriados do mês de pagamento visíveis na dashboard
            const feriadosPgtoRes = await dbClient.query(`
                SELECT data::text AS data FROM calendario_empresa
                WHERE data BETWEEN $1 AND $2
                  AND tipo IN ('feriado_nacional', 'feriado_regional', 'folga_empresa')
                  AND funcionario_id IS NULL
                  AND visivel_dashboard = true
            `, [primeiroDiaPgto.toISOString().slice(0, 10), ultimoDiaPgto.toISOString().slice(0, 10)]);

            const datasExcluidasPgto = new Set(feriadosPgtoRes.rows.map(r => r.data.slice(0, 10)));

            // 5º dia útil — CLT Art. 459: Seg–Sab contam, domingo não
            let diasContados = 0;
            let cursorPgto = new Date(primeiroDiaPgto);
            while (diasContados < 5) {
                const dow = cursorPgto.getUTCDay();
                const dateStr = cursorPgto.toISOString().slice(0, 10);
                if (dow !== 0 && !datasExcluidasPgto.has(dateStr)) {
                    diasContados++;
                    if (diasContados === 5) break;
                }
                cursorPgto.setUTCDate(cursorPgto.getUTCDate() + 1);
            }

            dataPagamentoExata = cursorPgto.toISOString().slice(0, 10);
            dataPagamentoFormatada = new Date(dataPagamentoExata + 'T12:00:00Z')
                .toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        }

        res.status(200).json({
            usuario: { ...usuario, tipo: tipoUsuario },
            competencia: periodo.nomeCompetencia,
            hoje: {
                pontos: dadosHoje.pontos,
                ganho: dadosHoje.ganho,
                proximaMeta: proximaMetaHoje
            },
            acumulado: {
                totalGanho: totalGanhoPeriodo,
                blocos: blocosComDados,
                diasUteisNoCiclo,
                diasTrabalhadosNoCiclo,
                diasDetalhes: historicoDias,
                diasUteisRealDoEmpregadoNoCiclo,
                eventosCalendario
            },
            pagamentoPendente: (() => {
                // Ciclo atual tem produção → mostrar como pagamento pendente
                if (totalGanhoPeriodo > 0) {
                    const d = new Date(periodo.fim);
                    d.setMonth(d.getMonth() + 1);
                    return {
                        valor: totalGanhoPeriodo,
                        periodo: `${periodo.inicio.toLocaleDateString('pt-BR')} a ${periodo.fim.toLocaleDateString('pt-BR')}`,
                        mesReferencia: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
                        dataPagamentoExata,
                        dataPagamentoFormatada
                    };
                }
                // Ciclo atual vazio (ex: primeiro dia do novo ciclo) → mostrar ciclo anterior se tiver valor
                if (valorCicloAnterior > 0) {
                    const d = new Date(fimCicloAnterior);
                    d.setMonth(d.getMonth() + 1);
                    return {
                        valor: valorCicloAnterior,
                        periodo: `${inicioCicloAnterior.toLocaleDateString('pt-BR')} a ${fimCicloAnterior.toLocaleDateString('pt-BR')}`,
                        mesReferencia: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
                        dataPagamentoExata,
                        dataPagamentoFormatada
                    };
                }
                return { valor: 0, periodo: null, mesReferencia: '', dataPagamentoExata: null, dataPagamentoFormatada: null };
            })(),
            periodo: {
                inicio: periodo.inicio.toISOString().split('T')[0],
                fim: periodo.fim.toISOString().split('T')[0]
            },
            cofre: dadosCofre,
            atividadesRecentes: atividadesParaLista,
            metasPossiveis: metasConfiguradas
        });

    } catch (error) {
        console.error('[API Desempenho] Erro:', error);
        res.status(500).json({ error: 'Erro interno.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/dashboard/atividades
// GET /api/dashboard/atividades
router.get('/atividades', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    // Se não passar 'limit', assumimos que quer tudo para o front paginar
    const { data, busca } = req.query;

    let dbClient;
    try {
        dbClient = await pool.connect();
        
        const userRes = await dbClient.query('SELECT tipos FROM usuarios WHERE id = $1', [usuarioId]);
        const tipoUsuario = userRes.rows[0]?.tipos?.[0] || 'costureira';

        // 1. Monta a Subquery
        let subQuery = `
            SELECT pr.id, pr.data, pr.pontos_gerados, pr.op_numero, pr.processo, p.nome as nome_produto, pr.quantidade, pr.variacao, 'OP' as tipo_origem, pr.funcionario_id as uid
            FROM producoes pr JOIN produtos p ON pr.produto_id = p.id
        `;

        if (tipoUsuario === 'tiktik') {
            subQuery += `
                UNION ALL
                SELECT ar.id::text as id, ar.data_lancamento as data, ar.pontos_gerados, ar.op_numero, 'Arremate' as processo, p.nome as nome_produto, ar.quantidade_arrematada as quantidade, ar.variante as variacao, 'Arremate' as tipo_origem, ar.usuario_tiktik_id as uid
                FROM arremates ar JOIN produtos p ON ar.produto_id = p.id
                WHERE ar.tipo_lancamento = 'PRODUCAO'
            `;
        }

        // Pontos extras para todos os tipos (costureira e tiktik)
        // Usa data_lancamento (TIMESTAMPTZ) como data para que fmtHora() mostre o horário real
        // e não 00:00 como aconteceria com data_referencia (DATE sem horário)
        subQuery += `
            UNION ALL
            SELECT pe.id::text as id, pe.data_lancamento as data, pe.pontos as pontos_gerados,
                   NULL::text as op_numero, 'Pontos Extras' as processo, 'Bônus' as nome_produto,
                   0 as quantidade, NULL as variacao, 'PontosExtra' as tipo_origem,
                   pe.funcionario_id as uid
            FROM pontos_extras pe
            WHERE pe.cancelado = FALSE
        `;

        // 2. Filtros
        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        whereClauses.push(`uid = $${paramIndex++}`);
        params.push(usuarioId);

        if (data) {
            whereClauses.push(`data::date = $${paramIndex++}::date`);
            params.push(data);
        }

        // Filtro de Busca Inteligente
        if (busca) {
            // Remove acentos do termo de busca no Javascript antes de enviar
            const termoNormalizado = busca.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const termoBuscaLike = `%${termoNormalizado.trim().replace(/\s+/g, '%')}%`;

            // Na query, tentamos converter o banco para sem acento também (se possível)
            // Se não tiver unaccent, usamos um translate simples para as vogais mais comuns
            // TRANSLATE(campo, 'áàãâéêíóôõúüçÁÀÃÂÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC')
            
            const campoBusca = `
                TRANSLATE(
                    (op_numero || ' ' || nome_produto || ' ' || COALESCE(variacao, '')),
                    'áàãâéêíóôõúüçÁÀÃÂÉÊÍÓÔÕÚÜÇ',
                    'aaaaeeiooouucAAAAEEIOOOUUC'
                )
            `;

            whereClauses.push(`${campoBusca} ILIKE $${paramIndex}`);
            params.push(termoBuscaLike);
            paramIndex++;
        }

        const whereString = `WHERE ${whereClauses.join(' AND ')}`;
        
        // 3. Query Final (SEM PAGINAÇÃO)
        // Buscamos tudo para o frontend calcular totais e paginar
        const dataQuery = `
            SELECT * FROM (${subQuery}) as uniao_atividades 
            ${whereString}
            ORDER BY data DESC
        `;

        const result = await dbClient.query(dataQuery, params);

        res.status(200).json({
            rows: result.rows,
            totalItems: result.rowCount
        });

    } catch (error) {
        console.error('[API Atividades] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar atividades.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// NOVA ROTA: RESGATAR PONTOS
router.post('/resgatar-pontos', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    const { quantidade } = req.body;
    let dbClient;

    if (!quantidade || quantidade <= 0) return res.status(400).json({ error: 'Quantidade inválida.' });

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        // 1. Verifica saldo
        const saldoRes = await dbClient.query('SELECT * FROM banco_pontos_saldo WHERE usuario_id = $1 FOR UPDATE', [usuarioId]);
        if (saldoRes.rows.length === 0) throw new Error('Cofre não encontrado.');

        const saldoAtual = parseFloat(saldoRes.rows[0].saldo_atual);
        if (saldoAtual < quantidade) throw new Error('Saldo insuficiente no cofre.');

        // 2. Verifica limite semanal (2 por semana Seg–Dom, horário SP)
        const agoraSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const diaSemana = agoraSP.getDay();
        const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
        const inicioSemanaAtual = new Date(agoraSP);
        inicioSemanaAtual.setDate(agoraSP.getDate() - diasDesdeSegunda);
        inicioSemanaAtual.setHours(0, 0, 0, 0);

        const resgatesSemanaisRes = await dbClient.query(
            `SELECT COUNT(*)::int as total FROM banco_pontos_log
             WHERE usuario_id = $1 AND tipo = 'RESGATE' AND data_evento >= $2`,
            [usuarioId, inicioSemanaAtual]
        );
        if (resgatesSemanaisRes.rows[0].total >= 2) {
            throw new Error('Você já usou seus 2 resgates desta semana. Volta na segunda-feira!');
        }

        // 3. Verifica produção mínima hoje (500 pts)
        const tipoRes = await dbClient.query('SELECT tipos FROM usuarios WHERE id = $1', [usuarioId]);
        const tipoUsuario = tipoRes.rows[0]?.tipos?.[0] || 'costureira';
        const hojeStrSP = agoraSP.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        const pontosHojeProd = await dbClient.query(
            `SELECT COALESCE(SUM(pontos_gerados), 0)::float as total FROM producoes
             WHERE funcionario_id = $1 AND data::date = $2::date`,
            [usuarioId, hojeStrSP]
        );
        let pontosHoje = pontosHojeProd.rows[0].total;

        if (tipoUsuario === 'tiktik') {
            const pontosHojeArr = await dbClient.query(
                `SELECT COALESCE(SUM(pontos_gerados), 0)::float as total FROM arremates
                 WHERE usuario_tiktik_id = $1 AND tipo_lancamento = 'PRODUCAO' AND data_lancamento::date = $2::date`,
                [usuarioId, hojeStrSP]
            );
            pontosHoje += pontosHojeArr.rows[0].total;
        }
        const pontosHojeExtras = await dbClient.query(
            `SELECT COALESCE(SUM(pontos), 0)::float as total FROM pontos_extras
             WHERE funcionario_id = $1 AND data_referencia = $2::date AND cancelado = FALSE`,
            [usuarioId, hojeStrSP]
        );
        pontosHoje += pontosHojeExtras.rows[0].total;

        if (pontosHoje < 500) {
            throw new Error(`Produção insuficiente hoje (${Math.round(pontosHoje)} pts). São necessários pelo menos 500 pts para resgatar.`);
        }

        // 4. Deduz do Saldo
        await dbClient.query(
            `UPDATE banco_pontos_saldo SET saldo_atual = saldo_atual - $1, usos_neste_ciclo = usos_neste_ciclo + 1 WHERE usuario_id = $2`,
            [quantidade, usuarioId]
        );

        // 3. Registra no Log
        const hojeStr = new Date().toLocaleDateString('pt-BR');
        await dbClient.query(
            `INSERT INTO banco_pontos_log (usuario_id, tipo, quantidade, descricao) VALUES ($1, 'RESGATE', $2, $3)`,
            [usuarioId, quantidade, `Resgate manual para o dia ${hojeStr}`]
        );

        await dbClient.query('COMMIT');
        res.status(200).json({ message: 'Pontos resgatados com sucesso! Atualize a página.' });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        res.status(400).json({ error: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

router.get('/cofre/extrato', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    const { page = 1, limit = 8 } = req.query; // Adicionado paginação
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        const limitNum = parseInt(limit);
        const offset = (parseInt(page) - 1) * limitNum;

        // 1. Busca Total de Itens (para saber se tem mais páginas)
        const countRes = await dbClient.query('SELECT COUNT(*) FROM banco_pontos_log WHERE usuario_id = $1', [usuarioId]);
        const totalItems = parseInt(countRes.rows[0].count);

        // 2. Busca os Dados Paginados
        const result = await dbClient.query(`
            SELECT tipo, quantidade, descricao, data_evento 
            FROM banco_pontos_log 
            WHERE usuario_id = $1 
            ORDER BY data_evento DESC 
            LIMIT $2 OFFSET $3
        `, [usuarioId, limitNum, offset]);

        res.status(200).json({
            rows: result.rows,
            pagination: {
                page: parseInt(page),
                totalPages: Math.ceil(totalItems / limitNum),
                totalItems
            }
        });
    } catch (error) {
        console.error('[API Cofre Extrato] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar extrato.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/dashboard/meus-pagamentos
router.get('/meus-pagamentos', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // CORREÇÃO: Filtra apenas COMISSÃO e DATA >= 14/12/2025
        const historicoRes = await dbClient.query(`
            SELECT 
                data_pagamento, 
                ciclo_nome, 
                valor_liquido_pago, 
                descricao
            FROM historico_pagamentos_funcionarios
            WHERE usuario_id = $1
              AND descricao ILIKE '%Comissão%' -- Filtra apenas Comissões
              AND data_pagamento >= '2025-12-14 00:00:00' -- Filtra data de corte
            ORDER BY data_pagamento DESC
            LIMIT 2
        `, [usuarioId]);

        res.status(200).json(historicoRes.rows);

    } catch (error) {
        console.error('[API Meus Pagamentos] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/dashboard/ritmo-atual
router.get('/ritmo-atual', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    const metaAlvo = parseInt(req.query.meta_pontos) || 0;
    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Tipo e dias de trabalho do usuário
        const tipoRes = await dbClient.query('SELECT tipos, dias_trabalho FROM usuarios WHERE id = $1', [usuarioId]);
        const tipoUsuario = tipoRes.rows[0]?.tipos?.[0] || 'costureira';
        const diasTrabalho = tipoRes.rows[0]?.dias_trabalho || { "1":true,"2":true,"3":true,"4":true,"5":true };

        // 2. Data e dia da semana (SP)
        const agoraSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const hojeStr = agoraSP.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const diaSemana = agoraSP.getDay();
        const nomesDia = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
        const nomeDiaAtual = nomesDia[diaSemana];

        // Se hoje não é dia de trabalho deste empregado, não exibir o card
        if (!diasTrabalho[String(diaSemana)]) {
            return res.status(200).json({ naoEDiaDeTrabalho: true });
        }

        // 3. Pontos de hoje (paralelo)
        const [pontosHojeRes, sessoesRes, pontosExtrasRes] = await Promise.all([
            tipoUsuario === 'tiktik'
                ? dbClient.query(
                    `SELECT COALESCE(SUM(pontos_gerados), 0)::float as total
                     FROM arremates
                     WHERE usuario_tiktik_id = $1 AND tipo_lancamento = 'PRODUCAO'
                     AND data_lancamento::date = $2::date`,
                    [usuarioId, hojeStr]
                )
                : dbClient.query(
                    `SELECT COALESCE(SUM(pontos_gerados), 0)::float as total
                     FROM producoes WHERE funcionario_id = $1 AND data::date = $2::date`,
                    [usuarioId, hojeStr]
                ),
            // 4. Horas trabalhadas hoje (sessões)
            tipoUsuario === 'tiktik'
                ? dbClient.query(
                    `SELECT COALESCE(SUM(
                         EXTRACT(EPOCH FROM (COALESCE(data_fim, NOW()) - data_inicio)) / 3600.0
                     ), 0)::float as horas_total
                     FROM sessoes_trabalho_arremate
                     WHERE usuario_tiktik_id = $1
                     AND data_inicio::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
                     AND status NOT IN ('CANCELADA', 'ESTORNADA')`,
                    [usuarioId]
                )
                : dbClient.query(
                    `SELECT COALESCE(SUM(
                         EXTRACT(EPOCH FROM (COALESCE(data_fim, NOW()) - data_inicio)) / 3600.0
                     ), 0)::float as horas_total
                     FROM sessoes_trabalho_producao
                     WHERE funcionario_id = $1
                     AND data_inicio::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
                     AND status != 'CANCELADA'`,
                    [usuarioId]
                ),
            // Pontos extras de hoje
            dbClient.query(
                `SELECT COALESCE(SUM(pontos), 0)::float as total FROM pontos_extras
                 WHERE funcionario_id = $1 AND data_referencia = $2::date AND cancelado = FALSE`,
                [usuarioId, hojeStr]
            )
        ]);

        const pontosHoje = pontosHojeRes.rows[0].total + pontosExtrasRes.rows[0].total;
        const horasTrabalhadasHoje = sessoesRes.rows[0].horas_total || 0;

        // 5. Ritmo atual (pts/hora) — mínimo 30 min de dados
        const MINIMO_HORAS = 0.5;
        const temDadosSuficientes = horasTrabalhadasHoje >= MINIMO_HORAS;
        const ritmoAtual = temDadosSuficientes ? pontosHoje / horasTrabalhadasHoje : null;

        // 6. Histórico do mesmo dia da semana (últimas 6 ocorrências)
        const historicoRes = await dbClient.query(
            tipoUsuario === 'tiktik'
                ? `SELECT data_lancamento::date as data_dia, SUM(pontos_gerados)::float as pontos_dia
                   FROM arremates
                   WHERE usuario_tiktik_id = $1 AND tipo_lancamento = 'PRODUCAO'
                   AND EXTRACT(DOW FROM data_lancamento AT TIME ZONE 'America/Sao_Paulo') = $2
                   AND data_lancamento::date < $3::date
                   GROUP BY data_dia ORDER BY data_dia DESC LIMIT 6`
                : `SELECT data::date as data_dia, SUM(pontos_gerados)::float as pontos_dia
                   FROM producoes
                   WHERE funcionario_id = $1
                   AND EXTRACT(DOW FROM data AT TIME ZONE 'America/Sao_Paulo') = $2
                   AND data::date < $3::date
                   GROUP BY data_dia ORDER BY data_dia DESC LIMIT 6`,
            [usuarioId, diaSemana, hojeStr]
        );

        const pontosHistorico = historicoRes.rows.map(r => r.pontos_dia);
        const mediaHistoricaPontosDia = pontosHistorico.length > 0
            ? pontosHistorico.reduce((a, b) => a + b, 0) / pontosHistorico.length
            : null;

        // Ritmo histórico estimado em 8h de expediente
        const HORAS_EXPEDIENTE = 8;
        const ritmoHistorico = mediaHistoricaPontosDia != null
            ? mediaHistoricaPontosDia / HORAS_EXPEDIENTE
            : null;

        // 7. Comparação ritmo atual vs histórico
        let comparacaoHistorico = null;
        if (ritmoAtual != null && ritmoHistorico != null && ritmoHistorico > 0) {
            comparacaoHistorico = Math.round(((ritmoAtual - ritmoHistorico) / ritmoHistorico) * 100);
        }

        // 8. Previsão de batida de meta
        // ritmoAtual > 0 obrigatório: se for 0, a divisão dá Infinity → new Date(Infinity) = "Invalid Date"
        let previsao = null;
        if (ritmoAtual != null && ritmoAtual > 0 && metaAlvo > 0 && pontosHoje < metaAlvo) {
            const pontosRestantes = metaAlvo - pontosHoje;
            const horasAteAMeta = pontosRestantes / ritmoAtual;
            const previsaoMs = agoraSP.getTime() + (horasAteAMeta * 3600 * 1000);
            const previsaoDate = new Date(previsaoMs);
            previsao = {
                horario: previsaoDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
                atingivel: horasAteAMeta < 6
            };
        }

        res.status(200).json({
            pontosHoje: Math.round(pontosHoje),
            horasTrabalhadasHoje: Math.round(horasTrabalhadasHoje * 10) / 10,
            ritmoAtual: ritmoAtual != null ? Math.round(ritmoAtual) : null,
            ritmoHistorico: ritmoHistorico != null ? Math.round(ritmoHistorico) : null,
            comparacaoHistorico,
            nomeDiaAtual,
            previsao,
            temDadosSuficientes,
            amostrasHistorico: pontosHistorico.length
        });

    } catch (error) {
        console.error('[API Ritmo IA] Erro:', error);
        res.status(500).json({ error: 'Erro ao calcular ritmo.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/dashboard/minha-tabela-pontos
router.get('/minha-tabela-pontos', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Tipo do usuário
        const tipoRes = await dbClient.query('SELECT tipos FROM usuarios WHERE id = $1', [usuarioId]);
        const tipoUsuario = tipoRes.rows[0]?.tipos?.[0] || 'costureira';

        // costureiras usam 'costura_op_costureira'; tiktiks usam 'processo_op_tiktik' e 'arremate_tiktik'
        const tiposAtividade = tipoUsuario === 'tiktik'
            ? ['processo_op_tiktik', 'arremate_tiktik']
            : ['costura_op_costureira'];

        // 2. Produtos que o empregado trabalhou nos últimos 90 dias
        const queryProdutos = tipoUsuario === 'tiktik'
            ? `SELECT DISTINCT produto_id FROM arremates
               WHERE usuario_tiktik_id = $1 AND data_lancamento >= NOW() - INTERVAL '90 days'`
            : `SELECT DISTINCT produto_id FROM producoes
               WHERE funcionario_id = $1 AND data >= NOW() - INTERVAL '90 days'`;

        const produtosRes = await dbClient.query(queryProdutos, [usuarioId]);
        const produtosIds = produtosRes.rows.map(r => r.produto_id);

        if (produtosIds.length === 0) return res.status(200).json([]);

        // 3. Configurações de pontos para esses produtos e tipos de atividade
        const tabelaRes = await dbClient.query(`
            SELECT
                cpp.produto_id,
                p.nome          AS produto_nome,
                p.imagem        AS produto_imagem,
                cpp.processo_nome,
                cpp.pontos_padrao
            FROM configuracoes_pontos_processos cpp
            JOIN produtos p ON cpp.produto_id = p.id
            WHERE cpp.produto_id = ANY($1::int[])
              AND cpp.tipo_atividade = ANY($2::text[])
              AND cpp.ativo = true
            ORDER BY p.nome ASC, cpp.pontos_padrao DESC
        `, [produtosIds, tiposAtividade]);

        // 4. Agrupa por produto
        const mapaGrupo = {};
        tabelaRes.rows.forEach(row => {
            if (!mapaGrupo[row.produto_id]) {
                mapaGrupo[row.produto_id] = {
                    produto_id: row.produto_id,
                    produto_nome: row.produto_nome,
                    produto_imagem: row.produto_imagem,
                    processos: []
                };
            }
            mapaGrupo[row.produto_id].processos.push({
                nome: row.processo_nome,
                pontos: parseFloat(row.pontos_padrao)
            });
        });

        res.status(200).json(Object.values(mapaGrupo));

    } catch (error) {
        console.error('[API Tabela Pontos] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar tabela de pontos.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

// GET /api/dashboard/ranking-semana
router.get('/ranking-semana', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Tipo do usuário logado
        const tipoRes = await dbClient.query('SELECT tipos FROM usuarios WHERE id = $1', [usuarioId]);
        const tipoUsuario = tipoRes.rows[0]?.tipos?.[0] || 'costureira';

        // 2. Início da semana (domingo 00:00 SP → semana Dom–Sab)
        const agoraSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const diaSemana = agoraSP.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
        const inicioSemana = new Date(agoraSP);
        inicioSemana.setDate(agoraSP.getDate() - diaSemana);
        inicioSemana.setHours(0, 0, 0, 0);

        // Label da semana para o header do card
        const fimSemana = new Date(inicioSemana);
        fimSemana.setDate(inicioSemana.getDate() + 6);
        const fmtDia = (d) => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
        const labelSemana = `${fmtDia(inicioSemana)}–${fmtDia(fimSemana)}`;

        // 3. Buscar todos os usuários ativos do mesmo tipo
        // data_admissao NOT NULL = empregado formalmente admitido
        // data_demissao IS NULL  = ainda na empresa
        const usuariosRes = await dbClient.query(
            `SELECT id FROM usuarios
             WHERE $1 = ANY(tipos)
               AND data_admissao IS NOT NULL
               AND data_demissao IS NULL`,
            [tipoUsuario]
        );
        const todosIds = usuariosRes.rows.map(r => r.id);

        if (todosIds.length <= 1) {
            return res.status(200).json({ totalParticipantes: todosIds.length, ranking: [] });
        }

        // 4. Somar pontos de cada usuário na semana
        // NOTA: pontos_extras propositalmente excluídos do ranking — seria injusto
        // com quem não recebeu bônus. O card exibe um 'i' explicando isso ao usuário.
        let queryPontos;
        if (tipoUsuario === 'tiktik') {
            queryPontos = `
                SELECT usuario_tiktik_id AS uid, COALESCE(SUM(pontos_gerados), 0)::int AS pontos
                FROM arremates
                WHERE usuario_tiktik_id = ANY($1::int[])
                AND tipo_lancamento = 'PRODUCAO'
                AND data_lancamento >= $2
                GROUP BY uid
            `;
        } else {
            queryPontos = `
                SELECT funcionario_id AS uid, COALESCE(SUM(pontos_gerados), 0)::int AS pontos
                FROM producoes
                WHERE funcionario_id = ANY($1::int[])
                AND data >= $2
                GROUP BY uid
            `;
        }
        const pontosRes = await dbClient.query(queryPontos, [todosIds, inicioSemana]);

        // 5. Incluir usuários com 0 pontos e ordenar
        const mapaRanking = new Map(pontosRes.rows.map(r => [r.uid, r.pontos]));
        todosIds.forEach(id => { if (!mapaRanking.has(id)) mapaRanking.set(id, 0); });

        const rankingOrdenado = [...mapaRanking.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([uid, pontos], idx) => ({ uid, pontos, posicao: idx + 1, isEu: uid === usuarioId }));

        const minhaEntrada = rankingOrdenado.find(r => r.isEu);
        const minhaPosicao = minhaEntrada?.posicao || rankingOrdenado.length;
        const meusPontos = minhaEntrada?.pontos || 0;

        // 6. Slice visível
        // Times pequenos (≤ 8): mostrar todos — nenhum membro fica de fora.
        // Times grandes: janela de #1 fixo + 2 acima + eu + 2 abaixo.
        const indiceEu = rankingOrdenado.findIndex(r => r.isEu);
        let slice;
        if (rankingOrdenado.length <= 8) {
            slice = rankingOrdenado;
        } else {
            const inicioSlice = Math.max(0, indiceEu - 2);
            const fimSlice = Math.min(rankingOrdenado.length, indiceEu + 3);
            slice = rankingOrdenado.slice(inicioSlice, fimSlice);

            // Garantir que o #1 está sempre presente
            if (slice[0]?.posicao !== 1) {
                slice = [
                    rankingOrdenado[0],
                    { posicao: null, pontos: null, uid: null, isEu: false, separador: true },
                    ...slice
                ];
            }
        }

        // 7. Anonimizar (não enviar uid de outros)
        const rankingFinal = slice.map(r => ({
            posicao: r.posicao,
            pontos: r.pontos,
            isEu: r.isEu,
            separador: r.separador || false
        }));

        // 8. Gap para motivação
        const proximoAcima = rankingOrdenado[indiceEu - 1];
        const gapParaProximo = proximoAcima ? proximoAcima.pontos - meusPontos : 0;
        const posicaoAcima = proximoAcima ? proximoAcima.posicao : null;
        const gapParaPrimeiro = rankingOrdenado[0].pontos - meusPontos;
        const todosZerados = rankingOrdenado[0].pontos === 0;

        res.status(200).json({
            minhaPosicao,
            totalParticipantes: rankingOrdenado.length,
            meusPontos,
            tipoUsuario,
            gapParaProximo,
            posicaoAcima,
            gapParaPrimeiro,
            labelSemana,
            diaSemana,
            todosZerados,
            ranking: rankingFinal
        });

    } catch (error) {
        console.error('[API Ranking] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar ranking.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;