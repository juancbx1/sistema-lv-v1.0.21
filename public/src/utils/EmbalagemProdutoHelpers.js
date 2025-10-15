// public/src/utils/EmbalagemProdutoHelpers.js

/**
 * Obtém a imagem correta para um produto, priorizando a imagem da variação.
 * @param {object} produtoCompleto - O objeto completo do produto que vem da API, incluindo a 'grade'.
 * @param {string} nomeVariante - O nome da variante (ex: "Champagne", "Preto com Preto | P").
 * @returns {string} - A URL da imagem ou um placeholder.
 */
export function getImagemVariacao(produtoCompleto, nomeVariante) {
    const placeholder = '/img/placeholder-image.png';

    if (!produtoCompleto) {
        return placeholder;
    }

    if (nomeVariante && nomeVariante !== '-' && Array.isArray(produtoCompleto.grade)) {
        const gradeItem = produtoCompleto.grade.find(g => g.variacao === nomeVariante);
        if (gradeItem && gradeItem.imagem) {
            return gradeItem.imagem;
        }
    }
    
    return produtoCompleto.imagem || placeholder;
}