// utils/chart-utils.js
export function criarGrafico(ctx, tipo, labels, datasetLabel, data, backgroundColor, borderColor) {
    return new Chart(ctx, {
        type: tipo,
        data: {
            labels,
            datasets: [{
                label: datasetLabel,
                data,
                backgroundColor,
                borderColor,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, // Torna o gráfico responsivo
            maintainAspectRatio: true, // Mantém a proporção do gráfico
            aspectRatio: 2, // Proporção largura/altura (ajustável conforme necessário)
            scales: {
                y: { 
                    beginAtZero: true, 
                    title: { display: true, text: 'Processos' }
                },
                x: {
                    title: { display: true, text: 'Horas' }
                }
            },
            plugins: {
                legend: {
                    display: false // Opcional: remove a legenda se não for necessária
                }
            }
        }
    });
}