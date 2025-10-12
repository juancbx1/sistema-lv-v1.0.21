// NOVO ARQUIVO: public/src/components/ArremateAcoesLote.jsx

import React from 'react';

// Estilos embutidos para simplicidade
const styles = {
    container: {
        position: 'fixed',
        bottom: '0',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 40px)',
        maxWidth: '600px',
        backgroundColor: 'var(--gs-secundaria)',
        color: 'var(--gs-branco)',
        borderRadius: '12px 12px 0 0',
        padding: '15px 25px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 -5px 20px rgba(0,0,0,0.15)',
        zIndex: 100,
        transition: 'transform 0.3s ease-out',
    },
    info: {
        fontWeight: 500,
    },
    count: {
        backgroundColor: 'var(--gs-primaria)',
        borderRadius: '50px',
        padding: '4px 10px',
        marginLeft: '10px',
    }
};

export default function ArremateAcoesLote({ contagem, onAtribuirClick }) {
    // Adiciona uma transformação para o efeito de "deslizar para cima"
    const containerStyle = {
        ...styles.container,
        transform: contagem > 0 ? 'translate(-50%, 0)' : 'translate(-50%, 100%)',
    };

    return (
        <div style={containerStyle}>
            <div style={styles.info}>
                <span>
                    {contagem} {contagem === 1 ? 'item selecionado' : 'itens selecionados'}
                </span>
            </div>
            <button 
                className="gs-btn gs-btn-sucesso"
                onClick={onAtribuirClick}
            >
                <i className="fas fa-users"></i>
                <span>Atribuir Lote</span>
            </button>
        </div>
    );
}