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

/**
 * Função centralizada para decidir a URL de redirecionamento.
 * @param {object} usuario - O objeto do usuário com tipos e permissões.
 * @returns {string} A URL para a qual o usuário deve ser redirecionado.
 */
function decidirRedirecionamento(usuario) {
  const permissoes = usuario.permissoes || [];

  if (permissoes.includes('acesso-admin-geral')) {
    // Se tem acesso geral ao admin, vai para a home do admin.
    return '/admin/home.html';
  } else if (permissoes.includes('acesso-dashboard')) {
    // Se não tem acesso admin, mas tem acesso ao dashboard, vai para o dashboard.
    return '/dashboard/dashboard.html';
  } else {
    // Fallback: Se não tem nenhuma das permissões principais, vai para acesso negado
    // ou para a página de login (o que pode causar um loop, então acesso-negado é melhor).
    // No entanto, um usuário válido deve ter pelo menos uma dessas.
    // Redirecionar para a home do admin como um fallback seguro se tiver qualquer outra permissão.
    console.warn(`Usuário ${usuario.nome_usuario} não tem permissão 'acesso-admin-geral' nem 'acesso-dashboard'. Verifique as permissões por tipo.`);
    return '/admin/acesso-negado.html'; 
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const nomeUsuarioInput = document.getElementById('nomeUsuario');
  const senhaInput = document.getElementById('senha');
  const keepLoggedInCheckbox = document.getElementById('keepLoggedIn');
  const loginBtn = loginForm.querySelector('.login-btn');
  const spinner = loginBtn.querySelector('.loading-spinner');
  const togglePassword = document.querySelector('.toggle-password');

  loginBtn.disabled = false;

  const token = localStorage.getItem('token');
  const keepLoggedIn = localStorage.getItem('keepLoggedIn') === 'true';

  if (token && keepLoggedIn) {
    try {
      const response = await fetch('/api/usuarios/me', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        let usuarioLogado = await response.json();
        usuarioLogado = await sincronizarPermissoesUsuario(usuarioLogado);
        localStorage.setItem('permissoes', JSON.stringify(usuarioLogado.permissoes || []));

        // *** USA A NOVA FUNÇÃO DE REDIRECIONAMENTO ***
        const redirectTo = decidirRedirecionamento(usuarioLogado);
        
        console.log(`[Login com Token] Redirecionando para: ${redirectTo}`);
        window.location.href = redirectTo;
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

  togglePassword.addEventListener('click', () => {
    const isPassword = senhaInput.type === 'password';
    senhaInput.type = isPassword ? 'text' : 'password';
    togglePassword.classList.toggle('fa-eye', isPassword);
    togglePassword.classList.toggle('fa-eye-slash', !isPassword);
  });

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
          usuarioLogado = await sincronizarPermissoesUsuario(usuarioLogado);
          localStorage.setItem('permissoes', JSON.stringify(usuarioLogado.permissoes || []));

          // *** USA A NOVA FUNÇÃO DE REDIRECIONAMENTO ***
          const redirectTo = decidirRedirecionamento(usuarioLogado);
          
          console.log(`[Novo Login] Redirecionando para: ${redirectTo}`);
          window.location.href = redirectTo;

        } else {
          const errorText = await usuarioResponse.text();
          throw new Error(`Erro ao verificar usuário: ${usuarioResponse.status} - ${errorText}`);
        }
      } else {
        const error = await response.json().catch(() => ({error: 'Erro desconhecido'}));
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