// public/src/components/OPStatusCard.jsx

import React, { useState, useEffect, useMemo } from 'react';
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

// Formata 'HH:MM:SS' ou 'HH:MM' para exibição (ex: '13:10')
const formatarHora = (t) => t ? String(t).substring(0, 5) : '--:--';

export default function OPStatusCard({ funcionario, tpp, onAtribuirTarefa, onAcaoManual, onFinalizarTarefa, onCancelarTarefa, onExcecao, onLiberarIntervalo }) {
    const [menuAberto, setMenuAberto] = useState(false);
    const [infoAberto, setInfoAberto] = useState(false);
    const [tempoMs, setTempoMs] = useState(0);

    if (!funcionario) return null;

    const {
        status_atual, nome, avatar_url, foto_oficial, nivel, tipos = [], tarefas,
        horario_entrada_1, horario_saida_1, horario_entrada_2, horario_saida_2,
        horario_entrada_3, horario_saida_3, dias_trabalho,
        ponto_hoje,
    } = funcionario;
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

    // --- INDICADOR DE TOLERÂNCIA S3 (trabalhando além do horário final) ---
    const toleranciaS3 = useMemo(() => {
        if (status_atual !== 'PRODUZINDO') return null;
        const s3 = horario_saida_3 || horario_saida_2 || horario_saida_1;
        if (!s3) return null;
        const agora = new Date();
        const horaAtual = agora.toLocaleTimeString('en-GB', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
        });
        const [s3h, s3m] = String(s3).substring(0, 5).split(':').map(Number);
        const [ah, am] = horaAtual.split(':').map(Number);
        const minutos = (ah * 60 + am) - (s3h * 60 + s3m);
        return minutos > 0 ? minutos : null;
    }, [status_atual, horario_saida_1, horario_saida_2, horario_saida_3]);

    // --- BOTÃO "LIBERAR PARA INTERVALO" (aparece 25min antes do horário de almoço ou pausa) ---
    const intervaloProximo = useMemo(() => {
        if (status_atual !== 'LIVRE') return null;
        const agora = new Date();
        const horaAtual = agora.toLocaleTimeString('en-GB', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
        });
        const [ah, am] = horaAtual.split(':').map(Number);
        const agoraMin = ah * 60 + am;
        const n = (t) => t ? String(t).substring(0, 5) : null;

        // Só mostra o botão se o intervalo do dia ainda não foi registrado
        const s1 = n(horario_saida_1);
        if (s1 && !ponto_hoje?.horario_real_s1) {
            const [s1h, s1m] = s1.split(':').map(Number);
            const s1Min = s1h * 60 + s1m;
            if (agoraMin >= s1Min - 25 && agoraMin < s1Min) {
                return { tipo: 'ALMOCO', label: 'Liberar para almoço', icone: 'fa-utensils' };
            }
        }
        const s2 = n(horario_saida_2);
        if (s2 && !ponto_hoje?.horario_real_s2) {
            const [s2h, s2m] = s2.split(':').map(Number);
            const s2Min = s2h * 60 + s2m;
            if (agoraMin >= s2Min - 25 && agoraMin < s2Min) {
                return { tipo: 'PAUSA', label: 'Liberar para pausa', icone: 'fa-coffee' };
            }
        }
        return null;
    }, [status_atual, horario_saida_1, horario_saida_2]);

    // --- MENU DE AÇÕES ---
    const getMenuItems = () => {
        switch (status_atual) {
            case 'LIVRE':
            case 'LIVRE_MANUAL':
            case 'PRODUZINDO':
                return [
                    { acao: 'FALTOU',             label: 'Marcar Falta',          icon: 'fa-user-slash' },
                    { acao: 'ALOCADO_EXTERNO',    label: 'Alocar em Outro Setor', icon: 'fa-shipping-fast' },
                    { acao: 'SAIDA_ANTECIPADA',   label: 'Saída Antecipada',      icon: 'fa-sign-out-alt' },
                ];
            default: {
                const items = [{ acao: 'LIVRE_MANUAL', label: 'Liberar para Trabalho', icon: 'fa-play' }];
                if (status_atual === 'FORA_DO_HORARIO') {
                    items.push({ acao: 'ATRASO', label: 'Chegada Atrasada', icon: 'fa-sign-in-alt' });
                }
                return items;
            }
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

                        {/* Indicador de tolerância S3 — trabalhando além do horário final */}
                        {toleranciaS3 !== null && (
                            <div className={`op-status-tolerancia ${toleranciaS3 > 20 ? 'critico' : 'aviso'}`}>
                                {toleranciaS3 > 20 ? (
                                    <>
                                        <div className="op-tolerancia-linha1">🚨 Passou {toleranciaS3}min do horário de saída</div>
                                        <div className="op-tolerancia-linha2">Saída prevista às {formatarHora(horario_saida_3 || horario_saida_2 || horario_saida_1)} — falar com ela</div>
                                    </>
                                ) : (
                                    <span>⏰ +{toleranciaS3}min após o horário de saída ({formatarHora(horario_saida_3 || horario_saida_2 || horario_saida_1)})</span>
                                )}
                            </div>
                        )}

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
        // Horário de retorno: usa ponto_hoje (real) ou horário cadastrado (fallback)
        const retornoAlmoco = ponto_hoje?.horario_real_e2
            ? formatarHora(ponto_hoje.horario_real_e2)
            : formatarHora(horario_entrada_2);
        const retornoPausa = ponto_hoje?.horario_real_e3
            ? formatarHora(ponto_hoje.horario_real_e3)
            : formatarHora(horario_entrada_3);

        return (
            <>
                <div className="cracha-status-idle">
                    <i className={`fas ${idle.icone}`} style={{ color: idle.cor }}></i>
                    <span className="cracha-status-idle-texto">{idle.texto}</span>
                </div>

                {/* Horário dinâmico de retorno para ALMOCO/PAUSA */}
                {status_atual === 'ALMOCO' && retornoAlmoco !== '--:--' && (
                    <div className="op-status-card-intervalo">
                        <i className="fas fa-utensils"></i>
                        <span>Retorno previsto às <strong>{retornoAlmoco}</strong></span>
                    </div>
                )}
                {status_atual === 'PAUSA' && retornoPausa !== '--:--' && (
                    <div className="op-status-card-intervalo">
                        <i className="fas fa-coffee"></i>
                        <span>Retorno previsto às <strong>{retornoPausa}</strong></span>
                    </div>
                )}

                <div className="cracha-footer">
                    {status_atual === 'LIVRE' && (
                        <button className="cracha-btn finalizar full-width" onClick={() => onAtribuirTarefa(funcionario)}>
                            <i className="fas fa-play"></i> Atribuir Tarefa
                        </button>
                    )}
                </div>

                {/* Botão de liberação antecipada — separado do footer para não comprimir o botão principal */}
                {intervaloProximo && onLiberarIntervalo && (
                    <button
                        className="op-btn-liberar-intervalo"
                        onClick={() => onLiberarIntervalo(funcionario.id, intervaloProximo.tipo)}
                        title={`${intervaloProximo.label} agora (retorno calculado automaticamente)`}
                    >
                        <i className={`fas ${intervaloProximo.icone}`}></i>
                        {intervaloProximo.label}
                    </button>
                )}
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
                    <button className="cracha-menu-btn" onClick={() => setInfoAberto(true)} title="Ver horários">
                        <i className="fas fa-info-circle"></i>
                    </button>
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

            {/* BOTTOM SHEET DE HORÁRIOS */}
            {infoAberto && ReactDOM.createPortal(
                <>
                    <div className="bs-overlay" onClick={() => setInfoAberto(false)} />
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
                                <div className="bs-role">Jornada de Trabalho</div>
                            </div>
                        </div>

                        {/* Dias de trabalho */}
                        <div className="bs-info-secao">
                            <div className="bs-info-label">Dias de trabalho</div>
                            <div className="bs-dias-chips">
                                {[['0','Dom'],['1','Seg'],['2','Ter'],['3','Qua'],['4','Qui'],['5','Sex'],['6','Sáb']].map(([d, l]) => {
                                    const ativo = (dias_trabalho || {'1':true,'2':true,'3':true,'4':true,'5':true})[d];
                                    return (
                                        <span key={d} className={`bs-dia-chip ${ativo ? 'ativo' : ''}`}>{l}</span>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Horários */}
                        <div className="bs-info-secao">
                            <div className="bs-info-label">Horários</div>
                            <div className="bs-horarios-lista">
                                <div className="bs-horario-linha">
                                    <span className="bs-horario-icone"><i className="fas fa-sign-in-alt"></i></span>
                                    <span className="bs-horario-desc">Entrada <span className="bs-horario-ref">(E1)</span></span>
                                    <span className="bs-horario-valor">{formatarHora(horario_entrada_1)}</span>
                                </div>
                                {horario_saida_1 && (
                                    <div className="bs-horario-linha bs-horario-intervalo">
                                        <span className="bs-horario-icone"><i className="fas fa-utensils"></i></span>
                                        <span className="bs-horario-desc">Almoço <span className="bs-horario-ref">(S1 → E2)</span></span>
                                        <span className="bs-horario-valor">{formatarHora(horario_saida_1)} → {formatarHora(horario_entrada_2)}</span>
                                    </div>
                                )}
                                {horario_saida_2 && (
                                    <div className="bs-horario-linha bs-horario-intervalo">
                                        <span className="bs-horario-icone"><i className="fas fa-coffee"></i></span>
                                        <span className="bs-horario-desc">Pausa <span className="bs-horario-ref">(S2 → E3)</span></span>
                                        <span className="bs-horario-valor">{formatarHora(horario_saida_2)} → {formatarHora(horario_entrada_3)}</span>
                                    </div>
                                )}
                                <div className="bs-horario-linha">
                                    <span className="bs-horario-icone"><i className="fas fa-sign-out-alt"></i></span>
                                    <span className="bs-horario-desc">Saída <span className="bs-horario-ref">(S3)</span></span>
                                    <span className="bs-horario-valor">{formatarHora(horario_saida_3 || horario_saida_2 || horario_saida_1)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Registros de hoje */}
                        {ponto_hoje && (ponto_hoje.horario_real_s1 || ponto_hoje.horario_real_s2 || ponto_hoje.horario_real_s3) && (
                            <div className="bs-info-secao">
                                <div className="bs-info-label">Registros de hoje</div>
                                <div className="bs-registros-hoje">
                                    {ponto_hoje.horario_real_s1 && (
                                        <div className="bs-registro-linha">
                                            <span className="bs-registro-icone"><i className="fas fa-utensils"></i></span>
                                            <span className="bs-registro-desc">Saída almoço</span>
                                            <span className="bs-registro-valor registrado">{String(ponto_hoje.horario_real_s1).substring(0,5)}</span>
                                        </div>
                                    )}
                                    {ponto_hoje.horario_real_e2 && (
                                        <div className="bs-registro-linha">
                                            <span className="bs-registro-icone"><i className="fas fa-utensils"></i></span>
                                            <span className="bs-registro-desc">Retorno almoço</span>
                                            <span className="bs-registro-valor registrado">{String(ponto_hoje.horario_real_e2).substring(0,5)}</span>
                                        </div>
                                    )}
                                    {ponto_hoje.horario_real_s2 && (
                                        <div className="bs-registro-linha">
                                            <span className="bs-registro-icone"><i className="fas fa-coffee"></i></span>
                                            <span className="bs-registro-desc">Saída pausa</span>
                                            <span className="bs-registro-valor registrado">{String(ponto_hoje.horario_real_s2).substring(0,5)}</span>
                                        </div>
                                    )}
                                    {ponto_hoje.horario_real_e3 && (
                                        <div className="bs-registro-linha">
                                            <span className="bs-registro-icone"><i className="fas fa-coffee"></i></span>
                                            <span className="bs-registro-desc">Retorno pausa</span>
                                            <span className="bs-registro-valor registrado">{String(ponto_hoje.horario_real_e3).substring(0,5)}</span>
                                        </div>
                                    )}
                                    {ponto_hoje.horario_real_s3 && (
                                        <div className={`bs-registro-linha${ponto_hoje.saida_desfeita ? ' desfeito' : ''}`}>
                                            <span className="bs-registro-icone"><i className="fas fa-sign-out-alt"></i></span>
                                            <span className="bs-registro-desc">
                                                Saída antecipada
                                                {ponto_hoje.saida_desfeita && (
                                                    <em className="bs-registro-desfeito"> — desfeita por {ponto_hoje.saida_desfeita_por || 'supervisor'}</em>
                                                )}
                                            </span>
                                            <span className="bs-registro-valor registrado">{String(ponto_hoje.horario_real_s3).substring(0,5)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <button className="bs-cancelar" onClick={() => setInfoAberto(false)}>
                            Fechar
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
