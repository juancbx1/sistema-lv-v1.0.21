import React, { useMemo } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import PGComparacaoBadge from './PGComparacaoBadge.jsx';
import PGMetaTimeline from './PGMetaTimeline.jsx';

const DIAS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function formatarRefLabel(isoDate) {
    if (!isoDate) return null;
    const [ano, mes, dia] = isoDate.split('-');
    const d = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
    return `${DIAS_PT[d.getUTCDay()]} ${dia}/${mes}`;
}

function PGEquipeCard({ equipeHoje, equipeOntem, comparativoSemana, funcionarios, filtroDia, todasMetas, isHoje, diaAnteriorRef }) {
    if (!equipeHoje) return null;

    const comAtividade = funcionarios.filter(f => f.pontos_hoje > 0);

    const metasEquipe = useMemo(() => {
        let totalBronze = 0, totalPrata = 0, totalOuro = 0;
        for (const f of comAtividade) {
            const tipo  = (Array.isArray(f.tipos) ? f.tipos[0] : 'costureira').toLowerCase();
            const nivel = f.nivel;
            const metas = todasMetas?.[tipo]?.[nivel] || [];
            totalBronze += metas[0] || 0;
            totalPrata  += metas[1] || 0;
            totalOuro   += metas[2] || 0;
        }
        return { bronze: totalBronze, prata: totalPrata, ouro: totalOuro };
    }, [comAtividade, todasMetas]);

    const distribuicao = useMemo(() => {
        let bronze = 0, prata = 0, ouro = 0, correndo = 0;
        for (const f of comAtividade) {
            const tipo  = (Array.isArray(f.tipos) ? f.tipos[0] : 'costureira').toLowerCase();
            const nivel = f.nivel;
            const metas = todasMetas?.[tipo]?.[nivel] || [];
            const pts   = f.pontos_hoje || 0;
            if      (pts >= (metas[2] || Infinity)) ouro++;
            else if (pts >= (metas[1] || Infinity)) prata++;
            else if (pts >= (metas[0] || Infinity)) bronze++;
            else                                    correndo++;
        }
        return { bronze, prata, ouro, correndo };
    }, [comAtividade, todasMetas]);

    const pts          = equipeHoje.pontosTotal || 0;
    const temTimeline  = metasEquipe.bronze > 0 && metasEquipe.prata > 0 && metasEquipe.ouro > 0;
    const totalPecas      = (equipeHoje.pecasCostura || 0) + (equipeHoje.pecasTiktik || 0);
    const totalPecasOntem = (equipeOntem?.pecasCostura || 0) + (equipeOntem?.pecasTiktik || 0);
    const refLabel = filtroDia ? formatarRefLabel(diaAnteriorRef) : null;

    const varSemanal = comparativoSemana?.semanaPassadaPecas > 0
        ? ((comparativoSemana.semanaAtualPecas - comparativoSemana.semanaPassadaPecas) / comparativoSemana.semanaPassadaPecas * 100)
        : null;

    // ── Nível atual da equipe ─────────────────────────────────────────────
    const nivel = temTimeline
        ? pts >= metasEquipe.ouro   ? 'ouro'
        : pts >= metasEquipe.prata  ? 'prata'
        : pts >= metasEquipe.bronze ? 'bronze'
        : 'abaixo'
        : null;

    // ── Config visual por nível ───────────────────────────────────────────
    const PRESSAO = {
        abaixo: {
            cor: '#ef4444', bg: '#fef2f2', bordaCor: '#fca5a5',
            badgeText:    isHoje ? 'ABAIXO DO BRONZE'     : 'FICOU ABAIXO DO BRONZE',
            badgeIcon:    'fa-triangle-exclamation',
            faltamLabel:  isHoje ? 'FALTAM'               : 'FALTOU',
            faltamQtd:    metasEquipe.bronze - pts,
            faltamSufixo: `para o 🥉 Bronze`,
            gapOuro:      metasEquipe.ouro - pts,
            motivacao: isHoje
                ? 'A equipe precisa acelerar agora.'
                : 'Esse dia ficou abaixo do bronze. Vale analisar o que aconteceu.',
        },
        bronze: {
            cor: '#b45309', bg: '#fffbeb', bordaCor: '#fcd34d',
            badgeText:    'BRONZE ATINGIDO',
            badgeIcon:    'fa-medal',
            faltamLabel:  isHoje ? 'FALTAM'               : 'FALTOU',
            faltamQtd:    metasEquipe.ouro - pts,
            faltamSufixo: `para o 🥇 OURO`,
            gapOuro:      null,
            motivacao: isHoje
                ? 'Bom começo — mas o objetivo é o OURO!'
                : 'Esse dia atingiu o bronze. A meta é sempre o ouro!',
        },
        prata: {
            cor: '#374151', bg: '#f9fafb', bordaCor: '#9ca3af',
            badgeText:    'PRATA ATINGIDA',
            badgeIcon:    'fa-medal',
            faltamLabel:  isHoje ? 'FALTAM'               : 'FALTOU',
            faltamQtd:    metasEquipe.ouro - pts,
            faltamSufixo: `para o 🥇 OURO`,
            gapOuro:      null,
            motivacao: isHoje
                ? 'Tão perto! Empurra a equipe!'
                : 'Esse dia atingiu a prata. Faltou pouco para o ouro!',
        },
        ouro: {
            cor: '#d97706', bg: '#fffbeb', bordaCor: '#f59e0b',
            badgeText:    'META OURO ATINGIDA!',
            badgeIcon:    'fa-trophy',
            faltamLabel:  null,
            faltamQtd:    null,
            faltamSufixo: null,
            gapOuro:      null,
            motivacao: isHoje
                ? 'Excelente! Continue exigindo o máximo da equipe!'
                : 'Excelente! A meta ouro foi atingida nesse dia!',
        },
    };

    const cfg = nivel ? PRESSAO[nivel] : null;

    function abrirInfoMeta() {
        if (comAtividade.length === 0) {
            mostrarMensagem(
                '📊 <strong>Meta da equipe</strong><br><br>' +
                'Ainda não há produção registrada. As metas aparecerão quando a equipe começar a produzir.',
                'info'
            );
            return;
        }
        const exemplos = comAtividade.slice(0, 3).map(f => {
            const tipo  = (Array.isArray(f.tipos) ? f.tipos[0] : 'costureira').toLowerCase();
            const metas = todasMetas?.[tipo]?.[f.nivel] || [];
            return `• ${f.nome.split(' ')[0]}: 🥇 ${(metas[2] || '–').toLocaleString?.('pt-BR') ?? metas[2] ?? '–'} pts`;
        }).join('<br>');
        mostrarMensagem(
            '📊 <strong>Como é calculada a meta da equipe?</strong><br><br>' +
            'É a <strong>soma das metas individuais</strong> de cada funcionário que produziu hoje.<br><br>' +
            `Exemplo desta equipe (ouro):<br>${exemplos}<br>` +
            `<strong>Total ouro da equipe: ${metasEquipe.ouro.toLocaleString('pt-BR')} pts</strong><br><br>` +
            '⚠️ A meta se ajusta conforme a equipe presencial muda — quem produziu entra na conta.',
            'info'
        );
    }

    return (
        <div className="gs-card pg-equipe-card">

            {/* ── Cabeçalho ── */}
            <div className="pg-equipe-topo">
                <span className="pg-equipe-titulo">
                    <i className="fas fa-users"></i> Equipe {isHoje ? 'hoje' : 'nesse dia'}
                </span>
                <span className="pg-equipe-ativos">{equipeHoje.funcionariosAtivos || 0} ativas</span>
            </div>

            {/* ── Stats rápidos ── */}
            <div className="pg-equipe-corpo">
                <div className="pg-equipe-stat">
                    <span className="pg-equipe-stat-valor">{pts.toLocaleString('pt-BR')}</span>
                    <span className="pg-equipe-stat-label">pontos</span>
                    {filtroDia && <PGComparacaoBadge valorHoje={pts} valorOntem={equipeOntem?.pontosTotal} visivel={true} />}
                </div>
                <div className="pg-equipe-stat">
                    <span className="pg-equipe-stat-valor">{totalPecas.toLocaleString('pt-BR')}</span>
                    <span className="pg-equipe-stat-label">peças</span>
                    {filtroDia && <PGComparacaoBadge valorHoje={totalPecas} valorOntem={totalPecasOntem} visivel={true} />}
                </div>
            </div>

            {/* Issue 3 — referência do dia comparado nas setas */}
            {filtroDia && refLabel && (equipeOntem?.pontosTotal || totalPecasOntem) ? (
                <p className="pg-equipe-stat-ref">
                    <i className="fas fa-clock-rotate-left"></i>
                    {' '}↑↓ comparado com <strong>{refLabel}</strong>
                </p>
            ) : null}

            {/* ── Bloco de pressão ── */}
            {!filtroDia ? (
                // Issue 4 — filtro de período ativo: substituir pelo aviso
                <div className="pg-equipe-pressao pg-equipe-pressao--info">
                    <i className="fas fa-circle-info pg-equipe-pressao-info-icone"></i>
                    <p className="pg-equipe-pressao-info-texto">
                        O progresso de metas considera o <strong>dia completo</strong>.
                    </p>
                    <p className="pg-equipe-pressao-info-dica">
                        Selecione <strong>Dia inteiro</strong> para acompanhar.
                    </p>
                </div>
            ) : cfg ? (
                // Bloco de pressão normal
                <div
                    className={`pg-equipe-pressao pg-equipe-pressao--${nivel}`}
                    style={{ background: cfg.bg, borderColor: cfg.bordaCor }}
                >
                    <span className="pg-equipe-pressao-badge" style={{ color: cfg.cor }}>
                        <i className={`fas ${cfg.badgeIcon}`}></i>
                        {cfg.badgeText}
                    </span>

                    {nivel !== 'ouro' ? (
                        <div className="pg-equipe-pressao-destaque">
                            <div className="pg-equipe-pressao-faltam-linha">
                                <span className="pg-equipe-pressao-faltam-label">{cfg.faltamLabel}</span>
                            </div>
                            <span className="pg-equipe-pressao-num" style={{ color: cfg.cor }}>
                                {cfg.faltamQtd.toFixed(0)}
                            </span>
                            <span className="pg-equipe-pressao-sufixo" style={{ color: cfg.cor }}>
                                pts {cfg.faltamSufixo}
                            </span>
                            {cfg.gapOuro != null && metasEquipe.ouro > 0 && (
                                <span className="pg-equipe-pressao-gap-ouro">
                                    {(metasEquipe.ouro - pts).toFixed(0)} pts para o 🥇 Ouro
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="pg-equipe-pressao-destaque">
                            <div className="pg-equipe-pressao-faltam-linha">
                                <span className="pg-equipe-pressao-faltam-label" style={{ color: cfg.cor }}>EXCEDENTE</span>
                            </div>
                            <span className="pg-equipe-pressao-num pg-equipe-pressao-num--pos" style={{ color: cfg.cor }}>
                                {(pts - metasEquipe.ouro).toFixed(0)}
                            </span>
                            <span className="pg-equipe-pressao-sufixo" style={{ color: cfg.cor }}>
                                pts acima do ouro
                            </span>
                        </div>
                    )}

                    <p className="pg-equipe-pressao-motivacao">{cfg.motivacao}</p>
                </div>
            ) : null}

            {/* ── Meta timeline com botão info ── */}
            {temTimeline && filtroDia && (
                <div className="pg-equipe-timeline-wrap">
                    <div className="pg-equipe-timeline-header">
                        <span className="pg-equipe-timeline-titulo">Progresso da equipe</span>
                        <button className="pg-equipe-meta-info-btn" onClick={abrirInfoMeta} title="Como é calculada a meta?">
                            <i className="fas fa-circle-info"></i>
                        </button>
                    </div>
                    <PGMetaTimeline
                        pontosAtuais={pts}
                        metaBronze={metasEquipe.bronze}
                        metaPrata={metasEquipe.prata}
                        metaOuro={metasEquipe.ouro}
                    />
                    {comAtividade.length > 0 && (
                        <div className="pg-equipe-distribuicao">
                            {distribuicao.ouro    > 0 && <span className="pg-dist-chip pg-dist-chip--ouro">🥇 {distribuicao.ouro} ouro</span>}
                            {distribuicao.prata   > 0 && <span className="pg-dist-chip pg-dist-chip--prata">🥈 {distribuicao.prata} prata</span>}
                            {distribuicao.bronze  > 0 && <span className="pg-dist-chip pg-dist-chip--bronze">🥉 {distribuicao.bronze} bronze</span>}
                            {distribuicao.correndo > 0 && <span className="pg-dist-chip pg-dist-chip--correndo">⚡ {distribuicao.correndo} correndo</span>}
                        </div>
                    )}
                </div>
            )}

            {/* ── Comparativo semanal ── */}
            {filtroDia && comparativoSemana && (
                <div className="pg-equipe-semanal">
                    <span>Esta semana: {(comparativoSemana.semanaAtualPecas || 0).toLocaleString('pt-BR')} pçs</span>
                    {varSemanal !== null && (
                        <span className={`pg-semanal-var ${varSemanal >= 0 ? 'pg-semanal-var--pos' : 'pg-semanal-var--neg'}`}>
                            {varSemanal >= 0 ? '↑' : '↓'} {Math.abs(varSemanal).toFixed(0)}% vs sem. passada
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default PGEquipeCard;
