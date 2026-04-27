import React, { useState, useEffect, useRef } from 'react';
import { fetchAPI } from '/js/utils/api-utils';
import { mostrarMensagem } from '/js/utils/popups.js';

export default function DashRankingCard() {
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const intervalRef = useRef(null);

    const buscar = async () => {
        try {
            const resultado = await fetchAPI('/api/dashboard/ranking-semana');
            setDados(resultado);
        } catch {
            setDados(null);
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        buscar();
        intervalRef.current = setInterval(buscar, 10 * 60 * 1000);

        const aoMudarVisibilidade = () => {
            if (document.visibilityState === 'visible') {
                buscar();
                intervalRef.current = setInterval(buscar, 10 * 60 * 1000);
            } else {
                clearInterval(intervalRef.current);
            }
        };
        document.addEventListener('visibilitychange', aoMudarVisibilidade);

        return () => {
            clearInterval(intervalRef.current);
            document.removeEventListener('visibilitychange', aoMudarVisibilidade);
        };
    }, []);

    if (carregando) return null;
    if (!dados || dados.totalParticipantes <= 1 || dados.ranking.length === 0) return null;

    const { minhaPosicao, totalParticipantes, tipoUsuario, gapParaProximo, posicaoAcima, labelSemana, diaSemana, todosZerados, ranking } = dados;

    const maxPontos = Math.max(...ranking.filter(r => !r.separador && r.pontos != null).map(r => r.pontos), 1);

    const gerarLabel = (item, idx) => {
        if (item.isEu) return 'Você';
        if (tipoUsuario === 'tiktik') return `Tiktik #${item.posicao}`;
        return `Colega #${item.posicao}`;
    };

    const renderMotivacao = () => {
        // Ninguém trabalhou ainda esta semana
        if (todosZerados) {
            if (diaSemana === 0) return '☀️ Semana começando! Amanhã é hora de pontuar!';
            return '⏳ Nenhuma produção ainda esta semana. Seja o primeiro a pontuar!';
        }

        const eSabado = diaSemana === 6;

        if (minhaPosicao === 1) {
            if (eSabado) return '🏆 Você foi o melhor desta semana! Parabéns, continue essa pegada!';
            return '🎉 Você está em primeiro! Continue assim!';
        }

        if (eSabado) {
            return `A semana acabou. Semana que vem você chega lá! 💪`;
        }

        if (gapParaProximo <= 50) {
            return `Você está a apenas ${gapParaProximo} pts do ${posicaoAcima}° lugar! Vai que vai!`;
        }
        if (posicaoAcima) {
            return `Você está a ${gapParaProximo} pts do ${posicaoAcima}° lugar. Dá pra alcançar! 💪`;
        }
        return 'Continue produzindo — cada ponto conta!';
    };

    return (
        <div className="ds-card ds-ranking-card">
            <div className="ds-ranking-header">
                <span className="ds-card-titulo">
                    🏆 Ranking da Semana
                    <button
                        className="ds-ranking-info-btn"
                        title="Sobre o ranking"
                        onClick={() => mostrarMensagem(
                            '🏆 <strong>Ranking da Semana</strong><br><br>' +
                            'O ranking conta apenas a produção real da semana — ' +
                            'peças produzidas e arremates.<br><br>' +
                            '✨ <strong>Pontos Extras</strong> (bônus concedidos pelo supervisor) ' +
                            '<strong>não entram no ranking</strong>, pois seria injusto comparar ' +
                            'quem recebeu bônus com quem não recebeu.<br><br>' +
                            'Continue produzindo para subir na classificação! 💪',
                            'info'
                        )}
                    >
                        <i className="fas fa-circle-info"></i>
                    </button>
                </span>
                <span className="ds-ranking-semana-label">{labelSemana}</span>
            </div>

            <div className="ds-ranking-lista">
                {ranking.map((item, idx) => {
                    if (item.separador) {
                        return (
                            <div key={`sep-${idx}`} className="ds-ranking-item separador">
                                · · · · ·
                            </div>
                        );
                    }

                    const isPrimeiro = item.posicao === 1;
                    const barraLargura = item.pontos != null ? Math.round((item.pontos / maxPontos) * 100) : 0;

                    return (
                        <div
                            key={`pos-${item.posicao}`}
                            className={`ds-ranking-item${item.isEu ? ' sou-eu' : ''}${isPrimeiro ? ' primeiro' : ''}`}
                        >
                            <span className="ds-ranking-posicao">
                                {isPrimeiro ? '🥇' : `${item.posicao}°`}
                            </span>
                            <span className={`ds-ranking-nome${item.isEu ? ' sou-eu' : ''}`}>
                                {gerarLabel(item, idx)}
                            </span>
                            <div className="ds-ranking-barra-container">
                                <div
                                    className={`ds-ranking-barra-fill${isPrimeiro ? ' primeiro' : ''}${item.isEu ? ' sou-eu' : ''}`}
                                    style={{ width: `${barraLargura}%` }}
                                />
                            </div>
                            <span className="ds-ranking-pontos">
                                {item.pontos != null ? `${item.pontos.toLocaleString('pt-BR')} pts` : '—'}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="ds-ranking-motivacao">
                {renderMotivacao()}
            </div>
        </div>
    );
}
