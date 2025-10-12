// public/src/components/TelaSelecaoProduto.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Toast from './ArremateToast.jsx';
import PainelFiltros from './ArrematePainelFiltros.jsx';
import { ArremateCard } from './ArremateCard.jsx';
import Paginacao from './Paginacao.jsx';
import ArremateAcoesLote from './ArremateAcoesLote.jsx';
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
        tamanhos: Array.from(tamanhos).sort((a, b) => (ordemTamanhos[a.toUpperCase()] || 99) - (ordemTamanhos[b.toUpperCase()] || 99)),
    };
}

export default function TelaSelecaoProduto({ onItemSelect, isBatchMode, tiktikContexto, onLoteConfirmado }) {
    const [todosOsItens, setTodosOsItens] = useState([]);
    const [itensFiltrados, setItensFiltrados] = useState([]);
    const [opcoesDeFiltro, setOpcoesDeFiltro] = useState({});
    const [carregando, setCarregando] = useState(true);
    const [atualizando, setAtualizando] = useState(false);
    const [notificacao, setNotificacao] = useState(null); 
    const [erro, setErro] = useState(null);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const ITENS_POR_PAGINA = 6;

    const [modoSelecao, setModoSelecao] = useState(isBatchMode);
    
    const [itensSelecionados, setItensSelecionados] = useState([]);
    const [modalLoteAberto, setModalLoteAberto] = useState(false);
    const [tiktikBusca, setTiktikBusca] = useState('');
    const [tiktikLoteId, setTiktikLoteId] = useState(null);

    const [carregandoLote, setCarregandoLote] = useState(false);

    // <<< CRIA UM EFEITO PARA RESETAR QUANDO O MODO MUDA >>>
    // Este useEffect garante que se o modal for reaberto, os estados sejam limpos.
    useEffect(() => {
        setModoSelecao(isBatchMode);
        setItensSelecionados([]); // Limpa a seleção anterior
    }, [isBatchMode])

    const handleCardClick = (item) => {
        // Esta lógica agora está correta para ambos os fluxos
        if (modoSelecao) {
            setItensSelecionados(prevSelecionados => {
                const jaSelecionado = prevSelecionados.some(i => i.produto_id === item.produto_id && i.variante === item.variante);
                if (jaSelecionado) {
                    return prevSelecionados.filter(i => !(i.produto_id === item.produto_id && i.variante === item.variante));
                } else {
                    return [...prevSelecionados, item];
                }
            });
        } else {
            onItemSelect(item);
        }
    };

    const handleConfirmarAtribuicaoLote = async () => {
        setCarregandoLote(true); // Ativa o estado de carregamento

        try {
            const token = localStorage.getItem('token');
            const payload = {
                tiktikId: tiktikContexto.id,
                itens: itensSelecionados
            };

            const response = await fetch('/api/arremates/sessoes/iniciar-lote', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro desconhecido ao atribuir o lote');
            }

            mostrarMensagem('Lote atribuído com sucesso!', 'sucesso');

            // Limpa tudo e fecha o modal principal
            setModalLoteAberto(false);
            setItensSelecionados([]);
            setModoSelecao(false);
            if (typeof onLoteConfirmado === 'function') {
                onLoteConfirmado();
            }

        } catch (err) {
            console.error("Erro ao atribuir lote:", err);
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        } finally {
            setCarregandoLote(false);
        }
    };

    // <<< VARIÁVEL MEMORIZADA PARA A LISTA DE TIKTIKS FILTRADA >>>
    const tiktiksFiltrados = useMemo(() => {
        const tiktiksLivres = window.statusTiktiksCache?.filter(t => t.status_atual === 'LIVRE')
            // Garante que a lista esteja sempre em ordem alfabética
            .sort((a, b) => a.nome.localeCompare(b.nome)) || [];
        
        // Se o campo de busca estiver VAZIO, mostra apenas os 3 primeiros
        if (!tiktikBusca) {
            return tiktiksLivres.slice(0, 3);
        }

        // Se houver algo digitado, filtra a lista COMPLETA
        return tiktiksLivres.filter(t =>
            t.nome.toLowerCase().includes(tiktikBusca.toLowerCase())
        );
    }, [tiktikBusca]); // A dependência continua sendo apenas a busca

    const buscarDados = useCallback(async () => {
        if (!carregando) setAtualizando(true);
        setErro(null);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Não autenticado");

            const response = await fetch('/api/arremates/fila?fetchAll=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Falha ao buscar dados: ${response.statusText}`);
            
            const data = await response.json();
            const itens = data.rows || [];

            setTodosOsItens(itens);
            setItensFiltrados(itens);
            setOpcoesDeFiltro(extrairOpcoesDeFiltro(itens));

            if (!carregando) {
                setNotificacao({ message: 'Lista de produtos atualizada!', type: 'success' });
            }

        } catch (err) {
            console.error("Erro em TelaSelecaoProduto:", err);
            setErro(err.message);
            // <<< 4. O mesmo para o erro
            setNotificacao({ message: `Falha ao atualizar: ${err.message}`, type: 'error' });
        } finally {
            setCarregando(false);
            setAtualizando(false);
        }
    }, [carregando]);

    useEffect(() => {
        // A chamada para buscar os dados iniciais continua aqui
        buscarDados();

        // Cria um "ouvinte" para o evento disparado pelo JS puro
        const handleAtualizacaoExterna = () => {
            console.log("[React] Evento 'atualizar-fila-react' recebido! Buscando novos dados...");
            buscarDados();
        };

        // Registra o ouvinte
        window.addEventListener('atualizar-fila-react', handleAtualizacaoExterna);

        // Função de limpeza: remove o ouvinte para evitar vazamentos de memória
        return () => {
            window.removeEventListener('atualizar-fila-react', handleAtualizacaoExterna);
        };
        
    }, [buscarDados]);

    const handleFiltrosChange = useCallback((filtros) => {
        let itensParaFiltrar = [...todosOsItens];
        const normalizar = (str = '') => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

        if (filtros.termoBusca) {
            const buscaLower = normalizar(filtros.termoBusca);
            itensParaFiltrar = itensParaFiltrar.filter(item =>
                normalizar(item.produto_nome).includes(buscaLower) ||
                normalizar(item.variante).includes(buscaLower)
            );
        }
        if (filtros.produtos?.length > 0) {
            itensParaFiltrar = itensParaFiltrar.filter(item => filtros.produtos.includes(item.produto_nome));
        }
        if (filtros.cores?.length > 0) {
            itensParaFiltrar = itensParaFiltrar.filter(item => filtros.cores.some(cor => normalizar(item.variante).includes(normalizar(cor))));
        }
        if (filtros.tamanhos?.length > 0) {
            itensParaFiltrar = itensParaFiltrar.filter(item => {
                const varianteNorm = normalizar(item.variante);
                return filtros.tamanhos.some(tamanho => new RegExp(`\\b${normalizar(tamanho)}\\b`, 'i').test(varianteNorm));
            });
        }

        switch (filtros.ordenacao) {
            case 'maior_quantidade': itensParaFiltrar.sort((a, b) => b.saldo_para_arrematar - a.saldo_para_arrematar); break;
            case 'menor_quantidade': itensParaFiltrar.sort((a, b) => a.saldo_para_arrematar - b.saldo_para_arrematar); break;
            case 'mais_antigos': itensParaFiltrar.sort((a, b) => new Date(a.data_op_mais_antiga) - new Date(b.data_op_mais_antiga)); break;
            default: itensParaFiltrar.sort((a, b) => new Date(b.data_op_mais_recente) - new Date(a.data_op_mais_recente)); break;
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
        return <div className="spinner">Carregando produtos na fila...</div>;
    }

    if (erro) {
        return <p className="erro-painel" style={{color: 'red', textAlign: 'center'}}>Erro ao carregar a fila: {erro}</p>;
    }

     return (
    <>
        {/* PARTE 1: O CONTEÚDO VISÍVEL DA PÁGINA (FILTROS E CARDS) */}
        {/* <<< 4. ADICIONA O BANNER DE CONTEXTO >>> */}
            {modoSelecao && tiktikContexto && (
                <div style={{
                    padding: '10px 15px',
                    backgroundColor: '#eaf5ff',
                    border: '1px solid #b8d9f7',
                    borderRadius: '8px',
                    textAlign: 'center',
                    marginBottom: '15px'
                }}>
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
                                const isSelected = itensSelecionados.some(i => i.produto_id === item.produto_id && i.variante === item.variante);
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
                        <p style={{ textAlign: 'center', padding: '20px' }}>Nenhum item encontrado com os filtros aplicados.</p>
                    )}
                </div>

                {totalPaginas > 1 && (
                    <Paginacao
                        paginaAtual={paginaAtual}
                        totalPaginas={totalPaginas}
                        onPageChange={setPaginaAtual}
                    />
                )}
            </div>

            {notificacao && (
                <Toast 
                    message={notificacao.message} 
                    type={notificacao.type} 
                    onDone={() => setNotificacao(null)} 
                />
            )}
        </div>

        {/* PARTE 2: OS ELEMENTOS FLUTUANTES (RODAPÉ E MODAL) */}
        {/* O rodapé de ações só aparece se estivermos em modo de lote */}
            {modoSelecao && (
                <ArremateAcoesLote 
                    contagem={itensSelecionados.length}
                    onAtribuirClick={() => {
                        // Só abre o mini-modal se houver itens selecionados
                        if (itensSelecionados.length > 0) {
                            setModalLoteAberto(true);
                        } else {
                            mostrarMensagem('Selecione pelo menos um produto para o lote.', 'aviso');
                        }
                    }}
                />
            )}

            {/* <<< 5. ESTE É O NOVO MINI-MODAL DE CONFIRMAÇÃO >>> */}
            {modalLoteAberto && (
                <div className="popup-container" style={{ display: 'flex' }}>
                    <div className="popup-overlay" onClick={() => setModalLoteAberto(false)}></div>
                    <div className="oa-modal" style={{ maxWidth: '450px' }}>
                        <div className="oa-modal-header">
                            <h3 className="oa-modal-titulo">Confirmar Lote</h3>
                            <button className="oa-modal-fechar-btn" onClick={() => setModalLoteAberto(false)}>×</button>
                        </div>
                        <div className="oa-modal-body body-lote">
                            <p style={{ textAlign: 'center', fontSize: '1.1rem', lineHeight: '1.5' }}>
                                Você confirma a atribuição de<br/>
                                <strong>{itensSelecionados.length} produto(s)</strong>
                                <br/>para <strong>{tiktikContexto.nome}</strong>?
                            </p>
                            <p style={{textAlign: 'center', fontSize: '0.9rem', color: 'var(--gs-texto-secundario)'}}>
                                As quantidades máximas disponíveis de cada produto serão atribuídas.
                            </p>
                        </div>
                        <div className="oa-modal-footer footer-lote">
                            <button 
                                className="gs-btn gs-btn-sucesso"
                                onClick={handleConfirmarAtribuicaoLote}
                                disabled={carregandoLote} // Desabilita o botão durante o carregamento
                            >
                                {carregandoLote ? (
                                    <div className="spinner-btn-interno"></div>
                                ) : (
                                    <i className="fas fa-check"></i>
                                )}
                                {carregandoLote ? 'Atribuindo...' : 'Sim, Confirmar Atribuição'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}