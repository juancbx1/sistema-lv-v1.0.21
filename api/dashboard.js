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

// --- FUNÇÃO DE AUDITORIA DO COFRE (COM LOGS DE DEBUG) ---
async function auditarCofrePontos(dbClient, usuarioId, historicoDias, metasConfiguradas, periodoInicio) {
    console.log(`\n[COFRE] --- Iniciando Auditoria para Usuário ID: ${usuarioId} ---`);
    
    // 1. Busca ou Cria o Saldo
    let saldoRes = await dbClient.query('SELECT * FROM banco_pontos_saldo WHERE usuario_id = $1', [usuarioId]);
    if (saldoRes.rows.length === 0) {
        saldoRes = await dbClient.query('INSERT INTO banco_pontos_saldo (usuario_id) VALUES ($1) RETURNING *', [usuarioId]);
    }
    const saldoAtual = saldoRes.rows[0];
    let novoSaldo = parseFloat(saldoAtual.saldo_atual);

    // 2. Define a Meta Máxima
    const metaMaxima = metasConfiguradas[metasConfiguradas.length - 1];
    if (!metaMaxima) {
        console.log(`[COFRE] Nenhuma meta configurada. Auditoria cancelada.`);
        return { saldo: novoSaldo, usos: saldoAtual.usos_neste_ciclo };
    }

    const pontosMetaMaxima = metaMaxima.pontos_meta;
    console.log(`[COFRE] Meta Máxima (Teto para sobras): ${pontosMetaMaxima} pts`);

    // 3. Varredura
    const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let houveAtualizacao = false;

    console.log(`[COFRE] Analisando histórico de dias...`);

    for (const dia of historicoDias) {
        // Ignora dias futuros ou hoje
        if (dia.data >= hojeStr) continue;
        
        // Ignora dias antes do ciclo
        const dataDia = new Date(dia.data);
        if (dataDia < periodoInicio) continue;

        // *** CORREÇÃO: DATA DE CORTE DA NOVA REGRA ***
        // Ignora qualquer dia antes de 14/12/2025, pois usavam regras antigas
        if (dia.data < '2025-12-12') continue; 
        // ---------------------------------------------

        const pontosFeitos = parseFloat(dia.pontos);

        if (pontosFeitos > pontosMetaMaxima) {
            console.log(`[COFRE] ACHADO! Dia ${dia.data} fez ${pontosFeitos} pts (Acima da meta de ${pontosMetaMaxima}).`);
            
            // Verifica se já foi pago
            const logRes = await dbClient.query(
                `SELECT 1 FROM banco_pontos_log WHERE usuario_id = $1 AND tipo = 'GANHO' AND descricao LIKE $2`,
                [usuarioId, `%${dia.data}%`]
            );

            if (logRes.rowCount === 0) {
                const sobra = pontosFeitos - pontosMetaMaxima;
                console.log(`[COFRE] >>> CREDITANDO: ${sobra} pts no cofre!`);
                
                await dbClient.query(
                    `INSERT INTO banco_pontos_log (usuario_id, tipo, quantidade, descricao) VALUES ($1, 'GANHO', $2, $3)`,
                    [usuarioId, sobra, `Sobra do dia ${dia.data}`]
                );
                novoSaldo += sobra;
                houveAtualizacao = true;
            } else {
                console.log(`[COFRE] Ignorado: Dia ${dia.data} já foi creditado anteriormente.`);
            }
        }
    }

    if (houveAtualizacao) {
        await dbClient.query(
            `UPDATE banco_pontos_saldo SET saldo_atual = $1, ultimo_calculo = NOW() WHERE usuario_id = $2`,
            [novoSaldo, usuarioId]
        );
        console.log(`[COFRE] Saldo atualizado para: ${novoSaldo}`);
    } else {
        console.log(`[COFRE] Nenhuma nova sobra encontrada.`);
    }
    console.log(`[COFRE] --- Fim da Auditoria ---\n`);

    return { saldo: novoSaldo, usos: saldoAtual.usos_neste_ciclo };
}


router.get('/desempenho', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();

        // 1. Busca Usuário
        const userRes = await dbClient.query('SELECT nome, tipos, nivel, avatar_url FROM usuarios WHERE id = $1', [usuarioId]);
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
                `SELECT pontos_meta, valor_comissao, descricao_meta 
                 FROM metas_regras 
                 WHERE id_versao = $1 AND tipo_usuario = $2 AND nivel = $3 
                 ORDER BY pontos_meta ASC`,
                [versaoMetaRes.rows[0].id, tipoUsuario, nivelUsuario]
            );
            metasConfiguradas = regrasRes.rows;
        }

        // 3. Período Fiscal
        const periodo = getPeriodoFiscalAtual(new Date());
        
        // 4. Busca Atividades (Com Quantidade e Variação)
        let queryText = `
            SELECT pr.id::text as id_original, pr.data, pr.pontos_gerados, pr.op_numero, pr.processo, p.nome as produto, pr.quantidade, pr.variacao, 'OP' as tipo_origem
            FROM producoes pr JOIN produtos p ON pr.produto_id = p.id 
            WHERE pr.funcionario = $1 AND pr.data BETWEEN $2 AND $3
        `;
        if (tipoUsuario === 'tiktik') {
            queryText += `
                UNION ALL 
                SELECT ar.id::text as id_original, ar.data_lancamento as data, ar.pontos_gerados, ar.op_numero, 'Arremate' as processo, p.nome as produto, ar.quantidade_arrematada as quantidade, ar.variante as variacao, 'Arremate' as tipo_origem
                FROM arremates ar JOIN produtos p ON ar.produto_id = p.id 
                WHERE ar.usuario_tiktik = $1 AND ar.tipo_lancamento = 'PRODUCAO' AND ar.data_lancamento BETWEEN $2 AND $3
            `;
        }
        
        const atividadesRes = await dbClient.query(queryText, [usuario.nome, periodo.inicio, periodo.fim]);
        const atividades = atividadesRes.rows;

        // 5. Cálculo Diário
        const diasCalculados = {};
        atividades.forEach(atv => {
            const diaStr = new Date(atv.data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            if (!diasCalculados[diaStr]) diasCalculados[diaStr] = 0;
            diasCalculados[diaStr] += parseFloat(atv.pontos_gerados || 0);
        });

        // --- INTEGRAÇÃO DO RESGATE NO CÁLCULO DIÁRIO ---
        // Busca resgates feitos neste período para somar "artificialmente" no dia
        const resgatesRes = await dbClient.query(
            `SELECT data_evento, quantidade FROM banco_pontos_log WHERE usuario_id = $1 AND tipo = 'RESGATE' AND data_evento BETWEEN $2 AND $3`,
            [usuarioId, periodo.inicio, periodo.fim]
        );
        resgatesRes.rows.forEach(r => {
            const diaResgateStr = new Date(r.data_evento).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            if (!diasCalculados[diaResgateStr]) diasCalculados[diaResgateStr] = 0;
            diasCalculados[diaResgateStr] += parseFloat(r.quantidade);
        });
        // ------------------------------------------------

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
            if (diaStr >= '2025-12-14') {
                totalGanhoPeriodo += ganhoDia;
            }
            return { data: diaStr, pontos: pontosFeitos, ganho: ganhoDia };
        });

        // 6. PROCESSA O COFRE AUTOMATICAMENTE
        const dadosCofre = await auditarCofrePontos(dbClient, usuarioId, historicoDias, metasConfiguradas, periodo.inicio);

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
            cofre: dadosCofre, // <<< ENVIA O SALDO DO COFRE
            atividadesRecentes: atividades,
            metasPossiveis: metasConfiguradas
        });

    } catch (error) {
        console.error('[API Desempenho] Erro:', error);
        res.status(500).json({ error: 'Erro interno.' });
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

// GET /api/dashboard/cofre/extrato
router.get('/cofre/extrato', async (req, res) => {
    const { id: usuarioId } = req.usuarioLogado;
    let dbClient;
    try {
        dbClient = await pool.connect();
        
        // Busca os últimos 50 movimentos
        const result = await dbClient.query(`
            SELECT tipo, quantidade, descricao, data_evento 
            FROM banco_pontos_log 
            WHERE usuario_id = $1 
            ORDER BY data_evento DESC 
            LIMIT 50
        `, [usuarioId]);

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[API Cofre Extrato] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar extrato.' });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;