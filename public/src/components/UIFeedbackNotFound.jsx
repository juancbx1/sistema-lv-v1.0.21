// public/src/components/FeedbackNotFound.jsx
import React from 'react';

/**
 * Um componente global para exibir um feedback de "Nenhum resultado encontrado".
 * @param {object} props
 * @param {string} props.icon - A classe do ícone Font Awesome (ex: 'fa-search').
 * @param {string} props.titulo - O título principal da mensagem.
 * @param {string} props.mensagem - A mensagem de texto de apoio.
 * @param {React.ReactNode} [props.children] - Opcional: Para adicionar botões ou outros elementos.
 */
function FeedbackNotFound({ icon, titulo, mensagem, children }) {
    return (
        <div className="gs-feedback-not-found-container">
            <div className="gs-feedback-not-found-icone">
                <i className={`fas ${icon}`}></i>
            </div>
            <h4 className="gs-feedback-not-found-titulo">{titulo}</h4>
            <p className="gs-feedback-not-found-mensagem">{mensagem}</p>
            {children && (
                <div className="gs-feedback-not-found-acoes">
                    {children}
                </div>
            )}
        </div>
    );
};

export default FeedbackNotFound;