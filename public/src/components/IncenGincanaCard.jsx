// public/src/components/IncenGincanaCard.jsx
import React from 'react';

function formatarDataHora(iso, opcoes = {}) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        ...opcoes,
    });
}

function formatarContagem(segundos) {
    if (!segundos || segundos <= 0) return '–';
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
}

function fasePretty(fase) {
    switch (fase) {
        case 'ao_vivo':        return { label: 'AO VIVO', cls: 'ao-vivo', dot: true };
        case 'encerrada_semana':
        case 'proxima':        return { label: 'PRÓXIMA', cls: 'proxima', dot: false };
        case 'encerrada':      return { label: 'ENCERRADA', cls: 'encerrada', dot: false };
        case 'arquivada':      return { label: 'ENCERRADA', cls: 'encerrada', dot: false };
        case 'rascunho':       return { label: 'RASCUNHO', cls: 'rascunho', dot: false };
        case 'cancelada':      return { label: 'CANCELADA', cls: 'cancelada', dot: false };
        default:               return { label: fase, cls: 'rascunho', dot: false };
    }
}

function participantesPretty(p) {
    if (p === 'costureiras') return 'Costureiras';
    if (p === 'tiktiks') return 'Tiktiks';
    return 'Costureiras e Tiktiks';
}

function escopoPretty(e, produtoNome) {
    if (e === 'apenas_processos_op') return 'Só processos OP';
    if (e === 'apenas_arremates') return 'Só arremates';
    if (e === 'produto_especifico') return produtoNome ? `Unidades: ${produtoNome}` : 'Produto específico';
    return 'Todos os pontos';
}

export default function IncenGincanaCard({ gincana, onEditar, onPublicar, onCancelar, onDeletar, onVerRanking }) {
    // fase é usada apenas para visual (badge, borda, countdown)
    const fase = gincana.fase || gincana.status;
    // status do banco determina quais ações aparecem
    const status = gincana.status;

    const faseCSS = fase === 'ao_vivo' ? 'fase-ao-vivo'
                  : fase === 'proxima' ? 'fase-proxima'
                  : fase === 'encerrada' || fase === 'encerrada_semana' || fase === 'arquivada' ? 'fase-encerrada'
                  : fase === 'cancelada' ? 'fase-cancelada'
                  : 'fase-rascunho';

    // Para rascunho, o badge sempre mostra RASCUNHO independente do datetime
    const faseParaBadge = status === 'rascunho' ? 'rascunho'
                        : status === 'cancelada' ? 'cancelada'
                        : fase;
    const { label: badgeLabel, cls: badgeCls, dot } = fasePretty(faseParaBadge);

    const premiacoes = gincana.premiacoes || [];

    return (
        <div className={`incen-gincana-card ${status === 'rascunho' ? 'fase-rascunho' : faseCSS}`}>
            <div className="card-borda-charme"></div>

            <div className="incen-gincana-card-body">
                <div className="incen-gincana-emoji">{gincana.banner_emoji || '🏆'}</div>

                <div className="incen-gincana-info">
                    <div className="incen-gincana-cabecalho">
                        <h3 className="incen-gincana-nome">{gincana.nome}</h3>
                        <span className={`incen-gincana-badge ${badgeCls}`}>
                            {dot && <span className="badge-dot"></span>}
                            {badgeLabel}
                        </span>
                        {gincana.tipo_recorrencia === 'semanal' && (
                            <span className="incen-gincana-badge rascunho">SEMANAL</span>
                        )}
                        {gincana.tipo_premiacao === 'corrida' && (
                            <span className="incen-gincana-badge incen-badge-corrida">🏁 CORRIDA</span>
                        )}
                        {gincana.modalidade === 'equipe' && (
                            <span className="incen-gincana-badge incen-badge-equipe">👥 EQUIPE</span>
                        )}
                    </div>

                    <div className="incen-gincana-meta">
                        <span>{participantesPretty(gincana.participantes)}</span>
                        <span>{escopoPretty(gincana.escopo_atividade, gincana.produto_nome)}</span>
                    </div>

                    <div className="incen-gincana-periodo">
                        {gincana.tipo_recorrencia === 'semanal' ? (
                            <>
                                Campanha: {formatarDataHora(gincana.datetime_inicio)} →&nbsp;
                                {formatarDataHora(gincana.datetime_fim)}
                                {gincana.hora_inicio_semana && (
                                    <> · Seg–Sex {gincana.hora_inicio_semana}–{gincana.hora_fim_semana}</>
                                )}
                            </>
                        ) : (
                            <>
                                {formatarDataHora(gincana.datetime_inicio)} →&nbsp;
                                {formatarDataHora(gincana.datetime_fim)}
                            </>
                        )}
                    </div>

                    {status === 'publicada' && fase === 'proxima' && gincana.segundos_para_inicio > 0 && (
                        <div className="incen-gincana-countdown">
                            <i className="fas fa-clock"></i>
                            Começa em {formatarContagem(gincana.segundos_para_inicio)}
                        </div>
                    )}
                    {status === 'publicada' && fase === 'ao_vivo' && gincana.segundos_para_fim > 0 && (
                        <div className="incen-gincana-countdown">
                            <i className="fas fa-hourglass-half"></i>
                            Encerra em {formatarContagem(gincana.segundos_para_fim)}
                        </div>
                    )}
                    {gincana.semana_label && (
                        <div className="incen-gincana-countdown">
                            <i className="fas fa-calendar-week"></i>
                            {gincana.semana_label}
                        </div>
                    )}

                    {premiacoes.length > 0 && (
                        <div className="incen-gincana-premiacoes-resumo">
                            {premiacoes.map((p, i) => (
                                <span key={i} className="incen-premi-chip">
                                    {p.emoji_icone} {p.nivel_label} — {p.meta_valor ?? p.meta_pontos}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="incen-gincana-acoes">
                {/* Rascunho: editar, publicar, deletar — independente do datetime */}
                {status === 'rascunho' && (
                    <>
                        <button className="gs-btn gs-btn-secundario" onClick={() => onEditar(gincana)}>
                            <i className="fas fa-pen"></i> Editar
                        </button>
                        <button className="gs-btn gs-btn-primario" onClick={() => onPublicar(gincana)}>
                            <i className="fas fa-play"></i> Publicar
                        </button>
                        <button
                            className="gs-btn gs-btn-secundario"
                            style={{ color: '#ef4444' }}
                            onClick={() => onDeletar(gincana)}
                        >
                            <i className="fas fa-trash"></i>
                        </button>
                    </>
                )}

                {/* Publicada: ranking sempre visível + cancelar só enquanto não encerrou */}
                {status === 'publicada' && (
                    <>
                        <button className="gs-btn gs-btn-secundario" onClick={() => onVerRanking(gincana)}>
                            <i className="fas fa-chart-bar"></i> Ranking
                        </button>
                        {(fase === 'ao_vivo' || fase === 'proxima' || fase === 'encerrada_semana') && (
                            <button
                                className="gs-btn gs-btn-secundario"
                                style={{ color: '#ef4444' }}
                                onClick={() => onCancelar(gincana)}
                            >
                                <i className="fas fa-ban"></i> Cancelar
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
