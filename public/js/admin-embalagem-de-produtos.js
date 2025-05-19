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
    try {
        const data = await fetchFromAPI(endpoint);
        const ops = data?.rows || [];
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
    try {
        const data = await fetchFromAPI('/usuarios'); // API retorna { rows: [...] } ou array
        todosOsUsuarios = Array.isArray(data) ? data : (data?.rows || []);
        return todosOsUsuarios;
    } catch (error) {
        console.error('[buscarUsuarios] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar usuários.', 'erro');
        return [];
    }
}

async function buscarTodosProdutos() {
    if (todosOsProdutos.length > 0) return todosOsProdutos;
    try {
        todosOsProdutos = await obterProdutos();
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
    if (!op) return 0; // Adiciona verificação se OP é nula/undefined

    if (op.etapas && Array.isArray(op.etapas) && op.etapas.length > 0) {
        for (let i = op.etapas.length - 1; i >= 0; i--) {
            const etapa = op.etapas[i];
            // Verifica se a etapa existe e se 'quantidade' está definida (não null/undefined)
            if (etapa && typeof etapa.quantidade !== 'undefined' && etapa.quantidade !== null) {
                const qtdEtapa = parseInt(etapa.quantidade, 10);
                // Verifica se a conversão para int resultou em um número válido
                if (!isNaN(qtdEtapa) && qtdEtapa >= 0) {
                    // Considerar se uma etapa com quantidade 0 significa "sem produção finalizada"
                    // Para o propósito de "produto pronto", geralmente esperamos > 0, mas 0 pode ser válido.
                    return qtdEtapa;
                }
            }
        }
        console.warn(`[obterQuantidadeFinalProduzida] OP ${op.numero}: Nenhuma etapa com quantidade válida encontrada. Etapas:`, op.etapas);
    } else {
        console.warn(`[obterQuantidadeFinalProduzida] OP ${op.numero}: Não possui etapas ou etapas não é um array.`);
    }

    // Fallback para a quantidade principal da OP se nenhuma etapa tiver quantidade válida
    const qtdPrincipal = parseInt(op.quantidade, 10);
    if (!isNaN(qtdPrincipal) && qtdPrincipal >= 0) {
        console.log(`[obterQuantidadeFinalProduzida] OP ${op.numero}: Usando quantidade principal da OP: ${qtdPrincipal}`);
        return qtdPrincipal;
    }
    
    console.error(`[obterQuantidadeFinalProduzida] OP ${op.numero}: Não foi possível determinar a quantidade final. Retornando 0.`);
    return 0;
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
    return usuariosFiltrados;
}


// --- Lógica de Renderização (AJUSTADA PARA NOVO HTML/CSS) ---

async function carregarTabelaArremate(opsParaArrematar) {
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


// public/js/admin-embalagem-de-produtos.js

async function carregarTabelaProdutosEmbalagem(arrematesParaEmbalar) { // Nome do parâmetro mudou
    console.log(`[carregarTabelaProdutosEmbalagem] Renderizando ${arrematesParaEmbalar.length} arremates para embalagem.`);
    const tbody = document.getElementById('produtosTableBody');
    const paginationContainer = document.getElementById('paginationContainer');
    const searchInput = document.getElementById('searchProduto');

    if (!tbody || !paginationContainer || !searchInput) {
        console.error('[carregarTabelaProdutosEmbalagem] Elementos DOM não encontrados.');
        return;
    }

    tbody.innerHTML = '';
    paginationContainer.innerHTML = '';

    const search = searchInput.value.toLowerCase();
    let filteredArremates = arrematesParaEmbalar; // Nome da variável mudou
    if (search) {
        filteredArremates = arrematesParaEmbalar.filter(arr => // 'arr' de arremate
            arr.produto.toLowerCase().includes(search) ||
            (arr.variante && arr.variante.toLowerCase().includes(search)) ||
            arr.op_numero_origem.toString().includes(search) || // Pode buscar pela OP de origem
            arr.id_arremate.toString().includes(search) // Pode buscar pelo ID do arremate
        );
    }

    const totalItems = filteredArremates.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageEmbalagem);
    if (currentPageEmbalagem > totalPages) currentPageEmbalagem = Math.max(1, totalPages);

    const startIndex = (currentPageEmbalagem - 1) * itemsPerPageEmbalagem;
    const endIndex = Math.min(startIndex + itemsPerPageEmbalagem, totalItems);
    const paginatedArremates = filteredArremates.slice(startIndex, endIndex); // Nome da variável mudou

    if (paginatedArremates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">${search ? 'Nenhum arremate encontrado para "' + search + '".' : 'Nenhum item pronto para embalar.'}</td></tr>`;
        adjustForMobile();
        return;
    }

    const fragment = document.createDocumentFragment();
    const produtosCadastrados = await buscarTodosProdutos(); // Para imagens

    for (const arremateItem of paginatedArremates) { // 'arremateItem'
        const tr = document.createElement('tr');
        // Armazenar dados importantes no dataset da linha
        tr.dataset.idArremate = arremateItem.id_arremate; // ID do Arremate
        tr.dataset.produto = arremateItem.produto;
        tr.dataset.variante = arremateItem.variante || '-';
        tr.dataset.opNumeroOrigem = arremateItem.op_numero_origem;
        // A quantidade disponível é diretamente do objeto arremateItem
        tr.dataset.quantidadeDisponivel = arremateItem.quantidade_disponivel_para_embalar;

        const produtoCadastrado = produtosCadastrados.find(p => p.nome === arremateItem.produto);
        const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (arremateItem.variante === '-' ? '' : arremateItem.variante));
        const imagem = gradeItem?.imagem || '';

        tr.innerHTML = `
            <td>${arremateItem.produto}</td>
            <td>${arremateItem.variante || '-'}</td>
            <td class="col-img"><div class="ep-thumbnail-tabela">${imagem ? `<img src="${imagem}" alt="Miniatura">` : ''}</div></td>
            <td class="col-qtd">${arremateItem.quantidade_disponivel_para_embalar}</td> 
            <td>OP Origem: ${arremateItem.op_numero_origem} (Arremate ID: ${arremateItem.id_arremate})</td> 
        `;
        // A coluna OP Origem agora pode mostrar mais detalhes

        if (arremateItem.quantidade_disponivel_para_embalar > 0 && permissoes.includes('lancar-embalagem')) {
            tr.style.cursor = 'pointer';
            // Passamos o objeto 'arremateItem' inteiro para handleProductClick
            tr.addEventListener('click', () => handleProductClick(arremateItem));
        } else {
            tr.style.opacity = '0.6';
            tr.style.cursor = 'not-allowed';
            tr.title = arremateItem.quantidade_disponivel_para_embalar <= 0 ? 'Quantidade zerada para embalagem' : 'Sem permissão para embalar';
        }
        fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);

    if (totalPages > 1) {
        // Lógica de paginação (existente)
        let paginationHTML = `<button class="ep-btn pagination-btn prev" data-page="${Math.max(1, currentPageEmbalagem - 1)}" ${currentPageEmbalagem === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageEmbalagem} de ${totalPages}</span>`;
        paginationHTML += `<button class="ep-btn pagination-btn next" data-page="${Math.min(totalPages, currentPageEmbalagem + 1)}" ${currentPageEmbalagem === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainer.innerHTML = paginationHTML;

        paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageEmbalagem = parseInt(btn.dataset.page);
                // Passar a lista correta (arrematesParaEmbalar ou opsProntasParaEmbalarGlobal)
                carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal); 
            });
        });
    }
    adjustForMobile();
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

// public/js/admin-embalagem-de-produtos.js

// A função handleProductClick recebe o objeto 'arremateItem' diretamente
async function handleProductClick(arremateItem) {
    console.log(`[handleProductClick] Clicado em Arremate ID: ${arremateItem.id_arremate}`, arremateItem);

    const arremateView = document.getElementById('arremateView');
    const embalagemListView = document.getElementById('embalagemListView');
    const embalarView = document.getElementById('embalarView');

    // A quantidade_disponivel_para_embalar já está calculada e correta no arremateItem
    const quantidadeDisponivelReal = arremateItem.quantidade_disponivel_para_embalar;

    if (quantidadeDisponivelReal <= 0) {
        mostrarPopupMensagem('Este item não possui mais quantidade para embalagem.', 'aviso');
        // A lista já deve estar atualizada, mas uma recarga não faria mal se houvesse concorrência
        // await atualizarListasArremateEEmbalagem(); // Considerar se necessário
        return;
    }

    if (arremateView && embalagemListView && embalarView) {
        arremateView.classList.add('hidden');
        embalagemListView.classList.add('hidden');
        embalarView.classList.remove('hidden');
        window.location.hash = '#embalar'; // Navega para a view de embalagem

        // Armazenar dados do ARREMATE que está sendo embalado
        localStorage.setItem('embalagemAtual', JSON.stringify({
            id_arremate: arremateItem.id_arremate, // ID do arremate é crucial
            op_numero_origem: arremateItem.op_numero_origem,
            op_edit_id_origem: arremateItem.op_edit_id_origem, // Se usado para kits ou info adicional
            produto: arremateItem.produto,
            variante: arremateItem.variante || '-',
            // 'quantidade' aqui é a quantidade disponível PARA ESTA SESSÃO DE EMBALAGEM
            // que é o saldo atual do arremate
            quantidade: quantidadeDisponivelReal 
        }));

        // Chama carregarEmbalagem com os dados do arremate
        await carregarEmbalagem(
            arremateItem.produto, 
            arremateItem.variante || '-', 
            quantidadeDisponivelReal // Passa a quantidade disponível deste arremate
        );
    } else {
        console.error('[handleProductClick] Uma ou mais views não encontradas.');
    }
}

async function atualizarListasArremateEEmbalagem() {
    try {
        // buscarArrematesRegistrados() é crucial para AMBAS as listas agora
        const [opsFinalizadasOriginais, todosOsArrematesDoSistema] = await Promise.all([
            buscarOpsFinalizadas(),
            buscarArrematesRegistrados() // Isso já busca todos e atualiza 'todosOsArrematesRegistrados'
        ]);

        // 1. Montar lista para a TABELA DE ARREMATE (Itens Aguardando Arremate)
        // Esta lógica permanece a mesma: OPs finalizadas com quantidade pendente de arremate.
        opsParaArrematarGlobal = [];
        for (const op of opsFinalizadasOriginais) {
            const quantidadeProduzidaOriginal = obterQuantidadeFinalProduzida(op);
            let totalJaArrematadoParaEstaOP = 0;
            todosOsArrematesDoSistema // Usar a lista completa de arremates
                .filter(arremate => arremate.op_numero === op.numero)
                .forEach(arremate => {
                    totalJaArrematadoParaEstaOP += parseInt(arremate.quantidade_arrematada) || 0;
                });
            const quantidadePendenteDeArremate = quantidadeProduzidaOriginal - totalJaArrematadoParaEstaOP;
            if (quantidadePendenteDeArremate > 0) {
                opsParaArrematarGlobal.push({
                    ...op, // Dados da OP original
                    quantidade_produzida_original: quantidadeProduzidaOriginal,
                    quantidade_pendente_arremate: quantidadePendenteDeArremate,
                });
            }
        }

        // 2. Montar lista para a TABELA DE EMBALAGEM (Produtos Prontos para Embalar)
        // Esta lista agora será composta por ARREMATES que ainda têm saldo para serem embalados.
        opsProntasParaEmbalarGlobal = [];
        for (const arremate of todosOsArrematesDoSistema) {
            const quantidadeTotalNesteArremate = parseInt(arremate.quantidade_arrematada) || 0;
            const quantidadeJaEmbaladaNesteArremate = parseInt(arremate.quantidade_ja_embalada) || 0; // Vem da nova coluna
            const saldoParaEmbalarNesteArremate = quantidadeTotalNesteArremate - quantidadeJaEmbaladaNesteArremate;

            if (saldoParaEmbalarNesteArremate > 0) {
                // Para a tabela de embalagem, precisamos de alguns dados da OP original também (como edit_id se usado para kits, etc.)
                // Mas o ID principal para a ação de embalar será o arremate.id
                // Se a OP original for necessária para algo (ex: imagem do produto), podemos tentar buscá-la
                // ou garantir que os dados do produto no arremate são suficientes.
                // Por simplicidade agora, vamos focar nos dados do arremate.

                opsProntasParaEmbalarGlobal.push({
                    // Dados principais vêm do ARREMATE
                    id_arremate: arremate.id, // MUITO IMPORTANTE
                    op_numero_origem: arremate.op_numero, // Para referência
                    op_edit_id_origem: arremate.op_edit_id, // Para referência, se necessário
                    produto: arremate.produto,
                    variante: arremate.variante,
                    // A quantidade_disponivel_para_embalar é o saldo deste arremate específico
                    quantidade_disponivel_para_embalar: saldoParaEmbalarNesteArremate,
                    // Mantemos o total original do arremate para informação, se necessário
                    quantidade_total_do_arremate: quantidadeTotalNesteArremate 
                });
            }
        }

        // Ajustar paginação e carregar as tabelas
        const totalPagesArremate = Math.ceil(opsParaArrematarGlobal.length / itemsPerPageArremate);
        currentPageArremate = Math.min(currentPageArremate, Math.max(1, totalPagesArremate));
        // currentPageEmbalagem será ajustado dentro de carregarTabelaProdutosEmbalagem

        await carregarTabelaArremate(opsParaArrematarGlobal);
        await carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal);

        // Controle de visibilidade das seções (lógica existente)
        const arremateView = document.getElementById('arremateView');
        const embalagemListView = document.getElementById('embalagemListView');
        const embalarView = document.getElementById('embalarView');

        if (!arremateView || !embalagemListView || !embalarView) {
            console.error("[atualizarListasArremateEEmbalagem] Views não encontradas."); return;
        }
        
        if (window.location.hash === '#embalar') {
            arremateView.classList.add('hidden');
            embalagemListView.classList.add('hidden');
            embalarView.classList.remove('hidden');
        } else {
            embalarView.classList.add('hidden');
            opsParaArrematarGlobal.length > 0 ? arremateView.classList.remove('hidden') : arremateView.classList.add('hidden');
            embalagemListView.classList.remove('hidden');
        }

    } catch (error) {
        console.error('[atualizarListasArremateEEmbalagem] Erro geral:', error);
        mostrarPopupMensagem('Erro ao atualizar dados da página de embalagem.', 'erro');
    }
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
    console.log(`[temKitsDisponiveis] Verificando para Produto: "${produto}", Variante: "${variante}"`); // Log 1
    const produtos = await buscarTodosProdutos();
    if (!produtos || produtos.length === 0) {
        console.warn('[temKitsDisponiveis] Nenhum produto carregado (todosOsProdutos está vazio). Retornando false.');
        return false;
    }

    const kits = produtos.filter(p => p.is_kit === true); // Garanta a comparação com booleano se 'is_kit' for booleano
    console.log(`[temKitsDisponiveis] Encontrados ${kits.length} produtos marcados como is_kit.`); // Log 2

    if (kits.length === 0) return false;

    const produtoLower = produto.toLowerCase();
    const varAtualLower = (variante === '-' ? '' : variante).toLowerCase();
    console.log(`[temKitsDisponiveis] Buscando por produtoLower: "${produtoLower}", varAtualLower: "${varAtualLower}"`); // Log 3

    let encontrado = false;
    for (const kit of kits) {
        // console.log(`[temKitsDisponiveis] Verificando Kit: "${kit.nome}"`); // Log Detalhado (pode gerar muito log)
        if (kit.grade && Array.isArray(kit.grade)) {
            for (const g of kit.grade) {
                // console.log(`[temKitsDisponiveis] Verificando Grade do Kit "${kit.nome}", Variação da Grade: "${g.variacao}"`); // Log Detalhado
                if (g.composicao && Array.isArray(g.composicao)) {
                    for (const c of g.composicao) {
                        const compProdutoNome = (c.produto || kit.nome); // Se c.produto não existir, usa o nome do kit (comum para kits simples)
                        const compProdutoNomeLower = compProdutoNome.toLowerCase();
                        const compVariacao = (c.variacao === '-' ? '' : (c.variacao || ''));
                        const compVariacaoLower = compVariacao.toLowerCase();

                        // console.log(`[temKitsDisponiveis] -- Componente: P: "${compProdutoNomeLower}", V: "${compVariacaoLower}"`); // Log Detalhado

                        if (compProdutoNomeLower === produtoLower && compVariacaoLower === varAtualLower) {
                            console.log(`[temKitsDisponiveis] ENCONTRADO! Kit: "${kit.nome}", Componente: P:"${compProdutoNome}", V:"${compVariacao}"`); // Log 4
                            encontrado = true;
                            break; // Sai do loop de composicao
                        }
                    }
                }
                if (encontrado) break; // Sai do loop de grade
            }
        }
        if (encontrado) break; // Sai do loop de kits
    }
    console.log(`[temKitsDisponiveis] Resultado final para "${produto}"/"${variante}": ${encontrado}`); // Log 5
    return encontrado;
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
    const kitVariacoesSelect = document.getElementById('kit-variacoes'); 
    const kitTableContainer = document.getElementById('kit-table-container'); 
    const kitFooter = document.getElementById('kit-footer'); // Ainda pegamos para controlar visibilidade se necessário
    const kitErrorMessage = document.getElementById('kit-error-message'); 

    // Validação básica dos elementos principais do kit
    if (!kitVariacoesSelect || !kitTableContainer || !kitFooter || !kitErrorMessage) {
        console.error("[carregarVariacoesKit] Elementos DOM para seleção de variação do kit não encontrados.");
        return;
    }

    kitVariacoesSelect.innerHTML = '<option value="">Carregando...</option>';
    
    // Apenas controlar a visibilidade, não limpar o conteúdo se ele for estático
    kitTableContainer.classList.add('hidden'); 
    kitFooter.classList.add('hidden'); // Esconde o footer inteiro inicialmente ou quando nenhuma variação é selecionada
    kitErrorMessage.classList.add('hidden');
    // NÃO FAÇA: kitFooter.innerHTML = ''; 

    const kit = produtos.find(p => p.is_kit && p.nome === nomeKit);
    if (!kit || !kit.grade) {
        kitVariacoesSelect.innerHTML = '<option value="">Erro: Kit não encontrado</option>'; 
        // Pode ser útil mostrar uma mensagem de erro no kitErrorMessage aqui também se kit não encontrado
        kitFooter.classList.remove('hidden'); // Mostra o footer para exibir a mensagem de erro
        kitErrorMessage.textContent = 'Kit não encontrado ou não possui grade.';
        kitErrorMessage.classList.remove('hidden');
        return;
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
        kitFooter.classList.remove('hidden'); // Mostra o footer para exibir a mensagem de erro
        kitErrorMessage.textContent = 'Nenhuma variação do kit selecionado utiliza o produto/variante base.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    // Se chegou aqui, há variações, então o footer pode ser mostrado quando uma variação for selecionada
    // Mas ele ainda está escondido por padrão até uma seleção válida.
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
        // Pegar os elementos novamente aqui ou passá-los para garantir o escopo correto
        const currentKitTableContainer = document.getElementById('kit-table-container');
        const currentKitFooter = document.getElementById('kit-footer');
        const currentKitErrorMessage = document.getElementById('kit-error-message');

        if (e.target.value) { // Se uma variação válida do kit foi selecionada
            currentKitTableContainer?.classList.remove('hidden'); // Mostra a tabela de composição
            currentKitFooter?.classList.remove('hidden');         // Mostra o footer
            currentKitErrorMessage?.classList.add('hidden');    // Esconde mensagens de erro antigas
            carregarTabelaKit(nomeKit, e.target.value);
        } else { // "Selecione a variação do Kit" foi escolhido
            currentKitTableContainer?.classList.add('hidden');
            currentKitFooter?.classList.add('hidden'); // Esconde o footer se nenhuma variação selecionada
            // NÃO FAÇA: currentKitFooter.innerHTML = '';
            currentKitErrorMessage?.classList.add('hidden'); // Garante que msg de erro também seja escondida
        }
    });
}

function atualizarEstadoBotaoMontarKit() {
    const inputQtd = document.getElementById('qtd-enviar-kits');
    const btnMontar = document.getElementById('kit-estoque-btn');
    if (!inputQtd || !btnMontar) {
        console.warn("[atualizarEstadoBotaoMontarKit] Input ou botão não encontrado.");
        return;
    }

    const valor = parseInt(inputQtd.value) || 0;
    const maxKits = parseInt(inputQtd.max) || 0; // Pega o max do atributo do input
    
    // Habilita se o valor for > 0, <= maxKits, E o usuário tiver permissão
    btnMontar.disabled = !(valor > 0 && valor <= maxKits && permissoes.includes('montar-kit'));
    console.log(`[atualizarEstadoBotaoMontarKit] Valor: ${valor}, Max: ${maxKits}, Permissão: ${permissoes.includes('montar-kit')}, Botão Desabilitado: ${btnMontar.disabled}`);
}


async function carregarTabelaKit(kitNome, variacaoKitSelecionada) {
    console.log(`[carregarTabelaKit] Carregando tabela para Kit: "${kitNome}", Variação: "${variacaoKitSelecionada}"`);

    // 1. Obter referências aos elementos DOM
    const kitTableBody = document.getElementById('kit-table-body');
    const qtdDisponivelKitsSpan = document.getElementById('qtd-disponivel-kits');
    const qtdEnviarKitsInput = document.getElementById('qtd-enviar-kits');
    const kitEstoqueBtn = document.getElementById('kit-estoque-btn');
    const kitErrorMessage = document.getElementById('kit-error-message');
    const kitTableContainer = document.getElementById('kit-table-container');

    // Validação dos elementos
    if (!kitTableBody || !qtdDisponivelKitsSpan || !qtdEnviarKitsInput || !kitEstoqueBtn || !kitErrorMessage || !kitTableContainer) {
        console.error("[carregarTabelaKit] Elementos DOM cruciais para a tabela de kit não encontrados.");
        if (!kitTableBody) console.error("-> Falta ID: kit-table-body");
        if (!qtdDisponivelKitsSpan) console.error("-> Falta ID: qtd-disponivel-kits");
        if (!qtdEnviarKitsInput) console.error("-> Falta ID: qtd-enviar-kits");
        if (!kitEstoqueBtn) console.error("-> Falta ID: kit-estoque-btn");
        if (!kitErrorMessage) console.error("-> Falta ID: kit-error-message");
        if (!kitTableContainer) console.error("-> Falta ID: kit-table-container");
        return; // Interrompe se elementos essenciais não existem
    }

    // Reset visual inicial
    kitErrorMessage.classList.add('hidden');
    kitErrorMessage.textContent = '';
    kitTableContainer.classList.remove('hidden'); // Garante que o container da tabela é visível
    kitTableBody.innerHTML = `<tr><td colspan="3">Analisando disponibilidade dos componentes...</td></tr>`;
    qtdEnviarKitsInput.disabled = true;
    kitEstoqueBtn.disabled = true;
    qtdDisponivelKitsSpan.textContent = '0'; // Reseta contagem

    // 2. Obter dados do kit e sua composição
    const todosOsProdutosCadastrados = await buscarTodosProdutos(); // Certifique-se que esta função retorna a lista correta
    const kitSelecionado = todosOsProdutosCadastrados.find(p => p.nome === kitNome && p.is_kit === true);

    if (!kitSelecionado || !kitSelecionado.grade) {
        kitErrorMessage.textContent = 'Definição do kit selecionado não encontrada ou inválida.';
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = ''; // Limpa "Analisando..."
        kitTableContainer.classList.add('hidden');
        console.error(`[carregarTabelaKit] Kit "${kitNome}" não encontrado ou sem grade.`, kitSelecionado);
        return;
    }

    const variacaoDoKitObj = kitSelecionado.grade.find(g => g.variacao === variacaoKitSelecionada);
    if (!variacaoDoKitObj || !variacaoDoKitObj.composicao || variacaoDoKitObj.composicao.length === 0) {
        kitErrorMessage.textContent = `A variação "${variacaoKitSelecionada}" do kit "${kitNome}" não possui componentes definidos.`;
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = ''; // Limpa "Analisando..."
        kitTableContainer.classList.add('hidden');
        console.warn(`[carregarTabelaKit] Variação "${variacaoKitSelecionada}" do kit "${kitNome}" sem composição.`);
        return;
    }
    const composicaoDoKit = variacaoDoKitObj.composicao; // Array de componentes do kit
    kitTableBody.innerHTML = ''; // Limpa o "Analisando..." para adicionar as linhas reais

    // 3. Calcular disponibilidade dos componentes e quantos kits são montáveis
    let menorQuantidadeKitsMontaveis = Infinity;
    let todosComponentesDisponiveisParaUmKit = true;

    console.log(`[carregarTabelaKit] Composição para "${kitNome} - ${variacaoKitSelecionada}":`, JSON.stringify(composicaoDoKit, null, 2));

    for (const itemComponente of composicaoDoKit) {
        const nomeProdutoComponente = itemComponente.produto; // Ex: "Scrunchie (Padrão)"
        const varianteComponente = itemComponente.variacao || '-'; // Ex: "Preto"
        const quantidadeNecessariaPorKit = parseInt(itemComponente.quantidade) || 1;

        if (!nomeProdutoComponente) {
            console.warn("[carregarTabelaKit] Componente na composição do kit sem nome de produto:", itemComponente);
            // Adicionar uma linha indicando o problema, mas não quebrar tudo
            const trError = document.createElement('tr');
            trError.classList.add('item-insuficiente');
            trError.innerHTML = `<td colspan="3">Erro: Componente mal definido no cadastro do kit.</td>`;
            kitTableBody.appendChild(trError);
            todosComponentesDisponiveisParaUmKit = false; // Impede a montagem
            menorQuantidadeKitsMontaveis = 0;
            continue; // Pula para o próximo componente
        }
        
        let qtdDisponivelTotalComponente = 0;
        console.log(`[carregarTabelaKit] Verificando componente: ${nomeProdutoComponente} (${varianteComponente}), Necessário/kit: ${quantidadeNecessariaPorKit}`);

        // Todos os componentes vêm da soma dos arremates com saldo
        opsProntasParaEmbalarGlobal // Esta é a lista de arremates com saldo
            .filter(arr => arr.produto === nomeProdutoComponente && (arr.variante || '-') === varianteComponente)
            .forEach(arr => {
                qtdDisponivelTotalComponente += arr.quantidade_disponivel_para_embalar;
            });
        
        console.log(`[carregarTabelaKit] -> Disponibilidade total do componente (soma de arremates): ${qtdDisponivelTotalComponente}`);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${nomeProdutoComponente} ${varianteComponente !== '-' ? `(${varianteComponente})` : ''}</td>
            <td style="text-align:center;">${quantidadeNecessariaPorKit}</td>
            <td style="text-align:center;">
                <input type="number" class="ep-input readonly" value="${qtdDisponivelTotalComponente}" readonly title="Disponível: ${qtdDisponivelTotalComponente}">
            </td>
        `;
        
        if (qtdDisponivelTotalComponente < quantidadeNecessariaPorKit) {
            tr.classList.add('item-insuficiente');
            todosComponentesDisponiveisParaUmKit = false; 
        }
        kitTableBody.appendChild(tr);

        if (quantidadeNecessariaPorKit > 0) {
            menorQuantidadeKitsMontaveis = Math.min(menorQuantidadeKitsMontaveis, Math.floor(qtdDisponivelTotalComponente / quantidadeNecessariaPorKit));
        } else { // Se um componente tem necessidade 0, algo está errado na definição do kit
            console.warn(`[carregarTabelaKit] Componente ${nomeProdutoComponente} tem quantidade necessária 0 no kit ${kitNome}.`);
            menorQuantidadeKitsMontaveis = 0; 
        }
    }

    const maxKitsMontaveisCalculado = todosComponentesDisponiveisParaUmKit ? menorQuantidadeKitsMontaveis : 0;
    const maxKitsMontaveisFinal = (maxKitsMontaveisCalculado === Infinity || composicaoDoKit.length === 0) ? 0 : maxKitsMontaveisCalculado;

    qtdDisponivelKitsSpan.textContent = maxKitsMontaveisFinal;
    console.log(`[carregarTabelaKit] Máximo de kits "${kitNome} - ${variacaoKitSelecionada}" montáveis: ${maxKitsMontaveisFinal}`);

    if (maxKitsMontaveisFinal <= 0 && composicaoDoKit.length > 0) {
        kitErrorMessage.textContent = 'Quantidade insuficiente de um ou mais componentes para montar este kit.';
        kitErrorMessage.classList.remove('hidden');
    }

    // 4. Configurar o input de quantidade de kits e o botão
    qtdEnviarKitsInput.value = maxKitsMontaveisFinal > 0 ? "1" : "0";
    qtdEnviarKitsInput.max = maxKitsMontaveisFinal;
    qtdEnviarKitsInput.disabled = maxKitsMontaveisFinal <= 0;

    // --- GERENCIAMENTO DOS EVENT LISTENERS ---
    // Remover listener antigo do input, se existir
    if (qtdEnviarKitsInput._inputListener) {
        qtdEnviarKitsInput.removeEventListener('input', qtdEnviarKitsInput._inputListener);
    }
    // Criar o novo handler para o input
    const handleQtdInputChange = () => {
        let valor = parseInt(qtdEnviarKitsInput.value) || 0;
        const maxKitsDoInput = parseInt(qtdEnviarKitsInput.max) || 0;
        
        if (valor < 0) valor = 0;
        else if (valor > maxKitsDoInput) valor = maxKitsDoInput;
        qtdEnviarKitsInput.value = valor; // Atualiza o valor do input se foi corrigido
        
        atualizarEstadoBotaoMontarKit(); 
    };
    // Adicionar o novo listener e armazenar sua referência
    qtdEnviarKitsInput.addEventListener('input', handleQtdInputChange);
    qtdEnviarKitsInput._inputListener = handleQtdInputChange;

    // Remover listener antigo do botão, se existir
    if (kitEstoqueBtn._clickListener) {
        kitEstoqueBtn.removeEventListener('click', kitEstoqueBtn._clickListener);
    }
    // Criar o novo handler para o botão
    const handleMontarKitClick = () => {
        const qtdKitsParaEnviar = parseInt(qtdEnviarKitsInput.value) || 0;
        const maxKitsPermitidos = parseInt(qtdEnviarKitsInput.max) || 0;

        if (qtdKitsParaEnviar > 0 && qtdKitsParaEnviar <= maxKitsPermitidos) {
            // Passa a 'composicaoDoKit' que foi lida da definição do kit
            enviarKitParaEstoque(kitNome, variacaoKitSelecionada, qtdKitsParaEnviar, composicaoDoKit);
        } else {
            mostrarPopupMensagem('Quantidade de kits inválida ou excede o máximo montável.', 'erro');
        }
    };
    // Adicionar o novo listener e armazenar sua referência
    kitEstoqueBtn.addEventListener('click', handleMontarKitClick);
    kitEstoqueBtn._clickListener = handleMontarKitClick;

    // Chamada inicial para definir o estado do botão
    atualizarEstadoBotaoMontarKit(); 
    console.log("[carregarTabelaKit] Configuração de listeners e estado inicial do botão concluída.");
}


async function enviarKitParaEstoque(nomeDoKitProduto, variacaoDoKitProduto, qtdKitsParaEnviar, composicaoDoKitSelecionado) {
    const btn = document.getElementById('kit-estoque-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Montando Kits...';
    }

    try {
        // <<< LOG DE DEPURAÇÃO >>>
        console.log("[DEPURAÇÃO enviarKit] opsProntasParaEmbalarGlobal:", JSON.stringify(opsProntasParaEmbalarGlobal, null, 2));
        const arremate14Info = opsProntasParaEmbalarGlobal.find(arr => arr.id_arremate === 14);
        console.log("[DEPURAÇÃO enviarKit] Info do Arremate ID 14 em opsProntasParaEmbalarGlobal:", arremate14Info);
        // <<< FIM DO LOG >>>
        const componentesParaPayload = []; // Array de { id_arremate?, produto, variante, quantidade_usada_total_para_kits }
                                         // id_arremate só será preenchido para componentes consumidos de arremates específicos

        // Para cada item na composição do kit que o usuário quer montar:
        for (const itemCompDefinicao of composicaoDoKitSelecionado) { // itemCompDefinicao é da definição do kit
            const nomeComp = itemCompDefinicao.produto;
            const varComp = itemCompDefinicao.variacao || '-';
            const qtdNecessariaPorKit = parseInt(itemCompDefinicao.quantidade) || 1;
            let qtdTotalDesteComponenteNecessaria = qtdKitsParaEnviar * qtdNecessariaPorKit;

            // Encontrar os arremates disponíveis para ESTE componente específico
            const arrematesDisponiveisParaEsteComponente = opsProntasParaEmbalarGlobal
                .filter(arr => arr.produto === nomeComp && (arr.variante || '-') === varComp)
                .sort((a, b) => a.id_arremate - b.id_arremate); // FIFO

            for (const arremateOrigem of arrematesDisponiveisParaEsteComponente) {
                if (qtdTotalDesteComponenteNecessaria <= 0) break;

                const qtdDisponivelNesteArremateOrigem = arremateOrigem.quantidade_disponivel_para_embalar;
                const qtdAUsarDesteArremateOrigem = Math.min(qtdTotalDesteComponenteNecessaria, qtdDisponivelNesteArremateOrigem);

                if (qtdAUsarDesteArremateOrigem > 0) {
                    componentesParaPayload.push({
                        id_arremate: arremateOrigem.id_arremate, // Sempre teremos o id_arremate agora
                        produto: arremateOrigem.produto,
                        variante: arremateOrigem.variante,
                        quantidade_usada: qtdAUsarDesteArremateOrigem // Quantidade USADA DESTE ARREMATE para os kits
                    });
                    qtdTotalDesteComponenteNecessaria -= qtdAUsarDesteArremateOrigem;
                }
            }

            if (qtdTotalDesteComponenteNecessaria > 0) {
                throw new Error(`Insuficiência calculada para o componente ${nomeComp} - ${varComp} (${qtdTotalDesteComponenteNecessaria} ainda necessários). Isso não deveria acontecer se a UI calculou corretamente.`);
            }
        }
        
        const payload = {
            kit_nome: nomeDoKitProduto,
            kit_variante: variacaoDoKitProduto === '-' ? null : variacaoDoKitProduto,
            quantidade_kits_montados: qtdKitsParaEnviar,
            // A API /api/kits/montar agora só precisa de uma lista de todos os componentes consumidos de arremates
            componentes_consumidos_de_arremates: componentesParaPayload 
            // O campo 'outros_componentes_usados' não é mais necessário se tudo vem de arremates
        };

        console.log("[enviarKitParaEstoque] Payload para /api/kits/montar (nova lógica):", JSON.stringify(payload, null, 2));

        // Chamar a API /api/kits/montar (precisaremos ajustar a API de backend para este novo payload)
        const resultadoMontagem = await fetchFromAPI('/kits/montar', { // A API precisa ser ajustada
            method: 'POST',
            body: JSON.stringify(payload)
        });

        console.log("[enviarKitParaEstoque] Resposta da montagem do kit:", resultadoMontagem);
        mostrarPopupMensagem(resultadoMontagem.message || `${qtdKitsParaEnviar} kit(s) montado(s)!`, 'sucesso');
        todosOsArrematesRegistrados = []; 
        window.location.hash = '';
        localStorage.removeItem('embalagemAtual');
        await atualizarListasArremateEEmbalagem();

    } catch (error) {
        console.error('[enviarKitParaEstoque] Erro:', error);
        mostrarPopupMensagem(`Erro ao montar kit: ${error.message || 'Verifique o console.'}`, 'erro');
        if (btn) { // Reabilitar botão
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


// --- Função Principal de Carregamento da Tela de Embalagem
// public/js/admin-embalagem-de-produtos.js

async function carregarEmbalagem(produto, variante, quantidadeDisponivelParaEstaSessao) {
    console.log(`[carregarEmbalagem] Para ${produto}:${variante}, Qtd Disp (deste arremate): ${quantidadeDisponivelParaEstaSessao}`);

     // <<< INÍCIO DO LOG DE DEPURAÇÃO DE DADOS DO PRODUTO/KIT >>>
    if (todosOsProdutos && todosOsProdutos.length > 0) {
        const produtoSendoEmbalado = todosOsProdutos.find(p => p.nome === produto);

        // Encontre um KIT de exemplo que DEVERIA usar este produto
        // Substitua "NomeDoSeuKitDeExemplo" pelo nome real de um kit
        const kitDeExemplo = todosOsProdutos.find(p => p.nome === "NomeDoSeuKitDeExemplo" && p.is_kit); 
        if (kitDeExemplo) {
        }
    } else {
        console.warn("[DEPURAÇÃO KIT] todosOsProdutos está vazio, não é possível depurar dados de kit.");
    }
    // <<< FIM DO LOG DE DEPURAÇÃO >>>

    const embalagemAtualData = JSON.parse(localStorage.getItem('embalagemAtual') || '{}');
    // Precisamos do id_arremate que foi salvo
    if (!embalagemAtualData.id_arremate) {
        mostrarPopupMensagem('Erro: Dados do arremate para embalagem não encontrados. Voltando para lista.', 'erro');
        window.location.hash = ''; // Volta para a lista
        return;
    }
    console.log('[carregarEmbalagem] Dados do localStorage (embalagemAtualData):', embalagemAtualData);

    const opOrigemParaExibicao = embalagemAtualData.op_numero_origem; // Usar para exibir, se quiser

    // ... (Elementos DOM como antes: embalagemTitleEl, produtoNomeEl, etc.)
    const embalagemTitleEl = document.getElementById('embalagemTitle');
    const embalagemSubTitleEl = document.getElementById('embalagemSubTitle');
    const produtoNomeEl = document.getElementById('produtoNome');
    const varianteNomeEl = document.getElementById('varianteNome');
    const opOrigemEmbalagemEl = document.getElementById('opOrigemEmbalagem'); // Pode mostrar a OP de origem e ID Arremate
    const qtdDisponivelElUnidade = document.getElementById('qtdDisponivel');
    const qtdEnviarInputUnidade = document.getElementById('qtdEnviar');
    const estoqueBtnUnidade = document.getElementById('estoqueBtn');
    const embalagemThumbnailEl = document.getElementById('embalagemThumbnail');
    
    // ... (Abas de Kit - por enquanto, focaremos na unidade)
    const kitTabBtn = document.querySelector('.ep-tabs button[data-tab="kit"]');
    const unidadeTabBtn = document.querySelector('.ep-tabs button[data-tab="unidade"]');
    const kitTabPanel = document.getElementById('kit-tab');
    const unidadeTabPanel = document.getElementById('unidade-tab');
    const kitVariacaoComposicaoWrapper = document.getElementById('kit-variacao-composicao-wrapper');

    if (!embalagemTitleEl || /* ...outros elementos... */ !unidadeTabPanel ) {
        console.error('[carregarEmbalagem] Um ou mais elementos DOM da tela de embalagem não foram encontrados.');
        mostrarPopupMensagem('Erro ao carregar interface de embalagem.', 'erro');
        window.location.hash = ''; return;
    }
    
    const produtoCadastrado = todosOsProdutos.find(p => p.nome === produto);
    const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (variante === '-' ? '' : variante));
    const imagem = gradeItem?.imagem || '';
    embalagemThumbnailEl.innerHTML = imagem ? `<img src="${imagem}" alt="Imagem ${produto} ${variante}">` : 'Sem imagem';

    embalagemTitleEl.textContent = `Embalar Detalhes`;
    // Mostrar mais info no subtítulo
    embalagemSubTitleEl.textContent = 
        `${produto}${variante !== '-' ? ` - ${variante}` : ''} (Arremate ID: ${embalagemAtualData.id_arremate}, OP Origem: ${opOrigemParaExibicao})`;
    
    produtoNomeEl.textContent = produto;
    varianteNomeEl.textContent = variante !== '-' ? variante : 'Padrão';
    // Atualizar o que é mostrado como "origem"
    opOrigemEmbalagemEl.textContent = `Arremate ID: ${embalagemAtualData.id_arremate} (OP: ${opOrigemParaExibicao})`;
    
    qtdDisponivelElUnidade.textContent = quantidadeDisponivelParaEstaSessao;
    if (qtdDisponivelElUnidade.parentElement?.classList.contains('ep-qtd-disponivel-destaque')) {
        qtdDisponivelElUnidade.parentElement.classList.remove('changing');
    }
    qtdEnviarInputUnidade.value = ''; // Limpa o input
    // O máximo que pode ser enviado é a quantidade disponível DESTE ARREMATE
    qtdEnviarInputUnidade.max = quantidadeDisponivelParaEstaSessao; 
    
    // --- LÓGICA DAS ABAS (RESTAURADA E AJUSTADA) ---
const temKits = await temKitsDisponiveis(produto, variante); // Função que você já tem
console.log(`[carregarEmbalagem] Produto ${produto}:${variante} pode ser usado em kits? ${temKits}`);

const podeEmbalarUnidade = permissoes.includes('lancar-embalagem'); // Ou sua permissão específica 'lancar-embalagem-unidade'
const podeMontarKit = permissoes.includes('montar-kit'); // Sua permissão para montar kits
console.log(`[carregarEmbalagem] Permissão 'montar-kit': ${podeMontarKit}`); // Log de Permissão

// Reset inicial das abas e painéis
unidadeTabBtn.classList.remove('active');
kitTabBtn.classList.remove('active');
unidadeTabPanel.classList.remove('active', 'hidden'); 
kitTabPanel.classList.remove('active', 'hidden');   
kitVariacaoComposicaoWrapper.classList.add('hidden'); // Esconde o conteúdo do kit por padrão

let abaInicialAtiva = null;

console.log(`[carregarEmbalagem] Decisão de Aba: temKits=${temKits}, podeMontarKit=${podeMontarKit}, podeEmbalarUnidade=${podeEmbalarUnidade}`);
    if (temKits && podeMontarKit) {
    console.log("[carregarEmbalagem] ENTRANDO no bloco if (temKits && podeMontarKit)");
        kitTabBtn.style.display = 'inline-flex'; // Garante que o botão da aba kit seja visível
        unidadeTabBtn.style.display = 'inline-flex'; // Garante que o botão da aba unidade também seja visível (se permitido)
    
    abaInicialAtiva = 'kit'; // Prioriza kit se disponível e permitido
    
} else if (podeEmbalarUnidade) {
    console.log("[carregarEmbalagem] ENTRANDO no bloco else if (podeEmbalarUnidade)");
    kitTabBtn.style.display = 'none';       // Esconde o botão da aba kit
    unidadeTabBtn.style.display = 'inline-flex'; 

    abaInicialAtiva = 'unidade';

} else {
    console.log("[carregarEmbalagem] ENTRANDO no bloco else (nenhuma opção)");
    kitTabBtn.style.display = 'none';
    unidadeTabBtn.style.display = 'none';
    // Poderia mostrar uma mensagem na área de conteúdo
    mostrarPopupMensagem('Nenhuma opção de embalagem permitida para este item.', 'aviso');
    // Limpar painéis
    kitTabPanel.classList.add('hidden');
    unidadeTabPanel.classList.add('hidden');
}

// Ativar a aba e painel corretos
if (abaInicialAtiva === 'kit') {
    kitTabBtn.classList.add('active');
    kitTabPanel.classList.add('active');
    kitTabPanel.classList.remove('hidden');
    
    unidadeTabPanel.classList.add('hidden'); // Esconde o painel de unidade
    unidadeTabBtn.classList.remove('active');

    // Carrega os kits SE a aba de kit for a ativa
    await carregarKitsDisponiveis(produto, variante); 
} else if (abaInicialAtiva === 'unidade') {
    unidadeTabBtn.classList.add('active');
    unidadeTabPanel.classList.add('active');
    unidadeTabPanel.classList.remove('hidden');

    kitTabPanel.classList.add('hidden'); // Esconde o painel de kit
    kitTabBtn.classList.remove('active');
}

// Habilitar/desabilitar botão de embalar unidade com base na permissão e quantidade
// (Esta parte já existia e deve continuar funcionando para a aba unidade)
estoqueBtnUnidade.disabled = !podeEmbalarUnidade || quantidadeDisponivelParaEstaSessao <= 0 || true;

    // --- Listeners para Aba Unidade (Botão de Embalar) ---
    // Limpar e recriar listeners para evitar duplicidade
    let currentQtdEnviarInputUnidade = document.getElementById('qtdEnviar');
    let currentEstoqueBtnUnidade = document.getElementById('estoqueBtn');
    
    const newQtdEnviarInput = currentQtdEnviarInputUnidade.cloneNode(true);
    currentQtdEnviarInputUnidade.parentNode.replaceChild(newQtdEnviarInput, currentQtdEnviarInputUnidade);
    currentQtdEnviarInputUnidade = newQtdEnviarInput;

    const newEstoqueBtnUnidade = currentEstoqueBtnUnidade.cloneNode(true);
    currentEstoqueBtnUnidade.parentNode.replaceChild(newEstoqueBtnUnidade, currentEstoqueBtnUnidade);
    currentEstoqueBtnUnidade = newEstoqueBtnUnidade;
    
    currentEstoqueBtnUnidade.disabled = !podeEmbalarUnidade || quantidadeDisponivelParaEstaSessao <= 0 || true;


    currentQtdEnviarInputUnidade.addEventListener('input', () => {
        const valor = parseInt(currentQtdEnviarInputUnidade.value) || 0;
        const qtdDispPai = currentQtdEnviarInputUnidade.closest('.ep-embalar-form-card')?.querySelector('.ep-qtd-disponivel-destaque');
        const qtdDispSpan = qtdDispPai?.querySelector('strong#qtdDisponivel');
        let habilitarBotao = false;

        if (valor >= 1 && valor <= quantidadeDisponivelParaEstaSessao) {
            if (qtdDispSpan) qtdDispSpan.textContent = quantidadeDisponivelParaEstaSessao - valor;
            if (qtdDispPai) qtdDispPai.classList.add('changing');
            habilitarBotao = true;
        } else {
            if (valor > quantidadeDisponivelParaEstaSessao) currentQtdEnviarInputUnidade.value = quantidadeDisponivelParaEstaSessao;
            else if (valor <= 0 && currentQtdEnviarInputUnidade.value !== '') currentQtdEnviarInputUnidade.value = '';
            
            if (qtdDispSpan) qtdDispSpan.textContent = quantidadeDisponivelParaEstaSessao;
            if (qtdDispPai) qtdDispPai.classList.remove('changing');
            habilitarBotao = false;
        }
        currentEstoqueBtnUnidade.disabled = !podeEmbalarUnidade || !habilitarBotao;
    });

    currentEstoqueBtnUnidade.addEventListener('click', async () => {
        const quantidadeEnviada = parseInt(currentQtdEnviarInputUnidade.value);
        if (isNaN(quantidadeEnviada) || quantidadeEnviada <= 0 || quantidadeEnviada > quantidadeDisponivelParaEstaSessao) {
            mostrarPopupMensagem('Quantidade inválida!', 'erro'); return;
        }

        currentEstoqueBtnUnidade.disabled = true;
        currentEstoqueBtnUnidade.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        
        // Os dados do arremate estão em embalagemAtualData (do localStorage)
        const { id_arremate, produto: prodNome, variante: prodVar } = embalagemAtualData;

        try {
            // Passo 1: Registrar entrada no estoque
            console.log(`[Embalar] Enviando para estoque: Arremate ID ${id_arremate}, Produto ${prodNome}, Qtd ${quantidadeEnviada}`);
            const resultadoEstoque = await fetchFromAPI('/estoque/entrada-producao', {
                method: 'POST',
                body: JSON.stringify({
                    produto_nome: prodNome,
                    variante_nome: prodVar === '-' ? null : prodVar,
                    quantidade_entrada: quantidadeEnviada,
                    id_arremate_origem: id_arremate 
                })
            });
            console.log('[Embalar] Resposta da API de entrada no estoque:', resultadoEstoque);
            mostrarPopupMensagem(`${quantidadeEnviada} unidade(s) de ${prodNome} enviada(s) para o estoque!`, 'sucesso');

            // Passo 2: Atualizar o arremate (quantidade_ja_embalada)
            console.log(`[Embalar] Atualizando arremate ID ${id_arremate} para registrar ${quantidadeEnviada} como embaladas.`);
            const resultadoArremate = await fetchFromAPI(`/arremates/${id_arremate}/registrar-embalagem`, {
                method: 'PUT',
                body: JSON.stringify({
                    quantidade_que_foi_embalada_desta_vez: quantidadeEnviada
                })
            });
            console.log('[Embalar] Resposta da API de atualização do arremate:', resultadoArremate);
            // Não precisa de popup para este, o do estoque é suficiente.

            // <<< LIMPAR O CACHE DE ARREMATES >>>
            todosOsArrematesRegistrados = []; // Agora deve buscar arremates frescos

            // Limpar e voltar para a lista
            window.location.hash = '';
            localStorage.removeItem('embalagemAtual');
            await atualizarListasArremateEEmbalagem(); // Recarrega tudo

        } catch (error) {
            console.error('[Embalar] Erro ao embalar e enviar:', error);
            mostrarPopupMensagem(`Erro ao embalar: ${error.message || 'Verifique o console.'}`, 'erro');
            // Reabilitar botão em caso de erro
            currentEstoqueBtnUnidade.disabled = !podeEmbalarUnidade || quantidadeDisponivelParaEstaSessao <= 0;
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