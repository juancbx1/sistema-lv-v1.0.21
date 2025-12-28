// public/src/components/BotaoBuscaFunil.jsx

import React, { useState } from 'react';
import PainelDemandas from './BotaoBuscaPainelDemandas.jsx';

export default function BotaoBuscaFunil({ onIniciarProducao, permissoes }) {
    const [modalAberto, setModalAberto] = useState(false);
    const [temPrioridade, setTemPrioridade] = useState(false);

    // Função de verificação extraída para reutilização
    const checkPrioridades = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/demandas', { headers: { 'Authorization': `Bearer ${token}` } });
            if(res.ok) {
                const dados = await res.json();
                // Verifica se tem prioridade=1 E não está concluída
                // Conversão para inteiro garante que '1' vire 1
                const temUrgente = dados.some(d => parseInt(d.prioridade) === 1 && d.status !== 'concluida');
                setTemPrioridade(temUrgente);
            }
        } catch (e) { console.error("Erro check prioridade:", e); }
    };

    // Roda APENAS UMA VEZ ao carregar a página.
    React.useEffect(() => {
        checkPrioridades();
    }, []);

    // Quando fecha o modal, verifica de novo (pois pode ter criado/deletado algo)
    const handleClose = () => {
        setModalAberto(false);
        checkPrioridades();
    };

    if (!modalAberto) {
        return (
            <button 
                className="gs-fab-busca" 
                onClick={() => setModalAberto(true)}
                style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}
            >
                <i className="fas fa-tasks"></i>
                
                {/* DEBUG VISUAL: Se tem prioridade, isso DEVE aparecer */}
                {temPrioridade && (
                    <span style={{
                        position: 'absolute', top: '-5px', right: '-5px',
                        backgroundColor: '#fff', color: '#f1c40f',
                        borderRadius: '50%', width: '24px', height: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)', border: '2px solid #f1c40f',
                        zIndex: 10000
                    }}>
                        <i className="fas fa-star" style={{ fontSize: '0.9rem' }}></i>
                    </span>
                )}
            </button>
        );
    }

    return (
        <div className="gs-busca-modal-overlay" onClick={handleClose}> {/* Usa handleClose */}
            <div className="gs-busca-modal-conteudo" onClick={(e) => e.stopPropagation()}>
                <div className="gs-busca-modal-header">
                    <h3>Painel de Prioridades</h3>
                    <button onClick={handleClose} className="gs-busca-modal-fechar">&times;</button>
                </div>
                <div className="gs-busca-modal-body">
                    <PainelDemandas 
                        onIniciarProducao={(dados) => { setModalAberto(false); onIniciarProducao(dados); }} 
                        permissoes={permissoes}
                    />
                </div>
            </div>
        </div>
    );
}