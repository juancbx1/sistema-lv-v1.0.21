import React from 'react';

const CHIPS = [
    { valor: 'dia_inteiro', label: 'Dia Inteiro' },
    { valor: 'ate_9h',      label: 'Até 9h' },
    { valor: '9h_12h',      label: '9h–12h' },
    { valor: '14h_16h',     label: '14h–16h' },
    { valor: 'apos_16h',    label: 'Após 16h' },
];

function PGFiltrosPeriodo({ ativo, onChange }) {
    return (
        <div className="pg-filtros-periodo">
            {CHIPS.map(c => (
                <button
                    key={c.valor}
                    className={`pg-chip${ativo === c.valor ? ' pg-chip--ativo' : ''}`}
                    onClick={() => onChange(c.valor)}
                >
                    {c.label}
                </button>
            ))}
        </div>
    );
}

export default PGFiltrosPeriodo;
