import React from 'react';
import ReactDOM from 'react-dom/client';
import ModalLancamento from './components/ModalLancamento.jsx';

const root = ReactDOM.createRoot(document.getElementById('financeiro-modal-root'));

// Criamos uma função global que o JS legado pode chamar
window.renderReactModal = (props) => {
    root.render(
        <React.StrictMode>
            <ModalLancamento {...props} />
        </React.StrictMode>
    );
};