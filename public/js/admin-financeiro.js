// public/js/admin-financeiro.js

import { verificarAutenticacao } from '/js/utils/auth.js';
import { renderizarPaginacao } from '/js/utils/Paginacao.js';

// --- Variáveis Globais ---
let permissoesGlobaisFinanceiro = [];
let usuarioLogadoFinanceiro = null;
let contasCache = [], gruposCache = [], categoriasCache = [];
let lancamentosCache = []; // Novo cache para os lançamentos
let contasAgendadasCache = [];
let itemEmEdicao = null;
let filtrosAtivos = {};
let filtrosAgendaAtivos = {};
let fecharModalListenerRemover = () => {};

let modalBaseProps = {}; 

let legacyJsReady = false;
let reactHeaderReady = false;
const carregamentoGlobalEl = document.getElementById('carregamentoGlobal');

function esconderSpinnerGlobalSePronto() {
    if (legacyJsReady && reactHeaderReady && carregamentoGlobalEl) {
        carregamentoGlobalEl.classList.remove('visivel');
        console.log('[Carregamento] Todas as partes prontas. Spinner escondido.');
    }
}

window.addEventListener('reactHeaderReady', () => {
    console.log('[Carregamento] Sinal recebido: Header React está pronto.');
    reactHeaderReady = true;
    esconderSpinnerGlobalSePronto();
});

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

    const headers = { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache', // <<< LINHA ADICIONADA: Impede o cache
        ...options.headers 
    };
    
    try {
        const response = await fetch(`/api/financeiro${endpoint}`, { ...options, headers });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro ${response.status}` }));
            throw new Error(errorData.error || `Erro ${response.status}`);
        }
        return response.status === 204 ? null : await response.json();
    } catch (error) {
        mostrarPopupFinanceiro(error.message, 'erro');
        throw error;
    }
}

function formatarCategoriaComGrupo(categoriaId) {
    const categoria = categoriasCache.find(c => c.id == categoriaId);
    if (!categoria) return 'Categoria Inválida';

    const grupo = gruposCache.find(g => g.id == categoria.id_grupo);
    // Se o grupo não for encontrado, retorna apenas o nome da categoria.
    if (!grupo) return categoria.nome;

    return `${categoria.nome} [ ${grupo.nome} ]`;
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
                <button id="fecharModal" class="fc-modal-close">X</button>
                <h3 class="fc-section-title" style="text-align:center;">${titulo}</h3>
                
                <div class="fc-modal-body">
                    <form id="formContaBancaria">
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
                    </form>
                </div>

                <div class="fc-modal-footer">
                     <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                     <button type="submit" class="fc-btn fc-btn-primario" form="formContaBancaria">Salvar</button>
                </div>
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
    // Adiciona o atributo 'form' ao botão de submit para funcionar fora do form e captura o evento
    document.getElementById('formContaBancaria')?.addEventListener('submit', (event) => {
        event.preventDefault(); // Impede o recarregamento da página
        salvarConta(event); // Chama a função de salvar PASSANDO o evento
    });
}

function fecharModal() {
    // Encontra QUALQUER modal que esteja aberto
    const modalAberto = document.querySelector('.fc-modal');
    if (modalAberto) {
        modalAberto.remove();
    }
    itemEmEdicao = null;
}

async function salvarConta(event) {
    const form = event.target;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('.fc-btn-primario');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    const payload = {
        nome_conta: document.getElementById('nome_conta').value,
        banco: document.getElementById('banco').value,
        agencia: document.getElementById('agencia').value,
        numero_conta: document.getElementById('numero_conta').value,
    };

    try {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

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
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
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
                <button id="fecharModal" class="fc-modal-close">X</button>
                <h3 class="fc-section-title" style="text-align:center;">${titulo}</h3>

                <div class="fc-modal-body">
                    <form id="formGrupoFinanceiro">
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
                    </form>
                </div>

                <div class="fc-modal-footer">
                     <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                     <button type="submit" class="fc-btn fc-btn-primario" form="formGrupoFinanceiro">Salvar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formGrupoFinanceiro', salvarGrupo);
}

async function salvarGrupo(event) {
    event.preventDefault();
    
    const form = event.target;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('button[type="submit"]');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    const payload = {
        nome: document.getElementById('grupo_nome').value,
        tipo: document.getElementById('grupo_tipo').value,
    };

    try {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

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
        
        renderizarTabelaGrupos();
        renderizarTabelaCategoriasAgrupadas();

    } catch (error) {
        // fetchFinanceiroAPI já lida com o erro
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
}

function renderizarDashboard(saldos, alertas) {
    const saldosContainer = document.getElementById('saldosContainer');
    const alertasContainer = document.getElementById('alertasContainer');

    if (!saldosContainer || !alertasContainer) {
        console.error("Um ou mais containers do dashboard não foram encontrados.");
        return;
    }
    
    // 1. Calcula o saldo total consolidado
    const saldoTotal = saldos.reduce((acc, conta) => acc + parseFloat(conta.saldo_atual), 0);

    // 2. Gera o HTML do novo dashboard
    saldosContainer.innerHTML = `
        <!-- HERO SECTION: SALDO TOTAL -->
        <div class="fc-saldo-hero">
        <button id="btnAtualizarSaldos" class="fc-btn-atualizar fc-btn-atualizar-hero" title="Atualizar Saldos">
            <i class="fas fa-sync-alt"></i>
        </button>
        <h3 class="fc-saldo-hero-title">SALDO TOTAL CONSOLIDADO</h3>
        <h1 class="fc-saldo-hero-value">${formatCurrency(saldoTotal)}</h1>
    </div>

        <!-- LISTA DE CONTAS INTERATIVA -->
        <div class="fc-resumo-contas">
            <header class="fc-resumo-contas-header">
                <h4 class="fc-resumo-contas-title">Resumo das Contas</h4>
                <div class="fc-form-checkbox-wrapper">
                    <input type="checkbox" id="chkMostrarContasZeradas">
                    <label for="chkMostrarContasZeradas">Mostrar contas zeradas</label>
                </div>
            </header>
            <ul id="listaResumoContas" class="fc-resumo-contas-list">
                ${saldos.length > 0 ? saldos.map(conta => {
                    const saldo = parseFloat(conta.saldo_atual);
                    const isZerado = Math.abs(saldo) < 0.01;
                    // Adiciona a classe 'conta-zerada' e 'hidden' se o saldo for zero
                    return `
                    <li class="fc-resumo-contas-item ${isZerado ? 'conta-zerada hidden' : ''}">
                        <span class="conta-nome"><i class="fas fa-university"></i> ${conta.nome_conta}</span>
                        <span class="conta-saldo">${formatCurrency(saldo)}</span>
                    </li>
                    `;
                }).join('') : '<li>Nenhuma conta bancária ativa para exibir.</li>'}
            </ul>
        </div>
    `;

    // 3. A lógica para renderizar os cards de alerta continua a mesma de antes.
    alertasContainer.innerHTML = `
        <h3 class="fc-section-title" style="margin-top: 20px; border-bottom: none; text-align:center;">Alertas e Contas Próximas</h3>
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
    
    // 4. Adiciona o listener de evento para o novo checkbox
    const chkMostrarZeradas = document.getElementById('chkMostrarContasZeradas');
    chkMostrarZeradas?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('#listaResumoContas .conta-zerada').forEach(item => {
            item.classList.toggle('hidden', !isChecked);
        });
    });
}

async function atualizarSaldosDashboard() {
    const saldosContainer = document.getElementById('saldosContainer');
    if (!saldosContainer) return;

    console.log('[Dashboard] Solicitando atualização de saldos...');
    
    // 1. Mostra o spinner IMEDIATAMENTE
    saldosContainer.innerHTML = `
        <div class="fc-spinner-container">
            <div class="fc-spinner-dots">
                <div class="dot-1"></div>
                <div class="dot-2"></div>
                <div class="dot-3"></div>
            </div>
            <span class="fc-spinner-text">Atualizando saldos...</span>
        </div>
    `;

    try {
        // 2. Busca os dados da API
        const dashboardData = await fetchFinanceiroAPI('/dashboard');
        
        // 3. Renderiza o conteúdo final (substituindo o spinner)
        renderizarDashboard(dashboardData.saldos, dashboardData.alertas);
        
        console.log('[Dashboard] Saldos atualizados na tela com sucesso.');
    } catch (error) {
        // 4. Em caso de erro, substitui o spinner por uma mensagem de erro
        console.error('[Dashboard] Falha ao tentar atualizar os saldos:', error);
        saldosContainer.innerHTML = `<p style="color:red; text-align:center; padding: 40px;">Não foi possível carregar os saldos. Tente novamente.</p>`;
    }
}

function prepararAbaLancamentos() {
    // Esta função agora só prepara os dados e dispara a primeira busca.
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

    // <<< ALTERAÇÃO: Define os filtros iniciais diretamente na variável global
    filtrosAtivos = {
        dataInicio: hojeString,
        dataFim: hojeString,
    };

    // <<< ALTERAÇÃO: A chamada agora usará os filtros globais por padrão
    carregarLancamentosFiltrados(1);
}

async function carregarLancamentosFiltrados(page = 1, filtros = filtrosAtivos) {
    const tabelaContainer = document.getElementById('cardsLancamentosContainer');
    if (!tabelaContainer) return;
    tabelaContainer.innerHTML = `<div class="fc-spinner"><span>Buscando lançamentos...</span></div>`;

    filtrosAtivos.page = page; //Salva a página atual nos filtros ativos

    const limit = 8;
    const params = new URLSearchParams({ page, limit, ...filtros });
    
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
    if (!container) return;

    if (!lancamentosCache || lancamentosCache.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhum lançamento encontrado para os filtros selecionados.</p>';
        return;
    }

    const idsTransferenciaRenderizados = new Set();
    let htmlFinal = '';

    for (const l of lancamentosCache) {
        if (idsTransferenciaRenderizados.has(l.id)) continue;
        
        const isTransferencia = l.nome_categoria === 'Transferência entre Contas' && l.id_transferencia_vinculada;
        if (isTransferencia) {
            const par = lancamentosCache.find(p => p.id === l.id_transferencia_vinculada);
            if (par) {
                idsTransferenciaRenderizados.add(l.id);
                idsTransferenciaRenderizados.add(par.id);
                const lancamentoOrigem = l.tipo === 'DESPESA' ? l : par;
                const lancamentoDestino = l.tipo === 'RECEITA' ? l : par;
                htmlFinal += `
                <div class="fc-lancamento-card-wrapper">
                    <div class="fc-lancamento-card transferencia">
                        <div class="header">
                            <div class="descricao-wrapper">
                                <span class="lancamento-id">#${lancamentoOrigem.id} / #${lancamentoDestino.id}</span>
                                <span class="descricao">${l.descricao.split('.')[0] || 'Transferência entre Contas'}</span>
                            </div>
                            <span class="valor">${formatCurrency(l.valor)}</span>
                        </div>
                        <div class="details transferencia-details">
                            <span class="detail-item de"><strong>DE:</strong> <i class="fas fa-university"></i> ${lancamentoOrigem.nome_conta}</span>
                            <i class="fas fa-long-arrow-alt-right arrow"></i>
                            <span class="detail-item para"><strong>PARA:</strong> <i class="fas fa-university"></i> ${lancamentoDestino.nome_conta}</span>
                            <span class="detail-item data"><i class="fas fa-calendar-day"></i> ${new Date(l.data_transacao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                        </div>
                        <div class="actions">
                            <span class="detail-item" style="grid-area: status; align-self: end; font-size: 0.8rem; color: #6c757d;"><i class="fas fa-user-tie"></i> ${l.nome_usuario}</span>
                        </div>
                    </div>
                </div>`;
                continue;
            }
        }
        
        const isDetalhado = l.itens && l.itens.length > 0;
        let categoriaExibida = l.nome_categoria || 'Sem Categoria';
        if (isDetalhado) {
            if (l.tipo_rateio === 'COMPRA') categoriaExibida = 'Compra Detalhada';
            else if (l.tipo_rateio === 'DETALHADO') categoriaExibida = `Rateio: ${l.nome_categoria}`;
            else categoriaExibida = 'Rateio (Genérico)';
        }

        const dataHoraCriacao = new Date(l.data_lancamento).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const tipoClasse = l.tipo ? l.tipo.toLowerCase() : '';
        const isPendente = l.status_edicao?.startsWith('PENDENTE');
        const classePendente = isPendente ? 'pendente' : '';

        // --- GERA O HTML DA ÁREA EXPANSÍVEL ---
        // --- GERA O HTML DA ÁREA EXPANSÍVEL ---
        let detalhesHtml = '';
        if (isDetalhado) {
            let headerColsHtml = '';
            let itemRows = '';
            let gridTemplateCols = '';

            if (l.tipo_rateio === 'COMPRA') {
                // Cabeçalho para Compra Detalhada
                headerColsHtml = `
                    <div>Info.</div>
                    <div>Qtd</div>
                    <div>V. Unit.</div>
                    <div>V. Total</div>
                    <div>Categoria</div>
                `;
                // Grid para Compra Detalhada
                gridTemplateCols = 'grid-template-columns: minmax(0, 2fr) 0.5fr 1fr 1fr 1.5fr;';
                
                // Linhas para Compra Detalhada
                itemRows = l.itens.map(item => `
                    <div class="item-detalhe-row" style="${gridTemplateCols}">
                        <div data-label="Info.">${item.descricao_item || '-'}</div>
                        <div data-label="Qtd" style="text-align: center;">${item.quantidade}</div>
                        <div data-label="V. Unit.">${formatCurrency(item.valor_unitario)}</div>
                        <div data-label="V. Total"><strong>${formatCurrency(item.valor_total_item)}</strong></div>
                        <div data-label="Categoria">${item.nome_categoria || '-'}</div>
                    </div>
                `).join('');

            } else { // Para 'DETALHADO' ou outros tipos de rateio
                // Cabeçalho para Rateio
                headerColsHtml = `
                    <div>Favorecido</div>
                    <div>Categoria</div>
                    <div>Descrição</div>
                    <div>Valor</div>
                `;
                // Grid para Rateio
                gridTemplateCols = 'grid-template-columns: 1.5fr 1.5fr 1.5fr 1fr;';

                // Linhas para Rateio
                itemRows = l.itens.map(item => `
                    <div class="item-detalhe-row" style="${gridTemplateCols}">
                        <div data-label="Favorecido">${item.nome_contato_item || '-'}</div>
                        <div data-label="Categoria">${item.nome_categoria || '-'}</div>
                        <div data-label="Descrição">${item.descricao_item || '-'}</div>
                        <div data-label="Valor"><strong>${formatCurrency(item.valor_total_item)}</strong></div>
                    </div>
                `).join('');
            }

            detalhesHtml = `
                <div class="fc-lancamento-itens-container hidden" id="itens-${l.id}">
                    <div class="item-detalhe-grid">
                        <div class="item-detalhe-header" style="${gridTemplateCols}">
                           ${headerColsHtml}
                        </div>
                        ${itemRows}
                    </div>
                </div>`;
        }


        // Garante que temos um valor padrão para o tipo de rateio
        const tipoRateio = l.tipo_rateio || 'COMPRA';

        htmlFinal += `
            <div class="fc-lancamento-card-wrapper">
                <div class="fc-lancamento-card ${tipoClasse} ${classePendente}" ${isDetalhado ? `data-rateio-tipo="${tipoRateio}"` : ''}>

                    
                    <div class="card-main-line">
                        <div class="main-info">
                            <span class="lancamento-id">#${l.id}</span>
                            <span class="descricao">${l.descricao || 'Lançamento sem descrição'}</span>
                        </div>
                        <span class="valor">${l.tipo === 'RECEITA' ? '+' : '-'} ${formatCurrency(l.valor)}</span>
                    </div>

                    <div class="card-details">
                        <span class="detail-item"><i class="fas fa-user-friends"></i><b>Favorecido:</b> ${l.nome_favorecido || '-'}</span>
                        <span class="detail-item"><i class="fas fa-tag"></i><b>Categoria:</b> ${categoriaExibida}</span>
                        <span class="detail-item"><i class="fas fa-university"></i><b>Conta:</b> ${l.nome_conta}</span>
                        <span class="detail-item"><i class="fas fa-calendar-day"></i><b>Data Trans.:</b> ${new Date(l.data_transacao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                        
                        ${/* Lógica para mostrar o desconto APENAS se ele existir */ ''}
                        ${l.valor_desconto > 0 ? `
                            <span class="detail-item" style="color: var(--fc-cor-receita);"><i class="fas fa-percent"></i><b>Desconto:</b> - ${formatCurrency(l.valor_desconto)}</span>
                        ` : ''}
                    </div>

                    <div class="card-meta-line">
                        <div class="meta-info">
                            <span class="detail-item"><i class="fas fa-user-tie"></i><b>Criado por:</b> ${l.nome_usuario || 'N/A'}</span>
                            <span class="detail-item"><i class="fas fa-clock"></i><b>Em:</b> ${dataHoraCriacao}</span>
                        </div>

                         <div class="actions">
                            ${isDetalhado ? `<button class="fc-btn-icon btn-toggle-details" data-id="${l.id}" title="Ver Detalhes"><i class="fas fa-chevron-down"></i></button>` : ''}
                            
                            ${
                                // Se o lançamento FOR um estorno...
                                l.id_estorno_de ? 
                                // ...mostra o botão de REVERTER (se tiver permissão)
                                (permissoesGlobaisFinanceiro.includes('estornar-transacao') ? `
                                    <button 
                                        class="fc-btn-icon btn-reverter-estorno" 
                                        data-id="${l.id}" 
                                        title="Reverter Estorno" 
                                        style="color: var(--fc-cor-despesa);"
                                        ${l.status_edicao === 'PENDENTE_APROVACAO' ? 'disabled' : ''} 
                                    >
                                        <i class="fas fa-history"></i>
                                    </button>
                                ` : '')
                                
                                // Se NÃO for um estorno...
                                : 
                                `
                                ${l.tipo === 'DESPESA' && l.status_edicao !== 'ESTORNADO' && permissoesGlobaisFinanceiro.includes('estornar-transacao') ? `
                                    <button 
                                        class="fc-btn-icon btn-registrar-estorno" 
                                        data-id="${l.id}" 
                                        title="Registrar Estorno" 
                                        style="color: var(--fc-cor-receita);"
                                        ${l.status_edicao === 'PENDENTE_APROVACAO' ? 'disabled' : ''}
                                    >
                                        <i class="fas fa-undo-alt"></i>
                                    </button>
                                ` : ''}
                                
                                <button 
                                    class="fc-btn-icon btn-editar-lancamento" 
                                    data-id="${l.id}" 
                                    title="Editar" 
                                    ${l.status_edicao === 'PENDENTE_APROVACAO' || l.status_edicao === 'PENDENTE_EXCLUSAO' || l.status_edicao === 'ESTORNADO' ? 'disabled' : ''}
                                >
                                    <i class="fas fa-pencil-alt"></i>
                                </button>

                                <button 
                                    class="fc-btn-icon btn-excluir-lancamento" 
                                    data-id="${l.id}" 
                                    title="Excluir" 
                                    ${l.status_edicao === 'PENDENTE_APROVACAO' || l.status_edicao === 'PENDENTE_EXCLUSAO' || l.status_edicao === 'ESTORNADO' ? 'disabled' : ''}
                                >
                                    <i class="fas fa-trash"></i>
                                </button>
                                `
                            }
                        </div>

                    </div>
                </div>
                ${detalhesHtml}
            </div>
        `;
    }
    
    container.innerHTML = htmlFinal;

    container.querySelectorAll('.btn-toggle-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            document.getElementById(`itens-${id}`).classList.toggle('hidden');
            const icon = e.currentTarget.querySelector('i');
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        });
    });

    const podeEditar = permissoesGlobaisFinanceiro.includes('editar-transacao');
    container.querySelectorAll('.btn-editar-lancamento').forEach(btn => {
        if (!btn.disabled) {
            if (podeEditar) {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    const lancamento = lancamentosCache.find(l => l.id == id);
                    if (lancamento) {
                        if (window.renderReactModal) {
                            window.renderReactModal({
                                ...modalBaseProps,
                                isOpen: true,
                                onClose: () => window.renderReactModal({ ...modalBaseProps, isOpen: false }),
                                lancamentoParaEditar: lancamento
                            });
                        }
                    }
                });
            } else {
                btn.classList.add('fc-btn-disabled');
                btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para editar lançamentos.', 'aviso'));
            }
        }
    });

    container.querySelectorAll('.btn-excluir-lancamento').forEach(btn => {
        if (!btn.disabled) {
            if (podeEditar) {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    solicitarExclusaoLancamento(id);
                });
            } else {
                btn.classList.add('fc-btn-disabled');
                btn.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para excluir lançamentos.', 'aviso'));
            }
        }
    });

    container.querySelectorAll('.btn-registrar-estorno').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const lancamento = lancamentosCache.find(l => l.id == id);
            if (lancamento) {
                abrirModalEstorno(lancamento);
            }
        });
    });

    container.querySelectorAll('.btn-reverter-estorno').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            reverterEstorno(id);
        });
    });
}

async function reverterEstorno(idLancamentoEstorno) {
    const confirmado = await mostrarPopupConfirmacao(
        "Tem certeza que deseja reverter este estorno? A receita será excluída e o lançamento original voltará ao normal."
    );
    if (!confirmado) return;

    try {
        const response = await fetchFinanceiroAPI(`/lancamentos/${idLancamentoEstorno}/reverter-estorno`, {
            method: 'POST'
        });
        mostrarPopupFinanceiro(response.message, 'sucesso');
        carregarLancamentosFiltrados(filtrosAtivos.page || 1);
        atualizarSaldosDashboard();
    } catch (error) {
        // fetchFinanceiroAPI já trata o erro
    }
}

function renderizarPaginacaoLancamentos(totalPages, currentPage) {
    const container = document.getElementById('paginacaoLancamentosContainer');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    // Novo HTML com o campo de input
    container.innerHTML = `
        <button class="fc-btn fc-btn-outline" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>
        <span class="pagination-current">
            Pág. 
            <input type="number" id="inputIrParaPagina" class="fc-input-paginacao" value="${currentPage}" min="1" max="${totalPages}" title="Pressione Enter para ir"> 
            de ${totalPages}
        </span>
        <button class="fc-btn fc-btn-outline" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Próximo</button>
    `;

    // Listener para os botões "Anterior" e "Próximo"
    container.querySelectorAll('.fc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = e.currentTarget.dataset.page;
            carregarLancamentosFiltrados(parseInt(page), filtrosAtivos); // Passa os filtros também
        });
    });

    // Listener para o novo campo de input
    const inputPagina = document.getElementById('inputIrParaPagina');
    inputPagina.addEventListener('keydown', (e) => {
        // Verifica se a tecla pressionada foi "Enter"
        if (e.key === 'Enter') {
            e.preventDefault(); // Impede o comportamento padrão do Enter em formulários

            let paginaDesejada = parseInt(inputPagina.value, 10);

            // Validação: Garante que a página é um número válido e está dentro dos limites
            if (isNaN(paginaDesejada) || paginaDesejada < 1) {
                paginaDesejada = 1;
            } else if (paginaDesejada > totalPages) {
                paginaDesejada = totalPages;
            }

            // Atualiza o valor no campo (caso tenha sido corrigido) e carrega os dados
            inputPagina.value = paginaDesejada;
            carregarLancamentosFiltrados(paginaDesejada, filtrosAtivos);
        }
    });

    // Opcional: Listener para 'blur' (quando o usuário clica fora do campo)
    // Se o valor for inválido, ele volta para a página atual.
    inputPagina.addEventListener('blur', () => {
        if (parseInt(inputPagina.value, 10) !== currentPage) {
            inputPagina.value = currentPage;
        }
    });
}

// Renderiza a paginação para a aba Agenda 
function renderizarPaginacaoAgenda(totalPages, currentPage) {
    const container = document.getElementById('paginacaoAgendaContainer');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    container.innerHTML = `
        <button class="fc-btn fc-btn-outline" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>
        <span class="pagination-current">
            Pág. 
            <input type="number" id="inputIrParaPaginaAgenda" class="fc-input-paginacao" value="${currentPage}" min="1" max="${totalPages}" title="Pressione Enter para ir"> 
            de ${totalPages}
        </span>
        <button class="fc-btn fc-btn-outline" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Próximo</button>
    `;

    // Listener para os botões "Anterior" e "Próximo"
    container.querySelectorAll('.fc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = e.currentTarget.dataset.page;
            carregarContasAgendadas(parseInt(page));
        });
    });

    // Listener para o campo de input
    const inputPagina = document.getElementById('inputIrParaPaginaAgenda');
    inputPagina.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            let paginaDesejada = parseInt(inputPagina.value, 10);
            if (isNaN(paginaDesejada) || paginaDesejada < 1) paginaDesejada = 1;
            else if (paginaDesejada > totalPages) paginaDesejada = totalPages;
            inputPagina.value = paginaDesejada;
            carregarContasAgendadas(paginaDesejada);
        }
    });

    inputPagina.addEventListener('blur', () => {
        if (parseInt(inputPagina.value, 10) !== currentPage) {
            inputPagina.value = currentPage;
        }
    });
}

function abrirModalLancamento(lancamento = null) {
    // 1. Define o estado de edição e o título corretamente.
    itemEmEdicao = lancamento;
    const isEditMode = !!itemEmEdicao;
    const titulo = isEditMode ? "Editar Lançamento" : "Novo Lançamento";
    
    // 2. Cria o HTML do modal.
    const modalHTML = `
        <div id="modal-lancamento" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close"><i class="fas fa-times"></i></button>
                <h3 class="fc-section-title" style="text-align:center; border:0;">${titulo}</h3>
                <div class="fc-modal-body">
                    <div class="fc-form-group">
                        <label>Qual o tipo de lançamento?</label>
                        <div class="fc-segmented-control" ${isEditMode ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                            <button class="fc-segment-btn" data-form-id="formLancamentoSimples">Simples</button>
                            <button class="fc-segment-btn" data-form-id="formCompraDetalhada">Compra Detalhada</button>
                            <button class="fc-segment-btn" data-form-id="formRateioDetalhado">Rateio Detalhado</button>
                        </div>
                    </div>
                    <form id="formLancamentoSimples" class="hidden"></form>
                    <form id="formCompraDetalhada" class="hidden"></form>
                    <form id="formRateioDetalhado" class="hidden"></form>
                </div>
                <div class="fc-modal-footer">
                    <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                    <button type="button" id="btnSalvarModal" class="fc-btn fc-btn-primario">${isEditMode ? 'Salvar Alterações' : 'Salvar Lançamento'}</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modalElement = document.getElementById('modal-lancamento');
    const formSimples = document.getElementById('formLancamentoSimples');
    const formCompra = document.getElementById('formCompraDetalhada');
    const formRateio = document.getElementById('formRateioDetalhado');
    const btnSalvar = document.getElementById('btnSalvarModal');
    const btnAbas = modalElement.querySelectorAll('.fc-segment-btn');

    // Função interna para ativar a aba correta
    const ativarAba = (formId) => {
        btnAbas.forEach(btn => {
            const isActive = btn.dataset.formId === formId;
            btn.classList.toggle('active', isActive);
            const formParaAlterar = document.getElementById(btn.dataset.formId);
            if (formParaAlterar) formParaAlterar.classList.toggle('hidden', !isActive);
        });
        btnSalvar.setAttribute('form', formId);
    };

    // 3. Lógica de preenchimento
    if (isEditMode) {
        const isDetalhado = itemEmEdicao.itens && itemEmEdicao.itens.length > 0;
        if (isDetalhado) {
            const tipoRateio = itemEmEdicao.tipo_rateio || 'COMPRA';
            const formId = tipoRateio === 'COMPRA' ? 'formCompraDetalhada' : 'formRateioDetalhado';
            ativarAba(formId);
            const formElement = document.getElementById(formId);
            if (tipoRateio === 'COMPRA') popularFormularioCompraDetalhada(formElement, itemEmEdicao);
            else popularFormularioRateioDetalhado(formElement, itemEmEdicao);
            
            const gradeContainer = formElement.querySelector('.grade-itens-rateio');
            gradeContainer.innerHTML = '';
            itemEmEdicao.itens.forEach(item => {
                if (tipoRateio === 'COMPRA') adicionarLinhaItemCompra(gradeContainer, item);
                else adicionarLinhaRateioDetalhado(gradeContainer, item);
            });
            atualizarResumoRateio(formElement);
            if (itemEmEdicao.id_contato) setAutocompleteStatus(formElement.querySelector('.fc-autocomplete-input'), 'success');
        } else {
            ativarAba('formLancamentoSimples');
            popularFormularioSimples(formSimples, itemEmEdicao);
        }
    } else { // Modo de criação
        ativarAba('formLancamentoSimples');
        popularFormularioSimples(formSimples);
        popularFormularioCompraDetalhada(formCompra);
        popularFormularioRateioDetalhado(formRateio);
    }

    // 4. Configura os listeners
    modalElement.querySelector('.fc-modal-close').addEventListener('click', fecharModal);
    modalElement.querySelector('#btnCancelarModal').addEventListener('click', fecharModal);
    
    formSimples.addEventListener('submit', salvarLancamento);
    formCompra.addEventListener('submit', (e) => salvarCompraDetalhada(e));
    formRateio.addEventListener('submit', (e) => salvarRateioDetalhado(e));

    btnSalvar.addEventListener('click', () => {
        document.getElementById(btnSalvar.getAttribute('form'))?.requestSubmit();
    });

    if (!isEditMode) {
        btnAbas.forEach(btn => btn.addEventListener('click', () => {
            const formId = btn.dataset.formId;
            ativarAba(formId);
            if(formId === 'formLancamentoSimples') btnSalvar.textContent = 'Salvar Lançamento';
            else if(formId === 'formCompraDetalhada') btnSalvar.textContent = 'Salvar Compra';
            else btnSalvar.textContent = 'Salvar Rateio';
        }));
    }
}

// Preenche e gerencia o formulário de lançamento simples
function popularFormularioSimples(formContainer, lancamento = null) {
    if (!formContainer) return;
    const hoje = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    // Se estamos editando, descobrimos o tipo (RECEITA/DESPESA) a partir da categoria
    let tipoOriginal = '';
    if (lancamento) {
        const categoriaDoLancamento = categoriasCache.find(c => c.id === lancamento.id_categoria);
        if (categoriaDoLancamento) {
            const grupoPai = gruposCache.find(g => g.id === categoriaDoLancamento.id_grupo);
            if (grupoPai) tipoOriginal = grupoPai.tipo;
        }
    }
    
    // Gera o HTML do formulário
    formContainer.innerHTML = `
        <div class="fc-form-row">
            <div class="fc-form-group">
                <label for="lanc_valor">Valor (R$)*</label>
                <input type="number" id="lanc_valor" class="fc-input fc-input-valor" step="0.01" min="0.01" required value="${lancamento?.valor || ''}">
            </div>
            <div class="fc-form-group">
                <label for="lanc_data">Data da Transação*</label>
                <input type="date" id="lanc_data" class="fc-input fc-input-data" required value="${lancamento ? lancamento.data_transacao.split('T')[0] : hoje}">
            </div>
        </div>
        <div class="fc-form-row">
            <div class="fc-form-group">
                <label for="lanc_tipo">Tipo*</label>
                <select id="lanc_tipo" class="fc-select" required ${lancamento ? 'disabled' : ''}>
                    <option value="">Selecione...</option>
                    <option value="RECEITA" ${tipoOriginal === 'RECEITA' ? 'selected' : ''}>Receita</option>
                    <option value="DESPESA" ${tipoOriginal === 'DESPESA' ? 'selected' : ''}>Despesa</option>
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
                ${contasCache.map(c => `<option value="${c.id}" ${lancamento?.id_conta_bancaria == c.id ? 'selected' : ''}>${c.nome_conta}</option>`).join('')}
            </select>
        </div>
        <div class="fc-form-group">
            <label for="lanc_contato_busca" id="label-contato-simples">Favorecido / Pagador</label>
            <div class="fc-autocomplete-container">
                <input type="text" id="lanc_contato_busca" class="fc-input fc-autocomplete-input" placeholder="Digite para buscar..." autocomplete="off" value="${lancamento?.nome_favorecido || ''}">
                <span class="fc-autocomplete-status-icon"></span>
                <div id="lanc_contato_resultados" class="fc-autocomplete-results hidden"></div>
                <input type="hidden" id="lanc_contato_id" class="fc-autocomplete-id" value="${lancamento?.id_contato || ''}">
            </div>
        </div>
        <div class="fc-form-group">
            <label for="lanc_descricao">Descrição / Histórico</label>
            <textarea id="lanc_descricao" class="fc-input" rows="2">${lancamento?.descricao || ''}</textarea>
        </div>
    `;

    const tipoSelect = formContainer.querySelector('#lanc_tipo');
    const categoriaSelect = formContainer.querySelector('#lanc_categoria');
    const labelContato = formContainer.querySelector('#label-contato-simples');

    // Essa função interna continua perfeita
    const atualizarCamposPorTipo = (tipo) => {
        if (!tipo) {
            categoriaSelect.innerHTML = '<option value="">Selecione o tipo</option>';
            if(labelContato) labelContato.textContent = 'Favorecido / Pagador';
            return;
        }
        if(labelContato) labelContato.textContent = tipo === 'RECEITA' ? 'Pagador / Cliente' : 'Favorecido';
        
        const categoriasFiltradas = categoriasCache.filter(c => gruposCache.find(g => g.id === c.id_grupo)?.tipo === tipo);

        const categoriasAgrupadas = categoriasFiltradas.reduce((acc, categoria) => {
            const idGrupo = categoria.id_grupo;
            if (!acc[idGrupo]) { acc[idGrupo] = []; }
            acc[idGrupo].push(categoria);
            return acc;
        }, {});

        let optionsHTML = '<option value="">Selecione...</option>';
        for (const idGrupo in categoriasAgrupadas) {
            const grupo = gruposCache.find(g => g.id == idGrupo);
            optionsHTML += `<optgroup label="${grupo ? grupo.nome : 'Sem Grupo'}">`;
            categoriasAgrupadas[idGrupo].forEach(categoria => {
                optionsHTML += `<option value="${categoria.id}">${categoria.nome} [ ${grupo ? grupo.nome : ''} ]</option>`;
            });
            optionsHTML += `</optgroup>`;
        }
        categoriaSelect.innerHTML = optionsHTML;
    };

    tipoSelect.addEventListener('change', (e) => atualizarCamposPorTipo(e.target.value));
    
    // Dispara a função para popular as categorias com base no tipo do lançamento
    atualizarCamposPorTipo(tipoSelect.value);

    // Se for uma edição, seleciona a categoria correta após as opções serem carregadas
    if (lancamento) {
        categoriaSelect.value = lancamento.id_categoria;
    }
}

function abrirModalEstorno(lancamento) {
    itemEmEdicao = lancamento; // Guarda o lançamento original
    const hoje = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    const modalHTML = `
        <div id="modal-estorno" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button class="fc-modal-close"><i class="fas fa-times"></i></button>
                <h3 class="fc-section-title" style="text-align:center; border:0;">Registrar Estorno</h3>
                <p style="text-align:center; margin-top:-15px; margin-bottom:20px;">
                    Para o lançamento #${lancamento.id}: "<strong>${lancamento.descricao || 'sem descrição'}</strong>"
                </p>
                
                <div class="fc-modal-body">
                    <form id="formEstorno">
                        <div class="fc-form-group">
                            <label for="estorno_valor">Valor Estornado (R$)*</label>
                            <input type="number" id="estorno_valor" class="fc-input" step="0.01" min="0.01" required value="${lancamento.valor}">
                        </div>
                        <div class="fc-form-group">
                            <label for="estorno_data">Data do Recebimento do Estorno*</label>
                            <input type="date" id="estorno_data" class="fc-input" required value="${hoje}">
                        </div>
                        <div class="fc-form-group">
                            <label for="estorno_conta">Conta Bancária que Recebeu o Estorno*</label>
                            <select id="estorno_conta" class="fc-select" required>
                                <option value="">Selecione a conta...</option>
                                ${contasCache.map(c => `<option value="${c.id}" ${lancamento.id_conta_bancaria == c.id ? 'selected' : ''}>${c.nome_conta}</option>`).join('')}
                            </select>
                        </div>
                    </form>
                </div>
                <div class="fc-modal-footer">
                    <button id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                    <button id="btnSalvarEstorno" class="fc-btn fc-btn-primario">Confirmar Estorno</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Listeners
    const modalElement = document.getElementById('modal-estorno');
    modalElement.querySelector('.fc-modal-close').addEventListener('click', fecharModal);
    modalElement.querySelector('#btnCancelarModal').addEventListener('click', fecharModal);
    modalElement.querySelector('#btnSalvarEstorno').addEventListener('click', () => {
        // Dispara o submit do form para manter o padrão
        document.getElementById('formEstorno').requestSubmit();
    });
    document.getElementById('formEstorno').addEventListener('submit', salvarEstorno);
}

async function salvarEstorno(event) {
    event.preventDefault();
    const btnSalvar = document.getElementById('btnSalvarEstorno');
    if (!btnSalvar || !itemEmEdicao) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    const payload = {
        valor_estornado: parseFloat(document.getElementById('estorno_valor').value),
        data_transacao: document.getElementById('estorno_data').value,
        id_conta_bancaria: parseInt(document.getElementById('estorno_conta').value),
    };

    if (!payload.valor_estornado || !payload.data_transacao || !payload.id_conta_bancaria) {
        mostrarPopupFinanceiro('Por favor, preencha todos os campos.', 'aviso');
        return;
    }

     try {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

        // 1. Capturamos a resposta da API em uma variável
        const response = await fetchFinanceiroAPI(`/lancamentos/${itemEmEdicao.id}/estornar`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // 2. Usamos a mensagem que vem da resposta da API
        mostrarPopupFinanceiro(response.message, 'sucesso');
        fecharModal();
        
        // 3. Atualizamos os badges (importante para o usuário ver a notificação)
        atualizarBadgesHeader();
        carregarLancamentosFiltrados(filtrosAtivos.page || 1);
        atualizarSaldosDashboard();

    } catch (error) {
        // O fetchFinanceiroAPI já trata o popup de erro, então não precisamos fazer nada aqui.
        console.error("Erro ao salvar estorno:", error);
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
}

// Função para popular o formulário de Agendamento Simples
function popularFormularioAgendamentoSimples(formContainer, agendamento = null) {
    if (!formContainer) return;
    const hoje = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    formContainer.innerHTML = `
        <div class="fc-form-group">
            <label for="ag_tipo">Tipo de Agendamento*</label>
            <select id="ag_tipo" class="fc-select" required>
                <option value="">Selecione...</option>
                <option value="A_PAGAR" ${agendamento?.tipo === 'A_PAGAR' ? 'selected' : ''}>A Pagar</option>
                <option value="A_RECEBER" ${agendamento?.tipo === 'A_RECEBER' ? 'selected' : ''}>A Receber</option>
            </select>
        </div>
        <div class="fc-form-group">
            <label for="ag_descricao">Descrição*</label>
            <input type="text" id="ag_descricao" class="fc-input" required value="${agendamento?.descricao || ''}">
        </div>
        <div class="fc-form-group">
            <label for="ag_valor">Valor (R$)*</label>
            <input type="number" id="ag_valor" class="fc-input" step="0.01" min="0.01" required value="${agendamento?.valor || ''}">
        </div>
        <div class="fc-form-group">
            <label for="ag_vencimento">Data de Vencimento*</label>
            <input type="date" id="ag_vencimento" class="fc-input" required value="${agendamento ? agendamento.data_vencimento.split('T')[0] : hoje}">
        </div>
        <div class="fc-form-group">
            <label for="ag_categoria">Categoria*</label>
            <select id="ag_categoria" class="fc-select" required><option value="">Selecione o tipo</option></select>
        </div>
        <div class="fc-form-group">
            <label for="ag_contato_busca">Favorecido / Pagador</label>
            <div class="fc-autocomplete-container">
                <input type="text" id="ag_contato_busca" class="fc-input fc-autocomplete-input" placeholder="Digite para buscar..." value="${agendamento?.nome_favorecido || ''}" autocomplete="off">
                <span class="fc-autocomplete-status-icon"></span>
                <div id="ag_contato_resultados" class="fc-autocomplete-results hidden"></div>
                <input type="hidden" id="ag_contato_id" class="fc-autocomplete-id" value="${agendamento?.id_contato || ''}">
            </div>
        </div>
    `;

    const tipoSelect = document.getElementById('ag_tipo');
    const categoriaSelect = document.getElementById('ag_categoria');

    const atualizarCategorias = (tipoSelecionado) => {
        const tipoGrupo = tipoSelecionado === 'A_PAGAR' ? 'DESPESA' : 'RECEITA';
        const categoriasFiltradas = categoriasCache.filter(c => gruposCache.find(g => g.id === c.id_grupo)?.tipo === tipoGrupo);
        const categoriasAgrupadas = categoriasFiltradas.reduce((acc, cat) => { (acc[cat.id_grupo] = acc[cat.id_grupo] || []).push(cat); return acc; }, {});
        let optionsHTML = '<option value="">Selecione...</option>';
        for (const idGrupo in categoriasAgrupadas) {
            const grupo = gruposCache.find(g => g.id == idGrupo);
            optionsHTML += `<optgroup label="${grupo.nome}">`;
            categoriasAgrupadas[idGrupo].forEach(categoria => {
                const isSelected = agendamento && agendamento.id_categoria == categoria.id ? 'selected' : '';
                optionsHTML += `<option value="${categoria.id}" ${isSelected}>${categoria.nome} [ ${grupo.nome} ]</option>`;
            });
            optionsHTML += `</optgroup>`;
        }
        categoriaSelect.innerHTML = optionsHTML;
    };

    tipoSelect.addEventListener('change', (e) => atualizarCategorias(e.target.value));
    if (agendamento?.tipo) {
        atualizarCategorias(agendamento.tipo);
    }
}


// Preenche e gerencia o formulário de compra detalhada
function popularFormularioCompraDetalhada(formContainer, lancamento = null, isAgendamento = false) {
    if (!formContainer) return;
    
    const hoje = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const prefixo = formContainer.id;
    
    // 1. O HTML é atualizado com o campo de desconto e novos cabeçalhos da grade
    formContainer.innerHTML = `
        <div class="fc-form-row">
            <div class="fc-form-group"><label for="${prefixo}_data">Data da Compra*</label><input type="date" id="${prefixo}_data" class="fc-input" value="${lancamento ? lancamento.data_transacao.split('T')[0] : hoje}" required></div>
            <div class="fc-form-group"><label for="${prefixo}_conta">Conta Bancária*</label><select id="${prefixo}_conta" class="fc-select" required>${'<option value="">Selecione...</option>' + contasCache.map(c => `<option value="${c.id}" ${lancamento?.id_conta_bancaria == c.id ? 'selected' : ''}>${c.nome_conta}</option>`).join('')}</select></div>
        </div>
        <div class="fc-form-row">
            <div class="fc-form-group" style="flex:2;"><label for="${prefixo}_favorecido_busca">Fornecedor*</label><div class="fc-autocomplete-container"><input type="text" id="${prefixo}_favorecido_busca" class="fc-input fc-autocomplete-input" placeholder="Buscar..." value="${lancamento?.nome_favorecido || ''}" autocomplete="off" required><span class="fc-autocomplete-status-icon"></span><div id="${prefixo}_favorecido_resultados" class="fc-autocomplete-results hidden"></div><input type="hidden" id="${prefixo}_favorecido_id" class="fc-autocomplete-id" value="${lancamento?.id_contato || ''}"></div></div>
            <div class="fc-form-group" style="flex:1;"><label for="${prefixo}_valor_desconto">Desconto (R$)</label><input type="number" id="${prefixo}_valor_desconto" class="fc-input" step="0.01" min="0" value="${lancamento?.valor_desconto || '0.00'}"></div>
        </div>
        <div class="fc-form-group"><label for="${prefixo}_descricao">Descrição Geral (Ex: Nota Fiscal 1234)*</label><input type="text" id="${prefixo}_descricao" class="fc-input" required value="${lancamento?.descricao || ''}"></div>
        <hr style="margin: 20px 0;"><h4 class="fc-section-title" style="font-size: 1.1rem; border:0; margin-bottom: 10px;">Itens da Compra</h4>
        
        <div class="fc-rateio-header" style="grid-template-columns: minmax(0, 2fr) 90px 110px 110px minmax(0, 1fr) 40px;">
            <span>Produto</span><span>Qtd</span><span>V. Unitário</span><span>V. Total</span><span>Categoria*</span><span>Ação</span>
        </div>

        <div id="${prefixo}_grade_itens" class="grade-itens-rateio"></div>
        <button type="button" class="fc-btn fc-btn-outline btn-adicionar-item-rateio" style="margin-top: 10px;"><i class="fas fa-plus"></i> Add Item</button>
        <div id="${prefixo}_resumo_rateio" class="resumo-rateio" style="text-align: right; margin-top: 10px; font-weight: bold;"></div>
    `;

    // O resto da lógica da função (listeners) permanece
    const gradeContainer = formContainer.querySelector(`#${prefixo}_grade_itens`);
    if (!lancamento) {
        adicionarLinhaItemCompra(gradeContainer);
    }
    
    // 2. Adicionamos um listener para o novo campo de desconto
    formContainer.querySelector(`#${prefixo}_valor_desconto`).addEventListener('input', () => atualizarResumoRateio(formContainer));
    formContainer.querySelector('.btn-adicionar-item-rateio').addEventListener('click', () => adicionarLinhaItemCompra(gradeContainer));
}

// Função ajustada para receber 'lancamento' e preencher os campos
function popularFormularioRateioDetalhado(formContainer, agendamento = null, isAgendamento = false) {
    if (!formContainer) return;
    const dataLabel = isAgendamento ? 'Data de Vencimento*' : 'Data do Pagamento*';
    const hoje = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const prefixo = formContainer.id;
    const categoriasDespesa = categoriasCache.filter(c => gruposCache.find(g => g.id === c.id_grupo)?.tipo === 'DESPESA');
    const categoriasAgrupadas = categoriasDespesa.reduce((acc, cat) => { (acc[cat.id_grupo] = acc[cat.id_grupo] || []).push(cat); return acc; }, {});
    let optionsCategoria = '<option value="">Selecione...</option>';
    for (const idGrupo in categoriasAgrupadas) {
        const grupo = gruposCache.find(g => g.id == idGrupo);
        optionsCategoria += `<optgroup label="${grupo.nome}">`;
        categoriasAgrupadas[idGrupo].forEach(categoria => {
            const isSelected = agendamento && agendamento.id_categoria == categoria.id ? 'selected' : '';
            optionsCategoria += `<option value="${categoria.id}" ${isSelected}>${categoria.nome} [ ${grupo.nome} ]</option>`;
        });
        optionsCategoria += `</optgroup>`;
    }
    formContainer.innerHTML = `
        <h4 class="fc-section-title" style="font-size: 1.1rem; border:0; margin-bottom: 10px;">Dados do Pagamento</h4>
        <div class="fc-form-row">
            <div class="fc-form-group"><label for="${prefixo}_conta">Conta de Saída*</label><select id="${prefixo}_conta" class="fc-select" required>${'<option value="">Selecione...</option>' + contasCache.map(c => `<option value="${c.id}" ${agendamento?.id_conta_bancaria == c.id ? 'selected' : ''}>${c.nome_conta}</option>`).join('')}</select></div>
            <div class="fc-form-group"><label for="${prefixo}_data">${dataLabel}</label><input type="date" id="${prefixo}_data" class="fc-input" value="${agendamento ? (agendamento.data_vencimento || agendamento.data_transacao).split('T')[0] : hoje}" required></div>
        </div>
        <div class="fc-form-row">
            <div class="fc-form-group"><label for="${prefixo}_favorecido_busca">Favorecido (Órgão)*</label><div class="fc-autocomplete-container"><input type="text" id="${prefixo}_favorecido_busca" class="fc-input fc-autocomplete-input" placeholder="Buscar..." value="${agendamento?.nome_favorecido || ''}" autocomplete="off" required><span class="fc-autocomplete-status-icon"></span><div id="${prefixo}_favorecido_resultados" class="fc-autocomplete-results hidden"></div><input type="hidden" id="${prefixo}_favorecido_id" class="fc-autocomplete-id" value="${agendamento?.id_contato || ''}"></div></div>
            <div class="fc-form-group"><label for="${prefixo}_categoria">Categoria Geral*</label><select id="${prefixo}_categoria" class="fc-select" required>${optionsCategoria}</select></div>
        </div>
        <div class="fc-form-group"><label for="${prefixo}_descricao">Descrição Geral*</label><input type="text" id="${prefixo}_descricao" class="fc-input" required placeholder="Ex: Guia FGTS..." value="${agendamento?.descricao || ''}"></div>
        <hr style="margin: 20px 0;"><h4 class="fc-section-title" style="font-size: 1.1rem; border:0; margin-bottom: 10px;">Detalhamento dos Custos</h4>
        <div class="fc-rateio-header" style="grid-template-columns: 2.5fr 2.5fr 2fr 130px 40px;"><span>Favorecido*</span><span>Categoria*</span><span>Descrição</span><span>Valor (R$)*</span><span>Ação</span></div>
        <div id="${prefixo}_grade_itens" class="grade-itens-rateio"></div>
        <button type="button" class="fc-btn fc-btn-outline btn-adicionar-item-rateio" style="margin-top: 10px;"><i class="fas fa-plus"></i> Add Item</button>
        <div id="${prefixo}_resumo_rateio" class="resumo-rateio" style="text-align: right; margin-top: 10px; font-weight: bold;"></div>
    `;
    const gradeContainer = formContainer.querySelector(`#${prefixo}_grade_itens`);
    if (!agendamento) adicionarLinhaRateioDetalhado(gradeContainer);
    formContainer.querySelector('.btn-adicionar-item-rateio').addEventListener('click', () => adicionarLinhaRateioDetalhado(gradeContainer));
}

/**
 * Define o status visual de um campo de autocomplete.
 * @param {HTMLInputElement} inputElement - O elemento do input de busca.
 * @param {'success' | 'error' | 'clear'} status - O estado a ser definido.
 */
function setAutocompleteStatus(inputElement, status) {
    const container = inputElement.closest('.fc-autocomplete-container');
    if (!container) return;

    const iconSpan = container.querySelector('.fc-autocomplete-status-icon');
    if (!iconSpan) return;

    // Limpa classes e conteúdo anteriores
    iconSpan.className = 'fc-autocomplete-status-icon';
    iconSpan.innerHTML = '';

    switch (status) {
        case 'success':
            iconSpan.innerHTML = '<i class="fas fa-check-circle"></i>';
            iconSpan.style.color = 'var(--fc-cor-receita)';
            iconSpan.classList.add('visible');
            break;
        case 'error':
            iconSpan.innerHTML = '<i class="fas fa-times-circle"></i>';
            iconSpan.style.color = 'var(--fc-cor-despesa)';
            iconSpan.classList.add('visible');
            break;
        case 'clear':
            // Não faz nada, o ícone simplesmente some (sem a classe 'visible')
            break;
    }
}

// Adiciona uma nova linha de item na grade de rateio
function adicionarLinhaItemCompra(gradeContainer, item = null) {
    if (!gradeContainer) return;
    
    const div = document.createElement('div');
    // 1. Mudamos o grid para 6 colunas, para acomodar os novos campos e o valor total calculado
    div.className = 'fc-rateio-linha'; 
    div.style.gridTemplateColumns = 'minmax(0, 2fr) 90px 110px 110px minmax(0, 1fr) 40px';
    
    // Lógica para obter categorias (continua a mesma)
    const categoriasDespesa = categoriasCache.filter(c => gruposCache.find(g => g.id === c.id_grupo)?.tipo === 'DESPESA');
    const categoriasAgrupadas = categoriasDespesa.reduce((acc, categoria) => {
        (acc[categoria.id_grupo] = acc[categoria.id_grupo] || []).push(categoria);
        return acc;
    }, {});
    let optionsCategoria = '<option value="">Selecione...</option>';
    for (const idGrupo in categoriasAgrupadas) {
        const grupo = gruposCache.find(g => g.id == idGrupo);
        optionsCategoria += `<optgroup label="${grupo.nome}">`;
        categoriasAgrupadas[idGrupo].forEach(categoria => {
            const isSelected = item && item.id_categoria == categoria.id ? 'selected' : '';
            optionsCategoria += `<option value="${categoria.id}" ${isSelected}>${categoria.nome}</option>`;
        });
        optionsCategoria += `</optgroup>`;
    }

    // 2. O HTML agora tem os novos campos
    div.innerHTML = `
        <input type="text" class="fc-input item-descricao" placeholder="Nome do Produto" value="${item?.descricao_item || ''}">
        <input type="number" class="fc-input item-quantidade" step="0.001" min="0.001" placeholder="Qtd" required value="${item?.quantidade || '1'}">
        <input type="number" class="fc-input item-valor-unitario" step="0.0001" min="0.0001" placeholder="V. Unitário" required value="${item?.valor_unitario || ''}">
        <input type="number" class="fc-input item-valor-total" placeholder="V. Total" disabled>
        <select class="fc-select item-categoria" required>${optionsCategoria}</select>
        <button type="button" class="remover-item-btn"><i class="fas fa-trash"></i></button>
    `;
    gradeContainer.appendChild(div);

    const formPai = gradeContainer.closest('form');
    const inputQtd = div.querySelector('.item-quantidade');
    const inputValorUnit = div.querySelector('.item-valor-unitario');
    const inputValorTotal = div.querySelector('.item-valor-total');
    
    // 3. Função para calcular e atualizar o valor total do item
    const calcularTotalItem = () => {
        const qtd = parseFloat(inputQtd.value) || 0;
        const valorUnit = parseFloat(inputValorUnit.value) || 0;
        const total = qtd * valorUnit;
        inputValorTotal.value = total.toFixed(2); // Mostra o valor total com 2 casas decimais
        atualizarResumoRateio(formPai); // Atualiza o resumo geral da compra
    };

    // 4. Listeners para os novos campos
    inputQtd.addEventListener('input', calcularTotalItem);
    inputValorUnit.addEventListener('input', calcularTotalItem);
    
    div.querySelector('.remover-item-btn').addEventListener('click', () => {
        div.remove();
        atualizarResumoRateio(formPai);
    });

    // Calcula o total inicial se estiver em modo de edição
    if (item) {
        calcularTotalItem();
    }
}

// Atualiza o resumo dos valores dos itens dentro de um formulário específico
function atualizarResumoRateio(formElement) {
    if (!formElement) return;

    const resumoContainer = formElement.querySelector('.resumo-rateio');
    if (!resumoContainer) return;
    
    // Identifica se é um formulário de Compra ou Rateio
    const isCompraDetalhada = formElement.id.includes('CompraDetalhada');

    let totalItens = 0;
    
    if (isCompraDetalhada) {
        // Lógica para Compra Detalhada (com quantidade e valor unitário)
        const valorDescontoInput = formElement.querySelector('input[id$="_valor_desconto"]');
        const valorDesconto = parseFloat(valorDescontoInput?.value) || 0;

        formElement.querySelectorAll('.item-valor-total').forEach(input => {
            totalItens += parseFloat(input.value) || 0;
        });
        
        const valorFinal = totalItens - valorDesconto;

        resumoContainer.innerHTML = `
            <span>Soma dos Itens: <strong>${formatCurrency(totalItens)}</strong></span> | 
            <span>Desconto: <strong>- ${formatCurrency(valorDesconto)}</strong></span> | 
            <span style="color: var(--fc-cor-primaria);">Total Pago: <strong>${formatCurrency(valorFinal)}</strong></span>
        `;
    } else {
        // Lógica para Rateio Detalhado (com valor direto)
        formElement.querySelectorAll('.item-valor').forEach(input => {
            totalItens += parseFloat(input.value) || 0;
        });

        resumoContainer.innerHTML = `
            <span style="color: var(--fc-cor-primaria);">Total Distribuído: <strong>${formatCurrency(totalItens)}</strong></span>
        `;
    }
}

async function salvarCompraDetalhada(event) {
    event.preventDefault();
    const form = event.target;
    const prefixo = form.id;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('#btnSalvarModal');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    try {
        const favorecidoId = form.querySelector(`#${prefixo}_favorecido_id`).value;
        if (!favorecidoId) {
            mostrarPopupFinanceiro('Fornecedor inválido. Por favor, selecione um da lista ou crie um novo.', 'erro');
            return;
        }

        const itens_filho = [];
        const linhasDeItens = form.querySelectorAll('.grade-itens-rateio .fc-rateio-linha');

        if (linhasDeItens.length === 0) {
            mostrarPopupFinanceiro('É necessário adicionar pelo menos um item à compra.', 'erro');
            return;
        }
        
        let algumItemInvalido = false;
        linhasDeItens.forEach(linha => {
            const quantidade = parseFloat(linha.querySelector('.item-quantidade').value);
            const valor_unitario = parseFloat(linha.querySelector('.item-valor-unitario').value);
            const idCategoria = parseInt(linha.querySelector('.item-categoria').value);

            if (!idCategoria || !quantidade || quantidade <= 0 || !valor_unitario || valor_unitario <= 0) {
                algumItemInvalido = true;
            }
            
            itens_filho.push({
                id_categoria: idCategoria,
                descricao_item: linha.querySelector('.item-descricao').value,
                quantidade: quantidade,
                valor_unitario: valor_unitario
            });
        });

        if (algumItemInvalido) {
            mostrarPopupFinanceiro('Todos os itens devem ter quantidade, valor unitário e categoria válidos.', 'erro');
            return;
        }

        const payload = {
            tipo_rateio: 'COMPRA',
            dados_pai: {
                id_conta_bancaria: parseInt(form.querySelector(`#${prefixo}_conta`).value),
                data_transacao: form.querySelector(`#${prefixo}_data`).value,
                id_contato: parseInt(favorecidoId),
                id_categoria: null,
                descricao: form.querySelector(`#${prefixo}_descricao`).value,
                valor_desconto: parseFloat(form.querySelector(`input[id$="_valor_desconto"]`).value) || 0
            },
            itens_filho: itens_filho
        };
        
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

        let response; // Variável para armazenar a resposta da API

        if (itemEmEdicao) {
            // Se estiver editando E o usuário não for admin, pede a justificativa
            if (!permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira')) {
                const justificativa = await mostrarPopupComInput(
                    `Qual o motivo para editar a compra #${itemEmEdicao.id}?`,
                    'Justificativa obrigatória'
                );

                if (!justificativa || justificativa.trim() === '') {
                    mostrarPopupFinanceiro('A edição foi cancelada, pois a justificativa é obrigatória.', 'aviso');
                    // Reabilita o botão antes de sair
                    if (btnSalvar) {
                        btnSalvar.disabled = false;
                        btnSalvar.innerHTML = textoOriginalBtn;
                    }
                    return; // Interrompe a função
                }
                payload.justificativa = justificativa.trim();
            }
            // Envia a requisição de atualização
            response = await fetchFinanceiroAPI(`/lancamentos/detalhado/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            // Envia a requisição de criação
            response = await fetchFinanceiroAPI('/lancamentos/detalhado', { method: 'POST', body: JSON.stringify(payload) });
        }
        
        const mensagemSucesso = response.message || (itemEmEdicao ? 'Alterações salvas com sucesso!' : 'Compra detalhada registrada com sucesso!');
        mostrarPopupFinanceiro(mensagemSucesso, 'sucesso');
        
        fecharModal();
        carregarLancamentosFiltrados(filtrosAtivos.page || 1);
        atualizarSaldosDashboard();
        
        // Atualiza o badge de aprovações se uma nova solicitação foi criada
        if (response.message && response.message.includes('aprovação')) {
            atualizarBadgesHeader();
        }

    } catch(e) {
        // O erro já é tratado e exibido pela fetchFinanceiroAPI
        console.error("Erro em salvarCompraDetalhada:", e);
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
}

//  função para adicionar uma linha na grade de RATEIO
function adicionarLinhaRateioDetalhado(gradeContainer, item = null) {
    if (!gradeContainer) return;
    
    const formPai = gradeContainer.closest('form');
    const prefixo = formPai.id;
    const categoriaGeralSelecionada = formPai.querySelector(`#${prefixo}_categoria`).value;

    const div = document.createElement('div');
    div.className = 'fc-rateio-linha'
    div.style.gridTemplateColumns = '2.5fr 2.5fr 2fr 130px 40px'; 
    
    const uniqueId = `autocomplete-item-${Date.now()}-${Math.random()}`;

    const categoriasDespesa = categoriasCache.filter(c => gruposCache.find(g => g.id === c.id_grupo)?.tipo === 'DESPESA');
    const categoriasAgrupadas = categoriasDespesa.reduce((acc, cat) => {
        (acc[cat.id_grupo] = acc[cat.id_grupo] || []).push(cat);
        return acc;
    }, {});

    let optionsCategoria = '<option value="">Selecione...</option>';
    for (const idGrupo in categoriasAgrupadas) {
        const grupo = gruposCache.find(g => g.id == idGrupo);
        optionsCategoria += `<optgroup label="${grupo.nome}">`;
        categoriasAgrupadas[idGrupo].forEach(categoria => {
            // Usa a categoria do item se estiver editando, senão usa a geral
            const categoriaIdParaSelecionar = item ? item.id_categoria : categoriaGeralSelecionada;
            const isSelected = categoria.id == categoriaIdParaSelecionar ? 'selected' : '';
            optionsCategoria += `<option value="${categoria.id}" ${isSelected}>${categoria.nome} [ ${grupo.nome} ]</option>`;
        });
        optionsCategoria += `</optgroup>`;
    }

    const valorDoItem = item ? (item.valor_item || item.valor_total_item) : '';
    const nomeContatoItem = item ? (item.nome_contato_item || '') : '';
    const idContatoItem = item ? (item.id_contato_item || '') : '';
    const descricaoItem = item ? (item.descricao_item || '') : '';

    div.innerHTML = `
        <div class="fc-autocomplete-container">
            <input type="text" id="${uniqueId}" class="fc-input fc-autocomplete-input item-contato-busca" placeholder="Buscar funcionário/sócio..." value="${nomeContatoItem}" required>
            <span class="fc-autocomplete-status-icon"></span>
            <div class="fc-autocomplete-results hidden"></div>
            <input type="hidden" class="fc-autocomplete-id item-contato-id" value="${idContatoItem}">
        </div>
        <select class="fc-select item-categoria" required>${optionsCategoria}</select>
        <input type="text" class="fc-input item-descricao" placeholder="Opcional" value="${descricaoItem}">
        <input type="number" class="fc-input item-valor" step="0.01" min="0.01" placeholder="Valor" required value="${valorDoItem}">
        <button type="button" class="remover-item-btn"><i class="fas fa-trash"></i></button>
    `;
    gradeContainer.appendChild(div);

    div.querySelector('.item-valor').addEventListener('input', () => atualizarResumoRateio(formPai));
    div.querySelector('.remover-item-btn').addEventListener('click', () => {
        div.remove();
        atualizarResumoRateio(formPai);
    });

    // Se estiver editando, marca o autocomplete como "sucesso"
    if (item && item.id_contato_item) {
        setAutocompleteStatus(div.querySelector('.item-contato-busca'), 'success');
    }
}

//  função para salvar o RATEIO detalhado
async function salvarRateioDetalhado(event) {
    event.preventDefault();
    const form = event.target;
    const prefixo = form.id;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('#btnSalvarModal');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    try {
        const dadosPai = {
            id_conta_bancaria: parseInt(form.querySelector(`#${prefixo}_conta`).value),
            data_transacao: form.querySelector(`#${prefixo}_data`).value,
            id_contato: parseInt(form.querySelector(`#${prefixo}_favorecido_id`).value),
            id_categoria: parseInt(form.querySelector(`#${prefixo}_categoria`).value),
            descricao: form.querySelector(`#${prefixo}_descricao`).value,
        };

        if (!dadosPai.id_conta_bancaria || !dadosPai.data_transacao || !dadosPai.id_contato || !dadosPai.id_categoria) {
            mostrarPopupFinanceiro('Por favor, preencha todos os campos da seção "Dados do Pagamento".', 'erro');
            return;
        }

        const itens_filho = [];
        const linhasDeItens = form.querySelectorAll('.fc-rateio-linha');
        if (linhasDeItens.length === 0) {
            mostrarPopupFinanceiro('Adicione pelo menos um favorecido no detalhamento dos custos.', 'erro');
            return;
        }
        
         let algumItemInvalido = false;
        linhasDeItens.forEach(linha => {
            const valorItem = parseFloat(linha.querySelector('.item-valor').value) || 0;
            const idContatoItem = parseInt(linha.querySelector('.item-contato-id').value) || 0;
            const idCategoriaItem = parseInt(linha.querySelector('.item-categoria').value) || 0;

            if (valorItem <= 0 || idContatoItem <= 0 || idCategoriaItem <= 0) {
                algumItemInvalido = true;
            }

            itens_filho.push({
                valor_item: valorItem,
                id_contato_item: idContatoItem,
                id_categoria: idCategoriaItem,
                descricao_item: linha.querySelector('.item-descricao').value,
                // Garantimos que os campos de 'compra' não sejam enviados
                quantidade: null, 
                valor_unitario: null
            });
        });

        if (algumItemInvalido) {
            mostrarPopupFinanceiro('Todos os itens do detalhamento devem ter um favorecido, uma categoria e um valor válido.', 'erro');
            return;
        }

        const payload = {
            tipo_rateio: 'DETALHADO',
            dados_pai: dadosPai,
            itens_filho: itens_filho
        };
        
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

        let mensagemSucesso = '';

        if (itemEmEdicao) {
            if (!permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira')) {
                 const justificativa = await mostrarPopupComInput(
                    `Qual o motivo para editar o rateio #${itemEmEdicao.id}?`,
                    'Justificativa obrigatória'
                );

                if (!justificativa || justificativa.trim() === '') {
                    mostrarPopupFinanceiro('A edição foi cancelada, pois a justificativa é obrigatória.', 'aviso');
                    throw new Error("Justificativa cancelada pelo usuário.");
                }
                payload.justificativa = justificativa.trim();
            }
            
            const response = await fetchFinanceiroAPI(`/lancamentos/detalhado/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            mensagemSucesso = response.message || 'Rateio atualizado com sucesso!';

        } else {
            // ESTAMOS CRIANDO
            await fetchFinanceiroAPI('/lancamentos/detalhado', { method: 'POST', body: JSON.stringify(payload) });
            mensagemSucesso = 'Rateio detalhado registrado com sucesso!';
        }
        
        mostrarPopupFinanceiro(mensagemSucesso, 'sucesso');
        fecharModal();
        carregarLancamentosFiltrados(filtrosAtivos.page || 1);
        atualizarSaldosDashboard();

    } catch(e) {
        if (e.message !== "Justificativa cancelada pelo usuário.") {
            console.error("Erro em salvarRateioDetalhado:", e);
        }
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
}


async function salvarLancamento(event) {
    event.preventDefault();
    
    const btnSalvar = event.target.closest('.fc-modal-content').querySelector('.fc-btn-primario');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    try {
        const favorecidoId = document.getElementById('lanc_contato_id').value;
        const favorecidoNome = document.getElementById('lanc_contato_busca').value;
        if (!favorecidoId && favorecidoNome.trim() !== '') {
            mostrarPopupFinanceiro('Favorecido/Pagador inválido. Por favor, selecione um item da lista ou clique em "+ Criar novo".', 'erro');
            return;
        }

        const payload = {
            valor: parseFloat(document.getElementById('lanc_valor').value),
            data_transacao: document.getElementById('lanc_data').value,
            id_categoria: parseInt(document.getElementById('lanc_categoria').value),
            id_conta_bancaria: parseInt(document.getElementById('lanc_conta').value),
            descricao: document.getElementById('lanc_descricao').value,
            id_contato: parseInt(favorecidoId) || null
        };
        
        if (!payload.valor || !payload.id_categoria || !payload.id_conta_bancaria) {
            mostrarPopupFinanceiro('Por favor, preencha todos os campos obrigatórios (*).', 'aviso');
            return;
        }

        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

        let responseMessage = '';

        if (itemEmEdicao) {
            if (!permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira')) {
                const justificativa = await mostrarPopupComInput(
                    `Qual o motivo para editar o lançamento #${itemEmEdicao.id}?`,
                    'Justificativa obrigatória'
                );

                if (!justificativa || justificativa.trim() === '') {
                    mostrarPopupFinanceiro('A edição foi cancelada, pois a justificativa é obrigatória.', 'aviso');
                    throw new Error("Justificativa cancelada pelo usuário."); // Lança um erro para parar a execução e ir para o finally
                }
                // Adiciona a justificativa ao payload que será enviado para a API
                payload.justificativa = justificativa.trim();
            }

            const response = await fetchFinanceiroAPI(`/lancamentos/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            responseMessage = response.message || 'Alterações salvas com sucesso!';
            if (response.message.includes('aguardando aprovação')) {
                atualizarBadgesHeader();
            }
        } else {
            
            // Lógica de confirmação de data que você já tinha
            const dataTransacaoInput = document.getElementById('lanc_data').value;
            const hoje = new Date();
            const dataTransacaoDate = new Date(dataTransacaoInput + 'T00:00:00');
            hoje.setHours(0, 0, 0, 0);
            if (dataTransacaoDate.getTime() !== hoje.getTime()) {
                const dataFormatada = dataTransacaoDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                const confirmado = await mostrarPopupConfirmacao(`Atenção: a data da transação (${dataFormatada}) é diferente da data de hoje. Deseja continuar?`);
                if (!confirmado) {
                   throw new Error("Criação cancelada pelo usuário devido à data.");
                }
            }

            payload.tipo = document.getElementById('lanc_tipo').value;
            if (!payload.tipo) {
                mostrarPopupFinanceiro('O campo "Tipo" é obrigatório.', 'aviso');
                throw new Error("Tipo de lançamento não selecionado");
            }
            await fetchFinanceiroAPI('/lancamentos', { method: 'POST', body: JSON.stringify(payload) });
            responseMessage = 'Lançamento salvo com sucesso!';
        }
        
        mostrarPopupFinanceiro(responseMessage, 'sucesso');
        fecharModal();
        
        carregarLancamentosFiltrados(filtrosAtivos.page || 1);
        atualizarBadgesHeader();
        atualizarSaldosDashboard();

    } catch (error) {
        // Se o erro foi um cancelamento do usuário, não mostramos popup de erro.
        if (error.message !== "Justificativa cancelada pelo usuário." && 
            error.message !== "Criação cancelada pelo usuário devido à data." &&
            error.message !== "Tipo de lançamento não selecionado") {
            console.error("Erro em salvarLancamento:", error);
            // O fetchFinanceiroAPI já deve mostrar o popup em caso de erro de API.
        }
    } finally {
        // Este bloco sempre será executado, garantindo que o botão seja reativado.
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
}

async function solicitarExclusaoLancamento(id) {
    const lancamento = lancamentosCache.find(l => l.id == id);
    if (!lancamento) return;

    const justificativa = await mostrarPopupComInput(
        `Por que você deseja solicitar a exclusão do lançamento "${lancamento.descricao || 'sem descrição'}"?`,
        'Motivo da solicitação (obrigatório)'
    );

    if (!justificativa || justificativa.trim() === '') {
        mostrarPopupFinanceiro('A solicitação foi cancelada, pois é necessário fornecer um motivo.', 'aviso');
        return;
    }

    try {
        const response = await fetchFinanceiroAPI(`/lancamentos/${id}/solicitar-exclusao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ justificativa: justificativa.trim() })
        });
        mostrarPopupFinanceiro(response.message, 'sucesso');
        
        atualizarBadgesHeader();
        // <<< LINHA ALTERADA: Passa a página que estava salva nos filtros
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
                <button id="fecharModal" class="fc-modal-close">X</button>
                <h3 class="fc-section-title" style="text-align:center;">${titulo}</h3>
                
                <div class="fc-modal-body">
                    <form id="formCategoria">
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
                    </form>
                </div>

                <div class="fc-modal-footer">
                     <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                     <button type="submit" class="fc-btn fc-btn-primario" form="formCategoria">Salvar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formCategoria', salvarCategoria);
}

async function salvarCategoria(event) {
    event.preventDefault();

    const form = event.target;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('button[type="submit"]');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;
    
    const payload = {
        nome: document.getElementById('categoria_nome').value,
        id_grupo: parseInt(document.getElementById('categoria_id_grupo').value),
    };

    try {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

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
        
        renderizarTabelaCategoriasAgrupadas();

    } catch (error) {
        // fetchFinanceiroAPI já lida com o erro
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
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
                <button id="fecharModal" class="fc-modal-close">X</button>
                <h3 class="fc-section-title" style="text-align:center;">${titulo}</h3>

                <div class="fc-modal-body">
                    <form id="formContato">
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
                                <option value="EMPREGADO" ${contato?.tipo === 'EMPREGADO' ? 'selected' : ''}>Funcionário</option>
                                <option value="EX_EMPREGADO" ${contato?.tipo === 'EX_EMPREGADO' ? 'selected' : ''}>Ex-Funcionário</option>
                                <option value="SOCIOS" ${contato?.tipo === 'SOCIOS' ? 'selected' : ''}>Sócios</option>
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
                    </form>
                </div>

                <div class="fc-modal-footer">
                     <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                     <button type="submit" class="fc-btn fc-btn-primario" form="formContato">Salvar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formContato', salvarContatoGerenciamento);
}

async function salvarContatoGerenciamento(event) {
    event.preventDefault();

    const form = event.target;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('button[type="submit"]');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    const payload = {
        nome: document.getElementById('contato_nome').value,
        tipo: document.getElementById('contato_tipo').value,
        cpf_cnpj: document.getElementById('contato_cpf_cnpj').value,
        observacoes: document.getElementById('contato_obs').value,
    };

    try {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

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
    } catch (error) {
        // fetchFinanceiroAPI já lida com o erro
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
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

async function carregarContasAgendadas(page = 1, filtros = {}) {
    const container = document.getElementById('agendaContainer');
    if (!container) return;

    container.innerHTML = `<div class="fc-spinner-container">
        <div class="fc-spinner-dots"><div class="dot-1"></div><div class="dot-2"></div><div class="dot-3"></div></div>
        <span class="fc-spinner-text">Buscando contas agendadas...</span>
    </div>`;

    filtrosAgendaAtivos.page = page; 

    const params = new URLSearchParams({ page, ...filtros }); 

    try {
        const data = await fetchFinanceiroAPI(`/contas-agendadas?${params.toString()}`);
        
        contasAgendadasCache = data.contasAgendadas;
        
        renderizarTabelaAgenda(); 
        renderizarPaginacaoAgenda(data.pages, data.page);

    } catch(e) {
        container.innerHTML = `<p style="color: red; text-align:center; padding: 20px;">Erro ao carregar a agenda.</p>`;
    }
}


function abrirModalAgendamento(agendamento = null) {
    itemEmEdicao = agendamento;
    const isEditMode = !!itemEmEdicao;
    const titulo = isEditMode ? "Editar Agendamento" : "Novo Agendamento";

    const modalHTML = `
        <div id="modal-agendamento" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close"><i class="fas fa-times"></i></button>
                <h3 class="fc-section-title" style="text-align:center; border:0;">${titulo}</h3>
                <div class="fc-modal-body">
                    <div class="fc-form-group">
                        <label>Qual o tipo de agendamento?</label>
                        <div class="fc-segmented-control" ${isEditMode ? 'style="pointer-events: none; opacity: 0.6;"' : ''}>
                            <button class="fc-segment-btn active" data-form-id="formAgendamentoSimples">Simples</button>
                            <button class="fc-segment-btn" data-form-id="formAgendamentoCompra">Compra Detalhada</button>
                            <button class="fc-segment-btn" data-form-id="formAgendamentoRateio">Rateio Detalhado</button>
                            <button class="fc-segment-btn" data-form-id="formAgendamentoLote">Parcelamento</button>
                        </div>
                    </div>
                    <form id="formAgendamentoSimples"></form>
                    <form id="formAgendamentoCompra" class="hidden"></form>
                    <form id="formAgendamentoRateio" class="hidden"></form>
                    <form id="formAgendamentoLote" class="hidden"></form>
                </div>
                <div class="fc-modal-footer">
                    <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                    <button type="button" id="btnSalvarAgendamento" class="fc-btn fc-btn-primario">${isEditMode ? 'Salvar Alterações' : 'Agendar'}</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modalElement = document.getElementById('modal-agendamento');
    const btnSalvar = document.getElementById('btnSalvarAgendamento');
    const btnAbas = modalElement.querySelectorAll('.fc-segment-btn');

    const ativarAba = (formId) => {
        btnAbas.forEach(btn => {
            const isActive = btn.dataset.formId === formId;
            btn.classList.toggle('active', isActive);
            document.getElementById(btn.dataset.formId)?.classList.toggle('hidden', !isActive);
        });
        btnSalvar.setAttribute('form', formId);
    };

    if (isEditMode) {
        const isDetalhado = itemEmEdicao.itens && itemEmEdicao.itens.length > 0;
        const isLote = !!itemEmEdicao.id_lote;

        if (isDetalhado) {
            const tipoRateio = itemEmEdicao.tipo_rateio || 'COMPRA';
            const formId = tipoRateio === 'COMPRA' ? 'formAgendamentoCompra' : 'formAgendamentoRateio';
            const formElement = document.getElementById(formId);
            
            ativarAba(formId);
            
            // 1. Popula os campos do formulário "pai"
            if (tipoRateio === 'COMPRA') {
                popularFormularioCompraDetalhada(formElement, itemEmEdicao, true);
            } else {
                popularFormularioRateioDetalhado(formElement, itemEmEdicao, true);
            }
            
            // <<< BLOCO DE CÓDIGO CORRIGIDO E REINSERIDO AQUI >>>
            // 2. Preenche a grade de "filhos"
            const gradeContainer = formElement.querySelector('.grade-itens-rateio');
            if (gradeContainer) {
                gradeContainer.innerHTML = ''; // Limpa a linha em branco que possa ter sido criada
                itemEmEdicao.itens.forEach(item => {
                    if (tipoRateio === 'COMPRA') {
                        adicionarLinhaItemCompra(gradeContainer, item);
                    } else { // DETALHADO
                        adicionarLinhaRateioDetalhado(gradeContainer, item);
                    }
                });
                atualizarResumoRateio(formElement); // Atualiza a soma dos itens
            }
            if (itemEmEdicao.id_contato) {
                setAutocompleteStatus(formElement.querySelector('.fc-autocomplete-input'), 'success');
            }

        } else if (isLote) {
            ativarAba('formAgendamentoLote');
            // Edição de lote não é totalmente suportada, mas abre na aba certa
            popularFormularioAgendamentoLote(document.getElementById('formAgendamentoLote'), itemEmEdicao);
        } else { // Edição de agendamento simples
            ativarAba('formAgendamentoSimples');
            popularFormularioAgendamentoSimples(document.getElementById('formAgendamentoSimples'), itemEmEdicao);
        }
    } else { // Modo de criação
        ativarAba('formAgendamentoSimples');
        popularFormularioAgendamentoSimples(document.getElementById('formAgendamentoSimples'));
        popularFormularioCompraDetalhada(document.getElementById('formAgendamentoCompra'), null, true);
        popularFormularioRateioDetalhado(document.getElementById('formAgendamentoRateio'), null, true);
        popularFormularioAgendamentoLote(document.getElementById('formAgendamentoLote'));
    }

    modalElement.querySelector('.fc-modal-close').addEventListener('click', fecharModal);
    modalElement.querySelector('#btnCancelarModal').addEventListener('click', fecharModal);
    
    document.getElementById('formAgendamentoSimples').addEventListener('submit', salvarAgendamento);
    document.getElementById('formAgendamentoCompra').addEventListener('submit', (e) => salvarAgendamentoDetalhado(e, 'COMPRA'));
    document.getElementById('formAgendamentoRateio').addEventListener('submit', (e) => salvarAgendamentoDetalhado(e, 'DETALHADO'));
    document.getElementById('formAgendamentoLote').addEventListener('submit', gerarEconfirmarLote);

    btnSalvar.addEventListener('click', () => {
        document.getElementById(btnSalvar.getAttribute('form'))?.requestSubmit();
    });

    if (!isEditMode) {
        btnAbas.forEach(btn => btn.addEventListener('click', () => {
            ativarAba(btn.dataset.formId)
            btnSalvar.textContent = btn.dataset.formId.endsWith('Lote') ? 'Agendar Parcelas' : 'Agendar';
        }));
    }
}

function popularFormularioAgendamentoLote(formContainer) {
    if (!formContainer) return;
    const hoje = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    formContainer.innerHTML = `
        <div class="fc-form-group">
            <label for="lote_descricao">Descrição Geral (Ex: Compra de Tecidos, Aluguel 2025)*</label>
            <input type="text" id="lote_descricao" class="fc-input" required>
        </div>
        <div class="fc-form-group">
            <label for="lote_favorecido_busca">Favorecido*</label>
            <div class="fc-autocomplete-container">
                <input type="text" id="lote_favorecido_busca" class="fc-input fc-autocomplete-input" placeholder="Digite para buscar..." autocomplete="off" required>
                <span class="fc-autocomplete-status-icon"></span>
                <div id="lote_favorecido_resultados" class="fc-autocomplete-results hidden"></div>
                <input type="hidden" id="lote_favorecido_id" class="fc-autocomplete-id">
            </div>
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
        </div>
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
        <button type="button" id="btnGerarPrevia" class="fc-btn fc-btn-outline" style="width:100%; margin-top:15px;">Verificar e Pré-visualizar Parcelas</button>
        <div id="lote_previa_container" style="margin-top: 15px;"></div>
    `;

    // Listeners específicos para este formulário
    document.getElementById('lote_tipo').addEventListener('change', (e) => {
        const tipo = e.target.value === 'A_PAGAR' ? 'DESPESA' : 'RECEITA';
        const catSelect = document.getElementById('lote_categoria');
        const categoriasFiltradas = categoriasCache.filter(c => gruposCache.find(g => g.id === c.id_grupo)?.tipo === tipo);
        const categoriasAgrupadas = categoriasFiltradas.reduce((acc, cat) => { (acc[cat.id_grupo] = acc[cat.id_grupo] || []).push(cat); return acc; }, {});
        let optionsHTML = '<option value="">Selecione...</option>';
        for (const idGrupo in categoriasAgrupadas) {
            const grupo = gruposCache.find(g => g.id == idGrupo);
            optionsHTML += `<optgroup label="${grupo.nome}">`;
            categoriasAgrupadas[idGrupo].forEach(categoria => {
                optionsHTML += `<option value="${categoria.id}">${categoria.nome} [ ${grupo.nome} ]</option>`;
            });
            optionsHTML += `</optgroup>`;
        }
        catSelect.innerHTML = optionsHTML;
    });

    const metodoSelect = document.getElementById('lote_metodo_divisao');
    const previaContainer = document.getElementById('lote_previa_container');
    metodoSelect.addEventListener('change', () => {
        document.getElementById('opcoes_metodo_fixo').classList.toggle('hidden', metodoSelect.value !== 'fixo');
        document.getElementById('opcoes_metodo_manual').classList.toggle('hidden', metodoSelect.value !== 'manual');
        previaContainer.innerHTML = '';
        if (metodoSelect.value === 'manual' && document.querySelectorAll('#grade_parcelas_manuais .fc-parcela-manual-linha').length === 0) {
            adicionarLinhaParcelaManual();
        }
    });

    document.getElementById('btnAdicionarParcelaManual').addEventListener('click', () => adicionarLinhaParcelaManual());
    document.getElementById('btnGerarPrevia')?.addEventListener('click', () => {
        const metodo = document.getElementById('lote_metodo_divisao').value;
        if (metodo === 'fixo') gerarPreviaLoteFixo();
        else gerarPreviaLoteManual();
    });
}

async function salvarAgendamento(event) {
    event.preventDefault();

    const form = event.target;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('#btnSalvarAgendamento');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    const payload = {
        tipo: document.getElementById('ag_tipo').value,
        descricao: document.getElementById('ag_descricao').value,
        valor: parseFloat(document.getElementById('ag_valor').value),
        data_vencimento: document.getElementById('ag_vencimento').value,
        id_categoria: parseInt(document.getElementById('ag_categoria').value),
        id_contato: parseInt(document.getElementById('ag_contato_id').value) || null,
    };

    if (!payload.tipo || !payload.descricao || !payload.valor || !payload.data_vencimento || !payload.id_categoria) {
        mostrarPopupFinanceiro('Por favor, preencha todos os campos obrigatórios (*).', 'aviso');
        return;
    }
    
    try {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Salvando...`;

        if (itemEmEdicao) {
            // Se itemEmEdicao existe, estamos editando. Usamos PUT.
            await fetchFinanceiroAPI(`/contas-agendadas/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            mostrarPopupFinanceiro('Agendamento atualizado com sucesso!', 'sucesso');
        } else {
            // Se não, estamos criando. Usamos POST.
            await fetchFinanceiroAPI('/contas-agendadas', { method: 'POST', body: JSON.stringify(payload) });
            mostrarPopupFinanceiro('Conta agendada com sucesso!', 'sucesso');
        }
        
        fecharModal();
        carregarContasAgendadas(); // Recarrega a lista
    } catch(e) {
        // fetchFinanceiroAPI já trata o erro
    } finally {
        if(btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = itemEmEdicao ? 'Salvar Alterações' : 'Agendar';
        }
    }
}

// Função completa para salvar agendamentos detalhados (Compra ou Rateio)
async function salvarAgendamentoDetalhado(event, tipo_rateio) {
    event.preventDefault();
    const form = event.target;
    const prefixo = form.id;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('#btnSalvarAgendamento');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    try {
        const dadosPai = {
            data_vencimento: form.querySelector(`input[id$="_data"]`).value,
            id_contato: parseInt(form.querySelector(`input[id$="_favorecido_id"]`).value),
            descricao: form.querySelector(`input[id$="_descricao"]`).value,
            tipo: 'A_PAGAR', // Rateios são sempre despesas
        };

        const itens_filho = [];
        let totalItens = 0;
        const linhasDeItens = form.querySelectorAll('.grade-itens-rateio .fc-rateio-linha');

        if (linhasDeItens.length === 0) {
            mostrarPopupFinanceiro('É necessário adicionar pelo menos um item.', 'erro');
            return;
        }

        if (tipo_rateio === 'COMPRA') {
            dadosPai.id_categoria = null; // Categoria fica nos filhos
            const valorTotalNota = parseFloat(form.querySelector(`input[id$="_valor_total"]`).value) || 0;

            let algumItemInvalidoCompra = false;
            linhasDeItens.forEach(linha => {
                const valorItem = parseFloat(linha.querySelector('.item-valor').value) || 0;
                const idCategoria = parseInt(linha.querySelector('.item-categoria').value);
                if (!idCategoria || valorItem <= 0) algumItemInvalidoCompra = true;
                
                totalItens += valorItem;
                itens_filho.push({
                    id_categoria: idCategoria,
                    descricao_item: linha.querySelector('.item-descricao').value,
                    valor_item: valorItem,
                    id_contato_item: null
                });
            });
            
            if (algumItemInvalidoCompra) throw new Error('Todos os itens da compra devem ter categoria e valor válidos.');
            if (Math.abs(valorTotalNota - totalItens) > 0.01) throw new Error('A soma dos itens não corresponde ao valor total da nota.');

        } else { // DETALHADO
            dadosPai.id_categoria = parseInt(form.querySelector(`select[id$="_categoria"]`).value);
            if (!dadosPai.id_categoria) throw new Error('A categoria geral do rateio é obrigatória.');

            let algumItemInvalidoRateio = false;
            linhasDeItens.forEach(linha => {
                const valorItem = parseFloat(linha.querySelector('.item-valor').value) || 0;
                const idContatoItem = parseInt(linha.querySelector('.item-contato-id').value) || 0;
                const idCategoriaItem = parseInt(linha.querySelector('.item-categoria').value) || 0;
                if (valorItem <= 0 || idContatoItem <= 0 || idCategoriaItem <= 0) algumItemInvalidoRateio = true;
                
                itens_filho.push({
                    valor_item: valorItem,
                    id_contato_item: idContatoItem,
                    id_categoria: idCategoriaItem,
                    descricao_item: linha.querySelector('.item-descricao').value,
                });
            });

            if (algumItemInvalidoRateio) throw new Error('Todos os itens do rateio devem ter favorecido, categoria e valor válidos.');
        }
        
        const payload = {
            tipo_rateio,
            dados_pai: dadosPai,
            itens_filho: itens_filho
        };

        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Agendando...`;

        if (itemEmEdicao) {
            await fetchFinanceiroAPI(`/contas-agendadas/detalhado/${itemEmEdicao.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await fetchFinanceiroAPI('/contas-agendadas/detalhado', { method: 'POST', body: JSON.stringify(payload) });
        }

        const msg = itemEmEdicao ? 'Agendamento atualizado com sucesso!' : 'Agendamento criado com sucesso!';
        mostrarPopupFinanceiro(msg, 'sucesso');
        fecharModal();
        carregarContasAgendadas();

    } catch (e) {
        mostrarPopupFinanceiro(e.message, 'erro');
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = itemEmEdicao ? 'Salvar Alterações' : 'Agendar';
        }
    }
}

function abrirModalBaixa(conta) {
    itemEmEdicao = conta;
    const hojeDate = new Date();
    const fusoHorarioOffset = hojeDate.getTimezoneOffset() * 60000;
    const hojeLocal = new Date(hojeDate.getTime() - fusoHorarioOffset);
    const hoje = hojeLocal.toISOString().split('T')[0];

    const modalHTML = `
        <div id="modal-financeiro" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close">X</button>
                <h3 class="fc-section-title" style="text-align:center;">Dar Baixa em Conta</h3>
                <p style="text-align:center; margin-top:-15px; margin-bottom:20px;"><strong>${conta.descricao}</strong> - ${formatCurrency(conta.valor)}</p>

                <div class="fc-modal-body">
                    <form id="formBaixa">
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
                    </form>
                </div>

                <div class="fc-modal-footer">
                    <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                    <button type="submit" class="fc-btn fc-btn-primario" form="formBaixa">Confirmar Baixa</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarListenersModal('formBaixa', salvarBaixa);
}

async function salvarBaixa(event) {
    event.preventDefault();

    const form = event.target;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('button[type="submit"]');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;
    
    const payload = {
        data_transacao: document.getElementById('baixa_data').value,
        id_conta_bancaria: parseInt(document.getElementById('baixa_conta').value),
    };

    if (!payload.data_transacao || !payload.id_conta_bancaria) {
        mostrarPopupFinanceiro('Por favor, preencha todos os campos obrigatórios.', 'aviso');
        return;
    }

    try {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Confirmando...`;

        await fetchFinanceiroAPI(`/contas-agendadas/${itemEmEdicao.id}/baixar`, { method: 'POST', body: JSON.stringify(payload) });
        mostrarPopupFinanceiro('Baixa realizada com sucesso!', 'sucesso');
        fecharModal();
        carregarContasAgendadas();
        atualizarSaldosDashboard();
    } catch(e) {
        // fetchFinanceiroAPI já trata o erro
    } finally {
        if(btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
}

function renderizarResultadosAutocomplete(resultados, termoBusca, resultadosDiv, buscaInput, idInput) {
    // 1. Limpa os resultados anteriores
    resultadosDiv.innerHTML = '';
    let encontrouAlgoParaMostrar = false;

    // 2. Adiciona os resultados encontrados na lista
    if (resultados.length > 0) {
        encontrouAlgoParaMostrar = true;
        resultados.forEach(item => {
            const div = document.createElement('div');
            div.className = 'fc-autocomplete-item';
            
            // Alteramos aqui para usar innerHTML e adicionar o tipo
            div.innerHTML = `${item.nome} <span class="fc-autocomplete-tipo">[${item.tipo}]</span>`;
            
            div.dataset.id = item.id;
            div.addEventListener('mousedown', (e) => {
                e.preventDefault();
                buscaInput.value = item.nome;
                idInput.value = item.id;
                resultadosDiv.classList.add('hidden');
                
                setAutocompleteStatus(buscaInput, 'success');
            });
            resultadosDiv.appendChild(div);
        });
    }

    // 3. Lógica para o botão "+ Criar novo"
    const existeExato = resultados.some(r => r.nome.toLowerCase() === termoBusca.toLowerCase());
    if (termoBusca && !existeExato) {
        encontrouAlgoParaMostrar = true;
        const divNovo = document.createElement('div');
        divNovo.className = 'fc-autocomplete-item is-new';
        divNovo.innerHTML = `<i class="fas fa-plus-circle"></i> <span>Criar novo: <strong>"${termoBusca}"</strong></span>`;
        
        // ==========================================================
        // =====> ESTE É O BLOCO COMPLETO DO LISTENER DE CRIAÇÃO <=====
        // ==========================================================
        divNovo.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            resultadosDiv.classList.add('hidden');

            if (permissoesGlobaisFinanceiro.includes('criar-favorecido')) {
                const tipo = await mostrarPopupComInput(
                    `Qual o tipo do novo contato "${termoBusca}"?`,
                    'Ex: CLIENTE, FORNECEDOR, EMPREGADO, etc.'
                );

                if (tipo && ['CLIENTE', 'FORNECEDOR', 'EMPREGADO', 'EX_EMPREGADO', 'SOCIOS', 'AMBOS'].includes(tipo.toUpperCase())) {
                    try {
                        const novoContato = await fetchFinanceiroAPI('/contatos', {
                            method: 'POST',
                            body: JSON.stringify({ nome: termoBusca, tipo: tipo.toUpperCase() })
                        });
                        buscaInput.value = novoContato.nome;
                        idInput.value = novoContato.id;
                        if (!contatosGerenciamentoCache.find(c => c.id === novoContato.id)) {
                            contatosGerenciamentoCache.push(novoContato);
                        }
                        mostrarPopupFinanceiro(`Contato "${novoContato.nome}" criado com sucesso!`, 'sucesso');
                        
                        // --- FEEDBACK POSITIVO AO CRIAR ---
                        setAutocompleteStatus(buscaInput, 'success');
                        
                    } catch (err) {
                        // O fetchFinanceiroAPI já lida com o erro, mas podemos limpar o status
                        setAutocompleteStatus(buscaInput, 'error');
                    }
                } else if (tipo !== null) {
                    mostrarPopupFinanceiro('Tipo inválido. A operação foi cancelada.', 'aviso');
                    setAutocompleteStatus(buscaInput, 'error');
                } else {
                    // Usuário cancelou o popup, então limpamos o status
                     setAutocompleteStatus(buscaInput, 'clear');
                }
            } else {
                mostrarPopupFinanceiro(
                    'Você não tem permissão para criar novos favorecidos. Por favor, contate um administrador.',
                    'aviso'
                );
                setAutocompleteStatus(buscaInput, 'error');
            }
        });
        resultadosDiv.appendChild(divNovo);
    }

    // 4. Mensagem de "Nenhum resultado"
    if (!encontrouAlgoParaMostrar) {
        const divNenhum = document.createElement('div');
        divNenhum.className = 'fc-autocomplete-item is-disabled';
        divNenhum.textContent = 'Nenhum contato encontrado.';
        resultadosDiv.appendChild(divNenhum);
    }
    
    // 5. Decide se mostra ou esconde a caixa de resultados
    resultadosDiv.classList.remove('hidden');
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
    // Referências aos principais contêineres de tela
    const viewPrincipal = document.getElementById('viewPrincipal');
    const configView = document.getElementById('configuracoesView');
    const aprovacoesView = document.getElementById('aprovacoesView');
    const historicoView = document.getElementById('historicoView');
    const btnConfig = document.getElementById('btnToggleConfiguracoes');

    // 1. Esconde todas as telas secundárias por padrão
    configView.classList.add('hidden');
    aprovacoesView.classList.add('hidden');
    historicoView.classList.add('hidden');
    
    // Mostra a tela principal
    viewPrincipal.classList.remove('hidden');
    
    // 2. Reseta o botão de configurações para o estado padrão (engrenagem)
    if (btnConfig) {
        btnConfig.title = 'Configurações';
        btnConfig.querySelector('i').className = 'fas fa-cog';
        btnConfig.classList.remove('fechar');
    }

    // 3. Lida com a view específica que foi solicitada
    switch (view) {
        case 'config':
            viewPrincipal.classList.add('hidden');
            configView.classList.remove('hidden');
            btnConfig.querySelector('i').className = 'fas fa-times'; // Muda para 'X'
            btnConfig.classList.add('fechar');
            btnConfig.title = 'Fechar Configurações';
            atualizarBreadcrumbs(['Configurações']);
            break;

        case 'aprovacoes':
            viewPrincipal.classList.add('hidden');
            aprovacoesView.classList.remove('hidden');
            btnConfig.querySelector('i').className = 'fas fa-times'; // Muda para 'X'
            btnConfig.classList.add('fechar');
            btnConfig.title = 'Fechar Aprovações';
            atualizarBreadcrumbs(['Aprovações Pendentes']);
            carregarAprovacoesPendentes(); // Carrega os dados desta tela
            break;

        case 'historico':
            viewPrincipal.classList.add('hidden');
            historicoView.classList.remove('hidden');
            btnConfig.querySelector('i').className = 'fas fa-times'; // Muda para 'X'
            btnConfig.classList.add('fechar');
            btnConfig.title = 'Fechar Histórico';
            atualizarBreadcrumbs(['Histórico de Atividades']);
            carregarLogsAuditoria(); // Carrega os dados desta tela
            break;

        default: // 'main' ou qualquer outro valor
            // Quando voltamos para a tela principal, o breadcrumb deve refletir a aba que está ativa.
            const abaAtivaEl = document.querySelector('.fc-tab-btn.active');
            if (abaAtivaEl) {
                const nomeAba = abaAtivaEl.querySelector('.fc-tab-text').textContent.trim();
                atualizarBreadcrumbs([nomeAba]);
            } else {
                atualizarBreadcrumbs(['Dashboard']); // Fallback seguro
            }
            break;
    }
}

async function carregarAprovacoesPendentes() {
    const container = document.getElementById('aprovacoesContainer');
    container.innerHTML = `<div class="fc-spinner">Buscando solicitações...</div>`;
    try {
        const solicitacoes = await fetchFinanceiroAPI('/aprovacoes-pendentes');
        
        // Log para confirmar que os dados chegaram no frontend
        renderizarCardsAprovacao(solicitacoes);
    } catch (error) {
        // ESTE É O LOG MAIS IMPORTANTE
        console.error("ERRO DETALHADO AO RENDERIZAR APROVAÇÕES:", error);
        container.innerHTML = `<p style="color:red">Erro ao processar solicitações. Verifique o console.</p>`;
    }
}

// Em public/js/admin-financeiro.js

function renderizarCardsAprovacao(solicitacoes) {
    const container = document.getElementById('aprovacoesContainer');
    if (!container) return;

    if (!solicitacoes || solicitacoes.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px;">Nenhuma aprovação pendente no momento.</p>`;
        return;
    }

    const formatarValorExibicao = (chave, valor) => {
        if (valor === null || valor === undefined) return '<i>Não informado</i>';
        switch(chave) {
            case 'valor': case 'valor_estornado': return formatCurrency(valor);
            case 'data_transacao': case 'data_vencimento': return new Date(String(valor).split('T')[0] + 'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
            case 'id_categoria': return formatarCategoriaComGrupo(valor);
            case 'id_conta_bancaria': return contasCache.find(c => c.id == valor)?.nome_conta || `<span style="color:var(--fc-cor-despesa);">Conta Inválida</span>`;
            case 'id_contato': return contatosGerenciamentoCache.find(c => c.id == valor)?.nome || '<i>Nenhum</i>';
            default: return valor || '<i>Vazio</i>';
        }
    };

    const gerarResumoLancamento = (lancamento) => {
        if (!lancamento) return '<p>Dados do lançamento indisponíveis.</p>';
        const dataKey = lancamento.data_transacao ? 'data_transacao' : 'data_vencimento';
        return `
            <ul class="fc-aprovacao-alteracoes-lista">
                <li><span class="label">Valor</span> <div>${formatarValorExibicao('valor', lancamento.valor)}</div></li>
                <li><span class="label">Data</span> <div>${formatarValorExibicao(dataKey, lancamento[dataKey])}</div></li>
                <li><span class="label">Categoria</span> <div>${formatarValorExibicao('id_categoria', lancamento.id_categoria)}</div></li>
                <li><span class="label">Conta</span> <div>${formatarValorExibicao('id_conta_bancaria', lancamento.id_conta_bancaria)}</div></li>
                <li><span class="label">Favorecido</span> <div>${formatarValorExibicao('id_contato', lancamento.id_contato)}</div></li>
            </ul>
        `;
    };

    container.innerHTML = solicitacoes.map(s => {
        const dadosAntigos = s.dados_antigos;
        const dadosNovos = s.dados_novos;
        let cardBodyHtml = '';
        let tipoInfo = { texto: 'Ação Desconhecida', icone: 'fa-question-circle', cor: 'var(--fc-cor-texto-secundario)' };
        
        // Lógica segura para definir o título e a descrição
        const idAlvo = dadosAntigos?.id || 'NOVO';
        let descricaoAlvo = dadosAntigos?.descricao || dadosNovos?.descricao || 'Lançamento Proposto';
        let tituloAlvo = `Lançamento Alvo #${idAlvo}:`;

        switch (s.tipo_solicitacao) {
            case 'EDICAO':
                tipoInfo = { texto: 'Solicitação de Edição', icone: 'fa-pencil-alt', cor: 'var(--fc-cor-primaria)' };
                let alteracoesHtml = '';
                const chaves = ['valor', 'data_transacao', 'descricao', 'id_categoria', 'id_conta_bancaria', 'id_contato'];
                for (const chave of chaves) {
                    if (JSON.stringify(dadosAntigos[chave]) !== JSON.stringify(dadosNovos[chave])) {
                        alteracoesHtml += `
                            <li>
                                <span class="label">${chave.replace('id_', '').replace(/_/g, ' ')}</span>
                                <div class="valores">
                                    <span class="valor-antigo">${formatarValorExibicao(chave, dadosAntigos[chave])}</span>
                                    <span class="seta-indicador">→</span>
                                    <span class="valor-novo">${formatarValorExibicao(chave, dadosNovos[chave])}</span>
                                </div>
                            </li>`;
                    }
                }
                cardBodyHtml = `<ul class="fc-aprovacao-alteracoes-lista">${alteracoesHtml}</ul>`;
                break;

            case 'EXCLUSAO':
                tipoInfo = { texto: 'Solicitação de Exclusão', icone: 'fa-trash-alt', cor: 'var(--fc-cor-despesa)' };
                cardBodyHtml = `<div class="fc-aprovacao-acao-box tipo-exclusao"><h4><i class="fas fa-exclamation-triangle"></i>AÇÃO: Excluir permanentemente este lançamento.</h4></div><p style="margin-top: 15px; font-weight: 500;">Detalhes do lançamento a ser excluído:</p>${gerarResumoLancamento(dadosAntigos)}`;
                break;

            case 'ESTORNO':
                tipoInfo = { texto: 'Solicitação de Estorno', icone: 'fa-undo-alt', cor: 'var(--fc-cor-receita)' };
                cardBodyHtml = `<div class="fc-aprovacao-acao-box tipo-estorno"><h4><i class="fas fa-check-circle"></i>AÇÃO: Registrar Estorno</h4><p>Valor: <strong>${formatarValorExibicao('valor', dadosNovos.valor_estornado)}</strong> | Data: <strong>${formatarValorExibicao('data_transacao', dadosNovos.data_transacao)}</strong> | Conta Destino: <strong>${formatarValorExibicao('id_conta_bancaria', dadosNovos.id_conta_bancaria)}</strong></p></div><p style="margin-top: 15px; font-weight: 500;">Para a despesa original:</p>${gerarResumoLancamento(dadosAntigos)}`;
                break;

            case 'REVERSAO_ESTORNO':
                tipoInfo = { texto: 'Solicitação de Reversão de Estorno', icone: 'fa-history', cor: 'var(--fc-cor-aviso)' };
                tituloAlvo = `Estorno Alvo #${dadosAntigos.id}:`;
                cardBodyHtml = `<div class="fc-aprovacao-acao-box tipo-reversao"><h4><i class="fas fa-info-circle"></i>AÇÃO: Reverter Estorno</h4><p>Isto irá apagar o lançamento de receita (estorno) abaixo e reativar a despesa original (#${dadosAntigos.id_estorno_de}).</p></div><p style="margin-top: 15px; font-weight: 500;">Detalhes do estorno a ser revertido:</p>${gerarResumoLancamento(dadosAntigos)}`;
                break;

             case 'CRIACAO_DATAS_ESPECIAIS':
                tipoInfo = { texto: 'Solicitação de Criação', icone: 'fa-plus-circle', cor: 'var(--fc-cor-receita)' };
                tituloAlvo = `Proposta de Novo Lançamento:`;
                
                // Acessamos 'lancamento_proposto' a partir de 's.dados_novos'
                const proposta = s.dados_novos.lancamento_proposto;
                
                const dadosParaResumo = proposta.tipo_rateio 
                    ? { 
                        ...proposta.dados_pai, 
                        // Corrigindo o cálculo para ser mais seguro
                        valor: (proposta.itens_filho || []).reduce((acc, item) => {
                            const itemValor = item.valor_item || ((item.quantidade || 0) * (item.valor_unitario || 0));
                            return acc + parseFloat(itemValor);
                        }, 0) - (parseFloat(proposta.dados_pai.valor_desconto) || 0)
                      } 
                    : proposta;
                
                descricaoAlvo = dadosParaResumo.descricao || 'Lançamento Proposto';
                
                cardBodyHtml = `
                    <div class="fc-aprovacao-acao-box tipo-reversao"><h4><i class="fas fa-info-circle"></i>AÇÃO: Criar um novo lançamento com data especial.</h4></div>
                    <p style="margin-top: 15px; font-weight: 500;">Detalhes do lançamento proposto:</p>
                    ${gerarResumoLancamento(dadosParaResumo)}
                `;
                break;
        }

        const justificativaHTML = s.justificativa_solicitante ? `<div class="justificativa-solicitante"><strong>Justificativa do Solicitante:</strong><p>${s.justificativa_solicitante}</p></div>` : '';

        return `
        <div class="fc-aprovacao-card">
            <div class="meta-info">
                <span>Solicitado por: <strong>${s.nome_solicitante}</strong></span>
                <span>Em: ${new Date(s.data_solicitacao).toLocaleString('pt-BR')}</span>
            </div>
            <header class="fc-aprovacao-card-header">
                <h3 class="tipo-solicitacao" style="color:${tipoInfo.cor};"><i class="fas ${tipoInfo.icone}"></i> ${tipoInfo.texto}</h3>
                <h2 class="descricao-alvo"><span>${tituloAlvo}</span> ${descricaoAlvo}</h2>
            </header>
            <div class="fc-aprovacao-card-body">${cardBodyHtml}</div>
            ${justificativaHTML}
            <div class="acoes-aprovacao">
                <button class="fc-btn fc-btn-secundario btn-rejeitar" data-id="${s.id}"><i class="fas fa-times"></i> Rejeitar</button>
                <button class="fc-btn fc-btn-primario btn-aprovar" data-id="${s.id}"><i class="fas fa-check"></i> Aprovar</button>
            </div>
        </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-aprovar').forEach(btn => btn.addEventListener('click', (e) => aprovarSolicitacao(e.currentTarget.dataset.id)));
    container.querySelectorAll('.btn-rejeitar').forEach(btn => btn.addEventListener('click', (e) => rejeitarSolicitacao(e.currentTarget.dataset.id)));
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
        atualizarSaldosDashboard();
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

function atualizarBreadcrumbs(partes) {
    const container = document.getElementById('breadcrumbContainer');
    if (!container) return;

    let html = '<a href="/admin/financeiro.html">Financeiro</a>';
    partes.forEach((parte, index) => {
        html += `<span class="separator">></span>`;
        if (index === partes.length - 1) {
            html += `<span class="active">${parte}</span>`; // Última parte é ativa
        } else {
            // No futuro, podemos adicionar links aqui se necessário
            html += `<span>${parte}</span>`;
        }
    });
    container.innerHTML = html;
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
    
    const nomeAba = abaAtiva.charAt(0).toUpperCase() + abaAtiva.slice(1);
    atualizarBreadcrumbs([nomeAba]);

    // Dispara um evento global que o React pode ouvir
    window.dispatchEvent(new CustomEvent('abaFinanceiroAlterada', { detail: { nomeAba: nomeAba } }));

    // Renderiza o conteúdo da aba que se tornou ativa
    switch (abaAtiva) {
        case 'dashboard':
            // O dashboard já foi renderizado na inicialização, não precisa fazer nada.
            break;
        case 'lancamentos':
            prepararAbaLancamentos();
            break;
        case 'agenda':
        // Só carrega se o container estiver vazio (primeira vez que abre a aba)
        const agendaContainer = document.getElementById('agendaContainer');
        if (agendaContainer && agendaContainer.innerHTML.trim() === '') {
            carregarContasAgendadas();
        }
        break;
    }
    gerenciarVisibilidadeFABs(abaAtiva);

}

function gerenciarVisibilidadeFABs(abaAtiva) {
    const fabLancamento = document.getElementById('btnNovoLancamento');
    const fabTransferencia = document.getElementById('btnNovaTransferencia');
    const fabAgenda = document.getElementById('btnNovoAgendamentoFab');

    // Esconde todos por padrão
    fabLancamento?.classList.add('hidden');
    fabTransferencia?.classList.add('hidden');
    fabAgenda?.classList.add('hidden');

    // Mostra os botões corretos com base na aba
    switch (abaAtiva) {
        case 'lancamentos':
            fabLancamento?.classList.remove('hidden');
            fabTransferencia?.classList.remove('hidden');
            break;
        case 'agenda':
            fabAgenda?.classList.remove('hidden');
            break;
        case 'dashboard':
            // Nenhum botão aparece no dashboard
            break;
    }
}

async function abrirModalTransferencia() {
    itemEmEdicao = null;
    const titulo = "Transferir Dinheiro Entre Contas";
    const hoje = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    // Verifica se há contas suficientes para a operação
    if (contasCache.length < 2) {
        mostrarPopupFinanceiro('Você precisa ter pelo menos duas contas bancárias cadastradas para realizar uma transferência.', 'aviso');
        return;
    }

    // --- BUSCA OS DADOS MAIS RECENTES, INCLUINDO SALDOS ---
    let contasComSaldos = [];
    try {
        const spinnerDiv = document.createElement('div');
        spinnerDiv.className = 'fc-popup-overlay';
        spinnerDiv.innerHTML = `<div class="fc-spinner" style="background:white; padding:20px; border-radius:8px;"><span>Calculando saldos...</span></div>`;
        document.body.appendChild(spinnerDiv);

        const dashboardData = await fetchFinanceiroAPI('/dashboard');
        contasComSaldos = dashboardData.saldos;
        
        document.body.removeChild(spinnerDiv);
    } catch (error) {
        const spinnerDiv = document.querySelector('.fc-popup-overlay');
        if (spinnerDiv) document.body.removeChild(spinnerDiv);
        
        mostrarPopupFinanceiro('Não foi possível obter os saldos das contas. Tente novamente.', 'erro');
        return;
    }

    // --- Monta o HTML do Modal usando os dados FRESCOS de 'contasComSaldos' ---
    const modalHTML = `
        <div id="modal-transferencia" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button id="fecharModal" class="fc-modal-close"><i class="fas fa-times"></i></button>
                <h3 class="fc-section-title" style="text-align:center; border:0;">${titulo}</h3>
                
                <div class="fc-modal-body">
                    <form id="formTransferencia">
                        <div class="fc-form-group">
                            <label for="transf_valor">Valor da Transferência (R$)*</label>
                            <input type="number" id="transf_valor" class="fc-input" step="0.01" min="0.01" required>
                        </div>
                        <div class="fc-form-group">
                            <label for="transf_data">Data da Transferência*</label>
                            <input type="date" id="transf_data" class="fc-input" value="${hoje}" required>
                        </div>
                        <div class="fc-form-group">
                            <label for="transf_conta_origem">SAINDO DE (Origem)*</label>
                            <select id="transf_conta_origem" class="fc-select" required>
                                <option value="">Selecione a conta de saída...</option>
                                ${contasComSaldos.map(c => `<option value="${c.id}">${c.nome_conta} (Saldo: ${formatCurrency(c.saldo_atual)})</option>`).join('')}
                            </select>
                        </div>
                        <div class="fc-form-group">
                            <label for="transf_conta_destino">INDO PARA (Destino)*</label>
                            <select id="transf_conta_destino" class="fc-select" required>
                                <option value="">Selecione a conta de entrada...</option>
                                ${contasComSaldos.map(c => `<option value="${c.id}">${c.nome_conta}</option>`).join('')}
                            </select>
                        </div>
                         <div class="fc-form-group">
                            <label for="transf_descricao">Descrição / Observação</label>
                            <textarea id="transf_descricao" class="fc-input" rows="2" placeholder="Ex: Cobertura de despesas"></textarea>
                        </div>
                    </form>
                </div>

                <div class="fc-modal-footer">
                    <button type="button" id="btnCancelarModal" class="fc-btn fc-btn-secundario">Cancelar</button>
                    <button type="button" id="btnConfirmarTransferencia" class="fc-btn fc-btn-primario">Confirmar Transferência</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // --- Lógica de Validação Inteligente do Select ---
    const selectOrigem = document.getElementById('transf_conta_origem');
    const selectDestino = document.getElementById('transf_conta_destino');

    const atualizarDestino = () => {
        const idOrigem = selectOrigem.value;
        Array.from(selectDestino.options).forEach(opt => opt.disabled = false);
        if (idOrigem) {
            const optParaDesabilitar = selectDestino.querySelector(`option[value="${idOrigem}"]`);
            if (optParaDesabilitar) optParaDesabilitar.disabled = true;
        }
        if (selectDestino.value === idOrigem) {
            selectDestino.value = '';
        }
    };

    selectOrigem.addEventListener('change', atualizarDestino);

    // --- Listeners de Controle ---
    document.getElementById('fecharModal').addEventListener('click', fecharModal);
    document.getElementById('btnCancelarModal').addEventListener('click', fecharModal);
    document.getElementById('btnConfirmarTransferencia').addEventListener('click', salvarTransferencia);
}

async function salvarTransferencia() {
    const btnSalvar = document.getElementById('btnConfirmarTransferencia');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    try {
        const categoriaTransferencia = categoriasCache.find(c => c.nome === 'Transferência entre Contas');
        if (!categoriaTransferencia) {
            mostrarPopupFinanceiro('Erro: Categoria "Transferência entre Contas" não encontrada. Por favor, cadastre-a nas configurações.', 'erro');
            return;
        }

        const payload = {
            id_conta_origem: document.getElementById('transf_conta_origem').value,
            id_conta_destino: document.getElementById('transf_conta_destino').value,
            valor: parseFloat(document.getElementById('transf_valor').value),
            data_transacao: document.getElementById('transf_data').value,
            descricao: document.getElementById('transf_descricao').value,
            id_categoria_transferencia: categoriaTransferencia.id
        };

        if (!payload.id_conta_origem || !payload.id_conta_destino || !payload.valor) {
            mostrarPopupFinanceiro('Por favor, preencha todos os campos obrigatórios (*).', 'aviso');
            return;
        }

        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Transferindo...`;
        
        await fetchFinanceiroAPI('/transferencias', { method: 'POST', body: JSON.stringify(payload) });
        
        mostrarPopupFinanceiro('Transferência realizada com sucesso!', 'sucesso');
        fecharModal();
        
        atualizarSaldosDashboard();
        carregarLancamentosFiltrados();
        
    } catch (error) {
        // O fetchFinanceiroAPI já mostra o erro
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
}

function setupEventListenersFinanceiro() {
    // --- NAVEGAÇÃO PRINCIPAL (ABAS E VIEWS) ---
    document.querySelectorAll('.fc-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => mudarAba(btn.dataset.tab));
    });

    const btnToggleConfig = document.getElementById('btnToggleConfiguracoes');
    btnToggleConfig?.addEventListener('click', () => {
        if (btnToggleConfig.classList.contains('fechar')) {
            gerenciarNavegacaoPrincipal('main');
        } else {
            gerenciarNavegacaoPrincipal('config');
        }
    });

    const btnAprovacoes = document.getElementById('btnIrParaAprovacoes');
    if (permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira')) {
        btnAprovacoes?.addEventListener('click', () => gerenciarNavegacaoPrincipal('aprovacoes'));
    } else {
        btnAprovacoes?.classList.add('fc-btn-disabled');
        btnAprovacoes?.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para acessar esta área.', 'aviso'));
    }

    const btnHistorico = document.getElementById('btnIrParaHistorico');
    if (permissoesGlobaisFinanceiro.includes('aprovar-alteracao-financeira')) {
        btnHistorico?.addEventListener('click', () => gerenciarNavegacaoPrincipal('historico'));
    } else {
        btnHistorico?.classList.add('fc-btn-disabled');
        btnHistorico?.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para ver o histórico.', 'aviso'));
    }

    document.querySelector('.fc-config-menu')?.addEventListener('click', (e) => {
        if (e.target.matches('.fc-config-menu-item')) {
            e.preventDefault();
            mudarPainelConfig(e.target.dataset.config);
        }
    });

            // Listener para o menu "Mais Ações" no mobile
        const btnMaisAcoes = document.getElementById('btnMaisAcoes');
        const menuMaisAcoes = document.getElementById('menuMaisAcoesDropdown');

        btnMaisAcoes?.addEventListener('click', (e) => {
            e.stopPropagation(); // Impede que o click feche o menu imediatamente
            menuMaisAcoes.classList.toggle('hidden');
        });

        // Listener para fechar o dropdown se clicar fora
        document.addEventListener('click', (e) => {
            if (!btnMaisAcoes?.contains(e.target) && !menuMaisAcoes?.contains(e.target)) {
                menuMaisAcoes?.classList.add('hidden');
            }
        });

        // Listener para o botão de pagamentos desativado
        document.getElementById('btnPagamentosFuncionarios')?.addEventListener('click', () => {
            mostrarPopupFinanceiro('Esta funcionalidade está em desenvolvimento.', 'info');
        });

    // --- LÓGICA DE AUTOCOMPLETE CORRIGIDA E REFINADA ---
    document.addEventListener('input', debounce(async (e) => {
        if (e.target.matches('.fc-autocomplete-input')) {
            const buscaInput = e.target;
            
            setAutocompleteStatus(buscaInput, 'clear');

            const container = buscaInput.closest('.fc-autocomplete-container');
            if (!container) return;
            const resultadosDiv = container.querySelector('.fc-autocomplete-results');
            const idInput = container.querySelector('.fc-autocomplete-id');
            if (!resultadosDiv || !idInput) return;

            idInput.value = '';

            const termo = buscaInput.value.trim();
            if (termo.length < 2) {
                resultadosDiv.classList.add('hidden');
                return;
            }
            try {
                const resultados = await fetchFinanceiroAPI(`/contatos?q=${encodeURIComponent(termo)}`);
                renderizarResultadosAutocomplete(resultados, termo, resultadosDiv, buscaInput, idInput);
            } catch (err) {
                console.error("Falha na busca do autocomplete:", err);
            }
        }
    }, 150)); 

    const dashboardTab = document.getElementById('tab-dashboard');
    dashboardTab?.addEventListener('click', (e) => {
        const btnAtualizar = e.target.closest('#btnAtualizarSaldos');
        if (btnAtualizar && !btnAtualizar.disabled) {
            // Adiciona a animação de rotação e desabilita o botão
            const icon = btnAtualizar.querySelector('i');
            icon.style.animation = 'fc-spin 1.2s linear infinite';
            btnAtualizar.disabled = true;

            // Chama a função que já temos (que mostra o spinner principal e busca os dados)
            atualizarSaldosDashboard().finally(() => {
                // Garante que a animação pare e o botão seja reabilitado, mesmo se der erro
                icon.style.animation = '';
                btnAtualizar.disabled = false;
            });
        }
    });
    
    document.addEventListener('focusout', (e) => {
        if (e.target.matches('.fc-autocomplete-input')) {
            const buscaInput = e.target;
            const container = buscaInput.closest('.fc-autocomplete-container');
            if (!container) return;
            const idInput = container.querySelector('.fc-autocomplete-id');

            if (buscaInput.value.trim() !== '' && !idInput.value) {
                setAutocompleteStatus(buscaInput, 'error');
            } else if (buscaInput.value.trim() === '') {
                setAutocompleteStatus(buscaInput, 'clear');
            }
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.fc-autocomplete-container')) {
            document.querySelectorAll('.fc-autocomplete-results').forEach(div => {
               div.classList.add('hidden');
            });
        }
    });

    document.getElementById('btnNovaTransferencia')?.addEventListener('click', abrirModalTransferencia);
    
    const tabAgenda = document.getElementById('tab-agenda');
    tabAgenda?.addEventListener('click', (e) => {
        if (e.target.closest('#btnAtualizarAgenda')) {
            carregarContasAgendadas();
        }
    });

    // --- BOTÕES DE AÇÃO GLOBAIS (FAB E AGENDA) ---
    const btnNovoLancamento = document.getElementById('btnNovoLancamento');
    if (permissoesGlobaisFinanceiro.includes('lancar-transacao')) {
        btnNovoLancamento?.addEventListener('click', () => {
            if (window.renderReactModal) {
                window.renderReactModal({
                    ...modalBaseProps,
                    isOpen: true,
                    onClose: () => window.renderReactModal({ ...modalBaseProps, isOpen: false }),
                    lancamentoParaEditar: null
                });
            }
        });
    } else {
        btnNovoLancamento?.classList.add('fc-btn-disabled');
        btnNovoLancamento?.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para criar lançamentos.', 'aviso'));
    }

    const btnAgendarFab = document.getElementById('btnNovoAgendamentoFab');
    if(permissoesGlobaisFinanceiro.includes('lancar-transacao')) {
        btnAgendarFab?.addEventListener('click', () => abrirModalAgendamento());
    } else {
        btnAgendarFab?.classList.add('fc-btn-disabled');
        btnAgendarFab?.addEventListener('click', () => mostrarPopupFinanceiro('Você não tem permissão para agendar contas.', 'aviso'));
    }

    // --- PAINEL DE NOTIFICAÇÕES (Caixa de Entrada) ---
    const btnNotificacoes = document.getElementById('btnNotificacoes');
    btnNotificacoes?.addEventListener('click', (e) => {
        e.stopPropagation();
        const painel = document.getElementById('painelNotificacoes');
        painel.classList.toggle('hidden');
        if (!painel.classList.contains('hidden')) {
            carregarNotificacoes();
        }
    });

    document.getElementById('btnMarcarTodasComoLidas')?.addEventListener('click', (e) => {
        e.stopPropagation();
        marcarTodasComoLidas();
    });

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
        tabLancamentos.addEventListener('click', (e) => {
            if (e.target.closest('#btnAtualizarLancamentos')) {
                carregarLancamentosFiltrados(filtrosAtivos.page || 1, filtrosAtivos);
            }
            if (e.target.closest('#btnToggleFiltrosAvancados')) {
                document.getElementById('filtrosLancamentos').classList.toggle('hidden');
            }
            if (e.target.closest('#btnLimparFiltros')) {
                document.getElementById('filtrosLancamentos').reset();
                document.getElementById('filtroBuscaRapida').value = '';
                filtrosAtivos = {};
                carregarLancamentosFiltrados(1);
            }
        });

        const formFiltros = document.getElementById('filtrosLancamentos');
        formFiltros?.addEventListener('change', (e) => {
            // <<< A CORREÇÃO DA BUSCA DUPLICADA ESTÁ AQUI >>>
            if (!e.isTrusted) return; 
            
            const formData = new FormData(formFiltros);
            filtrosAtivos = Object.fromEntries(formData.entries());
            filtrosAtivos.termoBusca = document.getElementById('filtroBuscaRapida').value.trim();
            for (const key in filtrosAtivos) { if (!filtrosAtivos[key]) delete filtrosAtivos[key]; }
            carregarLancamentosFiltrados(1);
        });

        const buscaRapidaInput = document.getElementById('filtroBuscaRapida');
        buscaRapidaInput?.addEventListener('input', debounce((e) => {
             // Adicionamos a verificação aqui também por segurança
            if (!e.isTrusted) {
                return;
            }
            
            const formData = new FormData(formFiltros);
            filtrosAtivos = Object.fromEntries(formData.entries());
            filtrosAtivos.termoBusca = buscaRapidaInput.value.trim();
            for (const key in filtrosAtivos) { if (!filtrosAtivos[key]) delete filtrosAtivos[key]; }
            carregarLancamentosFiltrados(1);
        }, 500));
    }
}


async function inicializarPaginaFinanceiro() {
    console.log('[Financeiro] Inicializando página...');
    
    // Configura listeners e estado inicial da UI que não dependem de dados
    setupEventListenersFinanceiro();
    gerenciarNavegacaoPrincipal('main');
    mudarAba('dashboard');
    mudarPainelConfig('contas'); // Isso pode ser ajustado, mas por enquanto ok

    // FASE 1: Carregamento Rápido do Dashboard
    try {
        console.log('[Financeiro] Fase 1: Carregando dados do dashboard...');
        // Mostra um "esqueleto" de carregamento enquanto busca os dados
        const saldosContainer = document.getElementById('saldosContainer');
        if (saldosContainer) {
            saldosContainer.innerHTML = `
                <div class="fc-resumo-total-card" style="height: 100px; background-color: #f0f0f0;"></div>
                <div class="fc-contas-grid">
                    <div class="fc-conta-card" style="height: 160px; background-color: #f0f0f0;"></div>
                    <div class="fc-conta-card" style="height: 160px; background-color: #f0f0f0;"></div>
                </div>
            `;
        }
        
        const dashboardData = await fetchFinanceiroAPI('/dashboard');
        renderizarDashboard(dashboardData.saldos, dashboardData.alertas);
        console.log('[Financeiro] Fase 1: Dashboard renderizado.');
    } catch (error) {
        console.error('Erro ao carregar dados do dashboard:', error);
        const saldosContainer = document.getElementById('saldosContainer');
        if(saldosContainer) saldosContainer.innerHTML = `<p style="color:red; text-align:center;">Falha ao carregar saldos.</p>`;
    }

    // FASE 2: Carregamento em Segundo Plano do Restante dos Dados
    // Esta parte executa sem bloquear a interação do usuário com o dashboard
    console.log('[Financeiro] Fase 2: Carregando dados secundários em segundo plano...');
    try {
        const promessasDeDados = [
            fetchFinanceiroAPI('/configuracoes'),
            fetchFinanceiroAPI('/lancamentos?limit=8'), // Busca a primeira página de lançamentos
            fetchFinanceiroAPI('/contatos/all'),
        ];

        const [
            configData, 
            lancamentosData, 
            contatosData
        ] = await Promise.all(promessasDeDados);

        // Armazena os dados nos caches globais
        contasCache = configData.contas;
        gruposCache = configData.grupos;
        categoriasCache = configData.categorias;
        lancamentosCache = lancamentosData.lancamentos;
        contatosGerenciamentoCache = contatosData;
        filtrosAtivos.total = lancamentosData.total;
        
        console.log('[Financeiro] Fase 2: Dados secundários carregados.');

        modalBaseProps = {
            contas: contasCache,
            categorias: categoriasCache,
            grupos: gruposCache,
            permissoes: permissoesGlobaisFinanceiro
        };

        // FASE 3: Renderiza os componentes que dependem dos dados secundários
        // Essas funções são rápidas pois os dados já estão em cache
        prepararAbaLancamentos(); // Popula os filtros da aba e faz a primeira renderização dos cards
        renderizarTabelaContas(); // Popula a tabela na tela de configurações
        renderizarTabelaCategoriasAgrupadas();
        renderizarTabelaContatosGerenciamento();

    } catch (error) {
        console.error('Erro ao carregar dados secundários:', error);
        mostrarPopupFinanceiro('Erro ao carregar alguns dados da página. Tente recarregar.', 'erro');
    }

    // FASE 4: Carregamentos assíncronos finais (não críticos)
    // Eles rodam por último e atualizam a interface quando terminam
    atualizarBadgesHeader(); // Busca notificações e aprovações
    carregarContasAgendadas(); // Busca os dados da agenda

    console.log('[Financeiro] Página inicializada com sucesso.');

    // FASE 5: Ajustes Finais da Interface com base nas permissões
    if (permissoesGlobaisFinanceiro.includes('permite-excluir-agendamentos')) {
        document.getElementById('nav-admin-tools')?.classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/financeiro.html', ['acesso-financeiro']);
        if (!auth) return; 

        permissoesGlobaisFinanceiro = auth.permissoes || [];
        usuarioLogadoFinanceiro = auth.usuario;

        // Adiciona a classe para remover o estado de 'loading' ou mostrar o conteúdo
        document.body.classList.add('autenticado');
        
        // Chama a função de inicialização principal
        inicializarPaginaFinanceiro();

        console.log('[Carregamento] Lógica do JS Legado está pronta.');
        legacyJsReady = true;
        esconderSpinnerGlobalSePronto();

    } catch (error) {
        console.error('[Financeiro DOMContentLoaded] Erro:', error);
        // Você pode adicionar um feedback de erro na própria página aqui se desejar
    }
});

// Atualiza o dashboard quando o usuário volta para a aba do navegador
document.addEventListener('visibilitychange', () => {
    // Verifica se a página se tornou visível novamente
    if (document.visibilityState === 'visible') {
        // E se o dashboard é a aba ativa no momento
        const dashboardTab = document.getElementById('tab-dashboard');
        if (dashboardTab && dashboardTab.classList.contains('active')) {
            console.log('[Dashboard] Aba reativada, atualizando saldos...');
            atualizarSaldosDashboard();
        }
    }
});

function renderizarTabelaAgenda() {
    const container = document.getElementById('agendaContainer');
    if (!container) return;
    const podeBaixar = permissoesGlobaisFinanceiro.includes('aprovar-pagamento');
    const podeEditarExcluir = permissoesGlobaisFinanceiro.includes('lancar-transacao');

    // O cache agora é um array de grupos. Ex: [[conta1, conta2], [conta3_avulsa]]
    if (contasAgendadasCache.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding: 20px;">Nenhuma conta pendente na agenda.</p>`;
        return;
    }

    let htmlFinal = '';
    // <<< MUDANÇA: Itera diretamente sobre os grupos recebidos da API >>>
    for (const itensDoGrupo of contasAgendadasCache) {
        if (!itensDoGrupo || itensDoGrupo.length === 0) continue;

        const primeiroItem = itensDoGrupo[0];
        const chave = primeiroItem.id_lote || `avulso_${primeiroItem.id}`;

        if (primeiroItem.id_lote) {
            // A lógica para renderizar um LOTE permanece a mesma
            const descricaoGrupo = primeiroItem.descricao.split(' - Parcela')[0] || 'Lote de Parcelas';
            const valorTotalGrupo = itensDoGrupo.reduce((soma, item) => soma + parseFloat(item.valor), 0);
            const hoje = new Date(); hoje.setHours(0,0,0,0);
            const proximoVencimento = new Date(primeiroItem.data_vencimento.split('T')[0] + 'T00:00:00');
            const isAtrasado = proximoVencimento < hoje;
            
            const detalhesParcelasHtml = `
                <div class="fc-lancamento-itens-container hidden" id="agenda-itens-${chave}">
                    <div class="item-detalhe-grid">
                        <div class="item-detalhe-header" style="grid-template-columns: 1fr 1fr 1fr 1fr;">
                            <div>Parcela</div>
                            <div>Vencimento</div>
                            <div>Valor</div>
                            <div>Ação</div>
                        </div>
                        ${itensDoGrupo.map(c => `
                            <div class="item-detalhe-row" style="grid-template-columns: 1fr 1fr 1fr 1fr;">
                                <div data-label="Parcela">${c.descricao.split(' - ')[1] || 'N/A'}</div>
                                <div data-label="Vencimento">${new Date(c.data_vencimento.split('T')[0] + 'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</div>
                                <div data-label="Valor">${formatCurrency(c.valor)}</div>
                                <div data-label="Ação">
                                    <button class="fc-btn fc-btn-primario btn-dar-baixa" data-id="${c.id}" ${podeBaixar ? '' : 'disabled'} style="padding: 5px 10px; font-size: 0.8rem;">Baixar</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;

            htmlFinal += `
                <div class="fc-agenda-card-wrapper">
                    <div class="fc-agenda-card pagar ${isAtrasado ? 'atrasado' : ''}" data-lote="true">
                         <div class="card-main-line">
                            <div class="main-info">
                                <span class="lancamento-id">Lote #${primeiroItem.id_lote}</span>
                                <div class="descricao-lote-editavel">
                                    <span class="descricao">${descricaoGrupo}</span>
                                    <button class="fc-btn-icon-discreto btn-editar-descricao-lote" data-lote-id="${primeiroItem.id_lote}" data-descricao-atual="${descricaoGrupo}" title="Editar descrição do lote"><i class="fas fa-pencil-alt"></i></button>
                                </div>
                            </div>
                            <span class="valor">${formatCurrency(valorTotalGrupo)}</span>
                        </div>
                        <div class="card-details">
                            <span class="detail-item"><b>Favorecido:</b> ${primeiroItem.nome_favorecido || '-'}</span>
                            <span class="detail-item"><b>Parcelas:</b> ${itensDoGrupo.length} pendentes</span>
                            <span class="detail-item"><b>Próx. Venc.:</b> ${proximoVencimento.toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                        </div>
                        <div class="card-meta-line">
                            <div class="meta-info"><span class="detail-item"><b>Agendado por:</b> ${primeiroItem.nome_usuario_agendamento || 'N/A'}</span></div>
                            <div class="actions">
                                <button class="fc-btn-icon btn-toggle-agenda-details" data-id="${chave}" title="Ver Parcelas"><i class="fas fa-chevron-down"></i></button>
                            </div>
                        </div>
                    </div>
                    ${detalhesParcelasHtml}
                </div>`;
        } else { 
            // A lógica para renderizar um item AVULSO também permanece a mesma
            const c = primeiroItem;
            const isDetalhado = c.itens && c.itens.length > 0;
            let categoriaExibida = c.nome_categoria || 'Sem Categoria';
            if (isDetalhado) {
                if (c.tipo_rateio === 'COMPRA') categoriaExibida = 'Compra Detalhada (Ag.)';
                else if (c.tipo_rateio === 'DETALHADO') categoriaExibida = `Rateio: ${c.nome_categoria}`;
                else categoriaExibida = 'Rateio Agendado';
            }
            const tipoClasse = c.tipo === 'A_PAGAR' ? 'pagar' : 'receber';
            const hoje = new Date(); hoje.setHours(0,0,0,0);
            const vencimento = new Date(c.data_vencimento.split('T')[0] + 'T00:00:00');
            const isAtrasado = vencimento < hoje;
            let detalhesHtml = '';
            if (isDetalhado) {
                const isRateioDetalhado = c.tipo_rateio === 'DETALHADO';
                const headerCols = isRateioDetalhado ? ['Favorecido', 'Categoria', 'Descrição', 'Valor'] : ['Categoria', 'Descrição', 'Valor'];
                const itemRows = c.itens.map(item => `
                    <div class="item-detalhe-row">
                        ${isRateioDetalhado ? `<div data-label="Favorecido">${item.nome_contato_item || '-'}</div>` : ''}
                        <div data-label="Categoria">${item.nome_categoria || '-'}</div>
                        <div data-label="Descrição">${item.descricao_item || '-'}</div>
                        <div data-label="Valor">${formatCurrency(item.valor_item)}</div>
                    </div>
                `).join('');
                detalhesHtml = `<div class="fc-lancamento-itens-container hidden" id="agenda-itens-${c.id}"><div class="item-detalhe-grid"><div class="item-detalhe-header">${headerCols.map(col => `<div>${col}</div>`).join('')}</div>${itemRows}</div></div>`;
            }
            
            htmlFinal += `
            <div class="fc-agenda-card-wrapper">
                <div class="fc-agenda-card ${tipoClasse} ${isAtrasado ? 'atrasado' : ''}" data-rateio-tipo="${c.tipo_rateio || (isDetalhado ? 'COMPRA' : '')}">
                    <div class="card-main-line">
                        <div class="main-info"><span class="lancamento-id">Agend. #${c.id}</span><span class="descricao">${c.descricao}</span></div>
                        <span class="valor">${formatCurrency(c.valor)}</span>
                    </div>
                    <div class="card-details">
                        <span class="detail-item"><b>Favorecido:</b> ${c.nome_favorecido || '-'}</span>
                        <span class="detail-item"><b>Categoria:</b> ${categoriaExibida}</span>
                        <span class="detail-item"><b>Vencimento:</b> ${vencimento.toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                    </div>
                    <div class="card-meta-line">
                        <div class="meta-info">
                            <span class="detail-item"><b>Agendado por:</b> ${c.nome_usuario_agendamento || 'N/A'}</span>
                            ${c.nome_usuario_edicao ? `
                                <span class="detail-item" title="Última edição em ${new Date(c.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}">
                                    <i class="fas fa-history" style="color: var(--fc-cor-aviso);"></i>
                                    <b>Editado por:</b> ${c.nome_usuario_edicao}
                                </span>
                            ` : ''}
                        </div>
                        <div class="actions">
                            <div class="actions-main-group">
                                <div class="actions-secondary">
                                    <button class="fc-btn fc-btn-outline btn-editar-agendamento" data-id="${c.id}" ${podeEditarExcluir ? '' : 'disabled'} title="Editar"><i class="fas fa-pencil-alt"></i></button>
                                    <button class="fc-btn fc-btn-outline btn-excluir-agendamento" data-id="${c.id}" ${podeEditarExcluir ? '' : 'disabled'} title="Excluir"><i class="fas fa-trash"></i></button>
                                </div>
                                <button class="fc-btn fc-btn-primario btn-dar-baixa" data-id="${c.id}" ${podeBaixar ? '' : 'disabled'} title="Dar Baixa"><i class="fas fa-check"></i> Baixar</button>
                            </div>
                            ${isDetalhado ? `<button class="fc-btn-icon btn-toggle-agenda-details" data-id="${c.id}" title="Ver Detalhes"><i class="fas fa-chevron-down"></i></button>` : ''}
                        </div>
                    </div>
                </div>
                ${detalhesHtml}
            </div>`;
        }
    }

    container.innerHTML = htmlFinal;

    // A lógica para adicionar os LISTENERS permanece exatamente a mesma
    container.querySelectorAll('.btn-dar-baixa:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            // Para encontrar a conta, agora precisamos buscar dentro dos grupos
            let conta = null;
            for (const grupo of contasAgendadasCache) {
                conta = grupo.find(c => c.id == id);
                if (conta) break;
            }
            if (conta) abrirModalBaixa(conta);
        });
    });

    container.querySelectorAll('.btn-editar-agendamento:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            let conta = null;
            for (const grupo of contasAgendadasCache) {
                conta = grupo.find(c => c.id == id);
                if (conta) break;
            }
            if (conta) abrirModalAgendamento(conta);
        });
    });
    
    container.querySelectorAll('.btn-excluir-agendamento:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            excluirAgendamento(id);
        });
    });

    container.querySelectorAll('.btn-editar-descricao-lote:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.loteId;
            const desc = e.currentTarget.dataset.descricaoAtual;
            editarDescricaoLote(id, desc);
        });
    });

    container.querySelectorAll('.btn-toggle-agenda-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            document.getElementById(`agenda-itens-${id}`).classList.toggle('hidden');
            const icon = e.currentTarget.querySelector('i');
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        });
    });
}

async function editarDescricaoLote(idLote, descricaoAtual) {
    const novaDescricao = await mostrarPopupComInput('Digite a nova descrição base para o lote:', descricaoAtual);
    if (novaDescricao && novaDescricao.trim() !== '' && novaDescricao !== descricaoAtual) {
        try {
            await fetchFinanceiroAPI(`/lotes/${idLote}/descricao`, {
                method: 'PUT',
                body: JSON.stringify({ nova_descricao_base: novaDescricao })
            });
            mostrarPopupFinanceiro('Descrição do lote atualizada com sucesso!', 'sucesso');
            carregarContasAgendadas();
        } catch (error) {
            // erro já tratado
        }
    }
}

async function excluirAgendamento(id) {
    const confirmado = await mostrarPopupConfirmacao('Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.');
    if (!confirmado) return;

    try {
        await fetchFinanceiroAPI(`/contas-agendadas/${id}`, { method: 'DELETE' });
        mostrarPopupFinanceiro('Agendamento excluído com sucesso!', 'sucesso');
        carregarContasAgendadas(); // Recarrega a lista
    } catch (error) {
        // fetchFinanceiroAPI já lida com o popup de erro
    }
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
            renderizarTabelaContatosGerenciamento();
            break;
        case 'categorias': 
            renderizarTabelaCategoriasAgrupadas(); 
            break;
        case 'taxas-vt':
            carregarErenderizarConcessionarias(); 
            break;
        case 'admin-tools':
            renderizarFerramentasAdmin();
            break;
    }
}

function renderizarFerramentasAdmin() {
    const container = document.getElementById('config-admin-tools');
    if (!container) return;

    container.innerHTML = `
        <div class="fc-card" style="border-color: var(--fc-cor-despesa);">
            <h3 class="fc-section-title">Excluir Agendamento Permanentemente</h3>
            <p class="fc-texto-aviso" style="margin-bottom: 20px;">
                <i class="fas fa-exclamation-triangle"></i> 
                Esta ação remove um agendamento de forma definitiva, mesmo que já tenha sido baixado. O lançamento efetivado (se houver) <strong>não</strong> será alterado. Use com extremo cuidado.
            </p>
            <div class="fc-form-row" style="align-items: flex-end;">
                <div class="fc-form-group" style="flex-grow: 1;">
                    <label for="admin-agendamento-id">ID do Agendamento</label>
                    <input type="text" id="admin-agendamento-id" class="fc-input" placeholder="Digite o ID numérico, ex: 123">
                </div>
                <button id="btn-buscar-agendamento" class="fc-btn fc-btn-primario" style="margin-bottom: 1rem;">Buscar</button>
            </div>
            <div id="admin-confirmacao-area" style="margin-top: 20px;"></div>
        </div>
    `;

    document.getElementById('btn-buscar-agendamento').addEventListener('click', buscarAgendamentoParaExcluir);
}

// Função chamada pelo botão "Buscar"
async function buscarAgendamentoParaExcluir() {
    const input = document.getElementById('admin-agendamento-id');
    const confirmacaoArea = document.getElementById('admin-confirmacao-area');
    const id = input.value.trim().replace('#', '');

    if (!id || isNaN(id)) {
        mostrarPopupFinanceiro('Por favor, insira um ID numérico válido.', 'aviso');
        return;
    }

    confirmacaoArea.innerHTML = `<div class="fc-spinner-container" style="min-height: 100px;"><div class="fc-spinner-dots">...</div></div>`;

    try {
        const agendamento = await fetchFinanceiroAPI(`/contas-agendadas/info/${id}`);
        
        confirmacaoArea.innerHTML = `
            <div class="fc-confirmacao-box">
                <h4>Confirmar Exclusão</h4>
                <p><strong>ID:</strong> #${agendamento.id}</p>
                <p><strong>Descrição:</strong> ${agendamento.descricao}</p>
                <p><strong>Valor:</strong> ${formatCurrency(agendamento.valor)}</p>
                <p><strong>Status:</strong> ${agendamento.status} ${agendamento.id_lancamento_efetivado ? `(Lançamento #${agendamento.id_lancamento_efetivado})` : ''}</p>
                <button id="btn-confirmar-exclusao-force" class="fc-btn" style="background-color: var(--fc-cor-despesa); width: 100%; margin-top: 15px;">
                    <i class="fas fa-trash-alt"></i> Excluir Permanentemente o Agendamento #${agendamento.id}
                </button>
            </div>
        `;

        document.getElementById('btn-confirmar-exclusao-force').addEventListener('click', async () => {
            const confirmado = await mostrarPopupConfirmacao(`Esta ação é IRREVERSÍVEL e removerá o agendamento #${id} para sempre. Deseja continuar?`);
            if (confirmado) {
                try {
                    await fetchFinanceiroAPI(`/contas-agendadas/${id}/force`, { method: 'DELETE' });
                    mostrarPopupFinanceiro('Agendamento excluído permanentemente!', 'sucesso');
                    confirmacaoArea.innerHTML = '<p style="color: var(--fc-cor-receita);">Agendamento excluído com sucesso. Você pode buscar outro ID.</p>';
                } catch (error) {
                    // fetchFinanceiroAPI já mostra o erro
                    confirmacaoArea.innerHTML = `<p style="color: var(--fc-cor-despesa);">Falha ao excluir. Tente novamente.</p>`;
                }
            }
        });

    } catch (error) {
        // fetchFinanceiroAPI já mostra o popup de erro (ex: 404 - Não encontrado)
        confirmacaoArea.innerHTML = `<p style="color: var(--fc-cor-despesa);">${error.message || 'Erro ao buscar agendamento.'}</p>`;
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
    const item = document.querySelector(`.fc-notificacao-item[data-id="${id}"]`);
    if (!item || !item.classList.contains('nao-lida')) return; // Não faz nada se já foi lida

    try {
        await fetchFinanceiroAPI(`/notificacoes/${id}/marcar-como-lida`, { method: 'POST' });
        
        item.classList.remove('nao-lida');
        
        // Atualiza o contador do badge
        const badge = document.getElementById('badgeNotificacoes');
        if (badge && !badge.classList.contains('hidden')) {
            let count = parseInt(badge.textContent, 10) - 1;
            if (count > 0) {
                badge.textContent = count;
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch(e) {
        mostrarPopupFinanceiro('Erro ao marcar notificação.', 'erro');
    }
}

async function marcarTodasComoLidas() {
    try {
        await fetchFinanceiroAPI('/notificacoes/marcar-todas-como-lidas', { method: 'POST' });
        
        // Remove a classe de todas e esconde o badge
        document.querySelectorAll('.fc-notificacao-item.nao-lida').forEach(item => {
            item.classList.remove('nao-lida');
        });
        const badge = document.getElementById('badgeNotificacoes');
        if (badge) badge.classList.add('hidden');
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

async function carregarLogsAuditoria(page = 1) { // Agora aceita o número da página
    const container = document.getElementById('historicoContainer');
    const paginacaoContainer = document.getElementById('paginacaoHistoricoContainer');
    
    if (!container || !paginacaoContainer) return;

    container.innerHTML = `<div class="fc-spinner">Buscando histórico...</div>`;
    
    try {
        // A API agora retorna um objeto com 'logs' e 'totalPages'
        const data = await fetchFinanceiroAPI(`/logs?page=${page}`);
        
        renderizarLogsAuditoria(data.logs); // Passa apenas o array de logs para a função de renderização

        // Chama sua função de paginação reutilizável!
        renderizarPaginacao(
            paginacaoContainer,
            data.totalPages,
            data.currentPage,
            (novaPagina) => carregarLogsAuditoria(novaPagina) // Ação a ser executada ao clicar em um botão da paginação
        );

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

function gerarPreviaLoteFixo() {
    const valorTotal = parseFloat(document.getElementById('lote_valor_total').value);
    const numParcelas = parseInt(document.getElementById('lote_num_parcelas').value);
    const primeiraDataStr = document.getElementById('lote_data_primeira_parcela').value;
    const intervaloValor = parseInt(document.getElementById('lote_intervalo_valor').value);
    const intervaloTipo = document.getElementById('lote_intervalo_tipo').value;
    const previaContainer = document.getElementById('lote_previa_container');

    if (isNaN(valorTotal) || isNaN(numParcelas) || !primeiraDataStr || isNaN(intervaloValor)) {
        mostrarPopupFinanceiro('Preencha todos os campos do parcelamento para gerar a pré-visualização.', 'aviso');
        previaContainer.innerHTML = '';
        return null;
    }
    const primeiraData = new Date(primeiraDataStr + 'T00:00:00');

    const valorParcela = (valorTotal / numParcelas);
    // Correção para arredondamento de centavos
    const valorParcelaArredondado = Math.round(valorParcela * 100) / 100;
    const diferenca = Math.round((valorTotal - (valorParcelaArredondado * numParcelas)) * 100);

    let parcelas = [];
    let dataAtual = primeiraData;

    for (let i = 1; i <= numParcelas; i++) {
        let valorDaParcelaAtual = valorParcelaArredondado;
        // Distribui a diferença de arredondamento na primeira parcela
        if (i === 1 && diferenca !== 0) {
            valorDaParcelaAtual += diferenca / 100;
        }

        parcelas.push({
            parcela: i,
            valor: valorDaParcelaAtual.toFixed(2),
            data_vencimento: new Date(dataAtual)
        });

        if (intervaloTipo === 'days') dataAtual.setDate(dataAtual.getDate() + intervaloValor);
        else if (intervaloTipo === 'weeks') dataAtual.setDate(dataAtual.getDate() + (intervaloValor * 7));
        else if (intervaloTipo === 'months') dataAtual.setMonth(dataAtual.getMonth() + intervaloValor);
    }
    
    previaContainer.innerHTML = `
        <h4 style="margin-top:20px; margin-bottom:10px;">Pré-visualização das Parcelas:</h4>
        <div class="fc-tabela-container" style="max-height: 150px; overflow-y:auto;">
            <table class="fc-tabela-estilizada">
            ${parcelas.map(p => `<tr><td>Parcela ${p.parcela}</td><td>${p.data_vencimento.toLocaleDateString('pt-BR')}</td><td style="text-align:right;">${formatCurrency(p.valor)}</td></tr>`).join('')}
            </table>
        </div>
    `;

    return parcelas;
}

// NOVA função para gerar prévia do método MANUAL
function gerarPreviaLoteManual() {
    const previaContainer = document.getElementById('lote_previa_container');
    const linhas = document.querySelectorAll('#grade_parcelas_manuais .fc-parcela-manual-linha');

    if (linhas.length === 0) {
        mostrarPopupFinanceiro('Adicione pelo menos uma parcela para gerar a pré-visualização.', 'aviso');
        return null;
    }

    let parcelas = [];
    let hasError = false;
    linhas.forEach((linha, index) => {
        const data = linha.querySelector('.parcela-data').value;
        const valor = parseFloat(linha.querySelector('.parcela-valor').value);
        if (!data || isNaN(valor) || valor <= 0) {
            hasError = true;
        }
        parcelas.push({
            parcela: index + 1,
            valor: valor,
            data_vencimento: new Date(data + 'T00:00:00')
        });
    });

    if (hasError) {
        mostrarPopupFinanceiro('Todas as parcelas manuais devem ter uma data e um valor válido.', 'erro');
        previaContainer.innerHTML = '';
        return null;
    }
    
    previaContainer.innerHTML = `
        <h4 style="margin-top:20px; margin-bottom:10px;">Pré-visualização das Parcelas:</h4>
        <div class="fc-tabela-container" style="max-height: 150px; overflow-y:auto;">
            <table class="fc-tabela-estilizada">
            ${parcelas.map(p => `<tr><td>Parcela ${p.parcela}</td><td>${p.data_vencimento.toLocaleDateString('pt-BR')}</td><td style="text-align:right;">${formatCurrency(p.valor)}</td></tr>`).join('')}
            </table>
        </div>
    `;

    return parcelas;
}

async function gerarEconfirmarLote(event) {
    event.preventDefault();
    
    const form = event.target;
    const btnSalvar = form.closest('.fc-modal-content').querySelector('#btnSalvarAgendamento');
    if (!btnSalvar) return;
    const textoOriginalBtn = btnSalvar.innerHTML;

    try {
        const parcelasCalculadas = coletarDadosDoLote();
        
        if (!parcelasCalculadas || parcelasCalculadas.length === 0) {
            mostrarPopupFinanceiro('Por favor, defina as parcelas corretamente.', 'aviso');
            return;
        }
        
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

        btnSalvar.disabled = true;
        btnSalvar.innerHTML = `<i class="fas fa-spinner fc-btn-spinner"></i> Agendando...`;

        await fetchFinanceiroAPI('/contas-agendadas/lote', { method: 'POST', body: JSON.stringify(payload) });
        mostrarPopupFinanceiro('Parcelas agendadas com sucesso!', 'sucesso');
        fecharModal();
        carregarContasAgendadas();
        atualizarBadgesHeader();
    } catch (e) { 
        // erro já tratado pela fetchFinanceiroAPI
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = textoOriginalBtn;
        }
    }
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
        return gerarPreviaLoteFixo();
    } else { // manual
        return gerarPreviaLoteManual();
    }
}

// Variável de cache para as concessionárias
let concessionariasCache = [];

// Função para buscar e renderizar as concessionárias
async function carregarErenderizarConcessionarias() {
    try {
        concessionariasCache = await fetchFinanceiroAPI('/concessionarias-vt');
        renderizarTabelaConcessionarias();
    } catch (error) {
        const container = document.getElementById('config-taxas-vt');
        if (container) container.innerHTML = `<p style="color: red;">Erro ao carregar as concessionárias.</p>`;
    }
}

// Função para renderizar a tabela
function renderizarTabelaConcessionarias() {
    const container = document.getElementById('config-taxas-vt');
    if (!container) return;
    const podeGerenciar = permissoesGlobaisFinanceiro.includes('gerenciar-taxas-vt');

    container.innerHTML = `
        <header class="fc-table-header">
            <h3 class="fc-table-title">Concessionárias e Taxas de VT</h3>
            <button id="btnAdicionarConcessionaria" class="fc-btn fc-btn-primario ${podeGerenciar ? '' : 'fc-btn-disabled'}" ${podeGerenciar ? '' : 'disabled'}><i class="fas fa-plus"></i> Nova</button>
        </header>
        <div class="fc-tabela-container">
            <table class="fc-tabela-estilizada">
                <thead>
                    <tr>
                        <th>Nome da Concessionária</th>
                        <th>Taxa de Recarga (%)</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${concessionariasCache.map(c => `
                        <tr>
                            <td data-label="Nome">${c.nome}</td>
                            <td data-label="Taxa">${c.taxa_recarga_percentual}%</td>
                            <td data-label="Status" style="color: ${c.ativo ? 'var(--fc-cor-receita)' : 'var(--fc-cor-texto-secundario)'}; font-weight: bold;">
                                ${c.ativo ? 'Ativa' : 'Inativa'}
                            </td>
                            <td data-label="Ações" class="td-acoes">
                                <button class="fc-btn fc-btn-outline btn-editar-concessionaria" data-id="${c.id}" ${podeGerenciar ? '' : 'disabled'}><i class="fas fa-pencil-alt"></i></button>
                            </td>
                        </tr>
                    `).join('') || '<tr><td colspan="4" style="text-align: center;">Nenhuma concessionária cadastrada.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    if (podeGerenciar) {
        container.querySelector('#btnAdicionarConcessionaria').addEventListener('click', () => abrirModalConcessionaria());
        container.querySelectorAll('.btn-editar-concessionaria').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const concessionaria = concessionariasCache.find(c => c.id == id);
                abrirModalConcessionaria(concessionaria);
            });
        });
    }
}

// Função para abrir o modal de criação/edição
function abrirModalConcessionaria(item = null) {
    const titulo = item ? 'Editar Concessionária' : 'Nova Concessionária';
    const modalHTML = `
        <div id="modal-concessionaria" class="fc-modal" style="display: flex;">
            <div class="fc-modal-content">
                <button class="fc-modal-close">X</button>
                <h3 class="fc-section-title">${titulo}</h3>
                <div class="fc-modal-body">
                    <form id="formConcessionaria">
                        <div class="fc-form-group">
                            <label for="conc-nome">Nome*</label>
                            <input type="text" id="conc-nome" class="fc-input" required value="${item?.nome || ''}">
                        </div>
                        <div class="fc-form-group">
                            <label for="conc-taxa">Taxa de Recarga (%)*</label>
                            <input type="number" id="conc-taxa" class="fc-input" required step="0.01" value="${item?.taxa_recarga_percentual || '5.00'}">
                        </div>
                        ${item ? `
                        <div class="fc-form-group">
                            <label for="conc-ativo">Status</label>
                            <select id="conc-ativo" class="fc-select">
                                <option value="true" ${item.ativo ? 'selected' : ''}>Ativa</option>
                                <option value="false" ${!item.ativo ? 'selected' : ''}>Inativa</option>
                            </select>
                        </div>
                        ` : ''}
                    </form>
                </div>
                <div class="fc-modal-footer">
                    <button class="fc-btn fc-btn-secundario" id="btn-cancelar-conc">Cancelar</button>
                    <button class="fc-btn fc-btn-primario" id="btn-salvar-conc">Salvar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const fechar = () => document.getElementById('modal-concessionaria').remove();
    document.querySelector('#modal-concessionaria .fc-modal-close').addEventListener('click', fechar);
    document.getElementById('btn-cancelar-conc').addEventListener('click', fechar);
    document.getElementById('btn-salvar-conc').addEventListener('click', () => salvarConcessionaria(item?.id));
}

// Função para salvar os dados
async function salvarConcessionaria(id = null) {
    const payload = {
        nome: document.getElementById('conc-nome').value,
        taxa_recarga_percentual: parseFloat(document.getElementById('conc-taxa').value),
    };

    let url = '/concessionarias-vt';
    let method = 'POST';

    if (id) {
        url += `/${id}`;
        method = 'PUT';
        payload.ativo = document.getElementById('conc-ativo').value === 'true';
    }

    try {
        await fetchFinanceiroAPI(url, { method, body: JSON.stringify(payload) });
        mostrarPopupFinanceiro('Concessionária salva com sucesso!', 'sucesso');
        document.getElementById('modal-concessionaria').remove();
        carregarErenderizarConcessionarias();
    } catch (error) {
        // fetchFinanceiroAPI já mostra o popup de erro
    }
}


window.addEventListener('filtrarAgendaPorAlerta', (event) => {
    const filtro = event.detail.filtro;
    console.log(`JS Legado ouviu o pedido para filtrar por: ${filtro}`);

    // 1. Muda para a aba "Agenda"
    mudarAba('agenda');

    // 2. Chama a função de carregar a agenda, passando o filtro.
    // O backend agora espera 'atrasadas' ou 'hoje'.
    carregarContasAgendadas(1, { vencimento: filtro });
});

window.addEventListener('navegarParaViewFinanceiro', (event) => {
    const view = event.detail.view;
    
    // Chama a sua função de navegação principal que já existe!
    gerenciarNavegacaoPrincipal(view);
});

window.addEventListener('lancamentoCriadoComSucesso', () => {
    console.log('[JS Legado] Recebido sinal de novo lançamento. Atualizando a UI...');
    
    // As funções que você já tem para atualizar a página!
    carregarLancamentosFiltrados(1); // Volta para a primeira página para ver o novo lançamento
    atualizarSaldosDashboard();
});