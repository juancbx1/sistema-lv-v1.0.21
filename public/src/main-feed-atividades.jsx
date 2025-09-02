// public/src/main-feed-atividades.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import FeedAtividades from './components/FeedAtividades.jsx';

const rootElement = document.getElementById('feed-atividades-root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    // Criamos uma função global para ser chamada pelo JS legado
    window.renderReactFeed = () => {
        root.render(
            <React.StrictMode>
                <FeedAtividades />
            </React.StrictMode>
        );
    };
}