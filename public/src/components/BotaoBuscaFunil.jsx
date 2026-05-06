// public/src/components/BotaoBuscaFunil.jsx

import React, { useState, useEffect, useRef } from 'react';
import PainelDemandas from './BotaoBuscaPainelDemandas.jsx';
import { calcularStatusDemanda } from '/src/utils/demandaStatus.js';

const POLLING_INTERVAL = 3 * 60 * 1000; // 3 minutos

export default function BotaoBuscaFunil({ onIniciarProducao, permissoes }) {
    const [modalAberto, setModalAberto] = useState(false);
    const [totalUrgentes, setTotalUrgentes] = useState(0); // prioridade=1 E pendente → alerta vermelho
    const [totalAtivas, setTotalAtivas]    = useState(0); // qualquer demanda não concluída → badge azul
    const refreshTimerRef = useRef(null);

    const checkPrioridades = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/demandas/diagnostico-completo', {
                headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
            });
            if (res.ok) {
                const data = await res.json();
                const todas = data.diagnosticoAgregado || [];

                let urgentes = 0;
                let ativas = 0;
                todas.forEach(item => {
                    const status = calcularStatusDemanda(item);
                    if (status === 'CONCLUIDO' || status === 'DIVERGENCIA') return;
                    ativas++;
                    if (parseInt(item.prioridade) === 1 && status === 'AGUARDANDO') urgentes++;
                });

                setTotalUrgentes(urgentes);
                setTotalAtivas(ativas);
            }
        } catch (e) {
            console.error('[FAB] Erro check prioridade:', e);
        }
    };

    useEffect(() => {
        checkPrioridades(); // Checa imediatamente ao montar

        const agendarProxima = () => {
            refreshTimerRef.current = setTimeout(() => {
                if (!document.hidden) checkPrioridades();
                agendarProxima();
            }, POLLING_INTERVAL);
        };
        agendarProxima();

        const handleVisibility = () => {
            if (!document.hidden) checkPrioridades();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearTimeout(refreshTimerRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    const handleClose = () => {
        setModalAberto(false);
        checkPrioridades();
        // Avisa outros componentes na página que o painel fechou (ex: agente de corte rescana)
        window.dispatchEvent(new CustomEvent('painel-demandas-fechado'));
    };

    // --- 3 estados visuais do FAB ---
    // 1. temUrgente: prioridade=1 E pendente → vermelho pulsante
    // 2. totalAtivas > 0 (mas sem urgentes pendentes) → azul + badge discreto
    // 3. sem ativos → azul limpo
    const temUrgente = totalUrgentes > 0;

    return (
        <>
            {/* FAB — sempre visível */}
            <button
                className={`gs-fab-busca${temUrgente ? ' tem-prioridade' : ''}`}
                onClick={() => setModalAberto(true)}
                title={
                    temUrgente
                        ? `${totalUrgentes} demanda(s) urgente(s) aguardando!`
                        : totalAtivas > 0
                            ? `${totalAtivas} demanda(s) em andamento`
                            : 'Painel de Demandas'
                }
            >
                <i className={`fas ${temUrgente ? 'fa-exclamation-triangle' : 'fa-tasks'}`}></i>

                {/* Badge vermelho — urgentes pendentes */}
                {temUrgente && (
                    <span className="gs-fab-badge-prioridade">{totalUrgentes}</span>
                )}

                {/* Badge azul — pipeline em andamento (sem urgência) */}
                {!temUrgente && totalAtivas > 0 && (
                    <span className="gs-fab-badge-ativo">{totalAtivas}</span>
                )}
            </button>

            {/* Drawer — só monta quando aberto */}
            {modalAberto && (
                <>
                    <div className="gs-drawer-overlay" onClick={handleClose} />
                    <div className="gs-drawer-container">
                        <PainelDemandas
                            onIniciarProducao={(dados) => {
                                setModalAberto(false);
                                if (onIniciarProducao) {
                                    onIniciarProducao(dados);
                                } else {
                                    const params = new URLSearchParams({
                                        demanda_id: dados.demanda_id,
                                        produto_id: dados.produto_id,
                                        quantidade:  dados.quantidade,
                                        auto_abrir:  'true',
                                    });
                                    if (dados.variante) params.set('variante', dados.variante);
                                    window.location.href = `/admin/ordens-de-producao.html?${params.toString()}`;
                                }
                            }}
                            permissoes={permissoes}
                            onClose={handleClose}
                        />
                    </div>
                </>
            )}
        </>
    );
}
