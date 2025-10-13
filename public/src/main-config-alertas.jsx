// public/src/main-config-alertas.jsx

import React, { useState, useEffect } from 'react'; // Importe useState e useEffect
import ReactDOM from 'react-dom/client';
import { verificarAutenticacao } from '/js/utils/auth.js';
import ConfigAlertasPage from './pages/ConfigAlertas/ConfigAlertasPage.jsx';

function App() {
    const [carregando, setCarregando] = useState(true);
    const [autenticado, setAutenticado] = useState(false);

    useEffect(() => {
        const checarAuth = async () => {
            const auth = await verificarAutenticacao('admin/config-alertas.html', ['configurar-alertas']);

            if (auth) {
                setAutenticado(true);
            }
            setCarregando(false);
        };

        checarAuth();
    }, []);

    if (carregando) {
        return <div className="spinner">Verificando permissões...</div>;
    }

    if (autenticado) {
        return <ConfigAlertasPage />;
    }

    return null;
}

const rootElement = document.getElementById('root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}