import { sincronizarPermissoesUsuario } from '/js/utils/auth.js';

// Função para mostrar erro
function mostrarErro(input, mensagem) {
  const formGroup = input.parentElement.parentElement;
  const errorMessage = formGroup.querySelector('.error-message');
  formGroup.classList.add('error');
  errorMessage.textContent = mensagem;
  errorMessage.style.display = 'block';
}

// Função para limpar erro
function limparErro(input) {
  const formGroup = input.parentElement.parentElement;
  const errorMessage = formGroup.querySelector('.error-message');
  formGroup.classList.remove('error');
  errorMessage.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const nomeUsuarioInput = document.getElementById('nomeUsuario');
  const senhaInput = document.getElementById('senha');
  const keepLoggedInCheckbox = document.getElementById('keepLoggedIn');
  const loginBtn = loginForm.querySelector('.login-btn');
  const spinner = loginBtn.querySelector('.loading-spinner');
  const togglePassword = document.querySelector('.toggle-password');

  // Habilitar o botão após o carregamento
  loginBtn.disabled = false;

  // Verificar se já existe um token válido
  const token = localStorage.getItem('token');
  const keepLoggedIn = localStorage.getItem('keepLoggedIn') === 'true';
  if (token && keepLoggedIn) {
    try {
      console.log('Verificando token existente...');
      const response = await fetch('/api/usuarios/me', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      console.log('Resposta /api/usuarios/me:', response.status, response.statusText);
      if (response.ok) {
        let usuarioLogado = await response.json();
        usuarioLogado = await sincronizarPermissoesUsuario(usuarioLogado);
        const isCostureira = usuarioLogado.tipos.includes('costureira');
        if (isCostureira && !window.location.pathname.includes('/costureira/dashboard.html')) {
          window.location.href = '/costureira/dashboard.html';
        } else if (!isCostureira && !window.location.pathname.includes('/admin/home.html')) {
          window.location.href = '/admin/home.html';
        }
        return; // Sai do evento se já estiver logado
      } else {
        localStorage.removeItem('token'); // Remove token inválido
      }
    } catch (error) {
      console.error('Erro ao verificar token:', error);
      localStorage.removeItem('token');
    }
  }

  // Toggle de visibilidade da senha
  togglePassword.addEventListener('click', () => {
    const isPassword = senhaInput.type === 'password';
    senhaInput.type = isPassword ? 'text' : 'password';
    togglePassword.classList.toggle('fa-eye', isPassword);
    togglePassword.classList.toggle('fa-eye-slash', !isPassword);
  });

  // Submissão do formulário
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nomeUsuario = nomeUsuarioInput.value.trim();
    const senha = senhaInput.value;

    // Validações
    let hasError = false;
    if (!nomeUsuario) {
      mostrarErro(nomeUsuarioInput, 'Por favor, insira o nome de usuário.');
      hasError = true;
    } else {
      limparErro(nomeUsuarioInput);
    }
    if (!senha) {
      mostrarErro(senhaInput, 'Por favor, insira sua senha.');
      hasError = true;
    } else {
      limparErro(senhaInput);
    }
    if (hasError) return;

    loginBtn.disabled = true;
    spinner.style.display = 'inline-block';

    try {
      console.log('Enviando login para /api/login...');
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeUsuario, senha }),
      });
      console.log('Resposta /api/login:', response.status, response.statusText);

      if (response.ok) {
        const { token } = await response.json();
        localStorage.setItem('token', token);
        if (keepLoggedInCheckbox.checked) {
          localStorage.setItem('keepLoggedIn', 'true');
        } else {
          localStorage.removeItem('keepLoggedIn');
        }

        console.log('Verificando usuário em /api/usuarios/me...');
        
        const usuarioResponse = await fetch('/api/usuarios/me', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        console.log('Resposta /api/usuarios/me:', usuarioResponse.status, usuarioResponse.statusText);

        if (usuarioResponse.ok) {
          let usuarioLogado = await usuarioResponse.json();
          usuarioLogado = await sincronizarPermissoesUsuario(usuarioLogado);
          localStorage.setItem('permissoes', JSON.stringify(usuarioLogado.permissoes)); // Armazenar permissõe

          const isCostureira = usuarioLogado.tipos.includes('costureira');
          if (isCostureira) {
            window.location.href = '/costureira/dashboard.html';
          } else {
            window.location.href = '/admin/home.html';
          }
        } else {
          throw new Error(`Erro ao verificar usuário: ${usuarioResponse.statusText}`);
        }
      } else {
        const error = await response.json();
        if (error.error === 'Usuário não encontrado') {
          mostrarErro(nomeUsuarioInput, 'Usuário não encontrado');
        } else if (error.error === 'Senha incorreta') {
          mostrarErro(senhaInput, 'Senha incorreta');
        } else {
          alert('Erro ao fazer login: ' + error.error);
        }
      }
    } catch (error) {
      console.error('Erro no login:', error);
      alert('Erro no servidor. Tente novamente mais tarde.');
    } finally {
      loginBtn.disabled = false;
      spinner.style.display = 'none';
    }
  });
});