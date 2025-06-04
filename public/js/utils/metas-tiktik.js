// public/js/utils/metas-tiktik.js
export const METAS_TIKTIK_CONFIG = [
    { pontos: 4000, valor: 40, descricao: "Meta Bronze" }, // Adicionei descrição para clareza
    { pontos: 4700, valor: 50, descricao: "Meta Prata" },
    { pontos: 5400, valor: 70, descricao: "Meta Ouro" },
    { pontos: 6400, valor: 110, descricao: "Meta Diamante" }
]; // Seus valores de meta

export function obterMetasTiktik() {
    // Retorna uma cópia para evitar modificações acidentais no array original
    return [...METAS_TIKTIK_CONFIG].sort((a, b) => a.pontos - b.pontos); // Ordena por pontos, da menor para a maior
}