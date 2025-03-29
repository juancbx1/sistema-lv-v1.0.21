// /js/admin-cadastrar-usuario.js
import { verificarAutenticacao } from '/js/utils/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const auth = await verificarAutenticacao('cadastrar-usuario.html', ['acesso-cadastrar-usuarios']);
    if (!auth) {
      console.log('[admin-cadastrar-usuario] Autenticação falhou, redirecionamento já tratado');
      return;
    }

    const permissoes = auth.permissoes || [];
    console.log('Inicializando cadastrar-usuario para usuário:', auth.usuario.nomeUsuario, 'Permissões:', permissoes);

    const cadastroForm = document.getElementById('cadastroForm');
    const tipoCheckboxes = document.querySelectorAll('input[name="tipos"]');
    const nivelContainer = document.getElementById('nivelContainer');
    const submitBtn = document.getElementById('submitBtn');
    const togglePassword = document.querySelector('.toggle-password');

    togglePassword.addEventListener('click', () => {
      const senhaInput = document.getElementById('senha');
      const isPassword = senhaInput.type === 'password';
      senhaInput.type = isPassword ? 'text' : 'password';
      togglePassword.classList.toggle('fa-eye', isPassword);
      togglePassword.classList.toggle('fa-eye-slash', !isPassword);
    });

    const validarEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const validarNomeUsuario = (nomeUsuario) => /^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*$/.test(nomeUsuario);

    const mostrarErro = (inputId, mensagem) => {
      const formGroup = document.getElementById(inputId).parentElement;
      const errorMessage = formGroup.querySelector('.error-message');
      formGroup.classList.add('error');
      errorMessage.textContent = mensagem;
      errorMessage.style.display = 'block';
    };

    const limparErro = (inputId) => {
      const formGroup = document.getElementById(inputId).parentElement;
      const errorMessage = formGroup.querySelector('.error-message');
      formGroup.classList.remove('error');
      errorMessage.style.display = 'none';
    };

    tipoCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const tiposSelecionados = Array.from(tipoCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        nivelContainer.style.display = tiposSelecionados.includes('costureira') ? 'block' : 'none';
      });
    });

    document.getElementById('nome').addEventListener('input', (e) => {
      e.target.value.trim().length < 2 ? mostrarErro('nome', 'O nome deve ter pelo menos 2 caracteres.') : limparErro('nome');
    });

    document.getElementById('nomeUsuario').addEventListener('input', async (e) => {
      const value = e.target.value.trim();
      if (!validarNomeUsuario(value)) {
        mostrarErro('nomeUsuario', 'O nome de usuário só pode conter letras, números e pontos (ex: joao.silva).');
      } else {
        try {
          const response = await fetch('/api/usuarios', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          });
          if (response.ok) {
            const usuarios = await response.json();
            if (usuarios.some(u => u.nome_usuario === value)) {
              mostrarErro('nomeUsuario', 'Este nome de usuário já está em uso.');
            } else {
              limparErro('nomeUsuario');
            }
          } else {
            console.error('Erro ao verificar nome de usuário:', response.status, response.statusText);
            mostrarErro('nomeUsuario', 'Erro ao verificar disponibilidade. Tente novamente.');
          }
        } catch (error) {
          console.error('Erro na requisição de nome de usuário:', error);
          mostrarErro('nomeUsuario', 'Erro no servidor. Tente novamente mais tarde.');
        }
      }
    });

    document.getElementById('email').addEventListener('input', async (e) => {
      const value = e.target.value.trim();
      if (!validarEmail(value)) {
        mostrarErro('email', 'Por favor, insira um email válido.');
      } else {
        try {
          const response = await fetch('/api/usuarios', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          });
          if (response.ok) {
            const usuarios = await response.json();
            if (usuarios.some(u => u.email === value)) {
              mostrarErro('email', 'Este email já está em uso.');
            } else {
              limparErro('email');
            }
          } else {
            console.error('Erro ao verificar email:', response.status, response.statusText);
            mostrarErro('email', 'Erro ao verificar disponibilidade. Tente novamente.');
          }
        } catch (error) {
          console.error('Erro na requisição de email:', error);
          mostrarErro('email', 'Erro no servidor. Tente novamente mais tarde.');
        }
      }
    });

    document.getElementById('senha').addEventListener('input', (e) => {
      e.target.value.length < 6 ? mostrarErro('senha', 'A senha deve ter pelo menos 6 caracteres.') : limparErro('senha');
    });

    cadastroForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nome = document.getElementById('nome').value.trim();
      const nomeUsuario = document.getElementById('nomeUsuario').value.trim();
      const email = document.getElementById('email').value.trim();
      const senha = document.getElementById('senha').value;
      const tiposSelecionados = Array.from(tipoCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

      let hasError = false;
      if (nome.length < 2) mostrarErro('nome', 'O nome deve ter pelo menos 2 caracteres.'), hasError = true;
      if (!validarNomeUsuario(nomeUsuario)) mostrarErro('nomeUsuario', 'Nome de usuário inválido.'), hasError = true;
      if (!validarEmail(email)) mostrarErro('email', 'Email inválido.'), hasError = true;
      if (senha.length < 6) mostrarErro('senha', 'A senha deve ter pelo menos 6 caracteres.'), hasError = true;
      if (tiposSelecionados.length === 0) {
        const tiposGroup = tipoCheckboxes[0].parentElement.parentElement;
        tiposGroup.classList.add('error');
        tiposGroup.querySelector('.error-message').textContent = 'Selecione pelo menos um tipo.';
        tiposGroup.querySelector('.error-message').style.display = 'block';
        hasError = true;
      }

      if (hasError) return;

      submitBtn.disabled = true;
      const usuario = {
        nome,
        nomeUsuario,
        email,
        senha,
        tipos: tiposSelecionados,
        nivel: tiposSelecionados.includes('costureira') ? parseInt(document.getElementById('nivel').value) || 1 : null,
      };

      try {
        const response = await fetch('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify(usuario),
        });

        if (response.ok) {
          cadastroForm.reset();
          nivelContainer.style.display = 'none';
          tipoCheckboxes.forEach(cb => cb.checked = false);
          alert('Usuário cadastrado com sucesso!');
          window.location.href = 'usuarios-cadastrados.html';
        } else {
          const error = await response.json();
          alert(`Erro ao cadastrar usuário: ${error.error}`);
        }
      } catch (error) {
        console.error('Erro ao cadastrar usuário:', error);
        alert('Erro no servidor. Tente novamente mais tarde.');
      } finally {
        submitBtn.disabled = false;
      }
    });
  } catch (error) {
    console.error('[admin-cadastrar-usuario] Erro ao carregar página:', error);
    // Redirecionamento já tratado pelo verificarAutenticacao
  }
});