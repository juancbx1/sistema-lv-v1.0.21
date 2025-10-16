// public/src/utils/RadarLocalSearchHelpers.js
const BUSCA_LOCAL_KEY = 'radarBuscasLocaisRecentes';
const MAX_BUSCAS = 5;

export const getBuscasRecentes = (id) => {
    try {
        const buscasSalvas = localStorage.getItem(`${BUSCA_LOCAL_KEY}_${id}`);
        return buscasSalvas ? JSON.parse(buscasSalvas) : [];
    } catch (e) { return []; }
};

export const addBuscaRecente = (id, termo) => {
    if (!termo || termo.trim().length < 2) return;
    const termoLimpo = termo.trim().toLowerCase();
    let buscasAtuais = getBuscasRecentes(id);
    buscasAtuais = buscasAtuais.filter(b => b !== termoLimpo);
    buscasAtuais.unshift(termoLimpo);
    const buscasAtualizadas = buscasAtuais.slice(0, MAX_BUSCAS);
    try {
        localStorage.setItem(`${BUSCA_LOCAL_KEY}_${id}`, JSON.stringify(buscasAtualizadas));
    } catch (e) { console.error("Erro ao salvar busca local:", e); }
};

export const removeBuscaRecente = (id, termo) => {
    let buscasAtuais = getBuscasRecentes(id);
    const buscasAtualizadas = buscasAtuais.filter(b => b !== termo);
    try {
        localStorage.setItem(`${BUSCA_LOCAL_KEY}_${id}`, JSON.stringify(buscasAtualizadas));
    } catch (e) { console.error("Erro ao remover busca local:", e); }
};