// public/src/components/LancamentosView.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import LancamentoFinanceiroCard from './LancamentoFinanceiroCard.jsx';
import FiltrosLancamentos from './FiltrosLancamentos.jsx';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';
import NaoEncontradoBusca from './NaoEncontradoBusca.jsx';

// Funções auxiliares
const getLocalDateString = () => {
    const date = new Date();
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - timezoneOffset);
    return localDate.toISOString().split('T')[0];
};

const getInitialFilters = (resetCompleto = false) => {
    const hoje = getLocalDateString();
    return {
        termoBusca: '',
        dataInicio: resetCompleto ? '' : hoje,
        dataFim: resetCompleto ? '' : hoje,
        tipo: '', idConta: '', tipoRateio: ''
    };
};

// Componentes de UI
const LoadingSpinner = () => (
    <div className="fc-spinner-container">
        <div className="fc-spinner-dots"><div className="dot-1"></div><div className="dot-2"></div><div className="dot-3"></div></div>
        <span className="fc-spinner-text">Buscando lançamentos...</span>
    </div>
);

const ErrorMessage = ({ message }) => (
    <p style={{ color: 'red', textAlign: 'center', padding: '20px' }}>{message}</p>
);

// Componente principal
const LancamentosView = () => {
    const [lancamentos, setLancamentos] = useState([]);
    const [paginacao, setPaginacao] = useState({ currentPage: 1, totalPages: 1 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filtros, setFiltros] = useState(getInitialFilters());
    const [viewKey, setViewKey] = useState(Date.now());
    const timeoutRef = useRef(null);

    // Função de busca de dados
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

    // Efeito principal que reage a mudanças para buscar dados
    useEffect(() => {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            fetchData(paginacao.currentPage, filtros);
        }, 300);
        return () => clearTimeout(timeoutRef.current);
    }, [filtros, paginacao.currentPage, fetchData]);

    // Handler para o reset vindo de fora (troca de aba, aprovação, etc.)
    const handleReset = useCallback(() => {
        setViewKey(Date.now());
    }, []);
    
    useEffect(() => {
        window.addEventListener('resetarLancamentosView', handleReset);
        return () => window.removeEventListener('resetarLancamentosView', handleReset);
    }, [handleReset]);
    
    const handleFiltrosChange = (nomeFiltro, valor) => {
        setFiltros(prevFiltros => {
            const novosFiltros = { ...prevFiltros, [nomeFiltro]: valor };
            if (paginacao.currentPage !== 1) {
                setPaginacao(p => ({ ...p, currentPage: 1 }));
            }
            return novosFiltros;
        });
    };

    const handleLimparFiltros = () => {
        setFiltros(getInitialFilters(true));
        setPaginacao(p => ({ ...p, currentPage: 1 }));
    };
    
    const handleRefresh = () => {
        fetchData(paginacao.currentPage, filtros);
    };
    
    // Handlers para os modais
    const handleModalSuccess = handleReset;
    const [expandedCards, setExpandedCards] = useState([]);
    const handleToggleDetails = (cardId) => {
        setExpandedCards(prev => prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]);
    };
    
    const handleNew = useCallback(() => {
        if (window.renderReactModal) {
            const modalProps = {
                isOpen: true,
                lancamentoParaEditar: null,
                onSuccess: handleModalSuccess,
                contas: window.contasCache || [],
                categorias: window.categoriasCache || [],
                grupos: window.gruposCache || [],
                permissoes: window.permissoesGlobaisFinanceiro || []
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
                onSuccess: handleModalSuccess,
                contas: window.contasCache || [],
                categorias: window.categoriasCache || [],
                grupos: window.gruposCache || [],
                permissoes: window.permissoesGlobaisFinanceiro || []
            };
            modalProps.onClose = () => window.renderReactModal({ ...modalProps, isOpen: false });
            window.renderReactModal(modalProps);
        }
    }, [handleModalSuccess]);

    useEffect(() => {
        window.abrirModalNovoLancamentoReact = handleNew;
        return () => { delete window.abrirModalNovoLancamentoReact; };
    }, [handleNew]);

    // Handlers que chamam o JS Legado
    const handleDelete = (lancamento) => {
        if (window.solicitarExclusaoLancamento) window.solicitarExclusaoLancamento(lancamento);
    };
    const handleEstorno = (lancamento) => {
        if (window.abrirModalEstorno) window.abrirModalEstorno(lancamento);
    };
    const handleReverterEstorno = (lancamentoId) => {
        if (window.reverterEstorno) window.reverterEstorno(lancamentoId);
    };

    // Efeito para renderizar a Paginação Legada
    useEffect(() => {
        const paginacaoContainer = document.getElementById('paginacaoLancamentosContainer');
        if (paginacaoContainer && !isLoading) {
            renderizarPaginacao(
                paginacaoContainer,
                paginacao.totalPages,
                paginacao.currentPage,
                (novaPagina) => setPaginacao(p => ({ ...p, currentPage: novaPagina }))
            );
        } else if (paginacaoContainer) {
            paginacaoContainer.innerHTML = '';
        }
    }, [paginacao, isLoading]);

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
                filtros={filtros}
                onFiltrosChange={handleFiltrosChange}
                onLimparFiltros={handleLimparFiltros}
                // <<< MUDANÇA: Remova a prop `contas` daqui >>>
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