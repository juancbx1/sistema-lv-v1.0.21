// public/src/components/PerdaModal.jsx

import React, { useState, useEffect } from 'react';

// Reutilizaremos o componente de seleção de produto
import TelaSelecaoProduto from './TelaSelecaoProduto.jsx';

// Criaremos este componente em breve
import FormularioPerda from './FormularioPerda.jsx';

export default function PerdaModal({ isOpen, onClose }) {
    const [tela, setTela] = useState('selecao_produto'); // 'selecao_produto' ou 'formulario_perda'
    const [itemSelecionado, setItemSelecionado] = useState(null);

    // Efeito para resetar o modal quando ele abre
    useEffect(() => {
        if (isOpen) {
            setTela('selecao_produto');
            setItemSelecionado(null);
        }
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const handleItemSelect = (item) => {
        setItemSelecionado(item);
        setTela('formulario_perda');
    };

    const handleVoltar = () => {
        setItemSelecionado(null);
        setTela('selecao_produto');
    };

    // Função que será chamada após o registro da perda ser um sucesso
    const handleConfirmacaoFinal = () => {
        onClose(); // Fecha o modal
        // Dispara um evento para o JS puro saber que precisa atualizar a dashboard
        window.dispatchEvent(new Event('forcarAtualizacaoFilaDeArremates'));
    };

    return (
        <div className="popup-container" style={{ display: 'flex' }}>
            <div className="popup-overlay" onClick={onClose}></div>
            <div className={`oa-modal-atribuir-v2 ${tela === 'selecao_produto' ? 'modo-lista' : 'modo-confirmacao'}`}>
                <div className="oa-modal-header">
                    {tela === 'formulario_perda' && (
                        <button className="btn-voltar-header" onClick={handleVoltar}>
                            <i className="fas fa-arrow-left"></i>
                            <span>Voltar</span>
                        </button>
                    )}
                    <h3 className="oa-modal-titulo">
                        {tela === 'selecao_produto' ? 'Registrar Perda: Selecione o Produto' : 'Detalhes da Perda'}
                    </h3>
                    <button className="oa-modal-fechar-btn" onClick={onClose}>×</button>
                </div>
                <div className="oa-modal-body">
                    {tela === 'selecao_produto' && (
                        <TelaSelecaoProduto onItemSelect={handleItemSelect} />
                    )}
                    {tela === 'formulario_perda' && (
                        <FormularioPerda 
                            item={itemSelecionado} 
                            onConfirmar={handleConfirmacaoFinal} 
                        />
                    )}
                </div>
            </div>
        </div>
    );
}