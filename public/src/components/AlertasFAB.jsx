// public/src/components/AlertasFAB.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import '/css/alertas-central.css';

const POLLING_INTERVALO = 4 * 60 * 1000; // 4 minutos
const COOLDOWN_SOM_MS   = 2 * 60 * 1000; // 2 minutos entre sons

export default function AlertasFAB() {
    const [aberto, setAberto]               = useState(false);
    const [alertas, setAlertas]             = useState([]);
    const [naoLidos, setNaoLidos]           = useState(0);
    const [snoozedAte, setSnoozedAte]       = useState(0);
    const [popup, setPopup]                 = useState(null); // { mensagem, nivel, extras }
    const [pausarCountdown, setPausarCountdown] = useState(false);
    const [verificando, setVerificando]     = useState(false);
    const [ultimaVerificacao, setUltimaVerificacao] = useState(null);

    const audioRef       = useRef(null);
    const ultimoSomRef   = useRef(0);
    const intervalRef    = useRef(null);
    const popupTimerRef  = useRef(null);
    const barraRef       = useRef(null);

    // --- Inicialização ---
    useEffect(() => {
        audioRef.current = new Audio('/sounds/alerta.mp3');
        audioRef.current.preload = 'auto';
        const snoozeStorage = parseInt(localStorage.getItem('alertas_snooze_ate') || '0');
        setSnoozedAte(snoozeStorage);
    }, []);

    // --- Som com cooldown ---
    const tocarSom = useCallback(() => {
        const agora = Date.now();
        if (agora - ultimoSomRef.current >= COOLDOWN_SOM_MS) {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.load();
                audioRef.current.play().catch(() => {});
            }
            ultimoSomRef.current = agora;
        }
    }, []);

    // --- Popup ---
    const dispararPopup = useCallback((novosAlertas) => {
        const criticos = novosAlertas.filter(a => a.nivel === 'critico');
        if (criticos.length === 0) return;
        setPopup({
            mensagem: criticos[0].mensagem,
            nivel: 'critico',
            extras: criticos.length - 1
        });
    }, []);

    // Auto-dismiss 5s — pausável com hover
    useEffect(() => {
        if (!popup || pausarCountdown) return;
        popupTimerRef.current = setTimeout(() => setPopup(null), 5000);
        return () => clearTimeout(popupTimerRef.current);
    }, [popup, pausarCountdown]);

    // Animar barra de progresso (precisa de 2 frames para a transição funcionar)
    useEffect(() => {
        if (!popup || !barraRef.current) return;
        barraRef.current.style.width = '100%';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (barraRef.current) barraRef.current.style.width = '0%';
            });
        });
    }, [popup]);

    // --- Polling ---
    const verificarAlertas = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/alertas/verificar-status', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                console.warn('[Alertas] API retornou erro:', res.status);
                return;
            }
            const novosAlertas = await res.json();
            setUltimaVerificacao(new Date());
            console.log('[Alertas] Resposta da API:', novosAlertas.length === 0 ? 'nenhum alerta' : novosAlertas);

            if (novosAlertas.length > 0) {
                setAlertas(novosAlertas);
                setNaoLidos(prev => prev + novosAlertas.length);

                const temCritico = novosAlertas.some(a => a.nivel === 'critico');
                const snoozado   = Date.now() < snoozedAte;

                if (temCritico && !snoozado) {
                    tocarSom();
                    dispararPopup(novosAlertas);
                }
            }
        } catch {
            // Falha silenciosa — não interrompe o supervisor
        }
    }, [snoozedAte, tocarSom, dispararPopup]);

    useEffect(() => {
        verificarAlertas();

        intervalRef.current = setInterval(() => {
            if (document.visibilityState !== 'hidden') verificarAlertas();
        }, POLLING_INTERVALO);

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') verificarAlertas();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(intervalRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [verificarAlertas]);

    // --- Snooze ---
    const handleSnooze = () => {
        const ate = Date.now() + 30 * 60 * 1000;
        setSnoozedAte(ate);
        localStorage.setItem('alertas_snooze_ate', String(ate));
    };

    const handleCancelarSnooze = () => {
        setSnoozedAte(0);
        localStorage.removeItem('alertas_snooze_ate');
    };

    const isSnoozado = Date.now() < snoozedAte;

    // --- Estados visuais do FAB ---
    const temCritico = alertas.some(a => a.nivel === 'critico');
    const temAviso   = !temCritico && alertas.some(a => a.nivel === 'aviso');

    // --- Labels do popup ---
    const labelNivel = (nivel) =>
        nivel === 'critico' ? 'ALERTA CRÍTICO' :
        nivel === 'aviso'   ? 'AVISO' : 'INFORMAÇÃO';

    return (
        <>
            {/* ── Alerta Popup — canto superior direito ── */}
            {popup && (
                <div
                    className={`alertas-popup nivel-${popup.nivel}`}
                    onMouseEnter={() => setPausarCountdown(true)}
                    onMouseLeave={() => setPausarCountdown(false)}
                >
                    <div className="alertas-popup-header">
                        <i className="fas fa-bell"></i>
                        <span>{labelNivel(popup.nivel)}</span>
                    </div>
                    <p className="alertas-popup-mensagem">{popup.mensagem}</p>
                    <div className="alertas-popup-rodape">
                        {popup.extras > 0 && (
                            <span className="alertas-popup-extras">
                                +{popup.extras} alerta{popup.extras > 1 ? 's' : ''} no sino
                            </span>
                        )}
                        <button className="alertas-popup-ok" onClick={() => setPopup(null)}>OK</button>
                    </div>
                    <div className="alertas-popup-barra">
                        <div
                            className={`alertas-popup-barra-inner${pausarCountdown ? ' pausado' : ''}`}
                            ref={barraRef}
                        ></div>
                    </div>
                </div>
            )}

            {/* ── FAB (sino) ── */}
            <button
                className={`alertas-fab${temCritico ? ' tem-critico' : temAviso ? ' tem-aviso' : ''}`}
                onClick={() => { setAberto(true); setNaoLidos(0); }}
                title="Central de Alertas"
            >
                <i className="fas fa-bell"></i>
                {naoLidos > 0 && (
                    <span className="alertas-fab-badge">{naoLidos > 9 ? '9+' : naoLidos}</span>
                )}
            </button>

            {/* ── Drawer ── */}
            {aberto && (
                <>
                    <div className="alertas-overlay" onClick={() => setAberto(false)} />
                    <div className="alertas-drawer">
                        <div className="alertas-drawer-header">
                            <div>
                                <h2><i className="fas fa-bell"></i> Central de Alertas</h2>
                                <span className="alertas-drawer-subtitle">
                                    {isSnoozado
                                        ? `Silenciado por ${Math.ceil((snoozedAte - Date.now()) / 60000)} min`
                                        : 'Som ativo'
                                    }
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {isSnoozado ? (
                                    <button className="alertas-btn-snooze ativo" onClick={handleCancelarSnooze} title="Ativar som novamente">
                                        <i className="fas fa-bell"></i>
                                    </button>
                                ) : (
                                    <button className="alertas-btn-snooze" onClick={handleSnooze} title="Silenciar por 30 minutos">
                                        <i className="fas fa-bell-slash"></i>
                                    </button>
                                )}
                                <button className="alertas-btn-fechar" onClick={() => setAberto(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <div className="alertas-drawer-corpo">
                            {alertas.length === 0 ? (
                                <div className="alertas-vazio">
                                    <i className="fas fa-check-circle"></i>
                                    <p>Tudo tranquilo por aqui.</p>
                                    <span>
                                        {ultimaVerificacao
                                            ? `Última verificação às ${ultimaVerificacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                            : 'Aguardando verificação...'}
                                    </span>
                                </div>
                            ) : (
                                alertas.map((alerta, i) => (
                                    <div key={i} className={`alertas-card nivel-${alerta.nivel}`}>
                                        <div className="alertas-card-borda"></div>
                                        <div className="alertas-card-icone">
                                            <i className={`fas ${
                                                alerta.nivel === 'critico' ? 'fa-exclamation-circle' :
                                                alerta.nivel === 'aviso'   ? 'fa-exclamation-triangle' :
                                                'fa-check-circle'
                                            }`}></i>
                                        </div>
                                        <div className="alertas-card-corpo">
                                            <p>{alerta.mensagem}</p>
                                            <span className="alertas-card-tipo">{alerta.tipo.replace(/_/g, ' ')}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="alertas-drawer-rodape">
                            <span>
                                {ultimaVerificacao
                                    ? `Verificado às ${ultimaVerificacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                                    : 'Atualiza a cada 4 minutos'}
                            </span>
                            <button
                                className="alertas-btn-atualizar"
                                disabled={verificando}
                                onClick={async () => {
                                    setVerificando(true);
                                    await verificarAlertas();
                                    setVerificando(false);
                                }}
                            >
                                <i className={`fas fa-sync-alt${verificando ? ' fa-spin' : ''}`}></i>
                                {verificando ? 'Verificando...' : 'Verificar agora'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
