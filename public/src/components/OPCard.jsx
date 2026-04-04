// public/src/components/OPCard.jsx

import React from 'react';

function formatarData(dataISO) {
    try {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'
        });
    } catch (e) {
        return 'Data Inválida';
    }
}

function RadarBadge({ radar }) {
    if (!radar || radar.faixa === 'normal') return null;
    const isCritico = radar.faixa === 'critico';
    return (
        <span className={`op-radar-badge ${radar.faixa}`} title={`Esta OP está em produção há ${radar.horas_abertas}h. O tempo normal para este produto é ${radar.media_horas}h.`}>
            <i className={`fas fa-${isCritico ? 'radiation-alt' : 'exclamation-triangle'}`}></i>
            {isCritico ? 'Atrasada: ' : 'Atenção: '}
            em prod. há {radar.horas_abertas}h (normal: {radar.media_horas}h)
        </span>
    );
}

export function OPCard({ op, onClick, modoSelecao, selecionado, onToggleSelecao, onCancelar }) {
    if (!op) return null;

    const imagemSrc = op.imagem_produto || '/img/placeholder-image.png';

    // Calcula statusClass
    let statusClass = `status-${op.status}`;
    try {
        if (op.status !== 'finalizado' && op.status !== 'cancelada' &&
            op.etapas && Array.isArray(op.etapas) && op.etapas.length > 0) {
            const todasProntas = op.etapas.every(e => e && e.lancado === true);
            if (todasProntas) statusClass = 'status-pronta-finalizar';
        }
    } catch {
        // ignora erro de cálculo
    }

    // No modo seleção: apenas cards status-pronta-finalizar são elegíveis
    const elegivel = statusClass === 'status-pronta-finalizar';

    // Botão de cancelar: só aparece se a OP ainda está ativa e o usuário tem permissão
    const podeCancelar = onCancelar &&
        !modoSelecao &&
        op.status !== 'cancelada' &&
        op.status !== 'finalizado';

    const handleClick = () => {
        if (modoSelecao) {
            if (elegivel && onToggleSelecao) onToggleSelecao(op);
        } else {
            if (onClick) onClick(op);
        }
    };

    const handleCancelarClick = (e) => {
        e.stopPropagation(); // não abrir o modal de detalhes
        onCancelar(op);
    };

    // Classes dinâmicas
    const cardClasses = [
        'op-card-react',
        modoSelecao ? 'modo-selecao' : '',
        modoSelecao && elegivel ? 'elegivel' : '',
        modoSelecao && !elegivel ? 'inelegivel' : '',
        selecionado ? 'selecionado' : ''
    ].filter(Boolean).join(' ');

    return (
        <div className={cardClasses} onClick={handleClick}>
            <div className={`card-borda-charme ${statusClass}`}></div>

            {/* Checkbox circular (modo seleção) */}
            <div className="op-selecao-check">
                {selecionado && <i className="fas fa-check"></i>}
            </div>

            {/* Botão cancelar — canto superior direito */}
            {podeCancelar && (
                <button
                    className="op-card-btn-cancelar"
                    onClick={handleCancelarClick}
                    title="Cancelar OP"
                    aria-label="Cancelar OP"
                >
                    <i className="fas fa-trash-alt"></i>
                </button>
            )}

            <img src={imagemSrc} alt={op.produto || 'Produto'} className="card-imagem-produto" />

            <div className="card-info-principal">
                <span style={{
                    fontSize: '0.85rem', fontWeight: '800', color: 'var(--op-cor-azul-claro)',
                    textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>
                    OP #{op.numero}
                </span>
                <h3>{op.produto || 'Produto Indefinido'}</h3>
                <p>{op.variante && op.variante !== '-' ? op.variante : 'Padrão'}</p>

                <div className="card-info-secundaria">
                    <span className="info-item info-item-data" title="Data de criação">
                        <i className="fas fa-calendar-alt"></i>
                        <span><strong>{formatarData(op.data_entrega)}</strong></span>
                    </span>
                </div>

                <RadarBadge radar={op.radar} />
            </div>

            <div className="card-bloco-pendente">
                <span className="label">QUANTIDADE</span>
                <span className="valor">{op.quantidade || 0}</span>
            </div>
        </div>
    );
}
