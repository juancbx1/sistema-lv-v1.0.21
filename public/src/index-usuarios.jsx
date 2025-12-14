import React from 'react';
import ReactDOM from 'react-dom/client';
import MainUsuarios from './main-usuarios';

// Importa o CSS global se você estiver usando ele via JS agora, 
// ou deixe que o HTML carregue o CSS como já faz.

const rootElement = document.getElementById('root-usuarios');

if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <MainUsuarios />
        </React.StrictMode>
    );
} else {
    console.error("Elemento 'root-usuarios' não encontrado no HTML!");
}