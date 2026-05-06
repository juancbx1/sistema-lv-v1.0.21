// public/src/components/OPCentralEncerramento.jsx
// Central de Encerramento — Agente IA + Pulso do Sistema

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';

function isParcial(op) {
    if (!op.etapas || op.etapas.length === 0) return false;
    const ultima = op.etapas[op.etapas.length - 1];
    return (ultima?.quantidade_feita || 0) < op.quantidade;
}

function qtdProduzida(op) {
    if (!op.etapas || op.etapas.length === 0) return op.quantidade;
    return op.etapas[op.etapas.length - 1]?.quantidade_feita || 0;
}

const MENSAGENS_SCAN = [
    'Conectando ao banco de produção...',
    'Lendo ordens em andamento...',
    'Verificando etapas concluídas...',
    'Calculando saldos de produção...',
];

export default function OPCentralEncerramento({ ops, onAbrirLote, resetKey }) {
    const [agentState, setAgentState] = useState('idle'); // 'idle' | 'scanning' | 'done'
    const [mensagensVisiveis, setMensagensVisiveis] = useState([]);
    const [opsEscaneadas, setOpsEscaneadas] = useState([]);
    const [opsSelecionadas, setOpsSelecionadas] = useState(new Set());
    const [ultimoScan, setUltimoScan] = useState(null);
    const primeiroLoad = useRef(true);

    // Reseta o agente quando um lote é concluído
    useEffect(() => {
        setAgentState('idle');
        setMensagensVisiveis([]);
        setOpsEscaneadas([]);
        setOpsSelecionadas(new Set());
        primeiroLoad.current = true; // permite novo auto-start após reset de lote
    }, [resetKey]);

    // --- Pulso do Sistema: métricas calculadas das ops da página atual ---
    const opsAtivas = ops.filter(op =>
        op.status !== 'finalizado' && op.status !== 'cancelada'
    ).length;

    const opsProntasPagina = ops.filter(op => {
        if (op.status === 'finalizado' || op.status === 'cancelada') return false;
        return op.etapas && Array.isArray(op.etapas) && op.etapas.length > 0
            && op.etapas.every(e => e && e.lancado === true);
    }).length;

    const opsAlerta = ops.filter(op =>
        op.radar && op.radar.faixa !== 'normal'
    ).length;

    // --- Agente de Encerramento ---
    const iniciarScan = useCallback(async () => {
        setAgentState('scanning');
        setMensagensVisiveis([]);
        setOpsEscaneadas([]);
        setOpsSelecionadas(new Set());

        try {
            const token = localStorage.getItem('token');

            // Inicia o fetch em paralelo com a animação de mensagens
            const fetchPromise = Promise.all([
                fetch('/api/ordens-de-producao?page=1&limit=999', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json()),
                obterProdutosDoStorage()
            ]);

            // Exibe mensagens sequencialmente
            for (let i = 0; i < MENSAGENS_SCAN.length; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, 620));
                setMensagensVisiveis(prev => [...prev, MENSAGENS_SCAN[i]]);
            }

            const [dataOps, todosProdutos] = await fetchPromise;
            if (dataOps.error) throw new Error(dataOps.error);

            // Enriquece com imagem do produto
            const todasEnriquecidas = dataOps.rows.map(op => {
                const produtoCompleto = todosProdutos.find(p => p.id === op.produto_id);
                let imagem = produtoCompleto?.imagem || null;
                if (produtoCompleto && op.variante && produtoCompleto.grade) {
                    const g = produtoCompleto.grade.find(g => g.variacao === op.variante);
                    if (g?.imagem) imagem = g.imagem;
                }
                return { ...op, imagem_produto: imagem };
            });

            // Filtra as elegíveis para encerramento
            const elegiveis = todasEnriquecidas.filter(op => {
                if (op.status === 'finalizado' || op.status === 'cancelada') return false;
                if (!op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) return false;
                return op.etapas.every(e => e && e.lancado === true);
            });

            // Mensagem final com o resultado
            await new Promise(r => setTimeout(r, 350));
            const count = elegiveis.length;
            const finalMsg = count > 0
                ? `${count} OP${count > 1 ? 's' : ''} pronta${count > 1 ? 's' : ''} para encerramento detectada${count > 1 ? 's' : ''}.`
                : 'Nenhuma OP pronta para encerrar no momento.';
            setMensagensVisiveis(prev => [...prev, finalMsg]);

            await new Promise(r => setTimeout(r, 550));

            setOpsEscaneadas(elegiveis);
            // Pré-seleciona todas por padrão
            setOpsSelecionadas(new Set(elegiveis.map(op => op.edit_id || op.id)));
            setUltimoScan(new Date());
            setAgentState('done');

        } catch (err) {
            setMensagensVisiveis(prev => [...prev, `Erro: ${err.message}`]);
            setTimeout(() => setAgentState('idle'), 2500);
        }
    }, []);

    const toggleSelecao = (op) => {
        const id = op.edit_id || op.id;
        setOpsSelecionadas(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selecionarTodas = () => {
        setOpsSelecionadas(new Set(opsEscaneadas.map(op => op.edit_id || op.id)));
    };

    const limparSelecao = () => {
        setOpsSelecionadas(new Set());
    };

    const handleEncerrar = () => {
        const lista = opsEscaneadas.filter(op =>
            opsSelecionadas.has(op.edit_id || op.id)
        );
        if (lista.length > 0) onAbrirLote(lista);
    };

    const resetar = () => {
        setAgentState('idle');
        setMensagensVisiveis([]);
        setOpsEscaneadas([]);
        setOpsSelecionadas(new Set());
    };

    // ── Auto-start: dispara o agente assim que as OPs carregam pela primeira vez ──
    // Colocado após iniciarScan para evitar TDZ.
    useEffect(() => {
        if (ops.length > 0 && primeiroLoad.current && agentState === 'idle') {
            primeiroLoad.current = false;
            iniciarScan();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ops.length]);

    // ── Rescan ao fechar o Painel de Demandas (gaveta no mesmo DOM) ──
    // Colocado após iniciarScan para evitar referência antes da inicialização (TDZ).
    useEffect(() => {
        const handlePainelFechado = () => {
            if (agentState === 'done') iniciarScan();
        };
        window.addEventListener('painel-demandas-fechado', handlePainelFechado);
        return () => window.removeEventListener('painel-demandas-fechado', handlePainelFechado);
    }, [agentState, iniciarScan]);

    return (
        <div className="op-central-encerramento">

            {/* ── PULSO DO SISTEMA ── */}
            <div className="op-pulso-sistema">
                <div className="op-pulso-left">
                    {/* Badge "Ao vivo" — mesma identidade da aba de Cortes */}
                    <div className="op-pulso-ao-vivo">
                        <span className="op-pulso-ao-vivo-dot"></span>
                        <span className="op-pulso-ao-vivo-label">Ao vivo</span>
                        {ultimoScan && (
                            <span className="op-pulso-ao-vivo-hora">
                                · atualizado às {ultimoScan.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </div>

                    <div className="op-pulso-chips">
                        <div className="op-pulso-chip" title="OPs ativas nesta página">
                            <span className="chip-valor">{opsAtivas}</span>
                            <span className="chip-rotulo">ativas</span>
                        </div>
                        <div
                            className={`op-pulso-chip ${opsProntasPagina > 0 ? 'prontas destaque' : 'prontas'}`}
                            title="OPs prontas para encerrar nesta página"
                        >
                            <span className="chip-valor">{opsProntasPagina}</span>
                            <span className="chip-rotulo">prontas</span>
                        </div>
                        {opsAlerta > 0 && (
                            <div className="op-pulso-chip alerta" title="OPs com alerta de tempo de produção">
                                <span className="chip-valor">{opsAlerta}</span>
                                <span className="chip-rotulo">em alerta</span>
                            </div>
                        )}
                    </div>
                </div>

                <button
                    className={`op-agente-corte-btn${agentState !== 'idle' ? ` ${agentState}` : ''}`}
                    onClick={agentState === 'idle' ? iniciarScan : resetar}
                    title={agentState === 'done' ? 'Fechar o Agente de OPs' : 'Abrir Agente de OPs'}
                >
                    <i className="fas fa-robot agente-corte-icon"></i>
                    <span>
                        {agentState === 'idle' ? 'Agente de OPs'
                        : agentState === 'scanning' ? 'Analisando...'
                        : 'Fechar Agente'}
                    </span>
                </button>
            </div>

            {/* ── TERMINAL DE SCAN ── */}
            {agentState === 'scanning' && (
                <div className="op-agente-terminal">
                    {mensagensVisiveis.map((msg, i) => (
                        <div
                            key={i}
                            className={`op-agente-linha ${i < mensagensVisiveis.length - 1 ? 'concluida' : 'atual'}`}
                        >
                            <span className="agente-prompt">›</span>
                            <span className="agente-msg">{msg}</span>
                            {i === mensagensVisiveis.length - 1 && (
                                <span className="agente-cursor">▌</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── RESULTADO DO AGENTE ── */}
            {agentState === 'done' && (
                <div className="op-agente-resultado">
                    {opsEscaneadas.length === 0 ? (
                        <div className="op-agente-vazio">
                            <i className="fas fa-check-circle"></i>
                            <span>Nenhuma OP pronta para encerrar. Tudo ainda em produção!</span>
                        </div>
                    ) : (
                        <>
                            <div className="op-agente-lista-header">
                                <span>
                                    <i className="fas fa-check-double" style={{ color: 'var(--op-cor-azul-claro)', marginRight: 6 }}></i>
                                    {opsEscaneadas.length} OP{opsEscaneadas.length > 1 ? 's' : ''} detectada{opsEscaneadas.length > 1 ? 's' : ''}
                                </span>
                                <div className="op-agente-sel-controles">
                                    <button className="op-agente-sel-todas" onClick={selecionarTodas}>
                                        Selecionar Todas
                                    </button>
                                    {opsSelecionadas.size > 0 && (
                                        <button className="op-agente-sel-todas limpar" onClick={limparSelecao}>
                                            Limpar Seleção
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="op-agente-lista">
                                {opsEscaneadas.map(op => {
                                    const id = op.edit_id || op.id;
                                    const sel = opsSelecionadas.has(id);
                                    const parcial = isParcial(op);
                                    const produzida = qtdProduzida(op);
                                    const variante = op.variante && op.variante !== '-' ? op.variante : 'Padrão';
                                    return (
                                        <div
                                            key={id}
                                            className={`op-agente-item ${sel ? 'selecionado' : ''} ${parcial ? 'parcial' : ''}`}
                                            onClick={() => toggleSelecao(op)}
                                        >
                                            <div className={`op-agente-item-check ${sel ? 'ativo' : ''} ${parcial ? 'parcial' : ''}`}>
                                                {sel && <i className="fas fa-check"></i>}
                                            </div>
                                            <img
                                                src={op.imagem_produto || '/img/placeholder-image.png'}
                                                alt={variante}
                                                className="op-agente-item-img"
                                            />
                                            <div className="op-agente-item-info">
                                                <div className="agente-item-linha-topo">
                                                    <span className="agente-item-num">OP #{op.numero}</span>
                                                    {parcial && (
                                                        <span className="agente-item-badge-parcial">
                                                            <i className="fas fa-exclamation-triangle"></i> PARCIAL
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="agente-item-variante">{variante}</span>
                                            </div>
                                            {parcial ? (
                                                <div className="agente-item-qty-parcial">
                                                    <span className="agente-qty-produzida">{produzida}</span>
                                                    <span className="agente-qty-sep">/</span>
                                                    <span className="agente-qty-meta">{op.quantidade} pçs</span>
                                                </div>
                                            ) : (
                                                <span className="agente-item-qty">{op.quantidade} pçs</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Aviso quando há OPs parciais na seleção */}
                            {opsEscaneadas.some(isParcial) && (
                                <div className="op-agente-aviso-parcial">
                                    <i className="fas fa-exclamation-triangle"></i>
                                    <p>
                                        <strong>{opsEscaneadas.filter(isParcial).length} OP(s) PARCIAL</strong> — produção abaixo da meta.
                                        O saldo restante será registrado como perda ao confirmar o encerramento.
                                    </p>
                                </div>
                            )}

                            <div className="op-agente-acoes">
                                <span className="op-agente-sel-info">
                                    {opsSelecionadas.size} de {opsEscaneadas.length} selecionada{opsSelecionadas.size !== 1 ? 's' : ''}
                                </span>
                                <button
                                    className="op-agente-btn-encerrar"
                                    onClick={handleEncerrar}
                                    disabled={opsSelecionadas.size === 0}
                                >
                                    <i className="fas fa-check-double"></i>
                                    Encerrar Selecionadas ({opsSelecionadas.size})
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
