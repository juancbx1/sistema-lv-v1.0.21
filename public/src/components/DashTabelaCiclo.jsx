import React from 'react';

export default function DashTabelaCiclo({ blocos }) {
    const fmt = (d) => new Date(d).toLocaleDateString('pt-BR');
    
    // DATA DE CORTE: 14/12/2025
    // Tudo que terminou antes disso será ignorado para não confundir o usuário
    const dataCorte = new Date('2025-12-14T00:00:00');

    // Filtra os blocos válidos
    const blocosVisiveis = blocos.filter(bloco => {
        const fimBloco = new Date(bloco.fim);
        return fimBloco >= dataCorte;
    });

    if (blocosVisiveis.length === 0) {
        return <div style={{padding: '20px', textAlign: 'center', color: '#666'}}>Nenhum dado disponível para o novo modelo de metas (a partir de 14/12).</div>;
    }

    return (
        <div className="ds-tabela-ciclo-container" style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
            {blocosVisiveis.map((bloco, idx) => {
                const temGanho = bloco.ganho > 0;
                
                return (
                    <div key={idx} style={{
                        backgroundColor: '#fff',
                        border: '1px solid #dee2e6',
                        borderRadius: '12px',
                        padding: '15px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        {/* LADO ESQUERDO: INFO DA SEMANA */}
                        <div>
                            <div style={{fontWeight: '700', color: 'var(--ds-cor-azul-escuro)', fontSize: '1rem', marginBottom: '4px'}}>
                                Semana #{bloco.numero}
                            </div>
                            <div style={{fontSize: '0.85rem', color: '#666'}}>
                                <i className="far fa-calendar-alt" style={{marginRight: '5px'}}></i>
                                {fmt(bloco.inicio)} até {fmt(bloco.fim)}
                            </div>
                        </div>

                        {/* LADO DIREITO: VALORES */}
                        <div style={{textAlign: 'right'}}>
                            <div style={{
                                fontSize: '1.1rem', 
                                fontWeight: '700', 
                                color: temGanho ? 'var(--ds-cor-sucesso)' : '#999'
                            }}>
                                R$ {bloco.ganho.toFixed(2)}
                            </div>
                            <div style={{fontSize: '0.8rem', color: 'var(--ds-cor-primaria)', fontWeight: '500'}}>
                                {Math.round(bloco.pontos)} pts
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}