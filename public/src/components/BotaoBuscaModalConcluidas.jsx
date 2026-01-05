// public/src/components/BotaoBuscaModalConcluidas.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import CardPipelineProducao from './BotaoBuscaPipelineProducao.jsx';
import { mostrarMensagem } from '/js/utils/popups.js';

export default function BotaoBuscaModalConcluidas({ isOpen, onClose }) {
    const [listaConcluida, setListaConcluida] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [pagina, setPagina] = useState(1);
    const ITENS_POR_PAGINA = 6;

    const fetchConcluidos = useCallback(async () => {
        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            
            // CORREÇÃO: Usamos o Diagnóstico Completo para ter imagens, nomes e saldos corretos
            const res = await fetch('/api/demandas/diagnostico-completo', {
                headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
            });

            if (!res.ok) throw new Error('Falha ao carregar histórico.');
            const data = await res.json();
            
            const todosItens = data.diagnosticoAgregado || [];

            // FILTRO: Pegamos apenas o que é REALMENTE CONCLUÍDO
            // Regra: Estoque Cheio E Fábrica Parada
            const filtrados = todosItens.filter(item => {
                const emProcesso = (item.saldo_em_producao || 0) + 
                                   (item.saldo_disponivel_arremate || 0) + 
                                   (item.saldo_disponivel_embalagem || 0);
                
                const estoqueCheio = (item.saldo_disponivel_estoque || 0) >= item.demanda_total;

                return estoqueCheio && emProcesso === 0;
            });

            setListaConcluida(filtrados);

        } catch (err) {
            console.error("Erro histórico:", err);
            mostrarMensagem(err.message, "erro");
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            setPagina(1); // Reseta página ao abrir
            fetchConcluidos();
        }
    }, [isOpen, fetchConcluidos]);

    // Lógica de Paginação no Front (já que filtramos aqui)
    const itensPaginados = useMemo(() => {
        const inicio = (pagina - 1) * ITENS_POR_PAGINA;
        const fim = inicio + ITENS_POR_PAGINA;
        return listaConcluida.slice(inicio, fim);
    }, [listaConcluida, pagina]);

    const totalPaginas = Math.ceil(listaConcluida.length / ITENS_POR_PAGINA) || 1; 
    const gerarKeyUnica = (item) => `${item.demanda_id}-${item.produto_id}-${item.variante || 'padrao'}`;

    if (!isOpen) return null;

    return (
        <div className="gs-busca-modal-overlay" onClick={onClose} style={{zIndex: 1000}}>
            <div 
                className="gs-busca-modal-conteudo" 
                onClick={(e) => e.stopPropagation()} 
                style={{maxWidth: '800px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column'}}
            >
                <div className="gs-busca-modal-header">
                    <h3 style={{color: '#27ae60'}}><i className="fas fa-check-circle"></i> Entregues Hoje</h3>
                    <button onClick={onClose} className="gs-busca-modal-fechar">&times;</button>
                </div>

                <div className="gs-busca-modal-body" style={{ flexGrow: 1 }}>
                    
                    {carregando ? (
                        <div className="spinner">Carregando histórico...</div>
                    ) : listaConcluida.length === 0 ? (
                        <FeedbackNotFound 
                            icon="fa-history" 
                            titulo="Nada por aqui" 
                            mensagem="Nenhuma demanda foi concluída hoje (ainda)." 
                        />
                    ) : (
                        <>
                            <div className="gs-agregado-lista">
                                {itensPaginados.map(item => (
                                    <CardPipelineProducao
                                        key={gerarKeyUnica(item)}
                                        item={item}
                                        onPlanejar={() => {}}
                                        onDelete={() => {}} 
                                        permissoes={[]} // Cards apenas leitura
                                    />
                                ))}
                            </div>

                            {totalPaginas > 1 && (
                                <OPPaginacaoWrapper 
                                    totalPages={totalPaginas} 
                                    currentPage={pagina} 
                                    onPageChange={setPagina} 
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}