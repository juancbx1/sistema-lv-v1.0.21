// public/js/admin-ordens-de-producao.js

// Declaração global para saveOPChanges, será definida mais adiante
window.saveOPChanges = null;

import { verificarAutenticacao } from '/js/utils/auth.js';
import { PRODUTOS as CONST_PRODUTOS, PRODUTOSKITS as CONST_PRODUTOSKITS } from '/js/utils/prod-proc-maq.js'; // Renomeado para evitar conflito com variável
import { obterProdutos as obterProdutosDoStorage, invalidateCache as invalidateProdutosStorageCache } from '/js/utils/storage.js';

// --- Variáveis Globais Essenciais ---
let filteredOPsGlobal = []; // Para OPs filtradas/ordenadas na tabela principal
let lancamentosEmAndamento = new Set(); // Controla lançamentos de etapas em progresso
const ordensCacheMap = new Map(); // Cache para requisições de OPs
const CACHE_EXPIRATION_MS_ORDENS = 30 * 1000; // 30 segundos para cache de OPs

let currentPage = 1; // Para paginação da tabela de OPs
const itemsPerPage = 10; // Itens por página na tabela de OPs

let permissoes = []; // Permissões do usuário logado
let usuarioLogado = null; // Objeto do usuário logado
const usedIds = new Set(); // Para garantir IDs únicos gerados no frontend (ex: edit_id)
let isEditingQuantidade = false; // Flag para edição de quantidade nas etapas

// Caches e Promises para dados auxiliares
let usuariosCache = null;
let usuariosPromise = null;
const CACHE_EXPIRATION_MS_USUARIOS = 15 * 60 * 1000; // 15 minutos
let lastUsuariosFetchTimestamp = 0;

let lancamentosCache = new Map(); // Cache de lançamentos de produção por op_numero
let lancamentosPromiseMap = new Map(); // Promises de lançamentos em andamento
const CACHE_EXPIRATION_MS_LANCAMENTOS = 30 * 1000; // 30 segundos

// Flags para controle de renderização das novas visualizações de cortes
let cortesPendentesViewRendered = false;
let cortesEmEstoqueViewRendered = false;
let isLoadingCortesPendentes = false;
let isLoadingCortesEmEstoque = false;

// ID do corte de estoque selecionado no formulário de inclusão de OP
let corteDeEstoqueSelecionadoId = null;

let isLoadingEtapas = false;

// Cache para cortes (em memória, por status)
let cortesCache = {};
let cortesPromiseMap = {}; // Renomeado para evitar conflito
const CACHE_EXPIRATION_MS_CORTES = 30 * 1000; // 30 segundos
const tipoUsuarioProcessoCache = new Map();


// --- FUNÇÕES DE CACHE E FETCH DE DADOS ---

async function obterUsuarios(forceUpdate = false) {
    if (usuariosPromise) return await usuariosPromise;
    if (usuariosCache && !forceUpdate && (Date.now() - lastUsuariosFetchTimestamp < CACHE_EXPIRATION_MS_USUARIOS)) {
        return usuariosCache;
    }
    console.log('[obterUsuarios] Buscando usuários...');
    usuariosPromise = (async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/usuarios', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error(`Erro ao carregar usuários: ${response.status}`);
            const data = await response.json();
            usuariosCache = data;
            lastUsuariosFetchTimestamp = Date.now();
            return data;
        } finally {
            usuariosPromise = null;
        }
    })();
    return await usuariosPromise;
}

// Coloque esta função no escopo global do seu admin-ordens-de-producao.js,
// junto com as outras definições de funções auxiliares.

function getUsuarioPlaceholder(tipoUsuario) {
  switch (tipoUsuario) {
    case 'costureira': 
        return 'Selecione a(o) Costureira(o)';
    case 'cortador': 
        return 'Selecione a(o) Cortador(a)';
    case 'tiktik': 
        return 'Selecione a(o) TikTik';
    // Adicione mais casos conforme os tipos de usuário que você tem para as etapas
    default: 
        return 'Selecione o usuário';
  }
}

async function obterLancamentos(opNumero, forceUpdate = false) {
    const cacheKey = opNumero.toString();
    if (lancamentosPromiseMap.has(cacheKey)) return await lancamentosPromiseMap.get(cacheKey);
    const entry = lancamentosCache.get(cacheKey);
    if (entry && !forceUpdate && (Date.now() - entry.timestamp < CACHE_EXPIRATION_MS_LANCAMENTOS)) {
        return entry.data;
    }
    console.log(`[obterLancamentos] Buscando para OP ${opNumero}...`);
    const promise = (async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/producoes?op_numero=${opNumero}&_=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error(`Erro lançamentos OP ${opNumero}: ${response.status}`);
            const data = await response.json();
            lancamentosCache.set(cacheKey, { data, timestamp: Date.now() });
            return data;
        } finally {
            lancamentosPromiseMap.delete(cacheKey);
        }
    })();
    lancamentosPromiseMap.set(cacheKey, promise);
    return await promise;
}

// public/js/admin-ordens-de-producao.js

async function obterOrdensDeProducao(page = 1, fetchAll = false, forceUpdate = false, statusFilter = null, noStatusFilter = false, searchTerm = null) { // <<< PARÂMETRO NOVO
    let url;
    const timestamp = Date.now(); // Cache buster

    // Monta a query string base, começando com o cache buster
    let queryStringParts = [`_=${timestamp}`]; // Usamos um array para juntar no final

    if (noStatusFilter) {
        queryStringParts.push('all=true');
        queryStringParts.push('noStatusFilter=true');
    } else {
        if (fetchAll) {
            queryStringParts.push('all=true');
            if (statusFilter) {
                queryStringParts.push(`status=${encodeURIComponent(statusFilter)}`);
            }
        } else {
            queryStringParts.push(`page=${page}`);
            queryStringParts.push(`limit=${itemsPerPage}`);
            if (statusFilter) {
                queryStringParts.push(`status=${encodeURIComponent(statusFilter)}`);
            }
        }
    }

    // Agora, adicionamos o searchTerm à lista de partes da query string, se ele existir
    if (searchTerm && searchTerm.trim() !== '') { // Verifica se searchTerm não é nulo ou só espaços
        queryStringParts.push(`search=${encodeURIComponent(searchTerm.trim())}`);
    }

    // Junta todas as partes da query string com '&' e monta a URL final
    url = `/api/ordens-de-producao?${queryStringParts.join('&')}`;

    const cacheKey = url;
    const entry = ordensCacheMap.get(cacheKey);
    if (entry && !forceUpdate && (Date.now() - entry.timestamp < CACHE_EXPIRATION_MS_ORDENS)) {
        return entry.data;
    }
    if (ordensCacheMap.has(`promise-${cacheKey}`)) return await ordensCacheMap.get(`promise-${cacheKey}`);

    console.log(`[obterOrdensDeProducao] Buscando: ${cacheKey}`); // Este log agora mostrará a URL com &search=...
    const promise = (async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) {
                let errorDetails = `HTTP ${response.status}`;
                try { const ej = await response.json(); errorDetails += ` - ${ej.error || JSON.stringify(ej)}`; }
                catch (e) { try { const et = await response.text(); errorDetails += ` - ${et.substring(0,100)}`;} catch(e2){} }
                throw new Error(`Erro ao carregar OPs: ${errorDetails}`);
            }
            const rawApiResponse = await response.json(); // Renomeado para clareza

            // A API agora sempre retorna um objeto com rows, total, pages
            // (exceto para getNextNumber, que é tratado antes na API e retorna array direto, mas
            // obterOrdensDeProducao não será chamado para getNextNumber pelo frontend da mesma forma)

            // Garantir que temos os campos esperados, com defaults se ausentes.
            const formattedData = {
                rows: Array.isArray(rawApiResponse.rows) ? rawApiResponse.rows : [], // Garante que rows seja sempre um array
                total: rawApiResponse.total || 0,
                pages: rawApiResponse.pages || 1
            };

            ordensCacheMap.set(cacheKey, { data: formattedData, timestamp: Date.now() });
            return formattedData;
        } finally {
            ordensCacheMap.delete(`promise-${cacheKey}`);
        }
    })();
    ordensCacheMap.set(`promise-${cacheKey}`, promise);
    return await promise;
}

async function obterCortes(status, forceRefresh = false) {
    const cacheKey = status;
    const now = Date.now();
    if (cortesPromiseMap[cacheKey]) return await cortesPromiseMap[cacheKey];
    const entry = cortesCache[cacheKey];
    if (entry && !forceRefresh && (now - entry.timestamp < CACHE_EXPIRATION_MS_CORTES)) return entry.data;

    cortesPromiseMap[cacheKey] = (async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/cortes?status=${status}&_=${now}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error(`Erro cortes status ${status}: ${response.status}`);
            const data = await response.json();
            cortesCache[cacheKey] = { data, timestamp: now };
            return data;
        } finally {
            delete cortesPromiseMap[cacheKey];
        }
    })();
    return await cortesPromiseMap[cacheKey];
}

// --- FUNÇÕES DE UTILIDADE ---
function mostrarPopupMensagem(mensagem, tipo = 'erro', duracao = 5000, permitirHTML = false) { // Novo parâmetro permitirHTML
    const popupId = `popup-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `popup-mensagem popup-${tipo}`;
    // ... (seus estilos do popup)
    popup.style.cssText = `position:fixed; top:20px; left:50%; transform:translateX(-50%); background-color:${tipo === 'erro' ? '#f8d7da' : tipo === 'sucesso' ? '#d4edda' : '#fff3cd'}; color:${tipo === 'erro' ? '#721c24' : tipo === 'sucesso' ? '#155724' : '#856404'}; padding:15px 20px; border-radius:5px; box-shadow:0 0 10px rgba(0,0,0,0.1); z-index:1001; max-width:90%; text-align:center;`;


    if (permitirHTML) {
        popup.innerHTML = mensagem; // Define o conteúdo como HTML
    } else {
        const p = document.createElement('p'); 
        p.textContent = mensagem; 
        popup.appendChild(p);
    }

    // Adicionar um botão de fechar manual ao popup para que o usuário possa dispensá-lo se a duração for longa
    const fecharBtnManual = document.createElement('button');
    fecharBtnManual.textContent = 'OK';
    fecharBtnManual.style.cssText = 'padding: 5px 10px; margin-top: 10px; background-color: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;';
    fecharBtnManual.onclick = () => {
        if (document.body.contains(popup)) {
            document.body.removeChild(popup);
        }
    };
    // Se permitirHTML, adicionar o botão dentro do conteúdo principal ou após ele
    if (permitirHTML) {
        const containerBotoes = document.createElement('div');
        containerBotoes.style.marginTop = '10px';
        containerBotoes.appendChild(fecharBtnManual);
        popup.appendChild(containerBotoes);
    } else {
        popup.appendChild(fecharBtnManual);
    }


    document.body.appendChild(popup);
    
    if (duracao > 0) { // Só define timeout se duracao > 0
        setTimeout(() => {
            const el = document.getElementById(popupId);
            if (el) el.remove();
        }, duracao);
    }
}


function generateUniqueId() { let id; do { id = `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; } while (usedIds.has(id)); usedIds.add(id); return id; }
function generateUniquePN() {return Math.floor(1000 + Math.random() * 9000).toString();}
function limparCacheOrdens() { ordensCacheMap.clear(); console.log('[Cache] OPs limpo.');}
function limparCacheProdutosStorage() { invalidateProdutosStorageCache('produtosCadastrados'); console.log('[Cache] Produtos (localStorage) invalidado.'); }
function limparCacheCortes() { cortesCache = {}; console.log('[Cache] Cortes (memória) limpo.');}
window.limparCacheOrdens = limparCacheOrdens;
window.limparCacheProdutosStorage = limparCacheProdutosStorage;
window.limparCacheCortes = limparCacheCortes;

// --- FUNÇÕES DE MANIPULAÇÃO DE FORMULÁRIO OP ---
async function loadProdutosSelect() {
    const produtoSelect = document.getElementById('produtoOP');
    if (!produtoSelect) return;
    produtoSelect.disabled = true; produtoSelect.innerHTML = '<option value="">Carregando...</option>';
    try {
        const produtos = await obterProdutosDoStorage();
        produtoSelect.innerHTML = '<option value="">Selecione produto</option>';
        produtos.filter(p => CONST_PRODUTOS.includes(p.nome) && !CONST_PRODUTOSKITS.includes(p.nome))
                .forEach(p => produtoSelect.add(new Option(p.nome, p.nome)));
        produtoSelect.disabled = false;
    } catch (e) { produtoSelect.innerHTML = '<option value="">Erro</option>'; produtoSelect.disabled = false; }
}

async function loadVariantesSelects(produtoNome, produtosDisponiveisRecebidos) {
    const variantesContainer = document.getElementById('variantesContainer');
    const variantesSelectsDiv = document.querySelector('#opFormView .variantes-selects'); // Específico do form de nova OP
    const infoCorteContainer = document.getElementById('infoCorteContainer');

    // Elementos pais dos campos que dependem da seleção completa (produto + variante)
    const camposDependentesPrincipais = [
        document.getElementById('quantidadeOP')?.parentElement,
        document.getElementById('numeroOP')?.parentElement,
        document.getElementById('dataEntregaOP')?.parentElement,
        document.getElementById('observacoesOP')?.parentElement
    ].filter(Boolean);

    // Garante que os elementos existem
    if (!variantesContainer || !variantesSelectsDiv) {
        console.warn('[loadVariantesSelects] Elementos DOM para variantes não encontrados.');
        return;
    }

    // Limpeza inicial
    variantesSelectsDiv.innerHTML = '';
    variantesContainer.style.display = 'none'; // Esconde o container de variantes por padrão
    if (infoCorteContainer) {
        infoCorteContainer.innerHTML = '';
        infoCorteContainer.style.display = 'none';
    }
    camposDependentesPrincipais.forEach(el => el.style.display = 'none'); // Esconde os campos principais

    // Se nenhum produtoNome for fornecido, não há nada a fazer
    if (!produtoNome) {
        console.log('[loadVariantesSelects] Nenhum produto selecionado.');
        return;
    }

    // Encontra o produto na lista fornecida
    const produto = produtosDisponiveisRecebidos.find(p => p.nome === produtoNome);
    if (!produto) {
        console.warn(`[loadVariantesSelects] Produto "${produtoNome}" não encontrado na lista de produtos fornecida.`);
        return; // Sai se o produto não for encontrado
    }

    // Determina as variantes disponíveis para o produto
    let listaDeVariantesParaSelect = [];
    if (produto.variantes && produto.variantes.length > 0) {
        listaDeVariantesParaSelect = produto.variantes.map(v => v.valores.split(',')).flat().map(v => v.trim()).filter(Boolean);
    } else if (produto.grade && produto.grade.length > 0) {
        listaDeVariantesParaSelect = [...new Set(produto.grade.map(g => g.variacao))].filter(Boolean);
    }

    // Se houver variantes, cria e popula o select de variantes
    if (listaDeVariantesParaSelect.length > 0) {
        const selectVariante = document.createElement('select');
        selectVariante.className = 'op-select op-input-variante-opform'; // Adicione sua classe CSS para estilização
        selectVariante.innerHTML = '<option value="">Selecione uma variação</option>'; // Opção padrão
        
        listaDeVariantesParaSelect.forEach(variante => {
            const option = new Option(variante, variante); // new Option(texto, valor)
            selectVariante.appendChild(option);
        });
        
        variantesSelectsDiv.appendChild(selectVariante);
        variantesContainer.style.display = 'block'; // Mostra o container de variantes

        // Adiciona o listener de 'change' ao novo select de variantes
        selectVariante.addEventListener('change', async () => {
            const varianteSelecionada = selectVariante.value;
            if (varianteSelecionada) {
                // Se uma variante real for escolhida, chama a função para verificar cortes e atualizar o formulário.
                // verificarCorteEAtualizarFormOP chamará obterProdutosDoStorage() internamente.
                await verificarCorteEAtualizarFormOP(); 
            } else {
                // Se o usuário voltar para "Selecione uma variação"
                console.log('[selectVariante change] Nenhuma variante selecionada. Limpando campos dependentes.');
                if (infoCorteContainer) {
                    infoCorteContainer.innerHTML = '';
                    infoCorteContainer.style.display = 'none';
                }
                camposDependentesPrincipais.forEach(el => el.style.display = 'none');
                corteDeEstoqueSelecionadoId = null; // Reseta
                const quantidadeOPInput = document.getElementById('quantidadeOP');
                if (quantidadeOPInput) {
                    quantidadeOPInput.value = '';
                    quantidadeOPInput.disabled = false;
                    quantidadeOPInput.style.backgroundColor = '';
                }
            }
        });
    } else {
        // Se o produto não tem variantes, a função verificarCorteEAtualizarFormOP
        // já foi (ou será) chamada pelo listener de 'change' do produtoOPSelect.
        console.log(`[loadVariantesSelects] Produto "${produtoNome}" não possui variantes configuradas.`);
        variantesContainer.style.display = 'none'; // Garante que o container de variantes fique escondido
    }
}

async function getNextOPNumber() { 
    try {
        const token = localStorage.getItem('token');
        const r = await fetch(`/api/ordens-de-producao?getNextNumber=true&_=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
        if (!r.ok) throw new Error(`API num OPs: ${r.status}`);
        const nums = await r.json();
        return ( (nums.map(n=>parseInt(n)).filter(n=>!isNaN(n)).reduce((max,cur)=>Math.max(max,cur),0) || 0) + 1 ).toString();
    } catch (e) { console.error('[getNextOPNumber] Erro:', e); return (800 + Math.floor(Math.random() * 200)).toString(); }
}

function setCurrentDate(dateInputElement) {
    if (dateInputElement) {
        const agora = new Date(); const offset = agora.getTimezoneOffset() * 60000;
        dateInputElement.value = new Date(agora.getTime() - offset).toISOString().split('T')[0];
    }
}

function limparFormularioOP() {
    const form = document.getElementById('opForm'); if (!form) return; form.reset();
    const prodSel = document.getElementById('produtoOP'); if (prodSel) prodSel.value = '';
    const varCont = document.getElementById('variantesContainer');
    const varSelDiv = document.querySelector('#opFormView .variantes-selects');
    const infoCorte = document.getElementById('infoCorteContainer');
    if (varSelDiv) varSelDiv.innerHTML = ''; if (varCont) varCont.style.display = 'none';
    if (infoCorte) { infoCorte.innerHTML = ''; infoCorte.style.display = 'none'; delete infoCorte.dataset.pnGerado; }
    ['quantidadeOP', 'numeroOP', 'dataEntregaOP', 'observacoesOP'].forEach(id => {
        const el = document.getElementById(id); if (el?.parentElement) el.parentElement.style.display = 'none';
    });
    const qtdIn = document.getElementById('quantidadeOP');
    if (qtdIn) { qtdIn.value = ''; qtdIn.disabled = false; qtdIn.style.backgroundColor = ''; qtdIn.placeholder = ''; }
    corteDeEstoqueSelecionadoId = null;
}

async function verificarCorteEAtualizarFormOP() {
    const prodNome = document.getElementById('produtoOP').value;
    const varSel = document.querySelector('#opFormView .variantes-selects select');
    const varVal = varSel ? varSel.value : '';
    const qtdIn = document.getElementById('quantidadeOP'), numOPIn = document.getElementById('numeroOP');
    const dataEntIn = document.getElementById('dataEntregaOP'), obsIn = document.getElementById('observacoesOP');
    const infoCorte = document.getElementById('infoCorteContainer');
    corteDeEstoqueSelecionadoId = null;
    const camposDep = [qtdIn?.parentElement, numOPIn?.parentElement, dataEntIn?.parentElement, obsIn?.parentElement, infoCorte].filter(Boolean);
    camposDep.forEach(el => el.style.display = 'none'); if (infoCorte) infoCorte.innerHTML = '';

    if (!prodNome) return;
    const produtos = await obterProdutosDoStorage();
    const prodObj = produtos.find(p => p.nome === prodNome); if (!prodObj) return;
    const temVar = (prodObj.variantes?.length || prodObj.grade?.length);
    if (temVar && !varVal) return;

    if (infoCorte) { infoCorte.innerHTML = '<div class="spinner">Verificando...</div>'; infoCorte.style.display = 'block';}
    try {
        const cortados = await obterCortes('cortados');
        const estoque = cortados.find(c => c.produto === prodNome && (temVar ? c.variante === varVal : true) && !c.op);
        if (infoCorte) infoCorte.innerHTML = '';
        if (estoque) {
            corteDeEstoqueSelecionadoId = estoque.id;
            if (infoCorte) infoCorte.innerHTML = `<p style="color:green;font-weight:bold;"><i class="fas fa-check-circle"></i> Corte em estoque! (PN: ${estoque.pn||'N/A'}, Qtd: ${estoque.quantidade})</p><p>Qtd da OP definida.</p>`;
            if (qtdIn) { qtdIn.value = estoque.quantidade; qtdIn.disabled = true; qtdIn.style.backgroundColor = '#e9ecef'; }
        } else {
            const pn = generateUniquePN();
            if (infoCorte) { infoCorte.innerHTML = `<p style="color:orange;font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> Nenhum corte em estoque.</p><p>Novo pedido (PN: ${pn}) será gerado.</p>`; infoCorte.dataset.pnGerado = pn; }
            if (qtdIn) { qtdIn.value = ''; qtdIn.disabled = false; qtdIn.style.backgroundColor = ''; qtdIn.placeholder = 'Qtd'; }
        }
        if (numOPIn) numOPIn.value = await getNextOPNumber();
        if (dataEntIn) setCurrentDate(dataEntIn);
        camposDep.forEach(el => el.style.display = 'block');
    } catch (e) { if (infoCorte) infoCorte.innerHTML = `<p style="color:red">Erro: ${e.message}</p>`; if (qtdIn) { qtdIn.value = ''; qtdIn.disabled = false; } }
}

// --- CRUD ORDENS DE PRODUÇÃO ---
async function salvarOrdemDeProducao(ordem) {
    const token = localStorage.getItem('token');
    console.log('[salvarOrdemDeProducao] Enviando:', ordem);
    const response = await fetch('/api/ordens-de-producao', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(ordem) });
    if (!response.ok) {
        const errorText = await response.text(); console.error('[salvarOrdemDeProducao] Erro Servidor:', errorText);
        let errorJson = { error: 'Erro desconhecido' }; try { errorJson = JSON.parse(errorText); } catch (e) { errorJson.error = errorText.substring(0,150); }
        throw new Error(`Erro ao salvar OP: ${errorJson.error}`);
    } return await response.json();
}

window.saveOPChanges = async function saveOPChangesGlobal(op) {
    console.log(`[saveOPChangesGlobal] Atualizando OP #${op.numero}, Status: ${op.status}`);
    const token = localStorage.getItem('token');
    const payload = { 
        edit_id: op.edit_id, numero: op.numero, produto: op.produto, variante: op.variante, 
        quantidade: parseInt(op.quantidade) || 0, data_entrega: op.data_entrega, 
        observacoes: op.observacoes, status: op.status, etapas: op.etapas, data_final: op.data_final 
    };
    const response = await fetch('/api/ordens-de-producao', { 
        method: 'PUT', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido ao atualizar OP.' }));
        console.error(`[saveOPChangesGlobal] Erro ao atualizar OP #${op.numero}:`, errorData);
        throw new Error(`Erro ao atualizar OP: ${errorData.error}`);
    }
    console.log(`[saveOPChangesGlobal] OP #${op.numero} atualizada.`);
    return await response.json();
};

// --- CRUD CORTES ---

// Função salvarCorte (para tela #corteView)
async function salvarCorte() {
     const produtoNomeInput = document.getElementById('produtoCorte');
    const varianteSelectEl = document.querySelector('#corteView .variantes-selects-corte select');
    const quantidadeInput = document.getElementById('quantidadeCorte');
    const dataCorteInput = document.getElementById('dataCorte');
    const cortadorInput = document.getElementById('cortadorCorte');
    
    const produtoNome = produtoNomeInput.value;
    const varianteValor = varianteSelectEl ? varianteSelectEl.value : '';
    const quantidade = parseInt(quantidadeInput.value) || 0;
    const dataCorte = dataCorteInput.value;
    const cortador = cortadorInput.value;

    let erros = [];

    if (!produtoNome) {
        erros.push("Produto não selecionado");
    }
    if (quantidade <= 0) {
        erros.push("Quantidade deve ser maior que zero");
    }
    if (!dataCorte) {
        erros.push("Data do Corte não preenchida");
    }
    if (!cortador) {
        erros.push("Cortador não definido");
    }

    // Validação de Produto e Variante (requer a lista de produtos)
    // Só faz essa validação se os campos básicos acima estiverem OK, para evitar chamadas desnecessárias
    let produtoObj = null; // Inicializa como null
    if (produtoNome && erros.length === 0) { // Só busca produtos se um nome foi dado e não há outros erros
        try {
            const todosOsProdutos = await obterProdutosDoStorage();
            if (!todosOsProdutos || todosOsProdutos.length === 0) {
                erros.push("Não foi possível carregar a lista de produtos para validação.");
            } else {
                produtoObj = todosOsProdutos.find(p => p.nome === produtoNome);
                if (!produtoObj) {
                    erros.push(`Produto "${produtoNome}" selecionado é inválido.`);
                } else {
                    const produtoRealmenteTemVariantes = (produtoObj.variantes?.length > 0 || produtoObj.grade?.length > 0);
                    if (produtoRealmenteTemVariantes && !varianteValor) {
                        erros.push("Variação não selecionada para este produto.");
                    }
                }
            }
        } catch (error) {
            console.error("[salvarCorte] Erro ao obter produtos para validação:", error);
            erros.push("Erro ao validar produto. Tente novamente.");
        }
    }


    if (erros.length > 0) {
        mostrarPopupMensagem(`Por favor, corrija: ${erros.join('; ')}.`, 'erro');
        return; // Interrompe se houver erros
    }

    // Se chegou aqui, as validações passaram e produtoObj (se aplicável) está definido.
    const corteData = {
        produto: produtoNome,
        variante: (produtoObj && (produtoObj.variantes?.length > 0 || produtoObj.grade?.length > 0)) ? (varianteValor || null) : null, // Envia variante só se o produto tiver, e só se selecionada
        quantidade,
        data: dataCorte,
        cortador,
        status: 'cortados',
        op: null
    };

    const btnSalvar = document.getElementById('btnCortar'); // Seu botão "Salvar Corte"
    const originalText = btnSalvar.innerHTML;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<div class="spinner-btn-interno"></div> Salvando...';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/cortes', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(corteData),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
            throw new Error(errData.error || 'Erro desconhecido ao salvar corte.');
        }
        
        const savedCorte = await response.json();
        mostrarPopupMensagem(`Corte para estoque (PN: ${savedCorte.pn}) salvo!`, 'sucesso');
        limparCacheCortes(); 
        limparFormularioCorte();
        window.location.hash = '#cortes-em-estoque';

    } catch (error) {
        console.error('[salvarCorte] Erro:', error);
        mostrarPopupMensagem(`Erro ao salvar corte: ${error.message}`, 'erro');
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = originalText;
    }
  }

async function atualizarCorte(id, novoStatus, cortadorNome, opNumeroParaAssociar = null) {
    console.log(`[atualizarCorte] Iniciando. ID: ${id}, NovoStatus: ${novoStatus}, Cortador: ${cortadorNome}, OP Ass.: ${opNumeroParaAssociar}`);
    const token = localStorage.getItem('token');
    try {
        const payload = { id, status: novoStatus, cortador: cortadorNome };
        // Se opNumeroParaAssociar for fornecido (ex: ao usar corte de estoque para uma nova OP),
        // ele será incluído no payload.
        // Se estamos apenas mudando o status de um corte que JÁ TEM um 'op' no banco,
        // a API de PUT /api/cortes deve ser capaz de preservar o 'op' existente se não for explicitamente alterado no payload.
        // No entanto, se o `opNumeroParaAssociar` for passado, ele terá precedência.
        if (opNumeroParaAssociar !== null) {
            payload.op = opNumeroParaAssociar;
        }

        console.log('[atualizarCorte] Payload para API PUT /api/cortes:', payload);
        const response = await fetch(`/api/cortes`, { // Rota base, ID e campos no corpo
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) { /* ... tratamento de erro ... */ throw new Error(/* ... */); }

        const updatedCorte = await response.json();
        console.log('[atualizarCorte] Corte atualizado no backend:', updatedCorte);

        // >>> PONTO CRÍTICO DE ATUALIZAÇÃO DA OP <<<
        // SE o corte foi marcado como 'cortados' OU 'verificado' (o que efetivamente libera a OP)
        // E ele TEM uma OP associada (updatedCorte.op), atualizamos a OP.
        if (['cortados', 'verificado', 'usado'].includes(updatedCorte.status) && updatedCorte.op) {
            console.log(`[atualizarCorte] Corte ${updatedCorte.id} (OP: ${updatedCorte.op}) status ${updatedCorte.status}. Tentando buscar e atualizar OP.`);
            
            limparCacheOrdens(); 
            const ordensData = await obterOrdensDeProducao(1, true, true, null, true); // Força refresh, busca todas
            const opParaAtualizar = ordensData.rows.find(o => o.numero === updatedCorte.op);

            if (opParaAtualizar) {
                console.log(`[atualizarCorte] OP #${opParaAtualizar.numero} encontrada. Verificando etapa de corte.`);
                let etapaCorteModificada = false;
                const etapaCorteIndex = opParaAtualizar.etapas.findIndex(e => e.processo && e.processo.toLowerCase() === 'corte');
                
                if (etapaCorteIndex !== -1) {
                    // Atualiza a etapa de corte na OP se ainda não estiver lançada ou se os dados divergirem
                    if (!opParaAtualizar.etapas[etapaCorteIndex].lancado || 
                        opParaAtualizar.etapas[etapaCorteIndex].usuario !== (updatedCorte.cortador || 'Sistema') ||
                        opParaAtualizar.etapas[etapaCorteIndex].quantidade !== updatedCorte.quantidade) {
                        
                        opParaAtualizar.etapas[etapaCorteIndex].usuario = updatedCorte.cortador || 'Sistema';
                        opParaAtualizar.etapas[etapaCorteIndex].lancado = true;
                        opParaAtualizar.etapas[etapaCorteIndex].quantidade = updatedCorte.quantidade; 
                        etapaCorteModificada = true;
                        console.log(`[atualizarCorte] Etapa "Corte" da OP #${opParaAtualizar.numero} atualizada para lançada.`);
                    }
                } else {
                    console.warn(`[atualizarCorte] Etapa "Corte" não encontrada na OP #${opParaAtualizar.numero}. Adicionando etapa de corte.`);
                    // Se a OP não tem a etapa de corte (pode acontecer se a config do produto mudou), adiciona-a
                    opParaAtualizar.etapas.unshift({ // Adiciona no início
                        processo: "Corte",
                        usuario: updatedCorte.cortador || 'Sistema',
                        quantidade: updatedCorte.quantidade,
                        lancado: true,
                        ultimoLancamentoId: null // Não é um lançamento de produção, mas sim um status do corte
                    });
                    etapaCorteModificada = true;
                }
                
                // Muda o status da OP para 'produzindo' se estava 'em-aberto' e a etapa de corte foi modificada/lançada
                if (opParaAtualizar.status === 'em-aberto' && etapaCorteModificada) {
                    opParaAtualizar.status = 'produzindo';
                    etapaCorteModificada = true; // Garante que saveOPChanges seja chamado
                    console.log(`[atualizarCorte] Status da OP #${opParaAtualizar.numero} alterado para 'produzindo'.`);
                }
                
                if (etapaCorteModificada) { // Salva a OP apenas se houve alteração relevante
                    await window.saveOPChanges(opParaAtualizar); 
                    console.log(`[atualizarCorte] OP #${opParaAtualizar.numero} salva com alterações na etapa de corte/status.`);
                    
                    // Se o usuário estiver na tela de edição desta OP específica, força o reload das etapas
                    const currentHash = window.location.hash;
                    if(currentHash.includes(`#editar/${opParaAtualizar.edit_id}`) || currentHash.includes(`#editar/${opParaAtualizar.numero}`)) {
                        console.log(`[atualizarCorte] Recarregando etapas para OP ${opParaAtualizar.numero} na tela de edição.`);
                        await loadEtapasEdit(opParaAtualizar, true); // true para skipReload se loadEtapasEdit tiver essa flag
                    }
                } else {
                    console.log(`[atualizarCorte] Nenhuma alteração necessária na OP #${opParaAtualizar.numero} referente à etapa de corte.`);
                }

            } else {
                console.warn(`[atualizarCorte] OP ${updatedCorte.op} associada ao corte não foi encontrada para atualizar.`);
            }
            limparCacheOrdens(); // Limpa novamente após a possível modificação da OP
        }
        limparCacheCortes(); // Sempre limpa o cache de cortes após uma atualização
        return updatedCorte;
    } catch (error) {
        console.error('[atualizarCorte] Erro:', error);
        mostrarPopupMensagem(`Erro ao atualizar status do corte: ${error.message.substring(0,100)}`, 'erro');
        throw error; 
    }
}

async function excluirCorte(id) {
  console.log('[excluirCorte] Tentando excluir corte com ID:', id);
  const token = localStorage.getItem('token');
  const response = await fetch('/api/cortes', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[excluirCorte] Resposta do servidor:', text);
    throw new Error(`Erro ao excluir corte: Status ${response.status}`);
  }

  // Limpa o cache após exclusão
  limparCacheCortes();
  console.log('[excluirCorte] Corte excluído com sucesso');
  return await response.json();

}

function handleOPTableClick(event) {
    const tr = event.target.closest('tr'); 
    if (!tr || !tr.dataset.editId) { // <<< VERIFICA data-edit-id
        return; 
    }

    const editId = tr.dataset.editId; // <<< PEGA data-edit-id

    console.log(`[handleOPTableClick] Linha clicada. Edit ID: ${editId}. Redirecionando...`);
    window.location.hash = `#editar/${editId}`; 
}

// --- FUNÇÕES PARA NOVAS TELAS DE CORTES ---

async function loadCortesPendentesViewContent(forceRefreshData = false) {
    if (isLoadingCortesPendentes && !forceRefreshData) {
        console.log('[loadCortesPendentesViewContent] Carregamento já em progresso, ignorando.');
        return;
    }
    isLoadingCortesPendentes = true;
    console.log('[loadCortesPendentesViewContent] Iniciando carregamento...');

    const container = document.getElementById('cortesPendentesView');
    if (!container) {
        console.error('[loadCortesPendentesViewContent] Container #cortesPendentesView não encontrado.');
        isLoadingCortesPendentes = false;
        return;
    }

    if (!cortesPendentesViewRendered) {
        container.innerHTML = `
            <button class="botao-fechar op-botao-perigo" onclick="window.location.hash = ''" title="Voltar para Lista de OPs">X</button>
            <h2 class="op-titulo-secao">Cortes Pendentes de Realização</h2>
            
            <div class="op-tabela-wrapper">
                <table class="op-tabela-estilizada tabela-corte-pendente">
                    <thead>
                        <tr>
                            <th style="width: 5%;"><input type="checkbox" id="selecionarTodosPendentes" title="Selecionar Todos"></th>
                            <th style="width: 15%;">PN</th>
                            <th style="width: 30%;">Produto</th>
                            <th style="width: 25%;">Variação</th>
                            <th style="width: 10%;">Qtd</th>
                            <th style="width: 15%;">OP Associada</th>
                        </tr>
                    </thead>
                    <tbody id="tabelaCortesPendentesBody">
                        <!-- Linhas preenchidas por JS -->
                    </tbody>
                </table>
            </div>

            <div class="op-form-botoes" style="margin-top: 20px; justify-content: flex-start;">
                <button id="btnMarcarComoCortados" class="op-botao op-botao-sucesso">
                    <i class="fas fa-check"></i> Marcar como Cortado(s)
                </button>
                <button id="btnExcluirCortesPendentes" class="op-botao op-botao-perigo">
                    <i class="fas fa-trash"></i> Excluir Selecionado(s)
                </button>
            </div>
        `;
        document.getElementById('btnMarcarComoCortados')?.addEventListener('click', handleMarcarComoCortados);
        document.getElementById('btnExcluirCortesPendentes')?.addEventListener('click', handleExcluirCortesPendentes);
        document.getElementById('selecionarTodosPendentes')?.addEventListener('change', (e) => {
            document.querySelectorAll('#tabelaCortesPendentesBody .checkbox-corte-item').forEach(cb => cb.checked = e.target.checked);
        });
        cortesPendentesViewRendered = true;
    }

    const tbody = document.getElementById('tabelaCortesPendentesBody');
    tbody.innerHTML = `<tr><td colspan="6"><div class="spinner">Carregando cortes pendentes...</div></td></tr>`;

    try {
        const cortes = await obterCortes('pendente', forceRefreshData);
        if (!cortes || !Array.isArray(cortes)) {
             tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Dados de cortes pendentes inválidos.</td></tr>';
        } else if (cortes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Ótimo! Nenhum corte pendente no momento.</td></tr>';
        } else {
            const fragment = document.createDocumentFragment();
            cortes.forEach(corte => {
                const tr = document.createElement('tr');
                tr.dataset.corteId = corte.id;
                tr.innerHTML = `
                    <td><input type="checkbox" class="checkbox-corte-item" data-id="${corte.id}"></td>
                    <td>${corte.pn || 'N/A'}</td>
                    <td>${corte.produto || 'N/A'}</td>
                    <td>${corte.variante || '-'}</td>
                    <td>${corte.quantidade || 0}</td>
                    <td>${corte.op || 'N/A'}</td>
                `;
                fragment.appendChild(tr);
            });
            tbody.innerHTML = ''; tbody.appendChild(fragment);
        }
    } catch (error) { 
        console.error("[loadCortesPendentesViewContent] Erro:", error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red; padding: 20px;">Erro ao carregar.</td></tr>';
    } finally { isLoadingCortesPendentes = false; }
}

async function loadCortesEmEstoqueViewContent(forceRefreshData = false) {
    if (isLoadingCortesEmEstoque && !forceRefreshData) { // Condição 1
        console.log('[loadCortesEmEstoqueViewContent] Carregamento já em progresso, ignorando.');
        return;
    } // Fim da Condição 1
    isLoadingCortesEmEstoque = true;
    console.log('[loadCortesEmEstoqueViewContent] Iniciando carregamento...');

    const container = document.getElementById('cortesEmEstoqueView');
    if (!container) { // Condição 2
        console.error('[loadCortesEmEstoqueViewContent] Container cortesEmEstoqueView não encontrado.');
        isLoadingCortesEmEstoque = false;
        return;
    } // Fim da Condição 2

    if (!cortesEmEstoqueViewRendered) { // Condição 3
        container.innerHTML = `
            <button class="botao-fechar op-botao-perigo" onclick="window.location.hash = ''" title="Voltar">X</button>
            <h2 class="op-titulo-secao">Cortes em Estoque (Disponíveis para OP)</h2>
            <div class="op-tabela-wrapper">
                 <table class="op-tabela-estilizada tabela-cortados">
                    <thead>
                        <tr>
                            <th style="width: 5%;"><input type="checkbox" id="selecionarTodosEstoque" title="Selecionar Todos"></th>
                            <th style="width: 15%;">PN</th>
                            <th style="width: 30%;">Produto</th>
                            <th style="width: 25%;">Variação</th>
                            <th style="width: 10%;">Qtd</th>
                            <th style="width: 15%;">Corte Em</th>
                        </tr>
                    </thead>
                    <tbody id="tabelaCortesEmEstoqueBody">
                    </tbody>
                </table>
            </div>
            <div class="op-form-botoes" style="margin-top: 20px; justify-content: flex-start;">
                 <button id="btnExcluirCortesEstoque" class="op-botao op-botao-perigo">
                    <i class="fas fa-trash"></i> Excluir Selecionado(s)
                 </button>
            </div>
        `;
        const btnExcluir = document.getElementById('btnExcluirCortesEstoque');
        const checkSelecionarTodos = document.getElementById('selecionarTodosEstoque');

        if (btnExcluir) btnExcluir.addEventListener('click', handleExcluirCortesEstoque); // Condição 4
        if (checkSelecionarTodos) { // Condição 5
            checkSelecionarTodos.addEventListener('change', (e) => {
                document.querySelectorAll('#tabelaCortesEmEstoqueBody .checkbox-corte-item').forEach(cb => cb.checked = e.target.checked);
            });
        } // Fim da Condição 5
        cortesEmEstoqueViewRendered = true;
    } // Fim da Condição 3
    
    const tbody = document.getElementById('tabelaCortesEmEstoqueBody');
    if (!tbody) { // Condição 6
        console.error('[loadCortesEmEstoqueViewContent] tbody tabelaCortesEmEstoqueBody não encontrado.');
        isLoadingCortesEmEstoque = false;
        return;
    } // Fim da Condição 6
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner">Carregando cortes em estoque...</div></td></tr>';

    try { // Início do Try
        const todosCortados = await obterCortes('cortados', forceRefreshData);
        const cortesEstoque = todosCortados.filter(corte => !corte.op); 

        if (!cortesEstoque || cortesEstoque.length === 0) { // Condição 7
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhum corte em estoque disponível no momento.</td></tr>';
        } else { // Else da Condição 7
            const fragment = document.createDocumentFragment();
            cortesEstoque.forEach(corte => { // Início do forEach
                const tr = document.createElement('tr');
                tr.dataset.corteId = corte.id;
                tr.innerHTML = `
                    <td><input type="checkbox" class="checkbox-corte-item" data-id="${corte.id}"></td>
                    <td>${corte.pn || 'N/A'}</td>
                    <td>${corte.produto || 'N/A'}</td>
                    <td>${corte.variante || '-'}</td>
                    <td>${corte.quantidade || 0}</td>
                    <td>${corte.data ? new Date(corte.data).toLocaleDateString('pt-BR') : 'N/A'}</td>
                `;
                fragment.appendChild(tr);
            }); // Fim do forEach
            tbody.innerHTML = ''; 
            tbody.appendChild(fragment);
        } // Fim do Else da Condição 7
    } catch (error) { // Catch do Try
        console.error("[loadCortesEmEstoqueViewContent] Erro ao carregar cortes em estoque:", error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red; padding: 20px;">Erro ao carregar. Tente novamente.</td></tr>';
    } finally { // Finally do Try
        isLoadingCortesEmEstoque = false;
    } // Fim do Finally
} // Fim da função loadCortesEmEstoqueViewContent

async function handleMarcarComoCortados() {
    const checkboxes = document.querySelectorAll('#tabelaCortesPendentesBody .checkbox-corte-item:checked');
    if (checkboxes.length === 0) {
        mostrarPopupMensagem('Selecione pelo menos um item para marcar como cortado.', 'aviso');
        return;
    }
    
    const btnOriginal = this; 
    btnOriginal.disabled = true;
    const originalText = btnOriginal.innerHTML; // Guarda o texto/HTML original do botão
    btnOriginal.innerHTML = '<div class="spinner-btn-interno"></div> Processando...';

    let algumErro = false;
    try {
        for (const cb of checkboxes) {
            const id = cb.dataset.id;
            try {
                await atualizarCorte(id, 'cortados', usuarioLogado?.nome || 'Sistema');
            } catch (errorIndividual) {
                console.error(`Erro ao marcar corte ID ${id} como cortado:`, errorIndividual);
                algumErro = true;
                mostrarPopupMensagem(`Erro ao processar corte ID ${id}: ${errorIndividual.message.substring(0,100)}`, 'erro');
            }
        }

        if (!algumErro) {
            mostrarPopupMensagem(`${checkboxes.length} ite${checkboxes.length > 1 ? 'ns' : 'm'} marcado${checkboxes.length > 1 ? 's' : ''} como cortado${checkboxes.length > 1 ? 's' : ''} com sucesso!`, 'sucesso');
        } else {
            mostrarPopupMensagem('Alguns cortes não puderam ser processados. Verifique o console.', 'aviso');
        }
        
        limparCacheCortes(); 
        await loadCortesPendentesViewContent(true); 
        // Opcionalmente, recarregar cortes em estoque se a ação de marcar como cortado puder afetá-los
        // await loadCortesEmEstoqueViewContent(true); 

    } catch (errorGeral) {
        console.error('Erro geral ao marcar cortes como cortados:', errorGeral);
        mostrarPopupMensagem(`Erro ao marcar como cortados: ${errorGeral.message}`, 'erro');
    } finally {
        btnOriginal.disabled = false;
        btnOriginal.innerHTML = originalText; 
    }
}

async function handleExcluirCortes(tbodyId, tipoCorte, callbackReloadView) {
    const checkboxes = document.querySelectorAll(`#${tbodyId} .checkbox-corte-item:checked`);
    if (checkboxes.length === 0) {
        mostrarPopupMensagem('Selecione pelo menos um corte para excluir.', 'aviso');
        return;
    }

    if (confirm(`Tem certeza que deseja excluir os ${checkboxes.length} corte${checkboxes.length > 1 ? 's' : ''} selecionado${checkboxes.length > 1 ? 's' : ''}?`)) {
        const btnExcluir = tipoCorte === 'pendente' 
            ? document.getElementById('btnExcluirCortesPendentes') 
            : document.getElementById('btnExcluirCortesEstoque');
        
        const originalText = btnExcluir ? btnExcluir.innerHTML : '';
        if(btnExcluir) {
            btnExcluir.disabled = true;
            btnExcluir.innerHTML = '<div class="spinner-btn-interno"></div> Excluindo...';
        }

        let algumErro = false;
        try {
            for (const cb of checkboxes) {
                try {
                    await excluirCorte(cb.dataset.id); 
                } catch (errorIndividual) {
                    console.error(`Erro ao excluir corte ID ${cb.dataset.id}:`, errorIndividual);
                    algumErro = true;
                    mostrarPopupMensagem(`Erro ao excluir corte ID ${cb.dataset.id}: ${errorIndividual.message.substring(0,100)}`, 'erro');
                }
            }
            if (!algumErro) {
                mostrarPopupMensagem('Cortes selecionados excluídos com sucesso!', 'sucesso');
            } else {
                mostrarPopupMensagem('Alguns cortes não puderam ser excluídos. Verifique o console.', 'aviso');
            }
            
            limparCacheCortes(); 
            await callbackReloadView(true); 

        } catch (errorGeral) {
            console.error(`Erro geral ao excluir cortes ${tipoCorte}:`, errorGeral);
            mostrarPopupMensagem(`Erro ao excluir cortes: ${errorGeral.message}`, 'erro');
        } finally {
             if(btnExcluir) {
                btnExcluir.disabled = false;
                btnExcluir.innerHTML = originalText; 
             }
        }
    }
}function handleExcluirCortesPendentes() { handleExcluirCortes('tabelaCortesPendentesBody', 'pendente', loadCortesPendentesViewContent); }
function handleExcluirCortesEstoque() { handleExcluirCortes('tabelaCortesEmEstoqueBody', 'estoque', loadCortesEmEstoqueViewContent); }

// --- TOGGLEVIEW ---

async function toggleView() {
    console.log('[toggleView] Hash alterada para:', window.location.hash);
    const views = {
        opListView: document.getElementById('opListView'),
        opFormView: document.getElementById('opFormView'),
        opEditView: document.getElementById('opEditView'),
        corteView: document.getElementById('corteView'),
        cortesPendentesView: document.getElementById('cortesPendentesView'),
        cortesEmEstoqueView: document.getElementById('cortesEmEstoqueView')
    };

    // Elementos da tela de edição que precisam ser resetados/ter spinner
    const opNumeroTitle = document.getElementById('opNumero');
    const editProdutoOPInput = document.getElementById('editProdutoOP');
    const editVarianteContainer = document.getElementById('editVarianteContainer');
    const editVarianteInput = document.getElementById('editVarianteOP');
    const editQuantidadeOPInput = document.getElementById('editQuantidadeOP');
    const editDataEntregaOPInput = document.getElementById('editDataEntregaOP');
    const etapasContainer = document.getElementById('etapasContainer');
    const btnFinalizarOP = document.getElementById('finalizarOP');
    const btnCancelarOPNaEdicao = document.getElementById('cancelarOP'); // Botão "Cancelar OP" na tela de edição

    // 1. Esconde todas as seções principais primeiro
    for (const key in views) {
        if (views[key]) {
            views[key].style.display = 'none';
        }
    }

    const hash = window.location.hash;

    // 2. LÓGICA DE LIMPEZA IMEDIATA PARA A TELA DE EDIÇÃO
    //    Isso acontece *antes* de qualquer busca de dados se a hash for para #editar.
    if (hash.startsWith('#editar/')) {
        console.log('[toggleView] Preparando para exibir tela de edição. Resetando campos da UI...');
        if (opNumeroTitle) opNumeroTitle.textContent = 'Carregando OP...';
        if (editProdutoOPInput) editProdutoOPInput.value = '';
        if (editVarianteContainer) editVarianteContainer.style.display = 'none';
        if (editVarianteInput) editVarianteInput.value = '';
        if (editQuantidadeOPInput) editQuantidadeOPInput.value = '';
        if (editDataEntregaOPInput) editDataEntregaOPInput.value = '';
        if (etapasContainer) etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';
        
        // Desabilita botões de ação enquanto os dados não são carregados
        if (btnFinalizarOP) btnFinalizarOP.disabled = true;
        if (btnCancelarOPNaEdicao) btnCancelarOPNaEdicao.disabled = true;
    }

    // 3. ROTEAMENTO E CARREGAMENTO DE CONTEÚDO DAS VIEWS
    if (hash.startsWith('#editar/') && permissoes.includes('editar-op')) {
        if (views.opEditView) {
            views.opEditView.style.display = 'block'; // Mostra a view de edição (já limpa ou com spinners)
            const editIdFromHash = hash.split('/')[1];

            if (!editIdFromHash) {
                mostrarPopupMensagem('ID da OP inválido na URL.', 'erro');
                window.location.hash = '';
                return;
            }
            try {
                console.log(`[toggleView #editar] Buscando dados para OP com ID: ${editIdFromHash}`);
                limparCacheOrdens(); // Força a busca para ter os dados mais recentes da OP
                const ordensData = await obterOrdensDeProducao(1, true, true, null, true); // Busca todas, força refresh
                const opParaEditar = ordensData.rows.find(o => o.edit_id === editIdFromHash || o.numero === editIdFromHash);

                if (opParaEditar) {
                    console.log(`[toggleView #editar] OP encontrada:`, opParaEditar);
                    // Preenche os campos do formulário com os dados da OP encontrada
                    if (opNumeroTitle) opNumeroTitle.textContent = `OP n°: ${opParaEditar.numero}`;
                    if (editProdutoOPInput) editProdutoOPInput.value = opParaEditar.produto || '';
                    if (editVarianteContainer && editVarianteInput) {
                        if (opParaEditar.variante) {
                            editVarianteInput.value = opParaEditar.variante;
                            editVarianteContainer.style.display = '';
                        } else {
                            editVarianteContainer.style.display = 'none';
                        }
                    }
                    if (editQuantidadeOPInput) editQuantidadeOPInput.value = opParaEditar.quantidade || '';
                    if (editDataEntregaOPInput) {
                        editDataEntregaOPInput.value = opParaEditar.data_entrega 
                            ? new Date(opParaEditar.data_entrega).toISOString().split('T')[0] 
                            : '';
                    }
                    
                    console.log(`[toggleView #editar] Carregando etapas para OP: ${opParaEditar.numero}`);
                    await loadEtapasEdit(opParaEditar, false); // Carrega as etapas
                    // A função loadEtapasEdit, ao terminar, deve chamar updateFinalizarButtonState(opParaEditar)
                    // para habilitar/desabilitar os botões de ação corretamente.

                } else {
                    mostrarPopupMensagem('Ordem de Produção para edição não encontrada.', 'erro');
                    if (opNumeroTitle) opNumeroTitle.textContent = 'OP não encontrada'; // Atualiza título
                    if (etapasContainer) etapasContainer.innerHTML = '<p style="color:red; text-align:center;">OP não encontrada.</p>';
                    // Não redireciona imediatamente, deixa o usuário ver a mensagem.
                    // window.location.hash = ''; // Pode ser opcional aqui
                }
            } catch (error) {
                console.error('[toggleView #editar] Erro ao carregar OP para edição:', error);
                mostrarPopupMensagem(`Erro ao carregar OP: ${error.message.substring(0,100)}`, 'erro');
                if (opNumeroTitle) opNumeroTitle.textContent = 'Erro ao carregar OP';
                if (etapasContainer) etapasContainer.innerHTML = `<p style="color:red; text-align:center;">Erro ao carregar OP: ${error.message.substring(0,100)}</p>`;
                // window.location.hash = ''; // Pode ser opcional aqui
            }
        } else {
            console.warn('[toggleView] Elemento opEditView não encontrado no DOM.');
        }
    } else if (hash === '#adicionar' && permissoes.includes('criar-op')) {
        if (views.opFormView) {
            views.opFormView.style.display = 'block';
            limparFormularioOP(); 
            await loadProdutosSelect(); 
            await loadVariantesSelects(''); // Garante que o select de variantes esteja limpo inicialmente
            // Campos como número da OP e data serão preenchidos por verificarCorteEAtualizarFormOP
        } else {
            console.warn('[toggleView] Elemento opFormView não encontrado no DOM.');
        }
    } else if (hash === '#corte' && permissoes.includes('criar-op')) {
        if (views.corteView) {
            views.corteView.style.display = 'block';
            limparFormularioCorte();
            await loadProdutosCorte();
            setCurrentDateForCorte();
            const produtoCorteSelect = document.getElementById('produtoCorte');
            if (produtoCorteSelect && !produtoCorteSelect.dataset.eventAttached) {
                 produtoCorteSelect.addEventListener('change', async (e) => {
                     await loadVariantesCorte(e.target.value);
                 });
                 produtoCorteSelect.dataset.eventAttached = 'true';
            }
            await loadVariantesCorte('');
        } else {
            console.warn('[toggleView] Elemento corteView não encontrado no DOM.');
        }
    } else if (hash === '#cortes-pendentes' && permissoes.includes('acesso-ordens-de-producao')) {
        if (views.cortesPendentesView) {
            views.cortesPendentesView.style.display = 'block';
            await loadCortesPendentesViewContent(true);
        } else {
            console.error('[toggleView] Elemento cortesPendentesView não encontrado!');
        }
    } else if (hash === '#cortes-em-estoque' && permissoes.includes('acesso-ordens-de-producao')) {
        if (views.cortesEmEstoqueView) {
            views.cortesEmEstoqueView.style.display = 'block';
            await loadCortesEmEstoqueViewContent(true);
        } else {
            console.error('[toggleView] Elemento cortesEmEstoqueView não encontrado!');
        }
    } else if (hash === '#acessocortes') { // Hash antiga
        console.log('[toggleView] Redirecionando de #acessocortes para #cortes-pendentes');
        window.location.hash = '#cortes-pendentes';
     } else { // Tela padrão (lista de OPs) - Executado quando hash é '', '#', ou não corresponde a outras rotas
        const opListView = document.getElementById('opListView'); // views.opListView do seu código original

        if (opListView) {
            opListView.style.display = 'block';
            const statusFilter = document.getElementById('statusFilter');
            
            // 1. Define o botão "Todas" como visualmente ativo
            //    e desativa outros botões de filtro de status.
            if (statusFilter) {
                statusFilter.querySelectorAll('.op-botao-filtro').forEach(btn => {
                    btn.classList.remove('active');
                    // Resetar estilos inline para garantir que o CSS base seja aplicado
                    btn.style.backgroundColor = '';
                    btn.style.color = '';
                    btn.style.borderColor = '';
                });
                const todasBtn = statusFilter.querySelector('.op-botao-filtro[data-status="todas"]');
                if (todasBtn) {
                    todasBtn.classList.add('active');
                } else {
                    console.warn("[toggleView] Botão de filtro 'Todas' não encontrado.");
                }
            } else {
                console.warn("[toggleView] Elemento #statusFilter não encontrado.");
            }
            
            // 2. SEMPRE carrega/recarrega a tabela para a visualização "Todas"
            //    O parâmetro 'forceUpdate = true' para loadOPTable garante que os dados
            //    da API sejam buscados novamente, ignorando o cache de obterOrdensDeProducao.
            //    Isso é importante para ver OPs recém-criadas.            
            // Pega a configuração de ordenação atual para manter, ou usa default
            const activeSortTh = document.querySelector('.tabela-op th[data-sort]:not([data-sort=""])');
            let sortConfigParaLoad = { criterio: 'numero', ordem: 'desc' }; // Default
            if (activeSortTh) {
                sortConfigParaLoad.criterio = activeSortTh.id.replace('sort', '').toLowerCase();
                sortConfigParaLoad.ordem = activeSortTh.dataset.sort || 'desc';
            }

            await loadOPTable(
                'todas',                                 // uiFilterStatus sempre 'todas' para a home
                document.getElementById('searchOP')?.value || '', // Mantém busca atual, se houver
                sortConfigParaLoad,                      // Mantém ordenação atual ou default
                1,                                       // Volta para a página 1
                true,                                    // <<<< forceUpdate = true AQUI
                null                                     // apiStatusFilter = null (API usa filtro padrão)
            ); 
            
            // 3. Aplica a cor correta ao botão de filtro que agora está ativo ("Todas")
            aplicarCorAoFiltroAtivo(); 

        } else {
            console.warn('[toggleView] Elemento opListView não encontrado no DOM.');
        }
    }
}

// --- LOAD OPTABLE & ORDENAÇÃO ---
async function loadOPTable(
    filterStatus = 'todas', // uiFilterStatus
    search = '',            // searchTerm
    sortConfig = { criterio: 'numero', ordem: 'desc' },
    page = 1,
    forceUpdate = false,
    statusApiFilter = null  // status a ser enviado para a API (pode ser diferente de filterStatus se filterStatus='todas')
) {
    const { criterio: sortCriterio, ordem: sortOrdem } = sortConfig;
    const opTableBody = document.getElementById('opTableBody');
    
    if (!opTableBody) {
        console.error('[loadOPTable] opTableBody não encontrado.');
        return;
    }

    let paginationContainer = document.getElementById('paginationContainerOPs');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'paginationContainerOPs';
        paginationContainer.className = 'pagination-container';
        const tableWrapper = opTableBody.closest('.area-filtros-tabela') || opTableBody.parentElement;
        if (tableWrapper) { // Adiciona apenas se o wrapper for encontrado
             tableWrapper.appendChild(paginationContainer);
        } else {
            console.warn("[loadOPTable] Wrapper para paginação não encontrado, paginação não será adicionada automaticamente.");
        }
    }

    if (opTableBody.dataset.isLoading === 'true' && !forceUpdate) {
        console.log('[loadOPTable] Carregamento em progresso, ignorando.');
        return;
    }
    opTableBody.dataset.isLoading = 'true';

    if (!opTableBody.hasChildNodes() || opTableBody.textContent.trim() === '' || !opTableBody.dataset.renderedAtLeastOnce) {
        opTableBody.innerHTML = '<tr><td colspan="5"><div class="spinner">Carregando ordens...</div></td></tr>';
    }

    try {
        console.log(`[loadOPTable] Iniciando. Filtro UI: ${filterStatus}, Busca: "${search}", Sort: ${sortCriterio}-${sortOrdem}, Página: ${page}, Filtro API: ${statusApiFilter}`);
        const fetchAllParaAPI = false; // <--- MUDANÇA IMPORTANTE: Sempre false para loadOPTable padrão
        const usarNoStatusFilterAPI = false; // (A menos que você tenha um filtro "Ver absolutamente todas")

        console.log(`[loadOPTable] Chamando obterOrdensDeProducao com: page=${page}, fetchAll=${fetchAllParaAPI}, forceUpdate=${forceUpdate}, statusFilter=${statusApiFilter}, noStatusFilter=${usarNoStatusFilterAPI}, searchTerm=${search}`);

        const data = await obterOrdensDeProducao(
            page,                   // Sempre passa a página atual
            fetchAllParaAPI,        // false
            forceUpdate,
            statusApiFilter,        // O status a ser enviado para a API
            usarNoStatusFilterAPI,  // false
            search                  // <<< PASSA O TERMO DE BUSCA PARA A API >>>
        );

        // <<< LOGS DE VERIFICAÇÃO AQUI >>>
        console.log('[loadOPTable] Resultado de obterOrdensDeProducao (data):', JSON.parse(JSON.stringify(data))); // Log profundo do objeto data
        if (!data) {
            console.error('[loadOPTable] ERRO: "data" (resultado de obterOrdensDeProducao) é nulo ou undefined!');
            opTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Erro crítico: Não foi possível obter dados das OPs.</td></tr>';
            delete opTableBody.dataset.isLoading;
            return; // Interrompe a execução
        }
        console.log('[loadOPTable] typeof data.rows:', typeof data.rows, 'Array.isArray(data.rows):', Array.isArray(data.rows));
        if (data.rows) {
            console.log('[loadOPTable] data.rows.length:', data.rows.length);
        } else {
            console.error('[loadOPTable] ERRO: data.rows é nulo ou undefined!');
        }
        // <<< FIM DOS LOGS DE VERIFICAÇÃO >>>

        if (!data || !Array.isArray(data.rows)) {
            console.error('[loadOPTable] ERRO: Dados de OPs retornados pela API são inválidos ou data.rows não é um array. Valor de data.rows:', data.rows);
        throw new Error('Dados de OPs retornados pela API são inválidos ou data.rows não é um array.');        }

        let oPsParaProcessar = data.rows;
        console.log('[loadOPTable] oPsParaProcessar (data.rows) definido. Length:', oPsParaProcessar ? oPsParaProcessar.length : 'undefined');
        // O total de itens agora vem diretamente da API (data.total)
        let totalItemsParaPaginar = data.total;
        console.log(`[loadOPTable] OPs da API (já filtradas/buscadas/paginadas): ${oPsParaProcessar.length}. Total de itens da API: ${totalItemsParaPaginar}`);

        if (Array.isArray(oPsParaProcessar)) {
            // Chamamos ordenarOPs. O resultado deve ser um array.
    const resultadoOrdenacao = ordenarOPs([...oPsParaProcessar], sortCriterio, sortOrdem);

    // Verificação extra: O que ordenarOPs realmente retornou?
    console.log('[loadOPTable] Resultado DIRETO de ordenarOPs:', resultadoOrdenacao ? `Array com ${resultadoOrdenacao.length} itens` : resultadoOrdenacao);

    if (Array.isArray(resultadoOrdenacao)) {
        filteredOPsGlobal = resultadoOrdenacao;
    } else {
        console.error('[loadOPTable] ERRO CRÍTICO: ordenarOPs não retornou um array! Retornou:', resultadoOrdenacao, '. Usando array vazio como fallback.');
        filteredOPsGlobal = []; // Fallback para evitar mais erros
    }
    console.log('[loadOPTable] filteredOPsGlobal após ordenação e verificação. Length:', filteredOPsGlobal ? filteredOPsGlobal.length : 'undefined');
} else {
    console.error('[loadOPTable] ERRO: oPsParaProcessar não é um array antes de ordenar. Definindo filteredOPsGlobal como array vazio.');
            filteredOPsGlobal = []; // Evita erro na próxima linha se oPsParaProcessar for undefined
        }
        
        // Paginação local APÓS busca local e ordenação, se fetchAllParaAPI foi true
        let opsPaginadas;
        if (Array.isArray(filteredOPsGlobal)) { // Verifique se filteredOPsGlobal AINDA é um array
    opsPaginadas = filteredOPsGlobal;
} else {
    console.error('[loadOPTable] ERRO INESPERADO: filteredOPsGlobal NÃO é um array antes de atribuir a opsPaginadas! Valor:', filteredOPsGlobal, '. Usando array vazio.');
    opsPaginadas = []; // Fallback
}

// let opsPaginadas = filteredOPsGlobal; // Linha original substituída pelas linhas acima
console.log('[loadOPTable] opsPaginadas (após atribuição direta e verificação). Length:', opsPaginadas ? opsPaginadas.length : 'undefined');

let totalPagesCalculadas = data.pages || 1;
// A linha do erro original:
console.log(`[loadOPTable] Usando OPs paginadas pela API (após ordenação local): ${opsPaginadas.length}. Total Páginas API: ${totalPagesCalculadas}`);
        console.log(`[loadOPTable] Usando OPs paginadas pela API (após ordenação local): ${opsPaginadas.length}. Total Páginas API: ${totalPagesCalculadas}`);

        if (fetchAllParaAPI) {
            const startIndex = (page - 1) * itemsPerPage;
            opsPaginadas = filteredOPsGlobal.slice(startIndex, startIndex + itemsPerPage);
            console.log(`[loadOPTable] Paginado localmente: ${opsPaginadas.length} OPs para página ${page} de ${totalPagesCalculadas} total.`);
        } else {
            // Se a API já paginou, usamos a lista ordenada diretamente.
            // E usamos totalPages da API (data.pages)
            opsPaginadas = filteredOPsGlobal;
            totalPagesCalculadas = data.pages || 1; // Usa pages da API
            console.log(`[loadOPTable] Usando OPs paginadas pela API: ${opsPaginadas.length}. Total Páginas API: ${totalPagesCalculadas}`);
        }

        if (opsPaginadas.length === 0 && totalItemsParaPaginar > 0 && page > totalPagesCalculadas && totalPagesCalculadas > 0) {
            console.log(`[loadOPTable] Página ${page} fora do intervalo (${totalPagesCalculadas} págs). Recarregando página 1.`);
            return loadOPTable(filterStatus, search, sortCriterio, sortOrdem, 1, true, statusParaEnviarAPI);
        }

        opTableBody.innerHTML = '';
        if (opsPaginadas.length === 0) {
            opTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Nenhuma ordem de produção encontrada.</td></tr>';
        } else {
            const fragment = document.createDocumentFragment();
            opsPaginadas.forEach(op => {
                if (!op.edit_id) op.edit_id = generateUniqueId();
                const tr = document.createElement('tr');
                tr.dataset.editId = op.edit_id;
                if (permissoes.includes('editar-op')) tr.style.cursor = 'pointer';

                let statusDisplayHtml = `<span class="status-bolinha status-${op.status} ${op.status === 'produzindo' ? 'blink' : ''}"></span>`;
                statusDisplayHtml += ` ${op.status.charAt(0).toUpperCase() + op.status.slice(1)}`;
                if (op.status === 'em-aberto') {
                    const etapaCorte = op.etapas?.find(et => et.processo?.toLowerCase() === 'corte');
                    if (etapaCorte && !etapaCorte.lancado) {
                        statusDisplayHtml += ` <a href="#cortes-pendentes" class="link-corte-pendente" title="Corte pendente">(⚠️ Corte Pendente)</a>`;
                    }
                }

        // --- Célula de Ações ---
    let acoesHtml = '';
    // Verifica permissão e status da OP para exibir o botão de cancelar
    if (permissoes.includes('editar-op') && (op.status === 'em-aberto' || op.status === 'produzindo')) {
        acoesHtml = `<button 
                         class="op-botao-acao-tabela op-botao-cancelar-lista" 
                         data-op-numero="${op.numero}" 
                         data-op-edit-id="${op.edit_id}" 
                         title="Cancelar OP #${op.numero}">
                            <i class="fas fa-trash-alt"></i> <!-- Ícone de lixeira -->
                            <!-- Ou <i class="fas fa-times-circle"></i> para um X -->
                            <!-- Ou apenas <i class="fas fa-ban"></i> para um símbolo de proibido/cancelar -->
                      </button>`;
    } else if (op.status === 'cancelada' || op.status === 'finalizado') {
        acoesHtml = `<span class="op-acao-placeholder">-</span>`; // Placeholder para manter alinhamento
    }
    // --- Fim da Célula de Ações ---

            tr.innerHTML = `
                <td>${statusDisplayHtml}</td>
                <td>${op.numero || 'N/A'}</td>
                <td>${op.produto || 'N/A'}</td>
                <td>${op.variante || '-'}</td>
                <td>${op.quantidade || 0}</td>
                <td class="op-coluna-acoes">${acoesHtml}</td>
                    `;
            fragment.appendChild(tr);
            });
            opTableBody.appendChild(fragment);
        }
        opTableBody.dataset.renderedAtLeastOnce = 'true';

        if (opTableBody.handleOPTableClickAttached) {
            opTableBody.removeEventListener('click', opTableBody.handleOPTableClickAttached);
        }

// Nova função handler para o clique no botão de cancelar da lista
    const newCancelarListener = async function(event) { // 'event' é o objeto do evento
    const targetButton = event.target.closest('.op-botao-cancelar-lista'); // Use a classe correta do seu botão de lixeira

    if (targetButton) {
        event.stopPropagation(); // IMPEDE o clique de "borbulhar" para o listener da linha (handleOPTableClick)
        
        const opNumero = targetButton.dataset.opNumero;
        const opEditId = targetButton.dataset.opEditId;
        
        console.log(`[newCancelarListener] Ação de cancelar para OP #${opNumero} (edit_id: ${opEditId})`);

        if (confirm(`Tem certeza que deseja CANCELAR a Ordem de Produção #${opNumero}? Esta ação não pode ser desfeita.`)) {
            const originalButtonHTML = targetButton.innerHTML; // Guarda o HTML original (ícone)
            targetButton.disabled = true;
            targetButton.innerHTML = '<div class="spinner-btn-interno"></div>'; // Adiciona spinner

            try {
                limparCacheOrdens(); 
                const ordensData = await obterOrdensDeProducao(1, true, true, null, true); // Força refresh
                const opParaCancelar = ordensData.rows.find(o => o.edit_id === opEditId);

                if (!opParaCancelar) {
                    targetButton.disabled = false; // Reabilita
                    targetButton.innerHTML = originalButtonHTML; // Restaura
                    throw new Error('OP não encontrada para cancelamento.');
                }
                if (opParaCancelar.status === 'finalizado' || opParaCancelar.status === 'cancelada') {
                    mostrarPopupMensagem(`OP #${opNumero} já está ${opParaCancelar.status} e não pode ser cancelada.`, 'aviso');
                    targetButton.disabled = false; // Reabilita
                    targetButton.innerHTML = originalButtonHTML; // Restaura
                    return; 
                }

                opParaCancelar.status = 'cancelada';
                // opParaCancelar.data_final = null; // Opcional
                
                await window.saveOPChanges(opParaCancelar); 
                
                mostrarPopupMensagem(`Ordem de Produção #${opNumero} cancelada com sucesso!`, 'sucesso');
                limparCacheOrdens(); 
                
                // Recarrega a tabela com os filtros e ordenação atuais
                const statusFilterContainer = document.getElementById('statusFilter');
                const uiStatus = statusFilterContainer.querySelector('.op-botao-filtro.active').dataset.status;
                const searchTerm = document.getElementById('searchOP').value;
                const activeSortTh = document.querySelector('.tabela-op th[data-sort]:not([data-sort=""])');
                
                const sortCriterio = activeSortTh ? activeSortTh.id.replace('sort', '').toLowerCase() : 'numero';
                const sortOrdem = activeSortTh ? activeSortTh.dataset.sort || 'desc' : 'desc';
                const apiStatus = (uiStatus === 'todas') ? null : uiStatus;

                // Usar a variável global currentPage ou resetar para 1.
                // Se você quer que a paginação permaneça, use currentPage. Se quer voltar para pág 1, use 1.
                await loadOPTable(uiStatus, searchTerm, {criterio: sortCriterio, ordem: sortOrdem}, currentPage, true, apiStatus);

            } catch (error) {
                console.error(`[newCancelarListener] Erro ao cancelar OP #${opNumero}:`, error);
                mostrarPopupMensagem(`Erro ao cancelar OP: ${error.message.substring(0,100)}`, 'erro');
                targetButton.disabled = false;
                targetButton.innerHTML = originalButtonHTML; // Restaura o ícone/conteúdo
            }
        } else {
            // Usuário clicou em "Não" no confirm. O botão não foi desabilitado, então não precisa reabilitar.
            console.log(`[newCancelarListener] Cancelamento da OP #${opNumero} abortado pelo usuário.`);
        }
    }

};
            opTableBody.addEventListener('click', newCancelarListener);
            opTableBody.handleCancelarOPListaClickAttached = newCancelarListener; // Guarda referência
            console.log('[loadOPTable] Listener para botões de cancelar na lista adicionado.');



        if (permissoes.includes('editar-op')) {
            opTableBody.addEventListener('click', handleOPTableClick);
            opTableBody.handleOPTableClickAttached = handleOPTableClick;
        }

        let paginationHTML = '';
        if (totalPagesCalculadas > 1) {
            paginationHTML += `<button class="pagination-btn prev" data-page="${Math.max(1, page - 1)}" ${page === 1 ? 'disabled' : ''}>Anterior</button>`;
            paginationHTML += `<span class="pagination-current">Pág. ${page} de ${totalPagesCalculadas}</span>`;
            paginationHTML += `<button class="pagination-btn next" data-page="${Math.min(totalPagesCalculadas, page + 1)}" ${page === totalPagesCalculadas ? 'disabled' : ''}>Próximo</button>`;
        }
        if (paginationContainer) {
            paginationContainer.innerHTML = paginationHTML;
             if (!document.getElementById(paginationContainer.id) && opTableBody.closest('.area-filtros-tabela')) {
                 opTableBody.closest('.area-filtros-tabela').appendChild(paginationContainer);
             }
            paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
        const newPage = parseInt(btn.dataset.page);
        if (isNaN(newPage) || newPage < 1) {
            console.error("[Paginação Clique] ERRO: newPage é inválido!", newPage);
            return;
        }

        // >>> A CHAMADA CORRIGIDA AQUI <<<
        // sortConfig já é um objeto no escopo de loadOPTable
        loadOPTable(filterStatus, search, sortConfig, newPage, false, statusApiFilter); 
    });
            });
        }
    } catch (error) {
        console.error('[loadOPTable] Erro ao carregar e renderizar OPs:', error); // Log do erro
        opTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;padding:20px;">Erro ao carregar. Tente novamente.</td></tr>';
    } finally {
        delete opTableBody.dataset.isLoading;
    }
}

function ordenarOPs(ops, criterio, ordem = 'asc') {
  return ops.sort((a, b) => {
    switch (criterio) {
      case 'status':
        const statusOrder = a.status.localeCompare(b.status);
        if (statusOrder === 0) {
          return ordem === 'asc' ? parseInt(a.numero) - parseInt(b.numero) : parseInt(b.numero) - parseInt(a.numero);
        }
        return ordem === 'asc' ? statusOrder : -statusOrder;
      case 'numero':
        return ordem === 'asc' ? parseInt(a.numero) - parseInt(b.numero) : parseInt(b.numero) - parseInt(a.numero);
      case 'produto':
        return ordem === 'asc' ? a.produto.localeCompare(b.produto) : b.produto.localeCompare(a.produto);
      case 'variante':
        const varA = a.variante || '-';
        const varB = b.variante || '-';
        return ordem === 'asc' ? varA.localeCompare(varB) : varB.localeCompare(varA);
      case 'quantidade':
        return ordem === 'asc' ? parseInt(a.quantidade) - parseInt(b.quantidade) : parseInt(b.quantidade) - parseInt(a.quantidade);
      default:
        return ordem === 'asc' ? parseInt(a.numero) - parseInt(b.numero) : parseInt(b.numero) - parseInt(a.numero);
    }
  });
}

// --- FUNÇÕES DE ETAPAS (COLE AS SUAS AQUI, ADAPTADAS SE NECESSÁRIO) ---
async function getTipoUsuarioPorProcesso(processo, produtoNome) {
    const cacheKey = `${produtoNome}-${processo}`; // Chave para o cache
    if (tipoUsuarioProcessoCache.has(cacheKey)) {
        console.log(`[getTipoUsuarioPorProcesso] Cache HIT para: ${cacheKey}`);
        return tipoUsuarioProcessoCache.get(cacheKey);
    }
    console.log(`[getTipoUsuarioPorProcesso] Cache MISS para: ${cacheKey}. Buscando...`);

    const todosOsProdutos = await obterProdutosDoStorage(); // Busca os produtos (já otimizado pelo storage.js)
    const produto = todosOsProdutos.find(p => p.nome === produtoNome);
    let tipoUsuario = ''; // Default
    if (produto && produto.etapas) {
        const etapaConfig = produto.etapas.find(e => (typeof e === 'object' ? e.processo : e) === processo);
        tipoUsuario = etapaConfig ? (typeof etapaConfig === 'object' ? etapaConfig.feitoPor : null) : '';
    }

    tipoUsuarioProcessoCache.set(cacheKey, tipoUsuario); // Armazena no cache
    return tipoUsuario;
}

async function loadEtapasEdit(op, skipReload = false) {
    if (isLoadingEtapas && !skipReload) {
        console.log(`[loadEtapasEdit] Carregamento de etapas para OP ${op?.numero} já em andamento. Ignorando.`);
        return;
    }
    isLoadingEtapas = true;
    const etapasContainer = document.getElementById('etapasContainer');
    const finalizarBtn = document.getElementById('finalizarOP'); // Botão Finalizar OP

    if (!op || !etapasContainer) { // Removido finalizarBtn da condição principal, pois ele é só para estado
        console.error('[loadEtapasEdit] Elementos essenciais (op, etapasContainer) não encontrados ou OP inválida.');
        if (etapasContainer) etapasContainer.innerHTML = '<p style="color:red;">Erro: OP ou container de etapas inválido.</p>';
        isLoadingEtapas = false;
        return;
    }
    etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';

    try {
        // Promise.all para buscar dados em paralelo
        const [produtos, usuarios, lancamentosDb, cortesPendentes, cortesCortados, cortesVerificados, cortesUsados] = await Promise.all([
            obterProdutosDoStorage(),
            obterUsuarios(), // Forçar refresh do cache de usuários para ter a lista mais recente
            obterLancamentos(op.numero, true), // Forçar refresh dos lançamentos para esta OP
            obterCortes('pendente', true), // Forçar refresh
            obterCortes('cortados', true),
            obterCortes('verificado', true),
            obterCortes('usado', true)
        ]);
        const todosCortes = [...cortesPendentes, ...cortesCortados, ...cortesVerificados, ...cortesUsados];

        // Inicializa op.etapas se não existir ou estiver vazia, baseado na configuração do produto
        const produtoConfig = produtos.find(p => p.nome === op.produto);
        if ((!op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) && produtoConfig && produtoConfig.etapas && Array.isArray(produtoConfig.etapas)) {
            op.etapas = produtoConfig.etapas.map(eInfo => {
                const processoNome = typeof eInfo === 'object' ? eInfo.processo : eInfo;
                return {
                    processo: processoNome,
                    usuario: '',
                    quantidade: 0,
                    lancado: false,
                    ultimoLancamentoId: null
                };
            });
            console.log(`[loadEtapasEdit] Etapas da OP #${op.numero} inicializadas a partir da configuração do produto.`);
        } else if (!op.etapas || !Array.isArray(op.etapas)) {
            op.etapas = [];
            console.warn(`[loadEtapasEdit] Produto ${op.produto} sem etapas definidas ou op.etapas inválido. Definido como array vazio.`);
        }

        // Mapear/Sincronizar etapas da OP com lançamentos do banco
        op.etapas = op.etapas.map((etapaDaOp, index) => {
            // Encontra o último lançamento para esta etapa específica (mesmo processo e índice)
            // Ordena por data desc para pegar o mais recente se houver múltiplos (não deveria para a mesma etapa/index)
            const lancamentosDaEtapa = lancamentosDb
                .filter(l => l.etapa_index === index && l.processo === etapaDaOp.processo)
                .sort((a, b) => new Date(b.data) - new Date(a.data));

            if (lancamentosDaEtapa.length > 0) {
                const ultimoLanc = lancamentosDaEtapa[0];
                return {
                    ...etapaDaOp,
                    usuario: ultimoLanc.funcionario || etapaDaOp.usuario || '',
                    quantidade: ultimoLanc.quantidade || etapaDaOp.quantidade || 0,
                    lancado: true, // Se tem lançamento, está lançada
                    ultimoLancamentoId: ultimoLanc.id || etapaDaOp.ultimoLancamentoId
                };
            }
            // Se for a etapa de Corte, a lógica de "lançado" é tratada abaixo pelo status do corte
            if (etapaDaOp.processo && etapaDaOp.processo.toLowerCase() === 'corte') {
                return { ...etapaDaOp, lancado: etapaDaOp.lancado || false, quantidade: etapaDaOp.quantidade || 0 }; // Mantém o estado de 'lancado' do corte
            }
            // Para outras etapas sem lançamento, reseta para não lançado e quantidade zero (ou a da OP se já tiver)
            return { ...etapaDaOp, lancado: false, quantidade: etapaDaOp.quantidade || 0, ultimoLancamentoId: null };
        });

        // Lógica específica para a etapa "Corte"
        const corteEtapaIndex = op.etapas.findIndex(e => e.processo && e.processo.toLowerCase() === 'corte');
        let etapaCorteOriginalmenteLancada = false;
        let etapaCorteModificadaNoLoad = false;

        if (corteEtapaIndex !== -1) {
            etapaCorteOriginalmenteLancada = op.etapas[corteEtapaIndex].lancado;

            // Busca um corte associado a esta OP ou um corte de estoque compatível
            const corteAssociadoOP = todosCortes.find(c => c.op && String(c.op) === String(op.numero));
            let corteParaUsar = corteAssociadoOP;

            if (!corteParaUsar) { // Se não há corte diretamente associado à OP
                 // Tenta encontrar um corte de estoque se a OP ainda está 'em-aberto' ou não tem corte lançado
                if (op.status === 'em-aberto' || !op.etapas[corteEtapaIndex].lancado) {
                    corteParaUsar = todosCortes.find(c =>
                        !c.op && // Sem OP associada (de estoque)
                        c.produto === op.produto &&
                        (c.variante || null) === (op.variante || null) &&
                        ['cortados', 'verificado', 'usado'].includes(c.status) &&
                        c.quantidade >= op.quantidade // Opcional: verificar se a qtd do corte de estoque é suficiente
                    );
                    // Se encontrou um corte de estoque, idealmente deveria associá-lo à OP
                    // Isso pode ser complexo de fazer automaticamente aqui. Por ora, apenas reflete o status.
                }
            }
            
            if (corteParaUsar) {
                op.etapas[corteEtapaIndex].quantidade = corteParaUsar.quantidade || op.quantidade; // Usa qtd do corte se disponível, senão da OP
                if (['cortados', 'verificado', 'usado'].includes(corteParaUsar.status)) {
                    op.etapas[corteEtapaIndex].usuario = corteParaUsar.cortador || 'Sistema';
                    op.etapas[corteEtapaIndex].lancado = true;
                    console.log(`[loadEtapasEdit] Etapa Corte da OP #${op.numero} definida como REALIZADA (Status do corte: ${corteParaUsar.status}, Cortador: ${op.etapas[corteEtapaIndex].usuario}).`);
                } else { // Corte encontrado mas pendente
                    op.etapas[corteEtapaIndex].lancado = false;
                    op.etapas[corteEtapaIndex].usuario = corteParaUsar.cortador || ''; // Pode ser null ou "A definir"
                    console.log(`[loadEtapasEdit] Etapa Corte da OP #${op.numero} PENDENTE (Status do corte: ${corteParaUsar.status}).`);
                }
            } else { // Nenhum corte relevante encontrado (nem associado, nem de estoque aplicável)
                op.etapas[corteEtapaIndex].lancado = false;
                op.etapas[corteEtapaIndex].usuario = ''; // Sem cortador definido
                op.etapas[corteEtapaIndex].quantidade = op.quantidade; // Quantidade da OP
                console.log(`[loadEtapasEdit] Nenhum corte encontrado para OP #${op.numero}. Etapa Corte marcada como PENDENTE.`);
            }

            if (op.etapas[corteEtapaIndex].lancado !== etapaCorteOriginalmenteLancada) {
                etapaCorteModificadaNoLoad = true;
            }
        }

        // Verificar e potencialmente atualizar o status da OP e salvar se a etapa de corte mudou
        const statusOriginalDaOP = op.status;
        const todasEtapasCompletasAntes = await verificarEtapasEStatus(op); // Verifica o status atual

        if (etapaCorteModificadaNoLoad || (op.status !== statusOriginalDaOP)) {
            console.log(`[loadEtapasEdit] Etapa de corte ou status geral da OP #${op.numero} modificado. Salvando OP.`);
            try {
                const opSalva = await window.saveOPChanges(op); // saveOPChanges já deve retornar a OP atualizada
                Object.assign(op, opSalva); // Garante que o objeto 'op' local está sincronizado com o que foi salvo

                // Em vez de limpar TODO o cache de ordens, vamos ser mais seletivos.
                // Se a OP salva mudou de status, a lista principal pode precisar ser recarregada
                // ao voltar para ela. O toggleView já força um refresh ao ir para a lista.
                // O mais importante é que o objeto 'op' atual esteja correto para a renderização das etapas.
                // Podemos invalidar o cache específico desta OP se tivéssemos cache por ID.
                // Por ora, Object.assign(op, opSalva) é o principal.
                // Se você perceber que a lista principal não atualiza o status desta OP ao voltar,
                // então limparCacheOrdens() pode ser necessário, ou uma invalidação mais granular.
                // limparCacheOrdens(); // <- Comente ou remova por enquanto para testar

                console.log(`[loadEtapasEdit] OP #${op.numero} salva e objeto local atualizado.`);
            } catch (error) {
                console.error(`[loadEtapasEdit] Erro ao salvar OP automaticamente após atualização de corte/status:`, error);
                mostrarPopupMensagem(`Erro ao atualizar OP automaticamente: ${error.message.substring(0,100)}`, 'erro');
                // Decidir se quer prosseguir com a renderização das etapas com o objeto 'op' local
                // ou mostrar um erro mais grave.
            }
        }

        // Renderização do DOM das etapas
        etapasContainer.innerHTML = ''; // Limpa o container
        const fragment = document.createDocumentFragment();

        for (let index = 0; index < op.etapas.length; index++) {
            const etapa = op.etapas[index];
            const row = document.createElement('div');
            row.className = 'etapa-row';
            row.dataset.index = index;

            const numeroSpan = document.createElement('span');
            numeroSpan.className = 'etapa-numero';
            numeroSpan.textContent = index + 1;

            const processoInput = document.createElement('input');
            processoInput.type = 'text';
            processoInput.className = 'etapa-processo';
            processoInput.value = etapa.processo;
            processoInput.readOnly = true;

            row.append(numeroSpan, processoInput);

            if (etapa.processo && etapa.processo.toLowerCase() === 'corte') {
                const corteStatusNomeContainer = document.createElement('div');
                corteStatusNomeContainer.className = 'corte-status-nome-container-mobile';

                const statusInputCorte = document.createElement('input');
                statusInputCorte.type = 'text';
                statusInputCorte.className = 'etapa-usuario-status';
                statusInputCorte.readOnly = true;

                const nomeInputCorte = document.createElement('input');
                nomeInputCorte.type = 'text';
                nomeInputCorte.className = 'etapa-usuario-nome';
                nomeInputCorte.readOnly = true;

                if (etapa.lancado) {
                    statusInputCorte.value = 'Corte Realizado';
                    nomeInputCorte.value = etapa.usuario || 'N/A'; // etapa.usuario já foi definido acima
                } else {
                    statusInputCorte.value = 'Aguardando corte';
                    // Se etapa.usuario (da OP, que reflete o cortador do corte) for null ou vazio, mostrar "A definir"
                    nomeInputCorte.value = etapa.usuario || 'A definir'; 
                }
                corteStatusNomeContainer.appendChild(statusInputCorte);
                corteStatusNomeContainer.appendChild(nomeInputCorte);
                row.appendChild(corteStatusNomeContainer);
                
                row.classList.toggle('etapa-corte-pendente-highlight', !etapa.lancado);

                if (!etapa.lancado && op.status !== 'finalizado' && op.status !== 'cancelada') {
                    const cortePendenteAssociado = todosCortes.find(c => c.op === op.numero && c.status === 'pendente');
                    const linkDiv = document.createElement('div');
                    linkDiv.className = 'etapa-corte-link-container';
                    if (cortePendenteAssociado) {
                        const link = document.createElement('a');
                        link.href = `#cortes-pendentes`;
                        link.textContent = `Ver Detalhes do Corte (PN: ${cortePendenteAssociado.pn})`;
                        link.className = 'link-corte-pendente-etapa';
                        linkDiv.appendChild(link);
                    } else {
                        linkDiv.textContent = "(Corte pendente não localizado ou já processado)";
                        linkDiv.style.fontStyle = "italic";
                        linkDiv.style.color = "#6c757d";
                    }
                    row.appendChild(linkDiv);
                }
            } else { // Para outras etapas (não-Corte)
                const tipoUsuarioEtapa = await getTipoUsuarioPorProcesso(etapa.processo, op.produto); // Passa produtos implicitamente por obterProdutosDoStorage
                const exigeQtd = tipoUsuarioEtapa === 'costureira' || tipoUsuarioEtapa === 'tiktik';

                const userSelect = document.createElement('select');
                userSelect.className = 'select-usuario';
                // A desabilitação será feita por atualizarVisualEtapas

                const defaultOptText = getUsuarioPlaceholder(tipoUsuarioEtapa);
                userSelect.add(new Option(defaultOptText, ''));
                
                // Filtrar usuários válidos para a etapa
                const usuariosFiltradosParaEtapa = usuarios.filter(u => Array.isArray(u.tipos) && u.tipos.includes(tipoUsuarioEtapa));
                usuariosFiltradosParaEtapa.forEach(u => userSelect.add(new Option(u.nome, u.nome)));
                
                if (etapa.usuario) {
                    userSelect.value = etapa.usuario;
                }
                row.appendChild(userSelect);

                if (exigeQtd) {
                    // criarQuantidadeDiv espera que op.etapas[index] seja a etapa correta.
                    // A etapa que passamos já é op.etapas[index]
                    row.appendChild(criarQuantidadeDiv(etapa, op, userSelect, false, row)); // isEtapaAtualEditavel será definido por atualizarVisualEtapas
                }
            }
            fragment.appendChild(row);
        }
        etapasContainer.appendChild(fragment);

        await atualizarVisualEtapas(op, true); // true para isFirstRender (ou forçar re-render)
        await updateFinalizarButtonState(op); // Atualiza o botão de finalizar OP

    } catch (e) {
        console.error('[loadEtapasEdit] Erro fatal ao carregar etapas:', e.message, e.stack);
        etapasContainer.innerHTML = `<p style="color:red; text-align:center; padding:10px;">Erro crítico ao carregar etapas: ${e.message.substring(0, 150)}. Tente recarregar a OP.</p>`;
        if (finalizarBtn) finalizarBtn.disabled = true;
    } finally {
        isLoadingEtapas = false;
    }
}

async function salvarProducao(op, etapa, etapaIndex) { // Removido 'produtos' como param
    if (!etapa.usuario) throw new Error(`Funcionário não selecionado para ${etapa.processo}`);
    const todosOsProdutos = await obterProdutosDoStorage(); // Busca produtos
    const produtoConfig = todosOsProdutos.find(p => p.nome === op.produto);
    if (!produtoConfig) throw new Error(`Produto ${op.produto} não encontrado.`);
    if (produtoConfig.tipos?.includes('kits')) throw new Error(`${op.produto} é kit, sem etapas.`);
    const etapaProdutoConfig = produtoConfig.etapas?.[etapaIndex];
    if (!etapaProdutoConfig || (typeof etapaProdutoConfig === 'object' ? etapaProdutoConfig.processo : etapaProdutoConfig) !== etapa.processo) throw new Error(`Etapa ${etapa.processo} inválida.`);
    const maquina = typeof etapaProdutoConfig === 'object' ? etapaProdutoConfig.maquina : null; // Ajuste para pegar máquina
    if (!maquina && (await getTipoUsuarioPorProcesso(etapa.processo, op.produto) !== 'tiktik') ) throw new Error(`Máquina não definida para ${etapa.processo}`);

    const dados = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, // ID mais único
        opNumero: op.numero, etapaIndex, processo: etapa.processo, produto: op.produto,
        variacao: op.variante || null, maquina, quantidade: parseInt(etapa.quantidade) || 0,
        funcionario: etapa.usuario, data: new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T'),
        lancadoPor: usuarioLogado?.nome || 'Sistema'
    };
    // Validações dos dados
    Object.entries(dados).forEach(([key, value]) => { if (value === undefined || value === null && !['variacao', 'maquina'].includes(key)) throw new Error(`${key} não informado.`); });
    if (dados.quantidade <= 0 && (await getTipoUsuarioPorProcesso(etapa.processo, op.produto) !== 'tiktik') ) throw new Error('Quantidade inválida.');


    const response = await fetch('/api/producoes', { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json'}, body: JSON.stringify(dados)});
    if (!response.ok) { /* ... tratamento de erro ... */
        const error = await response.json().catch(() => ({error: `HTTP ${response.status}`}));
        if (error.details === 'jwt expired') { /* ... logout ... */ throw new Error('Sessão expirada');}
        if (response.status === 403) throw new Error('Permissão negada para lançar.');
        if (response.status === 409) { mostrarPopupMensagem('Lançamento duplicado detectado.', 'aviso'); return null; }
        throw new Error(`Erro ao salvar produção: ${error.error || 'Desconhecido'}`);
    }
    const producaoSalva = await response.json();
    op.etapas[etapaIndex] = { ...etapa, usuario: dados.funcionario, quantidade: dados.quantidade, lancado: true, ultimoLancamentoId: producaoSalva.id };
    await window.saveOPChanges(op); // Usa a global
    return producaoSalva.id;
}

async function lancarEtapa(op, etapaIndex, quantidade) { // Removido 'produtos' como param
    const etapa = op.etapas[etapaIndex];
    etapa.quantidade = parseInt(quantidade);
    const novoId = await salvarProducao(op, etapa, etapaIndex); // Chama sem produtos
    if (novoId) {
        etapa.ultimoLancamentoId = novoId; etapa.lancado = true;
        await updateFinalizarButtonState(op); // Chama sem produtos
        const row = document.querySelector(`.etapa-row[data-index="${etapaIndex}"]`);
        if (row) { /* ... atualiza UI do botão Lançado ... */
            const qtdIn = row.querySelector('.quantidade-input'), btnL = row.querySelector('.botao-lancar');
            if(qtdIn) { qtdIn.disabled = true; qtdIn.style.backgroundColor = '#d3d3d3'; }
            if(btnL) { btnL.textContent = 'Lançado'; btnL.disabled = true; btnL.classList.add('lancado'); }
        }
        return true;
    } return false;
}

function debounce(func, wait) { 
  let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>func.apply(this,a),wait);
  }
}


function criarQuantidadeDiv(etapa, op, usuarioSelect, isEtapaAtualEditavel, row) { // Removi 'produtos' como param, será obtido se necessário
    let quantidadeDiv = row.querySelector('.quantidade-lancar');
    if (!quantidadeDiv) {
        quantidadeDiv = document.createElement('div');
        quantidadeDiv.className = 'quantidade-lancar';
        // Estilos como display:flex já devem estar no CSS para .quantidade-lancar
        row.appendChild(quantidadeDiv);
    } else {
        quantidadeDiv.innerHTML = ''; // Limpa se já existir para reconstruir
    }

    const quantidadeInput = document.createElement('input');
    quantidadeInput.type = 'number';
    quantidadeInput.min = '1'; // Ou '0' se quantidade zero for permitida para algum tipo de lançamento
    quantidadeInput.value = etapa.quantidade > 0 ? etapa.quantidade : ''; // Mostra vazio se for 0 ou null
    quantidadeInput.placeholder = 'Qtd';
    quantidadeInput.className = 'quantidade-input op-input'; // Adiciona classe op-input para estilo

    const lancarBtn = document.createElement('button');
    // Adiciona classes base do botão
    lancarBtn.className = 'botao-lancar op-botao'; // op-botao para estilo base de botão

    quantidadeDiv.appendChild(quantidadeInput);
    quantidadeDiv.appendChild(lancarBtn);

// ====================================================================
    // AQUI ESTÁ O PONTO IMPORTANTE PARA OBTER O ÍNDICE DA ETAPA
    // ====================================================================
    // A 'row' (que é a div da linha da etapa) foi passada como parâmetro para criarQuantidadeDiv.
    // Nós guardamos o índice original da etapa em 'row.dataset.index' lá na função 'loadEtapasEdit'.
    // Então, podemos pegar esse índice aqui:
    const etapaIndex = parseInt(row.dataset.index);

    // Se, por algum motivo MUITO estranho, o etapaIndex não for um número válido,
    // podemos tentar encontrar a 'etapa' original no array 'op.etapas' como um fallback,
    // mas isso é o que queremos evitar se o array 'op.etapas' mudar.
    // Por segurança, podemos adicionar um log se etapaIndex for NaN (Not a Number).
    if (isNaN(etapaIndex)) {
        console.error(`[criarQuantidadeDiv] ERRO GRAVE: row.dataset.index não é um número para a linha com processo (inicial): ${etapa.processo}. Isso vai causar problemas. Verifique loadEtapasEdit.`);
        // Você pode até querer retornar algo ou lançar um erro aqui se isso acontecer,
        // porque significa que a lógica fundamental de identificar a linha está quebrada.
        // Por enquanto, vamos apenas logar.
    }
    // ====================================================================
    // Agora, os handlers (handleQuantidadeInputChange, listener do select, etc.)
    // já podem usar a variável 'etapaIndex' que acabamos de definir.

    const handleQuantidadeInputChange = async () => {
        // 'etapaIndex' já está definido no escopo externo desta função.

        // Acesse a etapa correta USANDO o etapaIndex no objeto op ATUAL
        const etapaCorretaNoModelo = op.etapas[etapaIndex]; // IMPORTANTE!

        if (!etapaCorretaNoModelo) {
            console.error(`[HANDLE_QTD_INPUT] Etapa não encontrada no modelo op.etapas no índice ${etapaIndex} para OP ${op.numero}. Processo inicial era ${etapa.processo}`);
            return;
        }

        console.log(`[HANDLE_QTD_INPUT_START] Etapa Idx: ${etapaIndex}, Processo: ${etapaCorretaNoModelo.processo}, Input Value ATUAL: '${quantidadeInput.value}', etapa.quantidade ANTES: ${etapaCorretaNoModelo.quantidade}`);

        if (etapaCorretaNoModelo.lancado || op.status === 'finalizado' || op.status === 'cancelada') {
            if (quantidadeInput.disabled) {
                quantidadeInput.value = etapaCorretaNoModelo.quantidade > 0 ? etapaCorretaNoModelo.quantidade : '';
            }
            return;
        }

        const novaQuantidade = parseInt(quantidadeInput.value) || 0;

        if (novaQuantidade !== etapaCorretaNoModelo.quantidade) {
            etapaCorretaNoModelo.quantidade = novaQuantidade; // ATUALIZA O MODELO CORRETO
            console.log(`[quantidadeInput change] Quantidade da etapa "${etapaCorretaNoModelo.processo}" (índice ${etapaIndex}) atualizada em memória para: ${novaQuantidade}`);
        }

        // updateLancarBtnVisualState também precisará usar 'etapaIndex' da mesma forma
        await updateLancarBtnVisualState();
        console.log(`[HANDLE_QTD_INPUT_END] Etapa Idx: ${etapaIndex}, Input Value APÓS LÓGICA: '${quantidadeInput.value}', etapa.quantidade APÓS: ${etapaCorretaNoModelo.quantidade}`);
    };
    // A linha abaixo (o listener) deve ser a única para o evento 'input', como discutimos antes.
    quantidadeInput.addEventListener('input', handleQuantidadeInputChange);


    usuarioSelect.addEventListener('change', async () => {
        // 'etapaIndex' já está definido no escopo externo desta função.

        const etapaCorretaNoModelo = op.etapas[etapaIndex]; // IMPORTANTE!

        if (!etapaCorretaNoModelo) {
            console.error(`[USUARIO_SELECT_CHANGE] Etapa não encontrada no modelo op.etapas no índice ${etapaIndex} para OP ${op.numero}. Processo inicial era ${etapa.processo}`);
            return;
        }

        if (op.status === 'finalizado' || op.status === 'cancelada') return;

        const novoUsuario = usuarioSelect.value;

        if (etapaCorretaNoModelo.usuario !== novoUsuario) {
            etapaCorretaNoModelo.usuario = novoUsuario;
            if (!novoUsuario && (await getTipoUsuarioPorProcesso(etapaCorretaNoModelo.processo, op.produto) !== 'tiktik')) {
                etapaCorretaNoModelo.quantidade = 0;
                if (quantidadeInput) quantidadeInput.value = '';
            }
            try {
                console.log(`[usuarioSelect change] Salvando OP após mudança de usuário para etapa ${etapaIndex}: ${etapaCorretaNoModelo.processo}`);
                await window.saveOPChanges(op);
            } catch (error) {
                console.error(`[usuarioSelect change] Erro ao salvar OP após mudar usuário para etapa ${etapaIndex}:`, error);
                mostrarPopupMensagem('Erro ao salvar alteração de usuário.', 'erro');
            }
        }
        console.log(`[usuarioSelect change] Chamando atualizarVisualEtapas para OP ${op.numero} após selecionar usuário para etapa ${etapaIndex}`);
        await atualizarVisualEtapas(op);
        await updateFinalizarButtonState(op);
    });

    // Listeners de focus e blur para 'isEditingQuantidade' (MANTENHA COMO ESTAVAM NO PLANO B)
    quantidadeInput.addEventListener('focus', () => {
        isEditingQuantidade = true;
        console.log(`[QTD FOCUS] Etapa Idx: ${etapaIndex}, Processo: ${op.etapas[etapaIndex]?.processo || 'N/A'}. isEditingQuantidade = true`);
    });

    quantidadeInput.addEventListener('blur', () => {
        isEditingQuantidade = false;
        console.log(`[QTD BLUR] Etapa Idx: ${etapaIndex}, Processo: ${op.etapas[etapaIndex]?.processo || 'N/A'}. isEditingQuantidade = false`);
        // Opcional: handleQuantidadeInputChange(); // Se quiser garantir processamento no blur
    });


    // updateLancarBtnVisualState precisa ser definida aqui dentro para capturar o 'etapaIndex' corretamente
    const updateLancarBtnVisualState = async () => {
        // 'etapaIndex' já está definido no escopo de criarQuantidadeDiv

        const etapaAtualNoModelo = op.etapas[etapaIndex];
        if (!etapaAtualNoModelo) {
            console.warn(`[updateLancarBtnVisualState] Etapa não encontrada no índice ${etapaIndex} para OP ${op.numero}`);
            lancarBtn.disabled = true;
            return;
        }

        const etapaAtualGlobalIndex = await determinarEtapaAtual(op);
        const isEstaLinhaAtiva = etapaIndex === etapaAtualGlobalIndex;
        const podeLancarPermissao = permissoes.includes('lancar-producao');
        const isLancado = etapaAtualNoModelo.lancado;
        const temUsuarioNestaLinha = usuarioSelect.value;

        // Validação de quantidade: baseada no input atual E na OP e etapa do modelo
        const quantidadeAtualNoInput = parseInt(quantidadeInput.value) || 0;
        let temQuantidadeValida = false;
        const tipoUser = await getTipoUsuarioPorProcesso(etapaAtualNoModelo.processo, op.produto);
        const exigeQtd = tipoUser === 'costureira' || tipoUser === 'tiktik';

        if (exigeQtd) {
            // Para costureira/tiktik, a quantidade do input deve ser > 0
            // e talvez não exceder op.quantidade (ou a quantidade restante para aquela etapa, se você tiver essa lógica)
            temQuantidadeValida = quantidadeAtualNoInput > 0 && quantidadeAtualNoInput <= op.quantidade; // Exemplo simples
        } else {
            // Para outros tipos que não exigem quantidade, podemos considerar como válido se não for exigido
            temQuantidadeValida = true;
        }


        const isDisabledGeral = op.status === 'finalizado' || op.status === 'cancelada';
        const desabilitarInputQtd = isDisabledGeral || isLancado ||
                                  (!isEstaLinhaAtiva && !isLancado) ||
                                  !temUsuarioNestaLinha;

        quantidadeInput.disabled = desabilitarInputQtd;

        lancarBtn.disabled = !podeLancarPermissao ||
                             isLancado ||
                             !isEstaLinhaAtiva ||
                             !temUsuarioNestaLinha ||
                             (exigeQtd && !temQuantidadeValida) || // Só valida quantidade se for exigida
                             isDisabledGeral;

        lancarBtn.textContent = isLancado ? 'Lançado' : 'Lançar';
        lancarBtn.dataset.etapaIndex = etapaIndex.toString(); // Garante que o botão também tenha o índice correto

        lancarBtn.classList.toggle('lancado', isLancado);
        lancarBtn.classList.toggle('disabled-not-launched', lancarBtn.disabled && !isLancado);

        if (desabilitarInputQtd && !isLancado) {
            quantidadeInput.style.backgroundColor = '#f8f9fa';
        } else if (isLancado) {
            quantidadeInput.style.backgroundColor = '#e9ecef';
        } else {
            quantidadeInput.style.backgroundColor = '';
        }
    };


    // O lancarBtnClickHandler também deve estar aqui dentro ou receber etapaIndex
    // Se ele já pega do dataset do botão, está OK, mas vamos garantir que
    // qualquer referência a 'etapa' dentro dele seja substituída por 'op.etapas[indiceDoBotao]'
    const lancarBtnClickHandler = async () => { /* ... seu código ... mas lembre-se:
        const etapaIndexDoBotao = parseInt(lancarBtn.dataset.etapaIndex);
        const etapaAlvo = opLocalParaLancamento.etapas[etapaIndexDoBotao];
        // use etapaAlvo em vez de 'etapa' (do closure antigo)
        // ...
        */
       // Vou colar uma versão mais segura do lancarBtnClickHandler aqui:
        if (lancarBtn.disabled || lancamentosEmAndamento.has(op.edit_id + '-' + op.etapas[etapaIndex]?.processo)) return;
        lancamentosEmAndamento.add(op.edit_id + '-' + op.etapas[etapaIndex]?.processo);

        const originalBtnHTML = lancarBtn.innerHTML;
        lancarBtn.disabled = true;
        lancarBtn.innerHTML = '<div class="spinner-btn-interno"></div> Processando...';

        // O etapaIndex do botão é o mesmo etapaIndex do escopo de criarQuantidadeDiv
        const indiceDaEtapaParaLancar = etapaIndex;
        const editId = window.location.hash.split('/')[1];
        let opLocalParaLancamento;

        try {
            limparCacheOrdens();
            const ordensData = await obterOrdensDeProducao(1, true, true, null, true);
            opLocalParaLancamento = ordensData.rows.find(o => o.edit_id === editId);

            if (!opLocalParaLancamento || !opLocalParaLancamento.etapas || !opLocalParaLancamento.etapas[indiceDaEtapaParaLancar]) {
                throw new Error('Ordem de Produção ou etapa não encontrada para lançamento no índice: ' + indiceDaEtapaParaLancar);
            }

            // Pega a referência correta da etapa NO MOMENTO do clique, do objeto OP mais recente
            const etapaDoModeloAtual = opLocalParaLancamento.etapas[indiceDaEtapaParaLancar];
            // ATUALIZA A QUANTIDADE NA ETAPA DO MODELO com o valor do input ANTES de lançar
            etapaDoModeloAtual.quantidade = parseInt(quantidadeInput.value);

            const produtosAtuais = await obterProdutosDoStorage();
            const etapasFuturas = await getEtapasFuturasValidas(opLocalParaLancamento, indiceDaEtapaParaLancar); // Passei produtosAtuais implicitamente
            let sucessoNoLancamento = false;

            if (etapasFuturas.length > 0) {
                sucessoNoLancamento = await mostrarPopupEtapasFuturas(opLocalParaLancamento, indiceDaEtapaParaLancar, etapasFuturas, quantidadeInput.value);
            } else {
                sucessoNoLancamento = await lancarEtapa(opLocalParaLancamento, indiceDaEtapaParaLancar, quantidadeInput.value);
            }

            if (sucessoNoLancamento) {
                Object.assign(op, opLocalParaLancamento); // Atualiza o 'op' principal da tela de edição

                const etapaProcessada = op.etapas[indiceDaEtapaParaLancar];
                if (etapaProcessada && etapaProcessada.lancado) {
                    quantidadeInput.value = etapaProcessada.quantidade;
                }
                mostrarPopupMensagem('Produção(ões) lançada(s) com sucesso!', 'sucesso');
            } else {
                console.log("[lancarBtnClickHandler] Lançamento não foi bem-sucedido ou foi cancelado.");
            }
        } catch (error) {
            console.error('[lancarBtnClickHandler] Erro ao lançar etapa com índice ' + indiceDaEtapaParaLancar + ':', error);
            mostrarPopupMensagem(`Erro ao lançar produção: ${error.message.substring(0,150)}`, 'erro');
        } finally {
            lancamentosEmAndamento.delete(op.edit_id + '-' + op.etapas[etapaIndex]?.processo);
            await updateLancarBtnVisualState();
            await atualizarVisualEtapas(op, true);
            await updateFinalizarButtonState(op);
        }
    };
    lancarBtn.removeEventListener('click', lancarBtnClickHandler); // Evita duplicação
    lancarBtn.addEventListener('click', lancarBtnClickHandler);


    // Chama a atualização visual inicial para o botão
    updateLancarBtnVisualState();

    return quantidadeDiv;
}

async function getEtapasFuturasValidas(op, etapaIndex) { // Removido 'produtos' como param
    const todosOsProdutos = await obterProdutosDoStorage();
    const produtoConfig = todosOsProdutos.find(p => p.nome === op.produto);
    const etapasProduto = produtoConfig?.etapas || [];
    if (etapaIndex >= etapasProduto.length || etapaIndex >= op.etapas.length) return [];
    const etapaAtualConfig = etapasProduto[etapaIndex];
    const maquinaAtual = (typeof etapaAtualConfig === 'object' ? etapaAtualConfig.maquina : null) || 'Não Usa';
    const tipoUsuarioAtual = await getTipoUsuarioPorProcesso( (typeof etapaAtualConfig === 'object' ? etapaAtualConfig.processo : etapaAtualConfig) , op.produto);
    const futuras = [];
    for (let i = etapaIndex + 1; i < op.etapas.length; i++) {
        const proximaEtapaConfig = etapasProduto[i]; if (!proximaEtapaConfig) break;
        const tipoProx = await getTipoUsuarioPorProcesso((typeof proximaEtapaConfig === 'object' ? proximaEtapaConfig.processo : proximaEtapaConfig), op.produto);
        const maqProx = (typeof proximaEtapaConfig === 'object' ? proximaEtapaConfig.maquina : null) || 'Não Usa';
        if (tipoProx !== 'costureira' || maqProx !== maquinaAtual) break; // Só continua se for costureira e mesma máquina
        if (op.etapas[i].lancado) break; // Para se a próxima já estiver lançada
        futuras.push({ index: i, processo: (typeof proximaEtapaConfig === 'object' ? proximaEtapaConfig.processo : proximaEtapaConfig) });
    } return futuras;
}

function mostrarPopupEtapasFuturas(op, etapaIndexAtual, etapasFuturasParaLancar, quantidadeAtual) {
    return new Promise(async (resolve) => { // Envolve em uma Promise
        const popup = document.createElement('div');
        popup.className = 'popup-etapas'; // Use sua classe CSS para estilização
        // Estilos básicos inline (melhor mover para CSS)
        popup.style.position = 'fixed';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.backgroundColor = '#fff';
        popup.style.padding = '25px';
        popup.style.border = '1px solid #ccc';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
        popup.style.zIndex = '1002'; // Acima de outros popups talvez
        popup.style.maxWidth = '450px';
        popup.style.width = '90%';

        const title = document.createElement('h3');
        title.textContent = 'Lançar Etapas em Sequência?';
        title.style.marginBottom = '15px';
        title.style.textAlign = 'center';
        popup.appendChild(title);

        const introText = document.createElement('p');
        introText.innerHTML = `Você está lançando <strong>${op.etapas[etapaIndexAtual].processo}</strong> (Qtd: ${quantidadeAtual}).<br>Deseja lançar também as seguintes etapas em sequência com a mesma quantidade e funcionário?`;
        introText.style.marginBottom = '15px';
        popup.appendChild(introText);

        const checkboxContainer = document.createElement('div');
        checkboxContainer.style.maxHeight = '200px';
        checkboxContainer.style.overflowY = 'auto';
        checkboxContainer.style.marginBottom = '20px';
        checkboxContainer.style.border = '1px solid #eee';
        checkboxContainer.style.padding = '10px';

        const checkboxesInfo = etapasFuturasParaLancar.map((etapaInfo) => {
            const div = document.createElement('div');
            div.style.marginBottom = '8px';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `chk-futura-${etapaInfo.index}`;
            checkbox.dataset.etapaIndex = etapaInfo.index; // Guarda o índice da etapa original da OP
            checkbox.checked = true; // Por padrão, todas selecionadas
            checkbox.style.marginRight = '8px';

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = `${etapaInfo.processo} (Etapa ${etapaInfo.index + 1})`;
            
            div.appendChild(checkbox);
            div.appendChild(label);
            checkboxContainer.appendChild(div);
            return { checkboxElement: checkbox, etapaOriginalIndex: etapaInfo.index };
        });
        popup.appendChild(checkboxContainer);

        const errorMsgElement = document.createElement('p');
        errorMsgElement.style.color = 'red';
        errorMsgElement.style.fontSize = '0.9em';
        errorMsgElement.style.display = 'none';
        errorMsgElement.style.marginTop = '10px';
        popup.appendChild(errorMsgElement);

        // Botões
        const buttonContainer = document.createElement('div');
        buttonContainer.style.textAlign = 'center';
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.justifyContent = 'center';


        const btnLancarSelecionadas = document.createElement('button');
        btnLancarSelecionadas.textContent = 'Lançar Selecionadas';
        btnLancarSelecionadas.className = 'ppp-botao ppp-botao-salvar'; // Reutilize suas classes de botão

        const btnLancarApenasAtual = document.createElement('button');
        btnLancarApenasAtual.textContent = 'Lançar Só Esta';
        btnLancarApenasAtual.className = 'ppp-botao btn-secondary'; // Classe para botão secundário

        const btnCancelarTudo = document.createElement('button');
        btnCancelarTudo.textContent = 'Cancelar Tudo';
        btnCancelarTudo.className = 'ppp-botao ppp-botao-excluir'; // Reutilize suas classes de botão

        buttonContainer.append(btnLancarSelecionadas, btnLancarApenasAtual, btnCancelarTudo);
        popup.appendChild(buttonContainer);

        // Função para fechar o popup e resolver a Promise
        const closePopupAndResolve = (value) => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup);
            }
            resolve(value); // Resolve a Promise com true (lançamento ocorreu) ou false (não ocorreu)
        };
        
        // Lógica de validação dos checkboxes (para garantir sequência)
        const validateSequence = () => {
            errorMsgElement.style.display = 'none';
            errorMsgElement.textContent = '';
            btnLancarSelecionadas.disabled = false;

            const selectedIndices = checkboxesInfo
                .filter(info => info.checkboxElement.checked)
                .map(info => info.etapaOriginalIndex)
                .sort((a, b) => a - b); // Ordena para checar sequência

            if (selectedIndices.length === 0) return true; // Válido se nenhuma futura for selecionada (só a atual será lançada)

            // A primeira etapa futura selecionada DEVE ser a etapa logo após a atual
            const expectedFirstFutureIndex = etapaIndexAtual + 1;
            if (selectedIndices[0] !== expectedFirstFutureIndex) {
                errorMsgElement.textContent = 'Para lançar em lote, a primeira etapa futura selecionada deve ser a subsequente à atual.';
                errorMsgElement.style.display = 'block';
                btnLancarSelecionadas.disabled = true;
                return false;
            }

            // Verifica se as etapas selecionadas são sequenciais
            for (let i = 0; i < selectedIndices.length - 1; i++) {
                if (selectedIndices[i+1] !== selectedIndices[i] + 1) {
                    errorMsgElement.textContent = 'As etapas futuras selecionadas devem ser sequenciais (sem pulos).';
                    errorMsgElement.style.display = 'block';
                    btnLancarSelecionadas.disabled = true;
                    return false;
                }
            }
            return true;
        };

        checkboxesInfo.forEach(info => info.checkboxElement.addEventListener('change', validateSequence));
        validateSequence(); // Valida inicialmente


        // Event Listeners dos Botões do Popup
        btnLancarSelecionadas.addEventListener('click', async () => {
            if (!validateSequence()) return;

            btnLancarSelecionadas.disabled = true;
            btnLancarApenasAtual.disabled = true;
            btnCancelarTudo.disabled = true;
            btnLancarSelecionadas.innerHTML = '<div class="spinner-btn-interno"></div> Lançando...';

            let sucessoGeral = false;
            try {
                // 1. Lançar a etapa atual
                console.log(`[PopupEtapas] Lançando etapa atual: ${op.etapas[etapaIndexAtual].processo}`);
                const sucessoAtual = await lancarEtapa(op, etapaIndexAtual, quantidadeAtual);
                if (!sucessoAtual) {
                    throw new Error(`Falha ao lançar a etapa atual (${op.etapas[etapaIndexAtual].processo}).`);
                }
                
                // Pega o funcionário da etapa atual que acabou de ser lançada
                const funcionarioEtapaAtual = op.etapas[etapaIndexAtual].usuario;
                if (!funcionarioEtapaAtual) {
                     throw new Error('Funcionário da etapa atual não definido após lançamento. Não é possível prosseguir com etapas futuras.');
                }

                // 2. Lançar as etapas futuras selecionadas
                const indicesFuturosSelecionados = checkboxesInfo
                    .filter(info => info.checkboxElement.checked)
                    .map(info => info.etapaOriginalIndex);

                for (const idxFuturo of indicesFuturosSelecionados) {
                    if (op.etapas[idxFuturo] && !op.etapas[idxFuturo].lancado) {
                        console.log(`[PopupEtapas] Lançando etapa futura: ${op.etapas[idxFuturo].processo}`);
                        op.etapas[idxFuturo].usuario = funcionarioEtapaAtual; // Propaga o funcionário
                        const sucessoFuturo = await lancarEtapa(op, idxFuturo, quantidadeAtual);
                        if (!sucessoFuturo) {
                            // Decide se para ou continua. Por ora, vamos parar no primeiro erro.
                            throw new Error(`Falha ao lançar a etapa futura (${op.etapas[idxFuturo].processo}).`);
                        }
                    }
                }
                sucessoGeral = true; // Se chegou aqui, todos os lançamentos (tentados) foram ok
            } catch (error) {
                console.error('[PopupEtapas] Erro ao lançar etapas em lote:', error);
                mostrarPopupMensagem(`Erro: ${error.message.substring(0,150)}`, 'erro');
                sucessoGeral = false; 
            } finally {
                closePopupAndResolve(sucessoGeral); // Resolve com true se tudo OK, false se houve falha
            }
        });

        btnLancarApenasAtual.addEventListener('click', async () => {
            btnLancarSelecionadas.disabled = true;
            btnLancarApenasAtual.disabled = true;
            btnCancelarTudo.disabled = true;
            btnLancarApenasAtual.innerHTML = '<div class="spinner-btn-interno"></div> Lançando...';
            let sucesso = false;
            try {
                console.log(`[PopupEtapas] Lançando APENAS etapa atual: ${op.etapas[etapaIndexAtual].processo}`);
                sucesso = await lancarEtapa(op, etapaIndexAtual, quantidadeAtual);
                if (!sucesso) {
                     mostrarPopupMensagem(`Falha ao lançar a etapa atual (${op.etapas[etapaIndexAtual].processo}).`, 'erro');
                }
            } catch (error) {
                console.error('[PopupEtapas] Erro ao lançar apenas etapa atual:', error);
                mostrarPopupMensagem(`Erro: ${error.message.substring(0,150)}`, 'erro');
                sucesso = false;
            } finally {
                closePopupAndResolve(sucesso);
            }
        });

        btnCancelarTudo.addEventListener('click', () => {
            console.log('[PopupEtapas] Lançamento cancelado pelo usuário.');
            closePopupAndResolve(false); // Nenhum lançamento ocorreu
        });

        document.body.appendChild(popup);
    });
}


async function determinarEtapaAtual(op) {
    if (!op || !op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) { // Adicionado check de array e length
        console.warn('[determinarEtapaAtual] OP inválida ou sem etapas, retornando 0.');
        return 0; 
    }
    for (let i = 0; i < op.etapas.length; i++) {
        const etapa = op.etapas[i];
        if (!etapa) { // Adicionar verificação para etapa indefinida
            console.warn(`[determinarEtapaAtual] Etapa no índice ${i} é indefinida.`, op.etapas);
            continue; // Pula para a próxima etapa
        }
        // Sua lógica atual para verificar se a etapa está completa:
        // A etapa de corte é especial. Se for corte e não estiver lançada, é a atual.
        if (etapa.processo?.toLowerCase() === 'corte' && !etapa.lancado) {
            return i;
        }
        // Para outras etapas, precisa de usuário E (quantidade se exigido) E não estar lançada
        const tipoUser = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
        const exigeQtd = tipoUser === 'costureira' || tipoUser === 'tiktik';

        // Se a etapa não está lançada, ela é a candidata a ser a atual.
        if (!etapa.lancado) {
            return i;
        }
        // Se está lançada, mas exige quantidade e a quantidade é zero/inválida,
        // isso é um estado inconsistente que não deveria acontecer se o lançamento foi feito corretamente.
        // Mas se acontecer, tecnicamente essa etapa não está "completa" para prosseguir.
        // No entanto, a lógica de "lançado" deveria ser a principal.
        // Se está 'lancado:true', assumimos que foi validada no momento do lançamento.
    }
    // Se todas as etapas estão 'lancado:true'
    console.log(`[determinarEtapaAtual] Todas as ${op.etapas.length} etapas parecem completas.`);
    return op.etapas.length; // Todas completas, retorna índice fora do array
}

async function atualizarVisualEtapas(op, isFirstRender = false) {
    // Linha removida: if (isEditingQuantidade) { /* ... */ return; } 
    
    // Adicionando o log que pedi antes (se ainda não estiver lá)
    console.log(`[ATUALIZAR_VISUAL_START] Chamada para OP ${op.numero}. isFirstRender: ${isFirstRender}. Etapa atual determinada: ${await determinarEtapaAtual(op)}`);

    const etapasRows = document.querySelectorAll('#opEditView .etapa-row');
    const etapaAtualIndex = await determinarEtapaAtual(op);

    if (!op || !Array.isArray(op.etapas)) { // Adicionado verificação para op.etapas
        console.error('[atualizarVisualEtapas] Objeto OP inválido ou op.etapas não é um array.', op);
        if (etapasContainer) etapasContainer.innerHTML = "<p style='color:red'>Erro ao carregar dados das etapas.</p>";
        return;
    }
    
    if (!isFirstRender && etapasRows.length !== op.etapas.length) {
        console.warn('[atualizarVisualEtapas] Inconsistência DOM vs Dados. Recarregando etapas da OP via loadEtapasEdit.');
        await loadEtapasEdit(op, true); 
        return;
    }
    
    for (let i = 0; i < etapasRows.length; i++) {
        const row = etapasRows[i];
        const etapa = op.etapas[i]; // Pega a etapa do objeto OP atualizado
        
        if (!etapa) {
            console.warn(`[atualizarVisualEtapas] Etapa indefinida no índice ${i} para OP ${op.numero}`);
            continue; // Pula esta iteração se a etapa não existir por algum motivo
        }

        const numeroSpan = row.querySelector('.etapa-numero');
        const userSelect = row.querySelector('.select-usuario');
        const quantidadeDiv = row.querySelector('.quantidade-lancar');
        const quantidadeInput = quantidadeDiv ? quantidadeDiv.querySelector('.quantidade-input') : null;
        const botaoLancar = quantidadeDiv ? quantidadeDiv.querySelector('.botao-lancar') : null;

        const tipoUser = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
        const exigeQtd = tipoUser === 'costureira' || tipoUser === 'tiktik';
        const concluida = etapa.lancado && (!exigeQtd || (etapa.quantidade && etapa.quantidade > 0));

        row.classList.remove('etapa-row-atual', 'etapa-row-concluida', 'etapa-row-pendente');
        if (numeroSpan) numeroSpan.className = 'etapa-numero'; 

        if (concluida) {
            if (numeroSpan) numeroSpan.classList.add('etapa-azul');
            row.classList.add('etapa-row-concluida');
        } else if (i === etapaAtualIndex && op.status !== 'finalizado' && op.status !== 'cancelada') {
            if (numeroSpan) numeroSpan.classList.add('etapa-verde');
            row.classList.add('etapa-row-atual');
        } else {
            if (numeroSpan) numeroSpan.classList.add('etapa-cinza');
            row.classList.add('etapa-row-pendente');
        }

        const isDisabledGeral = op.status === 'finalizado' || op.status === 'cancelada';
        const isEtapaEditavelNestaLinha = !isDisabledGeral && i === etapaAtualIndex && !concluida;

        if (userSelect) {
            userSelect.disabled = isDisabledGeral || concluida || i !== etapaAtualIndex;
        }
        
        // ---> ADICIONE/MODIFIQUE ESTE BLOCO PARA O quantidadeInput <---
        if (quantidadeInput) {
            // SE a bandeirinha está levantada E o campo de quantidade ATUAL (deste loop) é o que está com o foco,
            // ENTÃO NÃO mexa no valor do campo. Deixe o usuário digitar.
            if (isEditingQuantidade && document.activeElement === quantidadeInput) {
                console.log(`[ATUALIZAR_VISUAL_LOOP] Input ${etapa.processo} (idx ${i}) está com foco e sendo editado. NÃO VOU MUDAR O VALOR.`);
                // Mesmo que não mude o valor, ainda precisamos verificar se o input deve ser desabilitado
                // ou se o botão de lançar deve mudar.
                const isDisabledGeral = op.status === 'finalizado' || op.status === 'cancelada';
                const isEtapaEditavelNestaLinha = !isDisabledGeral && i === etapaAtualIndex && !concluida;

                // A lógica de desabilitar o input pode continuar, pois não mexe no valor
                quantidadeInput.disabled = isDisabledGeral || concluida || !isEtapaEditavelNestaLinha || !userSelect?.value;
                if (concluida || (isDisabledGeral && !isEtapaEditavelNestaLinha)) {
                    quantidadeInput.style.backgroundColor = '#e9ecef';
                } else {
                    quantidadeInput.style.backgroundColor = '';
                }

            } else {
                // SE NÃO, pode atualizar o valor do campo normalmente, pois o usuário não está digitando NELE.
                console.log(`[ATUALIZAR_VISUAL_LOOP] Input ${etapa.processo} (idx ${i}). Definindo input.value para '${etapa.quantidade > 0 ? etapa.quantidade : ''}' (isEditing: ${isEditingQuantidade}, activeElement é este input? ${document.activeElement === quantidadeInput})`);
                quantidadeInput.value = etapa.quantidade > 0 ? etapa.quantidade : '';

                // Lógica normal de desabilitar e estilizar
                const isDisabledGeral = op.status === 'finalizado' || op.status === 'cancelada';
                const isEtapaEditavelNestaLinha = !isDisabledGeral && i === etapaAtualIndex && !concluida;
                quantidadeInput.disabled = isDisabledGeral || concluida || !isEtapaEditavelNestaLinha || !userSelect?.value;
                if (concluida || (isDisabledGeral && !isEtapaEditavelNestaLinha)) {
                    quantidadeInput.style.backgroundColor = '#e9ecef';
                } else {
                    quantidadeInput.style.backgroundColor = '';
                }
            }
        }
        // ---> FIM DO BLOCO MODIFICADO <---

        if (botaoLancar) {
            const temQtdValidaNoInput = quantidadeInput && quantidadeInput.value && parseInt(quantidadeInput.value) > 0;
            botaoLancar.disabled = isDisabledGeral || concluida || !isEtapaEditavelNestaLinha || !permissoes.includes('lancar-producao') || !userSelect?.value || !temQtdValidaNoInput;
            botaoLancar.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
            botaoLancar.classList.toggle('lancado', etapa.lancado);
            botaoLancar.classList.toggle('disabled-not-launched', botaoLancar.disabled && !etapa.lancado);
        }
    }
    await updateFinalizarButtonState(op);
}

async function updateFinalizarButtonState(op) { // op é o objeto da ordem de produção atual
    const finalizarBtn = document.getElementById('finalizarOP');
    if (!finalizarBtn || !op) {
        if(finalizarBtn) finalizarBtn.disabled = true; // Desabilita se não houver OP
        return;
    }

    // Remove classes de estilo anteriores para resetar
    finalizarBtn.classList.remove('op-finalizada-btn-estilo', 'op-botao-sucesso', 'op-botao-pronta'); // Adicione outras classes se usar

    if (op.status === 'finalizado') {
        finalizarBtn.textContent = 'OP Finalizada!';
        finalizarBtn.disabled = true;
        finalizarBtn.classList.add('op-finalizada-btn-estilo'); // Classe para estilo de "já finalizada"
    } else if (op.status === 'cancelada') {
        finalizarBtn.textContent = 'OP Cancelada';
        finalizarBtn.disabled = true;
        finalizarBtn.classList.add('op-finalizada-btn-estilo'); // Pode usar o mesmo estilo ou um específico para cancelada
    } else {
        // Verifica se pode finalizar (lógica que você já tem)
        const produtos = await obterProdutosDoStorage();
        const camposPrincipaisPreenchidos = op.produto && (op.quantidade || 0) > 0 && op.data_entrega;
        let todasEtapasCompletas = false;
        if (op.etapas?.length > 0) {
            todasEtapasCompletas = (await Promise.all(op.etapas.map(async e => {
                const tipoUser = await getTipoUsuarioPorProcesso(e.processo, op.produto); // Passa produtos
                const exigeQtd = tipoUser === 'costureira' || tipoUser === 'tiktik';
                return e.lancado && (!exigeQtd || (e.quantidade || 0) > 0);
            }))).every(Boolean);
        }

        const podeFinalizar = camposPrincipaisPreenchidos && todasEtapasCompletas;
        
        if (podeFinalizar) {
            finalizarBtn.textContent = 'Finalizar OP';
            finalizarBtn.disabled = false;
            finalizarBtn.classList.add('op-botao-sucesso'); // Classe para botão verde de "pode finalizar"
        } else {
            finalizarBtn.textContent = 'Finalizar OP'; // Ou "Pendente" ou algo que indique por que não pode finalizar
            finalizarBtn.disabled = true;
            // Adicionar uma classe para botão desabilitado que não é finalizado/cancelado
            // finalizarBtn.classList.add('op-botao-desabilitado-padrao');
        }
    }
    console.log(`[updateFinalizarButtonState] Botão Finalizar: Texto='${finalizarBtn.textContent}', Disabled=${finalizarBtn.disabled}`);
}

async function verificarEtapasEStatus(op) { // Removido 'produtos'
    if (!op.etapas || !Array.isArray(op.etapas)) {
        if (op.status !== 'em-aberto') { op.status = 'em-aberto'; await window.saveOPChanges(op); }
        return false;
    }
    const todosOsProdutos = await obterProdutosDoStorage(); // Busca aqui

    const todasCompletas = (await Promise.all(op.etapas.map(async e => {
        const tipoUser = await getTipoUsuarioPorProcesso(e.processo, op.produto);
        const exigeQtd = tipoUser === 'costureira' || tipoUser === 'tiktik';
        return e.lancado && (!exigeQtd || (e.quantidade || 0) > 0);
    }))).every(Boolean);

    if (op.status === 'finalizado' && !todasCompletas) {
        op.status = 'produzindo'; await window.saveOPChanges(op);
        mostrarPopupMensagem(`OP #${op.numero} voltou para 'Produzindo' (etapa incompleta).`, 'aviso');
    } else if (op.status !== 'finalizado' && op.status !== 'cancelada') {
        const novoStatus = todasCompletas ? 'pronta-finalizar' : (op.etapas.some(e=>e.lancado) ? 'produzindo' : 'em-aberto');
        // Adicionei um status 'pronta-finalizar' hipotético se todas etapas OK mas OP não finalizada manualmente.
        // Se não usar, pode ser: todasCompletas ? (op.status === 'produzindo' ? 'produzindo' : 'em-aberto') : ...
        if (op.status !== novoStatus && novoStatus !== 'pronta-finalizar') { // Não muda para 'pronta-finalizar' automaticamente
             op.status = novoStatus;
             await window.saveOPChanges(op);
        }
    }
    return todasCompletas;
}


// --- FUNÇÕES ESPECÍFICAS PARA A TELA DE CORTE P/ ESTOQUE (#corteView) ---
// , , , setCurrentDateForCorte
// (Já fornecidas e adaptadas para usar obterProdutosDoStorage)


// Em admin-ordens-de-producao.js
async function loadProdutosCorte() {
    const produtoSelect = document.getElementById('produtoCorte');
    if (!produtoSelect) {
        console.warn('[loadProdutosCorte] Elemento #produtoCorte não encontrado.');
        return;
    }

    produtoSelect.disabled = true;
    produtoSelect.innerHTML = '<option value="">Carregando produtos...</option>';
    try {
        // >>> USA A FUNÇÃO IMPORTADA DO STORAGE.JS <<<
        const produtos = await obterProdutosDoStorage(); 
        
        produtoSelect.innerHTML = '<option value="">Selecione um produto</option>';
        if (produtos && produtos.length > 0) {
            const produtosFiltrados = produtos.filter(produto => 
                CONST_PRODUTOS.includes(produto.nome) && !CONST_PRODUTOSKITS.includes(produto.nome)
            );
            produtosFiltrados.forEach(produto => {
                const option = new Option(produto.nome, produto.nome);
                produtoSelect.appendChild(option);
            });
        } else {
            console.warn('[loadProdutosCorte] Nenhum produto retornado por obterProdutosDoStorage.');
            produtoSelect.innerHTML = '<option value="">Nenhum produto encontrado</option>';
        }
        produtoSelect.disabled = false;
    } catch (error) {
        console.error('[loadProdutosCorte] Erro ao carregar produtos:', error);
        mostrarPopupMensagem(`Erro ao carregar produtos para corte: ${error.message.substring(0,100)}`, 'erro');
        produtoSelect.innerHTML = '<option value="">Erro ao carregar</option>';
        produtoSelect.disabled = false;
    }
}

// Em admin-ordens-de-producao.js
async function loadVariantesCorte(produtoNome) {
    const variantesContainer = document.getElementById('variantesCorteContainer');
    const variantesSelects = document.querySelector('#corteView .variantes-selects-corte'); // Específico para #corteView
    
    if (!variantesContainer || !variantesSelects) {
        console.warn('[loadVariantesCorte] Elementos DOM para variantes de corte não encontrados.');
        return;
    }

    variantesSelects.innerHTML = ''; 
    variantesContainer.style.display = 'none';

    if (!produtoNome) {
        console.log('[loadVariantesCorte] Nenhum produto selecionado para carregar variantes.');
        return;
    }

    try {
        // >>> USA A FUNÇÃO IMPORTADA DO STORAGE.JS <<<
        const todosOsProdutos = await obterProdutosDoStorage(); 
        const produto = todosOsProdutos.find(p => p.nome === produtoNome);

        if (!produto) {
            console.warn(`[loadVariantesCorte] Produto "${produtoNome}" não encontrado.`);
            return;
        }

        let variantesDisponiveis = [];
        if (produto.variantes && produto.variantes.length > 0) {
            variantesDisponiveis = produto.variantes.map(v => v.valores.split(',')).flat().map(v => v.trim()).filter(Boolean);
        } else if (produto.grade && produto.grade.length > 0) {
            variantesDisponiveis = [...new Set(produto.grade.map(g => g.variacao))].filter(Boolean);
        }

        if (variantesDisponiveis.length > 0) {
            const select = document.createElement('select');
            select.className = 'op-select op-input-variante-corteform'; // Use sua classe de estilo
            select.innerHTML = '<option value="">Selecione uma variação</option>';
            variantesDisponiveis.forEach(variante => {
                select.add(new Option(variante, variante));
            });
            variantesSelects.appendChild(select);
            variantesContainer.style.display = 'block';
        } else {
            console.log(`[loadVariantesCorte] Nenhuma variação disponível para "${produtoNome}".`);
        }
    } catch (error) {
        console.error(`[loadVariantesCorte] Erro ao carregar variantes para ${produtoNome}:`, error);
        mostrarPopupMensagem(`Erro ao carregar variações: ${error.message.substring(0,100)}`, 'erro');
    }
}

function limparFormularioCorte() {
    const produtoCorte = document.getElementById('produtoCorte');
    const quantidadeCorte = document.getElementById('quantidadeCorte');
    // const dataCorte = document.getElementById('dataCorte'); // Será definido por setCurrentDateForCorte
    const cortadorCorte = document.getElementById('cortadorCorte');
    const variantesContainer = document.getElementById('variantesCorteContainer');
    const variantesSelects = document.querySelector('#corteView .variantes-selects-corte');
    // const pnInput = document.getElementById('pnCorteEstoque'); // Se adicionar PN manual

    if (produtoCorte) produtoCorte.value = '';
    if (quantidadeCorte) quantidadeCorte.value = '';
    // if (pnInput) pnInput.value = ''; // Se adicionar PN manual

    if (cortadorCorte && usuarioLogado) { // Garante que usuarioLogado existe
        cortadorCorte.value = usuarioLogado.nome;
    } else if (cortadorCorte) {
        cortadorCorte.value = 'Usuário Desconhecido';
    }
    
    if (variantesContainer && variantesSelects) {
        variantesSelects.innerHTML = '';
        variantesContainer.style.display = 'none';
    }
    setCurrentDateForCorte(); // Define a data atual ao limpar/abrir
}

// Função movida para o escopo global
function setCurrentDateForCorte() {
  const dataCorte = document.getElementById('dataCorte');
  if (dataCorte) {
    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    dataCorte.value = hoje;
  }
}


function aplicarCorAoFiltroAtivo() {
    const statusFilter = document.getElementById('statusFilter'); 
    if (!statusFilter) {
        return;
    }

    // >>> E AQUI <<<
    const todosBotoes = statusFilter.querySelectorAll('.op-botao-filtro');
    let botaoAtivo = null;

    todosBotoes.forEach(btn => {
        btn.style.backgroundColor = ''; 
        btn.style.color = '';           
        btn.style.borderColor = '';     
        if (btn.classList.contains('active')) {
            botaoAtivo = btn;
        }
    });

    if (botaoAtivo) {
        const status = botaoAtivo.dataset.status;
        let corDeFundoVariavelCSS;
        let corDoTextoVariavelCSS = 'var(--op-cor-texto-botao-ativo)';


        switch (status) {
            case 'em-aberto':
                corDeFundoVariavelCSS = 'var(--op-cor-status-em-aberto)';
                break;
            case 'produzindo':
                corDeFundoVariavelCSS = 'var(--op-cor-status-produzindo)';
                break;
            case 'finalizado':
                corDeFundoVariavelCSS = 'var(--op-cor-status-finalizado)';
                break;
            case 'cancelada':
                corDeFundoVariavelCSS = 'var(--op-cor-status-cancelada)';
                break;
            case 'todas':
                corDeFundoVariavelCSS = 'var(--op-cor-status-todas-ativo)';
                break;
            default:
                corDeFundoVariavelCSS = '#6c757d'; // Cinza padrão
        }

        botaoAtivo.style.backgroundColor = corDeFundoVariavelCSS;
        botaoAtivo.style.color = corDoTextoVariavelCSS;
        botaoAtivo.style.borderColor = corDeFundoVariavelCSS; // Borda da mesma cor do fundo

    } else {
    }
}

// --- INICIALIZAÇÃO E EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Autenticação e Definição de Variáveis Globais de Sessão
    const auth = await verificarAutenticacao('ordens-de-producao.html', ['acesso-ordens-de-producao']);
    if (!auth) {
        // Adiciona uma mensagem visual caso o redirecionamento falhe por algum motivo.
        document.body.innerHTML = '<p style="padding:20px; color:red; font-size:1.2em; text-align:center;">Falha na autenticação. Você será redirecionado para o login.</p>';
        // Fallback de redirecionamento, embora verificarAutenticacao deva cuidar disso.
        // setTimeout(() => { if (window.location.pathname !== '/login.html') window.location.href = '/login.html'; }, 2500);
        return; // Interrompe a execução do restante do script.
    }
    usuarioLogado = auth.usuario;
    permissoes = auth.permissoes || [];
    document.body.classList.add('autenticado'); // Torna o corpo da página visível

    // 2. Carregamento Inicial de Dados Essenciais (Ex: Produtos para Selects)
    try {
        await obterProdutosDoStorage(); // Chama para popular/verificar o cache do localStorage via storage.js
    } catch (error) {
        // Mesmo que falhe, a aplicação tenta continuar. As funções que usam produtos tentarão buscar novamente.
        mostrarPopupMensagem(`Alerta: Falha ao pré-carregar dados de produtos: ${error.message.substring(0,100)}. Algumas funcionalidades podem demorar mais na primeira vez.`, 'aviso', 7000);
    }

    // --- Configuração de Event Listeners para Interações da UI ---

    const statusFilterContainer = document.getElementById('statusFilter'); // Este é o <div id="statusFilter">

    // 3. Listener para o SELECT DE PRODUTO no formulário de Nova OP (#opFormView)
    const produtoOPSelect = document.getElementById('produtoOP');
    if (produtoOPSelect) {
        produtoOPSelect.addEventListener('change', async (e) => {
            const produtoNome = e.target.value;
            console.log(`[produtoOP change] Produto selecionado pela UI: "${produtoNome}"`);
            const infoCorteContainer = document.getElementById('infoCorteContainer');
            const variantesContainer = document.getElementById('variantesContainer');
            const variantesSelectsDiv = document.querySelector('#opFormView .variantes-selects');
            const quantidadeOPInput = document.getElementById('quantidadeOP');

            const camposDependentesParaReset = [
                document.getElementById('quantidadeOP')?.parentElement,
                document.getElementById('numeroOP')?.parentElement,
                document.getElementById('dataEntregaOP')?.parentElement,
                document.getElementById('observacoesOP')?.parentElement,
                infoCorteContainer,
                variantesContainer
            ].filter(Boolean);

            if (!produtoNome) {
                console.log('[produtoOP change] Nenhum produto selecionado. Limpando campos dependentes.');
                if (variantesSelectsDiv) variantesSelectsDiv.innerHTML = '';
                camposDependentesParaReset.forEach(el => { if(el) el.style.display = 'none'; });
                if (infoCorteContainer) infoCorteContainer.innerHTML = '';
                corteDeEstoqueSelecionadoId = null;
                if (quantidadeOPInput) {
                    quantidadeOPInput.value = '';
                    quantidadeOPInput.disabled = false;
                    quantidadeOPInput.style.backgroundColor = '';
                }
                return;
            }

            let produtosDisponiveis;
            try {
                produtosDisponiveis = await obterProdutosDoStorage();
                if (!produtosDisponiveis || produtosDisponiveis.length === 0) {
                    mostrarPopupMensagem('Dados de produtos não carregados. Não é possível continuar.', 'erro');
                    return;
                }
            } catch (error) {
                mostrarPopupMensagem(`Erro ao carregar produtos para OP: ${error.message.substring(0,100)}`, 'erro');
                return;
            }
            
            await loadVariantesSelects(produtoNome, produtosDisponiveis); // Passa a lista para evitar nova busca

            const produtoObj = produtosDisponiveis.find(p => p.nome === produtoNome);
            if (!produtoObj) {
                console.warn(`[produtoOP change] Produto "${produtoNome}" não encontrado na lista.`);
                camposDependentesParaReset.forEach(el => { if(el) el.style.display = 'none'; });
                if (infoCorteContainer) infoCorteContainer.innerHTML = '';
                return;
            }
            const produtoTemVariantes = (produtoObj.variantes?.length > 0 || produtoObj.grade?.length > 0);
            if (!produtoTemVariantes) {
                await verificarCorteEAtualizarFormOP(); // Esta função já chama obterProdutosDoStorage internamente
            } else {
                console.log(`[produtoOP change] Produto "${produtoNome}" tem variantes. Aguardando seleção de variante.`);
                camposDependentesParaReset.forEach(el => { if (el !== variantesContainer || (variantesContainer && variantesContainer.style.display === 'none')) { if(el) el.style.display = 'none'; }});
                if (infoCorteContainer) infoCorteContainer.innerHTML = '';
                corteDeEstoqueSelecionadoId = null;
                if (quantidadeOPInput) { quantidadeOPInput.value = ''; quantidadeOPInput.disabled = false; quantidadeOPInput.style.backgroundColor = ''; }
            }
        });
    } else {
        console.warn('[DOMContentLoaded] Elemento #produtoOP não encontrado.');
    }

    // 4. Listener para o SUBMIT do Formulário de Inclusão de OP
     const opForm = document.getElementById('opForm');
    if (opForm) {
        opForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSalvar = opForm.querySelector('.botao-salvar-op'); // Certifique-se que este seletor está correto
            if (!btnSalvar) {
                console.error("Botão 'Salvar OP' não encontrado no opForm.");
                mostrarPopupMensagem("Erro: Botão de salvar não encontrado.", "erro");
                return;
            }
            const originalButtonText = btnSalvar.innerHTML; // Use innerHTML se tiver ícone
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<div class="spinner-btn-interno"></div> Salvando OP...';

            // Coleta de dados do formulário
            const numero = document.getElementById('numeroOP').value.trim();
            const produtoNome = document.getElementById('produtoOP').value;
            const varianteSelect = document.querySelector('#opFormView .variantes-selects select');
            const varianteValor = varianteSelect ? varianteSelect.value : '';
            const quantidadeStr = document.getElementById('quantidadeOP').value;
            const quantidade = parseInt(quantidadeStr) || 0;
            const dataEntrega = document.getElementById('dataEntregaOP').value;
            const observacoes = document.getElementById('observacoesOP').value.trim();
            const infoCorteContainer = document.getElementById('infoCorteContainer'); // Para pnGeradoParaNovoCorte
            
            // Obter produtoObj para pegar as etapas configuradas
            let produtoObj;
            try {
                const todosOsProdutos = await obterProdutosDoStorage(); // Função que busca produtos da API/cache
                if (!todosOsProdutos || todosOsProdutos.length === 0) {
                    throw new Error("Lista de produtos não pôde ser carregada do storage.");
                }
                produtoObj = todosOsProdutos.find(p => p.nome === produtoNome);
            } catch (error) {
                console.error("[opForm submit] Erro crítico ao obter produtos do storage:", error);
                mostrarPopupMensagem("Erro crítico ao obter dados dos produtos. Não é possível salvar a OP.", "erro");
                btnSalvar.disabled = false; btnSalvar.innerHTML = originalButtonText;
                return;
            }

            // Validações
            let erros = [];
            if (!produtoNome) { 
                erros.push('Produto não selecionado');
            } else if (!produtoObj) { 
                erros.push(`Produto "${produtoNome}" é inválido ou não encontrado na configuração.`);
            } else {
                // Supondo que produtoObj.variantes ou produtoObj.grade indica se tem variantes
                const produtoRealmenteTemVariantes = (produtoObj.variantes?.length > 0 || produtoObj.grade?.length > 0);
                if (produtoRealmenteTemVariantes && !varianteValor) {
                    erros.push('Variação não selecionada para este produto');
                }
            }
            if (!quantidadeStr || quantidade <= 0) erros.push('Quantidade deve ser maior que zero');
            if (!dataEntrega) erros.push('Data de entrega não preenchida');
            if (!numero) erros.push('Número da OP não preenchido');

            if (erros.length > 0) {
                mostrarPopupMensagem(`Por favor, corrija os seguintes erros: ${erros.join('; ')}.`, 'erro');
                btnSalvar.disabled = false; btnSalvar.innerHTML = originalButtonText;
                return;
            }

            // Preparar dados da nova OP
            const pnGeradoParaNovoCorte = infoCorteContainer ? infoCorteContainer.dataset.pnGerado : null;
            let novaOP = {
                numero,
                produto: produtoNome,
                variante: varianteValor || null,
                quantidade,
                data_entrega: dataEntrega,
                observacoes,
                status: 'em-aberto', // Status inicial
                edit_id: generateUniqueId(), // Função para gerar ID único no frontend
                etapas: []
            };

            if (produtoObj && Array.isArray(produtoObj.etapas)) {
                novaOP.etapas = produtoObj.etapas.map(eInfo => ({
                    processo: typeof eInfo === 'object' ? eInfo.processo : eInfo,
                    usuario: '',
                    quantidade: 0, // Quantidade da etapa será preenchida no lançamento
                    lancado: false,
                    ultimoLancamentoId: null
                }));
            }

            // Se estiver usando corte de estoque, ajustar status da OP e etapa de corte
            if (corteDeEstoqueSelecionadoId) {
                const idxCorteNaOP = novaOP.etapas.findIndex(et => et.processo?.toLowerCase() === 'corte');
                if (idxCorteNaOP !== -1) {
                    novaOP.etapas[idxCorteNaOP].lancado = true;
                    novaOP.etapas[idxCorteNaOP].usuario = 'Estoque'; // Ou o cortador do corte de estoque, se disponível
                    novaOP.etapas[idxCorteNaOP].quantidade = quantidade; // Quantidade da OP
                }
                novaOP.status = 'produzindo'; // Muda status se o corte já existe
            }

            // Início do bloco try principal para salvar OP e possivelmente corte
            try {
                const savedOP = await salvarOrdemDeProducao(novaOP); // Sua função que faz POST para /api/ordens-de-producao
                console.log('[opForm.submit] Ordem de Produção salva:', savedOP);

                let msgSucesso = `OP <strong>#${novaOP.numero}</strong> salva com sucesso!`;
                let durPopup = 5000; // Duração padrão do popup
                let htmlPop = true; // Para permitir HTML na mensagem
                let tipoPopup = 'sucesso';

                if (corteDeEstoqueSelecionadoId) {
                    // Atualizar o status do corte de estoque para 'usado'
                    await atualizarCorte(corteDeEstoqueSelecionadoId, 'usado', usuarioLogado?.nome || 'Sistema', savedOP.numero);
                    msgSucesso += "<br>Corte de estoque foi utilizado.";
                    console.log(`[opForm.submit] Corte de estoque ID ${corteDeEstoqueSelecionadoId} marcado como usado para OP ${savedOP.numero}.`);
                } else if (pnGeradoParaNovoCorte) {
                    // Criar um novo registro de corte pendente
                    const corteData = {
                        produto: produtoNome,
                        variante: varianteValor || null,
                        quantidade: quantidade,
                        data: new Date().toISOString().split('T')[0], // Data atual
                        pn: pnGeradoParaNovoCorte, // PN gerado pelo frontend
                        status: 'pendente',
                        op: savedOP.numero,     // Associar à OP recém-criada
                        cortador: null          // <<<< DEFINIDO COMO NULL
                    };
                    const token = localStorage.getItem('token');

                    console.log('[opForm.submit] Tentando criar corte pendente com dados:', corteData);

                    const resCorte = await fetch('/api/cortes', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(corteData)
                    });

                    if (!resCorte.ok) {
                        const errorStatus = resCorte.status;
                        const errorData = await resCorte.json().catch(() => ({
                            error: `Erro HTTP ${errorStatus}. Não foi possível ler detalhes do erro.`
                        }));
                        console.error(`[opForm.submit] Falha ao criar corte pendente (PN: ${pnGeradoParaNovoCorte}). Status: ${errorStatus}`, errorData);
                        
                        msgSucesso = `OP <strong>#${novaOP.numero}</strong> salva! <br><strong style="color:orange; font-weight:bold;">ATENÇÃO:</strong> Falha ao gerar o pedido de corte automático (PN: ${pnGeradoParaNovoCorte}). <br>Erro: ${errorData.error}. <br><a href="#cortes-pendentes" style="color:#0056b3;text-decoration:underline;font-weight:bold;">Verificar Cortes Pendentes</a> ou crie o corte manualmente.`;
                        tipoPopup = 'aviso'; // Mudar tipo do popup para aviso
                        durPopup = 0; // Manter popup aberto para o usuário ler o aviso
                    } else {
                        const savedCorteResponse = await resCorte.json();
                        console.log(`[opForm.submit] Pedido de corte (PN: ${savedCorteResponse.pn || pnGeradoParaNovoCorte}) para OP #${savedOP.numero} gerado com sucesso.`);
                        msgSucesso += `<br>Pedido de corte gerado. <a href="#cortes-pendentes" style="color:#0056b3;text-decoration:underline;font-weight:bold;">Ver Corte Pendente (PN: ${pnGeradoParaNovoCorte})</a>`;
                        durPopup = 0; // Manter popup aberto para o usuário clicar no link
                    }
                }

                mostrarPopupMensagem(msgSucesso, tipoPopup, durPopup, htmlPop);

                console.log('[opForm submit] Limpando cache de OPs e Cortes.');
                limparCacheOrdens();
                if (pnGeradoParaNovoCorte || corteDeEstoqueSelecionadoId) {
                    limparCacheCortes(); // Limpa cache de cortes se um novo foi gerado ou de estoque foi usado
                }

                // Limpar estado do formulário e variáveis de controle
                if (infoCorteContainer) delete infoCorteContainer.dataset.pnGerado;
                corteDeEstoqueSelecionadoId = null;

                // Lógica de navegação/limpeza do formulário após o popup
                if (durPopup > 0) { // Se o popup fecha sozinho (sucesso sem link ou aviso crítico)
                    setTimeout(() => {
                        if (window.location.hash === '#adicionar') {
                            window.location.hash = ''; // Volta para a lista
                        }
                    }, durPopup + 300); // Um pouco depois do popup sumir
                } else if (window.location.hash === '#adicionar') {
                    // Se o popup não fecha sozinho (teve link ou aviso), limpa o formulário
                    // para o caso do usuário querer criar outra OP em seguida.
                    console.log("[opForm submit] Popup com interação/aviso. Limpando formulário para nova OP.");
                    limparFormularioOP();
                    await loadProdutosSelect(); // Recarrega o select de produtos
                    // A lógica de variantes será acionada pela seleção do produto
                }

            } catch (errorPrincipal) { // Catch para erros em salvarOrdemDeProducao, atualizarCorte
                console.error('[opForm.submit] Erro CRÍTICO ao processar OP ou corte de estoque:', errorPrincipal);
                mostrarPopupMensagem(`Erro grave ao salvar OP: ${errorPrincipal.message.substring(0, 250)}`, 'erro');
                // Neste caso, não limpar o formulário, deixar o usuário ver os dados e tentar novamente.
            } finally {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = originalButtonText;
            }
        });
    } else {
        console.warn('[DOMContentLoaded] Formulário #opForm não encontrado.');
    }
    

    // 5. Listener para o botão "Salvar Corte" na tela #corteView (Corte p/ Estoque)
    const btnSalvarCorteEstoque = document.getElementById('btnCortar');
    if (btnSalvarCorteEstoque) {
        btnSalvarCorteEstoque.addEventListener('click', salvarCorte);
    }

    //5.1 listener para o botao "limpar" na tela #corte para estoque
    const btnLimparFormCorte = document.getElementById('btnLimparFormCorteEstoque');
if (btnLimparFormCorte) {
    btnLimparFormCorte.addEventListener('click', limparFormularioCorte); // Passa a referência da função
}

    // 6. Listeners para FILTROS DE STATUS da tabela de OPs
    if (statusFilterContainer) {        
        const statusButtons = statusFilterContainer.querySelectorAll('.op-botao-filtro'); 

        statusButtons.forEach(btn => {
            // Adiciona um log para cada botão ao qual o listener é anexado            
            btn.addEventListener('click', () => {
                // ESTE LOG É CRUCIAL: Ele deve aparecer quando você clica em um botão
                console.log(`[Filtro Status CLIQUE] Botão '${btn.dataset.status}' FOI CLICADO.`);

                // Remove a classe 'active' de todos os botões de status
                statusFilterContainer.querySelectorAll('.op-botao-filtro').forEach(b => {
                    b.classList.remove('active');
                    b.style.backgroundColor = ''; 
                    b.style.color = ''; 
                    b.style.borderColor = '';
                });

                // Adiciona a classe 'active' ao botão clicado
                btn.classList.add('active');
                
                const uiStatus = btn.dataset.status;
                const searchTerm = document.getElementById('searchOP').value;
                const apiStatusParaFiltro = (uiStatus === 'todas') ? null : uiStatus; 
                
                const activeSortTh = document.querySelector('.tabela-op th[data-sort]:not([data-sort=""])');
                let currentSortCriterio = 'numero';
                let currentSortOrdem = 'desc';
                if (activeSortTh) {
                    currentSortCriterio = activeSortTh.id.replace('sort', '').toLowerCase();
                    currentSortOrdem = activeSortTh.dataset.sort || 'desc';
                }

                console.log(`[Filtro Status CLIQUE] Chamando loadOPTable com: uiStatus=${uiStatus}, apiStatus=${apiStatusParaFiltro}`);
                
                loadOPTable(uiStatus, searchTerm, {criterio: currentSortCriterio, ordem: currentSortOrdem}, 1, true, apiStatusParaFiltro);                
                aplicarCorAoFiltroAtivo(); 
            });
        });
    } else {
        console.warn('[DOMContentLoaded] Container de filtro de status #statusFilter não encontrado.');
    }

    // 7. Listener para o INPUT DE BUSCA da tabela de OPs
    const searchOPInput = document.getElementById('searchOP');
    if (searchOPInput && statusFilterContainer) {
        
        // Função debounce (certifique-se que está definida no seu script)
        // function debounce(func, wait) { let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>func.apply(this,a),wait);}}

        searchOPInput.addEventListener('input', debounce(async () => {
            const searchTerm = searchOPInput.value.trim(); // Pega o valor e remove espaços extras
            console.log(`[Busca OP] Termo de busca alterado para: "${searchTerm}"`);

            const activeStatusButton = statusFilterContainer.querySelector('.op-botao-filtro.active'); // Usa a classe correta dos seus botões
            if (!activeStatusButton) {
                console.error("[Busca OP] Botão de status ativo não encontrado. Verifique as classes dos botões de filtro.");
                // Poderia assumir 'todas' como fallback ou simplesmente não filtrar se isso acontecer
                // mostrarPopupMensagem("Erro: Filtro de status não identificado.", "erro");
                return; 
            }
            const uiStatus = activeStatusButton.dataset.status;
            
            // Determina qual status enviar para a API
            const apiStatusParaFiltro = (uiStatus === 'todas') ? null : uiStatus;

            // Pega a configuração de ordenação atual da tabela
            const activeSortTh = document.querySelector('.tabela-op th[data-sort]:not([data-sort=""])');
            let sortCriterioAtual = 'numero'; // Default
            let sortOrdemAtual = 'desc';   // Default
            if (activeSortTh) {
                sortCriterioAtual = activeSortTh.id.replace('sort', '').toLowerCase();
                sortOrdemAtual = activeSortTh.dataset.sort || 'desc'; 
            }

            console.log(`[Busca OP] Chamando loadOPTable com: uiStatus=${uiStatus}, searchTerm="${searchTerm}", sort=${sortCriterioAtual}-${sortOrdemAtual}, page=1, apiStatus=${apiStatusParaFiltro}`);
            
            await loadOPTable(
                uiStatus, 
                searchTerm, 
                { criterio: sortCriterioAtual, ordem: sortOrdemAtual }, // Objeto de configuração de ordenação
                1,      // Sempre volta para a página 1 ao fazer uma nova busca
                true,   // Força uma atualização dos dados (importante se a busca for no backend)
                apiStatusParaFiltro // Status a ser enviado para a API
            );
        }, 400)); // Delay de 400ms para o debounce
    } else {
        if (!searchOPInput) console.warn('[DOMContentLoaded] Input de busca #searchOP não encontrado.');
        if (!statusFilterContainer) console.warn('[DOMContentLoaded] Container de filtro #statusFilter não encontrado (necessário para a busca obter o status atual).');
    }

    // 8. Listeners para ORDENAÇÃO nos cabeçalhos da tabela de OPs
    document.querySelectorAll('.tabela-op th[id^="sort"]').forEach(th => {
        th.addEventListener('click', () => {
            const novoSortCriterio = th.id.replace('sort', '').toLowerCase();
            let currentOrder = th.dataset.sort;
            let novoSortOrdem = (currentOrder === 'asc') ? 'desc' : (currentOrder === 'desc' ? '' : 'asc');
            document.querySelectorAll('.tabela-op th[id^="sort"]').forEach(h => h.dataset.sort = (h === th ? novoSortOrdem : ''));
            
            const uiStatus = statusFilterContainer.querySelector('.status-btn.active').dataset.status;
            const searchTerm = searchOPInput.value;
            const apiStatus = (uiStatus === 'todas') ? null : uiStatus;
            const finalSortCriterio = novoSortOrdem ? novoSortCriterio : 'numero';
            const finalSortOrdem = novoSortOrdem || 'desc';
            loadOPTable(uiStatus, searchTerm, {criterio: finalSortCriterio, ordem: finalSortOrdem}, 1, true, apiStatus);
        });
    });

    // 9. Listeners para botões da tela de EDIÇÃO de OP (#opEditView)
    const btnFinalizarOP = document.getElementById('finalizarOP');
    if (btnFinalizarOP) {
        btnFinalizarOP.addEventListener('click', async () => {
            if (btnFinalizarOP.disabled) return; // Não faz nada se já estiver desabilitado
            const editId = window.location.hash.split('/')[1];
            if (!editId) { 
                mostrarPopupMensagem('Não foi possível identificar a OP para finalizar.', 'erro'); 
                return; 
            }

            const originalButtonText = btnFinalizarOP.textContent; // Guardar o texto original
            btnFinalizarOP.disabled = true;
            btnFinalizarOP.innerHTML = '<div class="spinner-btn-interno"></div> Finalizando...';

            try {
                limparCacheOrdens();
                const ordensData = await obterOrdensDeProducao(1, true, true, null, true); // Força refresh
                const op = ordensData.rows.find(o => o.edit_id === editId);

                if (op) {
                    if (op.status === 'finalizado') { // Verifica se já está finalizada
                        mostrarPopupMensagem(`OP #${op.numero} já está finalizada.`, 'info');
                        btnFinalizarOP.textContent = 'OP Finalizada!'; // Atualiza texto
                        btnFinalizarOP.classList.add('op-finalizada-btn-estilo'); // Adiciona classe para estilo
                        // Não precisa desabilitar aqui, updateFinalizarButtonState fará
                        return; 
                    }

                    const produtos = await obterProdutosDoStorage();
                    const todasEtapasCompletas = await verificarEtapasEStatus(op, produtos); // Passa produtos
                    
                    if (!todasEtapasCompletas) {
                         mostrarPopupMensagem('Ainda há etapas pendentes ou não lançadas. Verifique todas as etapas antes de finalizar.', 'aviso', 7000);
                         // Reabilitar o botão e restaurar texto será feito no finally, após updateFinalizarButtonState
                         // Não retorna aqui, deixa o finally cuidar do estado do botão
                    } else {
                        // Só prossegue com a finalização se todas as etapas estiverem completas
                        op.status = 'finalizado';
                        op.data_final = new Date().toISOString(); // Define a data de finalização
                        
                        await window.saveOPChanges(op); // Salva a OP com o novo status
                        
                        mostrarPopupMensagem(`OP #${op.numero} finalizada com sucesso!`, 'sucesso');
                        limparCacheOrdens();
                        
                        // >>> MUDANÇA DE TEXTO E ESTILO APÓS SUCESSO <<<
                        btnFinalizarOP.textContent = 'OP Finalizada!';
                        btnFinalizarOP.disabled = true; // Mantém desabilitado
                        btnFinalizarOP.classList.add('op-finalizada-btn-estilo'); // Adiciona classe para estilo específico
                        btnFinalizarOP.classList.remove('op-botao-sucesso'); // Remove classe de cor verde se houver

                        // Aguarda um pouco para o usuário ver a mensagem e depois redireciona
                        setTimeout(() => {
                            window.location.hash = ''; // Volta para a lista de OPs
                        }, 2000); // Delay de 2 segundos
                        return; // Sai da função após sucesso
                    }
                } else {
                    mostrarPopupMensagem('OP não encontrada para finalizar.', 'erro');
                }
            } catch (e) {
                mostrarPopupMensagem(`Erro ao finalizar OP: ${e.message.substring(0,100)}`, 'erro');
            } finally {
                // Este finally será alcançado se a finalização não ocorreu (ex: etapas incompletas ou erro)
                // ou se não houve redirecionamento imediato.
                // Precisamos garantir que o botão reflita o estado atual da OP.
                if (window.location.hash.startsWith('#editar/')) { // Se ainda estiver na página de edição
                    const currentEditId = window.location.hash.split('/')[1];
                    const ordensDataAtualizadas = await obterOrdensDeProducao(1, true, true, null, true);
                    const opAtualizada = ordensDataAtualizadas.rows.find(o => o.edit_id === currentEditId);
                    
                    if (opAtualizada) {
                        await updateFinalizarButtonState(opAtualizada); // Atualiza o estado do botão
                        // Se a OP não foi finalizada com sucesso, restaura o texto original
                        if (opAtualizada.status !== 'finalizado' && btnFinalizarOP.textContent !== originalButtonText) {
                            btnFinalizarOP.innerHTML = originalButtonText; // Restaura o texto original
                        }
                    } else { // Se a OP não for encontrada (improvável, mas por segurança)
                        btnFinalizarOP.disabled = false;
                        btnFinalizarOP.innerHTML = originalButtonText;
                    }
                }
            }
        });
    }


    // 10. Listener para hashchange (controla a navegação entre views)
    if (!window.hashChangeListenerAttached) {
        window.addEventListener('hashchange', toggleView);
        window.hashChangeListenerAttached = true;
    }
    
    // 11. Carrega a view inicial baseada na hash ou a padrão (lista de OPs)
    await toggleView(); 
    document.body.dataset.initialLoadComplete = 'true';
    aplicarCorAoFiltroAtivo(); // Aplica a cor ao filtro "Todas" inicial

    // 12. Botão de Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token'); localStorage.removeItem('usuarioLogado'); localStorage.removeItem('permissoes');
            limparCacheOrdens(); invalidateProdutosStorageCache('produtosCadastrados'); limparCacheCortes(); lancamentosCache.clear();
            window.location.href = '/login.html';
        });
    }

});