// public/src/components/RadarDeAlertas.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback  } from 'react';
import FeedbackNotFound from './FeedbackNotFound.jsx';
import RadarBuscaLocal from './RadarBuscaLocal.jsx';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';
import { normalizeText } from '/src/utils/searchHelpers.js';

const ITENS_POR_PAGINA = 5;
const AUTO_REFRESH_INTERVAL = 30000; // 30 segundos

// --- Sub-componente para o Item da Lista Crítica (com novo design) ---
// --- Sub-componente ItemCritico (não muda) ---
const ItemCritico = ({ item, onConsultar }) => {
    let classeDestaque = '';
    if (item.saldo_atual === 0) classeDestaque = 'zerado';
    else if (item.saldo_atual <= 3) classeDestaque = 'baixo';

    return (
        <div className={`gs-radar-item-critico ${classeDestaque}`}>
            <div className="gs-radar-item-linha-superior">
                <img src={item.imagem || '/img/placeholder-image.png'} alt={item.nome} className="gs-radar-item-imagem" />
                <div className="gs-radar-item-info">
                    <div className="nome-produto">{item.nome}</div>
                    {item.variante && item.variante !== '-' && (
                        <div className="nome-variacao">{item.variante}</div>
                    )}
                </div>
                <div className="gs-radar-lista-acoes">
                    <button title="Consultar Funil Completo" onClick={() => onConsultar(item)}>
                        <i className="fas fa-search-plus"></i>
                    </button>
                </div>
            </div>
            <div className="gs-radar-item-mini-funil">
                <div className="mini-funil-item">
                    <span>Arremate</span>
                    <span className="valor">{item.saldo_arremate}</span>
                </div>
                <div className="mini-funil-item">
                    <span>Embalagem</span>
                    <span className="valor">{item.saldo_embalagem}</span>
                </div>
                <div className="mini-funil-item">
                    <span>Estoque</span>
                    <span className={`valor ${classeDestaque === 'zerado' ? 'critico' : classeDestaque === 'baixo' ? 'atencao' : ''}`}>
                        {item.saldo_atual}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default function RadarDeAlertas({ onConsultarFunil }) {
    const [expandido, setExpandido] = useState(false);
    const [itensZerados, setItensZerados] = useState([]);
    const [itensEstoqueBaixo, setItensEstoqueBaixo] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const [termoBusca, setTermoBusca] = useState('');
    const paginacaoRef = useRef(null);

    // --- NOVOS ESTADOS PARA O "RADAR VIVO" ---
    const [atualizando, setAtualizando] = useState(false);
    const refreshTimeoutRef = useRef(null); // Guarda o ID do timer do auto-refresh

    const [filtroAlerta, setFiltroAlerta] = useState('todos'); // 'todos', 'zerado', 'baixo'
    
    // --- FUNÇÃO DE BUSCA CENTRALIZADA ---
    const fetchAlertas = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) {
            setAtualizando(true);
        } else {
            setCarregando(true);
        }
        
        clearTimeout(refreshTimeoutRef.current);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/radar-producao/alertas', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('Falha ao buscar alertas.');
            const data = await response.json();
            setItensZerados(data.zerado || []);
            setItensEstoqueBaixo(data.baixo || []);
        } catch (error) {
            console.error("Erro ao carregar alertas do radar:", error);
        } finally {
            if (isManualRefresh) setAtualizando(false);
            setCarregando(false);
        }
    }, []);

    // --- LÓGICA DO AUTO-REFRESH INTELIGENTE ---
    useEffect(() => {
        const agendarProximaAtualizacao = () => {
            clearTimeout(refreshTimeoutRef.current);
            refreshTimeoutRef.current = setTimeout(() => {
                // Só atualiza se a aba estiver em foco
                if (!document.hidden) {
                    fetchAlertas();
                } else {
                    agendarProximaAtualizacao(); // Se não estiver em foco, tenta de novo mais tarde
                }
            }, AUTO_REFRESH_INTERVAL);
        };

        fetchAlertas().then(() => {
            agendarProximaAtualizacao(); // Agenda a primeira atualização após o carregamento inicial
        });
        
        // Listener para atualizar imediatamente quando o usuário volta para a aba
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                fetchAlertas();
            } else {
                clearTimeout(refreshTimeoutRef.current); // Pausa o timer se o usuário sair da aba
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Função de limpeza: remove tudo ao desmontar o componente
        return () => {
            clearTimeout(refreshTimeoutRef.current);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [fetchAlertas]);

    // Filtra a lista de alertas com base na busca
    const alertasFiltrados = useMemo(() => {
        let todosOsAlertas = [];
        // 1. Filtro por Pílula
        if (filtroAlerta === 'zerado') {
            todosOsAlertas = [...itensZerados];
        } else if (filtroAlerta === 'baixo') {
            todosOsAlertas = [...itensEstoqueBaixo];
        } else {
            todosOsAlertas = [...itensZerados, ...itensEstoqueBaixo];
        }

        // 2. Filtro por Barra de Busca
        if (!termoBusca) return todosOsAlertas;
        const termo = normalizeText(termoBusca);
        return todosOsAlertas.filter(item => 
            normalizeText(item.nome).includes(termo) || 
            normalizeText(item.variante).includes(termo) // Corrigido
        );
    }, [itensZerados, itensEstoqueBaixo, termoBusca, filtroAlerta]);

    // Lógica de paginação
    const { itensDaPagina, totalPaginas } = useMemo(() => {
        const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
        const fim = inicio + ITENS_POR_PAGINA;
        return {
            itensDaPagina: alertasFiltrados.slice(inicio, fim),
            totalPaginas: Math.ceil(alertasFiltrados.length / ITENS_POR_PAGINA) || 1,
        };
    }, [alertasFiltrados, paginaAtual]);

    useEffect(() => {
        setPaginaAtual(1);
    }, [termoBusca, filtroAlerta]); // Adiciona 'filtroAlerta' ao array de dependências

    useEffect(() => {
        // 1. O container da paginação existe no DOM? (Isso só é verdade se o painel estiver expandido)
        if (paginacaoRef.current) {

            // 2. CONDIÇÃO DE GUARDA ADICIONAL:
            // Só renderiza a paginação se já tivermos terminado o carregamento inicial E
            // se realmente houver itens para paginar.
            if (!carregando && alertasFiltrados.length > 0) {
                renderizarPaginacao(paginacaoRef.current, totalPaginas, paginaAtual, setPaginaAtual);
            } else {
                // Se não, garante que ela fique limpa/escondida.
                renderizarPaginacao(paginacaoRef.current, 1, 1, () => {});
            }
        }
    }, [expandido, carregando, alertasFiltrados, paginaAtual, totalPaginas]); // Depende de TUDO que pode afetar a paginação

    if (carregando && itensZerados.length === 0 && itensEstoqueBaixo.length === 0) {
        return <div className="gs-radar-container" style={{padding: '15px', textAlign: 'center'}}>Carregando alertas...</div>;
    }

    if (itensZerados.length === 0 && itensEstoqueBaixo.length === 0) {
        return null;
    }

    return (
        <div className={`gs-radar-container ${expandido ? 'expandido' : ''}`}>
            <div className="gs-radar-header">
                {/* BOTÃO DE ATUALIZAR ADICIONADO */}
                <button 
                    className={`gs-radar-btn-atualizar ${atualizando ? 'gs-spin' : ''}`} 
                    onClick={() => fetchAlertas(true)} 
                    disabled={atualizando}
                    title="Atualizar Alertas"
                >
                    <i className="fas fa-sync-alt"></i>
                </button>
                <div className="gs-radar-header-alerta">
                    <div className="alerta-linha principal">
                        <span className="alerta-titulo"><i className="fas fa-fire"></i> ESTOQUE ZERADO:</span>
                        <span className="alerta-mensagem">{itensZerados.length} produto(s) SEM ESTOQUE!</span>
                        {itensZerados.length > 0 && 
                            <button className="gs-radar-botao-ver" onClick={(e) => { e.stopPropagation(); setExpandido(true); }}>Ver Lista</button>
                        }
                    </div>
                    {itensEstoqueBaixo.length > 0 && (
                        <div className="alerta-linha secundaria">
                            <span className="alerta-titulo"><i className="fas fa-exclamation-triangle"></i> Atenção:</span>
                            <span className="alerta-mensagem">{itensEstoqueBaixo.length} produto(s) com estoque baixo.</span>
                        </div>
                    )}
                </div>
            </div>
            
            {expandido && (
                <div className="gs-radar-conteudo">
                    <div className="gs-radar-conteudo-lista">
                        <h4>Lista de Itens Críticos ({alertasFiltrados.length})</h4>
                        
                        {/* Container para a busca e as pílulas */}
                        <div className="gs-radar-controles-lista">
                            <RadarBuscaLocal 
                                id="radar_alertas"
                                termoBusca={termoBusca}
                                onBuscaChange={setTermoBusca}
                                placeholder="Filtrar na lista de alertas..."
                            />

                            <div className="gs-radar-filtros-rapidos">
                                <button
                                    className={`gs-radar-pilula-filtro ${filtroAlerta === 'todos' ? 'ativo' : ''}`}
                                    onClick={() => setFiltroAlerta('todos')}>
                                    Todos ({itensZerados.length + itensEstoqueBaixo.length})
                                </button>
                                    <button
                                        className={`gs-radar-pilula-filtro zerado ${filtroAlerta === 'zerado' ? 'ativo' : ''}`}
                                        onClick={() => setFiltroAlerta('zerado')}>
                                        Zerado ({itensZerados.length})
                                    </button>
                                        <button
                                            className={`gs-radar-pilula-filtro baixo ${filtroAlerta === 'baixo' ? 'ativo' : ''}`}
                                            onClick={() => setFiltroAlerta('baixo')}>
                                            Baixo ({itensEstoqueBaixo.length})
                                        </button>
                            </div>
                        </div>

                        {itensDaPagina.length > 0 ? (
                            <div className="gs-radar-lista-critica">
                                {itensDaPagina.map(item => (
                                    <ItemCritico key={item.sku || item.id} item={item} onConsultar={onConsultarFunil} />
                                ))}
                            </div>
                        ) : (
                            <FeedbackNotFound icon="fa-search" titulo="Nenhum Item Encontrado" mensagem="Nenhum item na lista de alertas corresponde ao seu filtro."/>
                        )}
                        
                        <div ref={paginacaoRef} className="gs-paginacao-container" style={{marginTop: '20px'}}></div>
                    </div>
                </div>
            )}
            
            <div className="gs-radar-puxador" onClick={() => setExpandido(!expandido)}>
                <i className={`fas ${expandido ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
            </div>
        </div>
    );
}