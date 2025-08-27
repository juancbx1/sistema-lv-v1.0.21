// public/src/main-arremates.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';

// Importa os componentes React que já existem e vamos reutilizar
import HeaderPagina from './components/HeaderPagina.jsx';
import PainelFiltros from './components/PainelFiltros.jsx';

// Função que será chamada pelo nosso JavaScript "puro" (admin-arremates.js)
function renderizarComponentesReactArremates(dados) {
    const { opcoesDeFiltro } = dados;

    // 1. Renderiza o Header no portal #header-root
    const headerRootElement = document.getElementById('header-root');
    if (headerRootElement) {
        const headerRoot = ReactDOM.createRoot(headerRootElement);
        headerRoot.render(
            <React.StrictMode>
                <HeaderPagina titulo="Arremates">
                    {/* Este é o botão de histórico. Note as classes globais 'gs-' */}
                    {/* Adicionamos 'gs-btn-com-icone' para o estilo mobile */}
                    <button id="btnAbrirHistorico" className="gs-btn gs-btn-secundario gs-btn-com-icone">
                        <i className="fas fa-clipboard-list"></i>
                        <span>Histórico</span>
                    </button>
                </HeaderPagina>
            </React.StrictMode>
        );
    }

    // 2. Renderiza os Filtros no portal #filtros-root
    const filtrosRootElement = document.getElementById('filtros-root');
    if (filtrosRootElement) {
        const filtrosRoot = ReactDOM.createRoot(filtrosRootElement);
        filtrosRoot.render(
            <React.StrictMode>
                {/* O painel de filtros é genérico, só precisa das opções e da função de callback */}
                <PainelFiltros
                    opcoesDeFiltro={opcoesDeFiltro}
                    onFiltrosChange={window.onArrematesFiltrosChange} // Usaremos este nome para a "ponte"
                />
            </React.StrictMode>
        );
    }
}

// Deixa a função de renderização disponível globalmente para o admin-arremates.js
window.renderizarComponentesReactArremates = renderizarComponentesReactArremates;