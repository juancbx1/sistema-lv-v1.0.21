import React from 'react';

function PGComparacaoBadge({ valorHoje, valorOntem, visivel = true }) {
    if (!visivel || !valorOntem || valorOntem === 0) return null;
    const variacao = ((valorHoje - valorOntem) / valorOntem) * 100;
    if (Math.abs(variacao) < 0.5) {
        return <span className="pg-badge-comp pg-badge-comp--neutro"><i className="fas fa-equals"></i> 0%</span>;
    }
    const positivo = variacao > 0;
    return (
        <span className={`pg-badge-comp ${positivo ? 'pg-badge-comp--positivo' : 'pg-badge-comp--negativo'}`}>
            <i className={`fas fa-arrow-${positivo ? 'up' : 'down'}`}></i>
            {' '}{Math.abs(variacao).toFixed(0)}%
        </span>
    );
}

export default PGComparacaoBadge;
