import React from 'react';

export default function DashCicloResumo({ blocos, aoClicarDetalhes }) {
    
    // DATA DE CORTE: 14/12/2025
    const dataCorte = new Date('2025-12-14T00:00:00');

    // MUDANÇA: Não filtramos mais. Usamos todos para manter o layout da grid.
    const blocosParaExibir = blocos; 

    if (!blocosParaExibir || blocosParaExibir.length === 0) return null;

    const hoje = new Date();
    // Datas de início e fim baseadas no ciclo completo (primeiro e último bloco)
    const inicioCiclo = new Date(blocosParaExibir[0].inicio);
    const fimCiclo = new Date(blocosParaExibir[blocosParaExibir.length - 1].fim);
    
    // Formata DD/MM
    const fmtData = (dataISO) => {
        if (!dataISO) return '';
        const d = new Date(dataISO);
        return `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth()+1).toString().padStart(2, '0')}`;
    };

    return (
        <div className="ds-card" style={{ marginTop: '20px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 className="ds-card-titulo" style={{ fontSize: '1.1rem', margin: 0, border: 'none', padding: 0 }}>
                    Progresso do Ciclo (Semanas)
                </h3>
                <button className="ds-btn ds-btn-pequeno ds-btn-outline-primario" onClick={aoClicarDetalhes}>
                    <i className="fas fa-list"></i> Detalhes
                </button>
            </div>

            {/* A Linha do Tempo (Grid de Blocos) */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${blocosParaExibir.length}, 1fr)`, gap: '4px', marginBottom: '15px' }}>
                {blocosParaExibir.map((bloco, idx) => {
                    const fimBlocoDate = new Date(bloco.fim);
                    const isPassado = hoje > fimBlocoDate;
                    const isAtual = hoje >= new Date(bloco.inicio) && hoje <= fimBlocoDate;
                    
                    // LÓGICA DO CORTE: Se a semana terminou antes do dia 14/12, é "Legado/Inativo"
                    const isLegado = fimBlocoDate < dataCorte;

                    let bgCor = '#f1f3f5'; // Futuro (Cinza claro)
                    let textoValor = '-';
                    let opacidade = 1;
                    
                    if (isLegado) {
                        // Estilo para semanas antes do corte (Visualmente "desativadas")
                        bgCor = '#e9ecef'; // Cinza 
                        textoValor = '---'; 
                        opacidade = 0.4; // Deixa bem apagadinho
                    } else if (isPassado) {
                        if (bloco.ganho > 0) {
                            bgCor = 'var(--ds-cor-sucesso)'; // Ganhou
                            textoValor = `R$ ${bloco.ganho.toFixed(0)}`;
                        } else {
                            bgCor = '#ced4da'; // Passou zerado
                            textoValor = 'R$ 0';
                        }
                    } else if (isAtual) {
                        bgCor = 'var(--ds-cor-primaria)'; // Atual
                        textoValor = 'Atual';
                    }

                    return (
                        <div key={idx} style={{textAlign: 'center', opacity: opacidade}}>
                            {/* A Barra Visual */}
                            <div style={{ 
                                height: '25px', 
                                backgroundColor: bgCor, 
                                borderRadius: '4px',
                                marginBottom: '5px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: '0.7rem',
                                fontWeight: 'bold'
                            }}>
                                {/* Ícones apenas se não for legado */}
                                {!isLegado && isPassado && bloco.ganho > 0 && <i className="fas fa-check"></i>}
                                {!isLegado && isAtual && <i className="fas fa-spinner fa-pulse"></i>}
                                {isLegado && <span style={{color:'#999', fontSize:'0.6rem'}}>N/A</span>}
                            </div>
                            
                            {/* O Texto Abaixo */}
                            <span style={{fontSize: '0.7rem', color: '#666', display: 'block'}}>
                                Sem {bloco.numero}
                            </span>
                            <strong style={{fontSize: '0.75rem', color: !isLegado && isPassado && bloco.ganho > 0 ? 'var(--ds-cor-sucesso)' : '#333'}}>
                                {textoValor}
                            </strong>
                        </div>
                    );
                })}
            </div>

            {/* Legenda (Opcional, pode manter ou simplificar) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.75rem', color: '#999', borderTop:'1px dashed #eee', paddingTop:'5px' }}>
                <span>Início: {fmtData(inicioCiclo)}</span>
                <span>Fim: {fmtData(fimCiclo)}</span>
            </div>
        </div>
    );
}