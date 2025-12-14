import React, { useState } from 'react';
import { fetchAPI } from '/js/utils/api-utils.js';

export default function DashCofreCard({ dadosCofre, metaDoDia, pontosHoje, aoResgatarSucesso }) {
    const [loading, setLoading] = useState(false);

    if (!dadosCofre) return null;

    const saldo = parseFloat(dadosCofre.saldo || 0);
    const usos = dadosCofre.usos || 0;
    const limiteUsos = 5;
    
    // Cálculo inteligente: Quanto falta para a meta?
    const faltaParaMeta = metaDoDia ? Math.max(0, metaDoDia.pontos_meta - pontosHoje) : 0;
    
    // O botão só habilita se:
    // 1. Tiver falta de pontos hoje (> 0)
    // 2. Tiver saldo suficiente (>= falta)
    // 3. Não tiver estourado o limite de usos
    const podeResgatar = faltaParaMeta > 0 && saldo >= faltaParaMeta && usos < limiteUsos;

    const handleResgatar = async () => {
        if (!confirm(`Deseja usar ${faltaParaMeta} pontos do seu cofre para bater a meta de hoje?`)) return;
        
        setLoading(true);
        try {
            await fetchAPI('/api/dashboard/resgatar-pontos', {
                method: 'POST',
                body: JSON.stringify({ quantidade: faltaParaMeta })
            });
            alert('Resgate realizado com sucesso! A meta foi atualizada.');
            if (aoResgatarSucesso) aoResgatarSucesso(); // Recarrega a dashboard
        } catch (error) {
            alert(`Erro: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // URL da imagem (Troque pela sua URL real depois)
    // Usando placeholder 150x150 rosa por enquanto
    const imgPorquinho = "https://placehold.co/150x150/FFC0CB/white?text=Cofre"; 

    return (
        <div className="ds-card" style={{marginTop: '20px', padding: '20px', display:'flex', alignItems:'center', gap:'20px'}}>
            {/* Imagem Viva */}
            <div style={{flexShrink: 0}}>
                <img src={imgPorquinho} alt="Cofre Porquinho" style={{width:'80px', height:'80px', borderRadius:'12px', objectFit:'cover'}} />
            </div>

            <div style={{flexGrow: 1}}>
                <h3 className="ds-card-titulo" style={{fontSize:'1.1rem', margin:0, border:'none', padding:0}}>
                    Banco de Resgate
                </h3>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:'5px'}}>
                    <div>
                        <div style={{fontSize:'1.4rem', fontWeight:'bold', color:'var(--ds-cor-primaria)'}}>
                            {Math.round(saldo)} pts
                        </div>
                        <div style={{fontSize:'0.8rem', color:'#666'}}>
                            Usos no ciclo: <strong>{usos}/{limiteUsos}</strong>
                        </div>
                    </div>
                    
                    <button 
                        className="ds-btn ds-btn-primario" 
                        disabled={!podeResgatar || loading}
                        onClick={handleResgatar}
                        style={{opacity: podeResgatar ? 1 : 0.6}}
                    >
                        {loading ? '...' : (podeResgatar ? 'Usar Resgate' : 'Indisponível')}
                    </button>
                </div>
                {faltaParaMeta > 0 && !podeResgatar && (
                    <div style={{fontSize:'0.75rem', color:'#999', marginTop:'5px', fontStyle:'italic'}}>
                        {saldo < faltaParaMeta ? `Saldo insuficiente (Faltam ${faltaParaMeta})` : usos >= limiteUsos ? 'Limite de usos atingido' : 'Meta já batida'}
                    </div>
                )}
            </div>
        </div>
    );
}