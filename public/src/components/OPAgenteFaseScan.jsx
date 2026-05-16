// public/src/components/OPAgenteFaseScan.jsx
// Linha do terminal de scan com suporte opcional a contador incremental.

import React from 'react';
import useContador from '../hooks/useContador.js';

export default function OPAgenteFaseScan({ fase, isCurrent, isCompleted }) {
    const temContador = !!(fase.contador && fase.contador.alvo > 0);
    const valorContador = useContador(
        temContador ? fase.contador.alvo : 0,
        temContador ? 900 : 0,
        temContador && isCompleted // anima apenas quando a fase já passou
    );

    return (
        <div className={`op-agente-linha ${isCompleted ? 'concluida' : isCurrent ? 'atual' : ''}`}>
            <span className="agente-prompt">{isCompleted ? '✓' : '›'}</span>
            <span className="agente-msg">
                {fase.texto}
                {temContador && isCompleted && (
                    <span className="op-agente-contador">
                        {' '}{valorContador} {fase.contador.sufixo}
                    </span>
                )}
            </span>
            {isCurrent && <span className="agente-cursor">▌</span>}
        </div>
    );
}
