// public/src/components/OPGerenciamentoTela.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OPCard } from './OPCard.jsx';
import OPEtapasModal from './OPEtapasModal.jsx';
import OPModalLote from './OPModalLote.jsx';
import OPFiltros from './OPFiltros.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';

export default function OPGerenciamentoTela({ opsPendentesGlobal, onRefreshContadores }) {
    const [ops, setOps] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);

    // Modal de detalhes individual
    const [modalAberto, setModalAberto] = useState(false);
    const [opSelecionada, setOpSelecionada] = useState(null);

    // Modo seleção em lote
    const [modoSelecao, setModoSelecao] = useState(false);
    const [opsSelecionadas, setOpsSelecionadas] = useState(new Set()); // Set de edit_id
    const [opsTodasElegiveis, setOpsTodasElegiveis] = useState([]); // OPs de todas as páginas
    const [carregandoTodasProntas, setCarregandoTodasProntas] = useState(false);
    const [modalLoteAberto, setModalLoteAberto] = useState(false);

    // Análise do Dia — controle de expansão
    const [analiseDiaAberta, setAnaliseDiaAberta] = useState(true);

    const [filtros, setFiltros] = useState({ status: 'todas', busca: '' });
    const [pagina, setPagina] = useState(1);
    const [totalPaginas, setTotalPaginas] = useState(1);

    const ITENS_POR_PAGINA_OPS = 6;
    const lastSearchParamsRef = useRef(null);

    const buscarDados = useCallback(async (paginaAtual, filtrosAtuais) => {
        const searchSignature = JSON.stringify({ page: paginaAtual, ...filtrosAtuais });
        if (lastSearchParamsRef.current === searchSignature) return;
        lastSearchParamsRef.current = searchSignature;

        setCarregando(true);
        setErro(null);

        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('Usuário não autenticado.');

            const params = new URLSearchParams({ page: paginaAtual, limit: ITENS_POR_PAGINA_OPS });
            if (filtrosAtuais.status && filtrosAtuais.status !== 'todas') {
                params.append('status', filtrosAtuais.status);
            }
            if (filtrosAtuais.busca) params.append('search', filtrosAtuais.busca);

            const [dataOps, todosProdutos] = await Promise.all([
                fetch(`/api/ordens-de-producao?${params.toString()}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json()),
                obterProdutosDoStorage()
            ]);

            if (dataOps.error) throw new Error(dataOps.error);

            const opsFinais = dataOps.rows.map(op => {
                const produtoCompleto = todosProdutos.find(p => p.id === op.produto_id);
                let imagem = produtoCompleto?.imagem || null;
                if (produtoCompleto && op.variante && produtoCompleto.grade) {
                    const g = produtoCompleto.grade.find(g => g.variacao === op.variante);
                    if (g?.imagem) imagem = g.imagem;
                }
                return { ...op, imagem_produto: imagem };
            });

            setOps(opsFinais);
            setTotalPaginas(dataOps.pages || 1);
        } catch (err) {
            console.error('Erro em OPGerenciamentoTela:', err);
            setErro(err.message);
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        buscarDados(pagina, filtros);
    }, [pagina, filtros, buscarDados]);

    const handleFiltroChange = useCallback((novosFiltros) => {
        setFiltros(prev => ({
            status: novosFiltros.status !== undefined ? novosFiltros.status : prev.status,
            busca: novosFiltros.busca !== undefined ? novosFiltros.busca : prev.busca
        }));
        setPagina(1);
    }, []);

    // --- Handlers modal individual ---
    const handleAbrirModal = (op) => {
        if (modoSelecao) return;
        setOpSelecionada(op);
        setModalAberto(true);
    };
    const handleFecharModal = () => { setModalAberto(false); setOpSelecionada(null); };
    const handleUpdateOP = () => {
        lastSearchParamsRef.current = null;
        buscarDados(pagina, filtros);
        if (onRefreshContadores) onRefreshContadores();
    };

    // --- Handlers modo seleção ---
    const opsElegiveis = ops.filter(op => {
        try {
            if (op.status === 'finalizado' || op.status === 'cancelada') return false;
            if (!op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) return false;
            return op.etapas.every(e => e && e.lancado === true);
        } catch { return false; }
    });

    const handleToggleModoSelecao = () => {
        setModoSelecao(prev => !prev);
        setOpsSelecionadas(new Set());
        setOpsTodasElegiveis([]);
    };

    const handleToggleSelecao = (op) => {
        const id = op.edit_id || op.id;
        setOpsSelecionadas(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Busca TODAS as OPs elegíveis de todas as páginas (sem paginação)
    const handleSelecionarTodas = async () => {
        setCarregandoTodasProntas(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({ page: 1, limit: 999 });
            const [dataOps, todosProdutos] = await Promise.all([
                fetch(`/api/ordens-de-producao?${params.toString()}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json()),
                obterProdutosDoStorage()
            ]);

            if (dataOps.error) throw new Error(dataOps.error);

            const todasEnriquecidas = dataOps.rows.map(op => {
                const produtoCompleto = todosProdutos.find(p => p.id === op.produto_id);
                let imagem = produtoCompleto?.imagem || null;
                if (produtoCompleto && op.variante && produtoCompleto.grade) {
                    const g = produtoCompleto.grade.find(g => g.variacao === op.variante);
                    if (g?.imagem) imagem = g.imagem;
                }
                return { ...op, imagem_produto: imagem };
            });

            const elegiveis = todasEnriquecidas.filter(op => {
                try {
                    if (op.status === 'finalizado' || op.status === 'cancelada') return false;
                    if (!op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) return false;
                    return op.etapas.every(e => e && e.lancado === true);
                } catch { return false; }
            });

            setOpsTodasElegiveis(elegiveis);
            setOpsSelecionadas(new Set(elegiveis.map(op => op.edit_id || op.id)));
        } catch (err) {
            console.error('Erro ao buscar todas as OPs prontas:', err);
        } finally {
            setCarregandoTodasProntas(false);
        }
    };

    // Monta a lista de OPs selecionadas para o modal de lote.
    // Se o usuário clicou "Selecionar Todas", usa a lista completa de todas as páginas.
    // Caso contrário, usa apenas as da página atual.
    const opsSelecionadasLista = opsTodasElegiveis.length > 0
        ? opsTodasElegiveis.filter(op => opsSelecionadas.has(op.edit_id || op.id))
        : ops.filter(op => opsSelecionadas.has(op.edit_id || op.id));

    const handleConcluirLote = ({ sucesso }) => {
        setModoSelecao(false);
        setOpsSelecionadas(new Set());
        setModalLoteAberto(false);
        if (sucesso > 0) {
            lastSearchParamsRef.current = null;
            buscarDados(pagina, filtros);
            if (onRefreshContadores) onRefreshContadores();
        }
    };

    // --- Dados para Análise do Dia ---
    const opsRadarAlerta = ops.filter(op => op.radar && op.radar.faixa !== 'normal');
    const opsPendentes = ops.filter(op => {
        if (op.status === 'finalizado' || op.status === 'cancelada') return false;
        try {
            if (!op.etapas || !Array.isArray(op.etapas)) return false;
            return op.etapas.every(e => e && e.lancado === true);
        } catch { return false; }
    });

    // Determina o tom do bloco de análise
    const temCritico = opsRadarAlerta.some(op => op.radar.faixa === 'critico');
    const temAtencao = opsRadarAlerta.some(op => op.radar.faixa === 'atencao');
    const temAnalise = opsRadarAlerta.length > 0 || opsPendentes.length > 0;

    let analiseHeaderClasse = 'apenas-pendentes';
    if (temCritico) analiseHeaderClasse = 'tem-critico';
    else if (temAtencao) analiseHeaderClasse = 'tem-atencao';

    let analiseIcone = 'fa-clock';
    if (temCritico) analiseIcone = 'fa-radiation-alt';
    else if (temAtencao) analiseIcone = 'fa-exclamation-triangle';

    let analiseTotal = [];
    if (temCritico || temAtencao) {
        analiseTotal.push(`${opsRadarAlerta.length} OP(s) fora do padrão de tempo`);
    }
    if (opsPendentes.length > 0) {
        analiseTotal.push(`${opsPendentes.length} OP(s) aguardando finalização`);
    }

    const handleClicLinhanalise = (op) => {
        setAnaliseDiaAberta(false);
        setOpSelecionada(op);
        setModalAberto(true);
    };

    return (
        <>
            {/* Toolbar: filtros + botão Selecionar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <OPFiltros onFiltroChange={handleFiltroChange} />
                </div>
                <button
                    className={`op-toolbar-selecionar ${modoSelecao ? 'ativo' : ''}`}
                    onClick={handleToggleModoSelecao}
                    title={modoSelecao ? 'Cancelar seleção' : 'Selecionar OPs para finalizar em lote'}
                >
                    <i className={`fas fa-${modoSelecao ? 'times' : 'check-square'}`}></i>
                    {modoSelecao ? 'Cancelar' : 'Selecionar'}
                </button>
            </div>

            {/* Barra de modo seleção */}
            {modoSelecao && (
                <div className="op-selecao-barra">
                    <span className="op-selecao-barra-info">
                        {opsSelecionadas.size > 0
                            ? `${opsSelecionadas.size} OP(s) selecionada(s)${opsTodasElegiveis.length > 0 ? ' (todas as páginas)' : ''}`
                            : `${opsElegiveis.length} OP(s) prontas nesta página`
                        }
                    </span>
                    <button
                        className="op-selecao-barra-btn todas"
                        onClick={handleSelecionarTodas}
                        disabled={carregandoTodasProntas}
                        title="Busca e seleciona todas as OPs prontas, independente da página"
                    >
                        {carregandoTodasProntas
                            ? <><div className="op-spinner-btn" style={{ borderTopColor: '#1d4ed8' }}></div> Buscando...</>
                            : <><i className="fas fa-check-double"></i> Selecionar Todas as Páginas</>
                        }
                    </button>
                    <button className="op-selecao-barra-btn cancelar" onClick={handleToggleModoSelecao}>
                        <i className="fas fa-times"></i> Cancelar
                    </button>
                </div>
            )}

            {/* Bloco Análise do Dia */}
            {!carregando && temAnalise && (
                <div className="op-analise-dia">
                    <div
                        className={`op-analise-dia-header ${analiseHeaderClasse}`}
                        onClick={() => setAnaliseDiaAberta(prev => !prev)}
                    >
                        <i className={`fas ${analiseIcone} op-analise-dia-icone`}></i>
                        <span className="op-analise-dia-titulo">
                            Análise do Dia — {analiseTotal.join(' · ')}
                        </span>
                        <i className={`fas fa-chevron-down op-analise-dia-chevron ${analiseDiaAberta ? 'aberto' : ''}`}></i>
                    </div>

                    <div className={`op-analise-dia-body ${analiseDiaAberta ? 'aberto' : ''}`}>
                        {/* OPs com alerta de radar */}
                        {opsRadarAlerta.map(op => (
                            <div
                                key={`radar-${op.edit_id || op.id}`}
                                className="op-analise-linha"
                                onClick={() => handleClicLinhanalise(op)}
                            >
                                <img
                                    src={op.imagem_produto || '/img/placeholder-image.png'}
                                    alt={op.produto}
                                    className="op-analise-linha-img"
                                />
                                <span className="op-analise-linha-num">OP #{op.numero}</span>
                                <span className="op-analise-linha-produto">{op.produto}</span>
                                <span className="op-analise-linha-detalhe">
                                    Em prod. há {op.radar.horas_abertas}h · normal: {op.radar.media_horas}h ({op.radar.multiplo}x)
                                </span>
                                <span className={`op-analise-linha-badge ${op.radar.faixa}`}>
                                    {op.radar.faixa === 'critico' ? 'Crítico' : 'Atenção'}
                                </span>
                            </div>
                        ))}

                        {/* Divisor se há os dois tipos */}
                        {opsRadarAlerta.length > 0 && opsPendentes.length > 0 && (
                            <div className="op-analise-divisor" />
                        )}

                        {/* OPs prontas para finalizar */}
                        {opsPendentes.map(op => (
                            <div
                                key={`pend-${op.edit_id || op.id}`}
                                className="op-analise-linha"
                                onClick={() => handleClicLinhanalise(op)}
                            >
                                <img
                                    src={op.imagem_produto || '/img/placeholder-image.png'}
                                    alt={op.produto}
                                    className="op-analise-linha-img"
                                />
                                <span className="op-analise-linha-num">OP #{op.numero}</span>
                                <span className="op-analise-linha-produto">{op.produto}</span>
                                <span className="op-analise-linha-detalhe">
                                    {op.quantidade} pçs · {op.variante || 'Padrão'}
                                </span>
                                <span className="op-analise-linha-badge pendente">
                                    Aguardando finalização
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Lista de OPs */}
            {carregando && <div className="spinner" style={{ marginTop: 20 }}>Carregando Ordens de Produção...</div>}
            {erro && <p style={{ color: 'red', textAlign: 'center' }}>Erro: {erro}</p>}

            {!carregando && !erro && (
                <>
                    <div className="op-cards-container">
                        {ops.length > 0 ? (
                            ops.map(op => (
                                <OPCard
                                    key={op.edit_id || op.id}
                                    op={op}
                                    onClick={handleAbrirModal}
                                    modoSelecao={modoSelecao}
                                    selecionado={opsSelecionadas.has(op.edit_id || op.id)}
                                    onToggleSelecao={handleToggleSelecao}
                                />
                            ))
                        ) : (
                            <p style={{ textAlign: 'center', gridColumn: '1 / -1' }}>
                                Nenhuma Ordem de Produção encontrada para os filtros aplicados.
                            </p>
                        )}
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

            {/* FAB flutuante — aparece quando há OPs selecionadas */}
            {modoSelecao && opsSelecionadas.size > 0 && (
                <button
                    className="op-fab-finalizar"
                    onClick={() => setModalLoteAberto(true)}
                >
                    <i className="fas fa-check-double"></i>
                    Finalizar Selecionadas ({opsSelecionadas.size})
                </button>
            )}

            {/* Modal de detalhes individual */}
            <OPEtapasModal
                op={opSelecionada}
                isOpen={modalAberto}
                onClose={handleFecharModal}
                onUpdateOP={handleUpdateOP}
                onUpdateGlobal={onRefreshContadores}
            />

            {/* Modal de lote */}
            <OPModalLote
                isOpen={modalLoteAberto}
                ops={opsSelecionadasLista}
                onClose={() => setModalLoteAberto(false)}
                onConcluido={handleConcluirLote}
            />
        </>
    );
}
