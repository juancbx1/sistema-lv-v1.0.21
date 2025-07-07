// public/js/admin-financeiro.js

import { verificarAutenticacao } from '/js/utils/auth.js';

// --- Variáveis Globais ---
let permissoesGlobaisFinanceiro = [];
let usuarioLogadoFinanceiro = null;
let contasCache = [], gruposCache = [], categoriasCache = [];
let lancamentosCache = []; // Novo cache para os lançamentos
let contasAgendadasCache = [];
let itemEmEdicao = null;
let filtrosAtivos = {};
let fecharModalListenerRemover = () => {};

// --- FUNÇÃO UTILITÁRIA GLOBAL ---
const formatCurrency = (value) => {
    if (typeof value !== 'number' && typeof value !== 'string') value = 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// FUNÇÃO UTILITÁRIA
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// --- Funções de Popup e API ---
function mostrarPopupFinanceiro(mensagem, tipo = 'info', duracao = 4000) {
    const popupId = `popup-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `fc-popup-mensagem popup-${tipo}`;
    popup.innerHTML = `<p>${mensagem}</p>`;

    const overlay = document.createElement('div');
    overlay.className = 'fc-popup-overlay';

    const fecharPopup = () => {
        popup.style.animation = 'fc-slideOut 0.3s ease-out forwards';
        overlay.style.animation = 'fc-fadeOut 0.3s ease-out forwards';
        setTimeout(() => {
            if (document.body.contains(popup)) document.body.removeChild(popup);
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        }, 300);
    };
    
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.className = 'fc-btn fc-btn-primario';
    okBtn.onclick = fecharPopup;
    popup.appendChild(okBtn);
    
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    if (duracao > 0) {
        setTimeout(fecharPopup, duracao);
    }
}

function mostrarPopupComInput(mensagem, placeholder = '') {
    return new Promise((resolve) => {
        // Remove qualquer popup existente para evitar sobreposição
        const popupExistente = document.querySelector('.fc-popup-overlay');
        if (popupExistente) popupExistente.parentElement.remove();

        const container = document.createElement('div');
        const popup = document.createElement('div');
        popup.className = 'fc-popup-mensagem popup-aviso';
        
        const overlay = document.createElement('div');
        overlay.className = 'fc-popup-overlay';

        const fecharPopup = (valorResolvido) => {
            popup.style.animation = 'fc-slideOut 0.3s ease-out forwards';
            overlay.style.animation = 'fc-fadeOut 0.3s ease-out forwards';
            setTimeout(() => {
                if (document.body.contains(container)) document.body.removeChild(container);
                resolve(valorResolvido);
            }, 300);
        };
        
        popup.innerHTML = `<p>${mensagem}</p>`;
        
        const formGroup = document.createElement('div');
        formGroup.className = 'fc-form-group';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fc-input';
        input.placeholder = placeholder;
        formGroup.appendChild(input);
        popup.appendChild(formGroup);

        const botoesContainer = document.createElement('div');
        botoesContainer.className = 'botoes-container';

        const btnConfirmar = document.createElement('button');
        btnConfirmar.textContent = 'Confirmar';
        btnConfirmar.className = 'fc-btn fc-btn-primario';
        btnConfirmar.onclick = () => fecharPopup(input.value);

        const btnCancelar = document.createElement('button');
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.className = 'fc-btn fc-btn-secundario';
        btnCancelar.onclick = () => fecharPopup(null); // Resolve com null se cancelar
        
        botoesContainer.appendChild(btnCancelar);
        botoesContainer.appendChild(btnConfirmar);
        popup.appendChild(botoesContainer);

        container.appendChild(overlay);
        container.appendChild(popup);
        document.body.appendChild(container);
        
        // Foco automático no input para melhor UX
        input.focus();
    });
}

function mostrarPopupConfirmacao(mensagem) {
    return new Promise((resolve) => {
        const popup = document.createElement('div');
        popup.className = 'fc-popup-mensagem popup-aviso';
        popup.innerHTML = `<p>${mensagem}</p>`;
        
        const overlay = document.createElement('div');
        overlay.className = 'fc-popup-overlay';

        const fecharPopup = (valorResolvido) => {
            popup.style.animation = 'fc-slideOut 0.3s ease-out forwards';
            overlay.style.animation = 'fc-fadeOut 0.3s ease-out forwards';
            setTimeout(() => {
                if (document.body.contains(popup)) document.body.removeChild(popup);
                if (document.body.contains(overlay)) document.body.removeChild(overlay);
                resolve(valorResolvido);
            }, 300);
        };

        const botoesContainer = document.createElement('div');
        botoesContainer.className = 'botoes-container';

        const btnConfirmar = document.createElement('button');
        btnConfirmar.textContent = 'Sim, continuar';
        btnConfirmar.className = 'fc-btn fc-btn-primario';
        btnConfirmar.onclick = () => fecharPopup(true);

        const btnCancelar = document.createElement('button');
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.className = 'fc-btn fc-btn-secundario';
        btnCancelar.onclick = () => fecharPopup(false);
        
        botoesContainer.appendChild(btnCancelar);
        botoesContainer.appendChild(btnConfirmar);
        popup.appendChild(botoesContainer);

        document.body.appendChild(overlay);
        document.body.appendChild(popup);
    });
}

async function fetchFinanceiroAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarPopupFinanceiro('Erro de autenticação. Faça login novamente.', 'erro');
        window.location.href = '/index.html';
        throw new Error('Token não encontrado');
    }

    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers };
    try {
        const response = await fetch(`/api/financeiro${endpoint}`, { ...options, headers });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro ${response.status}` }));
            throw new Error(errorData.error || `Erro ${response.status}`);
        }
        return response.status === 204 ? null : await response.json();
    } catch (error) {
        console.error(`[fetchFinanceiroAPI] Falha em ${endpoint}:`, error);
        mostrarPopupFinanceiro(error.message, 'erro');
        throw error;
    }
}


// --- Funções de Renderização ---

function renderizarTabelaContas() {
    const container = document.getElementById('config-contas');
    if (!container) return;
    let podeGerenciar = permissoesGlobaisFinanceiro.includes('gerenciar-contas');

    container.innerHTML = `
        <header class="fc-table-header">
            <h3 class="fc-table-title">Contas Bancárias</h3>
            <button id="btnAdicionarConta" class="fc-btn fc-btn-primario ${podeGerenciar ? '' : 'fc-btn-disabled'}"><i class="fas fa-plus"></i> Nova</button>
        </header>
        <div class="fc-tabela-container">
            <table class="fc-tabela-estilizada">
                <thead>
                    <tr>
                        <th>Nome da Conta</th>
                        <th>Banco</th>
                        <th>Agência/Conta</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${contasCache.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Nenhuma conta cadastrada.</td></tr>' : 
                    contasCache.map(conta => `
                        <tr>
                            <td data-label="Nome">${conta.nome_conta}</td>
                            <td data-label="Banco">${conta.banco || '-'}</td>
                            <td data-label="Ag/Conta">${conta.agencia || '-'} / ${conta.numero_conta || '-'}</td>
                            <td data-label="Status" style="color: ${conta.ativo ? 'var(--fc-cor-receita)' : 'var(--fc-cor-texto-secundario)'}; font-weight: bold;">
                                ${conta.ativo ? 'Ativa' : 'Inativa'}
                            </td>
                            <td data-label="Ações" class="td-acoes">
                                <button class="fc-btn fc-btn-outline btn-editar-conta ${podeGerenciar ? '' : 'fc-btn-disabled'}" data-id="${conta.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Adiciona listeners aos botões recém-criados
    if (podeGerenciar) {
        container.querySelector('#btnAdicionarConta')?.addEventListener('click', () => abrirModalConta());
        container.querySelectorAll('.btn-editar-conta').forEach(btn => {
            btn.addEventListener('click', (e) => { 
                const id = e.currentTarget.dataset.id; 
                const conta = contasCache.find(c => c.id == id); 
                abrirModalConta(conta); 
            });
        });
    } else {
        container.querySelectorAll('.fc-btn-disabled').forEach(btn => {
            btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para gerenciar contas bancárias.', 'aviso'));
        });
    }
}

// --- Funções de Modal (Contas Bancárias) ---

function abrirModalConta(conta = null) {
    itemEmEdicao = conta;
    const titulo = conta ? 'Editar Conta Bancária' : 'Adicionar Nova Conta';

    const modalHTML = `
        <div id="modal-financeiro" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close">×</button>
                <h3 class="fc-section-title" style="text-align:center;">${titulo}</h3>
                <form id="formContaBancaria" style="margin-top:20px;">
                    <div class="fc-form-group">
                        <label for="nome_conta">Nome da Conta*</label>
                        <input type="text" id="nome_conta" class="fc-input" required value="${conta?.nome_conta || ''}">
                    </div>
                    <div class="fc-form-group">
                        <label for="banco">Banco</label>
                        <input type="text" id="banco" class="fc-input" value="${conta?.banco || ''}">
                    </div>
                    <div class="fc-form-group">
                        <label for="agencia">Agência</label>
                        <input type="text" id="agencia" class="fc-input" value="${conta?.agencia || ''}">
                    </div>
                    <div class="fc-form-group">
                        <label for="numero_conta">Número da Conta</label>
                        <input type="text" id="numero_conta" class="fc-input" value="${conta?.numero_conta || ''}">
                    </div>
                     <div class="fc-form-group">
                        <label for="saldo_inicial">Saldo Inicial (R$)</label>
                        <input type="number" id="saldo_inicial" class="fc-input" step="0.01" value="${conta?.saldo_inicial || '0.00'}" ${conta ? 'disabled' : ''} title="${conta ? 'O saldo inicial não pode ser alterado após a criação.' : ''}">
                    </div>
                    ${conta ? `
                    <div class="fc-form-group">
                        <label for="conta_ativa">Status</label>
                        <select id="conta_ativa" class="fc-select">
                            <option value="true" ${conta.ativo ? 'selected' : ''}>Ativa</option>
                            <option value="false" ${!conta.ativo ? 'selected' : ''}>Inativa</option>
                        </select>
                    </div>
                    ` : ''}
                    <div class="fc-modal-footer">
                         <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                         <button type="submit" class="fc-btn fc-btn-primario">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // CORREÇÃO: Adicionando os listeners diretamente aqui
    document.getElementById('fecharModal')?.addEventListener('click', fecharModal);
    document.getElementById('btnCancelarModal')?.addEventListener('click', fecharModal);
    document.getElementById('modal-financeiro')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-financeiro') fecharModal();
    });
    // O mais importante: Captura o evento de submit e o previne
    document.getElementById('formContaBancaria')?.addEventListener('submit', (event) => {
        event.preventDefault(); // Impede o recarregamento da página
        salvarConta(); // Chama a função de salvar SEM passar o evento
    });
}

function fecharModal() {
    const modal = document.querySelector('.fc-modal');
    if (modal) {
        // Chama a função para remover o listener antes de remover o modal
        fecharModalListenerRemover();
        fecharModalListenerRemover = () => {}; // Reseta a variável
        modal.remove();
    }
    itemEmEdicao = null;
}

async function salvarConta() { // Sem o parâmetro 'event'
    const payload = {
        nome_conta: document.getElementById('nome_conta').value,
        banco: document.getElementById('banco').value,
        agencia: document.getElementById('agencia').value,
        numero_conta: document.getElementById('numero_conta').value,
    };
    try {
        if (itemEmEdicao) {
            payload.ativo = document.getElementById('conta_ativa').value === 'true';
            const updatedConta = await fetchFinanceiroAPI(`/contas/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            const index = contasCache.findIndex(c => c.id == itemEmEdicao.id);
            if (index > -1) contasCache[index] = updatedConta;
        } else {
            payload.saldo_inicial = parseFloat(document.getElementById('saldo_inicial').value) || 0;
            const newConta = await fetchFinanceiroAPI('/contas', { method: 'POST', body: JSON.stringify(payload) });
            contasCache.push(newConta);
        }
        mostrarPopupFinanceiro('Conta salva com sucesso!', 'sucesso');
        fecharModal();
        renderizarTabelaContas();
    } catch (error) {
        // fetchFinanceiroAPI já lida com o erro
    }
}

// --- Funções de Renderização (Grupos) ---

function renderizarTabelaGrupos() {
    const container = document.getElementById('gruposFinanceirosContainer');
    if (!container) return;
    let podeGerenciar = permissoesGlobaisFinanceiro.includes('gerenciar-categorias');
    
    container.innerHTML = `
        <header class="fc-table-header">
            <h3 class="fc-table-title">Grupos Financeiros</h3>
            <button id="btnAdicionarGrupo" class="fc-btn fc-btn-primario ${podeGerenciar ? '' : 'fc-btn-disabled'}"><i class="fas fa-plus"></i> Novo</button>
        </header>
         <div class="fc-tabela-container">
            <table class="fc-tabela-estilizada">
                <thead>
                    <tr>
                        <th>Nome do Grupo</th>
                        <th>Tipo</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${gruposCache.length === 0 ? '<tr><td colspan="3" style="text-align:center;">Nenhum grupo cadastrado.</td></tr>' :
                    gruposCache.map(grupo => `
                        <tr>
                            <td data-label="Nome">${grupo.nome}</td>
                            <td data-label="Tipo" style="color: ${grupo.tipo === 'RECEITA' ? 'var(--fc-cor-receita)' : 'var(--fc-cor-despesa)'}; font-weight: bold;">
                                ${grupo.tipo}
                            </td>
                            <td data-label="Ações" class="td-acoes">
                                <button class="fc-btn fc-btn-outline btn-editar-grupo ${podeGerenciar ? '' : 'fc-btn-disabled'}" data-id="${grupo.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    // Adiciona listeners
    if (podeGerenciar) {
        document.getElementById('btnAdicionarGrupo')?.addEventListener('click', () => abrirModalGrupo());
        container.querySelectorAll('.btn-editar-grupo').forEach(btn => btn.addEventListener('click', (e) => { 
            const id = e.currentTarget.dataset.id; 
            const grupo = gruposCache.find(g => g.id == id); 
            abrirModalGrupo(grupo); 
        }));
    } else {
        container.querySelectorAll('.fc-btn-disabled').forEach(btn => btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para gerenciar categorias.', 'aviso')));
    }
}

function abrirModalGrupo(grupo = null) {
    itemEmEdicao = grupo;
    const titulo = grupo ? 'Editar Grupo Financeiro' : 'Adicionar Novo Grupo';

    const modalHTML = `
        <div id="modal-financeiro" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close">×</button>
                <h3 class="fc-section-title" style="text-align:center;">${titulo}</h3>
                <form id="formGrupoFinanceiro" style="margin-top:20px;">
                    <div class="fc-form-group">
                        <label for="grupo_nome">Nome do Grupo*</label>
                        <input type="text" id="grupo_nome" class="fc-input" required value="${grupo?.nome || ''}">
                    </div>
                    <div class="fc-form-group">
                        <label for="grupo_tipo">Tipo*</label>
                        <select id="grupo_tipo" class="fc-select" required>
                            <option value="">Selecione...</option>
                            <option value="RECEITA" ${grupo?.tipo === 'RECEITA' ? 'selected' : ''}>Receita</option>
                            <option value="DESPESA" ${grupo?.tipo === 'DESPESA' ? 'selected' : ''}>Despesa</option>
                        </select>
                    </div>
                    <div class="fc-modal-footer">
                         <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                         <button type="submit" class="fc-btn fc-btn-primario">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formGrupoFinanceiro', salvarGrupo);
}

async function salvarGrupo(event) {
    event.preventDefault();
    const payload = {
        nome: document.getElementById('grupo_nome').value,
        tipo: document.getElementById('grupo_tipo').value,
    };

    try {
        if (itemEmEdicao) {
            const updated = await fetchFinanceiroAPI(`/grupos/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            const index = gruposCache.findIndex(g => g.id === itemEmEdicao.id);
            if (index > -1) gruposCache[index] = updated;
        } else {
            const created = await fetchFinanceiroAPI('/grupos', { method: 'POST', body: JSON.stringify(payload) });
            gruposCache.push(created);
        }
        mostrarPopupFinanceiro('Grupo salvo com sucesso!', 'sucesso');
        fecharModal();
        
        // Re-renderiza as duas listas, pois uma mudança no grupo afeta a exibição das categorias
        renderizarTabelaGrupos();
        renderizarTabelaCategoriasAgrupadas(); // <<< CORREÇÃO: Chama a função correta

    } catch (error) {}
}

function renderizarDashboard(saldos, alertas) {
    const saldosContainer = document.getElementById('saldosContainer');
    const alertasContainer = document.getElementById('alertasContainer');

    if (!saldosContainer || !alertasContainer) {
        console.error("Um ou mais containers do dashboard não foram encontrados.");
        return;
    }

    // A função formatCurrency agora é global e não precisa ser declarada aqui.
    
    // 1. Lógica e HTML para o Card de Saldo Consolidado
    const saldoTotal = saldos.reduce((acc, conta) => acc + parseFloat(conta.saldo_atual), 0);
    saldosContainer.innerHTML = `
        <div class="fc-saldo-consolidado-card">
            <p class="total-label">Saldo Total Consolidado</p>
            <h2 class="total-valor">${formatCurrency(saldoTotal)}</h2>
            <ul class="fc-saldo-lista">
                ${saldos.length > 0 ? saldos.map(conta => `
                    <li class="fc-saldo-lista-item">
                        <span class="nome-conta">${conta.nome_conta}</span>
                        <span class="valor-saldo">${formatCurrency(conta.saldo_atual)}</span>
                    </li>
                `).join('') : '<li class="fc-saldo-lista-item">Nenhuma conta bancária ativa.</li>'}
            </ul>
        </div>
    `;

    // 2. Lógica e HTML para os Cards de Alerta (Hoje, 3 dias, 5 dias)
    alertasContainer.innerHTML = `
        <div class="fc-dashboard-grid fc-alertas-grid">
            <a href="#" data-filtro-vencimento="hoje" class="fc-alerta-card pagar-hoje">
                <div class="titulo"><i class="fas fa-exclamation-circle"></i> A Pagar Hoje</div>
                <div class="dados-principais">
                    <div class="contador">${alertas.a_pagar_hoje_count}</div>
                    <div class="label-contador">conta(s)</div>
                </div>
                <div class="total-valor">Total: ${formatCurrency(alertas.a_pagar_hoje_total)}</div>
            </a>
            <a href="#" data-filtro-vencimento="3d" class="fc-alerta-card pagar-3d">
                <div class="titulo"><i class="fas fa-calendar-alt"></i> A Pagar (Próx. 3 dias)</div>
                <div class="dados-principais">
                    <div class="contador">${alertas.a_pagar_3d_count}</div>
                    <div class="label-contador">conta(s)</div>
                </div>
                <div class="total-valor">Total: ${formatCurrency(alertas.a_pagar_3d_total)}</div>
            </a>
            <a href="#" data-filtro-vencimento="5d" class="fc-alerta-card pagar-5d">
                <div class="titulo"><i class="fas fa-calendar-check"></i> A Pagar (em 4-5 dias)</div>
                <div class="dados-principais">
                    <div class="contador">${alertas.a_pagar_5d_count}</div>
                    <div class="label-contador">conta(s)</div>
                </div>
                <div class="total-valor">Total: ${formatCurrency(alertas.a_pagar_5d_total)}</div>
            </a>
        </div>
    `;
}

function prepararAbaLancamentos() {
    // Esta função agora só prepara os dados e dispara a primeira busca.
    // Os listeners serão configurados apenas uma vez na inicialização.

    const selectContaFiltro = document.getElementById('filtroConta');
    if (selectContaFiltro && selectContaFiltro.options.length <= 1) {
        selectContaFiltro.innerHTML = '<option value="">Todas as Contas</option>' + 
            contasCache.map(c => `<option value="${c.id}">${c.nome_conta}</option>`).join('');
    }
    
    document.getElementById('filtrosLancamentos')?.reset();
    document.getElementById('filtroBuscaRapida').value = '';
    
    // Define a data de hoje como filtro inicial
    const hojeDate = new Date();
    const fusoHorarioOffset = hojeDate.getTimezoneOffset() * 60000;
    const hojeLocal = new Date(hojeDate.getTime() - fusoHorarioOffset);
    const hojeString = hojeLocal.toISOString().split('T')[0];
    
    document.getElementById('filtroDataInicio').value = hojeString;
    document.getElementById('filtroDataFim').value = hojeString;

    const filtrosIniciais = {
        dataInicio: hojeString,
        dataFim: hojeString,
    };

    carregarLancamentosFiltrados(1, filtrosIniciais);
}

async function carregarLancamentosFiltrados(page = 1, filtros = filtrosAtivos) {
    const tabelaContainer = document.getElementById('cardsLancamentosContainer');
    if (!tabelaContainer) return;
    tabelaContainer.innerHTML = `<div class="fc-spinner">Buscando lançamentos...</div>`;

    // Usa os filtros recebidos como parâmetro
    const params = new URLSearchParams({ page, ...filtros });
    
    try {
        const data = await fetchFinanceiroAPI(`/lancamentos?${params.toString()}`);
        
        lancamentosCache = data.lancamentos;
        filtrosAtivos.total = data.total; // Atualiza o total para a paginação
        
        renderizarCardsLancamentos(); 
        renderizarPaginacaoLancamentos(data.pages, data.page);

    } catch(e) {
        tabelaContainer.innerHTML = `<p style="color:red; text-align:center; padding: 20px;">Erro ao buscar lançamentos.</p>`;
    }
}

function renderizarCardsLancamentos() {
    const container = document.getElementById('cardsLancamentosContainer');
    if (!container) {
        console.error('ERRO CRÍTICO: Container #cardsLancamentosContainer não foi encontrado no HTML.');
        return;
    }

    if (lancamentosCache.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhum lançamento encontrado para os filtros selecionados.</p>';
        return;
    }
    
    container.innerHTML = lancamentosCache.map(l => {
        const tipoClasse = l.tipo.toLowerCase();
        const isPendenteEdicao = l.status_edicao === 'PENDENTE_APROVACAO';
        const isPendenteExclusao = l.status_edicao === 'PENDENTE_EXCLUSAO';
        const isEditadoAprovado = l.status_edicao === 'EDITADO_APROVADO';
        const isEdicaoRejeitada = l.status_edicao === 'EDICAO_REJEITADA';
        
        const isPendente = isPendenteEdicao || isPendenteExclusao;
        const classePendente = isPendente ? 'pendente' : '';
        const sinal = l.tipo === 'RECEITA' ? '+' : '-';
        
        let statusHTML = '';
        if (isPendenteEdicao) {
            statusHTML = `<div class="status-pendente"><i class="fas fa-hourglass-half"></i> <span>Aguardando aprovação para edição</span></div>`;
        } else if (isPendenteExclusao) {
            statusHTML = `<div class="status-pendente"><i class="fas fa-trash-alt"></i> <span>Aguardando aprovação para exclusão</span></div>`;
        } else if (isEditadoAprovado) {
            statusHTML = `<div class="status-pendente" style="color: #2980b9;"><i class="fas fa-check-circle"></i> <span>Edição Aprovada</span></div>`;
        } else if (isEdicaoRejeitada) {
            statusHTML = `<div class="status-pendente" style="color: #ff8a0c;"><i class="fas fa-times-circle"></i> <span>Edição Rejeitada</span></div>`;
        } else {
            // Placeholder para manter o alinhamento vertical dos cards
            statusHTML = `<div class="status-placeholder"></div>`;
        }

        return `
        <div class="fc-lancamento-card ${tipoClasse} ${classePendente}">
            <div class="header">
                <div class="descricao-wrapper">
                    <span class="lancamento-id">#${l.id}</span>
                    <span class="descricao">${l.descricao || 'Lançamento sem descrição'}</span>
                </div>
                <span class="valor">${sinal} ${formatCurrency(l.valor)}</span>
            </div>
            <div class="details">
                <span class="detail-item"><i class="fas fa-calendar-day"></i> ${new Date(l.data_transacao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                <span class="detail-item"><i class="fas fa-tag"></i> ${l.nome_categoria}</span>
                <span class="detail-item"><i class="fas fa-university"></i> ${l.nome_conta}</span>
                <span class="detail-item"><i class="fas fa-user-friends"></i> ${l.nome_favorecido || '-'}</span>
            </div>
            ${statusHTML}
            <div class="actions">
                <button class="fc-btn-icon btn-editar-lancamento" data-id="${l.id}" title="Editar Lançamento" ${isPendente ? 'disabled' : ''}><i class="fas fa-pencil-alt"></i></button>
                <button class="fc-btn-icon btn-excluir-lancamento" data-id="${l.id}" title="Excluir Lançamento" style="color: var(--fc-cor-despesa);" ${isPendente ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </div>
        </div>
        `;
    }).join('');

    // Adiciona os listeners aos botões
    const podeEditar = permissoesGlobaisFinanceiro.includes('editar-transacao');
    container.querySelectorAll('.btn-editar-lancamento').forEach(btn => {
        if (!btn.disabled) {
            if (podeEditar) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = e.currentTarget.dataset.id;
                    const lancamento = lancamentosCache.find(l => l.id == id);
                    if (lancamento) abrirModalLancamento(lancamento);
                });
            } else {
                btn.classList.add('fc-btn-disabled');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    mostrarPopupFinanceiro('Você não tem permissão para editar lançamentos.', 'aviso');
                });
            }
        }
    });

    container.querySelectorAll('.btn-excluir-lancamento').forEach(btn => {
        if (!btn.disabled) {
            if (podeEditar) { // Usando a mesma permissão
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = e.currentTarget.dataset.id;
                    solicitarExclusaoLancamento(id);
                });
            } else {
                btn.classList.add('fc-btn-disabled');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    mostrarPopupFinanceiro('Você não tem permissão para excluir lançamentos.', 'aviso');
                });
            }
        }
    });
}

function renderizarPaginacaoLancamentos(totalPages, currentPage) {
    const container = document.getElementById('paginacaoLancamentosContainer');
    container.innerHTML = '';
    if (totalPages <= 1) return;
    
    container.innerHTML = `
        <button class="fc-btn fc-btn-outline" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>
        <span class="pagination-current">Pág. ${currentPage} de ${totalPages}</span>
        <button class="fc-btn fc-btn-outline" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Próximo</button>
    `;

    container.querySelectorAll('.fc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = e.currentTarget.dataset.page;
            carregarLancamentosFiltrados(parseInt(page));
        });
    });
}

function abrirModalLancamento(lancamento = null) {
    itemEmEdicao = lancamento;
    const titulo = lancamento ? "Editar Lançamento" : "Novo Lançamento";

    // Lógica de data à prova de fuso horário
    const hojeDate = new Date();
    const fusoHorarioOffset = hojeDate.getTimezoneOffset() * 60000;
    const hojeLocal = new Date(hojeDate.getTime() - fusoHorarioOffset);
    const hoje = hojeLocal.toISOString().split('T')[0];

    let tipoEdicao = '';
    if (lancamento) {
        const categoriaDoLancamento = categoriasCache.find(c => c.id === lancamento.id_categoria);
        if (categoriaDoLancamento) {
            const grupoPai = gruposCache.find(g => g.id === categoriaDoLancamento.id_grupo);
            if (grupoPai) {
                tipoEdicao = grupoPai.tipo;
            }
        }
    }

    const modalHTML = `
        <div id="modal-lancamento" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close"><i class="fas fa-times"></i></button>
                <h3 class="fc-section-title" style="text-align:center; border:0; margin-bottom: 25px;">${titulo}</h3>
                <form id="formLancamento">
                    
                    <div class="fc-form-row">
                        <div class="fc-form-group">
                            <label for="lanc_valor">Valor (R$)*</label>
                            <input type="number" id="lanc_valor" class="fc-input fc-input-valor" step="0.01" min="0.01" required placeholder="100,00">
                        </div>
                        <div class="fc-form-group">
                            <label for="lanc_data">Data da Transação*</label>
                            <input type="date" id="lanc_data" class="fc-input fc-input-data" required>
                        </div>
                    </div>

                    <div class="fc-form-row">
                        <div class="fc-form-group">
                            <label for="lanc_tipo">Tipo*</label>
                            <select id="lanc_tipo" class="fc-select" required ${lancamento ? 'disabled' : ''} title="${lancamento ? 'O tipo de um lançamento não pode ser alterado.' : ''}">
                                <option value="">Selecione...</option>
                                <option value="RECEITA">Receita</option>
                                <option value="DESPESA">Despesa</option>
                            </select>
                        </div>
                        <div class="fc-form-group">
                            <label for="lanc_categoria">Categoria*</label>
                            <select id="lanc_categoria" class="fc-select" required>
                                <option value="">Selecione o tipo</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="fc-form-group">
                        <label for="lanc_conta">Conta Bancária*</label>
                        <select id="lanc_conta" class="fc-select" required>
                             <option value="">Selecione...</option>
                            ${contasCache.map(c => `<option value="${c.id}">${c.nome_conta}</option>`).join('')}
                        </select>
                    </div>

                    <div class="fc-form-group">
                        <label for="lanc_contato_busca" id="label-contato">Favorecido</label>
                        <div class="fc-autocomplete-container">
                            <input type="text" id="lanc_contato_busca" class="fc-input" placeholder="Digite para buscar..." autocomplete="off">
                            <div id="lanc_contato_resultados" class="fc-autocomplete-results" style="display: none;"></div>
                        </div>
                        <input type="hidden" id="lanc_contato_id">
                    </div>
                    
                    <div class="fc-form-group">
                        <label for="lanc_descricao">Descrição / Histórico</label>
                        <textarea id="lanc_descricao" class="fc-input" rows="2"></textarea>
                    </div>

                    <div class="fc-modal-footer">
                         <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                         <button type="submit" class="fc-btn fc-btn-primario">${lancamento ? 'Salvar Alterações' : 'Salvar Lançamento'}</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formLancamento', salvarLancamento);
    
    const tipoSelect = document.getElementById('lanc_tipo');
    const categoriaSelect = document.getElementById('lanc_categoria');
    const labelContato = document.getElementById('label-contato');

    const atualizarCamposPorTipo = (tipo) => {
        if (!tipo) {
            categoriaSelect.innerHTML = '<option value="">Selecione o tipo</option>';
            labelContato.textContent = 'Favorecido / Pagador';
            return;
        }
        labelContato.textContent = tipo === 'RECEITA' ? 'Pagador' : 'Favorecido';
        
        const categoriasFiltradas = categoriasCache.filter(cat => {
            const grupoPai = gruposCache.find(g => g.id === cat.id_grupo);
            return grupoPai?.tipo === tipo;
        });

        categoriaSelect.innerHTML = '<option value="">Selecione...</option>' + categoriasFiltradas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    };
    
    tipoSelect.addEventListener('change', (e) => atualizarCamposPorTipo(e.target.value));
    
    // Preenche os valores se estiver editando
    if (lancamento) {
        document.getElementById('lanc_valor').value = lancamento.valor;
        document.getElementById('lanc_data').value = lancamento.data_transacao.split('T')[0];
        tipoSelect.value = tipoEdicao;
        document.getElementById('lanc_conta').value = lancamento.id_conta_bancaria;
        document.getElementById('lanc_contato_busca').value = lancamento.nome_favorecido || '';
        document.getElementById('lanc_contato_id').value = lancamento.id_contato || '';
        document.getElementById('lanc_descricao').value = lancamento.descricao || '';
    } else {
        // Define a data de hoje para novos lançamentos
        document.getElementById('lanc_data').value = hoje;
    }
    
    // Chama a função para popular as categorias com base no tipo pré-selecionado
    atualizarCamposPorTipo(tipoSelect.value);

    // Se estiver editando, agora que as opções existem, seleciona a categoria correta
    if (lancamento) {
        categoriaSelect.value = lancamento.id_categoria;
    }

    setupAutocomplete(
        document.getElementById('lanc_contato_busca'),
        document.getElementById('lanc_contato_resultados'),
        document.getElementById('lanc_contato_id')
    );
}


async function salvarLancamento(event) {
    event.preventDefault();

    if (!itemEmEdicao) {
        const dataTransacaoInput = document.getElementById('lanc_data').value;
        const hoje = new Date();
        const dataTransacaoDate = new Date(dataTransacaoInput + 'T00:00:00');
        hoje.setHours(0, 0, 0, 0);
        if (dataTransacaoDate.getTime() !== hoje.getTime()) {
            const dataFormatada = dataTransacaoDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const confirmado = await mostrarPopupConfirmacao(`Atenção: a data da transação (${dataFormatada}) é diferente da data de hoje. Deseja continuar?`);
            if (!confirmado) return;
        }
    }

    const payload = {
        valor: parseFloat(document.getElementById('lanc_valor').value),
        data_transacao: document.getElementById('lanc_data').value,
        id_categoria: parseInt(document.getElementById('lanc_categoria').value),
        id_conta_bancaria: parseInt(document.getElementById('lanc_conta').value),
        descricao: document.getElementById('lanc_descricao').value,
        id_contato: parseInt(document.getElementById('lanc_contato_id').value) || null,
    };

    if (!payload.valor || !payload.id_categoria || !payload.id_conta_bancaria) {
        mostrarPopupFinanceiro('Por favor, preencha todos os campos obrigatórios (*).', 'aviso');
        return;
    }

    try {
        let responseMessage = '';
        if (itemEmEdicao) {
            const response = await fetchFinanceiroAPI(`/lancamentos/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            responseMessage = response.message || 'Alterações salvas com sucesso!';
            // SE UMA SOLICITAÇÃO FOI CRIADA, ATUALIZE O BADGE!
            if (response.message.includes('aguardando aprovação')) {
                atualizarBadgesHeader();
            }
        } else {
            payload.tipo = document.getElementById('lanc_tipo').value;
            if (!payload.tipo) {
                mostrarPopupFinanceiro('O campo "Tipo" é obrigatório.', 'aviso');
                return;
            }
            await fetchFinanceiroAPI('/lancamentos', { method: 'POST', body: JSON.stringify(payload) });
            responseMessage = 'Lançamento salvo com sucesso!';
        }
        
        mostrarPopupFinanceiro(responseMessage, 'sucesso');
        fecharModal();
        
        // CORREÇÃO: Atualiza os dados e renderiza a aba de lançamentos novamente
        // Mantendo o usuário na mesma tela.
        await carregarLancamentosFiltrados(filtrosAtivos.page || 1, filtrosAtivos);
        carregarLogsAuditoria(); // Atualiza a aba de histórico
        atualizarBadgesHeader(); // Garante que todos os badges estão corretos
        
        // Também atualiza os dados do dashboard em segundo plano
        fetchFinanceiroAPI('/dashboard').then(dashboardData => {
        renderizarDashboard(dashboardData.saldos, dashboardData.alertas);
        });

    } catch (error) {
        // fetchFinanceiroAPI já mostra o erro
    }
}

async function solicitarExclusaoLancamento(id) {
    const lancamento = lancamentosCache.find(l => l.id == id);
    if (!lancamento) return;

    const confirmado = await mostrarPopupConfirmacao(`Tem certeza que deseja solicitar a exclusão do lançamento "${lancamento.descricao || 'sem descrição'}" no valor de ${formatCurrency(lancamento.valor)}?`);
    if (!confirmado) return;

    try {
        const response = await fetchFinanceiroAPI(`/lancamentos/${id}/solicitar-exclusao`, {
            method: 'POST'
        });
        mostrarPopupFinanceiro(response.message, 'sucesso');
        // ATUALIZE O BADGE APÓS A SOLICITAÇÃO
        atualizarBadgesHeader();
        // Recarrega os dados para atualizar o status do card
        carregarLancamentosFiltrados(filtrosAtivos.page || 1);
    } catch (error) {
        // fetchFinanceiroAPI já mostra o erro
    }
}

// --- Funções de Renderização (Categorias) ---

function renderizarTabelaCategorias() {
    const container = document.getElementById('categoriasContainer');
    if (!container) return;
    let podeGerenciar = permissoesGlobaisFinanceiro.includes('gerenciar-categorias');

    container.innerHTML = `
        <header class="fc-table-header">
            <h3 class="fc-table-title">Categorias</h3>
            <button id="btnAdicionarCategoria" class="fc-btn fc-btn-primario ${podeGerenciar ? '' : 'fc-btn-disabled'}"><i class="fas fa-plus"></i> Nova</button>
        </header>
         <div class="fc-tabela-container">
            <table class="fc-tabela-estilizada">
                <thead>
                    <tr>
                        <th>Nome da Categoria</th>
                        <th>Grupo Pertencente</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                     ${categoriasCache.length === 0 ? '<tr><td colspan="3" style="text-align:center;">Nenhuma categoria cadastrada.</td></tr>' :
                     categoriasCache.map(cat => {
                        const grupoPai = gruposCache.find(g => g.id === cat.id_grupo);
                        return `
                        <tr>
                            <td data-label="Nome">${cat.nome}</td>
                            <td data-label="Grupo">${grupoPai?.nome || 'Grupo não encontrado'}</td>
                            <td data-label="Ações" class="td-acoes">
                                <button class="fc-btn fc-btn-outline btn-editar-categoria ${podeGerenciar ? '' : 'fc-btn-disabled'}" data-id="${cat.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    // Adiciona listeners
    if (podeGerenciar) {
        document.getElementById('btnAdicionarCategoria')?.addEventListener('click', () => abrirModalCategoria());
        container.querySelectorAll('.btn-editar-categoria').forEach(btn => btn.addEventListener('click', (e) => { 
            const id = e.currentTarget.dataset.id; 
            const categoria = categoriasCache.find(c => c.id == id); 
            abrirModalCategoria(categoria); 
        }));
    } else {
         container.querySelectorAll('.fc-btn-disabled').forEach(btn => btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para gerenciar categorias.', 'aviso')));
    }
}

function renderizarContatosGerenciamento() {
    const container = document.getElementById('config-favorecidos');
    if (!container) return;
    
    let podeGerenciar = permissoesGlobaisFinanceiro.includes('gerenciar-categorias');

    container.innerHTML = `
        <header class="fc-table-header">
            <h3 class="fc-table-title">Favorecidos</h3>
            <button id="btnAdicionarContato" class="fc-btn fc-btn-primario ${podeGerenciar ? '' : 'fc-btn-disabled'}"><i class="fas fa-plus"></i> Novo</button>
        </header>
        <div class="fc-tabela-container">
            <table class="fc-tabela-estilizada">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Tipo</th>
                        <th>CPF/CNPJ</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${contatosGerenciamentoCache.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Nenhum favorecido cadastrado.</td></tr>' :
                    contatosGerenciamentoCache.sort((a,b) => a.nome.localeCompare(b.nome)).map(contato => {
                        const isAtivo = contato.ativo;
                        const statusCor = isAtivo ? 'var(--fc-cor-receita)' : 'var(--fc-cor-texto-secundario)';
                        const btnStatusCor = isAtivo ? 'var(--fc-cor-despesa)' : 'var(--fc-cor-receita)';
                        const btnStatusIcon = isAtivo ? 'fa-toggle-on' : 'fa-toggle-off';
                        const btnStatusTitle = isAtivo ? 'Inativar' : 'Reativar';
                        return `
                        <tr style="opacity: ${isAtivo ? '1' : '0.6'};">
                            <td data-label="Nome">${contato.nome}</td>
                            <td data-label="Tipo">${contato.tipo}</td>
                            <td data-label="CPF/CNPJ">${contato.cpf_cnpj || '-'}</td>
                            <td data-label="Status" style="color: ${statusCor}; font-weight: bold;">${isAtivo ? 'Ativo' : 'Inativo'}</td>
                            <td data-label="Ações" class="td-acoes">
                                <button class="fc-btn fc-btn-outline btn-editar-contato ${podeGerenciar ? '' : 'fc-btn-disabled'}" data-id="${contato.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                                <button class="fc-btn fc-btn-outline btn-status-contato ${podeGerenciar ? '' : 'fc-btn-disabled'}" data-id="${contato.id}" data-status="${isAtivo}" title="${btnStatusTitle}" style="color:${btnStatusCor}; border-color:${btnStatusCor};">
                                    <i class="fas ${btnStatusIcon}"></i>
                                </button>
                            </td>
                        </tr>`
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    // Adiciona listeners aos botões recém-criados
    if (podeGerenciar) {
        container.querySelector('#btnAdicionarContato')?.addEventListener('click', () => abrirModalContatoGerenciamento());
        container.querySelectorAll('.btn-editar-contato').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const contato = contatosGerenciamentoCache.find(c => c.id == id);
                abrirModalContatoGerenciamento(contato);
            });
        });
        container.querySelectorAll('.btn-status-contato').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const status = e.currentTarget.dataset.status === 'true';
                alterarStatusContato(id, status);
            });
        });
    } else {
        container.querySelectorAll('.fc-btn-disabled').forEach(btn => {
            btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para gerenciar favorecidos.', 'aviso'));
        });
    }
}

function abrirModalCategoria(categoria = null) {
    itemEmEdicao = categoria;
    const titulo = categoria ? 'Editar Categoria' : 'Adicionar Nova Categoria';
    
    if (gruposCache.length === 0) {
        mostrarPopupFinanceiro('É necessário cadastrar um Grupo Financeiro antes de criar uma categoria.', 'aviso');
        return;
    }

    const modalHTML = `
        <div id="modal-financeiro" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close">×</button>
                <h3 class="fc-section-title" style="text-align:center;">${titulo}</h3>
                <form id="formCategoria" style="margin-top:20px;">
                    <div class="fc-form-group">
                        <label for="categoria_nome">Nome da Categoria*</label>
                        <input type="text" id="categoria_nome" class="fc-input" required value="${categoria?.nome || ''}">
                    </div>
                    <div class="fc-form-group">
                        <label for="categoria_id_grupo">Grupo Financeiro*</label>
                        <select id="categoria_id_grupo" class="fc-select" required>
                            <option value="">Selecione...</option>
                            ${gruposCache.map(g => `<option value="${g.id}" ${categoria?.id_grupo === g.id ? 'selected' : ''}>${g.nome} (${g.tipo})</option>`).join('')}
                        </select>
                    </div>
                    <div class="fc-modal-footer">
                         <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                         <button type="submit" class="fc-btn fc-btn-primario">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formCategoria', salvarCategoria);
}

async function salvarCategoria(event) {
    event.preventDefault();
    const payload = {
        nome: document.getElementById('categoria_nome').value,
        id_grupo: parseInt(document.getElementById('categoria_id_grupo').value),
    };

    try {
        if (itemEmEdicao) {
            const updated = await fetchFinanceiroAPI(`/categorias/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            const index = categoriasCache.findIndex(c => c.id === itemEmEdicao.id);
            if (index > -1) categoriasCache[index] = updated;
        } else {
            const created = await fetchFinanceiroAPI('/categorias', { method: 'POST', body: JSON.stringify(payload) });
            categoriasCache.push(created);
        }
        mostrarPopupFinanceiro('Categoria salva com sucesso!', 'sucesso');
        fecharModal();
        
        // Re-renderiza a lista agrupada
        renderizarTabelaCategoriasAgrupadas(); // <<< CORREÇÃO: Chama a função correta

    } catch (error) {}
}

// --- Cache para contatos ---
let contatosGerenciamentoCache = [];

// --- Funções de Renderização (Gerenciamento de Contatos) ---
function renderizarTabelaContatosGerenciamento() {
    const container = document.getElementById('contatosGerenciamentoContainer');
    if (!container) return;
    let podeGerenciar = permissoesGlobaisFinanceiro.includes('gerenciar-categorias');
    const btnAdicionar = `<button id="btnAdicionarContato" class="fc-btn fc-btn-primario ${podeGerenciar ? '' : 'fc-btn-disabled'}"><i class="fas fa-plus"></i> Novo Favorecido</button>`;
    
    const tabelaHTML = `
        <div class="fc-tabela-container">
            <table class="es-tabela-estilizada">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Tipo</th>
                        <th>CPF/CNPJ</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${contatosGerenciamentoCache.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Nenhum favorecido cadastrado.</td></tr>' :
                    contatosGerenciamentoCache.sort((a,b) => a.nome.localeCompare(b.nome)).map(contato => {
                        const isAtivo = contato.ativo;
                        const statusCor = isAtivo ? 'var(--fc-cor-receita)' : 'var(--fc-cor-texto-secundario)';
                        const btnStatusCor = isAtivo ? 'var(--fc-cor-despesa)' : 'var(--fc-cor-receita)';
                        const btnStatusIcon = isAtivo ? 'fa-toggle-on' : 'fa-toggle-off';
                        const btnStatusTitle = isAtivo ? 'Inativar' : 'Reativar';

                        return `
                        <tr style="opacity: ${isAtivo ? '1' : '0.6'};">
                            <td data-label="Nome">${contato.nome}</td>
                            <td data-label="Tipo">${contato.tipo}</td>
                            <td data-label="CPF/CNPJ">${contato.cpf_cnpj || '-'}</td>
                            <td data-label="Status" style="color: ${statusCor}; font-weight: bold;">${isAtivo ? 'Ativo' : 'Inativo'}</td>
                            <td data-label="Ações" class="td-acoes">
                                <button class="fc-btn fc-btn-outline btn-editar-contato ${podeGerenciar ? '' : 'fc-btn-disabled'}" data-id="${contato.id}" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                                <button class="fc-btn fc-btn-outline btn-status-contato ${podeGerenciar ? '' : 'fc-btn-disabled'}" data-id="${contato.id}" data-status="${isAtivo}" title="${btnStatusTitle}" style="color:${btnStatusCor}; border-color:${btnStatusCor};">
                                    <i class="fas ${btnStatusIcon}"></i>
                                </button>
                            </td>
                        </tr>`
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = `<header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h2 class="fc-section-title" style="margin:0;">Gerenciar Favorecidos</h2>
                            ${btnAdicionar}
                           </header>
                           ${tabelaHTML}`;

    if (podeGerenciar) {
        document.getElementById('btnAdicionarContato')?.addEventListener('click', () => abrirModalContatoGerenciamento());
        container.querySelectorAll('.btn-editar-contato').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const contato = contatosGerenciamentoCache.find(c => c.id == id);
                abrirModalContatoGerenciamento(contato);
            });
        });
        // Listener para o novo botão de status
        container.querySelectorAll('.btn-status-contato').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const status = e.currentTarget.dataset.status === 'true'; // Converte string para boolean
                alterarStatusContato(id, status);
            });
        });
    } else {
        container.querySelectorAll('.fc-btn-disabled').forEach(btn => {
            btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para gerenciar favorecidos.', 'aviso'));
        });
    }
}

function abrirModalContatoGerenciamento(contato = null) {
    itemEmEdicao = contato;
    const titulo = contato ? 'Editar Contato' : 'Adicionar Novo Contato';

    const modalHTML = `
        <div id="modal-financeiro" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close">×</button>
                <h3 class="fc-section-title" style="text-align:center;">${titulo}</h3>
                <form id="formContato" style="margin-top:20px;">
                    <div class="fc-form-group">
                        <label for="contato_nome">Nome*</label>
                        <input type="text" id="contato_nome" class="fc-input" required value="${contato?.nome || ''}">
                    </div>
                    <div class="fc-form-group">
                        <label for="contato_tipo">Tipo*</label>
                        <select id="contato_tipo" class="fc-select" required>
                            <option value="">Selecione...</option>
                            <option value="CLIENTE" ${contato?.tipo === 'CLIENTE' ? 'selected' : ''}>Cliente</option>
                            <option value="FORNECEDOR" ${contato?.tipo === 'FORNECEDOR' ? 'selected' : ''}>Fornecedor</option>
                            <option value="FUNCIONARIO" ${contato?.tipo === 'FUNCIONARIO' ? 'selected' : ''}>Funcionário</option>
                            <option value="AMBOS" ${contato?.tipo === 'AMBOS' ? 'selected' : ''}>Ambos</option>
                        </select>
                    </div>
                    <div class="fc-form-group">
                        <label for="contato_cpf_cnpj">CPF/CNPJ</label>
                        <input type="text" id="contato_cpf_cnpj" class="fc-input" value="${contato?.cpf_cnpj || ''}">
                    </div>
                     <div class="fc-form-group">
                        <label for="contato_obs">Observações</label>
                        <textarea id="contato_obs" class="fc-input" rows="2">${contato?.observacoes || ''}</textarea>
                    </div>
                    <div class="fc-modal-footer">
                         <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                         <button type="submit" class="fc-btn fc-btn-primario">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formContato', salvarContatoGerenciamento);
}

async function salvarContatoGerenciamento(event) {
    event.preventDefault();
    const payload = {
        nome: document.getElementById('contato_nome').value,
        tipo: document.getElementById('contato_tipo').value,
        cpf_cnpj: document.getElementById('contato_cpf_cnpj').value,
        observacoes: document.getElementById('contato_obs').value,
    };
    try {
        if (itemEmEdicao) {
            const updated = await fetchFinanceiroAPI(`/contatos/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            const index = contatosGerenciamentoCache.findIndex(c => c.id === itemEmEdicao.id);
            if (index > -1) contatosGerenciamentoCache[index] = updated;
        } else {
            const created = await fetchFinanceiroAPI('/contatos', { method: 'POST', body: JSON.stringify(payload) });
            contatosGerenciamentoCache.push(created);
        }
        mostrarPopupFinanceiro('Contato salvo com sucesso!', 'sucesso');
        fecharModal();
        renderizarTabelaContatosGerenciamento();
    } catch (error) {}
}

async function alterarStatusContato(id, statusAtual) {
    const novoStatus = !statusAtual;
    const acao = novoStatus ? 'reativar' : 'inativar';
    const confirmado = await mostrarPopupConfirmacao(`Tem certeza que deseja ${acao} este favorecido?`);
    if (!confirmado) return;

    try {
        const payload = { ativo: novoStatus };
        const favorecidoAtualizado = await fetchFinanceiroAPI(`/contatos/${id}/status`, { 
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        
        // Atualiza o cache local
        const index = contatosGerenciamentoCache.findIndex(c => c.id == id);
        if (index > -1) {
            contatosGerenciamentoCache[index] = favorecidoAtualizado;
        }

        mostrarPopupFinanceiro(`Favorecido ${acao === 'reativar' ? 'reativado' : 'inativado'} com sucesso!`, 'sucesso');
        renderizarTabelaContatosGerenciamento();

    } catch(error) {
        // o fetchFinanceiroAPI já lida com o popup de erro
    }
}

// --- Funções da Agenda Financeira ---

async function carregarContasAgendadas() {
    try {
        const data = await fetchFinanceiroAPI('/contas-agendadas?status=PENDENTE');
        contasAgendadasCache = data;
        renderizarTabelaAgenda();
    } catch(e) {
        document.getElementById('agendaContainer').innerHTML = `<p style="color: red;">Erro ao carregar agenda.</p>`;
    }
}


function abrirModalAgendamento() {
    itemEmEdicao = null; // Este modal é apenas para criar novos agendamentos
    const titulo = "Novo Agendamento";
    const hoje = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    const modalHTML = `
        <div id="modal-agendamento" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content" style="max-width: 650px;">
                <button id="fecharModal" class="fc-modal-close"><i class="fas fa-times"></i></button>
                <h3 class="fc-section-title" style="text-align:center; border:0; margin-bottom: 20px;">${titulo}</h3>
                
                <div class="fc-form-group">
                    <label>Como deseja agendar?</label>
                    <div class="fc-segmented-control">
                        <button class="fc-segment-btn active" data-tipo-agendamento="unico">Lançamento Único</button>
                        <button class="fc-segment-btn" data-tipo-agendamento="lote">Parcelamento / Recorrência</button>
                    </div>
                </div>

                <!-- FORMULÁRIO PARA LANÇAMENTO ÚNICO -->
                <form id="formAgendamentoUnico">
                    <!-- Conteúdo do formulário único será preenchido pelo JS -->
                </form>

                <!-- FORMULÁRIO PARA PARCELAMENTO / RECORRÊNCIA -->
                <form id="formAgendamentoLote" class="hidden">
                    <div class="fc-form-group">
                        <label for="lote_descricao">Descrição Geral (Ex: Compra de Tecidos, Aluguel 2025)*</label>
                        <input type="text" id="lote_descricao" class="fc-input" required>
                    </div>
                    <div class="fc-form-group">
                        <label for="lote_favorecido_busca">Favorecido*</label>
                        <div class="fc-autocomplete-container">
                            <input type="text" id="lote_favorecido_busca" class="fc-input" placeholder="Digite para buscar..." autocomplete="off" required>
                            <div id="lote_favorecido_resultados" class="fc-autocomplete-results" style="display: none;"></div>
                        </div>
                        <input type="hidden" id="lote_favorecido_id">
                    </div>
                     <div class="fc-form-row">
                        <div class="fc-form-group">
                            <label for="lote_tipo">Tipo*</label>
                            <select id="lote_tipo" class="fc-select" required>
                                <option value="">Selecione...</option>
                                <option value="A_PAGAR">A Pagar</option>
                                <option value="A_RECEBER">A Receber</option>
                            </select>
                        </div>
                        <div class="fc-form-group">
                            <label for="lote_categoria">Categoria*</label>
                            <select id="lote_categoria" class="fc-select" required><option value="">Selecione o tipo</option></select>
                        </div>
                    </div>

                    <hr style="margin: 20px 0;">

                    <div class="fc-form-group">
                        <label for="lote_metodo_divisao">Método de Divisão*</label>
                        <select id="lote_metodo_divisao" class="fc-select">
                            <option value="fixo">Parcelar em X vezes com intervalo fixo</option>
                            <option value="manual">Definir parcelas manualmente</option>
                        </select>
                    </div>

                    <!-- CONTAINER PARA AS OPÇÕES DO MÉTODO FIXO -->
                    <div id="opcoes_metodo_fixo">
                         <div class="fc-form-row">
                            <div class="fc-form-group">
                                <label for="lote_valor_total">Valor Total (R$)*</label>
                                <input type="number" id="lote_valor_total" class="fc-input" step="0.01" min="0.01">
                            </div>
                            <div class="fc-form-group">
                                <label for="lote_num_parcelas">Nº de Parcelas*</label>
                                <input type="number" id="lote_num_parcelas" class="fc-input" min="2" value="2">
                            </div>
                        </div>
                        <div class="fc-form-row">
                             <div class="fc-form-group">
                                <label for="lote_data_primeira_parcela">Venc. da 1ª Parcela*</label>
                                <input type="date" id="lote_data_primeira_parcela" class="fc-input" value="${hoje}">
                            </div>
                            <div class="fc-form-group">
                                <label for="lote_intervalo_tipo">Intervalo*</label>
                                <select id="lote_intervalo_tipo" class="fc-select">
                                    <option value="days">Dias</option>
                                    <option value="weeks">Semanas</option>
                                    <option value="months" selected>Meses</option>
                                </select>
                            </div>
                             <div class="fc-form-group">
                                <label for="lote_intervalo_valor">A cada*</label>
                                <input type="number" id="lote_intervalo_valor" class="fc-input" min="1" value="1">
                            </div>
                        </div>
                         <button type="button" id="btnGerarPrevia" class="fc-btn fc-btn-outline" style="width:100%; margin-top:10px;">Gerar Pré-visualização</button>
                    </div>

                    <!-- CONTAINER PARA AS OPÇÕES DO MÉTODO MANUAL -->
                    <div id="opcoes_metodo_manual" class="hidden">
                        <div class="fc-parcela-manual-header">
                            <span>Data de Vencimento</span>
                            <span>Valor da Parcela (R$)</span>
                            <span></span>
                        </div>
                        <div id="grade_parcelas_manuais"></div>
                        <button type="button" id="btnAdicionarParcelaManual" class="fc-btn fc-btn-outline" style="margin-top: 10px;"><i class="fas fa-plus"></i> Adicionar Parcela</button>
                        <div id="resumo_parcelas_manuais" style="text-align: right; margin-top: 10px; font-weight: bold;"></div>
                    </div>

                    <div id="lote_previa_container" style="margin-top: 15px;"></div>
                </form>

                <div class="fc-modal-footer">
                    <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                    <button type="submit" id="btnSalvarAgendamento" class="fc-btn fc-btn-primario" form="formAgendamentoUnico">Agendar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const formUnico = document.getElementById('formAgendamentoUnico');
    const formLote = document.getElementById('formAgendamentoLote');
    const btnSalvar = document.getElementById('btnSalvarAgendamento');

    document.querySelectorAll('.fc-segment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.fc-segment-btn.active').classList.remove('active');
            btn.classList.add('active');
            const tipo = btn.dataset.tipoAgendamento;

            formUnico.classList.toggle('hidden', tipo !== 'unico');
            formLote.classList.toggle('hidden', tipo !== 'lote');

            if (tipo === 'lote') {
                btnSalvar.setAttribute('form', 'formAgendamentoLote');
                btnSalvar.textContent = 'Agendar Parcelas';
            } else {
                btnSalvar.setAttribute('form', 'formAgendamentoUnico');
                btnSalvar.textContent = 'Agendar';
            }
        });
    });

    formUnico.innerHTML = `
        <div class="fc-form-group"><label>Descrição*</label><input type="text" id="unico_descricao" class="fc-input" required></div>
        <div class="fc-form-group"><label>Valor (R$)*</label><input type="number" id="unico_valor" class="fc-input" step="0.01" min="0.01" required></div>
        <div class="fc-form-group"><label>Vencimento*</label><input type="date" id="unico_vencimento" class="fc-input" required value="${hoje}"></div>
        <!-- Campos de categoria e favorecido para lançamento único podem ser adicionados aqui se necessário -->
    `;

    configurarListenersModal('formAgendamentoUnico', salvarAgendamento);
    configurarListenersModal('formAgendamentoLote', gerarEconfirmarLote);

    document.getElementById('lote_tipo').addEventListener('change', (e) => {
        const tipo = e.target.value === 'A_PAGAR' ? 'DESPESA' : 'RECEITA';
        const catSelect = document.getElementById('lote_categoria');
        const categoriasFiltradas = categoriasCache.filter(c => gruposCache.find(g => g.id === c.id_grupo)?.tipo === tipo);
        catSelect.innerHTML = '<option value="">Selecione...</option>' + categoriasFiltradas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    });
    
    setupAutocomplete(
        document.getElementById('lote_favorecido_busca'),
        document.getElementById('lote_favorecido_resultados'),
        document.getElementById('lote_favorecido_id')
    );

    const metodoSelect = document.getElementById('lote_metodo_divisao');
    const opcoesFixo = document.getElementById('opcoes_metodo_fixo');
    const opcoesManual = document.getElementById('opcoes_metodo_manual');

    metodoSelect.addEventListener('change', () => {
        opcoesFixo.classList.toggle('hidden', metodoSelect.value !== 'fixo');
        opcoesManual.classList.toggle('hidden', metodoSelect.value !== 'manual');

        if (metodoSelect.value === 'manual' && document.querySelectorAll('#grade_parcelas_manuais .fc-parcela-manual-linha').length === 0) {
            adicionarLinhaParcelaManual();
        }
    });

    document.getElementById('btnAdicionarParcelaManual').addEventListener('click', () => adicionarLinhaParcelaManual());
    document.getElementById('btnGerarPrevia')?.addEventListener('click', gerarPreviaLote);
}

async function salvarAgendamento(event) {
    event.preventDefault();
    const payload = {
        tipo: document.getElementById('ag_tipo').value,
        descricao: document.getElementById('ag_descricao').value,
        valor: parseFloat(document.getElementById('ag_valor').value),
        data_vencimento: document.getElementById('ag_vencimento').value,
        id_categoria: parseInt(document.getElementById('ag_categoria').value),
        id_contato: parseInt(document.getElementById('ag_contato_id').value) || null,
    };
    try {
        await fetchFinanceiroAPI('/contas-agendadas', { method: 'POST', body: JSON.stringify(payload) });
        mostrarPopupFinanceiro('Conta agendada com sucesso!', 'sucesso');
        fecharModal();
        carregarContasAgendadas(); // Recarrega a lista
    } catch(e) {}
}

function abrirModalBaixa(conta) {
    itemEmEdicao = conta;
    const hojeDate = new Date();
    const fusoHorarioOffset = hojeDate.getTimezoneOffset() * 60000; // offset em milissegundos
    const hojeLocal = new Date(hojeDate.getTime() - fusoHorarioOffset);
    const hoje = hojeLocal.toISOString().split('T')[0];

    const modalHTML = `
        <div id="modal-financeiro" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close">×</button>
                <h3 class="fc-section-title" style="text-align:center;">Dar Baixa em Conta</h3>
                <p style="text-align:center; margin-top:-15px; margin-bottom:20px;"><strong>${conta.descricao}</strong> - R$ ${parseFloat(conta.valor).toFixed(2)}</p>
                <form id="formBaixa" style="margin-top:20px;">
                    <div class="fc-form-group">
                        <label for="baixa_data">Data do Pagamento/Recebimento*</label>
                        <input type="date" id="baixa_data" class="fc-input" required value="${hoje}">
                    </div>
                    <div class="fc-form-group">
                        <label for="baixa_conta">Conta Bancária de Origem/Destino*</label>
                        <select id="baixa_conta" class="fc-select" required>
                            <option value="">Selecione...</option>
                            ${contasCache.map(c => `<option value="${c.id}">${c.nome_conta}</option>`).join('')}
                        </select>
                    </div>
                    <div class="fc-modal-footer">
                        <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                        <button type="submit" class="fc-btn fc-btn-primario">Confirmar Baixa</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formBaixa', salvarBaixa);
}

async function salvarBaixa(event) {
    event.preventDefault();
    const payload = {
        data_transacao: document.getElementById('baixa_data').value,
        id_conta_bancaria: parseInt(document.getElementById('baixa_conta').value),
    };
    try {
        await fetchFinanceiroAPI(`/contas-agendadas/${itemEmEdicao.id}/baixar`, { method: 'POST', body: JSON.stringify(payload) });
        mostrarPopupFinanceiro('Baixa realizada com sucesso!', 'sucesso');
        fecharModal();
        carregarContasAgendadas(); // Recarrega a lista da agenda
        carregarDadosDashboard(); // Recarrega os lançamentos do dashboard
    } catch(e) {}
}


function setupAutocomplete(buscaInput, resultadosDiv, idInput) {
    // Esta função centraliza a lógica do autocomplete para ser reutilizada
    const renderizarResultados = (resultados) => {
        resultadosDiv.innerHTML = '';
        if (resultados.length > 0) {
            resultados.forEach(item => {
                const div = document.createElement('div');
                div.className = 'fc-autocomplete-item';
                div.textContent = item.nome;
                div.dataset.id = item.id;
                div.addEventListener('click', () => {
                    buscaInput.value = item.nome;
                    idInput.value = item.id;
                    resultadosDiv.style.display = 'none';
                });
                resultadosDiv.appendChild(div);
            });
        }
        
        const termoBusca = buscaInput.value.trim();
        const existeExato = resultados.some(r => r.nome.toLowerCase() === termoBusca.toLowerCase());
        if (termoBusca && !existeExato) {
            const divNovo = document.createElement('div');
            divNovo.className = 'fc-autocomplete-item is-new';
            divNovo.innerHTML = `+ Criar novo: "<strong>${termoBusca}</strong>"`;
            divNovo.addEventListener('click', async () => {
                const tipo = prompt(`Qual o tipo do novo contato "${termoBusca}"?\n(CLIENTE, FORNECEDOR, FUNCIONARIO, AMBOS)`, 'FORNECEDOR');
                if (tipo && ['CLIENTE', 'FORNECEDOR', 'FUNCIONARIO', 'AMBOS'].includes(tipo.toUpperCase())) {
                    try {
                        const novoContato = await fetchFinanceiroAPI('/contatos', {
                            method: 'POST',
                            body: JSON.stringify({ nome: termoBusca, tipo: tipo.toUpperCase() })
                        });
                        buscaInput.value = novoContato.nome;
                        idInput.value = novoContato.id;
                        contatosGerenciamentoCache.push(novoContato); // Adiciona ao cache
                        resultadosDiv.style.display = 'none';
                    } catch (e) {}
                } else if(tipo) { alert('Tipo inválido.'); }
            });
            resultadosDiv.appendChild(divNovo);
        }
        resultadosDiv.style.display = (resultadosDiv.childElementCount > 0) ? 'block' : 'none';
    };

    buscaInput.addEventListener('input', debounce(async () => {
        const termo = buscaInput.value;
        idInput.value = '';
        if (termo.length < 2) {
            resultadosDiv.style.display = 'none';
            return;
        }
        try {
            const resultados = await fetchFinanceiroAPI(`/contatos?q=${encodeURIComponent(termo)}`);
            renderizarResultados(resultados);
        } catch (e) {}
    }, 300));

    document.addEventListener('click', (e) => {
        if (!buscaInput.contains(e.target)) {
            resultadosDiv.style.display = 'none';
        }
    });
}

// --- Função Utilitária para Modais ---
function configurarListenersModal(formId, submitCallback) {
    document.getElementById('fecharModal')?.addEventListener('click', fecharModal);
    document.getElementById('btnCancelarModal')?.addEventListener('click', fecharModal);
    
    const fecharAoClicarFora = (e) => {
        if (e.target.matches('.fc-modal')) fecharModal();
    };
    const modalElement = document.querySelector('.fc-modal');
    modalElement?.addEventListener('click', fecharAoClicarFora);

    // Guarda a função de remoção para ser chamada depois
    fecharModalListenerRemover = () => {
        modalElement?.removeEventListener('click', fecharAoClicarFora);
    };

    document.getElementById(formId)?.addEventListener('submit', submitCallback);
}


async function carregarDadosDashboard() {
    const dashboardContent = document.getElementById('dashboard-content');
    if (!dashboardContent) return;
    dashboardContent.innerHTML = `<p>Carregando dados do dashboard...</p>`;

    try {
        // Usa o novo endpoint que traz tudo de uma vez
        const [dashboardData, lancamentosData] = await Promise.all([
            fetchFinanceiroAPI('/dashboard'),
            fetchFinanceiroAPI('/lancamentos?limit=20') // Ainda buscamos os lançamentos separadamente
        ]);
        
        lancamentosCache = lancamentosData.lancamentos;
        renderizarDashboard(dashboardData.saldos, dashboardData.alertas); // Passa os dados para a renderização

    } catch(error) {
        if (dashboardContent) dashboardContent.innerHTML = `<p style="color:red;">Falha ao carregar dados do dashboard.</p>`;
    }
}


// --- Lógica Principal e Inicialização ---

function atualizarBotaoConfig(emViewSecundaria) {
    const btn = document.getElementById('btnToggleConfiguracoes');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (emViewSecundaria) {
        btn.title = 'Fechar e Voltar ao Dashboard';
        icon.className = 'fas fa-times';
        btn.classList.add('fechar');
    } else {
        btn.title = 'Configurações';
        icon.className = 'fas fa-cog';
        btn.classList.remove('fechar');
    }
}

// Função para alternar entre a tela principal (com abas) e a tela de configurações
function gerenciarNavegacaoPrincipal(view) {
    const viewPrincipal = document.getElementById('viewPrincipal');
    const configView = document.getElementById('configuracoesView');
    const aprovacoesView = document.getElementById('aprovacoesView');
    const historicoView = document.getElementById('historicoView'); // NOVA VIEW

    // Esconde todas as telas secundárias
    viewPrincipal.classList.add('hidden');
    configView.classList.add('hidden');
    aprovacoesView.classList.add('hidden');
    historicoView.classList.add('hidden');
    
    // Mostra a tela principal por padrão
    viewPrincipal.classList.remove('hidden');
    atualizarBotaoConfig(false); // Garante que o botão seja a engrenagem

    document.getElementById('tituloPrincipal').textContent = 'Controle Financeiro';

    if (view === 'config') {
        viewPrincipal.classList.add('hidden');
        configView.classList.remove('hidden');
        atualizarBotaoConfig(true, 'config');
        document.getElementById('tituloPrincipal').textContent = 'Configurações';
    } else if (view === 'aprovacoes') {
        viewPrincipal.classList.add('hidden');
        aprovacoesView.classList.remove('hidden');
        atualizarBotaoConfig(true, 'aprovacoes');
        document.getElementById('tituloPrincipal').textContent = 'Aprovações Pendentes';
        carregarAprovacoesPendentes();
    } else if (view === 'historico') { // NOVA LÓGICA
        viewPrincipal.classList.add('hidden');
        historicoView.classList.remove('hidden');
        atualizarBotaoConfig(true, 'historico');
        document.getElementById('tituloPrincipal').textContent = 'Histórico de Atividades';
        carregarLogsAuditoria();
    }
}

async function carregarAprovacoesPendentes() {
    const container = document.getElementById('aprovacoesContainer');
    container.innerHTML = `<div class="fc-spinner">Buscando solicitações...</div>`;
    try {
        const solicitacoes = await fetchFinanceiroAPI('/aprovacoes-pendentes');
        
        // Log para confirmar que os dados chegaram no frontend
        console.log("Dados recebidos da API de aprovações:", solicitacoes);

        renderizarCardsAprovacao(solicitacoes);
    } catch (error) {
        // ESTE É O LOG MAIS IMPORTANTE
        console.error("ERRO DETALHADO AO RENDERIZAR APROVAÇÕES:", error);
        container.innerHTML = `<p style="color:red">Erro ao processar solicitações. Verifique o console.</p>`;
    }
}

function renderizarCardsAprovacao(solicitacoes) {
    const container = document.getElementById('aprovacoesContainer');
    if (!container) {
        console.error('ERRO: Container #aprovacoesContainer não encontrado.');
        return;
    }

    if (!solicitacoes || solicitacoes.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px;">Nenhuma aprovação pendente no momento.</p>`;
        return;
    }

    // Função interna e segura para formatar os valores para exibição
    const formatarValorExibicao = (chave, valor) => {
        if (valor === null || valor === undefined) return 'N/A';
        
        switch(chave) {
            case 'valor':
                return formatCurrency(valor);
            case 'data_transacao':
                const dataStr = String(valor).split('T')[0];
                return new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
            case 'id_categoria':
                const categoria = categoriasCache.find(c => c.id == valor);
                return categoria ? categoria.nome : `<span style="color:var(--fc-cor-despesa);">ID ${valor} (inválido)</span>`;
            case 'id_conta_bancaria':
                const conta = contasCache.find(c => c.id == valor);
                return conta ? conta.nome_conta : `<span style="color:var(--fc-cor-despesa);">ID ${valor} (inválido)</span>`;
            case 'id_contato':
                const contato = contatosGerenciamentoCache.find(c => c.id == valor);
                return contato ? contato.nome : '-';
            default:
                return valor || '-';
        }
    };

    // Função interna para gerar o HTML dos detalhes. Agora ela recebe o contexto (se é o bloco 'DE' ou 'PARA')
    const gerarHtmlDetalhes = (dados, dadosComparacao = null, isBlocoNovo = false) => {
        const dadosSeguros = dados || {};
        const dadosComparacaoSeguros = dadosComparacao || {};

        let html = '<ul>';
        const chavesRelevantes = ['valor', 'data_transacao', 'descricao', 'id_categoria', 'id_conta_bancaria', 'id_contato'];

        for (const chave of chavesRelevantes) {
            const valor = dadosSeguros[chave] ?? null;
            let valorFormatado = formatarValorExibicao(chave, valor);
            let classe = '';
            
            // Compara com o bloco de referência para destacar mudanças
            if (dadosComparacaoSeguros && typeof dadosComparacaoSeguros === 'object') {
                const valorComparacao = dadosComparacaoSeguros[chave] ?? null;
                if (JSON.stringify(valor) !== JSON.stringify(valorComparacao)) {
                    classe = 'alterado';
                    // Se for o bloco "PARA", mostra o valor antigo riscado
                    if (isBlocoNovo) {
                        const valorAntigoFormatado = formatarValorExibicao(chave, valorComparacao);
                        valorFormatado = `${valorFormatado} <span style="text-decoration: line-through; color: #999; font-size: 0.9em;">(${valorAntigoFormatado})</span>`;
                    }
                }
            }
            
            const label = chave.replace('id_', '').replace(/_/g, ' ');
            html += `<li class="${classe}"><strong>${label}:</strong> <span class="valor-item">${valorFormatado}</span></li>`;
        }
        
        return html + '</ul>';
    };

    container.innerHTML = solicitacoes.map(s => {
        const dadosAntigos = s.dados_antigos;
        const dadosNovos = s.dados_novos;
        const ehEdicao = s.tipo_solicitacao === 'EDICAO';

        return `
        <div class="fc-aprovacao-card">
            <div class="meta-info">
                <span>Solicitado por: <strong>${s.nome_solicitante}</strong></span>
                <span>Em: ${new Date(s.data_solicitacao).toLocaleString('pt-BR')}</span>
            </div>
            <div class="dados-container">
                <div class="dados-bloco">
                    <h4>DE (Dados Originais)</h4>
                    ${gerarHtmlDetalhes(dadosAntigos)}
                </div>
                <div class="dados-bloco ${ehEdicao ? '' : 'exclusao'}">
                    <h4>${ehEdicao ? 'PARA (Dados Solicitados)' : 'AÇÃO SOLICITADA'}</h4>
                    ${ehEdicao ? gerarHtmlDetalhes(dadosNovos, dadosAntigos, true) : '<ul style="color: var(--fc-cor-despesa);"><li><strong>EXCLUIR LANÇAMENTO</strong></li></ul>'}
                </div>
            </div>
            <div class="acoes-aprovacao">
                <button class="fc-btn fc-btn-secundario btn-rejeitar" data-id="${s.id}"><i class="fas fa-times"></i> Rejeitar</button>
                <button class="fc-btn fc-btn-primario btn-aprovar" data-id="${s.id}"><i class="fas fa-check"></i> Aprovar</button>
            </div>
        </div>
        `
    }).join('');

    // Listeners para os botões de aprovar/rejeitar
    container.querySelectorAll('.btn-aprovar').forEach(btn => {
        btn.addEventListener('click', (e) => aprovarSolicitacao(e.currentTarget.dataset.id));
    });
    container.querySelectorAll('.btn-rejeitar').forEach(btn => {
        btn.addEventListener('click', (e) => rejeitarSolicitacao(e.currentTarget.dataset.id));
    });
}


async function aprovarSolicitacao(id) {
    const confirmado = await mostrarPopupConfirmacao('Tem certeza que deseja APROVAR esta alteração? A ação é irreversível.');
    if (!confirmado) return;

    try {
        // Envia a requisição para a API aprovar a solicitação
        await fetchFinanceiroAPI(`/aprovacoes/${id}/aprovar`, { method: 'POST' });
        
        // Mostra feedback de sucesso
        mostrarPopupFinanceiro('Solicitação aprovada com sucesso!', 'sucesso');
        
        // Recarrega a lista de aprovações pendentes (o item aprovado vai sumir)
        carregarAprovacoesPendentes();
        
        // Atualiza o contador do sino de notificações
        atualizarBadgesHeader();
        carregarLogsAuditoria();
        // Recarrega os dados do dashboard e dos lançamentos em segundo plano
        // para refletir a alteração ou exclusão que foi aprovada.
        carregarDadosDashboard();
        carregarLancamentosFiltrados(1, filtrosAtivos);

    } catch(e) {
        // A função fetchFinanceiroAPI já lida com a exibição do popup de erro
    }
}

async function rejeitarSolicitacao(id) {
    const motivo = await mostrarPopupComInput('Por favor, digite o motivo da rejeição:', 'Motivo obrigatório');
    
    if (!motivo || motivo.trim() === '') {
        mostrarPopupFinanceiro('A rejeição foi cancelada, pois é necessário fornecer um motivo.', 'aviso');
        return;
    }
    try {
        await fetchFinanceiroAPI(`/aprovacoes/${id}/rejeitar`, { 
            method: 'POST',
            body: JSON.stringify({ motivo: motivo.trim() }) 
        });
        mostrarPopupFinanceiro('Solicitação rejeitada com sucesso.', 'info');
        
        // Recarrega a tela de aprovações para remover o item processado
        carregarAprovacoesPendentes();
        // Atualiza o badge do sino
        atualizarBadgesHeader();
        carregarLogsAuditoria();

    } catch(e) {
        // fetchFinanceiroAPI já lida com o popup de erro
    }
}

// Função para trocar entre as abas (Dashboard, Lançamentos, Agenda)
function mudarAba(abaAtiva) {
    // Atualiza o visual dos botões e painéis
    document.querySelectorAll('.fc-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === abaAtiva);
    });
    document.querySelectorAll('.fc-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${abaAtiva}`);
    });

    // Renderiza o conteúdo da aba que se tornou ativa
    switch (abaAtiva) {
        case 'dashboard':
            // O dashboard já foi renderizado na inicialização, não precisa fazer nada.
            break;
        case 'lancamentos':
            prepararAbaLancamentos();
            break;
        case 'agenda':
            // Renderiza o conteúdo da agenda.
            renderizarTabelaAgenda();
            break;
    }
}

function setupEventListenersFinanceiro() {
    // --- NAVEGAÇÃO PRINCIPAL (ABAS E VIEWS) ---

    document.querySelectorAll('.fc-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => mudarAba(btn.dataset.tab));
    });

    // Botão que alterna entre Configurações (engrenagem) e Fechar (X)
    const btnToggleConfig = document.getElementById('btnToggleConfiguracoes');
    btnToggleConfig?.addEventListener('click', () => {
        if (btnToggleConfig.classList.contains('fechar')) {
            gerenciarNavegacaoPrincipal('main'); // Se for 'X', sempre volta pro main
        } else {
            gerenciarNavegacaoPrincipal('config'); // Se for engrenagem, vai para config
        }
    });

    // Botão de Aprovações (sino)
    const btnAprovacoes = document.getElementById('btnIrParaAprovacoes');
    if (permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira')) {
        btnAprovacoes?.addEventListener('click', () => gerenciarNavegacaoPrincipal('aprovacoes'));
    } else {
        btnAprovacoes?.classList.add('fc-btn-disabled');
        btnAprovacoes?.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para acessar esta área.', 'aviso'));
    }

    // Botão de Histórico
    const btnHistorico = document.getElementById('btnIrParaHistorico');
    if (permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira')) {
        btnHistorico?.addEventListener('click', () => gerenciarNavegacaoPrincipal('historico'));
    } else {
        btnHistorico?.classList.add('fc-btn-disabled');
        btnHistorico?.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para ver o histórico.', 'aviso'));
    }
    
    // Menu lateral da tela de Configurações
    document.querySelector('.fc-config-menu')?.addEventListener('click', (e) => {
        if (e.target.matches('.fc-config-menu-item')) {
            e.preventDefault();
            mudarPainelConfig(e.target.dataset.config);
        }
    });

    // --- BOTÕES DE AÇÃO GLOBAIS (FAB E AGENDA) ---

    // Botão Flutuante para Novo Lançamento
    const btnNovoLancamento = document.getElementById('btnNovoLancamento');
    if (permissoesGlobaisFinanceiro.includes('lancar-transacao')) {
        btnNovoLancamento?.addEventListener('click', () => abrirModalLancamento());
    } else {
        btnNovoLancamento?.classList.add('fc-btn-disabled');
        btnNovoLancamento?.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para criar lançamentos.', 'aviso'));
    }

    // Botão para Agendar Novo na aba Agenda
    const btnAgendar = document.getElementById('btnAgendarNovaConta');
    if(permissoesGlobaisFinanceiro.includes('lancar-transacao')) {
        btnAgendar?.addEventListener('click', () => abrirModalAgendamento());
    } else {
        btnAgendar?.classList.add('fc-btn-disabled');
        btnAgendar?.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para agendar contas.', 'aviso'));
    }

    // --- PAINEL DE NOTIFICAÇÕES (Caixa de Entrada) ---
    const btnNotificacoes = document.getElementById('btnNotificacoes');
    btnNotificacoes?.addEventListener('click', (e) => {
        e.stopPropagation();
        const painel = document.getElementById('painelNotificacoes');
        const estaOculto = painel.classList.contains('hidden');
        
        // Esconde outros painéis flutuantes se houver
        // (no futuro podemos ter um de perfil, etc)

        if (estaOculto) {
            carregarNotificacoes();
            painel.classList.remove('hidden');
        } else {
            painel.classList.add('hidden');
        }
    });

    // Listener para fechar o painel de notificações se clicar fora
    document.addEventListener('click', (e) => {
        const painel = document.getElementById('painelNotificacoes');
        const btn = document.getElementById('btnNotificacoes');
        if (painel && btn && !painel.classList.contains('hidden') && !painel.contains(e.target) && !btn.contains(e.target)) {
            painel.classList.add('hidden');
        }
    });


    // --- DELEGAÇÃO DE EVENTOS PARA A ABA LANÇAMENTOS ---
    const tabLancamentos = document.getElementById('tab-lancamentos');
    if (tabLancamentos) {
        // Listener para o botão de ATUALIZAR
        tabLancamentos.addEventListener('click', (e) => {
            const btn = e.target.closest('#btnAtualizarLancamentos');
            if (btn) {
                btn.disabled = true;
                carregarLancamentosFiltrados(filtrosAtivos.page || 1).finally(() => {
                    btn.disabled = false;
                });
            }
        });
        
        // Listener para mostrar/esconder filtros avançados
        tabLancamentos.addEventListener('click', (e) => {
            if (e.target.closest('#btnToggleFiltrosAvancados')) {
                document.getElementById('filtrosLancamentos').classList.toggle('hidden');
            }
        });

        // Listener para Limpar Filtros
        tabLancamentos.addEventListener('click', (e) => {
            if (e.target.closest('#btnLimparFiltros')) {
                const filtrosForm = document.getElementById('filtrosLancamentos');
                filtrosForm.reset();
                document.getElementById('filtroBuscaRapida').value = '';
                filtrosAtivos = {};
                prepararAbaLancamentos();
            }
        });
        
        // Listener único para todos os inputs de filtro
        tabLancamentos.addEventListener('input', debounce((e) => {
            if (e.target.closest('#filtrosLancamentos') || e.target.matches('#filtroBuscaRapida')) {
                const filtrosForm = document.getElementById('filtrosLancamentos');
                const formData = new FormData(filtrosForm);
                filtrosAtivos = Object.fromEntries(formData.entries());
                filtrosAtivos.termoBusca = document.getElementById('filtroBuscaRapida').value.trim();
                for (const key in filtrosAtivos) { if (!filtrosAtivos[key]) delete filtrosAtivos[key]; }
                carregarLancamentosFiltrados(1);
            }
        }, 500));
    }
}


async function inicializarPaginaFinanceiro() {
    console.log('[Financeiro] Inicializando página...');
    
    try {
        // A busca por aprovações agora é separada para não travar a carga inicial para usuários comuns
        let aprovacoesPendentes = [];
        if (permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira')) {
            aprovacoesPendentes = await fetchFinanceiroAPI('/aprovacoes-pendentes');
        }

        const [configData, dashboardData, lancamentosData, contasAgendadasData, contatosData] = await Promise.all([
            fetchFinanceiroAPI('/configuracoes'),
            fetchFinanceiroAPI('/dashboard'),
            fetchFinanceiroAPI('/lancamentos?limit=50'),
            fetchFinanceiroAPI('/contas-agendadas?status=PENDENTE'),
            fetchFinanceiroAPI('/contatos/all')
        ]);
        
        // 1. Armazena todos os dados nos caches
        contasCache = configData.contas;
        gruposCache = configData.grupos;
        categoriasCache = configData.categorias;
        lancamentosCache = lancamentosData.lancamentos;
        contasAgendadasCache = contasAgendadasData;
        contatosGerenciamentoCache = contatosData;
        filtrosAtivos.total = lancamentosData.total;
        
        // 2. Atualiza os badges do header
        const badgeAprovacoes = document.getElementById('badgeAprovacoes');
        if (badgeAprovacoes && aprovacoesPendentes.length > 0) {
            badgeAprovacoes.textContent = aprovacoesPendentes.length;
            badgeAprovacoes.classList.remove('hidden');
        } else if (badgeAprovacoes) {
            badgeAprovacoes.classList.add('hidden');
        }
        await atualizarBadgesHeader(); // Busca e atualiza o badge de notificações pessoais

        // 3. Renderiza o conteúdo de todas as seções e painéis
        renderizarDashboard(dashboardData.saldos, dashboardData.alertas);
        renderizarGraficoFluxoCaixa();
        renderizarTabelaAgenda(); 
        prepararAbaLancamentos();
        
        // Renderiza o conteúdo da tela de configurações (que começa oculta)
        renderizarTabelaContas();
        renderizarContatosGerenciamento();
        renderizarTabelaCategoriasAgrupadas();
        
        // 4. Configura todos os event listeners
        setupEventListenersFinanceiro();
        
        // 5. Define o estado visual inicial da interface
        gerenciarNavegacaoPrincipal('main');
        mudarAba('dashboard'); 
        mudarPainelConfig('contas');
        
        console.log('[Financeiro] Página inicializada com sucesso.');

    } catch (error) {
        console.error('Erro crítico na inicialização:', error);
        const mainContainer = document.querySelector('.fc-main-container');
        if (mainContainer) mainContainer.innerHTML = `<div class="fc-card" style="border-left: 5px solid var(--fc-cor-despesa);">Erro crítico ao carregar dados iniciais. Verifique o console.</div>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/financeiro.html', ['acesso-financeiro']);
        if (!auth) return; 

        permissoesGlobaisFinanceiro = auth.permissoes || [];
        usuarioLogadoFinanceiro = auth.usuario;

        document.body.classList.add('autenticado');
        await inicializarPaginaFinanceiro();

    } catch (error) {
        console.error('[Financeiro DOMContentLoaded] Erro:', error);
    }
});

function renderizarTabelaAgenda() {
    const container = document.getElementById('agendaContainer');
    if (!container) return;
    const podeBaixar = permissoesGlobaisFinanceiro.includes('aprovar-pagamento');

    if (contasAgendadasCache.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px;">Nenhuma conta pendente na agenda.</p>`;
        return;
    }

    container.innerHTML = contasAgendadasCache.map(c => {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const vencimento = new Date(c.data_vencimento.split('T')[0] + 'T00:00:00');
        const isAtrasado = vencimento < hoje;
        const tipoClasse = c.tipo === 'A_PAGAR' ? 'pagar' : 'receber';

        return `
        <div class="fc-agenda-card ${tipoClasse} ${isAtrasado ? 'atrasado' : ''}">
            <div class="header">
                <div class="info">
                    <div class="descricao">${c.descricao}</div>
                    <div class="vencimento">Vence em: ${vencimento.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</div>
                </div>
                <div class="valor">R$ ${parseFloat(c.valor).toFixed(2)}</div>
            </div>
            <div class="footer">
                <span class="favorecido">Favorecido: ${c.nome_favorecido || '-'}</span>
                <button class="fc-btn fc-btn-primario btn-dar-baixa ${podeBaixar ? '' : 'fc-btn-disabled'}" data-id="${c.id}">
                    <i class="fas fa-check"></i> Baixar
                </button>
            </div>
        </div>`
    }).join('');

    container.querySelectorAll('.btn-dar-baixa').forEach(btn => {
        if(podeBaixar) {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const conta = contasAgendadasCache.find(c => c.id == id);
                abrirModalBaixa(conta);
            });
        } else {
            btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para dar baixa em contas.', 'aviso'));
        }
    });
}

function renderizarTabelaCategoriasAgrupadas() {
    const container = document.getElementById('config-categorias');
    if (!container) return;
    
    let podeGerenciar = permissoesGlobaisFinanceiro.includes('gerenciar-categorias');
    
    const categoriasPorGrupo = categoriasCache.reduce((acc, cat) => {
        (acc[cat.id_grupo] = acc[cat.id_grupo] || []).push(cat);
        return acc;
    }, {});

    container.innerHTML = `
        <header class="fc-table-header">
            <h3 class="fc-table-title">Categorias e Grupos</h3>
            <div>
                <button id="btnAdicionarGrupo" class="fc-btn fc-btn-outline ${podeGerenciar ? '' : 'fc-btn-disabled'}"><i class="fas fa-plus"></i> Novo Grupo</button>
                <button id="btnAdicionarCategoria" class="fc-btn fc-btn-primario ${podeGerenciar ? '' : 'fc-btn-disabled'}"><i class="fas fa-plus"></i> Nova Categoria</button>
            </div>
        </header>
        <div class="fc-grupo-acordeao">
        ${gruposCache.map(grupo => `
            <div class="grupo-item">
                <div class="grupo-header">${grupo.nome} (${grupo.tipo})</div>
                <table class="fc-tabela-estilizada categorias-lista">
                    <tbody>
                    ${(categoriasPorGrupo[grupo.id] || []).map(cat => `
                        <tr>
                            <td>${cat.nome}</td>
                            <td class="td-acoes" style="text-align:right;">
                                <button class="fc-btn-icon btn-editar-categoria ${podeGerenciar ? '' : 'fc-btn-disabled'}" data-id="${cat.id}" title="Editar Categoria"><i class="fas fa-pencil-alt"></i></button>
                            </td>
                        </tr>
                    `).join('') || `<tr><td>Nenhuma categoria neste grupo.</td></tr>`}
                    </tbody>
                </table>
            </div>
        `).join('')}
        </div>
    `;
    
    // --- ADIÇÃO DOS LISTENERS ---
    if (podeGerenciar) {
        container.querySelector('#btnAdicionarGrupo')?.addEventListener('click', () => abrirModalGrupo());
        container.querySelector('#btnAdicionarCategoria')?.addEventListener('click', () => abrirModalCategoria());
        
        container.querySelectorAll('.btn-editar-categoria').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const categoria = categoriasCache.find(c => c.id == id);
                abrirModalCategoria(categoria);
            });
        });
    } else {
        container.querySelectorAll('.fc-btn-disabled').forEach(btn => {
            btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para gerenciar categorias.', 'aviso'));
        });
    }
}

function mudarPainelConfig(painelAtivo) {
    document.querySelectorAll('.fc-config-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.config === painelAtivo);
    });
    document.querySelectorAll('.fc-config-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `config-${painelAtivo}`);
    });

    // Renderiza o conteúdo do painel que se tornou ativo, se necessário
    switch(painelAtivo) {
        case 'contas': 
            renderizarTabelaContas(); 
            break;
        case 'favorecidos': 
            renderizarContatosGerenciamento(); 
            break;
        case 'categorias': 
            renderizarTabelaCategoriasAgrupadas(); 
            break;
    }
}

async function carregarNotificacoes() {
    const listaContainer = document.getElementById('listaNotificacoes');
    if (!listaContainer) return;
    listaContainer.innerHTML = `<p class="sem-notificacoes">Carregando...</p>`;
    
    try {
        const notificacoes = await fetchFinanceiroAPI('/notificacoes');
        renderizarNotificacoes(notificacoes);
    } catch (e) {
        listaContainer.innerHTML = `<p class="sem-notificacoes" style="color:red;">Erro ao buscar notificações.</p>`;
    }
}

function renderizarNotificacoes(notificacoes) {
    const listaContainer = document.getElementById('listaNotificacoes');
    if (!listaContainer) return;

    if (notificacoes.length === 0) {
        listaContainer.innerHTML = `<p class="sem-notificacoes">Nenhuma notificação.</p>`;
        return;
    }

    const icones = {
        SUCESSO: 'fa-check-circle',
        REJEICAO: 'fa-times-circle',
        INFO: 'fa-info-circle'
    };

    listaContainer.innerHTML = notificacoes.map(n => `
        <div class="fc-notificacao-item ${n.lida ? '' : 'nao-lida'}" data-id="${n.id}">
            <div class="icone ${n.tipo.toLowerCase()}">
                <i class="fas ${icones[n.tipo] || 'fa-info-circle'}"></i>
            </div>
            <div class="conteudo">
                <p class="mensagem">${n.mensagem}</p>
                <p class="data">${new Date(n.criado_em).toLocaleString('pt-BR')}</p>
            </div>
        </div>
    `).join('');

    // Adiciona os listeners para marcar como lida ao clicar
    listaContainer.querySelectorAll('.fc-notificacao-item.nao-lida').forEach(item => {
        item.addEventListener('click', () => marcarComoLida(item.dataset.id));
    });
}

async function marcarComoLida(id) {
    try {
        await fetchFinanceiroAPI(`/notificacoes/${id}/marcar-como-lida`, { method: 'POST' });
        
        // Atualiza a interface sem precisar de uma nova chamada à API
        const item = document.querySelector(`.fc-notificacao-item[data-id="${id}"]`);
        item?.classList.remove('nao-lida');
        
        // Atualiza o contador do badge
        atualizarBadgesHeader(); 

    } catch(e) {
        mostrarPopupFinanceiro('Erro ao marcar notificação.', 'erro');
    }
}

async function marcarTodasComoLidas() {
    try {
        await fetchFinanceiroAPI('/notificacoes/marcar-todas-como-lidas', { method: 'POST' });
        
        // Atualiza a interface
        document.querySelectorAll('.fc-notificacao-item.nao-lida').forEach(item => {
            item.classList.remove('nao-lida');
        });

        // Zera o contador do badge
        const badge = document.getElementById('badgeNotificacoes');
        if (badge) badge.classList.add('hidden');

        // Atualiza o contador do badge
        atualizarBadgesHeader(); 

    } catch(e) {
        mostrarPopupFinanceiro('Erro ao marcar todas as notificações.', 'erro');
    }
}

async function atualizarBadgesHeader() {
    // Busca os dados para ambos os contadores em paralelo
    try {
        const [aprovacoesData, notificacoesData] = await Promise.all([
            permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira') ? fetchFinanceiroAPI('/aprovacoes-pendentes') : Promise.resolve([]),
            fetchFinanceiroAPI('/notificacoes')
        ]);

        // Atualiza badge de Aprovações (sino)
        const badgeAprovacoes = document.getElementById('badgeAprovacoes');
        if (badgeAprovacoes && aprovacoesData.length > 0) {
            badgeAprovacoes.textContent = aprovacoesData.length;
            badgeAprovacoes.classList.remove('hidden');
        } else if (badgeAprovacoes) {
            badgeAprovacoes.classList.add('hidden');
        }

        // Atualiza badge de Notificações (caixa)
        const badgeNotificacoes = document.getElementById('badgeNotificacoes');
        const naoLidas = notificacoesData.filter(n => !n.lida).length;
        if (badgeNotificacoes && naoLidas > 0) {
            badgeNotificacoes.textContent = naoLidas;
            badgeNotificacoes.classList.remove('hidden');
        } else if (badgeNotificacoes) {
            badgeNotificacoes.classList.add('hidden');
        }
    } catch (e) {
        console.error("Erro ao atualizar badges:", e);
    }
}

async function carregarLogsAuditoria() {
    const container = document.getElementById('historicoContainer');
    if (!container) return;
    container.innerHTML = `<div class="fc-spinner">Buscando histórico...</div>`;
    try {
        const logs = await fetchFinanceiroAPI('/logs');
        renderizarLogsAuditoria(logs);
    } catch (e) {
        container.innerHTML = `<p style="color:red">Erro ao buscar histórico.</p>`;
    }
}

function renderizarLogsAuditoria(logs) {
    const container = document.getElementById('historicoContainer');
    if (!container) return;

    if (logs.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding:20px;">Nenhuma atividade registrada ainda.</p>`;
        return;
    }

    const icones = {
        CRIACAO: 'fa-plus-circle',
        EDICAO: 'fa-pencil-alt',
        EXCLUSAO: 'fa-trash-alt',
        SOLICITACAO: 'fa-hourglass-half',
        APROVACAO: 'fa-check-circle',
        REJEICAO: 'fa-times-circle'
    };

    container.innerHTML = logs.map(log => {
        // Encontra a primeira palavra chave no tipo de ação para definir o ícone
        const acaoPrincipal = Object.keys(icones).find(key => log.acao.includes(key));
        const iconeClasse = icones[acaoPrincipal] || 'fa-info-circle';
        
        return `
        <div class="fc-log-card">
            <div class="icone">
                <i class="fas ${iconeClasse}"></i>
            </div>
            <div class="conteudo">
                <p class="detalhes">${log.detalhes}</p>
                <p class="meta">
                    Por <strong>${log.nome_usuario}</strong> em ${new Date(log.data_evento).toLocaleString('pt-BR')}
                </p>
            </div>
        </div>
        `
    }).join('');
}

function gerarPreviaLote() {
    const valorTotal = parseFloat(document.getElementById('lote_valor_total').value);
    const numParcelas = parseInt(document.getElementById('lote_num_parcelas').value);
    const primeiraData = new Date(document.getElementById('lote_data_primeira_parcela').value + 'T00:00:00');
    const intervaloValor = parseInt(document.getElementById('lote_intervalo_valor').value);
    const intervaloTipo = document.getElementById('lote_intervalo_tipo').value;
    const previaContainer = document.getElementById('lote_previa_container');

    if (isNaN(valorTotal) || isNaN(numParcelas) || !primeiraData || isNaN(intervaloValor)) {
        previaContainer.innerHTML = '';
        return null;
    }

    const valorParcela = (valorTotal / numParcelas).toFixed(2);
    let parcelas = [];
    let dataAtual = primeiraData;

    for (let i = 1; i <= numParcelas; i++) {
        parcelas.push({
            parcela: i,
            valor: valorParcela,
            data_vencimento: new Date(dataAtual)
        });

        // Calcula a próxima data
        if (intervaloTipo === 'days') dataAtual.setDate(dataAtual.getDate() + intervaloValor);
        else if (intervaloTipo === 'weeks') dataAtual.setDate(dataAtual.getDate() + (intervaloValor * 7));
        else if (intervaloTipo === 'months') dataAtual.setMonth(dataAtual.getMonth() + intervaloValor);
    }
    
    // Mostra a prévia na tela
    previaContainer.innerHTML = `
        <h4 style="margin-top:20px; margin-bottom:10px;">Pré-visualização das Parcelas:</h4>
        <div class="fc-tabela-container" style="max-height: 150px; overflow-y:auto;">
            <table class="fc-tabela-estilizada">
            ${parcelas.map(p => `<tr><td>Parcela ${p.parcela}</td><td>${p.data_vencimento.toLocaleDateString('pt-BR')}</td><td style="text-align:right;">R$ ${p.valor}</td></tr>`).join('')}
            </table>
        </div>
    `;

    return parcelas;
}

async function gerarEconfirmarLote(event) {
    event.preventDefault();
    
    // A nova função centraliza a coleta de dados de ambos os métodos
    const parcelasCalculadas = coletarDadosDoLote();
    
    if (!parcelasCalculadas || parcelasCalculadas.length === 0) {
        mostrarPopupFinanceiro('Por favor, defina as parcelas corretamente.', 'aviso');
        return;
    }
    
    // No método manual, o valor total é a soma das parcelas
    const valorTotalManual = parcelasCalculadas.reduce((acc, p) => acc + p.valor, 0);
    
    const payload = {
        descricao_lote: document.getElementById('lote_descricao').value,
        valor_total: parseFloat(document.getElementById('lote_valor_total')?.value) || valorTotalManual,
        parcelas: parcelasCalculadas.map(p => ({
            descricao: `${document.getElementById('lote_descricao').value} - Parcela ${p.parcela}/${parcelasCalculadas.length}`,
            valor: p.valor,
            data_vencimento: p.data_vencimento.toISOString().split('T')[0],
            id_categoria: parseInt(document.getElementById('lote_categoria').value),
            id_contato: parseInt(document.getElementById('lote_favorecido_id').value) || null,
            tipo: document.getElementById('lote_tipo').value
        }))
    };

    if (!payload.descricao_lote || !payload.parcelas[0].id_categoria) {
        mostrarPopupFinanceiro('Descrição e Categoria são obrigatórios para o lote.', 'aviso');
        return;
    }

    const confirmado = await mostrarPopupConfirmacao(`Você confirma o agendamento de ${payload.parcelas.length} parcelas para "${payload.descricao_lote}"?`);
    if (!confirmado) return;

    try {
        await fetchFinanceiroAPI('/contas-agendadas/lote', { method: 'POST', body: JSON.stringify(payload) });
        mostrarPopupFinanceiro('Parcelas agendadas com sucesso!', 'sucesso');
        fecharModal();
        carregarContasAgendadas();
        atualizarBadgesHeader(); // Atualiza os badges
    } catch (e) { /* erro já tratado */ }
}

// Função para adicionar uma nova linha na grade de parcelas manuais
function adicionarLinhaParcelaManual(data = '', valor = '') {
    const gradeContainer = document.getElementById('grade_parcelas_manuais');
    const div = document.createElement('div');
    div.className = 'fc-parcela-manual-linha';
    div.innerHTML = `
        <input type="date" class="fc-input parcela-data" value="${data}" required>
        <input type="number" class="fc-input parcela-valor" step="0.01" min="0.01" placeholder="100,00" value="${valor}" required>
        <button type="button" class="remover-parcela-btn" title="Remover Parcela"><i class="fas fa-trash"></i></button>
    `;
    gradeContainer.appendChild(div);
    div.querySelector('.remover-parcela-btn').addEventListener('click', () => {
        div.remove();
        atualizarResumoParcelasManuais();
    });
    // Atualiza o resumo sempre que um valor mudar
    div.querySelector('.parcela-valor').addEventListener('input', atualizarResumoParcelasManuais);
}

// Função para calcular e exibir o total das parcelas manuais
function atualizarResumoParcelasManuais() {
    const resumoContainer = document.getElementById('resumo_parcelas_manuais');
    const todasAsParcelas = document.querySelectorAll('#grade_parcelas_manuais .parcela-valor');
    let totalDistribuido = 0;
    todasAsParcelas.forEach(input => {
        totalDistribuido += parseFloat(input.value) || 0;
    });
    resumoContainer.innerHTML = `Total Distribuído: <strong>${formatCurrency(totalDistribuido)}</strong>`;
}

// Função para coletar os dados do formulário de lote
function coletarDadosDoLote() {
    const metodo = document.getElementById('lote_metodo_divisao').value;
    
    if (metodo === 'fixo') {
        return gerarPreviaLote(); // Reutiliza a função que já temos
    } else { // manual
        const linhas = document.querySelectorAll('#grade_parcelas_manuais .fc-parcela-manual-linha');
        if (linhas.length === 0) return null;
        
        let parcelasManuais = [];
        linhas.forEach((linha, index) => {
            parcelasManuais.push({
                parcela: index + 1,
                valor: parseFloat(linha.querySelector('.parcela-valor').value),
                data_vencimento: new Date(linha.querySelector('.parcela-data').value + 'T00:00:00')
            });
        });
        return parcelasManuais;
    }
}

// Variável global para armazenar a instância do gráfico e destruí-la antes de recriar
let graficoFluxoCaixaInstance = null;

async function renderizarGraficoFluxoCaixa() {
    const canvas = document.getElementById('graficoFluxoCaixa');
    const esqueleto = document.getElementById('graficoEsqueleto');
    const container = document.getElementById('graficoContainer');

    if (!canvas || !esqueleto || !container) return;

    // Garante que o esqueleto esteja visível e o canvas oculto durante a busca
    esqueleto.classList.remove('hidden');
    canvas.classList.add('hidden');

    try {
        const dadosGrafico = await fetchFinanceiroAPI('/grafico-fluxo-caixa');

        if (!dadosGrafico || dadosGrafico.length === 0) {
            container.innerHTML = `<p style="text-align:center;">Não há dados suficientes para gerar o gráfico.</p>`;
            return;
        }

        const labels = dadosGrafico.map(d => d.label_semana);
        const receitas = dadosGrafico.map(d => d.total_receitas);
        const despesas = dadosGrafico.map(d => d.total_despesas);

        if (graficoFluxoCaixaInstance) {
            graficoFluxoCaixaInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        graficoFluxoCaixaInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Receitas',
                        data: receitas,
                        backgroundColor: 'rgba(39, 174, 96, 0.7)',
                        borderColor: 'rgba(39, 174, 96, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Despesas',
                        data: despesas,
                        backgroundColor: 'rgba(231, 76, 60, 0.7)',
                        borderColor: 'rgba(231, 76, 60, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

        // Quando o gráfico está pronto, esconde o esqueleto e mostra o canvas
        esqueleto.classList.add('hidden');
        canvas.classList.remove('hidden');

    } catch(e) {
        console.error("Erro ao renderizar gráfico:", e);
        container.innerHTML = `<p style="color:red; text-align:center;">Não foi possível carregar o gráfico.</p>`;
    }
}