import React, { useState } from 'react';

export default function DashTermometro({
    valorAcumulado,
    diasUteisNoCiclo,
    diasTrabalhadosNoCiclo,
    metaDoUsuario,
    metasPossiveis
}) {
    const [visivel, setVisivel] = useState(true);

    if (!metaDoUsuario || !metasPossiveis || metasPossiveis.length === 0) return null;

    const metas = metasPossiveis;
    const metaBronzeTotal = parseFloat(metas[0].valor_comissao) * diasUteisNoCiclo;
    const metaPrataTotal = metas.length >= 2
        ? parseFloat(metas[1].valor_comissao) * diasUteisNoCiclo
        : metaBronzeTotal;
    const metaOuroTotal = parseFloat(metas[metas.length - 1].valor_comissao) * diasUteisNoCiclo;

    const metaAlvo = parseFloat(metaDoUsuario.valor_comissao) * diasUteisNoCiclo;
    const progresso = metaAlvo > 0 ? Math.min((valorAcumulado / metaAlvo) * 100, 100) : 0;

    const diasRestantes = Math.max(0, diasUteisNoCiclo - diasTrabalhadosNoCiclo);
    const mediaAtual = diasTrabalhadosNoCiclo > 0 ? valorAcumulado / diasTrabalhadosNoCiclo : 0;
    const projecaoFinal = mediaAtual * diasUteisNoCiclo;

    // Cor da projeção
    let projecaoStatus = 'status-bom';
    let projecaoEmoji = '📊';
    if (projecaoFinal < metaBronzeTotal) {
        projecaoStatus = 'status-perigo';
        projecaoEmoji = '⚠️';
    } else if (projecaoFinal < metaPrataTotal) {
        projecaoStatus = 'status-atencao';
        projecaoEmoji = '📊';
    }

    // Cor da barra de progresso
    const corBarra = projecaoFinal >= metaPrataTotal
        ? 'linear-gradient(90deg, #2e7d32, #a5d6a7)'
        : 'linear-gradient(90deg, #388e3c, #66bb6a)';

    const fmt = (val) => visivel ? `R$ ${val.toFixed(2)}` : '•••••';
    const fmtSec = (val) => visivel ? `R$ ${val.toFixed(0)}` : '•••';

    // Calcula posição % de cada marcador dentro da barra (relativo à metaAlvo)
    const posBronze = metaAlvo > 0 ? Math.min((metaBronzeTotal / metaAlvo) * 100, 100) : 0;
    const posPrata = metaAlvo > 0 ? Math.min((metaPrataTotal / metaAlvo) * 100, 100) : 0;
    const posOuro = metaAlvo > 0 ? Math.min((metaOuroTotal / metaAlvo) * 100, 100) : 100;

    return (
        <div className="ds-card ds-termometro-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--ds-cor-azul-escuro)' }}>
                    💰 Termômetro do Ciclo
                </span>
                <button
                    onClick={() => setVisivel(v => !v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '1rem', padding: '4px 6px' }}
                    title={visivel ? 'Ocultar valores' : 'Mostrar valores'}
                >
                    <i className={`fas ${visivel ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                </button>
            </div>

            {/* Barra de progresso com marcadores */}
            <div className="ds-termometro-barra-container">
                {/* Marcadores */}
                {posBronze < 100 && (
                    <div className="ds-termometro-marcador" style={{ left: `${posBronze}%` }}>
                        <div className="ds-termometro-marcador-linha"></div>
                        <span className="ds-termometro-marcador-label">Bronze</span>
                    </div>
                )}
                {posPrata > 0 && posPrata < 100 && posPrata !== posBronze && (
                    <div className="ds-termometro-marcador" style={{ left: `${posPrata}%` }}>
                        <div className="ds-termometro-marcador-linha"></div>
                        <span className="ds-termometro-marcador-label">Prata</span>
                    </div>
                )}
                {posOuro < 100 && posOuro > posPrata && (
                    <div className="ds-termometro-marcador" style={{ left: `${posOuro}%` }}>
                        <div className="ds-termometro-marcador-linha"></div>
                        <span className="ds-termometro-marcador-label">Ouro</span>
                    </div>
                )}

                {/* Barra preenchida */}
                <div
                    className="ds-termometro-barra-fill"
                    style={{ width: `${progresso}%`, background: corBarra }}
                ></div>

                {/* % de progresso no final da barra */}
                <span style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '0.68rem',
                    fontWeight: '700',
                    color: progresso > 70 ? '#fff' : '#555'
                }}>
                    {Math.round(progresso)}%
                </span>
            </div>

            {/* Linha de resumo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#666', marginBottom: '10px' }}>
                <span><strong style={{ color: 'var(--ds-cor-azul-escuro)' }}>{fmt(valorAcumulado)}</strong> ganhos</span>
                <span>Faltam <strong>{diasRestantes}</strong> dia{diasRestantes !== 1 ? 's' : ''} útei{diasRestantes !== 1 ? 's' : 'l'}</span>
            </div>

            {/* Projeção */}
            {diasTrabalhadosNoCiclo > 0 && (
                <div className={`ds-termometro-projecao ${projecaoStatus}`}>
                    {projecaoEmoji} Na sua média atual: fechar o ciclo com aprox.{' '}
                    <strong>{fmtSec(projecaoFinal)}</strong>
                </div>
            )}
        </div>
    );
}
