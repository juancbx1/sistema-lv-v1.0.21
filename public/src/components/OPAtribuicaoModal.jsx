// public/src/components/OPAtribuicaoModal.jsx

import React, { useState, useEffect } from 'react';

import OPTelaSelecaoEtapa from './OPTelaSelecaoEtapa.jsx';
import OPTelaConfirmacaoQtd from './OPTelaConfirmacaoQtd.jsx';

export default function OPAtribuicaoModal({ funcionario, isOpen, onClose }) {
  const [telaAtual, setTelaAtual] = useState('selecao');
  const [etapaSelecionada, setEtapaSelecionada] = useState(null);

  // Reseta para a tela inicial sempre que o modal for reaberto
  useEffect(() => {
    if (isOpen) {
      setTelaAtual('selecao');
      setEtapaSelecionada(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }
  
  const handleEtapaSelect = (etapa) => {
    setEtapaSelecionada(etapa);
    setTelaAtual('confirmacao');
  };
  
  const handleVoltar = () => {
    setTelaAtual('selecao');
    setEtapaSelecionada(null);
  };

  return (
    <div className="popup-container" style={{ display: 'flex' }}>
    <div className="popup-overlay" onClick={onClose}></div>
    <div className={`op-modal-atribuir-v2 ${telaAtual === 'selecao' ? 'modo-lista' : 'modo-confirmacao'}`}>
      <div className="op-modal-header">
        {telaAtual === 'confirmacao' && (
          <button className="btn-voltar-header" onClick={handleVoltar}>
            <i className="fas fa-arrow-left"></i> Voltar
          </button>
        )}
        <h3 className="op-modal-titulo">
            {telaAtual === 'selecao' ? 'Selecionar Tarefa para' : 'Confirmar Quantidade para'}
            <span className="nome-destaque-modal"> {funcionario?.nome}</span>
          </h3>
          <button className="op-modal-fechar-btn" onClick={onClose}>×</button>
        </div>
        <div className="op-modal-body">
            {/* 2. LÓGICA DE RENDERIZAÇÃO CONDICIONAL */}
            {telaAtual === 'selecao' && (
              <OPTelaSelecaoEtapa 
                  onEtapaSelect={handleEtapaSelect} 
                  funcionario={funcionario} 
              />
          )}

            {telaAtual === 'confirmacao' && etapaSelecionada && (
                <OPTelaConfirmacaoQtd
                    etapa={etapaSelecionada}
                    funcionario={funcionario}
                    onClose={onClose} // Passa a função para fechar o modal principal após o sucesso
                />
            )}
        </div>
      </div>
    </div>
  );
}