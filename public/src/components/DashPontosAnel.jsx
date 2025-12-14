import React from 'react';

export default function DashPontosAnel({ dadosHoje, metaDinamica }) {
    const pontosFeitos = Math.round(dadosHoje.pontos || 0);
    
    const metaAlvo = metaDinamica ? metaDinamica.pontos_meta : (dadosHoje.proximaMeta ? dadosHoje.proximaMeta.pontos_meta : 1);
    const nomeMeta = metaDinamica ? metaDinamica.descricao_meta : (dadosHoje.proximaMeta ? dadosHoje.proximaMeta.descricao_meta : '');
    const valorComissao = metaDinamica ? parseFloat(metaDinamica.valor_comissao) : 0;

    const raio = 74;
    const circunferencia = 2 * Math.PI * raio; // ~465px
    
    // Cálculo preciso
    const percentualReal = (pontosFeitos / metaAlvo) * 100;
    
    // LÓGICA ANTI-ILUSÃO DE ÓTICA PARA MOBILE:
    // Se a meta NÃO foi batida (pontos < alvo), mas o percentual é muito alto (ex: 99%),
    // forçamos visualmente para 95% para garantir que o "buraco" apareça na tela pequena.
    let percentualVisual = percentualReal;
    
    if (pontosFeitos < metaAlvo && percentualReal > 95) {
        percentualVisual = 95; // Força um espaço de 5%
    }
    
    // Trava em 100%
    percentualVisual = Math.min(percentualVisual, 100);

    const offset = circunferencia - (percentualVisual / 100) * circunferencia;

    let corStroke;
    if (pontosFeitos >= metaAlvo) {
        corStroke = '#28a745'; // VERDE
    } else {
        corStroke = '#ffc107'; // AMARELO
    }

    let feedbackTexto = '';
    let feedbackClasse = '';

    if (pontosFeitos >= metaAlvo) {
        feedbackTexto = <span><i className="fas fa-check-circle"></i> Meta <strong>{nomeMeta}</strong> Batida!</span>;
        feedbackClasse = 'status-sucesso-dia';
    } else {
        const falta = metaAlvo - pontosFeitos;
        feedbackTexto = <span>Faltam <strong>{falta} pts</strong> para concluir o dia!</span>;
        feedbackClasse = 'status-foco';
    }

    return (
        <div className="ds-foco-diario">
            <div className="ds-progress-ring-container">
                <svg className="ds-progress-ring" width="160" height="160" style={{transform: 'rotate(-90deg)'}}>
                    <circle 
                        className="ds-progress-ring-bg" 
                        strokeWidth="12" 
                        stroke="#e9ecef"
                        fill="transparent"
                        r={raio} cx="80" cy="80" 
                    />
                    
                    <circle 
                        className="ds-progress-ring-fg" 
                        strokeWidth="12" 
                        fill="transparent"
                        r={raio} cx="80" cy="80" 
                        style={{ 
                            strokeDasharray: `${circunferencia} ${circunferencia}`,
                            strokeDashoffset: offset,
                            stroke: corStroke,
                            transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.3s ease'
                        }}
                    />
                </svg>
                <div className="ds-progress-ring-texto">
                    <span className="ds-texto-grande">{pontosFeitos}</span>
                    <span className="ds-texto-pequeno">pontos hoje</span>
                </div>
            </div>
            
            <div className={`ds-feedback-diario-pilula ${feedbackClasse} visivel`} style={{marginTop: '20px'}}>
                {feedbackTexto}
            </div>
        </div>
    );
}