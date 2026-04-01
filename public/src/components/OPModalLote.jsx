// public/src/components/OPModalLote.jsx
// Modal de confirmação de finalização em lote

import React, { useState } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';

async function fetchAPI(url, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
        throw new Error(errorData.error);
    }
    return response.json();
}

// Verifica se a OP vai ter encerramento parcial
// (quantidade produzida na última etapa < quantidade meta da OP)
function isParcial(op) {
    if (!op.etapas || op.etapas.length === 0) return false;
    const ultimaEtapa = op.etapas[op.etapas.length - 1];
    return (ultimaEtapa?.quantidade_feita || 0) < op.quantidade;
}

export default function OPModalLote({ isOpen, ops, onClose, onConcluido }) {
    const [executando, setExecutando] = useState(false);
    const [resultado, setResultado] = useState(null); // { sucesso: N, erro: N }

    if (!isOpen) return null;

    const temParcial = ops.some(isParcial);

    const handleConfirmar = async () => {
        setExecutando(true);
        const agora = new Date().toISOString();

        const resultados = await Promise.allSettled(
            ops.map(op =>
                fetchAPI('/api/ordens-de-producao', {
                    method: 'PUT',
                    body: JSON.stringify({
                        ...op,
                        status: 'finalizado',
                        data_final: agora
                    })
                })
            )
        );

        const sucesso = resultados.filter(r => r.status === 'fulfilled').length;
        const erro = resultados.filter(r => r.status === 'rejected').length;

        setResultado({ sucesso, erro });
        setExecutando(false);

        if (erro > 0) {
            mostrarMensagem(
                `${sucesso} OP(s) finalizadas. ${erro} falharam — verifique e tente novamente.`,
                'aviso'
            );
        }
    };

    const handleFechar = () => {
        if (resultado) {
            onConcluido(resultado);
        }
        setResultado(null);
        onClose();
    };

    return (
        <div className="op-lote-modal-overlay" onClick={handleFechar}>
            <div className="op-lote-modal" onClick={e => e.stopPropagation()}>

                {resultado ? (
                    /* --- Tela de resultado pós-finalização --- */
                    <>
                        <div className="op-lote-resultado">
                            <span className="op-lote-resultado-icone">
                                {resultado.erro === 0 ? '✅' : '⚠️'}
                            </span>
                            <p className="op-lote-resultado-titulo">
                                {resultado.erro === 0
                                    ? `${resultado.sucesso} OP(s) finalizadas com sucesso!`
                                    : `${resultado.sucesso} finalizadas, ${resultado.erro} com erro`
                                }
                            </p>
                            {resultado.erro > 0 && (
                                <p className="op-lote-resultado-detalhe">
                                    As OPs com erro permanecem na lista. Verifique e tente novamente individualmente.
                                </p>
                            )}
                        </div>
                        <div className="op-lote-modal-footer">
                            <button className="op-lote-btn confirmar" onClick={handleFechar}>
                                <i className="fas fa-check"></i> Fechar
                            </button>
                        </div>
                    </>
                ) : (
                    /* --- Tela de confirmação --- */
                    <>
                        <div className="op-lote-modal-header">
                            <p className="op-lote-modal-titulo">
                                <i className="fas fa-layer-group" style={{ marginRight: 8, color: '#3b82f6' }}></i>
                                Finalizar em Lote
                            </p>
                            <p className="op-lote-modal-subtitulo">
                                {ops.length} Ordem(ns) de Produção serão liberadas para Arremates.
                            </p>
                        </div>

                        <div className="op-lote-modal-lista">
                            {ops.map(op => {
                                const parcial = isParcial(op);
                                return (
                                    <div key={op.edit_id || op.id} className="op-lote-item">
                                        <span className="op-lote-item-num">OP #{op.numero}</span>
                                        <div className="op-lote-item-info">
                                            <div className="op-lote-item-produto">{op.produto || 'Produto'}</div>
                                            <div className="op-lote-item-variante">
                                                {op.variante && op.variante !== '-' ? op.variante : 'Padrão'}
                                            </div>
                                        </div>
                                        <span className="op-lote-item-qtd">{op.quantidade} pçs</span>
                                        {parcial && (
                                            <span className="op-lote-item-badge-parcial">Parcial</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {temParcial && (
                            <div className="op-lote-modal-aviso">
                                <i className="fas fa-exclamation-triangle"></i>
                                <p>
                                    <strong>Atenção:</strong> algumas OPs têm produção inferior à meta.
                                    O saldo restante será registrado como perda ao confirmar.
                                </p>
                            </div>
                        )}

                        <div className="op-lote-modal-footer">
                            <button
                                className="op-lote-btn cancelar"
                                onClick={handleFechar}
                                disabled={executando}
                            >
                                Cancelar
                            </button>
                            <button
                                className="op-lote-btn confirmar"
                                onClick={handleConfirmar}
                                disabled={executando}
                            >
                                {executando
                                    ? <><div className="op-spinner-btn"></div> Finalizando...</>
                                    : <><i className="fas fa-check-double"></i> Confirmar Finalização</>
                                }
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
