// public/src/main-cpag.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { verificarAutenticacao } from '/js/utils/auth.js';

// Importa o componente principal que gerencia as abas
import CPAGCentralPagamentos from './components/CPAGCentralPagamentos';

// Limita erros para não quebrar a tela toda branca
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
                <h2>Algo deu errado na Central de Pagamentos.</h2>
                <details style={{whiteSpace: 'pre-wrap'}}>{this.state.error && this.state.error.toString()}</details>
                <button 
                    onClick={() => window.location.reload()}
                    style={{padding: '10px 20px', marginTop: '10px', cursor: 'pointer'}}
                >
                    Recarregar Página
                </button>
            </div>
          );
      } 
      return this.props.children; 
  }
}

function App() {
  const [estaAutenticado, setEstaAutenticado] = useState(false);
  const [verificandoAuth, setVerificandoAuth] = useState(true);
  const [permissoes, setPermissoes] = useState([]);
  // Aqui carregaremos o usuário logado para passar para frente também
  const [usuarioLogado, setUsuarioLogado] = useState(null);

  useEffect(() => {
      async function checkAuth() {
          try {
              // Verifica se tem permissão de acesso à central
              const auth = await verificarAutenticacao('central-de-pagamentos.html', ['acessar-central-pagamentos']);
              if (auth) {
                  setEstaAutenticado(true);
                  setPermissoes(auth.permissoes || []);
                  
                  // Se sua função de auth retornar o usuário, ótimo. 
                  // Se não, podemos buscar '/api/usuarios/me' aqui ou dentro do componente filho.
                  // Por hora, vamos focar na permissão.
                  document.body.classList.add('autenticado');
              } else {
                  // Se não autenticado, o utils/auth.js geralmente redireciona, 
                  // mas garantimos uma mensagem aqui.
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

   if (verificandoAuth) return null; // Ou um Spinner simples
   if (!estaAutenticado) return null;

   return (
    <ErrorBoundary>
        {/* Renderiza a aplicação principal passando as permissões */}
        <CPAGCentralPagamentos permissoes={permissoes} />
    </ErrorBoundary>
  );
}

// Montagem no ID correto que definimos no HTML
const container = document.getElementById('cpag-react-root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
} else {
    console.error("Container 'cpag-react-root' não encontrado no HTML.");
}