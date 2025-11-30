// public/src/components/OPEtapaRow.jsx

import React from 'react';

export default function OPEtapaRow({ etapa, index, op, usuarios }) {
  const isLancado = etapa.lancado;
  
  // Encontra o objeto do usuário que realizou a etapa, se houver
  const usuarioDaEtapa = isLancado ? usuarios.find(u => u.id === etapa.usuario) : null;

  // Determina o status visual da etapa
  const etapaAtualIndex = op.etapas.findIndex(e => !e.lancado);
  const isEtapaAtual = index === etapaAtualIndex;
  const isPendente = !isLancado && !isEtapaAtual;

  return (
    // A classe principal agora reflete o status de forma mais clara
    <div className={`op-etapa-consulta-row ${isLancado ? 'concluida' : ''} ${isEtapaAtual ? 'atual' : ''} ${isPendente ? 'pendente' : ''}`}>
        <div className="etapa-numero-status">
            <span className="numero">{index + 1}</span>
        </div>
        <div className="etapa-info-principal">
            <h4>{etapa.processo}</h4>
            <div className="etapa-info-usuario">
                <i className="fas fa-user"></i>
                {/* Lógica para exibir o nome do usuário ou a mensagem de pendente */}
                <span>{isLancado ? (usuarioDaEtapa?.nome || 'Lançado') : 'Aguardando produção'}</span>
            </div>
        </div>
        <div className="etapa-info-quantidade">
            {isLancado ? (
                <>
                    <span className="valor">{etapa.quantidade}</span>
                    <span className="label">pçs</span>
                </>
            ) : (
                <span className="valor-pendente">-</span>
            )}
        </div>
    </div>
  );
}