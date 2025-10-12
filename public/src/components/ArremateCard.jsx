// public/src/components/ArremateCard.jsx

import React from 'react';
// Importa a função helper que acabamos de verificar/criar.
import { getImagemVariacao } from '../utils/ArremateProdutoHelpers.js';

// Função auxiliar para formatar o tempo decorrido
function formatarTempoDecorrido(data) {
    if (!data) return 'Calculando...';
    const agora = new Date();
    const dataPassada = new Date(data);
    const segundos = Math.floor((agora - dataPassada) / 1000);

    let intervalo = segundos / 86400;
    if (intervalo > 1) return `há ${Math.floor(intervalo)} dias`;
    intervalo = segundos / 3600;
    if (intervalo > 1) return `há ${Math.floor(intervalo)}h`;
    intervalo = segundos / 60;
    if (intervalo > 1) return `há ${Math.floor(intervalo)}min`;
    return 'agora mesmo';
}

export function ArremateCard({ item, onClick, isSelected  }) {
    const imagemSrc = getImagemVariacao(item, item.variante); 
    const tempoEmFila = formatarTempoDecorrido(item.data_op_mais_antiga);
    
    // --- LÓGICA CORRIGIDA ---
    const emTrabalho = !!item.tarefa_ativa_por;
    const aindaTemSaldo = item.saldo_para_arrematar > 0;

    // O card só fica 'desabilitado' se NÃO tiver mais saldo
    const desabilitado = !aindaTemSaldo;
    
    // 2. Adicione a classe 'selecionado' se a prop for verdadeira
    const cardClassName = `oa-card-arremate-react ${emTrabalho ? 'em-trabalho' : ''} ${desabilitado ? 'desabilitado' : ''} ${isSelected ? 'selecionado' : ''}`;

    const handleClick = () => {
        // Permite o clique se o card NÃO estiver desabilitado
        if (!desabilitado) {
            onClick(item);
        }
    };

        const handleTooltipClick = (e) => {
            e.stopPropagation();
        };
        
        return (
            <div className={cardClassName} onClick={handleClick} style={{ position: 'relative' }}>
                    {isSelected && (
                        <div className="card-selecao-icone">
                            <i className="fas fa-check-circle"></i>
                        </div>
                    )}
                
                {/* O selo de "Em Trabalho" só aparece se a condição for verdadeira */}
                {emTrabalho && (
                    <div className="feedback-em-trabalho">
                        <i className="fas fa-cog fa-spin"></i>
                        Em andamento com {item.tarefa_ativa_por}
                    </div>
                )}

                <div className="card-borda-charme"></div>
                <img src={imagemSrc} alt={item.produto_nome} className="card-imagem-produto" />
                
                <div className="card-info-principal">
                <h3>{item.produto_nome}</h3>
                <p>{item.variante && item.variante !== '-' ? item.variante : 'Padrão'}</p>
                
                <div className="card-info-secundaria">
                    <span className="info-item info-item-data" title={`Na fila ${tempoEmFila}`}>
                        <i className="fas fa-calendar-alt"></i> 
                        <span>
                            {new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(item.data_op_mais_antiga))}
                            <strong>
                                {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(item.data_op_mais_antiga))}
                            </strong>
                        </span>
                    </span>
                    <span 
                        className="info-item"
                        data-tooltip-id="global-tooltip"
                        data-tooltip-content={JSON.stringify(item.ops_detalhe || [])} 
                        onClick={handleTooltipClick}
                    >
                        <i className="fas fa-cubes"></i> {(item.ops_detalhe || []).length} OPs
                    </span>
                </div>
            </div>

            <div className="card-bloco-pendente">
                    <span className="label">DISPONÍVEL</span>
                    <span className="valor">{item.saldo_para_arrematar}</span>
                </div>
            </div>
        );
    }