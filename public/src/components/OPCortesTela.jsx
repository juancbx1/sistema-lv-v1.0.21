// public/src/components/OPCortesTela.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import OPSelecaoProdutoCorte from './OPSelecaoProdutoCorte.jsx';
import OPSelecaoVarianteCorte from './OPSelecaoVarianteCorte.jsx';
import OPRegistroCorte from './OPRegistroCorte.jsx';
import OPCorteEstoqueCard from './OPCorteEstoqueCard.jsx';
import OPFormulario from './OPFormulario.jsx';
import OPCriarModal from './OPCriarModal.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import OPCortesRadar from './OPCortesRadar.jsx';
import OPCortesAgente from './OPCortesAgente.jsx';
import OPQuickLogModal from './OPQuickLogModal.jsx';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';
import UICarregando from './UICarregando.jsx';

async function fetchCortesEmEstoque() {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/cortes?status=cortados', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Falha ao buscar cortes em estoque.');
    const cortes = await response.json();
    return cortes.filter(corte => corte.op === null);
}

export default function OPCortesTela() {
    // ── Estado principal ──
    const [passo, setPasso] = useState(0);
    const [corteSelecionado, setCorteSelecionado] = useState(null);
    const [produtos, setProdutos] = useState([]);
    const [cortesEmEstoque, setCortesEmEstoque] = useState([]);
    const [produtoSelecionado, setProdutoSelecionado] = useState(null);
    const [varianteSelecionada, setVarianteSelecionada] = useState(null);
    const [quantidadePreenchida, setQuantidadePreenchida] = useState('');
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [usuarioLogado, setUsuarioLogado] = useState(null);
    const [gerandoOP, setGerandoOP] = useState(null);
    const [paginaCortes, setPaginaCortes] = useState(1);

    // ── OPCriarModal (Modo 2 — Estoque de Cortes) ──
    const [opCriarModalAberto, setOpCriarModalAberto] = useState(false);
    const [corteParaOP, setCorteParaOP] = useState(null);

    // ── Estado novo ──
    const [quickLogAberto, setQuickLogAberto] = useState(false);
    const [quickLogPreenchido, setQuickLogPreenchido] = useState(null); // {produto, variante, quantidadeSugerida}
    const [radarRefreshKey, setRadarRefreshKey] = useState(0);
    const [agenteRescanKey, setAgenteRescanKey] = useState(0);
    const [agenteEstado, setAgenteEstado] = useState('idle');
    const agenteRef = useRef(null);
    const [refreshingEstoque, setRefreshingEstoque] = useState(false);
    const primeiroLoad = useRef(true);

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
        }
    }, []);

    useEffect(() => { carregarDados(); }, [carregarDados]);

    // ── Auto-start: dispara o agente assim que os dados carregam pela primeira vez ──
    useEffect(() => {
        if (!carregando && produtos.length > 0 && primeiroLoad.current) {
            primeiroLoad.current = false;
            setAgenteRescanKey(k => k + 1);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [carregando, produtos.length]);

    // ── Auto-refresh ao retornar à aba do navegador ──
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            carregarDados();
            if (agenteEstado === 'done') setAgenteRescanKey(k => k + 1);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [carregarDados, agenteEstado]);

    // ── Rescan ao fechar o Painel de Demandas (gaveta no mesmo DOM) ──
    // Só rescana o agente — o restante da aba não precisa recarregar.
    useEffect(() => {
        const handlePainelFechado = () => {
            if (agenteEstado === 'done') setAgenteRescanKey(k => k + 1);
        };
        window.addEventListener('painel-demandas-fechado', handlePainelFechado);
        return () => window.removeEventListener('painel-demandas-fechado', handlePainelFechado);
    }, [agenteEstado]);

    // ── Refresh manual do estoque (apenas cortes, sem recarregar tudo) ──
    const handleRefreshEstoque = useCallback(async () => {
        setRefreshingEstoque(true);
        try {
            const cortesData = await fetchCortesEmEstoque();
            setCortesEmEstoque(cortesData);
            setPaginaCortes(1);
            setRadarRefreshKey(k => k + 1);
        } catch {
            mostrarMensagem('Erro ao atualizar estoque.', 'erro');
        } finally {
            setRefreshingEstoque(false);
        }
    }, []);

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


    // ── Handlers do wizard ──
    const handleProdutoSelect = (produto) => { setProdutoSelecionado(produto); setPasso(2); };
    const handleVarianteSelect = (variante) => { setVarianteSelecionada(variante); setPasso(3); };

    const handleCorteRegistrado = () => {
        setProdutoSelecionado(null);
        setVarianteSelecionada(null);
        setQuantidadePreenchida('');
        setPasso(0);
        setGerandoOP(null);
        setRadarRefreshKey(k => k + 1);
        carregarDados();
    };

    const handleGerarOP = (corte) => {
        if (gerandoOP) return;
        setCorteParaOP(corte);
        setOpCriarModalAberto(true);
    };

    const handleOPCriada = () => {
        setCorteSelecionado(null);
        setPasso(0);
        setGerandoOP(null);
        carregarDados();
    };

    const handleOPCriadaModal = () => {
        setOpCriarModalAberto(false);
        setCorteParaOP(null);
        setGerandoOP(null);
        carregarDados();
    };

    const voltarPasso = () => {
        if (passo === 4) {
            setGerandoOP(null);
            setCorteSelecionado(null);
            setPasso(0);
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
                                className="op-cortes-btn-avancado op-cortes-btn-em-breve"
                                disabled
                                title="Funcionalidade em desenvolvimento"
                            >
                                <i className="fas fa-lock"></i>
                                Em breve
                            </button>
                        </div>
                    )}

                    {/* Botão do agente — fica sempre na linha dos outros botões */}
                    {!quickLogAberto && (
                        <button
                            className={`op-agente-corte-btn${agenteEstado !== 'idle' ? ` ${agenteEstado}` : ''}`}
                            onClick={() => agenteRef.current?.handleClick()}
                            title={agenteEstado === 'done' ? 'Fechar o Agente de Corte' : 'Abrir Agente de Corte'}
                        >
                            <i className="fas fa-robot agente-corte-icon"></i>
                            <span>
                                {agenteEstado === 'idle' ? 'Agente de Corte'
                                : agenteEstado === 'scanning' ? 'Analisando...'
                                : 'Fechar Agente'}
                            </span>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <h3 className="op-cortes-estoque-titulo">
                                    <i className="fas fa-boxes"></i>
                                    Estoque de Cortes
                                </h3>
                                <button
                                    className="op-cortes-refresh-btn"
                                    onClick={handleRefreshEstoque}
                                    disabled={refreshingEstoque}
                                    title="Atualizar estoque"
                                >
                                    <i className={`fas fa-sync-alt${refreshingEstoque ? ' fa-spin' : ''}`}></i>
                                </button>
                            </div>
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
                                            isGerando={opCriarModalAberto && corteParaOP?.id === corte.id}
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
            {carregando && <UICarregando variante="bloco" />}

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
                    />
                </>
            )}

            {/* Modal rápido de criação de OP — Modo 2 (Estoque de Cortes) */}
            {corteParaOP && (
                <OPCriarModal
                    isOpen={opCriarModalAberto}
                    onClose={() => { setOpCriarModalAberto(false); setCorteParaOP(null); setGerandoOP(null); }}
                    onOPCriada={handleOPCriadaModal}
                    corteExistente={corteParaOP}
                />
            )}
        </div>
    );
}
