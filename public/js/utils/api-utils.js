// public/js/utils/api-utils.js

/**
 * Função centralizada para fazer chamadas à API, incluindo o token de autenticação.
 * @param {string} endpoint - O endpoint da API (ex: '/api/usuarios').
 * @param {object} options - Opções da requisição fetch (method, body, etc.).
 * @returns {Promise<any>} A resposta da API em formato JSON.
 * @throws {Error} Lança um erro se a resposta não for 'ok'.
 */
export async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        // Se não houver token, idealmente redirecionamos para o login.
        // Lançar um erro aqui é uma boa forma de parar o fluxo.
        alert("Sessão expirada ou inválida. Por favor, faça login novamente.");
        window.location.href = '/login.html';
        throw new Error('Token de autenticação não encontrado.');
    }

    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(endpoint, config);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.error || `Erro desconhecido na API.`);
        }

        // Lida com respostas que não têm corpo (ex: 204 No Content)
        const contentType = response.headers.get("content-type");
        if (response.status === 204 || !contentType || !contentType.includes("application/json")) {
            return null;
        }

        return response.json();

    } catch (error) {
        console.error(`Erro na chamada da API para ${endpoint}:`, error);
        // Re-lança o erro para que a função que chamou possa tratá-lo (ex: mostrar um alerta).
        throw error;
    }
}