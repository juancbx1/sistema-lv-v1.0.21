import React from 'react';
import ReactDOM from 'react-dom/client';
import FinanceiroHeader from './components/FinanceiroHeader.jsx';

// Procura o 'portal' que criamos no HTML
const rootElement = document.getElementById('financeiro-header-root');

if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <FinanceiroHeader />
        </React.StrictMode>
    );
} else {
    console.error("Elemento root '#financeiro-header-root' não encontrado no DOM.");
}