import React from 'react';
import DashTabelaCiclo from './DashTabelaCiclo'; // Importe o novo componente

export default function DashDesempenhoModal({ dadosAcumulados, diasTrabalho, onClose }) {
    if (!dadosAcumulados) return null;

    return (
        <div className="ds-popup-overlay ativo" onClick={onClose} style={{zIndex: 1100}}>
            <div className="ds-modal-assinatura-content" onClick={e => e.stopPropagation()} style={{position:'relative'}}>
                {/* Botão X Absoluto */}
                <button className="ds-modal-close-simple" onClick={onClose}>
                    <i className="fas fa-times"></i>
                </button>

                <div className="ds-modal-header-static" style={{paddingTop:'20px'}}>
                    <h2 className="ds-modal-titulo" style={{marginBottom: 0, border: 'none'}}>Extrato Detalhado</h2>
                </div>

                <div className="ds-modal-body-scrollable" style={{padding: '20px'}}>
                    <DashTabelaCiclo
                        blocos={dadosAcumulados.blocos}
                        diasDetalhes={dadosAcumulados.diasDetalhes || []}
                        eventosCalendario={dadosAcumulados.eventosCalendario || []}
                        diasTrabalho={diasTrabalho}
                    />
                </div>
            </div>
        </div>
    );
}