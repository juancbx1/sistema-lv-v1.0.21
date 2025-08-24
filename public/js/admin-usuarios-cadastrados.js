// public/js/admin-usuarios-cadastrados.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { fetchAPI } from '/js/utils/api-utils.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';


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

/**
 * Formata uma string de hora 'HH:MM:SS' para 'HH:MM'.
 * @param {string} horaString - A hora no formato que vem do banco.
 * @returns {string} A hora formatada ou uma string vazia.
 */
function formatarHora(horaString) {
    if (!horaString) return '';
    return horaString.substring(0, 5); // Pega apenas os 5 primeiros caracteres (ex: '07:30')
}

function atualizarControlesPaginacao(totalPaginas) {
    pageInfoEl.textContent = totalPaginas > 0 ? `Página ${paginaAtual} de ${totalPaginas}` : 'Nenhuma página';
    prevPageBtnEl.disabled = paginaAtual === 1;
    nextPageBtnEl.disabled = paginaAtual === totalPaginas || totalPaginas === 0;
}

async function abrirModalVinculacao(usuarioId) {
    const usuario = todosOsUsuarios.find(u => u.id == usuarioId);
    if (!usuario) {
        mostrarMensagem("Erro: Usuário não encontrado.");
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
    document.querySelectorAll('.usuario-card-custom').forEach(card => {
        const usuarioId = card.dataset.usuarioId;
        const btnEditar = card.querySelector('[data-action="editar"]');
        const btnSalvar = card.querySelector('[data-action="salvar"]');
        const btnCancelar = card.querySelector('[data-action="cancelar"]');
        const btnExcluir = card.querySelector('[data-action="excluir"]');
        const btnVincular = card.querySelector('[data-action="vincular"]');

        if (btnEditar) {
            btnEditar.addEventListener('click', () => {
                // Esconde tudo que é do modo de visualização
                card.querySelectorAll('.view-mode').forEach(el => el.style.display = 'none');

                // Mostra tudo que é do modo de edição
                card.querySelectorAll('.edit-mode').forEach(el => {
                    // Usa o estilo de display correto para cada tipo de elemento
                    if (el.classList.contains('jornada-grid')) {
                        el.style.display = 'grid';
                    } else if (el.classList.contains('uc-tipos-container')) {
                        el.style.display = 'flex';
                    } else {
                        // Para spans e divs, 'block' ou 'inline-block' é adequado
                        el.style.display = 'block';
                    }
                });
                
                // Habilita os checkboxes que estão dentro do container de tipos
                card.querySelectorAll('.uc-tipos-container input[type="checkbox"]').forEach(cb => cb.disabled = false);

                // Alterna a visibilidade dos botões
                btnEditar.style.display = 'none';
                if (btnExcluir) btnExcluir.style.display = 'none';
                if (btnSalvar) btnSalvar.style.display = 'inline-flex';
                if (btnCancelar) btnCancelar.style.display = 'inline-flex';
            });
        }
        
        if (btnVincular) {
            btnVincular.addEventListener('click', () => abrirModalVinculacao(usuarioId));
        }

        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => {
                carregarUsuariosCadastrados();
            });
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
                    data_admissao: card.querySelector('.uc-admissao-input').value || null,
                    
                    // --- NOSSOS NOVOS CAMPOS AQUI ---
                    data_demissao: card.querySelector('.uc-demissao-input').value || null,
                    horario_entrada_1: card.querySelector('.uc-entrada1-input').value || null,
                    horario_saida_1: card.querySelector('.uc-saida1-input').value || null,
                    horario_entrada_2: card.querySelector('.uc-entrada2-input').value || null,
                    horario_saida_2: card.querySelector('.uc-saida2-input').value || null,
                    horario_entrada_3: card.querySelector('.uc-entrada3-input').value || null,
                    horario_saida_3: card.querySelector('.uc-saida3-input').value || null
                };
                
                const ehEmpregado = payload.tipos.includes('costureira') || payload.tipos.includes('tiktik');
                if (ehEmpregado) {
                    const nivelSelect = card.querySelector('.uc-nivel-select');
                    payload.nivel = nivelSelect && nivelSelect.value ? parseInt(nivelSelect.value) : null;
                    payload.salario_fixo = parseFloat(card.querySelector('.uc-salario-input').value) || 0;
                    payload.valor_passagem_diaria = parseFloat(card.querySelector('.uc-passagem-input').value) || 0;
                }

                loadingSpinnerEl.style.display = 'block';
                try {
                    await fetchAPI('/api/usuarios', { method: 'PUT', body: JSON.stringify(payload) });
                    mostrarMensagem('Usuário atualizado com sucesso!');
                    await carregarUsuariosCadastrados();
                } catch (error) {
                    mostrarMensagem(`Erro ao atualizar usuário: ${error.message}`);
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
                        mostrarMensagem('Usuário excluído com sucesso!');
                        await carregarUsuariosCadastrados();
                    } catch (error) {
                        mostrarMensagem(`Erro ao excluir usuário: ${error.message}`);
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
    card.dataset.usuarioId = usuario.id;

    const tiposAtuais = Array.isArray(usuario.tipos) ? usuario.tipos : [];
    const ehEmpregado = tiposAtuais.includes('costureira') || tiposAtuais.includes('tiktik');
    const tiposLabels = tiposAtuais.map(tipo => TIPOS_USUARIO_DISPONIVEIS.find(t => t.id === tipo)?.label || tipo).join(', ') || 'Nenhum tipo';
    const tiposCheckboxesHtml = TIPOS_USUARIO_DISPONIVEIS.map(tipoDisp => `<label><input type="checkbox" name="tipoUsuario" value="${tipoDisp.id}" ${tiposAtuais.includes(tipoDisp.id) ? 'checked' : ''} disabled> ${tipoDisp.label}</label>`).join('');
    const vinculoTexto = usuario.id_contato_financeiro ? `<i class="fas fa-check-circle" style="color: #27ae60;"></i> Vinculado a: <strong>${usuario.nome_contato_financeiro || 'Contato não encontrado'}</strong>` : `<i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i> Não vinculado`;
    const idsConcessionariasDoUsuario = Array.isArray(usuario.concessionarias_vt) ? usuario.concessionarias_vt : [];
    const concessionariasCheckboxesHtml = concessionariasVTCache.map(conc => `<label><input type="checkbox" class="uc-checkbox-edit uc-concessionaria-checkbox" value="${conc.id}" ${idsConcessionariasDoUsuario.includes(conc.id) ? 'checked' : ''} disabled> ${conc.nome}</label>`).join('');

    const statusEmpregado = usuario.data_demissao ? 'EX-EMPREGADO' : 'EMPREGADO';
    const classeStatusCard = usuario.data_demissao ? 'status-ex-empregado' : '';

    const dataAdmissaoFormatadaInput = formatarDataParaInput(usuario.data_admissao);
    const dataDemissaoFormatadaInput = formatarDataParaInput(usuario.data_demissao);
    const dataAdmissaoFormatadaDisplay = usuario.data_admissao ? new Date(usuario.data_admissao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definida';
    const dataDemissaoFormatadaDisplay = usuario.data_demissao ? new Date(usuario.data_demissao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não definida';

    // A classe do card principal é definida aqui
    card.className = `gs-card usuario-card-custom ${classeStatusCard}`;
    
    card.innerHTML = `
        <div class="card-cabecalho">
            <h3 class="card-titulo-nome">${usuario.nome}</h3>
            <span class="status-selo ${statusEmpregado.toLowerCase()}">${statusEmpregado}</span>
        </div>

        <div class="card-secao">
            <h4 class="card-secao-titulo">Dados de Acesso</h4>
            <p>
            <span>Usuário:</span>
            <span class="view-mode">${usuario.nome_usuario}</span>
            <span class="edit-mode" style="display: none;"><input type="text" class="gs-input uc-nome-usuario-input" value="${usuario.nome_usuario}"></span>
            </p>
            <p>
            <span>Email:</span>
            <span class="view-mode">${usuario.email}</span>
            <span class="edit-mode" style="display: none;"><input type="email" class="gs-input uc-email-input" value="${usuario.email}"></span>
            </p>
        </div>

        <div class="card-secao">
            <h4 class="card-secao-titulo">Vínculo Empregatício</h4>
            <p>
            <span>Admissão:</span>
            <span class="view-mode">${dataAdmissaoFormatadaDisplay}</span>
            <span class="edit-mode" style="display: none;"><input type="date" class="gs-input uc-admissao-input" value="${dataAdmissaoFormatadaInput}"></span>
            </p>
            <p>
            <span>Demissão:</span>
            <span class="view-mode">${dataDemissaoFormatadaDisplay}</span>
            <span class="edit-mode" style="display: none;"><input type="date" class="gs-input uc-demissao-input" value="${dataDemissaoFormatadaInput}"></span>
            </p>
            <div>
            <p><span>Tipos:</span><span class="view-mode">${tiposLabels}</span></p>
            <div class="edit-mode uc-tipos-container" style="display: none;">${tiposCheckboxesHtml}</div>
            </div>
            ${ehEmpregado ? `
            <p>
                <span>Nível:</span>
                <span class="view-mode">Nível ${usuario.nivel || 'N/A'}</span>
                <span class="edit-mode" style="display: none;">
                <select class="gs-input uc-nivel-select">
                    <option value="" ${!usuario.nivel ? 'selected' : ''}>Sem Nível</option>
                    <option value="1" ${usuario.nivel === 1 ? 'selected' : ''}>Nível 1</option>
                    <option value="2" ${usuario.nivel === 2 ? 'selected' : ''}>Nível 2</option>
                    <option value="3" ${usuario.nivel === 3 ? 'selected' : ''}>Nível 3</option>
                    <option value="4" ${usuario.nivel === 4 ? 'selected' : ''}>Nível 4</option>
                </select>
                </span>
            </p>` : ''
            }
        </div>

        <div class="card-secao" style="display: ${ehEmpregado ? 'block' : 'none'};">
            <h4 class="card-secao-titulo">Jornada de Trabalho</h4>
            <div class="view-mode jornada-display">
                <span><strong>Entrada 1:</strong> ${formatarHora(usuario.horario_entrada_1) || '--:--'}</span>
                <span><strong>Saída 1:</strong> ${formatarHora(usuario.horario_saida_1) || '--:--'}</span>
                <span><strong>Entrada 2:</strong> ${formatarHora(usuario.horario_entrada_2) || '--:--'}</span>
                <span><strong>Saída 2:</strong> ${formatarHora(usuario.horario_saida_2) || '--:--'}</span>
                
                ${/* --- LÓGICA DE EXIBIÇÃO CONDICIONAL --- */''}
                ${usuario.horario_entrada_3 ? `
                <span><strong>Entrada 3:</strong> ${formatarHora(usuario.horario_entrada_3)}</span>
                <span><strong>Saída 3:</strong> ${formatarHora(usuario.horario_saida_3)}</span>
                ` : ''}
            </div>
            <div class="edit-mode jornada-grid" style="display: none;">
                <div><label>Entrada 1</label><input type="time" class="gs-input uc-entrada1-input" value="${formatarHora(usuario.horario_entrada_1) || '07:30'}"></div>
                <div><label>Saída 1 (Almoço)</label><input type="time" class="gs-input uc-saida1-input" value="${formatarHora(usuario.horario_saida_1) || '11:30'}"></div>
                <div><label>Entrada 2</label><input type="time" class="gs-input uc-entrada2-input" value="${formatarHora(usuario.horario_entrada_2) || '12:30'}"></div>
                <div><label>Saída 2 (Lanche)</label><input type="time" class="gs-input uc-saida2-input" value="${formatarHora(usuario.horario_saida_2) || '15:30'}"></div>
                <div><label>Entrada 3</label><input type="time" class="gs-input uc-entrada3-input" value="${formatarHora(usuario.horario_entrada_3) || ''}"></div>
                <div><label>Saída 3 (Fim)</label><input type="time" class="gs-input uc-saida3-input" value="${formatarHora(usuario.horario_saida_3) || ''}"></div>
            </div>
        </div>

        <div class="card-secao" style="display: ${ehEmpregado ? 'block' : 'none'};">
            <h4 class="card-secao-titulo">Dados Financeiros</h4>
            <p>
            <span>Salário Fixo:</span>
            <span class="view-mode">${(usuario.salario_fixo || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
            <span class="edit-mode" style="display: none;"><input type="number" class="gs-input uc-salario-input" value="${usuario.salario_fixo || '0.00'}" step="0.01"></span>
            </p>
            <p>
            <span>Passagem/Dia:</span>
            <span class="view-mode">${(usuario.valor_passagem_diaria || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
            <span class="edit-mode" style="display: none;"><input type="number" class="gs-input uc-passagem-input" value="${usuario.valor_passagem_diaria || '0.00'}" step="0.01"></span>
            </p>
            <p>
            <span>Vínculo Financeiro:</span>
            <span class="view-mode">${vinculoTexto}</span>
            <span class="edit-mode" style="display: none;"><button class="gs-btn gs-btn-secundario uc-btn-vincular" data-action="vincular">Vincular Contato</button></span>
            <input type="hidden" class="uc-id-contato-input" value="${usuario.id_contato_financeiro || ''}">
            </p>
            <div class="edit-mode uc-elegivel-container" style="display:none;"><label><input type="checkbox" class="uc-checkbox-edit uc-elegivel-checkbox" ${usuario.elegivel_pagamento ? 'checked' : ''}> Elegível para pagamentos</label></div>
            <div class="edit-mode uc-concessionarias-container" style="display: none;"><label class="uc-dado-label">Concessionárias de VT:</label><div class="uc-checkbox-group">${concessionariasCheckboxesHtml}</div></div>
        </div>

        <div class="uc-card-botoes-container">
            ${permissoesDoUsuarioLogado.includes('editar-usuarios') ? `
            <button class="gs-btn gs-btn-primario" data-action="editar"><i class="fas fa-edit"></i> Editar</button>
            <button class="gs-btn gs-btn-sucesso" data-action="salvar" style="display: none;"><i class="fas fa-save"></i> Salvar</button>
            <button class="gs-btn gs-btn-secundario" data-action="cancelar" style="display: none;"><i class="fas fa-times"></i> Cancelar</button>` : ''}
            ${permissoesDoUsuarioLogado.includes('excluir-usuarios') ? `<button class="gs-btn gs-btn-perigo" data-action="excluir"><i class="fas fa-trash"></i> Excluir</button>` : ''}
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