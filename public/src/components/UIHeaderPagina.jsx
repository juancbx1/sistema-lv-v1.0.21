// public/src/components/HeaderPagina.jsx
import React from 'react';

function HeaderPagina({ titulo, children }) {
  return (
    <div className="gs-cabecalho-pagina">
      <h1>{titulo}</h1>
      <div className="gs-botoes-cabecalho">
        {}
        {children}
      </div>
    </div>
  );
}

export default HeaderPagina;