// public/src/components/OPCorteEstoqueCard.jsx

import React from 'react';

function formatarData(dataISO) {
    if (!dataISO) return 'N/A';
    return new Date(dataISO).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export default function OPCorteEstoqueCard({ corte, produto, onGerarOP, onExcluir, isGerando }) {
    const getImagemCorreta = () => {
        const placeholder = '/img/placeholder-image.png';
        if (!produto) return placeholder;

        if (corte.variante && produto.grade && Array.isArray(produto.grade)) {
            const gradeInfo = produto.grade.find(g => g.variacao === corte.variante);
            if (gradeInfo && gradeInfo.imagem) {
                return gradeInfo.imagem;
            }
        }
        return produto.imagem || placeholder;
    };

    const imagemSrc = getImagemCorreta();

    return (
        <div className="op-corte-estoque-card" style={{position: 'relative'}}>
            
            {/* --- BOTÃO DE EXCLUIR (LIXEIRA) --- */}
            <button 
                className="btn-excluir-corte"
                style={{
                    position: 'absolute', top: '10px', right: '10px',
                    background: 'none', border: 'none', color: '#ccc', 
                    cursor: 'pointer', fontSize: '1rem', padding: '5px',
                    zIndex: 2 // Garante que fique clicável
                }}
                onClick={(e) => {
                    e.stopPropagation(); // Não dispara outros cliques
                    if (onExcluir) onExcluir(corte);
                }}
                title="Excluir Corte do Estoque"
                onMouseOver={(e) => e.currentTarget.style.color = '#c0392b'}
                onMouseOut={(e) => e.currentTarget.style.color = '#ccc'}
            >
                <i className="fas fa-trash"></i>
            </button>

            <div className="op-corte-estoque-imagem">
                <img src={imagemSrc} alt={produto?.nome || 'Produto'} />
            </div>
            <div className="op-corte-estoque-info">
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
                    disabled={isGerando}
                >
                    {isGerando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-arrow-right"></i>}
                    {isGerando ? 'Gerando...' : 'Gerar OP'}
                </button>
            </div>
        </div>
    );
}