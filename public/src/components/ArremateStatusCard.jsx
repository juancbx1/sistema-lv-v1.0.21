// public/src/components/ArremateStatusCard.jsx

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

// --- Utilities (ported from admin-arremates.js) ---

const STATUS_TEXTO = {
    PRODUZINDO: 'Produzindo',
    LIVRE: 'Livre',
    LIVRE_MANUAL: 'Livre',
    'ALMOÇO': 'Almoço',
    PAUSA: 'Pausa',
    FORA_DO_HORARIO: 'Fora do Horário',
    FALTOU: 'Faltou',
    PAUSA_MANUAL: 'Pausa Manual',
    ALOCADO_EXTERNO: 'Outro Setor',
};

function determinarStatusFinal(tiktik) {
    const formatarClasse = (status) => {
        if (!status) return '';
        const statusVisual = status === 'LIVRE_MANUAL' ? 'LIVRE' : status;
        const semAcentos = statusVisual.normalize('NFD').replace(/[̀-ͯ]/g, '');
        return `status-${semAcentos.toLowerCase().replace(/_/g, '-')}`;
    };

    let statusFinal;

    if (tiktik.status_atual === 'PRODUZINDO') {
        statusFinal = 'PRODUZINDO';
    } else if (['FALTOU', 'ALOCADO_EXTERNO', 'LIVRE_MANUAL'].includes(tiktik.status_atual)) {
        const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const dataModificacao = tiktik.status_data_modificacao?.substring(0, 10);
        if (hojeSP === dataModificacao) {
            statusFinal = tiktik.status_atual;
        }
    } else if (tiktik.status_atual === 'PAUSA_MANUAL') {
        statusFinal = 'PAUSA_MANUAL';
    } else {
        const horaAtual = new Date().toLocaleTimeString('en-GB', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
        });
        const { horario_entrada_1, horario_saida_1, horario_entrada_2, horario_saida_2, horario_entrada_3, horario_saida_3 } = tiktik;
        const saidaFinal = horario_saida_3 || horario_saida_2 || horario_saida_1 || '23:59';
        const entradaInicial = horario_entrada_1 || '00:00';

        if (horaAtual < entradaInicial || horaAtual > saidaFinal) {
            statusFinal = 'FORA_DO_HORARIO';
        } else if (horario_saida_1 && horario_entrada_2 && horaAtual > horario_saida_1 && horaAtual < horario_entrada_2) {
            statusFinal = 'ALMOÇO';
        } else if (horario_saida_2 && horario_entrada_3 && horaAtual > horario_saida_2 && horaAtual < horario_entrada_3) {
            statusFinal = 'PAUSA';
        } else {
            statusFinal = tiktik.status_atual || 'LIVRE';
        }
    }

    if (!statusFinal) statusFinal = 'LIVRE';

    const textoExibicao = statusFinal === 'LIVRE_MANUAL'
        ? STATUS_TEXTO['LIVRE']
        : (STATUS_TEXTO[statusFinal] || statusFinal);

    return { statusBruto: statusFinal, textoExibicao, classeStatus: formatarClasse(statusFinal) };
}

function verificarHorarioEstendido(tiktik) {
    const agoraStr = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    });
    const { horario_entrada_1, horario_saida_1, horario_entrada_2, horario_saida_2, horario_entrada_3, horario_saida_3 } = tiktik;
    const entradaInicial = horario_entrada_1 || '00:00';
    const saidaFinal = horario_saida_3 || horario_saida_2 || horario_saida_1 || '23:59';

    if (agoraStr < entradaInicial) return { texto: '🕒 Expediente Ainda Não Iniciado', nivel: 'info' };
    if (agoraStr > saidaFinal) return { texto: '🚫 Trabalhando Fora do Expediente', nivel: 'critico' };
    if (horario_saida_1 && horario_entrada_2 && agoraStr > horario_saida_1 && agoraStr < horario_entrada_2)
        return { texto: '⚠️ Pausa para Almoço em Atraso', nivel: 'atencao' };
    if (horario_saida_2 && horario_entrada_3 && agoraStr > horario_saida_2 && agoraStr < horario_entrada_3)
        return { texto: '⚠️ Pausa da Tarde em Atraso', nivel: 'atencao' };
    return null;
}

const calcularRitmo = (segundos, tpe, qtd) => {
    if (!tpe || !qtd || tpe <= 0) return null;
    const pct = (segundos / (tpe * qtd)) * 100;
    if (pct >= 120) return { texto: 'Lento',       emoji: '🐢', classe: 'ritmo-lento',   pct };
    if (pct >= 100) return { texto: 'Atenção',      emoji: '⚠️', classe: 'ritmo-atencao', pct };
    if (pct >= 60)  return { texto: 'No Ritmo',     emoji: '👍', classe: 'ritmo-normal',  pct };
    if (pct >= 30)  return { texto: 'Rápido',       emoji: '✅', classe: 'ritmo-rapido',  pct };
    return               { texto: 'Super Rápido', emoji: '🚀', classe: 'ritmo-super',   pct };
};

const formatarTempo = (totalSeg) => {
    const s = Math.max(0, Math.floor(totalSeg));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return [h, m, ss].map(n => String(n).padStart(2, '0')).join(':');
};

// --- Component ---

export default function ArremateStatusCard({ tiktik, permissoes = [], onFinalizar, onCancelar, onAcaoManualStatus }) {
    const [menuAberto, setMenuAberto] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
    const [tempoSeg, setTempoSeg] = useState(0);
    const menuBtnRef = useRef(null);

    const inicioTimestampRef = useRef(null);
    const baseSegRef = useRef(0);

    const { statusBruto, textoExibicao, classeStatus } = determinarStatusFinal(tiktik);

    // Cronômetro — usa data_inicio da API para cálculo preciso sem drift
    useEffect(() => {
        if (statusBruto !== 'PRODUZINDO' || !tiktik.data_inicio) {
            setTempoSeg(0);
            return;
        }

        const dataInicio = new Date(tiktik.data_inicio);
        inicioTimestampRef.current = dataInicio.getTime();

        const calcular = () => {
            const elapsed = (Date.now() - inicioTimestampRef.current) / 1000;
            setTempoSeg(Math.max(0, elapsed));
        };

        calcular();
        const id = setInterval(calcular, 1000);
        return () => clearInterval(id);
    }, [statusBruto, tiktik.data_inicio]);

    // Fechar menu ao clicar fora
    useEffect(() => {
        if (!menuAberto) return;
        const handler = (e) => {
            if (!e.target.closest('.arremate-card-menu-container')) setMenuAberto(false);
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [menuAberto]);

    const podeFinalizar = permissoes.includes('lancar-arremate');
    const podeCancelar = permissoes.includes('cancelar-tarefa-arremate');
    const podeAtribuir = permissoes.includes('lancar-arremate');

    const avisoHorario = statusBruto === 'PRODUZINDO' ? verificarHorarioEstendido(tiktik) : null;
    const ritmo = (statusBruto === 'PRODUZINDO' && !tiktik.is_lote && tiktik.tpe_tarefa && tiktik.quantidade_entregue)
        ? calcularRitmo(tempoSeg, tiktik.tpe_tarefa, tiktik.quantidade_entregue)
        : null;
    const progressoVisual = ritmo ? Math.min(100, ritmo.pct) : 0;

    // Menu items baseados no status atual (mesmo padrão do admin-arremates.js)
    const menuItens = [];
    if (['PRODUZINDO', 'LIVRE', 'LIVRE_MANUAL'].includes(statusBruto)) {
        menuItens.push({ acao: 'PAUSA_MANUAL', label: 'Iniciar Pausa Manual', icone: 'fa-coffee' });
        menuItens.push({ acao: 'FALTOU',       label: 'Marcar Falta',          icone: 'fa-user-slash' });
        menuItens.push({ acao: 'ALOCADO_EXTERNO', label: 'Alocar em Outro Setor', icone: 'fa-shipping-fast' });
    } else if (statusBruto === 'PAUSA_MANUAL') {
        menuItens.push({ acao: 'LIVRE', label: 'Finalizar Pausa',   icone: 'fa-play' });
    } else if (statusBruto === 'FALTOU') {
        menuItens.push({ acao: 'LIVRE', label: 'Remover Falta',     icone: 'fa-user-check' });
    } else if (statusBruto === 'ALOCADO_EXTERNO') {
        menuItens.push({ acao: 'LIVRE', label: 'Retornar ao Setor', icone: 'fa-undo' });
    } else if (['ALMOÇO', 'PAUSA', 'FORA_DO_HORARIO'].includes(statusBruto)) {
        menuItens.push({ acao: 'LIVRE', label: 'Interromper e Liberar', icone: 'fa-play' });
    }

    const renderCorpo = () => {
        if (statusBruto === 'PRODUZINDO') {
            return (
                <>
                    {avisoHorario && (
                        <div className={`arremate-aviso-horario nivel-${avisoHorario.nivel}`}>
                            {avisoHorario.texto}
                        </div>
                    )}

                    <div className="arremate-tarefa-info">
                        {tiktik.is_lote ? (
                            <div className="arremate-tarefa-lote">
                                <i className="fas fa-boxes"></i>
                                <span>Lote · <strong>{tiktik.quantidade_entregue}</strong> pçs</span>
                            </div>
                        ) : (
                            <>
                                <div className="arremate-tarefa-nome">{tiktik.produto_nome}</div>
                                {tiktik.variante && <div className="arremate-tarefa-variante">{tiktik.variante}</div>}
                                <div className="arremate-tarefa-qtd">
                                    <span className="arremate-qtd-valor">{tiktik.quantidade_entregue}</span>
                                    <span className="arremate-qtd-label">pçs</span>
                                </div>
                            </>
                        )}

                        <div className="arremate-crono">
                            <i className="fas fa-clock"></i>
                            <span className="arremate-crono-tempo">{formatarTempo(tempoSeg)}</span>
                            {ritmo && (
                                <span className={`arremate-ritmo ${ritmo.classe}`}>
                                    {ritmo.emoji} {ritmo.texto}
                                </span>
                            )}
                        </div>

                        {ritmo && (
                            <div className="arremate-barra-container">
                                <div
                                    className={`arremate-barra ${ritmo.classe}`}
                                    style={{ width: `${progressoVisual}%` }}
                                />
                            </div>
                        )}
                    </div>

                    <div className="arremate-card-footer">
                        <button
                            className="arremate-btn cancelar"
                            onClick={() => onCancelar?.(tiktik)}
                            disabled={!podeCancelar}
                            title={!podeCancelar ? 'Permissão negada' : 'Cancelar tarefa'}
                        >
                            <i className="fas fa-times"></i> Cancelar
                        </button>
                        <button
                            className="arremate-btn finalizar"
                            onClick={() => onFinalizar?.(tiktik)}
                            disabled={!podeFinalizar}
                        >
                            <i className="fas fa-check-double"></i> Finalizar
                        </button>
                    </div>
                </>
            );
        }

        if (statusBruto === 'LIVRE' || statusBruto === 'LIVRE_MANUAL') {
            return (
                <>
                    <div className="arremate-status-badge livre">
                        <i className="fas fa-check-circle"></i> Livre
                    </div>
                    <div className="arremate-card-footer">
                        <button
                            className="arremate-btn atribuir atribuir-unico"
                            onClick={() => window.abrirModalAtribuicao?.(tiktik)}
                            disabled={!podeAtribuir}
                            title={!podeAtribuir ? 'Permissão negada' : 'Atribuir tarefa'}
                        >
                            <i className="fas fa-play"></i> Atribuir Tarefa
                        </button>
                    </div>
                </>
            );
        }

        // Inativos (almoço, pausa, faltou, etc.)
        return (
            <div className="arremate-status-badge inativo">
                {textoExibicao}
            </div>
        );
    };

    return (
        <div className={`arremate-status-card ${classeStatus}`}>
            <div className="card-borda-charme" />

            <div className="arremate-card-topo">
                <div
                    className={`arremate-avatar${!tiktik.avatar_url ? ' arremate-avatar-vazio' : ''}`}
                    style={tiktik.avatar_url ? { backgroundImage: `url('${tiktik.avatar_url}')` } : {}}
                    title={tiktik.nome}
                >
                    {!tiktik.avatar_url && <i className="fas fa-user" />}
                </div>

                <div className="arremate-identidade">
                    <div className="arremate-nome" title={tiktik.nome}>{tiktik.nome}</div>
                    <div className="arremate-cracha">
                        <i className="fas fa-cut" /> TikTik
                    </div>
                </div>

                {menuItens.length > 0 && (
                    <div className="arremate-card-menu-container">
                        <button
                            ref={menuBtnRef}
                            className="arremate-menu-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                const rect = menuBtnRef.current?.getBoundingClientRect();
                                if (rect) {
                                    setMenuPos({
                                        top: rect.bottom + 4,
                                        right: window.innerWidth - rect.right,
                                    });
                                }
                                setMenuAberto(v => !v);
                            }}
                            title="Opções"
                        >
                            <i className="fas fa-ellipsis-v" />
                        </button>
                        {menuAberto && ReactDOM.createPortal(
                            <>
                                <div
                                    className="arremate-menu-overlay"
                                    onClick={() => setMenuAberto(false)}
                                />
                                <div
                                    className="arremate-menu-dropdown"
                                    style={{ top: menuPos.top, right: menuPos.right }}
                                >
                                    {menuItens.map(item => (
                                        <button
                                            key={item.acao}
                                            className="arremate-menu-item"
                                            onClick={() => {
                                                onAcaoManualStatus?.(tiktik, item.acao);
                                                setMenuAberto(false);
                                            }}
                                        >
                                            <i className={`fas ${item.icone}`} />
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </>,
                            document.body
                        )}
                    </div>
                )}
            </div>

            {renderCorpo()}
        </div>
    );
}
