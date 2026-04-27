import React from 'react';

function PGMetaTimeline({ pontosAtuais = 0, metaBronze, metaPrata, metaOuro }) {
    if (!metaBronze || !metaPrata || !metaOuro || metaOuro <= 0) return null;

    const max = metaOuro * 1.2;
    const pctBronze = (metaBronze / max) * 100;
    const pctPrata  = (metaPrata  / max) * 100;
    const pctOuro   = (metaOuro   / max) * 100;
    const pctAtual  = Math.min((pontosAtuais / max) * 100, 100);

    const corBarra = pontosAtuais >= metaOuro   ? '#f59e0b'
                   : pontosAtuais >= metaPrata  ? '#9e9e9e'
                   : pontosAtuais >= metaBronze ? '#cd7f32'
                   : '#e74c3c';

    let textoContexto;
    if (pontosAtuais >= metaOuro) {
        textoContexto = `✨ +${(pontosAtuais - metaOuro).toFixed(0)} pts acima do Ouro!`;
    } else if (pontosAtuais >= metaPrata) {
        textoContexto = `Faltam ${(metaOuro - pontosAtuais).toFixed(0)} pts para 🥇 Ouro`;
    } else if (pontosAtuais >= metaBronze) {
        textoContexto = `Faltam ${(metaPrata - pontosAtuais).toFixed(0)} pts para 🥈 Prata`;
    } else {
        textoContexto = `Faltam ${(metaBronze - pontosAtuais).toFixed(0)} pts para 🥉 Bronze`;
    }

    return (
        <div className="pg-meta-timeline">
            <div className="pg-meta-timeline-track">
                <div className="pg-meta-timeline-barra-bg">
                    <div
                        className="pg-meta-timeline-barra-fill"
                        style={{ width: `${pctAtual}%`, backgroundColor: corBarra }}
                    ></div>
                </div>
                <div className="pg-meta-marco" style={{ left: `${pctBronze}%` }}>
                    <div className="pg-meta-marco-tick"></div>
                    <span className="pg-meta-marco-label">🥉</span>
                </div>
                <div className="pg-meta-marco" style={{ left: `${pctPrata}%` }}>
                    <div className="pg-meta-marco-tick"></div>
                    <span className="pg-meta-marco-label">🥈</span>
                </div>
                <div className="pg-meta-marco" style={{ left: `${pctOuro}%` }}>
                    <div className="pg-meta-marco-tick"></div>
                    <span className="pg-meta-marco-label">🥇</span>
                </div>
            </div>
            <p className="pg-meta-timeline-contexto" style={{ color: corBarra }}>{textoContexto}</p>
        </div>
    );
}

export default PGMetaTimeline;
