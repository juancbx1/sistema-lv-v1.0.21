import React, { useMemo } from 'react';

function calcDistribuicao(grupo, todasMetas) {
    let bronze = 0, prata = 0, ouro = 0, correndo = 0;
    for (const f of grupo) {
        const tipo  = (Array.isArray(f.tipos) ? f.tipos[0] : 'costureira').toLowerCase();
        const nivel = f.nivel;
        const metas = todasMetas?.[tipo]?.[nivel] || [];
        const pts   = f.pontos_hoje || 0;
        if      (pts >= (metas[2] || Infinity)) ouro++;
        else if (pts >= (metas[1] || Infinity)) prata++;
        else if (pts >= (metas[0] || Infinity)) bronze++;
        else                                    correndo++;
    }
    return { bronze, prata, ouro, correndo };
}

function calcVariacaoGrupo(grupo) {
    const comOntem = grupo.filter(f => f.pontos_ontem > 0);
    if (!comOntem.length) return null;
    const somaHoje  = comOntem.reduce((s, f) => s + (f.pontos_hoje || 0), 0);
    const somaOntem = comOntem.reduce((s, f) => s + f.pontos_ontem, 0);
    return ((somaHoje - somaOntem) / somaOntem) * 100;
}

function Painel({ grupo, titulo, cor, filtroPeriodo, todasMetas }) {
    if (!grupo.length) return null;

    const lider = grupo[0];
    const bateuMeta = grupo.filter(f => (f.pct_meta || 0) >= 100).length;
    const dist = calcDistribuicao(grupo, todasMetas);
    const variacaoGrupo = filtroPeriodo === 'dia_inteiro' ? calcVariacaoGrupo(grupo) : null;

    return (
        <div className="pg-destaque-painel" style={{ borderTop: `3px solid ${cor}` }}>
            <div className="pg-destaque-painel-titulo" style={{ color: cor }}>
                {titulo}
            </div>

            <div className="pg-destaque-painel-item">
                <i className="fas fa-star" style={{ color: cor }}></i>
                <span>Líder: <strong>{lider.nome}</strong> — {(lider.pontos_hoje || 0).toFixed(0)} pts</span>
            </div>

            {bateuMeta > 0 && (
                <div className="pg-destaque-painel-item">
                    <i className="fas fa-trophy" style={{ color: '#f39c12' }}></i>
                    <span>{bateuMeta === 1 ? `${grupo.find(f => (f.pct_meta || 0) >= 100)?.nome} bateu a meta!` : `${bateuMeta} bateram a meta`}</span>
                </div>
            )}

            {(dist.ouro > 0 || dist.prata > 0 || dist.bronze > 0) && (
                <div className="pg-destaque-painel-dist">
                    {dist.ouro   > 0 && <span>🥇 {dist.ouro}</span>}
                    {dist.prata  > 0 && <span>🥈 {dist.prata}</span>}
                    {dist.bronze > 0 && <span>🥉 {dist.bronze}</span>}
                    {dist.correndo > 0 && <span>⚡ {dist.correndo}</span>}
                </div>
            )}

            {variacaoGrupo !== null && (
                <div className={`pg-destaque-painel-var ${variacaoGrupo >= 0 ? 'pos' : 'neg'}`}>
                    <i className={`fas ${variacaoGrupo >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`}></i>
                    {variacaoGrupo >= 0 ? '+' : ''}{variacaoGrupo.toFixed(0)}% vs ontem
                </div>
            )}
        </div>
    );
}

function PGDestaques({ funcionarios, filtroPeriodo, todasMetas }) {
    const { costureiras, tiktiks } = useMemo(() => {
        const c = funcionarios.filter(f => {
            const t = Array.isArray(f.tipos) ? f.tipos : [];
            return t.includes('costureira') && !t.includes('tiktik');
        });
        const t = funcionarios.filter(f => {
            const tipos = Array.isArray(f.tipos) ? f.tipos : [];
            return tipos.includes('tiktik');
        });
        return { costureiras: c, tiktiks: t };
    }, [funcionarios]);

    // Alerta de ritmo (equipe toda, só dia inteiro, horário comercial)
    const alertaRitmo = useMemo(() => {
        if (filtroPeriodo !== 'dia_inteiro' || !funcionarios.length) return null;
        const hora = new Date().getHours();
        if (hora < 10 || hora >= 17) return null;
        const mediaEquipe = funcionarios.reduce((s, f) => s + (f.pct_meta || 0), 0) / funcionarios.length;
        const horasPassadas = Math.max(hora - 7, 1);
        const ritmoPct = (horasPassadas / 8) * 100;
        if (mediaEquipe >= ritmoPct * 0.7) return null;
        return { hora, mediaEquipe };
    }, [funcionarios, filtroPeriodo]);

    if (!costureiras.length && !tiktiks.length) return null;

    return (
        <div className="gs-card pg-destaques">
            <h3 className="pg-destaques-titulo">
                <i className="fas fa-bolt"></i> Destaques
            </h3>

            <div className="pg-destaques-paineis">
                {costureiras.length > 0 && (
                    <Painel
                        grupo={costureiras}
                        titulo="🔵 Costura"
                        cor="#3b82f6"
                        filtroPeriodo={filtroPeriodo}
                        todasMetas={todasMetas}
                    />
                )}
                {tiktiks.length > 0 && (
                    <Painel
                        grupo={tiktiks}
                        titulo="🟡 Tiktik"
                        cor="#f59e0b"
                        filtroPeriodo={filtroPeriodo}
                        todasMetas={todasMetas}
                    />
                )}
            </div>

            {alertaRitmo && (
                <div className="pg-destaque-item pg-destaque-item--alerta">
                    <div className="pg-destaque-borda" style={{ backgroundColor: '#e74c3c' }}></div>
                    <i className="fas fa-exclamation-triangle pg-destaque-icone" style={{ color: '#e74c3c' }}></i>
                    <span className="pg-destaque-texto">
                        Equipe com {alertaRitmo.mediaEquipe.toFixed(0)}% da meta — ritmo abaixo do esperado para {alertaRitmo.hora}h
                    </span>
                </div>
            )}
        </div>
    );
}

export default PGDestaques;
