import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip,
    ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';

const HORAS = Array.from({ length: 12 }, (_, i) => i + 7); // 7h a 18h

function CustomTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="pg-timeline-tooltip">
            <strong>{d.hora}</strong>
            <div>{d.pontos.toFixed(0)} pts</div>
            <div>{d.pecas} peças</div>
        </div>
    );
}

function PGTimeline({ atividades, metaPontos }) {
    const dados = useMemo(() => {
        const mapa = new Map(
            HORAS.map(h => [h, { hora: `${String(h).padStart(2, '0')}h`, pontos: 0, pecas: 0 }])
        );
        for (const a of atividades) {
            const h = parseInt(
                new Date(a.data_hora).toLocaleString('en-US', {
                    timeZone: 'America/Sao_Paulo',
                    hour: 'numeric',
                    hour12: false,
                }),
                10
            );
            if (mapa.has(h)) {
                const cur = mapa.get(h);
                cur.pontos += a.pontos_gerados;
                cur.pecas  += a.quantidade;
            }
        }
        return [...mapa.values()].map(d => ({ ...d, pontos: parseFloat(d.pontos.toFixed(1)) }));
    }, [atividades]);

    // Ritmo esperado: meta distribuída em 8h de trabalho
    const ritmoHora = metaPontos > 0 ? parseFloat((metaPontos / 8).toFixed(1)) : null;

    return (
        <div className="pg-timeline">
            <ResponsiveContainer width="100%" height={150}>
                <BarChart data={dados} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    {ritmoHora && (
                        <ReferenceLine
                            y={ritmoHora}
                            stroke="#f39c12"
                            strokeDasharray="5 3"
                            strokeWidth={1.5}
                            label={{ value: 'ritmo', position: 'insideTopRight', fontSize: 9, fill: '#f39c12' }}
                        />
                    )}
                    <Bar dataKey="pontos" radius={[3, 3, 0, 0]}>
                        {dados.map((d, i) => (
                            <Cell
                                key={i}
                                fill={ritmoHora && d.pontos > 0
                                    ? (d.pontos >= ritmoHora ? '#27ae60' : '#3498db')
                                    : '#c0c0c0'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            {ritmoHora && (
                <p className="pg-timeline-legenda">
                    <span className="pg-timeline-legenda-pontilhada"></span> Ritmo esperado ({ritmoHora} pts/h)
                </p>
            )}
        </div>
    );
}

export default PGTimeline;
