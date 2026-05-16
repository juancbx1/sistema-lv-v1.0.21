// public/src/hooks/useContador.js
// Anima um número de 0 até `alvo` ao longo de `duracaoMs` ms.
// Retorna o valor atual (inteiro).

import { useState, useEffect } from 'react';

export default function useContador(alvo, duracaoMs = 900, ativo = true) {
    const [valor, setValor] = useState(0);

    useEffect(() => {
        if (!ativo || alvo <= 0) { setValor(0); return; }
        setValor(0);
        const inicio = Date.now();
        const timer = setInterval(() => {
            const elapsed = Date.now() - inicio;
            const progresso = Math.min(elapsed / duracaoMs, 1);
            // Easing: acelera no começo, desacelera no fim (cúbico)
            const eased = 1 - Math.pow(1 - progresso, 3);
            setValor(Math.round(alvo * eased));
            if (progresso >= 1) clearInterval(timer);
        }, 16); // ~60fps
        return () => clearInterval(timer);
    }, [alvo, duracaoMs, ativo]);

    return valor;
}
