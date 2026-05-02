// public/src/components/OPCortesTela.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import OPSelecaoProdutoCorte from './OPSelecaoProdutoCorte.jsx';
import OPSelecaoVarianteCorte from './OPSelecaoVarianteCorte.jsx';
import OPRegistroCorte from './OPRegistroCorte.jsx';
import OPCorteEstoqueCard from './OPCorteEstoqueCard.jsx';
import OPFormulario from './OPFormulario.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import OPCortesRadar from './OPCortesRadar.jsx';
import OPCortesAgente from './OPCortesAgente.jsx';
import OPQuickLogModal from './OPQuickLogModal.jsx';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';

async function fetchCortesEmEstoque() {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/cortes?status=cortados', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Falha ao buscar cortes em estoque.');
    const cortes = await response.json();
    return cortes.filter(corte => corte.op === null);
}

// Terminal de inicialização — exibido apenas no primeiro carregamento
function InitTerminal() {
    const [fase, setFase] = useState(0);
    useEffect(() => {
        if (fase >= 2) return;
        const t = setTimeout(() => setFase(f => f + 1), 650);
        return () => clearTimeout(t);
    }, [fase]);
    const msgs = [
        'Conectando ao setor de cortes...',
        'Carregando estoque de cortes...',
        'Verificando alertas...',
    ];
    const visiveis = msgs.slice(0, fase + 1);
    return (
        <div className="op-init-terminal">
            {visiveis.map((msg, i) => (
                <div key={i} className={`op-init-linha ${i < visiveis.length - 1 ? 'ok' : 'atual'}`}>
                    <span className="init-prompt">›</span>
                    <span>{msg}</span>
                    {i === visiveis.length - 1 && <span className="agente-cursor">▌</span>}
                </div>
            ))}
        </div>
    );
}

export default function OPCortesTela({ demandaInicial, onLimparDemanda }) {
    // ── Estado principal (mantido do original) ──
    const [passo, setPasso] = useState(0);
    const [corteSelecionado, setCorteSelecionado] = useState(null);
    const [produtos, setProdutos] = useState([]);
    const [cortesEmEstoque, setCortesEmEstoque] = useState([]);
    const [produtoSelecionado, setProdutoSelecionado] = useState(null);
    const [varianteSelecionada, setVarianteSelecionada] = useState(null);
    const [quantidadePreenchida, setQuantidadePreenchida] = useState('');
    const [demandaIdAtiva, setDemandaIdAtiva] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [usuarioLogado, setUsuarioLogado] = useState(null);
    const [gerandoOP, setGerandoOP] = useState(null);
    const [paginaCortes, setPaginaCortes] = useState(1);

    // ── Estado novo ──
    const [quickLogAberto, setQuickLogAberto] = useState(false);
    const [quickLogPreenchido, setQuickLogPreenchido] = useState(null); // {produto, variante, quantidadeSugerida}
    const [radarRefreshKey, setRadarRefreshKey] = useState(0);
    const [agenteRescanKey, setAgenteRescanKey] = useState(0);
    const [agenteEstado, setAgenteEstado] = useState('idle');
    const agenteRef = useRef(null);

    const isFirstLoadRef = useRef(true);
    const ITENS_POR_PAGINA_CORTES = 6;

    // ── Carregamento de dados ──
    const carregarDados = useCallback(async () => {
        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('Não autenticado');

            const [todosProdutos, dadosUsuario, cortesData] = await Promise.all([
                obterProdutosDoStorage(),
                fetch('/api/usuarios/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(res => res.json()),
                fetchCortesEmEstoque()
            ]);

            if (dadosUsuario.error) throw new Error(dadosUsuario.error);

            setProdutos(todosProdutos.filter(p => !p.is_kit));
            setUsuarioLogado(dadosUsuario);
            setCortesEmEstoque(cortesData);
            setPaginaCortes(1);
        } catch (err) {
            setErro(`Falha ao carregar dados: ${err.message}`);
        } finally {
            setCarregando(false);
            isFirstLoadRef.current = false;
        }
    }, []);

    useEffect(() => { carregarDados(); }, [carregarDados]);

    // ── Exclusão de corte ──
    const handleExcluirCorte = async (corte) => {
        const confirmado = await mostrarConfirmacao(
            `Excluir o corte PC #${corte.pn} (${corte.quantidade} pçs)?\nEsta ação remove o corte do estoque.`,
            { tipo: 'perigo', textoConfirmar: 'Sim, Excluir', textoCancelar: 'Cancelar' }
        );
        if (!confirmado) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/cortes', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: corte.id })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Falha ao excluir corte.');
            }
            mostrarMensagem('Corte excluído com sucesso.', 'sucesso');
            setRadarRefreshKey(k => k + 1);
            carregarDados();
        } catch (err) {
            mostrarMensagem(err.message, 'erro');
        }
    };

    // ── Quick Log: sucesso ──
    const handleQuickLogSuccess = () => {
        const vinhDoAgente = !!quickLogPreenchido;
        setQuickLogAberto(false);
        setQuickLogPreenchido(null);
        setRadarRefreshKey(k => k + 1);
        carregarDados();
        // Se o corte foi via agente, dispara rescan automático do plano
        if (vinhDoAgente) {
            setAgenteRescanKey(k => k + 1);
        }
    };

    // ── Agente: "Cortar Agora" pré-preenche o Quick-Log ──
    const handleCortarAgora = ({ produto, variante, quantidadeSugerida }) => {
        setQuickLogPreenchido({ produto, variante, quantidadeSugerida });
        setQuickLogAberto(true);
    };

    // ── Automação via demanda (preservada do original) ──
    useEffect(() => {
        if (!demandaInicial || produtos.length === 0 || carregando) return;

        const { produto_id, variante, quantidade, demanda_id } = demandaInicial;
        setDemandaIdAtiva(demanda_id);

        const produtoAlvo = produtos.find(p => p.id === produto_id);
        if (!produtoAlvo) {
            mostrarMensagem('Erro: Produto da demanda não encontrado.', 'erro');
            onLimparDemanda();
            return;
        }

        const normalizarVariante = (v) => (!v || v === '-' || v === '') ? null : v;
        const varianteAlvo = normalizarVariante(variante);

        const cortesDoProduto = cortesEmEstoque.filter(c =>
            c.produto_id === produto_id &&
            normalizarVariante(c.variante) === varianteAlvo
        );

        const cortePerfeito = cortesDoProduto.find(c => c.quantidade >= quantidade);

        if (cortePerfeito) {
            mostrarMensagem(`Corte ideal encontrado (PC: ${cortePerfeito.pn})!`, 'sucesso');
            setGerandoOP(cortePerfeito.id);
            setCorteSelecionado(cortePerfeito);
            setPasso(4);
        } else if (cortesDoProduto.length > 0) {
            const melhor = [...cortesDoProduto].sort((a, b) => b.quantidade - a.quantidade)[0];
            mostrarConfirmacao(
                `Você precisa de ${quantidade} peças, mas o maior corte tem ${melhor.quantidade}.\n\nDeseja usar este corte parcial?`,
                { tipo: 'aviso', textoConfirmar: `Usar Corte de ${melhor.quantidade}`, textoCancelar: 'Não, fazer novo corte' }
            ).then((usarParcial) => {
                if (usarParcial) {
                    setGerandoOP(melhor.id);
                    setCorteSelecionado(melhor);
                    setPasso(4);
                } else {
                    setProdutoSelecionado(produtoAlvo);
                    setVarianteSelecionada(variante);
                    setQuantidadePreenchida(quantidade);
                    setPasso(3);
                }
            });
        } else {
            mostrarMensagem('Nenhum corte em estoque. Abrindo registro de novo corte.', 'info');
            setProdutoSelecionado(produtoAlvo);
            setVarianteSelecionada(variante);
            setQuantidadePreenchida(quantidade);
            setPasso(3);
        }
        onLimparDemanda();
    }, [demandaInicial, produtos, cortesEmEstoque, carregando, onLimparDemanda]);

    // ── Handlers do wizard ──
    const handleProdutoSelect = (produto) => { setProdutoSelecionado(produto); setPasso(2); };
    const handleVarianteSelect = (variante) => { setVarianteSelecionada(variante); setPasso(3); };

    const handleCorteRegistrado = (novoCorte) => {
        setProdutoSelecionado(null);
        setVarianteSelecionada(null);
        setQuantidadePreenchida('');
        if (demandaIdAtiva && novoCorte) {
            setCorteSelecionado(novoCorte);
            setGerandoOP(novoCorte.id);
            setPasso(4);
            carregarDados();
        } else {
            setPasso(0);
            setGerandoOP(null);
            setDemandaIdAtiva(null);
            setRadarRefreshKey(k => k + 1);
            carregarDados();
        }
    };

    const handleGerarOP = (corte) => {
        if (gerandoOP) return;
        setGerandoOP(corte.id);
        setCorteSelecionado(corte);
        setPasso(4);
    };

    const handleOPCriada = () => {
        setCorteSelecionado(null);
        setPasso(0);
        setGerandoOP(null);
        setDemandaIdAtiva(null);
        carregarDados();
    };

    const voltarPasso = () => {
        if (passo === 4) {
            setGerandoOP(null);
            setCorteSelecionado(null);
            setPasso(0);
            setDemandaIdAtiva(null);
            return;
        }
        if (passo === 1) setProdutoSelecionado(null);
        if (passo === 2) setVarianteSelecionada(null);
        if (passo === 3) setQuantidadePreenchida('');
        if (passo > 1) setPasso(passo - 1);
        else {
            setPasso(0);
            setProdutoSelecionado(null);
            setVarianteSelecionada(null);
            setDemandaIdAtiva(null);
        }
    };

    // ── Render da vista principal (passo 0) ──
    const renderVistaPrincipal = () => {
        const totalPaginasCortes = Math.ceil(cortesEmEstoque.length / ITENS_POR_PAGINA_CORTES);
        const cortesPaginados = cortesEmEstoque.slice(
            (paginaCortes - 1) * ITENS_POR_PAGINA_CORTES,
            paginaCortes * ITENS_POR_PAGINA_CORTES
        );

        return (
            <>
                {/* RADAR */}
                <OPCortesRadar refreshKey={radarRefreshKey} />

                {/* AÇÕES + BOTÃO DO AGENTE — linha horizontal */}
                <div className="op-cortes-controles">
                    {!quickLogAberto && (
                        <div className="op-cortes-acoes-btns">
                            <button
                                className="op-cortes-btn-quicklog"
                                onClick={() => { setQuickLogPreenchido(null); setQuickLogAberto(true); }}
                            >
                                <i className="fas fa-bolt"></i>
                                Registrar Corte
                            </button>
                            <button
                                className="op-cortes-btn-avancado"
                                onClick={() => setPasso(1)}
                                title="Fluxo completo com mais opções"
                            >
                                <i className="fas fa-sliders-h"></i>
                                Modo Avançado
                            </button>
                        </div>
                    )}

                    {/* Botão do agente — fica sempre na linha dos outros botões */}
                    {!quickLogAberto && (
                        <button
                            className={`op-cortes-agente-btn ${agenteEstado !== 'idle' ? 'ativo' : ''}`}
                            onClick={() => agenteRef.current?.handleClick()}
                            disabled={agenteEstado === 'scanning'}
                            title={agenteEstado === 'idle' ? 'Gerar plano de corte do dia' : 'Fechar agente'}
                        >
                            <i className={`fas fa-${agenteEstado === 'scanning' ? 'circle-notch fa-spin' : 'robot'}`}></i>
                            {agenteEstado === 'idle' && 'Plano de Corte'}
                            {agenteEstado === 'scanning' && 'Analisando...'}
                            {agenteEstado === 'done' && 'Fechar Agente'}
                        </button>
                    )}
                </div>

                {/* Conteúdo do agente — bloco full-width abaixo dos controles */}
                {!quickLogAberto && (
                    <OPCortesAgente
                        ref={agenteRef}
                        produtos={produtos}
                        onCortarAgora={handleCortarAgora}
                        rescanKey={agenteRescanKey}
                        onStateChange={setAgenteEstado}
                    />
                )}

                {/* Quick-Log inline (abre embaixo dos controles) */}
                {quickLogAberto && (
                    <div className="op-cortes-acoes-header">
                        <OPQuickLogModal
                            produtos={produtos}
                            usuario={usuarioLogado}
                            onClose={() => { setQuickLogAberto(false); setQuickLogPreenchido(null); }}
                            onSuccess={handleQuickLogSuccess}
                            preenchido={quickLogPreenchido}
                        />
                    </div>
                )}

                {/* ESTOQUE */}
                {!quickLogAberto && (
                    <div className="op-cortes-estoque-secao">
                        <div className="op-cortes-estoque-titulo-row">
                            <h3 className="op-cortes-estoque-titulo">
                                <i className="fas fa-boxes"></i>
                                Estoque de Cortes
                            </h3>
                            {cortesEmEstoque.length > 0 && (
                                <span className="op-cortes-estoque-badge">
                                    {cortesEmEstoque.length} {cortesEmEstoque.length === 1 ? 'lote' : 'lotes'}
                                </span>
                            )}
                        </div>

                        <div className="op-cards-container">
                            {cortesPaginados.length > 0 ? (
                                cortesPaginados.map(corte => {
                                    const produtoCompleto = produtos.find(p => p.id === corte.produto_id);
                                    return (
                                        <OPCorteEstoqueCard
                                            key={corte.id}
                                            corte={corte}
                                            produto={produtoCompleto}
                                            onGerarOP={handleGerarOP}
                                            onExcluir={handleExcluirCorte}
                                            isGerando={gerandoOP === corte.id}
                                        />
                                    );
                                })
                            ) : (
                                <div className="op-cortes-estoque-vazio">
                                    <i className="fas fa-cut"></i>
                                    <p>Nenhum corte em estoque no momento.</p>
                                    <span>Use "Registrar Corte" acima para adicionar peças ao estoque.</span>
                                </div>
                            )}
                        </div>

                        {totalPaginasCortes > 1 && (
                            <OPPaginacaoWrapper
                                totalPages={totalPaginasCortes}
                                currentPage={paginaCortes}
                                onPageChange={setPaginaCortes}
                            />
                        )}
                    </div>
                )}
            </>
        );
    };

    return (
        <div className="gs-card">
            {/* Header com voltar (wizard) */}
            {passo > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                    <button className="btn-voltar-header" onClick={voltarPasso}>
                        <i className="fas fa-arrow-left"></i> Voltar
                    </button>
                    <h2 className="op-titulo-secao" style={{ flexGrow: 1, textAlign: 'center', borderBottom: 'none', marginBottom: 0 }}>
                        Área de Cortes
                    </h2>
                    <div className="op-header-spacer"></div>
                </div>
            )}

            {/* Init terminal */}
            {carregando && isFirstLoadRef.current && <InitTerminal />}

            {erro && <p style={{ color: 'red', textAlign: 'center' }}>{erro}</p>}

            {/* Vista principal */}
            {!carregando && !erro && passo === 0 && renderVistaPrincipal()}

            {/* Wizard */}
            {!carregando && !erro && passo === 1 && (
                <>
                    <h3 className="op-subtitulo-secao">Passo 1: Selecione o Produto</h3>
                    <OPSelecaoProdutoCorte produtos={produtos} onProdutoSelect={handleProdutoSelect} />
                </>
            )}
            {!carregando && !erro && passo === 2 && (
                <>
                    <h3 className="op-subtitulo-secao">Passo 2: Selecione a Variação de "{produtoSelecionado?.nome}"</h3>
                    <OPSelecaoVarianteCorte produto={produtoSelecionado} onVarianteSelect={handleVarianteSelect} />
                </>
            )}
            {!carregando && !erro && passo === 3 && (
                <>
                    <h3 className="op-subtitulo-secao">Passo 3: Informe a Quantidade</h3>
                    <OPRegistroCorte
                        key={quantidadePreenchida ? `corte-pre-${quantidadePreenchida}` : 'corte-novo'}
                        produto={produtoSelecionado}
                        variante={varianteSelecionada}
                        usuario={usuarioLogado}
                        onCorteRegistrado={handleCorteRegistrado}
                        quantidadeInicial={quantidadePreenchida}
                        demandaId={demandaIdAtiva}
                    />
                </>
            )}
            {!carregando && !erro && passo === 4 && (
                <>
                    <h3 className="op-subtitulo-secao">Gerar Ordem de Produção</h3>
                    <OPFormulario
                        corteSelecionado={corteSelecionado}
                        onOPCriada={handleOPCriada}
                        onSetGerando={setGerandoOP}
                        demandaId={demandaIdAtiva}
                    />
                </>
            )}
        </div>
    );
}
