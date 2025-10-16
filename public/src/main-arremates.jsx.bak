// public/src/main-arremates.jsx

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Importando TODOS os componentes de seus arquivos separados
import HeaderPagina from './components/HeaderPagina.jsx';
import AtribuicaoModal from './components/AtribuicaoModal.jsx';

import PerdaModal from './components/PerdaModal.jsx';

// O componente raiz da aplicação React nesta página.
function App() {
    const [modalAberto, setModalAberto] = useState(false);
    const [tiktikSelecionado, setTiktikSelecionado] = useState(null);

    // <<< 1. ADICIONE O NOVO ESTADO PARA O MODAL DE PERDA >>>
    const [perdaModalAberto, setPerdaModalAberto] = useState(false);
    
    // Efeito para criar a "ponte" de comunicação do JS puro para o React
    useEffect(() => {
        // Expõe a função para que o admin-arremates.js possa chamá-la
        window.abrirModalAtribuicao = (tiktik) => {
            setTiktikSelecionado(tiktik);
            setModalAberto(true);
        };
        // Limpa a função quando o componente é desmontado
        return () => { 
            delete window.abrirModalAtribuicao; 
        };
    }, []); // Array vazio garante que rode apenas uma vez

    return (
        <>
            <HeaderPagina titulo="Arremates">
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
                onClose={() => setModalAberto(false)} 
            />
             <PerdaModal
                isOpen={perdaModalAberto}
                onClose={() => setPerdaModalAberto(false)}
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