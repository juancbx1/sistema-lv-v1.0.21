// public/src/components/OPCortesTela.jsx

import React, { useState, useEffect, useCallback } from 'react';
import OPSelecaoProdutoCorte from './OPSelecaoProdutoCorte.jsx';
import OPSelecaoVarianteCorte from './OPSelecaoVarianteCorte.jsx';
import OPRegistroCorte from './OPRegistroCorte.jsx';
import OPCorteEstoqueCard from './OPCorteEstoqueCard.jsx';
import OPFormulario from './OPFormulario.jsx';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import OPPaginacaoWrapper from './OPPaginacaoWrapper.jsx';


async function fetchCortesEmEstoque() {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/cortes?status=cortados', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Falha ao buscar cortes em estoque.');
    const cortes = await response.json();
    return cortes.filter(corte => corte.op === null);
}

export default function OPCortesTela() {
  const [passo, setPasso] = useState(0); 
  const [corteSelecionado, setCorteSelecionado] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [cortesEmEstoque, setCortesEmEstoque] = useState([]);
  
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [varianteSelecionada, setVarianteSelecionada] = useState(null);
  
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [usuarioLogado, setUsuarioLogado] = useState(null);

  const [paginaCortes, setPaginaCortes] = useState(1);
  const ITENS_POR_PAGINA_CORTES = 6;
  
  // ESTADO DE CONTROLE: ID do corte sendo processado
  const [gerandoOP, setGerandoOP] = useState(null);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setPaginaCortes(1); // Reseta para a primeira página
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

    } catch (err) {
      setErro(`Falha ao carregar dados: ${err.message}`);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleProdutoSelect = (produto) => { setProdutoSelecionado(produto); setPasso(2); };
  const handleVarianteSelect = (variante) => { setVarianteSelecionada(variante); setPasso(3); };
  
  const handleCorteRegistrado = () => {
    setProdutoSelecionado(null);
    setVarianteSelecionada(null);
    setPasso(0); 
    setGerandoOP(null); // GARANTIA DE LIMPEZA
    carregarDados(); 
  };

  const handleGerarOP = (corte) => {
      // Bloqueio se já estiver processando
      if (gerandoOP) return;

      console.log("Gerar OP a partir do corte:", corte);
      setGerandoOP(corte.id); // Define qual ID está travado
      setCorteSelecionado(corte);
      setPasso(4);
  };

  const handleOPCriada = () => {
      setCorteSelecionado(null);
      setPasso(0);
      setGerandoOP(null); // LIBERA O BLOQUEIO
      carregarDados();
  };
  
  const voltarPasso = () => {
    // --- FLUXO DE GERAR OP (Cortes em Estoque) ---
    // Se está no passo 4, significa que veio da lista de estoques.
    // Voltar deve cancelar tudo e ir direto para o início (Passo 0).
    if (passo === 4) {
        setGerandoOP(null);
        setCorteSelecionado(null);
        setPasso(0); // Pulo direto para o início
        return;      // Encerra a função aqui
    }
    
    // --- FLUXO DE REGISTRAR NOVO CORTE ---
    // Limpa estados específicos ao retroceder
    if (passo === 1) setProdutoSelecionado(null);
    if (passo === 2) setVarianteSelecionada(null);

    // Lógica padrão de voltar 1 passo por vez
    if (passo > 1) { 
        setPasso(passo - 1); 
    } else { 
        setPasso(0); 
        // Garante limpeza total ao voltar para o início
        setProdutoSelecionado(null);
        setVarianteSelecionada(null);
    }
  };

  const renderContent = () => {
        if (carregando) {
          return <div className="spinner">Carregando...</div>;
        }
        if (erro) {
          return <p style={{ color: 'red', textAlign: 'center' }}>{erro}</p>;
        }

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
                            produto={produtoSelecionado} 
                            variante={varianteSelecionada} 
                            usuario={usuarioLogado} 
                            onCorteRegistrado={handleCorteRegistrado} 
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
                        />
                    </>
                );
            default: // Passo 0: Tela Principal
                 // Calcular fatia da página atual
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
                                            isGerando={gerandoOP === corte.id}
                                        />
                                    );
                                })
                            ) : (
                                <p style={{ textAlign: 'center', padding: '20px' }}>Nenhum corte em estoque no momento.</p>
                            )}
                        </div>

                        {/* Paginação */}
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