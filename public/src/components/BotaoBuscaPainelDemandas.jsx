// public/src/components/BotaoBuscaPainelDemandas.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import UIFeedbackNotFound from './UIFeedbackNotFound.jsx';
import BotaoBuscaModalAddDemanda from './BotaoBuscaModalAddDemanda.jsx';
import CardPipelineProducao from './BotaoBuscaPipelineProducao.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import BotaoBuscaModalConcluidas from './BotaoBuscaModalConcluidas.jsx';
import { calcularStatusDemanda, STATUS_META } from '/src/utils/demandaStatus.js';

const normalizarTexto = (texto) =>
    texto ? texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

// Chips de filtro de status (seleção exclusiva — null = todos)
const CHIPS_STATUS = [
    { id: 'AGUARDANDO', ...STATUS_META.AGUARDANDO },
    { id: 'COSTURA',    ...STATUS_META.COSTURA    },
    { id: 'ARREMATE',   ...STATUS_META.ARREMATE   },
    { id: 'EMBALAGEM',  ...STATUS_META.EMBALAGEM  },
];

export default function PainelDemandas({ onIniciarProducao, permissoes = [], onClose }) {
    const [demandasAgregadas, setDemandasAgregadas] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [modalAddAberto, setModalAddAberto] = useState(false);
    const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false);
    
    const [termoBusca, setTermoBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState(null); // null = todos | 'AGUARDANDO' | 'COSTURA' | etc.
    const [filtroPrioridade, setFiltroPrioridade] = useState(false);


    const ITENS_POR_PAGINA = 6;
    const [paginaAtual, setPaginaAtual] = useState(1);

    const [showConcluidos, setShowConcluidos] = useState(false);
    const [itemParaRepetir, setItemParaRepetir] = useState(null);

    const [popoverAberto, setPopoverAberto] = useState(false);
    const badgeRef = useRef(null);

    // Fecha popover ao clicar fora
    useEffect(() => {
        if (!popoverAberto) return;
        const handler = (e) => {
            if (badgeRef.current && !badgeRef.current.contains(e.target)) {
                setPopoverAberto(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [popoverAberto]);
    
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

        // Ordenação: prioridade=1 primeiro, depois por id (mais antigo primeiro)
        listaUnica.sort((a, b) => {
            if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
            return a.demanda_id - b.demanda_id;
        });

        const termoLimpo = normalizarTexto(termoBusca);

        listaUnica.forEach(item => {
            const statusItem = calcularStatusDemanda(item);

            // Concluídos e divergências vão para listas separadas, fora da paginação principal
            if (statusItem === 'CONCLUIDO') { c.push(item); return; }
            if (statusItem === 'DIVERGENCIA') { d.push(item); return; }

            // A partir daqui: apenas pendentes (AGUARDANDO / COSTURA / ARREMATE / EMBALAGEM)
            let deveMostrar = true;

            // Filtro de texto
            if (termoLimpo) {
                const nomeNorm = normalizarTexto(item.produto_nome);
                const varNorm  = normalizarTexto(item.variante);
                if (!nomeNorm.includes(termoLimpo) && !varNorm.includes(termoLimpo)) {
                    deveMostrar = false;
                }
            }

            // Filtro de status (chip de etapa)
            if (filtroStatus && statusItem !== filtroStatus) {
                deveMostrar = false;
            }

            // Filtro de prioridade (independente do status)
            if (filtroPrioridade && parseInt(item.prioridade) !== 1) {
                deveMostrar = false;
            }

            if (deveMostrar) p.push(item);
        });

        return { pendentesFiltrados: p, concluidas: c, divergencias: d };
    }, [demandasAgregadas, termoBusca, filtroStatus, filtroPrioridade]);

    // --- 2. PAGINAÇÃO SEGURA (Baseada nos Filtrados) ---
    const totalPaginas = Math.ceil(pendentesFiltrados.length / ITENS_POR_PAGINA);
    
    // Reseta página ao mudar qualquer filtro
    useEffect(() => { setPaginaAtual(1); }, [termoBusca, filtroStatus, filtroPrioridade]);

    const itensPaginados = useMemo(() => {
        const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
        const fim = inicio + ITENS_POR_PAGINA;
        return pendentesFiltrados.slice(Math.max(0, inicio), fim);
    }, [pendentesFiltrados, paginaAtual]);

    // Breakdown do badge — conta quantos pendentes estão em cada etapa
    const { breakdownCounts, badgeEstado } = useMemo(() => {
        const counts = { AGUARDANDO: 0, COSTURA: 0, ARREMATE: 0, EMBALAGEM: 0 };
        let temUrgenteAguardando = false;
        pendentesFiltrados.forEach(item => {
            const s = calcularStatusDemanda(item);
            if (counts[s] !== undefined) counts[s]++;
            if (s === 'AGUARDANDO' && parseInt(item.prioridade) === 1) temUrgenteAguardando = true;
        });
        const estado = counts.AGUARDANDO > 0
            ? (temUrgenteAguardando ? 'urgente' : 'atencao')
            : 'normal';
        return { breakdownCounts: counts, badgeEstado: estado };
    }, [pendentesFiltrados]);

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

    const handleRepetirDemanda = (item) => {
        const itemFormatado = {
            sku: item.produto_sku,
            nome: item.produto_nome,
            variante: item.variante,
            imagem: item.imagem
        };
        setItemParaRepetir(itemFormatado);
        setModalAddAberto(true);
    };

    const handlePlanejarProducao = (item) => {
        const dadosDemanda = {
            produto_id: item.produto_id,
            variante: item.variante === '-' ? null : item.variante,
            quantidade: item.saldo_em_fila,
            demanda_id: item.demanda_id
        };

        if (onIniciarProducao) {
            // Já está na página de OPs — dispara o fluxo direto
            onIniciarProducao(dadosDemanda);
        } else {
            // Em outra página — redireciona para OPs com os dados na URL
            const params = new URLSearchParams({
                demanda_id: item.demanda_id,
                produto_id: item.produto_id,
                quantidade: item.saldo_em_fila,
            });
            if (item.variante && item.variante !== '-') {
                params.set('variante', item.variante);
            }
            window.location.href = `/admin/ordens-de-producao.html?${params.toString()}`;
        }
    };

    return (
        <>
            {/* ===== HEADER DO DRAWER — 2 LINHAS ===== */}
            <div className="gs-drawer-header">
                {/* Linha 1: ícone + título + botão histórico + fechar */}
                <div className="gs-drawer-header-topo">
                    <div className="gs-drawer-titulo">
                        <i className="fas fa-tasks"></i>
                        <span>Painel de Demandas</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                            className="gs-drawer-fechar"
                            onClick={() => setModalHistoricoAberto(true)}
                            title="Ver Concluídos"
                            style={{ fontSize: '1rem', color: '#27ae60' }}
                        >
                            <i className="fas fa-history"></i>
                        </button>
                        <button className="gs-drawer-fechar" onClick={onClose} title="Fechar">
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                {/* Linha 2: atualizar + contador + nova demanda */}
                <div className="gs-drawer-header-acoes">
                    <button
                        className="gs-btn-refresh"
                        onClick={fetchDiagnostico}
                        disabled={carregando}
                        title="Atualizar dados"
                    >
                        <i className={`fas fa-sync-alt ${carregando ? 'gs-spin' : ''}`}></i>
                    </button>

                    <div className="gs-badge-wrapper" ref={badgeRef}>
                        <button
                            className={`gs-badge-contador-demandas gs-badge-estado-${badgeEstado}`}
                            onClick={() => setPopoverAberto(p => !p)}
                        >
                            {pendentesFiltrados.length} pendente{pendentesFiltrados.length !== 1 ? 's' : ''}
                            {badgeEstado !== 'normal' && (
                                <span className="gs-badge-alerta-inline">
                                    · {breakdownCounts.AGUARDANDO} aguardando
                                </span>
                            )}
                            <i className="fas fa-chevron-down gs-badge-chevron"></i>
                        </button>

                        {popoverAberto && pendentesFiltrados.length > 0 && (
                            <div className="gs-badge-popover">
                                <div className="gs-badge-popover-titulo">Por etapa</div>
                                {[
                                    { key: 'AGUARDANDO', ...STATUS_META.AGUARDANDO },
                                    { key: 'COSTURA',    ...STATUS_META.COSTURA    },
                                    { key: 'ARREMATE',   ...STATUS_META.ARREMATE   },
                                    { key: 'EMBALAGEM',  ...STATUS_META.EMBALAGEM  },
                                ].filter(s => breakdownCounts[s.key] > 0).map(s => (
                                    <div
                                        key={s.key}
                                        className="gs-badge-popover-linha"
                                        onClick={() => { setFiltroStatus(s.key); setPopoverAberto(false); }}
                                    >
                                        <span className="gs-badge-popover-dot" style={{ backgroundColor: s.cor }}></span>
                                        <span className="gs-badge-popover-label">{s.label}</span>
                                        <span className="gs-badge-popover-qtd">{breakdownCounts[s.key]}</span>
                                    </div>
                                ))}
                                <div className="gs-badge-popover-hint">Toque para filtrar</div>
                            </div>
                        )}
                    </div>

                    <button
                        className="gs-btn gs-btn-primario gs-btn-nova-demanda"
                        onClick={() => setModalAddAberto(true)}
                    >
                        <i className="fas fa-plus"></i> Nova
                    </button>
                </div>
            </div>

            {/* ===== CORPO SCROLLÁVEL DO DRAWER ===== */}
            <div className="gs-drawer-body">
                <div className="gs-painel-demandas-wrapper">

                    {/* Barra de filtros */}
                    <div className="gs-filtros-bar-container">
                        <input
                            type="text"
                            className="gs-input-busca-filtro"
                            placeholder="Buscar produto..."
                            value={termoBusca}
                            onChange={(e) => setTermoBusca(e.target.value)}
                        />

                        {/* Chips de status — seleção exclusiva (clica no mesmo para desativar) */}
                        <div className="gs-chips-filtro-wrapper">
                            {CHIPS_STATUS.map(chip => (
                                <button
                                    key={chip.id}
                                    className={`gs-chip-status${filtroStatus === chip.id ? ' ativo' : ''}`}
                                    style={filtroStatus === chip.id ? { '--chip-cor': chip.cor } : {}}
                                    onClick={() => setFiltroStatus(filtroStatus === chip.id ? null : chip.id)}
                                >
                                    <i className={`fas ${chip.icone}`}></i>
                                    {chip.label}
                                </button>
                            ))}

                            {/* Chip de prioridade — independente do status */}
                            <button
                                className={`gs-chip-status gs-chip-prioridade${filtroPrioridade ? ' ativo' : ''}`}
                                onClick={() => setFiltroPrioridade(!filtroPrioridade)}
                            >
                                <i className="fas fa-star"></i>
                                Prioridade
                            </button>
                        </div>
                    </div>

                    {/* Lista de demandas */}
                    <div className="gs-painel-demandas-body">
                        {carregando ? (
                            <div className="spinner">Calculando prioridades...</div>
                        ) : (
                            <div className="gs-agregado-lista">
                                {itensPaginados.length > 0 ? (
                                    itensPaginados.map(item => (
                                        <CardPipelineProducao
                                            key={gerarKeyUnica(item)}
                                            item={item}
                                            onPlanejar={() => handlePlanejarProducao(item)}
                                            onDelete={() => handleDeleteDemanda(item.demanda_id)}
                                            permissoes={permissoes}
                                            onRefresh={fetchDiagnostico}
                                        />
                                    ))
                                ) : (
                                    <UIFeedbackNotFound
                                        icon="fa-search"
                                        titulo="Nenhuma demanda encontrada"
                                        mensagem={termoBusca || filtroStatus || filtroPrioridade ? "Tente ajustar os filtros." : "Tudo em dia!"}
                                    />
                                )}

                                {totalPaginas > 1 && (
                                    <OPPaginacaoWrapper
                                        totalPages={totalPaginas}
                                        currentPage={paginaAtual}
                                        onPageChange={setPaginaAtual}
                                    />
                                )}

                                {/* Seção colapsável de concluídas */}
                                {concluidas.length > 0 && (
                                    <div className="gs-secao-concluidas">
                                        <button
                                            className="gs-secao-toggle"
                                            onClick={() => setShowConcluidos(v => !v)}
                                        >
                                            <span>
                                                <i className="fas fa-check-circle"></i>
                                                Concluídas ({concluidas.length})
                                            </span>
                                            <i className={`fas fa-chevron-${showConcluidos ? 'up' : 'down'}`}></i>
                                        </button>

                                        {showConcluidos && (
                                            <div className="gs-secao-concluidas-lista">
                                                {concluidas.map(item => (
                                                    <CardPipelineProducao
                                                        key={gerarKeyUnica(item)}
                                                        item={item}
                                                        onPlanejar={() => {}}
                                                        onDelete={() => handleDeleteDemanda(item.demanda_id)}
                                                        permissoes={permissoes}
                                                        onRefresh={fetchDiagnostico}
                                                        onRepetir={handleRepetirDemanda}
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
            </div>

            {/* Modais */}
            {modalAddAberto && (
                <BotaoBuscaModalAddDemanda
                    onClose={() => { setModalAddAberto(false); setItemParaRepetir(null); }}
                    onDemandaCriada={fetchDiagnostico}
                    itemPreSelecionado={itemParaRepetir}
                />
            )}

            <BotaoBuscaModalConcluidas
                isOpen={modalHistoricoAberto}
                onClose={() => setModalHistoricoAberto(false)}
            />
        </>
    );
}