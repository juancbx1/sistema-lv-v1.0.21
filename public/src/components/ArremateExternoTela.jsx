// public/src/components/ArremateExternoTela.jsx
// Versão inline (aba) para lançamento de arremate por prestador externo (freelance tiktik)
// Espelho de OPExternoTela.jsx — adapta para o contexto de arremates

import React, { useState, useCallback } from 'react';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';
import ArremateTelaSelecaoProduto from './ArremateTelaSelecaoProduto.jsx';

const fmtHora = (iso) => {
    if (!iso) return '--:--';
    return new Date(iso).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
    });
};

const fmtDataHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const data = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    if (data === hoje) return `hoje ${fmtHora(iso)}`;
    return `${data} ${fmtHora(iso)}`;
};

// Fake tiktik context para ArremateTelaSelecaoProduto (modo individual, sem batch)
const FAKE_TIKTIK = { id: null, nome: 'Freelance TikTik', tipos: ['tiktik'] };

export default function ArremateExternoTela() {
    // Arremates não tem seleção de tipo (sempre tiktik) — começa direto na seleção
    const [tela, setTela] = useState('selecao');
    const [itemSelecionado, setItemSelecionado] = useState(null);
    const [quantidades, setQuantidades] = useState({});
    const [carregando, setCarregando] = useState(false);

    const [historico, setHistorico] = useState([]);
    const [carregandoHistorico, setCarregandoHistorico] = useState(false);
    const [desfazendoId, setDesfazendoId] = useState(null);

    const resetar = () => {
        setTela('selecao');
        setItemSelecionado(null);
        setQuantidades({});
    };

    const carregarHistorico = useCallback(async () => {
        setCarregandoHistorico(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/arremates/externos-recentes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setHistorico(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setCarregandoHistorico(false);
        }
    }, []);

    const handleVerHistorico = () => {
        setTela('historico');
        carregarHistorico();
    };

    const handleDesfazer = async (item) => {
        const confirmado = await mostrarConfirmacao(
            `Desfazer lançamento de ${item.quantidade_arrematada}x ${item.produto_nome}${item.variante && item.variante !== '-' ? ` — ${item.variante}` : ''} (${item.freelance_nome})?`,
            'aviso'
        );
        if (!confirmado) return;

        setDesfazendoId(item.id);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/arremates/estornar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_arremate: item.id })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao desfazer.');
            }
            mostrarMensagem('Lançamento desfeito com sucesso.', 'sucesso');
            window.dispatchEvent(new Event('atualizar-fila-react'));
            carregarHistorico();
        } catch (err) {
            mostrarMensagem(err.message, 'erro');
        } finally {
            setDesfazendoId(null);
        }
    };

    // Item selecionado pelo ArremateTelaSelecaoProduto
    const handleItemSelect = (item) => {
        const key = `${item.produto_id}-${item.variante}`;
        setItemSelecionado(item);
        setQuantidades({ [key]: item.saldo_para_arrematar });
        setTela('confirmacao');
    };

    const ajustarQtd = (key, delta, max) => {
        setQuantidades(prev => ({
            ...prev,
            [key]: Math.max(0, Math.min(max, (parseInt(prev[key]) || 0) + delta)),
        }));
    };

    const handleConfirmar = async () => {
        if (!itemSelecionado) return;
        const key = `${itemSelecionado.produto_id}-${itemSelecionado.variante}`;
        const qtdTotal = parseInt(quantidades[key]) || 0;

        if (qtdTotal <= 0) {
            mostrarMensagem('Defina uma quantidade válida.', 'aviso');
            return;
        }
        if (qtdTotal > itemSelecionado.saldo_para_arrematar) {
            mostrarMensagem(`Quantidade máxima disponível: ${itemSelecionado.saldo_para_arrematar} pçs.`, 'aviso');
            return;
        }

        setCarregando(true);
        try {
            const token = localStorage.getItem('token');

            // Divide a quantidade pelas OPs (mesma lógica do lancarArremateAgregado)
            let quantidadeRestante = qtdTotal;
            const opsOrdenadas = (itemSelecionado.ops_detalhe || []).sort((a, b) => a.numero - b.numero);
            const itensPayload = [];

            for (const op of opsOrdenadas) {
                if (quantidadeRestante <= 0) break;
                const qtdParaOp = Math.min(quantidadeRestante, op.saldo_op);
                if (qtdParaOp > 0) {
                    itensPayload.push({
                        op_numero: op.numero,
                        op_edit_id: op.edit_id,
                        produto_id: itemSelecionado.produto_id,
                        variante: itemSelecionado.variante === '-' ? null : itemSelecionado.variante,
                        quantidade_arrematada: qtdParaOp
                    });
                    quantidadeRestante -= qtdParaOp;
                }
            }

            if (itensPayload.length === 0) throw new Error('Nenhuma OP disponível para este produto.');

            const res = await fetch('/api/arremates/externo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ itens: itensPayload }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao registrar arremate externo.');
            }
            mostrarMensagem('Arremate externo registrado com sucesso!', 'sucesso');
            window.dispatchEvent(new Event('atualizar-fila-react'));
            resetar();
        } catch (err) {
            mostrarMensagem(err.message, 'erro');
        } finally {
            setCarregando(false);
        }
    };

    const handleVoltar = () => {
        if (tela === 'confirmacao') return setTela('selecao');
        if (tela === 'historico') return setTela('selecao');
        setTela('selecao');
    };

    const titulos = {
        selecao: 'Selecionar Produto',
        confirmacao: 'Confirmar Quantidade',
        historico: 'Histórico de Lançamentos',
    };

    return (
        <div className="gs-card op-externo-tela-wrapper">

            <div className="op-modal-header op-externo-tela-header">
                <div className="op-modal-header-esquerda">
                    {tela !== 'selecao' && (
                        <button className="btn-voltar-header" onClick={handleVoltar}>
                            <i className="fas fa-arrow-left"></i> Voltar
                        </button>
                    )}
                </div>
                <div className="op-modal-header-centro">
                    <h3 className="op-modal-titulo">{titulos[tela]}</h3>
                    <div className="op-modal-header-info">
                        <span className="op-externo-badge">
                            <i className="fas fa-user-tie"></i> Prestador Externo
                        </span>
                        {tela !== 'historico' && (
                            <span className="op-modal-role-badge badge-tiktik">
                                <i className="fas fa-cut"></i> TikTik
                            </span>
                        )}
                    </div>
                </div>
                <div className="op-modal-header-direita">
                    {/* sem botão fechar — é uma aba, não um modal */}
                </div>
            </div>

            {tela !== 'historico' && (
                <div className="op-modal-aviso-hora-extra" style={{ background: '#f0f9ff', borderLeftColor: '#0ea5e9', color: '#0c4a6e' }}>
                    <i className="fas fa-info-circle"></i> Arremate realizado por prestador externo — registrado com rastreabilidade completa
                </div>
            )}

            <div className="op-modal-body op-externo-tela-body">

                {/* TELA 1: Seleção de produto da fila de arremates */}
                {tela === 'selecao' && (
                    <div className="op-externo-tipo-wrapper">
                        <ArremateTelaSelecaoProduto
                            onItemSelect={handleItemSelect}
                            isBatchMode={false}
                            tiktikContexto={FAKE_TIKTIK}
                            onLoteConfirmado={null}
                        />
                        <button className="op-externo-ver-historico" onClick={handleVerHistorico}>
                            <i className="fas fa-history"></i> Ver lançamentos recentes (desfazer)
                        </button>
                    </div>
                )}

                {/* TELA 2: Confirmação de quantidade */}
                {tela === 'confirmacao' && itemSelecionado && (() => {
                    const key = `${itemSelecionado.produto_id}-${itemSelecionado.variante}`;
                    const qtd = quantidades[key] !== undefined ? quantidades[key] : itemSelecionado.saldo_para_arrematar;
                    const maxQtd = itemSelecionado.saldo_para_arrematar;
                    return (
                        <div className="op-confirmacao-container">
                            <div className="op-confirmacao-lista">
                                <div className="op-item-confirmacao-card">
                                    <div className="card-borda-charme borda-etapa-normal"></div>
                                    <div className="item-info-visual">
                                        <img
                                            src={itemSelecionado.imagem || '/img/placeholder-image.png'}
                                            alt={itemSelecionado.produto_nome}
                                        />
                                        <div>
                                            <h4>{itemSelecionado.produto_nome}</h4>
                                            {itemSelecionado.variante && itemSelecionado.variante !== '-' && (
                                                <p className="variante">{itemSelecionado.variante}</p>
                                            )}
                                            <p className="processo">
                                                <i className="fas fa-cut"></i> Arremate
                                            </p>
                                            {itemSelecionado.ops_detalhe?.length > 0 && (
                                                <p className="op-confirmacao-op-link">
                                                    <i className="fas fa-link"></i>
                                                    {' OP #'}{itemSelecionado.ops_detalhe.slice(0, 2).map(o => o.numero).join(' • #')}
                                                    {itemSelecionado.ops_detalhe.length > 2 ? ` +${itemSelecionado.ops_detalhe.length - 2}` : ''}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="item-controles-qtd">
                                        <div className="qtd-display-linha">
                                            <button className="btn-ajuste mini" onClick={() => ajustarQtd(key, -1, maxQtd)}>-</button>
                                            <input
                                                type="number"
                                                value={qtd}
                                                onChange={e => {
                                                    const n = parseInt(e.target.value);
                                                    if (e.target.value === '' || (!isNaN(n) && n >= 0 && n <= maxQtd)) {
                                                        setQuantidades(p => ({ ...p, [key]: e.target.value === '' ? '' : n }));
                                                    }
                                                }}
                                            />
                                            <button className="btn-ajuste mini" onClick={() => ajustarQtd(key, 1, maxQtd)}>+</button>
                                        </div>
                                        <div className="qtd-atalhos-linha">
                                            <button onClick={() => ajustarQtd(key, 10, maxQtd)}>+10</button>
                                            <button className="btn-max" onClick={() => setQuantidades(p => ({ ...p, [key]: maxQtd }))}>
                                                Max ({maxQtd})
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button className="op-selecao-fab" onClick={handleConfirmar} disabled={carregando}>
                                {carregando
                                    ? <><div className="spinner-btn-interno"></div> Registrando...</>
                                    : <><i className="fas fa-check-double"></i> Confirmar Lançamento</>
                                }
                            </button>
                        </div>
                    );
                })()}

                {/* TELA 3: Histórico / Desfazer */}
                {tela === 'historico' && (
                    <div className="op-externo-historico">
                        {carregandoHistorico ? (
                            <div className="spinner" style={{ margin: '40px auto' }}>Carregando...</div>
                        ) : historico.length === 0 ? (
                            <div className="op-externo-historico-vazio">
                                <i className="fas fa-inbox"></i>
                                <p>Nenhum lançamento externo nas últimas 24h</p>
                            </div>
                        ) : (
                            <div className="op-externo-historico-lista">
                                {historico.map(item => (
                                    <div key={item.id} className="op-externo-historico-item">
                                        <div className="op-externo-historico-info">
                                            <span className="op-externo-historico-produto">{item.produto_nome}</span>
                                            {item.variante && item.variante !== '-' && (
                                                <span className="op-externo-historico-variante">{item.variante}</span>
                                            )}
                                            <span className="op-externo-historico-processo">
                                                <i className="fas fa-cut"></i> Arremate
                                            </span>
                                            <div className="op-externo-historico-meta">
                                                <span className="op-externo-historico-qtd">
                                                    <i className="fas fa-layer-group"></i> {item.quantidade_arrematada} pçs
                                                </span>
                                                <span className="op-modal-role-badge badge-tiktik" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                                                    <i className="fas fa-cut"></i> TikTik
                                                </span>
                                                <span className="op-externo-historico-hora">
                                                    <i className="fas fa-clock"></i> {fmtDataHora(item.data_lancamento)}
                                                </span>
                                                <span className="op-externo-historico-lancador">
                                                    por {item.lancado_por}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            className="op-externo-historico-btn-desfazer"
                                            onClick={() => handleDesfazer(item)}
                                            disabled={desfazendoId === item.id}
                                            title="Desfazer este lançamento"
                                        >
                                            {desfazendoId === item.id
                                                ? <div className="spinner-btn-interno"></div>
                                                : <><i className="fas fa-undo"></i> Desfazer</>
                                            }
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
