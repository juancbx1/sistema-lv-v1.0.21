// api/dashboard.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';
import { getPeriodoFiscalAtual, gerarBlocosSemanais } from '../public/js/utils/periodos-fiscais.js';

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
        if (dia.data < '2025-12-14') continue; 

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

    return { saldo: novoSaldo, usos: novosUsos };
}

router.get('/desempenho', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Busca Usuário (Com ID explícito)
        const userRes = await dbClient.query('SELECT id, nome, tipos, nivel, avatar_url FROM usuarios WHERE id = $1', [usuarioId]);
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
            // Regra do corte de 14/12
            if (diaStr >= '2025-12-14') {
                totalGanhoPeriodo += ganhoDia;
            }
            return { data: diaStr, pontos: pontosFeitos, ganho: ganhoDia };
        });

        // 6. PROCESSA O COFRE AUTOMATICAMENTE
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

        const inicioCicloAnterior = new Date('2025-12-14T00:00:00');
        
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
        // Ordena por data decrescente e limita
        queryLista += ` ORDER BY data DESC LIMIT 100`;

        const listaRes = await dbClient.query(queryLista, [usuario.id]);
        const atividadesParaLista = listaRes.rows;

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
                blocos: blocosComDados
            },
            pagamentoPendente: {
                valor: valorCicloAnterior,
                data: dataPagamentoAnterior,
                periodo: `${inicioCicloAnterior.toLocaleDateString('pt-BR')} a ${fimCicloAnterior.toLocaleDateString('pt-BR')}`
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

        // 1. Verifica saldo e limite de usos
        const saldoRes = await dbClient.query('SELECT * FROM banco_pontos_saldo WHERE usuario_id = $1 FOR UPDATE', [usuarioId]);
        if (saldoRes.rows.length === 0) throw new Error('Cofre não encontrado.');
        
        const saldoAtual = parseFloat(saldoRes.rows[0].saldo_atual);
        const usosAtuais = saldoRes.rows[0].usos_neste_ciclo;

        if (saldoAtual < quantidade) throw new Error('Saldo insuficiente no cofre.');
        if (usosAtuais >= 5) throw new Error('Limite de 5 resgates por ciclo atingido.');

        // 2. Deduz do Saldo
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
            LIMIT 12
        `, [usuarioId]);

        res.status(200).json(historicoRes.rows);

    } catch (error) {
        console.error('[API Meus Pagamentos] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;