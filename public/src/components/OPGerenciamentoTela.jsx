// public/src/components/OPGerenciamentoTela.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OPCard } from './OPCard.jsx';
import OPEtapasModal from './OPEtapasModal.jsx';
import OPModalLote from './OPModalLote.jsx';
import OPFiltros from './OPFiltros.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import OPCentralEncerramento from './OPCentralEncerramento.jsx';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import { mostrarConfirmacao, mostrarToast } from '/js/utils/popups.js';

// ── Inicialização Inteligente — exibida no primeiro carregamento ──
function InitTerminal() {
    const [fase, setFase] = useState(0);

    useEffect(() => {
        if (fase >= 2) return;
        const t = setTimeout(() => setFase(f => f + 1), 650);
        return () => clearTimeout(t);
    }, [fase]);

    const msgs = [
        'Conectando ao sistema de produção...',
        'Carregando ordens de produção...',
        'Processando dados...',
    ];

    const visiveis = msgs.slice(0, fase + 1);

    return (
        <div className="op-init-terminal">
            {visiveis.map((msg, i) => (
                <div key={i} className={`op-init-linha ${i < visiveis.length - 1 ? 'ok' : 'atual'}`}>
                    <span className="init-prompt">›</span>
                    <span>{msg}</span>
                    {i === visiveis.length - 1 && <span className="agente-cursor">▌</span>}
                </div>
            ))}
        </div>
    );
}

export default function OPGerenciamentoTela({ opsPendentesGlobal, onRefreshContadores, permissoes = [] }) {
    const [ops, setOps] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);

    // Modal de detalhes individual
    const [modalAberto, setModalAberto] = useState(false);
    const [opSelecionada, setOpSelecionada] = useState(null);

    // Modal de lote — aberto via OPCentralEncerramento
    const [modalLoteAberto, setModalLoteAberto] = useState(false);
    const [opsParaLote, setOpsParaLote] = useState([]);

    // Chave para resetar OPCentralEncerramento após lote concluído
    const [loteResetKey, setLoteResetKey] = useState(0);

    const [filtros, setFiltros] = useState({ status: 'todas', busca: '' });
    const [pagina, setPagina] = useState(1);
    const [totalPaginas, setTotalPaginas] = useState(1);

    // Controla se é o primeiro carregamento (para o InitTerminal)
    const isFirstLoadRef = useRef(true);

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
            isFirstLoadRef.current = false;
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
        setOpSelecionada(op);
        setModalAberto(true);
    };
    const handleFecharModal = () => { setModalAberto(false); setOpSelecionada(null); };
    const handleUpdateOP = () => {
        lastSearchParamsRef.current = null;
        buscarDados(pagina, filtros);
        if (onRefreshContadores) onRefreshContadores();
    };

    // --- Cancelar OP ---
    const handleCancelarOP = useCallback(async (op) => {
        const confirmado = await mostrarConfirmacao(
            `Cancelar a OP <strong>#${op.numero} — ${op.produto}</strong>?<br><br>Esta ação não pode ser desfeita.`,
            { tipo: 'perigo', textoConfirmar: 'Cancelar OP', textoCancelar: 'Voltar' }
        );
        if (!confirmado) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/ordens-de-producao', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ...op, status: 'cancelada' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao cancelar OP.');
            mostrarToast('OP cancelada com sucesso.', 'sucesso');
            lastSearchParamsRef.current = null;
            buscarDados(pagina, filtros);
            if (onRefreshContadores) onRefreshContadores();
        } catch (err) {
            mostrarToast(err.message || 'Erro ao cancelar OP.', 'erro');
        }
    }, [pagina, filtros, buscarDados, onRefreshContadores]);

    // --- Handlers Central de Encerramento ---
    const handleAbrirLote = useCallback((lista) => {
        setOpsParaLote(lista);
        setModalLoteAberto(true);
    }, []);

    const handleConcluirLote = ({ sucesso }) => {
        setModalLoteAberto(false);
        setOpsParaLote([]);
        if (sucesso > 0) {
            setLoteResetKey(prev => prev + 1); // reseta o agente
            lastSearchParamsRef.current = null;
            buscarDados(pagina, filtros);
            if (onRefreshContadores) onRefreshContadores();
        }
    };

    // Decide o que mostrar no lugar do spinner
    const mostrarInitTerminal = carregando && isFirstLoadRef.current;
    const mostrarSpinnerSimples = carregando && !isFirstLoadRef.current;

    return (
        <>
            {/* Bloco de Filtros */}
            <OPFiltros onFiltroChange={handleFiltroChange} />

            {/* Central de Encerramento — Pulso do Sistema + Agente */}
            <OPCentralEncerramento
                ops={ops}
                onAbrirLote={handleAbrirLote}
                resetKey={loteResetKey}
            />

            {/* Inicialização Inteligente — primeiro carregamento */}
            {mostrarInitTerminal && <InitTerminal />}

            {/* Spinner simples para recarregamentos subsequentes */}
            {mostrarSpinnerSimples && (
                <div className="spinner" style={{ marginTop: 20 }}>
                    Atualizando ordens de produção...
                </div>
            )}

            {erro && <p style={{ color: 'red', textAlign: 'center' }}>Erro: {erro}</p>}

            {/* Lista de OPs */}
            {!carregando && !erro && (
                <>
                    <div className="op-cards-container">
                        {ops.length > 0 ? (
                            ops.map(op => (
                                <OPCard
                                    key={op.edit_id || op.id}
                                    op={op}
                                    onClick={handleAbrirModal}
                                    onCancelar={permissoes.includes('cancelar-op') ? handleCancelarOP : null}
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

            {/* Modal de detalhes individual */}
            <OPEtapasModal
                op={opSelecionada}
                isOpen={modalAberto}
                onClose={handleFecharModal}
                onUpdateOP={handleUpdateOP}
                onUpdateGlobal={onRefreshContadores}
            />

            {/* Modal de lote — aberto pelo Agente de Encerramento */}
            <OPModalLote
                isOpen={modalLoteAberto}
                ops={opsParaLote}
                onClose={() => setModalLoteAberto(false)}
                onConcluido={handleConcluirLote}
            />
        </>
    );
}
