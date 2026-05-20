// public/src/main-incentivos.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { verificarAutenticacao } from '/js/utils/auth.js';
import UIHeaderPagina from './components/UIHeaderPagina.jsx';
import UICarregando from './components/UICarregando.jsx';
import IncenGincanasTab from './components/IncenGincanasTab.jsx';
import IncenMetasTab from './components/IncenMetasTab.jsx';
import IncenPontosTab from './components/IncenPontosTab.jsx';
import IncenPagamentosTab from './components/IncenPagamentosTab.jsx';

function App() {
    const [carregando, setCarregando] = useState(true);
    const [autenticado, setAutenticado] = useState(false);
    const [aba, setAba] = useState('gincanas');
    const [modalNovaGincanaAberto, setModalNovaGincanaAberto] = useState(false);

    useEffect(() => {
        const checarAuth = async () => {
            const auth = await verificarAutenticacao('admin/incentivos.html', ['acesso-ponto-por-processo']);
            if (auth) setAutenticado(true);
            setCarregando(false);
        };
        checarAuth();
    }, []);

    if (carregando) return <UICarregando variante="pagina" />;
    if (!autenticado) return null;

    return (
        <>
            <UIHeaderPagina titulo="Centro de Incentivos">
                {aba === 'gincanas' && (
                    <button
                        className="gs-btn gs-btn-primario"
                        onClick={() => setModalNovaGincanaAberto(true)}
                    >
                        <i className="fas fa-plus"></i> Nova Gincana
                    </button>
                )}
            </UIHeaderPagina>

            <nav className="gs-tab-nav">
                <button
                    className={`gs-tab-btn ${aba === 'gincanas' ? 'ativo' : ''}`}
                    onClick={() => setAba('gincanas')}
                >
                    <i className="fas fa-trophy"></i> Gincanas
                </button>
                <button
                    className={`gs-tab-btn ${aba === 'metas' ? 'ativo' : ''}`}
                    onClick={() => setAba('metas')}
                >
                    <i className="fas fa-bullseye"></i> Metas e Comissões
                </button>
                <button
                    className={`gs-tab-btn ${aba === 'pontos' ? 'ativo' : ''}`}
                    onClick={() => setAba('pontos')}
                >
                    <i className="fas fa-star"></i> Pontos por Atividade
                </button>
                <button
                    className={`gs-tab-btn ${aba === 'pagamentos' ? 'ativo' : ''}`}
                    onClick={() => setAba('pagamentos')}
                >
                    <i className="fas fa-coins"></i> Pagamentos
                </button>
            </nav>

            <div className="gs-conteudo-pagina">
                {aba === 'gincanas' && (
                    <IncenGincanasTab
                        modalNovaGincanaAberto={modalNovaGincanaAberto}
                        onFecharModalNova={() => setModalNovaGincanaAberto(false)}
                    />
                )}
                {aba === 'metas'      && <IncenMetasTab />}
                {aba === 'pontos'     && <IncenPontosTab />}
                {aba === 'pagamentos' && <IncenPagamentosTab />}
            </div>
        </>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
