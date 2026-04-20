import React, { useState, useMemo } from 'react';
import { contarDiasUteis } from '/js/utils/periodos-fiscais.js';

const fmtReal = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function useNudgeOuro(inicioCiclo) {
    const chave = `nudge_ouro_${inicioCiclo}`;

    const deveMostrar = (nivelAtual, diasRestantes, diasTrabalhados) => {
        if (nivelAtual === 'ouro') return false;
        if (diasTrabalhados < 3) return false;
        if (diasRestantes <= 2) return false;

        const historico = JSON.parse(localStorage.getItem(chave) || '[]');
        if (historico.length >= 3) return false;

        if (historico.length > 0) {
            const ultimoNudge = new Date(historico[historico.length - 1]);
            const diasDesde = (Date.now() - ultimoNudge) / (1000 * 60 * 60 * 24);
            if (diasDesde < 5) return false;
        }
        return true;
    };

    const registrar = () => {
        const historico = JSON.parse(localStorage.getItem(chave) || '[]');
        historico.push(new Date().toISOString());
        localStorage.setItem(chave, JSON.stringify(historico));
    };

    return { deveMostrar, registrar, dispensar: registrar };
}

export default function DashProjecaoCiclo({
    valorAcumulado,
    diasUteisNoCiclo,
    diasTrabalhadosNoCiclo,
    diasDetalhes,
    metasPossiveis,
    aoMudarMeta,
    inicioCiclo,
    fimCiclo,
}) {
    const [nudgeDismissido, setNudgeDismissido] = useState(false);
    const nudge = useNudgeOuro(inicioCiclo);

    const bronzePontos = parseFloat(metasPossiveis[0]?.pontos_meta || 0);
    const prataPontos  = parseFloat(metasPossiveis[1]?.pontos_meta || 0);
    const ouroPontos   = parseFloat(metasPossiveis[metasPossiveis.length - 1]?.pontos_meta || 0);
    const valorBronze  = parseFloat(metasPossiveis[0]?.valor_comissao || 0);
    const valorPrata   = parseFloat(metasPossiveis[1]?.valor_comissao || 0);
    const valorOuro    = parseFloat(metasPossiveis[metasPossiveis.length - 1]?.valor_comissao || 0);

    const nivelAtual = useMemo(() => {
        if (!diasDetalhes || diasTrabalhadosNoCiclo === 0) return 'inconsistente';

        const ultimos5 = [...diasDetalhes]
            .filter(d => d.pontos > 0)
            .sort((a, b) => b.data.localeCompare(a.data))
            .slice(0, 5);

        const freq = ultimos5.reduce((acc, d) => {
            const pts = d.pontos;
            const n = pts >= ouroPontos ? 'ouro' : pts >= prataPontos ? 'prata' : pts >= bronzePontos ? 'bronze' : 'abaixo';
            acc[n] = (acc[n] || 0) + 1;
            return acc;
        }, {});

        return (freq.ouro   || 0) >= 3 ? 'ouro'          :
               (freq.prata  || 0) >= 3 ? 'prata'         :
               (freq.bronze || 0) >= 3 ? 'bronze'        : 'inconsistente';
    }, [diasDetalhes, diasTrabalhadosNoCiclo, ouroPontos, prataPontos, bronzePontos]);

    // Dias úteis de hoje (inclusive, fuso SP) até o último dia do ciclo
    const diasRestantes = useMemo(() => {
        if (!fimCiclo) return Math.max(0, diasUteisNoCiclo - diasTrabalhadosNoCiclo);
        const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        return Math.max(0, contarDiasUteis(hojeStr, fimCiclo));
    }, [fimCiclo, diasUteisNoCiclo, diasTrabalhadosNoCiclo]);

    const projecaoAspiracional =
        nivelAtual === 'ouro'  ? valorAcumulado + (valorOuro  * diasRestantes) :
        nivelAtual === 'prata' ? valorAcumulado + (valorOuro  * diasRestantes) :
                                 valorAcumulado + (valorPrata * diasRestantes);

    const projecaoOuro = valorAcumulado + (valorOuro * diasRestantes);

    const estado =
        diasTrabalhadosNoCiclo === 0 ? 'ciclo-novo' :
        diasRestantes <= 3           ? 'fim-ciclo'  :
        nivelAtual;

    const nudgeConfig = {
        bronze: {
            titulo: 'Subindo para Prata, você ganha mais:',
            delta: (valorPrata - valorBronze) * diasRestantes,
            ctaTexto: 'Tentar Prata!',
            metaAlvo: metasPossiveis[1],
        },
        prata: {
            titulo: 'Falta pouco para o Ouro!',
            delta: (valorOuro - valorPrata) * diasRestantes,
            ctaTexto: 'Tentar Ouro hoje!',
            metaAlvo: metasPossiveis[metasPossiveis.length - 1],
        },
        inconsistente: {
            titulo: 'Consistência é o segredo!',
            delta: Math.max(0, (valorPrata * diasTrabalhadosNoCiclo) - valorAcumulado),
            ctaTexto: 'Bater Prata amanhã!',
            metaAlvo: metasPossiveis[1],
        },
    };
    const nc = nudgeConfig[nivelAtual];
    const mostrandoNudge = !nudgeDismissido && !!nc && nudge.deveMostrar(nivelAtual, diasRestantes, diasTrabalhadosNoCiclo);

    const handleNudgeCTA = () => {
        nudge.registrar();
        if (nc?.metaAlvo) aoMudarMeta(nc.metaAlvo);
        setNudgeDismissido(true);
    };

    const handleNudgeOk = () => {
        nudge.dispensar();
        setNudgeDismissido(true);
    };

    const labelDias = (n) => n === 1 ? '1 dia' : `${n} dias`;

    const renderHorizonte = () => (
        <>
            <div className="ds-projecao-divisor"></div>
            <div className="ds-projecao-horizonte">
                <div>
                    <span className="ds-projecao-horizonte-valor">🥇 {fmtReal(projecaoOuro)}</span>
                    <div className="ds-projecao-horizonte-label">fecharia no Ouro todo dia</div>
                </div>
                <span className="ds-projecao-horizonte-rotulo">horizonte</span>
            </div>
        </>
    );

    const renderCorpo = () => {
        if (estado === 'ciclo-novo') {
            const potencial = valorOuro * diasUteisNoCiclo;
            return (
                <>
                    <p className="ds-projecao-mensagem">O ciclo começou! Batendo Ouro todos os {diasUteisNoCiclo} dias úteis, você fecha em:</p>
                    <div className="ds-projecao-nivel-row">
                        <span className="ds-projecao-nivel-icone">🥇</span>
                        <span className="ds-projecao-valor-medio ouro">{fmtReal(potencial)}</span>
                    </div>
                </>
            );
        }

        if (estado === 'fim-ciclo') {
            // diasRestantes=1 significa que o dia restante É hoje (contarDiasUteis inclui hoje)
            const labelFim = diasRestantes <= 1 ? 'hoje' : `nos próximos ${labelDias(diasRestantes)}`;
            const labelAlerta =
                diasRestantes <= 1 ? 'Ciclo encerrando hoje!' : `Últimos ${labelDias(diasRestantes)} do ciclo!`;
            return (
                <>
                    <div className="ds-projecao-alerta-fim">
                        <i className="fas fa-hourglass-half"></i>
                        {labelAlerta}
                    </div>
                    <p className="ds-projecao-mensagem" style={{ marginTop: '14px' }}>
                        Se bater Ouro {labelFim}, fecha o ciclo em:
                    </p>
                    <div className="ds-projecao-nivel-row">
                        <span className="ds-projecao-nivel-icone">🥇</span>
                        <span className="ds-projecao-valor-medio ouro">{fmtReal(projecaoOuro)}</span>
                    </div>
                    <p className="ds-projecao-contexto">comissão total do ciclo</p>
                </>
            );
        }

        if (estado === 'ouro') {
            return (
                <>
                    <p className="ds-projecao-mensagem">🏆 Continue assim! Mantendo Ouro nos {labelDias(diasRestantes)} restantes, fecha o ciclo em:</p>
                    <div className="ds-projecao-nivel-row">
                        <span className="ds-projecao-nivel-icone">🥇</span>
                        <span className="ds-projecao-valor-medio ouro">{fmtReal(projecaoOuro)}</span>
                    </div>
                    <p className="ds-projecao-contexto">comissão total do ciclo</p>
                    <div className="ds-projecao-manutencao">
                        Cada dia no Ouro vale {fmtReal(valorOuro)}. Não pare agora!
                    </div>
                </>
            );
        }

        if (estado === 'prata') {
            return (
                <>
                    <p className="ds-projecao-mensagem">Falta pouco para o Ouro! Subindo para Ouro nos {labelDias(diasRestantes)} restantes, fecha o ciclo em:</p>
                    <div className="ds-projecao-nivel-row">
                        <span className="ds-projecao-nivel-icone">🥇</span>
                        <span className="ds-projecao-valor-medio">{fmtReal(projecaoAspiracional)}</span>
                    </div>
                    <p className="ds-projecao-contexto">comissão total do ciclo</p>
                    {renderHorizonte()}
                </>
            );
        }

        if (estado === 'bronze') {
            return (
                <>
                    <p className="ds-projecao-mensagem">Subindo para Prata nos {labelDias(diasRestantes)} restantes, fecha o ciclo em:</p>
                    <div className="ds-projecao-nivel-row">
                        <span className="ds-projecao-nivel-icone">🥈</span>
                        <span className="ds-projecao-valor-medio">{fmtReal(projecaoAspiracional)}</span>
                    </div>
                    <p className="ds-projecao-contexto">comissão total do ciclo</p>
                    {renderHorizonte()}
                </>
            );
        }

        // inconsistente
        return (
            <>
                <p className="ds-projecao-mensagem">
                    Produzindo Prata todo dia nos {labelDias(diasRestantes)} restantes, fecha o ciclo em:
                </p>
                <div className="ds-projecao-nivel-row">
                    <span className="ds-projecao-nivel-icone">🥈</span>
                    <span className="ds-projecao-valor-medio">{fmtReal(projecaoAspiracional)}</span>
                </div>
                <p className="ds-projecao-contexto">comissão total do ciclo</p>
                {renderHorizonte()}
            </>
        );
    };

    return (
        <section className="ds-card ds-projecao-card">
            <div className="ds-projecao-acumulado-chip">
                <i className="fas fa-check-circle"></i>
                <div>
                    <span className="ds-projecao-acumulado-label">já garantido este ciclo</span>
                    <span className="ds-projecao-acumulado-valor">{fmtReal(valorAcumulado)}</span>
                </div>
            </div>

            {renderCorpo()}

            {mostrandoNudge && (
                <div className="ds-nudge-card">
                    <p className="ds-nudge-titulo">
                        <i className="fas fa-lightbulb"></i>
                        {nc.titulo}
                    </p>
                    <div className="ds-nudge-delta">
                        + {fmtReal(nc.delta)} a mais!
                    </div>
                    <div className="ds-nudge-acoes">
                        <button className="ds-nudge-btn-cta" onClick={handleNudgeCTA}>
                            🥇 {nc.ctaTexto}
                        </button>
                        <button className="ds-nudge-btn-ok" onClick={handleNudgeOk}>
                            Ok
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
