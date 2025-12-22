import React from 'react';

export default function DashTabelaCiclo({ blocos }) {
    // DATA DE CORTE: 14/12/2025
    const dataCorte = new Date('2025-12-14T00:00:00');

    // Filtra os blocos válidos (mesma lógica do resumo)
    const blocosVisiveis = blocos.filter(bloco => {
        const fimBloco = new Date(bloco.fim);
        return fimBloco >= dataCorte;
    });

    // --- CORREÇÃO DA DATA (FUSO HORÁRIO) ---
    // Usamos getUTCDate para garantir que a data mostrada é a mesma que o servidor mandou,
    // ignorando se o usuário está no Brasil (GMT-3) ou na China.
    const fmt = (dataISO) => {
        if (!dataISO) return '--/--/----';
        const d = new Date(dataISO);
        const dia = d.getUTCDate().toString().padStart(2, '0');
        const mes = (d.getUTCMonth() + 1).toString().padStart(2, '0');
        const ano = d.getUTCFullYear();
        return `${dia}/${mes}/${ano}`;
    };

    if (blocosVisiveis.length === 0) {
        return <div style={{padding: '20px', textAlign: 'center', color: '#666'}}>Nenhum dado disponível para o período.</div>;
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