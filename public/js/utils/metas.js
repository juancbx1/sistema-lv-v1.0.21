// public/js/utils/metas.js (VERSÃO DINÂMICA COM API)

// Cache para armazenar as configurações de metas já buscadas
// A chave será a data de início da vigência (ex: '2025-07-20')
const metasCache = new Map();

/**
 * Busca a configuração de metas da API para uma data específica.
 * Usa um cache para evitar requisições repetidas para a mesma versão de regras.
 * @param {Date} dataReferencia - A data para a qual queremos obter as regras de meta.
 * @returns {Promise<object>} Uma promessa que resolve para o objeto de configuração de metas.
 */
async function fetchMetasConfig(dataReferencia) {
    // Formata a data como YYYY-MM-DD para usar como chave de cache e na URL.
    const dataString = dataReferencia.toISOString().split('T')[0];

    // 1. Verifica se já temos essa configuração em cache
    if (metasCache.has(dataString)) {
        //console.log(`[Metas Util] Usando metas em cache para a data ${dataString}`);
        return metasCache.get(dataString);
    }

    // 2. Se não estiver no cache, busca na API
    try {
        //console.log(`[Metas Util] Buscando metas da API para a data ${dataString}`);
        const token = localStorage.getItem('token');
        if (!token) throw new Error("Token de autenticação não encontrado.");

        const response = await fetch(`/api/metas?data=${dataString}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro HTTP ${response.status}`);
        }

        const metasConfig = await response.json();

        // <<< LOG 2: VERIFICAR DADOS RECEBIDOS PELA API NO FRONTEND >>>
        //console.log('[fetchMetasConfig] Dados de metas recebidos da API:', JSON.stringify(metasConfig, null, 2));
        
        // 3. Armazena o resultado no cache antes de retornar
        // A chave de cache será a mesma data de referência para simplificar.
        metasCache.set(dataString, metasConfig);
        
        return metasConfig;

    } catch (error) {
        console.error(`[fetchMetasConfig] Erro ao buscar configuração de metas:`, error);
        // Retorna um objeto vazio em caso de erro para não quebrar a aplicação
        return {}; 
    }
}

/**
 * Obtém as metas para um determinado tipo de usuário e nível, para uma data específica.
 * Esta função agora é assíncrona.
 * @param {string} tipoUsuario - O tipo de usuário (ex: 'costureira', 'tiktik').
 * @param {number} nivel - O nível do usuário.
 * @param {Date} [dataReferencia=new Date()] - A data para a qual as regras devem ser válidas.
 * @returns {Promise<Array>} Um array com os objetos de meta ou um array vazio.
 */
export async function obterMetas(tipoUsuario, nivel, dataReferencia = new Date()) {
    // Se o tipoUsuario não for válido, retorna array vazio para evitar erros.
    if (!tipoUsuario || typeof tipoUsuario !== 'string') return [];

    const tipoUsuarioPadronizado = tipoUsuario.toLowerCase().trim();

    const metasConfig = await fetchMetasConfig(dataReferencia);

    const metasDoTipo = metasConfig[tipoUsuarioPadronizado];
    if (!metasDoTipo) {
        console.warn(`[obterMetas] Tipo de usuário "${tipoUsuarioPadronizado}" não encontrado na configuração de metas para a data fornecida.`);
        return [];
    }
    
    // A lógica para usar nível 1 como padrão continua a mesma
    const metasDoNivel = metasDoTipo[nivel] || metasDoTipo[1] || [];
    
    // O backend já retorna ordenado, mas uma nova ordenação não faz mal e garante. 
    return [...metasDoNivel].sort((a, b) => a.pontos_meta - b.pontos_meta);
}

/**
 * Calcula a comissão semanal com base nos pontos, atividades e no tipo/nível do usuário.
 * @param {number} totalPontosSemana - O total de pontos que o usuário fez na semana.
 * @param {string} tipoUsuario - O tipo de usuário.
 * @param {number} nivel - O nível do usuário.
 * @param {Array} atividadesDaSemana - A lista de atividades para verificar as condições.
 * @param {Date} [dataReferencia=new Date()] - A data para as regras de comissão.
 * @returns {Promise<object>} O valor da comissão ou um objeto com os pontos faltantes e status das condições.
 */
export async function calcularComissaoSemanal(totalPontosSemana, tipoUsuario, nivel, atividadesDaSemana = [], todosOsProdutos = [], dataReferencia = new Date()) {
    const metasDoNivel = await obterMetas(tipoUsuario, nivel, dataReferencia);

    if (!metasDoNivel || metasDoNivel.length === 0) {
        return { valor: 0, faltam: "N/A", condicoesCumpridas: true, progressoCondicoes: [] };
    }

    // A lógica de cálculo agora considera as condições
    let melhorMetaAtingida = null;

    for (const meta of metasDoNivel) {
        // Verifica se os pontos são suficientes para ESTA meta
        if (totalPontosSemana >= meta.pontos_meta) {
            const verificacao = verificarCondicoes(atividadesDaSemana, meta.condicoes, todosOsProdutos);
            
            // Se os pontos e TODAS as condições foram cumpridas
            if (verificacao.todasCumpridas) {
                // Armazena esta meta como uma candidata válida
                melhorMetaAtingida = meta;
                // Não paramos aqui, continuamos o loop para encontrar a meta de MAIOR valor que foi batida
            }
        }
    }

    if (melhorMetaAtingida) {
        // Se encontramos pelo menos uma meta 100% batida, retornamos o valor da de maior pontuação
        // (Como o array já está ordenado, a última encontrada será a melhor)
        return { valor: melhorMetaAtingida.valor, condicoesCumpridas: true };
    } else {
        // Se nenhuma meta foi 100% batida, retornamos o status da primeira meta
        const primeiraMeta = metasDoNivel[0];
        const pontosFaltantes = primeiraMeta.pontos_meta - totalPontosSemana;
        
        // Verifica o progresso das condições da primeira meta para dar feedback
        const verificacao = verificarCondicoes(atividadesDaSemana, primeiraMeta.condicoes, todosOsProdutos);

        return { 
            valor: 0,
            faltam: Math.ceil(pontosFaltantes),
            condicoesCumpridas: verificacao.todasCumpridas,
            progressoCondicoes: verificacao.progresso
        };
    }
}

/**
 * Verifica se todas as condições de uma meta foram cumpridas.
 * @param {Array} atividadesDaSemana - Lista de atividades.
 * @param {Array|null} condicoes - O array de condições da meta.
 * @param {Array} todosOsProdutos - A lista completa de produtos do sistema.
 * @returns {object} - Um objeto com { todasCumpridas: boolean, progresso: Array }.
 */
export function verificarCondicoes(atividadesDaSemana, condicoes, todosOsProdutos = []) {
    if (!condicoes || condicoes.length === 0) {
        return { todasCumpridas: true, progresso: [] };
    }

    let todasAsCondicoesForamCumpridas = true;
    
    const progressoCondicoes = condicoes.map(condicao => {
        let quantidadeFeita = 0;
        
        if (condicao.tipo === 'arremate_produto') {
            quantidadeFeita = atividadesDaSemana
                .filter(atv => atv.tipo_origem === 'Arremate' && atv.produto_id === condicao.produto_id)
                .reduce((total, atv) => total + atv.quantidade, 0);
        }

        const cumprida = quantidadeFeita >= condicao.quantidade_minima;
        if (!cumprida) {
            todasAsCondicoesForamCumpridas = false;
        }

        // <<< A CORREÇÃO ESTÁ AQUI >>>
        // Procura o nome do produto na lista completa usando o ID da condição
        const produto = todosOsProdutos.find(p => p.id === condicao.produto_id);
        const nomeProduto = produto ? produto.nome : 'Produto Desconhecido';

        return {
            descricao: `Arremates de ${nomeProduto}`, // Usa o nome encontrado
            feitos: quantidadeFeita,
            meta: condicao.quantidade_minima,
            cumprida: cumprida
        };
    });

    return {
        todasCumpridas: todasAsCondicoesForamCumpridas,
        progresso: progressoCondicoes
    };
}