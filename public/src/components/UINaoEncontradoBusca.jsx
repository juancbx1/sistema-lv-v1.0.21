// public/src/components/UINaoEncontradoBusca.jsx
import React from 'react';

const UINaoEncontradoBusca = ({ icon, title, message }) => {
    return (
        <div className="fc-nao-encontrado-container">
            <div className="nao-encontrado-icone">
                <i className={`fas ${icon}`}></i>
            </div>
            <h4 className="nao-encontrado-titulo">{title}</h4>
            <p className="nao-encontrado-mensagem">{message}</p>
        </div>
    );
};

export default UINaoEncontradoBusca;