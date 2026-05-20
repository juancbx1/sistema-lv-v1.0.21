// public/src/components/DashGincanaCard.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchAPI } from '/js/utils/api-utils';

function useContagem(gincanas, onZerou) {
    const [contagem, setContagem] = useState({});
    const onZerouRef = useRef(onZerou);
    onZerouRef.current = onZerou;

    useEffect(() => {
        const inicial = {};
        for (const g of gincanas) {
            if (g.fase === 'proxima' && g.segundos_para_inicio > 0) {
                inicial[g.id] = g.segundos_para_inicio;
            }
        }
        setContagem(inicial);
    }, [gincanas]);

    useEffect(() => {
        const timer = setInterval(() => {
            setContagem(prev => {
                const next = { ...prev };
                let algumZerou = false;
                for (const id in next) {
                    if (next[id] > 0) {
                        next[id] -= 1;
                        if (next[id] === 0) algumZerou = true;
                    }
                }
                if (algumZerou) setTimeout(() => onZerouRef.current?.(), 300);
                return next;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return contagem;
}

function formatarHHMM(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatarDataCurta(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
    });
}

function formatarContagem(seg) {
    if (!seg || seg <= 0) return { h: '00', m: '00', s: '00' };
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    const pad = n => String(n).padStart(2, '0');
    return { h: pad(h), m: pad(m), s: pad(s) };
}

function formatarTempoRestante(seg) {
    if (!seg || seg <= 0) return '';
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
}

function BarraProgresso({ valor, meta, ganhou }) {
    const pct = meta > 0 ? Math.min(100, Math.round((valor / meta) * 100)) : 0;
    return (
        <div className="ds-gincana-barra-wrap">
            <div
                className={`ds-gincana-barra ${ganhou ? 'ds-gincana-barra--ganhou' : ''}`}
                style={{ width: `${pct}%` }}
            ></div>
        </div>
    );
}

function InfoPagamento({ premioRegistrado, premioPago }) {
    if (!premioRegistrado) return null;
    if (premioPago) {
        return (
            <p className="ds-gincana-premio-pago">
                <i className="fas fa-check-circle"></i> Prêmio pago pelo supervisor.
            </p>
        );
    }
    return (
        <p className="ds-gincana-premio-pendente">
            <i className="fas fa-clock"></i> Prêmio registrado — será pago na próxima sexta.
        </p>
    );
}

function GincanaCardItem({ g, contagemSecs }) {
    const {
        fase, tipo_premiacao, modalidade, escopo_atividade, produto_nome,
        meu_valor, valor_equipe, minha_posicao, total_participantes,
        meu_nivel_ganho, proxima_meta, premiacoes,
        sou_vencedor, premio_registrado, premio_pago,
        encerrada_com_ganhador, vencedor_id,
    } = g;

    const ehCorrida = tipo_premiacao === 'corrida';
    const ehEquipe  = modalidade === 'equipe';
    const ehUnidade = escopo_atividade === 'produto_especifico';
    const unidadeLabel = ehUnidade ? 'unidades' : 'pontos';

    // Valor que representa o progresso na barra
    const valorProgresso = ehEquipe ? (valor_equipe || 0) : (meu_valor || 0);

    // Meta para a barra de progresso
    const metaAlvo = proxima_meta
        ? parseFloat(proxima_meta.meta_valor)
        : premiacoes?.length
            ? Math.max(...premiacoes.map(p => parseFloat(p.meta_valor || p.meta_pontos || 0)))
            : 0;

    const pct = metaAlvo > 0 ? Math.min(100, Math.round((valorProgresso / metaAlvo) * 100)) : 0;
    const ganhou = !!meu_nivel_ganho;
    const melhorNivelGanho = premiacoes?.find(p => p.nivel_label === meu_nivel_ganho);

    // ── PROXIMA ──
    if (fase === 'proxima') {
        const secs = contagemSecs ?? g.segundos_para_inicio ?? 0;
        const { h, m, s } = formatarContagem(secs);
        const inicio = g.tipo_recorrencia === 'semanal'
            ? `Próxima Segunda às ${g.hora_inicio_semana || '07:00'}`
            : `${formatarDataCurta(g.datetime_inicio)} às ${formatarHHMM(g.datetime_inicio)}`;

        return (
            <div className="ds-gincana-card ds-gincana-card--proxima">
                <div className="ds-gincana-header">
                    <span className="ds-gincana-emoji">{g.banner_emoji}</span>
                    <div className="ds-gincana-titulo-wrap">
                        <h3 className="ds-gincana-titulo">{g.nome}</h3>
                        <span className="ds-gincana-badge ds-gincana-badge--proxima">VEM AÍ</span>
                    </div>
                </div>
                <p className="ds-gincana-periodo">{inicio}</p>
                <div className="ds-gincana-countdown">
                    <p className="ds-gincana-countdown-label">
                        <i className="fas fa-clock"></i> Começa em:
                    </p>
                    <div className="ds-gincana-countdown-display">
                        {[{ v: h, u: 'horas' }, { v: m, u: 'min' }, { v: s, u: 'seg' }].map((b, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <span className="ds-gincana-countdown-sep">:</span>}
                                <div className="ds-gincana-countdown-bloco">
                                    <span className="ds-gincana-countdown-num">{b.v}</span>
                                    <span className="ds-gincana-countdown-unidade">{b.u}</span>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
                {g.descricao && <p className="ds-gincana-descricao">{g.descricao}</p>}
                {ehCorrida && (
                    <p className="ds-gincana-tipo-badge ds-gincana-tipo-badge--corrida">
                        <i className="fas fa-flag-checkered"></i> Corrida — ganha o primeiro!
                    </p>
                )}
                {ehEquipe && (
                    <p className="ds-gincana-tipo-badge ds-gincana-tipo-badge--equipe">
                        <i className="fas fa-users"></i> Meta de equipe
                    </p>
                )}
                {premiacoes?.length > 0 && (
                    <div className="ds-gincana-metas-preview">
                        {premiacoes.map((p, i) => (
                            <span key={i} className="ds-gincana-meta-chip">
                                {p.emoji_icone} {p.nivel_label}: {p.meta_valor} {unidadeLabel}
                            </span>
                        ))}
                    </div>
                )}
                <p className="ds-gincana-aviso-supervisor">
                    <i className="fas fa-coins"></i> Prêmio pago toda sexta pelo supervisor
                </p>
            </div>
        );
    }

    // ── AO VIVO ──
    if (fase === 'ao_vivo' || fase === 'encerrada_semana') {
        const tempoRestante = formatarTempoRestante(g.segundos_para_fim);
        const fimLabel = g.tipo_recorrencia === 'semanal'
            ? `Sexta às ${g.hora_fim_semana || '18:00'}`
            : `${formatarDataCurta(g.datetime_fim)} às ${formatarHHMM(g.datetime_fim)}`;

        // Corrida já encerrada com ganhador
        if (ehCorrida && encerrada_com_ganhador) {
            if (sou_vencedor) {
                return (
                    <div className="ds-gincana-card ds-gincana-card--ao-vivo ds-gincana-card--ganhou">
                        <div className="ds-gincana-header">
                            <span className="ds-gincana-emoji">{g.banner_emoji}</span>
                            <div className="ds-gincana-titulo-wrap">
                                <h3 className="ds-gincana-titulo">{g.nome}</h3>
                                <span className="ds-gincana-badge ds-gincana-badge--ao-vivo"><span className="ds-gincana-dot"></span>AO VIVO</span>
                            </div>
                        </div>
                        <div className="ds-gincana-corrida-vencedor">
                            <p className="ds-gincana-corrida-parabens">🏆 Parabéns! Você foi a primeira a completar!</p>
                            {melhorNivelGanho && (
                                <p className="ds-gincana-corrida-premio">
                                    {melhorNivelGanho.emoji_icone} {melhorNivelGanho.descricao_premio}
                                </p>
                            )}
                            <InfoPagamento premioRegistrado={premio_registrado} premioPago={premio_pago} />
                        </div>
                    </div>
                );
            }
            return (
                <div className="ds-gincana-card ds-gincana-card--ao-vivo">
                    <div className="ds-gincana-header">
                        <span className="ds-gincana-emoji">{g.banner_emoji}</span>
                        <div className="ds-gincana-titulo-wrap">
                            <h3 className="ds-gincana-titulo">{g.nome}</h3>
                            <span className="ds-gincana-badge ds-gincana-badge--encerrada">✓ ENCERRADA</span>
                        </div>
                    </div>
                    <p className="ds-gincana-corrida-sem-ganho">
                        Alguém chegou primeiro desta vez. Tente na próxima! 💪
                    </p>
                </div>
            );
        }

        return (
            <div className={`ds-gincana-card ds-gincana-card--ao-vivo ${ganhou ? 'ds-gincana-card--ganhou' : ''}`}>
                <div className="ds-gincana-header">
                    <span className="ds-gincana-emoji">{g.banner_emoji}</span>
                    <div className="ds-gincana-titulo-wrap">
                        <h3 className="ds-gincana-titulo">{g.nome}</h3>
                        <span className="ds-gincana-badge ds-gincana-badge--ao-vivo">
                            <span className="ds-gincana-dot"></span>
                            AO VIVO
                        </span>
                    </div>
                </div>

                {tempoRestante && (
                    <p className="ds-gincana-tempo-restante">
                        <i className="fas fa-hourglass-half"></i> Termina em: <strong>{tempoRestante}</strong>
                        {' '}({fimLabel})
                    </p>
                )}

                {g.descricao && <p className="ds-gincana-descricao">{g.descricao}</p>}

                {ehCorrida && (
                    <p className="ds-gincana-tipo-badge ds-gincana-tipo-badge--corrida">
                        <i className="fas fa-flag-checkered"></i> Corrida — ganha o primeiro!
                    </p>
                )}

                <div className="ds-gincana-progresso-wrap">
                    <div className="ds-gincana-progresso-topo">
                        {ehEquipe ? (
                            <>
                                <span className="ds-gincana-pontos-valor">
                                    Equipe: {(valor_equipe || 0).toFixed(0)} {unidadeLabel}
                                </span>
                                <span className="ds-gincana-minha-contrib">
                                    Sua contribuição: {(meu_valor || 0).toFixed(0)}
                                </span>
                            </>
                        ) : (
                            <span className="ds-gincana-pontos-valor">
                                {(meu_valor || 0).toFixed(0)} {unidadeLabel}
                            </span>
                        )}
                        {metaAlvo > 0 && (
                            <span className="ds-gincana-meta-label">Meta: {metaAlvo} {unidadeLabel}</span>
                        )}
                    </div>
                    <BarraProgresso valor={valorProgresso} meta={metaAlvo} ganhou={ganhou} />
                    <div className="ds-gincana-progresso-base">
                        <span className="ds-gincana-pct">{pct}%</span>
                        {ganhou ? (
                            <span className="ds-gincana-status-ganhou">✅ {ehEquipe ? 'Equipe bateu a meta!' : 'Você bateu a meta!'}</span>
                        ) : proxima_meta ? (
                            <span className="ds-gincana-status-falta">
                                Faltam {Math.max(0, parseFloat(proxima_meta.meta_valor) - valorProgresso).toFixed(0)} {unidadeLabel}
                            </span>
                        ) : null}
                    </div>
                </div>

                {ganhou && melhorNivelGanho && (
                    <div className="ds-gincana-premio-ganho">
                        <span>{melhorNivelGanho.emoji_icone} Você vai receber: {melhorNivelGanho.descricao_premio}</span>
                        <InfoPagamento premioRegistrado={premio_registrado} premioPago={premio_pago} />
                    </div>
                )}

                {!ehEquipe && minha_posicao && total_participantes > 0 && (
                    <p className="ds-gincana-posicao">
                        <i className="fas fa-map-marker-alt"></i>
                        Você está em <strong>{minha_posicao}°</strong> de {total_participantes} participantes
                    </p>
                )}

                {!ganhou && (
                    <p className="ds-gincana-aviso-supervisor">
                        <i className="fas fa-coins"></i> Prêmio pago toda sexta pelo supervisor
                    </p>
                )}
            </div>
        );
    }

    // ── ENCERRADA ──
    if (fase === 'encerrada') {
        // Corrida sem ganhador
        if (ehCorrida && !encerrada_com_ganhador) {
            return (
                <div className="ds-gincana-card ds-gincana-card--encerrada">
                    <div className="ds-gincana-header">
                        <span className="ds-gincana-emoji">{g.banner_emoji}</span>
                        <div className="ds-gincana-titulo-wrap">
                            <h3 className="ds-gincana-titulo">{g.nome}</h3>
                            <span className="ds-gincana-badge ds-gincana-badge--encerrada">✓ ENCERRADA</span>
                        </div>
                    </div>
                    <p className="ds-gincana-nao-ganhou-msg">
                        Ninguém recebeu a premiação dessa vez! Vamos focar mais na próxima gincana! 💪
                    </p>
                </div>
            );
        }

        // Corrida com vencedor
        if (ehCorrida && encerrada_com_ganhador) {
            return (
                <div className={`ds-gincana-card ds-gincana-card--encerrada ${sou_vencedor ? 'ds-gincana-card--ganhou' : ''}`}>
                    <div className="ds-gincana-header">
                        <span className="ds-gincana-emoji">{g.banner_emoji}</span>
                        <div className="ds-gincana-titulo-wrap">
                            <h3 className="ds-gincana-titulo">{g.nome}</h3>
                            <span className="ds-gincana-badge ds-gincana-badge--encerrada">✓ ENCERRADA</span>
                        </div>
                    </div>
                    {sou_vencedor ? (
                        <div className="ds-gincana-corrida-vencedor">
                            <p className="ds-gincana-corrida-parabens">🏆 Você venceu a corrida!</p>
                            {melhorNivelGanho && <p className="ds-gincana-corrida-premio">{melhorNivelGanho.emoji_icone} {melhorNivelGanho.descricao_premio}</p>}
                            <InfoPagamento premioRegistrado={premio_registrado} premioPago={premio_pago} />
                        </div>
                    ) : (
                        <p className="ds-gincana-nao-ganhou-msg">
                            Alguém chegou primeiro desta vez. Na próxima! 💪
                        </p>
                    )}
                </div>
            );
        }

        // Meta encerrada
        const ganhouLabel = ganhou
            ? `✅ ${meu_nivel_ganho} — Meta batida!`
            : `${pct}% — Meta não atingida`;

        return (
            <div className={`ds-gincana-card ds-gincana-card--encerrada ${ganhou ? 'ds-gincana-card--ganhou' : ''}`}>
                <div className="ds-gincana-header">
                    <span className="ds-gincana-emoji">{g.banner_emoji}</span>
                    <div className="ds-gincana-titulo-wrap">
                        <h3 className="ds-gincana-titulo">{g.nome}</h3>
                        <span className="ds-gincana-badge ds-gincana-badge--encerrada">✓ ENCERRADA</span>
                    </div>
                </div>

                <p className="ds-gincana-periodo">
                    {formatarDataCurta(g.datetime_inicio)} · {formatarHHMM(g.datetime_inicio)} → {formatarHHMM(g.datetime_fim)}
                </p>

                <div className="ds-gincana-progresso-wrap">
                    <div className="ds-gincana-progresso-topo">
                        <span className="ds-gincana-pontos-valor">
                            {ehEquipe ? 'Equipe: ' : 'Seu resultado: '}
                            {valorProgresso.toFixed(0)} {unidadeLabel}
                        </span>
                    </div>
                    <BarraProgresso valor={valorProgresso} meta={metaAlvo} ganhou={ganhou} />
                    <p className={`ds-gincana-resultado-label ${ganhou ? 'ganhou' : 'nao-ganhou'}`}>
                        {ganhouLabel}
                    </p>
                </div>

                {ganhou && melhorNivelGanho && (
                    <div className="ds-gincana-premio-ganho">
                        <span>{melhorNivelGanho.emoji_icone} Prêmio: {melhorNivelGanho.descricao_premio}</span>
                        <InfoPagamento premioRegistrado={premio_registrado} premioPago={premio_pago} />
                    </div>
                )}

                {!ganhou && (
                    <p className="ds-gincana-nao-ganhou-msg">
                        {ehEquipe
                            ? `A equipe precisava de ${metaAlvo} ${unidadeLabel}. Na próxima! 💪`
                            : `Você precisava de ${metaAlvo} ${unidadeLabel}. Na próxima! 💪`
                        }
                    </p>
                )}

                {!ehEquipe && minha_posicao && total_participantes > 0 && (
                    <p className="ds-gincana-posicao">
                        <i className="fas fa-map-marker-alt"></i>
                        Você ficou em <strong>{minha_posicao}°</strong> de {total_participantes} participantes
                    </p>
                )}
            </div>
        );
    }

    // Semanal encerrada no fim de semana
    if (g.semana_label?.includes('encerrada')) {
        return (
            <div className="ds-gincana-card ds-gincana-card--encerrada">
                <div className="ds-gincana-header">
                    <span className="ds-gincana-emoji">{g.banner_emoji}</span>
                    <div className="ds-gincana-titulo-wrap">
                        <h3 className="ds-gincana-titulo">{g.nome}</h3>
                        <span className="ds-gincana-badge ds-gincana-badge--encerrada">{g.semana_label}</span>
                    </div>
                </div>
                <p className="ds-gincana-descricao">
                    {ganhou
                        ? `✅ Semana encerrada — Você bateu a meta!`
                        : `Semana encerrada — Próxima começa na Segunda.`}
                </p>
                {ganhou && <InfoPagamento premioRegistrado={premio_registrado} premioPago={premio_pago} />}
            </div>
        );
    }

    return null;
}

export default function DashGincanaCard() {
    const [gincanas, setGincanas] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const fetchIntervalRef = useRef(null);

    const buscar = useCallback(async () => {
        try {
            const resultado = await fetchAPI('/api/gincanas/dashboard');
            setGincanas(Array.isArray(resultado) ? resultado : []);
        } catch {
            setGincanas([]);
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        buscar();
        fetchIntervalRef.current = setInterval(buscar, 10 * 60 * 1000);

        const aoMudarVisibilidade = () => {
            if (document.visibilityState === 'visible') {
                buscar();
                fetchIntervalRef.current = setInterval(buscar, 10 * 60 * 1000);
            } else {
                clearInterval(fetchIntervalRef.current);
            }
        };
        document.addEventListener('visibilitychange', aoMudarVisibilidade);
        return () => {
            clearInterval(fetchIntervalRef.current);
            document.removeEventListener('visibilitychange', aoMudarVisibilidade);
        };
    }, [buscar]);

    const contagem = useContagem(gincanas, buscar);

    if (carregando || gincanas.length === 0) return null;

    return (
        <div className="ds-gincana-lista">
            {gincanas.map(g => (
                <GincanaCardItem
                    key={g.id}
                    g={g}
                    contagemSecs={g.fase === 'proxima' ? contagem[g.id] : undefined}
                />
            ))}
        </div>
    );
}
