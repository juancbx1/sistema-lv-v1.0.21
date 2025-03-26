// js/pages/login.js
import { obterUsuarios } from '../js/utils/storage.js';
import { sincronizarPermissoesUsuario } from '../js/utils/auth.js';
import { permissoesPorTipo } from '../js/utils/permissoes.js'; 

const loginForm = document.getElementById('loginForm');
const nomeUsuarioInput = document.getElementById('nomeUsuario');
const senhaInput = document.getElementById('senha');
const keepLoggedInInput = document.getElementById('keepLoggedIn');
const submitBtn = loginForm?.querySelector('button[type="submit"]');
const loadingSpinner = submitBtn?.querySelector('.loading-spinner');

// Mostrar/Esconder Senha
const togglePassword = document.querySelector('.toggle-password');
togglePassword.addEventListener('click', () => {
    const senhaInput = document.getElementById('senha');
    const isPassword = senhaInput.type === 'password';
    senhaInput.type = isPassword ? 'text' : 'password';
    togglePassword.classList.toggle('fa-eye', isPassword);
    togglePassword.classList.toggle('fa-eye-slash', !isPassword);
});

// Função para validar nome de usuário
function validarNomeUsuario(nomeUsuario) {
    const re = /^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*$/;
    return re.test(nomeUsuario);
}

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

loginForm?.addEventListener('submit', function(e) {
    e.preventDefault();

    const nomeUsuario = nomeUsuarioInput.value.trim();
    const senha = senhaInput.value;
    const keepLoggedIn = keepLoggedInInput.checked;

    // Validações
    let hasError = false;

    if (!validarNomeUsuario(nomeUsuario)) {
        mostrarErro(nomeUsuarioInput, 'O usuário só pode conter letras, números e pontos (ex: joao.silva).');
        hasError = true;
    } else {
        limparErro(nomeUsuarioInput);
    }

    if (senha.length < 1) {
        mostrarErro(senhaInput, 'Por favor, insira sua senha.');
        hasError = true;
    } else {
        limparErro(senhaInput);
    }

    if (hasError) return;

    submitBtn.disabled = true;
    loadingSpinner.style.display = 'inline-block';

    setTimeout(() => {
        const usuarios = obterUsuarios();
        const usuario = usuarios.find(u => u.nomeUsuario === nomeUsuario && u.senha === senha);

        if (usuario) {
            const tipos = usuario.tipos && Array.isArray(usuario.tipos) ? usuario.tipos : (usuario.tipo ? [usuario.tipo] : []);

            if (tipos.length === 0) {
                alert('Erro: O usuário não possui tipos definidos.');
                submitBtn.disabled = false;
                loadingSpinner.style.display = 'none';
                return;
            }

            const usuarioLogado = { ...usuario, tipos };
            delete usuarioLogado.tipo;

            // Sincroniza as permissões
            sincronizarPermissoesUsuario(usuarioLogado);

            // Filtra permissões para admins, removendo antigas
            const permissoesValidasAdmin = new Set(permissoesPorTipo['admin']);
            usuarioLogado.permissoes = usuarioLogado.permissoes.filter(permissao => permissoesValidasAdmin.has(permissao));

            // Salva o estado de "mantenha logado" no localStorage
            localStorage.setItem('keepLoggedIn', keepLoggedIn);

            // Salva o usuário logado
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

            const permissoes = usuarioLogado.permissoes || [];
            const isCostureira = tipos.includes('costureira');

            if (isCostureira) {
                if (permissoes.includes('acesso-costureira-dashboard')) {
                    window.location.href = '/costureira/dashboard.html';
                } else {
                    alert('Usuário não tem permissão para acessar a dashboard de costureira.');
                    localStorage.removeItem('usuarioLogado');
                    localStorage.removeItem('keepLoggedIn');
                    submitBtn.disabled = false;
                    loadingSpinner.style.display = 'none';
                }
            } else {
                if (permissoes.includes('acesso-home')) {
                    window.location.href = '/public/admin/home.html';
                } else {
                    alert('Usuário não tem permissões para acessar nenhuma página. Entre em contato com o administrador.');
                    localStorage.removeItem('usuarioLogado');
                    localStorage.removeItem('keepLoggedIn');
                    submitBtn.disabled = false;
                    loadingSpinner.style.display = 'none';
                }
            }
        } else {
            alert('Usuário ou senha incorretos!');
            submitBtn.disabled = false;
            loadingSpinner.style.display = 'none';
        }
    }, 1000);
});

// Verifica se o usuário marcou "mantenha logado" anteriormente
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname === '/' || window.location.pathname.includes('index.html')) {
        const keepLoggedIn = localStorage.getItem('keepLoggedIn') === 'true';
        if (keepLoggedIn) {
            const usuarioLogado = localStorage.getItem('usuarioLogado');
            if (usuarioLogado) {
                const usuario = JSON.parse(usuarioLogado);
                const permissoes = usuario.permissoes || [];
                const tipos = usuario.tipos || [];
                const isCostureira = tipos.includes('costureira');

                if (isCostureira) {
                    if (permissoes.includes('acesso-costureira-dashboard') && !window.location.pathname.includes('/costureira/dashboard.html')) {
                        window.location.href = '/costureira/dashboard.html';
                    } else {
                        alert('Usuário não tem permissão para acessar a dashboard de costureira.');
                        localStorage.removeItem('usuarioLogado');
                        localStorage.removeItem('keepLoggedIn');
                    }
                } else {
                    if (permissoes.includes('acesso-home') && !window.location.pathname.includes('/public/admin/home.html')) {
                        window.location.href = '/public/admin/home.html';
                    } else {
                        alert('Usuário não tem permissões para acessar nenhuma página. Entre em contato com o administrador.');
                        localStorage.removeItem('usuarioLogado');
                        localStorage.removeItem('keepLoggedIn');
                    }
                }
            }
        }
    }
});