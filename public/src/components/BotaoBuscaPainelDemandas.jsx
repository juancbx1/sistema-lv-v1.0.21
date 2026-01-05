// public/src/components/BotaoBuscaPainelDemandas.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import BotaoBuscaModalAddDemanda from './BotaoBuscaModalAddDemanda.jsx';
import CardPipelineProducao from './BotaoBuscaPipelineProducao.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import BotaoBuscaModalConcluidas from './BotaoBuscaModalConcluidas.jsx'; // <--- Importe aqui

// Função auxiliar para remover acentos (Normalização)
const normalizarTexto = (texto) => {
    return texto ? texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
};

export default function PainelDemandas({ onIniciarProducao, permissoes = [] }) {
    const [demandasAgregadas, setDemandasAgregadas] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [modalAddAberto, setModalAddAberto] = useState(false);
    const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false);
    
    // --- NOVOS ESTADOS DE FILTRO ---
    const [termoBusca, setTermoBusca] = useState('');
    const [filtroNaoIniciado, setFiltroNaoIniciado] = useState(false); // Checkbox "Ainda não mexi"

    const [showConcluidos, setShowConcluidos] = useState(false);
    const [showDivergencias, setShowDivergencias] = useState(true);
    
    const ITENS_POR_PAGINA = 6;
    const [paginaAtual, setPaginaAtual] = useState(1);
    const [filtroPrioridade, setFiltroPrioridade] = useState(false);
    
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

    // --- 1. LÓGICA DE FILTRAGEM E SEPARAÇÃO ---
    const { pendentesFiltrados, concluidas, divergencias } = useMemo(() => {
        const p = [], c = [], d = [];
        const chavesVistas = new Set();
        const listaUnica = [];

        // Deduplicação
        demandasAgregadas.forEach(item => {
            const chave = gerarKeyUnica(item);
            if (!chavesVistas.has(chave)) {
                chavesVistas.add(chave);
                listaUnica.push(item);
            }
        });

        // Ordenação (Prioridade > Data)
        const listaOrdenada = listaUnica.sort((a, b) => {
            if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
            return a.demanda_id - b.demanda_id; 
        });

        // Normaliza o termo de busca uma vez só
        const termoLimpo = normalizarTexto(termoBusca);

        listaOrdenada.forEach(item => {
            // Cálculos de Status
            const emProcessoAtivo = (item.saldo_em_producao || 0) + 
                                    (item.saldo_disponivel_arremate || 0) + 
                                    (item.saldo_disponivel_embalagem || 0);
            
            const totalConsumido = emProcessoAtivo + (item.saldo_disponivel_estoque || 0) + (item.saldo_perda || 0);
            const fila = Math.max(0, item.demanda_total - totalConsumido);
            
            const tevePerda = (item.saldo_perda || 0) > 0;
            const estoqueCheio = (item.saldo_disponivel_estoque || 0) >= item.demanda_total;
            
            // Definição de Concluído: Estoque Cheio E Nada mais rodando na fábrica
            const estaConcluido = estoqueCheio && emProcessoAtivo === 0;

            const naoIniciado = emProcessoAtivo === 0 && fila > 0;

            // --- MUDANÇA DE LÓGICA AQUI ---
            // Se está concluído, MAS a data de conclusão é de HOJE (ou nula/recente), mantemos na lista principal.
            // Assumindo que o Cron limpa as velhas, tudo que vem da API é "recente".
            // Então, vamos tratar "Concluído com Sucesso" como um item visível, apenas no final da fila.

            let tipoLista = 'pendente';

            if (estaConcluido) {
                // Se quiser separar visualmente, podemos usar uma flag, mas vamos jogar na lista principal
                tipoLista = 'pendente'; 
            } else if (tevePerda && !estoqueCheio && fila === 0 && emProcessoAtivo === 0) {
                tipoLista = 'divergencia';
            } else {
                tipoLista = 'pendente';
            }

            if (tipoLista === 'pendente') {
                let deveMostrar = true;

                // 1. Filtro de Texto
                if (termoLimpo) {
                    const nomeNorm = normalizarTexto(item.produto_nome);
                    const varNorm = normalizarTexto(item.variante);
                    if (!nomeNorm.includes(termoLimpo) && !varNorm.includes(termoLimpo)) {
                        deveMostrar = false;
                    }
                }

                // 2. Filtro de "Não Iniciado"
                // Se o item está concluído, ele tecnicamente não é "não iniciado", então esse filtro oculta ele
                if (filtroNaoIniciado && (estaConcluido || !naoIniciado)) {
                    deveMostrar = false;
                }
                
                // 3. Filtro de Prioridade
                if (filtroPrioridade) {
                    const prioridadeItem = parseInt(item.prioridade);
                    if (prioridadeItem !== 1) {
                        deveMostrar = false;
                    }
                }

                if (deveMostrar) {
                    // --- MUDANÇA AQUI: SEPARAÇÃO REAL ---
                    if (estaConcluido) {
                        c.push(item); // Vai para lista de Concluídos
                    } else {
                        p.push(item); // Vai para lista de Pendentes (Principal)
                    }
                }
            } 
        });
        
        // REORDENAÇÃO FINAL DA LISTA PENDENTE
        // Coloca os concluídos no final da lista para não atrapalhar
        p.sort((a, b) => {
            if (a._isConcluido && !b._isConcluido) return 1;
            if (!a._isConcluido && b._isConcluido) return -1;
            return 0; // Mantém a ordem de prioridade original
        });
        
        return { pendentesFiltrados: p, concluidas: c, divergencias: d };
    }, [demandasAgregadas, termoBusca, filtroNaoIniciado, filtroPrioridade]);

    // --- 2. PAGINAÇÃO SEGURA (Baseada nos Filtrados) ---
    const totalPaginas = Math.ceil(pendentesFiltrados.length / ITENS_POR_PAGINA);
    
    // Reseta página se filtro mudar
    useEffect(() => { setPaginaAtual(1); }, [termoBusca, filtroNaoIniciado, filtroPrioridade]);

    const itensPaginados = useMemo(() => {
        const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
        const fim = inicio + ITENS_POR_PAGINA;
        return pendentesFiltrados.slice(Math.max(0, inicio), fim);
    }, [pendentesFiltrados, paginaAtual]);

    // ... (handleDeleteDemanda e handlePlanejarProducao mantidos iguais) ...
    const handleDeleteDemanda = async (demandaId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/demandas/${demandaId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
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
                    <div style={{display: 'flex', gap: '8px'}}> {/* Adicionei flex/gap para organizar */}
                        
                        {/* BOTÃO HISTÓRICO (NOVO) */}
                        <button 
                            className="gs-btn" // Classe base genérica
                            onClick={() => setModalHistoricoAberto(true)}
                            title="Ver Concluídos"
                            // Estilo inline para garantir destaque único
                            style={{ 
                                backgroundColor: '#27ae60', // Um roxo bonito e diferente
                                color: '#fff', 
                                border: 'none'
                            }}
                        >
                            <i className="fas fa-history"></i>
                        </button>

                        <button className="gs-btn gs-btn-secundario" onClick={fetchDiagnostico} disabled={carregando}>
                            <i className={`fas fa-sync-alt ${carregando ? 'gs-spin' : ''}`}></i>
                        </button>
                        <button className="gs-btn gs-btn-primario" onClick={() => setModalAddAberto(true)}>
                            <i className="fas fa-plus"></i> Nova
                        </button>
                    </div>
                </div>

                {/* --- BARRA DE FILTROS OTIMIZADA --- */}
                <div className="gs-filtros-bar-container">
                    <input 
                        type="text" 
                        className="gs-input-busca-filtro" 
                        placeholder="Filtrar..."
                        value={termoBusca}
                        onChange={(e) => setTermoBusca(e.target.value)}
                    />
                    
                    {/* Container Flex para os botões ficarem juntos */}
                    <div className="gs-filtros-wrapper">
                        
                        {/* Botão Não Iniciados */}
                        <div 
                            className={`gs-toggle-filtro ${filtroNaoIniciado ? 'ativo' : ''}`}
                            onClick={() => setFiltroNaoIniciado(!filtroNaoIniciado)}
                        >
                            <div className="gs-checkbox-visual">
                                {filtroNaoIniciado && <i className="fas fa-check" style={{fontSize: '0.7rem'}}></i>}
                            </div>
                            <span className="filtro-texto">Não Iniciados</span>
                        </div>

                        {/* Botão Prioridade */}
                        <div 
                            className={`gs-toggle-filtro ${filtroPrioridade ? 'ativo' : ''}`}
                            onClick={() => setFiltroPrioridade(!filtroPrioridade)}
                            style={filtroPrioridade ? { backgroundColor: '#fff9db', borderColor: '#ffe066', color: '#856404' } : {}}
                        >
                            <div className="gs-checkbox-visual" style={filtroPrioridade ? { borderColor: '#856404', backgroundColor: '#856404' } : {}}>
                                {filtroPrioridade && <i className="fas fa-check" style={{fontSize: '0.7rem', color: '#fff'}}></i>}
                            </div>
                            <span className="filtro-texto"><i className="fas fa-star" style={{marginRight: '4px'}}></i> Prioridades</span>
                        </div>

                    </div>
                </div>

                <div className="gs-painel-demandas-body">
                    {carregando ? (
                        <div className="spinner">Calculando prioridades...</div>
                    ) : (
                        <div className="gs-agregado-lista">
                            
                            {/* LISTA UNIFICADA (PENDENTES + CONCLUÍDOS NO FINAL) */}
                            {itensPaginados.length > 0 ? (
                                itensPaginados.map(item => (
                                    <CardPipelineProducao
                                        key={gerarKeyUnica(item)}
                                        item={item}
                                        onPlanejar={() => handlePlanejarProducao(item)}
                                        onDelete={() => handleDeleteDemanda(item.demanda_id)}
                                        permissoes={permissoes}
                                    />
                                ))
                            ) : (
                                <FeedbackNotFound 
                                    icon="fa-search" 
                                    titulo="Nenhuma demanda encontrada" 
                                    mensagem={termoBusca || filtroNaoIniciado ? "Tente ajustar os filtros." : "Tudo em dia!"} 
                                />
                            )}
                            
                            {totalPaginas > 1 && (
                                <OPPaginacaoWrapper 
                                    totalPages={totalPaginas} 
                                    currentPage={paginaAtual} 
                                    onPageChange={setPaginaAtual} 
                                />
                            )}

                            {/* DIVERGÊNCIAS (Mantemos separado pois é problema grave) */}
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
                                                <CardPipelineProducao key={gerarKeyUnica(item)} item={item} onPlanejar={() => {}} onDelete={() => handleDeleteDemanda(item.demanda_id)} permissoes={permissoes} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* SEÇÃO CONCLUÍDOS REMOVIDA (Eles agora aparecem na lista principal) */}

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

            {/* MODAL DE HISTÓRICO AQUI */}
            <BotaoBuscaModalConcluidas 
                isOpen={modalHistoricoAberto}
                onClose={() => setModalHistoricoAberto(false)}
            />

        </>
    );
}