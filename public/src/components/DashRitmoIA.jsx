import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchAPI } from '/js/utils/api-utils';

const INTERVALO_MS = 5 * 60 * 1000; // 5 minutos

export default function DashRitmoIA({ metaDoUsuario }) {
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState(false);
    const timerRef = useRef(null);
    const metaPontosRef = useRef(null);

    const buscar = useCallback(async (metaPontos) => {
        try {
            const resultado = await fetchAPI(`/api/dashboard/ritmo-atual?meta_pontos=${metaPontos}`);
            setDados(resultado);
            setErro(false);
        } catch {
            setErro(true);
        } finally {
            setLoading(false);
        }
    }, []);

    const iniciarPolling = useCallback((metaPontos) => {
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            // Só busca se a aba estiver visível — evita chamadas desnecessárias à API
            if (document.visibilityState === 'visible') {
                buscar(metaPontos);
            }
        }, INTERVALO_MS);
    }, [buscar]);

    // Efeito principal: busca ao montar e quando a meta muda
    useEffect(() => {
        if (!metaDoUsuario) return;
        const metaPontos = metaDoUsuario.pontos_meta;

        if (metaPontos !== metaPontosRef.current) {
            metaPontosRef.current = metaPontos;
            setLoading(true);
            buscar(metaPontos);
        }

        iniciarPolling(metaPontos);
        return () => clearInterval(timerRef.current);
    }, [metaDoUsuario, buscar, iniciarPolling]);

    // Page Visibility API: pausa quando aba fica oculta, retoma com fetch imediato ao voltar
    useEffect(() => {
        const handleVisibility = () => {
            const metaPontos = metaPontosRef.current;
            if (!metaPontos) return;

            if (document.visibilityState === 'visible') {
                // Aba voltou ao foco: busca dados frescos e reinicia o intervalo
                buscar(metaPontos);
                iniciarPolling(metaPontos);
            } else {
                // Aba foi para segundo plano: cancela o intervalo
                clearInterval(timerRef.current);
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [buscar, iniciarPolling]);

    // Hoje não é dia de trabalho deste empregado → ocultar silenciosamente
    if (dados?.naoEDiaDeTrabalho) return null;

    // Erro de rede → ocultar silenciosamente
    if (erro) return null;

    if (loading) {
        return (
            <div className="ds-card ds-ritmo-ia-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999', fontSize: '0.85rem' }}>
                    <i className="fas fa-spinner fa-pulse"></i> Calculando ritmo...
                </div>
            </div>
        );
    }

    if (!dados) return null;

    const {
        pontosHoje, ritmoAtual, ritmoHistorico, comparacaoHistorico,
        nomeDiaAtual, previsao, temDadosSuficientes, amostrasHistorico
    } = dados;

    const metaPontos = metaDoUsuario?.pontos_meta || 0;
    const metaDescricao = metaDoUsuario?.descricao_meta || 'Meta';
    const metaBatida = metaPontos > 0 && pontosHoje >= metaPontos;
    const progresso = metaPontos > 0 ? Math.min((pontosHoje / metaPontos) * 100, 100) : 0;

    const handleAtualizar = () => {
        if (metaPontosRef.current) {
            setLoading(true);
            buscar(metaPontosRef.current);
        }
    };

    // Estado: meta já batida
    if (metaBatida) {
        return (
            <div className="ds-card ds-ritmo-ia-card">
                <div className="ds-ritmo-ia-header">
                    <span className="ds-ritmo-ia-titulo"><i className="fas fa-star" style={{ color: '#f9a825' }}></i> Análise de Ritmo</span>
                    <button onClick={handleAtualizar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: '0.9rem' }}>
                        <i className="fas fa-sync-alt"></i>
                    </button>
                </div>
                <div style={{ background: '#e6fffa', color: '#2c7a7b', borderRadius: '10px', padding: '14px', fontSize: '0.9rem', fontWeight: '600', textAlign: 'center' }}>
                    ✅ {metaDescricao} batida!<br />
                    <span style={{ fontSize: '0.8rem', fontWeight: '400', marginTop: '4px', display: 'block' }}>
                        Cada ponto extra agora vai para o seu Cofre!
                    </span>
                </div>
            </div>
        );
    }

    // Estado: sem dados suficientes (< 30 min trabalhados)
    if (!temDadosSuficientes) {
        return (
            <div className="ds-card ds-ritmo-ia-card">
                <div className="ds-ritmo-ia-header">
                    <span className="ds-ritmo-ia-titulo"><i className="fas fa-chart-line"></i> Análise de Ritmo</span>
                    <button onClick={handleAtualizar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: '0.9rem' }}>
                        <i className="fas fa-sync-alt"></i>
                    </button>
                </div>
                <div style={{ color: '#999', fontSize: '0.85rem', lineHeight: '1.6', marginBottom: '10px' }}>
                    ⏳ Aguardando dados... Trabalhe pelo menos 30 minutos para ativar a análise.
                </div>
                {ritmoHistorico != null && amostrasHistorico > 0 && (
                    <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '12px', fontSize: '0.85rem', color: '#555' }}>
                        Nas suas <strong>{nomeDiaAtual}s</strong>, você costuma fazer{' '}
                        <strong style={{ color: 'var(--ds-cor-primaria)' }}>{ritmoHistorico} pts/h</strong>. Boa sorte!
                    </div>
                )}
            </div>
        );
    }

    // Estado normal: com dados
    const acima = comparacaoHistorico != null && comparacaoHistorico >= 0;

    return (
        <div className="ds-card ds-ritmo-ia-card">
            <div className="ds-ritmo-ia-header">
                <span className="ds-ritmo-ia-titulo">
                    <i className="fas fa-chart-line"></i> Análise de Ritmo
                </span>
                <button onClick={handleAtualizar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: '0.9rem', padding: '4px' }}>
                    <i className="fas fa-sync-alt"></i>
                </button>
            </div>

            {/* Métricas: ritmo atual e histórico */}
            <div className="ds-ritmo-ia-metricas">
                <div className="ds-ritmo-ia-metrica">
                    <div className="ds-ritmo-ia-valor-grande" style={{ color: 'var(--ds-cor-azul-escuro)' }}>
                        {ritmoAtual}
                    </div>
                    <div className="ds-ritmo-ia-label">pts/h agora</div>
                    {comparacaoHistorico != null && (
                        <div className={`ds-ritmo-ia-comparacao ${acima ? 'acima' : 'abaixo'}`}>
                            {acima ? `↑ +${comparacaoHistorico}%` : `↓ ${comparacaoHistorico}%`} vs. suas {nomeDiaAtual}s
                        </div>
                    )}
                </div>

                {ritmoHistorico != null && amostrasHistorico > 0 && (
                    <div className="ds-ritmo-ia-metrica">
                        <div className="ds-ritmo-ia-valor-grande" style={{ color: '#999' }}>
                            {ritmoHistorico}
                        </div>
                        <div className="ds-ritmo-ia-label">pts/h média {nomeDiaAtual}</div>
                        <div style={{ fontSize: '0.72rem', color: '#bbb', marginTop: '4px' }}>
                            {amostrasHistorico} semana{amostrasHistorico !== 1 ? 's' : ''} analisada{amostrasHistorico !== 1 ? 's' : ''}
                        </div>
                    </div>
                )}
            </div>

            {/* Previsão de batida de meta */}
            {previsao && (
                <div className={`ds-ritmo-ia-previsao ${!previsao.atingivel ? 'nao-atingivel' : ''}`}>
                    {previsao.atingivel
                        ? `🎯 No ritmo atual, você vai bater a ${metaDescricao} às ${previsao.horario}`
                        : `⚠️ No ritmo atual, a ${metaDescricao} seria atingida às ${previsao.horario} — acima do expediente`}
                </div>
            )}

            {/* Barra de progresso do dia */}
            <div style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#999', marginBottom: '4px' }}>
                    <span>{pontosHoje} pts feitos hoje</span>
                    <span>Meta: {metaPontos} pts</span>
                </div>
                <div style={{ height: '6px', borderRadius: '3px', background: '#e9ecef', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', borderRadius: '3px',
                        width: `${progresso}%`,
                        background: progresso >= 100 ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-primaria)',
                        transition: 'width 0.6s ease'
                    }}></div>
                </div>
            </div>
        </div>
    );
}
