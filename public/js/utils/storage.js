import { PRODUTOS, PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';

// Função para gerenciar cache no localStorage
export async function getCachedData(key, fetchFunction, expiryMinutes = 5, forceRefresh = false) { // Adicione forceRefresh = false
    const cached = localStorage.getItem(key);
    const cachedTime = localStorage.getItem(`${key}_timestamp`);
    const now = Date.now();
    const expiryMs = expiryMinutes * 60 * 1000;

    // Verifica se o cache existe e não está expirado
    if (cached && cachedTime && (now - cachedTime < expiryMs) && !forceRefresh) { // Adicionado && !forceRefresh
            console.log(`[${key}] Usando dados do cache`);
            try {
            return JSON.parse(cached);
            } catch (e) {
            console.error(`[${key}] Erro ao parsear cache do localStorage, buscando novos dados`, e);
            // Se o cache estiver corrompido, força a busca
            }
        }

    // Se não houver cache ou estiver expirado, busca da API
    console.log(`[${key}] ${forceRefresh ? 'Forçando busca de' : 'Buscando novos'} dados da API`); // Ajuste o log
    const data = await fetchFunction(); // Executa a busca real na API

     // Atualiza o cache com os novos dados
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
export async function obterProdutos(forceRefresh = false) {
    const fetchProdutos = async () => {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/produtos', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
             const errorText = await response.text(); // Tenta ler o erro
             console.error('[fetchProdutos] Erro na resposta da API:', response.status, errorText);
            throw new Error(`Erro ao buscar produtos: ${response.status} - ${errorText}`);
        }
        const produtos = await response.json(); // Parseia a resposta JSON

        console.log('[obterProdutos] Produtos buscados da API e parseados:', produtos.length); // Log para ver os dados da API
         // Adicione um log para verificar o conteúdo de etapasTiktik aqui diretamente do resultado da API
         if (produtos.length > 0) {
              console.log('[obterProdutos] etapasTiktik no primeiro produto direto da API:', produtos[0].etapasTiktik);
         }

     return produtos;
    };

    const produtosCadastrados = await getCachedData('produtosCadastrados', fetchProdutos, 5, forceRefresh); // Passa forceRefresh
    console.log('[obterProdutos] Produtos encontrados (do cache ou API):', produtosCadastrados.length); // Log final do que a função retorna
    // Adicione um log para verificar o conteúdo de etapasTiktik aqui antes de retornar
     if (produtosCadastrados.length > 0) {
          console.log('[obterProdutos] etapasTiktik no primeiro produto ANTES de retornar:', produtosCadastrados[0].etapasTiktik);
     }
     
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
    console.log('[obterOrdensFinalizadas] Cache de ordens finalizadas limpo');
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