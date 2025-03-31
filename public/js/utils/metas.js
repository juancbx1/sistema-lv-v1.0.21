// js/utils/metas.js
import { obterProdutos } from '/js/utils/storage.js';

// Definição das metas por nível
const metasPorNivel = {
    1: [
        { processos: 2175, valor: 40 },
        { processos: 2375, valor: 50 },
        { processos: 2575, valor: 70 },
        { processos: 3075, valor: 110 }
    ],
    2: [
        { processos: 2050, valor: 50 },
        { processos: 2200, valor: 70 },
        { processos: 2400, valor: 90 },
        { processos: 2925, valor: 130 }
    ],
    3: [
        { processos: 2300, valor: 115 },
        { processos: 2200, valor: 95 },
        { processos: 2100, valor: 75 },
        { processos: 1900, valor: 45 }
    ],
    4: [
        { processos: 2200, valor: 130 },
        { processos: 2100, valor: 150 },
        { processos: 1900, valor: 110 },
        { processos: 1600, valor: 90 }
    ]
};

export function obterMetasPorNivel(nivel) {
    return metasPorNivel[nivel] || metasPorNivel[1];
}

// Nova função para converter metas em pontos
export function obterMetasPorNivelEmPontos(nivel) {
    const metasProcessos = obterMetasPorNivel(nivel);
    const produtos = obterProdutos();
    
    // Calcula a média de pontos por processo com base nos produtos cadastrados
    let totalPontos = 0;
    let totalProcessos = 0;
    produtos.forEach(produto => {
        produto.processos.forEach((_, index) => {
            totalPontos += produto.pontos?.[index] || 1;
            totalProcessos += 1;
        });
    });
    const mediaPontosPorProcesso = totalProcessos > 0 ? totalPontos / totalProcessos : 1;

    // Converte metas de processos para pontos
    return metasProcessos.map(meta => ({
        pontos: Math.round(meta.processos * mediaPontosPorProcesso), // Converte para pontos
        valor: meta.valor,
        processos: meta.processos // Mantém processos originais para referência
    }));
}


// Função para calcular a comissão semanal (mantida em processos para relatórios)
export function calcularComissaoSemanal(totalProcessos, nivel, producoes = []) {
    const metas = obterMetasPorNivel(nivel);
    const produtos = obterProdutos();

    let totalPontosPonderados = 0;
    producoes.forEach(p => {
        const produto = produtos.find(prod => prod.nome === p.produto);
        if (produto) {
            const processoIndex = produto.processos.indexOf(p.processo);
            const pontos = produto.pontos?.[processoIndex] || 1;
            totalPontosPonderados += p.quantidade * pontos;
        }
    });

    const processosAjustados = totalPontosPonderados || totalProcessos;

    const metasBatidas = metas.filter(m => processosAjustados >= m.processos);
    if (metasBatidas.length > 0) {
        return metasBatidas[metasBatidas.length - 1].valor;
    } else {
        const primeiraMeta = metas[0];
        return { faltam: Math.ceil(primeiraMeta.processos - processosAjustados) };
    }
}