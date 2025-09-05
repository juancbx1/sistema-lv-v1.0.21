// public/src/components/LancamentosView.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import LancamentoFinanceiroCard from './LancamentoFinanceiroCard.jsx';
import FiltrosLancamentos from './FiltrosLancamentos.jsx';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';
import NaoEncontradoBusca from './NaoEncontradoBusca.jsx';

const getLocalDateString = () => {
    const date = new Date();
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - timezoneOffset);
    return localDate.toISOString().split('T')[0];
};

const LoadingSpinner = () => (
    <div className="fc-spinner-container">
        <div className="fc-spinner-dots"><div className="dot-1"></div><div className="dot-2"></div><div className="dot-3"></div></div>
        <span className="fc-spinner-text">Buscando lançamentos...</span>
    </div>
);

const ErrorMessage = ({ message }) => (
    <p style={{ color: 'red', textAlign: 'center', padding: '20px' }}>{message}</p>
);

const LancamentosView = () => {
    // ESTADO PRINCIPAL: Tudo o que a view precisa para renderizar
    const [lancamentos, setLancamentos] = useState([]);
    const [paginacao, setPaginacao] = useState({ currentPage: 1, totalPages: 1 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filtros, setFiltros] = useState(() => {
        // Inicializa o estado dos filtros diretamente com a data de hoje
        const hoje = getLocalDateString();
        return {
            termoBusca: '', dataInicio: hoje, dataFim: hoje,
            tipo: '', idConta: '', tipoRateio: ''
        };
    });
    const [viewKey, setViewKey] = useState(Date.now()); // Chave para forçar o reset

    const timeoutRef = useRef(null);

    // FUNÇÃO DE BUSCA DE DADOS: Única fonte da verdade para buscar na API
    const fetchData = useCallback(async (page, currentFilters) => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const limit = 6;
            const filtrosLimpos = Object.fromEntries(
                Object.entries(currentFilters).filter(([, value]) => value !== '' && value !== null)
            );
            const params = new URLSearchParams({ page, limit, ...filtrosLimpos });
            const response = await fetch(`/api/financeiro/lancamentos?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Falha ao buscar lançamentos');
            }
            const data = await response.json();
            setLancamentos(data.lancamentos);
            setPaginacao({ currentPage: data.page, totalPages: data.pages });
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // EFEITO PRINCIPAL: Reage a mudanças nos filtros ou na página para buscar dados
    useEffect(() => {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            fetchData(paginacao.currentPage, filtros);
        }, 300); // Debounce de 300ms

        return () => clearTimeout(timeoutRef.current);
    }, [filtros, paginacao.currentPage, fetchData]);

    // HANDLER para o reset vindo de fora (troca de aba, aprovação, etc.)
    const handleReset = useCallback(() => {
        setViewKey(Date.now()); // Apenas muda a key para forçar a remontagem
    }, []);
    
    // EFEITO que "ouve" o mundo exterior
    useEffect(() => {
        window.addEventListener('resetarLancamentosView', handleReset);
        return () => window.removeEventListener('resetarLancamentosView', handleReset);
    }, [handleReset]);
    
    // HANDLERS para interações da UI
    const handleFiltrosChange = (novosFiltros) => {
        // Ao mudar o filtro, sempre volta para a página 1
        setPaginacao(p => ({ ...p, currentPage: 1 }));
        setFiltros(novosFiltros);
    };

    const handleRefresh = () => {
        // Ação do botão "Atualizar": busca com os filtros e página atuais
        fetchData(paginacao.currentPage, filtros);
    };
    
    const [expandedCards, setExpandedCards] = useState([]);
    const handleToggleDetails = (cardId) => {
        setExpandedCards(prev => prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]);
    };
    
    // HANDLERS para os MODAIS (usando a função de reset)
    const handleModalSuccess = handleReset; // Após qualquer sucesso no modal, reseta a view

    const handleNew = useCallback(() => {
        if (window.renderReactModal) {
            const modalProps = {
                isOpen: true,
                lancamentoParaEditar: null, // Nulo para modo de criação
                contas: window.contasCache || [],
                categorias: window.categoriasCache || [],
                grupos: window.gruposCache || [],
                permissoes: window.permissoesGlobaisFinanceiro || [],
                onSuccess: () => {
                    handleRefresh();
                }
            };
            modalProps.onClose = () => window.renderReactModal({ ...modalProps, isOpen: false });
            window.renderReactModal(modalProps);
        }
    }, [handleModalSuccess]);

    const handleEdit = useCallback((lancamento) => {
        if (window.renderReactModal) {
            const modalProps = {
                isOpen: true,
                lancamentoParaEditar: lancamento,
                contas: window.contasCache || [],
                categorias: window.categoriasCache || [],
                grupos: window.gruposCache || [],
                permissoes: window.permissoesGlobaisFinanceiro || [],
                onSuccess: () => {
                    handleRefresh();
                }
            };
            modalProps.onClose = () => window.renderReactModal({ ...modalProps, isOpen: false });
            window.renderReactModal(modalProps);
        }
    }, [handleModalSuccess]);

    // Expondo a função de abrir modal para o JS legado
    useEffect(() => {
        window.abrirModalNovoLancamentoReact = handleNew;
        return () => { delete window.abrirModalNovoLancamentoReact; };
    }, [handleNew]);

    // Handlers que chamam o JS legado
    const handleDelete = (lancamento) => {
    if (window.solicitarExclusaoLancamento) {
        window.solicitarExclusaoLancamento(lancamento);
    }
};
    const handleEstorno = (lancamento) => {
        if (window.abrirModalEstorno) window.abrirModalEstorno(lancamento);
    };
    const handleReverterEstorno = (lancamentoId) => {
        if (window.reverterEstorno) window.reverterEstorno(lancamentoId);
    };

    // Efeito para renderizar a paginação legada
    useEffect(() => {
        const paginacaoContainer = document.getElementById('paginacaoLancamentosContainer');
        if (paginacaoContainer) {
            renderizarPaginacao(
                paginacaoContainer,
                paginacao.totalPages,
                paginacao.currentPage,
                (novaPagina) => setPaginacao(p => ({ ...p, currentPage: novaPagina }))
            );
        }
    }, [paginacao]);

    return (
        <div key={viewKey} className="fc-section-container">
            <header className="fc-table-header">
                <h2 className="fc-section-title" style={{border:0, margin:0}}>Histórico de Lançamentos</h2>
                <button 
                    className="fc-btn-atualizar"
                    onClick={handleRefresh}
                    title="Atualizar lista de lançamentos"
                    disabled={isLoading}
                >
                    <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i> Atualizar
                </button>
            </header>
            
            <FiltrosLancamentos 
                onFiltrosChange={handleFiltrosChange}
                contas={window.contasCache || []}
            />
            
            <div id="cards-container-react">
                {isLoading ? (
                    <LoadingSpinner />
                ) : error ? (
                    <ErrorMessage message={error} />
                ) : (
                    lancamentos.length > 0 ? (
                        lancamentos.map(lancamento => (
                            <LancamentoFinanceiroCard 
                                key={lancamento.id} 
                                lancamento={lancamento}
                                onEdit={() => handleEdit(lancamento)}
                                onDelete={() => handleDelete(lancamento)}
                                onEstorno={handleEstorno}
                                onReverterEstorno={handleReverterEstorno}
                                onToggleDetails={handleToggleDetails}
                                isExpanded={expandedCards.includes(lancamento.id)}
                            />
                        ))
                    ) : (
                        <NaoEncontradoBusca 
                            icon="fa-search"
                            title="Nenhum Lançamento Encontrado"
                            message="Tente ajustar os filtros de busca ou o período selecionado para encontrar o que você procura."
                        />
                    )
                )}
            </div>
        </div>
    );
};

export default LancamentosView;