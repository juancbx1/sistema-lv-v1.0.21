// public/src/main-op.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

import HeaderPagina from './components/HeaderPagina.jsx';
import OPPainelAtividades from './components/OPPainelAtividades.jsx';
import OPGerenciamentoTela from './components/OPGerenciamentoTela.jsx';
import OPCortesTela from './components/OPCortesTela.jsx';
import OPModalTempos from './components/OPModalTempos.jsx';
import BotaoBuscaFunil from './components/BotaoBuscaFunil.jsx';

import { verificarAutenticacao } from '/js/utils/auth.js';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { 
      console.error("REACT CRASHOU:", error, errorInfo); 
      this.setState({ error });
  }
  render() { 
      if (this.state.hasError) {
          return (
            <div style={{padding: 20, color: 'red', textAlign: 'center'}}>
                <h2>Algo deu errado na aplicação.</h2>
                <details>{this.state.error && this.state.error.toString()}</details>
                <button onClick={() => window.location.reload()}>Recarregar</button>
            </div>
          );
      } 
      return this.props.children; 
  }
}

async function fetchSimples(url) {
    const token = localStorage.getItem('token');
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error('Erro fetch');
    return res.json();
}

function App() {
  const [visaoAtual, setVisaoAtual] = useState('painel');
  const [modalTppAberto, setModalTppAberto] = useState(false);
  const [qtdOpsPendentes, setQtdOpsPendentes] = useState(0);
  
  const [estaAutenticado, setEstaAutenticado] = useState(false);
  const [verificandoAuth, setVerificandoAuth] = useState(true);
  
  // --- CORREÇÃO: Declare o estado AQUI, junto com os outros states ---
  const [permissoes, setPermissoes] = useState([]);
  const [demandaParaProcessar, setDemandaParaProcessar] = useState(null); // <--- MOVIDO PARA CIMA
  
  // Agora a função pode usar o setDemandaParaProcessar tranquilamente
  const iniciarProcessoDeCorte = (dadosDemanda) => {
      console.log("[Ponte] Recebido pedido de produção:", dadosDemanda);
      setDemandaParaProcessar(dadosDemanda);
      setVisaoAtual('cortes');
  };


  useEffect(() => {
      async function checkAuth() {
          try {
              const auth = await verificarAutenticacao('ordens-de-producao.html', ['acesso-ordens-de-producao']);
              if (auth) {
                  setEstaAutenticado(true);
                  // Salva as permissões vindas do auth
                  setPermissoes(auth.permissoes || []); 
                  document.body.classList.add('autenticado');
              } else {
                  document.body.innerHTML = '<p style="text-align:center; padding:20px;">Redirecionando...</p>';
              }
          } catch (error) {
              console.error("Erro na autenticação:", error);
          } finally {
              setVerificandoAuth(false);
          }
      }
      checkAuth();
  }, []);

  const verificarOpsProntas = useCallback(async () => {
        if (!estaAutenticado) return; 

        try {
            const data = await fetchSimples('/api/ordens-de-producao?status=produzindo&limit=100');
            if (!data.rows || data.rows.length === 0) {
                setQtdOpsPendentes(0);
            } else {
                const detalhesPromises = data.rows.map(op => 
                    fetchSimples(`/api/ordens-de-producao/${op.edit_id || op.numero}`).catch(() => null)
                );
                const detalhesReais = await Promise.all(detalhesPromises);
                
                const contagem = detalhesReais.reduce((acc, op) => {
                    if (!op) return acc;
                    const etapasOk = op.etapas && Array.isArray(op.etapas) && op.etapas.length > 0 && op.etapas.every(e => e.lancado);
                    return etapasOk ? acc + 1 : acc;
                }, 0);

                setQtdOpsPendentes(contagem);
            }
        } catch (error) {
            console.error("[Monitor OP] Erro:", error);
        }
  }, [estaAutenticado]);

  useEffect(() => {
    if (!estaAutenticado) return; 

    // 1. Executa a busca imediatamente ao carregar a página
    verificarOpsProntas();

    // 2. Cria um gatilho: Se o usuário saiu da aba e voltou, busca de novo
    const handleFocus = () => {
        verificarOpsProntas();
    };

    window.addEventListener('focus', handleFocus);

    // Limpeza ao sair da tela
    return () => {
        window.removeEventListener('focus', handleFocus);
    };

    // Removemos qualquer dependência de função, deixando apenas a autenticação
  }, [estaAutenticado]);

   if (verificandoAuth) return null;
   if (!estaAutenticado) return null;

   return (
    <ErrorBoundary>
      <div className="op-pagina-cabecalho-container">
        <HeaderPagina titulo="Ordens de Produção">
          <button
            className="gs-btn gs-btn-secundario gs-btn-com-icone"
            title="Configurar Tempo Padrão de Produção"
            onClick={() => setModalTppAberto(true)}
          >
              <i className="fas fa-clock"></i>
              <span className="op-btn-label-desktop">Tempos Padrão</span>
          </button>
        </HeaderPagina>

        <div className="op-view-switcher">
          <button
            className={`op-btn-switch ${visaoAtual === 'painel' ? 'active' : ''}`}
            onClick={() => setVisaoAtual('painel')}
          >
            <i className="fas fa-users"></i> Painel
          </button>
          
          <button
            className={`op-btn-switch ${visaoAtual === 'gerenciamento' ? 'active' : ''}`}
            onClick={() => setVisaoAtual('gerenciamento')}
            style={{ position: 'relative' }}
          >
            <i className="fas fa-list-alt"></i> OPs
            {qtdOpsPendentes > 0 && (
                <span className="op-badge-notificacao" title={`${qtdOpsPendentes} OP(s) prontas para finalizar`}>
                    {qtdOpsPendentes}
                </span>
            )}
          </button>

          <button
            className={`op-btn-switch ${visaoAtual === 'cortes' ? 'active' : ''}`}
            onClick={() => setVisaoAtual('cortes')}
          >
            <i className="fas fa-cut"></i> Cortes
          </button>
        </div>
      </div>

      <div className="op-conteudo-principal">
          {visaoAtual === 'painel' && <OPPainelAtividades />}
          
          {visaoAtual === 'gerenciamento' && (
            <OPGerenciamentoTela 
                opsPendentesGlobal={qtdOpsPendentes} 
                onRefreshContadores={verificarOpsProntas} 
            />
          )}
          
          {visaoAtual === 'cortes' && (
            <OPCortesTela 
                demandaInicial={demandaParaProcessar} 
                onLimparDemanda={() => setDemandaParaProcessar(null)}
            />
          )}
      </div>

      <OPModalTempos isOpen={modalTppAberto} onClose={() => setModalTppAberto(false)} />
      
      {/* PASSA A FUNÇÃO E AS PERMISSÕES */}
      <BotaoBuscaFunil 
          onIniciarProducao={iniciarProcessoDeCorte} 
          permissoes={permissoes} 
      />

    </ErrorBoundary>
  );
}

const container = document.getElementById('op-react-root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
}