// public/src/components/OPCortesAgente.jsx
// Agente de Planejamento de Corte — scan de demandas pendentes + plano do dia

import React, { useState, useEffect, useCallback } from 'react';

// Estado calmo — agente não sabe do déficit até escanear
const FRASES_MONITORANDO = [
    'Estou monitorando o estoque de cortes. Quer cortar agora?.',
    'Acompanhando as demandas de corte em tempo real.',
    'Nada detectado ainda. Posso analisar o plano de corte quando quiser.',
    'Sistemas ativos. Aguardo seu comando para verificar os cortes pendentes.',
    'Estou olhando para as pendencias de cortes. Devo verificar agora?',
    'Tudo dentro do esperado até agora. Quer um plano de corte atualizado?',
];

// Estado pós-corte parcial — ficaram itens no plano sem corte registrado
const FRASES_PARCIAL = [
    'Reparei que ficaram itens no plano sem corte registrado. Verifico agora?',
    'Você não cortou todos os itens do plano. Quer resolver o restante?',
    'Ainda há déficit de corte na linha. Posso rever o plano?',
    'Percebo que ficaram pendências de corte. Revejo o plano agora?',
    'Missão incompleta! Ainda há itens aguardando corte no plano.',
    'Deixou alguns para depois? Posso verificar o que ainda precisa de corte.',
];

const MENSAGENS_SCAN = [
    'Verificando demandas abertas...',
    'Cruzando com estoque de cortes...',
    'Calculando solicitaçoes de produção...',
    'Gerando plano de corte...',
];

const INTERVALO_AO_VIVO_MS = 90_000; // 90 segundos

export default function OPCortesAgente({ produtos, onCortarAgora, rescanKey }) {
    const [agentState, setAgentState] = useState('idle'); // 'idle' | 'scanning' | 'done'
    const [mensagensVisiveis, setMensagensVisiveis] = useState([]);
    const [plano, setPlano] = useState([]);
    const [ultimoScan, setUltimoScan] = useState(null);
    const [fraseIdx, setFraseIdx] = useState(() => Math.floor(Math.random() * FRASES_MONITORANDO.length));
    const [voltouParcial, setVoltouParcial] = useState(false);

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

    const resetar = useCallback(() => {
        // Se o plano tinha itens, o usuário fechou sem cortar tudo → parcial
        const foiParcial = plano.length > 0;
        setVoltouParcial(foiParcial);
        setAgentState('idle');
        setMensagensVisiveis([]);
        setPlano([]);
        setUltimoScan(null);
        setFraseIdx(Math.floor(Math.random() * (foiParcial ? FRASES_PARCIAL : FRASES_MONITORANDO).length));
    }, [plano]);

    // Auto-rescan quando rescanKey muda (após QuickLog com sucesso).
    useEffect(() => {
        if (rescanKey > 0) {
            iniciarScan();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rescanKey]);

    // Polling "ao vivo": rescan automático a cada 90s enquanto em 'done' e aba visível
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

    // Rescan ao fechar o Painel de Demandas
    useEffect(() => {
        const handlePainelFechado = () => {
            if (agentState === 'done') iniciarScan();
        };
        window.addEventListener('painel-demandas-fechado', handlePainelFechado);
        return () => window.removeEventListener('painel-demandas-fechado', handlePainelFechado);
    }, [agentState, iniciarScan]);

    // Determina tom do agente no repouso
    const frases    = voltouParcial ? FRASES_PARCIAL : FRASES_MONITORANDO;
    const frase     = frases[fraseIdx % frases.length];
    const classeCard = voltouParcial ? ' parcial' : '';

    // Formata horário do último scan
    const horaUltimoScan = ultimoScan
        ? ultimoScan.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : null;

    return (
        <div className="op-cortes-agente">

            {/* ── IDLE CARD — o agente se comunica antes de escanear ── */}
            {agentState === 'idle' && (
                <div className={`op-agente-idle-card${classeCard}`}>
                    <div className="op-agente-robo-avatar">
                        <i className="fas fa-robot"></i>
                    </div>
                    <div className="op-agente-idle-conteudo">
                        <p className="op-agente-idle-msg">"{frase}"</p>
                        <button className="op-agente-idle-btn" onClick={iniciarScan}>
                            <i className={`fas ${voltouParcial ? 'fa-redo' : 'fa-search'}`}></i>
                            {voltouParcial ? 'Verificar pendências' : 'Analisar agora'}
                        </button>
                    </div>
                </div>
            )}

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

                    {/* Badge "ao vivo" + botão fechar */}
                    <div className="op-cortes-agente-ao-vivo">
                        <span className="op-cortes-agente-ao-vivo-dot"></span>
                        <span className="op-cortes-agente-ao-vivo-label">Ao vivo</span>
                        {horaUltimoScan && (
                            <span className="op-cortes-agente-ao-vivo-hora">· atualizado às {horaUltimoScan}</span>
                        )}
                        <button
                            className="op-agente-corte-btn done"
                            onClick={resetar}
                            title="Fechar o Agente de Corte"
                            style={{ marginLeft: 'auto' }}
                        >
                            <i className="fas fa-robot agente-corte-icon"></i>
                            <span>Fechar Agente</span>
                        </button>
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
}
