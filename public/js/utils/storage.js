import { PRODUTOS, PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';

let inMemoryCache = {};
const CACHE_DURATION_DEFAULT_MIN = 5;

export async function getCachedData(key, fetchFunction, expiryMinutes = CACHE_DURATION_DEFAULT_MIN, forceRefresh = false) {
    const now = Date.now();
    const expiryMs = expiryMinutes * 60 * 1000;

    console.log(`[getCachedData - ${key}] INÍCIO. forceRefresh: ${forceRefresh}, Expiry: ${expiryMinutes} min`);

    // 1. Se forceRefresh é true, ignora todos os caches e vai direto para a API
    if (forceRefresh) {
        console.log(`[getCachedData - ${key}] forceRefresh é TRUE. Buscando diretamente da API.`);
        const dataFromAPI = await fetchFunction();
        console.log(`[getCachedData - ${key}] Dados recebidos da API (devido a forceRefresh). Atualizando caches.`);
        inMemoryCache[key] = { data: dataFromAPI, timestamp: now };
        try {
            localStorage.setItem(key, JSON.stringify(dataFromAPI));
            localStorage.setItem(`${key}_timestamp`, now.toString());
            console.log(`[getCachedData - ${key}] localStorage atualizado com dados frescos.`);
        } catch (e) { console.error(`[getCachedData - ${key}] Erro ao salvar no localStorage após forceRefresh`, e); }
        return dataFromAPI;
    }

    // 2. Tenta o cache em memória (se não for forceRefresh)
    if (inMemoryCache[key] && (now - inMemoryCache[key].timestamp < expiryMs)) {
        console.log(`[getCachedData - ${key}] Usando cache de MEMÓRIA. Timestamp: ${new Date(inMemoryCache[key].timestamp).toLocaleTimeString()}`);
        return inMemoryCache[key].data;
    }
    if (inMemoryCache[key]) { // Se existe mas expirou
        console.log(`[getCachedData - ${key}] Cache de MEMÓRIA EXPIRADO.`);
    } else {
        console.log(`[getCachedData - ${key}] Cache de MEMÓRIA VAZIO para a chave.`);
    }

    // 3. Tenta o localStorage (se o de memória falhou ou está expirado, e não é forceRefresh)
    try {
        const cachedLS = localStorage.getItem(key);
        const cachedLSTime = localStorage.getItem(`${key}_timestamp`);
        if (cachedLS && cachedLSTime && (now - parseInt(cachedLSTime) < expiryMs)) {
            const parsedData = JSON.parse(cachedLS);
            console.log(`[getCachedData - ${key}] Usando cache do LOCALSTORAGE. Timestamp LS: ${new Date(parseInt(cachedLSTime)).toLocaleTimeString()}`);
            inMemoryCache[key] = { data: parsedData, timestamp: parseInt(cachedLSTime) }; // Atualiza cache de memória
            return parsedData;
        }
        if (cachedLS && cachedLSTime) { // Se existe mas expirou
             console.log(`[getCachedData - ${key}] Cache do LOCALSTORAGE EXPIRADO.`);
        }
    } catch (e) {
        console.error(`[getCachedData - ${key}] Erro ao ler/parsear cache do localStorage. Removendo cache corrompido.`, e);
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}_timestamp`);
    }

    // 4. Se chegou aqui, busca da API (porque não tinha cache válido ou forceRefresh foi true no início)
    console.log(`[getCachedData - ${key}] >>> BUSCANDO DA API (nenhum cache válido ou forceRefresh inicial).`);
    const dataFromAPI = await fetchFunction();
    console.log(`[getCachedData - ${key}] <<< DADOS RECEBIDOS DA API. Atualizando caches.`);
    inMemoryCache[key] = { data: dataFromAPI, timestamp: now };
    try {
        localStorage.setItem(key, JSON.stringify(dataFromAPI));
        localStorage.setItem(`${key}_timestamp`, now.toString());
        console.log(`[getCachedData - ${key}] localStorage e cache de memória atualizados.`);
    } catch (e) { console.error(`[getCachedData - ${key}] Erro ao salvar no localStorage após busca na API`, e); }
    return dataFromAPI;
}

// Função para invalidar o cache (exportada para uso em outros arquivos)
export function invalidateCache(key) {
    console.log(`[invalidateCache - ${key}] Invalidando cache (memória e localStorage)`);
    if (inMemoryCache[key]) {
        delete inMemoryCache[key];
    }
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}_timestamp`);
}


// Sua função existente, agora com cache
export async function obterProdutos(forceRefresh = false) {
    // Define a função que realmente busca os dados da API
    const fetchProdutosDaAPI = async () => {
        console.log('[fetchProdutosDaAPI] Iniciando busca na API /api/produtos...');
        const token = localStorage.getItem('token');
        if (!token) {
            // Se o token for estritamente necessário para esta chamada, lance um erro.
            // Se for opcional para alguns casos, ajuste a lógica ou remova o erro.
            console.error('[fetchProdutosDaAPI] Token não encontrado.');
            throw new Error('Autenticação necessária para buscar produtos.');
        }

        try {
            // Adiciona um timestamp à URL para tentar evitar cache do navegador/rede na requisição GET
            const response = await fetch(`/api/produtos?_=${Date.now()}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate', // Headers para evitar cache
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
            });

            if (!response.ok) {
                let errorText = `Erro HTTP ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorText = errorData.error || errorText;
                } catch (e) {
                    // Se não conseguir parsear JSON, usa o statusText
                    errorText = response.statusText || errorText;
                }
                console.error('[fetchProdutosDaAPI] Erro na resposta da API:', response.status, errorText);
                throw new Error(`Erro ao buscar produtos: ${errorText}`);
            }

            const produtosRecebidos = await response.json();
            if (!Array.isArray(produtosRecebidos)) {
                console.error('[fetchProdutosDaAPI] API não retornou um array de produtos:', produtosRecebidos);
                throw new Error('Formato de dados inesperado ao buscar produtos.');
            }
            console.log(`[fetchProdutosDaAPI] Produtos recebidos da API: ${produtosRecebidos.length} itens. Exemplo [0].nome:`, produtosRecebidos[0]?.nome);
            return produtosRecebidos;

        } catch (error) {
            console.error('[fetchProdutosDaAPI] Falha ao executar fetch:', error);
            throw error; // Relança o erro para ser tratado por getCachedData ou quem chamou obterProdutos
        }
    };

    // Chave para o cache de produtos
    const CACHE_KEY_PRODUTOS = 'produtosCadastrados'; // Use uma chave consistente
    const EXPIRY_MINUTES_PRODUTOS = 5; // Exemplo: cache de 5 minutos

    console.log(`[obterProdutos] Solicitando dados com forceRefresh: ${forceRefresh}`);
    try {
        const produtos = await getCachedData(CACHE_KEY_PRODUTOS, fetchProdutosDaAPI, EXPIRY_MINUTES_PRODUTOS, forceRefresh);
        // Log para verificar o que está sendo retornado por getCachedData
        if (produtos && produtos.length > 0) {
            console.log(`[obterProdutos] Dados de produtos retornados (total: ${produtos.length}). Exemplo [0].nome:`, produtos[0]?.nome);
        } else if (produtos) {
            console.log('[obterProdutos] Dados de produtos retornados (lista vazia).');
        } else {
            console.warn('[obterProdutos] getCachedData retornou null/undefined.');
        }
        return produtos || []; // Garante que sempre retorne um array
    } catch (error) {
        console.error('[obterProdutos] Erro final ao obter produtos:', error);
        // Em caso de erro na busca E sem cache, retorna array vazio para não quebrar o chamador
        // ou você pode optar por relançar o erro se preferir que o chamador trate.
        return [];
    }
}

export async function salvarProdutos(produtos) {
    const token = localStorage.getItem('token'); // Obter o token
    if (!token) {
        console.error('[salvarProdutos storage.js] Token não encontrado. Não é possível salvar produtos.');
        throw new Error('Token de autenticação não encontrado para salvar produtos.');
        // Poderia redirecionar para login ou mostrar uma mensagem mais amigável aqui também.
    }

    for (const produto of produtos) {
        const response = await fetch('/api/produtos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // <<< ADICIONAR TOKEN AQUI
            },
            body: JSON.stringify(produto)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
            console.error(`[salvarProdutos storage.js] Erro ao salvar produto "${produto.nome}":`, response.status, errorData);
            throw new Error(errorData.error || 'Erro ao salvar produtos via storage.js');
        }
    }
    // Após salvar, invalidar o cache para garantir que os dados sejam recarregados
    invalidateCache('produtosCadastrados');
}

export async function obterOrdensFinalizadas(forceRefresh = false) {
    const fetchOrdens = async () => {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/ordens-de-producao?all=true', { // Busca todas as OPs
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Erro ao carregar ordens de produção');
        const data = await response.json();
        return Array.isArray(data) ? data : (data.rows || []); // Normaliza para array
    };

    return await getCachedData('ordensFinalizadas', fetchOrdens, 5, forceRefresh);
}

export function limparCacheOrdensFinalizadas() {
    invalidateCache('ordensFinalizadas');
}


export async function obterUsuarios(forceRefresh = false) { // Adicionar forceRefresh
    const fetchUsuarios = async () => {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/usuarios', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[storage-fetchUsuarios] Erro na API:', response.status, errorText);
            throw new Error(`Erro ao buscar usuários: ${response.status}`);
        }
        return await response.json();
    };
    return await getCachedData('todosUsuariosCached', fetchUsuarios, 15, forceRefresh); // Cache de 15 min
}

export function salvarUsuarios(usuarios) {
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
}


export function salvarProducoes(producoes) {
    localStorage.setItem('producoes', JSON.stringify(producoes));
}