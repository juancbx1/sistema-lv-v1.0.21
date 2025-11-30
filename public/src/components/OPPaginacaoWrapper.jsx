// public/src/components/OPPaginacaoWrapper.jsx

import React, { useEffect, useRef } from 'react';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';

export default function PaginacaoWrapper({ totalPages, currentPage, onPageChange }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Chamamos a função legada passando o elemento DOM real (container)
    renderizarPaginacao(
      container,
      totalPages,
      currentPage,
      (novaPagina) => {
        // Quando o botão legado é clicado, chamamos a prop do React
        onPageChange(novaPagina);
      }
    );

    // Limpeza: quando o componente desmontar ou atualizar, limpamos o HTML
    // para evitar duplicação ou vazamento de listeners
    return () => {
        if (container) container.innerHTML = '';
    };
  }, [totalPages, currentPage, onPageChange]);

  // Renderizamos apenas uma div vazia que servirá de container para o JS legado
  return <div ref={containerRef} className="op-paginacao-container"></div>;
}