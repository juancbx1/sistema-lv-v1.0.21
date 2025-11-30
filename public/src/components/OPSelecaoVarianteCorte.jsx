// public/src/components/OPSelecaoVarianteCorte.jsx

import React, { useState, useMemo } from 'react';

export default function OPSelecaoVarianteCorte({ produto, onVarianteSelect }) {
  const [filtro, setFiltro] = useState('');
  const [corSelecionada, setCorSelecionada] = useState(null);

  const { temTamanhos, gruposDeVariantes } = useMemo(() => {
    if (!produto?.grade || produto.grade.length === 0) {
      return { temTamanhos: false, gruposDeVariantes: [] };
    }

    const _temTamanhos = produto.grade.some(g => g.variacao.includes('|'));

    if (!_temTamanhos) {
      return { temTamanhos: false, gruposDeVariantes: produto.grade };
    } else {
      const grupos = produto.grade.reduce((acc, item) => {
        const partes = item.variacao.split('|').map(p => p.trim());
        const cor = partes[0];
        const tamanho = partes[1] || '';

        if (!acc[cor]) {
          acc[cor] = { cor: cor, imagem: item.imagem, tamanhos: [] };
        }
        acc[cor].tamanhos.push({ nome: tamanho, variacaoCompleta: item.variacao });
        return acc;
      }, {});
      return { temTamanhos: true, gruposDeVariantes: Object.values(grupos) };
    }
  }, [produto]);

  const variantesFiltradas = gruposDeVariantes.filter(item =>
    (item.cor || item.variacao).toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="op-corte-variante-container">
      <div className="op-corte-filtro-wrapper">
        <input
          type="text"
          className="op-input-busca-redesenhado"
          placeholder={`Buscar por ${temTamanhos ? 'cor' : 'variação'}...`}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      <div className="op-corte-vitrine-container">
        {variantesFiltradas.map((item, index) => {
            const isSelected = corSelecionada === item.cor;
            
            return (
              <div 
                key={index} 
                className="op-corte-variante-card"
                style={{ position: 'relative' }} // Garante contexto para o overlay
              >
                <div
                  className="op-corte-produto-imagem-container"
                  onClick={() => !temTamanhos ? onVarianteSelect(item.variacao) : setCorSelecionada(item.cor)}
                >
                  <img src={item.imagem || produto.imagem || '/img/placeholder-image.png'} alt={item.cor || item.variacao} />
                </div>
                
                <div className="op-corte-produto-nome">
                  {item.cor || item.variacao}
                </div>
                
                {/* --- OVERLAY DE TAMANHOS (Melhorado) --- */}
                {temTamanhos && isSelected && (
                  <div 
                    className="op-corte-tamanhos-container"
                    style={{
                        position: 'absolute', inset: 0, 
                        backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                        display: 'flex', flexDirection: 'column', 
                        alignItems: 'center', justifyContent: 'center',
                        zIndex: 10, animation: 'fadeIn 0.2s ease-out'
                    }}
                    onClick={(e) => e.stopPropagation()} // Evita fechar ao clicar no fundo branco
                  >
                    <button 
                        onClick={() => setCorSelecionada(null)}
                        style={{
                            position: 'absolute', top: 5, right: 5,
                            background: 'none', border: 'none', fontSize: '1.2rem', color: '#666', cursor: 'pointer'
                        }}
                    >
                        <i className="fas fa-times"></i>
                    </button>

                    <h4 style={{marginBottom: '15px', color: '#333'}}>Selecione o Tamanho</h4>
                    
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', width: '90%'}}>
                        {item.tamanhos.map(t => (
                        <button 
                            key={t.nome} 
                            className="op-botao-tamanho"
                            style={{ width: 'auto', minWidth: '60px', padding: '8px 15px' }}
                            onClick={() => onVarianteSelect(t.variacaoCompleta)}
                        >
                            {t.nome}
                        </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
        })}
      </div>
    </div>
  );
}