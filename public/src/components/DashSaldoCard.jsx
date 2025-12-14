import React, { useState } from 'react';

export default function DashSaldoCard({ valorAcumulado, dataPagamento }) {
    // Começa oculto por privacidade (padrão de apps de banco)
    const [visivel, setVisivel] = useState(false);

    const toggle = () => setVisivel(!visivel);

    return (
        <div className="ds-card" style={{ marginBottom: '20px', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '15px 25px' }}>
            <div>
                <span style={{ display: 'block', fontSize: '0.9rem', color: '#666', fontWeight: '600' }}>
                    Saldo Acumulado (Ciclo Atual)
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                    <strong style={{ fontSize: '1.8rem', color: 'var(--ds-cor-azul-escuro)' }}>
                        {visivel ? `R$ ${valorAcumulado.toFixed(2)}` : 'R$ •••••'}
                    </strong>
                    <button 
                        onClick={toggle} 
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '1.2rem' }}
                        title={visivel ? "Ocultar valores" : "Mostrar valores"}
                    >
                        <i className={`fas ${visivel ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                </div>
                <small style={{ color: '#999', fontSize: '0.75rem' }}>
                    Pagamento estimado para: {dataPagamento}
                </small>
            </div>
            
            {/* Ícone decorativo ou visual de carteira */}
            <div style={{ fontSize: '2rem', color: 'var(--ds-cor-sucesso)', opacity: 0.2 }}>
                <i className="fas fa-wallet"></i>
            </div>
        </div>
    );
}