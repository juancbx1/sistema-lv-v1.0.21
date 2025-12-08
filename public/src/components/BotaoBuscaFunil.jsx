// public/src/components/BotaoBuscaFunil.jsx

import React, { useState } from 'react';
import PainelDemandas from './BotaoBuscaPainelDemandas.jsx';

// Recebe a prop vinda do main-op.jsx
export default function BotaoBuscaFunil({ onIniciarProducao, permissoes }) {
    const [modalAberto, setModalAberto] = useState(false);

    // Função intermediária para fechar o modal antes de iniciar o processo
    const handleIniciarProducao = (dados) => {
        setModalAberto(false); // Fecha o modal de demandas
        if (onIniciarProducao) {
            onIniciarProducao(dados); // Chama a ponte no main-op
        }
    };

    if (!modalAberto) {
        // ... (código do botão flutuante mantido igual)
        return (
            <button 
                className="gs-fab-busca" 
                title="Painel de Prioridades / Demandas" 
                onClick={() => setModalAberto(true)}
                style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}
            >
                <i className="fas fa-tasks"></i>
            </button>
        );
    }

    return (
        <div className="gs-busca-modal-overlay" onClick={() => setModalAberto(false)}>
            <div className="gs-busca-modal-conteudo" onClick={(e) => e.stopPropagation()}>
                <div className="gs-busca-modal-header">
                    <h3>Painel de Prioridades</h3>
                    <button onClick={() => setModalAberto(false)} className="gs-busca-modal-fechar">&times;</button>
                </div>
                <div className="gs-busca-modal-body">
                    {/* Passamos a função wrapper para o painel */}
                    <PainelDemandas 
                        onIniciarProducao={handleIniciarProducao} 
                        permissoes={permissoes}
                    />
                </div>
            </div>
        </div>
    );
}