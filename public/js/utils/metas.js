// public/js/utils/metas.js

// Estrutura unificada de metas por tipo de usuário e depois por nível
const metasConfig = {
    // Metas para o tipo 'costureira'
    costureira: {
        1: [
            { pontos_meta: 2175, valor: 40, descricao: "Meta Bronze" },
            { pontos_meta: 2375, valor: 50, descricao: "Meta Prata" },
            { pontos_meta: 2575, valor: 70, descricao: "Meta Ouro" },
            { pontos_meta: 3075, valor: 110, descricao: "Meta Diamante" }
        ],
        2: [
            { pontos_meta: 2050, valor: 50, descricao: "Meta Bronze" },
            { pontos_meta: 2200, valor: 70, descricao: "Meta Prata" },
            { pontos_meta: 2400, valor: 90, descricao: "Meta Ouro" },
            { pontos_meta: 2975, valor: 130, descricao: "Meta Diamante" }
        ],
        3: [
            { pontos_meta: 1900, valor: 45, descricao: "Meta Bronze" },
            { pontos_meta: 2100, valor: 75, descricao: "Meta Prata" },
            { pontos_meta: 2200, valor: 95, descricao: "Meta Ouro" },
            { pontos_meta: 2300, valor: 115, descricao: "Meta Diamante" },
        ],
        4: [
            { pontos_meta: 1600, valor: 90, descricao: "Meta Bronze" },
            { pontos_meta: 1900, valor: 110, descricao: "Meta Prata" },
            { pontos_meta: 2200, valor: 130, descricao: "Meta Ouro" },
            { pontos_meta: 2300, valor: 150, descricao: "Meta Diamante" },
        ]
    },
    // Metas para o tipo 'tiktik' - AGORA COM NÍVEIS
    tiktik: {
        // NÍVEL 1 (Padrão, podemos ajustar os valores depois)
        1: [
            { pontos_meta: 3700, valor: 40, descricao: "Meta Bronze" },
            { pontos_meta: 3925, valor: 50, descricao: "Meta Prata" },
            { pontos_meta: 4300, valor: 70, descricao: "Meta Ouro" },
            { pontos_meta: 4900, valor: 110, descricao: "Meta Diamante" }
        ],
        // NÍVEL 2 (Exemplo, podemos adicionar mais níveis conforme necessário)
        2: [
            { pontos_meta: 4000, valor: 50, descricao: "Meta Bronze N2" },
            { pontos_meta: 4225, valor: 60, descricao: "Meta Prata N2" },
            { pontos_meta: 4600, valor: 80, descricao: "Meta Ouro N2" },
            { pontos_meta: 5200, valor: 120, descricao: "Meta Diamante N2" }
        ],
        // Adicione Nível 3, Nível 4, etc., para tiktiks se precisar
    }
};

/**
 * Obtém as metas para um determinado tipo de usuário e nível.
 * @param {string} tipoUsuario - O tipo de usuário (ex: 'costureira', 'tiktik').
 * @param {number} nivel - O nível do usuário.
 * @returns {Array} Um array com os objetos de meta ou um array vazio.
 */
export function obterMetas(tipoUsuario, nivel) {
    const metasDoTipo = metasConfig[tipoUsuario];
    if (!metasDoTipo) {
        console.warn(`[obterMetas] Tipo de usuário "${tipoUsuario}" não encontrado na configuração de metas.`);
        return []; // Retorna um array vazio se o tipo não existe
    }
    
    // Se o nível específico não existir para aquele tipo, usa o nível 1 como padrão
    const metasDoNivel = metasDoTipo[nivel] || metasDoTipo[1] || [];
    // Retorna uma cópia ordenada por pontos para garantir consistência
    return [...metasDoNivel].sort((a, b) => a.pontos_meta - b.pontos_meta);
}


/**
 * Calcula a comissão semanal com base nos pontos e no tipo/nível do usuário.
 * @param {number} totalPontosCiclo - O total de pontos que o usuário fez no ciclo/semana.
 * @param {string} tipoUsuario - O tipo de usuário ('costureira' ou 'tiktik').
 * @param {number} nivel - O nível do usuário.
 * @returns {number|object} O valor da comissão se uma meta foi atingida, ou um objeto com os pontos faltantes.
 */
export function calcularComissaoSemanal(totalPontosCiclo, tipoUsuario, nivel) {
    // Usa a nova função para obter as metas corretas
    const metasDoNivel = obterMetas(tipoUsuario, nivel);

    if (!metasDoNivel || metasDoNivel.length === 0) {
        console.warn(`[calcularComissaoSemanal] Nenhuma meta definida para o tipo "${tipoUsuario}" no nível ${nivel}.`);
        return { faltam: "N/A" };
    }

    // Filtra as metas que foram atingidas pelo total de pontos
    const metasBatidas = metasDoNivel.filter(m => totalPontosCiclo >= m.pontos_meta);

    if (metasBatidas.length > 0) {
        // Pega a comissão da meta de MAIOR PONTUAÇÃO que foi batida, para garantir a recompensa correta.
        metasBatidas.sort((a, b) => b.pontos_meta - a.pontos_meta); 
        return metasBatidas[0].valor;
    } else {
        // Se nenhuma meta foi batida, calcula quantos pontos faltam para a primeira meta (a de menor pontuação)
        // A função obterMetas já retorna ordenado, então a primeira é a [0]
        const primeiraMeta = metasDoNivel[0];
        const pontosFaltantes = primeiraMeta.pontos_meta - totalPontosCiclo;
        return { faltam: Math.ceil(pontosFaltantes) }; // Arredonda para cima
    }
}