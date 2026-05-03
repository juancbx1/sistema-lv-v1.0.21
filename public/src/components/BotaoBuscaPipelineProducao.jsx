// public/src/components/BotaoBuscaPipelineProducao.jsx

import React, { useState } from 'react';
import { mostrarConfirmacao, mostrarMensagem } from '/js/utils/popups.js';
import { calcularStatusDemanda, STATUS_META } from '/src/utils/demandaStatus.js';

export default function PainelDemandaCard({ item, onDelete, permissoes, onRefresh, onIniciarProducao }) {
    const [expandido, setExpandido] = useState(false);

    const totalPedido  = item.demanda_total              || 0;
    const emProducao   = item.saldo_em_producao          || 0;
    const emArremate   = item.saldo_disponivel_arremate  || 0;
    const emEmbalagem  = item.saldo_disponivel_embalagem || 0;
    const emEstoque    = item.saldo_disponivel_estoque   || 0;
    const emPerda      = item.saldo_perda                || 0;

    const totalConsumido = emProducao + emArremate + emEmbalagem + emEstoque + emPerda;
    const pendenteFila   = Math.max(0, totalPedido - totalConsumido);

    const pct = (v) => totalPedido > 0 ? Math.min(100, (v / totalPedido) * 100) : 0;

    const statusCalculado = calcularStatusDemanda(item);
    const meta            = STATUS_META[statusCalculado] || STATUS_META.AGUARDANDO;
    const eUrgente        = parseInt(item.prioridade) === 1;

    const nomeVariante = (item.variante && item.variante !== '-') ? item.variante : '';
    const tituloLimpo  = nomeVariante
        ? (item.produto_nome || '').replace(`(${nomeVariante})`, '').replace('()', '').trim()
        : (item.produto_nome || '');

    const dataFormatada = item.data_solicitacao
        ? new Date(item.data_solicitacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        : null;

    const handleDeleteClick = async (e) => {
        e.stopPropagation();
        const ok = await mostrarConfirmacao(
            `Apagar demanda de "${tituloLimpo}"?`,
            { tipo: 'perigo', textoConfirmar: 'Apagar', textoCancelar: 'Cancelar' }
        );
        if (ok && onDelete) onDelete(item.demanda_id);
    };

    const handleCriarOP = (e) => {
        e.stopPropagation();
        if (onIniciarProducao) {
            onIniciarProducao({
                produto_id: item.produto_id,
                variante: item.variante === '-' ? null : item.variante,
                quantidade: pendenteFila,
                demanda_id: item.demanda_id,
            });
        } else {
            const params = new URLSearchParams({
                demanda_id: item.demanda_id,
                produto_id: item.produto_id,
                quantidade: pendenteFila,
                auto_abrir: 'true',
            });
            if (item.variante && item.variante !== '-') params.set('variante', item.variante);
            window.location.href = `/admin/ordens-de-producao.html?${params.toString()}`;
        }
    };

    const handleIrArremate = (e) => {
        e.stopPropagation();
        const params = new URLSearchParams({ produto_id: item.produto_id });
        if (item.variante && item.variante !== '-') params.set('variante', item.variante);
        window.location.href = `/admin/arremates.html?${params.toString()}`;
    };

    const handleIrEmbalagem = (e) => {
        e.stopPropagation();
        const params = new URLSearchParams({ produto_id: item.produto_id });
        if (item.variante && item.variante !== '-') params.set('variante', item.variante);
        window.location.href = `/admin/embalagem-de-produtos.html?${params.toString()}`;
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
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Falha ao concluir demanda.');
            mostrarMensagem('Demanda marcada como concluída!', 'sucesso');
            if (onRefresh) onRefresh();
        } catch (err) {
            mostrarMensagem(err.message, 'erro');
        }
    };

    const renderCTA = () => {
        if (statusCalculado === 'AGUARDANDO' && pendenteFila > 0) {
            return (
                <button className="pd-cta criar-op" onClick={handleCriarOP}>
                    <i className="fas fa-cut"></i>
                    Criar OP
                </button>
            );
        }
        if (statusCalculado === 'ARREMATE') {
            return (
                <button className="pd-cta arremate" onClick={handleIrArremate}>
                    <i className="fas fa-clipboard-check"></i>
                    Arremate
                </button>
            );
        }
        if (statusCalculado === 'EMBALAGEM') {
            return (
                <button className="pd-cta embalagem" onClick={handleIrEmbalagem}>
                    <i className="fas fa-box-open"></i>
                    Embalar
                </button>
            );
        }
        if (statusCalculado === 'COSTURA') {
            return (
                <span className="pd-status-badge costura">
                    <i className="fas fa-cut"></i>
                    Em costura
                </span>
            );
        }
        return null;
    };

    return (
        <div
            className={`pd-card${eUrgente ? ' urgente' : ''}`}
            onClick={() => setExpandido(!expandido)}
        >
            <div
                className="card-borda-charme"
                style={!eUrgente ? { backgroundColor: meta.cor } : {}}
            />

            {permissoes.includes('deletar-demanda') && (
                <button className="pd-card-del" onClick={handleDeleteClick}>
                    <i className="fas fa-trash"></i>
                </button>
            )}

            <div className="pd-card-topo">
                <img
                    src={item.imagem || '/img/placeholder-image.png'}
                    className="pd-card-img"
                    alt={tituloLimpo}
                />
                <div className="pd-card-info">
                    {eUrgente && (
                        <span className="pd-urgente-pill">
                            <i className="fas fa-star"></i> Urgente
                        </span>
                    )}
                    <span className="pd-card-nome">{tituloLimpo}</span>
                    {nomeVariante && <span className="pd-card-variante">{nomeVariante}</span>}
                    {dataFormatada && (
                        <span className="pd-card-meta">
                            <i className="fas fa-calendar-alt"></i>{dataFormatada}
                        </span>
                    )}
                </div>
            </div>

            <div className="pd-card-bar">
                <div className="seg-estoque"   style={{ width: `${pct(emEstoque)}%` }} />
                <div className="seg-embalagem" style={{ width: `${pct(emEmbalagem)}%` }} />
                <div className="seg-arremate"  style={{ width: `${pct(emArremate)}%` }} />
                <div className="seg-producao"  style={{ width: `${pct(emProducao)}%` }} />
                <div className="seg-perda"     style={{ width: `${pct(emPerda)}%` }} />
            </div>

            <div className="pd-card-rodape" onClick={e => e.stopPropagation()}>
                <span className="pd-card-qtd">
                    <strong>{totalConsumido}</strong>/{totalPedido} pçs
                </span>
                {renderCTA()}
            </div>

            {expandido && (
                <div className="pd-card-accordion" onClick={e => e.stopPropagation()}>
                    {item.observacoes && (
                        <div className="pd-obs">
                            <i className="fas fa-comment-alt"></i>
                            <span>{item.observacoes}</span>
                        </div>
                    )}
                    <div className="pd-breakdown">
                        <div className="pd-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#ecf0f1', border: '1px solid #bdc3c7' }}></span>
                            <span>Fila</span>
                            <strong>{pendenteFila}</strong>
                        </div>
                        <div className="pd-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#3498db' }}></span>
                            <span>Costura</span>
                            <strong>{emProducao}</strong>
                        </div>
                        <div className="pd-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#9b59b6' }}></span>
                            <span>Arremate</span>
                            <strong>{emArremate}</strong>
                        </div>
                        <div className="pd-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#e67e22' }}></span>
                            <span>Embalagem</span>
                            <strong>{emEmbalagem}</strong>
                        </div>
                        <div className="pd-breakdown-item">
                            <span className="dot" style={{ backgroundColor: '#27ae60' }}></span>
                            <span>Estoque</span>
                            <strong>{emEstoque}</strong>
                        </div>
                        {emPerda > 0 && (
                            <div className="pd-breakdown-item">
                                <span className="dot" style={{ backgroundColor: '#e74c3c' }}></span>
                                <span>Perda</span>
                                <strong>{emPerda}</strong>
                            </div>
                        )}
                    </div>

                    {permissoes.includes('concluir-demanda-manual') && statusCalculado !== 'CONCLUIDO' && (
                        <button className="pd-btn-concluir-manual" onClick={handleConcluirManual}>
                            <i className="fas fa-check-double"></i>
                            Marcar como Concluída
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
