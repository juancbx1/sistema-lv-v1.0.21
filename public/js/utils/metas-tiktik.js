// public/js/utils/metas-tiktik.js
export const METAS_TIKTIK = [
    { tipo: 'diaria', descricao: 'Meta Diária Padrão', quantidade: 50 },
    { tipo: 'semanal', descricao: 'Meta Semanal Padrão', quantidade: 250 }
    // Adicione mais metas se necessário, talvez por tipo de produto se fizer sentido.
];

export function obterMetasTiktik(tipoMeta = null) {
    if (tipoMeta) {
        return METAS_TIKTIK.filter(meta => meta.tipo === tipoMeta);
    }
    return METAS_TIKTIK;
}

// Se, no futuro, houver algum tipo de bônus por quantidade, podemos adicionar funções aqui.
// Exemplo:
// export function calcularBonusTiktik(quantidadeProduzida, metaSelecionada) {
//     if (quantidadeProduzida > metaSelecionada.quantidade) {
//         const excedente = quantidadeProduzida - metaSelecionada.quantidade;
//         // return excedente * VALOR_POR_ITEM_EXTRA; // Definir VALOR_POR_ITEM_EXTRA
//         return 0; // Placeholder
//     }
//     return 0;
// }