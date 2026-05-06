// public/src/components/ArremateExternoTela.jsx
// Aba inline para lançamento de arremate por prestador externo (freelance tiktik).
// Espelha o fluxo de ArremateAtribuicaoModal:
//   — seleção múltipla com batch mode (bolinhas + FAB)
//   — 1 item → tela de confirmação de quantidade (usa /api/arremates/externo)
//   — 2+ itens → mini-modal de lote (usa /api/arremates/externo via onConfirmarLote)

import React, { useState } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import ArremateTelaSelecaoProduto from './ArremateTelaSelecaoProduto.jsx';
import ArremateTelaConfirmacaoQtd from './ArremateTelaConfirmacaoQtd.jsx';

// id: null sinaliza modo externo para ArremateTelaConfirmacaoQtd (usa endpoint /externo)
const FAKE_TIKTIK = { id: null, nome: 'Prestador Externo', status_atual: 'LIVRE', tipos: ['tiktik'] };

// Distribui a quantidade máxima de cada item pelas OPs e retorna itensPayload
function distribuirPorOps(itens) {
    const itensPayload = [];
    for (const item of itens) {
        let quantidadeRestante = item.saldo_para_arrematar;
        const opsOrdenadas = (item.ops_detalhe || []).sort((a, b) => a.numero - b.numero);
        for (const op of opsOrdenadas) {
            if (quantidadeRestante <= 0) break;
            const qtd = Math.min(quantidadeRestante, op.saldo_op);
            if (qtd > 0) {
                itensPayload.push({
                    op_numero: op.numero,
                    op_edit_id: op.edit_id,
                    produto_id: item.produto_id,
                    variante: item.variante === '-' ? null : item.variante,
                    quantidade_arrematada: qtd,
                });
                quantidadeRestante -= qtd;
            }
        }
    }
    return itensPayload;
}

export default function ArremateExternoTela() {
    const [tela, setTela] = useState('selecao');
    const [itemSelecionado, setItemSelecionado] = useState(null);

    // Fluxo individual: 1 item selecionado via FAB → tela de confirmação
    const handleItemSelect = (item) => {
        setItemSelecionado(item);
        setTela('confirmacao');
    };

    const handleVoltar = () => {
        setItemSelecionado(null);
        setTela('selecao');
    };

    // Qualquer conclusão (individual ou lote) volta para seleção e atualiza a fila
    const handleConfirmacaoFinal = () => {
        setItemSelecionado(null);
        setTela('selecao');
        window.dispatchEvent(new Event('atualizar-fila-react'));
        window.dispatchEvent(new Event('forcarAtualizacaoPainelTiktik'));
    };

    // Handler de lote externo — fornecido a ArremateTelaSelecaoProduto via onConfirmarLote
    // É chamado quando o usuário confirma 2+ itens no mini-modal interno
    const handleConfirmarLoteExterno = async (itens) => {
        const itensPayload = distribuirPorOps(itens);
        if (itensPayload.length === 0) throw new Error('Nenhuma OP disponível para os itens selecionados.');

        const token = localStorage.getItem('token');
        const res = await fetch('/api/arremates/externo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ itens: itensPayload }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erro ao registrar lote externo.');
        }
        mostrarMensagem('Lote externo registrado com sucesso!', 'sucesso');
    };

    return (
        <div className="gs-card op-externo-tela-wrapper">

            {/* Header — espelho do arremate-modal-header do AtribuicaoModal */}
            <div className="arremate-modal-header op-externo-tela-header">
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
                        <span className="nome-destaque-modal"> — P. Externo</span>
                    </h3>
                </div>
                <div className="arremate-modal-header-direita">
                    <span className="op-externo-badge">
                        <i className="fas fa-user-tie"></i> Freelance
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="op-externo-tela-body">
                {tela === 'selecao' && (
                    <ArremateTelaSelecaoProduto
                        onItemSelect={handleItemSelect}
                        onLoteConfirmado={handleConfirmacaoFinal}
                        onConfirmarLote={handleConfirmarLoteExterno}
                        isBatchMode={true}
                        tiktikContexto={FAKE_TIKTIK}
                    />
                )}

                {tela === 'confirmacao' && itemSelecionado && (
                    <ArremateTelaConfirmacaoQtd
                        item={itemSelecionado}
                        tiktik={FAKE_TIKTIK}
                        onVoltar={handleVoltar}
                        onConfirmar={handleConfirmacaoFinal}
                    />
                )}
            </div>
        </div>
    );
}
