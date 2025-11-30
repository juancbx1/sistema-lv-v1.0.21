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

  const buscarDados = useCallback(async (paginaAtual, filtrosAtuais) => {
    setCarregando(true);
    setErro(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Usuário não autenticado.");
      
      const params = new URLSearchParams({ 
          page: paginaAtual,
          limit: ITENS_POR_PAGINA_OPS // Limite ajustado para 6
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

      // Enriquecimento apenas para as OPs da página atual que estão 'produzindo'
      // para garantir que o botão 'Finalizar' dentro do card (se houvesse) funcionasse,
      // mas principalmente para exibir dados corretos.
      const opsParaEnriquecer = dataOps.rows.filter(op => op.status === 'produzindo');

      const detalhesPromises = opsParaEnriquecer.map(op => 
          fetch(`/api/ordens-de-producao/${op.edit_id || op.numero}`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null)
      );

      const detalhesReais = await Promise.all(detalhesPromises);

      const opsFinais = dataOps.rows.map(op => {
          const detalheFresco = detalhesReais.find(d => d && d.id === op.id);
          const opDadosFinais = detalheFresco || op;

          const produtoCompleto = todosProdutos.find(p => p.id === opDadosFinais.produto_id);
          let imagemDaVariante = produtoCompleto?.imagem || null;
          if (produtoCompleto && opDadosFinais.variante && produtoCompleto.grade) {
              const infoGrade = produtoCompleto.grade.find(g => g.variacao === opDadosFinais.variante);
              if (infoGrade && infoGrade.imagem) {
                  imagemDaVariante = infoGrade.imagem;
              }
          }
          return { ...opDadosFinais, imagem_produto: imagemDaVariante };
      });

      setOps(opsFinais);
      setTotalPaginas(dataOps.pages || 1);

    } catch (err) {
      console.error("Erro em OPGerenciamentoTela:", err);
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    buscarDados(pagina, filtros);
  }, [pagina, filtros, buscarDados]);

  // --- CORREÇÃO DA DUPLA PISCADA ---
  const handleFiltroChange = useCallback((novosFiltros) => {
    setFiltros(prevFiltros => {
        // Compara se o filtro novo é IGUAL ao anterior
        if (prevFiltros.status === novosFiltros.status && prevFiltros.busca === novosFiltros.busca) {
            // Se for igual, retorna o MESMO objeto de estado anterior ('prevFiltros').
            // O React detecta que a referência de memória não mudou e CANCELA a re-renderização.
            // Isso evita a segunda busca desnecessária (a segunda piscada).
            return prevFiltros;
        }

        // Se for diferente, aí sim atualizamos e resetamos a página para 1
        setPagina(1);
        return novosFiltros;
    });
  }, []);

  const handleAbrirModal = (op) => { setOpSelecionada(op); setModalAberto(true); };
  const handleFecharModal = () => { setModalAberto(false); setOpSelecionada(null); };
  const handleUpdateOP = () => { buscarDados(pagina, filtros); };

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