// public/src/components/ArreMatePainelAtividades.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import ArremateStatusCard from './ArremateStatusCard.jsx';
import UICarregando from './UICarregando.jsx';
import { mostrarMensagem, mostrarConfirmacao, mostrarPromptNumerico, mostrarPromptFinalizarLote } from '/js/utils/popups.js';

export default function ArreMatePainelAtividades({ permissoes = [] }) {
    const [tiktiks, setTiktiks] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [infoFeriado, setInfoFeriado] = useState(null);

    // v1.8 — Alerta de intervalo (almoço/pausa automático)
    const [alertaIntervalo, setAlertaIntervalo] = useState(null);

    // v1.8 — Popup "Desfazer liberação" com countdown
    const [desfazerPopup, setDesfazerPopup] = useState(null);

    const audioCtxRef = useRef(null);
    const audioUnlockedRef = useRef(false);
    const alertadosRef = useRef(new Set());
    const pollingTimeoutRef = useRef(null);

    // --- 1. BUSCA DE DADOS ---
    const buscarDadosPainel = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const data = await fetch('/api/arremates/status-tiktiks', {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(res => {
                if (!res.ok) throw new Error('Falha ao carregar status.');
                return res.json();
            });

            const tiktiksArray = Array.isArray(data) ? data : (data.tiktiks || []);
            const feriadoInfo = !Array.isArray(data) && data.is_feriado_hoje
                ? { nome_feriado: data.nome_feriado }
                : null;

            setTiktiks(tiktiksArray);
            setInfoFeriado(feriadoInfo);
        } catch (err) {
            console.error('[ArreMatePainelAtividades] Erro no polling:', err);
        } finally {
            setCarregando(false);
        }
    }, []);

    // --- 2. POLLING (20s) + VISIBILITYCHANGE ---
    const agendarProximoPoll = useCallback(() => {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = setTimeout(() => {
            if (!document.hidden) {
                buscarDadosPainel().then(agendarProximoPoll);
            } else {
                agendarProximoPoll();
            }
        }, 20000);
    }, [buscarDadosPainel]);

    useEffect(() => {
        buscarDadosPainel().then(agendarProximoPoll);

        const handleVisibility = () => {
            if (!document.hidden) buscarDadosPainel();
        };
        const handleExternalUpdate = () => buscarDadosPainel();

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('atualizar-fila-react', handleExternalUpdate);
        window.addEventListener('forcarAtualizacaoPainelTiktik', handleExternalUpdate);

        return () => {
            clearTimeout(pollingTimeoutRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('atualizar-fila-react', handleExternalUpdate);
            window.removeEventListener('forcarAtualizacaoPainelTiktik', handleExternalUpdate);
        };
    }, [buscarDadosPainel, agendarProximoPoll]);

    // --- v1.8: DESBLOQUEIO DE ÁUDIO ---
    useEffect(() => {
        const unlock = () => {
            if (audioUnlockedRef.current) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                ctx.resume().then(() => {
                    audioCtxRef.current = ctx;
                    audioUnlockedRef.current = true;
                });
            } catch (e) {}
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
        return () => {
            document.removeEventListener('click', unlock);
            document.removeEventListener('touchstart', unlock);
        };
    }, []);

    const tocarBeep = useCallback(() => {
        try {
            const ctx = audioCtxRef.current;
            if (!ctx || ctx.state === 'suspended') return;
            [880, 660, 440].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                const t = ctx.currentTime + i * 0.28;
                gain.gain.setValueAtTime(0.35, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                osc.start(t);
                osc.stop(t + 0.25);
            });
        } catch (e) {}
    }, []);

    // --- v1.8: DETECÇÃO DE CRUZAMENTO S1/S2 ---
    const liberarIntervaloSilencioso = useCallback(async (tiktikId, tipo) => {
        try {
            const token = localStorage.getItem('token');
            await fetch('/api/ponto/liberar-intervalo', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ funcionario_id: tiktikId, tipo }),
            });
        } catch (e) {}
    }, []);

    useEffect(() => {
        const checarIntervalos = () => {
            const agora = new Date();
            const agoraSP = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
            const dataSP = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const [ah, am] = agoraSP.split(':').map(Number);
            const agoraMin = ah * 60 + am;
            const n = (t) => t ? String(t).substring(0, 5) : null;

            const novosAlmoco = [];
            const novosPausa = [];

            for (const tiktik of tiktiks) {
                if (!['PRODUZINDO', 'LIVRE', 'LIVRE_MANUAL'].includes(tiktik.status_atual)) continue;

                const s1 = n(tiktik.horario_saida_1);
                const s2 = n(tiktik.horario_saida_2);

                if (s1 && !tiktik.ponto_hoje?.horario_real_s1) {
                    const [s1h, s1m] = s1.split(':').map(Number);
                    const chave = `${tiktik.id}-almoco-${dataSP}`;
                    if (agoraMin >= s1h * 60 + s1m && !alertadosRef.current.has(chave)) {
                        alertadosRef.current.add(chave);
                        novosAlmoco.push(tiktik.nome.split(' ')[0]);
                        liberarIntervaloSilencioso(tiktik.id, 'ALMOCO');
                    }
                }

                if (s2 && !tiktik.ponto_hoje?.horario_real_s2) {
                    const [s2h, s2m] = s2.split(':').map(Number);
                    const chave = `${tiktik.id}-pausa-${dataSP}`;
                    if (agoraMin >= s2h * 60 + s2m && !alertadosRef.current.has(chave)) {
                        alertadosRef.current.add(chave);
                        novosPausa.push(tiktik.nome.split(' ')[0]);
                        liberarIntervaloSilencioso(tiktik.id, 'PAUSA');
                    }
                }
            }

            if (novosAlmoco.length > 0 || novosPausa.length > 0) {
                setAlertaIntervalo({ almoco: novosAlmoco, pausa: novosPausa });
                tocarBeep();
                setTimeout(() => buscarDadosPainel(), 1500);
            }
        };

        const id = setInterval(checarIntervalos, 60000);
        return () => clearInterval(id);
    }, [tiktiks, liberarIntervaloSilencioso, tocarBeep, buscarDadosPainel]);

    // --- v1.8: COUNTDOWN DO POPUP "DESFAZER" ---
    useEffect(() => {
        if (!desfazerPopup) return;
        if (desfazerPopup.countdown <= 0) {
            setDesfazerPopup(null);
            return;
        }
        const id = setTimeout(() => {
            setDesfazerPopup(prev => prev ? { ...prev, countdown: prev.countdown - 1 } : null);
        }, 1000);
        return () => clearTimeout(id);
    }, [desfazerPopup]);

    // --- HANDLERS ---

    const handleRefresh = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await buscarDadosPainel();
        } finally {
            setIsRefreshing(false);
        }
    }, [isRefreshing, buscarDadosPainel]);

    const handleFinalizar = useCallback(async (tiktik) => {
        const isLote = Array.isArray(tiktik.id_sessao);
        let resultadoPrompt = null;

        if (isLote) {
            resultadoPrompt = await mostrarPromptFinalizarLote(
                `Finalizando lote para <strong>${tiktik.nome}</strong>.<br><br>Confirme as quantidades finalizadas para cada item:`,
                tiktik.sessoes
            );
        } else {
            const quantidadeNumerica = await mostrarPromptNumerico(
                `Finalizando tarefa de <strong>${tiktik.produto_nome}</strong> para <strong>${tiktik.nome}</strong>.<br><br>Confirme a quantidade realmente finalizada:`,
                { valorInicial: tiktik.quantidade_entregue, tipo: 'info' }
            );
            if (quantidadeNumerica !== null) {
                resultadoPrompt = {
                    total: quantidadeNumerica,
                    detalhes: [{ id_sessao: tiktik.id_sessao, quantidade_finalizada: quantidadeNumerica }]
                };
            }
        }

        if (resultadoPrompt === null) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/arremates/sessoes/finalizar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ detalhes_finalizacao: resultadoPrompt.detalhes })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao finalizar');
            mostrarMensagem('Tarefa finalizada e arremate registrado!', 'sucesso');
            await buscarDadosPainel();
            window.dispatchEvent(new Event('atualizar-fila-react'));
        } catch (err) {
            mostrarMensagem(`Erro ao finalizar: ${err.message}`, 'erro');
        }
    }, [buscarDadosPainel]);

    const handleCancelar = useCallback(async (tiktik) => {
        const isLote = Array.isArray(tiktik.id_sessao);
        const nomeTarefa = isLote
            ? `o lote de ${tiktik.quantidade_entregue} peças`
            : `a tarefa de ${tiktik.quantidade_entregue}x ${tiktik.produto_nome}`;

        const confirmado = await mostrarConfirmacao(
            `Cancelar ${nomeTarefa} de <strong>${tiktik.nome}</strong>?<br><br>O(s) produto(s) voltarão para a fila.`,
            'aviso'
        );
        if (!confirmado) return;

        try {
            const token = localStorage.getItem('token');
            const payload = isLote ? { ids_sessoes: tiktik.id_sessao } : { id_sessao: tiktik.id_sessao };
            const res = await fetch('/api/arremates/sessoes/cancelar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao cancelar');
            mostrarMensagem('Tarefa cancelada com sucesso!', 'sucesso');
            await buscarDadosPainel();
            window.dispatchEvent(new Event('atualizar-fila-react'));
        } catch (err) {
            mostrarMensagem(`Erro ao cancelar: ${err.message}`, 'erro');
        }
    }, [buscarDadosPainel]);

    const handleAcaoManualStatus = useCallback(async (tiktik, novoStatus) => {
        const confirmado = await mostrarConfirmacao(`Confirmar ação para ${tiktik.nome}?`, 'aviso');
        if (!confirmado) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/usuarios/${tiktik.id}/status`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: novoStatus })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao atualizar status');
            const msg = novoStatus === 'LIVRE_MANUAL'
                ? 'Usuário liberado para trabalho.'
                : 'Status atualizado!';
            mostrarMensagem(msg, 'sucesso');
            await buscarDadosPainel();
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    }, [buscarDadosPainel]);

    const handleLiberarInativo = useCallback(async (tiktik) => {
        const primeiroNome = tiktik.nome.split(' ')[0];
        const confirmado = await mostrarConfirmacao(
            `Liberar ${primeiroNome} para o trabalho?`,
            'aviso'
        );
        if (!confirmado) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/usuarios/${tiktik.id}/status`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'LIVRE_MANUAL' })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao liberar');
            setTiktiks(prev => prev.map(t =>
                t.id === tiktik.id ? { ...t, status_atual: 'LIVRE' } : t
            ));
            setDesfazerPopup({
                tiktikId: tiktik.id,
                nome: primeiroNome,
                tipo: tiktik.status_atual,
                countdown: 10,
            });
            buscarDadosPainel();
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    }, [buscarDadosPainel]);

    const handleDesfazerLiberacao = useCallback(async () => {
        if (!desfazerPopup) return;
        const { tiktikId, nome } = desfazerPopup;
        setDesfazerPopup(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/ponto/desfazer-liberacao', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ funcionario_id: tiktikId })
            });
            if (!res.ok) throw new Error('Erro ao desfazer');
            mostrarMensagem(`${nome} voltou para o intervalo.`, 'sucesso');
            buscarDadosPainel();
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    }, [desfazerPopup, buscarDadosPainel]);

    // --- SEPARAÇÃO ATIVOS / INATIVOS ---
    const statusAtivos = ['PRODUZINDO', 'LIVRE', 'LIVRE_MANUAL'];
    const tiktiksAtivos = tiktiks.filter(t => statusAtivos.includes(t.status_atual));
    const tiktiksInativos = tiktiks.filter(t => !statusAtivos.includes(t.status_atual));

    const qtdProduzindo = tiktiks.filter(t => t.status_atual === 'PRODUZINDO').length;
    const qtdDisponivel = tiktiks.filter(t => ['LIVRE', 'LIVRE_MANUAL'].includes(t.status_atual)).length;
    const temAlguemProduzindo = qtdProduzindo > 0;

    const getInfoInativo = (t) => {
        const map = {
            PAUSA:           { icone: 'fa-coffee',        label: 'Em Pausa',        cor: '#f59e0b' },
            PAUSA_MANUAL:    { icone: 'fa-coffee',        label: 'Pausa Manual',    cor: '#f59e0b' },
            'ALMOÇO':        { icone: 'fa-utensils',      label: 'Almoço',          cor: '#f97316' },
            ALMOCO:          { icone: 'fa-utensils',      label: 'Almoço',          cor: '#f97316' },
            FORA_DO_HORARIO: { icone: 'fa-moon',          label: 'Fora do Horário', cor: '#6366f1' },
            FALTOU:          { icone: 'fa-user-times',    label: 'Faltou',          cor: '#ef4444' },
            ALOCADO_EXTERNO: { icone: 'fa-shipping-fast', label: 'Outro Setor',     cor: '#8b5cf6' },
        };
        return map[t.status_atual] || { icone: 'fa-question-circle', label: t.status_atual, cor: '#aaa' };
    };

    if (carregando) return (
        <div className="gs-card">
            <UICarregando variante="bloco" />
        </div>
    );

    return (
        <>
            <div className="gs-card painel-atividades-arremate">

                {/* Cabeçalho */}
                <div className="painel-header">
                    <div className="painel-header-esquerda">
                        <h2 className="painel-titulo">Painel de Atividades</h2>
                        {temAlguemProduzindo && (
                            <span className="painel-ao-vivo">
                                <span className="painel-ao-vivo-dot"></span>
                                AO VIVO
                            </span>
                        )}
                        <button
                            className="oa-btn-refresh"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            title="Atualizar dados do painel"
                        >
                            <i className={`fas fa-sync-alt${isRefreshing ? ' girando' : ''}`}></i>
                        </button>
                    </div>
                    <div className="painel-kpi-strip">
                        <span className={`painel-kpi-item${qtdProduzindo > 0 ? ' produzindo' : ''}`}>
                            <i className="fas fa-bolt"></i> {qtdProduzindo} produzindo
                        </span>
                        <span className={`painel-kpi-item${qtdDisponivel > 0 ? ' disponivel' : ''}`}>
                            <i className="fas fa-check-circle"></i> {qtdDisponivel} disponível
                        </span>
                    </div>
                </div>

                {/* Banner de feriado */}
                {infoFeriado && (
                    <div className="painel-banner-feriado">
                        <i className="fas fa-umbrella-beach"></i>
                        <span>FERIADO: {infoFeriado.nome_feriado} — As tiktiks não têm expediente hoje.</span>
                    </div>
                )}

                {/* Grid de tiktiks ativos */}
                {tiktiksAtivos.length === 0 ? (
                    <div className="painel-empty-state">
                        <i className="fas fa-cut painel-empty-icon"></i>
                        <p className="painel-empty-titulo">Nenhuma tiktik em atividade</p>
                        <p className="painel-empty-subtitulo">Aguardando início das atividades</p>
                    </div>
                ) : (
                    <div className="painel-status-grid">
                        {tiktiksAtivos.map(t => (
                            <ArremateStatusCard
                                key={t.id}
                                tiktik={t}
                                permissoes={permissoes}
                                onFinalizar={handleFinalizar}
                                onCancelar={handleCancelar}
                                onAcaoManualStatus={handleAcaoManualStatus}
                            />
                        ))}
                    </div>
                )}

                {/* Seção de inativos */}
                {tiktiksInativos.length > 0 && (
                    <div className="painel-inativos-secao">
                        <div className="painel-inativos-titulo">
                            Inativos <span className="painel-inativos-badge">{tiktiksInativos.length}</span>
                        </div>
                        <div className="painel-inativos-grid">
                            {tiktiksInativos.map(t => {
                                const info = getInfoInativo(t);
                                const primeiroNome = t.nome.split(' ')[0];
                                const podeLiberarStatus = ['PAUSA_MANUAL', 'FALTOU', 'ALOCADO_EXTERNO'].includes(t.status_atual);
                                return (
                                    <div key={t.id} className="painel-inativo-card">
                                        <div
                                            className={`painel-inativo-avatar${!t.avatar_url ? ' vazio' : ''}`}
                                            style={t.avatar_url ? { backgroundImage: `url('${t.avatar_url}')` } : {}}
                                        >
                                            {!t.avatar_url && <i className="fas fa-user" />}
                                        </div>
                                        <div className="painel-inativo-info">
                                            <span className="painel-inativo-nome">{primeiroNome}</span>
                                            <span className="painel-inativo-status" style={{ color: info.cor }}>
                                                <i className={`fas ${info.icone}`}></i> {info.label}
                                            </span>
                                        </div>
                                        {podeLiberarStatus && (
                                            <button
                                                className="painel-inativo-btn-liberar"
                                                onClick={() => handleLiberarInativo(t)}
                                                title="Liberar para o trabalho"
                                            >
                                                <i className="fas fa-play"></i>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* v1.8 — Popup de alerta de intervalo */}
            {alertaIntervalo && ReactDOM.createPortal(
                <>
                    <div className="oa-popup-overlay" onClick={() => setAlertaIntervalo(null)} />
                    <div className="oa-popup-intervalo" onClick={e => e.stopPropagation()}>
                        <div className="oa-popup-intervalo-icone">⏸️</div>
                        <div className="oa-popup-intervalo-titulo">Horário de Intervalo</div>
                        <div className="oa-popup-intervalo-corpo">
                            {alertaIntervalo.almoco.length > 0 && (
                                <div className="oa-popup-intervalo-linha almoco">
                                    <i className="fas fa-utensils"></i>
                                    <span><strong>Almoço</strong> — {alertaIntervalo.almoco.join(', ')}</span>
                                </div>
                            )}
                            {alertaIntervalo.pausa.length > 0 && (
                                <div className="oa-popup-intervalo-linha pausa">
                                    <i className="fas fa-coffee"></i>
                                    <span><strong>Pausa</strong> — {alertaIntervalo.pausa.join(', ')}</span>
                                </div>
                            )}
                            <p className="oa-popup-intervalo-aviso">
                                Relógio pausado automaticamente.
                            </p>
                        </div>
                        <button className="oa-popup-intervalo-btn" onClick={() => setAlertaIntervalo(null)}>
                            Entendi
                        </button>
                    </div>
                </>,
                document.body
            )}

            {/* v1.8 — Popup "Desfazer liberação" com countdown */}
            {desfazerPopup && ReactDOM.createPortal(
                <>
                    <div className="oa-popup-overlay" />
                    <div className="oa-popup-desfazer" onClick={e => e.stopPropagation()}>
                        <div className="oa-popup-desfazer-icone">✓</div>
                        <div className="oa-popup-desfazer-titulo">
                            {desfazerPopup.nome} liberado
                            {desfazerPopup.tipo === 'ALMOCO' ? ' do almoço' : desfazerPopup.tipo === 'PAUSA' ? ' da pausa' : ''}
                        </div>
                        <p className="oa-popup-desfazer-desc">
                            Clique em <strong>Desfazer</strong> para retornar ao intervalo.
                        </p>
                        <div className="oa-popup-desfazer-countdown">{desfazerPopup.countdown}s</div>
                        <div className="oa-popup-desfazer-acoes">
                            <button className="oa-popup-desfazer-btn desfazer" onClick={handleDesfazerLiberacao}>
                                <i className="fas fa-undo"></i> Desfazer
                            </button>
                            <button className="oa-popup-desfazer-btn confirmar" onClick={() => setDesfazerPopup(null)}>
                                Confirmar
                            </button>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}
