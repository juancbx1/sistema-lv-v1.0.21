// public/src/main-arremates.jsx

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Importando TODOS os componentes de seus arquivos separados
import UIHeaderPagina from './components/UIHeaderPagina.jsx';
import AtribuicaoModal from './components/ArremateAtribuicaoModal.jsx';

import PerdaModal from './components/ArrematePerdaModal.jsx';

import ArremateModalTempos from './components/ArremateModalTempos.jsx';
import BotaoBuscaFunil from './components/BotaoBuscaFunil.jsx';
import AlertasFAB from './components/AlertasFAB.jsx';
import { verificarAutenticacao } from '/js/utils/auth.js';

// O componente raiz da aplicação React nesta página.
function App() {
    const [modalAberto, setModalAberto] = useState(false);
    const [tiktikSelecionado, setTiktikSelecionado] = useState(null);
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [perdaModalAberto, setPerdaModalAberto] = useState(false);
    const [modalTemposAberto, setModalTemposAberto] = useState(false);
    const [permissoes, setPermissoes] = useState([]);

    useEffect(() => {
        verificarAutenticacao('admin/arremates.html', ['acesso-ordens-de-arremates']).then(auth => {
            if (auth) setPermissoes(auth.permissoes || []);
        });
    }, []);

    // Efeito para criar a "ponte" de comunicação do JS puro para o React
    useEffect(() => {
        window.abrirModalAtribuicao = (tiktik, batchMode) => {
            setTiktikSelecionado(tiktik);
            setIsBatchMode(batchMode);
            setModalAberto(true);
        };
        return () => { delete window.abrirModalAtribuicao; };
    }, []);

     return (
        // Usamos React.Fragment <> para agrupar múltiplos componentes
        <>
            {/* 1. COMPONENTES VISÍVEIS NO FLUXO NORMAL DA PÁGINA */}
            <UIHeaderPagina titulo="Arremates">
                <button 
                    className="gs-btn gs-btn-secundario gs-btn-com-icone"
                    onClick={() => setModalTemposAberto(true)}
                    title="Configurar Tempos Padrão"
                >
                    <i className="fas fa-clock"></i>
                    <span>Tempos Padrão</span>
                </button>

                <button 
                    id="btnAbrirModalPerda" 
                    className="gs-btn gs-btn-perigo gs-btn-com-icone"
                    onClick={() => setPerdaModalAberto(true)}
                >
                    <i className="fas fa-exclamation-triangle"></i>
                    <span>Registrar Perda</span>
                </button>

                <button 
                    id="btnAbrirHistorico" 
                    className="gs-btn gs-btn-secundario gs-btn-com-icone"
                    onClick={() => window.abrirModalHistorico?.()}
                >
                    <i className="fas fa-clipboard-list"></i>
                    <span>Histórico</span>
                </button>
            </UIHeaderPagina>

            {/* 2. COMPONENTES FLUTUANTES (MODAIS E FAB) */}
            
            {/* Modais são renderizados aqui, mas só aparecem quando seus estados 'isOpen' são verdadeiros */}
            <AtribuicaoModal isOpen={modalAberto} tiktik={tiktikSelecionado} isBatchMode={isBatchMode} onClose={() => setModalAberto(false)} />
            <PerdaModal isOpen={perdaModalAberto} onClose={() => setPerdaModalAberto(false)} />
            <ArremateModalTempos isOpen={modalTemposAberto} onClose={() => setModalTemposAberto(false)} />

            {/* O Botão FAB é renderizado aqui e se posicionará corretamente via CSS */}
            <BotaoBuscaFunil permissoes={permissoes} />
            <AlertasFAB />
        </>
    );
}

// ==========================================================================
// PONTO DE ENTRADA ÚNICO
// ==========================================================================
const appRootElement = document.getElementById('app-react-root');
if (appRootElement) {
    ReactDOM.createRoot(appRootElement).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}