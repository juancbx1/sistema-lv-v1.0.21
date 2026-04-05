// public/src/components/BotaoBuscaModalAddDemanda.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';

const RECENTES_KEY = 'demanda_recentes';

const salvarRecente = (item) => {
    try {
        const recentes = JSON.parse(localStorage.getItem(RECENTES_KEY) || '[]');
        const filtrado = recentes.filter(r => r.sku !== item.sku);
        localStorage.setItem(RECENTES_KEY, JSON.stringify([item, ...filtrado].slice(0, 5)));
    } catch(e) {}
};

const lerRecentes = () => {
    try { return JSON.parse(localStorage.getItem(RECENTES_KEY) || '[]'); }
    catch(e) { return []; }
};

const formatarData = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// --- Lista de resultados de busca ---
const ListaResultadosBusca = ({ resultados, onSelecionar, paginacaoInfo, onPageChange, buscando, carrinhoSkus }) => {
    const paginacaoRef = useRef(null);

    useEffect(() => {
        if (paginacaoRef.current && paginacaoInfo && paginacaoInfo.totalPages > 1) {
            renderizarPaginacao(paginacaoRef.current, paginacaoInfo.totalPages, paginacaoInfo.currentPage, onPageChange);
        } else if (paginacaoRef.current) {
            paginacaoRef.current.innerHTML = '';
        }
    }, [paginacaoInfo, onPageChange]);

    if (buscando) {
        return <div className="gs-add-demanda-buscando"><i className="fas fa-circle-notch fa-spin"></i> Buscando...</div>;
    }

    if (resultados.length === 0) return null;

    return (
        <div className="gs-busca-lista-resultados" style={{ marginTop: '8px' }}>
            {resultados.map(item => {
                const jaNoCarrinho = carrinhoSkus?.has(item.sku);
                return (
                    <div
                        className={`gs-busca-item-resultado-v2${jaNoCarrinho ? ' no-carrinho' : ''}`}
                        key={item.sku}
                        onClick={() => onSelecionar(item)}
                    >
                        <div className="card-borda-charme"></div>
                        <img src={item.imagem || '/img/placeholder-image.png'} alt={item.nome} className="gs-resultado-img" />
                        <div className="gs-resultado-info">
                            <span className="gs-resultado-nome">{item.nome}</span>
                            {item.variante && <span className="gs-resultado-variante">{item.variante}</span>}
                            <span className="gs-resultado-sku">SKU: {item.sku}</span>
                        </div>
                        {jaNoCarrinho
                            ? <i className="fas fa-check-circle gs-resultado-check"></i>
                            : <i className="fas fa-chevron-right gs-resultado-seta"></i>
                        }
                    </div>
                );
            })}
            <div ref={paginacaoRef} className="gs-paginacao-container" style={{ marginTop: '12px' }}></div>
        </div>
    );
};

// --- Carrinho (modo Express) ---
const CarrinhoSection = ({ carrinho, onAtualizarQtd, onRemover, onLimpar, prioridade, onTogglePrioridade, onCriar, criando }) => (
    <div className="gs-carrinho-section">
        <div className="gs-carrinho-header">
            <span><i className="fas fa-shopping-cart"></i> Carrinho ({carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'})</span>
            <button type="button" className="gs-carrinho-limpar" onClick={onLimpar}>Limpar</button>
        </div>

        <div className="gs-carrinho-lista">
            {carrinho.map(c => (
                <div key={c.item.sku} className={`gs-carrinho-item-wrapper${c.temDuplicata === true ? ' tem-aviso' : ''}`}>
                    <div className="gs-carrinho-item">
                        <img src={c.item.imagem || '/img/placeholder-image.png'} alt={c.item.nome} className="gs-carrinho-img" />
                        <div className="gs-carrinho-item-info">
                            <span className="gs-carrinho-item-nome">{c.item.nome}</span>
                            {c.item.variante && <span className="gs-carrinho-item-variante">{c.item.variante}</span>}
                        </div>
                        <div className="gs-qtd-input-wrapper gs-qtd-mini">
                            <button type="button" className="gs-qtd-btn"
                                onClick={() => onAtualizarQtd(c.item.sku, c.quantidade - 1)}>−</button>
                            <input
                                type="number"
                                className="gs-input-qtd-compacto"
                                value={c.quantidade}
                                onChange={e => onAtualizarQtd(c.item.sku, e.target.value)}
                                min="1"
                            />
                            <button type="button" className="gs-qtd-btn"
                                onClick={() => onAtualizarQtd(c.item.sku, c.quantidade + 1)}>+</button>
                        </div>
                        <button type="button" className="gs-carrinho-del-btn" onClick={() => onRemover(c.item.sku)}>
                            <i className="fas fa-trash"></i>
                        </button>
                    </div>
                    {c.temDuplicata === true && (
                        <div className="gs-carrinho-aviso-duplicata">
                            <i className="fas fa-exclamation-triangle"></i>
                            Já existe uma demanda ativa para este produto. Você pode criar assim mesmo ou remover do carrinho.
                        </div>
                    )}
                </div>
            ))}
        </div>

        <div
            className={`gs-prioridade-toggle${prioridade ? ' ativo' : ''}`}
            style={{ marginTop: '12px', marginBottom: '12px' }}
            onClick={onTogglePrioridade}
            role="checkbox"
            aria-checked={prioridade}
            tabIndex={0}
            onKeyDown={e => e.key === ' ' && onTogglePrioridade()}
        >
            <div className="gs-prioridade-icone">
                <i className={`fas ${prioridade ? 'fa-exclamation-triangle' : 'fa-star'}`}></i>
            </div>
            <div className="gs-prioridade-texto">
                <strong>{prioridade ? 'PRIORIDADE ATIVA' : 'Marcar como Prioridade'}</strong>
                <span>{prioridade ? 'Todos os itens serão urgentes.' : 'Aplica a todos os itens do carrinho.'}</span>
            </div>
            <div className={`gs-prioridade-check${prioridade ? ' marcado' : ''}`}>
                {prioridade && <i className="fas fa-check"></i>}
            </div>
        </div>

        <button
            type="button"
            className="gs-btn gs-btn-primario gs-btn-full"
            onClick={onCriar}
            disabled={carrinho.length === 0 || criando}
        >
            {criando
                ? <><div className="spinner-btn-interno"></div> Criando...</>
                : <><i className="fas fa-check"></i> Criar {carrinho.length} Demanda{carrinho.length !== 1 ? 's' : ''}</>
            }
        </button>
    </div>
);

// --- Tela de duplicata (modo normal) ---
const TelaDuplicata = ({ item, demandasAtivas, onCriarMesmoAssim, onVoltar, onDemandaAtualizada }) => {
    const [ajustandoId, setAjustandoId] = useState(null);
    const [novaQtd, setNovaQtd] = useState('');
    const [loadingId, setLoadingId] = useState(null);

    const handleTornarPrioridade = async (demanda) => {
        setLoadingId(demanda.id);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/demandas/${demanda.id}/prioridade`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ nova_prioridade: 1 })
            });
            if (!res.ok) throw new Error('Falha ao atualizar prioridade.');
            mostrarMensagem('Demanda promovida a prioridade!', 'sucesso');
            onDemandaAtualizada();
        } catch(e) {
            mostrarMensagem(e.message, 'erro');
        } finally {
            setLoadingId(null);
        }
    };

    const handleConfirmarQtd = async (demanda) => {
        const qtd = parseInt(novaQtd);
        if (!qtd || qtd < 1) return;
        setLoadingId(demanda.id);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/demandas/${demanda.id}/quantidade`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ nova_quantidade: qtd })
            });
            if (!res.ok) throw new Error('Falha ao atualizar quantidade.');
            mostrarMensagem('Quantidade atualizada!', 'sucesso');
            onDemandaAtualizada();
        } catch(e) {
            mostrarMensagem(e.message, 'erro');
        } finally {
            setLoadingId(null);
            setAjustandoId(null);
        }
    };

    return (
        <div>
            <div className="gs-form-header-voltar">
                <button className="gs-btn-voltar" onClick={onVoltar} type="button">
                    <i className="fas fa-arrow-left"></i>
                </button>
                <span>Demanda já existe</span>
            </div>

            <div className="gs-duplicata-aviso">
                <i className="fas fa-exclamation-triangle"></i>
                <span>Já existe uma demanda ativa com este produto. O que você quer fazer?</span>
            </div>

            {demandasAtivas.map(d => (
                <div key={d.id} className="gs-duplicata-card">
                    <div className="card-borda-charme" style={{ backgroundColor: d.prioridade === 1 ? '#e74c3c' : 'var(--cor-primaria)' }}></div>
                    <div className="gs-duplicata-card-header">
                        <span className="gs-duplicata-id">Demanda #{d.id}</span>
                        <span className={`gs-duplicata-prioridade${d.prioridade === 1 ? ' urgente' : ''}`}>
                            {d.prioridade === 1 ? <><i className="fas fa-exclamation-triangle"></i> Urgente</> : 'Normal'}
                        </span>
                    </div>
                    <div className="gs-duplicata-card-info">
                        <strong>{d.quantidade_solicitada} pçs</strong>
                        <span>·</span>
                        <span>{formatarData(d.data_solicitacao)}</span>
                        {d.solicitado_por && <><span>·</span><span>por {d.solicitado_por}</span></>}
                        <span>·</span>
                        <span className="gs-duplicata-status">{d.status}</span>
                    </div>

                    {ajustandoId === d.id ? (
                        <div className="gs-duplicata-ajuste-qtd">
                            <div className="gs-qtd-input-wrapper">
                                <button type="button" className="gs-qtd-btn"
                                    onClick={() => setNovaQtd(q => String(Math.max(1, (parseInt(q) || 0) - 1)))}>−</button>
                                <input type="number" className="gs-input-qtd-compacto" value={novaQtd}
                                    onChange={e => setNovaQtd(e.target.value)} min="1" autoFocus placeholder="0" />
                                <button type="button" className="gs-qtd-btn"
                                    onClick={() => setNovaQtd(q => String((parseInt(q) || 0) + 1))}>+</button>
                            </div>
                            <button type="button" className="gs-btn gs-btn-primario gs-btn-sm"
                                onClick={() => handleConfirmarQtd(d)}
                                disabled={!novaQtd || parseInt(novaQtd) < 1 || loadingId === d.id}>
                                {loadingId === d.id ? <div className="spinner-btn-interno"></div> : <><i className="fas fa-check"></i> Confirmar</>}
                            </button>
                            <button type="button" className="gs-btn gs-btn-secundario gs-btn-sm" onClick={() => setAjustandoId(null)}>
                                Cancelar
                            </button>
                        </div>
                    ) : (
                        <div className="gs-duplicata-acoes">
                            {d.prioridade !== 1 && (
                                <button type="button" className="gs-btn gs-btn-urgente gs-btn-sm"
                                    onClick={() => handleTornarPrioridade(d)} disabled={loadingId === d.id}>
                                    {loadingId === d.id ? <div className="spinner-btn-interno"></div>
                                        : <><i className="fas fa-exclamation-triangle"></i> Tornar Prioridade</>}
                                </button>
                            )}
                            <button type="button" className="gs-btn gs-btn-secundario gs-btn-sm"
                                onClick={() => { setAjustandoId(d.id); setNovaQtd(String(d.quantidade_solicitada)); }}>
                                <i className="fas fa-edit"></i> Ajustar Qtd
                            </button>
                        </div>
                    )}
                </div>
            ))}

            <div className="gs-duplicata-separador"><span>ou</span></div>

            <button type="button" className="gs-btn gs-btn-primario gs-btn-full" onClick={onCriarMesmoAssim}>
                <i className="fas fa-plus"></i> Criar nova demanda mesmo assim
            </button>
        </div>
    );
};

// --- Formulário de confirmação (modo normal) ---
const FormularioConfirmacao = ({ item, onConfirmar, onVoltar, carregando }) => {
    const [quantidade, setQuantidade] = useState('');
    const [isPrioridade, setIsPrioridade] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        const qtd = parseInt(quantidade);
        if (qtd > 0) onConfirmar({ produto_sku: item.sku, quantidade_solicitada: qtd, prioridade: isPrioridade ? 1 : 2 });
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="gs-form-header-voltar">
                <button className="gs-btn-voltar" onClick={onVoltar} type="button">
                    <i className="fas fa-arrow-left"></i>
                </button>
                <span>Confirmar Demanda</span>
            </div>

            <div className="gs-produto-confirmado">
                <div className="card-borda-charme" style={{ backgroundColor: isPrioridade ? '#e74c3c' : 'var(--cor-primaria)' }}></div>
                <img src={item.imagem || '/img/placeholder-image.png'} alt={item.nome} className="gs-resultado-img" />
                <div className="gs-resultado-info">
                    <strong className="gs-resultado-nome">{item.nome}</strong>
                    {item.variante && <span className="gs-resultado-variante">{item.variante}</span>}
                </div>
            </div>

            <div className="gs-form-quantidade-row">
                <label>Quantidade necessária</label>
                <div className="gs-qtd-input-wrapper">
                    <button type="button" className="gs-qtd-btn"
                        onClick={() => setQuantidade(q => String(Math.max(1, (parseInt(q) || 0) - 1)))}>−</button>
                    <input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)}
                        min="1" className="gs-input-qtd-compacto" autoFocus placeholder="0" />
                    <button type="button" className="gs-qtd-btn"
                        onClick={() => setQuantidade(q => String((parseInt(q) || 0) + 1))}>+</button>
                </div>
            </div>

            <div
                className={`gs-prioridade-toggle${isPrioridade ? ' ativo' : ''}`}
                onClick={() => setIsPrioridade(p => !p)}
                role="checkbox" aria-checked={isPrioridade} tabIndex={0}
                onKeyDown={e => e.key === ' ' && setIsPrioridade(p => !p)}
            >
                <div className="gs-prioridade-icone">
                    <i className={`fas ${isPrioridade ? 'fa-exclamation-triangle' : 'fa-star'}`}></i>
                </div>
                <div className="gs-prioridade-texto">
                    <strong>{isPrioridade ? 'PRIORIDADE ATIVA — FURA-FILA' : 'Marcar como Prioridade'}</strong>
                    <span>{isPrioridade ? 'Esta demanda irá para o topo da fila imediatamente.' : 'Use apenas para pedidos urgentes.'}</span>
                </div>
                <div className={`gs-prioridade-check${isPrioridade ? ' marcado' : ''}`}>
                    {isPrioridade && <i className="fas fa-check"></i>}
                </div>
            </div>

            <button type="submit" className="gs-btn gs-btn-primario gs-btn-full"
                disabled={!quantidade || parseInt(quantidade) < 1 || carregando}>
                {carregando
                    ? <><div className="spinner-btn-interno"></div> Criando...</>
                    : <><i className="fas fa-check"></i> Criar Demanda</>
                }
            </button>
        </form>
    );
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function ModalAdicionarDemanda({ onClose, onDemandaCriada, itemPreSelecionado = null }) {
    // --- Estados modo normal ---
    const [termoBusca, setTermoBusca] = useState('');
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [itemSelecionado, setItemSelecionado] = useState(itemPreSelecionado);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const [paginacaoInfo, setPaginacaoInfo] = useState(null);
    const [recentes, setRecentes] = useState(() => lerRecentes());
    const [verificandoDuplicata, setVerificandoDuplicata] = useState(false);
    const [duplicataInfo, setDuplicataInfo] = useState(null);
    const [itemPendente, setItemPendente] = useState(null);

    // --- Estados modo Express ---
    const [modoExpress, setModoExpress] = useState(false);
    const [carrinho, setCarrinho] = useState([]);
    const [prioridadeCarrinho, setPrioridadeCarrinho] = useState(false);
    const [criandoLote, setCriandoLote] = useState(false);

    const carrinhoSkus = useMemo(() => new Set(carrinho.map(c => c.item.sku)), [carrinho]);

    // --- Busca de produtos ---
    const buscarProdutos = async (termo, page = 1) => {
        if (termo.trim().length < 2) { setResultados([]); setPaginacaoInfo(null); return; }
        setBuscando(true);
        try {
            const token = localStorage.getItem('token');
            const url = `/api/demandas/buscar-produto?termo=${encodeURIComponent(termo)}&page=${page}&limit=5`;
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            setResultados(data.rows || []);
            setPaginacaoInfo(data.pagination || null);
        } catch(e) {
            // silently fail
        } finally {
            setBuscando(false);
        }
    };

    useEffect(() => {
        if (termoBusca.trim().length >= 2) buscarProdutos(termoBusca, paginaAtual);
    }, [paginaAtual]);

    // --- Modo normal: selecionar item com verificação de duplicata ---
    const handleSelecionarItem = async (item) => {
        salvarRecente(item);
        setRecentes(lerRecentes());
        setItemPendente(item);
        setVerificandoDuplicata(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(
                `/api/demandas/verificar-duplicata?sku=${encodeURIComponent(item.sku)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const data = await res.json();
            if (data.temDuplicata) {
                setDuplicataInfo(data);
            } else {
                setItemSelecionado(item);
                setItemPendente(null);
            }
        } catch(e) {
            setItemSelecionado(item);
            setItemPendente(null);
        } finally {
            setVerificandoDuplicata(false);
        }
    };

    // --- Modo Express: adicionar ao carrinho ---
    const handleAdicionarAoCarrinho = async (item) => {
        salvarRecente(item);
        setRecentes(lerRecentes());

        if (carrinhoSkus.has(item.sku)) {
            // Já no carrinho → incrementa quantidade
            setCarrinho(prev => prev.map(c =>
                c.item.sku === item.sku ? { ...c, quantidade: c.quantidade + 1 } : c
            ));
            return;
        }

        // Adiciona com temDuplicata = null (verificando...)
        setCarrinho(prev => [...prev, { item, quantidade: 1, temDuplicata: null }]);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(
                `/api/demandas/verificar-duplicata?sku=${encodeURIComponent(item.sku)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const data = await res.json();
            setCarrinho(prev => prev.map(c =>
                c.item.sku === item.sku ? { ...c, temDuplicata: data.temDuplicata } : c
            ));
        } catch(e) {
            setCarrinho(prev => prev.map(c =>
                c.item.sku === item.sku ? { ...c, temDuplicata: false } : c
            ));
        }
    };

    const handleAtualizarQtd = (sku, novaQtd) => {
        const qtd = Math.max(1, parseInt(novaQtd) || 1);
        setCarrinho(prev => prev.map(c => c.item.sku === sku ? { ...c, quantidade: qtd } : c));
    };

    const handleRemoverDoCarrinho = (sku) => {
        setCarrinho(prev => prev.filter(c => c.item.sku !== sku));
    };

    const handleLimparCarrinho = () => {
        setCarrinho([]);
        setPrioridadeCarrinho(false);
    };

    // --- Criar lote (modo Express) ---
    const handleCriarLote = async () => {
        if (carrinho.length === 0) return;
        setCriandoLote(true);
        try {
            const token = localStorage.getItem('token');
            const itens = carrinho.map(c => ({
                produto_sku: c.item.sku,
                quantidade_solicitada: c.quantidade,
                prioridade: prioridadeCarrinho ? 1 : 2
            }));
            const res = await fetch('/api/demandas/lote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ itens })
            });
            const data = await res.json();
            mostrarMensagem(data.message || `${data.totalCriadas} demanda(s) criada(s)!`, 'sucesso');
            onDemandaCriada();
            onClose();
        } catch(e) {
            mostrarMensagem('Erro ao criar demandas.', 'erro');
        } finally {
            setCriandoLote(false);
        }
    };

    // --- Criar demanda única (modo normal) ---
    const handleCriarDemanda = async (dadosDemanda) => {
        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/demandas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(dadosDemanda)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Não foi possível criar a demanda.');
            }
            mostrarMensagem('Demanda criada com sucesso!', 'sucesso');
            onDemandaCriada();
            onClose();
        } catch(error) {
            mostrarMensagem(error.message, 'erro');
        } finally {
            setCarregando(false);
        }
    };

    // --- Toggle de modo ---
    const handleToggleModoExpress = () => {
        setModoExpress(v => !v);
        setCarrinho([]);
        setPrioridadeCarrinho(false);
    };

    // --- Render ---
    const emFaseDetalhe = itemSelecionado || duplicataInfo;
    const mostrarToggle = !emFaseDetalhe && !itemPreSelecionado;

    const renderConteudo = () => {
        // Modo normal: formulário ou tela de duplicata
        if (itemSelecionado) {
            return (
                <FormularioConfirmacao
                    item={itemSelecionado}
                    onConfirmar={handleCriarDemanda}
                    onVoltar={() => setItemSelecionado(null)}
                    carregando={carregando}
                />
            );
        }

        if (duplicataInfo) {
            return (
                <TelaDuplicata
                    item={itemPendente}
                    demandasAtivas={duplicataInfo.demandasAtivas}
                    onCriarMesmoAssim={() => { setItemSelecionado(itemPendente); setDuplicataInfo(null); setItemPendente(null); }}
                    onVoltar={() => { setDuplicataInfo(null); setItemPendente(null); }}
                    onDemandaAtualizada={() => { onDemandaCriada(); onClose(); }}
                />
            );
        }

        // Tela de busca (normal ou express)
        const onItemClick = modoExpress ? handleAdicionarAoCarrinho : handleSelecionarItem;

        return (
            <>
                <div className="gs-input-busca-wrapper">
                    <input
                        type="text"
                        className="gs-input"
                        placeholder="Digite o nome, cor ou SKU do produto..."
                        value={termoBusca}
                        onChange={e => {
                            setTermoBusca(e.target.value);
                            setPaginaAtual(1);
                            buscarProdutos(e.target.value, 1);
                        }}
                        autoFocus
                    />
                    {termoBusca && (
                        <button
                            type="button"
                            className="gs-input-limpar-btn"
                            onClick={() => { setTermoBusca(''); setResultados([]); setPaginacaoInfo(null); }}
                            tabIndex={-1}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    )}
                </div>

                {/* Carrinho (modo Express) */}
                {modoExpress && carrinho.length > 0 && (
                    <CarrinhoSection
                        carrinho={carrinho}
                        onAtualizarQtd={handleAtualizarQtd}
                        onRemover={handleRemoverDoCarrinho}
                        onLimpar={handleLimparCarrinho}
                        prioridade={prioridadeCarrinho}
                        onTogglePrioridade={() => setPrioridadeCarrinho(p => !p)}
                        onCriar={handleCriarLote}
                        criando={criandoLote}
                    />
                )}

                {/* Spinner de verificação (modo normal) */}
                {!modoExpress && verificandoDuplicata && (
                    <div className="gs-add-demanda-buscando">
                        <i className="fas fa-circle-notch fa-spin"></i> Verificando...
                    </div>
                )}

                {/* Recentes */}
                {!verificandoDuplicata && termoBusca === '' && recentes.length > 0 && (
                    <div className="gs-recentes-container">
                        <span className="gs-recentes-titulo">
                            <i className="fas fa-history"></i> Recentes
                        </span>
                        <div className="gs-recentes-pills">
                            {recentes.map(item => (
                                <button key={item.sku} type="button" className="gs-pill-recente"
                                    onClick={() => onItemClick(item)}>
                                    <img src={item.imagem || '/img/placeholder-image.png'} alt={item.nome} />
                                    <span className="gs-pill-recente-nome">{item.nome}</span>
                                    {item.variante && <span className="gs-pill-recente-variante">{item.variante}</span>}
                                    {modoExpress && carrinhoSkus.has(item.sku) && (
                                        <i className="fas fa-check-circle" style={{ color: '#27ae60', marginLeft: 'auto' }}></i>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {!verificandoDuplicata && (
                    <ListaResultadosBusca
                        resultados={resultados}
                        onSelecionar={onItemClick}
                        paginacaoInfo={paginacaoInfo}
                        onPageChange={setPaginaAtual}
                        buscando={buscando}
                        carrinhoSkus={modoExpress ? carrinhoSkus : null}
                    />
                )}
            </>
        );
    };

    return (
        <div className="gs-busca-modal-overlay" onClick={onClose}>
            <div className="gs-busca-modal-conteudo" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="gs-busca-modal-header">
                    <h3>Nova Demanda</h3>
                    {mostrarToggle && (
                        <button
                            type="button"
                            className={`gs-toggle-express-btn${modoExpress ? ' ativo' : ''}`}
                            onClick={handleToggleModoExpress}
                            title="Modo Express: criar múltiplas demandas de uma vez"
                        >
                            <i className="fas fa-shopping-cart"></i>
                            Express
                        </button>
                    )}
                    <button onClick={onClose} className="gs-busca-modal-fechar" style={{ marginLeft: '15px' }}>&times;</button>
                </div>
                <div className="gs-busca-modal-body">
                    {modoExpress && !emFaseDetalhe && (
                        <div className="gs-express-modo-banner">
                            <i className="fas fa-shopping-cart"></i>
                            Você está no <strong>MODO EXPRESS</strong> — selecione os produtos para o carrinho
                        </div>
                    )}
                    {renderConteudo()}
                </div>
            </div>
        </div>
    );
}
