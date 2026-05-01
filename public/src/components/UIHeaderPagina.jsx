// public/src/components/UIHeaderPagina.jsx
import React, { useEffect } from 'react';

const IS_STAGING = import.meta.env.VITE_ENV === 'staging';

function UIHeaderPagina({ titulo, children }) {
  useEffect(() => {
    if (IS_STAGING) {
      document.body.classList.add('gs-tem-banner-staging');
    }
    return () => {
      document.body.classList.remove('gs-tem-banner-staging');
    };
  }, []);

  return (
    <>
      {IS_STAGING && (
        <div className="gs-banner-staging">
          <i className="fas fa-flask"></i>
          <span>AMBIENTE DE TESTE — banco de staging. Alterações aqui <strong>não afetam a produção</strong>.</span>
        </div>
      )}
      <div className="gs-cabecalho-pagina">
        <h1>{titulo}</h1>
        <div className="gs-botoes-cabecalho">
          {children}
        </div>
      </div>
    </>
  );
}

export default UIHeaderPagina;