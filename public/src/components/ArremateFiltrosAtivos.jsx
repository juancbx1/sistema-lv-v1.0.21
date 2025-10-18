// public/src/components/ArremateFiltrosAtivos.jsx
import React from 'react';

// Este componente recebe os filtros ativos e as funções para removê-los
function FiltrosAtivos({ filtros, onRemoverFiltro, onLimparTudo }) {
  const { produtos = [], cores = [], tamanhos = [] } = filtros;
  const totalFiltros = produtos.length + cores.length + tamanhos.length;

  // Se não houver filtros ativos, não renderiza nada.
  if (totalFiltros === 0) {
    return null;
  }

  return (
    <div className="gs-filtros-ativos-container">
      <span className="gs-filtros-ativos-titulo">Filtros Ativos:</span>
      <div className="gs-filtros-ativos-lista">
        {/* Mapeia e cria uma pílula para cada filtro de produto */}
        {produtos.map(p => (
          <div key={`prod-${p}`} className="gs-pilula-ativa">
            <span>{p}</span>
            <button onClick={() => onRemoverFiltro('produtos', p)}>&times;</button>
          </div>
        ))}
        {/* Mapeia e cria uma pílula para cada filtro de cor */}
        {cores.map(c => (
          <div key={`cor-${c}`} className="gs-pilula-ativa">
            <span>{c}</span>
            <button onClick={() => onRemoverFiltro('cores', c)}>&times;</button>
          </div>
        ))}
        {/* Mapeia e cria uma pílula para cada filtro de tamanho */}
        {tamanhos.map(t => (
          <div key={`tam-${t}`} className="gs-pilula-ativa">
            <span>{t}</span>
            <button onClick={() => onRemoverFiltro('tamanhos', t)}>&times;</button>
          </div>
        ))}
      </div>
      <button className="gs-btn-limpar-filtros-ativos" onClick={onLimparTudo}>
        <i className="fas fa-times-circle"></i>
        <span>Limpar Tudo</span>
      </button>
    </div>
  );
}

export default FiltrosAtivos;