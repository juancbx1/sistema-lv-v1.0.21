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
                borderWidth: 2,
                borderRadius: 8, // Bordas arredondadas
                barThickness: 25, // Largura fixa das barras
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade Produzida',
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { font: { size: 12 }, stepSize: 10 }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Costureiras',
                        font: { size: 14, weight: 'bold' }
                    },
                    grid: { display: false },
                    ticks: {
                        font: { size: 12 },
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { font: { size: 14, weight: 'bold' } }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 14 },
                    bodyFont: { size: 12 },
                    padding: 10,
                    callbacks: {
                        label: (context) => `${context.raw} processos`
                    }
                }
            },
            animation: {
                duration: 1200,
                easing: 'easeOutCubic'
            }
        }
    });
}