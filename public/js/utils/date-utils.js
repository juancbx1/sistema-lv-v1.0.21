// Função para formatar data no formato dd-mm-aaaa
export function formatarData(data) {
    const [ano, mes, dia] = data.split('-');
    return `${dia}-${mes}-${ano}`;
}