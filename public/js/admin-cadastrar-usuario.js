// js/pages/admin-cadastrar-usuario.js
import {  verificarAutenticacao } from './utils/auth.js';
import { obterUsuarios, salvarUsuarios } from './utils/storage.js';

// Função para inicializar a página
document.addEventListener('DOMContentLoaded', () => {
    const cadastroForm = document.getElementById('cadastroForm');
    const mensagemPermissao = document.getElementById('mensagemPermissao');
    const tipoCheckboxes = document.querySelectorAll('input[name="tipos"]');
    const nivelContainer = document.getElementById('nivelContainer');
    const submitBtn = document.getElementById('submitBtn');
    const togglePassword = document.querySelector('.toggle-password');

    // Verificação de Autenticação
    const auth = verificarAutenticacao('cadastrar-usuario.html', ['acesso-cadastrar-usuarios']);
    if (!auth) {
        throw new Error('Autenticação falhou, redirecionando...');
    }

    const permissoes = auth.permissoes || [];
    const usuarioLogado = auth.usuario;
    console.log('Inicializando cadastrar-usuario para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);

    // Mostrar/Esconder Senha
    togglePassword.addEventListener('click', () => {
        const senhaInput = document.getElementById('senha');
        const isPassword = senhaInput.type === 'password';
        senhaInput.type = isPassword ? 'text' : 'password';
        togglePassword.classList.toggle('fa-eye', isPassword);
        togglePassword.classList.toggle('fa-eye-slash', !isPassword);
    });

    // Função para validar email
    const validarEmail = (email) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    };

    // Função para validar nome de usuário
    const validarNomeUsuario = (nomeUsuario) => {
        const re = /^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*$/; // Permite letras, números e pontos (ex: joao.silva)
        return re.test(nomeUsuario);
    };

    // Funções para mostrar e limpar erros
    const mostrarErro = (inputId, mensagem) => {
        const formGroup = document.getElementById(inputId).parentElement;
        const errorMessage = formGroup.querySelector('.error-message');
        if (!errorMessage) {
            console.error(`Elemento .error-message não encontrado para o input ${inputId}`);
            return;
        }
        formGroup.classList.add('error');
        errorMessage.textContent = mensagem;
        errorMessage.style.display = 'block';
    };

    const limparErro = (inputId) => {
        const formGroup = document.getElementById(inputId).parentElement;
        const errorMessage = formGroup.querySelector('.error-message');
        if (!errorMessage) {
            console.error(`Elemento .error-message não encontrado para o input ${inputId}`);
            return;
        }
        formGroup.classList.remove('error');
        errorMessage.style.display = 'none';
    };

    // Atualizar visibilidade do campo de nível com base nos tipos selecionados
    tipoCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const tiposSelecionados = Array.from(tipoCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
            nivelContainer.style.display = tiposSelecionados.includes('costureira') ? 'block' : 'none';
        });
    });

    // Validação em tempo real
    document.getElementById('nome').addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (value.length < 2) {
            mostrarErro('nome', 'O nome deve ter pelo menos 2 caracteres.');
        } else {
            limparErro('nome');
        }
    });

    document.getElementById('nomeUsuario').addEventListener('input', (e) => {
        const value = e.target.value.trim();
        const usuarios = obterUsuarios();
        if (!validarNomeUsuario(value)) {
            mostrarErro('nomeUsuario', 'O nome de usuário só pode conter letras, números e pontos (ex: joao.silva).');
        } else if (usuarios.some(u => u.nomeUsuario === value)) {
            mostrarErro('nomeUsuario', 'Este nome de usuário já está em uso.');
        } else {
            limparErro('nomeUsuario');
        }
    });

    document.getElementById('email').addEventListener('input', (e) => {
        if (!validarEmail(e.target.value)) {
            mostrarErro('email', 'Por favor, insira um email válido.');
        } else {
            limparErro('email');
        }
    });

    document.getElementById('senha').addEventListener('input', (e) => {
        if (e.target.value.length < 6) {
            mostrarErro('senha', 'A senha deve ter pelo menos 6 caracteres.');
        } else {
            limparErro('senha');
        }
    });

    // Submissão do formulário
    cadastroForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const nome = document.getElementById('nome').value.trim();
        const nomeUsuario = document.getElementById('nomeUsuario').value.trim();
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;
        const tiposSelecionados = Array.from(tipoCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        // Validações
        let hasError = false;

        if (nome.length < 2) {
            mostrarErro('nome', 'O nome deve ter pelo menos 2 caracteres.');
            hasError = true;
        } else {
            limparErro('nome');
        }

        const usuarios = obterUsuarios();
        if (!validarNomeUsuario(nomeUsuario)) {
            mostrarErro('nomeUsuario', 'O nome de usuário só pode conter letras, números e pontos (ex: joao.silva).');
            hasError = true;
        } else if (usuarios.some(u => u.nomeUsuario === nomeUsuario)) {
            mostrarErro('nomeUsuario', 'Este nome de usuário já está em uso.');
            hasError = true;
        } else {
            limparErro('nomeUsuario');
        }

        if (!validarEmail(email)) {
            mostrarErro('email', 'Por favor, insira um email válido.');
            hasError = true;
        } else {
            limparErro('email');
        }

        if (senha.length < 6) {
            mostrarErro('senha', 'A senha deve ter pelo menos 6 caracteres.');
            hasError = true;
        } else {
            limparErro('senha');
        }

        if (tiposSelecionados.length === 0) {
            const tiposGroup = tipoCheckboxes[0].parentElement.parentElement;
            const errorMessage = tiposGroup.querySelector('.error-message');
            if (!errorMessage) {
                console.error('Elemento .error-message não encontrado para os tipos de usuário');
                hasError = true;
                return;
            }
            tiposGroup.classList.add('error');
            errorMessage.textContent = 'Selecione pelo menos um tipo de usuário.';
            errorMessage.style.display = 'block';
            hasError = true;
        } else {
            const tiposGroup = tipoCheckboxes[0].parentElement.parentElement;
            const errorMessage = tiposGroup.querySelector('.error-message');
            if (errorMessage) {
                tiposGroup.classList.remove('error');
                errorMessage.style.display = 'none';
            }
        }

        if (hasError) return;

        // Desabilitar botão e mostrar spinner
        submitBtn.disabled = true;

        // Simular delay de salvamento
        setTimeout(() => {
            const usuario = {
                id: Date.now(),
                nome,
                nomeUsuario,
                email,
                senha,
                tipos: tiposSelecionados,
                permissoes: [] // Novo usuário começa sem permissões
            };

            if (tiposSelecionados.includes('costureira')) {
                usuario.nivel = parseInt(document.getElementById('nivel').value) || 1;
            }

            // Salvar usuário no localStorage
            const usuarios = obterUsuarios();
            usuarios.push(usuario);
            salvarUsuarios(usuarios);

            // Resetar formulário
            cadastroForm.reset();
            nivelContainer.style.display = 'none';
            tipoCheckboxes.forEach(cb => cb.checked = false);

            // Reativar botão
            submitBtn.disabled = false;

            alert('Usuário cadastrado com sucesso! Você será redirecionado para a lista de usuários.');
            window.location.href = 'usuarios-cadastrados.html';
        }, 1000);
    });
});