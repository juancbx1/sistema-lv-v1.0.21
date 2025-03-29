// /js/admin-permissoes-usuarios.js
import { verificarAutenticacao, logout } from '/js/utils/auth.js';
import { permissoesDisponiveis } from '/js/utils/permissoes.js';

async function obterUsuarios() {
  const token = localStorage.getItem('token');
  console.log('[obterUsuarios] Token usado:', token);
  const response = await fetch('/api/usuarios', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    console.error('[obterUsuarios] Resposta da API falhou:', response.status);
    throw new Error('Erro ao carregar usuários');
  }
  const usuarios = await response.json();
  console.log('[obterUsuarios] Usuários retornados:', usuarios);
  return usuarios;
}

async function salvarUsuarios(usuarios) {
  const token = localStorage.getItem('token');
  console.log('[salvarUsuarios] Token usado:', token);
  console.log('[salvarUsuarios] Usuários a salvar:', usuarios);
  const url = '/api/usuarios/batch'; 
  console.log('[salvarUsuarios] Enviando requisição para:', url);
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(usuarios),
  });
  if (!response.ok) {
    console.error('[salvarUsuarios] Resposta da API falhou:', response.status, await response.text());
    throw new Error('Erro ao salvar permissões');
  }
  console.log('[salvarUsuarios] Permissões salvas com sucesso');
}


document.addEventListener('DOMContentLoaded', async () => {
  try {
    const auth = await verificarAutenticacao('permissoes-usuarios.html', ['gerenciar-permissoes']);
    if (!auth) {
      console.log('[admin-permissoes-usuarios] Autenticação falhou, redirecionamento já tratado');
      return;
    }

    const usuarioLogado = auth.usuario;
    const permissoes = auth.permissoes || [];
    console.log('[admin-permissoes-usuarios] Autenticação bem-sucedida, usuário:', usuarioLogado);
    console.log('[admin-permissoes-usuarios] Permissões do usuário logado:', permissoes);

    await carregarPermissoesUsuarios(usuarioLogado);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        console.log('[admin-permissoes-usuarios] Botão de logout clicado');
        logout();
      });
    }

    const salvarPermissoesBtn = document.getElementById('salvarPermissoes');
    if (salvarPermissoesBtn) {
      salvarPermissoesBtn.addEventListener('click', () => {
        console.log('[admin-permissoes-usuarios] Botão de salvar permissões clicado');
        salvarPermissoes();
      });
    }
  } catch (error) {
    console.error('[admin-permissoes-usuarios] Erro no carregamento da página:', error);
    // window.location.href = '/index.html'; // Mantido comentado para depuração
  }
});

async function carregarPermissoesUsuarios(usuarioLogado) {
  try {
    console.log('[carregarPermissoesUsuarios] Iniciando carregamento para usuário logado:', usuarioLogado);
    const usuarios = await obterUsuarios();
    const permissoesLista = document.getElementById('permissoesLista');
    if (!permissoesLista) {
      console.error('[carregarPermissoesUsuarios] Elemento #permissoesLista não encontrado');
      return;
    }

    permissoesLista.innerHTML = '';
    console.log('[carregarPermissoesUsuarios] Usuários recebidos:', usuarios);
    const usuariosFiltrados = usuarios.filter(usuario => usuario.id !== usuarioLogado.id);
    console.log('[carregarPermissoesUsuarios] Usuários filtrados:', usuariosFiltrados);

    if (usuariosFiltrados.length === 0) {
      permissoesLista.innerHTML = '<p>Nenhum usuário disponível para gerenciar permissões.</p>';
      console.log('[carregarPermissoesUsuarios] Nenhum usuário disponível após filtro');
      return;
    }

    usuariosFiltrados.forEach(usuario => {
      console.log('[carregarPermissoesUsuarios] Renderizando usuário:', usuario);
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
        console.log(`[carregarPermissoesUsuarios] Usuário ${usuario.id} - Permissão ${permissao.id}: ${isChecked ? 'Marcada' : 'Desmarcada'}`);
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
  } catch (error) {
    console.error('[carregarPermissoesUsuarios] Erro ao carregar permissões:', error);
    alert('Erro ao carregar usuários');
  }
}

async function salvarPermissoes() {
  try {
    const usuarios = await obterUsuarios();
    const permissoesLista = document.getElementById('permissoesLista');
    if (!permissoesLista) {
      console.error('[salvarPermissoes] Elemento #permissoesLista não encontrado');
      return;
    }

    const usuariosAtualizados = [];
    permissoesLista.querySelectorAll('.usuario-permissoes').forEach(usuarioDiv => {
      const usuarioId = parseInt(usuarioDiv.querySelector('.permissoes-checkboxes').dataset.usuarioId);
      const checkboxes = usuarioDiv.querySelectorAll('input[type="checkbox"]');
      const novasPermissoes = [];

      checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
          novasPermissoes.push(checkbox.dataset.permissaoId);
        }
      });

      usuariosAtualizados.push({ id: usuarioId, permissoes: novasPermissoes });
      console.log(`[salvarPermissoes] Permissões atualizadas para o usuário ${usuarioId}:`, novasPermissoes);
    });

    await salvarUsuarios(usuariosAtualizados);
    alert('Permissões salvas com sucesso!');
    window.location.reload();
  } catch (error) {
    console.error('[salvarPermissoes] Erro:', error);
    alert('Erro ao salvar permissões');
  }
}