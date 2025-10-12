//public/src/components/ArremateAtribuicaoModal.jsx

import React, { useState, useEffect } from 'react';
import { Tooltip } from 'react-tooltip';

// Importa as "telas" que ele vai controlar
import TelaSelecaoProduto from './ArremateTelaSelecaoProduto.jsx';
import TelaConfirmacaoQtd from './ArremateTelaConfirmacaoQtd.jsx';

// A assinatura da função foi simplificada. Ela não precisa mais de 'onComplete'.
export default function AtribuicaoModal({ tiktik, isOpen, onClose, isBatchMode }) {
    const [tela, setTela] = useState('lista');
    const [itemSelecionado, setItemSelecionado] = useState(null);

    // Este efeito reseta o modal para a tela inicial sempre que ele é aberto.
    useEffect(() => {
        if (isOpen) {
            setTela('lista');
            setItemSelecionado(null);
        }
    }, [isOpen]);

    // Função para o fluxo de TAREFA INDIVIDUAL.
    // Chamada pela TelaSelecaoProduto quando um card é clicado (e não está em modo lote).
    const handleItemSelect = (item) => {
        setItemSelecionado(item);
        setTela('confirmacao'); // Muda para a tela de confirmação de quantidade
    };

    // Função para voltar da tela de confirmação para a lista de produtos.
    const handleVoltar = () => {
        setItemSelecionado(null);
        setTela('lista');
    };

    // Função chamada quando uma atribuição (seja individual ou em lote) é concluída com sucesso.
    // Tanto a TelaConfirmacaoQtd quanto a TelaSelecaoProduto (no fluxo de lote) chamarão esta função.
    const handleConfirmacaoFinal = () => {
        onClose(); // A única responsabilidade é fechar o modal principal.
        // O evento abaixo garante que o painel de Tiktiks seja atualizado.
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
                    
                    {/* O botão 'Voltar' só aparece na tela de confirmação individual */}
                    {tela === 'confirmacao' && (
                        <button className="btn-voltar-header" onClick={handleVoltar}>
                            <i className="fas fa-arrow-left"></i>
                            <span>Voltar</span>
                        </button>
                    )}
                    
                    <h3 className="oa-modal-titulo">
                        {tela === 'lista' ? 'Selecionar Produto para' : 'Confirmar Quantidade para'} 
                        <span className="nome-destaque-modal"> {tiktik?.nome}</span>
                    </h3>
                    
                    <button className="oa-modal-fechar-btn" onClick={onClose}>×</button>
                </div>

                <div className="oa-modal-body">
                    {/* Se a tela for 'lista', renderiza o componente de seleção de produtos */}
                    {tela === 'lista' && (
                        <TelaSelecaoProduto 
                            onItemSelect={handleItemSelect} // Para o fluxo individual
                            onLoteConfirmado={handleConfirmacaoFinal} // Para o fluxo de lote
                            isBatchMode={isBatchMode}
                            tiktikContexto={tiktik}
                        />
                    )}

                    {/* Se a tela for 'confirmacao' E houver um item selecionado, renderiza a confirmação */}
                    {tela === 'confirmacao' && itemSelecionado && (
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