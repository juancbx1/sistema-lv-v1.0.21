// public/js/utils/chart-utils.js

export function criarGrafico(ctx, tipo, labels, datasetLabel, data, backgroundColor, borderColor, opcoesEspecificas = {}) {
    // Opções padrão que serão aplicadas a todos os gráficos, a menos que sobrescritas
    const opcoesPadrao = {
        responsive: true,
        maintainAspectRatio: true, // Pode ser false se você controlar o tamanho do canvas via CSS de forma mais flexível
        aspectRatio: 2, // Ajuste conforme necessário, ou remova se maintainAspectRatio for false
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Quantidade Produzida', // Título padrão do eixo Y
                    font: { size: 13, weight: '500' }, // Fonte um pouco menor/mais leve
                    padding: { top: 0, bottom: 10 }
                },
                grid: {
                    color: 'rgba(0, 0, 0, 0.08)', // Linhas de grade mais sutis
                    drawBorder: false, // Remove a borda do eixo em si, se a grade já delimitar
                },
                ticks: {
                    font: { size: 11 },
                    padding: 8,
                    // autoSkip: true, // Permite que o Chart.js pule alguns ticks se ficarem muito juntos
                    // maxTicksLimit: 6 // Limita o número de ticks no eixo Y
                }
            },
            x: {
                title: {
                    display: true,
                    text: 'Categorias', // Título padrão do eixo X (ex: Costureiras, Produtos, Horas)
                    font: { size: 13, weight: '500' },
                    padding: { top: 10, bottom: 0 }
                },
                grid: {
                    display: false // Geralmente não queremos grade vertical para barras
                },
                ticks: {
                    font: { size: 11 },
                    padding: 8,
                    maxRotation: 45, // Mantém a rotação para labels longos
                    minRotation: 30  // Pode ajustar minRotation
                }
            }
        },
        plugins: {
            legend: {
                display: true, // Por padrão, exibe a legenda
                position: 'top', // Posição padrão da legenda
                labels: {
                    font: { size: 12, weight: '500' },
                    boxWidth: 15,
                    padding: 15
                }
            },
            tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0, 0, 0, 0.85)', // Fundo do tooltip
                titleFont: { size: 13, weight: 'bold' },
                bodyFont: { size: 12 },
                padding: 12,
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                displayColors: true, // Mostra a caixinha de cor no tooltip
                boxPadding: 4,
                callbacks: {
                    // Callback padrão para o label do tooltip
                    label: (context) => {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += `${context.parsed.y}`; // Usa context.parsed.y para o valor numérico
                        }
                        // Você pode adicionar "processos" ou outra unidade aqui se for comum
                        // label += ' unidades';
                        return label;
                    }
                }
            }
        },
        animation: {
            duration: 800, // Duração da animação um pouco mais rápida
            easing: 'easeOutQuart' // Easing diferente para a animação
        },
        // Opções padrão para elementos específicos do gráfico
        elements: {
            bar: {
                backgroundColor: 'rgba(54, 162, 235, 0.7)', // Cor padrão para barras
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                borderRadius: 2, // Leve arredondamento padrão para barras (0 para retas)
                // barThickness: 'flex', // Para barras com largura flexível baseada no espaço
                                     // ou um número para largura fixa, ou remove para auto
                // maxBarThickness: 50 // Largura máxima se flexível
            },
            point: { // Para gráficos de linha
                radius: 4,
                hoverRadius: 6,
                backgroundColor: 'rgba(255, 99, 132, 1)'
            },
            line: { // Para gráficos de linha
                tension: 0.1, // Linhas levemente curvas (0 para retas)
                borderWidth: 2,
                borderColor: 'rgba(255, 99, 132, 1)'
            },
            arc: { // Para gráficos de Pizza/Rosca
                backgroundColor: 'rgba(255, 206, 86, 0.7)', // Cor padrão
                borderColor: '#fff', // Borda branca para separar fatias
                borderWidth: 2, // Espessura da borda
                // hoverBorderColor: '#ddd'
            }
        }
    };

    // Mescla as opções padrão com as opções específicas fornecidas
    // As opções específicas sobrescrevem as padrão se houver conflito
    const finalOptions = deepMerge(opcoesPadrao, opcoesEspecificas);

    // Se o tipo for 'pie' ou 'doughnut', podemos querer remover os eixos (scales)
    if (tipo === 'pie' || tipo === 'doughnut') {
        if (finalOptions.scales) {
            delete finalOptions.scales.x;
            delete finalOptions.scales.y;
        }
        // Ajusta o aspect ratio para gráficos de pizza/rosca se não for especificado
        if (opcoesEspecificas.aspectRatio === undefined && opcoesEspecificas.maintainAspectRatio === undefined) {
            finalOptions.maintainAspectRatio = true;
            finalOptions.aspectRatio = 1.5; // Mais adequado para pizza/rosca
        }
    }


    return new Chart(ctx, {
        type: tipo,
        data: {
            labels,
            datasets: [{
                label: datasetLabel || '', // Garante que datasetLabel seja uma string
                data,
                backgroundColor, // Estes vêm como arrays do chamador
                borderColor,     // Estes vêm como arrays do chamador
                // As propriedades de dataset como borderWidth, borderRadius, barThickness
                // serão controladas pelas 'opcoesPadrao.elements.bar' ou sobrescritas por 'opcoesEspecificas'
                // Se você quiser que backgroundColor e borderColor sejam únicos por dataset e não por barra/ponto,
                // ajuste aqui. Mas para barras, é comum ter cores diferentes por barra.
            }]
        },
        options: finalOptions // Usa as opções finais mescladas
    });
}

// Função auxiliar para mesclar objetos de opções profundamente (para não perder sub-opções)
function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}