// js/pages/admin-permissoes-usuarios.js
import { verificarAutenticacao } from './utils/auth.js';
import { obterUsuarios, salvarUsuarios } from './utils/storage.js';
import { permissoesDisponiveis } from './utils/permissoes.js';
import { logout } from './utils/auth.js';

// Verificação de autenticação
document.addEventListener('DOMContentLoaded', () => {
    const auth = verificarAutenticacao('permissoes-usuarios.html', ['gerenciar-permissoes']);
    if (!auth) {
        return;
    }

    const usuarioLogado = auth.usuario;
    const permissoes = auth.permissoes || [];
    console.log('[admin-permissoes-usuarios] Autenticação bem-sucedida, permissões:', permissoes);

    // Carrega a lista de usuários e suas permissões
    carregarPermissoesUsuarios(usuarioLogado);

    // Configura o botão de logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            console.log('[admin-permissoes-usuarios] Botão de logout clicado');
            logout();
        });
    }

    // Configura o botão de salvar permissões
    const salvarPermissoesBtn = document.getElementById('salvarPermissoes');
    if (salvarPermissoesBtn) {
        salvarPermissoesBtn.addEventListener('click', () => {
            console.log('[admin-permissoes-usuarios] Botão de salvar permissões clicado');
            salvarPermissoes();
        });
    }
});

// Função para carregar a lista de usuários e suas permissões
function carregarPermissoesUsuarios(usuarioLogado) {
    const usuarios = obterUsuarios() || [];
    const permissoesLista = document.getElementById('permissoesLista');
    if (!permissoesLista) {
        console.error('[carregarPermissoesUsuarios] Elemento #permissoesLista não encontrado');
        return;
    }

    permissoesLista.innerHTML = '';

    // Filtra os usuários, excluindo o usuário logado
    const usuariosFiltrados = usuarios.filter(usuario => usuario.id !== usuarioLogado.id);

    if (usuariosFiltrados.length === 0) {
        permissoesLista.innerHTML = '<p>Nenhum usuário disponível para gerenciar permissões.</p>';
        return;
    }

    usuariosFiltrados.forEach(usuario => {
        const usuarioDiv = document.createElement('div');
        usuarioDiv.classList.add('usuario-permissoes');
        usuarioDiv.innerHTML = `
            <h3>${usuario.nome} (${usuario.email})</h3>
            <div class="permissoes-checkboxes" data-usuario-id="${usuario.id}"></div>
        `;

        const permissoesContainer = usuarioDiv.querySelector('.permissoes-checkboxes');
        permissoesDisponiveis.forEach(permissao => {
            const permissaoDiv = document.createElement('div');
            permissaoDiv.classList.add('permissao-item');
            const isChecked = (usuario.permissoes || []).includes(permissao.id);
            permissaoDiv.innerHTML = `
                <label>
                    <input type="checkbox" 
                           data-permissao-id="${permissao.id}" 
                           ${isChecked ? 'checked' : ''}>
                    ${permissao.label}
                </label>
            `;
            permissoesContainer.appendChild(permissaoDiv);
        });

        permissoesLista.appendChild(usuarioDiv);
    });
}

// Função para salvar as permissões atualizadas
function salvarPermissoes() {
    const usuarios = obterUsuarios() || [];
    const permissoesLista = document.getElementById('permissoesLista');
    if (!permissoesLista) {
        console.error('[salvarPermissoes] Elemento #permissoesLista não encontrado');
        return;
    }

    const usuariosAtualizados = [...usuarios];

    permissoesLista.querySelectorAll('.usuario-permissoes').forEach(usuarioDiv => {
        const usuarioId = parseInt(usuarioDiv.querySelector('.permissoes-checkboxes').dataset.usuarioId);
        const checkboxes = usuarioDiv.querySelectorAll('input[type="checkbox"]');
        const novasPermissoes = [];

        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                novasPermissoes.push(checkbox.dataset.permissaoId);
            }
        });

        const usuarioIndex = usuariosAtualizados.findIndex(u => u.id === usuarioId);
        if (usuarioIndex !== -1) {
            usuariosAtualizados[usuarioIndex].permissoes = novasPermissoes;
            console.log(`[salvarPermissoes] Permissões atualizadas para o usuário ${usuarioId}:`, novasPermissoes);
        }
    });

    salvarUsuarios(usuariosAtualizados);
    alert('Permissões salvas com sucesso!');
    // Recarrega a página para refletir as alterações
    window.location.reload();
}