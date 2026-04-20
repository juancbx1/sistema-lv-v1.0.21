import React, { useMemo } from 'react';

export default function DashTabelaCiclo({ blocos, diasDetalhes }) {
    const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Lookup rápido de dias por data string
    const diasMap = useMemo(() =>
        Object.fromEntries((diasDetalhes || []).map(d => [d.data, d])),
        [diasDetalhes]
    );

    // Blocos válidos (corte 14/12/2025)
    const dataCorte = '2025-12-14';
    const blocosVisiveis = blocos.filter(b => {
        const d = new Date(b.fim);
        const s = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
        return s >= dataCorte;
    });

    // Métricas do header
    const totalGanho = blocosVisiveis.reduce((acc, b) => acc + b.ganho, 0);
    const totalPontos = blocosVisiveis.reduce((acc, b) => acc + b.pontos, 0);
    const diasTrabalhados = (diasDetalhes || []).filter(d => d.pontos > 0).length;
    const melhorBloco = blocosVisiveis.reduce(
        (best, b) => b.ganho > best.ganho ? b : best,
        blocosVisiveis[0] || { ganho: 0, numero: 1 }
    );

    // Formata DD/MM
    const fmtDiaMes = (dataISO) => {
        if (!dataISO) return '--';
        const d = new Date(dataISO);
        return `${d.getUTCDate().toString().padStart(2,'0')}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}`;
    };

    // Gera todos os dias do ciclo como strings YYYY-MM-DD (via UTC para evitar fuso)
    const diasDoCiclo = useMemo(() => {
        if (blocosVisiveis.length === 0) return [];
        const cursor = new Date(blocosVisiveis[0].inicio);
        cursor.setUTCHours(12, 0, 0, 0);
        const fim = new Date(blocosVisiveis[blocosVisiveis.length - 1].fim);
        fim.setUTCHours(12, 0, 0, 0);
        const dias = [];
        while (cursor <= fim) {
            const y = cursor.getUTCFullYear();
            const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
            const d = String(cursor.getUTCDate()).padStart(2, '0');
            dias.push({ dateStr: `${y}-${m}-${d}`, dow: cursor.getUTCDay(), diaNum: cursor.getUTCDate() });
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return dias;
    }, [blocosVisiveis]);

    // Agrupa dias úteis (seg-sex) por semana calendária
    const semanasDoCiclo = useMemo(() => {
        const uteis = diasDoCiclo.filter(d => d.dow !== 0 && d.dow !== 6);
        const semanas = [];
        let atual = [];
        uteis.forEach((d, i) => {
            if (i > 0 && d.dow === 1) { // segunda = nova semana
                semanas.push(atual);
                atual = [];
            }
            atual.push(d);
        });
        if (atual.length > 0) semanas.push(atual);
        return semanas;
    }, [diasDoCiclo]);

    // Cor da bolinha do calendário
    const corBolinha = (dateStr) => {
        if (dateStr > hojeStr) return '#e9ecef'; // futuro
        const dia = diasMap[dateStr];
        if (!dia || dia.pontos === 0) return '#ced4da'; // sem produção
        if (dia.ganho > 0) return 'var(--ds-cor-sucesso)';
        return 'var(--ds-cor-aviso)';
    };

    if (blocosVisiveis.length === 0) {
        return <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Nenhum dado disponível.</div>;
    }

    return (
        <div>
            {/* ── PARTE 1: CHIPS DE MÉTRICAS ── */}
            <div className="ds-extrato-header-metricas">
                <div className="ds-extrato-metrica-chip">
                    <div className="ds-extrato-metrica-valor" style={{ color: 'var(--ds-cor-sucesso)' }}>
                        R$ {totalGanho.toFixed(2)}
                    </div>
                    <div className="ds-extrato-metrica-label">Total ganhos</div>
                </div>
                <div className="ds-extrato-metrica-chip">
                    <div className="ds-extrato-metrica-valor">
                        {Math.round(totalPontos).toLocaleString('pt-BR')}
                    </div>
                    <div className="ds-extrato-metrica-label">Pontos feitos</div>
                </div>
                <div className="ds-extrato-metrica-chip">
                    <div className="ds-extrato-metrica-valor">{diasTrabalhados}</div>
                    <div className="ds-extrato-metrica-label">Dias trabalhados</div>
                </div>
                <div className="ds-extrato-metrica-chip">
                    <div className="ds-extrato-metrica-valor" style={{ fontSize: '1rem' }}>
                        Sem. #{melhorBloco.numero}
                    </div>
                    <div className="ds-extrato-metrica-label">
                        Melhor: R$ {melhorBloco.ganho.toFixed(0)}
                    </div>
                </div>
            </div>

            {/* ── PARTE 2: MINI-CALENDÁRIO ── */}
            <div className="ds-calendario-ciclo">
                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#555', marginBottom: '8px' }}>
                    Calendário do Ciclo
                </div>
                {semanasDoCiclo.map((semana, si) => (
                    <div key={si} className="ds-calendario-semana">
                        {semana.map(({ dateStr, diaNum }) => {
                            const ehHoje = dateStr === hojeStr;
                            const ehFuturo = dateStr > hojeStr;
                            return (
                                <div key={dateStr} className="ds-calendario-dia">
                                    <div
                                        className="ds-calendario-bolinha"
                                        style={{
                                            background: corBolinha(dateStr),
                                            border: ehHoje ? '2px solid var(--ds-cor-primaria)' : '2px solid transparent',
                                            opacity: ehFuturo ? 0.4 : 1,
                                        }}
                                    ></div>
                                    <span className="ds-calendario-num">{diaNum}</span>
                                </div>
                            );
                        })}
                    </div>
                ))}
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.65rem', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ds-cor-sucesso)', display: 'inline-block' }}></span> Meta batida
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ds-cor-aviso)', display: 'inline-block' }}></span> Sem meta
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ced4da', display: 'inline-block' }}></span> Sem prod.
                    </span>
                </div>
            </div>

            {/* ── PARTE 3: CARDS SEMANAIS ── */}
            <div style={{ marginTop: '8px' }}>
                {blocosVisiveis.map((bloco, idx) => {
                    const inicioStr = new Date(bloco.inicio).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                    const fimStr   = new Date(bloco.fim).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

                    const ehFuturo  = hojeStr < inicioStr;
                    const ehAtual   = hojeStr >= inicioStr && hojeStr <= fimStr;

                    // Badge de comparação com semana anterior
                    let badgeTexto = '1ª sem.';
                    let badgeClasse = 'ds-semana-badge-neutral';
                    if (ehFuturo) {
                        badgeTexto = '🔒 Em breve';
                        badgeClasse = 'ds-semana-badge-futuro';
                    } else if (idx > 0) {
                        const anterior = blocosVisiveis[idx - 1].pontos;
                        const atual = bloco.pontos;
                        const pct = Math.round(((atual - anterior) / Math.max(anterior, 1)) * 100);
                        if (atual > anterior) {
                            badgeTexto = `↑ +${pct}%`;
                            badgeClasse = 'ds-semana-badge-up';
                        } else if (atual === anterior) {
                            badgeTexto = '→ igual';
                            badgeClasse = 'ds-semana-badge-neutral';
                        } else {
                            badgeTexto = `↓ ${pct}%`;
                            badgeClasse = 'ds-semana-badge-down';
                        }
                    }

                    const statusCard = ehFuturo  ? 'status-futuro'
                        : ehAtual                ? 'status-atual'
                        : bloco.ganho > 0        ? 'status-ok'
                        : 'status-zero';

                    return (
                        <div key={idx} className={`ds-semana-card ${statusCard}`}>
                            {/* Badge de comparação */}
                            <span className={`ds-semana-badge-comparacao ${badgeClasse}`}>
                                {badgeTexto}
                            </span>

                            {/* Cabeçalho */}
                            <div style={{ fontSize: '0.78rem', color: '#999', marginBottom: '6px', paddingRight: '60px' }}>
                                Semana #{bloco.numero} · {fmtDiaMes(bloco.inicio)} – {fmtDiaMes(bloco.fim)}
                                {ehFuturo && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.68rem', fontWeight: '700', color: '#aaa', textTransform: 'uppercase' }}>
                                        em breve
                                    </span>
                                )}
                                {ehAtual && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.68rem', fontWeight: '700', color: 'var(--ds-cor-primaria)', textTransform: 'uppercase' }}>
                                        em andamento
                                    </span>
                                )}
                            </div>

                            {/* Pontos em destaque */}
                            <div className="ds-semana-pontos-destaque" style={{ color: ehFuturo ? '#ccc' : undefined }}>
                                {ehFuturo ? '—' : `${Math.round(bloco.pontos)}`}
                                {!ehFuturo && <span style={{ fontSize: '1rem', fontWeight: '400', color: '#999' }}> pts</span>}
                            </div>

                            {/* Ganho em reais */}
                            {!ehFuturo && (
                                <div style={{
                                    fontSize: '0.9rem', fontWeight: '600', marginTop: '2px',
                                    color: bloco.ganho > 0 ? 'var(--ds-cor-sucesso)' : '#bbb'
                                }}>
                                    R$ {bloco.ganho.toFixed(2)} ganhos
                                </div>
                            )}
                            {ehFuturo && (
                                <div style={{ fontSize: '0.82rem', color: '#ccc', marginTop: '4px', fontStyle: 'italic' }}>
                                    Produção ainda não iniciada
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
