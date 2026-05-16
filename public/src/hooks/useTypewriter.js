// public/src/hooks/useTypewriter.js
// Hook que cicla por um array de frases com animação typewriter.
//
// Parâmetros:
//   frases:      string[]  — array de frases para ciclar
//   velocidade?: number    — ms por caractere (padrão: 38)
//   pausaMs?:   number    — ms de espera após frase completa (padrão: 3000)
//   loop?:      boolean   — se true, cicla infinitamente; se false, para na 1ª frase com cursor piscando (padrão: true)
//
// Retorna:
//   { texto: string, fase: 'typing'|'waiting'|'fading', completo: boolean }
//
// Ciclo (loop=true):
//   1. [typing]  — adiciona um caractere por vez a cada `velocidade` ms
//   2. [waiting] — quando frase completa, aguarda `pausaMs` ms
//   3. [fading]  — dispara opacity-0 via CSS (450ms) e depois avança para a próxima frase
//   4. Volta ao passo 1 com texto vazio
//
// Ciclo (loop=false):
//   1. [typing]  — digita a frase completa
//   2. Fica parado com cursor piscando — não avança, não faz fade

import { useState, useEffect, useRef } from 'react';

export default function useTypewriter(frases, velocidade = 38, pausaMs = 3000, loop = true) {
    const [fraseIdx, setFraseIdx] = useState(0);
    const [charIdx, setCharIdx]   = useState(0);
    const [fase, setFase]         = useState('typing'); // 'typing' | 'waiting' | 'fading'

    const timerRef   = useRef(null);
    const frasesRef  = useRef(frases);

    const frase = frases[fraseIdx % frases.length] ?? '';

    // Reinicia o ciclo quando o array de frases troca (ex: idle → parcial → alerta)
    useEffect(() => {
        if (frasesRef.current !== frases) {
            frasesRef.current = frases;
            clearTimeout(timerRef.current);
            setFraseIdx(0);
            setCharIdx(0);
            setFase('typing');
        }
    }, [frases]);

    // Motor do typewriter
    useEffect(() => {
        clearTimeout(timerRef.current);

        if (fase === 'typing') {
            if (charIdx < frase.length) {
                // Digita próximo caractere
                timerRef.current = setTimeout(
                    () => setCharIdx(c => c + 1),
                    velocidade
                );
            } else if (loop) {
                // Frase completa em modo loop — entra em espera antes de fade
                timerRef.current = setTimeout(() => setFase('fading'), pausaMs);
            }
            // Se loop === false e frase completa: não faz nada — cursor fica piscando

        } else if (fase === 'fading') {
            // Espera a transição CSS terminar (~450ms) e avança para a próxima frase
            timerRef.current = setTimeout(() => {
                setFraseIdx(i => (i + 1) % frases.length);
                setCharIdx(0);
                setFase('typing');
            }, 450);
        }

        return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fase, charIdx, frase, loop]);

    return {
        texto: frase.slice(0, charIdx),
        fase,
        // true quando terminou de digitar a frase atual (cursor fica piscando esperando)
        completo: charIdx >= frase.length,
    };
}
