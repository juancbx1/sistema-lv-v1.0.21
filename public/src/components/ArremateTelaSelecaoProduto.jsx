// public/src/components/ArremateTelaSelecaoProduto.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PainelFiltros from './ArrematePainelFiltros.jsx';
import { ArremateCard } from './ArremateCard.jsx';
import UIPaginacao from './UIPaginacao.jsx';
import UICarregando from './UICarregando.jsx';
import UIFeedbackNotFound from './UIFeedbackNotFound.jsx';
import { mostrarMensagem } from '/js/utils/popups.js';

// Função auxiliar para extrair as opções para os menus de filtro
function extrairOpcoesDeFiltro(itensDaFila) {
    const produtos = new Set();
    const cores = new Set();
    const tamanhos = new Set();

    itensDaFila.forEach(item => {
        if (item.produto_nome) {
            produtos.add(item.produto_nome);
        }
        if (item.variante && item.variante !== '-') {
            const partes = item.variante.split('|').map(p => p.trim());
            partes.forEach(parte => {
                if (['P', 'M', 'G', 'GG', 'U', 'UNICO'].includes(parte.toUpperCase())) {
                    tamanhos.add(parte);
                } else if (parte) {
                    const subCores = parte.split(/ com | e /i).map(c => c.trim());
                    subCores.forEach(subCor => cores.add(subCor));
                }
            });
        }
    });

    const ordemTamanhos = { 'P': 1, 'M': 2, 'G': 3, 'GG': 4, 'U': 5, 'UNICO': 6 };
    return {
        produtos: Array.from(produtos).sort(),
        cores: Array.from(cores).sort(),
        tamanhos: Array.from(tamanhos).sort((a, b) =>
            (ordemTamanhos[a.toUpperCase()] || 99) - (ordemTamanhos[b.toUpperCase()] || 99)
        ),
    };
}

export default function ArremateTelaSelecaoProduto({
    onItemSelect,
    isBatchMode,
    tiktikContexto,
    onLoteConfirmado,
    itensPréselecionados,
}) {
    const [todosOsItens, setTodosOsItens] = useState([]);
    const [itensFiltrados, setItensFiltrados] = useState([]);
    const [opcoesDeFiltro, setOpcoesDeFiltro] = useState({});
    const [carregando, setCarregando] = useState(true);
    const [atualizando, setAtualizando] = useState(false);
    const [erro, setErro] = useState(null);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const ITENS_POR_PAGINA = 6;

    const [modoSelecao, setModoSelecao] = useState(isBatchMode);
    const [itensSelecionados, setItensSelecionados] = useState([]);
    const [modalLoteAberto, setModalLoteAberto] = useState(false);
    const [carregandoLote, setCarregandoLote] = useState(false);

    // Resetar quando o modal for reaberto ou modo mudar
    useEffect(() => {
        setModoSelecao(isBatchMode);
        setItensSelecionados([]);
    }, [isBatchMode]);

    // Aplicar pré-seleção externa (ex: Auto-Lote IA)
    useEffect(() => {
        if (itensPréselecionados?.length > 0) {
            setItensSelecionados(itensPréselecionados);
        }
    }, [itensPréselecionados]);

    const handleCardClick = (item) => {
        if (modoSelecao) {
            setItensSelecionados(prev => {
                const jaSelecionado = prev.some(
                    i => i.produto_id === item.produto_id && i.variante === item.variante
                );
                if (jaSelecionado) {
                    return prev.filter(
                        i => !(i.produto_id === item.produto_id && i.variante === item.variante)
                    );
                }
                return [...prev, item];
            });
        } else {
            onItemSelect(item);
        }
    };

    const handleConfirmarAtribuicaoLote = async () => {
        setCarregandoLote(true);
        try {
            const token = localStorage.getItem('token');
            const payload = { tiktikId: tiktikContexto.id, itens: itensSelecionados };
            const response = await fetch('/api/arremates/sessoes/iniciar-lote', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro desconhecido ao atribuir o lote');
            }
            mostrarMensagem('Lote atribuído com sucesso!', 'sucesso');
            setModalLoteAberto(false);
            setItensSelecionados([]);
            setModoSelecao(false);
            if (typeof onLoteConfirmado === 'function') onLoteConfirmado();
        } catch (err) {
            console.error('Erro ao atribuir lote:', err);
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        } finally {
            setCarregandoLote(false);
        }
    };

    const buscarDados = useCallback(async () => {
        if (!carregando) setAtualizando(true);
        setErro(null);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('Não autenticado');
            const response = await fetch('/api/arremates/fila?fetchAll=true', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) throw new Error(`Falha ao buscar dados: ${response.statusText}`);
            const data = await response.json();
            const itens = data.rows || [];
            setTodosOsItens(itens);
            setItensFiltrados(itens);
            setOpcoesDeFiltro(extrairOpcoesDeFiltro(itens));
        } catch (err) {
            console.error('Erro em ArremateTelaSelecaoProduto:', err);
            setErro(err.message);
        } finally {
            setCarregando(false);
            setAtualizando(false);
        }
    }, [carregando]);

    useEffect(() => {
        buscarDados();
        const handleAtualizacaoExterna = () => buscarDados();
        window.addEventListener('atualizar-fila-react', handleAtualizacaoExterna);
        return () => window.removeEventListener('atualizar-fila-react', handleAtualizacaoExterna);
    }, [buscarDados]);

    const handleFiltrosChange = useCallback((filtros) => {
        let itensParaFiltrar = [...todosOsItens];
        const normalizar = (str = '') =>
            str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

        if (filtros.termoBusca) {
            const buscaLower = normalizar(filtros.termoBusca);
            itensParaFiltrar = itensParaFiltrar.filter(item =>
                normalizar(item.produto_nome).includes(buscaLower) ||
                normalizar(item.variante).includes(buscaLower)
            );
        }
        if (filtros.produtos?.length > 0) {
            itensParaFiltrar = itensParaFiltrar.filter(item =>
                filtros.produtos.includes(item.produto_nome)
            );
        }
        if (filtros.cores?.length > 0) {
            itensParaFiltrar = itensParaFiltrar.filter(item =>
                filtros.cores.some(cor =>
                    normalizar(item.variante).includes(normalizar(cor))
                )
            );
        }
        if (filtros.tamanhos?.length > 0) {
            itensParaFiltrar = itensParaFiltrar.filter(item => {
                const varianteNorm = normalizar(item.variante);
                return filtros.tamanhos.some(tamanho =>
                    new RegExp(`\\b${normalizar(tamanho)}\\b`, 'i').test(varianteNorm)
                );
            });
        }

        switch (filtros.ordenacao) {
            case 'maior_quantidade':
                itensParaFiltrar.sort((a, b) => b.saldo_para_arrematar - a.saldo_para_arrematar);
                break;
            case 'menor_quantidade':
                itensParaFiltrar.sort((a, b) => a.saldo_para_arrematar - b.saldo_para_arrematar);
                break;
            case 'mais_antigos':
                itensParaFiltrar.sort(
                    (a, b) => new Date(a.data_op_mais_antiga) - new Date(b.data_op_mais_antiga)
                );
                break;
            default:
                itensParaFiltrar.sort(
                    (a, b) => new Date(b.data_op_mais_recente) - new Date(a.data_op_mais_recente)
                );
        }

        setItensFiltrados(itensParaFiltrar);
        setPaginaAtual(1);
    }, [todosOsItens]);

    const { itensDaPagina, totalPaginas } = useMemo(() => {
        const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
        const fim = inicio + ITENS_POR_PAGINA;
        return {
            itensDaPagina: itensFiltrados.slice(inicio, fim),
            totalPaginas: Math.ceil(itensFiltrados.length / ITENS_POR_PAGINA) || 1,
        };
    }, [itensFiltrados, paginaAtual]);

    if (carregando) {
        return <UICarregando variante="bloco" texto="Carregando fila de arremates..." />;
    }

    if (erro) {
        return (
            <p className="erro-painel" style={{ color: 'red', textAlign: 'center' }}>
                Erro ao carregar a fila: {erro}
            </p>
        );
    }

    return (
        <>
            {/* Banner de contexto de lote */}
            {modoSelecao && tiktikContexto && (
                <div className="arremate-banner-contexto">
                    Atribuindo lote para: <strong>{tiktikContexto.nome}</strong>
                </div>
            )}

            <div className="layout-selecao-produto">
                <div className="coluna-filtros">
                    <PainelFiltros
                        opcoesDeFiltro={opcoesDeFiltro}
                        onFiltrosChange={handleFiltrosChange}
                        onAtualizarClick={buscarDados}
                        atualizando={atualizando}
                    />
                </div>

                <div className="coluna-conteudo-principal">
                    <div className="gs-container-cards" style={{ marginTop: '0' }}>
                        {itensFiltrados.length > 0 ? (
                            <div className="oa-cards-container-arremate">
                                {itensDaPagina.map(item => {
                                    const isSelected = itensSelecionados.some(
                                        i => i.produto_id === item.produto_id && i.variante === item.variante
                                    );
                                    return (
                                        <ArremateCard
                                            key={`${item.produto_id}-${item.variante}`}
                                            item={item}
                                            onClick={handleCardClick}
                                            isSelected={isSelected}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <UIFeedbackNotFound
                                icon="fa-cut"
                                titulo="Nenhum Produto na Fila"
                                mensagem="Não há produtos aguardando arremate ou os filtros aplicados não encontraram resultados."
                            />
                        )}
                    </div>

                    {totalPaginas > 1 && (
                        <UIPaginacao
                            paginaAtual={paginaAtual}
                            totalPaginas={totalPaginas}
                            onPageChange={setPaginaAtual}
                        />
                    )}
                </div>
            </div>

            {/* FAB de seleção — aparece com 1+ itens selecionados */}
            {modoSelecao && itensSelecionados.length > 0 && (
                <button
                    className="op-selecao-fab"
                    onClick={() => {
                        if (itensSelecionados.length === 1) {
                            // Individual: vai para tela de confirmação de quantidade
                            onItemSelect(itensSelecionados[0]);
                        } else {
                            // Lote: abre mini-modal de confirmação
                            setModalLoteAberto(true);
                        }
                    }}
                >
                    <span className="op-selecao-fab-badge">{itensSelecionados.length}</span>
                    {itensSelecionados.length === 1 ? 'Atribuir Tarefa' : 'Atribuir Tarefas'}
                </button>
            )}

            {/* Mini-modal de confirmação de lote */}
            {modalLoteAberto && (
                <div className="popup-container" style={{ display: 'flex' }}>
                    <div className="popup-overlay" onClick={() => setModalLoteAberto(false)}></div>
                    <div className="oa-modal" style={{ maxWidth: '450px' }}>
                        <div className="oa-modal-header">
                            <h3 className="oa-modal-titulo">Confirmar Lote</h3>
                            <button
                                className="oa-modal-fechar-btn"
                                onClick={() => setModalLoteAberto(false)}
                            >×</button>
                        </div>
                        <div className="oa-modal-body body-lote">
                            <p style={{ textAlign: 'center', fontSize: '1.1rem', lineHeight: '1.5' }}>
                                Você confirma a atribuição de<br />
                                <strong>{itensSelecionados.length} produto(s)</strong>
                                <br />para <strong>{tiktikContexto?.nome}</strong>?
                            </p>
                            <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--gs-texto-secundario)' }}>
                                As quantidades máximas disponíveis de cada produto serão atribuídas.
                            </p>
                        </div>
                        <div className="oa-modal-footer footer-lote">
                            <button
                                className="gs-btn gs-btn-sucesso"
                                onClick={handleConfirmarAtribuicaoLote}
                                disabled={carregandoLote}
                            >
                                {carregandoLote
                                    ? <><div className="spinner-btn-interno"></div> Atribuindo...</>
                                    : <><i className="fas fa-check"></i> Sim, Confirmar Atribuição</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
