// public/js/login.js
import { sincronizarPermissoesUsuario } from '../js/utils/auth.js';
import { permissoesPorTipo } from '../js/utils/permissoes.js';

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

// Mostrar/Esconder Senha
const togglePassword = document.querySelector('.toggle-password');
togglePassword.addEventListener('click', () => {
    const senhaInput = document.getElementById('senha');
    const isPassword = senhaInput.type === 'password';
    senhaInput.type = isPassword ? 'text' : 'password';
    togglePassword.classList.toggle('fa-eye', isPassword);
    togglePassword.classList.toggle('fa-eye-slash', !isPassword);
});

const loginForm = document.getElementById('loginForm');
const nomeUsuarioInput = document.getElementById('nomeUsuario');
const senhaInput = document.getElementById('senha');
const keepLoggedInInput = document.getElementById('keepLoggedIn');
const submitBtn = loginForm?.querySelector('button[type="submit"]');
const loadingSpinner = submitBtn?.querySelector('.loading-spinner');

loginForm?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const nomeUsuario = nomeUsuarioInput.value.trim();
    const senha = senhaInput.value;
    const keepLoggedIn = keepLoggedInInput.checked;

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

    submitBtn.disabled = true;
    loadingSpinner.style.display = 'inline-block';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: nomeUsuario, senha: senha })
        });

        const data = await response.json();

        if (response.ok) {
            // Login bem-sucedido
            const usuarioLogado = {
                nomeUsuario: nomeUsuario,
                tipos: [data.tipo], // API retorna "admin" ou "user", ajustamos pra array
                permissoes: permissoesPorTipo[data.tipo] || []
            };

            // Sincroniza permissões usando auth.js
            sincronizarPermissoesUsuario(usuarioLogado);

            localStorage.setItem('keepLoggedIn', keepLoggedIn);
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

            const isCostureira = usuarioLogado.tipos.includes('costureira');
            if (isCostureira) {
                window.location.href = '/costureira/dashboard.html';
            } else {
                window.location.href = '/admin/home.html';
            }
        } else {
            alert(data.message); // "Credenciais inválidas"
        }
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        alert('Erro ao conectar com o servidor.');
    } finally {
        submitBtn.disabled = false;
        loadingSpinner.style.display = 'none';
    }
});

// Verifica "mantenha logado"
document.addEventListener('DOMContentLoaded', () => {
    const keepLoggedIn = localStorage.getItem('keepLoggedIn') === 'true';
    if (keepLoggedIn) {
        const usuarioLogadoRaw = localStorage.getItem('usuarioLogado');
        if (usuarioLogadoRaw) {
            const usuarioLogado = JSON.parse(usuarioLogadoRaw);
            sincronizarPermissoesUsuario(usuarioLogado);
            const isCostureira = usuarioLogado.tipos.includes('costureira');
            if (isCostureira && !window.location.pathname.includes('/costureira/dashboard.html')) {
                window.location.href = '/costureira/dashboard.html';
            } else if (!isCostureira && !window.location.pathname.includes('/admin/home.html')) {
                window.location.href = '/admin/home.html';
            }
        }
    }
});