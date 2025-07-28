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
 * Calcula a comissão semanal com base nos pontos e no tipo/nível do usuário, para uma data específica.
 * Esta função agora é assíncrona.
 * @param {number} totalPontosSemana - O total de pontos que o usuário fez na semana.
 * @param {string} tipoUsuario - O tipo de usuário.
 * @param {number} nivel - O nível do usuário.
 * @param {Date} [dataReferencia=new Date()] - A data para a qual as regras de comissão devem ser válidas.
 * @returns {Promise<number|object>} O valor da comissão ou um objeto com os pontos faltantes.
 */
export async function calcularComissaoSemanal(totalPontosSemana, tipoUsuario, nivel, dataReferencia = new Date()) {
    // A data de referência é crucial aqui para pegar as regras corretas do passado!
    const metasDoNivel = await obterMetas(tipoUsuario, nivel, dataReferencia);

    if (!metasDoNivel || metasDoNivel.length === 0) {
        console.warn(`[calcularComissaoSemanal] Nenhuma meta definida para o tipo "${tipoUsuario}" no nível ${nivel}.`);
        return { faltam: "N/A" };
    }

    // A lógica de cálculo permanece idêntica à anterior.
    const metasBatidas = metasDoNivel.filter(m => totalPontosSemana >= m.pontos_meta);

    if (metasBatidas.length > 0) {
        metasBatidas.sort((a, b) => b.pontos_meta - a.pontos_meta);
        return metasBatidas[0].valor;
    } else {
        const primeiraMeta = metasDoNivel[0];
        const pontosFaltantes = primeiraMeta.pontos_meta - totalPontosSemana;
        return { faltam: Math.ceil(pontosFaltantes) };
    }
}