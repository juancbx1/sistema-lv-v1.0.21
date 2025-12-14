import React, { useState, useEffect } from 'react';

export default function DashMetaSlider({ metasPossiveis, aoMudarMeta, metaInicial }) {
    const [indiceSelecionado, setIndiceSelecionado] = useState(0);

    // Sincroniza com a meta inicial vinda do pai
    useEffect(() => {
        if (metasPossiveis && metasPossiveis.length > 0 && metaInicial) {
            const idx = metasPossiveis.findIndex(m => m.pontos_meta === metaInicial.pontos_meta);
            if (idx >= 0) setIndiceSelecionado(idx);
        }
    }, [metasPossiveis, metaInicial]);

    if (!metasPossiveis || metasPossiveis.length === 0) {
        return <div className="ds-card" style={{textAlign:'center', padding:'20px'}}>Nenhuma meta configurada.</div>;
    }

    const handleChange = (e) => {
        const novoIdx = parseInt(e.target.value);
        setIndiceSelecionado(novoIdx);
        
        const metaEscolhida = metasPossiveis[novoIdx];
        if (aoMudarMeta) aoMudarMeta(metaEscolhida);
        
        localStorage.setItem('meta_diaria_planejada', metaEscolhida.pontos_meta);
    };

    const metaAtual = metasPossiveis[indiceSelecionado];
    
    // Cálculo de largura para as labels ficarem centralizadas
    const larguraLabel = `${100 / metasPossiveis.length}%`;

    // Valores
    const pontosDia = metaAtual.pontos_meta;
    const valorDia = parseFloat(metaAtual.valor_comissao);
    
    // Novo Cálculo: Intervalo de 22 a 25 dias
    const valorMensalMin = valorDia * 22;
    const valorMensalMax = valorDia * 25;

    // Formata o nome da meta
    const nomeMetaLimpo = metaAtual.descricao_meta.replace('Meta ', '');

    return (
        <section className="ds-card ds-resumo-semanal" style={{padding: '0', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column'}}>
            {/* CABEÇALHO E SLIDER */}
            <div style={{padding: '20px 20px 0 20px', flexGrow: 1}}>
                <h3 className="ds-resumo-header" style={{textAlign:'center', marginBottom:'20px'}}>
                    Planeje sua Meta Diária
                </h3>

                <div className="ds-slider-container" style={{padding: '0 10px'}}>
                    <input 
                        type="range" 
                        className="ds-meta-slider" 
                        min="0" 
                        max={metasPossiveis.length - 1} 
                        step="1"
                        value={indiceSelecionado}
                        onChange={handleChange}
                        style={{width: '100%', cursor: 'pointer', margin: 0}}
                    />
                    
                    {/* Labels alinhadas */}
                    <div style={{
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        marginTop: '12px', 
                        position: 'relative',
                        marginLeft: '-15px', 
                        marginRight: '-15px'
                    }}>
                        {metasPossiveis.map((m, i) => (
                            <div key={i} style={{
                                width: larguraLabel, 
                                textAlign: 'center', 
                                fontSize: '0.75rem', 
                                color: i === indiceSelecionado ? 'var(--ds-cor-primaria)' : '#999',
                                fontWeight: i === indiceSelecionado ? 'bold' : 'normal',
                                transition: 'color 0.2s'
                            }}>
                                {m.descricao_meta.replace('Meta ', '')}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

           {/* ÁREA DE INFORMAÇÕES */}
            <div style={{marginTop: '25px'}}>
                
                {/* 1. O CONTRATO (Cinza) */}
                <div style={{
                    backgroundColor: 'var(--ds-cor-cinza-claro-fundo)',
                    padding: '15px 20px',
                    borderTop: '1px solid var(--ds-cor-cinza-borda)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{textAlign: 'left'}}>
                        <span style={{fontSize: '0.8rem', color: '#666', fontWeight: '600', display:'block'}}>ALVO DO DIA</span>
                        <div style={{fontSize: '1.3rem', fontWeight: '700', color: 'var(--ds-cor-azul-escuro)'}}>
                            {pontosDia} <span style={{fontSize: '0.9rem', fontWeight: '500'}}>pts</span>
                        </div>
                    </div>
                    
                    <div style={{textAlign: 'right'}}>
                        <span style={{fontSize: '0.8rem', color: '#666', fontWeight: '600', display:'block'}}>CLASSIFICAÇÃO</span>
                        <div style={{fontSize: '1.3rem', fontWeight: '700', color: 'var(--ds-cor-primaria)'}}>
                            <i className="fas fa-medal" style={{marginRight:'5px', fontSize:'1rem'}}></i>
                            {nomeMetaLimpo}
                        </div>
                    </div>
                </div>

                {/* 2. O PRÊMIO (Verde) - Intervalo de Valores */}
                <div style={{
                    background: 'linear-gradient(135deg, #28a745 0%, #218838 100%)',
                    padding: '15px 20px',
                    color: '#fff',
                    textAlign: 'center'
                }}>
                    <div style={{fontSize: '0.85rem', opacity: 0.9, marginBottom: '2px', fontWeight:'600'}}>
                        POTENCIAL MENSAL ESTIMADO*
                    </div>
                    <div style={{fontSize: '1.6rem', fontWeight: '800', letterSpacing: '0.5px'}}>
                        R$ {valorMensalMin.toFixed(0)} - R$ {valorMensalMax.toFixed(0)}
                    </div>
                    <div style={{fontSize: '0.75rem', opacity: 0.8, marginTop: '5px', fontStyle: 'italic'}}>
                        *Baseado em 22 a 25 dias de meta batida
                    </div>
                </div>

            </div>
        </section>
    );
}