import React, { useState, useEffect } from 'react';
import { fetchAPI } from '/js/utils/api-utils';

function formatarData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// ─── ABA COMISSÕES (lógica original intacta) ───────────────────────────────
function AbaComissoes({ pagamentoPendente }) {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAPI('/api/dashboard/meus-pagamentos')
            .then(d => setHistorico(d))
            .catch(() => setHistorico([]))
            .finally(() => setLoading(false));
    }, []);

    const temPendente = pagamentoPendente && pagamentoPendente.valor > 0;
    const mesRef = pagamentoPendente?.mesReferencia || '';
    const periodoExibir = pagamentoPendente?.periodo || 'Nenhum ciclo fechado';

    return (
        <>
            <p className="ds-pag-bolso-label">
                <i className="fas fa-briefcase"></i> Comissões de produção
                <span className="ds-pag-bolso-hint">Pagas todo 5º dia útil do mês</span>
            </p>

            {!temPendente ? (
                <div className="ds-pag-vazio">
                    <i className="fas fa-clock"></i>
                    <p>Nenhum pagamento pendente ainda.</p>
                    <small>Continue produzindo! Seu primeiro pagamento aparecerá aqui ao fechar o ciclo.</small>
                </div>
            ) : (
                <div className="ds-pag-card-comissao">
                    <div className="ds-pag-card-topo">
                        <div>
                            <div className="ds-pag-card-rotulo">Pagamento Estimado</div>
                            <div className="ds-pag-card-valor">R$ {pagamentoPendente.valor.toFixed(2)}</div>
                        </div>
                        <i className="fas fa-money-bill-wave ds-pag-card-icone"></i>
                    </div>
                    <div className="ds-pag-card-detalhe">
                        <div className="ds-pag-card-linha">
                            <span>Data Prevista:</span>
                            <strong>
                                {pagamentoPendente.dataPagamentoFormatada || `5º dia útil de ${mesRef}`}
                            </strong>
                        </div>
                        <div className="ds-pag-card-linha">
                            <span>Ref. Ciclo:</span>
                            <span>{periodoExibir}</span>
                        </div>
                    </div>
                </div>
            )}

            <h3 className="ds-pag-secao-titulo">Histórico de Comissões</h3>
            <div className="ds-pag-lista-scroll">
                {loading ? (
                    <div className="ds-spinner" style={{ margin: '20px auto' }}></div>
                ) : historico.length === 0 ? (
                    <p className="ds-pag-vazio-inline">Nenhum pagamento anterior.</p>
                ) : (
                    historico.map((pgto, idx) => (
                        <div key={idx} className="ds-pag-historico-linha">
                            <div>
                                <div className="ds-pag-historico-descricao">{pgto.ciclo_nome || pgto.descricao}</div>
                                <div className="ds-pag-historico-data">Pago em: {formatarData(pgto.data_pagamento)}</div>
                            </div>
                            <div className="ds-pag-historico-direita">
                                <div className="ds-pag-historico-valor">R$ {parseFloat(pgto.valor_liquido_pago).toFixed(2)}</div>
                                <span className="ds-pag-badge-pago">CONCLUÍDO</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

// ─── ABA PREMIAÇÕES (gincanas) ─────────────────────────────────────────────
function AbaPromissoes() {
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAPI('/api/gincanas-pagamentos/meus-premios')
            .then(d => setDados(d))
            .catch(() => setDados({ pendentes: [], pagos: [], total_pendentes: 0, total_pagos: 0 }))
            .finally(() => setLoading(false));
    }, []);

    const pendentes = dados?.pendentes || [];
    const pagos = dados?.pagos || [];

    return (
        <>
            <p className="ds-pag-bolso-label">
                <i className="fas fa-trophy"></i> Prêmios de Gincanas
                <span className="ds-pag-bolso-hint">Pagos toda sexta-feira</span>
            </p>

            {loading ? (
                <div className="ds-spinner" style={{ margin: '30px auto' }}></div>
            ) : (
                <>
                    {/* Pendentes */}
                    {pendentes.length > 0 ? (
                        <div className="ds-pag-premios-secao">
                            <h3 className="ds-pag-secao-titulo ds-pag-secao-titulo--pendente">
                                <i className="fas fa-clock"></i> A receber ({pendentes.length})
                            </h3>
                            <div className="ds-pag-premios-lista">
                                {pendentes.map(p => (
                                    <div key={p.id} className="ds-pag-premio-item ds-pag-premio-item--pendente">
                                        <span className="ds-pag-premio-emoji">{p.banner_emoji}</span>
                                        <div className="ds-pag-premio-info">
                                            <p className="ds-pag-premio-gincana">{p.gincana_nome}</p>
                                            <p className="ds-pag-premio-nivel">{p.nivel_label} — {p.descricao_premio}</p>
                                            <p className="ds-pag-premio-data">Ganho em: {formatarData(p.ganho_em)}</p>
                                        </div>
                                        <span className="ds-pag-badge-pendente">A RECEBER</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="ds-pag-vazio">
                            <i className="fas fa-trophy" style={{ opacity: 0.3 }}></i>
                            <p>Nenhum prêmio pendente.</p>
                            <small>Participe das gincanas e ganhe prêmios toda sexta!</small>
                        </div>
                    )}

                    {/* Pagos */}
                    {pagos.length > 0 && (
                        <div className="ds-pag-premios-secao">
                            <h3 className="ds-pag-secao-titulo">Histórico de Premiações</h3>
                            <div className="ds-pag-lista-scroll">
                                {pagos.map(p => (
                                    <div key={p.id} className="ds-pag-historico-linha">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: '1.2rem' }}>{p.banner_emoji}</span>
                                            <div>
                                                <div className="ds-pag-historico-descricao">{p.gincana_nome}</div>
                                                <div className="ds-pag-historico-data">
                                                    {p.nivel_label} · Pago em: {formatarData(p.pago_em)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="ds-pag-historico-direita">
                                            <div className="ds-pag-historico-descricao" style={{ textAlign: 'right', fontSize: '0.82rem' }}>
                                                {p.descricao_premio}
                                            </div>
                                            <span className="ds-pag-badge-pago">PAGO</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

// ─── MODAL PRINCIPAL ──────────────────────────────────────────────────────
export default function DashPagamentosModal({ pagamentoPendente, onClose }) {
    const [aba, setAba] = useState('comissoes');

    return (
        <div className="ds-popup-overlay ativo" onClick={onClose} style={{ zIndex: 1400 }}>
            <div className="ds-pag-modal" onClick={e => e.stopPropagation()}>

                <button className="ds-modal-close-simple" onClick={onClose}>
                    <i className="fas fa-times"></i>
                </button>

                {/* Abas */}
                <div className="ds-pag-abas">
                    <button
                        className={`ds-pag-aba ${aba === 'comissoes' ? 'ativa' : ''}`}
                        onClick={() => setAba('comissoes')}
                    >
                        <i className="fas fa-briefcase"></i>
                        Comissões
                    </button>
                    <button
                        className={`ds-pag-aba ${aba === 'premiacoes' ? 'ativa' : ''}`}
                        onClick={() => setAba('premiacoes')}
                    >
                        <i className="fas fa-trophy"></i>
                        Premiações
                    </button>
                </div>

                <div className="ds-pag-corpo">
                    {aba === 'comissoes'
                        ? <AbaComissoes pagamentoPendente={pagamentoPendente} />
                        : <AbaPromissoes />
                    }
                </div>

            </div>
        </div>
    );
}
