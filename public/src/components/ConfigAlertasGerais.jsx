// public/src/components/ConfigAlertasGerais.jsx
// Conteúdo original de ConfigAlertasPage extraído para permitir a estrutura de abas.

import React, { useState, useEffect } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import AlertaCard from '../pages/ConfigAlertas/AlertaCard.jsx';
import DiasTrabalhoCard from '../pages/ConfigAlertas/DiasTrabalhoCard.jsx';
import HorariosCard from '../pages/ConfigAlertas/HorariosCard.jsx';
import UICarregando from './UICarregando.jsx';

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
        tipos: ['DEMANDA_NORMAL', 'DEMANDA_PRIORITARIA', 'DEMANDA_NAO_INICIADA'],
    },
];

export default function ConfigAlertasGerais({ onTestarSom }) {
    const [configuracoes, setConfiguracoes] = useState([]);
    const [diasDeTrabalho, setDiasDeTrabalho] = useState({});
    const [horarioInicio, setHorarioInicio]       = useState('07:00');
    const [horarioFim, setHorarioFim]             = useState('18:00');
    const [janelaPollInicio, setJanelaPollInicio] = useState('06:00');
    const [janelaPollFim, setJanelaPollFim]       = useState('23:00');
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        Promise.all([
            fetchApi('/api/alertas/configuracoes'),
            fetchApi('/api/alertas/dias-trabalho')
        ]).then(([configsAlertas, configDias]) => {
            setConfiguracoes(configsAlertas);
            setDiasDeTrabalho(configDias.valor || {});
            setHorarioInicio(configDias.horario_inicio        || '07:00');
            setHorarioFim(configDias.horario_fim              || '18:00');
            setJanelaPollInicio(configDias.janela_poll_inicio || '06:00');
            setJanelaPollFim(configDias.janela_poll_fim       || '23:00');
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
                fetchApi('/api/alertas/configuracoes', {
                    method: 'PUT',
                    body: JSON.stringify(configuracoes),
                }),
                fetchApi('/api/alertas/dias-trabalho', {
                    method: 'PUT',
                    body: JSON.stringify({
                        valor: diasDeTrabalho,
                        horario_inicio: horarioInicio,
                        horario_fim: horarioFim,
                        janela_poll_inicio: janelaPollInicio,
                        janela_poll_fim: janelaPollFim,
                    }),
                }),
            ]);
            mostrarMensagem('Configurações salvas com sucesso!', 'sucesso');
        } catch (err) {
            mostrarMensagem(`Erro ao salvar: ${err.message}`, 'erro');
        } finally {
            setSalvando(false);
        }
    };

    if (carregando) return <UICarregando variante="bloco" />;

    return (
        <>
            {/* Ações da aba */}
            <div className="ca-aba-acoes">
                <button className="gs-btn gs-btn-secundario" onClick={onTestarSom}>
                    <i className="fas fa-volume-up"></i> Testar Som
                </button>
                <button className="gs-btn gs-btn-sucesso" onClick={handleSalvar} disabled={salvando}>
                    {salvando
                        ? <><div className="spinner-btn-interno"></div> Salvando...</>
                        : <><i className="fas fa-save"></i> Salvar Alterações</>
                    }
                </button>
            </div>

            <DiasTrabalhoCard
                diasConfig={diasDeTrabalho}
                onUpdate={setDiasDeTrabalho}
            />
            <HorariosCard
                horarioInicio={horarioInicio}
                horarioFim={horarioFim}
                onUpdateHorario={(campo, valor) =>
                    campo === 'horario_inicio' ? setHorarioInicio(valor) : setHorarioFim(valor)
                }
                janelaPollInicio={janelaPollInicio}
                janelaPollFim={janelaPollFim}
                onUpdateJanelaPoll={(campo, valor) =>
                    campo === 'janela_poll_inicio' ? setJanelaPollInicio(valor) : setJanelaPollFim(valor)
                }
            />

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
                            <AlertaCard key={config.id} config={config} onUpdate={handleUpdateConfig} />
                        ))}
                    </section>
                );
            })}

            {/* Alertas fora dos grupos definidos */}
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
