// public/src/pages/ConfigAlertas/ConfigAlertasPage.jsx

import React, { useState, useEffect } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import AlertaCard from './AlertaCard.jsx';
import DiasTrabalhoCard from './DiasTrabalhoCard.jsx';

async function fetchApi(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro na requisição');
    }
    return response.json();
}

const GRUPOS = [
    {
        titulo: 'Área de Produção',
        icone: 'fa-industry',
        cor: '#8e44ad',
        tipos: [
            'OCIOSIDADE_ARREMATE', 'LENTIDAO_CRITICA_ARREMATE', 'META_BATIDA_ARREMATE',
            'OCIOSIDADE_COSTUREIRA', 'LENTIDAO_COSTUREIRA',
        ],
    },
    {
        titulo: 'Demandas de Produção',
        icone: 'fa-tasks',
        cor: '#e74c3c',
        tipos: ['DEMANDA_NOVA', 'DEMANDA_PRIORITARIA', 'DEMANDA_NAO_INICIADA'],
    },
];

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

    const handleUpdateConfig = (id, campo, novoValor) => {
        setConfiguracoes(prev => prev.map(c => c.id === id ? { ...c, [campo]: novoValor } : c));
    };

    const handleSalvar = async () => {
        setSalvando(true);
        try {
            await Promise.all([
                fetchApi('/api/alertas/configuracoes', { method: 'PUT', body: JSON.stringify(configuracoes) }),
                fetchApi('/api/alertas/dias-trabalho', { method: 'PUT', body: JSON.stringify({ valor: diasDeTrabalho }) })
            ]);
            mostrarMensagem('Configurações salvas com sucesso!', 'sucesso');
        } catch (err) {
            mostrarMensagem(`Erro ao salvar: ${err.message}`, 'erro');
        } finally {
            setSalvando(false);
        }
    };

    const handleTestarSom = () => {
        new Audio('/sounds/alerta.mp3').play().catch(() => {
            mostrarMensagem('Não foi possível reproduzir o som. Interaja com a página primeiro.', 'aviso');
        });
    };

    if (carregando) return <div className="spinner">Carregando configurações...</div>;

    return (
        <>
            <div className="config-header">
                <h1>Configurações de Alertas</h1>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="gs-btn gs-btn-secundario" onClick={handleTestarSom}>
                        <i className="fas fa-volume-up"></i> Testar Som
                    </button>
                    <button className="gs-btn gs-btn-sucesso" onClick={handleSalvar} disabled={salvando}>
                        {salvando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-save"></i>}
                        {salvando ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>

            <DiasTrabalhoCard diasConfig={diasDeTrabalho} onUpdate={setDiasDeTrabalho} />

            {GRUPOS.map(grupo => {
                const cardsDoGrupo = configuracoes.filter(c => grupo.tipos.includes(c.tipo_alerta));
                if (cardsDoGrupo.length === 0) return null;

                return (
                    <section key={grupo.titulo} className="config-grupo">
                        <div className="config-grupo-header" style={{ borderLeftColor: grupo.cor }}>
                            <i className={`fas ${grupo.icone}`} style={{ color: grupo.cor }}></i>
                            <h2>{grupo.titulo}</h2>
                        </div>
                        {cardsDoGrupo.map(config => (
                            <AlertaCard
                                key={config.id}
                                config={config}
                                onUpdate={handleUpdateConfig}
                            />
                        ))}
                    </section>
                );
            })}

            {/* Alertas que não se encaixam em nenhum grupo (segurança) */}
            {configuracoes
                .filter(c => !GRUPOS.flatMap(g => g.tipos).includes(c.tipo_alerta))
                .map(config => (
                    <AlertaCard key={config.id} config={config} onUpdate={handleUpdateConfig} />
                ))
            }

            <div className="config-futuras-areas">
                <i className="fas fa-flask"></i>
                <div>
                    <strong>Próximas áreas monitoradas</strong>
                    <span>Financeiro · Estoque · Qualidade · RH</span>
                </div>
                <span className="config-futuras-badge">Em desenvolvimento</span>
            </div>
        </>
    );
}
