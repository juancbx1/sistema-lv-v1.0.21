// public/src/pages/ConfigAlertas/AlertaCard.jsx

import React, { useState, useEffect } from 'react';

// Nível de cada tipo de alerta — define a pill colorida no header do card
const NIVEL_POR_TIPO = {
    // Produção — Arremate (tiktik)
    OCIOSIDADE_ARREMATE:       { label: 'CRÍTICO', cor: '#e74c3c' },
    LENTIDAO_CRITICA_ARREMATE: { label: 'AVISO',   cor: '#e67e22' },
    META_BATIDA_ARREMATE:      { label: 'INFO',     cor: '#27ae60' },
    // Produção — Costura (costureira)
    OCIOSIDADE_COSTUREIRA:     { label: 'CRÍTICO',  cor: '#e74c3c' },
    LENTIDAO_COSTUREIRA:       { label: 'AVISO',    cor: '#e67e22' },
    // Demandas
    DEMANDA_NOVA:              { label: 'CRÍTICO',  cor: '#e74c3c' },
    DEMANDA_PRIORITARIA:       { label: 'CRÍTICO',  cor: '#e74c3c' },
    DEMANDA_NAO_INICIADA:      { label: 'AVISO',    cor: '#e67e22' },
};

function ToggleSwitch({ checked, onChange }) {
    return (
        <label className="switch">
            <input type="checkbox" checked={checked} onChange={onChange} />
            <span className="slider"></span>
        </label>
    );
}

export default function AlertaCard({ config, onUpdate }) {
    const nivel = NIVEL_POR_TIPO[config.tipo_alerta];

    // Estado local como string para evitar o "03" ao digitar após apagar
    const [gatilhoStr, setGatilhoStr]     = useState(String(config.gatilho_minutos));
    const [intervaloStr, setIntervaloStr] = useState(String(config.intervalo_repeticao_minutos));

    // Sincroniza se o pai atualizar os valores (ex: reload)
    useEffect(() => { setGatilhoStr(String(config.gatilho_minutos)); },     [config.gatilho_minutos]);
    useEffect(() => { setIntervaloStr(String(config.intervalo_repeticao_minutos)); }, [config.intervalo_repeticao_minutos]);

    const handleGatilhoBlur = () => {
        const val = parseInt(gatilhoStr) || 0;
        setGatilhoStr(String(val));
        onUpdate(config.id, 'gatilho_minutos', val);
    };

    const handleIntervaloBlur = () => {
        const val = parseInt(intervaloStr) || 0;
        setIntervaloStr(String(val));
        onUpdate(config.id, 'intervalo_repeticao_minutos', val);
    };

    // Descrição: usar a parte depois dos dois pontos se existir, senão a descrição completa
    const partes = config.descricao?.split(':') || [];
    const titulo  = partes[0]?.trim() || config.tipo_alerta.replace(/_/g, ' ');
    const detalhe = partes.slice(1).join(':').trim();

    return (
        <div className={`config-card${config.ativo ? ' ativo' : ''}`}>
            <div className="config-card-header">
                <div className="config-card-header-info">
                    <span className="config-card-titulo">{titulo}</span>
                    {detalhe && <span className="config-card-detalhe">{detalhe}</span>}
                </div>
                <div className="config-card-header-acoes">
                    {nivel && (
                        <span
                            className="config-nivel-pill"
                            style={{ color: nivel.cor, borderColor: nivel.cor, background: `${nivel.cor}12` }}
                        >
                            {nivel.label}
                        </span>
                    )}
                    <ToggleSwitch
                        checked={config.ativo}
                        onChange={() => onUpdate(config.id, 'ativo', !config.ativo)}
                    />
                </div>
            </div>

            {config.ativo && (
                <div className="config-card-body">
                    <div className="config-form-grupo">
                        <label>Disparar após</label>
                        <div className="config-input-sufixo">
                            <input
                                type="number"
                                min="0"
                                className="gs-input"
                                value={gatilhoStr}
                                onChange={e => setGatilhoStr(e.target.value)}
                                onBlur={handleGatilhoBlur}
                            />
                            <span>min</span>
                        </div>
                    </div>

                    <div className="config-form-grupo">
                        <label>Repetir a cada</label>
                        <div className="config-input-sufixo">
                            <input
                                type="number"
                                min="0"
                                className="gs-input"
                                value={intervaloStr}
                                onChange={e => setIntervaloStr(e.target.value)}
                                onBlur={handleIntervaloBlur}
                            />
                            <span>min</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
