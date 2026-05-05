// public/src/components/ArremateCard.jsx

import React from 'react';
import { getImagemVariacao } from '../utils/ArremateProdutoHelpers.js';

function formatarData(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(iso));
}

export function ArremateCard({ item, onClick, isSelected }) {
    const imagemSrc = getImagemVariacao(item, item.variante);

    const emTrabalho = !!item.tarefa_ativa_por;
    const aindaTemSaldo = item.saldo_para_arrematar > 0;
    const desabilitado = !aindaTemSaldo;

    const cardClassName = [
        'oa-card-arremate-react',
        emTrabalho   ? 'em-trabalho'  : '',
        desabilitado ? 'desabilitado' : '',
        isSelected   ? 'selecionado'  : '',
    ].filter(Boolean).join(' ');

    const handleClick = () => { if (!desabilitado) onClick(item); };
    const handleTooltipClick = (e) => e.stopPropagation();

    return (
        <div className={cardClassName} onClick={handleClick}>

            {/* Borda-charme */}
            <div className="card-borda-charme"></div>

            {/* Bolinha de seleção — canto superior direito (padrão OP) */}
            <div className="op-card-checkbox-wrapper">
                <div className={`op-card-checkbox${isSelected ? ' marcado' : ''}`}></div>
            </div>

            {/* Corpo principal: imagem + informações */}
            <div className="arremate-card-corpo">
                <img
                    src={imagemSrc}
                    alt={item.produto_nome}
                    className="arremate-card-img"
                />
                <div className="arremate-card-info">
                    <h3 className="arremate-card-nome">{item.produto_nome}</h3>
                    <p className="arremate-card-variante">
                        {item.variante && item.variante !== '-' ? item.variante : 'Padrão'}
                    </p>
                    <div className="arremate-card-meta">
                        <span title={`Entrada: ${formatarData(item.data_op_mais_antiga)}`}>
                            <i className="fas fa-calendar-alt"></i>
                            {formatarData(item.data_op_mais_antiga)}
                        </span>
                        <span
                            data-tooltip-id="global-tooltip"
                            data-tooltip-content={JSON.stringify(item.ops_detalhe || [])}
                            onClick={handleTooltipClick}
                        >
                            <i className="fas fa-cubes"></i>
                            {(item.ops_detalhe || []).length} OPs
                        </span>
                    </div>
                </div>
            </div>

            {/* Rodapé: saldo + banner em andamento */}
            <div className="arremate-card-rodape">
                <span className="arremate-saldo-badge">
                    <span className="saldo-valor">{item.saldo_para_arrematar}</span>
                    <span className="saldo-label">disponível</span>
                </span>

                {emTrabalho && (
                    <span className="arremate-em-trabalho-inline">
                        <i className="fas fa-cog fa-spin"></i>
                        {item.tarefa_ativa_por}
                    </span>
                )}
            </div>
        </div>
    );
}
