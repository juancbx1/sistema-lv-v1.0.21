import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { verificarAutenticacao } from '/js/utils/auth.js';
import CalendarioCompleto from './components/CalendarioCompleto';

class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(e) { return { error: e }; }
    render() {
        if (this.state.error) return <div style={{padding:24,color:'red'}}>Erro ao carregar calendário: {this.state.error.message}</div>;
        return this.props.children;
    }
}

function App() {
    const [carregando, setCarregando] = useState(true);
    const [autenticado, setAutenticado] = useState(false);

    useEffect(() => {
        const checarAuth = async () => {
            try {
                const auth = await verificarAutenticacao('admin/calendario.html', []);
                if (auth) setAutenticado(true);
            } catch(e) {
                console.error('[Calendario] Erro auth:', e);
            }
            setCarregando(false);
        };
        checarAuth();
    }, []);

    if (carregando) return <div style={{padding:24}}>Verificando permissões...</div>;
    if (autenticado) return <ErrorBoundary><CalendarioCompleto /></ErrorBoundary>;
    return null;
}

const rootElement = document.getElementById('root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(<App />);
}
