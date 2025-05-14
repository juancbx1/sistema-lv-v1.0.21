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
    return metasPorNivel[nivel] || metasPorNivel[1]; // Retorna nível 1 como padrão
}

export function obterMetasPorNivelEmPontos(nivel, produtosLista) {
    const metasProcessos = obterMetasPorNivel(nivel);

    if (!Array.isArray(produtosLista) || produtosLista.length === 0) {
        console.warn("[obterMetasPorNivelEmPontos] Lista de produtos inválida ou vazia. Retornando metas sem conversão para pontos.");
        return metasProcessos.map(meta => ({
            pontos: meta.processos, // Fallback: usa processos como pontos se não puder calcular média
            valor: meta.valor,
            processos: meta.processos
        }));
    }

    let totalPontosProdutos = 0;
    let totalProcessosProdutos = 0;
    produtosLista.forEach(produto => {
        const processosDoProduto = Array.isArray(produto.processos) ? produto.processos : [];
        const pontosDoProduto = Array.isArray(produto.pontos) ? produto.pontos : [];

        processosDoProduto.forEach((_, index) => {
            totalPontosProdutos += pontosDoProduto[index] || 1; // Usa o ponto correspondente ou 1 como default
            totalProcessosProdutos += 1;
        });
    });
    const mediaPontosPorProcesso = totalProcessosProdutos > 0 ? totalPontosProdutos / totalProcessosProdutos : 1;

    return metasProcessos.map(meta => ({
        pontos: Math.round(meta.processos * mediaPontosPorProcesso), // Converte para pontos
        valor: meta.valor,
        processos: meta.processos // Mantém processos originais para referência
    }));
}

export function calcularComissaoSemanal(totalPontosCiclo, nivel, producoesDaSemana = [], produtosLista) {
    if (!Array.isArray(produtosLista)) {
        console.error("[calcularComissaoSemanal] Lista de produtos (produtosLista) não é um array válido.");
        const metasFallback = obterMetasPorNivel(nivel);
        return { faltam: Math.ceil((metasFallback[0]?.processos || totalPontosCiclo + 1) - totalPontosCiclo) };
    }

    const valorParaCompararComMetas = totalPontosCiclo;
    const metasEmPontos = obterMetasPorNivelEmPontos(nivel, produtosLista);

    const metasBatidas = metasEmPontos.filter(m => valorParaCompararComMetas >= m.pontos);

    if (metasBatidas.length > 0) {
        metasBatidas.sort((a, b) => a.pontos - b.pontos);
        return metasBatidas[metasBatidas.length - 1].valor;
    } else {
        const primeiraMeta = metasEmPontos[0];
        if (primeiraMeta) {
            return { faltam: Math.ceil(primeiraMeta.pontos - valorParaCompararComMetas) };
        }
        return { faltam: "N/A (sem metas definidas)" };
    }
}