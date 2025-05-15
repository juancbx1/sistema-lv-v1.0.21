import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos, invalidateCache } from '/js/utils/storage.js'; // Removido getCachedData se não usado diretamente

// --- Variáveis Globais ---
let usuarioLogado = null;
let permissoes = [];
let todosOsProdutos = [];
let todosOsUsuarios = [];
let opDataCache = new Map();
let todosOsArrematesRegistrados = [];

// Paginação para Arremate
let currentPageArremate = 1;
const itemsPerPageArremate = 10; // Pode ser ajustado no CSS ou JS se necessário
let opsParaArrematarGlobal = [];

// Paginação para Embalagem
let currentPageEmbalagem = 1;
const itemsPerPageEmbalagem = 10; // Pode ser ajustado
let opsProntasParaEmbalarGlobal = [];

const lancamentosArremateEmAndamento = new Set();

// --- Funções Auxiliares ---
async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
         mostrarPopupMensagem('Erro de autenticação. Faça login novamente.', 'erro');
         window.location.href = '/index.html'; //  MODIFICADO: Para a página inicial/login principal
         throw new Error('Token não encontrado');
    }
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const url = options.method === 'GET' || !options.method
               ? `/api${endpoint}${endpoint.includes('?') ? '&' : '?'}_=${Date.now()}`
               : `/api${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });
        if (!response.ok) {
            let errorData = { error: `Erro ${response.status} - ${response.statusText}` }; // Default error
            try {
                 const jsonError = await response.json();
                 errorData = jsonError || errorData;
            } catch (e) {
                 try {
                      const textError = await response.text();
                      errorData.error = textError || errorData.error;
                 } catch (textE) {
                      // Se tudo falhar, usa o statusText, já pego no default
                 }
            }
            console.error(`[fetchFromAPI] Erro ${response.status} em ${endpoint}:`, errorData);

            // Apenas redireciona para login/token-expirado se for 401 ou se o erro explicitamente mencionar "token"
            if (response.status === 401 || (errorData.error || '').toLowerCase().includes('token expirado') || (errorData.error || '').toLowerCase().includes('token inválido')) {
                 localStorage.removeItem('token');
                 localStorage.removeItem('usuarioLogado'); // Se você ainda usa isso
                 localStorage.removeItem('permissoes'); // Limpa cache de permissões
                 // Decide para onde redirecionar baseado na mensagem
                 if ((errorData.error || '').toLowerCase().includes('token expirado')) {
                    mostrarPopupMensagem('Sua sessão expirou. Faça login novamente.', 'aviso');
                    window.location.href = '/admin/token-expirado.html'; // Ou sua página de token expirado
                 } else {
                    mostrarPopupMensagem('Erro de autenticação. Faça login novamente.', 'erro');
                    window.location.href = '/index.html'; // Ou sua página de login principal
                 }
            }
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status; // Adiciona o status ao objeto de erro
            err.data = errorData; // Adiciona os dados completos do erro
            throw err;
        }
        if (response.status === 204 || options.method === 'DELETE') {
            return { success: true };
        }
        return await response.json();
    } catch (error) {
        console.error(`[fetchFromAPI] Falha ao acessar ${url}:`, error);
        throw error; // Re-lança o erro para ser tratado por quem chamou
    }
}

async function buscarOpsFinalizadas() {
    const endpoint = '/ops-para-embalagem?all=true';
    console.log(`[buscarOpsFinalizadas] Buscando OPs finalizadas em ${endpoint}...`);
    try {
        const data = await fetchFromAPI(endpoint);
        const ops = data?.rows || [];
        console.log(`[buscarOpsFinalizadas] ${ops.length} OPs finalizadas encontradas.`);
        opDataCache.clear(); // Limpa cache antigo de OPs
        ops.forEach(op => opDataCache.set(op.numero, op)); // Popula com OPs completas
        return ops;
    } catch (error) {
        console.error('[buscarOpsFinalizadas] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar Ordens de Produção finalizadas.', 'erro');
        return [];
    }
}

async function buscarArrematesRegistrados(opNumero = null) {
    if (!opNumero && todosOsArrematesRegistrados.length > 0) {
        return todosOsArrematesRegistrados;
    }
    const endpoint = opNumero ? `/arremates?op_numero=${opNumero}` : '/arremates';
    console.log(`[buscarArrematesRegistrados] Buscando arremates em ${endpoint}...`);
    try {
        const arremates = await fetchFromAPI(endpoint);
        const arrematesArray = Array.isArray(arremates) ? arremates : (arremates?.rows || []);
        if (!opNumero) {
            todosOsArrematesRegistrados = arrematesArray;
            console.log(`[buscarArrematesRegistrados] Cache global de arremates atualizado com ${arrematesArray.length} registros.`);
        }
        return arrematesArray;
    } catch (error) {
        console.error('[buscarArrematesRegistrados] Erro:', error);
        return [];
    }
}

async function buscarUsuarios() {
    if (todosOsUsuarios.length > 0) return todosOsUsuarios;
    console.log('[buscarUsuarios] Buscando usuários da API...');
    try {
        const data = await fetchFromAPI('/usuarios'); // API retorna { rows: [...] } ou array
        todosOsUsuarios = Array.isArray(data) ? data : (data?.rows || []);
        console.log(`[buscarUsuarios] ${todosOsUsuarios.length} usuários carregados.`);
        return todosOsUsuarios;
    } catch (error) {
        console.error('[buscarUsuarios] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar usuários.', 'erro');
        return [];
    }
}

async function buscarTodosProdutos() {
    if (todosOsProdutos.length > 0) return todosOsProdutos;
    console.log('[buscarTodosProdutos] Buscando produtos...');
    try {
        todosOsProdutos = await obterProdutos();
        console.log(`[buscarTodosProdutos] ${todosOsProdutos.length} produtos carregados.`);
        return todosOsProdutos;
    } catch (error) {
        console.error('[buscarTodosProdutos] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar definições de produtos.', 'erro');
        return [];
    }
}

async function buscarOpPorNumero(opNumero) {
    if (opDataCache.has(opNumero)) {
        return opDataCache.get(opNumero);
    }
    console.log(`[buscarOpPorNumero] Buscando OP ${opNumero} da API...`);
    try {
        const op = await fetchFromAPI(`/ordens-de-producao/${opNumero}`); // Assume que este endpoint retorna uma OP única
        if (op) opDataCache.set(opNumero, op);
        return op;
    } catch (error) {
        console.error(`[buscarOpPorNumero] Erro ao buscar OP ${opNumero}:`, error);
        return null;
    }
}

function obterQuantidadeFinalProduzida(op) {
    if (op?.etapas && op.etapas.length > 0) {
        const ultimaEtapa = op.etapas[op.etapas.length - 1];
        const qtdUltimaEtapa = parseInt(ultimaEtapa?.quantidade);
        if (!isNaN(qtdUltimaEtapa) && qtdUltimaEtapa > 0) return qtdUltimaEtapa;
    }
    const qtdPrincipal = parseInt(op?.quantidade);
    return isNaN(qtdPrincipal) ? 0 : qtdPrincipal;
}

async function obterUsuariosTiktikParaProduto(produtoNome) {
    const produto = todosOsProdutos.find(p => p.nome === produtoNome);
    if (!produto) {
        console.warn(`[obterUsuariosTiktik] Produto "${produtoNome}" NÃO encontrado.`);
        return [];
    }
    if (!produto.etapasTiktik || !Array.isArray(produto.etapasTiktik) || produto.etapasTiktik.length === 0) {
        console.warn(`[obterUsuariosTiktik] Produto "${produtoNome}" não possui 'etapasTiktik'.`);
        return [];
    }
    const tipoFeitoPor = produto.etapasTiktik[0]?.feitoPor;
    if (!tipoFeitoPor) {
        console.warn(`[obterUsuariosTiktik] 'feitoPor' não definido para ${produtoNome}.`);
        return [];
    }
    const usuarios = await buscarUsuarios();
    const tipoFeitoPorLower = tipoFeitoPor.toLowerCase();
    const usuariosFiltrados = usuarios.filter(u => {
        const userTypes = u?.tipos;
        if (!userTypes) return false;
        if (Array.isArray(userTypes)) {
            return userTypes.some(type => typeof type === 'string' && type.toLowerCase() === tipoFeitoPorLower);
        } else if (typeof userTypes === 'string') {
            return userTypes.toLowerCase() === tipoFeitoPorLower;
        }
        return false;
    });
    console.log(`[obterUsuariosTiktik] ${usuariosFiltrados.length} usuários tipo '${tipoFeitoPor}' para ${produtoNome}.`);
    return usuariosFiltrados;
}


// --- Lógica de Renderização (AJUSTADA PARA NOVO HTML/CSS) ---

async function carregarTabelaArremate(opsParaArrematar) {
    console.log(`[carregarTabelaArremate] Renderizando ${opsParaArrematar.length} OPs para arremate.`);
    const tbody = document.getElementById('arremateTableBody');
    const paginationContainer = document.getElementById('arrematePaginationContainer'); // ID do HTML novo
    if (!tbody || !paginationContainer) {
        console.error('[carregarTabelaArremate] Elementos tbody ou paginationContainer não encontrados.');
        return;
    }

    tbody.innerHTML = '';
    paginationContainer.innerHTML = '';

    if (opsParaArrematar.length === 0) {
        // Colspan agora é 8 por causa das colunas "Arrematar Qtd." e "Ação" separadas
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum item aguardando arremate.</td></tr>`;
        return;
    }

    const totalItems = opsParaArrematar.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageArremate);
    const startIndex = (currentPageArremate - 1) * itemsPerPageArremate;
    const endIndex = Math.min(startIndex + itemsPerPageArremate, totalItems);
    const paginatedOPs = opsParaArrematar.slice(startIndex, endIndex);

    const usuariosTiktikPromises = paginatedOPs.map(op => obterUsuariosTiktikParaProduto(op.produto));
    const usuariosPorOP = await Promise.all(usuariosTiktikPromises);

    const fragment = document.createDocumentFragment();
    paginatedOPs.forEach((op, index) => {
        const tr = document.createElement('tr');
        tr.dataset.opNumero = op.numero;
        tr.dataset.opEditId = op.edit_id;
        tr.dataset.produto = op.produto;
        tr.dataset.variante = op.variante || '-';

        const quantidadePendente = op.quantidade_pendente_arremate;
        const usuariosTiktikDisponiveis = usuariosPorOP[index];
        const temPermissaoLancar = permissoes.includes('lancar-arremate');

        // Desabilitar controles se não houver usuários, quantidade ou permissão
        const controlesDesabilitados = usuariosTiktikDisponiveis.length === 0 || quantidadePendente === 0 || !temPermissaoLancar;

        tr.innerHTML = `
            <td>${op.numero}</td>
            <td>${op.produto}</td>
            <td>${op.variante || '-'}</td>
            <td>${op.quantidade_produzida_original}</td>
            <td class="quantidade-pendente-arremate">${quantidadePendente}</td>
            <td>
                <select class="ep-select select-usuario-tiktik" ${controlesDesabilitados ? 'disabled' : ''} title="${!temPermissaoLancar ? 'Sem permissão' : ''}">
                    <option value="">${usuariosTiktikDisponiveis.length === 0 ? 'Nenhum Tiktik' : 'Selecione...'}</option>
                    ${usuariosTiktikDisponiveis.map(user => `<option value="${user.nome}">${user.nome}</option>`).join('')}
                </select>
            </td>
            <td>
                <input type="number" class="ep-input input-quantidade-arremate" value="${quantidadePendente}" 
                       min="1" max="${quantidadePendente}" style="width: 80px;" ${controlesDesabilitados ? 'disabled' : ''} title="${!temPermissaoLancar ? 'Sem permissão' : ''}">
            </td>
            <td>
                <button class="ep-btn ep-btn-primary botao-lancar-arremate" ${controlesDesabilitados ? 'disabled' : ''} title="${!temPermissaoLancar ? 'Sem permissão para lançar' : (controlesDesabilitados && temPermissaoLancar ? 'Selecione usuário e/ou verifique quantidade' : 'Lançar Arremate')}">
                    Lançar
                </button>
            </td>
        `;

        const btnLancar = tr.querySelector('.botao-lancar-arremate');
        const inputQuantidade = tr.querySelector('.input-quantidade-arremate');
        const selectUser = tr.querySelector('.select-usuario-tiktik');

        const atualizarEstadoBotaoLancar = () => {
            if (btnLancar && inputQuantidade && selectUser) {
                const qtdValida = parseInt(inputQuantidade.value) > 0 && parseInt(inputQuantidade.value) <= parseInt(inputQuantidade.max);
                const usuarioSelecionado = selectUser.value !== "";
                btnLancar.disabled = !(qtdValida && usuarioSelecionado && temPermissaoLancar);
            }
        };
        
        if (btnLancar) btnLancar.addEventListener('click', handleLancarArremateClick);
        if (inputQuantidade) inputQuantidade.addEventListener('input', atualizarEstadoBotaoLancar);
        if (selectUser) selectUser.addEventListener('change', atualizarEstadoBotaoLancar);
        
        // Chamada inicial para definir o estado do botão
        if (temPermissaoLancar) atualizarEstadoBotaoLancar();


        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    if (totalPages > 1) {
        let paginationHTML = `<button class="ep-btn pagination-btn prev" data-page="${Math.max(1, currentPageArremate - 1)}" ${currentPageArremate === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageArremate} de ${totalPages}</span>`;
        paginationHTML += `<button class="ep-btn pagination-btn next" data-page="${Math.min(totalPages, currentPageArremate + 1)}" ${currentPageArremate === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainer.innerHTML = paginationHTML;

        paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageArremate = parseInt(btn.dataset.page);
                carregarTabelaArremate(opsParaArrematarGlobal);
            });
        });
    }
}


async function carregarTabelaProdutosEmbalagem(opsProntas) {
    console.log(`[carregarTabelaProdutosEmbalagem] Renderizando ${opsProntas.length} OPs para embalagem.`);
    const tbody = document.getElementById('produtosTableBody');
    const paginationContainer = document.getElementById('paginationContainer'); // ID da pag embalagem
    const searchInput = document.getElementById('searchProduto'); // ID do input de busca

    if (!tbody || !paginationContainer || !searchInput) {
        console.error('[carregarTabelaProdutosEmbalagem] Elementos tbody, paginationContainer ou searchInput não encontrados.');
        return;
    }

    tbody.innerHTML = '';
    paginationContainer.innerHTML = '';

    const search = searchInput.value.toLowerCase();
    let filteredOPs = opsProntas;
    if (search) {
        filteredOPs = opsProntas.filter(op =>
            op.produto.toLowerCase().includes(search) ||
            (op.variante && op.variante.toLowerCase().includes(search)) ||
            op.numero.toString().includes(search)
        );
    }

    const totalItems = filteredOPs.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageEmbalagem);
    if (currentPageEmbalagem > totalPages) currentPageEmbalagem = Math.max(1, totalPages);

    const startIndex = (currentPageEmbalagem - 1) * itemsPerPageEmbalagem;
    const endIndex = Math.min(startIndex + itemsPerPageEmbalagem, totalItems);
    const paginatedOPs = filteredOPs.slice(startIndex, endIndex);

    if (paginatedOPs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">${search ? 'Nenhum produto encontrado para "' + search + '".' : 'Nenhum produto pronto para embalar.'}</td></tr>`;
        adjustForMobile(); // Chama para garantir que a mensagem apareça corretamente no mobile se for o caso
        return;
    }

    const fragment = document.createDocumentFragment();
    const produtosCadastrados = await buscarTodosProdutos();

    for (const op of paginatedOPs) {
        const tr = document.createElement('tr');
        tr.dataset.opNumero = op.numero;
        tr.dataset.opEditId = op.edit_id;
        tr.dataset.produto = op.produto;
        tr.dataset.variante = op.variante || '-';

        const quantidadeTotalArrematadaParaEstaOP = op.quantidade_arrematada;
        const quantidadeDisponivelReal = await obterQuantidadeDisponivelAjustada(
            op.produto,
            op.variante || '-',
            quantidadeTotalArrematadaParaEstaOP,
            op.numero
        );
        tr.dataset.quantidadeDisponivel = quantidadeDisponivelReal;

        const produtoCadastrado = produtosCadastrados.find(p => p.nome === op.produto);
        const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (op.variante === '-' ? '' : op.variante));
        const imagem = gradeItem?.imagem || '';

        tr.innerHTML = `
            <td>${op.produto}</td>
            <td>${op.variante || '-'}</td>
            <td class="col-img"><div class="ep-thumbnail-tabela">${imagem ? `<img src="${imagem}" alt="Miniatura">` : ''}</div></td>
            <td class="col-qtd">${quantidadeDisponivelReal}</td>
            <td>${op.numero}</td>
        `;

        if (quantidadeDisponivelReal > 0 && permissoes.includes('lancar-embalagem')) { // Adicionada verificação de permissão
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => handleProductClick(op));
        } else {
            tr.style.opacity = '0.6';
            tr.style.cursor = 'not-allowed';
            tr.title = quantidadeDisponivelReal <= 0 ? 'Quantidade zerada para embalagem' : 'Sem permissão para embalar';
        }
        fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);

    if (totalPages > 1) {
        let paginationHTML = `<button class="ep-btn pagination-btn prev" data-page="${Math.max(1, currentPageEmbalagem - 1)}" ${currentPageEmbalagem === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageEmbalagem} de ${totalPages}</span>`;
        paginationHTML += `<button class="ep-btn pagination-btn next" data-page="${Math.min(totalPages, currentPageEmbalagem + 1)}" ${currentPageEmbalagem === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainer.innerHTML = paginationHTML;

        paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageEmbalagem = parseInt(btn.dataset.page);
                carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal);
            });
        });
    }
    adjustForMobile(); // Chama após renderizar a tabela
}

// --- Lógica de Eventos (AJUSTADA) ---

async function handleLancarArremateClick(event) {
    const btn = event.target.closest('.botao-lancar-arremate'); // Garante que pegamos o botão
    if (!btn) return;
    const tr = btn.closest('tr');
    if (!tr) return;

    const opNumero = tr.dataset.opNumero;
    const opEditId = tr.dataset.opEditId;
    const produto = tr.dataset.produto;
    const variante = tr.dataset.variante;

    const selectUser = tr.querySelector('.select-usuario-tiktik');
    const usuarioTiktik = selectUser?.value;
    const inputQuantidadeArremate = tr.querySelector('.input-quantidade-arremate');
    
    if (!inputQuantidadeArremate) {
        mostrarPopupMensagem('Erro: Campo de quantidade não encontrado.', 'erro');
        return;
    }

    const quantidadeParaArrematar = parseInt(inputQuantidadeArremate.value);
    const quantidadePendenteMax = parseInt(inputQuantidadeArremate.max);

    if (!opNumero || !produto) {
        mostrarPopupMensagem('Erro: Dados da OP não encontrados.', 'erro'); return;
    }
    if (!usuarioTiktik) {
        mostrarPopupMensagem('Selecione o usuário do arremate.', 'aviso');
        selectUser?.focus(); return;
    }
    if (isNaN(quantidadeParaArrematar) || quantidadeParaArrematar <= 0) {
        mostrarPopupMensagem('Insira uma quantidade válida para arrematar.', 'aviso');
        inputQuantidadeArremate.focus(); return;
    }
    if (quantidadeParaArrematar > quantidadePendenteMax) {
        mostrarPopupMensagem(`Quantidade excede o pendente (${quantidadePendenteMax}).`, 'aviso');
        inputQuantidadeArremate.value = quantidadePendenteMax;
        inputQuantidadeArremate.focus(); return;
    }

    const lockKey = `${opNumero}-${usuarioTiktik}-${quantidadeParaArrematar}-${Date.now()}`;
    if (lancamentosArremateEmAndamento.has(lockKey)) return;

    btn.disabled = true;
    const originalButtonText = btn.textContent;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lançando...'; // Adiciona ícone de carregamento
    if (selectUser) selectUser.disabled = true;
    inputQuantidadeArremate.disabled = true;
    lancamentosArremateEmAndamento.add(lockKey);

    try {
        const arremateData = {
            op_numero: opNumero,
            op_edit_id: opEditId,
            produto: produto,
            variante: variante === '-' ? null : variante,
            quantidade_arrematada: quantidadeParaArrematar,
            usuario_tiktik: usuarioTiktik
        };
        const resultado = await fetchFromAPI('/arremates', { // API /api/arremates deve retornar 403 se sem permissão
            method: 'POST',
            body: JSON.stringify(arremateData)
        });
        console.log('[handleLancarArremateClick] Arremate salvo:', resultado);
         mostrarPopupMensagem(`Arremate de ${quantidadeParaArrematar} unidade(s) para OP ${opNumero} lançado!`, 'sucesso');
        todosOsArrematesRegistrados = [];
        await atualizarListasArremateEEmbalagem();

    } catch (error) {
        console.error(`[handleLancarArremateClick] Erro ao lançar arremate para OP ${opNumero}:`, error);

        if (error.status === 403) { // <<< NOVO: Trata o 403 Forbidden especificamente
            mostrarPopupMensagem('Você não possui autorização para lançar Arremate.', 'erro');
        } else if (error.status === 409) { // Se sua API retorna 409 para duplicata
            mostrarPopupMensagem(`Este arremate específico pode já ter sido lançado. Verifique os registros.`, 'aviso');
        }
        else if (error.message && error.status !== 401) { // 401 já é tratado em fetchFromAPI
             mostrarPopupMensagem(`Erro ao lançar arremate: ${error.message}.`, 'erro');
        }

        if (tr.contains(btn)) {
            btn.disabled = false; // Reabilita o botão original
            btn.innerHTML = 'Lançar'; // Restaura o texto/ícone original
        }
        if (tr.contains(selectUser)) selectUser.disabled = false;
        if (tr.contains(inputQuantidadeArremate)) inputQuantidadeArremate.disabled = false;

    } finally {
        lancamentosArremateEmAndamento.delete(lockKey);
    }
}

async function handleProductClick(op) { // op é o objeto da opsProntasParaEmbalarGlobal
    console.log(`[handleProductClick] Clicado em:`, op);

    // Elementos da view de lista (que serão escondidos)
    const arremateView = document.getElementById('arremateView');
    const embalagemListView = document.getElementById('embalagemListView');
    // Elemento da view de detalhe (que será mostrado)
    const embalarView = document.getElementById('embalarView');

    // Recalcula a quantidade disponível REAL no momento do clique
    const quantidadeTotalArrematada = op.quantidade_arrematada; // Já é a soma
    const quantidadeDisponivelReal = await obterQuantidadeDisponivelAjustada(
        op.produto,
        op.variante || '-',
        quantidadeTotalArrematada,
        op.numero
    );

    if (quantidadeDisponivelReal <= 0) {
        mostrarPopupMensagem('Este item não possui mais quantidade para embalagem.', 'aviso');
        await carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal); // Atualiza a lista
        return;
    }

    if (arremateView && embalagemListView && embalarView) {
        arremateView.classList.add('hidden'); // Usando classe 'hidden'
        embalagemListView.classList.add('hidden');
        embalarView.classList.remove('hidden');
        window.location.hash = '#embalar';

        localStorage.setItem('embalagemAtual', JSON.stringify({
            op_numero: op.numero,
            op_edit_id: op.edit_id,
            produto: op.produto,
            variante: op.variante || '-',
            quantidade: quantidadeDisponivelReal // Passa a quantidade REAL disponível
        }));

        await carregarEmbalagem(op.produto, op.variante || '-', quantidadeDisponivelReal);
    } else {
        console.error('[handleProductClick] Uma ou mais views não encontradas (arremateView, embalagemListView, embalarView).');
    }
}

async function atualizarListasArremateEEmbalagem() {
    console.log('[atualizarListasArremateEEmbalagem] Atualizando listas...');
    try {
        const [opsFinalizadasOriginais, arrematesJaRegistrados] = await Promise.all([
            buscarOpsFinalizadas(),
            buscarArrematesRegistrados()
        ]);

        opsParaArrematarGlobal = [];
        for (const op of opsFinalizadasOriginais) {
            const quantidadeProduzidaOriginal = obterQuantidadeFinalProduzida(op);
            let totalJaArrematadoParaEstaOP = 0;
            arrematesJaRegistrados
                .filter(arremate => arremate.op_numero === op.numero)
                .forEach(arremate => {
                    totalJaArrematadoParaEstaOP += parseInt(arremate.quantidade_arrematada) || 0;
                });
            const quantidadePendenteDeArremate = quantidadeProduzidaOriginal - totalJaArrematadoParaEstaOP;
            if (quantidadePendenteDeArremate > 0) {
                opsParaArrematarGlobal.push({
                    ...op,
                    quantidade_produzida_original: quantidadeProduzidaOriginal,
                    quantidade_pendente_arremate: quantidadePendenteDeArremate,
                });
            }
        }

        const opsAgrupadasParaEmbalagem = new Map();
        for (const arremate of arrematesJaRegistrados) {
            const opNumero = arremate.op_numero;
            const quantidadeArrematadaNesteLancamento = parseInt(arremate.quantidade_arrematada) || 0;
            if (quantidadeArrematadaNesteLancamento <= 0) continue;

            const opOriginalCorrespondente = opsFinalizadasOriginais.find(o => o.numero === opNumero) || opDataCache.get(opNumero); // Tenta cache se não achar na lista de finalizadas
            if (!opOriginalCorrespondente) {
                console.warn(`[atualizarListas] OP ${opNumero} do arremate ID ${arremate.id} não encontrada.`);
                continue;
            }

            if (!opsAgrupadasParaEmbalagem.has(opNumero)) {
                opsAgrupadasParaEmbalagem.set(opNumero, {
                    numero: opNumero,
                    edit_id: opOriginalCorrespondente.edit_id,
                    produto: opOriginalCorrespondente.produto,
                    variante: opOriginalCorrespondente.variante,
                    etapas: opOriginalCorrespondente.etapas, // Para obterQuantidadeFinalProduzida, se necessário
                    quantidade_total_arrematada_para_op: 0,
                });
            }
            const opAgrupada = opsAgrupadasParaEmbalagem.get(opNumero);
            opAgrupada.quantidade_total_arrematada_para_op += quantidadeArrematadaNesteLancamento;
        }
        opsProntasParaEmbalarGlobal = Array.from(opsAgrupadasParaEmbalagem.values()).map(opAgrupada => ({
            ...opAgrupada,
            quantidade_arrematada: opAgrupada.quantidade_total_arrematada_para_op
        }));

        const totalPagesArremate = Math.ceil(opsParaArrematarGlobal.length / itemsPerPageArremate);
        currentPageArremate = Math.min(currentPageArremate, Math.max(1, totalPagesArremate));

        await carregarTabelaArremate(opsParaArrematarGlobal);
        await carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal);

        // Controle de visibilidade das seções principais
        const arremateView = document.getElementById('arremateView');
        const embalagemListView = document.getElementById('embalagemListView');
        const embalarView = document.getElementById('embalarView');

        if (!arremateView || !embalagemListView || !embalarView) {
            console.error("[atualizarListas] Views não encontradas."); return;
        }
        
        if (window.location.hash === '#embalar') {
            arremateView.classList.add('hidden');
            embalagemListView.classList.add('hidden');
            embalarView.classList.remove('hidden');
        } else {
            embalarView.classList.add('hidden');
            opsParaArrematarGlobal.length > 0 ? arremateView.classList.remove('hidden') : arremateView.classList.add('hidden');
            embalagemListView.classList.remove('hidden'); // Lista de embalagem sempre visível ou com mensagem de vazia
        }
    } catch (error) {
        console.error('[atualizarListasArremateEEmbalagem] Erro:', error);
        mostrarPopupMensagem('Erro ao atualizar dados da página.', 'erro');
    }
    console.log('[atualizarListasArremateEEmbalagem] Listas atualizadas.');
}

// --- Funções de Popup, Debounce (sem alteração significativa) ---
function mostrarPopupMensagem(mensagem, tipo = 'erro') {
    console.log(`[POPUP-${tipo.toUpperCase()}]: ${mensagem}`);
    const popupId = `popup-${Date.now()}`; // ID único para cada popup
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `ep-popup-mensagem ep-popup-${tipo}`; // Usar classes do novo CSS
    popup.textContent = mensagem;
    document.body.appendChild(popup);
    setTimeout(() => {
        const activePopup = document.getElementById(popupId);
        if (activePopup) activePopup.remove();
    }, 4000);
}
/* CSS para ep-popup-mensagem (adicione ao seu CSS principal)
.ep-popup-mensagem {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 25px;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    z-index: 1050;
    font-size: 0.95rem;
    font-weight: 500;
    opacity: 0;
    animation: ep-popup-fadein 0.3s forwards, ep-popup-fadeout 0.3s 3.7s forwards;
}
@keyframes ep-popup-fadein { from { opacity: 0; bottom: 0px; } to { opacity: 1; bottom: 20px; } }
@keyframes ep-popup-fadeout { from { opacity: 1; bottom: 20px; } to { opacity: 0; bottom: 0px; } }

.ep-popup-sucesso { background-color: var(--cor-verde-sucesso); color: var(--cor-branco); }
.ep-popup-erro { background-color: var(--cor-vermelho-erro); color: var(--cor-branco); }
.ep-popup-aviso { background-color: var(--cor-laranja-aviso); color: var(--cor-branco); }
*/


function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- Função para Mobile (AJUSTADA) ---
function adjustForMobile() {
    const isMobileView = window.innerWidth <= 768; // Ponto de quebra do CSS para cards
    const tableContainer = document.getElementById('produtosTableContainer'); // Container da tabela desktop
    const cardContainer = document.getElementById('productCardContainer'); // Container dos cards mobile
    const tableBody = document.getElementById('produtosTableBody');

    if (!tableContainer || !cardContainer || !tableBody) {
        console.warn('[adjustForMobile] Elementos da tabela de embalagem ou cards não encontrados.');
        return;
    }

    if (isMobileView) {
        tableContainer.classList.add('hidden'); // Esconde tabela desktop
        cardContainer.classList.remove('hidden'); // Mostra container de cards
        cardContainer.innerHTML = ''; // Limpa cards antigos

        let hasRows = false;
        Array.from(tableBody.getElementsByTagName('tr')).forEach(row => {
            const cells = row.getElementsByTagName('td');
            if (cells.length > 0 && !row.querySelector('td[colspan]')) { // Não é linha de "nenhum item"
                hasRows = true;
                const card = document.createElement('div');
                card.className = 'ep-product-card';
                Object.keys(row.dataset).forEach(key => card.dataset[key] = row.dataset[key]);

                const quantidadeDisponivel = parseFloat(row.dataset.quantidadeDisponivel) || 0;
                const temPermissaoEmbalarMobile = permissoes.includes('lancar-embalagem');

                if (quantidadeDisponivel <= 0 || !temPermissaoEmbalarMobile) {
                    card.classList.add('disabled');
                    card.title = quantidadeDisponivel <= 0 ? 'Quantidade zerada' : 'Sem permissão';
                } else {
                    card.addEventListener('click', () => row.click()); // Simula clique na linha da tabela original
                }
                
                // Thumbnail: cells[2] contém <div class="ep-thumbnail-tabela"><img></div>
                const thumbnailHTML = cells[2]?.querySelector('.ep-thumbnail-tabela')?.innerHTML || '';

                card.innerHTML = `
                    <div class="ep-product-card-header">
                        <div class="ep-thumbnail-card">${thumbnailHTML}</div>
                        <div class="ep-product-card-info">
                            <div class="product-name">${cells[0]?.textContent || 'N/A'}</div>
                            <div class="product-variant">${cells[1]?.textContent || '-'}</div>
                            <div class="product-op">OP Origem: ${cells[4]?.textContent || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="ep-product-card-qty">Disponível: ${cells[3]?.textContent || '0'}</div>
                `;
                cardContainer.appendChild(card);
            }
        });
        if (!hasRows && tableBody.firstChild?.querySelector('td[colspan]')) {
            // Se não tem linhas de dados, mas tem a mensagem de "nenhum item", exibe-a nos cards
            cardContainer.innerHTML = `<p style="text-align:center; padding:20px; color:var(--cor-cinza-texto-secundario);">${tableBody.firstChild.textContent}</p>`;
        }


    } else { // Tela maior
        tableContainer.classList.remove('hidden'); // Mostra tabela desktop
        cardContainer.classList.add('hidden');    // Esconde container de cards
        cardContainer.innerHTML = '';             // Limpa cards
    }
}


// --- Funções de Kit (AJUSTADAS PARA NOVOS IDs/CLASSES E LÓGICA) ---
async function temKitsDisponiveis(produto, variante) {
    // Lógica existente parece OK, apenas garantir que buscarTodosProdutos funciona
    const produtos = await buscarTodosProdutos();
    const kits = produtos.filter(p => p.is_kit);
    const varAtualLower = (variante === '-' ? '' : variante).toLowerCase();
    return kits.some(kit =>
        kit.grade?.some(g =>
            g.composicao?.some(c =>
                (c.produto || kit.nome).toLowerCase() === produto.toLowerCase() &&
                (c.variacao === '-' ? '' : (c.variacao || '')).toLowerCase() === varAtualLower
            )
        )
    );
}

async function carregarKitsDisponiveis(produtoBase, varianteBase) {
    const produtos = await buscarTodosProdutos();
    const kitsListEl = document.getElementById('kits-list'); // Novo ID do HTML
    if (!kitsListEl) return;
    kitsListEl.innerHTML = '';

    const varBaseLower = (varianteBase === '-' ? '' : varianteBase).toLowerCase();
    const kitsFiltrados = produtos.filter(kit =>
        kit.is_kit && kit.grade?.some(g =>
            g.composicao?.some(item =>
                (item.produto || kit.nome).toLowerCase() === produtoBase.toLowerCase() &&
                (item.variacao === '-' ? '' : (item.variacao || '')).toLowerCase() === varBaseLower
            )
        )
    );

    if (kitsFiltrados.length === 0) {
        kitsListEl.innerHTML = '<p>Nenhum kit cadastrado utiliza este item base.</p>';
        document.getElementById('kit-variacao-composicao-wrapper')?.classList.add('hidden'); // Esconde o resto
        return;
    }
    document.getElementById('kit-variacao-composicao-wrapper')?.classList.remove('hidden'); // Mostra

    kitsFiltrados.forEach(kit => {
        const button = document.createElement('button');
        button.className = 'ep-btn'; // Classe do novo CSS
        button.textContent = kit.nome;
        button.addEventListener('click', (e) => {
            document.querySelectorAll('#kits-list button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            carregarVariacoesKit(kit.nome, produtoBase, varianteBase);
        });
        kitsListEl.appendChild(button);
    });
    if (kitsListEl.children.length > 0) kitsListEl.children[0].click();
}

async function carregarVariacoesKit(nomeKit, produtoBase, varianteBase) {
    const produtos = await buscarTodosProdutos();
    const kitVariacoesSelect = document.getElementById('kit-variacoes'); // Novo ID
    const kitTableContainer = document.getElementById('kit-table-container'); // Novo ID
    const kitFooter = document.getElementById('kit-footer'); // Novo ID
    const kitErrorMessage = document.getElementById('kit-error-message'); // Novo ID

    if (!kitVariacoesSelect || !kitTableContainer || !kitFooter || !kitErrorMessage) return;

    kitVariacoesSelect.innerHTML = '<option value="">Carregando...</option>';
    kitTableContainer.classList.add('hidden');
    kitFooter.innerHTML = '';
    kitErrorMessage.classList.add('hidden');

    const kit = produtos.find(p => p.is_kit && p.nome === nomeKit);
    if (!kit || !kit.grade) {
        kitVariacoesSelect.innerHTML = '<option value="">Erro: Kit não encontrado</option>'; return;
    }

    const varBaseLower = (varianteBase === '-' ? '' : varianteBase).toLowerCase();
    const variacoesFiltradas = kit.grade.filter(g =>
        g.composicao?.some(item =>
            (item.produto || kit.nome).toLowerCase() === produtoBase.toLowerCase() &&
            (item.variacao === '-' ? '' : (item.variacao || '')).toLowerCase() === varBaseLower
        )
    );

    if (variacoesFiltradas.length === 0) {
        kitVariacoesSelect.innerHTML = '<option value="">Nenhuma variação deste kit usa o item base</option>';
        kitErrorMessage.textContent = 'Nenhuma variação do kit selecionado utiliza o produto/variante base.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    kitVariacoesSelect.innerHTML = '<option value="">Selecione a variação do Kit</option>';
    variacoesFiltradas.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade.variacao;
        option.textContent = grade.variacao || 'Padrão';
        kitVariacoesSelect.appendChild(option);
    });

    // Limpar e adicionar listener
    const newSelect = kitVariacoesSelect.cloneNode(true);
    kitVariacoesSelect.parentNode.replaceChild(newSelect, kitVariacoesSelect);
    newSelect.addEventListener('change', (e) => {
        if (e.target.value) carregarTabelaKit(nomeKit, e.target.value);
        else { // "Selecione" escolhido
            kitTableContainer.classList.add('hidden');
            kitFooter.innerHTML = '';
            kitErrorMessage.classList.add('hidden');
        }
    });
}

async function carregarTabelaKit(kitNome, variacaoKitSelecionada) {
    const produtos = await buscarTodosProdutos();
    const kit = produtos.find(p => p.nome === kitNome && p.is_kit);
    const kitTableBody = document.getElementById('kit-table-body');
    const kitFooter = document.getElementById('kit-footer');
    const kitErrorMessage = document.getElementById('kit-error-message');
    const kitTableContainer = document.getElementById('kit-table-container');
    const qtdEnviarKitsInput = document.getElementById('qtd-enviar-kits'); // Novo ID
    const kitEstoqueBtn = document.getElementById('kit-estoque-btn'); // Novo ID

    if (!kitTableBody || !kitFooter || !kitErrorMessage || !kitTableContainer || !qtdEnviarKitsInput || !kitEstoqueBtn) return;

    kitTableBody.innerHTML = `<tr><td colspan="3">Carregando composição...</td></tr>`; // Colspan 3 agora
    kitFooter.innerHTML = ''; // Será preenchido depois
    kitErrorMessage.classList.add('hidden');
    kitTableContainer.classList.remove('hidden'); // Mostra o container da tabela

    if (!kit || !kit.grade) { /* ... erro ... */ return; }
    const variacaoDoKit = kit.grade.find(g => g.variacao === variacaoKitSelecionada);
    if (!variacaoDoKit || !variacaoDoKit.composicao || variacaoDoKit.composicao.length === 0) {
        kitErrorMessage.textContent = 'Variação do kit sem composição.';
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = '';
        kitTableContainer.classList.add('hidden'); // Esconde se não há composição
        qtdEnviarKitsInput.disabled = true;
        kitEstoqueBtn.disabled = true;
        return;
    }

    const composicao = variacaoDoKit.composicao;
    kitTableBody.innerHTML = '';
    let menorQuantidadePossivel = Infinity;
    let todasDisponiveis = true;

    for (const item of composicao) {
        const produtoComponente = item.produto || kit.nome;
        const varianteComponente = item.variacao || '-';
        const quantidadeNecessaria = parseInt(item.quantidade) || 1;

        const opComponente = opsProntasParaEmbalarGlobal.find(op =>
            op.produto === produtoComponente && (op.variante || '-') === varianteComponente
        );
        let qtdDisponivelComponente = 0;
        if (opComponente) {
            const qtdInicialComp = opComponente.quantidade_arrematada; // Já é a soma dos arremates
            qtdDisponivelComponente = await obterQuantidadeDisponivelAjustada(
                produtoComponente, varianteComponente, qtdInicialComp, opComponente.numero
            );
        }
        if (qtdDisponivelComponente < quantidadeNecessaria) todasDisponiveis = false;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${produtoComponente} ${varianteComponente !== '-' ? `(${varianteComponente})` : ''}</td>
            <td style="text-align:center;">${quantidadeNecessaria}</td>
            <td style="text-align:center;">
                <input type="number" class="ep-input readonly" value="${qtdDisponivelComponente}" readonly title="Disponível: ${qtdDisponivelComponente}">
            </td>
        `;
        if (qtdDisponivelComponente < quantidadeNecessaria) tr.classList.add('item-insuficiente');
        kitTableBody.appendChild(tr);
        menorQuantidadePossivel = Math.min(menorQuantidadePossivel, Math.floor(qtdDisponivelComponente / quantidadeNecessaria));
    }

    const maxKitsMontaveis = todasDisponiveis ? menorQuantidadePossivel : 0;
    document.getElementById('qtd-disponivel-kits').textContent = maxKitsMontaveis; // Atualiza o span no footer

    if (maxKitsMontaveis <= 0) {
        kitErrorMessage.textContent = 'Quantidade insuficiente de componentes para montar este kit.';
        kitErrorMessage.classList.remove('hidden');
    }

    // Configurar input e botão no footer (que já existe no HTML)
    qtdEnviarKitsInput.value = "0";
    qtdEnviarKitsInput.max = maxKitsMontaveis;
    qtdEnviarKitsInput.disabled = maxKitsMontaveis <= 0;
    kitEstoqueBtn.disabled = true; // Começa desabilitado até que uma quantidade > 0 seja inserida

    // Limpar e adicionar listener para input de qtd de kits
    const newQtdEnviarKitsInput = qtdEnviarKitsInput.cloneNode(true);
    qtdEnviarKitsInput.parentNode.replaceChild(newQtdEnviarKitsInput, qtdEnviarKitsInput);
    newQtdEnviarKitsInput.addEventListener('input', () => {
        let valor = parseInt(newQtdEnviarKitsInput.value) || 0;
        if (valor < 0) valor = 0;
        else if (valor > maxKitsMontaveis) valor = maxKitsMontaveis;
        newQtdEnviarKitsInput.value = valor;
        kitEstoqueBtn.disabled = valor <= 0;
    });
    
    // Limpar e adicionar listener para botão de enviar kit
    const newKitEstoqueBtn = kitEstoqueBtn.cloneNode(true);
    kitEstoqueBtn.parentNode.replaceChild(newKitEstoqueBtn, kitEstoqueBtn);
    newKitEstoqueBtn.disabled = true; // Garante que comece desabilitado
    newKitEstoqueBtn.addEventListener('click', () => {
        const qtdKitsParaEnviar = parseInt(newQtdEnviarKitsInput.value) || 0;
        if (qtdKitsParaEnviar > 0 && qtdKitsParaEnviar <= maxKitsMontaveis) {
            enviarKitParaEstoque(kitNome, variacaoKitSelecionada, qtdKitsParaEnviar);
        } else {
            mostrarPopupMensagem('Quantidade de kits inválida.', 'erro');
        }
    });
}

async function enviarKitParaEstoque(kitNome, variacaoKit, qtdKitsEnviados) {
    const btn = document.getElementById('kit-estoque-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Embalando...';
    }
    try {
        const produtos = await buscarTodosProdutos();
        const kitDef = produtos.find(p => p.nome === kitNome && p.is_kit);
        if (!kitDef) throw new Error('Kit não encontrado.');
        const variacaoDoKit = kitDef.grade.find(g => g.variacao === variacaoKit);
        if (!variacaoDoKit?.composicao) throw new Error('Composição do kit não encontrada.');

        for (const item of variacaoDoKit.composicao) {
            const prodComp = item.produto || kitNome;
            const varComp = item.variacao || '-';
            const qtdNecPorKit = parseInt(item.quantidade) || 1;
            const qtdTotalUsada = qtdKitsEnviados * qtdNecPorKit;
            const opComp = opsProntasParaEmbalarGlobal.find(op =>
                op.produto === prodComp && (op.variante || '-') === varComp
            );
            if (!opComp) throw new Error(`OP para componente ${prodComp}:${varComp} não achada.`);
            await atualizarQuantidadeEmbalada(prodComp, varComp, qtdTotalUsada, opComp.numero, opComp.edit_id);
        }
        mostrarPopupMensagem(`${qtdKitsEnviados} kit(s) de ${kitNome} - ${variacaoKit} embalados!`, 'sucesso');
        window.location.hash = '';
        localStorage.removeItem('embalagemAtual');
        await atualizarListasArremateEEmbalagem();
    } catch (error) {
        console.error('[enviarKitParaEstoque] Erro:', error);
        mostrarPopupMensagem(`Erro ao embalar kit: ${error.message}`, 'erro');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-boxes"></i> Montar e Embalar Kits';
        }
    }
}

async function obterQuantidadeDisponivelAjustada(produto, variante, quantidadeInicialArrematada, opNumero) {
    try {
        const op = await buscarOpPorNumero(opNumero); // Busca a OP para pegar 'quantidadeEmbalada'
        if (!op) {
            console.warn(`[obterQtdDispAjustada] OP ${opNumero} não encontrada.`);
            return Math.max(0, quantidadeInicialArrematada);
        }
        const quantidadeJaEmbalada = parseInt(op.quantidadeEmbalada) || 0;
        const qtdAjustada = quantidadeInicialArrematada - quantidadeJaEmbalada;
        return Math.max(0, qtdAjustada);
    } catch (error) {
        console.error(`[obterQtdDispAjustada] Erro OP ${opNumero}:`, error);
        return Math.max(0, quantidadeInicialArrematada);
    }
}

async function atualizarQuantidadeEmbalada(produto, variante, quantidadeEnviada, opNumero, opEditId) {
    if (!opNumero && !opEditId) throw new Error('ID da OP não fornecido para atualização.');
    try {
        const opAtual = await buscarOpPorNumero(opNumero);
        const qtdJaEmbaladaAtual = parseInt(opAtual?.quantidadeEmbalada) || 0;
        const novaQtdEmbalada = qtdJaEmbaladaAtual + quantidadeEnviada;
        const dados = {
            edit_id: opEditId || undefined,
            numero: opEditId ? undefined : opNumero,
            quantidadeEmbalada: novaQtdEmbalada
        };
        await fetchFromAPI('/ordens-de-producao', { method: 'PUT', body: JSON.stringify(dados) });
        if (opAtual) {
            opAtual.quantidadeEmbalada = novaQtdEmbalada;
            opDataCache.set(opNumero, opAtual);
        } else {
            opDataCache.delete(opNumero); // Invalida se não estava no cache
        }
    } catch (error) {
        console.error('[atualizarQtdEmbalada] Erro:', error);
        mostrarPopupMensagem(`Erro ao atualizar estoque da OP ${opNumero}.`, 'erro');
        throw error;
    }
}


// --- Função Principal de Carregamento da Tela de Embalagem (AJUSTADA) ---
async function carregarEmbalagem(produto, variante, quantidadeDisponivel) {
    console.log(`[carregarEmbalagem] Para ${produto}:${variante}, Qtd Disp: ${quantidadeDisponivel}`);

    // Elementos da tela de detalhe
    const embalagemTitleEl = document.getElementById('embalagemTitle');
    const embalagemSubTitleEl = document.getElementById('embalagemSubTitle');
    const produtoNomeEl = document.getElementById('produtoNome');
    const varianteNomeEl = document.getElementById('varianteNome');
    const opOrigemEmbalagemEl = document.getElementById('opOrigemEmbalagem');
    const qtdDisponivelElUnidade = document.getElementById('qtdDisponivel');
    const qtdEnviarInputUnidade = document.getElementById('qtdEnviar');
    const estoqueBtnUnidade = document.getElementById('estoqueBtn');
    const embalagemThumbnailEl = document.getElementById('embalagemThumbnail');
    
    // --- PONTO CRÍTICO PARA AS ABAS ---
    // Certifique-se de que estes seletores correspondem EXATAMENTE ao seu HTML redesenhado
    // No HTML que você me mostrou, os botões de aba estão dentro de <div class="ep-tabs">
    // e têm a classe 'ep-tab-btn' e o atributo 'data-tab'.
    const kitTabBtn = document.querySelector('.ep-tabs button[data-tab="kit"]'); // Mais específico
    const unidadeTabBtn = document.querySelector('.ep-tabs button[data-tab="unidade"]'); // Mais específico
    const kitTabPanel = document.getElementById('kit-tab');
    const unidadeTabPanel = document.getElementById('unidade-tab');
    // Wrapper que contém o select de variação do kit e a tabela de composição
    const kitVariacaoComposicaoWrapper = document.getElementById('kit-variacao-composicao-wrapper');


    // Validação básica de elementos
    if (!embalagemTitleEl || !embalagemSubTitleEl || !produtoNomeEl || !varianteNomeEl || !opOrigemEmbalagemEl ||
        !qtdDisponivelElUnidade || !qtdEnviarInputUnidade || !estoqueBtnUnidade || !embalagemThumbnailEl ||
        !kitTabBtn || !unidadeTabBtn || !kitTabPanel || !unidadeTabPanel || !kitVariacaoComposicaoWrapper ) { // Adicionado kitVariacaoComposicaoWrapper
        console.error('[carregarEmbalagem] Um ou mais elementos DOM da tela de embalagem não foram encontrados. Verifique os IDs e classes.');
        // Log detalhado dos elementos que podem estar faltando:
        if (!kitTabBtn) console.error("Elemento kitTabBtn não encontrado. Verifique se existe um botão com data-tab='kit' dentro de .ep-tabs.");
        if (!unidadeTabBtn) console.error("Elemento unidadeTabBtn não encontrado. Verifique se existe um botão com data-tab='unidade' dentro de .ep-tabs.");
        if (!kitTabPanel) console.error("Elemento kitTabPanel (ID: kit-tab) não encontrado.");
        if (!unidadeTabPanel) console.error("Elemento unidadeTabPanel (ID: unidade-tab) não encontrado.");
        if (!kitVariacaoComposicaoWrapper) console.error("Elemento kitVariacaoComposicaoWrapper (ID: kit-variacao-composicao-wrapper) não encontrado.");

        mostrarPopupMensagem('Erro ao carregar interface de embalagem.', 'erro');
        window.location.hash = ''; return;
    }

    // ... (resto do preenchimento de dados: embalagemAtualData, imagem, títulos, etc.) ...
    const embalagemAtualData = JSON.parse(localStorage.getItem('embalagemAtual') || '{}');
    const opNumeroAtual = embalagemAtualData.op_numero;
    // const opEditIdAtual = embalagemAtualData.op_edit_id; // Descomente se usar

    const produtoCadastrado = todosOsProdutos.find(p => p.nome === produto);
    const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (variante === '-' ? '' : variante));
    const imagem = gradeItem?.imagem || '';
    embalagemThumbnailEl.innerHTML = imagem ? `<img src="${imagem}" alt="Imagem ${produto} ${variante}">` : 'Sem imagem';

    embalagemTitleEl.textContent = `Embalar Detalhes`;
    embalagemSubTitleEl.textContent = `${produto}${variante !== '-' ? ` - ${variante}` : ''} (OP Origem: ${opNumeroAtual})`;
    
    produtoNomeEl.textContent = produto;
    varianteNomeEl.textContent = variante !== '-' ? variante : 'Padrão';
    opOrigemEmbalagemEl.textContent = opNumeroAtual;
    qtdDisponivelElUnidade.textContent = quantidadeDisponivel;
    if (qtdDisponivelElUnidade.parentElement && qtdDisponivelElUnidade.parentElement.classList.contains('ep-qtd-disponivel-destaque')) {
        qtdDisponivelElUnidade.parentElement.classList.remove('changing');
    }
    qtdEnviarInputUnidade.value = '';
    qtdEnviarInputUnidade.max = quantidadeDisponivel;
    // estoqueBtnUnidade.disabled = true; // Será definido abaixo com base na permissão

    // --- LÓGICA DAS ABAS ---
    const temKits = await temKitsDisponiveis(produto, variante);
    console.log(`[carregarEmbalagem] Produto ${produto}:${variante} pode ser usado em kits? ${temKits}`);

    // Reset inicial das abas e painéis
    unidadeTabBtn.classList.remove('active');
    kitTabBtn.classList.remove('active');
    unidadeTabPanel.classList.remove('active', 'hidden'); // Remove active e hidden
    kitTabPanel.classList.remove('active', 'hidden');   // Remove active e hidden
    kitVariacaoComposicaoWrapper.classList.add('hidden'); // Esconde o conteúdo do kit por padrão

    const podeEmbalarUnidade = permissoes.includes('lancar-embalagem-unidade');
    const podeMontarKit = permissoes.includes('montar-kit');

    if (temKits && podeMontarKit) {
        console.log("[carregarEmbalagem] Mostrar Aba Kit como ativa.");
        kitTabBtn.style.display = 'inline-flex'; // Garante que o botão da aba kit seja visível
        kitTabBtn.classList.add('active');
        kitTabPanel.classList.add('active');    // Torna o painel do kit ativo
        kitTabPanel.classList.remove('hidden'); // Garante que o painel do kit seja visível
        
        unidadeTabPanel.classList.add('hidden'); // Esconde o painel de unidade
        unidadeTabBtn.classList.remove('active'); // Garante que a aba unidade não esteja ativa

        await carregarKitsDisponiveis(produto, variante); // Carrega os kits
    } else if (podeEmbalarUnidade) {
        console.log("[carregarEmbalagem] Mostrar Aba Unidade como ativa.");
        kitTabBtn.style.display = 'none';       // Esconde o botão da aba kit
        kitTabPanel.classList.add('hidden');    // Garante que o painel do kit esteja escondido
        kitTabPanel.classList.remove('active'); // Garante que o painel kit não esteja ativo
        
        unidadeTabBtn.classList.add('active');
        unidadeTabPanel.classList.add('active');  // Torna o painel de unidade ativo
        unidadeTabPanel.classList.remove('hidden'); // Garante que o painel de unidade seja visível
    } else {
        // Nenhum tipo de embalagem permitido ou disponível
        console.log("[carregarEmbalagem] Nenhuma opção de embalagem disponível ou permitida.");
        kitTabBtn.style.display = 'none';
        unidadeTabBtn.style.display = 'none'; // Poderia esconder ambas as abas
        kitTabPanel.classList.add('hidden');
        unidadeTabPanel.classList.add('hidden');
        mostrarPopupMensagem('Nenhuma opção de embalagem permitida para este item.', 'aviso');
    }
    
    // Habilitar/desabilitar botão da aba unidade com base na permissão e quantidade
    estoqueBtnUnidade.disabled = !podeEmbalarUnidade || quantidadeDisponivel <= 0 || qtdEnviarInputUnidade.value === '' || parseInt(qtdEnviarInputUnidade.value) <=0;


    // Configuração Aba Unidade (Listeners) - GARANTIR QUE ESTES ELEMENTOS SÃO OS ATUAIS
    let currentQtdEnviarInputUnidade = document.getElementById('qtdEnviar');
    let currentEstoqueBtnUnidade = document.getElementById('estoqueBtn');

    // Recria os listeners para evitar duplicidade ou referências antigas
    const newQtdEnviarInput = currentQtdEnviarInputUnidade.cloneNode(true);
    currentQtdEnviarInputUnidade.parentNode.replaceChild(newQtdEnviarInput, currentQtdEnviarInputUnidade);
    currentQtdEnviarInputUnidade = newQtdEnviarInput; // Atualiza a referência

    const newEstoqueBtnUnidade = currentEstoqueBtnUnidade.cloneNode(true);
    currentEstoqueBtnUnidade.parentNode.replaceChild(newEstoqueBtnUnidade, currentEstoqueBtnUnidade);
    currentEstoqueBtnUnidade = newEstoqueBtnUnidade; // Atualiza a referência
    
    // Definir o estado inicial do botão da unidade
    currentEstoqueBtnUnidade.disabled = !podeEmbalarUnidade || quantidadeDisponivel <= 0 || true; // Começa desabilitado (true no final) até que algo seja digitado

    currentQtdEnviarInputUnidade.addEventListener('input', () => {
        const valor = parseInt(currentQtdEnviarInputUnidade.value) || 0;
        const qtdDispPai = currentQtdEnviarInputUnidade.closest('.ep-embalar-form-card')?.querySelector('.ep-qtd-disponivel-destaque');
        const qtdDispSpan = qtdDispPai?.querySelector('strong#qtdDisponivel');

        let habilitarBotao = false;
        if (valor >= 1 && valor <= quantidadeDisponivel) {
            if (qtdDispSpan) qtdDispSpan.textContent = quantidadeDisponivel - valor;
            if (qtdDispPai) qtdDispPai.classList.add('changing');
            habilitarBotao = true;
        } else {
            if (valor > quantidadeDisponivel) currentQtdEnviarInputUnidade.value = quantidadeDisponivel;
            else if (valor <= 0 && currentQtdEnviarInputUnidade.value !== '') currentQtdEnviarInputUnidade.value = '';
            
            if (qtdDispSpan) qtdDispSpan.textContent = quantidadeDisponivel;
            if (qtdDispPai) qtdDispPai.classList.remove('changing');
            habilitarBotao = false;
        }
        currentEstoqueBtnUnidade.disabled = !podeEmbalarUnidade || !habilitarBotao;
    });

    currentEstoqueBtnUnidade.addEventListener('click', async () => {
        const quantidadeEnviada = parseInt(currentQtdEnviarInputUnidade.value);
        if (isNaN(quantidadeEnviada) || quantidadeEnviada < 1 || quantidadeEnviada > quantidadeDisponivel) {
            mostrarPopupMensagem('Quantidade inválida!', 'erro'); return;
        }
        currentEstoqueBtnUnidade.disabled = true;
        currentEstoqueBtnUnidade.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        try {
            // opNumeroAtual e opEditIdAtual precisam estar definidos corretamente no escopo
            const embalagemAtual = JSON.parse(localStorage.getItem('embalagemAtual') || '{}');
            await atualizarQuantidadeEmbalada(produto, variante, quantidadeEnviada, embalagemAtual.op_numero, embalagemAtual.op_edit_id);
            mostrarPopupMensagem(`${quantidadeEnviada} unidade(s) embalada(s)!`, 'sucesso');
            window.location.hash = '';
            localStorage.removeItem('embalagemAtual');
            await atualizarListasArremateEEmbalagem();
        } catch (error) {
            // Erro já tratado em atualizarQuantidadeEmbalada ou fetchFromAPI se for 403
            // Apenas reabilita o botão
            currentEstoqueBtnUnidade.disabled = !podeEmbalarUnidade || quantidadeDisponivel <= 0;
            currentEstoqueBtnUnidade.innerHTML = '<i class="fas fa-box-open"></i> Embalar e Enviar';
        }
    });
}

function alternarAba(event) {
    const tabBtn = event.target.closest('.ep-tab-btn');
    if (!tabBtn || tabBtn.classList.contains('active')) return; // Não faz nada se já está ativa ou não é um botão de aba
    
    const tabId = tabBtn.dataset.tab;
    console.log(`[alternarAba] Alternando para aba: ${tabId}`);

    // Desativa todos os botões de aba e painéis
    document.querySelectorAll('.ep-tabs .ep-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.ep-embalar-view .ep-tab-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.classList.add('hidden');
    });

    // Ativa o botão e painel clicados
    tabBtn.classList.add('active');
    const activePanel = document.getElementById(`${tabId}-tab`);
    if (activePanel) {
        activePanel.classList.add('active');
        activePanel.classList.remove('hidden');
        console.log(`[alternarAba] Painel ${activePanel.id} ativado e visível.`);
    } else {
        console.error(`[alternarAba] Painel para aba ${tabId} não encontrado.`);
    }
}


// --- Inicialização e Listeners (AJUSTADOS) ---
async function inicializar() {
    console.log('[inicializar] Embalagem...');
    try {
        const auth = await verificarAutenticacao('embalagem-de-produtos.html', ['acesso-embalagem-de-produtos']);
        if (!auth) { window.location.href = 'acesso-negado.html'; return; }
        permissoes = auth.permissoes || [];
        usuarioLogado = auth.usuario;

        // Adiciona classe ao body para CSS saber que o usuário está autenticado (se você usa isso)
        document.body.classList.add('autenticado');


        await Promise.all([buscarTodosProdutos(), buscarUsuarios()]);
        await atualizarListasArremateEEmbalagem(); // Carrega dados e renderiza
        setupEventListeners();
        handleHashChange(); // Verifica hash inicial
        adjustForMobile(); // Ajuste inicial para mobile
    } catch (error) {
        console.error('[inicializar] Erro geral:', error);
        mostrarPopupMensagem('Erro crítico ao carregar. Tente recarregar.', 'erro');
    }
    console.log('[inicializar] Embalagem concluída.');
}

function setupEventListeners() {
    const searchProdutoInput = document.getElementById('searchProduto');
    if (searchProdutoInput) {
        searchProdutoInput.addEventListener('input', debounce(() => {
            currentPageEmbalagem = 1;
            carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal);
        }, 350));
    }

    const voltarBtn = document.getElementById('voltarBtn');
    if (voltarBtn) {
        voltarBtn.addEventListener('click', () => {
            window.location.hash = '';
            localStorage.removeItem('embalagemAtual');
        });
    }

    document.querySelectorAll('.ep-tabs .ep-tab-btn').forEach(btn => {
        btn.addEventListener('click', alternarAba);
    });

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('resize', debounce(adjustForMobile, 200));
}

async function handleHashChange() {
    const hash = window.location.hash;
    console.log(`[handleHashChange] Hash: ${hash}`);

    const arremateView = document.getElementById('arremateView');
    const embalagemListView = document.getElementById('embalagemListView'); // View da lista de produtos para embalar
    const embalarView = document.getElementById('embalarView'); // View de detalhe da embalagem

    if (!arremateView || !embalagemListView || !embalarView) {
        console.error("[handleHashChange] Views não encontradas."); return;
    }

    if (hash === '#embalar') {
        const embalagemData = JSON.parse(localStorage.getItem('embalagemAtual') || 'null');
        if (embalagemData && embalagemData.produto && typeof embalagemData.quantidade !== 'undefined') {
            arremateView.classList.add('hidden');
            embalagemListView.classList.add('hidden');
            embalarView.classList.remove('hidden');
            // A função carregarEmbalagem deve ser chamada aqui
            await carregarEmbalagem(embalagemData.produto, embalagemData.variante, embalagemData.quantidade);
        } else {
            console.warn('[handleHashChange] #embalar sem dados válidos. Voltando para lista.');
            window.location.hash = ''; // Força o else a ser executado
        }
    } else { // Se não for #embalar, ou se dados inválidos para #embalar
        embalarView.classList.add('hidden');
        localStorage.removeItem('embalagemAtual');
        if (window.location.hash === '') { // Só recarrega se voltou para a "home" da página
             await atualizarListasArremateEEmbalagem();
        }
    }
     adjustForMobile(); // Ajusta para mobile após mudança de view
}

// --- Ponto de Entrada ---
document.addEventListener('DOMContentLoaded', inicializar);

window.limparCacheEmbalagem = () => {
    opDataCache.clear();
    todosOsProdutos = [];
    todosOsUsuarios = [];
    todosOsArrematesRegistrados = []; // Limpar este também
    opsParaArrematarGlobal = [];
    opsProntasParaEmbalarGlobal = [];
    invalidateCache('produtos');
    invalidateCache('usuarios'); // Se você tiver cache para usuários
    console.log('[limparCacheEmbalagem] Caches limpos.');
    mostrarPopupMensagem('Cache local limpo.', 'aviso');
    atualizarListasArremateEEmbalagem();
};