// public/src/pages/ConfigAlertas/DiasTrabalhoCard.jsx

import React from 'react';

const DIAS_DA_SEMANA = [
    { id: 0, nome: 'Domingo' },
    { id: 1, nome: 'Segunda-feira' },
    { id: 2, nome: 'Terça-feira' },
    { id: 3, nome: 'Quarta-feira' },
    { id: 4, nome: 'Quinta-feira' },
    { id: 5, nome: 'Sexta-feira' },
    { id: 6, nome: 'Sábado' },
];

export default function DiasTrabalhoCard({ diasConfig, onUpdate }) {
    
    const handleDiaToggle = (diaId) => {
        // Cria um novo objeto para não modificar o estado diretamente
        const novaConfig = { ...diasConfig };
        novaConfig[diaId] = !novaConfig[diaId]; // Inverte o valor (true -> false)
        onUpdate(novaConfig); // Envia o objeto inteiro atualizado para o componente pai
    };

    return (
        <div className="config-card">
            <div className="card-header">
                <h3>Dias de Operação dos Alertas</h3>
            </div>
            <div className="card-body" style={{ gridTemplateColumns: '1fr' }}>
                <div className="form-group">
                    <label>Selecione os dias em que os alertas devem estar ativos:</label>
                    <div className="dias-semana-container">
                        {DIAS_DA_SEMANA.map(dia => (
                            <label key={dia.id}>
                                <input 
                                    type="checkbox"
                                    checked={!!diasConfig[dia.id]} // Usa '!!' para garantir que seja sempre um booleano
                                    onChange={() => handleDiaToggle(dia.id)}
                                />
                                {dia.nome}
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}