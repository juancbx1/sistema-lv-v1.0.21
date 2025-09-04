import React, { useState, useEffect } from 'react';
import LogItem from './LogItem.jsx';

//FEED - historico de atividades do financeiro

// reusar a função de paginação do JS legado por enquanto
// Supondo que `renderizarPaginacao` esteja disponível globalmente ou seja importada.
import { renderizarPaginacao } from '/js/utils/Paginacao.js';

export default function FeedAtividades() {
    const [logs, setLogs] = useState([]);
    const [paginacao, setPaginacao] = useState({ currentPage: 1, totalPages: 1 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchLogs = async (page = 1) => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/financeiro/logs?page=${page}&limit=15`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Falha ao buscar o histórico');
            }
            const data = await response.json();
            setLogs(data.logs);
            setPaginacao({ currentPage: data.currentPage, totalPages: data.totalPages });
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Efeito para a busca inicial
    useEffect(() => {
        fetchLogs(1);
    }, []);

    // Efeito para renderizar a paginação (interagindo com o DOM legado)
    useEffect(() => {
        const paginacaoContainer = document.getElementById('paginacaoHistoricoContainer');
        if (paginacaoContainer) {
            renderizarPaginacao(
                paginacaoContainer,
                paginacao.totalPages,
                paginacao.currentPage,
                (novaPagina) => fetchLogs(novaPagina)
            );
        }
    }, [paginacao]); // Roda sempre que as informações de paginação mudam

    // Efeito para ouvir o evento de recarregamento
    useEffect(() => {
        const handleRecarregar = () => {
            // Apenas busca os dados da primeira página novamente
            fetchLogs(1); 
        };

        window.addEventListener('recarregarFeedAtividades', handleRecarregar);

        // Limpa o listener quando o componente for "desmontado" para evitar vazamentos de memória
        return () => {
            window.removeEventListener('recarregarFeedAtividades', handleRecarregar);
        };
    }, []);

    if (isLoading) {
        return <div className="fc-spinner">Carregando histórico...</div>;
    }

    if (error) {
        return <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>;
    }

    return (
        <div className="feed-atividades-container">
            {logs.length > 0 ? (
                logs.map(log => <LogItem key={log.id} log={log} />)
            ) : (
                <p style={{ textAlign: 'center', padding: '20px' }}>Nenhuma atividade registrada.</p>
            )}
        </div>
    );
}