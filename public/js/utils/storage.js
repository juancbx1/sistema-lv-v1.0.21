import { PRODUTOS, PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';

// Função para gerenciar cache no localStorage
export async function getCachedData(key, fetchFunction, expiryMinutes = 5) {
    const cached = localStorage.getItem(key);
    const cachedTime = localStorage.getItem(`${key}_timestamp`);
    const now = Date.now();
    const expiryMs = expiryMinutes * 60 * 1000;

    // Verifica se o cache existe e não está expirado
    if (cached && cachedTime && (now - cachedTime < expiryMs)) {
        console.log(`[${key}] Usando dados do cache`);
        return JSON.parse(cached);
    }

    // Se não houver cache ou estiver expirado, busca da API
    console.log(`[${key}] Buscando novos dados da API`);
    const data = await fetchFunction();
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(`${key}_timestamp`, now);
    return data;
}

// Função para invalidar o cache (exportada para uso em outros arquivos)
export function invalidateCache(key) {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}_timestamp`);
    console.log(`[${key}] Cache invalidado`);
}

// Sua função existente, agora com cache
export async function obterProdutos() {
    const fetchProdutos = async () => {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/produtos', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });
        if (!response.ok) throw new Error('Erro ao buscar produtos');
        const produtos = await response.json();
        console.log('[obterProdutos] Produtos buscados da API:', produtos.length);
        return produtos;
    };

    const produtosCadastrados = await getCachedData('produtosCadastrados', fetchProdutos);
    console.log('[obterProdutos] Produtos encontrados:', produtosCadastrados.length);
    return produtosCadastrados;
}

export async function salvarProdutos(produtos) {
    for (const produto of produtos) {
        const response = await fetch('/api/produtos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(produto)
        });
        if (!response.ok) throw new Error('Erro ao salvar produtos');
    }
    // Após salvar, invalidar o cache para garantir que os dados sejam recarregados
    invalidateCache('produtosCadastrados');
}


export function obterUsuarios() {
    return JSON.parse(localStorage.getItem('usuarios')) || [];
}

export function salvarUsuarios(usuarios) {
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
}


export function salvarProducoes(producoes) {
    localStorage.setItem('producoes', JSON.stringify(producoes));
}