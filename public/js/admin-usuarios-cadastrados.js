// public/js/admin-usuarios-cadastrados.js
import { verificarAutenticacao } from '/js/utils/auth.js';

// Definição dos tipos de usuário disponíveis para seleção (poderia vir de permissoes.js também)
const TIPOS_USUARIO_DISPONIVEIS = [
    { id: 'administrador', label: 'Administrador' },
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'lider_setor', label: 'Líder de Setor' },
    { id: 'costureira', label: 'Costureira' },
    { id: 'tiktik', label: 'TikTik' },
    { id: 'cortador', label: 'Cortador' }
];


document.addEventListener('DOMContentLoaded', async () => {
  const auth = await verificarAutenticacao('usuarios-cadastrados.html', ['acesso-usuarios-cadastrados']);
  if (!auth) {
    // verificarAutenticacao já deve redirecionar, mas por segurança:
    window.location.href = '/admin/acesso-negado.html'; // ou '/index.html'
    throw new Error('Autenticação falhou');
  }

  const permissoesDoUsuarioLogado = auth.permissoes || [];
  console.log('[admin-usuarios-cadastrados] Permissões do usuário logado:', permissoesDoUsuarioLogado);

  const listaEl = document.getElementById('usuariosLista');
  const filtroTipoEl = document.getElementById('filtroTipoUsuario');
  const loadingSpinnerEl = document.getElementById('loadingSpinner');
  const prevPageBtnEl = document.getElementById('prevPage');
  const nextPageBtnEl = document.getElementById('nextPage');
  const pageInfoEl = document.getElementById('pageInfo');
  const usuariosPorPagina = 8; // Pode ajustar
  let paginaAtual = 1;
  let todosOsUsuarios = []; // Cache dos usuários
  let usuariosFiltradosGlobal = []; // Para paginação

  async function carregarUsuariosCadastrados() {
    if (!listaEl) return;
    loadingSpinnerEl.style.display = 'block';
    listaEl.innerHTML = ''; // Limpa a lista antes de carregar
    try {
      const response = await fetch('/api/usuarios', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error(`Erro HTTP ${response.status} ao carregar usuários.`);
      todosOsUsuarios = await response.json();
      todosOsUsuarios.sort((a, b) => a.nome.localeCompare(b.nome)); // Ordena por nome
      filtrarEPaginarUsuarios();
    } catch (error) {
      console.error('[carregarUsuariosCadastrados] Erro:', error);
      listaEl.innerHTML = '<p class="uc-erro-carregamento">Erro ao carregar usuários. Tente novamente mais tarde.</p>';
    } finally {
      loadingSpinnerEl.style.display = 'none';
    }
  }

  function filtrarEPaginarUsuarios() {
    const filtroSelecionado = filtroTipoEl.value || '';
    usuariosFiltradosGlobal = filtroSelecionado 
        ? todosOsUsuarios.filter(u => u.tipos && u.tipos.includes(filtroSelecionado)) 
        : [...todosOsUsuarios];

    const totalPaginas = Math.ceil(usuariosFiltradosGlobal.length / usuariosPorPagina);
    paginaAtual = Math.max(1, Math.min(paginaAtual, totalPaginas)); // Garante que a página atual é válida

    const inicio = (paginaAtual - 1) * usuariosPorPagina;
    const fim = inicio + usuariosPorPagina;
    const usuariosDaPagina = usuariosFiltradosGlobal.slice(inicio, fim);

    renderizarCardsUsuarios(usuariosDaPagina);
    atualizarControlesPaginacao(totalPaginas);
  }

  function renderizarCardsUsuarios(usuariosParaRenderizar) {
    listaEl.innerHTML = ''; // Limpa
    if (usuariosParaRenderizar.length === 0) {
        listaEl.innerHTML = '<p class="uc-sem-resultados">Nenhum usuário encontrado com os filtros aplicados.</p>';
        return;
    }

    usuariosParaRenderizar.forEach((usuario) => {
      const card = document.createElement('div');
      card.className = 'usuario-card';
      card.dataset.usuarioId = usuario.id; // Adiciona ID para referência

      const tiposAtuais = Array.isArray(usuario.tipos) ? usuario.tipos : [];
      const tiposLabels = tiposAtuais.map(tipo => {
          const tipoObj = TIPOS_USUARIO_DISPONIVEIS.find(t => t.id === tipo);
          return tipoObj ? tipoObj.label : tipo.charAt(0).toUpperCase() + tipo.slice(1);
      }).join(', ') || 'Nenhum tipo';

      // Checkboxes para tipos
      let tiposCheckboxesHtml = TIPOS_USUARIO_DISPONIVEIS.map(tipoDisp => `
        <label>
          <input type="checkbox" name="tipoUsuario" value="${tipoDisp.id}" 
                 ${tiposAtuais.includes(tipoDisp.id) ? 'checked' : ''} disabled>
          ${tipoDisp.label}
        </label>
      `).join('');

      card.innerHTML = `
        <div class="usuario-info">
          <p><span>Nome:</span> <strong class="uc-nome-usuario">${usuario.nome}</strong></p>
          
          <p><span>Usuário:</span> 
            <span class="uc-dado-texto uc-nome-usuario-texto">${usuario.nome_usuario}</span>
            <input type="text" class="uc-input-edit uc-nome-usuario-input" value="${usuario.nome_usuario}" style="display: none;">
          </p>
          
          <p><span>Email:</span> 
            <span class="uc-dado-texto uc-email-texto">${usuario.email}</span>
            <input type="email" class="uc-input-edit uc-email-input" value="${usuario.email}" style="display: none;">
          </p>
          
          <p><span>Tipos:</span> 
            <span class="uc-dado-texto uc-tipos-texto">${tiposLabels}</span>
            <div class="uc-tipos-container" style="display: none;">${tiposCheckboxesHtml}</div>
          </p>
          
          <p><span>Nível:</span> 
            ${tiposAtuais.includes('costureira') ? `
              <span class="uc-dado-texto uc-nivel-texto">Nível ${usuario.nivel || 'N/A'}</span>
              <select class="uc-select-edit uc-nivel-select" style="display: none;" ${!permissoesDoUsuarioLogado.includes('editar-usuarios') ? 'disabled' : ''}>
                <option value="1" ${usuario.nivel === 1 ? 'selected' : ''}>Nível 1 (Reta)</option>
                <option value="2" ${usuario.nivel === 2 ? 'selected' : ''}>Nível 2 (Reta ou Overloque)</option>
                <option value="3" ${usuario.nivel === 3 ? 'selected' : ''}>Nível 3 (Reta ou Galoneira)</option>
                <option value="4" ${usuario.nivel === 4 ? 'selected' : ''}>Nível 4 (Todas)</option>
              </select>
            ` : '<span class="uc-dado-texto">-</span>'}
          </p>
        </div>
        <div class="uc-card-botoes-container">
            ${permissoesDoUsuarioLogado.includes('editar-usuarios') ? `
                <button class="uc-btn uc-btn-editar" data-action="editar">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="uc-btn uc-btn-salvar" data-action="salvar" style="display: none;">
                    <i class="fas fa-save"></i> Salvar
                </button>
                <button class="uc-btn uc-btn-cancelar" data-action="cancelar" style="display: none;">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            ` : ''}
            ${permissoesDoUsuarioLogado.includes('excluir-usuarios') ? `
                <button class="uc-btn uc-btn-excluir-card" data-action="excluir">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            ` : ''}
        </div>
      `;
      listaEl.appendChild(card);
    });
    adicionarEventosAosCards();
  }

  function atualizarControlesPaginacao(totalPaginas) {
    pageInfoEl.textContent = totalPaginas > 0 ? `Página ${paginaAtual} de ${totalPaginas}` : 'Nenhuma página';
    prevPageBtnEl.disabled = paginaAtual === 1;
    nextPageBtnEl.disabled = paginaAtual === totalPaginas || totalPaginas === 0;
  }

  function adicionarEventosAosCards() {
    document.querySelectorAll('.usuario-card').forEach(card => {
      const usuarioId = card.dataset.usuarioId;
      const btnEditar = card.querySelector('.uc-btn-editar');
      const btnSalvar = card.querySelector('.uc-btn-salvar');
      const btnCancelar = card.querySelector('.uc-btn-cancelar');
      const btnExcluir = card.querySelector('.uc-btn-excluir-card');

      const nomeUsuarioTexto = card.querySelector('.uc-nome-usuario-texto');
      const nomeUsuarioInput = card.querySelector('.uc-nome-usuario-input');
      const emailTexto = card.querySelector('.uc-email-texto');
      const emailInput = card.querySelector('.uc-email-input');
      const tiposTexto = card.querySelector('.uc-tipos-texto');
      const tiposContainer = card.querySelector('.uc-tipos-container');
      const nivelTexto = card.querySelector('.uc-nivel-texto');
      const nivelSelect = card.querySelector('.uc-nivel-select');
      
      // Guardar valores originais para o botão cancelar
      let originalNomeUsuario, originalEmail, originalTipos = [], originalNivel;

      if (btnEditar) {
        btnEditar.addEventListener('click', () => {
          // Guardar valores atuais
          originalNomeUsuario = nomeUsuarioTexto.textContent;
          originalEmail = emailTexto.textContent;
          if (tiposContainer) {
              originalTipos = Array.from(tiposContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
          }
          if (nivelSelect) originalNivel = nivelSelect.value;


          nomeUsuarioTexto.style.display = 'none';
          nomeUsuarioInput.style.display = 'inline-block';
          emailTexto.style.display = 'none';
          emailInput.style.display = 'inline-block';
          
          tiposTexto.style.display = 'none';
          if (tiposContainer) {
            tiposContainer.style.display = 'flex'; // ou 'block' dependendo do seu CSS
            tiposContainer.classList.add('editando');
            tiposContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = false);
          }
          
          if (nivelTexto && nivelSelect) {
            nivelTexto.style.display = 'none';
            nivelSelect.style.display = 'inline-block';
            nivelSelect.disabled = false;
          }

          btnEditar.style.display = 'none';
          btnSalvar.style.display = 'inline-flex';
          btnCancelar.style.display = 'inline-flex';
          if(btnExcluir) btnExcluir.style.display = 'none'; // Esconde excluir durante edição
        });
      }

      if (btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            // Restaurar valores
            nomeUsuarioInput.value = originalNomeUsuario;
            emailInput.value = originalEmail;
            if (tiposContainer) {
                tiposContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.checked = originalTipos.includes(cb.value);
                });
            }
            if (nivelSelect) nivelSelect.value = originalNivel;

            // Alternar visibilidade
            nomeUsuarioTexto.style.display = 'inline-block';
            nomeUsuarioInput.style.display = 'none';
            emailTexto.style.display = 'inline-block';
            emailInput.style.display = 'none';

            tiposTexto.style.display = 'inline-block';
            if (tiposContainer) {
                tiposContainer.style.display = 'none';
                tiposContainer.classList.remove('editando');
                tiposContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = true);
            }

            if (nivelTexto && nivelSelect) {
                nivelTexto.style.display = 'inline-block';
                nivelSelect.style.display = 'none';
                nivelSelect.disabled = true;
            }

            btnEditar.style.display = 'inline-flex';
            btnSalvar.style.display = 'none';
            btnCancelar.style.display = 'none';
            if(btnExcluir) btnExcluir.style.display = 'inline-flex';
        });
      }


      if (btnSalvar) {
        btnSalvar.addEventListener('click', async () => {
          const payload = { id: usuarioId };
          let mudancasFeitas = false;

          const novoNomeUsuario = nomeUsuarioInput.value.trim();
          if (novoNomeUsuario !== originalNomeUsuario) {
            payload.nomeUsuario = novoNomeUsuario;
            mudancasFeitas = true;
          }

          const novoEmail = emailInput.value.trim();
          if (novoEmail !== originalEmail) {
            payload.email = novoEmail;
            mudancasFeitas = true;
          }
          
          let novosTipos = [];
          if (tiposContainer) {
              novosTipos = Array.from(tiposContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
              // Compara arrays (precisa ser mais robusto se a ordem não importar, mas para simples adição/remoção funciona)
              if (JSON.stringify(novosTipos.sort()) !== JSON.stringify(originalTipos.sort())) {
                  payload.tipos = novosTipos;
                  mudancasFeitas = true;
              }
          }

          if (nivelSelect && tiposAtuais.includes('costureira')) { // Só envia nível se for costureira
            const novoNivel = parseInt(nivelSelect.value);
            if (String(novoNivel) !== String(originalNivel)) { // Compara como string se originalNivel puder ser string
                payload.nivel = novoNivel;
                mudancasFeitas = true;
            }
          }

          if (!mudancasFeitas) {
            alert("Nenhuma alteração detectada.");
            // Simplesmente reverte a UI para o modo de visualização
            btnCancelar.click(); // Simula o clique no cancelar para reverter a UI
            return;
          }
          
          loadingSpinnerEl.style.display = 'block';
          try {
            const response = await fetch('/api/usuarios', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify(payload),
            });
            if (response.ok) {
              alert('Usuário atualizado com sucesso!');
              await carregarUsuariosCadastrados(); // Recarrega a lista para refletir as mudanças
            } else {
              const errorData = await response.json().catch(() => ({error: `Erro HTTP ${response.status}`}));
              console.error("Erro ao salvar:", errorData);
              alert(`Erro ao atualizar usuário: ${errorData.error || 'Verifique os dados.'}`);
            }
          } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            alert('Erro no servidor ao atualizar usuário.');
          } finally {
            loadingSpinnerEl.style.display = 'none';
            // A UI será atualizada por carregarUsuariosCadastrados se sucesso
            // Se falhar, o usuário pode tentar de novo ou cancelar
          }
        });
      }

      if (btnExcluir) {
        btnExcluir.addEventListener('click', async () => {
          if (confirm(`Tem certeza que deseja excluir o usuário "${nomeUsuarioTexto.textContent}"?`)) {
            loadingSpinnerEl.style.display = 'block';
            try {
              const response = await fetch('/api/usuarios', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ id: usuarioId }),
              });
              if (response.ok) {
                alert('Usuário excluído com sucesso!');
                // Remove o card da UI imediatamente ou recarrega a lista
                // card.remove(); // Opção 1: remover direto
                await carregarUsuariosCadastrados(); // Opção 2: recarregar (mais seguro para paginação)
              } else {
                const errorData = await response.json().catch(() => ({error: `Erro HTTP ${response.status}`}));
                alert(`Erro ao excluir usuário: ${errorData.error || 'Tente novamente.'}`);
              }
            } catch (error) {
              console.error('Erro ao excluir usuário:', error);
              alert('Erro no servidor ao excluir usuário.');
            } finally {
              loadingSpinnerEl.style.display = 'none';
            }
          }
        });
      }
    });
  }

  // Eventos de Paginação
  prevPageBtnEl.addEventListener('click', () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      filtrarEPaginarUsuarios();
    }
  });

  nextPageBtnEl.addEventListener('click', () => {
    const totalPaginas = Math.ceil(usuariosFiltradosGlobal.length / usuariosPorPagina);
    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      filtrarEPaginarUsuarios();
    }
  });

  filtroTipoEl.addEventListener('change', () => {
    paginaAtual = 1;
    filtrarEPaginarUsuarios();
  });

  // Carregamento inicial
  await carregarUsuariosCadastrados();
});