// public/src/components/ArremateAtribuicaoModal.jsx

import React, { useState, useEffect } from 'react';
import { Tooltip } from 'react-tooltip';

import ArremateTelaSelecaoProduto from './ArremateTelaSelecaoProduto.jsx';
import ArremateTelaConfirmacaoQtd from './ArremateTelaConfirmacaoQtd.jsx';

/**
 * Modal unificado de atribuição de tarefa.
 * O usuário sempre entra em modo de seleção — pode selecionar 1 (individual)
 * ou 2+ produtos (lote). O FAB dentro de ArremateTelaSelecaoProduto determina o fluxo:
 *   - 1 selecionado  → avança para tela de confirmação de quantidade
 *   - 2+ selecionados → abre mini-modal de confirmação de lote
 */
export default function ArremateAtribuicaoModal({ tiktik, isOpen, onClose, itensPréselecionados }) {
    const [tela, setTela] = useState('selecao');
    const [itemSelecionado, setItemSelecionado] = useState(null);

    // Reseta o modal ao abrir
    useEffect(() => {
        if (isOpen) {
            setTela('selecao');
            setItemSelecionado(null);
        }
    }, [isOpen]);

    // Fluxo individual: 1 item selecionado no FAB → tela de confirmação de quantidade
    const handleItemSelect = (item) => {
        setItemSelecionado(item);
        setTela('confirmacao');
    };

    const handleVoltar = () => {
        setItemSelecionado(null);
        setTela('selecao');
    };

    // Qualquer conclusão (individual ou lote) fecha o modal e atualiza o painel
    const handleConfirmacaoFinal = () => {
        onClose();
        window.dispatchEvent(new Event('forcarAtualizacaoPainelTiktik'));
    };

    if (!isOpen) return null;

    return (
        <div className="popup-container" style={{ display: 'flex' }}>
            <div className="popup-overlay" onClick={onClose}></div>
            <div className={`oa-modal-atribuir-v2 ${tela === 'selecao' ? 'modo-lista' : 'modo-confirmacao'}`}>

                {/* Header */}
                <div className="arremate-modal-header">
                    <div className="arremate-modal-header-esquerda">
                        {tela === 'confirmacao' && (
                            <button className="btn-voltar-header" onClick={handleVoltar}>
                                <i className="fas fa-arrow-left"></i>
                                <span>Voltar</span>
                            </button>
                        )}
                    </div>
                    <div className="arremate-modal-header-centro">
                        <h3 className="arremate-modal-titulo">
                            {tela === 'selecao' ? 'Atribuir Tarefa' : 'Confirmar Quantidade'}
                            {tiktik?.nome && (
                                <span className="nome-destaque-modal"> — {tiktik.nome.split(' ')[0]}</span>
                            )}
                        </h3>
                    </div>
                    <div className="arremate-modal-header-direita">
                        <button className="arremate-modal-fechar-btn" onClick={onClose}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="oa-modal-body">
                    {tela === 'selecao' && (
                        <ArremateTelaSelecaoProduto
                            onItemSelect={handleItemSelect}
                            onLoteConfirmado={handleConfirmacaoFinal}
                            isBatchMode={true}
                            tiktikContexto={tiktik}
                            itensPréselecionados={itensPréselecionados}
                        />
                    )}

                    {tela === 'confirmacao' && itemSelecionado && (
                        <ArremateTelaConfirmacaoQtd
                            item={itemSelecionado}
                            tiktik={tiktik}
                            onVoltar={handleVoltar}
                            onConfirmar={handleConfirmacaoFinal}
                        />
                    )}
                </div>
            </div>

            {/* Tooltip global para os cards */}
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
