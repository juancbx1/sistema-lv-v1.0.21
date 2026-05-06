// public/src/components/OPCortesAgente.jsx
// Agente de Planejamento de Corte — scan de demandas pendentes + plano do dia

import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

const MENSAGENS_SCAN = [
    'Verificando demandas abertas...',
    'Cruzando com estoque de cortes...',
    'Calculando déficit de produção...',
    'Gerando plano de corte...',
];

const INTERVALO_AO_VIVO_MS = 90_000; // 90 segundos

const OPCortesAgente = forwardRef(function OPCortesAgente({ produtos, onCortarAgora, rescanKey, onStateChange }, ref) {
    const [agentState, setAgentState] = useState('idle'); // 'idle' | 'scanning' | 'done'
    const [mensagensVisiveis, setMensagensVisiveis] = useState([]);
    const [plano, setPlano] = useState([]);
    const [ultimoScan, setUltimoScan] = useState(null); // timestamp do último scan completo

    useEffect(() => {
        onStateChange?.(agentState);
    }, [agentState, onStateChange]);

    // Auto-rescan quando rescanKey muda (após QuickLog com sucesso ou retorno à aba).
    // Funciona mesmo se o agente foi desmontado e remontou em 'idle'.
    useEffect(() => {
        if (rescanKey > 0) {
            iniciarScan();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rescanKey]);

    // ── Polling "ao vivo": rescan automático a cada 90s enquanto em 'done' e aba visível ──
    useEffect(() => {
        if (agentState !== 'done') return;

        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                iniciarScan();
            }
        }, INTERVALO_AO_VIVO_MS);

        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agentState]);

    const iniciarScan = useCallback(async () => {
        setAgentState('scanning');
        setMensagensVisiveis([]);
        setPlano([]);

        try {
            const token = localStorage.getItem('token');

            const fetchPromise = fetch('/api/cortes/radar', {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json());

            for (let i = 0; i < MENSAGENS_SCAN.length; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, 580));
                setMensagensVisiveis(prev => [...prev, MENSAGENS_SCAN[i]]);
            }

            const data = await fetchPromise;
            if (data.error) throw new Error(data.error);

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

            await new Promise(r => setTimeout(r, 380));
            const count = planoEnriquecido.length;
            const finalMsg = count > 0
                ? `${count} item${count > 1 ? 's' : ''} no plano de corte de hoje.`
                : 'Estoque em dia! Nenhuma demanda pendente sem corte.';
            setMensagensVisiveis(prev => [...prev, finalMsg]);

            await new Promise(r => setTimeout(r, 480));
            setPlano(planoEnriquecido);
            setUltimoScan(new Date());
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
        setUltimoScan(null);
    };

    // Expõe handleClick para o pai acionar via ref (sem duplicar o botão)
    useImperativeHandle(ref, () => ({
        handleClick: () => {
            if (agentState === 'idle') iniciarScan();
            else resetar();
        }
    }), [agentState, iniciarScan]);

    // Só renderiza o conteúdo — o botão fica no pai (OPCortesTela)
    if (agentState === 'idle') return null;

    // Formata horário do último scan
    const horaUltimoScan = ultimoScan
        ? ultimoScan.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : null;

    return (
        <div className="op-cortes-agente">

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

                    {/* Badge "ao vivo" */}
                    <div className="op-cortes-agente-ao-vivo">
                        <span className="op-cortes-agente-ao-vivo-dot"></span>
                        <span className="op-cortes-agente-ao-vivo-label">Ao vivo</span>
                        {horaUltimoScan && (
                            <span className="op-cortes-agente-ao-vivo-hora">· atualizado às {horaUltimoScan}</span>
                        )}
                    </div>

                    {plano.length === 0 && (
                        <div className="op-cortes-agente-zerado">
                            <i className="fas fa-check-circle"></i>
                            <div className="op-cortes-agente-zerado-texto">
                                <strong>Estoque de cortes em dia!</strong>
                                <span>Todas as demandas pendentes têm corte disponível. Continue assim!</span>
                            </div>
                        </div>
                    )}

                    {plano.length > 0 && (
                        <>
                            <div className="op-cortes-agente-plano-header">
                                <span>
                                    <i className="fas fa-clipboard-list"></i>
                                    {plano.length} {plano.length === 1 ? 'item' : 'itens'} para cortar hoje
                                </span>
                                <span className="op-cortes-agente-hint">
                                    Clique em "Cortar" para registrar cada lote
                                </span>
                            </div>

                            <div className="op-cortes-agente-lista">
                                {plano.map((item, i) => {
                                    const cobertoParcial = item.pecas_em_estoque > 0;
                                    const variante = item.variante || 'Padrão';
                                    return (
                                        <div
                                            key={i}
                                            className={`op-cortes-agente-card ${cobertoParcial ? 'parcial' : ''}`}
                                            style={{ '--card-idx': i }}
                                        >
                                            {/* Borda-charme lateral */}
                                            <div className="card-borda-charme"></div>

                                            {/* Corpo: imagem + info */}
                                            <div className="op-cortes-agente-card-corpo">
                                                <img
                                                    src={item.imagem || '/img/placeholder-image.png'}
                                                    alt={variante}
                                                    className="op-cortes-agente-card-img"
                                                />
                                                <div className="op-cortes-agente-card-info">
                                                    <span className="op-cortes-agente-card-variante">
                                                        {variante}
                                                    </span>
                                                    <div className="op-cortes-agente-card-deficit">
                                                        <span className="deficit-falta">
                                                            {item.deficit} pçs
                                                        </span>
                                                        {cobertoParcial && (
                                                            <span className="deficit-tem">
                                                                {item.pecas_em_estoque} em estoque
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Botão Cortar — rodapé do card */}
                                            <button
                                                className="op-cortes-agente-card-btn"
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
});

export default OPCortesAgente;
