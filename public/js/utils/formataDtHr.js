// Formata Data para input HTML (YYYY-MM-DD)
// Importante: Usa UTC para evitar que o dia mude devido ao fuso horário na conversão
export function formatarDataParaInput(dataString) {
    if (!dataString) return '';
    try {
        const data = new Date(dataString);
        if (isNaN(data.getTime())) return '';
        
        const ano = data.getUTCFullYear();
        const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(data.getUTCDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    } catch (e) {
        return '';
    }
}

// Formata Data para Exibição (DD/MM/AAAA)
export function formatarDataDisplay(dataString) {
    if (!dataString) return 'Não definida';
    try {
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch (e) {
        return '--/--/----';
    }
}

// Formata Hora (HH:MM:SS -> HH:MM)
export function formatarHora(horaString) {
    if (!horaString) return '';
    // Assume que vem do banco como "07:30:00" ou similar
    return horaString.substring(0, 5);
}

// Formata Moeda (BRL)
export function formatarMoeda(valor) {
    if (valor === undefined || valor === null) return 'R$ 0,00';
    return parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}