// public/src/pages/ConfigAlertas/AlertaCard.jsx

import React from 'react';

// Componente para o interruptor (toggle switch)
function ToggleSwitch({ checked, onChange }) {
    return (
        <label className="switch">
            <input type="checkbox" checked={checked} onChange={onChange} />
            <span className="slider"></span>
        </label>
    );
}

export default function CardDeAlerta({ config, onUpdate }) {
    
    // Funções para lidar com mudanças nos inputs
    const handleToggle = (campo) => {
        onUpdate(config.id, campo, !config[campo]);
    };

    const handleMinutosChange = (e) => {
        onUpdate(config.id, 'gatilho_minutos', parseInt(e.target.value) || 0);
    };

    return (
        <div className="config-card">
            <div className="card-header">
                <h3>{config.descricao.split(':')[0]}</h3>
                <ToggleSwitch 
                    checked={config.ativo}
                    onChange={() => handleToggle('ativo')}
                />
            </div>
            {config.ativo && ( // O corpo do card só aparece se o alerta estiver ativo
                <div className="card-body">
                    <div className="form-group">
                        <label>Disparar após:</label>
                        <div className="input-com-sufixo">
                            <input 
                                type="number" 
                                className="gs-input" 
                                value={config.gatilho_minutos}
                                onChange={handleMinutosChange}
                            />
                            <span>minutos</span>
                        </div>
                    </div>

                     <div className="form-group">
                    <label>Repetir alerta a cada:</label>
                    <div className="input-com-sufixo">
                        <input 
                            type="number" 
                            className="gs-input" 
                            value={config.intervalo_repeticao_minutos}
                            onChange={(e) => onUpdate(config.id, 'intervalo_repeticao_minutos', parseInt(e.target.value) || 0)}
                        />
                        <span>minutos</span>
                    </div>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}> {/* Ocupa a linha inteira */}
                    <label>Notificar via:</label>
                        <div>
                            <label className="dias-semana-container" style={{ gap: '25px' }}>
                                <label>
                                    <input 
                                        type="checkbox" 
                                        checked={config.acao_popup} 
                                        onChange={() => handleToggle('acao_popup')}
                                    />
                                    Popup na Tela
                                </label>
                                <label>
                                    <input 
                                        type="checkbox" 
                                        checked={config.acao_notificacao}
                                        onChange={() => handleToggle('acao_notificacao')}
                                    />
                                    Notificação no Navegador
                                </label>
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}