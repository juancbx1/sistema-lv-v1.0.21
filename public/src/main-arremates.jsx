// public/src/main-arremates.jsx

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Importando TODOS os componentes de seus arquivos separados
import HeaderPagina from './components/HeaderPagina.jsx';
import AtribuicaoModal from './components/ArremateAtribuicaoModal.jsx';

import PerdaModal from './components/ArrematePerdaModal.jsx';

import ArremateModalTempos from './components/ArremateModalTempos.jsx';

// O componente raiz da aplicação React nesta página.
function App() {
    const [modalAberto, setModalAberto] = useState(false);
    const [tiktikSelecionado, setTiktikSelecionado] = useState(null);


    // <<< ESTADO PARA O MODAL DE PERDA >>>
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [perdaModalAberto, setPerdaModalAberto] = useState(false);

    const [modalTemposAberto, setModalTemposAberto] = useState(false)
    
    // Efeito para criar a "ponte" de comunicação do JS puro para o React
    useEffect(() => {
        // <<< ATUALIZE A FUNÇÃO GLOBAL >>>
        window.abrirModalAtribuicao = (tiktik, batchMode) => {
            setTiktikSelecionado(tiktik);
            setIsBatchMode(batchMode); // Define se é lote ou não
            setModalAberto(true);
        };
        return () => { delete window.abrirModalAtribuicao; };
    }, []);

    return (
        <>
            <HeaderPagina titulo="Arremates">
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
                    onClick={() => {
                        // Verifica se a função do JS puro existe antes de chamar
                        if (window.abrirModalHistorico) {
                            window.abrirModalHistorico();
                        } else {
                            console.error("Função abrirModalHistorico não encontrada no escopo global.");
                        }
                    }}
                >
                    <i className="fas fa-clipboard-list"></i>
                    <span>Histórico</span>
                </button>
            </HeaderPagina>

            <AtribuicaoModal 
                isOpen={modalAberto} 
                tiktik={tiktikSelecionado}
                isBatchMode={isBatchMode} 
                onClose={() => setModalAberto(false)} 
            />
            
             <PerdaModal
                isOpen={perdaModalAberto}
                onClose={() => setPerdaModalAberto(false)}
            />

            <ArremateModalTempos 
                isOpen={modalTemposAberto}
                onClose={() => setModalTemposAberto(false)}
            />
        </>
    );
}

// Ponto de entrada final
const appRootElement = document.getElementById('app-react-root');
if (appRootElement) {
    ReactDOM.createRoot(appRootElement).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}