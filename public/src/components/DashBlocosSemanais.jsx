import React from 'react';

export default function DashBlocosSemanais({ blocos, acumuladoTotal }) {
    
    // Função para formatar data (DD/MM/AAAA) IGNORANDO O FUSO HORÁRIO LOCAL
    const fmt = (dataISO) => {
        if (!dataISO) return '';
        const d = new Date(dataISO);
        // Usa UTC para não voltar um dia
        return `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth()+1).toString().padStart(2, '0')}`;
    };

    return (
        <div className="ds-resumo-semanal">
            <div style={{
                backgroundColor: 'var(--ds-cor-cinza-claro-fundo)', 
                borderRadius: 'var(--ds-raio-borda)', 
                padding: '15px',
                border: '1px solid var(--ds-cor-cinza-borda)'
            }}>
                <h3 className="ds-resumo-header" style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom:'15px', borderBottom:'1px solid #ddd', paddingBottom:'10px'
                }}>
                    <span>Extrato da Competência</span>
                    <strong style={{color:'var(--ds-cor-sucesso)', fontSize:'1.2rem'}}>Total: R$ {acumuladoTotal.toFixed(2)}</strong>
                </h3>
                
                <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                    {blocos.map((bloco, idx) => {
                        const isCurrent = new Date() >= new Date(bloco.inicio) && new Date() <= new Date(bloco.fim);
                        const corValor = bloco.ganho > 0 ? 'var(--ds-cor-sucesso)' : '#999';
                        
                        return (
                            <div key={idx} style={{
                                display:'flex', justifyContent:'space-between', alignItems:'center',
                                padding: '10px',
                                backgroundColor: isCurrent ? '#fff' : 'rgba(255,255,255,0.5)',
                                border: isCurrent ? '1px solid var(--ds-cor-primaria)' : '1px solid transparent',
                                borderRadius: '8px',
                                boxShadow: isCurrent ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                            }}>
                                <div>
                                    <div style={{fontWeight:'600', fontSize:'0.9rem', color:'var(--ds-cor-azul-escuro)'}}>
                                        Semana {idx + 1} {isCurrent && <span style={{fontSize:'0.7rem', color:'var(--ds-cor-primaria)'}}>(Atual)</span>}
                                    </div>
                                    <div style={{fontSize:'0.8rem', color:'#666'}}>
                                        {fmt(bloco.inicio)} a {fmt(bloco.fim)} • {Math.round(bloco.pontos)} pts
                                    </div>
                                </div>
                                <div style={{fontWeight:'700', color: corValor, fontSize:'1rem'}}>
                                    R$ {bloco.ganho.toFixed(2)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}