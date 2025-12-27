// public/src/components/OPGerenciamentoTela.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OPCard } from './OPCard.jsx';
import OPEtapasModal from './OPEtapasModal.jsx'; 
import OPFiltros from './OPFiltros.jsx'; 
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx'; // Usando o wrapper correto
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';

// Recebe a prop vinda do main-op.jsx
export default function OPGerenciamentoTela({ opsPendentesGlobal, onRefreshContadores }) {
  const [ops, setOps] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [opSelecionada, setOpSelecionada] = useState(null);
  const [filtros, setFiltros] = useState({ status: 'todas', busca: '' });
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);

  // Define limite de itens por página
  const ITENS_POR_PAGINA_OPS = 6; 

  // Ref para guardar a última busca realizada e evitar repetição
  const lastSearchParamsRef = useRef(null);

  const buscarDados = useCallback(async (paginaAtual, filtrosAtuais) => {
    // Cria uma assinatura única para esta busca
    const searchSignature = JSON.stringify({ page: paginaAtual, ...filtrosAtuais });
    
    // Se for idêntica à última, ABORTA. (Evita a piscada da segunda busca inútil)
    if (lastSearchParamsRef.current === searchSignature) {
        return; 
    }
    
    lastSearchParamsRef.current = searchSignature;
    setCarregando(true);
    setErro(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Usuário não autenticado.");
      
      const params = new URLSearchParams({ 
          page: paginaAtual,
          limit: ITENS_POR_PAGINA_OPS
      });
      
      if (filtrosAtuais.status && filtrosAtuais.status !== 'todas') {
          params.append('status', filtrosAtuais.status);
      }
      if (filtrosAtuais.busca) {
          params.append('search', filtrosAtuais.busca);
      }

      const [dataOps, todosProdutos] = await Promise.all([
          fetch(`/api/ordens-de-producao?${params.toString()}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
          obterProdutosDoStorage()
      ]);

      if (dataOps.error) throw new Error(dataOps.error);

      // --- NOVO CÓDIGO OTIMIZADO ---
      // Como o Backend já manda os detalhes na lista, só precisamos colocar a imagem correta.
      const opsFinais = dataOps.rows.map(op => {
          const produtoCompleto = todosProdutos.find(p => p.id === op.produto_id);
          
          let imagemDaVariante = produtoCompleto?.imagem || null;
          if (produtoCompleto && op.variante && produtoCompleto.grade) {
              const infoGrade = produtoCompleto.grade.find(g => g.variacao === op.variante);
              if (infoGrade && infoGrade.imagem) {
                  imagemDaVariante = infoGrade.imagem;
              }
          }
          
          // O objeto 'op' já tem as etapas e status atualizados pelo backend
          return { ...op, imagem_produto: imagemDaVariante };
      });
      // -----------------------------

      setOps(opsFinais);
      setTotalPaginas(dataOps.pages || 1);

    } catch (err) {
      console.error("Erro em OPGerenciamentoTela:", err);
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, []); // Sem dependências externas além das constantes

  // UseEffect simplificado
  useEffect(() => {
    buscarDados(pagina, filtros);
  }, [pagina, filtros, buscarDados]);

  // --- CORREÇÃO DA DUPLA PISCADA ---
  const handleFiltroChange = useCallback((novosFiltros) => {
    setFiltros(prev => ({
        status: novosFiltros.status !== undefined ? novosFiltros.status : prev.status,
        busca: novosFiltros.busca !== undefined ? novosFiltros.busca : prev.busca
    }));
    setPagina(1);
  }, []);

  const handleAbrirModal = (op) => { setOpSelecionada(op); setModalAberto(true); };
  const handleFecharModal = () => { setModalAberto(false); setOpSelecionada(null); };
  const handleUpdateOP = () => { 
      // 1. Limpa a "memória" da última busca para forçar o React a buscar de novo
      lastSearchParamsRef.current = null; 
      
      // 2. Busca os dados atualizados da lista
      buscarDados(pagina, filtros);
      
      // 3. Pede para o pai (main-op) atualizar o contador do badge vermelho
      if (onRefreshContadores) onRefreshContadores();
  };

  return (
    <>
      <OPFiltros onFiltroChange={handleFiltroChange} />

      {/* --- BOX DE ATENÇÃO GLOBAL --- */}
      {/* Agora usamos o contador global que vem do Pai via props */}
      {opsPendentesGlobal > 0 && (
          <div style={{
              backgroundColor: '#fff3cd', 
              color: '#856404',           
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '25px',
              marginTop: '10px',
              border: '1px solid #ffeeba',
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
              fontSize: '1rem'
          }}>
              <i className="fas fa-exclamation-circle" style={{fontSize: '1.5rem', color: '#ffc107'}}></i>
              <div>
                  <strong>Atenção Necessária:</strong> 
                  <span style={{display: 'block', marginTop: '2px'}}>
                      Existem <strong>{opsPendentesGlobal}</strong> Ordem(ns) de Produção no total aguardando finalização. 
                      Verifique a lista completa.
                  </span>
              </div>
          </div>
      )}

      {carregando && <div className="spinner" style={{marginTop: '20px'}}>Carregando Ordens de Produção...</div>}
      {erro && <p style={{ color: 'red', textAlign: 'center' }}>Erro: {erro}</p>}
      
      {!carregando && !erro && (
        <>
          <div className="op-cards-container">
            {ops.length > 0 ? (
              ops.map(op => (
                <OPCard key={op.edit_id || op.id} op={op} onClick={handleAbrirModal} />
              ))
            ) : (
              <p style={{ textAlign: 'center', gridColumn: '1 / -1' }}>Nenhuma Ordem de Produção encontrada para os filtros aplicados.</p>
            )}
          </div>
          
          {totalPaginas > 1 && (
            <OPPaginacaoWrapper 
                totalPages={totalPaginas} 
                currentPage={pagina} 
                onPageChange={setPagina} 
            />
          )}
        </>
      )}

      <OPEtapasModal
        op={opSelecionada}
        isOpen={modalAberto}
        onClose={handleFecharModal}
        onUpdateOP={handleUpdateOP}
        // 2. Passe ela para o Modal
        onUpdateGlobal={onRefreshContadores}
      />
    </>
  );
}