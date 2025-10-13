// public/src/pages/ConfigAlertas/ConfigAlertasPage.jsx

import React, { useState, useEffect } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import AlertaCard from './AlertaCard.jsx'; // Importa nosso novo componente
import DiasTrabalhoCard from './DiasTrabalhoCard.jsx';

// Função para buscar/salvar dados da API (similar à que já fizemos)
async function fetchApi(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro na requisição');
    }
    return response.json();
}

export default function ConfigAlertasPage() {
    const [configuracoes, setConfiguracoes] = useState([]);
    const [diasDeTrabalho, setDiasDeTrabalho] = useState({});
    
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        Promise.all([
            fetchApi('/api/alertas/configuracoes'),
            fetchApi('/api/alertas/dias-trabalho')
        ]).then(([configsAlertas, configDias]) => {
            setConfiguracoes(configsAlertas);
            setDiasDeTrabalho(configDias.valor || {});
        }).catch(err => {
            mostrarMensagem(`Erro ao carregar configurações: ${err.message}`, 'erro');
        }).finally(() => {
            setCarregando(false);
        });
    }, []);

    // Função que o AlertaCard vai chamar para atualizar o estado
    const handleUpdateConfig = (id, campo, novoValor) => {
        setConfiguracoes(prevConfigs => 
            prevConfigs.map(config => 
                config.id === id ? { ...config, [campo]: novoValor } : config
            )
        );
    };
    
    const handleUpdateDias = (novaConfigDias) => {
        setDiasDeTrabalho(novaConfigDias);
    };

    const handleSalvar = async () => {
        setSalvando(true);
        try {
            await Promise.all([
                fetchApi('/api/alertas/configuracoes', {
                    method: 'PUT',
                    body: JSON.stringify(configuracoes),
                }),
                fetchApi('/api/alertas/dias-trabalho', {
                    method: 'PUT',
                    body: JSON.stringify({ valor: diasDeTrabalho }),
                })
            ]);
            mostrarMensagem('Configurações salvas com sucesso!', 'sucesso');
        } catch (err) {
            mostrarMensagem(`Erro ao salvar: ${err.message}`, 'erro');
        } finally {
            setSalvando(false);
        }
    };

    if (carregando) {
        return <div className="spinner">Carregando configurações...</div>;
    }

    return (
        <>
            <div className="config-header">
                <h1>Configurações de Alertas</h1>
                <button className="gs-btn gs-btn-sucesso" onClick={handleSalvar} disabled={salvando}>
                    {salvando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-save"></i>}
                    {salvando ? 'Salvando...' : 'Salvar Alterações'}
                </button>
            </div>

            <DiasTrabalhoCard 
                diasConfig={diasDeTrabalho}
                onUpdate={handleUpdateDias}
            />

            {/* Renderiza um CardDeAlerta para cada configuração encontrada */}
            {configuracoes.map(config => (
                <AlertaCard 
                    key={config.id}
                    config={config}
                    onUpdate={handleUpdateConfig}
                />
            ))}
        </>
    );
}