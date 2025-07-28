// public/js/admin-usuarios-cadastrados.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { fetchAPI } from '/js/utils/api-utils.js';

// --- VARIÁVEIS GLOBAIS ---
let concessionariasVTCache = [];
const TIPOS_USUARIO_DISPONIVEIS = [
    { id: 'administrador', label: 'Administrador' }, { id: 'supervisor', label: 'Supervisor' },
    { id: 'lider_setor', label: 'Líder de Setor' }, { id: 'costureira', label: 'Costureira' },
    { id: 'tiktik', label: 'TikTik' }, { id: 'cortador', label: 'Cortador' }
];
const usuariosPorPagina = 8;
let paginaAtual = 1;
let todosOsUsuarios = [];
let usuariosFiltradosGlobal = [];
let permissoesDoUsuarioLogado = [];

// --- ELEMENTOS DO DOM (serão definidos no DOMContentLoaded) ---
let listaEl, filtroTipoEl, loadingSpinnerEl, prevPageBtnEl, nextPageBtnEl, pageInfoEl;

/**
 * Função para formatar a data vinda do banco (com timestamp) para o formato 'AAAA-MM-DD'.
 * @param {string} dataString - A data no formato ISO (ex: "2024-03-01T03:00:00.000Z").
 * @returns {string} A data formatada como "2024-03-01" ou uma string vazia.
 */
function formatarDataParaInput(dataString) {
    if (!dataString) return '';
    try {
        const data = new Date(dataString);
        // Usar UTC para evitar problemas de fuso horário que podem mudar o dia
        const ano = data.getUTCFullYear();
        const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(data.getUTCDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    } catch (e) {
        console.error("Erro ao formatar data:", dataString, e);
        return '';
    }
}

function atualizarControlesPaginacao(totalPaginas) {
    pageInfoEl.textContent = totalPaginas > 0 ? `Página ${paginaAtual} de ${totalPaginas}` : 'Nenhuma página';
    prevPageBtnEl.disabled = paginaAtual === 1;
    nextPageBtnEl.disabled = paginaAtual === totalPaginas || totalPaginas === 0;
}

async function abrirModalVinculacao(usuarioId) {
    // ... (Esta função, se já estiver funcionando, pode permanecer como está) ...
    // Vou incluir o código dela aqui para garantir que esteja completa
    const usuario = todosOsUsuarios.find(u => u.id == usuarioId);
    if (!usuario) {
        alert("Erro: Usuário não encontrado.");
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'uc-modal-overlay';
    overlay.innerHTML = `
        <div class="uc-modal-content">
            <div class="uc-modal-header">
                <h2>Vincular Contato Financeiro</h2>
                <button class="uc-modal-close-btn">×</button>
            </div>
            <div class="uc-modal-body">
                <p>Vinculando o usuário: <strong>${usuario.nome}</strong></p>
                <div class="uc-form-group">
                    <label for="busca-contato-input">Buscar Contato (Tipo: Empregado)</label>
                    <input type="text" id="busca-contato-input" class="uc-input-edit" placeholder="Digite para buscar...">
                </div>
                <ul class="uc-lista-contatos"><li class="nenhum-resultado">Digite ao menos 3 caracteres.</li></ul>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const inputBusca = overlay.querySelector('#busca-contato-input');
    const listaResultados = overlay.querySelector('.uc-lista-contatos');
    const fecharModal = () => document.body.removeChild(overlay);

    overlay.querySelector('.uc-modal-close-btn').addEventListener('click', fecharModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });

    inputBusca.addEventListener('input', async (e) => {
        const termoBusca = e.target.value.trim();
        if (termoBusca.length < 3) {
            listaResultados.innerHTML = `<li class="nenhum-resultado">Digite ao menos 3 caracteres...</li>`;
            return;
        }
        try {
            const urlDaApi = `/api/usuarios/buscar-contatos-empregado?q=${encodeURIComponent(termoBusca)}`;
            const contatos = await fetchAPI(urlDaApi);
            listaResultados.innerHTML = '';
            if (contatos && contatos.length > 0) {
                contatos.forEach(contato => {
                    const li = document.createElement('li');
                    li.textContent = contato.nome;
                    li.dataset.contatoId = contato.id;
                    li.dataset.contatoNome = contato.nome;
                    listaResultados.appendChild(li);
                });
            } else {
                listaResultados.innerHTML = `<li class="nenhum-resultado">Nenhum contato encontrado.</li>`;
            }
        } catch (error) {
            listaResultados.innerHTML = `<li class="nenhum-resultado" style="color: red;">Erro ao buscar.</li>`;
        }
    });

    listaResultados.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.dataset.contatoId) {
            const { contatoId, contatoNome } = e.target.dataset;
            const cardUsuario = document.querySelector(`.usuario-card[data-usuario-id="${usuarioId}"]`);
            if (cardUsuario) {
                cardUsuario.querySelector('.uc-id-contato-input').value = contatoId;
                cardUsuario.querySelector('.uc-vinculo-financeiro-texto').innerHTML = `<i class="fas fa-link" style="color: blue;"></i> Vínculo: <strong>${contatoNome}</strong> (salve para confirmar)`;
            }
            fecharModal();
        }
    });
}

function adicionarEventosAosCards() {
    document.querySelectorAll('.usuario-card').forEach(card => {
        const usuarioId = card.dataset.usuarioId;
        const btnEditar = card.querySelector('[data-action="editar"]');
        const btnSalvar = card.querySelector('[data-action="salvar"]');
        const btnCancelar = card.querySelector('[data-action="cancelar"]');
        const btnExcluir = card.querySelector('[data-action="excluir"]');
        const btnVincular = card.querySelector('[data-action="vincular"]');

        if (btnEditar) {
            btnEditar.addEventListener('click', () => {
                card.querySelectorAll('.uc-dado-texto').forEach(el => el.style.display = 'none');
                card.querySelectorAll('.uc-input-edit, .uc-select-edit, .uc-pagamento-inputs, .uc-btn-vincular, .uc-elegivel-container, .uc-concessionarias-container').forEach(el => el && (el.style.display = 'block'));
                card.querySelectorAll('.uc-tipos-container').forEach(el => el.style.display = 'flex');
                card.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = false);
                btnEditar.style.display = 'none';
                if(btnSalvar) btnSalvar.style.display = 'inline-flex';
                if(btnCancelar) btnCancelar.style.display = 'inline-flex';
                if (btnExcluir) btnExcluir.style.display = 'none';
            });
        }
        
        if (btnVincular) {
            btnVincular.addEventListener('click', () => abrirModalVinculacao(usuarioId));
        }

        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => carregarUsuariosCadastrados());
        }
        
        if (btnSalvar) {
            btnSalvar.addEventListener('click', async () => {
                const payload = { 
                    id: parseInt(usuarioId),
                    nomeUsuario: card.querySelector('.uc-nome-usuario-input').value.trim(),
                    email: card.querySelector('.uc-email-input').value.trim(),
                    tipos: Array.from(card.querySelectorAll('.uc-tipos-container input[name="tipoUsuario"]:checked')).map(cb => cb.value),
                    elegivel_pagamento: card.querySelector('.uc-elegivel-checkbox').checked,
                    id_contato_financeiro: card.querySelector('.uc-id-contato-input').value ? parseInt(card.querySelector('.uc-id-contato-input').value) : null,
                    concessionaria_ids: Array.from(card.querySelectorAll('.uc-concessionaria-checkbox:checked')).map(cb => parseInt(cb.value)),
                    data_admissao: card.querySelector('.uc-admissao-input').value || null
                };
                
                const ehFuncionario = payload.tipos.includes('costureira') || payload.tipos.includes('tiktik');
                if (ehFuncionario) {
                    const nivelSelect = card.querySelector('.uc-nivel-select');
                    payload.nivel = nivelSelect && nivelSelect.value ? parseInt(nivelSelect.value) : null;
                    payload.salario_fixo = parseFloat(card.querySelector('.uc-salario-input').value) || 0;
                    payload.valor_passagem_diaria = parseFloat(card.querySelector('.uc-passagem-input').value) || 0;
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

        if (btnExcluir) {
            btnExcluir.addEventListener('click', async () => {
                const nomeUsuario = card.querySelector('.uc-nome-usuario').textContent;
                if (confirm(`Tem certeza que deseja excluir o usuário "${nomeUsuario}"?`)) {
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

function renderizarCardsUsuarios(usuariosParaRenderizar) {
    listaEl.innerHTML = '';
    if (usuariosParaRenderizar.length === 0) {
        listaEl.innerHTML = '<p class="uc-sem-resultados">Nenhum usuário encontrado com os filtros aplicados.</p>';
        return;
    }

    usuariosParaRenderizar.forEach((usuario) => {
        const card = document.createElement('div');
        card.className = 'usuario-card';
        card.dataset.usuarioId = usuario.id;

        const tiposAtuais = Array.isArray(usuario.tipos) ? usuario.tipos : [];
        const ehFuncionario = tiposAtuais.includes('costureira') || tiposAtuais.includes('tiktik');
        const tiposLabels = tiposAtuais.map(tipo => TIPOS_USUARIO_DISPONIVEIS.find(t => t.id === tipo)?.label || tipo).join(', ') || 'Nenhum tipo';
        const tiposCheckboxesHtml = TIPOS_USUARIO_DISPONIVEIS.map(tipoDisp => `<label><input type="checkbox" name="tipoUsuario" value="${tipoDisp.id}" ${tiposAtuais.includes(tipoDisp.id) ? 'checked' : ''} disabled> ${tipoDisp.label}</label>`).join('');
        const vinculoTexto = usuario.id_contato_financeiro ? `<i class="fas fa-check-circle" style="color: #27ae60;"></i> Vinculado a: <strong>${usuario.nome_contato_financeiro || 'Contato não encontrado'}</strong>` : `<i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i> Não vinculado`;
        const idsConcessionariasDoUsuario = Array.isArray(usuario.concessionarias_vt) ? usuario.concessionarias_vt : [];
        const concessionariasCheckboxesHtml = concessionariasVTCache.map(conc => `<label><input type="checkbox" class="uc-checkbox-edit uc-concessionaria-checkbox" value="${conc.id}" ${idsConcessionariasDoUsuario.includes(conc.id) ? 'checked' : ''} disabled> ${conc.nome}</label>`).join('');
        
        const dataAdmissaoFormatadaInput = formatarDataParaInput(usuario.data_admissao);
        const dataAdmissaoFormatadaDisplay = usuario.data_admissao ? new Date(usuario.data_admissao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definida';

        card.innerHTML = `
          <div class="usuario-info">
            <p><span>Nome:</span> <strong class="uc-nome-usuario">${usuario.nome}</strong></p>
            <p><span>Usuário:</span> <span class="uc-dado-texto uc-nome-usuario-texto">${usuario.nome_usuario}</span><input type="text" class="uc-input-edit uc-nome-usuario-input" value="${usuario.nome_usuario}" style="display: none;"></p>
            <p><span>Email:</span> <span class="uc-dado-texto uc-email-texto">${usuario.email}</span><input type="email" class="uc-input-edit uc-email-input" value="${usuario.email}" style="display: none;"></p>
            <p><span>Tipos:</span> <span class="uc-dado-texto uc-tipos-texto">${tiposLabels}</span><div class="uc-tipos-container" style="display: none;">${tiposCheckboxesHtml}</div></p>
            <p><span>Nível:</span> ${ehFuncionario ? `<span class="uc-dado-texto uc-nivel-texto">Nível ${usuario.nivel || 'N/A'}</span><select class="uc-select-edit uc-nivel-select" style="display: none;"><option value="" ${!usuario.nivel ? 'selected' : ''}>Sem Nível</option><option value="1" ${usuario.nivel === 1 ? 'selected' : ''}>Nível 1</option><option value="2" ${usuario.nivel === 2 ? 'selected' : ''}>Nível 2</option><option value="3" ${usuario.nivel === 3 ? 'selected' : ''}>Nível 3</option><option value="4" ${usuario.nivel === 4 ? 'selected' : ''}>Nível 4</option></select>` : '<span class="uc-dado-texto">-</span>'}</p>
            <p><span>Admissão:</span> <span class="uc-dado-texto uc-admissao-texto">${dataAdmissaoFormatadaDisplay}</span><input type="date" class="uc-input-edit uc-admissao-input" value="${dataAdmissaoFormatadaInput}" style="display: none;"></p>
            <div class="uc-financeiro-container" style="display: ${ehFuncionario ? 'block' : 'none'};">
                <p><span>Vínculo Financeiro:</span> <span class="uc-dado-texto uc-vinculo-financeiro-texto">${vinculoTexto}</span><button class="uc-btn uc-btn-vincular" data-action="vincular" style="display: none;">Vincular</button><input type="hidden" class="uc-id-contato-input" value="${usuario.id_contato_financeiro || ''}"></p>
                <div class="uc-elegivel-container" style="display:none;"><label><input type="checkbox" class="uc-checkbox-edit uc-elegivel-checkbox" ${usuario.elegivel_pagamento ? 'checked' : ''}> Elegível para pagamentos</label></div>
                <div class="uc-concessionarias-container" style="display: none;"><label class="uc-dado-label">Concessionárias de VT:</label><div class="uc-checkbox-group">${concessionariasCheckboxesHtml}</div></div>
            </div>
            <div class="uc-pagamento-container" style="display: ${ehFuncionario ? 'block' : 'none'};"><span class="uc-dado-texto uc-pagamento-texto">Salário: <strong>${(usuario.salario_fixo || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong> | Passagem/Dia: <strong>${(usuario.valor_passagem_diaria || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</strong></span>
            <div class="uc-pagamento-inputs" style="display: none;"><label>Salário Fixo</label><input type="number" class="uc-input-edit uc-salario-input" value="${usuario.salario_fixo || '0.00'}" step="0.01"><label>Passagem/Dia</label><input type="number" class="uc-input-edit uc-passagem-input" value="${usuario.valor_passagem_diaria || '0.00'}" step="0.01"></div></div>
          </div>
          <div class="uc-card-botoes-container">
            ${permissoesDoUsuarioLogado.includes('editar-usuarios') ? `<button class="uc-btn uc-btn-editar" data-action="editar"><i class="fas fa-edit"></i> Editar</button><button class="uc-btn uc-btn-salvar" data-action="salvar" style="display: none;"><i class="fas fa-save"></i> Salvar</button><button class="uc-btn uc-btn-cancelar" data-action="cancelar" style="display: none;"><i class="fas fa-times"></i> Cancelar</button>` : ''}
            ${permissoesDoUsuarioLogado.includes('excluir-usuarios') ? `<button class="uc-btn uc-btn-excluir-card" data-action="excluir"><i class="fas fa-trash"></i> Excluir</button>` : ''}
          </div>
        `;
        listaEl.appendChild(card);
    });
    adicionarEventosAosCards();
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

    renderizarCardsUsuarios(usuariosDaPagina);
    atualizarControlesPaginacao(totalPaginas);
}

async function carregarUsuariosCadastrados() {
    if (!listaEl) return;
    loadingSpinnerEl.style.display = 'block';
    listaEl.innerHTML = '';

    try {
        const [usuarios, concessionarias] = await Promise.all([
            fetchAPI('/api/usuarios'),
            fetchAPI('/api/financeiro/concessionarias-vt')
        ]);
        
        todosOsUsuarios = usuarios.sort((a, b) => a.nome.localeCompare(b.nome));
        concessionariasVTCache = concessionarias;
        filtrarEPaginarUsuarios();
    } catch (error) {
        listaEl.innerHTML = `<p class="uc-erro-carregamento">Erro ao carregar dados: ${error.message}.</p>`;
    } finally {
        loadingSpinnerEl.style.display = 'none';
    }
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    // Bloco de Autenticação e Redirecionamento (RESTAURADO)
    const auth = await verificarAutenticacao('usuarios-cadastrados.html', ['acesso-usuarios-cadastrados']);
    if (!auth) {
        // A função verificarAutenticacao já redireciona, mas esta é uma segurança extra.
        // Se a verificação falhar, o código para aqui.
        return; 
    }
    permissoesDoUsuarioLogado = auth.permissoes || [];
    
    // Associa as variáveis globais aos elementos do DOM
    listaEl = document.getElementById('usuariosLista');
    filtroTipoEl = document.getElementById('filtroTipoUsuario');
    loadingSpinnerEl = document.getElementById('loadingSpinner');
    prevPageBtnEl = document.getElementById('prevPage');
    nextPageBtnEl = document.getElementById('nextPage');
    pageInfoEl = document.getElementById('pageInfo');

    // Configura os event listeners da página (RESTAURADOS)
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

    // Inicia o carregamento
    await carregarUsuariosCadastrados();
});