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
function mostrarPopupMensagem(mensagem, tipo = 'erro', duracao = 4000) {
    // ... (Sua implementação de mostrarPopupMensagem, usando classes pr-popup-*)
    console.log(`[POPUP ${tipo}]: ${mensagem}`); // Placeholder
}

// --- Funções de Fetch para as Novas APIs ---
async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    const finalOptions = { ...defaultOptions, ...options };
    finalOptions.headers = { ...defaultOptions.headers, ...options.headers };

    try {
        const response = await fetch(`/api${endpoint}`, finalOptions);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP Error ${response.status}` }));
            if (response.status === 401) {
                mostrarPopupMensagem('Sessão expirada. Faça login.', 'erro');
                window.location.href = '/login.html';
            }
            throw new Error(errorData.error || `Erro ${response.status}`);
        }
        return response.status === 204 ? null : response.json();
    } catch (error) {
        console.error(`Erro na API ${endpoint}:`, error);
        mostrarPopupMensagem(`Erro ao comunicar com API: ${error.message}`, 'erro');
        throw error;
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

    if (tituloLower.includes('matéria-prima') && !tituloLower.includes('composição')) { // Cadastro base de MP
        await salvarMateriaPrima();
    } else if (tituloLower.includes('mão de obra') && !tituloLower.includes('custo do produto')) { // Cadastro base de MO
        await salvarTipoMaoDeObra();
    } else if (tituloLower.includes('despesa operacional')) {
        await salvarDespesa();
    } else if (tituloLower.includes('canal de venda')) {
        await salvarCanalVenda();
    } else if (tituloLower.includes('matéria-prima à composição') || (tituloLower.includes('editar item da composição') && tituloLower.includes('matéria-prima'))) { // NOVO
        await salvarItemComposicaoMP();
    }
    // Adicionar else if para salvar item de Custo de Mão de Obra do Produto
}

async function salvarItemComposicaoMP() {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) return;

    const formData = new FormData(formModalElement);
    const dados = {
        materia_prima_id: parseInt(formData.get('materia_prima_id')),
        quantidade_utilizada: parseFloat(formData.get('quantidade_utilizada')),
        unidade_medida_utilizada: formData.get('unidade_medida_utilizada') || null,
    };

    if (!dados.materia_prima_id || isNaN(dados.quantidade_utilizada) || dados.quantidade_utilizada <= 0) {
        mostrarPopupMensagem('Selecione a matéria-prima e informe uma quantidade válida.', 'erro');
        return;
    }
    // Se é edição, o ID do item da composição já está em editandoItemId.
    // A API POST /:produtoRefId/composicao-mp faz UPSERT, então não precisamos de um endpoint PUT separado para editar um item existente da composição.
    // O que precisamos é garantir que, se editandoItemId existir, ele corresponda ao materia_prima_id selecionado, ou tratar como novo.
    // Para simplificar o UPSERT, a API usa (produto_ref_id, materia_prima_id) como chave de conflito.
    // Então, se o usuário *muda* a matéria-prima no modal de edição, ele efetivamente cria um novo e o antigo precisaria ser removido.
    // Por ora, vamos assumir que a edição não muda a matéria_prima_id, apenas a quantidade/unidade.
    // Se `editandoItemId` existir, significa que estamos atualizando um item existente que já tem um `materia_prima_id`.
    // Se o `materia_prima_id` do formulário for diferente do `materia_prima_id` original do item (se `editandoItemId` está setado),
    // o ideal seria tratar isso (ex: avisar o usuário ou deletar o antigo e criar um novo).
    // A lógica UPSERT da API simplifica isso: se a combinação (produto_ref_id, nova_materia_prima_id) não existe, cria; se existe, atualiza.

    try {
        btnSalvarModalElement.disabled = true;
        btnSalvarModalElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        
        await fetchAPI(`/precificacao-config/${produtoSelecionadoParaPrecificar.sku_variacao}/composicao-mp`, { 
            method: 'POST', // API faz UPSERT
            body: JSON.stringify(dados) 
        });
        mostrarPopupMensagem(`Item da composição ${editandoItemId ? 'atualizado' : 'adicionado'} com sucesso!`, 'sucesso');
        fecharModal();
        await carregarComposicaoMpDoProduto(produtoSelecionadoParaPrecificar.sku_variacao);
    } catch (error) {
        mostrarPopupMensagem(`Erro ao salvar item na composição: ${error.message}`, 'erro');
    } finally {
        btnSalvarModalElement.disabled = false;
        btnSalvarModalElement.textContent = 'Salvar';
    }
}

async function removerItemComposicaoMP(composicaoMpId) {
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) return;
    
    const item = composicaoMpAtual.find(i => i.id == composicaoMpId);
    if (!confirm(`Tem certeza que deseja remover "${item?.materia_prima_nome || 'este item'}" da composição do produto?`)) return;

    try {
        await fetchAPI(`/precificacao-config/composicao-mp/${composicaoMpId}`, { method: 'DELETE' });
        mostrarPopupMensagem('Item removido da composição com sucesso!', 'sucesso');
        await carregarComposicaoMpDoProduto(produtoSelecionadoParaPrecificar.sku_variacao);
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
    if (!produtoSelecionadoParaPrecificar || !produtoSelecionadoParaPrecificar.sku_variacao) return;

    document.getElementById('areaDetalhePrecificacao').style.display = 'block';
    const nomeExibicao = variacaoSelecionadaParaPrecificar 
        ? `${produtoSelecionadoParaPrecificar.nome} - ${variacaoSelecionadaParaPrecificar.variacao || 'Padrão'}`
        : produtoSelecionadoParaPrecificar.nome;
    document.getElementById('tituloProdutoPrecificando').textContent = `Precificando: ${nomeExibicao}`;

    // Carregar dados existentes para este produto/variação (sku_variacao)
    await carregarComposicaoMpDoProduto(produtoSelecionadoParaPrecificar.sku_variacao);
    await carregarCustoMoDoProduto(produtoSelecionadoParaPrecificar.sku_variacao);
    await carregarCanaisParaPrecificacao(produtoSelecionadoParaPrecificar.sku_variacao); 
    // A função acima deve popular o select de canal e, ao selecionar um canal,
    // carregar a configuração de precificação existente ou preparar para uma nova.
}

async function carregarComposicaoMpDoProduto(produtoRefId) {
    const containerComposicao = document.getElementById('listaComposicaoMP');
    if (!containerComposicao) return;
    containerComposicao.innerHTML = '<p>Carregando composição...</p>';
    
    try {
        composicaoMpAtual = await fetchAPI(`/precificacao-config/${produtoRefId}/composicao-mp`);
        renderizarListaComposicaoMP();
    } catch (error) {
        containerComposicao.innerHTML = '<p style="color:red;">Erro ao carregar composição.</p>';
        mostrarPopupMensagem('Erro ao carregar composição de matéria-prima.', 'erro');
    }
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
        mostrarPopupMensagem('Selecione um produto e variação primeiro.', 'aviso');
        return;
    }
    abrirModal('Adicionar Matéria-Prima à Composição'); // Reusa o modal genérico

    let optionsMP = '<option value="">Selecione uma Matéria-Prima...</option>';
    materiasPrimasCache.forEach(mp => {
        optionsMP += `<option value="${mp.id}">${mp.nome} (${mp.unidade_medida || 'Un.'} - R$ ${parseFloat(mp.preco_por_unidade).toFixed(2)})</option>`;
    });

    formModalElement.innerHTML = `
        <div class="pr-form-grupo">
            <label for="modalSelMateriaPrima">Matéria-Prima:</label>
            <select id="modalSelMateriaPrima" name="materia_prima_id" class="pr-select" required>${optionsMP}</select>
        </div>
        <div class="pr-form-grupo">
            <label for="modalQtdUtilizadaMP">Quantidade Utilizada:</label>
            <input type="number" id="modalQtdUtilizadaMP" name="quantidade_utilizada" class="pr-input" required step="0.0001" min="0.0001">
        </div>
        <div class="pr-form-grupo">
            <label for="modalUnidadeUtilizadaMP">Unidade da Quantidade (Ex: cm, g):</label>
            <input type="text" id="modalUnidadeUtilizadaMP" name="unidade_medida_utilizada" class="pr-input" placeholder="Deixe em branco se for a unidade base da MP">
        </div>
    `;
    editandoItemId = null; // Modo de adição
}

function abrirModalEditarItemComposicaoMP(composicaoMpId) {
    const item = composicaoMpAtual.find(i => i.id == composicaoMpId);
    if (!item) {
        mostrarPopupMensagem('Item da composição não encontrado.', 'erro');
        return;
    }
    abrirModal('Editar Item da Composição');

    let optionsMP = '';
    materiasPrimasCache.forEach(mp => {
        optionsMP += `<option value="${mp.id}" ${mp.id == item.materia_prima_id ? 'selected' : ''}>${mp.nome}</option>`;
    });

    formModalElement.innerHTML = `
        <div class="pr-form-grupo">
            <label for="modalSelMateriaPrima">Matéria-Prima:</label>
            <select id="modalSelMateriaPrima" name="materia_prima_id" class="pr-select" required>${optionsMP}</select>
        </div>
        <div class="pr-form-grupo">
            <label for="modalQtdUtilizadaMP">Quantidade Utilizada:</label>
            <input type="number" id="modalQtdUtilizadaMP" name="quantidade_utilizada" class="pr-input" value="${item.quantidade_utilizada}" required step="0.0001" min="0.0001">
        </div>
         <div class="pr-form-grupo">
            <label for="modalUnidadeUtilizadaMP">Unidade da Quantidade (Ex: cm, g):</label>
            <input type="text" id="modalUnidadeUtilizadaMP" name="unidade_medida_utilizada" class="pr-input" value="${item.unidade_medida_utilizada || ''}" placeholder="Deixe em branco se for a unidade base da MP">
        </div>
    `;
    editandoItemId = composicaoMpId; // ID do registro em produto_composicao_mp
}

// --- Funções para carregar/salvar Custo MO do Produto ---
async function carregarCustoMoDoProduto(produtoRefId) { /* ... fetch de GET /:produtoRefId/custo-mao-de-obra e renderiza ... */ }
// ... outras funções ...

// --- Funções para carregar/salvar Configs de Precificação por Canal ---
async function carregarCanaisParaPrecificacao(produtoRefId) { /* ... popula select #selectCanalPrecificacao ... */ }
// ... ao mudar canal, fetch de GET /:produtoRefId/canal/:canalId e preenche inputs de precificação ...
// ... função para salvar POST /:produtoRefId/canal/:canalId ...


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

    } catch (error) {
        console.error("Erro na inicialização da página de precificação:", error);
        mostrarPopupMensagem("Erro ao carregar dados iniciais da página.", "erro");
    }
});