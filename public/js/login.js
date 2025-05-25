// public/js/login.js
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
      console.log('Resposta /api/usuarios/me (verificação token existente):', response.status, response.statusText);
      if (response.ok) {
        let usuarioLogado = await response.json();
        console.log('Usuário ANTES da sincronização (token existente):', JSON.parse(JSON.stringify(usuarioLogado)));
        usuarioLogado = await sincronizarPermissoesUsuario(usuarioLogado);
        console.log('Usuário DEPOIS da sincronização (token existente):', JSON.parse(JSON.stringify(usuarioLogado)));
        localStorage.setItem('permissoes', JSON.stringify(usuarioLogado.permissoes || []));

        const permissoesUsuario = usuarioLogado.permissoes || [];
        const tiposUsuario = usuarioLogado.tipos || [];
        console.log('Permissões (token existente):', permissoesUsuario);
        console.log('Tipos (token existente):', tiposUsuario);

        let redirectTo = '/home.html'; 

        if (permissoesUsuario.includes('acesso-admin-geral')) {
            redirectTo = '/admin/home.html';
        } else if (permissoesUsuario.includes('acesso-dashboard-tiktik')) { // <<< CORRIGIDO AQUI
            redirectTo = '/tiktik/dashboard-tiktik.html';
        } else if (tiposUsuario.includes('costureira') && permissoesUsuario.includes('acesso-costureira-dashboard')) {
            redirectTo = '/costureira/dashboard.html';
        } else if (permissoesUsuario.length > 0) { 
            redirectTo = '/admin/home.html';
        }
        
        if (!window.location.pathname.toLowerCase().includes(redirectTo.toLowerCase())) {
            console.log(`Redirecionando (token existente) para: ${redirectTo}`);
            window.location.href = redirectTo;
        }
        return;


      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('permissoes');
      }
    } catch (error) {
      console.error('Erro ao verificar token:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('permissoes');
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
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeUsuario, senha }),
      });

      if (response.ok) {
        const { token } = await response.json();
        localStorage.setItem('token', token);
        if (keepLoggedInCheckbox.checked) {
          localStorage.setItem('keepLoggedIn', 'true');
        } else {
          localStorage.removeItem('keepLoggedIn');
        }
        
        const usuarioResponse = await fetch('/api/usuarios/me', {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (usuarioResponse.ok) {
          let usuarioLogado = await usuarioResponse.json();
          console.log('Usuário ANTES da sincronização (novo login):', JSON.parse(JSON.stringify(usuarioLogado)));
          usuarioLogado = await sincronizarPermissoesUsuario(usuarioLogado);
          console.log('Usuário DEPOIS da sincronização (novo login):', JSON.parse(JSON.stringify(usuarioLogado)));
          localStorage.setItem('permissoes', JSON.stringify(usuarioLogado.permissoes || []));

          const permissoesUsuario = usuarioLogado.permissoes || [];
          const tiposUsuario = usuarioLogado.tipos || [];
          console.log('Permissões (novo login):', permissoesUsuario);
          console.log('Tipos (novo login):', tiposUsuario);

          let redirectTo = '/home.html';

          if (permissoesUsuario.includes('acesso-admin-geral')) {
              redirectTo = '/admin/home.html';
          } else if (permissoesUsuario.includes('acesso-dashboard-tiktik')) { // <<< CORRIGIDO AQUI
              redirectTo = '/tiktik/dashboard-tiktik.html';
          } else if (tiposUsuario.includes('costureira') && permissoesUsuario.includes('acesso-costureira-dashboard')) {
              redirectTo = '/costureira/dashboard.html';
          } else if (permissoesUsuario.length > 0) { 
              redirectTo = '/admin/home.html';
          }
          
          console.log(`Redirecionando (novo login) para: ${redirectTo}`);
          window.location.href = redirectTo;

        } else {
          const errorText = await usuarioResponse.text();
          throw new Error(`Erro ao verificar usuário: ${usuarioResponse.status} - ${errorText}`);
        }
      } else {
        const error = await response.json().catch(() => ({error: 'Erro desconhecido na resposta do login'}));
        if (error.error === 'Usuário não encontrado') {
          mostrarErro(nomeUsuarioInput, 'Usuário não encontrado');
        } else if (error.error === 'Senha incorreta') {
          mostrarErro(senhaInput, 'Senha incorreta');
        } else {
          alert('Erro ao fazer login: ' + (error.error || 'Verifique suas credenciais.'));
        }
      }
    } catch (error) {
      console.error('Erro no login:', error);
      alert('Erro no servidor ou ao processar o login. Tente novamente mais tarde. Detalhe: ' + error.message);
    } finally {
      loginBtn.disabled = false;
      spinner.style.display = 'none';
    }
  });
});