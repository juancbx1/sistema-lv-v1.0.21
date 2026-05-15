// public/src/utils/PontoHelpers.js
//
// Utilitários compartilhados de ponto/tempo.
// Extraídos de OPStatusCard.jsx para uso compartilhado com ArremateStatusCard.jsx.
// Regra: funções puras, sem React, sem efeitos colaterais.

/**
 * Formata millisegundos em 'HH:MM:SS'.
 * @param {number} ms
 * @returns {string}
 */
export const formatarTempo = (ms) => {
    const total = Math.max(0, ms);
    const h = Math.floor(total / 3600000);
    const m = Math.floor((total % 3600000) / 60000);
    const s = Math.floor((total % 60000) / 1000);
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
};

/**
 * Formata 'HH:MM:SS' ou 'HH:MM' para exibição curta (ex: '13:10').
 * @param {string|null} t
 * @returns {string}
 */
export const formatarHora = (t) => t ? String(t).substring(0, 5) : '--:--';

/**
 * Calcula o tempo efetivo de trabalho descontando intervalos (almoço/pausa) já registrados.
 *
 * @param {string} dataInicio - ISO string com timezone (ex: "2026-04-13T16:00:00+00:00")
 * @param {object|null} pontoHoje - ponto_diario de hoje com horarios_reais
 * @returns {{ ms: number, pausado: boolean, motivo: 'ALMOCO'|'PAUSA'|null }}
 *   ms      = milissegundos de trabalho efetivo (intervalos descontados)
 *   pausado = true quando o relógio deve estar congelado agora
 *   motivo  = razão do congelamento automático (null se não pausado automaticamente)
 */
export function calcularTempoEfetivo(dataInicio, pontoHoje) {
    const agora = new Date();
    const inicioDate = new Date(dataInicio); // ISO string → Date correto em UTC
    const n = (t) => t ? String(t).substring(0, 5) : null; // normaliza para 'HH:MM'

    // Converte 'HH:MM' (horário SP) para Date absoluto de hoje.
    // Brasil é UTC-3 sem horário de verão desde 2019 — offset fixo é seguro.
    const toAbsolute = (hhmm) => {
        if (!hhmm) return null;
        const hojeSP = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        return new Date(`${hojeSP}T${hhmm}:00-03:00`);
    };

    let descontarMs = 0;

    // ── Almoço (horario_real_s1 → horario_real_e2) ───────────────────────────
    const s1 = toAbsolute(n(pontoHoje?.horario_real_s1));
    const e2 = toAbsolute(n(pontoHoje?.horario_real_e2));

    if (s1 && s1 > inicioDate) {
        if (e2 && agora >= e2) {
            // Almoço já terminou — descontar duração completa
            descontarMs += e2.getTime() - s1.getTime();
        } else if (agora >= s1) {
            // Ainda em almoço — congelar no momento em que o almoço começou
            return {
                ms: Math.max(0, s1.getTime() - inicioDate.getTime()),
                pausado: true,
                motivo: 'ALMOCO',
            };
        }
    }

    // ── Pausa (horario_real_s2 → horario_real_e3) ────────────────────────────
    const s2 = toAbsolute(n(pontoHoje?.horario_real_s2));
    const e3 = toAbsolute(n(pontoHoje?.horario_real_e3));

    if (s2 && s2 > inicioDate) {
        if (e3 && agora >= e3) {
            // Pausa já terminou — descontar
            descontarMs += e3.getTime() - s2.getTime();
        } else if (agora >= s2) {
            // Ainda em pausa — congelar
            return {
                ms: Math.max(0, s2.getTime() - inicioDate.getTime() - descontarMs),
                pausado: true,
                motivo: 'PAUSA',
            };
        }
    }

    return {
        ms: Math.max(0, agora.getTime() - inicioDate.getTime() - descontarMs),
        pausado: false,
        motivo: null,
    };
}
