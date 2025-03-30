import { PRODUTOS, PRODUTOSKITS } from './prod-proc-maq.js';

export async function obterProdutos() {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/produtos', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
    });
    if (!response.ok) throw new Error('Erro ao buscar produtos');
    return await response.json();
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