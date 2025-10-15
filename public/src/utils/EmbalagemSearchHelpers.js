// public/src/utils/searchHelpers.js

const BUSCAS_RECENTES_KEY = 'buscasRecentes';
const MAX_BUSCAS = 8; // Máximo de 8 pílulas

/**
 * Normaliza o texto removendo acentos e convertendo para minúsculas.
 * @param {string} text - O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
export const normalizeText = (text) => {
  if (typeof text !== 'string') return '';
  return text
    .normalize("NFD") // Decompõe os caracteres acentuados
    .replace(/[\u0300-\u036f]/g, "") // Remove os acentos (diacríticos)
    .toLowerCase(); // Converte para minúsculas
};

// Função para ler as buscas salvas no localStorage
export const getBuscasRecentes = () => {
  try {
    const buscasSalvas = localStorage.getItem(BUSCAS_RECENTES_KEY);
    return buscasSalvas ? JSON.parse(buscasSalvas) : [];
  } catch (error) {
    console.error("Erro ao ler buscas recentes:", error);
    return [];
  }
};

// Função para adicionar uma nova busca ao histórico
export const addBuscaRecente = (termo) => {
  if (!termo || termo.trim().length < 2) return; // Não salva buscas vazias ou muito curtas

  const termoLimpo = termo.trim().toLowerCase();
  let buscasAtuais = getBuscasRecentes();

  // Remove o termo se ele já existir, para colocá-lo no topo
  buscasAtuais = buscasAtuais.filter(b => b !== termoLimpo);

  // Adiciona o novo termo no início da lista
  buscasAtuais.unshift(termoLimpo);

  // Garante que a lista não exceda o tamanho máximo
  const buscasAtualizadas = buscasAtuais.slice(0, MAX_BUSCAS);

  try {
    localStorage.setItem(BUSCAS_RECENTES_KEY, JSON.stringify(buscasAtualizadas));
  } catch (error) {
    console.error("Erro ao salvar busca recente:", error);
  }
};

// Função para remover uma busca específica (ao clicar no 'x' da pílula)
export const removeBuscaRecente = (termo) => {
    let buscasAtuais = getBuscasRecentes();
    const buscasAtualizadas = buscasAtuais.filter(b => b !== termo);
    try {
        localStorage.setItem(BUSCAS_RECENTES_KEY, JSON.stringify(buscasAtualizadas));
    } catch (error) {
        console.error("Erro ao remover busca recente:", error);
    }
}