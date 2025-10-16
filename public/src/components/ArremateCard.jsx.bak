// public/src/components/ArremateCard.jsx (VERSÃO FINAL E CORRETA)

import React from 'react';
// Importa a função helper que acabamos de verificar/criar.
import { getImagemVariacao } from '../utils/produtoHelpers.js';

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

export function ArremateCard({ item, onClick }) {
    // Usa a função helper importada para buscar a imagem correta.
    // O `item` que vem da API agora contém a 'grade' necessária.
    const imagemSrc = getImagemVariacao(item, item.variante); 
    const tempoEmFila = formatarTempoDecorrido(item.data_op_mais_antiga);
    
    const handleTooltipClick = (e) => {
        e.stopPropagation();
    };
    
    return (
        <div className="oa-card-arremate-react" onClick={() => onClick(item)}>
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
                <span className="label">PENDENTE</span>
                <span className="valor">{item.saldo_para_arrematar}</span>
            </div>
        </div>
    );
}