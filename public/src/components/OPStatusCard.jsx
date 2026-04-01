// public/src/components/OPStatusCard.jsx

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

const getRoleInfo = (tipos = []) => {
    if (tipos.includes('tiktik'))   return { label: 'TikTik',    icon: 'fa-cut',         classe: 'cracha-tiktik' };
    if (tipos.includes('cortador')) return { label: 'Cortador',  icon: 'fa-layer-group', classe: 'cracha-cortador' };
    return                                 { label: 'Costureira', icon: 'fa-tshirt',      classe: 'cracha-costureira' };
};

const getStatusIdle = (status) => {
    const map = {
        LIVRE:            { icone: 'fa-check-circle',  texto: 'Disponível',      cor: '#22c55e' },
        PAUSA:            { icone: 'fa-coffee',        texto: 'Em Pausa',        cor: '#f59e0b' },
        PAUSA_MANUAL:     { icone: 'fa-coffee',        texto: 'Em Pausa',        cor: '#f59e0b' },
        ALMOCO:           { icone: 'fa-utensils',      texto: 'Almoço',          cor: '#f97316' },
        FORA_DO_HORARIO:  { icone: 'fa-moon',          texto: 'Fora do Horário', cor: '#6366f1' },
        FALTOU:           { icone: 'fa-user-times',    texto: 'Faltou',          cor: '#ef4444' },
        ALOCADO_EXTERNO:  { icone: 'fa-shipping-fast', texto: 'Outro Setor',     cor: '#8b5cf6' },
    };
    return map[status] || { icone: 'fa-question-circle', texto: status || 'Indefinido', cor: '#aaa' };
};

const formatarTempo = (ms) => {
    const total = Math.max(0, ms);
    const h = Math.floor(total / 3600000);
    const m = Math.floor((total % 3600000) / 60000);
    const s = Math.floor((total % 60000) / 1000);
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
};

const calcularRitmo = (ms, tpp, quantidade) => {
    if (!tpp || !quantidade || tpp <= 0) return null;
    const estimadoMs = tpp * quantidade * 1000;
    const pct = (ms / estimadoMs) * 100;
    if (pct >= 120) return { texto: 'Lento',       emoji: '🐢', classe: 'ritmo-lento',      pct };
    if (pct >= 100) return { texto: 'Atenção',      emoji: '⚠️', classe: 'ritmo-atencao',    pct };
    if (pct >= 60)  return { texto: 'No Ritmo',     emoji: '👍', classe: 'ritmo-normal',     pct };
    if (pct >= 30)  return { texto: 'Rápido',       emoji: '✅', classe: 'ritmo-rapido',     pct };
    return                  { texto: 'Super Rápido', emoji: '🚀', classe: 'ritmo-super',      pct };
};

export default function OPStatusCard({ funcionario, tpp, onAtribuirTarefa, onAcaoManual, onFinalizarTarefa, onCancelarTarefa }) {
    const [menuAberto, setMenuAberto] = useState(false);
    const [tempoMs, setTempoMs] = useState(0);

    if (!funcionario) return null;

    const { status_atual, nome, avatar_url, foto_oficial, nivel, tipos = [], tarefas } = funcionario;
    const todasTarefas = tarefas || (funcionario.tarefa_atual ? [funcionario.tarefa_atual] : []);
    const tarefaPrincipal = todasTarefas[0] || null;
    const filaEspera = todasTarefas.slice(1);

    const role = getRoleInfo(tipos);
    const fotoExibida = avatar_url || foto_oficial || null;

    // --- CRONÔMETRO INTERNO ---
    useEffect(() => {
        if (status_atual !== 'PRODUZINDO' || !tarefaPrincipal?.data_inicio) {
            setTempoMs(0);
            return;
        }
        const inicio = new Date(tarefaPrincipal.data_inicio).getTime();
        const atualizar = () => setTempoMs(Math.max(0, Date.now() - inicio));
        atualizar();
        const id = setInterval(atualizar, 1000);
        return () => clearInterval(id);
    }, [status_atual, tarefaPrincipal?.data_inicio]);

    const ritmo = status_atual === 'PRODUZINDO' ? calcularRitmo(tempoMs, tpp, tarefaPrincipal?.quantidade) : null;

    // --- MENU DE AÇÕES ---
    const getMenuItems = () => {
        switch (status_atual) {
            case 'LIVRE':
            case 'LIVRE_MANUAL':
            case 'PRODUZINDO':
                return [
                    { acao: 'PAUSA_MANUAL',     label: 'Iniciar Pausa',         icon: 'fa-coffee' },
                    { acao: 'FALTOU',            label: 'Marcar Falta',          icon: 'fa-user-slash' },
                    { acao: 'ALOCADO_EXTERNO',   label: 'Alocar em Outro Setor', icon: 'fa-shipping-fast' },
                ];
            default:
                return [{ acao: 'LIVRE_MANUAL', label: 'Liberar para Trabalho', icon: 'fa-play' }];
        }
    };
    const menuItems = getMenuItems();

    // --- CORPO DO CARD ---
    const renderBody = () => {
        if (status_atual === 'PRODUZINDO' && tarefaPrincipal) {
            const progressoVisual = ritmo ? Math.min(100, ritmo.pct) : 0;
            return (
                <>
                    <div className="cracha-tarefa">
                        <div className="cracha-tarefa-processo">{tarefaPrincipal.processo}</div>
                        <div className="cracha-tarefa-produto">
                            {tarefaPrincipal.produto_nome}
                            {tarefaPrincipal.variante && <span className="cracha-tarefa-variante"> · {tarefaPrincipal.variante}</span>}
                        </div>
                        <div className="cracha-tarefa-qtd">{tarefaPrincipal.quantidade} <small>pçs</small></div>

                        <div className="cracha-metricas">
                            <span className="cracha-cronometro"><i className="fas fa-clock"></i> {formatarTempo(tempoMs)}</span>
                            {ritmo && <span className={`cracha-ritmo ${ritmo.classe}`}>{ritmo.emoji} {ritmo.texto}</span>}
                        </div>

                        <div className="cracha-barra-container">
                            <div className={`cracha-barra ${ritmo?.classe || ''}`} style={{ width: `${progressoVisual}%` }}></div>
                        </div>

                        {filaEspera.length > 0 && (
                            <div className="cracha-fila">
                                <span className="cracha-fila-titulo"><i className="fas fa-layer-group"></i> Fila ({filaEspera.length})</span>
                                <ul>
                                    {filaEspera.map((t, i) => (
                                        <li key={t.id_sessao || i}>
                                            <span className="fila-qtd">{t.quantidade}</span>
                                            <span className="fila-nome">{t.produto_nome}</span>
                                            {t.variante && <span className="fila-var">{t.variante}</span>}
                                            <span className="fila-proc">{t.processo}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="cracha-footer">
                        <button className="cracha-btn cancelar" onClick={() => onCancelarTarefa(funcionario)}>
                            <i className="fas fa-times"></i> Cancelar
                        </button>
                        <button className="cracha-btn finalizar" onClick={() => onFinalizarTarefa(funcionario)}>
                            <i className="fas fa-check-double"></i> Finalizar
                        </button>
                    </div>
                </>
            );
        }

        const idle = getStatusIdle(status_atual);
        return (
            <>
                <div className="cracha-status-idle">
                    <i className={`fas ${idle.icone}`} style={{ color: idle.cor }}></i>
                    <span className="cracha-status-idle-texto">{idle.texto}</span>
                </div>

                <div className="cracha-footer">
                    {status_atual === 'LIVRE' && (
                        <button className="cracha-btn finalizar full-width" onClick={() => onAtribuirTarefa(funcionario)}>
                            <i className="fas fa-play"></i> Atribuir Tarefa
                        </button>
                    )}
                </div>
            </>
        );
    };

    return (
        <div className={`cracha-card ${role.classe}${status_atual === 'PRODUZINDO' ? ' cracha-em-producao' : ''}`}>

            {/* BANDA SUPERIOR — elemento visual de identidade */}
            <div className="cracha-banda">
                <div className="cracha-role-label">
                    <i className={`fas ${role.icon}`}></i>
                    <span>{role.label}</span>
                </div>
                <div className="cracha-banda-acoes">
                    {menuItems.length > 0 && (
                        <button className="cracha-menu-btn" onClick={() => setMenuAberto(true)} title="Opções">
                            <i className="fas fa-ellipsis-v"></i>
                        </button>
                    )}
                </div>
            </div>

            {/* BOTTOM SHEET — renderizado via Portal no body para não ser afetado pelo transform do card */}
            {menuAberto && ReactDOM.createPortal(
                <>
                    <div className="bs-overlay" onClick={() => setMenuAberto(false)} />
                    <div className="bs-sheet" onClick={e => e.stopPropagation()}>
                        <div className="bs-handle" />
                        <div className="bs-header">
                            <div
                                className={`bs-avatar${!fotoExibida ? ' bs-avatar-vazio' : ''}`}
                                style={fotoExibida ? { backgroundImage: `url('${fotoExibida}')` } : {}}
                            >
                                {!fotoExibida && <i className="fas fa-user"></i>}
                            </div>
                            <div>
                                <div className="bs-nome">{nome}</div>
                                <div className="bs-role">{role.label}</div>
                            </div>
                        </div>
                        <div className="bs-acoes">
                            {menuItems.map(item => (
                                <button
                                    key={item.acao}
                                    className="bs-item"
                                    onClick={() => { onAcaoManual(funcionario, item.acao); setMenuAberto(false); }}
                                >
                                    <div className="bs-item-icone">
                                        <i className={`fas ${item.icon}`}></i>
                                    </div>
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                        <button className="bs-cancelar" onClick={() => setMenuAberto(false)}>
                            Cancelar
                        </button>
                    </div>
                </>,
                document.body
            )}

            {/* IDENTIDADE */}
            <div className="cracha-identidade">
                <div
                    className={`cracha-avatar${!fotoExibida ? ' cracha-avatar-vazio' : ''}`}
                    style={fotoExibida ? { backgroundImage: `url('${fotoExibida}')` } : {}}
                >
                    {!fotoExibida && <i className="fas fa-user"></i>}
                </div>
                <div className="cracha-nome">{nome}</div>
                {nivel && <div className="cracha-nivel">Nível {nivel}</div>}
            </div>

            <div className="cracha-divider" />

            {/* CORPO + RODAPÉ */}
            {renderBody()}
        </div>
    );
}
