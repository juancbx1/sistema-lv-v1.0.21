import React, { useState, useEffect } from 'react';
import CPAGHeader from './CPAGHeader';
import CPAGComissao from './CPAGComissao';
import CPAGBonus from './CPAGBonus';
import CPAGPassagem from './CPAGPassagem';
import CPAGSalario from './CPAGSalario';
import CPAGBeneficios from './CPAGBeneficios';

const CPAGRecibos = ({ usuarios }) => <div><h3>Gerador de Recibos (Em breve)</h3></div>;

export default function CPAGCentralPagamentos({ permissoes }) {
  const [activeTab, setActiveTab] = useState('comissao');
  const [usuarios, setUsuarios] = useState([]);
  const [contasFinanceiras, setContasFinanceiras] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregarDadosIniciais = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [resUsers, resFin] = await Promise.all([
            fetch('/api/usuarios', { headers }),
            fetch('/api/financeiro/configuracoes', { headers })
        ]);

        const usersData = await resUsers.json();
        const finData = await resFin.json();

        // --- FILTRO DE USUÁRIOS (REGRA DE NEGÓCIO 2) ---
        // 1. Deve ser elegível para pagamento
        // 2. Deve ter data_admissao preenchida
        // 3. NÃO deve ter data_demissao preenchida
        const usuariosFiltrados = Array.isArray(usersData) 
            ? usersData.filter(u => 
                u.elegivel_pagamento === true &&
                u.data_admissao && 
                !u.data_demissao
              )
            : [];

        // Ordenar alfabeticamente para ficar bonito no select
        usuariosFiltrados.sort((a, b) => a.nome.localeCompare(b.nome));

        setUsuarios(usuariosFiltrados);
        setContasFinanceiras(finData.contas || []);
        setLoading(false);
      } catch (error) {
        console.error("Erro ao carregar dados iniciais:", error);
        alert("Erro ao carregar dados do sistema.");
        setLoading(false);
      }
    };

    carregarDadosIniciais();
  }, []);

  if (loading) {
    return (
      <div className="cpg-spinner-overlay">
        <div className="cpg-spinner-container">
             <div className="cpg-spinner-dots"><div></div><div></div><div></div></div>
             <span className="cpg-spinner-texto">Carregando dados...</span>
        </div>
      </div>
    );
  }

  return (
    // --- CORREÇÃO CSS (ITEM 1): Adicionando a classe da margem aqui ---
    <div className="cpg-main-container">
      
      <div className="cpg-pagina-cabecalho-container">
        <CPAGHeader 
            titulo="Central de Pagamentos" 
            breadcrumbs={['Financeiro', 'Central de Pagamentos']} 
        />

        <div className="cpg-view-switcher">
          <button className={`cpg-btn-switch ${activeTab === 'comissao' ? 'active' : ''}`} onClick={() => setActiveTab('comissao')}>
            <i className="fas fa-percent"></i> Comissão
          </button>
          <button className={`cpg-btn-switch ${activeTab === 'bonus' ? 'active' : ''}`} onClick={() => setActiveTab('bonus')}>
            <i className="fas fa-star"></i> Bônus
          </button>
          <button className={`cpg-btn-switch ${activeTab === 'passagem' ? 'active' : ''}`} onClick={() => setActiveTab('passagem')}>
            <i className="fas fa-bus-alt"></i> Passagem
          </button>
          <button className={`cpg-btn-switch ${activeTab === 'salario' ? 'active' : ''}`} onClick={() => setActiveTab('salario')}>
            <i className="fas fa-file-invoice-dollar"></i> Salário
          </button>
          <button 
            className={`cpg-btn-switch ${activeTab === 'beneficios' ? 'active' : ''}`} 
            onClick={() => setActiveTab('beneficios')}
          >
            <i className="fas fa-gift"></i> Benefícios
          </button>
        </div>
      </div>

      <div className="cpg-conteudo-principal">
          {activeTab === 'comissao' && <CPAGComissao usuarios={usuarios} contas={contasFinanceiras} />}
          {activeTab === 'bonus' && <CPAGBonus usuarios={usuarios} contas={contasFinanceiras} />}
          {activeTab === 'passagem' && <CPAGPassagem usuarios={usuarios} contas={contasFinanceiras} />}
          {/* Aba Salário */}
          {activeTab === 'salario' && (
             <CPAGSalario usuarios={usuarios} contas={contasFinanceiras} />
          )}
          {/* Aba Benefícios */}
          {activeTab === 'beneficios' && (
             <CPAGBeneficios usuarios={usuarios} contas={contasFinanceiras} />
          )}
      </div>
    </div>
  );
}