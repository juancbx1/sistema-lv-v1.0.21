import { PRODUTOS, PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';

// Função para gerenciar cache no localStorage
export async function getCachedData(key, fetchFunction, expiryMinutes = 5, forceRefresh = false) { // Adicione forceRefresh = false
    const cached = localStorage.getItem(key);
    const cachedTime = localStorage.getItem(`${key}_timestamp`);
    const now = Date.now();
    const expiryMs = expiryMinutes * 60 * 1000;

    // Verifica se o cache existe e não está expirado
    if (cached && cachedTime && (now - cachedTime < expiryMs) && !forceRefresh) { // Adicionado && !forceRefresh
            try {
            return JSON.parse(cached);
            } catch (e) {
            console.error(`[${key}] Erro ao parsear cache do localStorage, buscando novos dados`, e);
            // Se o cache estiver corrompido, força a busca
            }
        }

    // Se não houver cache ou estiver expirado, busca da API
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

         // Adicione um log para verificar o conteúdo de etapasTiktik aqui diretamente do resultado da API
         if (produtos.length > 0) {
         }

     return produtos;
    };

    const produtosCadastrados = await getCachedData('produtosCadastrados', fetchProdutos, 5, forceRefresh); // Passa forceRefresh
    // Adicione um log para verificar o conteúdo de etapasTiktik aqui antes de retornar
     if (produtosCadastrados.length > 0) {
     }
     
    return produtosCadastrados;
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