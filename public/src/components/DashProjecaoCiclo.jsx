import React, { useState, useMemo } from 'react';
import { getDataPagamentoEstimada } from '/js/utils/periodos-fiscais.js';

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
    diasRestantesNoCiclo,   // da API — considera dias_trabalho + feriados + expediente encerrado
    diaHojeJaEncerrado,     // da API — true se horario_saida_3 + 15min já passou
    aoAbrirWallet,          // abre DashPagamentosModal ao clicar em "comissão total do ciclo"
}) {
    const [nudgeDismissido, setNudgeDismissido] = useState(false);
    const nudge = useNudgeOuro(inicioCiclo);

    const bronzePontos = parseFloat(metasPossiveis[0]?.pontos_meta || 0);
    const prataPontos  = parseFloat(metasPossiveis[1]?.pontos_meta || 0);
    const ouroPontos   = parseFloat(metasPossiveis[metasPossiveis.length - 1]?.pontos_meta || 0);
    const valorBronze  = parseFloat(metasPossiveis[0]?.valor_comissao || 0);
    const valorPrata   = parseFloat(metasPossiveis[1]?.valor_comissao || 0);
    const valorOuro    = parseFloat(metasPossiveis[metasPossiveis.length - 1]?.valor_comissao || 0);

    // Dias restantes — usa o valor computado pela API (mais preciso) com fallback
    const diasRestantes = diasRestantesNoCiclo ?? Math.max(0, diasUteisNoCiclo - diasTrabalhadosNoCiclo);

    // Guard contra null/undefined (funcionária sem produção alguma no ciclo)
    const valorAcumuladoSafe = parseFloat(valorAcumulado ?? 0);

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

    // Projeção máxima: e se ela bater Ouro em todos os dias restantes?
    const projecaoOuro = valorAcumuladoSafe + (valorOuro * diasRestantes);

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
            delta: Math.max(0, (valorPrata * diasTrabalhadosNoCiclo) - valorAcumuladoSafe),
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

    // Label de contexto temporal para as mensagens ("hoje", "amanhã", "nos próximos X dias")
    const labelContexto = diasRestantes === 1
        ? (diaHojeJaEncerrado ? 'amanhã' : 'hoje')
        : `nos próximos ${labelDias(diasRestantes)}`;

    const renderCorpo = () => {
        // Ciclo encerrado — não há mais dias úteis restantes para ela
        if (diasRestantes === 0) {
            const dataPagamento = fimCiclo ? getDataPagamentoEstimada(fimCiclo) : null;
            return (
                <>
                    <div className="ds-projecao-alerta-fim ds-projecao-alerta-encerrado">
                        <i className="fas fa-check-circle"></i> Ciclo encerrado!
                    </div>
                    <p className="ds-projecao-mensagem" style={{ marginTop: '14px' }}>
                        Comissão garantida neste ciclo:
                    </p>
                    <div className="ds-projecao-nivel-row">
                        <span className="ds-projecao-nivel-icone">💰</span>
                        <span className="ds-projecao-valor-grande ouro">{fmtReal(valorAcumuladoSafe)}</span>
                    </div>
                    {dataPagamento && (
                        <p className="ds-projecao-contexto">pagamento previsto para {dataPagamento}</p>
                    )}
                </>
            );
        }

        // Início de ciclo — sem produção ainda
        if (estado === 'ciclo-novo') {
            const potencial = valorOuro * diasUteisNoCiclo;
            return (
                <>
                    <p className="ds-projecao-mensagem">O ciclo começou! Batendo a meta Ouro todos os {diasUteisNoCiclo} dias úteis, você pode fechar o ciclo em:</p>
                    <div className="ds-projecao-nivel-row">
                        <span className="ds-projecao-nivel-icone">🥇</span>
                        <span className="ds-projecao-valor-grande ouro">{fmtReal(potencial)}</span>
                    </div>
                    <p className="ds-projecao-contexto">potencial máximo do ciclo</p>
                </>
            );
        }

        // Para todos os outros estados: herói sempre é a projeção no Ouro (máximo possível)
        let mensagem;
        if (estado === 'fim-ciclo') {
            mensagem = `Se bater a meta Ouro ${labelContexto}, fecha o ciclo em:`;
        } else if (estado === 'ouro') {
            mensagem = `Mantendo a meta Ouro nos ${labelDias(diasRestantes)} restantes, fecha o ciclo em:`;
        } else if (estado === 'prata') {
            mensagem = `Subindo para a meta Ouro nos ${labelDias(diasRestantes)} restantes, fecha o ciclo em:`;
        } else {
            // bronze ou inconsistente
            mensagem = `Batendo a meta Ouro nos ${labelDias(diasRestantes)} restantes, fecha o ciclo em:`;
        }

        return (
            <>
                {estado === 'fim-ciclo' && (
                    <div className="ds-projecao-alerta-fim">
                        <i className="fas fa-hourglass-half"></i>
                        {diasRestantes === 1
                            ? (diaHojeJaEncerrado ? 'Último dia do ciclo é amanhã!' : 'Último dia do ciclo!')
                            : `Últimos ${labelDias(diasRestantes)} do ciclo!`}
                    </div>
                )}

                <p className="ds-projecao-mensagem" style={estado === 'fim-ciclo' ? { marginTop: '14px' } : undefined}>
                    {mensagem}
                </p>

                <div className="ds-projecao-nivel-row">
                    <span className="ds-projecao-nivel-icone">🥇</span>
                    <span className="ds-projecao-valor-grande ouro">{fmtReal(projecaoOuro)}</span>
                </div>

                {estado === 'ouro' && (
                    <div className="ds-projecao-manutencao">
                        Cada dia no Ouro vale {fmtReal(valorOuro)}. Não pare agora!
                    </div>
                )}

                <button
                    className="ds-projecao-contexto ds-projecao-contexto--link"
                    onClick={aoAbrirWallet}
                    type="button"
                >
                    comissão total do ciclo
                </button>
            </>
        );
    };

    return (
        <section className="ds-card ds-projecao-card">
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
