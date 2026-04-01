// public/src/components/NaoEncontradoBusca.jsx
import React from 'react';

const NaoEncontradoBusca = ({ icon, title, message }) => {
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

export default NaoEncontradoBusca;