import React, { useState, useEffect } from 'react';

export default function DashFocoHoje({ dadosHoje, metasPossiveis, metaInicial, aoMudarMeta }) {
    const [metaSelecionada, setMetaSelecionada] = useState(metaInicial);

    useEffect(() => {
        if (metaInicial) setMetaSelecionada(metaInicial);
    }, [metaInicial]);

    if (!metasPossiveis || metasPossiveis.length === 0) return null;

    const handleSelecionarMeta = (meta) => {
        setMetaSelecionada(meta);
        localStorage.setItem('meta_diaria_planejada', meta.pontos_meta.toString());
        if (aoMudarMeta) aoMudarMeta(meta);
    };

    const pontosFeitos = Math.round(dadosHoje?.pontos || 0);
    const metaAlvo = metaSelecionada?.pontos_meta || 1;
    const valorComissao = parseFloat(metaSelecionada?.valor_comissao || 0);
    const progresso = Math.min((pontosFeitos / metaAlvo) * 100, 100);
    const falta = Math.max(0, metaAlvo - pontosFeitos);
    const valorMensalMin = (valorComissao * 22).toFixed(0);
    const valorMensalMax = (valorComissao * 25).toFixed(0);

    const hoje = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long',
        timeZone: 'America/Sao_Paulo'
    });

    // Cor da barra
    let corBarra;
    if (progresso >= 100) corBarra = 'var(--ds-cor-sucesso)';
    else if (progresso >= 50) corBarra = 'var(--ds-cor-primaria)';
    else corBarra = 'var(--ds-cor-aviso)';

    // Badge: sempre baseado na hierarquia real das metas, não na meta selecionada
    const bronzePontos = metasPossiveis[0]?.pontos_meta || 0;
    const prataPontos  = metasPossiveis[1]?.pontos_meta || bronzePontos;
    const ouroPontos   = metasPossiveis[metasPossiveis.length - 1]?.pontos_meta || prataPontos;

    let badgeTexto, badgeClasse;
    if (pontosFeitos === 0) {
        badgeTexto = `Bom dia! Meta de hoje: ${metaAlvo} pts`;
        badgeClasse = 'sem-inicio';
    } else if (pontosFeitos >= ouroPontos) {
        badgeTexto = '⭐ Meta Ouro batida! Você arrasou hoje!';
        badgeClasse = 'ouro';
    } else if (pontosFeitos >= prataPontos) {
        const faltaOuro = ouroPontos - pontosFeitos;
        badgeTexto = `✅ Prata batida! Faltam ${faltaOuro} pts para o Ouro`;
        badgeClasse = 'prata';
    } else if (pontosFeitos >= bronzePontos) {
        const faltaPrata = prataPontos - pontosFeitos;
        badgeTexto = `✅ Bronze batida! Faltam ${faltaPrata} pts para a Prata`;
        badgeClasse = 'bronze';
    } else {
        badgeTexto = `Faltam ${falta} pts para a Meta Bronze`;
        badgeClasse = 'em-progresso';
    }

    // Cores dos chips por posição
    const coresMeta = [
        'var(--ds-cor-meta-bronze)',
        'var(--ds-cor-meta-prata)',
        'var(--ds-cor-meta-ouro)'
    ];

    return (
        <div className="ds-card ds-foco-hoje-card">
            <div className="ds-foco-hoje-data">{hoje}</div>

            {/* Pontos em destaque */}
            <div className="ds-foco-hoje-pts">{pontosFeitos.toLocaleString('pt-BR')}</div>
            <div className="ds-foco-hoje-pts-label">pontos hoje</div>

            {/* Barra de progresso */}
            <div className="ds-foco-barra-container">
                <div
                    className="ds-foco-barra-fill"
                    style={{ width: `${progresso}%`, background: corBarra }}
                />
            </div>
            <div className="ds-foco-barra-legenda">
                <span>{pontosFeitos.toLocaleString('pt-BR')} pts</span>
                <span>{progresso.toFixed(0)}%</span>
                <span>{metaAlvo.toLocaleString('pt-BR')} pts</span>
            </div>

            {/* Badge de status */}
            <div className={`ds-foco-status-badge ${badgeClasse}`}>
                {badgeTexto}
            </div>

            {/* Chips de seleção de meta */}
            <div style={{ fontSize: '0.78rem', color: '#999', marginBottom: '8px', fontWeight: '600' }}>
                Escolha sua meta:
            </div>
            <div className="ds-foco-meta-chips">
                {metasPossiveis.map((meta, i) => {
                    const isAtiva = metaSelecionada?.pontos_meta === meta.pontos_meta;
                    const cor = coresMeta[i] || 'var(--ds-cor-primaria)';
                    const nomeSimples = meta.descricao_meta.replace('Meta ', '');
                    return (
                        <button
                            key={i}
                            onClick={() => handleSelecionarMeta(meta)}
                            style={{
                                flex: 1,
                                minHeight: '48px',
                                border: `2px solid ${isAtiva ? cor : '#dee2e6'}`,
                                borderRadius: '10px',
                                background: isAtiva ? cor : '#fff',
                                color: isAtiva ? '#fff' : '#666',
                                fontWeight: isAtiva ? '700' : '500',
                                fontSize: '0.88rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {nomeSimples}
                        </button>
                    );
                })}
            </div>

            {/* Potencial mensal */}
            <div className="ds-foco-meta-info">
                <span>Se bater: <strong style={{ color: 'var(--ds-cor-sucesso)' }}>R$ {valorComissao.toFixed(2)} hoje</strong></span>
                <span>Potencial: <strong>R$ {valorMensalMin} – R$ {valorMensalMax}/mês</strong></span>
            </div>
        </div>
    );
}
