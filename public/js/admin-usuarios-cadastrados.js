import { verificarAutenticacao } from '/js/utils/auth.js'; // Substituí verificarAutenticacaoSincrona por assíncrono
import { toggleVisibilidade } from '/js/utils/dom-utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await verificarAutenticacao('usuarios-cadastrados.html', ['acesso-usuarios-cadastrados']);
  if (!auth) throw new Error('Autenticação falhou');

  const permissoes = auth.permissoes || [];
  console.log('[admin-usuarios-cadastrados] Permissões:', permissoes);

  const lista = document.getElementById('usuariosLista');
  const filtroTipo = document.getElementById('filtroTipoUsuario');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');
  const usuariosPorPagina = 8;
  let paginaAtual = 1;
  let usuarios = [];

  async function carregarUsuariosCadastrados() {
    if (!lista) return;

    loadingSpinner.style.display = 'block';
    try {
      const response = await fetch('/api/usuarios', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error(`Erro ao carregar usuários: ${response.status}`);
      usuarios = await response.json();

      filtrarEPaginarUsuarios();
    } catch (error) {
      console.error('[carregarUsuariosCadastrados] Erro:', error);
      lista.innerHTML = '<p>Erro ao carregar usuários. Tente novamente mais tarde.</p>';
    } finally {
      loadingSpinner.style.display = 'none';
    }
  }

  async function fetchWithToken(url, options) {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/index.html');
      return;
    }
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}` },
    });
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.replace('/index.html');
    }
    return response;
  }

  function debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
  

  function filtrarEPaginarUsuarios() {
    const filtro = filtroTipo.value || '';
    let usuariosFiltrados = filtro ? usuarios.filter(u => u.tipos.includes(filtro)) : usuarios;

    const totalPaginas = Math.ceil(usuariosFiltrados.length / usuariosPorPagina);
    paginaAtual = Math.min(paginaAtual, totalPaginas || 1);

    const inicio = (paginaAtual - 1) * usuariosPorPagina;
    const fim = inicio + usuariosPorPagina;
    const usuariosPagina = usuariosFiltrados.slice(inicio, fim);

    lista.innerHTML = '';
    usuariosPagina.forEach((usuario) => {
      const card = document.createElement('div');
      card.className = 'usuario-card';
      const tiposLabels = usuario.tipos.map(tipo => tipo.charAt(0).toUpperCase() + tipo.slice(1)).join(', ') || 'Nenhum tipo';

      card.innerHTML = `
        <div class="usuario-info">
          <p><span>Nome:</span> ${usuario.nome}</p>
          <p><span>Nome de Usuário:</span> 
            <span class="nome-usuario-texto" data-id="${usuario.id}">${usuario.nome_usuario}</span>
            <input type="text" class="nome-usuario-input" data-id="${usuario.id}" value="${usuario.nome_usuario}" style="display: none;">
            ${permissoes.includes('editar-usuarios') ? `
              <button class="editar-nome-usuario" data-id="${usuario.id}">Editar</button>
              <button class="salvar-nome-usuario" data-id="${usuario.id}" style="display: none;">Salvar</button>
            ` : ''}
          </p>
          <p><span>Email:</span> 
            <span class="email-texto" data-id="${usuario.id}">${usuario.email}</span>
            <input type="email" class="email-input" data-id="${usuario.id}" value="${usuario.email}" style="display: none;">
            ${permissoes.includes('editar-usuarios') ? `
              <button class="editar-email" data-id="${usuario.id}">Editar</button>
              <button class="salvar-email" data-id="${usuario.id}" style="display: none;">Salvar</button>
            ` : ''}
          </p>
          <p><span>Tipos:</span> ${tiposLabels}</p>
          <p><span>Nível:</span> 
            ${usuario.tipos.includes('costureira') ? `
              <select class="nivel-select" data-id="${usuario.id}" ${!permissoes.includes('editar-usuarios') ? 'disabled' : ''}>
                <option value="1" ${usuario.nivel === 1 ? 'selected' : ''}>Nível 1 (Reta)</option>
                <option value="2" ${usuario.nivel === 2 ? 'selected' : ''}>Nível 2 (Reta ou Overloque)</option>
                <option value="3" ${usuario.nivel === 3 ? 'selected' : ''}>Nível 3 (Reta ou Galoneira)</option>
                <option value="4" ${usuario.nivel === 4 ? 'selected' : ''}>Nível 4 (Todas)</option>
              </select>
              ${permissoes.includes('editar-usuarios') ? `
                <button class="editar-nivel" data-id="${usuario.id}">Editar</button>
                <button class="salvar-nivel" data-id="${usuario.id}" style="display: none;">Salvar</button>
              ` : ''}
            ` : '-'}
          </p>
        </div>
        ${permissoes.includes('excluir-usuarios') ? `<button class="btn-excluir" data-id="${usuario.id}">Excluir Usuário</button>` : ''}
      `;
      lista.appendChild(card);
    });

    // Atualizar controles de paginação
    pageInfo.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
    prevPageBtn.disabled = paginaAtual === 1;
    nextPageBtn.disabled = paginaAtual === totalPaginas || totalPaginas === 0;

    adicionarEventosEdicao();
  }

  function adicionarEventosEdicao() {
    if (permissoes.includes('editar-usuarios')) {
      // Editar Nome de Usuário
      document.querySelectorAll('.editar-nome-usuario').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const texto = btn.parentElement.querySelector('.nome-usuario-texto');
          const input = btn.parentElement.querySelector('.nome-usuario-input');
          const salvarBtn = btn.nextElementSibling;

          texto.style.display = 'none';
          input.style.display = 'inline-block';
          btn.style.display = 'none';
          salvarBtn.style.display = 'inline-block';
        });
      });

      document.querySelectorAll('.salvar-nome-usuario').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const input = btn.parentElement.querySelector('.nome-usuario-input');
          const novoNomeUsuario = input.value.trim();

          loadingSpinner.style.display = 'block';
          try {
            const response = await fetch('/api/usuarios', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ id, nomeUsuario: novoNomeUsuario }),
            });
            if (response.ok) {
              const texto = btn.parentElement.querySelector('.nome-usuario-texto');
              texto.textContent = novoNomeUsuario;
              texto.style.display = 'inline';
              input.style.display = 'none';
              btn.style.display = 'none';
              btn.previousElementSibling.style.display = 'inline-block';
            } else {
              alert('Erro ao atualizar nome de usuário');
            }
          } catch (error) {
            console.error('Erro ao salvar nome de usuário:', error);
            alert('Erro no servidor ao atualizar nome de usuário');
          } finally {
            loadingSpinner.style.display = 'none';
          }
        });
      });

      // Editar Email
      document.querySelectorAll('.editar-email').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const texto = btn.parentElement.querySelector('.email-texto');
          const input = btn.parentElement.querySelector('.email-input');
          const salvarBtn = btn.nextElementSibling;

          texto.style.display = 'none';
          input.style.display = 'inline-block';
          btn.style.display = 'none';
          salvarBtn.style.display = 'inline-block';
        });
      });

      document.querySelectorAll('.salvar-email').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const input = btn.parentElement.querySelector('.email-input');
          const novoEmail = input.value.trim();

          loadingSpinner.style.display = 'block';
          try {
            const response = await fetch('/api/usuarios', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ id, email: novoEmail }),
            });
            if (response.ok) {
              const texto = btn.parentElement.querySelector('.email-texto');
              texto.textContent = novoEmail;
              texto.style.display = 'inline';
              input.style.display = 'none';
              btn.style.display = 'none';
              btn.previousElementSibling.style.display = 'inline-block';
            } else {
              alert('Erro ao atualizar email');
            }
          } catch (error) {
            console.error('Erro ao salvar email:', error);
            alert('Erro no servidor ao atualizar email');
          } finally {
            loadingSpinner.style.display = 'none';
          }
        });
      });

      // Editar Nível
      document.querySelectorAll('.editar-nivel').forEach(btn => {
        btn.addEventListener('click', () => {
          const select = btn.previousElementSibling;
          const salvarBtn = btn.nextElementSibling;
          select.disabled = false;
          btn.style.display = 'none';
          salvarBtn.style.display = 'inline-block';
        });
      });

      document.querySelectorAll('.salvar-nivel').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const select = btn.previousElementSibling.previousElementSibling;
          const novoNivel = parseInt(select.value);

          loadingSpinner.style.display = 'block';
          try {
            const response = await fetch('/api/usuarios', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ id, nivel: novoNivel }),
            });
            if (response.ok) {
              select.disabled = true;
              btn.style.display = 'none';
              btn.previousElementSibling.style.display = 'inline-block';
            } else {
              alert('Erro ao atualizar nível');
            }
          } catch (error) {
            console.error('Erro ao salvar nível:', error);
            alert('Erro no servidor ao atualizar nível');
          } finally {
            loadingSpinner.style.display = 'none';
          }
        });
      });
    }

    if (permissoes.includes('excluir-usuarios')) {
      document.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (confirm('Tem certeza que deseja excluir este usuário?')) {
            loadingSpinner.style.display = 'block';
            try {
              const response = await fetch('/api/usuarios', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ id }),
              });
              if (response.ok) {
                carregarUsuariosCadastrados();
              } else {
                alert('Erro ao excluir usuário');
              }
            } catch (error) {
              console.error('Erro ao excluir usuário:', error);
              alert('Erro no servidor ao excluir usuário');
            } finally {
              loadingSpinner.style.display = 'none';
            }
          }
        });
      });
    }
  }

  // Eventos de Paginação
  prevPageBtn.addEventListener('click', () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      filtrarEPaginarUsuarios();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    const totalPaginas = Math.ceil(usuarios.length / usuariosPorPagina);
    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      filtrarEPaginarUsuarios();
    }
  });

  // Carregar usuários e adicionar evento de filtro
  await carregarUsuariosCadastrados();
  filtroTipo.addEventListener('change', () => {
    paginaAtual = 1; // Resetar para a primeira página ao filtrar
    filtrarEPaginarUsuarios();
  });
});