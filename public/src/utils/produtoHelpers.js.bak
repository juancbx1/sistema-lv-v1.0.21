// public/src/utils/produtoHelpers.js

/**
 * Obtém a imagem correta para um produto, priorizando a imagem da variação.
 * @param {object} produtoCompleto - O objeto completo do produto que vem da API, incluindo a 'grade'.
 * @param {string} nomeVariante - O nome da variante (ex: "Champagne", "Preto com Preto | P").
 * @returns {string} - A URL da imagem ou um placeholder.
 */
export function getImagemVariacao(produtoCompleto, nomeVariante) {
    const placeholder = '/img/placeholder-image.png';

    // Se não houver dados do produto, retorna o placeholder.
    if (!produtoCompleto) {
        return placeholder;
    }

    // 1. Tenta encontrar a imagem específica da variação na grade do produto.
    if (nomeVariante && nomeVariante !== '-' && Array.isArray(produtoCompleto.grade)) {
        const gradeItem = produtoCompleto.grade.find(g => g.variacao === nomeVariante);
        if (gradeItem && gradeItem.imagem) {
            return gradeItem.imagem; // SUCESSO: Encontrou a imagem da variação.
        }
    }
    
    // 2. Se não encontrou na variação, retorna a imagem principal do produto "pai".
    // Se essa também não existir, retorna o placeholder como último recurso.
    return produtoCompleto.imagem || placeholder;
}