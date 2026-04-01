// public/src/components/ArremateCard.jsx

import React from 'react';
import { getImagemVariacao } from '../utils/ArremateProdutoHelpers.js';

function formatarTempoDecorrido(data) {
    if (!data) return 'Calculando...';
    const segundos = Math.floor((new Date() - new Date(data)) / 1000);
    if (segundos >= 86400) return `há ${Math.floor(segundos / 86400)} dias`;
    if (segundos >= 3600)  return `há ${Math.floor(segundos / 3600)}h`;
    if (segundos >= 60)    return `há ${Math.floor(segundos / 60)}min`;
    return 'agora mesmo';
}

export function ArremateCard({ item, onClick, isSelected }) {
    const imagemSrc = getImagemVariacao(item, item.variante);
    const tempoEmFila = formatarTempoDecorrido(item.data_op_mais_antiga);

    const emTrabalho = !!item.tarefa_ativa_por;
    const aindaTemSaldo = item.saldo_para_arrematar > 0;
    const desabilitado = !aindaTemSaldo;

    const cardClassName = [
        'oa-card-arremate-react',
        emTrabalho  ? 'em-trabalho'  : '',
        desabilitado ? 'desabilitado' : '',
        isSelected   ? 'selecionado'  : ''
    ].filter(Boolean).join(' ');

    const handleClick = () => { if (!desabilitado) onClick(item); };
    const handleTooltipClick = (e) => e.stopPropagation();

    const dataFormatada = item.data_op_mais_antiga
        ? new Intl.DateTimeFormat('pt-BR', {
              day: '2-digit', month: '2-digit',
              hour: '2-digit', minute: '2-digit',
              timeZone: 'America/Sao_Paulo'
          }).format(new Date(item.data_op_mais_antiga))
        : '—';

    return (
        <div className={cardClassName} onClick={handleClick}>

            {/* Borda-charme — identidade visual da empresa */}
            <div className="card-borda-charme"></div>

            {/* Badge de saldo — absoluto, nunca comprime o layout */}
            {!isSelected && (
                <div className="arremate-saldo-badge">
                    <span className="saldo-valor">{item.saldo_para_arrematar}</span>
                    <span className="saldo-label">disponível</span>
                </div>
            )}

            {/* Check de seleção — aparece no lugar do badge */}
            {isSelected && (
                <div className="arremate-check-icone">
                    <i className="fas fa-check"></i>
                </div>
            )}

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
                        <span title={`Na fila ${tempoEmFila}`}>
                            <i className="fas fa-calendar-alt"></i>
                            {dataFormatada}
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

            {/* Banner "Em andamento" — na base, discreto */}
            {emTrabalho && (
                <div className="arremate-em-trabalho-banner">
                    <i className="fas fa-cog fa-spin"></i>
                    Em andamento com {item.tarefa_ativa_por}
                </div>
            )}
        </div>
    );
}
