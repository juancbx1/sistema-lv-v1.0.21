// public/src/components/GraficoDespesasPizza.jsx

import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useMediaQuery } from '../hooks/useMediaQuery';

// Função para gerar cores aleatórias, mas consistentes e agradáveis
const generateColorPalette = (numColors) => {
    const colors = [];
    const baseHue = 200; // Começa com um tom azulado
    for (let i = 0; i < numColors; i++) {
        const hue = (baseHue + i * 45) % 360; // Pula 45 graus no círculo de cores
        colors.push(`hsl(${hue}, 65%, 60%)`); // Usa HSL para cores vibrantes e consistentes
    }
    return colors;
};

// Componente para o Tooltip customizado (a caixinha que aparece ao passar o mouse)
const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const percentValue = payload[0].percent;
        const percentDisplay = !isNaN(percentValue) ? `(${(percentValue * 100).toFixed(2)}%)` : ''; // Só mostra se for um número

        return (
            <div className="custom-tooltip" style={{
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                padding: '10px',
                borderRadius: '5px'
            }}>
                <p style={{ margin: 0, fontWeight: 'bold' }}>{data.nome}</p>
                <p style={{ margin: '5px 0 0 0', color: '#27ae60' }}>
                    {`Valor: ${data.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ${percentDisplay}`}
                </p>
            </div>
        );
    }
    return null;
};

export default function GraficoDespesasPizza({ data }) {
    const COLORS = useMemo(() => generateColorPalette(data.length), [data]);
    const isMobile = useMediaQuery('(max-width: 768px)');

    return (
        <ResponsiveContainer width="100%" height={400}>
            <PieChart>
                <Tooltip content={<CustomTooltip />} />
                
                {/* 1. LEGENDA: Agora sempre horizontal (no bottom) */}
                <Legend 
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    // Ajuste para permitir quebra de linha nas legendas se forem muitas
                    wrapperStyle={{ 
                        paddingTop: '20px', // Espaço entre o gráfico e a legenda
                        overflow: 'hidden' // Garante que não vaze
                    }}
                />
                
                <Pie
                    data={data}
                    dataKey="valor"
                    nameKey="nome"
                    cx="50%" // << 2. GRÁFICO SEMPRE CENTRALIZADO
                    cy="50%" // << 3. CENTRO Y AJUSTADO PARA CIMA
                    outerRadius="80%" // Raio responsivo
                    // Ajuste para garantir que o gráfico não toque as bordas da legenda
                    height="80%" 
                    fill="#8884d8"
                    labelLine={false}
                    label={({ percent, x, y }) => {
                        if ((percent * 100) < 5) return null;
                        return (
                            <text
                                x={x}
                                y={y}
                                fill="white"
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={14}
                                fontWeight="bold"
                            >
                                {`${(percent * 100).toFixed(0)}%`}
                            </text>
                        );
                    }}
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
            </PieChart>
        </ResponsiveContainer>
    );
}