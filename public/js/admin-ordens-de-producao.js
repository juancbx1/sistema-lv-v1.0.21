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

    variantesSelectsDiv.innerHTML = '';
    variantesContainer.style.display = 'none';
    if (infoCorteContainer) {
        infoCorteContainer.innerHTML = '';
        infoCorteContainer.style.display = 'none';
    }
    camposDependentesPrincipais.forEach(el => el.style.display = 'none');

    if (!produtoNome) {
        console.log('[loadVariantesSelects] Nenhum produto selecionado.');
        return;
    }

    const produto = produtosDisponiveisRecebidos.find(p => p.nome === produtoNome);
    if (!produto) {
        console.warn(`[loadVariantesSelects] Produto "${produtoNome}" não encontrado na lista de produtos fornecida.`);
        return;
    }

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
            const option = new Option(variante, variante);
            selectVariante.appendChild(option);
        });
        
        variantesSelectsDiv.appendChild(selectVariante);
        variantesContainer.style.display = 'block';

        selectVariante.addEventListener('change', async () => {
            const varianteSelecionada = selectVariante.value;
            if (varianteSelecionada) {
                await verificarCorteEAtualizarFormOP();
            } else {
                console.log('[selectVariante change] Nenhuma variante selecionada. Limpando campos dependentes.');
                if (infoCorteContainer) {
                    infoCorteContainer.innerHTML = '';
                    infoCorteContainer.style.display = 'none';
                }
                camposDependentesPrincipais.forEach(el => el.style.display = 'none');
                corteDeEstoqueSelecionadoId = null;
                const quantidadeOPInput = document.getElementById('quantidadeOP');
                if (quantidadeOPInput) {
                    quantidadeOPInput.value = '';
                    quantidadeOPInput.disabled = false;
                    quantidadeOPInput.style.backgroundColor = '';
                }
            }
        });
    } else {
        console.log(`[loadVariantesSelects] Produto "${produtoNome}" não possui variantes configuradas.`);
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
    const prodNome = document.getElementById('produtoOP').value;
    const varSel = document.querySelector('#opFormView .variantes-selects select');
    const varVal = varSel ? varSel.value : '';
    const qtdIn = document.getElementById('quantidadeOP'), numOPIn = document.getElementById('numeroOP');
    const dataEntIn = document.getElementById('dataEntregaOP'), obsIn = document.getElementById('observacoesOP');
    const infoCorte = document.getElementById('infoCorteContainer');
    corteDeEstoqueSelecionadoId = null;

    // AQUI É A MUDANÇA: Certifique-se de que os elementos existam e tenham parentElement antes de manipulá-los.
    // E que a lógica de display: none/block seja mais controlada.
    const camposDep = [
        qtdIn?.parentElement,
        numOPIn?.parentElement,
        dataEntIn?.parentElement,
        obsIn?.parentElement,
        infoCorte
    ].filter(Boolean);

    // Esconde todos os campos dependentes no início, para ter certeza
    camposDep.forEach(el => {
        if (el) { // Certifique-se que o elemento existe
            el.style.display = 'none';
        }
    });
    if (infoCorte) infoCorte.innerHTML = '';

    if (!prodNome) return;
    const produtos = await obterProdutosDoStorage();
    const prodObj = produtos.find(p => p.nome === prodNome); if (!prodObj) return;
    const temVar = (prodObj.variantes?.length || prodObj.grade?.length);
    if (temVar && !varVal) return;

    if (infoCorte) { infoCorte.innerHTML = '<div class="spinner">Verificando...</div>'; infoCorte.style.display = 'block';}
    try {
        const cortados = await obterCortes('cortados');
        const estoque = cortados.find(c => c.produto === prodNome && (temVar ? c.variante === varVal : true) && !c.op);
        if (infoCorte) infoCorte.innerHTML = ''; // Limpa o spinner

        if (estoque) {
            corteDeEstoqueSelecionadoId = estoque.id;
            if (infoCorte) infoCorte.innerHTML = `<p style="color:green;font-weight:bold;"><i class="fas fa-check-circle"></i> Corte em estoque! (PN: ${estoque.pn||'N/A'}, Qtd: ${estoque.quantidade})</p><p>Qtd da OP definida.</p>`;
            if (qtdIn) { qtdIn.value = estoque.quantidade; qtdIn.disabled = true; qtdIn.style.backgroundColor = '#e9ecef'; }
        } else {
            const pn = generateUniquePN();
            if (infoCorte) { infoCorte.innerHTML = `<p style="color:orange;font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> Nenhum corte em estoque.</p><p>Novo pedido (PN: ${pn}) será gerado.</p>`; infoCorte.dataset.pnGerado = pn; }
            if (qtdIn) { qtdIn.value = ''; qtdIn.disabled = false; qtdIn.style.backgroundColor = ''; qtdIn.placeholder = 'Qtd'; }
        }

        // AGORA, TORNE OS PARENTES VISÍVEIS ANTES DE ATUALIZAR OS VALORES
        camposDep.forEach(el => {
            if (el) { // Certifique-se que o elemento existe
                el.style.display = 'block';
            }
        });
        
        // E SÓ AGORA PREENCHA OS VALORES
        if (numOPIn) numOPIn.value = await getNextOPNumber();
        if (dataEntIn) setCurrentDate(dataEntIn);

    } catch (e) {
        if (infoCorte) infoCorte.innerHTML = `<p style="color:red">Erro: ${e.message}</p>`;
        if (qtdIn) { qtdIn.value = ''; qtdIn.disabled = false; }
        // Se houver erro, garanta que os campos ainda fiquem escondidos ou com status de erro.
        camposDep.forEach(el => {
            if (el) { el.style.display = 'none'; } // Esconde novamente em caso de erro
        });
    }
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

async function salvarCorte() {
     const produtoNomeInput = document.getElementById('produtoCorte');
    const varianteSelectEl = document.querySelector('#corteView .variantes-selects-corte select');
    const quantidadeInput = document.getElementById('quantidadeCorte');
    const dataCorteInput = document.getElementById('dataCorte');
    const cortadorInput = document.getElementById('cortadorCorte');
    
    // Checagem de permissão no frontend
    if (!permissoes.includes('registrar-corte')) {
        mostrarPopupMensagem('Você não tem permissão para registrar cortes.', 'erro');
        return;
    }

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

    let produtoObj = null;
    if (produtoNome && erros.length === 0) {
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
        return;
    }

    const corteData = {
        produto: produtoNome,
        variante: (produtoObj && (produtoObj.variantes?.length > 0 || produtoObj.grade?.length > 0)) ? (varianteValor || null) : null,
        quantidade,
        data: dataCorte,
        cortador,
        status: 'cortados',
        op: null
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

async function excluirCorte(id) { // Removido 'status' do parâmetro
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
        let errorMsg = `Erro ao excluir corte: Status ${response.status}`;
        try {
            const errorJson = JSON.parse(text);
            errorMsg = errorJson.error || errorMsg;
        } catch (e) { /* ignore */ }
        throw new Error(errorMsg);
    }

    limparCacheCortes();
    console.log('[excluirCorte] Corte excluído com sucesso');
    return await response.json();
}

function handleOPTableClick(event) {
    const tr = event.target.closest('tr');
    if (!tr || !tr.dataset.editId) {
        return;
    }

    const editId = tr.dataset.editId;

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
                    const corteId = cb.dataset.id;
                    const corteStatus = cb.dataset.status; // Pega o status do data-status do checkbox
                    await excluirCorte(corteId, corteStatus);
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
                console.log(`[toggleView #editar] Buscando dados para OP com ID: ${editIdFromHash}`);
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
                    limparCacheOrdens();

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
                    await loadEtapasEdit(opParaEditar, false);

                } else {
                    mostrarPopupMensagem('Ordem de Produção para edição não encontrada.', 'erro');
                    if (opNumeroTitle) opNumeroTitle.textContent = 'OP não encontrada';
                    if (etapasContainer) etapasContainer.innerHTML = '<p style="color:red; text-align:center;">OP não encontrada.</p>';
                }
            } catch (error) {
                console.error('[toggleView #editar] Erro ao carregar OP para edição:', error);
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
        if (permissoes.includes('registrar-corte')) { // Permissão para registrar corte
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
async function getTipoUsuarioPorProcesso(processo, produtoNome) {
    const cacheKey = `${produtoNome}-${processo}`;
    if (tipoUsuarioProcessoCache.has(cacheKey)) {
        return tipoUsuarioProcessoCache.get(cacheKey);
    }

    const todosOsProdutos = await obterProdutosDoStorage();
    const produto = todosOsProdutos.find(p => p.nome === produtoNome);
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
                        c.produto === op.produto &&
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
            } else {
                const tipoUsuarioEtapa = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
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

    } catch (e) {
        console.error('[loadEtapasEdit] Erro fatal ao carregar etapas:', e.message, e.stack);
        etapasContainer.innerHTML = `<p style="color:red; text-align:center; padding:10px;">Erro crítico ao carregar etapas: ${e.message.substring(0, 150)}. Tente recarregar a OP.</p>`;
        if (finalizarBtn) finalizarBtn.disabled = true;
    } finally {
        isLoadingEtapas = false;
    }
}

async function salvarProducao(op, etapa, etapaIndex) {
    if (!etapa.usuario) throw new Error(`Funcionário não selecionado para ${etapa.processo}`);
    const todosOsProdutos = await obterProdutosDoStorage();
    const produtoConfig = todosOsProdutos.find(p => p.nome === op.produto);
    if (!produtoConfig) throw new Error(`Produto ${op.produto} não encontrado.`);
    if (produtoConfig.tipos?.includes('kits')) throw new Error(`${op.produto} é kit, sem etapas.`);
    const etapaProdutoConfig = produtoConfig.etapas?.[etapaIndex];
    if (!etapaProdutoConfig || (typeof etapaProdutoConfig === 'object' ? etapaProdutoConfig.processo : etapaProdutoConfig) !== etapa.processo) throw new Error(`Etapa ${etapa.processo} inválida.`);
    const maquina = typeof etapaProdutoConfig === 'object' ? etapaProdutoConfig.maquina : null;
    if (!maquina && (await getTipoUsuarioPorProcesso(etapa.processo, op.produto) !== 'tiktik') ) throw new Error(`Máquina não definida para ${etapa.processo}`);

    const dados = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        opNumero: op.numero, etapaIndex, processo: etapa.processo, produto: op.produto,
        variacao: op.variante || null, maquina, quantidade: parseInt(etapa.quantidade) || 0,
        funcionario: etapa.usuario, data: new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T'),
        lancadoPor: usuarioLogado?.nome || 'Sistema'
    };
    Object.entries(dados).forEach(([key, value]) => { if (value === undefined || value === null && !['variacao', 'maquina'].includes(key)) throw new Error(`${key} não informado.`); });
    if (dados.quantidade <= 0 && (await getTipoUsuarioPorProcesso(etapa.processo, op.produto) !== 'tiktik') ) throw new Error('Quantidade inválida.');


    const response = await fetch('/api/producoes', { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json'}, body: JSON.stringify(dados)});
    if (!response.ok) {
        const error = await response.json().catch(() => ({error: `HTTP ${response.status}`}));
        if (error.details === 'jwt expired') { throw new Error('Sessão expirada');}
        if (response.status === 403) throw new Error('Permissão negada para lançar.');
        if (response.status === 409) { mostrarPopupMensagem('Lançamento duplicado detectado.', 'aviso'); return null; }
        throw new Error(`Erro ao salvar produção: ${error.error || 'Desconhecido'}`);
    }
    const producaoSalva = await response.json();
    op.etapas[etapaIndex] = { ...etapa, usuario: dados.funcionario, quantidade: dados.quantidade, lancado: true, ultimoLancamentoId: producaoSalva.id };
    await window.saveOPChanges(op);
    return producaoSalva.id;
}

async function lancarEtapa(op, etapaIndex, quantidade) {
    const etapa = op.etapas[etapaIndex];
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
        console.warn('[determinarEtapaAtual] OP inválida ou sem etapas, retornando 0.');
        return 0; 
    }
    for (let i = 0; i < op.etapas.length; i++) {
        const etapa = op.etapas[i];
        if (!etapa) {
            console.warn(`[determinarEtapaAtual] Etapa no índice ${i} é indefinida.`, op.etapas);
            continue;
        }
        if (!etapa.lancado) { // Se a etapa não está lançada, ela é a atual
            return i;
        }
    }
    console.log(`[determinarEtapaAtual] Todas as ${op.etapas.length} etapas parecem completas.`);
    return op.etapas.length;
}

async function atualizarVisualEtapas(op, isFirstRender = false) {
    console.log(`[ATUALIZAR_VISUAL_START] Chamada para OP ${op.numero}. isFirstRender: ${isFirstRender}.`);

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
                // console.log(`[ATUALIZAR_VISUAL_LOOP] Input ${etapa.processo} (idx ${i}) está com foco. NÃO MUDANDO O VALOR.`);
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
    console.log(`[ATUALIZAR_VISUAL_END] Finalizado para OP ${op.numero}.`);
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
        const camposPrincipaisPreenchidos = op.produto && (op.quantidade || 0) > 0 && op.data_entrega;
        let todasEtapasCompletas = false;
        if (op.etapas?.length > 0) {
            todasEtapasCompletas = (await Promise.all(op.etapas.map(async e => {
                const tipoUser = await getTipoUsuarioPorProcesso(e.processo, op.produto);
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
    console.log(`[updateFinalizarButtonState] Botão Finalizar: Texto='${finalizarBtn.textContent}', Disabled=${finalizarBtn.disabled}`);
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
    if (!produtoSelect) {
        console.warn('[loadProdutosCorte] Elemento #produtoCorte não encontrado.');
        return;
    }

    produtoSelect.disabled = true;
    produtoSelect.innerHTML = '<option value="">Carregando produtos...</option>';
    try {
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

async function loadVariantesCorte(produtoNome) {
    const variantesContainer = document.getElementById('variantesCorteContainer');
    const variantesSelects = document.querySelector('#corteView .variantes-selects-corte');
    
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
            select.className = 'op-select op-input-variante-corteform';
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
    const cortadorCorte = document.getElementById('cortadorCorte');
    const variantesContainer = document.getElementById('variantesCorteContainer');
    const variantesSelects = document.querySelector('#corteView .variantes-selects-corte');

    if (produtoCorte) produtoCorte.value = '';
    if (quantidadeCorte) quantidadeCorte.value = '';

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
        await obterProdutosDoStorage();
    } catch (error) {
        mostrarPopupMensagem(`Alerta: Falha ao pré-carregar dados de produtos: ${error.message.substring(0,100)}. Algumas funcionalidades podem demorar mais na primeira vez.`, 'aviso', 7000);
    }

    const statusFilterContainer = document.getElementById('statusFilter');

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
            
            await loadVariantesSelects(produtoNome, produtosDisponiveis);

            const produtoObj = produtosDisponiveis.find(p => p.nome === produtoNome);
            if (!produtoObj) {
                console.warn(`[produtoOP change] Produto "${produtoNome}" não encontrado na lista.`);
                camposDependentesParaReset.forEach(el => { if(el) el.style.display = 'none'; });
                if (infoCorteContainer) infoCorteContainer.innerHTML = '';
                return;
            }
            const produtoTemVariantes = (produtoObj.variantes?.length > 0 || produtoObj.grade?.length > 0);
            if (!produtoTemVariantes) {
                await verificarCorteEAtualizarFormOP();
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
                console.error("Botão 'Salvar OP' não encontrado no opForm.");
                mostrarPopupMensagem("Erro: Botão de salvar não encontrado.", "erro");
                return;
            }
            const originalButtonText = btnSalvar.innerHTML;
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<div class="spinner-btn-interno"></div> Salvando OP...';

            const numero = document.getElementById('numeroOP').value.trim();
            const produtoNome = document.getElementById('produtoOP').value;
            const varianteSelect = document.querySelector('#opFormView .variantes-selects select');
            const varianteValor = varianteSelect ? varianteSelect.value : '';
            const quantidadeStr = document.getElementById('quantidadeOP').value;
            const quantidade = parseInt(quantidadeStr) || 0;
            const dataEntrega = document.getElementById('dataEntregaOP').value;
            const observacoes = document.getElementById('observacoesOP').value.trim();
            const infoCorteContainer = document.getElementById('infoCorteContainer');
            
            let produtoObj;
            try {
                const todosOsProdutos = await obterProdutosDoStorage();
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

            let erros = [];
            if (!produtoNome) { 
                erros.push('Produto não selecionado');
            } else if (!produtoObj) { 
                erros.push(`Produto "${produtoNome}" é inválido ou não encontrado na configuração.`);
            } else {
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

            const pnGeradoParaNovoCorte = infoCorteContainer ? infoCorteContainer.dataset.pnGerado : null;
            let novaOP = {
                numero,
                produto: produtoNome,
                variante: varianteValor || null,
                quantidade,
                data_entrega: dataEntrega,
                observacoes,
                status: 'em-aberto',
                edit_id: generateUniqueId(),
                etapas: []
            };

            if (produtoObj && Array.isArray(produtoObj.etapas)) {
                novaOP.etapas = produtoObj.etapas.map(eInfo => ({
                    processo: typeof eInfo === 'object' ? eInfo.processo : eInfo,
                    usuario: '',
                    quantidade: 0,
                    lancado: false,
                    ultimoLancamentoId: null
                }));
            }

            if (corteDeEstoqueSelecionadoId) {
                const idxCorteNaOP = novaOP.etapas.findIndex(et => et.processo?.toLowerCase() === 'corte');
                if (idxCorteNaOP !== -1) {
                    novaOP.etapas[idxCorteNaOP].lancado = true;
                    novaOP.etapas[idxCorteNaOP].usuario = 'Estoque';
                    novaOP.etapas[idxCorteNaOP].quantidade = quantidade;
                }
                novaOP.status = 'produzindo';
            }

            try {
                const savedOP = await salvarOrdemDeProducao(novaOP);
                console.log('[opForm.submit] Ordem de Produção salva:', savedOP);

                let msgSucesso = `OP <strong>#${novaOP.numero}</strong> salva com sucesso!`;
                let durPopup = 5000;
                let htmlPop = true;
                let tipoPopup = 'sucesso';

                if (corteDeEstoqueSelecionadoId) {
                    await atualizarCorte(corteDeEstoqueSelecionadoId, 'usado', usuarioLogado?.nome || 'Sistema', savedOP.numero);
                    msgSucesso += "<br>Corte de estoque foi utilizado.";
                    console.log(`[opForm.submit] Corte de estoque ID ${corteDeEstoqueSelecionadoId} marcado como usado para OP ${savedOP.numero}.`);
                } else if (pnGeradoParaNovoCorte) {
                    const corteData = {
                        produto: produtoNome,
                        variante: varianteValor || null,
                        quantidade: quantidade,
                        data: new Date().toISOString().split('T')[0],
                        pn: pnGeradoParaNovoCorte,
                        status: 'pendente',
                        op: savedOP.numero,
                        cortador: null
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
                        tipoPopup = 'aviso';
                        durPopup = 0;
                    } else {
                        const savedCorteResponse = await resCorte.json();
                        console.log(`[opForm.submit] Pedido de corte (PN: ${savedCorteResponse.pn || pnGeradoParaNovoCorte}) para OP #${savedOP.numero} gerado com sucesso.`);
                        msgSucesso += `<br>Pedido de corte gerado. <a href="#cortes-pendentes" style="color:#0056b3;text-decoration:underline;font-weight:bold;">Ver Corte Pendente (PN: ${pnGeradoParaNovoCorte})</a>`;
                        durPopup = 0;
                    }
                }

                mostrarPopupMensagem(msgSucesso, tipoPopup, durPopup, htmlPop);

                console.log('[opForm submit] Limpando cache de OPs e Cortes.');
                limparCacheOrdens();
                if (pnGeradoParaNovoCorte || corteDeEstoqueSelecionadoId) {
                    limparCacheCortes();
                }

                if (infoCorteContainer) delete infoCorteContainer.dataset.pnGerado;
                corteDeEstoqueSelecionadoId = null;

                if (durPopup > 0) {
                    setTimeout(() => {
                        if (window.location.hash === '#adicionar') {
                            window.location.hash = '';
                        }
                    }, durPopup + 300);
                } else if (window.location.hash === '#adicionar') {
                    console.log("[opForm submit] Popup com interação/aviso. Limpando formulário para nova OP.");
                    limparFormularioOP();
                    await loadProdutosSelect();
                }

            } catch (errorPrincipal) {
                console.error('[opForm.submit] Erro CRÍTICO ao processar OP ou corte de estoque:', errorPrincipal);
                mostrarPopupMensagem(`Erro grave ao salvar OP: ${errorPrincipal.message.substring(0, 250)}`, 'erro');
            } finally {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = originalButtonText;
            }
        });
    } else {
        console.warn('[DOMContentLoaded] Formulário #opForm não encontrado.');
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
                    
                    if (!todasEtapasCompletas) {
                         mostrarPopupMensagem('Ainda há etapas pendentes ou não lançadas. Verifique todas as etapas antes de finalizar.', 'aviso', 7000);
                    } else {
                        op.status = 'finalizado';
                        op.data_final = new Date().toISOString();
                        
                        await window.saveOPChanges(op);
                        
                        mostrarPopupMensagem(`OP #${op.numero} finalizada com sucesso!`, 'sucesso');
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
                } else {
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

});