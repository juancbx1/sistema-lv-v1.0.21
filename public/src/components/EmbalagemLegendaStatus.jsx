// public/src/components/EmbalagemLegendaStatus.jsx
import React from 'react';

function EmbalagemLegendaStatus() {
    return (
        <div className="ep-legenda-status-container">
            <h4 className="ep-legenda-titulo">Entenda as cores das bordas:</h4>
            <ul className="ep-legenda-lista">
                <li className="ep-legenda-item">
                    <span className="ep-legenda-cor normal"></span>
                    <span>Aguardando há - de 2 dias</span>
                </li>
                <li className="ep-legenda-item">
                    <span className="ep-legenda-cor aviso"></span>
                    <span>Aguardando há + de 2 dias</span>
                </li>
            </ul>
        </div>
    );
}

export default EmbalagemLegendaStatus;