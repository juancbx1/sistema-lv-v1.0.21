// Definição das metas por nível
const metasPorNivel = {
    1: [
        { pontos_meta: 2175, valor: 40 },
        { pontos_meta: 2375, valor: 50 },
        { pontos_meta: 2575, valor: 70 },
        { pontos_meta: 3075, valor: 110 }
    ],
    2: [
        { pontos_meta: 2050, valor: 50 },
        { pontos_meta: 2200, valor: 70 },
        { pontos_meta: 2400, valor: 90 },
        { pontos_meta: 2925, valor: 130 }
    ],
    3: [
        { pontos_meta: 1900, valor: 45 },
        { pontos_meta: 2100, valor: 75 },
        { pontos_meta: 2200, valor: 95 },
        { pontos_meta: 2300, valor: 115 },
        
    ],
    4: [
        { pontos_meta: 1600, valor: 90 },
        { pontos_meta: 1900, valor: 110 },
        { pontos_meta: 2200, valor: 130 },
        { pontos_meta: 2300, valor: 150 },
        
        
    ]
};

export function obterMetasPorNivel(nivel) {
    return metasPorNivel[nivel] || metasPorNivel[1];
}

export function calcularComissaoSemanal(totalPontosCiclo, nivel /*, producoesDaSemana, produtosLista - removidos se não forem mais necessários aqui */) {
    // Obter as metas do nível, que agora têm 'pontos_meta'
    const metasDoNivel = obterMetasPorNivel(nivel);

    if (!metasDoNivel || metasDoNivel.length === 0) {
        console.warn(`[calcularComissaoSemanal] Nenhuma meta definida para o nível ${nivel}.`);
        return { faltam: "N/A (sem metas para o nível)" }; // Ou 0 se preferir
    }

    // Filtrar as metas que foram atingidas pelo total de pontos do ciclo
    const metasBatidas = metasDoNivel.filter(m => totalPontosCiclo >= m.pontos_meta);

    if (metasBatidas.length > 0) {
        // Se múltiplas metas foram batidas, geralmente a comissão é da meta de maior valor (ou maior pontos_meta).
        // Sua lógica original para níveis 3 e 4 tinha valores de comissão que não aumentavam linearmente com os pontos.
        // Vamos assumir que você quer a comissão da meta com o MAIOR NÚMERO DE PONTOS que foi batida,
        // e se houver empate em pontos, a de maior valor. Ou simplesmente a de maior valor.
        // Para simplificar e ser mais comum: pegar a meta batida com o maior valor de comissão.
        metasBatidas.sort((a, b) => b.valor - a.valor); // Ordena por maior valor de comissão
        return metasBatidas[0].valor; // Retorna o maior valor de comissão das metas batidas
    } else {
        // Se nenhuma meta foi batida, calcular quantos pontos faltam para a primeira meta (a de menor pontuação)
        // É importante que as metas em 'metasPorNivel' estejam ordenadas por 'pontos_meta' ascendente para isso.
        const metasOrdenadasPorPontos = [...metasDoNivel].sort((a, b) => a.pontos_meta - b.pontos_meta);
        const primeiraMeta = metasOrdenadasPorPontos[0];

        if (primeiraMeta) {
            const pontosFaltantes = primeiraMeta.pontos_meta - totalPontosCiclo;
            return { faltam: Math.ceil(pontosFaltantes) }; // Arredonda para cima
        }
        // Caso não haja nem a primeira meta (improvável se metasDoNivel não for vazio)
        return { faltam: "N/A (sem metas definidas)" };
    }
}