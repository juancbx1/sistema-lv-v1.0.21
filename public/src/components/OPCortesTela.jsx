// public/src/components/OPCortesTela.jsx

import React, { useState, useEffect, useCallback } from 'react';
import OPSelecaoProdutoCorte from './OPSelecaoProdutoCorte.jsx';
import OPSelecaoVarianteCorte from './OPSelecaoVarianteCorte.jsx';
import OPRegistroCorte from './OPRegistroCorte.jsx';
import OPCorteEstoqueCard from './OPCorteEstoqueCard.jsx';
import OPFormulario from './OPFormulario.jsx';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';

async function fetchCortesEmEstoque() {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/cortes?status=cortados', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Falha ao buscar cortes em estoque.');
    const cortes = await response.json();
    // Filtra apenas os que não têm OP vinculada (são estoque livre)
    return cortes.filter(corte => corte.op === null);
}

export default function OPCortesTela({ demandaInicial, onLimparDemanda }) {
  const [passo, setPasso] = useState(0); 
  const [corteSelecionado, setCorteSelecionado] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [cortesEmEstoque, setCortesEmEstoque] = useState([]);
  
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [varianteSelecionada, setVarianteSelecionada] = useState(null);
  const [quantidadePreenchida, setQuantidadePreenchida] = useState('');
  
  const [demandaIdAtiva, setDemandaIdAtiva] = useState(null);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  
  const [gerandoOP, setGerandoOP] = useState(null);
  const [paginaCortes, setPaginaCortes] = useState(1);
  const ITENS_POR_PAGINA_CORTES = 6;

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Não autenticado");

      const [todosProdutos, dadosUsuario, cortesData] = await Promise.all([
        obterProdutosDoStorage(),
        fetch('/api/usuarios/me', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
        fetchCortesEmEstoque()
      ]);
      
      if (dadosUsuario.error) throw new Error(dadosUsuario.error);

      const produtosProduziveis = todosProdutos.filter(p => !p.is_kit);
      setProdutos(produtosProduziveis);
      setUsuarioLogado(dadosUsuario);
      setCortesEmEstoque(cortesData); 
      setPaginaCortes(1); // Reseta página ao recarregar

    } catch (err) {
      setErro(`Falha ao carregar dados: ${err.message}`);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // --- LÓGICA DE EXCLUSÃO DE CORTE ---
  const handleExcluirCorte = async (corte) => {
      const confirmado = await mostrarConfirmacao(
          `Tem certeza que deseja excluir o corte PC #${corte.pn} (${corte.quantidade} pçs)?\nEsta ação é irreversível e remove o corte do estoque.`,
          { tipo: 'perigo', textoConfirmar: 'Sim, Excluir', textoCancelar: 'Cancelar' }
      );

      if (!confirmado) return;

      try {
          const token = localStorage.getItem('token');
          const response = await fetch('/api/cortes', {
              method: 'DELETE',
              headers: { 
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json' 
              },
              body: JSON.stringify({ id: corte.id })
          });

          if (!response.ok) {
              const errData = await response.json();
              throw new Error(errData.error || 'Falha ao excluir corte.');
          }
          
          mostrarMensagem('Corte excluído com sucesso.', 'sucesso');
          carregarDados(); // Atualiza a lista

      } catch (err) {
          console.error(err);
          mostrarMensagem(err.message, 'erro');
      }
  };

  // --- LÓGICA DE AUTOMATIZAÇÃO ---
  useEffect(() => {
      if (demandaInicial && produtos.length > 0 && !carregando) {
          console.log("[Automação] Processando demanda:", demandaInicial);
          
          const { produto_id, variante, quantidade, demanda_id } = demandaInicial;
          setDemandaIdAtiva(demanda_id);

          const produtoAlvo = produtos.find(p => p.id === produto_id);
          if (!produtoAlvo) {
              mostrarMensagem("Erro: Produto da demanda não encontrado.", "erro");
              onLimparDemanda();
              return;
          }

          const normalizarVariante = (v) => (!v || v === '-' || v === '') ? null : v;
          const varianteAlvo = normalizarVariante(variante);

          const cortesDoProduto = cortesEmEstoque.filter(c => 
              c.produto_id === produto_id && 
              normalizarVariante(c.variante) === varianteAlvo
          );

          const cortePerfeito = cortesDoProduto.find(c => c.quantidade >= quantidade);

          if (cortePerfeito) {
              mostrarMensagem(`Encontramos um corte ideal (PC: ${cortePerfeito.pn})!`, 'sucesso');
              setGerandoOP(cortePerfeito.id);
              setCorteSelecionado(cortePerfeito);
              setPasso(4); 
          } 
          else if (cortesDoProduto.length > 0) {
              const melhorCorteParcial = cortesDoProduto.sort((a, b) => b.quantidade - a.quantidade)[0];
              mostrarConfirmacao(
                  `Você precisa de ${quantidade} peças, mas o maior corte tem ${melhorCorteParcial.quantidade}. \n\nDeseja usar este corte parcial?`,
                  { tipo: 'aviso', textoConfirmar: `Usar Corte de ${melhorCorteParcial.quantidade}`, textoCancelar: 'Não, fazer novo corte' }
              ).then((usarParcial) => {
                  if (usarParcial) {
                      setGerandoOP(melhorCorteParcial.id);
                      setCorteSelecionado(melhorCorteParcial);
                      setPasso(4);
                  } else {
                      setProdutoSelecionado(produtoAlvo);
                      setVarianteSelecionada(variante);
                      setQuantidadePreenchida(quantidade);
                      setPasso(3);
                  }
              });

          } else {
              mostrarMensagem(`Nenhum corte em estoque. Redirecionando para novo corte.`, 'info');
              setProdutoSelecionado(produtoAlvo);
              setVarianteSelecionada(variante);
              setQuantidadePreenchida(quantidade);
              setPasso(3); 
          }
          onLimparDemanda();
      }
  }, [demandaInicial, produtos, cortesEmEstoque, carregando, onLimparDemanda]);


  const handleProdutoSelect = (produto) => { setProdutoSelecionado(produto); setPasso(2); };
  const handleVarianteSelect = (variante) => { setVarianteSelecionada(variante); setPasso(3); };
  
  const handleCorteRegistrado = (novoCorte) => {
    setProdutoSelecionado(null);
    setVarianteSelecionada(null);
    setQuantidadePreenchida('');
    
    if (demandaIdAtiva && novoCorte) {
        console.log("Fluxo Contínuo: Indo para Gerar OP com corte", novoCorte.pn);
        setCorteSelecionado(novoCorte);
        setGerandoOP(novoCorte.id);
        setPasso(4);
        carregarDados(); 
    } else {
        setPasso(0); 
        setGerandoOP(null);
        setDemandaIdAtiva(null);
        carregarDados(); 
    }
  };

  const handleGerarOP = (corte) => {
      if (gerandoOP) return;
      setGerandoOP(corte.id);
      setCorteSelecionado(corte);
      setPasso(4);
  };

  const handleOPCriada = () => {
      setCorteSelecionado(null);
      setPasso(0);
      setGerandoOP(null);
      setDemandaIdAtiva(null);
      carregarDados();
  };
  
  const voltarPasso = () => {
    if (passo === 4) {
        setGerandoOP(null);
        setCorteSelecionado(null);
        setPasso(0);
        setDemandaIdAtiva(null);
        return;
    }
    if (passo === 1) setProdutoSelecionado(null);
    if (passo === 2) setVarianteSelecionada(null);
    if (passo === 3) setQuantidadePreenchida('');

    if (passo > 1) { 
        setPasso(passo - 1); 
    } else { 
        setPasso(0); 
        setProdutoSelecionado(null);
        setVarianteSelecionada(null);
        setDemandaIdAtiva(null);
    }
  };

  const renderContent = () => {
        if (carregando) return <div className="spinner">Carregando...</div>;
        if (erro) return <p style={{ color: 'red', textAlign: 'center' }}>{erro}</p>;

        switch (passo) {
            case 1:
                return (
                    <>
                        <h3 className="op-subtitulo-secao">Passo 1: Selecione o Produto</h3>
                        <OPSelecaoProdutoCorte produtos={produtos} onProdutoSelect={handleProdutoSelect} />
                    </>
                );
            case 2:
                 return (
                    <>
                        <h3 className="op-subtitulo-secao">Passo 2: Selecione a Variação de "{produtoSelecionado?.nome}"</h3>
                        <OPSelecaoVarianteCorte produto={produtoSelecionado} onVarianteSelect={handleVarianteSelect} />
                    </>
                );
            case 3:
                return (
                    <>
                        <h3 className="op-subtitulo-secao">Passo 3: Informe a Quantidade</h3>
                        <OPRegistroCorte 
                            key={quantidadePreenchida ? `corte-pre-${quantidadePreenchida}` : 'corte-novo'}
                            produto={produtoSelecionado} 
                            variante={varianteSelecionada} 
                            usuario={usuarioLogado} 
                            onCorteRegistrado={handleCorteRegistrado}
                            quantidadeInicial={quantidadePreenchida}
                            demandaId={demandaIdAtiva} 
                        />
                    </>
                );
            case 4:
                return (
                    <>
                        <h3 className="op-subtitulo-secao">Gerar Ordem de Produção</h3>
                        <OPFormulario
                            corteSelecionado={corteSelecionado}
                            onOPCriada={handleOPCriada}
                            onSetGerando={setGerandoOP} 
                            demandaId={demandaIdAtiva}
                        />
                    </>
                );
            default: 
                const totalPaginasCortes = Math.ceil(cortesEmEstoque.length / ITENS_POR_PAGINA_CORTES);
                const cortesPaginados = cortesEmEstoque.slice(
                    (paginaCortes - 1) * ITENS_POR_PAGINA_CORTES,
                    paginaCortes * ITENS_POR_PAGINA_CORTES
                );

                return (
                    <>
                        <div className="op-form-botoes" style={{ justifyContent: 'center', marginBottom: '30px' }}>
                            <button className="op-botao op-botao-destaque-incluir" onClick={() => setPasso(1)}>
                                <i className="fas fa-plus"></i> Registrar Novo Corte
                            </button>
                        </div>
                        <h3 className="op-subtitulo-secao">Estoque de Cortes (Prontos para Virar OP)</h3>
                        
                        <div className="op-cards-container">
                            {cortesPaginados.length > 0 ? (
                                cortesPaginados.map(corte => {
                                    const produtoCompleto = produtos.find(p => p.id === corte.produto_id);
                                    return (
                                        <OPCorteEstoqueCard 
                                            key={corte.id} 
                                            corte={corte}
                                            produto={produtoCompleto} 
                                            onGerarOP={handleGerarOP}
                                            onExcluir={handleExcluirCorte} // <--- Passando a função
                                            isGerando={gerandoOP === corte.id}
                                        />
                                    );
                                })
                            ) : (
                                <p style={{ textAlign: 'center', padding: '20px' }}>Nenhum corte em estoque no momento.</p>
                            )}
                        </div>

                        {totalPaginasCortes > 1 && (
                            <OPPaginacaoWrapper 
                                totalPages={totalPaginasCortes}
                                currentPage={paginaCortes}
                                onPageChange={setPaginaCortes}
                            />
                        )}
                    </>
                );
        }
      };

      return (
        <div className="op-card-estilizado">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                {passo > 0 && (
                    <button className="btn-voltar-header" onClick={voltarPasso}>
                        <i className="fas fa-arrow-left"></i> Voltar
                    </button>
                )}
                <h2 className="op-titulo-secao" style={{ flexGrow: 1, textAlign: 'center', borderBottom: 'none', marginBottom: 0 }}>
                  Área de Cortes
                </h2>
                {passo > 0 && <div className="op-header-spacer"></div>}
            </div>
            {renderContent()}
        </div>
      );
}