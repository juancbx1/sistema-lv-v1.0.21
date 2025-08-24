// public/src/components/PainelFiltros.jsx

import React, { useState, useEffect } from 'react';
import { getBuscasRecentes, addBuscaRecente, removeBuscaRecente } from '../utils/searchHelpers.js';
import FiltrosAtivos from './FiltrosAtivos.jsx';

// ==========================================================================
//  SUB-COMPONENTE: SecaoFiltro
// ==========================================================================
function SecaoFiltro({ titulo, opcoes, filtrosSelecionados, onFiltroChange }) {
  if (!opcoes || opcoes.length === 0) {
    return null;
  }
  return (
    <div className="gs-filtro-secao">
      <h4 className="gs-filtro-titulo">{titulo}</h4>
      <ul className="gs-filtro-lista">
        {opcoes.map(opcao => (
          <li key={opcao}>
            <label>
              <input
                type="checkbox"
                checked={filtrosSelecionados.includes(opcao)}
                onChange={() => onFiltroChange(opcao)}
              />
              <span>{opcao}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ==========================================================================
//  COMPONENTE PRINCIPAL: PainelFiltros
// ==========================================================================
function PainelFiltros({ opcoesDeFiltro, onFiltrosChange }) {

  // --- ESTADO (A "MEMÓRIA" DO COMPONENTE) ---
  const [termoBusca, setTermoBusca] = useState('');
  const [produtosSelecionados, setProdutosSelecionados] = useState([]);
  const [coresSelecionadas, setCoresSelecionadas] = useState([]);
  const [tamanhosSelecionados, setTamanhosSelecionados] = useState([]);
  const [ordenacao, setOrdenacao] = useState('padrao');
  
  const [filtrosMobileAberto, setFiltrosMobileAberto] = useState(false);
  
  const [mostrarRecentes, setMostrarRecentes] = useState(false);
  const [buscasRecentes, setBuscasRecentes] = useState([]);

  // --- EFEITOS (AÇÕES AUTOMÁTICAS) ---
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      const filtros = { 
        termoBusca, ordenacao,
        produtos: produtosSelecionados,
        cores: coresSelecionadas,
        tamanhos: tamanhosSelecionados,
      };
      if (window.onFiltrosChange) {
        window.onFiltrosChange(filtros);
      }
      addBuscaRecente(termoBusca);
    }, 350);
    return () => clearTimeout(debounceTimer);
  }, [termoBusca, ordenacao, produtosSelecionados, coresSelecionadas, tamanhosSelecionados]);

  // --- HANDLERS (FUNÇÕES DE EVENTO) ---
  const handleFiltroCheckboxChange = (opcao, filtrosAtuais, setFiltros) => {
    const novosFiltros = filtrosAtuais.includes(opcao)
      ? filtrosAtuais.filter(item => item !== opcao)
      : [...filtrosAtuais, opcao];
    setFiltros(novosFiltros);
  };

  // FUNÇÃO para remover um filtro (chamada pelas pílulas)
  const handleRemoverFiltro = (tipoFiltro, valor) => {
    if (tipoFiltro === 'produtos') {
      setProdutosSelecionados(prev => prev.filter(p => p !== valor));
    }
    if (tipoFiltro === 'cores') {
      setCoresSelecionadas(prev => prev.filter(c => c !== valor));
    }
    if (tipoFiltro === 'tamanhos') {
      setTamanhosSelecionados(prev => prev.filter(t => t !== valor));
    }
  };
  
  const handleLimparTodosOsFiltros = () => {
    setTermoBusca('');
    setProdutosSelecionados([]);
    setCoresSelecionadas([]);
    setTamanhosSelecionados([]);
    setOrdenacao('padrao');
  };

  const handleFocoNaBusca = () => {
    setBuscasRecentes(getBuscasRecentes());
    setMostrarRecentes(true);
  };
  const handleSelecionarRecente = (termo) => {
    setTermoBusca(termo);
    setMostrarRecentes(false);
  };
  const handleRemoverRecente = (e, termo) => {
    e.stopPropagation();
    removeBuscaRecente(termo);
    setBuscasRecentes(getBuscasRecentes());
  };
  const handleAtualizarClick = () => {
    window.dispatchEvent(new CustomEvent('forcarAtualizacaoFila'));
  };

  const filtrosAtivosCount = produtosSelecionados.length + coresSelecionadas.length + tamanhosSelecionados.length;
  

  // --- RENDERIZAÇÃO (JSX) ---
  return (
    <div className="gs-card gs-filtros-container">
      {/* ====================================================== */}
      {/* CABEÇALHO: Contém Título, Busca e Botão Atualizar      */}
      {/* O CSS vai reorganizar estes 3 itens para Desktop vs Mobile */}
      {/* ====================================================== */}
      <div className="gs-filtros-header">
        <h3 className="gs-header-titulo">Produtos na Fila</h3>
        
        <div className="gs-filtros-header-controles">
          <div className="gs-busca-wrapper" onMouseLeave={() => setMostrarRecentes(false)}>
            <input
              type="text"
              className="gs-input gs-input-busca"
              placeholder="Buscar por produto, variação ou SKU..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              onFocus={handleFocoNaBusca}
            />
            {termoBusca && (
              <button className="gs-btn-limpar-busca" title="Limpar busca" onClick={() => setTermoBusca('')}>
                &times;
              </button>
            )}

            {mostrarRecentes && !termoBusca && buscasRecentes.length > 0 && (
              <div className="gs-buscas-recentes-container">
                <h4 className="gs-buscas-recentes-titulo">BUSCAS RECENTES</h4>
                <div className="gs-buscas-recentes-lista">
                  {buscasRecentes.map((termo) => (
                    <div key={termo} className="gs-pilula-recente" onClick={() => handleSelecionarRecente(termo)}>
                      <span>{termo}</span>
                      <span className="remover" onClick={(e) => handleRemoverRecente(e, termo)}>&times;</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <button className="gs-btn-atualizar" onClick={handleAtualizarClick}>
            <i className="fas fa-sync-alt"></i>
            <span>Atualizar</span>
        </button>
      </div>

      {/* ====================================================== */}
      {/* PÍLULAS DE FILTROS ATIVOS (NOVA SEÇÃO)                */}
      {/* Este componente só aparece se houver filtros aplicados */}
      {/* ====================================================== */}
      <FiltrosAtivos 
        filtros={{
          produtos: produtosSelecionados,
          cores: coresSelecionadas,
          tamanhos: tamanhosSelecionados
        }}
        onRemoverFiltro={handleRemoverFiltro}
        onLimparTudo={handleLimparTodosOsFiltros}
      />

      {/* ====================================================== */}
      {/* BOTÃO MOBILE: Aparece apenas em telas pequenas        */}
      {/* ====================================================== */}
      <div className="gs-filtros-mobile-toggle">
        <button className="gs-btn gs-btn-secundario" onClick={() => setFiltrosMobileAberto(!filtrosMobileAberto)}>
          <i className="fas fa-filter"></i>
          <span>{filtrosMobileAberto ? 'Fechar Filtros' : 'Abrir Filtros'}</span>
          {filtrosAtivosCount > 0 && (
            <span className="gs-filtro-badge">{filtrosAtivosCount}</span>
          )}
        </button>
      </div>

      {/* ====================================================== */}
      {/* CONTEÚDO ACORDEÃO: Contém os painéis de filtro       */}
      {/* O CSS controla sua visibilidade em Desktop vs Mobile   */}
      {/* ====================================================== */}
      <div className={`gs-filtros-acordeao-conteudo ${filtrosMobileAberto ? 'aberto' : ''}`}>
        <div className="gs-filtros-paineis">
          <SecaoFiltro
            titulo="Produto"
            opcoes={opcoesDeFiltro?.produtos || []}
            filtrosSelecionados={produtosSelecionados}
            onFiltroChange={(opcao) => handleFiltroCheckboxChange(opcao, produtosSelecionados, setProdutosSelecionados)}
          />
          <SecaoFiltro
            titulo="Cor"
            opcoes={opcoesDeFiltro?.cores || []}
            filtrosSelecionados={coresSelecionadas}
            onFiltroChange={(opcao) => handleFiltroCheckboxChange(opcao, coresSelecionadas, setCoresSelecionadas)}
          />
          <SecaoFiltro
            titulo="Tamanho"
            opcoes={opcoesDeFiltro?.tamanhos || []}
            filtrosSelecionados={tamanhosSelecionados}
            onFiltroChange={(opcao) => handleFiltroCheckboxChange(opcao, tamanhosSelecionados, setTamanhosSelecionados)}
          />
          
          <div className="gs-filtro-secao">
            <h4 className="gs-filtro-titulo">Ordenar por</h4>
            <select className="gs-select" value={ordenacao} onChange={e => setOrdenacao(e.target.value)}>
              <option value="padrao">Padrão (Mais Antigos)</option>
              <option value="mais_recentes">Mais Recentes</option>
              <option value="maior_quantidade">Maior Quantidade</option>
              <option value="menor_quantidade">Menor Quantidade</option>
            </select>
          </div>
        </div>
        
        <div className="gs-filtros-footer">
          <button className="gs-btn-link" onClick={handleLimparTodosOsFiltros}>
              <i className="fas fa-times-circle"></i> Limpar todos os filtros
          </button>
        </div>
      </div>
    </div>
  );
}

export default PainelFiltros;