// public/src/components/OPCorteEstoqueCard.jsx

import React from 'react';

function formatarData(dataISO) {
    if (!dataISO) return 'N/A';
    return new Date(dataISO).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export default function OPCorteEstoqueCard({ corte, produto, onGerarOP, isGerando }) {
    const getImagemCorreta = () => {
        const placeholder = '/img/placeholder-image.png';
        if (!produto) return placeholder; // Se o produto não for encontrado, usa placeholder

        // Tenta encontrar a imagem da variante específica na grade do produto
        if (corte.variante && produto.grade && Array.isArray(produto.grade)) {
            const gradeInfo = produto.grade.find(g => g.variacao === corte.variante);
            if (gradeInfo && gradeInfo.imagem) {
                return gradeInfo.imagem; // Encontrou! Retorna a imagem da variante.
            }
        }

        // Se não encontrou na grade, retorna a imagem principal do produto.
        return produto.imagem || placeholder;
    };

    const imagemSrc = getImagemCorreta();

    return (
        <div className="op-corte-estoque-card">
            <div className="op-corte-estoque-imagem">
                {/* O nome do produto no 'alt' agora vem do objeto produto, mais confiável */}
                <img src={imagemSrc} alt={produto?.nome || 'Produto'} />
            </div>
            <div className="op-corte-estoque-info">
                {/* O nome do produto aqui também vem do objeto produto */}
                <h4>{produto?.nome || corte.produto}</h4>
                <p>{corte.variante || 'Padrão'}</p>
                <div className="op-corte-estoque-detalhes">
                    <span><strong>PC:</strong> {corte.pn}</span>
                    <span><strong>Data:</strong> {formatarData(corte.data)}</span>
                </div>
            </div>
            <div className="op-corte-estoque-quantidade">
                <span className="valor">{corte.quantidade}</span>
                <span className="label">pçs</span>
            </div>
            <div className="op-corte-estoque-acao">
                <button 
                    className="op-botao op-botao-principal" 
                    onClick={() => onGerarOP(corte)}
                    // Desabilita o botão se este card estiver processando
                    disabled={isGerando}
                >
                    {isGerando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-arrow-right"></i>}
                    {isGerando ? 'Gerando...' : 'Gerar OP'}
                </button>
            </div>
        </div>
    );
}