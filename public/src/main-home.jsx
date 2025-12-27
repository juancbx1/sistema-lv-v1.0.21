// public/src/main-home.jsx

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { verificarAutenticacao } from '/js/utils/auth.js';

// Componentes
import HOMEHeader from './components/HOMEHeader.jsx';
import HOMEQuickActions from './components/HOMEQuickActions.jsx';
import HOMENews from './components/HOMENews.jsx';

function App() {
    const [usuario, setUsuario] = useState(null);
    const [permissoes, setPermissoes] = useState([]);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        async function init() {
            // Apenas autenticação. Sem fetches pesados.
            const auth = await verificarAutenticacao('home.html', []);
            if (!auth) {
                window.location.href = '/login.html';
                return;
            }
            
            setUsuario(auth.usuario);
            setPermissoes(auth.permissoes || []);
            setAuthLoading(false);
        }
        init();
    }, []);

    if (authLoading) return null; // Tela branca rápida enquanto verifica token

    return (
        <div className="home-content-wrapper">
            {/* 1. Saudação + Data */}
            <HOMEHeader usuario={usuario} />
            
            {/* 2. Novidades (Importante para comunicação) */}
            <HOMENews />

            {/* 3. O Protagonista: Menu de Ações */}
            <HOMEQuickActions permissoes={permissoes} />
        </div>
    );
}

const rootElement = document.getElementById('home-react-root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
}