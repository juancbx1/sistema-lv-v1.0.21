// src/components/Paginacao.jsx

import React, { useEffect, useRef } from 'react';

// Este componente React não renderiza nada diretamente.
// Sua única função é chamar a sua função de paginação do JS puro.
function Paginacao({ paginaAtual, totalPaginas, onPageChange }) {
    const containerRef = useRef(null); // Cria uma referência para o div

    useEffect(() => {
        // Verifica se a função de paginação do JS puro está disponível no window
        if (window.renderizarPaginacao && containerRef.current) {
            // Chama a sua função!
            window.renderizarPaginacao(
                containerRef.current,
                totalPaginas,
                paginaAtual,
                onPageChange // Passa a função de callback (setPaginaAtual)
            );
        }
    }, [paginaAtual, totalPaginas, onPageChange]); // Roda sempre que os dados mudam

    // Retorna o div que a sua função Paginacao.js vai usar como container
    return <div ref={containerRef} className="gs-paginacao-container"></div>;
}

export default Paginacao;