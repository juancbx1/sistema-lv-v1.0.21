// public/src/components/BotaoBuscaPipelineProducao.jsx

import React, { useState } from 'react';
import { mostrarConfirmacao, mostrarMensagem } from '/js/utils/popups.js';
import { calcularStatusDemanda, STATUS_META } from '/src/utils/demandaStatus.js';

export default function CardPipelineProducao({ item, onPlanejar, onDelete, permissoes, onRefresh, onRepetir }) {
    const [expandido, setExpandido] = useState(false);

    // --- DADOS DO PIPELINE ---
    const totalPedido    = item.demanda_total               || 0;
    const emProducao     = item.saldo_em_producao           || 0;
    const emArremate     = item.saldo_disponivel_arremate   || 0;
    const emEmbalagem    = item.saldo_disponivel_embalagem  || 0;
    const emEstoque      = item.saldo_disponivel_estoque    || 0;
    const emPerda        = item.saldo_perda                 || 0;

    const totalConsumido = emProducao + emArremate + emEmbalagem + emEstoque + emPerda;
    const pendenteFila   = Math.max(0, totalPedido - totalConsumido);

    const pct = (v) => totalPedido > 0 ? Math.min(100, (v / totalPedido) * 100) : 0;

    // --- STATUS E IDENTIDADE VISUAL ---
    const statusCalculado = calcularStatusDemanda(item);
    const meta            = STATUS_META[statusCalculado] || STATUS_META.AGUARDANDO;
    const eUrgente        = parseInt(item.prioridade) === 1;

    // --- NOME LIMPO (sem variante entre parênteses duplicada) ---
    const nomeVariante = (item.variante && item.variante !== '-') ? item.variante : '';
    const tituloLimpo = nomeVariante
        ? (item.produto_nome || '').replace(`(${nomeVariante})`, '').replace('()', '').trim()
        : (item.produto_nome || '');

    // --- DATA FORMATADA ---
    const dataFormatada = item.data_solicitacao
        ? new Date(item.data_solicitacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        : null;

    // --- HANDLERS ---
    const handleDeleteClick = async (e) => {
        e.stopPropagation();
        const confirmado = await mostrarConfirmacao(
            `Apagar demanda de "${tituloLimpo}"?`,
            { tipo: 'perigo', textoConfirmar: 'Apagar', textoCancelar: 'Cancelar' }
        );
        if (confirmado && onDelete) onDelete(item.demanda_id);
    };

    const handleActionClick = (e) => {
        e.stopPropagation();
        if (pendenteFila > 0) onPlanejar(item, pendenteFila);
    };

    const handleConcluirManual = async (e) => {
        e.stopPropagation();
        const ok = await mostrarConfirmacao(
            `Marcar demanda de "${tituloLimpo}" como concluída manualmente?`,
            { tipo: 'aviso', textoConfirmar: 'Sim, concluir', textoCancelar: 'Cancelar' }
        );
        if (!ok) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/demandas/${item.demanda_id}/concluir`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Falha ao concluir demanda.');
            mostrarMensagem('Demanda marcada como concluída!', 'sucesso');
            if (onRefresh) onRefresh();
        } catch(err) {
            mostrarMensagem(err.message, 'erro');
        }
    };

    return (
        <div
            className={`gs-demanda-card${expandido ? ' expandido' : ''}`}
            onClick={() => setExpandido(!expandido)}
        >
            {/* Borda-charme: vermelha pulsante se urgente, cor do status caso contrário */}
            <div
                className={`card-borda-charme${eUrgente ? ' gs-borda-urgente' : ''}`}
                style={!eUrgente ? { backgroundColor: meta.cor } : {}}
            ></div>

            {/* ===== TOPO: imagem + info + badge + delete ===== */}
            <div className="gs-demanda-card-topo">
                <img
                    src={item.imagem || '/img/placeholder-image.png'}
                    alt={tituloLimpo}
                    className="gs-demanda-card-img"
                />

                <div className="gs-demanda-card-info">
                    <span className="gs-demanda-card-nome">
                        {eUrgente && (
                            <span className="gs-demanda-urgente-pill">
                                <i className="fas fa-star"></i> Prioridade
                            </span>
                        )}
                        {tituloLimpo}
                    </span>
                    {nomeVariante && (
                        <span className="gs-demanda-card-variante">{nomeVariante}</span>
                    )}
                    {(dataFormatada || item.solicitado_por) && (
                        <span className="gs-demanda-card-origem">
                            {dataFormatada && <><i className="fas fa-calendar-alt"></i> {dataFormatada}</>}
                            {dataFormatada && item.solicitado_por && ' · '}
                            {item.solicitado_por && <>Criado por: <strong>{item.solicitado_por}</strong></>}
                        </span>
                    )}
                </div>

                <div className="gs-demanda-card-direita">
                    <span className="gs-demanda-status-badge" style={{ color: meta.cor, borderColor: meta.cor }}>
                        <i className={`fas ${meta.icone}`}></i>
                        {meta.label}
                    </span>
                    {permissoes.includes('deletar-demanda') && (
                        <button className="gs-demanda-del-btn" onClick={handleDeleteClick} title="Apagar demanda">
                            <i className="fas fa-trash"></i>
                        </button>
                    )}
                </div>
            </div>

            {/* ===== PIPELINE BAR ===== */}
            <div className="gs-demanda-pipeline-bar">
                <div className="segmento estoque"   style={{ width: `${pct(emEstoque)}%` }}></div>
                <div className="segmento embalagem" style={{ width: `${pct(emEmbalagem)}%` }}></div>
                <div className="segmento acabamento" style={{ width: `${pct(emArremate)}%` }}></div>
                <div className="segmento producao"  style={{ width: `${pct(emProducao)}%` }}></div>
                <div className="segmento perda"     style={{ width: `${pct(emPerda)}%`, backgroundColor: '#e74c3c' }}></div>
            </div>

            {/* ===== RODAPÉ: progresso numérico + CTA ===== */}
            <div className="gs-demanda-card-rodape" onClick={e => e.stopPropagation()}>
                <span className="gs-demanda-progresso">
                    Meta: <strong>{totalPedido}</strong> pçs
                </span>

                {pendenteFila > 0 && (
                    <button className="gs-btn-ir-cortes" onClick={handleActionClick}>
                        <i className="fas fa-cut"></i>
                        <span>Iniciar Corte</span>
                        <span className="gs-btn-ir-cortes-qtd">{pendenteFila} pçs</span>
                    </button>
                )}
            </div>

            {/* ===== ACCORDION: breakdown + observações ===== */}
            {expandido && (
                <div className="gs-demanda-accordion" onClick={e => e.stopPropagation()}>
                    {item.observacoes && (
                        <div className="gs-demanda-obs">
                            <i className="fas fa-comment-alt"></i>
                            <span>{item.observacoes}</span>
                        </div>
                    )}
                    <div className="gs-demanda-breakdown">
                        <div className="gs-demanda-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#ecf0f1', border: '1px solid #bdc3c7' }}></span>
                            <span>Fila</span>
                            <strong>{pendenteFila}</strong>
                        </div>
                        <div className="gs-demanda-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#3498db' }}></span>
                            <span>Costura</span>
                            <strong>{emProducao}</strong>
                        </div>
                        <div className="gs-demanda-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#9b59b6' }}></span>
                            <span>Arremate</span>
                            <strong>{emArremate}</strong>
                        </div>
                        <div className="gs-demanda-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#e67e22' }}></span>
                            <span>Embalagem</span>
                            <strong>{emEmbalagem}</strong>
                        </div>
                        <div className="gs-demanda-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#27ae60' }}></span>
                            <span>Estoque</span>
                            <strong>{emEstoque}</strong>
                        </div>
                        {emPerda > 0 && (
                            <div className="gs-demanda-breakdown-item">
                                <span className="dot" style={{ backgroundColor: '#e74c3c' }}></span>
                                <span>Perda</span>
                                <strong>{emPerda}</strong>
                            </div>
                        )}
                    </div>

                    {permissoes.includes('concluir-demanda-manual') && statusCalculado !== 'CONCLUIDO' && (
                        <button className="gs-btn-concluir-manual" onClick={handleConcluirManual}>
                            <i className="fas fa-check-double"></i>
                            Marcar como Concluída
                        </button>
                    )}

                    {statusCalculado === 'CONCLUIDO' && onRepetir && (
                        <button
                            className="gs-btn-repetir-demanda"
                            onClick={(e) => { e.stopPropagation(); onRepetir(item); }}
                        >
                            <i className="fas fa-redo"></i> Repetir Demanda
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
