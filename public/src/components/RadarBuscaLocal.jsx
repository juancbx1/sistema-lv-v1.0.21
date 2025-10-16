// public/src/components/RadarBuscaLocal.jsx
import React, { useState } from 'react';
import * as searchHelpers from '../utils/RadarLocalSearchHelpers.js';

function RadarBuscaLocal({ id, termoBusca, onBuscaChange, placeholder }) {
    const [mostrarRecentes, setMostrarRecentes] = useState(false);
    const [buscasRecentes, setBuscasRecentes] = useState([]);

    const handleFocus = () => {
        setBuscasRecentes(searchHelpers.getBuscasRecentes(id));
        setMostrarRecentes(true);
    };
    const handleBlur = () => {
        searchHelpers.addBuscaRecente(id, termoBusca);
        setTimeout(() => setMostrarRecentes(false), 150);
    };
    const handleSelectRecente = (termo) => {
        onBuscaChange(termo);
        setMostrarRecentes(false);
    };
    const handleRemoveRecente = (e, termo) => {
        e.stopPropagation();
        searchHelpers.removeBuscaRecente(id, termo);
        setBuscasRecentes(searchHelpers.getBuscasRecentes(id));
    };

    return (
        <div className="gs-busca-wrapper" style={{ margin: '10px 0' }} onMouseLeave={handleBlur}>
            <input 
                type="text" 
                className="gs-input gs-input-busca"
                placeholder={placeholder || "Filtrar na lista..."}
                value={termoBusca}
                onChange={(e) => onBuscaChange(e.target.value)}
                onFocus={handleFocus}
            />
            {termoBusca && (
                <button className="gs-btn-limpar-busca" title="Limpar" onClick={() => onBuscaChange('')}>&times;</button>
            )}

            {mostrarRecentes && buscasRecentes.length > 0 && (
              <div className="gs-buscas-recentes-container">
                <h4 className="gs-buscas-recentes-titulo">BUSCAS RECENTES</h4>
                <div className="gs-buscas-recentes-lista">
                  {buscasRecentes.map((termo) => (
                    <div key={termo} className="gs-pilula-recente" onClick={() => handleSelectRecente(termo)}>
                      <span>{termo}</span>
                      <span className="remover" onClick={(e) => handleRemoveRecente(e, termo)}>&times;</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
    );
}
export default RadarBuscaLocal;