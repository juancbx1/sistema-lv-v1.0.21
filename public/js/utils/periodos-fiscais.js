// public/js/utils/periodos-fiscais.js

export function getPeriodoFiscalAtual(dataRef = new Date()) {
    const data = new Date(dataRef);
    const dia = data.getDate();
    const mes = data.getMonth();
    const ano = data.getFullYear();

    let dataInicio, dataFim, nomeMes;

    if (dia >= 21) {
        dataInicio = new Date(ano, mes, 21);
        dataFim = new Date(ano, mes + 1, 20);
        const proximoMes = new Date(ano, mes + 1, 1);
        nomeMes = proximoMes.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    } else {
        dataInicio = new Date(ano, mes - 1, 21);
        dataFim = new Date(ano, mes, 20);
        const mesAtual = new Date(ano, mes, 1);
        nomeMes = mesAtual.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    }

    dataInicio.setHours(0, 0, 0, 0);
    dataFim.setHours(23, 59, 59, 999);

    return { inicio: dataInicio, fim: dataFim, nomeCompetencia: nomeMes };
}

export function contarDiasUteis(inicio, fim) {
    // Converte qualquer input (string 'YYYY-MM-DD' ou Date) para noon local.
    // Strings date-only são interpretadas como UTC midnight pelo JS, o que em
    // fusos UTC-3 (Brasil) coloca o cursor no dia anterior — daí o T12:00:00 local.
    const toLocalNoon = (d) => {
        const s = (typeof d === 'string') ? d.slice(0, 10) : d.toISOString().slice(0, 10);
        return new Date(s + 'T12:00:00');
    };

    let count = 0;
    let cursor = toLocalNoon(inicio);
    const fimDate = toLocalNoon(fim);

    while (cursor <= fimDate) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) count++;
        cursor.setDate(cursor.getDate() + 1);
    }
    return count;
}

export function getDataPagamentoEstimada(fimDoCiclo) {
    const d = new Date(fimDoCiclo);
    d.setMonth(d.getMonth() + 1);
    d.setDate(15);
    return d.toLocaleDateString('pt-BR');
}

/**
 * Gera blocos semanais garantindo que não haja sobreposição de dias.
 * DEBUG ATIVADO: Verifique o terminal do servidor.
 */
export function gerarBlocosSemanais(inicioPeriodo, fimPeriodo) {
    const blocos = [];
    
    // Clona as datas para garantir que não alteramos as referências originais
    // E definimos para MEIO-DIA (12:00) para evitar problemas de fuso horário mudando o dia
    let cursor = new Date(inicioPeriodo);
    cursor.setHours(12, 0, 0, 0); 
    
    const fimAbsoluto = new Date(fimPeriodo);
    fimAbsoluto.setHours(12, 0, 0, 0);

    let contadorSemana = 1;

    while (cursor <= fimAbsoluto) {
        // Data INICIAL deste bloco
        let inicioBloco = new Date(cursor);
        inicioBloco.setHours(0, 0, 0, 0); // Começa no início do dia

        // Calcula o próximo sábado
        // cursor.getDay(): 0 (Dom) ... 6 (Sab)
        const diasAteSabado = 6 - cursor.getDay(); 
        
        let fimBlocoTemp = new Date(cursor);
        fimBlocoTemp.setDate(cursor.getDate() + diasAteSabado);
        fimBlocoTemp.setHours(12, 0, 0, 0); // Mantém meio-dia para comparação

        // Se o sábado passa do dia 20, cortamos no dia 20
        if (fimBlocoTemp > fimAbsoluto) {
            fimBlocoTemp = new Date(fimAbsoluto);
        }

        // Data FINAL deste bloco (ajustada para fim do dia para queries)
        let fimBlocoFinal = new Date(fimBlocoTemp);
        fimBlocoFinal.setHours(23, 59, 59, 999);
        blocos.push({
            numero: contadorSemana++,
            inicio: inicioBloco,
            fim: fimBlocoFinal,
            label: `Semana ${contadorSemana - 1}`
        });

        // *** A CORREÇÃO DE DUPLICIDADE ***
        // O próximo cursor deve ser: (Data do Fim do Bloco) + 1 Dia
        cursor = new Date(fimBlocoTemp); // Pega a data base (meio-dia)
        cursor.setDate(cursor.getDate() + 1); // Soma 1 dia
        // O cursor já fica com horas 12:00, pronto para o próximo loop
        
        // Break de segurança
        if (contadorSemana > 10) break;
    }
    return blocos;
}