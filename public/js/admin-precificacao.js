// public/js/admin-precificacao.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js'; // Para buscar a lista de produtos do sistema

// --- Variáveis Globais ---
let usuarioLogado = null;
let permissoes = [];

let todosProdutosSistema = []; // Para o select de produtos a precificar
let produtoSelecionadoParaPrecificar = null; // { id, nome, sku_variacao }
let variacaoSelecionadaParaPrecificar = null; // Objeto da grade

// Caches para dados dos cadastros base
let materiasPrimasCache = [];
let tiposMaoDeObraCache = [];
let despesasOperacionaisCache = [];
let canaisVendaCache = [];

// Dados de configuração para o produto/variação selecionado
let composicaoMpAtual = [];
let custoMoAtual = [];
let configPrecificacaoCanalAtual = null; // Objeto da precificação do canal selecionado

let editandoItemId = null; // Para saber se o modal está em modo de edição e qual item


// --- Funções Utilitárias (mostrarPopupMensagem, debounce - COPIAR DE OUTRO JS SEU) ---
/**
 * Exibe um popup de mensagem para o usuário na página de Precificação.
 * @param {string} mensagem - A mensagem a ser exibida.
 * @param {'info'|'sucesso'|'aviso'|'erro'} tipo - O tipo de popup (afeta o estilo).
 * @param {number} duracao - Duração em milissegundos antes de fechar automaticamente (0 para não fechar).
 * @param {boolean} permitirHTML - Se true, a mensagem é inserida como HTML.
 */

function mostrarPopupMensagem(mensagem, tipo = 'info', duracao = 4000, permitirHTML = false) {
    const popupId = `popup-precificacao-${Date.now()}`; // Prefixo específico para evitar conflitos de ID
    const popup = document.createElement('div');
    popup.id = popupId;
    // Classes CSS para o popup (precisam estar definidas em precificacao.css)
    popup.className = `pr-popup-mensagem popup-${tipo}`; 

    const overlayId = `overlay-precificacao-${popupId}`;
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'pr-popup-overlay'; // Classe para o overlay

    // Conteúdo da mensagem
    if (permitirHTML) {
        // Cuidado com XSS se a mensagem vier de fontes não confiáveis
        const p = document.createElement('p');
        p.innerHTML = mensagem;
        popup.appendChild(p);
    } else {
        const p = document.createElement('p');
        p.textContent = mensagem;
        popup.appendChild(p);
    }

    // Botão OK
    const fecharBtnManual = document.createElement('button');
    // O CSS para 'button' dentro de .pr-popup-mensagem deve estilizá-lo
    fecharBtnManual.textContent = 'OK'; 
    fecharBtnManual.onclick = () => {
        // Adiciona animação de saída
        if (popup.parentNode) popup.style.animation = 'pr-fadeOutPopup 0.3s ease-out forwards'; 
        if (overlay.parentNode) overlay.style.animation = 'pr-fadeOutOverlayPopup 0.3s ease-out forwards';
        
        setTimeout(() => { 
            if (popup.parentNode) popup.remove(); 
            if (overlay.parentNode) overlay.remove(); 
        }, 300); // Tempo para a animação de saída completar
    };
    popup.appendChild(fecharBtnManual);

    // Adiciona ao DOM
    document.body.appendChild(overlay); // Adiciona o overlay primeiro
    document.body.appendChild(popup);   // Depois o popup

    // Lógica para fechar automaticamente após 'duracao'
    if (duracao > 0) {
        setTimeout(() => {
            const el = document.getElementById(popupId);
            if (el && el.parentNode) { // Verifica se o elemento ainda existe e tem um pai
                // Aciona a animação de saída antes de remover
                el.style.animation = 'pr-fadeOutPopup 0.3s ease-out forwards';
                const ov = document.getElementById(overlayId);
                if (ov && ov.parentNode) ov.style.animation = 'pr-fadeOutOverlayPopup 0.3s ease-out forwards';
                
                setTimeout(() => { 
                    if (el.parentNode) el.remove(); 
                    if (ov && ov.parentNode) ov.remove(); 
                }, 300); // Espera a animação terminar
            }
        }, duracao);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- Funções de Fetch para as Novas APIs ---
async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    // console.log(`[fetchAPI] Para ${endpoint} - Token: ${token ? 'OK' : 'NÃO ENCONTRADO'}`);

    // Verifica se o token é necessário para esta chamada específica
    // Para a página de precificação, todas as chamadas provavelmente exigirão token.
    // Se houvesse uma rota GET pública (ex: /api/produtos públicos), você poderia adicionar uma exceção.
    if (!token) {
        console.error(`[fetchAPI] BLOQUEADO: Tentativa de chamada para ${endpoint} SEM TOKEN.`);
        // Usa a função de popup definida neste arquivo (mostrarPopupMensagem )
        mostrarPopupMensagem('Erro de autenticação: Token não encontrado. Por favor, faça login novamente.', 'erro', 0); // 0 para não fechar
        setTimeout(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('usuarioLogado'); 
            localStorage.removeItem('permissoes');   
            window.location.href = '/login.html';     
        }, 2500);
        throw new Error('Token não encontrado, acesso não autorizado.'); 
    }

    const defaultHeaders = {
        'Content-Type': 'application/json', // Content-Type padrão
        'Authorization': `Bearer ${token}`  // Token sempre incluído se presente
    };

    const finalOptions = {
        ...options, // Permite sobrescrever method, body, etc.
        headers: {
            ...defaultHeaders,
            ...options.headers, // Permite adicionar ou sobrescrever headers específicos da chamada
        },
    };
    
    // console.log(`[fetchAPI] Opções finais para ${endpoint}:`, JSON.parse(JSON.stringify(finalOptions)));

    let url = `/api${endpoint}`;
    // Adiciona cache-busting para GET requests (ou se nenhum método for especificado, assume-se GET)
    if (!finalOptions.method || finalOptions.method.toUpperCase() === 'GET') {
        url += url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
    }

    try {
        // console.log(`[fetchAPI] Fazendo fetch para: ${url}`);
        const response = await fetch(url, finalOptions);
        // console.log(`[fetchAPI] Resposta recebida para ${url}, Status: ${response.status}`);

        if (!response.ok) {
            // Tenta obter uma mensagem de erro mais detalhada do corpo da resposta
            let errorData = { error: `Erro HTTP ${response.status} (${response.statusText || 'Status Desconhecido'})` };
            try {
                const jsonError = await response.json();
                if (jsonError && jsonError.error) { // Prioriza a mensagem de erro da API
                    errorData = jsonError;
                } else if (jsonError) { // Se não tiver 'error', mas for um JSON, usa como detalhes
                    errorData.details = jsonError;
                }
            } catch (e) {
                // Se o corpo do erro não for JSON, tenta ler como texto puro
                try {
                    const textError = await response.text();
                    if (textError) errorData.error = textError.substring(0, 200); // Limita o tamanho
                } catch (textE) { /* Ignora se não conseguir ler como texto */ }
            }
            
            console.error(`[fetchAPI] Erro ${response.status} na resposta de ${endpoint}:`, errorData);

            if (response.status === 401) { // Unauthorized - problema com o token
                mostrarPopupMensagem(errorData.error || 'Sessão inválida ou expirada. Por favor, faça login novamente.', 'erro', 0);
                setTimeout(() => {
                    localStorage.removeItem('token'); 
                    localStorage.removeItem('usuarioLogado'); 
                    localStorage.removeItem('permissoes');
                    window.location.href = '/login.html';
                }, 2500);
            } else if (response.status === 403) { // Forbidden - sem permissão
                mostrarPopupMensagem(errorData.error || 'Você não tem permissão para realizar esta ação.', 'erro');
            }
            // Para outros erros (ex: 500, 400 não tratados especificamente),
            // a função chamadora pode mostrar um popup mais contextual se quiser,
            // mas o erro ainda será lançado.
            
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status; 
            err.data = errorData; // Anexa os dados completos do erro para depuração
            throw err; 
        }

        // Tratamento de respostas bem-sucedidas
        if (response.status === 204) { // No Content
            return { success: true, message: 'Operação realizada com sucesso (sem conteúdo).', data: null }; 
        }

        // Para DELETE que pode retornar 200 com corpo (como os seus fazem com RETURNING *)
        if (finalOptions.method && finalOptions.method.toUpperCase() === 'DELETE' && response.status === 200) {
            try {
                const data = await response.json();
                return { success: true, message: data.message || 'Item excluído com sucesso.', deletedItem: data.deletedItem || data };
            } catch(e) {
                // Se o DELETE 200 não tiver corpo JSON válido, ainda é um sucesso
                return { success: true, message: 'Item excluído com sucesso (sem corpo JSON na resposta).' };
            }
        }
        
        // Para outras respostas bem-sucedidas (GET, POST, PUT com corpo JSON)
        // Verifica se o corpo da resposta está vazio antes de tentar o JSON.parse
        const responseBodyText = await response.text();
        if (!responseBodyText) {
            // console.warn(`[fetchAPI] Resposta ${response.status} para ${url} com corpo vazio.`);
            // Isso pode ser normal para um GET que não encontra nada e retorna 200 com null,
            // ou um POST/PUT que retorna 200/201 sem corpo (embora menos comum com JSON APIs)
            return null; 
        }
        try {
            return JSON.parse(responseBodyText);
        } catch (e) {
            console.error(`[fetchAPI] Falha ao parsear JSON da resposta de ${url}. Corpo:`, responseBodyText.substring(0, 500));
            throw new Error(`Resposta inesperada do servidor (não é JSON válido) para ${url}.`);
        }

    } catch (error) { // Captura erros de rede, erros lançados acima, ou erros do JSON.parse
        console.error(`[fetchAPI] Falha GERAL (catch) ao acessar ${url}:`, error);
        
        // Evita mostrar popups duplicados se o erro já foi tratado e um popup mostrado (ex: 401)
        // ou se é um erro que a função chamadora quer tratar de forma específica.
        const errorMsgLower = (error.message || '').toLowerCase();
        if (!error.status && // Erros de rede geralmente não têm status
            !errorMsgLower.includes('token') && 
            !errorMsgLower.includes('permissão') &&
            !errorMsgLower.includes('sessão inválida')) { 
            mostrarPopupMensagem(`Erro de comunicação ao tentar acessar ${endpoint}. Verifique sua conexão ou tente mais tarde.`, 'erro');
        }
        throw error; // Re-lança o erro para que a função chamadora possa tratá-lo se necessário
    }
}

// --- Funções para Abas ---
function setupTabs() {
    const tabContainer = document.querySelector('.pr-tabs-config');
    const tabPanels = document.querySelectorAll('.pr-tab-content .pr-tab-panel');

    if (tabContainer) {
        tabContainer.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('.pr-tab-btn');
            if (!clickedTab || clickedTab.classList.contains('active')) return;

            // Desativa todas
            tabContainer.querySelectorAll('.pr-tab-btn').forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => panel.classList.remove('active'));

            // Ativa a clicada
            clickedTab.classList.add('active');
            const targetPanelId = `tab${clickedTab.dataset.tab.charAt(0).toUpperCase() + clickedTab.dataset.tab.slice(1)}`;
            const targetPanel = document.getElementById(targetPanelId);
            if (targetPanel) {
                targetPanel.classList.add('active');
                // Carregar dados da aba se necessário
                carregarDadosDaAbaAtiva(clickedTab.dataset.tab);
            }
        });
    }
}

async function carregarDadosDaAbaAtiva(tabId) {
    console.log('Carregando dados para aba:', tabId);
    switch (tabId) {
        case 'materiasPrimas':
            await carregarMateriasPrimas();
            break;
        case 'maoDeObra':
            await carregarTiposMaoDeObra();
            break;
        case 'despesas':
            await carregarDespesasOperacionais();
            break;
        case 'canaisVenda':
            await carregarCanaisVenda();
            break;
    }
}


// --- CRUD Matérias-Primas (Exemplo) ---
async function carregarMateriasPrimas() {
    try {
        materiasPrimasCache = await fetchAPI('/materias-primas');
        renderizarTabelaMateriasPrimas();
    } catch (error) {
        mostrarPopupMensagem('Erro ao carregar matérias-primas.', 'erro');
    }
}

function renderizarTabelaMateriasPrimas() {
    const tbody = document.querySelector('#tabelaMateriasPrimas tbody');
    if (!tbody) return;
    tbody.innerHTML = ''; // Limpa
    if (materiasPrimasCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma matéria-prima cadastrada.</td></tr>';
        return;
    }
    materiasPrimasCache.forEach(mp => {
        const tr = tbody.insertRow();
        tr.innerHTML = `
            <td>${mp.nome}</td>
            <td>${mp.unidade_medida || '-'}</td>
            <td>R$ ${parseFloat(mp.preco_por_unidade).toFixed(2)}</td>
            <td>${mp.atualizado_em ? new Date(mp.atualizado_em).toLocaleDateString() : '-'}</td>
            <td class="pr-acoes-tabela">
                <button class="pr-btn-editar" data-id="${mp.id}" data-tipo="materiaPrima" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="pr-btn-excluir" data-id="${mp.id}" data-tipo="materiaPrima" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

// --- Funções do Modal Genérico e CRUD para Matéria-Prima ---

const modalElement = document.getElementById('modalGenericoPrecificacao');
const modalTituloElement = document.getElementById('modalTitulo');
const formModalElement = document.getElementById('formModalGenerico');
const btnSalvarModalElement = document.getElementById('btnSalvarModal');

function abrirModal(titulo) {
    modalTituloElement.textContent = titulo;
    formModalElement.innerHTML = ''; // Limpa campos anteriores
    editandoItemId = null; // Reseta ID de edição
    modalElement.style.display = 'flex'; // Usa flex para centralizar o modal-conteudo (se estilizado assim)
}

function fecharModal() {
    modalElement.style.display = 'none';
    formModalElement.reset(); // Reseta o formulário
}

function construirCamposFormularioMateriaPrima(mp = {}) {
    formModalElement.innerHTML = `
        <div class="pr-form-grupo">
            <label for="mpNome">Nome da Matéria-Prima:</label>
            <input type="text" id="mpNome" name="nome" class="pr-input" value="${mp.nome || ''}" required>
        </div>
        <div class="pr-form-grupo">
            <label for="mpUnidade">Unidade de Medida (ex: m, kg, un):</label>
            <input type="text" id="mpUnidade" name="unidade_medida" class="pr-input" value="${mp.unidade_medida || ''}">
        </div>
        <div class="pr-form-grupo">
            <label for="mpPreco">Preço por Unidade (R$):</label>
            <input type="number" id="mpPreco" name="preco_por_unidade" class="pr-input" value="${mp.preco_por_unidade || ''}" required step="0.01" min="0">
        </div>
        <div class="pr-form-grupo">
            <label for="mpObservacoes">Observações:</label>
            <textarea id="mpObservacoes" name="observacoes" class="pr-textarea" rows="3">${mp.observacoes || ''}</textarea>
        </div>
    `;
}

function construirCamposFormularioTipoMaoDeObra(tmo = {}) {
    formModalElement.innerHTML = `
        <div class="pr-form-grupo">
            <label for="tmoNome">Nome do Tipo de Mão de Obra (Ex: Costureira, Cortador):</label>
            <input type="text" id="tmoNome" name="nome_tipo" class="pr-input" value="${tmo.nome_tipo || ''}" required>
        </div>
        <div class="pr-form-grupo">
            <label for="tmoSalario">Salário Base (R$):</label>
            <input type="number" id="tmoSalario" name="salario_base" class="pr-input" value="${tmo.salario_base || ''}" required step="0.01" min="0">
        </div>
        <div class="pr-form-grupo">
            <label for="tmoVT">Custo VT Mensal (R$):</label>
            <input type="number" id="tmoVT" name="custo_vt_mensal" class="pr-input" value="${tmo.custo_vt_mensal || 0}" step="0.01" min="0">
        </div>
        <div class="pr-form-grupo">
            <label for="tmoVRVA">Custo VR/VA Mensal (R$):</label>
            <input type="number" id="tmoVRVA" name="custo_vr_va_mensal" class="pr-input" value="${tmo.custo_vr_va_mensal || 0}" step="0.01" min="0">
        </div>
        <div class="pr-form-grupo">
            <label for="tmoEncargos">Percentual Encargos (Ex: 0.35 para 35%):</label>
            <input type="number" id="tmoEncargos" name="percentual_encargos" class="pr-input" value="${tmo.percentual_encargos || 0}" step="0.0001" min="0" max="1">
        </div>
        <div class="pr-form-grupo">
            <label for="tmoHoras">Horas Trabalhadas/Mês (Ex: 220):</label>
            <input type="number" id="tmoHoras" name="horas_trabalhadas_mes" class="pr-input" value="${tmo.horas_trabalhadas_mes || ''}" required step="1" min="1">
        </div>
        <div class="pr-form-grupo">
            <label for="tmoAtivo">Ativo:</label>
            <select id="tmoAtivo" name="ativo" class="pr-select">
                <option value="true" ${tmo.ativo !== false ? 'selected' : ''}>Sim</option>
                <option value="false" ${tmo.ativo === false ? 'selected' : ''}>Não</option>
            </select>
        </div>
    `;
}

function construirCamposFormularioDespesa(despesa = {}) {
    const tiposValidos = ['Fixa', 'Variável', 'Outra']; // Da sua API
    formModalElement.innerHTML = `
        <div class="pr-form-grupo">
            <label for="despesaDescricao">Descrição da Despesa:</label>
            <input type="text" id="despesaDescricao" name="descricao" class="pr-input" value="${despesa.descricao || ''}" required>
        </div>
        <div class="pr-form-grupo">
            <label for="despesaValor">Valor Mensal (R$):</label>
            <input type="number" id="despesaValor" name="valor_mensal" class="pr-input" value="${despesa.valor_mensal || ''}" required step="0.01" min="0">
        </div>
        <div class="pr-form-grupo">
            <label for="despesaTipo">Tipo:</label>
            <select id="despesaTipo" name="tipo" class="pr-select">
                ${tiposValidos.map(tipo => 
                    `<option value="${tipo}" ${despesa.tipo === tipo ? 'selected' : ''}>${tipo}</option>`
                ).join('')}
                 <option value="Outra" ${!despesa.tipo || !tiposValidos.includes(despesa.tipo) ? 'selected' : ''}>Outra</option> 
            </select>
        </div>
        <div class="pr-form-grupo">
            <label for="despesaAtivo">Ativo:</label>
            <select id="despesaAtivo" name="ativo" class="pr-select">
                <option value="true" ${despesa.ativo !== false ? 'selected' : ''}>Sim</option>
                <option value="false" ${despesa.ativo === false ? 'selected' : ''}>Não</option>
            </select>
        </div>
    `;
}

function construirCamposFormularioCanalVenda(canal = {}) {
    formModalElement.innerHTML = `
        <div class="pr-form-grupo">
            <label for="canalNome">Nome do Canal de Venda (Ex: Shopee, Site Próprio):</label>
            <input type="text" id="canalNome" name="nome_canal" class="pr-input" value="${canal.nome_canal || ''}" required>
        </div>
        <div class="pr-form-grupo">
            <label for="canalTaxaPerc">Taxa Percentual (Ex: 0.22 para 22%):</label>
            <input type="number" id="canalTaxaPerc" name="taxa_percentual" class="pr-input" value="${canal.taxa_percentual || 0}" step="0.0001" min="0" max="1">
        </div>
        <div class="pr-form-grupo">
            <label for="canalTaxaFixa">Taxa Fixa (R$):</label>
            <input type="number" id="canalTaxaFixa" name="taxa_fixa" class="pr-input" value="${canal.taxa_fixa || 0}" step="0.01" min="0">
        </div>
        <div class="pr-form-grupo">
            <label for="canalTaxaAdicional">Taxa Adicional Percentual (Ex: 0.02 para 2% em promoções):</label>
            <input type="number" id="canalTaxaAdicional" name="taxa_adicional_percentual" class="pr-input" value="${canal.taxa_adicional_percentual || 0}" step="0.0001" min="0" max="1">
        </div>
        <div class="pr-form-grupo">
            <label for="canalAtivo">Ativo:</label>
            <select id="canalAtivo" name="ativo" class="pr-select">
                <option value="true" ${canal.ativo !== false ? 'selected' : ''}>Sim</option>
                <option value="false" ${canal.ativo === false ? 'selected' : ''}>Não</option>
            </select>
        </div>
    `;
}

async function abrirModalParaNovoCanalVenda() {
    abrirModal('Novo Canal de Venda');
    construirCamposFormularioCanalVenda();
}

async function abrirModalParaEditarCanalVenda(id) {
    const canal = canaisVendaCache.find(c => c.id == id);
    if (!canal) {
        mostrarPopupMensagem('Canal de venda não encontrado para edição.', 'erro');
        return;
    }
    abrirModal('Editar Canal de Venda');
    construirCamposFormularioCanalVenda(canal);
    editandoItemId = id;
}

async function salvarCanalVenda() {
    const formData = new FormData(formModalElement);
    const dados = Object.fromEntries(formData.entries());

    // Converter para tipos corretos e validações
    dados.taxa_percentual = parseFloat(dados.taxa_percentual || 0);
    dados.taxa_fixa = parseFloat(dados.taxa_fixa || 0);
    dados.taxa_adicional_percentual = parseFloat(dados.taxa_adicional_percentual || 0);
    dados.ativo = dados.ativo === 'true';

    if (!dados.nome_canal) {
        mostrarPopupMensagem('Nome do canal é obrigatório.', 'erro');
        return;
    }
    // Adicione mais validações para as taxas se necessário (ex: dentro do range 0-1 para percentuais)

    const endpoint = editandoItemId ? `/canais-venda/${editandoItemId}` : '/canais-venda';
    const method = editandoItemId ? 'PUT' : 'POST';

    try {
        btnSalvarModalElement.disabled = true;
        btnSalvarModalElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        await fetchAPI(endpoint, { method, body: JSON.stringify(dados) });
        mostrarPopupMensagem(`Canal de venda ${editandoItemId ? 'atualizado' : 'criado'} com sucesso!`, 'sucesso');
        fecharModal();
        await carregarCanaisVenda();
    } catch (error) {
        mostrarPopupMensagem(`Erro ao salvar canal de venda: ${error.message}`, 'erro');
    } finally {
        btnSalvarModalElement.disabled = false;
        btnSalvarModalElement.textContent = 'Salvar';
    }
}

async function salvarPrecificacaoProdutoCanal() {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        mostrarPopupMensagem("Nenhum produto/variação selecionado para salvar a precificação.", "aviso");
        return;
    }
    const selectCanal = document.getElementById('selectCanalPrecificacao');
    const canalId = selectCanal.value;
    if (!canalId) {
        mostrarPopupMensagem("Nenhum canal de venda selecionado.", "aviso");
        return;
    }

    // Coleta os dados dos inputs do formulário de precificação
    const custoEmbalagem = parseFloat(document.getElementById('inputCustoEmbalagem')?.value) || 0;
    const custoOperacional = parseFloat(document.getElementById('inputCustoOperacional')?.value) || 0;
    // Converte percentuais de % para decimal (ex: 5 para 0.05)
    const impostoPerc = (parseFloat(document.getElementById('inputImpostoPerc')?.value) || 0) / 100;
    const lucroPercDesejado = (parseFloat(document.getElementById('inputLucroPerc')?.value) || 0) / 100;
    
    const precoManualInput = document.getElementById('inputPrecoVendaManual');
    let precoVendaManual = null; // Default para null se não preenchido ou inválido
    if (precoManualInput && precoManualInput.value.trim() !== '') {
        const val = parseFloat(precoManualInput.value);
        if (!isNaN(val) && val >= 0) {
            precoVendaManual = val;
        } else {
            mostrarPopupMensagem("Preço de Venda Manual inválido. Se preenchido, deve ser um número não negativo.", "erro");
            precoManualInput.focus();
            return;
        }
    }
    
    const observacoes = document.getElementById('inputObservacoesPrecificacao')?.value.trim() || null;

    // Monta o payload para a API
    // Estes são os campos que a tabela produto_precificacao_configs espera
    const payload = {
        custo_embalagem_unitario: custoEmbalagem,
        custo_operacional_unitario_atribuido: custoOperacional,
        imposto_percentual_aplicado: impostoPerc,
        margem_lucro_desejada_percentual: lucroPercDesejado,
        preco_venda_manual_definido: precoVendaManual, // Será null se não preenchido
        observacoes: observacoes
    };

    const produtoRefId = produtoSelecionadoParaPrecificar.sku_variacao;
    const endpoint = `/precificacao-config/${encodeURIComponent(produtoRefId)}/canal/${canalId}`;
    const method = 'POST'; // A API faz UPSERT

    const btnSalvar = document.getElementById('btnSalvarPrecificacaoProduto');
    const originalText = btnSalvar.textContent;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = `<i class="fas fa-spinner fa-spin pr-spinner-btn-interno"></i> Salvando Precificação...`;

    try {
        console.log(`[salvarPrecificacaoProdutoCanal] Enviando para ${endpoint}:`, payload);
        const resultado = await fetchAPI(endpoint, { method, body: JSON.stringify(payload) });
        console.log("[salvarPrecificacaoProdutoCanal] Resposta da API:", resultado);
        
        mostrarPopupMensagem("Configuração de precificação salva com sucesso!", "sucesso");
        
        // Atualiza o cache local da configuração para este canal, se necessário, ou apenas recarrega.
        // Se a API retorna o objeto salvo/atualizado, podemos usá-lo.
        configPrecificacaoCanalAtual = resultado; // Assume que a API retorna o objeto salvo/atualizado
        
        // Recalcula e exibe com os dados potencialmente atualizados pela API (ex: se a API fizesse algum ajuste)
        // Ou se apenas quisermos reconfirmar a exibição.
        const dadosCanalSelecionado = canaisVendaCache.find(c => c.id == canalId);
        renderizarFormularioECalculoPrecificacao(configPrecificacaoCanalAtual || {}, dadosCanalSelecionado || {});

    } catch (error) {
        mostrarPopupMensagem(`Erro ao salvar precificação: ${error.message}`, "erro");
    } finally {
        if(btnSalvar) { // Verifica se o botão ainda existe
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = originalText; // Restaura o texto original com o ícone
        }
    }
}

async function abrirModalParaNovoTipoMaoDeObra() {
    abrirModal('Novo Tipo de Mão de Obra');
    construirCamposFormularioTipoMaoDeObra();
}

async function abrirModalParaEditarTipoMaoDeObra(id) {
    const tmo = tiposMaoDeObraCache.find(t => t.id == id);
    if (!tmo) {
        mostrarPopupMensagem('Tipo de mão de obra não encontrado para edição.', 'erro');
        return;
    }
    abrirModal('Editar Tipo de Mão de Obra');
    construirCamposFormularioTipoMaoDeObra(tmo);
    editandoItemId = id;
}

async function salvarTipoMaoDeObra() {
    const formData = new FormData(formModalElement);
    const dados = Object.fromEntries(formData.entries());

    // Converter para tipos corretos e validações
    dados.salario_base = parseFloat(dados.salario_base);
    dados.custo_vt_mensal = parseFloat(dados.custo_vt_mensal || 0);
    dados.custo_vr_va_mensal = parseFloat(dados.custo_vr_va_mensal || 0);
    dados.percentual_encargos = parseFloat(dados.percentual_encargos || 0);
    dados.horas_trabalhadas_mes = parseInt(dados.horas_trabalhadas_mes);
    dados.ativo = dados.ativo === 'true'; // Converter string 'true'/'false' para booleano

    if (!dados.nome_tipo || isNaN(dados.salario_base) || isNaN(dados.horas_trabalhadas_mes) || dados.horas_trabalhadas_mes <= 0) {
        mostrarPopupMensagem('Nome, Salário Base e Horas/Mês são obrigatórios e devem ser válidos.', 'erro');
        return;
    }
    // Adicione mais validações se necessário

    const endpoint = editandoItemId ? `/tipos-mao-de-obra/${editandoItemId}` : '/tipos-mao-de-obra';
    const method = editandoItemId ? 'PUT' : 'POST';

    try {
        btnSalvarModalElement.disabled = true;
        btnSalvarModalElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        await fetchAPI(endpoint, { method, body: JSON.stringify(dados) });
        mostrarPopupMensagem(`Tipo de mão de obra ${editandoItemId ? 'atualizado' : 'criado'} com sucesso!`, 'sucesso');
        fecharModal();
        await carregarTiposMaoDeObra(); // Recarrega a tabela
    } catch (error) {
        mostrarPopupMensagem(`Erro ao salvar tipo de mão de obra: ${error.message}`, 'erro');
    } finally {
        btnSalvarModalElement.disabled = false;
        btnSalvarModalElement.textContent = 'Salvar';
    }
}

async function abrirModalParaNovaDespesa() {
    abrirModal('Nova Despesa Operacional');
    construirCamposFormularioDespesa();
}

async function abrirModalParaEditarDespesa(id) {
    const despesa = despesasOperacionaisCache.find(d => d.id == id);
    if (!despesa) {
        mostrarPopupMensagem('Despesa operacional não encontrada para edição.', 'erro');
        return;
    }
    abrirModal('Editar Despesa Operacional');
    construirCamposFormularioDespesa(despesa);
    editandoItemId = id;
}

async function salvarDespesa() {
    const formData = new FormData(formModalElement);
    const dados = Object.fromEntries(formData.entries());

    dados.valor_mensal = parseFloat(dados.valor_mensal);
    dados.ativo = dados.ativo === 'true';

    if (!dados.descricao || isNaN(dados.valor_mensal) || dados.valor_mensal < 0) {
        mostrarPopupMensagem('Descrição e Valor Mensal são obrigatórios e devem ser válidos.', 'erro');
        return;
    }

    const endpoint = editandoItemId ? `/despesas-operacionais/${editandoItemId}` : '/despesas-operacionais';
    const method = editandoItemId ? 'PUT' : 'POST';

    try {
        btnSalvarModalElement.disabled = true;
        btnSalvarModalElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        await fetchAPI(endpoint, { method, body: JSON.stringify(dados) });
        mostrarPopupMensagem(`Despesa operacional ${editandoItemId ? 'atualizada' : 'criada'} com sucesso!`, 'sucesso');
        fecharModal();
        await carregarDespesasOperacionais();
    } catch (error) {
        mostrarPopupMensagem(`Erro ao salvar despesa: ${error.message}`, 'erro');
    } finally {
        btnSalvarModalElement.disabled = false;
        btnSalvarModalElement.textContent = 'Salvar';
    }
}


async function abrirModalParaNovaMateriaPrima() {
    abrirModal('Nova Matéria-Prima');
    construirCamposFormularioMateriaPrima();
    // O listener de submit já deve estar no formModalElement ou no btnSalvarModalElement
    // Vamos configurá-lo no DOMContentLoaded para o form
}

async function abrirModalParaEditarMateriaPrima(id) {
    const mp = materiasPrimasCache.find(m => m.id == id);
    if (!mp) {
        mostrarPopupMensagem('Matéria-prima não encontrada para edição.', 'erro');
        return;
    }
    abrirModal('Editar Matéria-Prima');
    construirCamposFormularioMateriaPrima(mp);
    editandoItemId = id; // Define que estamos editando
}

async function salvarFormularioModal(event) {
    event.preventDefault();
    const tituloLower = modalTituloElement.textContent.toLowerCase();

    // Adicione um log para ver qual formulário está sendo salvo
    console.log("[salvarFormularioModal] Tentando salvar formulário com título:", modalTituloElement.textContent);

    // Verifica o tipo de formulário pela tag <input type="hidden" name="tipoFormulario" value="COMPOSICAOMP">
    // que adicionamos aos formulários de composição.
    const tipoForm = formModalElement.querySelector('input[name="tipoFormulario"]');
    const tipoFormularioValor = tipoForm ? tipoForm.value : null;

    if (tipoFormularioValor === 'composicaoMP') { // Se for o formulário de composição de MP
        await salvarItemComposicaoMP();
    } else if (tipoFormularioValor === 'custoMO') { // (A ser implementado)
         await salvarItemCustoMO();
    }
    // --- Mantenha a lógica anterior para os cadastros base ---
    else if (tituloLower.includes('matéria-prima') && !tituloLower.includes('composição')) {
        await salvarMateriaPrima();
    } else if (tituloLower.includes('mão de obra') && !tituloLower.includes('produto')) { 
        await salvarTipoMaoDeObra();
    } else if (tituloLower.includes('despesa operacional')) {
        await salvarDespesa();
    } else if (tituloLower.includes('canal de venda')) {
        await salvarCanalVenda();
    } 
    // --- Fim da lógica para cadastros base ---
    else {
        console.warn("[salvarFormularioModal] Tipo de formulário não reconhecido pelo título ou campo oculto:", modalTituloElement.textContent, tipoFormularioValor);
        mostrarPopupMensagem("Não foi possível determinar o tipo de dados a salvar.", "erro");
    }
}

async function salvarItemComposicaoMP() {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        mostrarPopupMensagem('Nenhum produto/variação selecionado para gerenciar a composição.', 'erro');
        return;
    }

    const formData = new FormData(formModalElement);
    const dados = {
        // materia_prima_id é pego do select no formulário do modal
        materia_prima_id: parseInt(formData.get('materia_prima_id')),
        quantidade_utilizada: parseFloat(formData.get('quantidade_utilizada')),
        unidade_medida_utilizada: formData.get('unidade_medida_utilizada').trim() || null,
    };

    if (!dados.materia_prima_id || isNaN(dados.quantidade_utilizada) || dados.quantidade_utilizada <= 0) {
        mostrarPopupMensagem('Selecione a matéria-prima e informe uma quantidade utilizada válida (maior que zero).', 'erro');
        return;
    }

    // O endpoint para a API de UPSERT
    const endpoint = `/precificacao-config/${produtoSelecionadoParaPrecificar.sku_variacao}/composicao-mp`;
    // O método é POST porque a API /api/precificacao-config/:produtoRefId/composicao-mp
    // foi definida para fazer UPSERT com POST.
    // Se 'editandoItemId' estivesse sendo usado para determinar um endpoint PUT separado para edição,
    // a lógica seria diferente, mas com UPSERT, POST é suficiente.
    const method = 'POST'; 

    const mensagemAcao = editandoItemId ? 'atualizado' : 'adicionado';

    try {
        btnSalvarModalElement.disabled = true;
        btnSalvarModalElement.innerHTML = '<i class="fas fa-spinner fa-spin pr-spinner-btn-interno"></i> Salvando...';
        
        await fetchAPI(endpoint, { // Usa sua função fetchAPI principal
            method: method, 
            body: JSON.stringify(dados) 
        });

        mostrarPopupMensagem(`Item da composição ${mensagemAcao} com sucesso!`, 'sucesso');
        fecharModal(); 
        await carregarComposicaoMpDoProduto(produtoSelecionadoParaPrecificar.sku_variacao); 
        // A função carregarComposicaoMpDoProduto já chama calcularEExibirCustoTotalMP
    } catch (error) {
        // fetchAPI já deve mostrar popups para erros de token/rede/403
        // Este popup é para erros específicos da operação de salvar composição
        mostrarPopupMensagem(`Erro ao salvar item na composição: ${error.message}`, 'erro');
    } finally {
        if(btnSalvarModalElement) { // Verifica se o elemento ainda existe
            btnSalvarModalElement.disabled = false;
            btnSalvarModalElement.textContent = 'Salvar';
        }
    }
}

async function removerItemComposicaoMP(idItemComposicao) {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) return;
    
    const itemParaRemover = composicaoMpAtual.find(i => i.id == idItemComposicao);
    const nomeItem = itemParaRemover ? itemParaRemover.materia_prima_nome : "este item";

    if (!confirm(`Tem certeza que deseja remover "${nomeItem}" da composição deste produto/variação?`)) return;

    try {
        // O ID aqui é o ID do registro na tabela produto_composicao_mp
        await fetchAPI(`/precificacao-config/composicao-mp/${idItemComposicao}`, { method: 'DELETE' });
        mostrarPopupMensagem('Item removido da composição com sucesso!', 'sucesso');
        await carregarComposicaoMpDoProduto(produtoSelecionadoParaPrecificar.sku_variacao); // Recarrega
        // calcularEExibirCustoTotalMP(); // Recalcula
    } catch (error) {
        mostrarPopupMensagem(`Erro ao remover item da composição: ${error.message}`, 'erro');
    }
}


function renderizarTabelaTiposMaoDeObra() {
    const tbody = document.querySelector('#tabelaTiposMaoDeObra tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (tiposMaoDeObraCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum tipo de mão de obra cadastrado.</td></tr>';
        return;
    }
    tiposMaoDeObraCache.forEach(tmo => {
        // Calcular custo/hora aproximado para exibição (pode ser mais complexo)
        let custoHoraAprox = 0;
        if (tmo.horas_trabalhadas_mes > 0) {
            const custoMensalTotal = (tmo.salario_base || 0) * (1 + (tmo.percentual_encargos || 0)) + (tmo.custo_vt_mensal || 0) + (tmo.custo_vr_va_mensal || 0);
            custoHoraAprox = custoMensalTotal / tmo.horas_trabalhadas_mes;
        }

        const tr = tbody.insertRow();
        tr.innerHTML = `
            <td>${tmo.nome_tipo}</td>
            <td>R$ ${parseFloat(tmo.salario_base || 0).toFixed(2)}</td>
            <td>R$ ${custoHoraAprox.toFixed(2)}</td>
            <td>${tmo.ativo ? 'Sim' : 'Não'}</td>
            <td class="pr-acoes-tabela">
                <button class="pr-btn-editar" data-id="${tmo.id}" data-tipo="maoDeObra" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="pr-btn-excluir" data-id="${tmo.id}" data-tipo="maoDeObra" title="Excluir/Desativar"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tr.querySelector('.pr-btn-editar').addEventListener('click', (e) => abrirModalParaEditarTipoMaoDeObra(e.currentTarget.dataset.id));
        tr.querySelector('.pr-btn-excluir').addEventListener('click', (e) => deletarItemConfiguracao(e.currentTarget.dataset.id, 'maoDeObra')); // Use tipo 'maoDeObra'
    });
}

async function salvarMateriaPrima() {
    const formData = new FormData(formModalElement);
    const dados = Object.fromEntries(formData.entries());
    
    // Validação básica (poderia ser mais robusta)
    if (!dados.nome || !dados.preco_por_unidade) {
        mostrarPopupMensagem('Nome e Preço são obrigatórios.', 'erro');
        return;
    }
    dados.preco_por_unidade = parseFloat(dados.preco_por_unidade);
    if (isNaN(dados.preco_por_unidade) || dados.preco_por_unidade < 0) {
        mostrarPopupMensagem('Preço inválido.', 'erro');
        return;
    }

    const endpoint = editandoItemId ? `/materias-primas/${editandoItemId}` : '/materias-primas';
    const method = editandoItemId ? 'PUT' : 'POST';

    try {
        btnSalvarModalElement.disabled = true;
        btnSalvarModalElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        await fetchAPI(endpoint, { method, body: JSON.stringify(dados) });
        mostrarPopupMensagem(`Matéria-prima ${editandoItemId ? 'atualizada' : 'criada'} com sucesso!`, 'sucesso');
        fecharModal();
        await carregarMateriasPrimas(); // Recarrega a tabela
    } catch (error) {
        mostrarPopupMensagem(`Erro ao salvar matéria-prima: ${error.message}`, 'erro');
    } finally {
        btnSalvarModalElement.disabled = false;
        btnSalvarModalElement.textContent = 'Salvar';
    }
}

async function deletarItemConfiguracao(id, tipo) {
    let endpoint = '';
    let itemNome = '';
    let callbackCarregarTabela = null;
    let acaoNome = 'excluído(a)/desativado(a)'; // Nome da ação para a mensagem

    switch (tipo) {
        case 'materiaPrima':
            endpoint = `/materias-primas/${id}`;
            itemNome = 'matéria-prima';
            callbackCarregarTabela = carregarMateriasPrimas;
            acaoNome = 'excluída';
            break;
        case 'maoDeObra':
            endpoint = `/tipos-mao-de-obra/${id}`;
            itemNome = 'tipo de mão de obra';
            callbackCarregarTabela = carregarTiposMaoDeObra;
            acaoNome = 'excluído';
            break;
        case 'despesa': // NOVO CASE
            endpoint = `/despesas-operacionais/${id}`; // API DELETE desativa
            itemNome = 'despesa operacional';
            callbackCarregarTabela = carregarDespesasOperacionais;
            acaoNome = 'desativada'; // Mensagem reflete a ação de soft delete
            break;
        case 'canalVenda': // NOVO CASE
            endpoint = `/canais-venda/${id}`; // API DELETE desativa
            itemNome = 'canal de venda';
            callbackCarregarTabela = carregarCanaisVenda;
            acaoNome = 'desativado'; 
            break;
        default:
            mostrarPopupMensagem('Tipo de item desconhecido para alteração de status.', 'erro');
            return;
    }

    // A API de delete para despesas está fazendo soft delete (ativo=false)
    // Então a confirmação deve refletir isso.
    if (!confirm(`Tem certeza que deseja ${acaoNome === 'desativada' ? 'DESATIVAR' : 'EXCLUIR'} esta ${itemNome}?`)) return;

    try {
        await fetchAPI(endpoint, { method: 'DELETE' }); // O backend faz o soft delete
        mostrarPopupMensagem(`${itemNome.charAt(0).toUpperCase() + itemNome.slice(1)} ${acaoNome} com sucesso!`, 'sucesso');
        if (callbackCarregarTabela) await callbackCarregarTabela();
    } catch (error) {
        mostrarPopupMensagem(`Erro ao ${acaoNome === 'desativada' ? 'desativar' : 'excluir'} ${itemNome}: ${error.message}`, 'erro');
    }
}


async function carregarTiposMaoDeObra() {
    try {
        tiposMaoDeObraCache = await fetchAPI('/tipos-mao-de-obra');
        renderizarTabelaTiposMaoDeObra();
    } catch (error) {
        mostrarPopupMensagem('Erro ao carregar tipos de mão de obra.', 'erro');
    }
}

// --- CRUD Despesas Operacionais (Similar) ---
async function carregarDespesasOperacionais() {
    try {
        // Lembre-se que a rota GET padrão agora só traz ativos
        // Se quiser todas para gerenciar, use /api/despesas-operacionais/todas
        despesasOperacionaisCache = await fetchAPI('/despesas-operacionais/todas'); 
        renderizarTabelaDespesas();
    } catch (error) {
        mostrarPopupMensagem('Erro ao carregar despesas operacionais.', 'erro');
    }
}

function renderizarTabelaDespesas() {
    const tbody = document.querySelector('#tabelaDespesas tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (despesasOperacionaisCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma despesa operacional cadastrada.</td></tr>';
        return;
    }
    despesasOperacionaisCache.forEach(d => {
        const tr = tbody.insertRow();
        tr.innerHTML = `
            <td>${d.descricao}</td>
            <td>R$ ${parseFloat(d.valor_mensal).toFixed(2)}</td>
            <td>${d.tipo || '-'}</td>
            <td>${d.ativo ? 'Sim' : 'Não'}</td>
            <td class="pr-acoes-tabela">
                <button class="pr-btn-editar" data-id="${d.id}" data-tipo="despesa" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="pr-btn-excluir" data-id="${d.id}" data-tipo="despesa" title="${d.ativo ? 'Desativar' : 'Reativar'}">
                    <i class="fas ${d.ativo ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                </button>
            </td>
        `;
        tr.querySelector('.pr-btn-editar').addEventListener('click', (e) => abrirModalParaEditarDespesa(e.currentTarget.dataset.id));
        // A função deletarItemConfiguracao fará um UPDATE para 'ativo = false' (soft delete)
        // Ou, se você quiser reativar, precisará de uma lógica um pouco diferente ou um endpoint PUT para 'ativo'
        // Por simplicidade, o DELETE na API está desativando. Se clicar de novo, não reativa.
        // Vamos ajustar deletarItemConfiguracao para lidar com isso ou criar uma função toggleAtivo.
        // Por agora, o botão de excluir/desativar chamará a mesma função, que sempre desativa.
        tr.querySelector('.pr-btn-excluir').addEventListener('click', (e) => {
            const item = despesasOperacionaisCache.find(desp => desp.id == e.currentTarget.dataset.id);
            if (item && !item.ativo) {
                // Se quiser reativar, precisaremos de uma rota PUT ou modificar a de DELETE/PUT geral
                // Para reativar: chamar um PUT para /api/despesas-operacionais/:id com { ativo: true }
                if(confirm(`Deseja REATIVAR a despesa "${item.descricao}"?`)){
                     reativarDespesa(item.id);
                }
            } else {
                deletarItemConfiguracao(e.currentTarget.dataset.id, 'despesa');
            }
        });
    });
}
// Função para reativar (exemplo, precisa de endpoint PUT que aceite 'ativo')
async function reativarDespesa(id) {
    try {
        await fetchAPI(`/despesas-operacionais/${id}`, { method: 'PUT', body: JSON.stringify({ ativo: true }) });
        mostrarPopupMensagem('Despesa reativada com sucesso!', 'sucesso');
        await carregarDespesasOperacionais();
    } catch (error) {
        mostrarPopupMensagem(`Erro ao reativar despesa: ${error.message}`, 'erro');
    }
}

async function salvarItemCustoMO() {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        mostrarPopupMensagem('Nenhum produto/variação selecionado.', 'erro');
        return;
    }

    const formData = new FormData(formModalElement);
    const dados = {
        tipo_mao_de_obra_id: parseInt(formData.get('tipo_mao_de_obra_id')),
        tempo_minutos_producao: parseFloat(formData.get('tempo_minutos_producao')),
    };

    if (!dados.tipo_mao_de_obra_id || isNaN(dados.tempo_minutos_producao) || dados.tempo_minutos_producao <= 0) {
        mostrarPopupMensagem('Selecione o tipo de M.O. e informe um tempo de produção válido (maior que zero).', 'erro');
        return;
    }

    const endpoint = `/precificacao-config/${produtoSelecionadoParaPrecificar.sku_variacao}/custo-mao-de-obra`;
    const method = 'POST'; // API faz UPSERT com base em (produto_ref_id, tipo_mao_de_obra_id)

    const mensagemAcao = editandoItemId ? 'atualizado' : 'adicionado'; // editandoItemId é o ID do produto_custo_mao_de_obra

    try {
        btnSalvarModalElement.disabled = true;
        btnSalvarModalElement.innerHTML = '<i class="fas fa-spinner fa-spin pr-spinner-btn-interno"></i> Salvando...';
        
        await fetchAPI(endpoint, { method, body: JSON.stringify(dados) });
        mostrarPopupMensagem(`Custo de Mão de Obra ${mensagemAcao} com sucesso!`, 'sucesso');
        fecharModal();
        await carregarCustoMoDoProduto(produtoSelecionadoParaPrecificar.sku_variacao);
        // calcularEExibirCustoTotalMO(); // Será chamado dentro de carregarCustoMoDoProduto
    } catch (error) {
        mostrarPopupMensagem(`Erro ao salvar custo de M.O.: ${error.message}`, 'erro');
    } finally {
        if(btnSalvarModalElement) {
            btnSalvarModalElement.disabled = false;
            btnSalvarModalElement.textContent = 'Salvar';
        }
    }
}

// --- CRUD Canais de Venda (Similar) ---
async function carregarCanaisVenda() {
    try {
        // /api/canais-venda/todas para incluir os inativos na tela de gerenciamento
        canaisVendaCache = await fetchAPI('/canais-venda/todas'); 
        renderizarTabelaCanaisVenda();
    } catch (error) {
        mostrarPopupMensagem('Erro ao carregar canais de venda.', 'erro');
    }
}

function renderizarTabelaCanaisVenda() {
    const tbody = document.querySelector('#tabelaCanaisVenda tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (canaisVendaCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum canal de venda cadastrado.</td></tr>';
        return;
    }
    canaisVendaCache.forEach(cv => {
        const tr = tbody.insertRow();
        tr.innerHTML = `
            <td>${cv.nome_canal}</td>
            <td>${(parseFloat(cv.taxa_percentual || 0) * 100).toFixed(2)}%</td>
            <td>R$ ${parseFloat(cv.taxa_fixa || 0).toFixed(2)}</td>
            <td>${(parseFloat(cv.taxa_adicional_percentual || 0) * 100).toFixed(2)}%</td>
            <td>${cv.ativo ? 'Sim' : 'Não'}</td>
            <td class="pr-acoes-tabela">
                <button class="pr-btn-editar" data-id="${cv.id}" data-tipo="canalVenda" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="pr-btn-excluir" data-id="${cv.id}" data-tipo="canalVenda" title="${cv.ativo ? 'Desativar' : 'Reativar'}">
                     <i class="fas ${cv.ativo ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                </button>
            </td>
        `;
        tr.querySelector('.pr-btn-editar').addEventListener('click', (e) => abrirModalParaEditarCanalVenda(e.currentTarget.dataset.id));
        tr.querySelector('.pr-btn-excluir').addEventListener('click', (e) => {
            const item = canaisVendaCache.find(canal => canal.id == e.currentTarget.dataset.id);
             if (item && !item.ativo) {
                if(confirm(`Deseja REATIVAR o canal "${item.nome_canal}"?`)){
                     reativarCanalVenda(item.id); // Criaremos esta função
                }
            } else {
                deletarItemConfiguracao(e.currentTarget.dataset.id, 'canalVenda');
            }
        });
    });
}
// Função para reativar canal de venda
async function reativarCanalVenda(id) {
    try {
        await fetchAPI(`/canais-venda/${id}`, { method: 'PUT', body: JSON.stringify({ ativo: true }) });
        mostrarPopupMensagem('Canal de venda reativado com sucesso!', 'sucesso');
        await carregarCanaisVenda();
    } catch (error) {
        mostrarPopupMensagem(`Erro ao reativar canal de venda: ${error.message}`, 'erro');
    }
}

// --- Lógica de Seleção de Produto e Variação para Precificar ---
async function carregarProdutosParaPrecificar() {
    try {
        todosProdutosSistema = await obterProdutosDoStorage(); // Usa sua função existente
        const select = document.getElementById('selectProdutoParaPrecificar');
        select.innerHTML = '<option value="">Selecione um produto...</option>';
        todosProdutosSistema.forEach(p => {
            // Só produtos não-kit podem ser precificados diretamente pela composição
            // Kits teriam sua precificação baseada nos componentes, o que é mais complexo
            // if (!p.is_kit) { 
                select.add(new Option(p.nome, p.id)); // Usando o ID do produto como value
            // }
        });
        select.onchange = handleProdutoSelecionadoParaPrecificar;
    } catch (error) {
        mostrarPopupMensagem('Erro ao carregar lista de produtos.', 'erro');
    }
}

function handleProdutoSelecionadoParaPrecificar() {
    const produtoId = document.getElementById('selectProdutoParaPrecificar').value;
    const variacaoWrapper = document.getElementById('variacaoProdutoPrecificarWrapper');
    const selectVariacao = document.getElementById('selectVariacaoParaPrecificar');
    const areaDetalhe = document.getElementById('areaDetalhePrecificacao');

    variacaoWrapper.style.display = 'none';
    selectVariacao.innerHTML = '<option value="">Selecione uma variação...</option>';
    areaDetalhe.style.display = 'none';
    produtoSelecionadoParaPrecificar = null;
    variacaoSelecionadaParaPrecificar = null;

    if (!produtoId) return;

    const produtoObj = todosProdutosSistema.find(p => p.id == produtoId); // Comparação frouxa por causa do tipo do value do select
    if (!produtoObj) return;
    
    produtoSelecionadoParaPrecificar = { id: produtoObj.id, nome: produtoObj.nome };

    if (produtoObj.grade && produtoObj.grade.length > 0) {
        variacaoWrapper.style.display = 'block';
        produtoObj.grade.forEach(g => {
            // O value será o SKU da variação, que é o nosso produto_ref_id
            selectVariacao.add(new Option(g.variacao || 'Padrão', g.sku || `${produtoObj.sku}-${g.variacao.replace(/\s+/g, '')}`));
        });
        selectVariacao.onchange = handleVariacaoSelecionadaParaPrecificar;
    } else {
        // Produto sem variações (ou grade não definida como esperado)
        // Usar o SKU principal do produto como referência
        variacaoSelecionadaParaPrecificar = null; // Ou um objeto representando a "variacao padrão"
        produtoSelecionadoParaPrecificar.sku_variacao = produtoObj.sku; // SKU do produto base
        console.log('Produto sem variações selecionado:', produtoSelecionadoParaPrecificar);
        carregarAreaDetalhePrecificacao();
    }
}

function handleVariacaoSelecionadaParaPrecificar() {
    const skuVariacao = document.getElementById('selectVariacaoParaPrecificar').value;
    const areaDetalhe = document.getElementById('areaDetalhePrecificacao');
    
    if (!skuVariacao || !produtoSelecionadoParaPrecificar) {
        areaDetalhe.style.display = 'none';
        variacaoSelecionadaParaPrecificar = null;
        return;
    };

    const produtoObj = todosProdutosSistema.find(p => p.id == produtoSelecionadoParaPrecificar.id);
    variacaoSelecionadaParaPrecificar = produtoObj.grade.find(g => (g.sku || `${produtoObj.sku}-${g.variacao.replace(/\s+/g, '')}`) === skuVariacao);
    
    produtoSelecionadoParaPrecificar.sku_variacao = skuVariacao; // Armazena o SKU da variação que é nosso produto_ref_id
    console.log('Variação selecionada:', produtoSelecionadoParaPrecificar, variacaoSelecionadaParaPrecificar);
    carregarAreaDetalhePrecificacao();
}

async function carregarAreaDetalhePrecificacao() {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        // Limpa a área de detalhe se nenhum produto/variação válido estiver selecionado
        document.getElementById('areaDetalhePrecificacao').style.display = 'none';
        document.getElementById('tituloProdutoPrecificando').textContent = 'Precificando: Selecione um Produto/Variação';
        document.getElementById('btnAddMatPrimaProduto').disabled = true;
        document.getElementById('btnAddMaoDeObraProduto').disabled = true;
        return;
    }

    document.getElementById('areaDetalhePrecificacao').style.display = 'block';
    const nomeExibicao = variacaoSelecionadaParaPrecificar 
        ? `${produtoSelecionadoParaPrecificar.nome} - ${variacaoSelecionadaParaPrecificar.variacao || 'Padrão'}`
        : produtoSelecionadoParaPrecificar.nome;
    document.getElementById('tituloProdutoPrecificando').textContent = `Precificando: ${nomeExibicao}`;

    // Habilita botões de adicionar composição/MO
    document.getElementById('btnAddMatPrimaProduto').disabled = false;
    document.getElementById('btnAddMaoDeObraProduto').disabled = false;
    
    // Limpa conteúdo anterior da área de precificação por canal
    document.getElementById('inputsResultadosPrecificacao').innerHTML = '<p style="text-align:center; color: var(--pr-cor-cinza-texto-secundario);">Selecione um canal de venda para ver ou definir a precificação.</p>';
    document.getElementById('btnSalvarPrecificacaoProduto').disabled = true;


    // Carrega os dados de composição de MP, custo de MO, e agora os canais de venda
    await Promise.all([
        carregarComposicaoMpDoProduto(produtoSelecionadoParaPrecificar.sku_variacao),
        carregarCustoMoDoProduto(produtoSelecionadoParaPrecificar.sku_variacao),
        carregarCanaisParaPrecificacao() // Não precisa passar produtoRefId aqui, pois popula o select geral
    ]);
}

async function carregarComposicaoMpDoProduto(produtoRefId) {
    const containerComposicao = document.getElementById('listaComposicaoMP');
    const elCustoTotalMP = document.getElementById('custoTotalMPCalculado');
    
    if (elCustoTotalMP) elCustoTotalMP.textContent = ''; 
    if (!containerComposicao) {
        console.error("Elemento #listaComposicaoMP não encontrado.");
        return;
    }
    containerComposicao.innerHTML = '<p style="text-align:center;"><span class="pr-spinner">Carregando composição...</span></p>';
    
    console.log(`[carregarComposicaoMpDoProduto] Buscando composição para produtoRefId: '${produtoRefId}'`);
    
    const endpoint = `/precificacao-config/${encodeURIComponent(produtoRefId)}/composicao-mp`;
    // console.log(`[carregarComposicaoMpDoProduto] Chamando API: ${endpoint}`); // Mantido o log anterior, mas a chamada é a importante

    try {
        // === CORREÇÃO AQUI ===
        composicaoMpAtual = await fetchAPI(endpoint); // <<< USA fetchAPI
        // =======================
        
        console.log(`[carregarComposicaoMpDoProduto] Composição recebida para ${produtoRefId}:`, composicaoMpAtual);
        
        renderizarListaComposicaoMP(); 
        calcularEExibirCustoTotalMP(); 
    } catch (error) {
        console.error(`[carregarComposicaoMpDoProduto] Erro ao buscar composição para ${produtoRefId}:`, error);
        containerComposicao.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar composição de matéria-prima.</p>';
        // A função fetchAPI já mostra popups para erros de token/rede.
        // Se for um erro 403 (permissão), fetchAPI também já mostra.
        // Não precisamos de outro mostrarPopupMensagem aqui, a menos que queira um específico para falha de dados.
    }
}

function calcularEExibirCustoTotalMP() {
    if (!permissoes.includes('acesso-precificacao')) return; // Ou uma permissão mais específica para ver custos

    let custoTotal = 0;
    if (composicaoMpAtual && materiasPrimasCache) {
        composicaoMpAtual.forEach(itemComp => {
            const mpDef = materiasPrimasCache.find(mp => mp.id === itemComp.materia_prima_id);
            if (mpDef) {
                custoTotal += (parseFloat(itemComp.quantidade_utilizada) || 0) * (parseFloat(mpDef.preco_por_unidade) || 0);
            }
        });
    }
     const elCustoTotalMP = document.getElementById('custoTotalMPCalculado');
    if (elCustoTotalMP) {
        elCustoTotalMP.textContent = `Custo MP Total: R$ ${custoTotal.toFixed(4)}`;
    }
    // Também atualiza o display na área de cálculo principal
    const displayCustoMPEl = document.getElementById('displayCustoMP');
    if(displayCustoMPEl) displayCustoMPEl.textContent = `R$ ${custoTotal.toFixed(4)}`;

    return custoTotal; // <<< RETORNA O VALOR NUMÉRICO
}

function renderizarListaComposicaoMP() {
    const container = document.getElementById('listaComposicaoMP');
    container.innerHTML = ''; // Limpa

    if (composicaoMpAtual.length === 0) {
        container.innerHTML = '<p style="font-style:italic; color:#777;">Nenhuma matéria-prima adicionada a este produto/variação.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'pr-lista-detalhada'; // Estilizar esta classe para uma lista bonita
    composicaoMpAtual.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${item.materia_prima_nome}</span>
            <span>Qtd: ${item.quantidade_utilizada} ${item.unidade_medida_utilizada || item.materia_prima_unidade_base || ''}</span>
            <span class="pr-acoes-item-lista">
                <button class="pr-btn-editar-item" data-id="${item.id}" data-tipo="composicaoMP" title="Editar Item"><i class="fas fa-pencil-alt"></i></button>
                <button class="pr-btn-remover-item" data-id="${item.id}" data-tipo="composicaoMP" title="Remover Item"><i class="fas fa-times-circle"></i></button>
            </span>
        `;
        // Listeners para editar/remover item da composição
        li.querySelector('.pr-btn-editar-item').addEventListener('click', (e) => abrirModalEditarItemComposicaoMP(e.currentTarget.dataset.id));
        li.querySelector('.pr-btn-remover-item').addEventListener('click', (e) => removerItemComposicaoMP(e.currentTarget.dataset.id));
        ul.appendChild(li);
    });
    container.appendChild(ul);
}

function abrirModalAdicionarItemComposicaoMP() {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        mostrarPopupMensagem('Por favor, selecione um produto e uma variação para configurar sua composição.', 'aviso');
        return;
    }
    // Verifica se o cache de matérias-primas está carregado
    if (!materiasPrimasCache || materiasPrimasCache.length === 0) {
        mostrarPopupMensagem('Lista de matérias-primas não carregada. Tente recarregar a aba "Matérias-Primas".', 'erro');
        return;
    }

    abrirModal('Adicionar Matéria-Prima à Composição'); // Função genérica que você já tem para abrir e titular o modal
    editandoItemId = null; // Garante que está em modo de adição

    let optionsMPHTML = '<option value="">Selecione uma Matéria-Prima...</option>';
    materiasPrimasCache.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(mp => {
        optionsMPHTML += `<option value="${mp.id}">${mp.nome} (${mp.unidade_medida || 'Un.'} - R$ ${parseFloat(mp.preco_por_unidade).toFixed(4)})</option>`;
    });

    formModalElement.innerHTML = `
        <input type="hidden" name="tipoFormulario" value="composicaoMP">
        <div class="pr-form-grupo">
            <label for="modalSelMateriaPrima">Matéria-Prima:</label>
            <select id="modalSelMateriaPrima" name="materia_prima_id" class="pr-select" required>
                ${optionsMPHTML}
            </select>
        </div>
        <div class="pr-form-grupo">
            <label for="modalQtdUtilizadaMP">Quantidade Utilizada (na unidade base da MP):</label>
            <input type="number" id="modalQtdUtilizadaMP" name="quantidade_utilizada" class="pr-input" required step="0.0001" min="0.0001" placeholder="Ex: 0.05">
        </div>
        <div class="pr-form-grupo">
            <label for="modalUnidadeUtilizadaMP">Unidade da Quantidade (Opcional, ex: cm, g - se diferente da unidade base da MP):</label>
            <input type="text" id="modalUnidadeUtilizadaMP" name="unidade_medida_utilizada" class="pr-input" placeholder="Ex: cm (se MP é em metros)">
        </div>
    `;
    // O listener de submit no formModalElement já está configurado no DOMContentLoaded para chamar salvarFormularioModal
}


function abrirModalEditarItemComposicaoMP(idItemComposicao) {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        mostrarPopupMensagem('Nenhum produto/variação selecionado para editar sua composição.', 'aviso');
        return;
    }
    if (!materiasPrimasCache || materiasPrimasCache.length === 0) {
        mostrarPopupMensagem('Lista de matérias-primas base não carregada. Verifique a aba "Matérias-Primas".', 'erro');
        return;
    }
    if (!composicaoMpAtual || composicaoMpAtual.length === 0) {
        mostrarPopupMensagem('A composição de matéria-prima para este produto ainda não foi carregada ou está vazia.', 'aviso');
        return;
    }

    const itemParaEditar = composicaoMpAtual.find(item => item.id == idItemComposicao); 
    if (!itemParaEditar) {
        mostrarPopupMensagem('Item da composição não encontrado para edição. Tente recarregar a composição.', 'erro');
        return;
    }

    abrirModal('Editar Item da Composição de Matéria-Prima'); // Titulo do Modal
    editandoItemId = idItemComposicao; // Guarda o ID do registro da tabela 'produto_composicao_mp'

    let optionsMPHTML = '';
    // Lista todas as MPs, mas pré-seleciona a MP do item que está sendo editado
    materiasPrimasCache.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(mp => {
        optionsMPHTML += `<option value="${mp.id}" ${mp.id == itemParaEditar.materia_prima_id ? 'selected' : ''}>
                            ${mp.nome} (${mp.unidade_medida || 'Un.'} - R$ ${parseFloat(mp.preco_por_unidade).toFixed(4)})
                          </option>`;
    });

    formModalElement.innerHTML = `
        <input type="hidden" name="tipoFormulario" value="composicaoMP"> 
        <div class="pr-form-grupo">
            <label for="modalSelMateriaPrima">Matéria-Prima:</label>
            <select id="modalSelMateriaPrima" name="materia_prima_id" class="pr-select" required>
                ${optionsMPHTML}
            </select>
            <!-- Observação: A API de salvar (UPSERT) permitirá mudar a matéria-prima. 
                 Se mudar, um novo registro de composição será criado para a nova MP 
                 e o antigo (editandoItemId) NÃO será automaticamente excluído pela API de UPSERT.
                 Se a intenção é apenas mudar quantidade/unidade da MESMA MP, o usuário não deve alterar este select.
                 Para uma UX mais restrita, você poderia mostrar o nome da MP como texto readonly e enviar o ID num hidden field.
                 Ex: 
                 <label>Matéria-Prima:</label>
                 <input type="text" class="pr-input" value="${itemParaEditar.materia_prima_nome}" readonly>
                 <input type="hidden" name="materia_prima_id" value="${itemParaEditar.materia_prima_id}">
            -->
        </div>
        <div class="pr-form-grupo">
            <label for="modalQtdUtilizadaMP">Quantidade Utilizada (na unidade base da MP):</label>
            <input type="number" id="modalQtdUtilizadaMP" name="quantidade_utilizada" class="pr-input" 
                   value="${parseFloat(itemParaEditar.quantidade_utilizada)}" required step="0.0001" min="0.0001" placeholder="Ex: 0.05">
        </div>
        <div class="pr-form-grupo">
            <label for="modalUnidadeUtilizadaMP">Unidade da Quantidade (Opcional, ex: cm, g):</label>
            <input type="text" id="modalUnidadeUtilizadaMP" name="unidade_medida_utilizada" class="pr-input" 
                   value="${itemParaEditar.unidade_medida_utilizada || ''}" placeholder="Se diferente da unidade base da MP">
        </div>
    `;
    // O listener de submit no formModalElement (configurado no DOMContentLoaded) chamará salvarFormularioModal
}

async function carregarCustoMoDoProduto(produtoRefId) {
    const containerCustoMO = document.getElementById('listaCustoMO');
    const elCustoTotalMO = document.getElementById('custoTotalMOCalculado');
    if (elCustoTotalMO) elCustoTotalMO.textContent = ''; // Limpa

    if (!containerCustoMO) return;
    containerCustoMO.innerHTML = '<p style="text-align:center;"><span class="pr-spinner">Carregando custos de M.O...</span></p>';
    
    console.log(`[carregarCustoMoDoProduto] Buscando M.O. para produtoRefId: '${produtoRefId}'`);
    const endpoint = `/precificacao-config/${encodeURIComponent(produtoRefId)}/custo-mao-de-obra`;

    try {
        custoMoAtual = await fetchAPI(endpoint); // Usa sua função fetchAPI
        console.log(`[carregarCustoMoDoProduto] Custos M.O. recebidos para ${produtoRefId}:`, custoMoAtual);
        renderizarListaCustoMO();
        calcularEExibirCustoTotalMO(); // Implementaremos esta depois
    } catch (error) {
        containerCustoMO.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar custos de M.O.</p>';
        // mostrarPopupMensagem('Erro ao carregar custos de mão de obra.', 'erro'); // fetchAPI já mostra
    }
}

function renderizarListaCustoMO() {
    const container = document.getElementById('listaCustoMO');
    container.innerHTML = '';

    if (!custoMoAtual || custoMoAtual.length === 0) {
        container.innerHTML = '<p style="font-style:italic; color:#777;">Nenhum custo de mão de obra adicionado a este produto/variação.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'pr-lista-detalhada'; 
    custoMoAtual.forEach(itemMO => {
        const li = document.createElement('li');
        // itemMO deve ter: id (do registro produto_custo_mao_de_obra), mao_de_obra_nome, tempo_minutos_producao
        li.innerHTML = `
            <span>${itemMO.mao_de_obra_nome}</span>
            <span>Tempo: ${itemMO.tempo_minutos_producao} min</span>
            <span class="pr-acoes-item-lista">
                <button class="pr-btn-editar-item" data-id="${itemMO.id}" data-tipo="custoMO" title="Editar Tempo"><i class="fas fa-pencil-alt"></i></button>
                <button class="pr-btn-remover-item" data-id="${itemMO.id}" data-tipo="custoMO" title="Remover Mão de Obra"><i class="fas fa-times-circle"></i></button>
            </span>
        `;
        li.querySelector('.pr-btn-editar-item').addEventListener('click', (e) => abrirModalEditarItemCustoMO(e.currentTarget.dataset.id));
        li.querySelector('.pr-btn-remover-item').addEventListener('click', (e) => removerItemCustoMO(e.currentTarget.dataset.id));
        ul.appendChild(li);
    });
    container.appendChild(ul);
}

function abrirModalAdicionarItemCustoMO() {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        mostrarPopupMensagem('Selecione um produto e variação primeiro.', 'aviso');
        return;
    }
    if (!tiposMaoDeObraCache || tiposMaoDeObraCache.length === 0) {
        mostrarPopupMensagem('Lista de Tipos de Mão de Obra não carregada. Tente recarregar a aba "Mão de Obra".', 'erro');
        return;
    }

    abrirModal('Adicionar Mão de Obra ao Produto');
    editandoItemId = null; 

    let optionsMOHTML = '<option value="">Selecione o Tipo de Mão de Obra...</option>';
    tiposMaoDeObraCache.filter(tmo => tmo.ativo).sort((a,b) => a.nome_tipo.localeCompare(b.nome_tipo)).forEach(tmo => {
        optionsMOHTML += `<option value="${tmo.id}">${tmo.nome_tipo}</option>`;
    });

    formModalElement.innerHTML = `
        <input type="hidden" name="tipoFormulario" value="custoMO">
        <div class="pr-form-grupo">
            <label for="modalSelTipoMO">Tipo de Mão de Obra:</label>
            <select id="modalSelTipoMO" name="tipo_mao_de_obra_id" class="pr-select" required>
                ${optionsMOHTML}
            </select>
        </div>
        <div class="pr-form-grupo">
            <label for="modalTempoMinutos">Tempo de Produção (minutos) para 1 unidade:</label>
            <input type="number" id="modalTempoMinutos" name="tempo_minutos_producao" class="pr-input" required step="0.01" min="0.01" placeholder="Ex: 5.5">
        </div>
    `;
}

function abrirModalEditarItemCustoMO(custoMoId) {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        mostrarPopupMensagem('Nenhum produto/variação selecionado para editar o custo de M.O.', 'aviso');
        return;
    }
    // Garante que o cache de Tipos de Mão de Obra (dos cadastros base) está carregado
    if (!tiposMaoDeObraCache || tiposMaoDeObraCache.length === 0) {
        mostrarPopupMensagem('Lista de Tipos de Mão de Obra não carregada. Verifique a aba "Mão de Obra" nos cadastros base.', 'erro');
        return;
    }
    // Garante que a lista de custos de MO do produto atual está carregada
    if (!custoMoAtual || custoMoAtual.length === 0) {
        mostrarPopupMensagem('Lista de custos de M.O. para este produto não carregada ou vazia.', 'aviso');
        return;
    }

    // Encontra o item específico de custo de M.O. que será editado
    // custoMoId é o ID da linha na tabela produto_custo_mao_de_obra
    const itemParaEditar = custoMoAtual.find(item => item.id == custoMoId); 
    if (!itemParaEditar) {
        mostrarPopupMensagem('Custo de Mão de Obra específico não encontrado para edição.', 'erro');
        return;
    }

    abrirModal('Editar Custo de Mão de Obra do Produto'); // Define o título do modal genérico
    editandoItemId = custoMoId; // Guarda o ID do registro da tabela produto_custo_mao_de_obra

    // Monta as opções para o <select> de Tipo de Mão de Obra, pré-selecionando o atual
    let optionsMOHTML = '';
    tiposMaoDeObraCache
        .filter(tmo => tmo.ativo || tmo.id == itemParaEditar.tipo_mao_de_obra_id) // Mostra tipos ativos ou o que já está selecionado (mesmo que inativo)
        .sort((a,b) => a.nome_tipo.localeCompare(b.nome_tipo))
        .forEach(tmo => {
            optionsMOHTML += `<option value="${tmo.id}" ${tmo.id == itemParaEditar.tipo_mao_de_obra_id ? 'selected' : ''}>
                                ${tmo.nome_tipo}
                              </option>`;
        });

    // Constrói o HTML do formulário dentro do modal
    formModalElement.innerHTML = `
        <input type="hidden" name="tipoFormulario" value="custoMO">
        <div class="pr-form-grupo">
            <label for="modalSelTipoMO">Tipo de Mão de Obra:</label>
            <select id="modalSelTipoMO" name="tipo_mao_de_obra_id" class="pr-select" required>
                ${optionsMOHTML}
            </select>
            <!-- 
                Observação sobre editar o Tipo de M.O.:
                A API POST /.../custo-mao-de-obra faz UPSERT pela combinação (produto_ref_id, tipo_mao_de_obra_id).
                Se o usuário selecionar um NOVO tipo de M.O. aqui, a API criará um novo registro de custo 
                para esse novo tipo de M.O. e o produto, ou atualizará se já existir um para esse novo tipo.
                O registro original (com o tipo_mao_de_obra_id antigo, que está em editandoItemId) NÃO será 
                automaticamente excluído pela API de UPSERT se o tipo de M.O. for alterado.
                Se a intenção é apenas mudar o TEMPO para o MESMO tipo de M.O., o usuário não deve alterar este select.
                Se você quiser impedir a alteração do tipo de M.O. na edição, você pode exibir o nome como texto readonly:
                
                <label>Tipo de Mão de Obra:</label>
                <input type="text" class="pr-input" value="${itemParaEditar.mao_de_obra_nome || 'Nome não encontrado'}" readonly 
                       title="O tipo de M.O. não pode ser alterado na edição. Remova e adicione um novo se necessário.">
                <input type="hidden" name="tipo_mao_de_obra_id" value="${itemParaEditar.tipo_mao_de_obra_id}">
            -->
        </div>
        <div class="pr-form-grupo">
            <label for="modalTempoMinutos">Tempo de Produção (minutos) para 1 unidade:</label>
            <input type="number" id="modalTempoMinutos" name="tempo_minutos_producao" class="pr-input" 
                   value="${parseFloat(itemParaEditar.tempo_minutos_producao)}" required step="0.01" min="0.01" placeholder="Ex: 5.5">
        </div>
    `;
    // O listener de submit no formModalElement (configurado no DOMContentLoaded) chamará salvarFormularioModal,
    // que por sua vez chamará salvarItemCustoMO.
}

async function removerItemCustoMO(custoMoId) { // custoMoId é o ID da tabela produto_custo_mao_de_obra
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) return;
    
    const itemParaRemover = custoMoAtual.find(i => i.id == custoMoId);
    const nomeItem = itemParaRemover ? itemParaRemover.mao_de_obra_nome : "este custo de M.O.";

    if (!confirm(`Tem certeza que deseja remover "${nomeItem}" dos custos deste produto/variação?`)) return;

    try {
        await fetchAPI(`/precificacao-config/custo-mao-de-obra/${custoMoId}`, { method: 'DELETE' });
        mostrarPopupMensagem('Custo de Mão de Obra removido com sucesso!', 'sucesso');
        await carregarCustoMoDoProduto(produtoSelecionadoParaPrecificar.sku_variacao);
        // calcularEExibirCustoTotalMO(); // Será chamado dentro de carregarCustoMoDoProduto
    } catch (error) {
        mostrarPopupMensagem(`Erro ao remover custo de M.O.: ${error.message}`, 'erro');
    }
}

function calcularEExibirCustoTotalMO() {
    if (!permissoes.includes('acesso-precificacao')) return 0;

    let custoTotalMO = 0;
    if (custoMoAtual && tiposMaoDeObraCache) {
        custoMoAtual.forEach(itemMO => {
            const tipoMODef = tiposMaoDeObraCache.find(tmo => tmo.id === itemMO.tipo_mao_de_obra_id);
            if (tipoMODef && tipoMODef.horas_trabalhadas_mes > 0) {
                const custoMensalTotal = (parseFloat(tipoMODef.salario_base) || 0) * (1 + (parseFloat(tipoMODef.percentual_encargos) || 0)) + 
                                         (parseFloat(tipoMODef.custo_vt_mensal) || 0) + 
                                         (parseFloat(tipoMODef.custo_vr_va_mensal) || 0);
                const custoPorMinuto = custoMensalTotal / (tipoMODef.horas_trabalhadas_mes * 60);
                custoTotalMO += (parseFloat(itemMO.tempo_minutos_producao) || 0) * custoPorMinuto;
            }
        });
    }
    const elCustoTotalMO = document.getElementById('custoTotalMOCalculado');
    if (elCustoTotalMO) {
        elCustoTotalMO.textContent = `Custo M.O. Total: R$ ${custoTotalMO.toFixed(4)}`;
    }
    return custoTotalMO;
}
// Chamar calcularEExibirCustoTotalMO() após carregar ou modificar os custos de MO.

// --- Funções para carregar/salvar Configs de Precificação por Canal ---
async function carregarCanaisParaPrecificacao() {
    const selectCanal = document.getElementById('selectCanalPrecificacao');
    if (!selectCanal) {
        console.error("Elemento #selectCanalPrecificacao não encontrado.");
        return;
    }

    // Garante que o cache de canais de venda está carregado
    if (!canaisVendaCache || canaisVendaCache.length === 0) {
        // Tenta carregar se estiver vazio (pode acontecer se o usuário não visitou a aba de cadastro)
        try {
            canaisVendaCache = await fetchAPI('/canais-venda'); // Rota que busca apenas os ativos
        } catch (error) {
            mostrarPopupMensagem("Erro ao carregar lista de canais de venda.", "erro");
            selectCanal.innerHTML = '<option value="">Erro ao carregar canais</option>';
            return;
        }
    }
    
    selectCanal.innerHTML = '<option value="">Selecione um Canal de Venda...</option>';
    const canaisAtivos = canaisVendaCache.filter(canal => canal.ativo);

    if (canaisAtivos.length === 0) {
        selectCanal.innerHTML = '<option value="">Nenhum canal de venda ativo cadastrado.</option>';
        // Limpa a área de inputs/resultados e desabilita o botão salvar
        document.getElementById('inputsResultadosPrecificacao').innerHTML = '<p style="text-align:center; color: var(--pr-cor-cinza-texto-secundario);">Cadastre um canal de venda ativo para continuar.</p>';
        document.getElementById('btnSalvarPrecificacaoProduto').disabled = true;
        return;
    }

    canaisAtivos.sort((a,b) => a.nome_canal.localeCompare(b.nome_canal)).forEach(canal => {
        selectCanal.add(new Option(canal.nome_canal, canal.id));
    });

    // Remove listener antigo para evitar duplicação, se houver
    if (selectCanal._changeListener) {
        selectCanal.removeEventListener('change', selectCanal._changeListener);
    }
    // Adiciona o novo listener
    selectCanal._changeListener = handleCanalDeVendaSelecionado;
    selectCanal.addEventListener('change', selectCanal._changeListener);

    // Limpa a área de inputs/resultados e desabilita o botão salvar ao carregar os canais
    // (antes que um canal seja selecionado)
    document.getElementById('inputsResultadosPrecificacao').innerHTML = '<p style="text-align:center; color: var(--pr-cor-cinza-texto-secundario);">Selecione um canal de venda para ver ou definir a precificação.</p>';
    document.getElementById('btnSalvarPrecificacaoProduto').disabled = true;
}

async function handleCanalDeVendaSelecionado() {
    const selectCanal = document.getElementById('selectCanalPrecificacao');
    const canalId = selectCanal.value;
    const areaInputsResultados = document.getElementById('inputsResultadosPrecificacao');
    const btnSalvarPrec = document.getElementById('btnSalvarPrecificacaoProduto');

    areaInputsResultados.innerHTML = ''; // Limpa área anterior
    if (btnSalvarPrec) btnSalvarPrec.disabled = true; // Desabilita salvar por padrão

    if (!canalId) { // Se "Selecione um Canal..." for escolhido
        areaInputsResultados.innerHTML = '<p style="text-align:center; color: var(--pr-cor-cinza-texto-secundario);">Selecione um canal de venda para ver ou definir a precificação.</p>';
        return;
    }

    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) {
        mostrarPopupMensagem("Selecione um produto e variação antes de escolher o canal.", "aviso");
        selectCanal.value = ''; // Reseta o select do canal
        return;
    }

    areaInputsResultados.innerHTML = '<p style="text-align:center;"><span class="pr-spinner">Carregando configuração...</span></p>';

    try {
        const produtoRefId = produtoSelecionadoParaPrecificar.sku_variacao;
        configPrecificacaoCanalAtual = await fetchAPI(`/precificacao-config/${encodeURIComponent(produtoRefId)}/canal/${canalId}`);
        // configPrecificacaoCanalAtual será null se não houver config salva, o que é OK.
        
        const dadosCanalSelecionado = canaisVendaCache.find(c => c.id == canalId);

        console.log(`Configuração existente para ${produtoRefId} no canal ${canalId}:`, configPrecificacaoCanalAtual);
        console.log(`Dados do canal selecionado:`, dadosCanalSelecionado);

        renderizarFormularioECalculoPrecificacao(configPrecificacaoCanalAtual || {}, dadosCanalSelecionado || {}); // Passa objeto vazio se null
        if (btnSalvarPrec) btnSalvarPrec.disabled = false;

    } catch (error) {
        // Este catch agora só será para erros REAIS da API (ex: 500, erro de rede)
        // porque um 200 com null não é um erro, e 401/403 são tratados por fetchAPI.
        console.error("Erro real ao buscar config do canal:", error);
        areaInputsResultados.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar dados de precificação para este canal.</p>';
        // A fetchAPI já deve ter mostrado um popup para erros graves.
        // Não precisamos mostrar outro aqui, a menos que seja uma mensagem específica.
    }
}

function recalcularPrecificacaoNaTela(dadosCanal) {
    if (!dadosCanal || !dadosCanal.id) {
        console.warn("[recalcularPrecificacaoNaTela] Dados do canal ausentes. Não é possível calcular.");
        // Limpa os campos de resultado ou mostra placeholders
        document.getElementById('displayCustoTotalProducao').textContent = 'R$ -.--';
        document.getElementById('displayPrecoVendaFinal').textContent = 'R$ -.--';
        document.getElementById('displayMargemLucroReal').textContent = '-.--%';
        return;
    }

    console.log("[recalcularPrecificacaoNaTela] Recalculando com dados do canal:", dadosCanal);

    const custoMP = calcularEExibirCustoTotalMP(); 
    const custoMO = calcularEExibirCustoTotalMO(); 

    const custoEmbalagemInput = document.getElementById('inputCustoEmbalagem');
    const custoOperacionalInput = document.getElementById('inputCustoOperacional');
    const impostoPercInput = document.getElementById('inputImpostoPerc');
    const lucroPercInput = document.getElementById('inputLucroPerc');
    const precoVendaManualInput = document.getElementById('inputPrecoVendaManual');

    const custoEmbalagem = parseFloat(custoEmbalagemInput?.value) || 0;
    const custoOperacional = parseFloat(custoOperacionalInput?.value) || 0;
    const impostoPerc = (parseFloat(impostoPercInput?.value) || 0) / 100;
    const lucroPercDesejado = (parseFloat(lucroPercInput?.value) || 0) / 100;
    const precoVendaManual = parseFloat(precoVendaManualInput?.value) || 0;

    const taxaPercCanal = parseFloat(dadosCanal.taxa_percentual) || 0;
    const taxaFixaCanal = parseFloat(dadosCanal.taxa_fixa) || 0;
    const taxaAdicionalPercCanal = parseFloat(dadosCanal.taxa_adicional_percentual) || 0;

    const custoTotalProducao = custoMP + custoMO + custoEmbalagem + custoOperacional;
    document.getElementById('displayCustoTotalProducao').textContent = `R$ ${custoTotalProducao.toFixed(2)}`;

    let precoVendaFinal = 0;
    if (precoVendaManual > 0) {
        precoVendaFinal = precoVendaManual;
    } else {
        // === CORREÇÃO AQUI: Mover a definição de somaTaxasPercentuais para ANTES de seu uso ===
        const somaTaxasPercentuais = taxaPercCanal + taxaAdicionalPercCanal + impostoPerc;
        // =====================================================================================
            
        const denominadorMarkup = 1 - somaTaxasPercentuais - lucroPercDesejado;

        if (denominadorMarkup <= 0) {
            document.getElementById('displayPrecoVendaFinal').textContent = 'Inválido';
            document.getElementById('displayMargemLucroReal').textContent = 'Inválido';
            console.warn("Denominador do markup é <= 0.", {somaTaxasPercentuais, lucroPercDesejado});
            return; 
        }
        
        const custoComTaxaFixa = custoTotalProducao + taxaFixaCanal;
        precoVendaFinal = custoComTaxaFixa / denominadorMarkup;
    }
    document.getElementById('displayPrecoVendaFinal').textContent = `R$ ${precoVendaFinal.toFixed(2)}`;

    const valorImpostoPago = precoVendaFinal * impostoPerc;
    const valorTaxaCanalPaga = (precoVendaFinal * taxaPercCanal) + taxaFixaCanal + (precoVendaFinal * taxaAdicionalPercCanal);
    const receitaLiquida = precoVendaFinal - valorImpostoPago - valorTaxaCanalPaga;
    const lucroLiquidoUnitario = receitaLiquida - custoTotalProducao;
    let margemLucroRealPerc = 0;
    if (precoVendaFinal > 0) {
        margemLucroRealPerc = (lucroLiquidoUnitario / precoVendaFinal) * 100;
    }
    document.getElementById('displayMargemLucroReal').textContent = `${margemLucroRealPerc.toFixed(2)}%`;

    // console.log para depuração dos cálculos
    /* console.log({
        custoMP, custoMO, custoEmbalagem, custoOperacional, custoTotalProducao,
        impostoPerc, lucroPercDesejado, precoVendaManual,
        taxaPercCanal, taxaFixaCanal, taxaAdicionalPercCanal,
        somaTaxasPercentuais, denominadorMarkup,
        precoVendaFinal, valorImpostoPago, valorTaxaCanalPaga, receitaLiquida, lucroLiquidoUnitario, margemLucroRealPerc
    }); */
}

function renderizarFormularioECalculoPrecificacao(configPrecificacao = {}, dadosCanal = {}) {
    const areaInputsResultados = document.getElementById('inputsResultadosPrecificacao');
    if (!areaInputsResultados) return;

    // Os valores de configPrecificacao vêm da tabela produto_precificacao_configs
    // Os valores de dadosCanal vêm da tabela canais_venda_config

    areaInputsResultados.innerHTML = `
        <div class="pr-form-grid-precificacao">
            <div class="pr-custos-base-col">
                <h5 class="pr-subtitulo-col">Custos Base Calculados:</h5>
                <p>Custo Matéria-Prima: <strong id="displayCustoMP">R$ 0.0000</strong></p>
                <p>Custo Mão de Obra: <strong id="displayCustoMO">R$ 0.0000</strong></p>
                <div class="pr-form-grupo">
                    <label for="inputCustoEmbalagem">Custo Embalagem Unit. (R$):</label>
                    <input type="number" id="inputCustoEmbalagem" name="custo_embalagem_unitario" class="pr-input" 
                           value="${configPrecificacao.custo_embalagem_unitario || 0}" step="0.01" min="0">
                </div>
                <div class="pr-form-grupo">
                    <label for="inputCustoOperacional">Custo Operacional Unit. Atribuído (R$):</label>
                    <input type="number" id="inputCustoOperacional" name="custo_operacional_unitario_atribuido" class="pr-input" 
                           value="${configPrecificacao.custo_operacional_unitario_atribuido || 0}" step="0.0001" min="0">
                </div>
                <p style="margin-top:10px;"><strong>Custo Total de Produção:</strong> <strong id="displayCustoTotalProducao" style="font-size:1.1em;">R$ 0.00</strong></p>
            </div>

            <div class="pr-config-canal-col">
                <h5 class="pr-subtitulo-col">Precificação para: ${dadosCanal.nome_canal || 'Canal'}</h5>
                <p>Taxa Principal do Canal: <strong>${(dadosCanal.taxa_percentual * 100).toFixed(2)}%</strong> + R$ <strong>${parseFloat(dadosCanal.taxa_fixa).toFixed(2)}</strong></p>
                ${dadosCanal.taxa_adicional_percentual > 0 ? `<p>Taxa Adicional: <strong>${(dadosCanal.taxa_adicional_percentual * 100).toFixed(2)}%</strong></p>` : ''}
                
                <div class="pr-form-grupo">
                    <label for="inputImpostoPerc">Imposto sobre Venda (%):</label>
                    <input type="number" id="inputImpostoPerc" name="imposto_percentual_aplicado" class="pr-input" 
                           value="${(configPrecificacao.imposto_percentual_aplicado || 0) * 100}" step="0.01" min="0" max="100" placeholder="Ex: 5 para 5%">
                </div>
                <div class="pr-form-grupo">
                    <label for="inputLucroPerc">Margem de Lucro Desejada (% sobre o custo de produção + taxas):</label>
                    <input type="number" id="inputLucroPerc" name="margem_lucro_desejada_percentual" class="pr-input" 
                           value="${(configPrecificacao.margem_lucro_desejada_percentual || 0) * 100}" step="0.01" min="0" placeholder="Ex: 30 para 30%">
                </div>
                <div class="pr-form-grupo">
                    <label for="inputPrecoVendaManual">Preço de Venda Manual (R$, opcional):</label>
                    <input type="number" id="inputPrecoVendaManual" name="preco_venda_manual_definido" class="pr-input" 
                           value="${configPrecificacao.preco_venda_manual_definido || ''}" step="0.01" min="0" placeholder="Deixe em branco para calcular">
                </div>

                <div style="margin-top:15px; padding-top:15px; border-top:1px solid #eee;">
                    <p>Preço de Venda Sugerido/Final: <strong id="displayPrecoVendaFinal" style="font-size:1.3em; color:var(--pr-cor-verde-sucesso);">R$ 0.00</strong></p>
                    <p>Margem de Lucro Real Estimada: <strong id="displayMargemLucroReal" style="font-size:1.1em;">0.00%</strong></p>
                </div>
            </div>
        </div>
        <div class="pr-form-grupo">
            <label for="inputObservacoesPrecificacao">Observações da Precificação:</label>
            <textarea id="inputObservacoesPrecificacao" name="observacoes" class="pr-textarea" rows="2">${configPrecificacao.observacoes || ''}</textarea>
        </div>
    `;

    // Atualiza os displays de custo MP e MO (que já foram calculados)
    if(document.getElementById('displayCustoMP') && document.getElementById('custoTotalMPCalculado')) {
        document.getElementById('displayCustoMP').textContent = document.getElementById('custoTotalMPCalculado').textContent.replace('Custo MP Total: ', '');
    }
    if(document.getElementById('displayCustoMO') && document.getElementById('custoTotalMOCalculado')) {
        document.getElementById('displayCustoMO').textContent = document.getElementById('custoTotalMOCalculado').textContent.replace('Custo M.O. Total: ', '');
    }
    
    // Adicionar listeners aos inputs para recalcular dinamicamente
    const inputsParaRecalculo = [
        document.getElementById('inputCustoEmbalagem'),
        document.getElementById('inputCustoOperacional'),
        document.getElementById('inputImpostoPerc'),
        document.getElementById('inputLucroPerc'),
        document.getElementById('inputPrecoVendaManual')
    ];
    inputsParaRecalculo.forEach(input => {
        if (input) input.addEventListener('input', () => recalcularPrecificacaoNaTela(dadosCanal));
    });

    // Primeiro cálculo ao renderizar
    recalcularPrecificacaoNaTela(dadosCanal);
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    const auth = await verificarAutenticacao('precificacao.html', ['acesso-precificacao']); // Crie esta permissão
    if (!auth) return;
    usuarioLogado = auth.usuario;
    permissoes = auth.permissoes || [];
    document.body.classList.add('autenticado'); 

    setupTabs();
    // Carrega a primeira aba por padrão, mas somente após os dados estarem disponíveis
    // await carregarDadosDaAbaAtiva('materiasPrimas'); 
    // await carregarProdutosParaPrecificar();

    // Mover carregamento inicial para depois da autenticação
    try {
        const auth = await verificarAutenticacao('precificacao.html', ['acesso-precificacao']);
        if (!auth) {
            document.body.innerHTML = "<p style='color:red; text-align:center; padding:20px;'>Acesso negado. Redirecionando...</p>";
            setTimeout(() => window.location.href = '/login.html', 2000);
            return;
        }
        usuarioLogado = auth.usuario;
        permissoes = auth.permissoes || [];
        document.body.classList.add('autenticado');

        // Agora carrega os dados
        await carregarDadosDaAbaAtiva('materiasPrimas'); // Carrega a primeira aba
        await carregarProdutosParaPrecificar();


        // Listeners para botões "Novo..." que abrem o modal
        document.getElementById('btnNovaMateriaPrima').addEventListener('click', () => abrirModalParaNovaMateriaPrima());
        document.getElementById('btnNovoTipoMaoDeObra').addEventListener('click', () => abrirModalParaNovoTipoMaoDeObra());
        document.getElementById('btnNovaDespesa').addEventListener('click', () => abrirModalParaNovaDespesa());        
        document.getElementById('btnNovoCanalVenda').addEventListener('click', () => abrirModalParaNovoCanalVenda());
        // Listener para o modal
        document.getElementById('fecharModalGenericoPrecificacao').addEventListener('click', fecharModal);
        document.getElementById('btnCancelarModal').addEventListener('click', fecharModal);
        formModalElement.addEventListener('submit', salvarFormularioModal); // Listener no formulário
        document.getElementById('btnAddMatPrimaProduto').addEventListener('click', abrirModalAdicionarItemComposicaoMP);
        //document.getElementById('btnAddMaoDeObraProduto').addEventListener('click', abrirModalAdicionarItemCustoMO);

        document.getElementById('btnAddMaoDeObraProduto')?.addEventListener('click', abrirModalAdicionarItemCustoMO);

        const btnAddMPProduto = document.getElementById('btnAddMatPrimaProduto');
        if (btnAddMPProduto) {
        btnAddMPProduto.addEventListener('click', abrirModalAdicionarItemComposicaoMP);
        }
        
        const btnSalvarPrec = document.getElementById('btnSalvarPrecificacaoProduto');
        if (btnSalvarPrec) {
        btnSalvarPrec.addEventListener('click', salvarPrecificacaoProdutoCanal);
        btnSalvarPrec.disabled = true; // Começa desabilitado até um canal ser selecionado e dados carregados/editados
        }


    } catch (error) {
        console.error("Erro na inicialização da página de precificação:", error);
        mostrarPopupMensagem("Erro ao carregar dados iniciais da página.", "erro");
    }
});