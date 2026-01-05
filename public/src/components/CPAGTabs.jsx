import React from 'react';

export default function CPAGTabs({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'comissao', label: 'Comissão', icon: 'fa-percent' },
    { id: 'bonus', label: 'Bônus e Premiações', icon: 'fa-star' },
    { id: 'passagem', label: 'Passagem', icon: 'fa-bus-alt' },
    { id: 'salario', label: 'Salário', icon: 'fa-file-invoice-dollar' },
    { id: 'beneficios', label: 'Benefícios', icon: 'fa-gift' },
    { id: 'recibos', label: 'Recibos', icon: 'fa-file-contract' },
  ];

  return (
    <div className="cpg-tabs-container">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`cpg-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <i className={`fas ${tab.icon}`}></i>
          <span className="cpg-tab-text">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}