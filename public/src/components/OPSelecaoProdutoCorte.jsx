// public/src/components/OPSelecaoProdutoCorte.jsx

import React from 'react';

// Este é o card individual para cada produto na vitrine
function ProdutoCard({ produto, onSelect }) {
    return (
        <div className="op-corte-produto-card" onClick={() => onSelect(produto)}>
            <div className="op-corte-produto-imagem-container">
                <img src={produto.imagem || '/img/placeholder-image.png'} alt={produto.nome} />
            </div>
            <div className="op-corte-produto-nome">
                {produto.nome}
            </div>
        </div>
    );
}

// Este é o container principal que mostra a vitrine
export default function SelecaoProdutoCorte({ produtos, onProdutoSelect }) {
    return (
        <div className="op-corte-vitrine-container">
            {produtos.map(produto => (
                <ProdutoCard key={produto.id} produto={produto} onSelect={onProdutoSelect} />
            ))}
        </div>
    );
}