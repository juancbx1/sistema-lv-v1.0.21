// public/src/main-financeiro-lancamentos.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import LancamentosView from './components/LancamentosView.jsx';

const rootElement = document.getElementById('lancamentos-react-root');
let root = null;

if (rootElement) {
    window.renderizarLancamentosReact = () => {
        if (!root) {
            root = ReactDOM.createRoot(rootElement);
        }
        
        // Renderiza o componente
        root.render(
            <React.StrictMode>
                <LancamentosView />
            </React.StrictMode>
        );
    };
}