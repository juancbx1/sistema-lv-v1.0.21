// public/src/components/LancamentoDetalhes.jsx
import React from 'react';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(value) || 0);

const LancamentoDetalhes = ({ lancamento }) => {
    const isCompra = lancamento.tipo_rateio === 'COMPRA';

    return (
        <div className="card-expanded-details">
            <div className="item-detalhe-grid">
                {/* Cabeçalho visível apenas no Desktop */}
                <div className={`item-detalhe-header ${isCompra ? 'compra' : 'rateio'}`}>
                    {isCompra ? (
                        <>
                            <div>Produto</div>
                            <div>Qtd.</div>
                            <div>V. Unit.</div>
                            <div style={{ textAlign: 'right' }}>Total</div>
                        </>
                    ) : (
                        <>
                            <div>Favorecido</div>
                            <div>Categoria</div>
                            <div>Descrição</div>
                            <div style={{ textAlign: 'right' }}>Valor</div>
                        </>
                    )}
                </div>
                {/* Linhas da Tabela */}
                {lancamento.itens.map(item => (
                    <div className={`item-detalhe-row ${isCompra ? 'compra' : 'rateio'}`} key={item.id}>
                        {isCompra ? (
                            <>
                                <div data-label="Produto:">{item.descricao_item || '-'}</div>
                                <div data-label="Qtd:">{item.quantidade}</div>
                                <div data-label="V. Unit.:">{formatCurrency(item.valor_unitario)}</div>
                                <div data-label="Total:" style={{ fontWeight: 'bold' }}>{formatCurrency(item.valor_total_item)}</div>
                            </>
                        ) : (
                            <>
                                <div data-label="Favorecido:">{item.nome_contato_item || '-'}</div>
                                <div data-label="Categoria:">{item.nome_categoria || '-'}</div>
                                <div data-label="Descrição:">{item.descricao_item || '-'}</div>
                                <div data-label="Valor:" style={{ fontWeight: 'bold' }}>{formatCurrency(item.valor_total_item)}</div>
                            </>
                        )}
                    </div>
                ))}
            </div>
            {lancamento.tipo_rateio === 'COMPRA' && (
                <div className="details-summary">
                    <span>Subtotal: {formatCurrency(lancamento.valor + (lancamento.valor_desconto || 0))}</span>
                    
                    {(lancamento.valor_desconto || 0) > 0 && (
                        <span>Desconto: <span style={{color: 'var(--gs-perigo)'}}>- {formatCurrency(lancamento.valor_desconto)}</span></span>
                    )}

                    <span>Total Pago: <strong>{formatCurrency(lancamento.valor)}</strong></span>
                </div>
            )}
        </div>
    );
};

export default LancamentoDetalhes;