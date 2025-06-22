// public/js/admin-ordens-de-producao.js

// Declaração global para saveOPChanges, será definida mais adiante
window.saveOPChanges = null;

import { verificarAutenticacao } from '/js/utils/auth.js';
import { PRODUTOS as CONST_PRODUTOS, PRODUTOSKITS as CONST_PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';
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
let cortesPromiseMap = {};
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

function getUsuarioPlaceholder(tipoUsuario) {
  switch (tipoUsuario) {
    case 'costureira':
        return 'Selecione a(o) Costureira(o)';
    case 'cortador':
        return 'Selecione a(o) Cortador(a)';
    case 'tiktik':
        return 'Selecione a(o) TikTik';
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

async function obterOrdensDeProducao(page = 1, fetchAll = false, forceUpdate = false, statusFilter = null, noStatusFilter = false, searchTerm = null) {
    let url;
    const timestamp = Date.now();

    let queryStringParts = [`_=${timestamp}`];

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

    if (searchTerm && searchTerm.trim() !== '') {
        queryStringParts.push(`search=${encodeURIComponent(searchTerm.trim())}`);
    }

    url = `/api/ordens-de-producao?${queryStringParts.join('&')}`;

    const cacheKey = url;
    const entry = ordensCacheMap.get(cacheKey);
    if (entry && !forceUpdate && (Date.now() - entry.timestamp < CACHE_EXPIRATION_MS_ORDENS)) {
        return entry.data;
    }
    if (ordensCacheMap.has(`promise-${cacheKey}`)) return await ordensCacheMap.get(`promise-${cacheKey}`);

    console.log(`[obterOrdensDeProducao] Buscando: ${cacheKey}`);
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
            const rawApiResponse = await response.json();

            const formattedData = {
                rows: Array.isArray(rawApiResponse.rows) ? rawApiResponse.rows : [],
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
function mostrarPopupMensagem(mensagem, tipo = 'erro', duracao = 5000, permitirHTML = false) {
    const popupId = `popup-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `popup-mensagem popup-${tipo}`;
    // Removidos os estilos inline, agora eles vêm do CSS

    const overlayId = `overlay-${popupId}`;
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'popup-overlay';

    if (permitirHTML) {
        popup.innerHTML = `<p>${mensagem}</p>`; // Adiciona o <p> para o HTML também
    } else {
        const p = document.createElement('p');
        p.textContent = mensagem;
        popup.appendChild(p);
    }

    const fecharBtnManual = document.createElement('button');
    fecharBtnManual.textContent = 'OK';
    fecharBtnManual.onclick = () => {
        // Adiciona animação de saída (opcional, requer CSS @keyframes fadeOut)
        popup.style.animation = 'fadeOut 0.3s ease-out forwards';
        overlay.style.animation = 'fadeOutOverlay 0.3s ease-out forwards';

        setTimeout(() => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup);
            }
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 300); // Espera a animação terminar
    };

    // Adiciona o botão de fechar ao popup
    const containerBotoes = document.createElement('div');
    containerBotoes.style.marginTop = '10px'; // Espaço para o botão
    containerBotoes.appendChild(fecharBtnManual);
    popup.appendChild(containerBotoes);

    document.body.appendChild(overlay); // Adiciona o overlay primeiro
    document.body.appendChild(popup); // Depois o popup

    if (duracao > 0) {
        // Se o popup tem duração, ele se fecha automaticamente, mas o usuário também pode fechar
        setTimeout(() => {
            // Verifica se o popup ainda existe (se o usuário não fechou manualmente)
            const el = document.getElementById(popupId);
            if (el && document.body.contains(el)) {
                 // Adiciona animação de saída (opcional, requer CSS @keyframes fadeOut)
                el.style.animation = 'fadeOut 0.3s ease-out forwards';
                document.getElementById(overlayId).style.animation = 'fadeOutOverlay 0.3s ease-out forwards';

                setTimeout(() => {
                    if (document.body.contains(el)) {
                        document.body.removeChild(el);
                    }
                    const ov = document.getElementById(overlayId);
                    if (ov && document.body.contains(ov)) {
                        document.body.removeChild(ov);
                    }
                }, 300);
            }
        }, duracao);
    }
}

function generateUniqueId() { let id; do { id = `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; } while (usedIds.has(id)); usedIds.add(id); return id; }
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

    produtoSelect.disabled = true;
    // Define o texto de carregamento uma vez
    const placeholderOption = produtoSelect.querySelector('option[value=""]');
    if (placeholderOption) {
        placeholderOption.textContent = 'Carregando produtos...';
    } else {
        produtoSelect.innerHTML = '<option value="">Carregando produtos...</option>';
    }

    try {
        const produtos = await obterProdutosDoStorage(); // Deve usar o cache fresco
        
        produtoSelect.innerHTML = '<option value="">Selecione produto</option>'; // Placeholder final
        
        produtos.filter(p => CONST_PRODUTOS.includes(p.nome) && !CONST_PRODUTOSKITS.includes(p.nome))
                .forEach(p => {
                    const option = new Option(p.nome, p.id);
                    produtoSelect.appendChild(option);
                });
    } catch (e) {
        console.error("[loadProdutosSelect] Erro:", e);
        produtoSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    } finally {
        produtoSelect.disabled = false;
    }
}

async function loadVariantesSelects(produtoId, produtosDisponiveisRecebidos) {
    const variantesContainer = document.getElementById('variantesContainer');
    const variantesSelectsDiv = document.querySelector('#opFormView .variantes-selects');
    const infoCorteContainer = document.getElementById('infoCorteContainer');

    const camposDependentesPrincipais = [
        document.getElementById('quantidadeOP')?.parentElement,
        document.getElementById('numeroOP')?.parentElement,
        document.getElementById('dataEntregaOP')?.parentElement,
        document.getElementById('observacoesOP')?.parentElement
    ].filter(Boolean);

    if (!variantesContainer || !variantesSelectsDiv) {
        console.warn('[loadVariantesSelects] Elementos DOM para variantes não encontrados.');
        return;
    }

    // Limpa a UI
    variantesSelectsDiv.innerHTML = '';
    variantesContainer.style.display = 'none';
    if (infoCorteContainer) {
        infoCorteContainer.innerHTML = '';
        infoCorteContainer.style.display = 'none';
    }
    camposDependentesPrincipais.forEach(el => el.style.display = 'none');

    // Se nenhum produtoId foi passado, para aqui.
    if (!produtoId) {
        console.log('[loadVariantesSelects] Nenhum produto selecionado.');
        return;
    }

    // AQUI ESTÁ A CORREÇÃO:
    // Compara o p.id (que é um número) com o produtoId (que vem do select como string).
    // Usar '==' faz a conversão de tipo automaticamente, o que é seguro neste caso.
    const produto = produtosDisponiveisRecebidos.find(p => p.id == produtoId);

    if (!produto) {
        // Esta mensagem de erro agora faz mais sentido
        console.warn(`[loadVariantesSelects] Produto com ID "${produtoId}" não encontrado na lista de produtos fornecida.`);
        return;
    }

    // O resto da sua função para popular o select de variantes continua igual...
    let listaDeVariantesParaSelect = [];
    if (produto.variantes && produto.variantes.length > 0) {
        listaDeVariantesParaSelect = produto.variantes.map(v => v.valores.split(',')).flat().map(v => v.trim()).filter(Boolean);
    } else if (produto.grade && produto.grade.length > 0) {
        listaDeVariantesParaSelect = [...new Set(produto.grade.map(g => g.variacao))].filter(Boolean);
    }

    if (listaDeVariantesParaSelect.length > 0) {
        const selectVariante = document.createElement('select');
        selectVariante.className = 'op-select op-input-variante-opform';
        selectVariante.innerHTML = '<option value="">Selecione uma variação</option>';
        
        listaDeVariantesParaSelect.forEach(variante => {
            selectVariante.appendChild(new Option(variante, variante));
        });
        
        variantesSelectsDiv.appendChild(selectVariante);
        variantesContainer.style.display = 'block';

        selectVariante.addEventListener('change', async () => {
            await verificarCorteEAtualizarFormOP();
        });
    } else {
        console.log(`[loadVariantesSelects] Produto "${produto.nome}" não possui variantes configuradas.`);
        variantesContainer.style.display = 'none';
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
    const produtoSelect = document.getElementById('produtoOP');
    const produtoId = produtoSelect.value;
    const varianteSelect = document.querySelector('#opFormView .variantes-selects select');
    // Se o select de variante não existe (para produtos sem variante), o valor é ''.
    const varianteValor = varianteSelect ? varianteSelect.value : '';

    const quantidadeInput = document.getElementById('quantidadeOP');
    const numeroInput = document.getElementById('numeroOP');
    const dataEntregaInput = document.getElementById('dataEntregaOP');
    const observacoesInput = document.getElementById('observacoesOP');
    const infoCorteContainer = document.getElementById('infoCorteContainer');
    
    // Container dos campos que devem aparecer
    const camposDependentes = [
        quantidadeInput?.parentElement,
        numeroInput?.parentElement,
        dataEntregaInput?.parentElement,
        observacoesInput?.parentElement
    ].filter(Boolean);

    // Esconde tudo primeiro para garantir um estado limpo
    camposDependentes.forEach(el => el.style.display = 'none');
    if (infoCorteContainer) infoCorteContainer.innerHTML = '';
    corteDeEstoqueSelecionadoId = null;

    if (!produtoId) return; // Se não há produto, não faz nada

    const produtos = await obterProdutosDoStorage();
    const produtoObj = produtos.find(p => p.id == produtoId);
    if (!produtoObj) return;

    const produtoTemVariantes = produtoObj.variantes?.length > 0 || produtoObj.grade?.length > 0;
    // Se o produto tem variantes, mas nenhuma foi selecionada ainda, não faz nada.
    if (produtoTemVariantes && !varianteValor) {
        console.log(`[verificarCorte] Produto ${produtoObj.nome} requer variante, mas nenhuma foi selecionada.`);
        return;
    }

    // A partir daqui, temos um produto e, se necessário, uma variante.
    console.log(`[verificarCorte] Verificando estoque de corte para ${produtoObj.nome} - ${varianteValor || 'Sem variante'}`);
    
    if (infoCorteContainer) {
        infoCorteContainer.innerHTML = '<div class="spinner">Verificando estoque de corte...</div>';
        infoCorteContainer.style.display = 'block';
    }

    try {
        const cortados = await obterCortes('cortados');
        const estoque = cortados.find(c => 
            c.produto_id == produtoId &&
            (produtoTemVariantes ? c.variante === varianteValor : true) &&
            !c.op // Garante que é um corte que ainda não foi usado em nenhuma OP
        );

        if (infoCorteContainer) infoCorteContainer.innerHTML = '';

        if (estoque) {
            corteDeEstoqueSelecionadoId = estoque.id;
            if (infoCorteContainer) infoCorteContainer.innerHTML = `<p class="op-feedback-sucesso"><i class="fas fa-check-circle"></i> Corte em estoque! (PC: ${estoque.pn || 'N/A'}, Qtd: ${estoque.quantidade})</p>`;
            if (quantidadeInput) {
                quantidadeInput.value = estoque.quantidade;
                quantidadeInput.disabled = true;
                quantidadeInput.style.backgroundColor = '#e9ecef';
            }
        } else {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/cortes/next-pc-number', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('Falha ao buscar próximo número de PC.');
            const data = await response.json();
            const proximoPC = data.nextPC;
            
            if (infoCorteContainer) {
                infoCorteContainer.innerHTML = `<p class="op-feedback-aviso"><i class="fas fa-exclamation-triangle"></i> Novo Pedido de Corte (PC: ${proximoPC}) será gerado.</p>`;
                infoCorteContainer.dataset.pcGerado = proximoPC;
            }
            if (quantidadeInput) {
                quantidadeInput.value = '';
                quantidadeInput.disabled = false;
                quantidadeInput.style.backgroundColor = '';
                quantidadeInput.placeholder = 'Qtd a produzir';
            }
        }

        // AGORA, TORNA OS CAMPOS VISÍVEIS
        camposDependentes.forEach(el => el.style.display = 'block');
        
        // E PREENCHE OS VALORES RESTANTES
        if (numeroInput) numeroInput.value = await getNextOPNumber();
        if (dataEntregaInput) setCurrentDate(dataEntregaInput);

    } catch (e) {
        if (infoCorteContainer) infoCorteContainer.innerHTML = `<p class="op-feedback-erro">Erro: ${e.message}</p>`;
        camposDependentes.forEach(el => el.style.display = 'none');
    }
}

// --- CRUD ORDENS DE PRODUÇÃO ---
async function salvarOrdemDeProducao(ordem) {
    const token = localStorage.getItem('token');
    // A rota no backend já espera produto_id, então o objeto 'ordem' já está correto
    const response = await fetch('/api/ordens-de-producao', { 
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify(ordem) 
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(`Erro ao salvar OP: ${errorData.error}`);
    }
    return await response.json();
}

window.saveOPChanges = async function saveOPChangesGlobal(op) {
    console.log(`[saveOPChanges] Atualizando OP #${op.numero} com ID ${op.produto_id}`);
    
    // VERIFICAÇÃO DE SEGURANÇA
    if (!op.produto_id) {
        console.error("[saveOPChanges] ERRO CRÍTICO: Tentando atualizar uma OP sem produto_id.", op);
        throw new Error("Não é possível atualizar uma OP sem um ID de produto válido.");
    }
    
    const token = localStorage.getItem('token');
    
    const payload = { 
        edit_id: op.edit_id, 
        numero: op.numero, 
        produto_id: op.produto_id, // << MUDANÇA ESSENCIAL: Envia o ID
        variante: op.variante, 
        quantidade: parseInt(op.quantidade) || 0, 
        data_entrega: op.data_entrega, 
        observacoes: op.observacoes, 
        status: op.status, 
        etapas: op.etapas, 
        data_final: op.data_final 
    };

    // A API de PUT não precisa mais de /:id na URL, ela pega o edit_id do corpo
    const response = await fetch('/api/ordens-de-producao', { 
        method: 'PUT', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido ao atualizar OP.' }));
        console.error(`[saveOPChanges] Erro ao atualizar OP #${op.numero}:`, errorData);
        throw new Error(`Erro ao atualizar OP: ${errorData.error}`);
    }

    console.log(`[saveOPChanges] OP #${op.numero} atualizada com sucesso.`);
    return await response.json();
};

// --- CRUD CORTES ---

async function salvarCorte() {
    const produtoCorteSelect = document.getElementById('produtoCorte'); // Agora é um <select>
    const varianteSelectEl = document.querySelector('#corteView .variantes-selects-corte select');
    const quantidadeInput = document.getElementById('quantidadeCorte');
    const dataCorteInput = document.getElementById('dataCorte');
    const cortadorInput = document.getElementById('cortadorCorte');
    const pcNumberInput = document.getElementById('pcNumberCorte');
    const pcNumber = pcNumberInput ? pcNumberInput.value : null;
    
    if (!permissoes.includes('registrar-corte')) {
        mostrarPopupMensagem('Você não tem permissão para registrar cortes.', 'erro');
        return;
    }

    // --- COLETA DE DADOS CORRIGIDA ---
    const produtoId = produtoCorteSelect.value; // Pega o ID
    const varianteValor = varianteSelectEl ? varianteSelectEl.value : '';
    const quantidade = parseInt(quantidadeInput.value) || 0;
    const dataCorte = dataCorteInput.value;
    const cortador = cortadorInput.value;

    // --- VALIDAÇÃO ---
    let erros = [];
    if (!pcNumber) erros.push("Não foi possível obter um número de PC. Tente recarregar a página.");
    if (!produtoId) erros.push("Produto não selecionado");
    if (quantidade <= 0) erros.push("Quantidade deve ser maior que zero");
    if (!dataCorte) erros.push("Data do Corte não preenchida");
    if (!cortador) erros.push("Cortador não definido");
    
    if (erros.length > 0) {
        mostrarPopupMensagem(`Por favor, corrija: ${erros.join('; ')}.`, 'erro');
        return;
    }

    // --- MONTAGEM DO OBJETO CORRIGIDO ---
    const corteData = {
        produto_id: parseInt(produtoId), // << MUDANÇA PRINCIPAL
        variante: varianteValor || null,
        quantidade,
        data: dataCorte,
        cortador,
        pn: pcNumber,
        status: 'cortados', // Status para corte de estoque direto
        op: null // Sem OP associada, pois é para estoque
    };

    const btnSalvar = document.getElementById('btnCortar');
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
        mostrarPopupMensagem(`Corte para estoque (PC: ${savedCorte.pn}) salvo!`, 'sucesso');
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
    console.log(`[atualizarCorte] Iniciando. ID: ${id}, NovoStatus: ${novoStatus}, OP Ass.: ${opNumeroParaAssociar}`);
    const token = localStorage.getItem('token');
    try {
        const payload = { id: id, status: novoStatus, cortador: cortadorNome };
        if (opNumeroParaAssociar !== null) {
            payload.op = opNumeroParaAssociar;
        }

        console.log('[atualizarCorte] Payload para API PUT /api/cortes:', payload);
        const response = await fetch(`/api/cortes`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
            throw new Error(`Erro ao atualizar corte: ${errorData.error || 'Desconhecido'}`);
        }

        const updatedCorte = await response.json();
        console.log('[atualizarCorte] Corte atualizado no backend:', updatedCorte);

        if (['cortados', 'verificado', 'usado'].includes(updatedCorte.status) && updatedCorte.op) {
            console.log(`[atualizarCorte] Corte ${updatedCorte.id} (OP: ${updatedCorte.op}) status ${updatedCorte.status}. Tentando buscar e atualizar OP.`);
            
            limparCacheOrdens();
            // Otimização: buscar a OP específica em vez de todas
            const tokenOP = localStorage.getItem('token');
            const opResponse = await fetch(`/api/ordens-de-producao/${encodeURIComponent(updatedCorte.op)}`, { headers: { 'Authorization': `Bearer ${tokenOP}` } });
            if (!opResponse.ok) {
                const errorOPData = await opResponse.json().catch(() => ({ error: `Erro HTTP ${opResponse.status}.` }));
                console.error(`[atualizarCorte] Falha ao buscar OP ${updatedCorte.op}: ${errorOPData.error}`);
                throw new Error(`Erro ao buscar OP para atualizar após corte: ${errorOPData.error}`);
            }
            const opParaAtualizar = await opResponse.json();

            if (opParaAtualizar) {
                console.log(`[atualizarCorte] OP #${opParaAtualizar.numero} encontrada. Verificando etapa de corte.`);
                let etapaCorteModificada = false;
                const etapaCorteIndex = opParaAtualizar.etapas.findIndex(e => e.processo && e.processo.toLowerCase() === 'corte');
                
                if (etapaCorteIndex !== -1) {
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
                    opParaAtualizar.etapas.unshift({
                        processo: "Corte",
                        usuario: updatedCorte.cortador || 'Sistema',
                        quantidade: updatedCorte.quantidade,
                        lancado: true,
                        ultimoLancamentoId: null
                    });
                    etapaCorteModificada = true;
                }
                
                if (opParaAtualizar.status === 'em-aberto' && etapaCorteModificada) {
                    opParaAtualizar.status = 'produzindo';
                    etapaCorteModificada = true;
                    console.log(`[atualizarCorte] Status da OP #${opParaAtualizar.numero} alterado para 'produzindo'.`);
                }
                
                if (etapaCorteModificada) {
                    await window.saveOPChanges(opParaAtualizar);
                    console.log(`[atualizarCorte] OP #${opParaAtualizar.numero} salva com alterações na etapa de corte/status.`);
                    
                    const currentHash = window.location.hash;
                    if(currentHash.includes(`#editar/${opParaAtualizar.edit_id}`) || currentHash.includes(`#editar/${opParaAtualizar.numero}`)) {
                        console.log(`[atualizarCorte] Recarregando etapas para OP ${opParaAtualizar.numero} na tela de edição.`);
                        // Recarrega as etapas com o objeto OP atualizado
                        await loadEtapasEdit(opParaAtualizar, true); 
                    }
                } else {
                    console.log(`[atualizarCorte] Nenhuma alteração necessária na OP #${opParaAtualizar.numero} referente à etapa de corte.`);
                }

            } else {
                console.warn(`[atualizarCorte] OP ${updatedCorte.op} associada ao corte não foi encontrada para atualizar.`);
            }
            limparCacheOrdens();
        }
        limparCacheCortes();
        return updatedCorte;
    } catch (error) {
        console.error('[atualizarCorte] Erro:', error);
        mostrarPopupMensagem(`Erro ao atualizar status do corte: ${error.message.substring(0,100)}`, 'erro');
        throw error;
    }
}

async function excluirCorte(id) {
    console.log(`[excluirCorte] Solicitando exclusão (soft delete) para o corte ID: ${id}`);
    const token = localStorage.getItem('token');

    const response = await fetch('/api/cortes', {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: id }) // Enviando o ID no corpo da requisição
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
        console.error(`[excluirCorte] Falha na API ao excluir corte ID ${id}:`, errorData);
        throw new Error(errorData.error || 'Erro desconhecido ao excluir corte.');
    }

    console.log(`[excluirCorte] Corte ID ${id} marcado como excluído com sucesso pela API.`);
    return await response.json();
}

function handleOPTableClick(event) {
    const tr = event.target.closest('tr');
    if (!tr || !tr.dataset.editId) {
        return;
    }

    const editId = tr.dataset.editId;

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
                            <th style="width: 15%;">PC</th>
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
                    <td><input type="checkbox" class="checkbox-corte-item" data-id="${corte.id}" data-status="pendente"></td>
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

    //CONTROLAR A HABILITAÇÃO/DESABILITAÇÃO E POPUP
    const btnMarcar = document.getElementById('btnMarcarComoCortados');
    const btnExcluirPendentes = document.getElementById('btnExcluirCortesPendentes');

    if (btnMarcar) {
        if (!permissoes.includes('marcar-como-cortado')) {
            btnMarcar.classList.add('disabled-by-permission');
        } else {
            btnMarcar.classList.remove('disabled-by-permission');
        }
    }
    if (btnExcluirPendentes) {
        if (!permissoes.includes('excluir-corte-pendente')) {
            btnExcluirPendentes.classList.add('disabled-by-permission');
        } else {
            btnExcluirPendentes.classList.remove('disabled-by-permission');
        }
    }
}

async function loadCortesEmEstoqueViewContent(forceRefreshData = false) {
    if (isLoadingCortesEmEstoque && !forceRefreshData) {
        console.log('[loadCortesEmEstoqueViewContent] Carregamento já em progresso, ignorando.');
        return;
    }
    isLoadingCortesEmEstoque = true;
    console.log('[loadCortesEmEstoqueViewContent] Iniciando carregamento...');

    const container = document.getElementById('cortesEmEstoqueView');
    if (!container) {
        console.error('[loadCortesEmEstoqueViewContent] Container cortesEmEstoqueView não encontrado.');
        isLoadingCortesEmEstoque = false;
        return;
    }

    if (!cortesEmEstoqueViewRendered) {
        container.innerHTML = `
            <button class="botao-fechar op-botao-perigo" onclick="window.location.hash = ''" title="Voltar">X</button>
            <h2 class="op-titulo-secao">Cortes em Estoque (Disponíveis para OP)</h2>
            <div class="op-tabela-wrapper">
                 <table class="op-tabela-estilizada tabela-cortados">
                    <thead>
                        <tr>
                            <th style="width: 5%;"><input type="checkbox" id="selecionarTodosEstoque" title="Selecionar Todos"></th>
                            <th style="width: 15%;">PC</th>
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

        if (btnExcluir) btnExcluir.addEventListener('click', handleExcluirCortesEstoque);
        if (checkSelecionarTodos) {
            checkSelecionarTodos.addEventListener('change', (e) => {
                document.querySelectorAll('#tabelaCortesEmEstoqueBody .checkbox-corte-item').forEach(cb => cb.checked = e.target.checked);
            });
        }
        cortesEmEstoqueViewRendered = true;
    }
    
    const tbody = document.getElementById('tabelaCortesEmEstoqueBody');
    if (!tbody) {
        console.error('[loadCortesEmEstoqueViewContent] tbody tabelaCortesEmEstoqueBody não encontrado.');
        isLoadingCortesEmEstoque = false;
        return;
    }
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner">Carregando cortes em estoque...</div></td></tr>';

    try {
        const todosCortados = await obterCortes('cortados', forceRefreshData);
        const cortesEstoque = todosCortados.filter(corte => !corte.op); 

        if (!cortesEstoque || cortesEstoque.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhum corte em estoque disponível no momento.</td></tr>';
        } else {
            const fragment = document.createDocumentFragment();
            cortesEstoque.forEach(corte => {
                const tr = document.createElement('tr');
                tr.dataset.corteId = corte.id;
                tr.innerHTML = `
                    <td><input type="checkbox" class="checkbox-corte-item" data-id="${corte.id}" data-status="cortados"></td>
                    <td>${corte.pn || 'N/A'}</td>
                    <td>${corte.produto || 'N/A'}</td>
                    <td>${corte.variante || '-'}</td>
                    <td>${corte.quantidade || 0}</td>
                    <td>${corte.data ? new Date(corte.data).toLocaleDateString('pt-BR') : 'N/A'}</td>
                `;
                fragment.appendChild(tr);
            });
            tbody.innerHTML = ''; 
            tbody.appendChild(fragment);
        }
    } catch (error) {
        console.error("[loadCortesEmEstoqueViewContent] Erro ao carregar cortes em estoque:", error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red; padding: 20px;">Erro ao carregar. Tente novamente.</td></tr>';
    } finally {
        isLoadingCortesEmEstoque = false;
    }
}


async function handleMarcarComoCortados() {
    const checkboxes = document.querySelectorAll('#tabelaCortesPendentesBody .checkbox-corte-item:checked');

    if (!permissoes.includes('marcar-como-cortado')) {
        mostrarPopupMensagem('Você não tem permissão para marcar cortes como realizados.', 'erro');
        return;
    }

    if (checkboxes.length === 0) { // Agora 'checkboxes' está definido aqui.
        mostrarPopupMensagem('Selecione pelo menos um item para marcar como cortado.', 'aviso');
        return;
    }
    
    const btnOriginal = this;
    btnOriginal.disabled = true;
    const originalText = btnOriginal.innerHTML;
    btnOriginal.innerHTML = '<div class="spinner-btn-interno"></div> Processando...';

    let algumErro = false;
    try {
        // O loop `for (const cb of checkboxes)` agora vai funcionar.
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
        await loadCortesEmEstoqueViewContent(true);

    } catch (errorGeral) {
        console.error('Erro geral ao marcar cortes como cortados:', errorGeral);
        mostrarPopupMensagem(`Erro ao marcar como cortados: ${errorGeral.message}`, 'erro');
    } finally {
        btnOriginal.disabled = false;
        btnOriginal.innerHTML = originalText;
    }
}

async function handleExcluirCortes(tbodyId, tipoCorte, callbackReloadView) {
    let permissaoNecessaria = '';
    if (tipoCorte === 'pendente') {
        permissaoNecessaria = 'excluir-corte-pendente';
    } else if (tipoCorte === 'cortados') { // 'cortados' é o status interno para cortes em estoque
        permissaoNecessaria = 'excluir-estoque-corte';
    } else {
        mostrarPopupMensagem(`Erro interno: Tipo de corte desconhecido para exclusão.`, 'erro');
        return;
    }

    if (!permissoes.includes(permissaoNecessaria)) {
        mostrarPopupMensagem(`Você não tem permissão para excluir cortes ${tipoCorte === 'pendente' ? 'pendentes' : 'em estoque'}.`, 'erro');
        return; // Impede a execução
    }
    
    const checkboxes = document.querySelectorAll(`#${tbodyId} .checkbox-corte-item:checked`);
    if (checkboxes.length === 0) {
        mostrarPopupMensagem('Selecione pelo menos um corte para excluir.', 'aviso');
        return;
    }

    if (confirm(`Tem certeza que deseja excluir os ${checkboxes.length} corte${checkboxes.length > 1 ? 's' : ''} selecionado${checkboxes.length > 1 ? 's' : ''}? Esta ação também cancelará qualquer OP associada.`)) {
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
                    const corteId = cb.dataset.id;
                    // A função excluirCorte no frontend deve chamar a API DELETE
                    // E a API DELETE no backend fará todo o trabalho pesado.
                    await excluirCorte(corteId);
                } catch (errorIndividual) {
                    console.error(`Erro ao excluir corte ID ${cb.dataset.id}:`, errorIndividual);
                    algumErro = true;
                    // Mostrar mensagem de erro mais detalhada, se disponível
                    mostrarPopupMensagem(`Erro ao excluir corte ID ${cb.dataset.id}: ${errorIndividual.message.substring(0,100)}`, 'erro');
                }
            }
            if (!algumErro) {
                mostrarPopupMensagem('Cortes selecionados excluídos com sucesso!', 'sucesso');
            } else {
                mostrarPopupMensagem('Alguns cortes não puderam ser excluídos. Verifique o console.', 'aviso');
            }
            
            limparCacheCortes();
            limparCacheOrdens();
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
}


function handleExcluirCortesPendentes() { handleExcluirCortes('tabelaCortesPendentesBody', 'pendente', loadCortesPendentesViewContent); }
function handleExcluirCortesEstoque() { handleExcluirCortes('tabelaCortesEmEstoqueBody', 'cortados', loadCortesEmEstoqueViewContent); }

// --- TOGGLEVIEW ---

async function toggleView() {
    const views = {
        opListView: document.getElementById('opListView'),
        opFormView: document.getElementById('opFormView'),
        opEditView: document.getElementById('opEditView'),
        corteView: document.getElementById('corteView'),
        cortesPendentesView: document.getElementById('cortesPendentesView'),
        cortesEmEstoqueView: document.getElementById('cortesEmEstoqueView')
    };

    const opNumeroTitle = document.getElementById('opNumero');
    const editProdutoOPInput = document.getElementById('editProdutoOP');
    const editVarianteContainer = document.getElementById('editVarianteContainer');
    const editVarianteInput = document.getElementById('editVarianteOP');
    const editQuantidadeOPInput = document.getElementById('editQuantidadeOP');
    const editDataEntregaOPInput = document.getElementById('editDataEntregaOP');
    const etapasContainer = document.getElementById('etapasContainer');
    const btnFinalizarOP = document.getElementById('finalizarOP');
    const btnCancelarOPNaEdicao = document.getElementById('cancelarOP');

    for (const key in views) {
        if (views[key]) {
            views[key].style.display = 'none';
        }
    }

    const hash = window.location.hash;

    if (hash.startsWith('#editar/')) {
        console.log('[toggleView] Preparando para exibir tela de edição. Resetando campos da UI...');
        if (opNumeroTitle) opNumeroTitle.textContent = 'Carregando OP...';
    if (editProdutoOPInput) editProdutoOPInput.value = '';
    if (editVarianteContainer) editVarianteContainer.style.display = 'none';
    if (editVarianteInput) editVarianteInput.value = '';
    if (editQuantidadeOPInput) editQuantidadeOPInput.value = '';
    if (editDataEntregaOPInput) editDataEntregaOPInput.value = '';
    if (etapasContainer) etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';
    
    // Limpa também o accordion da OP Filha
    const opFilhaAccordion = document.getElementById('opFilhaAccordion');
    if (opFilhaAccordion) {
        opFilhaAccordion.style.display = 'none';
        const feedbackDiv = document.getElementById('opFilhaFeedback');
        if (feedbackDiv) feedbackDiv.style.display = 'none';
    }

    if (btnFinalizarOP) btnFinalizarOP.disabled = true;
    if (btnCancelarOPNaEdicao) btnCancelarOPNaEdicao.disabled = true;
    }

    if (hash.startsWith('#editar/') && permissoes.includes('editar-op')) {
        if (views.opEditView) {
            views.opEditView.style.display = 'block';
            const editIdFromHash = hash.split('/')[1];

            if (!editIdFromHash) {
                mostrarPopupMensagem('ID da OP inválido na URL.', 'erro');
                window.location.hash = '';
                return;
            }
            try {
                // Usa a nova API para buscar UMA OP
                const token = localStorage.getItem('token');
                const response = await fetch(`/api/ordens-de-producao/${encodeURIComponent(editIdFromHash)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}.` }));
                    throw new Error(`Erro ao carregar OP para edição: ${errorData.error || JSON.stringify(errorData)}`);
                }
                
                const opParaEditar = await response.json();
                if (opParaEditar) {
                    console.log(`[toggleView #editar] OP encontrada:`, opParaEditar);
                    
                    if (opNumeroTitle) opNumeroTitle.textContent = `OP n°: ${opParaEditar.numero}`;
                    
                    const editProdutoOPInput = document.getElementById('editProdutoOP');
                    if (editProdutoOPInput) {
                        // **A API GET /:id já retorna 'produto' com o nome, então isso deve funcionar**
                        editProdutoOPInput.value = opParaEditar.produto || 'Produto não encontrado'; 
                        editProdutoOPInput.disabled = true;
                    }
                    
                    
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
                    await loadEtapasEdit(opParaEditar, false);
                } else {
                    mostrarPopupMensagem('Ordem de Produção para edição não encontrada.', 'erro');
                    if (opNumeroTitle) opNumeroTitle.textContent = 'OP não encontrada';
                    if (etapasContainer) etapasContainer.innerHTML = '<p style="color:red; text-align:center;">OP não encontrada.</p>';
                }
            } catch (error) {
                mostrarPopupMensagem(`Erro ao carregar OP: ${error.message.substring(0,100)}`, 'erro');
                if (opNumeroTitle) opNumeroTitle.textContent = 'Erro ao carregar OP';
                if (etapasContainer) etapasContainer.innerHTML = `<p style="color:red; text-align:center;">Erro ao carregar OP: ${error.message.substring(0,100)}</p>`;
            }
        } else {
            console.warn('[toggleView] Elemento opEditView não encontrado no DOM.');
        }
    } else if (hash === '#adicionar') {
    if (permissoes.includes('criar-op')) {
        if (views.opFormView) {
            views.opFormView.style.display = 'block';
            limparFormularioOP();
            // FORÇA A ATUALIZAÇÃO DO CACHE ANTES DE POPULAR O SELECT
            console.log("[toggleView #adicionar] Forçando atualização de produtos do storage...");
            await obterProdutosDoStorage(true);
            await loadProdutosSelect();
            await loadVariantesSelects('');
            } else {
                console.warn('[toggleView] Elemento opFormView não encontrado no DOM.');
            }
        } else {
            // Se não tem permissão, exibe mensagem e redireciona
            if (views.opFormView) views.opFormView.innerHTML = '<p style="color:red; text-align:center; padding: 20px;">Você não tem permissão para criar Ordens de Produção.</p>';
            mostrarPopupMensagem('Permissão negada para criar Ordens de Produção.', 'erro');
            window.location.hash = ''; // Redireciona para a lista principal
        }
    } else if (hash === '#corte') {
    if (permissoes.includes('registrar-corte')) {
        if (views.corteView) {
            views.corteView.style.display = 'block';
            limparFormularioCorte();
            // FORÇA A ATUALIZAÇÃO DO CACHE ANTES DE POPULAR O SELECT
            console.log("[toggleView #corte] Forçando atualização de produtos do storage...");
            await obterProdutosDoStorage(true);
            await loadProdutosCorte();
            setCurrentDateForCorte();
                const produtoCorteSelect = document.getElementById('produtoCorte');
                if (produtoCorteSelect && !produtoCorteSelect.dataset.eventAttached) {
                    produtoCorteSelect.addEventListener('change', async (e) => {
                        // e.target.value agora é o ID do produto, o que está correto para a nova função.
                        await loadVariantesCorte(e.target.value);
                    });
                    produtoCorteSelect.dataset.eventAttached = 'true';
                }
                await loadVariantesCorte('');
            } else {
                console.warn('[toggleView] Elemento corteView não encontrado no DOM.');
            }
        } else {
            if (views.corteView) views.corteView.innerHTML = '<p style="color:red; text-align:center; padding: 20px;">Você não tem permissão para registrar cortes.</p>';
            mostrarPopupMensagem('Permissão negada para registrar cortes.', 'erro');
            window.location.hash = '';
        }
    } else if (hash === '#cortes-pendentes') {
        if (permissoes.includes('acesso-ordens-de-producao')) { // Acesso geral para a página
            if (views.cortesPendentesView) {
                views.cortesPendentesView.style.display = 'block';
                await loadCortesPendentesViewContent(true);
            } else {
                console.error('[toggleView] Elemento cortesPendentesView não encontrado!');
            }
        } else {
            if (views.cortesPendentesView) views.cortesPendentesView.innerHTML = '<p style="color:red; text-align:center; padding: 20px;">Você não tem permissão para visualizar cortes pendentes.</p>';
            mostrarPopupMensagem('Permissão negada para visualizar cortes pendentes.', 'erro');
            window.location.hash = '';
        }
    } else if (hash === '#cortes-em-estoque') {
        if (permissoes.includes('acesso-ordens-de-producao')) { // Acesso geral para a página
            if (views.cortesEmEstoqueView) {
                views.cortesEmEstoqueView.style.display = 'block';
                await loadCortesEmEstoqueViewContent(true);
            } else {
                console.error('[toggleView] Elemento cortesEmEstoqueView não encontrado!');
            }
        } else {
            if (views.cortesEmEstoqueView) views.cortesEmEstoqueView.innerHTML = '<p style="color:red; text-align:center; padding: 20px;">Você não tem permissão para visualizar cortes em estoque.</p>';
            mostrarPopupMensagem('Permissão negada para visualizar cortes em estoque.', 'erro');
            window.location.hash = '';
        }
    } else if (hash === '#acessocortes') {
        console.log('[toggleView] Redirecionando de #acessocortes para #cortes-pendentes');
        window.location.hash = '#cortes-pendentes';
    } else {
        const opListView = document.getElementById('opListView');

        if (opListView) {
            opListView.style.display = 'block';
            const statusFilter = document.getElementById('statusFilter');
            
            if (statusFilter) {
                statusFilter.querySelectorAll('.op-botao-filtro').forEach(btn => {
                    btn.classList.remove('active');
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
            
            const activeSortTh = document.querySelector('.tabela-op th[data-sort]:not([data-sort=""])');
            let sortConfigParaLoad = { criterio: 'numero', ordem: 'desc' };
            if (activeSortTh) {
                sortConfigParaLoad.criterio = activeSortTh.id.replace('sort', '').toLowerCase();
                sortConfigParaLoad.ordem = activeSortTh.dataset.sort || 'desc';
            }

            await loadOPTable(
                'todas',
                document.getElementById('searchOP')?.value || '',
                sortConfigParaLoad,
                1,
                true,
                null
            );
            
            aplicarCorAoFiltroAtivo(); 

        } else {
            console.warn('[toggleView] Elemento opListView não encontrado no DOM.');
        }
    }
}

// --- LOAD OPTABLE & ORDENAÇÃO ---
async function loadOPTable(
    filterStatus = 'todas',
    search = '',
    sortConfig = { criterio: 'numero', ordem: 'desc' },
    page = 1,
    forceUpdate = false,
    statusApiFilter = null
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
        if (tableWrapper) {
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

    // --- INÍCIO DA CORREÇÃO DE LISTENERS (REMOVER ANTES DE ADICIONAR NOVOS) ---
    if (opTableBody.handleOPTableClickAttached) {
        opTableBody.removeEventListener('click', opTableBody.handleOPTableClickAttached);
        opTableBody.handleOPTableClickAttached = null;
    }

    if (opTableBody.handleCancelarOPListaClickAttached) {
        opTableBody.removeEventListener('click', opTableBody.handleCancelarOPListaClickAttached);
        opTableBody.handleCancelarOPListaClickAttached = null;
    }
    // --- FIM DA CORREÇÃO DE LISTENERS ---

    try {
        console.log(`[loadOPTable] Iniciando. Filtro UI: ${filterStatus}, Busca: "${search}", Sort: ${sortCriterio}-${sortOrdem}, Página: ${page}, Filtro API: ${statusApiFilter}`);
        const fetchAllParaAPI = false;
        const usarNoStatusFilterAPI = false;

        const data = await obterOrdensDeProducao(
            page,
            fetchAllParaAPI,
            forceUpdate,
            statusApiFilter,
            usarNoStatusFilterAPI,
            search
        );

        // LOG DE DEPURAÇÃO: Vamos ver o que a API está realmente retornando.
        console.log("Dados recebidos em loadOPTable:", data.rows);

        if (!data || !Array.isArray(data.rows)) {
            console.error('[loadOPTable] ERRO: Dados de OPs retornados pela API são inválidos ou data.rows não é um array. Valor de data.rows:', data.rows);
            throw new Error('Dados de OPs retornados pela API são inválidos ou data.rows não é um array.');
        }

        let oPsParaProcessar = data.rows;
        const resultadoOrdenacao = ordenarOPs([...oPsParaProcessar], sortCriterio, sortOrdem);

        console.log('[loadOPTable] Resultado DIRETO de ordenarOPs:', resultadoOrdenacao ? `Array com ${resultadoOrdenacao.length} itens` : resultadoOrdenacao);

        if (Array.isArray(resultadoOrdenacao)) {
            filteredOPsGlobal = resultadoOrdenacao;
        } else {
            console.error('[loadOPTable] ERRO CRÍTICO: ordenarOPs não retornou um array! Retornou:', resultadoOrdenacao, '. Usando array vazio como fallback.');
            filteredOPsGlobal = [];
        }
        console.log('[loadOPTable] filteredOPsGlobal após ordenação e verificação. Length:', filteredOPsGlobal ? filteredOPsGlobal.length : 'undefined');
        
        let opsPaginadas = filteredOPsGlobal;
        let totalItemsParaPaginar = data.total;
        let totalPagesCalculadas = data.pages || 1;

        console.log(`[loadOPTable] Usando OPs paginadas pela API (após ordenação local): ${opsPaginadas.length}. Total Páginas API: ${totalPagesCalculadas}`);

        if (opsPaginadas.length === 0 && totalItemsParaPaginar > 0 && page > 1 && totalPagesCalculadas > 0) {
            console.log(`[loadOPTable] Página ${page} fora do intervalo (${totalPagesCalculadas} págs). Recarregando página 1.`);
            const statusFilterContainer = document.getElementById('statusFilter');
            const uiStatus = statusFilterContainer.querySelector('.op-botao-filtro.active')?.dataset.status || 'todas';
            const searchTerm = document.getElementById('searchOP')?.value || '';
            const activeSortTh = document.querySelector('.tabela-op th[data-sort]:not([data-sort=""])');
            const sortCriterioRec = activeSortTh ? activeSortTh.id.replace('sort', '').toLowerCase() : 'numero';
            const sortOrdemRec = activeSortTh ? activeSortTh.dataset.sort || 'desc' : 'desc';
            const apiStatusRec = (uiStatus === 'todas') ? null : uiStatus;
            return loadOPTable(uiStatus, searchTerm, { criterio: sortCriterioRec, ordem: sortOrdemRec }, 1, true, apiStatusRec);
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
                    const etapaCorte = op.etapas?.find(et => et.processo && et.processo.toLowerCase() === 'corte');
                    if (etapaCorte && !etapaCorte.lancado) {
                        statusDisplayHtml += ` <a href="#cortes-pendentes" class="link-corte-pendente" title="Corte pendente">(⚠️ Corte Pendente)</a>`;
                    }
                }

        let acoesHtml = '';
        if (op.status === 'em-aberto' || op.status === 'produzindo') {
            acoesHtml = `<button
                             class="op-botao-acao-tabela op-botao-cancelar-lista"
                             data-op-numero="${op.numero}"
                             data-op-edit-id="${op.edit_id}"
                             title="Cancelar OP #${op.numero}">
                                <i class="fas fa-ban"></i>
                          </button>`;
        } else if (op.status === 'cancelada' || op.status === 'finalizado') {
            acoesHtml = `<span class="op-acao-placeholder">-</span>`;
        }

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


        // Nova função handler para o clique no botão de cancelar da lista
        const newCancelarListener = async function(event) {
    const targetButton = event.target.closest('.op-botao-cancelar-lista');

    if (targetButton) {
        if (!permissoes.includes('cancelar-op')) {
            mostrarPopupMensagem('Você não tem permissão para cancelar Ordens de Produção.', 'erro');
            return; // Impede a execução do restante do código
        }

        event.stopPropagation();
                
                const opNumero = targetButton.dataset.opNumero;
                const opEditId = targetButton.dataset.opEditId;
                
                console.log(`[newCancelarListener] Ação de cancelar para OP #${opNumero} (edit_id: ${opEditId})`);

                if (confirm(`Tem certeza que deseja CANCELAR a Ordem de Produção #${opNumero}? Esta ação não pode ser desfeita.`)) {
                    const originalButtonHTML = targetButton.innerHTML;
                    targetButton.disabled = true;
                    targetButton.innerHTML = '<div class="spinner-btn-interno"></div>';

                    try {
                        const token = localStorage.getItem('token');
                        const response = await fetch(`/api/ordens-de-producao/${encodeURIComponent(opEditId)}`, { headers: { 'Authorization': `Bearer ${token}` } });
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}.` }));
                            throw new Error(`Erro ao buscar OP para cancelamento: ${errorData.error}`);
                        }
                        const opParaCancelar = await response.json();

                        if (!opParaCancelar) {
                            throw new Error('OP não encontrada para cancelamento.');
                        }
                        if (opParaCancelar.status === 'finalizado' || opParaCancelar.status === 'cancelada') {
                            mostrarPopupMensagem(`OP #${opNumero} já está ${opParaCancelar.status} e não pode ser cancelada.`, 'aviso');
                            return;
                        }

                        opParaCancelar.status = 'cancelada';
                        
                        await window.saveOPChanges(opParaCancelar);
                        
                        mostrarPopupMensagem(`Ordem de Produção #${opNumero} cancelada com sucesso!`, 'sucesso');
                        limparCacheOrdens();
                        
                        const statusFilterContainer = document.getElementById('statusFilter');
                        const uiStatus = statusFilterContainer.querySelector('.op-botao-filtro.active')?.dataset.status || 'todas';
                        const searchTerm = document.getElementById('searchOP')?.value || '';
                        const activeSortTh = document.querySelector('.tabela-op th[data-sort]:not([data-sort=""])');
                        
                        const sortCriterio = activeSortTh ? activeSortTh.id.replace('sort', '').toLowerCase() : 'numero';
                        const sortOrdem = activeSortTh ? activeSortTh.dataset.sort || 'desc' : 'desc';
                        const apiStatus = (uiStatus === 'todas') ? null : uiStatus;

                        await loadOPTable(uiStatus, searchTerm, {criterio: sortCriterio, ordem: sortOrdem}, currentPage, true, apiStatus);

                    } catch (error) {
                        console.error(`[newCancelarListener] Erro ao cancelar OP #${opNumero}:`, error);
                        mostrarPopupMensagem(`Erro ao cancelar OP: ${error.message.substring(0,100)}`, 'erro');
                    } finally {
                        targetButton.disabled = false;
                        targetButton.innerHTML = originalButtonHTML;
                    }
                } else {
                    console.log(`[newCancelarListener] Cancelamento da OP #${opNumero} abortado pelo usuário.`);
                }
            }
        };


        opTableBody.addEventListener('click', newCancelarListener);
        opTableBody.handleCancelarOPListaClickAttached = newCancelarListener;
        console.log('[loadOPTable] Listener para botões de cancelar na lista adicionado.');

        if (permissoes.includes('editar-op')) {
        opTableBody.addEventListener('click', handleOPTableClick);
        opTableBody.handleOPTableClickAttached = handleOPTableClick;
        }

        opTableBody.querySelectorAll('.op-botao-cancelar-lista').forEach(btn => {
            if (!permissoes.includes('cancelar-op')) {
            btn.classList.add('disabled-by-permission');
        } else {
        btn.classList.remove('disabled-by-permission');
        }
        });

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

                loadOPTable(filterStatus, search, sortConfig, newPage, false, statusApiFilter);
            });
            });
        }
    } catch (error) {
        console.error('[loadOPTable] Erro ao carregar e renderizar OPs:', error);
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

// --- FUNÇÕES DE ETAPAS ---
async function getTipoUsuarioPorProcesso(processo, produtoId) { // <== RECEBE ID
    const cacheKey = `${produtoId}-${processo}`; // Cache por ID
    if (tipoUsuarioProcessoCache.has(cacheKey)) {
        return tipoUsuarioProcessoCache.get(cacheKey);
    }

    const todosOsProdutos = await obterProdutosDoStorage();
    const produto = todosOsProdutos.find(p => p.id == produtoId); // <== USA ID
    let tipoUsuario = '';
    if (produto && produto.etapas) {
        const etapaConfig = produto.etapas.find(e => (typeof e === 'object' ? e.processo : e) === processo);
        tipoUsuario = etapaConfig ? (typeof etapaConfig === 'object' ? etapaConfig.feitoPor : null) : '';
    }

    tipoUsuarioProcessoCache.set(cacheKey, tipoUsuario);
    return tipoUsuario;
}

async function loadEtapasEdit(op, skipReload = false) {
    if (isLoadingEtapas && !skipReload) {
        console.log(`[loadEtapasEdit] Carregamento de etapas para OP ${op?.numero} já em andamento. Ignorando.`);
        return;
    }
    isLoadingEtapas = true;
    const etapasContainer = document.getElementById('etapasContainer');
    const finalizarBtn = document.getElementById('finalizarOP');

    if (!op || !etapasContainer) {
        console.error('[loadEtapasEdit] Elementos essenciais (op, etapasContainer) não encontrados ou OP inválida.');
        if (etapasContainer) etapasContainer.innerHTML = '<p style="color:red;">Erro: OP ou container de etapas inválido.</p>';
        isLoadingEtapas = false;
        return;
    }
    etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';

    try {
        // --- BUSCA DE DADOS (Esta parte continua igual) ---
        const [produtos, usuarios, lancamentosDb, cortesPendentes, cortesCortados, cortesVerificados, cortesUsados] = await Promise.all([
            obterProdutosDoStorage(),
            obterUsuarios(),
            obterLancamentos(op.numero, true),
            obterCortes('pendente', true),
            obterCortes('cortados', true),
            obterCortes('verificado', true),
            obterCortes('usado', true)
        ]);
        const todosCortes = [...cortesPendentes, ...cortesCortados, ...cortesVerificados, ...cortesUsados];

        const produtoConfig = produtos.find(p => p.id == op.produto_id);
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

        op.etapas = op.etapas.map((etapaDaOp, index) => {
            const lancamentosDaEtapa = lancamentosDb
                .filter(l => l.etapa_index === index && l.processo === etapaDaOp.processo)
                .sort((a, b) => new Date(b.data) - new Date(a.data));

            if (lancamentosDaEtapa.length > 0) {
                const ultimoLanc = lancamentosDaEtapa[0];
                return {
                    ...etapaDaOp,
                    usuario: ultimoLanc.funcionario || etapaDaOp.usuario || '',
                    quantidade: ultimoLanc.quantidade || etapaDaOp.quantidade || 0,
                    lancado: true,
                    ultimoLancamentoId: ultimoLanc.id || etapaDaOp.ultimoLancamentoId
                };
            }
            if (etapaDaOp.processo && etapaDaOp.processo.toLowerCase() === 'corte') {
                return { ...etapaDaOp, lancado: etapaDaOp.lancado || false, quantidade: etapaDaOp.quantidade || 0 };
            }
            return { ...etapaDaOp, lancado: false, quantidade: etapaDaOp.quantidade || 0, ultimoLancamentoId: null };
        });

        const corteEtapaIndex = op.etapas.findIndex(e => e.processo && e.processo.toLowerCase() === 'corte');
        let etapaCorteOriginalmenteLancada = false;
        let etapaCorteModificadaNoLoad = false;

        if (corteEtapaIndex !== -1) {
            etapaCorteOriginalmenteLancada = op.etapas[corteEtapaIndex].lancado;

            const corteAssociadoOP = todosCortes.find(c => c.op && String(c.op) === String(op.numero));
            let corteParaUsar = corteAssociadoOP;

            if (!corteParaUsar) {
                if (op.status === 'em-aberto' || !op.etapas[corteEtapaIndex].lancado) {
                    corteParaUsar = todosCortes.find(c =>
                        !c.op &&
                        c.produto_id == op.produto_id && 
                        (c.variante || null) === (op.variante || null) &&
                        ['cortados', 'verificado', 'usado'].includes(c.status) &&
                        c.quantidade >= op.quantidade
                    );
                }
            }
            
            if (corteParaUsar) {
                op.etapas[corteEtapaIndex].quantidade = corteParaUsar.quantidade || op.quantidade;
                if (['cortados', 'verificado', 'usado'].includes(corteParaUsar.status)) {
                    op.etapas[corteEtapaIndex].usuario = corteParaUsar.cortador || 'Sistema';
                    op.etapas[corteEtapaIndex].lancado = true;
                } else {
                    op.etapas[corteEtapaIndex].lancado = false;
                    op.etapas[corteEtapaIndex].usuario = corteParaUsar.cortador || '';
                    console.log(`[loadEtapasEdit] Etapa Corte da OP #${op.numero} PENDENTE (Status do corte: ${corteParaUsar.status}).`);
                }
            } else {
                op.etapas[corteEtapaIndex].lancado = false;
                op.etapas[corteEtapaIndex].usuario = '';
                op.etapas[corteEtapaIndex].quantidade = op.quantidade;
                console.log(`[loadEtapasEdit] Nenhum corte encontrado para OP #${op.numero}. Etapa Corte marcada como PENDENTE.`);
            }

            if (op.etapas[corteEtapaIndex].lancado !== etapaCorteOriginalmenteLancada) {
                etapaCorteModificadaNoLoad = true;
            }
        }

        const statusOriginalDaOP = op.status;
        const todasEtapasCompletasAntes = await verificarEtapasEStatus(op);

        if (etapaCorteModificadaNoLoad || (op.status !== statusOriginalDaOP)) {
            console.log(`[loadEtapasEdit] Etapa de corte ou status geral da OP #${op.numero} modificado. Salvando OP.`);
            try {
                const opSalva = await window.saveOPChanges(op);
                Object.assign(op, opSalva);

                console.log(`[loadEtapasEdit] OP #${op.numero} salva e objeto local atualizado.`);
            } catch (error) {
                console.error(`[loadEtapasEdit] Erro ao salvar OP automaticamente após atualização de corte/status:`, error);
                mostrarPopupMensagem(`Erro ao atualizar OP automaticamente: ${error.message.substring(0,100)}`, 'erro');
            }
        }

        etapasContainer.innerHTML = '';
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
                    nomeInputCorte.value = etapa.usuario || 'N/A';
                } else {
                    statusInputCorte.value = 'Aguardando corte';
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
                        link.textContent = `Ver Detalhes do Corte (PC: ${cortePendenteAssociado.pn})`;
                        link.className = 'link-corte-pendente-etapa';
                        linkDiv.appendChild(link);
                    } else {
                        linkDiv.textContent = "(Corte pendente não localizado ou já processado)";
                        linkDiv.style.fontStyle = "italic";
                        linkDiv.style.color = "#6c757d";
                    }
                    row.appendChild(linkDiv);
                }
            } else {
                const tipoUsuarioEtapa = await getTipoUsuarioPorProcesso(etapa.processo, op.produto_id);
                const exigeQtd = tipoUsuarioEtapa === 'costureira' || tipoUsuarioEtapa === 'tiktik';

                const userSelect = document.createElement('select');
                userSelect.className = 'select-usuario';

                const defaultOptText = getUsuarioPlaceholder(tipoUsuarioEtapa);
                userSelect.add(new Option(defaultOptText, ''));
                
                const usuariosFiltradosParaEtapa = usuarios.filter(u => Array.isArray(u.tipos) && u.tipos.includes(tipoUsuarioEtapa));
                usuariosFiltradosParaEtapa.forEach(u => userSelect.add(new Option(u.nome, u.nome)));
                
                if (etapa.usuario) {
                    userSelect.value = etapa.usuario;
                }
                row.appendChild(userSelect);

                if (exigeQtd) {
                    row.appendChild(criarQuantidadeDiv(etapa, op, userSelect, false, row));
                }
            }
            fragment.appendChild(row);
        }
        etapasContainer.appendChild(fragment);

        await atualizarVisualEtapas(op, true);
        await updateFinalizarButtonState(op);


     // ==========================================================
        // >> CORREÇÃO: LÓGICA DO ACCORDION E BLOQUEIO <<
        // ==========================================================
        const opFilhaAccordion = document.getElementById('opFilhaAccordion');
        if (opFilhaAccordion) {
            const opFilhaVarianteInfo = document.getElementById('opFilhaVarianteInfo');
            const opFilhaFeedback = document.getElementById('opFilhaFeedback');
            const opFilhaConteudo = opFilhaAccordion.querySelector('.op-accordion-conteudo');
            const opFilhaQtdInput = document.getElementById('quantidadeOpFilha');
            const btnCriar = document.getElementById('btnCriarOpFilha');

            // 1. Reseta a aparência do accordion sempre que uma nova OP é carregada
            opFilhaAccordion.classList.remove('active');
            if (opFilhaConteudo) opFilhaConteudo.style.maxHeight = null;
            if (opFilhaFeedback) opFilhaFeedback.style.display = 'none';
            if (opFilhaQtdInput) opFilhaQtdInput.value = '';
            
            // 2. Verifica se deve mostrar o accordion (apenas para o produto certo)
            if (op.produto === 'Scrunchie (Padrão)') {
                opFilhaAccordion.style.display = 'block';
                if (opFilhaVarianteInfo) opFilhaVarianteInfo.textContent = op.variante || 'Não definida';

                // 3. FAZ A VERIFICAÇÃO NA API para ver se a filha já existe
                const token = localStorage.getItem('token');
                const response = await fetch(`/api/ordens-de-producao/check-op-filha/${op.numero}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                
                // 4. BLOQUEIA A UI se a filha já existe
                if (data.existe) {
                    if (opFilhaQtdInput) opFilhaQtdInput.disabled = true;
                    if (btnCriar) {
                        btnCriar.disabled = true;
                        btnCriar.innerHTML = '<i class="fas fa-check"></i> OP Filha já criada';
                    }
                    if (opFilhaFeedback) {
                        opFilhaFeedback.className = 'op-filha-feedback';
                        opFilhaFeedback.style.backgroundColor = '#e9ecef';
                        opFilhaFeedback.style.border = '1px solid #ced4da';
                        opFilhaFeedback.innerHTML = `<p>Uma OP filha já foi gerada a partir desta OP. Não é possível criar outra.</p>`;
                        opFilhaFeedback.style.display = 'block';
                    }
                    // Força a abertura do accordion para mostrar a mensagem
                    if (!opFilhaAccordion.classList.contains('active')) {
                        opFilhaAccordion.classList.add('active');
                        if (opFilhaConteudo) opFilhaConteudo.style.maxHeight = (opFilhaConteudo.scrollHeight + 40) + "px";
                    }
                } else {
                    // GARANTE QUE ESTÁ DESBLOQUEADO se a filha não existe
                    if (opFilhaQtdInput) opFilhaQtdInput.disabled = false;
                    if (btnCriar) {
                        btnCriar.disabled = false;
                        btnCriar.innerHTML = '<i class="fas fa-plus-circle"></i> Criar OP Filha';
                    }
                }
            } else {
                // Esconde o accordion para outros produtos
                opFilhaAccordion.style.display = 'none';
            }
        }
        
    } catch (e) {
        console.error('[loadEtapasEdit] Erro fatal ao carregar etapas:', e.message, e.stack);
        etapasContainer.innerHTML = `<p style="color:red; text-align:center; padding:10px;">Erro crítico ao carregar etapas: ${e.message.substring(0, 150)}. Tente recarregar a OP.</p>`;
        if (finalizarBtn) finalizarBtn.disabled = true;
    } finally {
        isLoadingEtapas = false;
    }
}

async function salvarProducao(op, etapa, etapaIndex) { // etapaIndex ainda é útil para atualizar op.etapas[etapaIndex]
    console.log("[salvarProducao] Iniciando. Objeto OP recebido:", op, "Etapa:", etapa, "EtapaIndex:", etapaIndex);

    if (!op.produto_id) {
        throw new Error("ERRO CRÍTICO: Não foi possível identificar o produto da OP. Recarregue a página e tente novamente.");
    }
    if (!etapa.usuario) {
        throw new Error(`Funcionário não selecionado para a etapa "${etapa.processo}"`);
    }

    const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto_id);
    const exigeQtd = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';

    if (exigeQtd && (!etapa.quantidade || parseInt(etapa.quantidade) <= 0)) {
        throw new Error('A quantidade para esta etapa deve ser um número positivo.');
    }
    
    // 2. Montagem do objeto de dados para a API
    const produtoConfig = (await obterProdutosDoStorage()).find(p => p.id == op.produto_id);

    if (!produtoConfig || !produtoConfig.etapas || !Array.isArray(produtoConfig.etapas)) {
        console.error(`[salvarProducao] Configuração do produto (ID: ${op.produto_id}) ou suas etapas não encontradas.`);
        // Decida como tratar: erro ou máquina padrão? Por ora, erro para forçar a correção da config.
        throw new Error(`Configuração de etapas não encontrada para o produto ID ${op.produto_id}. Verifique o cadastro do produto.`);
    }

    // ***** INÍCIO DA MUDANÇA CRUCIAL *****
    // Encontrar a configuração da etapa em produtoConfig pelo NOME DO PROCESSO
    const etapaConfigNoProduto = produtoConfig.etapas.find(eConfig => {
        const nomeProcessoConfig = typeof eConfig === 'object' ? eConfig.processo : eConfig;
        return nomeProcessoConfig === etapa.processo;
    });

    let maquinaParaSalvar = null;
    if (etapaConfigNoProduto && typeof etapaConfigNoProduto === 'object' && etapaConfigNoProduto.maquina) {
        maquinaParaSalvar = etapaConfigNoProduto.maquina;
    } else {
        // Se a etapa de configuração não for encontrada ou não tiver 'maquina'
        // OU se a 'etapa' do produto for apenas uma string de processo (sem objeto de máquina)
        // Você precisa decidir o que fazer. Se máquina é obrigatória, lance um erro.
        // Se pode haver etapas sem máquina e o banco permite NULL (o que não é o seu caso atual),
        // aqui seria null. Como o banco NÃO permite null, precisamos de um valor ou um erro.
        console.warn(`[salvarProducao] Máquina não definida na configuração do produto (ID: ${op.produto_id}) para o processo "${etapa.processo}".`);
        // Se a máquina é absolutamente necessária e não pode ser null:
        throw new Error(`Máquina não configurada para o processo "${etapa.processo}" do produto ID ${op.produto_id}. Verifique o cadastro do produto.`);
        // Ou, se você tivesse um valor padrão para "Não Usa" e o banco aceitasse:
        // maquinaParaSalvar = "Não Usa";
    }
    console.log(`[salvarProducao] Máquina determinada para o processo "${etapa.processo}": ${maquinaParaSalvar}`);
    // ***** FIM DA MUDANÇA CRUCIAL *****

    const dados = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        opNumero: op.numero,
        etapaIndex, // O etapaIndex original ainda é útil para saber qual etapa da OP foi lançada
        processo: etapa.processo,
        produto_id: op.produto_id,
        variacao: op.variante || null,
        maquina: maquinaParaSalvar, // Usa a máquina encontrada pela busca por nome do processo
        quantidade: parseInt(etapa.quantidade) || 0,
        funcionario: etapa.usuario,
        data: new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T'),
        lancadoPor: usuarioLogado?.nome || 'Sistema'
    };

    console.log("[salvarProducao] Objeto de dados pronto para ser enviado para /api/producoes:", dados);

    const response = await fetch('/api/producoes', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}. Tente novamente.` }));
        console.error("[salvarProducao] API de produções retornou um erro:", errorData);
        throw new Error(errorData.error || 'Falha ao salvar lançamento na API.');
    }

    const producaoSalva = await response.json();
    
    // Atualiza o objeto op.etapas[etapaIndex] localmente
    if (op.etapas && op.etapas[etapaIndex]) {
        op.etapas[etapaIndex] = {
            ...op.etapas[etapaIndex], // Mantém outros dados que possam existir
            usuario: dados.funcionario,
            quantidade: dados.quantidade,
            lancado: true,
            ultimoLancamentoId: producaoSalva.id
        };
    } else {
        console.warn(`[salvarProducao] Não foi possível atualizar op.etapas[${etapaIndex}] localmente após salvar produção.`);
    }


    // Tenta salvar o objeto OP inteiro com a etapa atualizada
    // A função saveOPChanges já deve estar ciente de produto_id
    try {
        console.log(`[salvarProducao] Tentando salvar o objeto OP inteiro (número: ${op.numero}) após lançar etapa.`);
        await window.saveOPChanges(op); // saveOPChanges é global e usa produto_id
    } catch (errorSaveOp) {
        console.error(`[salvarProducao] Erro ao tentar salvar o objeto OP completo após lançar etapa: `, errorSaveOp);
        // Decide se isso é um erro fatal ou apenas um aviso
        mostrarPopupMensagem(`Produção da etapa lançada, mas houve um erro ao atualizar o estado geral da OP: ${errorSaveOp.message.substring(0,100)}`, 'aviso');
    }
    
    return producaoSalva.id;
}

async function lancarEtapa(op, etapaIndex, quantidade) {
    const etapa = op.etapas[etapaIndex];
    console.log(`[lancarEtapa] PRE-SALVAR: OP Num: ${op.numero}, Produto ID: ${op.produto_id}, Processo: ${etapa.processo}, EtapaIndex USADO: ${etapaIndex}, Quantidade: ${quantidade}`);
    etapa.quantidade = parseInt(quantidade);
    const novoId = await salvarProducao(op, etapa, etapaIndex);
    if (novoId) {
        etapa.ultimoLancamentoId = novoId; etapa.lancado = true;
        await updateFinalizarButtonState(op);
        const row = document.querySelector(`.etapa-row[data-index="${etapaIndex}"]`);
        if (row) {
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

function criarQuantidadeDiv(etapa, op, usuarioSelect, isEtapaAtualEditavel, row) {
    let quantidadeDiv = row.querySelector('.quantidade-lancar');
    if (!quantidadeDiv) {
        quantidadeDiv = document.createElement('div');
        quantidadeDiv.className = 'quantidade-lancar';
        row.appendChild(quantidadeDiv);
    } else {
        quantidadeDiv.innerHTML = '';
    }

    const quantidadeInput = document.createElement('input');
    quantidadeInput.type = 'number';
    quantidadeInput.min = '1';
    quantidadeInput.value = etapa.quantidade > 0 ? etapa.quantidade : '';
    quantidadeInput.placeholder = 'Qtd';
    quantidadeInput.className = 'quantidade-input op-input';

    const lancarBtn = document.createElement('button');
    lancarBtn.className = 'botao-lancar op-botao';

    quantidadeDiv.appendChild(quantidadeInput);
    quantidadeDiv.appendChild(lancarBtn);

    const etapaIndex = parseInt(row.dataset.index);

    if (isNaN(etapaIndex)) {
        console.error(`[criarQuantidadeDiv] ERRO GRAVE: row.dataset.index não é um número para a linha com processo (inicial): ${etapa.processo}. Isso vai causar problemas. Verifique loadEtapasEdit.`);
    }

    const handleQuantidadeInputChange = async () => {
        const etapaCorretaNoModelo = op.etapas[etapaIndex];
        if (!etapaCorretaNoModelo) {
            console.error(`[HANDLE_QTD_INPUT] Etapa não encontrada no modelo op.etapas no índice ${etapaIndex} para OP ${op.numero}. Processo inicial era ${etapa.processo}`);
            return;
        }

        if (etapaCorretaNoModelo.lancado || op.status === 'finalizado' || op.status === 'cancelada') {
            if (!quantidadeInput.disabled) {
                 quantidadeInput.value = etapaCorretaNoModelo.quantidade > 0 ? etapaCorretaNoModelo.quantidade : '';
            }
            return;
        }

        const novaQuantidade = parseInt(quantidadeInput.value) || 0;

        if (novaQuantidade !== etapaCorretaNoModelo.quantidade) {
            etapaCorretaNoModelo.quantidade = novaQuantidade;
            console.log(`[quantidadeInput change] Quantidade da etapa "${etapaCorretaNoModelo.processo}" (índice ${etapaIndex}) atualizada em memória para: ${novaQuantidade}`);
        }

        await updateLancarBtnVisualState();
    };
    quantidadeInput.addEventListener('input', handleQuantidadeInputChange);


    usuarioSelect.addEventListener('change', async () => {
        const etapaCorretaNoModelo = op.etapas[etapaIndex];
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
                mostrarPopupMensagem('Você não tem autorização para selecionar usuário.', 'erro');
            }
        }
        console.log(`[usuarioSelect change] Chamando atualizarVisualEtapas para OP ${op.numero} após selecionar usuário para etapa ${etapaIndex}`);
        await atualizarVisualEtapas(op);
        await updateFinalizarButtonState(op);
    });

    quantidadeInput.addEventListener('focus', () => {
        isEditingQuantidade = true;
        console.log(`[QTD FOCUS] Etapa Idx: ${etapaIndex}, Processo: ${op.etapas[etapaIndex]?.processo || 'N/A'}. isEditingQuantidade = true`);
    });

    quantidadeInput.addEventListener('blur', () => {
        isEditingQuantidade = false;
        console.log(`[QTD BLUR] Etapa Idx: ${etapaIndex}, Processo: ${op.etapas[etapaIndex]?.processo || 'N/A'}. isEditingQuantidade = false`);
        handleQuantidadeInputChange();
    });

    const updateLancarBtnVisualState = async () => {
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

        const quantidadeAtualNoInput = parseInt(quantidadeInput.value) || 0;
        let temQuantidadeValida = false;
        const tipoUser = await getTipoUsuarioPorProcesso(etapaAtualNoModelo.processo, op.produto);
        const exigeQtd = tipoUser === 'costureira' || tipoUser === 'tiktik';

        if (exigeQtd) {
            temQuantidadeValida = quantidadeAtualNoInput > 0 && quantidadeAtualNoInput <= op.quantidade;
        } else {
            temQuantidadeValida = true;
        }


        const isDisabledGeral = op.status === 'finalizado' || op.status === 'cancelada';
        // AQUI ESTÁ A CORREÇÃO: use etapaIndex em vez de `i`
        const isEtapaEditavelNestaLinha = !isDisabledGeral && etapaIndex === etapaAtualGlobalIndex && !isLancado;

        quantidadeInput.disabled = isDisabledGeral || isLancado || !isEtapaEditavelNestaLinha || !temUsuarioNestaLinha;

        if (quantidadeInput.disabled) {
            quantidadeInput.style.backgroundColor = '#f8f9fa';
        } else {
            quantidadeInput.style.backgroundColor = '';
        }

        lancarBtn.disabled = !podeLancarPermissao ||
                             isLancado ||
                             !isEtapaEditavelNestaLinha ||
                             !temUsuarioNestaLinha ||
                             (exigeQtd && !temQuantidadeValida) ||
                             isDisabledGeral;

        lancarBtn.textContent = isLancado ? 'Lançado' : 'Lançar';
        lancarBtn.dataset.etapaIndex = etapaIndex.toString();

        lancarBtn.classList.toggle('lancado', isLancado);
        lancarBtn.classList.toggle('disabled-not-launched', lancarBtn.disabled && !isLancado);
    };

    const lancarBtnClickHandler = async () => {
        if (lancarBtn.disabled || lancamentosEmAndamento.has(op.edit_id + '-' + op.etapas[etapaIndex]?.processo)) return;
        lancamentosEmAndamento.add(op.edit_id + '-' + op.etapas[etapaIndex]?.processo);

        const originalBtnHTML = lancarBtn.innerHTML;
        lancarBtn.disabled = true;
        lancarBtn.innerHTML = '<div class="spinner-btn-interno"></div> Processando...';

        const indiceDaEtapaParaLancar = etapaIndex;
        const editId = window.location.hash.split('/')[1];
        let opLocalParaLancamento;

        try {
            limparCacheOrdens();
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/ordens-de-producao/${encodeURIComponent(editId)}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}.` }));
                throw new Error(`Erro ao buscar OP atualizada para lançamento: ${errorData.error}`);
            }
            opLocalParaLancamento = await response.json();

            if (!opLocalParaLancamento || !opLocalParaLancamento.etapas || !opLocalParaLancamento.etapas[indiceDaEtapaParaLancar]) {
                throw new Error('Ordem de Produção ou etapa não encontrada para lançamento no índice: ' + indiceDaEtapaParaLancar);
            }

            const etapaDoModeloAtual = opLocalParaLancamento.etapas[indiceDaEtapaParaLancar];
            etapaDoModeloAtual.quantidade = parseInt(quantidadeInput.value);

            const etapasFuturas = await getEtapasFuturasValidas(opLocalParaLancamento, indiceDaEtapaParaLancar);
            let sucessoNoLancamento = false;

            if (etapasFuturas.length > 0) {
                sucessoNoLancamento = await mostrarPopupEtapasFuturas(opLocalParaLancamento, indiceDaEtapaParaLancar, etapasFuturas, quantidadeInput.value);
            } else {
                sucessoNoLancamento = await lancarEtapa(opLocalParaLancamento, indiceDaEtapaParaLancar, quantidadeInput.value);
            }

            if (sucessoNoLancamento) {
                Object.assign(op, opLocalParaLancamento);

                const etapaProcessada = op.etapas[indiceDaEtapaParaLancar];
                if (etapaProcessada && etapaProcessada.lancado) {
                    quantidadeInput.value = etapaProcessada.quantidade;
                }
                mostrarPopupMensagem('Produção lançada com sucesso!', 'sucesso');
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
    lancarBtn.removeEventListener('click', lancarBtnClickHandler);
    lancarBtn.addEventListener('click', lancarBtnClickHandler);

    updateLancarBtnVisualState();

    return quantidadeDiv;
}

async function getEtapasFuturasValidas(op, etapaIndex) {
    const todosOsProdutos = await obterProdutosDoStorage();
    const produtoConfig = todosOsProdutos.find(p => p.id == op.produto_id);
    const etapasProduto = produtoConfig?.etapas || [];
    if (etapaIndex >= etapasProduto.length || etapaIndex >= op.etapas.length) return [];
    const etapaAtualConfig = etapasProduto[etapaIndex];
    const maquinaAtual = (typeof etapaAtualConfig === 'object' ? etapaAtualConfig.maquina : null) || 'Não Usa';
    const tipoUsuarioAtual = await getTipoUsuarioPorProcesso( (typeof etapaAtualConfig === 'object' ? etapaAtualConfig.processo : etapaAtualConfig) , op.produto_id);
    const futuras = [];
    for (let i = etapaIndex + 1; i < op.etapas.length; i++) {
        const proximaEtapaConfig = etapasProduto[i]; if (!proximaEtapaConfig) break;
        const tipoProx = await getTipoUsuarioPorProcesso((typeof proximaEtapaConfig === 'object' ? proximaEtapaConfig.processo : proximaEtapaConfig), op.produto_id);
        const maqProx = (typeof proximaEtapaConfig === 'object' ? proximaEtapaConfig.maquina : null) || 'Não Usa';
        if (tipoProx !== 'costureira' || maqProx !== maquinaAtual) break;
        if (op.etapas[i].lancado) break;
        futuras.push({ index: i, processo: (typeof proximaEtapaConfig === 'object' ? proximaEtapaConfig.processo : proximaEtapaConfig) });
    } return futuras;
}

function mostrarPopupEtapasFuturas(op, etapaIndexAtual, etapasFuturasParaLancar, quantidadeAtual) {
    return new Promise(async (resolve) => {
        const popup = document.createElement('div');
        popup.className = 'popup-etapas';
        popup.style.position = 'fixed';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.backgroundColor = '#fff';
        popup.style.padding = '25px';
        popup.style.border = '1px solid #ccc';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
        popup.style.zIndex = '1002';
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
            checkbox.dataset.etapaIndex = etapaInfo.index;
            checkbox.checked = true;
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

        const buttonContainer = document.createElement('div');
        buttonContainer.style.textAlign = 'center';
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.justifyContent = 'center';


        const btnLancarSelecionadas = document.createElement('button');
        btnLancarSelecionadas.textContent = 'Lançar Selecionadas';
        btnLancarSelecionadas.className = 'ppp-botao ppp-botao-salvar';

        const btnLancarApenasAtual = document.createElement('button');
        btnLancarApenasAtual.textContent = 'Lançar Só Esta';
        btnLancarApenasAtual.className = 'ppp-botao btn-secondary';

        const btnCancelarTudo = document.createElement('button');
        btnCancelarTudo.textContent = 'Cancelar Tudo';
        btnCancelarTudo.className = 'ppp-botao ppp-botao-excluir';

        buttonContainer.append(btnLancarSelecionadas, btnLancarApenasAtual, btnCancelarTudo);
        popup.appendChild(buttonContainer);

        const closePopupAndResolve = (value) => {
            if (document.body.contains(popup)) {
                document.body.removeChild(popup);
            }
            resolve(value);
        };
        
        const validateSequence = () => {
            errorMsgElement.style.display = 'none';
            errorMsgElement.textContent = '';
            btnLancarSelecionadas.disabled = false;

            const selectedIndices = checkboxesInfo
                .filter(info => info.checkboxElement.checked)
                .map(info => info.etapaOriginalIndex)
                .sort((a, b) => a - b);

            if (selectedIndices.length === 0) return true;

            const expectedFirstFutureIndex = etapaIndexAtual + 1;
            if (selectedIndices[0] !== expectedFirstFutureIndex) {
                errorMsgElement.textContent = 'Para lançar em lote, a primeira etapa futura selecionada deve ser a subsequente à atual.';
                errorMsgElement.style.display = 'block';
                btnLancarSelecionadas.disabled = true;
                return false;
            }

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
        validateSequence();


        btnLancarSelecionadas.addEventListener('click', async () => {
            if (!validateSequence()) return;

            btnLancarSelecionadas.disabled = true;
            btnLancarApenasAtual.disabled = true;
            btnCancelarTudo.disabled = true;
            btnLancarSelecionadas.innerHTML = '<div class="spinner-btn-interno"></div> Lançando...';

            let sucessoGeral = false;
            try {
                console.log(`[PopupEtapas] Lançando etapa atual: ${op.etapas[etapaIndexAtual].processo}`);
                const sucessoAtual = await lancarEtapa(op, etapaIndexAtual, quantidadeAtual);
                if (!sucessoAtual) {
                    throw new Error(`Falha ao lançar a etapa atual (${op.etapas[etapaIndexAtual].processo}).`);
                }
                
                const funcionarioEtapaAtual = op.etapas[etapaIndexAtual].usuario;
                if (!funcionarioEtapaAtual) {
                     throw new Error('Funcionário da etapa atual não definido após lançamento. Não é possível prosseguir com etapas futuras.');
                }

                const indicesFuturosSelecionados = checkboxesInfo
                    .filter(info => info.checkboxElement.checked)
                    .map(info => info.etapaOriginalIndex);

                for (const idxFuturo of indicesFuturosSelecionados) {
                    if (op.etapas[idxFuturo] && !op.etapas[idxFuturo].lancado) {
                        console.log(`[PopupEtapas] Lançando etapa futura: ${op.etapas[idxFuturo].processo}`);
                        op.etapas[idxFuturo].usuario = funcionarioEtapaAtual;
                        const sucessoFuturo = await lancarEtapa(op, idxFuturo, quantidadeAtual);
                        if (!sucessoFuturo) {
                            throw new Error(`Falha ao lançar a etapa futura (${op.etapas[idxFuturo].processo}).`);
                        }
                    }
                }
                sucessoGeral = true;
            } catch (error) {
                console.error('[PopupEtapas] Erro ao lançar etapas em lote:', error);
                mostrarPopupMensagem(`Erro: ${error.message.substring(0,150)}`, 'erro');
                sucessoGeral = false; 
            } finally {
                closePopupAndResolve(sucessoGeral);
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
            closePopupAndResolve(false);
        });

        document.body.appendChild(popup);
    });
}


async function determinarEtapaAtual(op) {
    if (!op || !op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) {
        return 0; 
    }

    // ==========================================================
    // >> NOVA REGRA DE BLOQUEIO DO CORTE <<
    // ==========================================================
    const etapaCorteIndex = op.etapas.findIndex(e => e.processo?.toLowerCase() === 'corte');

    // Se existe uma etapa de corte e ela NÃO foi lançada...
    if (etapaCorteIndex !== -1 && !op.etapas[etapaCorteIndex].lancado) {
        console.log(`[determinarEtapaAtual] Bloqueado na etapa de Corte (índice ${etapaCorteIndex}).`);
        // ...a etapa atual é a própria etapa de corte. Nenhuma outra pode ser a atual.
        return etapaCorteIndex;
    }
    // ==========================================================

    // Se passou pela regra do corte, a lógica original continua
    for (let i = 0; i < op.etapas.length; i++) {
        const etapa = op.etapas[i];
        if (!etapa) continue;
        if (!etapa.lancado) {
            return i;
        }
    }
    
    return op.etapas.length;
}

async function atualizarVisualEtapas(op, isFirstRender = false) {
    const etapasRows = document.querySelectorAll('#opEditView .etapa-row');
    const etapaAtualIndex = await determinarEtapaAtual(op);

    if (!op || !Array.isArray(op.etapas)) {
        console.error('[atualizarVisualEtapas] Objeto OP inválido ou op.etapas não é um array.', op);
        const etapasContainer = document.getElementById('etapasContainer');
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
        const etapa = op.etapas[i];
        
        if (!etapa) {
            console.warn(`[atualizarVisualEtapas] Etapa indefinida no índice ${i} para OP ${op.numero}`);
            continue;
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
        
        if (quantidadeInput) {
            if (document.activeElement !== quantidadeInput || isFirstRender) {
                quantidadeInput.value = etapa.quantidade > 0 ? etapa.quantidade : '';
            } else {
            }

            quantidadeInput.disabled = isDisabledGeral || concluida || !isEtapaEditavelNestaLinha || !userSelect?.value;
            
            if (quantidadeInput.disabled) {
                quantidadeInput.style.backgroundColor = '#f8f9fa';
            } else {
                quantidadeInput.style.backgroundColor = '';
            }
        }

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

async function updateFinalizarButtonState(op) {
    const finalizarBtn = document.getElementById('finalizarOP');
    if (!finalizarBtn || !op) {
        if(finalizarBtn) finalizarBtn.disabled = true;
        return;
    }

    finalizarBtn.classList.remove('op-finalizada-btn-estilo', 'op-botao-sucesso', 'op-botao-pronta');

    if (op.status === 'finalizado') {
        finalizarBtn.textContent = 'OP Finalizada!';
        finalizarBtn.disabled = true;
        finalizarBtn.classList.add('op-finalizada-btn-estilo');
    } else if (op.status === 'cancelada') {
        finalizarBtn.textContent = 'OP Cancelada';
        finalizarBtn.disabled = true;
        finalizarBtn.classList.add('op-finalizada-btn-estilo');
    } else {
        const produtos = await obterProdutosDoStorage();
        const camposPrincipaisPreenchidos = op.produto_id && (op.quantidade || 0) > 0 && op.data_entrega;
        let todasEtapasCompletas = false;
        if (op.etapas?.length > 0) {
            todasEtapasCompletas = (await Promise.all(op.etapas.map(async e => {
                const tipoUser = await getTipoUsuarioPorProcesso(e.processo, op.produto_id);
                const exigeQtd = tipoUser === 'costureira' || tipoUser === 'tiktik';
                return e.lancado && (!exigeQtd || (e.quantidade || 0) > 0);
            }))).every(Boolean);
        }

        const podeFinalizar = camposPrincipaisPreenchidos && todasEtapasCompletas;
        
        if (podeFinalizar && permissoes.includes('finalizar-op')) {
            finalizarBtn.textContent = 'Finalizar OP';
            finalizarBtn.disabled = false;
            finalizarBtn.classList.add('op-botao-sucesso');
        } else {
            finalizarBtn.textContent = 'Finalizar OP';
            finalizarBtn.disabled = true;
        }
    }
}

async function verificarEtapasEStatus(op) {
    if (!op.etapas || !Array.isArray(op.etapas)) {
        if (op.status !== 'em-aberto') { op.status = 'em-aberto'; await window.saveOPChanges(op); }
        return false;
    }
    const todosOsProdutos = await obterProdutosDoStorage();

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
        if (op.status !== novoStatus && novoStatus !== 'pronta-finalizar') {
             op.status = novoStatus;
             await window.saveOPChanges(op);
        }
    }
    return todasCompletas;
}


// --- FUNÇÕES ESPECÍFICAS PARA A TELA DE CORTE P/ ESTOQUE (#corteView) ---
async function loadProdutosCorte() {
    const produtoSelect = document.getElementById('produtoCorte');
    if (!produtoSelect) return;

    produtoSelect.disabled = true;
    produtoSelect.innerHTML = '<option value="">Carregando...</option>';
    try {
        const produtos = await obterProdutosDoStorage();
        produtoSelect.innerHTML = '<option value="">Selecione um produto</option>';
        if (produtos && produtos.length > 0) {
            const produtosFiltrados = produtos.filter(produto => 
                CONST_PRODUTOS.includes(produto.nome) && !CONST_PRODUTOSKITS.includes(produto.nome)
            );
            produtosFiltrados.forEach(produto => {
                // O texto é o nome, o valor é o ID
                const option = new Option(produto.nome, produto.id);
                produtoSelect.appendChild(option);
            });
        }
        produtoSelect.disabled = false;
    } catch (error) {
        console.error('[loadProdutosCorte] Erro ao carregar produtos:', error);
        mostrarPopupMensagem(`Erro ao carregar produtos para corte: ${error.message.substring(0,100)}`, 'erro');
        produtoSelect.innerHTML = '<option value="">Erro ao carregar</option>';
        produtoSelect.disabled = false;
    }
}

async function loadVariantesCorte(produtoId) {
    const variantesContainer = document.getElementById('variantesCorteContainer');
    const variantesSelects = document.querySelector('#corteView .variantes-selects-corte');
    
    if (!variantesContainer || !variantesSelects) {
        console.warn('[loadVariantesCorte] Elementos DOM para variantes de corte não encontrados.');
        return;
    }

    variantesSelects.innerHTML = ''; 
    variantesContainer.style.display = 'none';

    if (!produtoId) { // << MUDANÇA 2: Verifica o ID
        console.log('[loadVariantesCorte] Nenhum produto selecionado para carregar variantes.');
        return;
    }

    try {
        const todosOsProdutos = await obterProdutosDoStorage();
        // << MUDANÇA 3: Busca pelo ID, não pelo nome >>
        const produto = todosOsProdutos.find(p => p.id == produtoId);

        if (!produto) {
            console.warn(`[loadVariantesCorte] Produto com ID "${produtoId}" não encontrado.`);
            return;
        }

        // O resto da lógica para popular as variantes continua o mesmo
        let variantesDisponiveis = [];
        if (produto.variantes && produto.variantes.length > 0) {
            variantesDisponiveis = produto.variantes.map(v => v.valores.split(',')).flat().map(v => v.trim()).filter(Boolean);
        } else if (produto.grade && produto.grade.length > 0) {
            variantesDisponiveis = [...new Set(produto.grade.map(g => g.variacao))].filter(Boolean);
        }

        if (variantesDisponiveis.length > 0) {
            const select = document.createElement('select');
            select.className = 'op-select op-input-variante-corteform';
            select.innerHTML = '<option value="">Selecione uma variação</option>';
            variantesDisponiveis.forEach(variante => {
                select.add(new Option(variante, variante));
            });
            variantesSelects.appendChild(select);
            variantesContainer.style.display = 'block';
        } else {
            console.log(`[loadVariantesCorte] Nenhuma variação disponível para "${produto.nome}".`);
        }
    } catch (error) {
        console.error(`[loadVariantesCorte] Erro ao carregar variantes para produto ID ${produtoId}:`, error);
        mostrarPopupMensagem(`Erro ao carregar variações: ${error.message.substring(0,100)}`, 'erro');
    }
}

async function limparFormularioCorte() { // Adicionamos 'async'
    const produtoCorte = document.getElementById('produtoCorte');
    const quantidadeCorte = document.getElementById('quantidadeCorte');
    const cortadorCorte = document.getElementById('cortadorCorte');
    const variantesContainer = document.getElementById('variantesCorteContainer');
    const variantesSelects = document.querySelector('#corteView .variantes-selects-corte');

    if (produtoCorte) produtoCorte.value = '';
    if (quantidadeCorte) quantidadeCorte.value = '';
    
    // Mantém a lógica do cortador
    if (cortadorCorte && usuarioLogado) {
        cortadorCorte.value = usuarioLogado.nome;
    } else if (cortadorCorte) {
        cortadorCorte.value = 'Usuário Desconhecido';
    }
    
    if (variantesContainer && variantesSelects) {
        variantesSelects.innerHTML = '';
        variantesContainer.style.display = 'none';
    }
    setCurrentDateForCorte();

    // =========================================================
    // >> NOVA LÓGICA PARA BUSCAR O NÚMERO DO PC <<
    // =========================================================
    // Adiciona um campo invisível no HTML para guardar o número
    let pcNumberInput = document.getElementById('pcNumberCorte');
    if (!pcNumberInput) {
        pcNumberInput = document.createElement('input');
        pcNumberInput.type = 'hidden';
        pcNumberInput.id = 'pcNumberCorte';
        document.getElementById('formCorteEstoque').appendChild(pcNumberInput);
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/cortes/next-pc-number', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Falha ao buscar PC.');
        const data = await response.json();
        pcNumberInput.value = data.nextPC;
        console.log(`[limparFormularioCorte] Próximo PC para estoque definido: ${data.nextPC}`);
    } catch (error) {
        console.error('Erro ao buscar próximo PC para estoque:', error);
        pcNumberInput.value = ''; // Limpa em caso de erro
    }
}


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
                corDeFundoVariavelCSS = '#6c757d';
        }

        botaoAtivo.style.backgroundColor = corDeFundoVariavelCSS;
        botaoAtivo.style.color = corDoTextoVariavelCSS;
        botaoAtivo.style.borderColor = corDeFundoVariavelCSS;

    } else {
    }
}

// --- INICIALIZAÇÃO E EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    const auth = await verificarAutenticacao('ordens-de-producao.html', ['acesso-ordens-de-producao']);
    if (!auth) {
        document.body.innerHTML = '<p style="padding:20px; color:red; font-size:1.2em; text-align:center;">Falha na autenticação. Você será redirecionado para o login.</p>';
        return;
    }
    usuarioLogado = auth.usuario;
    permissoes = auth.permissoes || [];
    document.body.classList.add('autenticado');

    try {
        console.log('[DOMContentLoaded] Forçando a atualização da lista de produtos do servidor...');
        await obterProdutosDoStorage(true); 
        console.log('[DOMContentLoaded] Lista de produtos atualizada.');

    } catch (error) {
        mostrarPopupMensagem(`Alerta: Falha ao carregar dados de produtos: ${error.message.substring(0,100)}. A página pode não funcionar corretamente.`, 'erro', 7000);
    }

    const statusFilterContainer = document.getElementById('statusFilter');

    const produtoOPSelect = document.getElementById('produtoOP');
if (produtoOPSelect) {
    produtoOPSelect.addEventListener('change', async (e) => {
        const produtoId = e.target.value;
        console.log(`[produtoOP change] Produto selecionado pela UI: ID="${produtoId}"`);

        // Limpa a interface imediatamente para dar feedback ao usuário
        const infoCorteContainer = document.getElementById('infoCorteContainer');
        const variantesContainer = document.getElementById('variantesContainer');
        const variantesSelectsDiv = document.querySelector('#opFormView .variantes-selects');
        const quantidadeOPInput = document.getElementById('quantidadeOP');

        if (variantesSelectsDiv) variantesSelectsDiv.innerHTML = '';
        if (variantesContainer) variantesContainer.style.display = 'none';
        if (infoCorteContainer) infoCorteContainer.innerHTML = '';
        corteDeEstoqueSelecionadoId = null;
        if (quantidadeOPInput) {
            quantidadeOPInput.value = '';
            quantidadeOPInput.disabled = false;
        }

        if (!produtoId) {
            console.log('[produtoOP change] Nenhum produto selecionado. Limpando campos.');
            return; // Sai da função se o usuário selecionou a opção "Selecione produto"
        }

        try {
            // Passo 1: Obter a lista de produtos
            const produtosDisponiveis = await obterProdutosDoStorage();

            // Passo 2: VERIFICAÇÃO CRÍTICA
            if (!produtosDisponiveis || produtosDisponiveis.length === 0) {
                mostrarPopupMensagem('Erro crítico: Não foi possível carregar a lista de produtos.', 'erro');
                console.error('[produtoOP change] A função obterProdutosDoStorage() retornou uma lista vazia ou nula.');
                return;
            }

            // LOG DE DEPURAÇÃO: Vamos ver a lista de produtos que estamos usando
            console.log('[produtoOP change] Lista de produtos obtida do storage:', produtosDisponiveis);

            // Passo 3: Encontrar o produto selecionado NA LISTA OBTIDA
            const produtoObj = produtosDisponiveis.find(p => p.id == produtoId);
            
            // Passo 4: Outra VERIFICAÇÃO CRÍTICA
            if (!produtoObj) {
                // Se o produto não foi encontrado, a lista pode estar desatualizada.
                console.error(`[produtoOP change] Produto com ID "${produtoId}" não foi encontrado na lista de produtos. A lista pode estar desatualizada.`);
                mostrarPopupMensagem('Produto não encontrado na lista. Tente recarregar a página.', 'erro');
                return;
            }
            
            console.log(`[produtoOP change] Produto encontrado:`, produtoObj);

            // Passo 5: Chamar as funções subsequentes com os dados corretos
            await loadVariantesSelects(produtoId, produtosDisponiveis);

            const produtoTemVariantes = (produtoObj.variantes?.length > 0 || produtoObj.grade?.length > 0);
            if (!produtoTemVariantes) {
                // Se o produto não tem variantes, podemos verificar o corte imediatamente
                await verificarCorteEAtualizarFormOP();
            } else {
                console.log(`[produtoOP change] Produto "${produtoObj.nome}" tem variantes. Aguardando seleção.`);
            }

        } catch (error) {
            console.error('[produtoOP change] Ocorreu um erro:', error);
            mostrarPopupMensagem(`Erro ao processar seleção do produto: ${error.message}`, 'erro');
        }
    });
}

    const btnIncluirOP = document.getElementById('btnIncluirOP');
        if (btnIncluirOP) {
        btnIncluirOP.addEventListener('click', (e) => {
        e.preventDefault(); // Sempre previna o default para gerenciar o clique no JS

        if (permissoes.includes('criar-op')) {
            // SE TEM PERMISSÃO, então redireciona
            window.location.hash = '#adicionar';
        } else {
            // SE NÃO TEM PERMISSÃO, mostra o popup e não faz nada
            mostrarPopupMensagem('Você não tem permissão para criar Ordens de Produção.', 'erro');
        }
    });
}

    const opForm = document.getElementById('opForm');
if (opForm) {
    opForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnSalvar = opForm.querySelector('.botao-salvar-op');
    if (!btnSalvar) {
        console.error("Botão 'Salvar OP' não foi encontrado no formulário.");
        return;
    }
    
    const originalButtonText = btnSalvar.innerHTML;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<div class="spinner-btn-interno"></div> Salvando...';

    try {
        // --- 1. COLETA E VALIDAÇÃO DOS DADOS ---
        const produtoSelect = document.getElementById('produtoOP');
        const produtoId = produtoSelect.value;
        const produtoNome = produtoId ? produtoSelect.options[produtoSelect.selectedIndex].text : '';

        const varianteSelect = document.querySelector('#opFormView .variantes-selects select');
        const varianteValor = varianteSelect ? varianteSelect.value : '';

        const quantidade = parseInt(document.getElementById('quantidadeOP').value) || 0;
        const dataEntrega = document.getElementById('dataEntregaOP').value;
        const numero = document.getElementById('numeroOP').value.trim();
        const observacoes = document.getElementById('observacoesOP').value.trim();
        const infoCorteContainer = document.getElementById('infoCorteContainer');
        const pcGeradoParaNovoCorte = infoCorteContainer ? infoCorteContainer.dataset.pcGerado : null;

        if (!produtoId || quantidade <= 0 || !dataEntrega || !numero) {
            throw new Error('Por favor, preencha todos os campos obrigatórios (Produto, Quantidade, Data, Número OP).');
        }

        const todosOsProdutos = await obterProdutosDoStorage();
        const produtoObj = todosOsProdutos.find(p => p.id == produtoId);
        if (!produtoObj) throw new Error("Produto selecionado é inválido.");

        // --- 2. MONTAGEM INICIAL DO OBJETO OP ---
        let opParaSalvar = {
            numero,
            produto_id: parseInt(produtoId),
            variante: varianteValor || null,
            quantidade,
            data_entrega: dataEntrega,
            observacoes,
            status: 'em-aberto', // Começa sempre como 'em-aberto'
            edit_id: generateUniqueId(),
            etapas: produtoObj.etapas ? produtoObj.etapas.map(eInfo => ({
                processo: typeof eInfo === 'object' ? eInfo.processo : eInfo,
                usuario: '',
                quantidade: 0,
                lancado: false,
                ultimoLancamentoId: null
            })) : []
        };
        
        // --- 3. SALVA A OP INICIALMENTE ---
        // A OP é criada primeiro no estado mais simples possível.
        const opSalvaInicialmente = await salvarOrdemDeProducao(opParaSalvar);
        console.log(`[Submit OP] OP #${opSalvaInicialmente.numero} criada com sucesso no estado inicial.`);
        let msgSucesso = `OP <strong>#${opSalvaInicialmente.numero}</strong> criada!`;

        // --- 4. LÓGICA PÓS-CRIAÇÃO (CORTE E ATUALIZAÇÃO DE STATUS) ---
        
        // Caso 1: Um corte de estoque existente foi selecionado
        if (corteDeEstoqueSelecionadoId) {
            console.log(`[Submit OP] Vinculando corte de estoque ID ${corteDeEstoqueSelecionadoId} à OP.`);
            await atualizarCorte(corteDeEstoqueSelecionadoId, 'usado', usuarioLogado?.nome || 'Sistema', opSalvaInicialmente.numero);
            
            // Agora, atualizamos a OP que acabamos de criar para o status 'produzindo'
            const opParaAtualizar = { ...opSalvaInicialmente, status: 'produzindo' };
            await window.saveOPChanges(opParaAtualizar); // saveOPChanges faz o PUT
            
            console.log(`[Submit OP] Status da OP #${opSalvaInicialmente.numero} atualizado para 'produzindo'.`);
            msgSucesso += "<br>Corte de estoque utilizado e produção iniciada.";
        } 
        // Caso 2: Um novo pedido de corte precisa ser gerado
        else if (pcGeradoParaNovoCorte) {
            console.log(`[Submit OP] Criando novo pedido de corte (PC: ${pcGeradoParaNovoCorte}) para a OP.`);
            const corteData = {
            produto_id: parseInt(produtoId),
            variante: varianteValor || null,
            quantidade: quantidade,
            pn: pcGeradoParaNovoCorte,
            status: 'pendente',
            op: opSalvaInicialmente.numero,
            // AQUI ESTÁ A CORREÇÃO: Adicionamos a data do dia.
            // Usamos a mesma data que foi usada para a OP, que já coletamos.
            data: new Date().toISOString().split('T')[0]
        };
            
            const token = localStorage.getItem('token');
            const resCorte = await fetch('/api/cortes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(corteData)
            });

            if (!resCorte.ok) {
                const err = await resCorte.json().catch(() => ({error: "Erro desconhecido"}));
                msgSucesso = `OP criada, mas <strong style="color:orange;">ATENÇÃO:</strong> falha ao gerar pedido de corte. Erro: ${err.error}`;
            } else {
                msgSucesso += `<br>Pedido de corte gerado: <a href="#cortes-pendentes">Ver Corte Pendente (PC: ${pcGeradoParaNovoCorte})</a>`;
            }
        }

        // --- 5. FEEDBACK FINAL E LIMPEZA ---
        mostrarPopupMensagem(msgSucesso, 'sucesso', 0, true); // Deixa o popup aberto para o usuário ler
        limparCacheOrdens();
        limparCacheCortes();
        limparFormularioOP();
        await loadProdutosSelect();
        
        // Não redireciona automaticamente, deixa o usuário na tela para criar outra OP se quiser.
        // window.location.hash = '';

    } catch (error) {
        mostrarPopupMensagem(`Erro ao salvar OP: ${error.message}`, 'erro');
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = originalButtonText;
    }
    });
}

    const btnSalvarCorteEstoque = document.getElementById('btnCortar');
    if (btnSalvarCorteEstoque) {
        if (!permissoes.includes('registrar-corte')) {
            btnSalvarCorteEstoque.style.display = 'none';
        } else {
            btnSalvarCorteEstoque.addEventListener('click', salvarCorte);
        }
    }

    const btnLimparFormCorte = document.getElementById('btnLimparFormCorteEstoque');
    if (btnLimparFormCorte) {
        btnLimparFormCorte.addEventListener('click', limparFormularioCorte);
    }

    if (statusFilterContainer) {        
        const statusButtons = statusFilterContainer.querySelectorAll('.op-botao-filtro'); 

        statusButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                console.log(`[Filtro Status CLIQUE] Botão '${btn.dataset.status}' FOI CLICADO.`);

                statusFilterContainer.querySelectorAll('.op-botao-filtro').forEach(b => {
                    b.classList.remove('active');
                    b.style.backgroundColor = ''; 
                    b.style.color = ''; 
                    b.style.borderColor = '';
                });

                btn.classList.add('active');
                
                const uiStatus = btn.dataset.status;
                const searchTerm = document.getElementById('searchOP')?.value || '';
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
        if (!statusFilterContainer) console.warn('[DOMContentLoaded] Container de filtro de status #statusFilter não encontrado.');
    }

    const searchOPInput = document.getElementById('searchOP');
    if (searchOPInput && statusFilterContainer) {
        
        searchOPInput.addEventListener('input', debounce(async () => {
            const searchTerm = searchOPInput.value.trim();
            console.log(`[Busca OP] Termo de busca alterado para: "${searchTerm}"`);

            const activeStatusButton = statusFilterContainer.querySelector('.op-botao-filtro.active');
            if (!activeStatusButton) {
                console.error("[Busca OP] Botão de status ativo não encontrado. Verifique as classes dos botões de filtro.");
                return;
            }
            const uiStatus = activeStatusButton.dataset.status;
            
            const apiStatusParaFiltro = (uiStatus === 'todas') ? null : uiStatus;

            const activeSortTh = document.querySelector('.tabela-op th[data-sort]:not([data-sort=""])');
            let sortCriterioAtual = 'numero';
            let sortOrdemAtual = 'desc';
            if (activeSortTh) {
                sortCriterioAtual = activeSortTh.id.replace('sort', '').toLowerCase();
                sortOrdemAtual = activeSortTh.dataset.sort || 'desc';
            }

            console.log(`[Busca OP] Chamando loadOPTable com: uiStatus=${uiStatus}, searchTerm="${searchTerm}", sort=${sortCriterioAtual}-${sortOrdemAtual}, page=1, apiStatus=${apiStatusParaFiltro}`);
            
            await loadOPTable(
                uiStatus, 
                searchTerm, 
                { criterio: sortCriterioAtual, ordem: sortOrdemAtual },
                1,
                true,
                apiStatusParaFiltro
            );
        }, 400));
    } else {
        if (!searchOPInput) console.warn('[DOMContentLoaded] Input de busca #searchOP não encontrado.');
        if (!statusFilterContainer) console.warn('[DOMContentLoaded] Container de filtro #statusFilter não encontrado (necessário para a busca obter o status atual).');
    }

    document.querySelectorAll('.tabela-op th[id^="sort"]').forEach(th => {
        th.addEventListener('click', () => {
            const novoSortCriterio = th.id.replace('sort', '').toLowerCase();
            let currentOrder = th.dataset.sort;
            let novoSortOrdem = (currentOrder === 'asc') ? 'desc' : (currentOrder === 'desc' ? '' : 'asc');
            document.querySelectorAll('.tabela-op th[id^="sort"]').forEach(h => h.dataset.sort = (h === th ? novoSortOrdem : ''));
            
            const uiStatus = statusFilterContainer.querySelector('.op-botao-filtro.active')?.dataset.status || 'todas';
            const searchTerm = searchOPInput.value;
            const apiStatus = (uiStatus === 'todas') ? null : uiStatus;
            const finalSortCriterio = novoSortOrdem ? novoSortCriterio : 'numero';
            const finalSortOrdem = novoSortOrdem || 'desc';
            loadOPTable(uiStatus, searchTerm, {criterio: finalSortCriterio, ordem: finalSortOrdem}, 1, true, apiStatus);
        });
    });

    const btnFinalizarOP = document.getElementById('finalizarOP');
    if (btnFinalizarOP) {
        btnFinalizarOP.addEventListener('click', async () => {
            if (!permissoes.includes('finalizar-op')) {
                mostrarPopupMensagem('Você não tem permissão para finalizar Ordens de Produção.', 'erro');
                return;
            }
            if (btnFinalizarOP.disabled) return;
            const editId = window.location.hash.split('/')[1];
            if (!editId) { 
                mostrarPopupMensagem('Não foi possível identificar a OP para finalizar.', 'erro'); 
                return; 
            }

            const originalButtonText = btnFinalizarOP.textContent;
            btnFinalizarOP.disabled = true;
            btnFinalizarOP.innerHTML = '<div class="spinner-btn-interno"></div> Finalizando...';

            try {
                limparCacheOrdens();
                // Otimização: buscar a OP específica em vez de todas
                const tokenOP = localStorage.getItem('token');
                const response = await fetch(`/api/ordens-de-producao/${encodeURIComponent(editId)}`, { headers: { 'Authorization': `Bearer ${tokenOP}` } });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}.` }));
                    throw new Error(`Erro ao buscar OP para finalização: ${errorData.error}`);
                }
                const op = await response.json();

                if (op) {
                    if (op.status === 'finalizado') {
                        mostrarPopupMensagem(`OP #${op.numero} já está finalizada.`, 'info');
                        await updateFinalizarButtonState(op);
                        return;
                    }

                    const todasEtapasCompletas = await verificarEtapasEStatus(op);
                    if (todasEtapasCompletas) {
                op.status = 'finalizado';
                op.data_final = new Date().toISOString();
                
                // A variável 'opSalva' agora contém a resposta completa da API
                const opSalva = await window.saveOPChanges(op);
                
                // ===============================================
                // >> LÓGICA DE MENSAGEM ESPECÍFICA <<
                // ===============================================
                let msgSucesso;
                
                // Verifica se a resposta da API incluiu filhas finalizadas
                if (opSalva.finalizedChildren && opSalva.finalizedChildren.length > 0) {
                    // Caso B: Mãe + Filha(s)
                    const filhasNumeros = opSalva.finalizedChildren.join(', ');
                    msgSucesso = `OP Mãe <strong>#${op.numero}</strong> e a(s) OP(s) Filha(s) <strong>#${filhasNumeros}</strong> foram finalizadas com sucesso!`;
                } else {
                    // Caso A: Apenas a Mãe
                    msgSucesso = `OP <strong>#${op.numero}</strong> finalizada com sucesso!`;
                }

                mostrarPopupMensagem(msgSucesso, 'sucesso', 7000, true);
                // ===============================================

                limparCacheOrdens();
                        
                        btnFinalizarOP.textContent = 'OP Finalizada!';
                        btnFinalizarOP.disabled = true;
                        btnFinalizarOP.classList.add('op-finalizada-btn-estilo');
                        btnFinalizarOP.classList.remove('op-botao-sucesso');

                        setTimeout(() => {
                            window.location.hash = '';
                        }, 2000);
                        return;
                    }
                } 
                
                else {
                    mostrarPopupMensagem('OP não encontrada para finalizar.', 'erro');
                }
            } catch (e) {
                mostrarPopupMensagem(`Erro ao finalizar OP: ${e.message.substring(0,100)}`, 'erro');
            } finally {
                if (window.location.hash.startsWith('#editar/')) {
                    const currentEditId = window.location.hash.split('/')[1];
                    const tokenReload = localStorage.getItem('token');
                    try {
                        const responseReload = await fetch(`/api/ordens-de-producao/${encodeURIComponent(currentEditId)}`, { headers: { 'Authorization': `Bearer ${tokenReload}` } });
                        const opAtualizada = responseReload.ok ? await responseReload.json() : null;
                        if (opAtualizada) {
                            await updateFinalizarButtonState(opAtualizada);
                        } else {
                            btnFinalizarOP.disabled = false;
                            btnFinalizarOP.innerHTML = originalButtonText;
                        }
                    } catch (fetchError) {
                        console.error("Erro ao recarregar OP para estado final do botão:", fetchError);
                        btnFinalizarOP.disabled = false;
                        btnFinalizarOP.innerHTML = originalButtonText;
                    }
                }
            }
        });
    }

    if (!window.hashChangeListenerAttached) {
        window.addEventListener('hashchange', toggleView);
        window.hashChangeListenerAttached = true;
    }
    
    await toggleView();
    document.body.dataset.initialLoadComplete = 'true';
    aplicarCorAoFiltroAtivo();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token'); localStorage.removeItem('usuarioLogado'); localStorage.removeItem('permissoes');
            limparCacheOrdens(); invalidateProdutosStorageCache('produtosCadastrados'); limparCacheCortes(); lancamentosCache.clear();
            window.location.href = '/login.html';
        });
    }

    //OP FILHA DAS SCRUNCHIES PADRAO (FILHAS = SCRUNCHIE FINA)

const btnCriarOpFilha = document.getElementById('btnCriarOpFilha');
if (btnCriarOpFilha) {
    btnCriarOpFilha.addEventListener('click', async () => {
        const opMaeEditId = window.location.hash.split('/')[1];
        if (!opMaeEditId) {
            mostrarPopupMensagem('Erro: Não foi possível identificar a OP "mãe".', 'erro');
            return;
        }

        const quantidadeFilha = parseInt(document.getElementById('quantidadeOpFilha').value);
        if (!quantidadeFilha || quantidadeFilha <= 0) {
            mostrarPopupMensagem('Por favor, insira uma quantidade válida para a OP filha.', 'aviso');
            return;
        }

        if (btnCriarOpFilha.disabled) return;

        btnCriarOpFilha.disabled = true;
        btnCriarOpFilha.innerHTML = '<div class="spinner-btn-interno"></div> Processando...';

        try {
            const token = localStorage.getItem('token');
            
            // Etapa 1: Buscar dados da OP mãe e verificar se a filha já existe
            const responseMae = await fetch(`/api/ordens-de-producao/${opMaeEditId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!responseMae.ok) throw new Error('Falha ao carregar dados da OP mãe para verificação.');
            const opMae = await responseMae.json();
            
            const responseCheck = await fetch(`/api/ordens-de-producao/check-op-filha/${opMae.numero}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const dataCheck = await responseCheck.json();
            
            if (dataCheck.existe) {
                throw new Error('Ação bloqueada: Uma OP filha já existe para esta OP mãe.');
            }

            // Etapa 2: Preparar dados para a nova OP Filha
            const lancamentosMae = await obterLancamentos(opMae.numero, true);
            const proximoNumeroOp = await getNextOPNumber();
            const todosProdutos = await obterProdutosDoStorage();
            
            const produtoFilho = todosProdutos.find(p => p.nome === 'Scrunchie (Fina)');
            if (!produtoFilho || !produtoFilho.id) {
                throw new Error('Produto "Scrunchie (Fina)" ou seu ID não foram encontrados.');
            }

            // Etapa 3: Criar a OP Filha (com produto_id)
            const novaOpFilha = {
                numero: proximoNumeroOp,
                produto_id: produtoFilho.id,
                variante: opMae.variante,
                quantidade: quantidadeFilha,
                data_entrega: opMae.data_entrega,
                observacoes: `OP gerada em conjunto com a OP mãe #${opMae.numero}`,
                status: 'em-aberto',
                edit_id: generateUniqueId(),
                etapas: produtoFilho.etapas ? produtoFilho.etapas.map(eInfo => ({
                    processo: typeof eInfo === 'object' ? eInfo.processo : eInfo,
                    usuario: '',
                    quantidade: 0,
                    lancado: false,
                    ultimoLancamentoId: null
                })) : []
            };
            const opFilhaSalva = await salvarOrdemDeProducao(novaOpFilha);

            // Etapa 4: Replicar os lançamentos de produção da mãe para a filha
            let etapasLancadasNaFilha = 0;
            for (const lancamento of lancamentosMae) {
                if (lancamento.processo.toLowerCase() === 'corte') continue;
                
                const dadosProducaoFilha = {
                    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    opNumero: opFilhaSalva.numero,
                    etapaIndex: lancamento.etapa_index,
                    processo: lancamento.processo,
                    produto_id: opFilhaSalva.produto_id,
                    variacao: opFilhaSalva.variante,
                    maquina: lancamento.maquina,
                    quantidade: quantidadeFilha,
                    funcionario: lancamento.funcionario,
                    data: new Date().toISOString(),
                    lancadoPor: usuarioLogado?.nome || 'Sistema'
                };

                const responseProd = await fetch('/api/producoes', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(dadosProducaoFilha)
                });

                if (responseProd.ok) {
                    etapasLancadasNaFilha++;
                    const producaoSalva = await responseProd.json();
                    const etapaNaFilha = opFilhaSalva.etapas[lancamento.etapa_index];
                    if (etapaNaFilha) {
                        etapaNaFilha.lancado = true;
                        etapaNaFilha.usuario = dadosProducaoFilha.funcionario;
                        etapaNaFilha.quantidade = dadosProducaoFilha.quantidade;
                        etapaNaFilha.ultimoLancamentoId = producaoSalva.id;
                    }
                }
            }

            // Etapa 5: Atualizar o status da OP filha se necessário
            if (etapasLancadasNaFilha > 0) {
                opFilhaSalva.status = 'produzindo';
                await window.saveOPChanges(opFilhaSalva);
            }

            // Etapa 6: Feedback visual de sucesso
            mostrarPopupMensagem(`OP Filha #${opFilhaSalva.numero} criada com sucesso!`, 'sucesso');
            await loadEtapasEdit(opMae, true); // Recarrega a UI para mostrar que a filha foi criada

        } catch (error) {
            console.error('Erro ao criar e processar OP filha:', error);
            mostrarPopupMensagem(`Erro ao criar OP filha: ${error.message}`, 'erro');
            // Reabilita o botão em caso de erro para o usuário poder tentar de novo
            btnCriarOpFilha.disabled = false;
            btnCriarOpFilha.innerHTML = '<i class="fas fa-plus-circle"></i> Criar OP Filha';
        } 
    });
}


        // ========================================================
// NOVA LÓGICA DO ACCORDION USANDO DELEGAÇÃO DE EVENTOS
// ========================================================
const opEditView = document.getElementById('opEditView');

if (opEditView) {
    opEditView.addEventListener('click', function(event) {
        // 1. Encontra o cabeçalho do accordion mais próximo do local onde o usuário clicou.
        const accordionHeader = event.target.closest('.op-accordion-cabecalho');

        // 2. Se o clique não foi no cabeçalho (ou dentro dele), não faz nada.
        if (!accordionHeader) {
            return;
        }

        // 3. Se foi, executa a lógica de abrir/fechar.
        console.log('Clique no cabeçalho do accordion detectado!'); // Para depuração
        const accordion = accordionHeader.parentElement;
        accordion.classList.toggle('active');

        const content = accordionHeader.nextElementSibling;
        if (content.style.maxHeight) {
            content.style.maxHeight = null;
        } else {
            // +40 é uma folga para o padding que será adicionado
            content.style.maxHeight = (content.scrollHeight + 40) + "px";
        }
    });
}
// ========================================================

});