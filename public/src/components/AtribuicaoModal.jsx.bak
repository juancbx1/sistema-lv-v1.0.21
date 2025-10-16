// src/components/AtribuicaoModal.jsx
import React, { useState, useEffect } from 'react';
import { Tooltip } from 'react-tooltip';

// Importa as "telas" que ele vai controlar
import TelaSelecaoProduto from './TelaSelecaoProduto.jsx';
import TelaConfirmacaoQtd from './TelaConfirmacaoQtd.jsx';

export default function AtribuicaoModal({ tiktik, isOpen, onClose }) {
    const [tela, setTela] = useState('lista');
    const [itemSelecionado, setItemSelecionado] = useState(null);

    // Este efeito "escuta" a propriedade 'isOpen'.
    useEffect(() => {
        if (isOpen) {
            setTela('lista');
            setItemSelecionado(null);
        }
    }, [isOpen]); // O array de dependências faz com que este código rode toda vez que 'isOpen' mudar.

    const handleItemSelect = (item) => {
        setItemSelecionado(item);
        setTela('confirmacao');
    };

    const handleVoltar = () => {
        setItemSelecionado(null);
        setTela('lista');
    };

    const handleConfirmacaoFinal = () => {
        onClose();
        window.dispatchEvent(new Event('forcarAtualizacaoPainelTiktik'));
    };


    if (!isOpen) {
        return null;
    }

     return (
        <div className="popup-container" style={{ display: 'flex' }}>
            <div className="popup-overlay" onClick={onClose}></div>
            <div className={`oa-modal-atribuir-v2 ${tela === 'lista' ? 'modo-lista' : 'modo-confirmacao'}`}>
                <div className="oa-modal-header">
                    
                    {tela === 'confirmacao' ? (
                        <button className="btn-voltar-header" onClick={handleVoltar}>
                            <i className="fas fa-arrow-left"></i>
                            <span>Voltar</span>
                        </button>
                    ) : (
                        // Div vazia para manter o alinhamento do título quando o botão não está visível
                        <div style={{width: '80px', flexShrink: 0}}></div> 
                    )}
                    
                    <h3 className="oa-modal-titulo">
                        {/* O título também muda dinamicamente */}
                        {tela === 'lista' ? 'Selecionar Produto para' : 'Confirmar Quantidade para'} 
                        <span className="nome-destaque-modal"> {tiktik?.nome}</span>
                    </h3>
                    
                    <button className="oa-modal-fechar-btn" onClick={onClose}>×</button>
                </div>

                <div className="oa-modal-body">
                    {tela === 'lista' && (
                        <TelaSelecaoProduto onItemSelect={handleItemSelect} />
                    )}
                    {tela === 'confirmacao' && (
                        <TelaConfirmacaoQtd 
                            item={itemSelecionado} 
                            tiktik={tiktik} 
                            onVoltar={handleVoltar} 
                            onConfirmar={handleConfirmacaoFinal} 
                        />
                    )}
                </div>
            </div>

            <Tooltip 
                id="global-tooltip" 
                className="custom-tooltip" 
                place="top" 
                effect="solid"
                 render={({ content }) => {
                    if (!content) return null;
                    try {
                        const ops = JSON.parse(content);
                        return (
                            <ul className="tooltip-lista-ops">
                                {ops.map(op => (
                                    <li key={op.numero}>
                                        <strong>OP {op.numero}:</strong> {op.saldo_op} pçs
                                        <span className="tooltip-data-op">
                                            {new Date(op.data_final).toLocaleDateString('pt-BR')}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        );
                    } catch (e) {
                        return content;
                    }
                }}
            /> 
        </div>
    );
}