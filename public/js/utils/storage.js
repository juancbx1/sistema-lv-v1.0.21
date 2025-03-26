import { PRODUTOS, PRODUTOSKITS } from './prod-proc-maq.js';

export function obterUsuarios() {
    return JSON.parse(localStorage.getItem('usuarios')) || [];
}

export function salvarUsuarios(usuarios) {
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
}

export function obterProdutos() {
    const produtos = JSON.parse(localStorage.getItem('produtos')) || [];
    return produtos;
}

export function salvarProdutos(produtos) {
    localStorage.setItem('produtos', JSON.stringify(produtos));
}

export function salvarProducoes(producoes) {
    localStorage.setItem('producoes', JSON.stringify(producoes));
}