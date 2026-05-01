// public/src/components/OPCortesAgente.jsx
// Agente de Planejamento de Corte — scan de demandas pendentes + plano do dia

import React, { useState, useEffect, useCallback } from 'react';

const MENSAGENS_SCAN = [
    'Verificando demandas abertas...',
    'Cruzando com estoque de cortes...',
    'Calculando déficit de produção...',
    'Gerando plano de corte...',
];

export default function OPCortesAgente({ produtos, onCortarAgora, rescanKey }) {
    const [agentState, setAgentState] = useState('idle'); // 'idle' | 'scanning' | 'done'
    const [mensagensVisiveis, setMensagensVisiveis] = useState([]);
    const [plano, setPlano] = useState([]);

    // Auto-rescan quando rescanKey muda E o agente já está em 'done'
    // (significa que o usuário cortou um item — vamos atualizar o plano)
    useEffect(() => {
        if (rescanKey > 0 && agentState === 'done') {
            iniciarScan();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rescanKey]);

    const iniciarScan = useCallback(async () => {
        setAgentState('scanning');
        setMensagensVisiveis([]);
        setPlano([]);

        try {
            const token = localStorage.getItem('token');

            // Dispara o fetch em paralelo com a animação do terminal
            const fetchPromise = fetch('/api/cortes/radar', {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json());

            // Mensagens sequenciais
            for (let i = 0; i < MENSAGENS_SCAN.length; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, 580));
                setMensagensVisiveis(prev => [...prev, MENSAGENS_SCAN[i]]);
            }

            const data = await fetchPromise;
            if (data.error) throw new Error(data.error);

            // Enriquece cada item do déficit com imagem e objeto produto completo
            const planoEnriquecido = (data.alertasDeficit || []).map(item => {
                const produtoCompleto = produtos.find(p => p.id === item.produto_id) || null;
                let imagem = produtoCompleto?.imagem || null;
                if (produtoCompleto && item.variante && produtoCompleto.grade) {
                    const g = produtoCompleto.grade.find(g => g.variacao === item.variante);
                    if (g?.imagem) imagem = g.imagem;
                }
                return {
                    ...item,
                    imagem,
                    deficit: item.pecas_necessarias - item.pecas_em_estoque,
                    produtoCompleto
                };
            });

            // Mensagem final
            await new Promise(r => setTimeout(r, 380));
            const count = planoEnriquecido.length;
            const finalMsg = count > 0
                ? `${count} item${count > 1 ? 's' : ''} no plano de corte de hoje.`
                : 'Estoque em dia! Nenhuma demanda pendente sem corte.';
            setMensagensVisiveis(prev => [...prev, finalMsg]);

            await new Promise(r => setTimeout(r, 480));
            setPlano(planoEnriquecido);
            setAgentState('done');

        } catch (err) {
            setMensagensVisiveis(prev => [...prev, `Erro: ${err.message}`]);
            setTimeout(() => setAgentState('idle'), 2500);
        }
    }, [produtos]);

    const resetar = () => {
        setAgentState('idle');
        setMensagensVisiveis([]);
        setPlano([]);
    };

    return (
        <div className="op-cortes-agente">

            {/* ── BOTÃO DE ACIONAMENTO ── */}
            <button
                className={`op-cortes-agente-btn ${agentState !== 'idle' ? 'ativo' : ''}`}
                onClick={agentState === 'idle' ? iniciarScan : resetar}
                disabled={agentState === 'scanning'}
                title={agentState === 'idle' ? 'Gerar plano de corte do dia' : 'Fechar agente'}
            >
                <i className={`fas fa-${agentState === 'scanning' ? 'circle-notch fa-spin' : 'robot'}`}></i>
                {agentState === 'idle' && 'Plano de Corte'}
                {agentState === 'scanning' && 'Analisando...'}
                {agentState === 'done' && 'Fechar Agente'}
            </button>

            {/* ── TERMINAL DE SCAN ── */}
            {agentState === 'scanning' && (
                <div className="op-cortes-agente-terminal">
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

            {/* ── RESULTADO: PLANO DE CORTE ── */}
            {agentState === 'done' && (
                <div className="op-cortes-agente-resultado">

                    {/* Tudo em dia ✅ */}
                    {plano.length === 0 && (
                        <div className="op-cortes-agente-zerado">
                            <i className="fas fa-check-circle"></i>
                            <div className="op-cortes-agente-zerado-texto">
                                <strong>Estoque de cortes em dia!</strong>
                                <span>Todas as demandas pendentes têm corte disponível. Continue assim!</span>
                            </div>
                        </div>
                    )}

                    {/* Lista de itens a cortar */}
                    {plano.length > 0 && (
                        <>
                            <div className="op-cortes-agente-plano-header">
                                <span>
                                    <i className="fas fa-clipboard-list"></i>
                                    {plano.length} item{plano.length > 1 ? 's' : ''} para cortar hoje
                                </span>
                                <span className="op-cortes-agente-hint">
                                    Clique em "Cortar" para registrar cada lote
                                </span>
                            </div>

                            <div className="op-cortes-agente-lista">
                                {plano.map((item, i) => {
                                    const cobertoParcial = item.pecas_em_estoque > 0;
                                    return (
                                        <div
                                            key={i}
                                            className={`op-cortes-agente-item ${cobertoParcial ? 'parcial' : ''}`}
                                        >
                                            <img
                                                src={item.imagem || '/img/placeholder-image.png'}
                                                alt={item.variante || item.produto_nome}
                                                className="op-cortes-agente-item-img"
                                            />

                                            <div className="op-cortes-agente-item-info">
                                                <div className="op-cortes-agente-item-nome">
                                                    {item.produto_nome}
                                                </div>
                                                {item.variante && (
                                                    <div className="op-cortes-agente-item-variante">
                                                        {item.variante}
                                                    </div>
                                                )}
                                                <div className="op-cortes-agente-item-deficit">
                                                    <span className="deficit-falta">
                                                        −{item.deficit} pçs
                                                    </span>
                                                    {cobertoParcial && (
                                                        <span className="deficit-tem">
                                                            {item.pecas_em_estoque} em estoque
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                className="op-cortes-agente-item-btn"
                                                onClick={() => onCortarAgora({
                                                    produto: item.produtoCompleto,
                                                    variante: item.variante || null,
                                                    quantidadeSugerida: item.deficit
                                                })}
                                                disabled={!item.produtoCompleto}
                                                title={!item.produtoCompleto ? 'Produto não encontrado' : 'Registrar corte para este item'}
                                            >
                                                <i className="fas fa-bolt"></i>
                                                Cortar
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
