import React from 'react';
import PGComparacaoBadge from './PGComparacaoBadge.jsx';

const DIAS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function formatarRefLabel(isoDate) {
    if (!isoDate) return null;
    const [ano, mes, dia] = isoDate.split('-');
    // Usar UTC noon para evitar problemas de timezone
    const d = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
    return `${DIAS_PT[d.getUTCDay()]} ${dia}/${mes}`;
}

function Bloco({ label, valor, valorOntem, filtroDia }) {
    return (
        <div className="pg-kpi-bloco">
            <span className="pg-kpi-valor">{(valor || 0).toLocaleString('pt-BR')}</span>
            <span className="pg-kpi-label">{label}</span>
            <PGComparacaoBadge valorHoje={valor} valorOntem={valorOntem} visivel={filtroDia} />
        </div>
    );
}

function PGKpiBar({ equipeHoje, equipeOntem, filtroDia, diaAnteriorRef }) {
    if (!equipeHoje) return null;
    const refLabel = filtroDia ? formatarRefLabel(diaAnteriorRef) : null;

    return (
        <div>
            <div className="pg-kpi-bar">
                <Bloco label="Prod. Costura" valor={equipeHoje.pecasCostura}        valorOntem={equipeOntem?.pecasCostura}        filtroDia={filtroDia} />
                <Bloco label="Prod. Tiktik"  valor={equipeHoje.producaoTiktikTotal} valorOntem={equipeOntem?.producaoTiktikTotal} filtroDia={filtroDia} />
                <Bloco label="Prod. Total"   valor={equipeHoje.producaoTotal}       valorOntem={equipeOntem?.producaoTotal}       filtroDia={filtroDia} />
                <Bloco label="Pontos Total"  valor={equipeHoje.pontosTotal}         valorOntem={equipeOntem?.pontosTotal}         filtroDia={filtroDia} />
            </div>
            {refLabel && (
                <p className="pg-kpi-ref-label">
                    <i className="fas fa-clock-rotate-left"></i>
                    {' '}As setas comparam com <strong>{refLabel}</strong> — último dia com produção
                </p>
            )}
        </div>
    );
}

export default PGKpiBar;
