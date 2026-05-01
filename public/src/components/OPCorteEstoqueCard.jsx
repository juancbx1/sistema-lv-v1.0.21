// public/src/components/OPCorteEstoqueCard.jsx

import React from 'react';

function formatarData(dataISO) {
    if (!dataISO) return 'N/A';
    return new Date(dataISO).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export default function OPCorteEstoqueCard({ corte, produto, onGerarOP, onExcluir, isGerando }) {

    const getImagem = () => {
        if (!produto) return '/img/placeholder-image.png';
        if (corte.variante && produto.grade && Array.isArray(produto.grade)) {
            const g = produto.grade.find(g => g.variacao === corte.variante);
            if (g?.imagem) return g.imagem;
        }
        return produto.imagem || '/img/placeholder-image.png';
    };

    const variante = corte.variante && corte.variante !== '-' ? corte.variante : 'Padrão';

    return (
        <div className="op-corte-card-v2">

            {/* Borda-charme verde: corte disponível em estoque */}
            <div className="card-borda-charme status-cortado"></div>

            {/* Botão excluir */}
            <button
                className="op-corte-card-excluir"
                onClick={e => { e.stopPropagation(); onExcluir?.(corte); }}
                title="Excluir corte do estoque"
                aria-label="Excluir corte"
            >
                <i className="fas fa-trash-alt"></i>
            </button>

            {/* Corpo: imagem | info | quantidade */}
            <div className="op-corte-card-corpo">
                <img
                    src={getImagem()}
                    alt={variante}
                    className="op-corte-card-img"
                />

                <div className="op-corte-card-info">
                    <div className="op-corte-card-meta">
                        <span className="op-corte-card-pc">PC {corte.pn}</span>
                        <span className="op-corte-card-data">
                            <i className="fas fa-calendar-alt"></i>
                            {formatarData(corte.data)}
                        </span>
                    </div>
                    <div className="op-corte-card-variante">{variante}</div>
                    {corte.cortador && (
                        <div className="op-corte-card-cortador">
                            <i className="fas fa-user"></i> {corte.cortador}
                        </div>
                    )}
                </div>

                <div className="op-corte-card-qty">
                    <span className="qty-valor">{corte.quantidade}</span>
                    <span className="qty-label">pçs</span>
                </div>
            </div>

            {/* Tira de ação: Gerar OP */}
            <button
                className="op-corte-card-gerar-op"
                onClick={() => onGerarOP(corte)}
                disabled={isGerando}
            >
                {isGerando ? (
                    <><div className="op-spinner-btn"></div> Gerando OP...</>
                ) : (
                    <><i className="fas fa-arrow-right"></i> Gerar OP</>
                )}
            </button>
        </div>
    );
}
