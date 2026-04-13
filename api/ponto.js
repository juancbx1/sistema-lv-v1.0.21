// api/ponto.js
// API de Ponto Dinâmico — exceções manuais e liberação antecipada para intervalos.
// As entradas automáticas (almoço/pausa detectados ao finalizar tarefa) são feitas
// diretamente em api/producoes.js via detectarIntervaloAoFinalizar().

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import jwt from 'jsonwebtoken';
import express from 'express';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
const SECRET_KEY = process.env.JWT_SECRET;

// Middleware de autenticação (padrão do projeto)
router.use(async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('Token não fornecido');
        req.usuarioLogado = jwt.verify(token, SECRET_KEY);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
});

/**
 * POST /api/ponto/excecao
 * Registra uma exceção manual: chegada atrasada ou saída antecipada.
 *
 * Body: {
 *   funcionario_id: number,
 *   tipo_excecao: 'ATRASO' | 'SAIDA_ANTECIPADA',
 *   horario: 'HH:MM',   // para ATRASO = hora real de chegada; para SAIDA_ANTECIPADA = hora atual (enviada pelo frontend)
 *   motivo: string       // texto livre do supervisor (opcional)
 * }
 */
router.post('/excecao', async (req, res) => {
    const { funcionario_id, tipo_excecao, horario, motivo } = req.body;
    const supervisor = req.usuarioLogado?.nome || 'Supervisor';

    if (!funcionario_id || !tipo_excecao || !horario) {
        return res.status(400).json({ error: 'Campos obrigatórios: funcionario_id, tipo_excecao, horario.' });
    }
    if (!['ATRASO', 'SAIDA_ANTECIPADA'].includes(tipo_excecao)) {
        return res.status(400).json({ error: 'tipo_excecao deve ser ATRASO ou SAIDA_ANTECIPADA.' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const dataHojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const campoHorario = tipo_excecao === 'ATRASO' ? 'horario_real_e1' : 'horario_real_s3';

        await dbClient.query(
            `INSERT INTO ponto_diario (funcionario_id, data, ${campoHorario}, tipo_excecao, motivo_excecao, registrado_por)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (funcionario_id, data) DO UPDATE SET
                 ${campoHorario}    = EXCLUDED.${campoHorario},
                 tipo_excecao      = EXCLUDED.tipo_excecao,
                 motivo_excecao    = EXCLUDED.motivo_excecao,
                 registrado_por    = EXCLUDED.registrado_por,
                 updated_at        = NOW()`,
            [funcionario_id, dataHojeSP, horario, tipo_excecao, motivo || null, supervisor]
        );

        // Saída antecipada: força status FORA_DO_HORARIO e cancela sessão ativa
        if (tipo_excecao === 'SAIDA_ANTECIPADA') {
            await dbClient.query(
                `UPDATE usuarios
                 SET status_atual = 'FORA_DO_HORARIO',
                     status_data_modificacao = (NOW() AT TIME ZONE 'America/Sao_Paulo'),
                     id_sessao_trabalho_atual = NULL
                 WHERE id = $1`,
                [funcionario_id]
            );
            await dbClient.query(
                `UPDATE sessoes_trabalho_producao
                 SET status = 'CANCELADA', data_fim = NOW()
                 WHERE funcionario_id = $1 AND status = 'EM_ANDAMENTO'`,
                [funcionario_id]
            );
        }

        await dbClient.query('COMMIT');
        res.status(200).json({ message: `Exceção '${tipo_excecao}' registrada.` });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API POST /ponto/excecao] Erro:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

/**
 * POST /api/ponto/liberar-intervalo
 * Supervisor libera um funcionário para almoço ou pausa antes do horário agendado.
 * Registra o horário real de saída e calcula o retorno dinâmico.
 *
 * Body: { funcionario_id: number, tipo: 'ALMOCO' | 'PAUSA' }
 */
router.post('/liberar-intervalo', async (req, res) => {
    const { funcionario_id, tipo } = req.body;
    const supervisor = req.usuarioLogado?.nome || 'Supervisor';

    if (!funcionario_id || !['ALMOCO', 'PAUSA'].includes(tipo)) {
        return res.status(400).json({ error: 'Campos obrigatórios: funcionario_id, tipo (ALMOCO|PAUSA).' });
    }

    let dbClient;
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        const agora = new Date();
        const horaAtualSP = agora.toLocaleTimeString('en-GB', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
        });
        const dataHojeSP = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        // Busca horários do funcionário para calcular duração do intervalo
        const horRes = await dbClient.query(
            `SELECT horario_saida_1, horario_entrada_2, horario_saida_2, horario_entrada_3 FROM usuarios WHERE id = $1`,
            [funcionario_id]
        );
        const horarios = horRes.rows[0] || {};
        const n = (t) => t ? String(t).substring(0, 5) : null;

        let campoSaida, campoRetorno, horarioRetorno, novoStatus;

        if (tipo === 'ALMOCO') {
            campoSaida   = 'horario_real_s1';
            campoRetorno = 'horario_real_e2';
            // Duração do almoço: E2 - S1 do cadastro. Default: 60 min.
            const s1 = n(horarios.horario_saida_1);
            const e2 = n(horarios.horario_entrada_2);
            let duracaoAlmocoMin = 60;
            if (s1 && e2) {
                const [s1h, s1m] = s1.split(':').map(Number);
                const [e2h, e2m] = e2.split(':').map(Number);
                const delta = (e2h * 60 + e2m) - (s1h * 60 + s1m);
                if (delta > 0) duracaoAlmocoMin = delta;
            }
            const [h, m] = horaAtualSP.split(':').map(Number);
            const total = h * 60 + m + duracaoAlmocoMin;
            horarioRetorno = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
            novoStatus = 'ALMOCO';
        } else { // PAUSA
            campoSaida   = 'horario_real_s2';
            campoRetorno = 'horario_real_e3';
            // Duração da pausa calculada do cadastro: E3 - S2. Default: 15 min.
            let duracaoMin = 15;
            const s2 = n(horarios.horario_saida_2);
            const e3 = n(horarios.horario_entrada_3);
            if (s2 && e3) {
                const [s2h, s2m] = s2.split(':').map(Number);
                const [e3h, e3m] = e3.split(':').map(Number);
                const delta = (e3h * 60 + e3m) - (s2h * 60 + s2m);
                if (delta > 0) duracaoMin = delta;
            }
            const [h, m] = horaAtualSP.split(':').map(Number);
            const total = h * 60 + m + duracaoMin;
            horarioRetorno = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
            novoStatus = 'PAUSA';
        }

        await dbClient.query(
            `INSERT INTO ponto_diario (funcionario_id, data, ${campoSaida}, ${campoRetorno}, registrado_por)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (funcionario_id, data) DO UPDATE SET
                 ${campoSaida}   = EXCLUDED.${campoSaida},
                 ${campoRetorno} = EXCLUDED.${campoRetorno},
                 registrado_por  = EXCLUDED.registrado_por,
                 updated_at      = NOW()`,
            [funcionario_id, dataHojeSP, horaAtualSP, horarioRetorno, supervisor]
        );

        await dbClient.query(
            `UPDATE usuarios
             SET status_atual = $1,
                 status_data_modificacao = (NOW() AT TIME ZONE 'America/Sao_Paulo'),
                 id_sessao_trabalho_atual = NULL
             WHERE id = $2`,
            [novoStatus, funcionario_id]
        );

        await dbClient.query('COMMIT');
        res.status(200).json({
            message: `Funcionário liberado para ${tipo}.`,
            retorno_previsto: horarioRetorno
        });

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error('[API POST /ponto/liberar-intervalo] Erro:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (dbClient) dbClient.release();
    }
});

export default router;
