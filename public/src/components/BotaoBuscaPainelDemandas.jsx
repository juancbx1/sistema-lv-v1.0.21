// public/src/components/BotaoBuscaPainelDemandas.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import BotaoBuscaModalAddDemanda from './BotaoBuscaModalAddDemanda.jsx';
import CardPipelineProducao from './BotaoBuscaPipelineProducao.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';

export default function PainelDemandas({ onIniciarProducao, permissoes = [] }) {
    const [demandasAgregadas, setDemandasAgregadas] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [modalAddAberto, setModalAddAberto] = useState(false);
    
    const [showConcluidos, setShowConcluidos] = useState(false);
    const [showDivergencias, setShowDivergencias] = useState(true);
    
    const ITENS_POR_PAGINA = 6;
    const [paginaAtual, setPaginaAtual] = useState(1);
    
    // Função auxiliar para gerar chave única (CORREÇÃO FUNDAMENTAL)
    // Usa Demanda + Produto + Variante para suportar Kits
    const gerarKeyUnica = (item) => {
        const varianteLimpa = item.variante || 'padrao';
        return `${item.demanda_id}-${item.produto_id}-${varianteLimpa}`;
    };

    const fetchDiagnostico = useCallback(async () => {
        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/demandas/diagnostico-completo', {
                headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
            });
            if (!response.ok) throw new Error('Falha ao buscar diagnóstico.');
            const data = await response.json();
            
            setDemandasAgregadas(data.diagnosticoAgregado || []);
        } catch (error) {
            console.error("Erro painel:", error);
            mostrarMensagem(error.message, "erro");
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { fetchDiagnostico(); }, [fetchDiagnostico]);

    // --- LÓGICA DE SEPARAÇÃO E FILTRAGEM ---
    const { pendentes, concluidas, divergencias } = useMemo(() => {
        const p = [], c = [], d = [];
        
        // 1. DEDUPLICAÇÃO INTELIGENTE
        // Criamos um Set para armazenar chaves únicas compostas.
        // Se vierem linhas duplicadas EXATAS do banco, isso resolve.
        // Mas permite que uma mesma demanda tenha vários cards (Kits/Componentes)
        const chavesVistas = new Set();
        const listaUnica = [];

        demandasAgregadas.forEach(item => {
            const chave = gerarKeyUnica(item);
            if (!chavesVistas.has(chave)) {
                chavesVistas.add(chave);
                listaUnica.push(item);
            }
        });

        // 2. ORDENAÇÃO
        const listaOrdenada = listaUnica.sort((a, b) => {
            if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
            return a.demanda_id - b.demanda_id; 
        });

        // 3. CLASSIFICAÇÃO (Pendente / Concluído / Divergência)
        listaOrdenada.forEach(item => {
            const emProcessoAtivo = (item.saldo_em_producao || 0) + 
                                    (item.saldo_disponivel_arremate || 0) + 
                                    (item.saldo_disponivel_embalagem || 0);

            const totalConsumido = emProcessoAtivo + (item.saldo_disponivel_estoque || 0) + (item.saldo_perda || 0);
            const fila = Math.max(0, item.demanda_total - totalConsumido);
            const tevePerda = (item.saldo_perda || 0) > 0;
            const estoqueCheio = (item.saldo_disponivel_estoque || 0) >= item.demanda_total;

            if (fila > 0 || emProcessoAtivo > 0) {
                p.push(item); 
            } 
            else if (tevePerda && !estoqueCheio) {
                d.push(item); 
            } 
            else {
                c.push(item); 
            }
        });
        return { pendentes: p, concluidas: c, divergencias: d };
    }, [demandasAgregadas]);

    // --- PAGINAÇÃO SEGURA ---
    const totalPaginas = Math.ceil(pendentes.length / ITENS_POR_PAGINA);
    
    // Efeito de segurança: Se a página atual for maior que o total (ex: deletou itens), volta.
    useEffect(() => {
        if (paginaAtual > totalPaginas && totalPaginas > 0) {
            setPaginaAtual(totalPaginas);
        } else if (paginaAtual === 0 && totalPaginas > 0) {
            setPaginaAtual(1);
        }
    }, [totalPaginas, paginaAtual]);

    const itensPaginados = useMemo(() => {
        const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
        const fim = inicio + ITENS_POR_PAGINA;
        return pendentes.slice(Math.max(0, inicio), fim);
    }, [pendentes, paginaAtual, ITENS_POR_PAGINA]); // Adicionado deps para garantir reatividade

    const handleDeleteDemanda = async (demandaId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/demandas/${demandaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao deletar.');
            mostrarMensagem('Demanda apagada.', 'sucesso');
            fetchDiagnostico();
        } catch (error) { mostrarMensagem(error.message, "erro"); }
    };

    const handlePlanejarProducao = (item) => {
        if (!onIniciarProducao) return mostrarMensagem("Erro nav.", "erro");
        onIniciarProducao({
            produto_id: item.produto_id,
            variante: item.variante === '-' ? null : item.variante,
            quantidade: item.saldo_em_fila, 
            demanda_id: item.demanda_id 
        });
    };

    return (
        <>
            <div className="gs-painel-demandas-container">
                <div className="gs-painel-demandas-header">
                    <h2 style={{fontSize: '1.2rem'}}>Painel de Produção & Demandas</h2>
                    <div>
                        <button className="gs-btn gs-btn-secundario" onClick={fetchDiagnostico} disabled={carregando}>
                            <i className={`fas fa-sync-alt ${carregando ? 'gs-spin' : ''}`}></i> Atualizar
                        </button>
                        <button className="gs-btn gs-btn-primario" style={{ marginLeft: '10px' }} onClick={() => setModalAddAberto(true)}>
                            <i className="fas fa-plus"></i> Nova Demanda
                        </button>
                    </div>
                </div>

                <div className="gs-painel-demandas-body">
                    {carregando ? (
                        <div className="spinner">Calculando...</div>
                    ) : demandasAgregadas.length === 0 ? (
                        <FeedbackNotFound icon="fa-check-circle" titulo="Tudo em Dia!" mensagem="Sem demandas pendentes." />
                    ) : (
                        <div className="gs-agregado-lista">
                            
                            {/* PENDENTES */}
                            {itensPaginados.map(item => (
                                <CardPipelineProducao
                                    /* AQUI ESTAVA O PROBLEMA DE VISUALIZAÇÃO/PAGINAÇÃO:
                                       Usamos a chave composta. Isso evita que o React confunda
                                       o Top com a Calcinha do mesmo kit. */
                                    key={gerarKeyUnica(item)}
                                    item={item}
                                    onPlanejar={() => handlePlanejarProducao(item)}
                                    onDelete={() => handleDeleteDemanda(item.demanda_id)}
                                    permissoes={permissoes}
                                />
                            ))}
                            
                            {totalPaginas > 1 && (
                                <OPPaginacaoWrapper 
                                    totalPages={totalPaginas} 
                                    currentPage={paginaAtual} 
                                    onPageChange={setPaginaAtual} 
                                />
                            )}

                            {/* DIVERGÊNCIAS */}
                            {divergencias.length > 0 && (
                                <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                                    <button 
                                        className="gs-btn-switch" 
                                        style={{ width: '100%', justifyContent: 'space-between', backgroundColor: '#fff5f5', padding: '15px', borderRadius: '8px', border: '1px solid #feb2b2', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                        onClick={() => setShowDivergencias(!showDivergencias)}
                                    >
                                        <span style={{fontWeight: 'bold', color: '#c0392b'}}>
                                            <i className="fas fa-exclamation-triangle" style={{marginRight: '8px'}}></i>
                                            Encerrados com Divergência ({divergencias.length})
                                        </span>
                                        <i className={`fas fa-chevron-${showDivergencias ? 'up' : 'down'}`} style={{color: '#c0392b'}}></i>
                                    </button>
                                    
                                    {showDivergencias && (
                                        <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px', paddingLeft: '10px', borderLeft: '3px solid #c0392b' }}>
                                            {divergencias.map(item => (
                                                <CardPipelineProducao
                                                    key={gerarKeyUnica(item)}
                                                    item={item}
                                                    onPlanejar={() => {}} 
                                                    onDelete={() => handleDeleteDemanda(item.demanda_id)}
                                                    permissoes={permissoes}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CONCLUÍDOS */}
                            {concluidas.length > 0 && (
                                <div style={{ marginTop: '20px' }}>
                                    <button 
                                        className="gs-btn-switch" 
                                        style={{ width: '100%', justifyContent: 'space-between', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #eee', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                        onClick={() => setShowConcluidos(!showConcluidos)}
                                    >
                                        <span style={{fontWeight: 'bold', color: '#27ae60'}}>
                                            <i className="fas fa-check-circle" style={{marginRight: '8px'}}></i>
                                            Concluídas com Sucesso ({concluidas.length})
                                        </span>
                                        <i className={`fas fa-chevron-${showConcluidos ? 'up' : 'down'}`} style={{color: '#aaa'}}></i>
                                    </button>
                                    
                                    {showConcluidos && (
                                        <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px', paddingLeft: '10px', borderLeft: '3px solid #27ae60' }}>
                                            {concluidas.map(item => (
                                                <CardPipelineProducao
                                                    key={gerarKeyUnica(item)}
                                                    item={item}
                                                    onPlanejar={() => {}}
                                                    onDelete={() => handleDeleteDemanda(item.demanda_id)}
                                                    permissoes={permissoes}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {modalAddAberto && (
                <BotaoBuscaModalAddDemanda 
                    onClose={() => setModalAddAberto(false)}
                    onDemandaCriada={fetchDiagnostico}
                />
            )}
        </>
    );
}