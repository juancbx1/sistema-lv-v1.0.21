// public/src/main-relatorios-financeiro.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import RelatoriosView from './components/RelatoriosView.jsx';

const rootElement = document.getElementById('relatorios-financeiro-root');

if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    // Função global que será chamada pelo JS legado para iniciar o componente
    window.renderReactRelatorios = () => {
        root.render(
            <React.StrictMode>
                <RelatoriosView />
            </React.StrictMode>
        );
    };
}