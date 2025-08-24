// public/src/pages/embalagem.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';

import HeaderPagina from '../components/HeaderPagina.jsx';
import PainelFiltros from '../components/PainelFiltros.jsx';

// Agora isso é uma função que podemos EXPORTAR.
// Ela só será executada quando a chamarmos de outro arquivo.
export function renderizarComponentesReactDaEmbalagem({ opcoesDeFiltro }) {
  // --- RENDERIZAÇÃO DO HEADER ---
const headerRootElement = document.getElementById('header-root');
if (headerRootElement) {
  const headerRoot = ReactDOM.createRoot(headerRootElement);
  headerRoot.render(
    <React.StrictMode>
      <HeaderPagina titulo="Painel de Embalagem">
        {/* <<< O BOTÃO AQUI >>> */}
        <button id="btnAbrirHistoricoGeral" className="gs-btn gs-btn-secundario">
          <i className="fas fa-clipboard-list"></i>
          <span>Histórico Geral</span>
        </button>
      </HeaderPagina>
    </React.StrictMode>
  );
}

  // --- RENDERIZAÇÃO DOS FILTROS ---
  const filtrosRootElement = document.getElementById('filtros-root');
  if (filtrosRootElement) {
    const filtrosRoot = ReactDOM.createRoot(filtrosRootElement);
    
    filtrosRoot.render(
      <React.StrictMode>
        {/* Passamos as opções de filtro como uma nova prop */}
        <PainelFiltros
          opcoesDeFiltro={opcoesDeFiltro}
          onFiltrosChange={window.onFiltrosChange}
        />
      </React.StrictMode>
    );
  }
}