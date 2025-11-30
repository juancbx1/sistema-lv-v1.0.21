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

export function OPCard({ op, onClick }) {
    // Proteção básica se op vier nulo (não deveria, mas previne crash)
    if (!op) return null;

    const imagemSrc = op.imagem_produto || '/img/placeholder-image.png';
    
    // --- LÓGICA DE DETECÇÃO DA BORDA AMARELA (BLINDADA) ---
    let statusClass = `status-${op.status}`;
    
    try {
        // Se não estiver finalizada/cancelada E tiver etapas...
        if (op.status !== 'finalizado' && op.status !== 'cancelada' && 
            op.etapas && Array.isArray(op.etapas) && op.etapas.length > 0) {
            
            // Verificação SEGURA: checa se 'e' existe antes de ler 'lancado'
            const todasProntas = op.etapas.every(e => e && e.lancado === true);
            
            if (todasProntas) {
                statusClass = 'status-pronta-finalizar';
            }
        }
    } catch (error) {
        // Se der erro no cálculo da borda, ignora e usa a cor padrão do status
        console.warn("Erro ao calcular status visual do card:", error);
    }

    const handleClick = () => { if (onClick) onClick(op); };

    return (
        <div className="op-card-react" onClick={handleClick}>
            
            <div className={`card-borda-charme ${statusClass}`}></div>

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
                    <span className="info-item info-item-data" title="Data de Entrega">
                        <i className="fas fa-calendar-alt"></i>
                        <span><strong>{formatarData(op.data_entrega)}</strong></span>
                    </span>
                </div>
            </div>

            <div className="card-bloco-pendente">
                <span className="label">QUANTIDADE</span>
                <span className="valor">{op.quantidade || 0}</span>
            </div>
        </div>
    );
}