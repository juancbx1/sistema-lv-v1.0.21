// public/src/components/OPFiltros.jsx

import React, { useState, useEffect, useCallback } from 'react';

const statusOptions = [
  { id: 'todas', label: 'Todas Ativas' },
  { id: 'em-aberto', label: 'Em Aberto' },
  { id: 'produzindo', label: 'Produzindo' },
  { id: 'finalizado', label: 'Finalizadas' },
  { id: 'cancelada', label: 'Canceladas' },
];

export default function OPFiltros({ onFiltroChange }) {
  const [statusAtivo, setStatusAtivo] = useState('todas');
  const [termoBusca, setTermoBusca] = useState('');

  const onFiltroChangeCallback = useCallback((status, busca) => {
      onFiltroChange({ status, busca });
  }, [onFiltroChange]); 

  useEffect(() => {
    const timer = setTimeout(() => {
      onFiltroChangeCallback(statusAtivo, termoBusca);
    }, 300);
    return () => clearTimeout(timer);
  }, [statusAtivo, termoBusca, onFiltroChangeCallback]); // A dependência agora é a função memoizada


  return (
    // O container agora é mais simples
    <div className="op-filtros-container-redesenhado">
        <div className="op-filtro-busca-wrapper">
            <i className="fas fa-search"></i>
            <input
                type="text"
                className="op-input-busca-redesenhado"
                placeholder="Buscar por produto, OP ou variação..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
            />
        </div>
        <div className="op-filtro-status-pilulas">
            {statusOptions.map(option => (
                <button
                    key={option.id}
                    className={`op-botao-pilula ${statusAtivo === option.id ? 'active' : ''}`}
                    onClick={() => setStatusAtivo(option.id)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    </div>
  );
}