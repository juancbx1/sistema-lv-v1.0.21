// public/js/admin-usuarios-cadastrados.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { fetchAPI } from '/js/utils/api-utils.js';

let concessionariasVTCache = [];


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
    listaEl.innerHTML = '';

    try {
        // --- MUDANÇA PRINCIPAL AQUI ---
        // Usamos Promise.all para buscar usuários e concessionárias em paralelo.
        console.log("Iniciando busca de usuários e concessionárias...");

        const [usuarios, concessionarias] = await Promise.all([
            fetchAPI('/api/usuarios'),
            fetchAPI('/api/financeiro/concessionarias-vt')
        ]);
        
        console.log(`Busca concluída: ${usuarios.length} usuários, ${concessionarias.length} concessionárias.`);

        // Armazena os resultados nos caches globais
        todosOsUsuarios = usuarios.sort((a, b) => a.nome.localeCompare(b.nome));
        concessionariasVTCache = concessionarias;

        // Agora que AMBOS os caches estão preenchidos, podemos renderizar.
        filtrarEPaginarUsuarios();

    } catch (error) {
        console.error('[carregarUsuariosCadastrados] Erro:', error);
        listaEl.innerHTML = `<p class="uc-erro-carregamento">Erro ao carregar dados: ${error.message}. Tente recarregar a página.</p>`;
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
    paginaAtual = Math.max(1, Math.min(paginaAtual, totalPaginas));

    const inicio = (paginaAtual - 1) * usuariosPorPagina;
    const fim = inicio + usuariosPorPagina;
    const usuariosDaPagina = usuariosFiltradosGlobal.slice(inicio, fim);

    // <<< MUDANÇA: Passamos as permissões para a função de renderização >>>
    renderizarCardsUsuarios(usuariosDaPagina, permissoesDoUsuarioLogado);
    atualizarControlesPaginacao(totalPaginas);
}


function renderizarCardsUsuarios(usuariosParaRenderizar, permissoes) {
    listaEl.innerHTML = '';
    if (usuariosParaRenderizar.length === 0) {
        listaEl.innerHTML = '<p class="uc-sem-resultados">Nenhum usuário encontrado com os filtros aplicados.</p>';
        return;
    }

    // <<< VERIFICAÇÃO DE SEGURANÇA >>>
    if (!concessionariasVTCache || concessionariasVTCache.length === 0) {
        console.warn("Atenção: O cache de concessionárias está vazio no momento da renderização.");
    }

    usuariosParaRenderizar.forEach((usuario) => {
        const card = document.createElement('div');
        card.className = 'usuario-card';
        card.dataset.usuarioId = usuario.id;

        const tiposAtuais = Array.isArray(usuario.tipos) ? usuario.tipos : [];
        const ehFuncionario = tiposAtuais.includes('costureira') || tiposAtuais.includes('tiktik');

        const tiposLabels = tiposAtuais.map(tipo => {
            const tipoObj = TIPOS_USUARIO_DISPONIVEIS.find(t => t.id === tipo);
            return tipoObj ? tipoObj.label : tipo.charAt(0).toUpperCase() + tipo.slice(1);
        }).join(', ') || 'Nenhum tipo';

        let tiposCheckboxesHtml = TIPOS_USUARIO_DISPONIVEIS.map(tipoDisp => `
            <label><input type="checkbox" name="tipoUsuario" value="${tipoDisp.id}" ${tiposAtuais.includes(tipoDisp.id) ? 'checked' : ''} disabled> ${tipoDisp.label}</label>
        `).join('');

        const vinculoTexto = usuario.id_contato_financeiro 
            ? `<i class="fas fa-check-circle" style="color: #27ae60;"></i> Vinculado a: <strong>${usuario.nome_contato_financeiro || 'Contato não encontrado'}</strong>` 
            : `<i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i> Não vinculado`;
        
        // <<< LÓGICA CORRIGIDA PARA GERAR OS CHECKBOXES DE CONCESSIONÁRIAS >>>
         const idsConcessionariasDoUsuario = Array.isArray(usuario.concessionarias_vt) ? usuario.concessionarias_vt : [];
        const concessionariasCheckboxesHtml = concessionariasVTCache.length > 0
            ? concessionariasVTCache.map(conc => `
                <label>
                    <input type="checkbox" class="uc-checkbox-edit uc-concessionaria-checkbox" 
                           value="${conc.id}" 
                           ${idsConcessionariasDoUsuario.includes(conc.id) ? 'checked' : ''} 
                           disabled>
                    ${conc.nome}
                </label>
            `).join('')
            : '<span>Nenhuma concessionária cadastrada.</span>'; // Esta mensagem só deve aparecer se o cache estiver vazio.

        const podeEditar = permissoes.includes('editar-usuarios');
        const podeExcluir = permissoes.includes('excluir-usuarios');

        card.innerHTML = `
          <div class="usuario-info">
            <p><span>Nome:</span> <strong class="uc-nome-usuario">${usuario.nome}</strong></p>
            <p><span>Usuário:</span> <span class="uc-dado-texto uc-nome-usuario-texto">${usuario.nome_usuario}</span><input type="text" class="uc-input-edit uc-nome-usuario-input" value="${usuario.nome_usuario}" style="display: none;"></p>
            <p><span>Email:</span> <span class="uc-dado-texto uc-email-texto">${usuario.email}</span><input type="email" class="uc-input-edit uc-email-input" value="${usuario.email}" style="display: none;"></p>
            <p><span>Tipos:</span> <span class="uc-dado-texto uc-tipos-texto">${tiposLabels}</span><div class="uc-tipos-container" style="display: none;">${tiposCheckboxesHtml}</div></p>
            <p><span>Nível:</span> ${ehFuncionario ? `<span class="uc-dado-texto uc-nivel-texto">Nível ${usuario.nivel || 'N/A'}</span><select class="uc-select-edit uc-nivel-select" style="display: none;"><option value="" ${!usuario.nivel ? 'selected' : ''}>Sem Nível</option><option value="1" ${usuario.nivel === 1 ? 'selected' : ''}>Nível 1</option><option value="2" ${usuario.nivel === 2 ? 'selected' : ''}>Nível 2</option><option value="3" ${usuario.nivel === 3 ? 'selected' : ''}>Nível 3</option><option value="4" ${usuario.nivel === 4 ? 'selected' : ''}>Nível 4</option></select>` : '<span class="uc-dado-texto">-</span>'}</p>
            
            <div class="uc-financeiro-container" style="display: ${ehFuncionario ? 'block' : 'none'};">
                <p><span>Vínculo Financeiro:</span> <span class="uc-dado-texto uc-vinculo-financeiro-texto">${vinculoTexto}</span><button class="uc-btn uc-btn-vincular" data-action="vincular" style="display: none; background-color: #e67e22; color: white; padding: 4px 8px; font-size: 0.8rem;"><i class="fas fa-link"></i> Vincular</button><input type="hidden" class="uc-id-contato-input" value="${usuario.id_contato_financeiro || ''}"></p>
                <div class="uc-elegivel-container" style="display:none;"><label><input type="checkbox" class="uc-checkbox-edit uc-elegivel-checkbox" ${usuario.elegivel_pagamento ? 'checked' : ''}> Elegível para pagamentos na Central</label></div>

                <div class="uc-concessionarias-container" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px dotted #e2e8f0;">
                    <label class="uc-dado-label">Concessionárias de VT:</label>
                    <div class="uc-checkbox-group">
                        ${concessionariasCheckboxesHtml}
                    </div>
                </div>
            </div>
            
            <div class="uc-pagamento-container" style="display: ${ehFuncionario ? 'block' : 'none'};"><span class="uc-dado-texto uc-pagamento-texto">Salário: <strong>${(usuario.salario_fixo || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong> | Passagem/Dia: <strong>${(usuario.valor_passagem_diaria || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></span>
            <div class="uc-pagamento-inputs" style="display: none;">
            <label>Salário Fixo Mensal</label>
            <input type="number" class="uc-input-edit uc-salario-input" value="${usuario.salario_fixo || '0.00'}" step="0.01">
            <label>Valor Passagem/Dia</label>
            <input type="number" class="uc-input-edit uc-passagem-input" value="${usuario.valor_passagem_diaria || '0.00'}" step="0.01">
            </div></div>
          </div>
          <div class="uc-card-botoes-container">
          ${podeEditar ? `
              <button class="uc-btn uc-btn-editar" data-action="editar"><i class="fas fa-edit"></i> Editar</button>
              <button class="uc-btn uc-btn-salvar" data-action="salvar" style="display: none;"><i class="fas fa-save"></i> Salvar</button>
              <button class="uc-btn uc-btn-cancelar" data-action="cancelar" style="display: none;"><i class="fas fa-times"></i> Cancelar</button>
            ` : ''}
                ${podeExcluir ? `  
              <button class="uc-btn uc-btn-excluir-card" data-action="excluir"><i class="fas fa-trash"></i> Excluir</button>
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

        // Referências aos elementos
        const nomeUsuarioTexto = card.querySelector('.uc-nome-usuario-texto');
        const nomeUsuarioInput = card.querySelector('.uc-nome-usuario-input');
        const emailInput = card.querySelector('.uc-email-input');
        const tiposContainer = card.querySelector('.uc-tipos-container');
        const nivelSelect = card.querySelector('.uc-nivel-select');
        const elegivelCheckbox = card.querySelector('.uc-elegivel-checkbox');
        const idContatoInput = card.querySelector('.uc-id-contato-input');
        const concessionariasContainer = card.querySelector('.uc-concessionarias-container'); // Container das concessionárias
        const btnVincular = card.querySelector('.uc-btn-vincular');

        // --- Lógica para o botão EDITAR ---
        if (btnEditar) {
            btnEditar.addEventListener('click', () => {
                // Esconde os textos e mostra os campos de edição
                card.querySelectorAll('.uc-dado-texto').forEach(el => el.style.display = 'none');
                card.querySelectorAll('.uc-input-edit, .uc-select-edit, .uc-pagamento-inputs, .uc-btn-vincular, .uc-elegivel-container, .uc-concessionarias-container').forEach(el => {
                    if (el) el.style.display = 'block';
                });
                card.querySelectorAll('.uc-tipos-container').forEach(el => el.style.display = 'flex');
                card.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = false);

                // Alterna os botões
                btnEditar.style.display = 'none';
                btnSalvar.style.display = 'inline-flex';
                btnCancelar.style.display = 'inline-flex';
                if (btnExcluir) btnExcluir.style.display = 'none';
            });
        }

        // --- Lógica para o botão VINCULAR ---
        if (btnVincular) {
            btnVincular.addEventListener('click', () => {
                abrirModalVinculacao(usuarioId);
            });
        }

        // --- Lógica para o botão CANCELAR ---
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => {
                carregarUsuariosCadastrados();
            });
        }
        
        // --- Lógica para o botão SALVAR ---
        if (btnSalvar) {
            btnSalvar.addEventListener('click', async () => {
                // Monta o payload completo com todos os dados do formulário de edição
                const payload = { 
                    id: parseInt(usuarioId),
                    nomeUsuario: nomeUsuarioInput.value.trim(),
                    email: emailInput.value.trim(),
                    tipos: Array.from(card.querySelectorAll('.uc-tipos-container input[name="tipoUsuario"]:checked')).map(cb => cb.value),
                    elegivel_pagamento: elegivelCheckbox.checked,
                    id_contato_financeiro: idContatoInput.value ? parseInt(idContatoInput.value) : null,
                    // ADIÇÃO: Coleta os IDs das concessionárias marcadas
                    concessionaria_ids: Array.from(card.querySelectorAll('.uc-concessionaria-checkbox:checked')).map(cb => parseInt(cb.value))
                };
                
                const ehFuncionario = payload.tipos.includes('costureira') || payload.tipos.includes('tiktik');
                if (ehFuncionario) {
                    const salarioInput = card.querySelector('.uc-salario-input');
                    const passagemInput = card.querySelector('.uc-passagem-input');
                    
                    payload.nivel = nivelSelect && nivelSelect.value ? parseInt(nivelSelect.value) : null;
                    payload.salario_fixo = salarioInput ? parseFloat(salarioInput.value) || 0 : 0;
                    payload.valor_passagem_diaria = passagemInput ? parseFloat(passagemInput.value) || 0 : 0;
                }

                loadingSpinnerEl.style.display = 'block';
                try {
                    await fetchAPI('/api/usuarios', { method: 'PUT', body: JSON.stringify(payload) });
                    alert('Usuário atualizado com sucesso!');
                    await carregarUsuariosCadastrados();
                } catch (error) {
                    alert(`Erro ao atualizar usuário: ${error.message}`);
                } finally {
                    loadingSpinnerEl.style.display = 'none';
                }
            });
        }

        // --- Lógica para o botão EXCLUIR ---
        if (btnExcluir) {
            btnExcluir.addEventListener('click', async () => {
                if (confirm(`Tem certeza que deseja excluir o usuário "${nomeUsuarioTexto.textContent}"? Esta ação não pode ser desfeita.`)) {
                    loadingSpinnerEl.style.display = 'block';
                    try {
                        await fetchAPI('/api/usuarios', { method: 'DELETE', body: JSON.stringify({ id: usuarioId }) });
                        alert('Usuário excluído com sucesso!');
                        await carregarUsuariosCadastrados();
                    } catch (error) {
                        alert(`Erro ao excluir usuário: ${error.message}`);
                    } finally {
                        loadingSpinnerEl.style.display = 'none';
                    }
                }
            });
        }
    });
}

async function abrirModalVinculacao(usuarioId) {
    const usuario = todosOsUsuarios.find(u => u.id == usuarioId);
    if (!usuario) {
        alert("Erro: Usuário não encontrado.");
        return;
    }

    // 1. Cria a estrutura do modal e o overlay
    const overlay = document.createElement('div');
    overlay.className = 'uc-modal-overlay';

    // O HTML completo do modal
    const modalHTML = `
        <div class="uc-modal-content">
            <div class="uc-modal-header">
                <h2>Vincular Contato Financeiro</h2>
                <button class="uc-modal-close-btn">×</button>
            </div>
            <div class="uc-modal-body">
                <p>Vinculando o usuário: <strong>${usuario.nome}</strong></p>
                <div class="uc-form-group">
                    <label for="busca-contato-input">Buscar Contato Financeiro (Tipo: Empregado)</label>
                    <input type="text" id="busca-contato-input" class="uc-input-edit" placeholder="Digite para buscar...">
                </div>
                <ul class="uc-lista-contatos">
                    <li class="nenhum-resultado">Digite ao menos 3 caracteres para buscar.</li>
                </ul>
            </div>
        </div>
    `;
    overlay.innerHTML = modalHTML;
    document.body.appendChild(overlay);

    // 2. Adiciona os listeners de evento para o modal
    const inputBusca = overlay.querySelector('#busca-contato-input');
    const listaResultados = overlay.querySelector('.uc-lista-contatos');
    const btnFechar = overlay.querySelector('.uc-modal-close-btn');

    const fecharModal = () => document.body.removeChild(overlay);

    btnFechar.addEventListener('click', fecharModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            fecharModal();
        }
    });

    // 3. Lógica de busca de contatos com LOGS DE DEPURAÇÃO
    inputBusca.addEventListener('input', async (e) => {
        const termoBusca = e.target.value.trim();
        
        // --- LOG 1: O que estamos buscando? ---
        console.log(`[FRONTEND] Termo de busca digitado: "${termoBusca}"`);

        if (termoBusca.length < 3) {
            listaResultados.innerHTML = `<li class="nenhum-resultado">Digite ao menos 3 caracteres...</li>`;
            return;
        }

        try {
            const urlDaApi = `/api/usuarios/buscar-contatos-empregado?q=${encodeURIComponent(termoBusca)}`;
            
            // --- LOG 2: Qual URL estamos chamando? ---
            console.log(`[FRONTEND] Fazendo requisição para a API: ${urlDaApi}`);

            const contatosEmpregados = await fetchAPI(urlDaApi);
            
            // --- LOG 3: O que a API respondeu? ---
            console.log('[FRONTEND] Resposta recebida da API:', contatosEmpregados);

            listaResultados.innerHTML = ''; // Limpa a lista

            if (contatosEmpregados && contatosEmpregados.length > 0) {
                contatosEmpregados.forEach(contato => {
                    const li = document.createElement('li');
                    li.textContent = contato.nome;
                    li.dataset.contatoId = contato.id;
                    li.dataset.contatoNome = contato.nome;
                    listaResultados.appendChild(li);
                });
            } else {
                listaResultados.innerHTML = `<li class="nenhum-resultado">Nenhum contato 'Empregado' encontrado.</li>`;
            }
        } catch (error) {
            // --- LOG 4: Que erro aconteceu? ---
            console.error('[FRONTEND] Ocorreu um erro na função fetchAPI:', error);
            listaResultados.innerHTML = `<li class="nenhum-resultado" style="color: red;">Erro ao buscar contatos. Veja o console.</li>`;
        }
    });

    // 4. Lógica de seleção de um contato
    listaResultados.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.dataset.contatoId) {
            const contatoId = e.target.dataset.contatoId;
            const contatoNome = e.target.dataset.contatoNome;
            
            const cardUsuario = document.querySelector(`.usuario-card[data-usuario-id="${usuarioId}"]`);
            if (cardUsuario) {
                const inputIdContato = cardUsuario.querySelector('.uc-id-contato-input');
                const textoVinculo = cardUsuario.querySelector('.uc-vinculo-financeiro-texto');

                inputIdContato.value = contatoId;
                textoVinculo.innerHTML = `<i class="fas fa-link" style="color: blue;"></i> Vínculo selecionado: <strong>${contatoNome}</strong> (salve para confirmar)`;
                
                // --- LOG 5: O que foi selecionado? ---
                console.log(`[FRONTEND] Vínculo selecionado: Usuário ID ${usuarioId} -> Contato ID ${contatoId} (${contatoNome})`);
            }
            
            fecharModal();
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