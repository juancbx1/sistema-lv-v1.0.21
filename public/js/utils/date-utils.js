// public/js/utils/date-utils.js

export function formatarData(data, tipo = 'default') {
  if (!data) return 'N/A';

  const dataObj = new Date(data);
  const dataCorrigida = new Date(dataObj.valueOf() + dataObj.getTimezoneOffset() * 60 * 1000);

  if (tipo === 'inicioSemana') {
    const inicio = new Date(dataCorrigida);
    inicio.setDate(inicio.getDate() - inicio.getDay()); // Volta para o Domingo
    return `${String(inicio.getDate()).padStart(2, '0')}/${String(inicio.getMonth() + 1).padStart(2, '0')}`;
  }
  
  if (tipo === 'fimSemana') {
    const fim = new Date(dataCorrigida);
    fim.setDate(fim.getDate() + (6 - fim.getDay())); // Avança para o Sábado
    return `${String(fim.getDate()).padStart(2, '0')}/${String(fim.getMonth() + 1).padStart(2, '0')}`;
  }

  // Formato padrão
  const dia = String(dataCorrigida.getDate()).padStart(2, '0');
  const mes = String(dataCorrigida.getMonth() + 1).padStart(2, '0');
  const ano = dataCorrigida.getFullYear();
  return `${dia}/${mes}/${ano}`;
}