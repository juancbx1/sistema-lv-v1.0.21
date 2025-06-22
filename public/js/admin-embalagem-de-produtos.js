// public/js/admin-embalagem-de-produtos.js

import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos as obterProdutosDoStorage, invalidateCache as invalidateProdutosStorageCache } from '/js/utils/storage.js';

// --- Variáveis Globais ---
let usuarioLogado = null;
let permissoes = [];
let todosOsProdutosCadastrados = []; // Para imagens, nomes de produtos, definições de kit

let todosArrematesRegistradosCache = []; // Cache dos arremates já feitos (com quantidade_ja_embalada)
let produtosAgregadosParaEmbalarGlobal = []; // Array dos itens agregados (produto|variante) prontos para embalar
let embalagemAgregadoEmVisualizacao = null; // Objeto do item agregado atualmente na tela de embalar/montar kit

let currentPageEmbalagemCards = 1;
const itemsPerPageEmbalagemCards = 6; // Quantos cards de "Pronto para Embalar" por página

const operacaoEmAndamento = new Set(); // Para evitar duplo clique em botões de ação

// --- Funções Auxiliares Essenciais ---

function mostrarPopupMensagem(mensagem, tipo = 'erro', duracao = 4000, permitirHTML = false) {
    const popupId = `popup-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `popup-mensagem popup-${tipo}`; // Usar classes do ordens-de-producao.css

    const overlayId = `overlay-${popupId}`;
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'popup-overlay'; // Estilo para o overlay

    if (permitirHTML) {
        popup.innerHTML = `<p>${mensagem}</p>`;
    } else {
        const p = document.createElement('p');
        p.textContent = mensagem;
        popup.appendChild(p);
    }

    const fecharBtnManual = document.createElement('button');
    fecharBtnManual.textContent = 'OK';
    fecharBtnManual.onclick = () => {
        popup.style.animation = 'fadeOut 0.3s ease-out forwards';
        overlay.style.animation = 'fadeOutOverlay 0.3s ease-out forwards';
        setTimeout(() => {
            if (document.body.contains(popup)) document.body.removeChild(popup);
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        }, 300);
    };
    popup.appendChild(fecharBtnManual);

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    if (duracao > 0) {
        setTimeout(() => {
            const el = document.getElementById(popupId);
            if (el && document.body.contains(el)) {
                el.style.animation = 'fadeOut 0.3s ease-out forwards';
                const ov = document.getElementById(overlayId);
                if (ov) ov.style.animation = 'fadeOutOverlay 0.3s ease-out forwards';
                setTimeout(() => {
                    if (document.body.contains(el)) document.body.removeChild(el);
                    if (ov && document.body.contains(ov)) document.body.removeChild(ov);
                }, 300);
            }
        }, duracao);
    }
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

// --- Funções de Fetch ---
async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token && !(options.method === 'GET' && endpoint.includes('/produtos'))) { // Permite GET /produtos sem token para alguns casos, mas embalagem exige token
        mostrarPopupMensagem('Erro de autenticação. Faça login novamente.', 'erro');
        localStorage.removeItem('token');
        localStorage.removeItem('usuarioLogado');
        localStorage.removeItem('permissoes');
        window.location.href = '/login.html';
        throw new Error('Token não encontrado');
    }
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };
    const url = `/api${endpoint}${ (options.method === 'GET' || !options.method) && !endpoint.includes('?') ? `?_=${Date.now()}` : (options.method === 'GET' || !options.method) ? `&_=${Date.now()}` : ''}`;

    try {
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            let errorData = { error: `Erro ${response.status} - ${response.statusText}` };
            try { errorData = await response.json() || errorData; } catch (e) { /* ignore */ }
            
            if (response.status === 401 || (errorData.details === 'jwt expired')) {
                mostrarPopupMensagem('Sessão expirada. Faça login novamente.', 'aviso');
                localStorage.removeItem('token'); localStorage.removeItem('usuarioLogado'); localStorage.removeItem('permissoes');
                window.location.href = '/login.html';
            }
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status; err.data = errorData;
            throw err;
        }
        return response.status === 204 ? null : response.json();
    } catch (error) {
        console.error(`[fetchFromAPI] Falha ao acessar ${url}:`, error);
        if (!error.status) mostrarPopupMensagem(`Erro de rede ou API indisponível ao tentar acessar ${endpoint}.`, 'erro');
        throw error;
    }
}

async function buscarArrematesCompletos() { // Nome mais genérico, pois vamos filtrar depois
    try {
        const arremates = await fetchFromAPI('/arremates'); // Busca todos os arremates
        todosArrematesRegistradosCache = Array.isArray(arremates) ? arremates : (arremates?.rows || []);
        console.log('[buscarArrematesCompletos] Arremates existentes carregados:', todosArrematesRegistradosCache.length);
        return todosArrematesRegistradosCache;
    } catch (error) {
        console.error('[buscarArrematesCompletos] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar registros de arremate.', 'erro');
        return [];
    }
}

// --- Lógica Principal de Cálculo e Agregação para Embalagem ---
async function calcularEAgruparProntosParaEmbalar() {
    // Garante que os dados mais frescos sejam usados
    await buscarArrematesCompletos(); 
    if (todosOsProdutosCadastrados.length === 0) {
         todosOsProdutosCadastrados = await obterProdutosDoStorage();
    }

    const arrematesComSaldoParaEmbalar = [];
    for (const arremate of todosArrematesRegistradosCache) {
        const quantidadeTotal = parseInt(arremate.quantidade_arrematada) || 0;
        const quantidadeJaEmbalada = parseInt(arremate.quantidade_ja_embalada) || 0;
        const saldoParaEmbalar = quantidadeTotal - quantidadeJaEmbalada;

        if (saldoParaEmbalar > 0) {
            // AQUI ESTÁ A CORREÇÃO: Passamos o produto_id para o próximo objeto
            arrematesComSaldoParaEmbalar.push({
                id_arremate: arremate.id,
                op_numero_origem: arremate.op_numero,
                produto: arremate.produto, // O nome, que vem do JOIN da API de arremates
                produto_id: arremate.produto_id, // O ID, que também vem da API
                variante: arremate.variante || '-',
                quantidade_disponivel_para_embalar: saldoParaEmbalar,
            });
        }
    }

    const aggregatedMap = new Map();
    arrematesComSaldoParaEmbalar.forEach(arremateComSaldo => {
        // Agora usamos a chave com produto_id para garantir unicidade
        const produtoKey = `${arremateComSaldo.produto_id}|${arremateComSaldo.variante}`;
        
        if (!aggregatedMap.has(produtoKey)) {
            aggregatedMap.set(produtoKey, {
                produto: arremateComSaldo.produto,
                produto_id: arremateComSaldo.produto_id, // Passando o ID para o objeto agregado
                variante: arremateComSaldo.variante,
                total_quantidade_disponivel_para_embalar: 0,
                arremates_detalhe: []
            });
        }
        
        const aggregatedItem = aggregatedMap.get(produtoKey);
        aggregatedItem.total_quantidade_disponivel_para_embalar += arremateComSaldo.quantidade_disponivel_para_embalar;
        aggregatedItem.arremates_detalhe.push(arremateComSaldo);
    });
    
    produtosAgregadosParaEmbalarGlobal = Array.from(aggregatedMap.values());
    console.log('[calcularEAgruparProntosParaEmbalar] Produtos agregados para embalar:', produtosAgregadosParaEmbalarGlobal);
}

// --- Funções de Renderização ---
async function renderizarCardsEmbalagem() {
    const container = document.getElementById('embalagemCardsContainer');
    const paginationContainer = document.getElementById('embalagemPaginationContainer');
    const searchInput = document.getElementById('searchProdutoEmbalagem');

    if (!container || !paginationContainer || !searchInput) {
        console.error("Elementos DOM para renderizar cards de embalagem não encontrados.");
        return;
    }

    container.innerHTML = '<div class="spinner">Carregando itens para embalagem...</div>'; // Feedback visual
    paginationContainer.innerHTML = '';

    // Recalcula/recarrega os dados agregados. Se já carregados, pode otimizar
    // mas para garantir consistência após uma ação, é bom recarregar.
    // await calcularEAgruparProntosParaEmbalar(); // Chamado no inicializar e após ações

    const searchTerm = searchInput.value.toLowerCase().trim();
    let itensFiltrados = produtosAgregadosParaEmbalarGlobal;
    if (searchTerm) {
        itensFiltrados = produtosAgregadosParaEmbalarGlobal.filter(item =>
            item.produto.toLowerCase().includes(searchTerm) ||
            (item.variante && item.variante !== '-' && item.variante.toLowerCase().includes(searchTerm))
        );
    }

    if (itensFiltrados.length === 0) {
        container.innerHTML = `<p style="text-align: center; padding: 20px; color: var(--op-cor-cinza-texto);">
            ${searchTerm ? 'Nenhum item encontrado para "' + searchTerm + '".' : 'Nenhum item pronto para embalar.'}
        </p>`;
        paginationContainer.style.display = 'none';
        return;
    }
    container.innerHTML = ''; // Limpa o spinner/mensagem
    paginationContainer.style.display = 'flex';

    const totalItems = itensFiltrados.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageEmbalagemCards);
    currentPageEmbalagemCards = Math.max(1, Math.min(currentPageEmbalagemCards, totalPages)); // Garante que a página atual seja válida
    const startIndex = (currentPageEmbalagemCards - 1) * itemsPerPageEmbalagemCards;
    const endIndex = Math.min(startIndex + itemsPerPageEmbalagemCards, totalItems);
    const paginatedItems = itensFiltrados.slice(startIndex, endIndex);

    const fragment = document.createDocumentFragment();
    if (todosOsProdutosCadastrados.length === 0) { // Garante que temos dados de produtos para imagens
        todosOsProdutosCadastrados = await obterProdutosDoStorage();
    }

    paginatedItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'op-embalagem-card'; // Você precisará estilizar esta classe!

        const produtoCadastrado = todosOsProdutosCadastrados.find(p => p.nome === item.produto);
        let imagemSrc = '/img/placeholder-image.png'; // Imagem padrão
        if (produtoCadastrado) {
            if (item.variante && item.variante !== '-') {
                const gradeInfo = produtoCadastrado.grade?.find(g => g.variacao === item.variante);
                if (gradeInfo?.imagem) imagemSrc = gradeInfo.imagem;
                else if (produtoCadastrado.imagem) imagemSrc = produtoCadastrado.imagem;
            } else if (produtoCadastrado.imagem) {
                imagemSrc = produtoCadastrado.imagem;
            }
        }
        // Assegurar que o caminho da imagem padrão seja válido ou trate o erro de imagem não encontrada
        const imgElement = `<img src="${imagemSrc}" alt="${item.produto}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';this.style.opacity=0.5;">`;


        card.innerHTML = `
            <div class="op-embalagem-card-thumbnail">
                ${imgElement}
            </div>
            <div class="op-embalagem-card-info">
                <h3 class="op-embalagem-card-produto">${item.produto}</h3>
                <p class="op-embalagem-card-variante">${item.variante !== '-' ? item.variante : 'Padrão'}</p>
            </div>
            <div class="op-embalagem-card-disponivel">
                <span>Disponível:</span> <strong>${item.total_quantidade_disponivel_para_embalar}</strong>
            </div>
        `;
        card.dataset.embalagemAgregado = JSON.stringify(item);

        if (item.total_quantidade_disponivel_para_embalar > 0 && permissoes.includes('lancar-embalagem')) {
            card.addEventListener('click', handleEmbalagemCardClick);
        } else {
            card.style.opacity = "0.6";
            card.style.cursor = "not-allowed";
            card.title = item.total_quantidade_disponivel_para_embalar <= 0 ? "Sem saldo para embalar" : "Sem permissão para embalar";
        }
        fragment.appendChild(card);
    });
    container.appendChild(fragment);

    if (totalPages > 1) {
        let paginationHTML = `<button class="pagination-btn prev ep-btn" data-page="${Math.max(1, currentPageEmbalagemCards - 1)}" ${currentPageEmbalagemCards === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageEmbalagemCards} de ${totalPages}</span>`;
        paginationHTML += `<button class="pagination-btn next ep-btn" data-page="${Math.min(totalPages, currentPageEmbalagemCards + 1)}" ${currentPageEmbalagemCards === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainer.innerHTML = paginationHTML;

        paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageEmbalagemCards = parseInt(btn.dataset.page);
                renderizarCardsEmbalagem();
            });
        });
    } else {
         paginationContainer.style.display = 'none';
    }
}

async function handleEmbalagemCardClick(event) {
    const card = event.currentTarget;
    const agregadoString = card.dataset.embalagemAgregado;
    if (!agregadoString) return;

    embalagemAgregadoEmVisualizacao = JSON.parse(agregadoString);
    console.log('Card de embalagem clicado:', embalagemAgregadoEmVisualizacao);

    localStorage.setItem('embalarDetalheAtual', JSON.stringify(embalagemAgregadoEmVisualizacao));
    window.location.hash = '#embalar-produto';
}

async function carregarDetalhesEmbalagemView(agregado) {
    document.getElementById('embalagemListViewNova').style.display = 'none';
    document.getElementById('embalarDetalheView').style.display = 'block';

    embalagemAgregadoEmVisualizacao = agregado;

    // --- Preenchimento de informações (sem alterações) ---
    document.getElementById('embalagemDetalheTitulo').textContent = `Embalar: ${agregado.produto}`;
    document.getElementById('embalagemDetalheSubTitle').textContent = agregado.variante !== '-' ? `Variação: ${agregado.variante}` : 'Padrão';
    const produtoCadEmb = todosOsProdutosCadastrados.find(p => p.nome === agregado.produto);
    let imgDetalheEmbSrc = '/img/placeholder-image.png';
    if (produtoCadEmb) {
        if (agregado.variante && agregado.variante !== '-') {
            const gradeDetEmb = produtoCadEmb.grade?.find(g => g.variacao === agregado.variante);
            if (gradeDetEmb?.imagem) imgDetalheEmbSrc = gradeDetEmb.imagem;
            else if (produtoCadEmb.imagem) imgDetalheEmbSrc = produtoCadEmb.imagem;
        } else if (produtoCadEmb.imagem) {
            imgDetalheEmbSrc = produtoCadEmb.imagem;
        }
    }
    document.getElementById('embalagemDetalheThumbnail').innerHTML = `<img src="${imgDetalheEmbSrc}" alt="${agregado.produto}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">`;
    
    // --- Reset da Aba Unidade (COM CORREÇÕES) ---
    document.getElementById('embalarProdutoNome').textContent = agregado.produto;
    document.getElementById('embalarVarianteNome').textContent = agregado.variante !== '-' ? agregado.variante : 'Padrão';
    document.getElementById('embalarQtdDisponivelUnidade').textContent = agregado.total_quantidade_disponivel_para_embalar;
    
    const inputQtdUnidade = document.getElementById('inputQuantidadeEmbalarUnidade');
    const btnEmbalarUnidade = document.getElementById('btnEmbalarEnviarEstoqueUnidade');

    // **CORREÇÃO: Reset explícito do estado do formulário**
    inputQtdUnidade.value = ''; // Limpa o valor
    inputQtdUnidade.max = agregado.total_quantidade_disponivel_para_embalar;
    inputQtdUnidade.disabled = false; // Garante que o input comece habilitado
    btnEmbalarUnidade.disabled = true; // Botão de enviar começa desabilitado
    btnEmbalarUnidade.innerHTML = 'Estocar Unidades'; // Garante que o texto do botão esteja resetado

    // O listener `oninput` pode continuar aqui, pois é reatribuído a cada carregamento,
    // o que é simples e funcional para este caso.
    inputQtdUnidade.oninput = () => {
        const qtd = parseInt(inputQtdUnidade.value) || 0;
        const maxQtd = parseInt(inputQtdUnidade.max) || 0;
        btnEmbalarUnidade.disabled = !(qtd > 0 && qtd <= maxQtd && permissoes.includes('lancar-embalagem'));
    };

    // --- Lógica de Abas e Reset de Kit (sem alterações) ---
    const kitTabButton = document.querySelector('#embalarDetalheView .ep-tabs button[data-tab="kit"]');
    const unidadeTabButton = document.querySelector('#embalarDetalheView .ep-tabs button[data-tab="unidade"]');
    const kitPanel = document.getElementById('kit-tab-nova');
    const unidadePanel = document.getElementById('unidade-tab-nova');
    document.getElementById('kitsListNova').innerHTML = '';
    const kitVariacoesSelect = document.getElementById('kitVariacoesNova');
    kitVariacoesSelect.innerHTML = '<option value="">Selecione o Kit primeiro</option>';
    kitVariacoesSelect.disabled = true;
    document.getElementById('kitVariacaoComposicaoWrapperNova').style.display = 'none';
    document.getElementById('kitTableContainerNova').style.display = 'none';
    document.getElementById('kitFooterNova').style.display = 'none';
    document.getElementById('kitErrorMessageNova').classList.add('hidden');
     const temKits = await temKitsDisponiveis(agregado.produto_id, agregado.variante);
    const podeMontarKit = permissoes.includes('montar-kit'); // Sua verificação de permissão

    console.log(`[carregarDetalhesEmbalagemView] Para ${agregado.produto} (ID: ${agregado.produto_id}) - ${agregado.variante}: temKits=${temKits}, podeMontarKit=${podeMontarKit}`);

     if (kitTabButton) {
        // ESTA CONDIÇÃO DETERMINA SE A ABA APARECE
        kitTabButton.style.display = (temKits && podeMontarKit) ? 'inline-flex' : 'none';
    }

    // Lógica para definir qual aba fica ativa por padrão (geralmente 'unidade')
    if (unidadeTabButton) unidadeTabButton.classList.add('active');
    if (unidadePanel) {
        unidadePanel.classList.add('active');
        unidadePanel.style.display = 'block';
    }
    if (kitTabButton) kitTabButton.classList.remove('active');
    if (kitPanel) {
        kitPanel.classList.remove('active');
        kitPanel.style.display = 'none';
    }
}


// --- Funções para Embalar Unidade e Montar Kit (lógica de envio) ---
async function embalarUnidade() {
    if (!embalagemAgregadoEmVisualizacao || operacaoEmAndamento.has('embalarUnidade')) return;

    const inputQtd = document.getElementById('inputQuantidadeEmbalarUnidade');
    const btnEmbalar = document.getElementById('btnEmbalarEnviarEstoqueUnidade');
    const quantidadeEnviada = parseInt(inputQtd.value);

    if (isNaN(quantidadeEnviada) || quantidadeEnviada <= 0 || quantidadeEnviada > embalagemAgregadoEmVisualizacao.total_quantidade_disponivel_para_embalar) {
        mostrarPopupMensagem('Quantidade para embalar inválida.', 'erro');
        return;
    }

    operacaoEmAndamento.add('embalarUnidade');
    btnEmbalar.disabled = true;
    btnEmbalar.innerHTML = '<div class="spinner-btn-interno"></div> Processando...';
    inputQtd.disabled = true;

    try {
        let quantidadeRestanteDaMeta = quantidadeEnviada;
        const arrematesOrdenados = [...embalagemAgregadoEmVisualizacao.arremates_detalhe]
            .filter(arr => arr.quantidade_disponivel_para_embalar > 0)
            .sort((a, b) => a.id_arremate - b.id_arremate);

        // Primeiro, atualiza o saldo dos arremates consumidos
        for (const arremate of arrematesOrdenados) {
            if (quantidadeRestanteDaMeta <= 0) break;
            const qtdAEmbalarDeste = Math.min(quantidadeRestanteDaMeta, arremate.quantidade_disponivel_para_embalar);
            if (qtdAEmbalarDeste > 0) {
                await fetchFromAPI(`/arremates/${arremate.id_arremate}/registrar-embalagem`, {
                    method: 'PUT',
                    body: JSON.stringify({ quantidade_que_foi_embalada_desta_vez: qtdAEmbalarDeste })
                });
                quantidadeRestanteDaMeta -= qtdAEmbalarDeste;
            }
        }
        
        if (quantidadeRestanteDaMeta > 0 && quantidadeEnviada > 0) {
            // Este erro não deveria acontecer se a lógica estiver correta, mas é uma segurança
            throw new Error("Não foi possível alocar a quantidade total nos arremates disponíveis. Saldo inconsistente.");
        }
        
        // << AQUI ESTÁ A CORREÇÃO PRINCIPAL >>
        // Monta o payload para a entrada de estoque usando o produto_id
        const payloadEstoque = {
            produto_id: embalagemAgregadoEmVisualizacao.produto_id,
            variante_nome: embalagemAgregadoEmVisualizacao.variante === '-' ? null : embalagemAgregadoEmVisualizacao.variante,
            quantidade_entrada: quantidadeEnviada,
            // Passa o ID do primeiro arremate da lista como referência, se houver
            id_arremate_origem: arrematesOrdenados[0]?.id_arremate || null
        };
        
        await fetchFromAPI('/estoque/entrada-producao', {
            method: 'POST',
            body: JSON.stringify(payloadEstoque)
        });
        
        mostrarPopupMensagem(`${quantidadeEnviada} unidade(s) embalada(s) com sucesso!`, 'sucesso');
        
        // Após sucesso, volta para a lista para forçar a atualização dos dados
        window.location.hash = '';

    } catch (error) {
        console.error('[embalarUnidade] Erro:', error);
        mostrarPopupMensagem(`Falha ao embalar unidade: ${error.message}`, 'erro');
        inputQtd.disabled = false;
        btnEmbalar.disabled = false;
        btnEmbalar.innerHTML = 'Estocar Unidades';
    } finally {
        operacaoEmAndamento.delete('embalarUnidade');
    }
}

async function montarKits() {
    if (!embalagemAgregadoEmVisualizacao || operacaoEmAndamento.has('montarKits')) {
        console.warn('[montarKits] Operação já em andamento ou nenhum agregado em visualização.');
        return;
    }

    const selectKitEl = document.getElementById('kitsListNova').querySelector('button.active');
    const selectVariacaoKitEl = document.getElementById('kitVariacoesNova');
    const inputQtdKitsEl = document.getElementById('qtdEnviarKitsNova');
    const btnMontarEl = document.getElementById('btnMontarEnviarKitsEstoque');

    if (!selectKitEl || !selectVariacaoKitEl || !selectVariacaoKitEl.value || !inputQtdKitsEl || !inputQtdKitsEl.value) {
        mostrarPopupMensagem('Selecione o kit, a variação do kit e a quantidade para montar.', 'aviso');
        return;
    }

    const nomeKitProduto = selectKitEl.textContent.trim(); // Nome do kit selecionado
    const variacaoKitProduto = selectVariacaoKitEl.value; // Variação do kit selecionado
    const qtdKitsParaEnviar = parseInt(inputQtdKitsEl.value);
    const maxKitsMontaveis = parseInt(document.getElementById('qtdDisponivelKitsNova').textContent) || 0;

    if (isNaN(qtdKitsParaEnviar) || qtdKitsParaEnviar <= 0) {
        mostrarPopupMensagem('Quantidade de kits para montar deve ser maior que zero.', 'erro');
        return;
    }
    if (qtdKitsParaEnviar > maxKitsMontaveis) {
        mostrarPopupMensagem(`Não é possível montar ${qtdKitsParaEnviar} kit(s). Máximo disponível: ${maxKitsMontaveis}.`, 'erro');
        return;
    }

    // Buscar o ID do produto kit
    const kitProdutoSelecionadoObj = todosOsProdutosCadastrados.find(p => p.nome === nomeKitProduto && p.is_kit === true);
    if (!kitProdutoSelecionadoObj || !kitProdutoSelecionadoObj.id) {
        mostrarPopupMensagem(`Erro: Não foi possível encontrar o ID para o kit "${nomeKitProduto}". Verifique o cadastro.`, 'erro');
        return;
    }
    const idDoKitParaAPI = kitProdutoSelecionadoObj.id;

    operacaoEmAndamento.add('montarKits');
    const originalButtonHTML = btnMontarEl.innerHTML;
    btnMontarEl.disabled = true;
    btnMontarEl.innerHTML = '<div class="spinner-btn-interno"></div> Montando Kits...';
    document.querySelectorAll('#kitsListNova button').forEach(b => b.disabled = true);
    selectVariacaoKitEl.disabled = true;
    inputQtdKitsEl.disabled = true;

    let sucessoGeral = false;
    try {
        const variacaoDoKitObj = kitProdutoSelecionadoObj.grade?.find(g => g.variacao === variacaoKitProduto);
        const composicaoDoKitSelecionado = variacaoDoKitObj?.composicao;

        if (!composicaoDoKitSelecionado || composicaoDoKitSelecionado.length === 0) {
            throw new Error('Composição do kit não encontrada ou está vazia. Verifique o cadastro do kit.');
        }

        const componentesParaPayload = [];
        for (const itemCompDef of composicaoDoKitSelecionado) {
            // itemCompDef AGORA DEVE TER produto_id e produto_nome
            const idComp = itemCompDef.produto_id;
            const nomeCompParaLog = itemCompDef.produto_nome || itemCompDef.produto; // Fallback para nome antigo
            const varComp = itemCompDef.variacao === '-' ? null : (itemCompDef.variacao || null);
            const qtdNecPorKit = parseInt(itemCompDef.quantidade) || 1;
            let qtdTotalCompNec = qtdKitsParaEnviar * qtdNecPorKit;

            // Encontra o agregado do componente usando o ID do componente
            const agregadoDoComponente = produtosAgregadosParaEmbalarGlobal.find(
                agg => String(agg.produto_id) === String(idComp) && (agg.variante || '-') === (varComp || '-')
            );

            if (!agregadoDoComponente) {
                throw new Error(`Componente "${nomeCompParaLog}" (${varComp || 'Padrão'}) não encontrado nos itens disponíveis para embalar ou saldo insuficiente.`);
            }

            const arrematesDisponiveisDoComponente = [...agregadoDoComponente.arremates_detalhe]
                .filter(arr => arr.quantidade_disponivel_para_embalar > 0)
                .sort((a, b) => a.id_arremate - b.id_arremate); // FIFO de arremates

            for (const arremateComp of arrematesDisponiveisDoComponente) {
                if (qtdTotalCompNec <= 0) break;
                const qtdUsarDesteArremate = Math.min(qtdTotalCompNec, arremateComp.quantidade_disponivel_para_embalar);
                if (qtdUsarDesteArremate > 0) {
                    componentesParaPayload.push({
                        id_arremate: arremateComp.id_arremate,
                        produto_id: idComp, // ID do produto componente
                        produto_nome: nomeCompParaLog, // Nome para referência/log
                        variacao: varComp,
                        quantidade_usada: qtdUsarDesteArremate
                    });
                    qtdTotalCompNec -= qtdUsarDesteArremate;
                }
            }
            if (qtdTotalCompNec > 0) {
                throw new Error(`Saldo insuficiente para o componente "${nomeCompParaLog}" (${varComp || 'Padrão'}). Faltam ${qtdTotalCompNec} unidades.`);
            }
        }

        const payloadAPI = {
            kit_produto_id: idDoKitParaAPI, // Envia o ID do kit
            kit_nome: nomeKitProduto,        // Envia o nome para logs e observação
            kit_variante: variacaoKitProduto === '-' ? null : variacaoKitProduto,
            quantidade_kits_montados: qtdKitsParaEnviar,
            componentes_consumidos_de_arremates: componentesParaPayload
        };

        console.log("[montarKits] Payload final para API:", JSON.stringify(payloadAPI, null, 2));
        
        await fetchFromAPI('/kits/montar', { method: 'POST', body: JSON.stringify(payloadAPI) });
        
        mostrarPopupMensagem(`${qtdKitsParaEnviar} kit(s) "${nomeKitProduto}" montado(s) e enviado(s) para estoque!`, 'sucesso');
        sucessoGeral = true;

        // Limpar caches e voltar para a lista principal
        todosArrematesRegistradosCache = []; // Força recarga dos arremates
        // produtosAgregadosParaEmbalarGlobal será recalculado
        await calcularEAgruparProntosParaEmbalar(); // Recalcula o que está pronto para embalar
        window.location.hash = ''; // Volta para a lista

    } catch (error) {
        console.error('[montarKits] Erro:', error);
        mostrarPopupMensagem(`Erro ao montar kits: ${error.message}`, 'erro');
    } finally {
        operacaoEmAndamento.delete('montarKits');
        // Garante que os elementos do DOM existam antes de tentar manipulá-los
        const currentBtnMontarEl = document.getElementById('btnMontarEnviarKitsEstoque');
        const currentKitsListButtons = document.querySelectorAll('#kitsListNova button');
        const currentSelectVariacaoKitEl = document.getElementById('kitVariacoesNova');
        const currentInputQtdKitsEl = document.getElementById('qtdEnviarKitsNova');

        if (currentBtnMontarEl) {
            currentBtnMontarEl.innerHTML = originalButtonHTML;
        }
        if (!sucessoGeral) { // Reabilita tudo para nova tentativa se falhou
            if (currentKitsListButtons) currentKitsListButtons.forEach(b => b.disabled = false);
            if (currentSelectVariacaoKitEl) currentSelectVariacaoKitEl.disabled = false;
            if (currentInputQtdKitsEl) currentInputQtdKitsEl.disabled = false;
            atualizarEstadoBotaoMontarKitNova(); // Tenta reabilitar o botão de montar se possível
        }
    }
}

// --- Funções Auxiliares de Kit (copiadas e adaptadas com sufixo Nova) ---
async function temKitsDisponiveis(produtoIdBase, varianteBase) {
    if (todosOsProdutosCadastrados.length === 0) {
        console.log("[temKitsDisponiveis] Buscando produtos pois o cache local está vazio.");
        todosOsProdutosCadastrados = await obterProdutosDoStorage(true); // Força busca se vazio
    }
    const kits = todosOsProdutosCadastrados.filter(p => p.is_kit === true);
    // console.log("[temKitsDisponiveis] Kits encontrados para verificação:", kits); // Log dos kits

    if (kits.length === 0) return false;

    const varBaseNormalizada = (varianteBase === '-' || varianteBase === null || varianteBase === undefined ? '' : String(varianteBase)).toLowerCase();
    console.log(`[temKitsDisponiveis] Procurando por Produto Base ID: ${produtoIdBase}, Variante Base Normalizada: '${varBaseNormalizada}'`);

    for (const kit of kits) {
        // console.log(`[temKitsDisponiveis] Verificando Kit: ${kit.nome} (ID: ${kit.id})`);
        if (kit.grade && Array.isArray(kit.grade)) {
            for (const g of kit.grade) { // Para cada variação do kit (ex: "Pacote Azul")
                if (g.composicao && Array.isArray(g.composicao)) {
                    for (const componente of g.composicao) {
                        const idComponenteNoKit = componente.produto_id;
                        const nomeComponenteNoKit = componente.produto_nome || componente.produto; // Para log
                        const varComponenteNoKitNormalizada = (componente.variacao === '-' || componente.variacao === null || componente.variacao === undefined ? '' : String(componente.variacao)).toLowerCase();

                        // console.log(`  -> Componente no kit: ID ${idComponenteNoKit} (${nomeComponenteNoKit}), Var: '${varComponenteNoKitNormalizada}' (Qtd: ${componente.quantidade})`);

                        if (idComponenteNoKit && String(idComponenteNoKit) === String(produtoIdBase) && varComponenteNoKitNormalizada === varBaseNormalizada) {
                            console.log(`[temKitsDisponiveis] ENCONTRADO! Kit: ${kit.nome}, Variação do Kit: ${g.variacao}, Componente: ID ${idComponenteNoKit} (${nomeComponenteNoKit}) - Var: '${varComponenteNoKitNormalizada}'`);
                            return true;
                        }
                    }
                }
            }
        }
    }
    console.log(`[temKitsDisponiveis] NÃO ENCONTRADO para Produto Base ID: ${produtoIdBase}, Variante Base: '${varBaseNormalizada}'`);
    return false;
}

async function carregarKitsDisponiveisNova(produtoBaseId, varianteBase) {
    // produtoBaseId: O ID do produto que o usuário clicou para embalar (o "item base").
    // varianteBase: A variante do produto que o usuário clicou para embalar.

    // Elementos do DOM para a lista de kits e seções subsequentes
    const kitsListEl = document.getElementById('kitsListNova');
    const kitVariacaoWrapperEl = document.getElementById('kitVariacaoComposicaoWrapperNova'); // Renomeado para clareza
    const kitTableContainerEl = document.getElementById('kitTableContainerNova');
    const kitFooterEl = document.getElementById('kitFooterNova');
    const kitVariacoesSelectEl = document.getElementById('kitVariacoesNova'); // Referência ao select de variações do KIT

    // Validação dos elementos do DOM
    if (!kitsListEl || !kitVariacaoWrapperEl || !kitTableContainerEl || !kitFooterEl || !kitVariacoesSelectEl) {
        console.error("[carregarKitsDisponiveisNova] Um ou mais elementos essenciais da UI para kits não foram encontrados.");
        if (kitsListEl) kitsListEl.innerHTML = '<p style="color:red;">Erro: Elementos da UI ausentes.</p>';
        return;
    }

    // Validação do produtoBaseId
    if (!produtoBaseId) {
        console.warn("[carregarKitsDisponiveisNova] produtoBaseId não fornecido. Não é possível carregar kits.");
        kitsListEl.innerHTML = '<p style="font-style:italic; color: var(--op-cor-cinza-texto);">Informação do item base inválida para buscar kits.</p>';
        kitVariacaoWrapperEl.style.display = 'none';
        kitTableContainerEl.style.display = 'none';
        kitFooterEl.style.display = 'none';
        return;
    }

    // Garante que a lista de todos os produtos esteja carregada
    if (!todosOsProdutosCadastrados || todosOsProdutosCadastrados.length === 0) {
        console.log("[carregarKitsDisponiveisNova] Cache todosOsProdutosCadastrados vazio, buscando do storage...");
        todosOsProdutosCadastrados = await obterProdutosDoStorage(true); // Força a busca se estiver vazio
    }

    // Reset e mensagem de carregamento
    kitsListEl.innerHTML = '<p>Buscando kits que utilizam este item...</p>';
    kitVariacaoWrapperEl.style.display = 'none';
    kitTableContainerEl.style.display = 'none';
    kitFooterEl.style.display = 'none';
    kitVariacoesSelectEl.innerHTML = '<option value="">Selecione o Kit primeiro</option>'; // Reseta o select de variações do kit
    kitVariacoesSelectEl.disabled = true;


    // Normaliza a variante do item base que o usuário quer usar como componente
    const varianteBaseNormalizada = (varianteBase === '-' || varianteBase === null || varianteBase === undefined ? '' : String(varianteBase)).toLowerCase();
    console.log(`[carregarKitsDisponiveisNova] Procurando kits que usam Produto Base ID: ${produtoBaseId}, Variante Base Normalizada: '${varianteBaseNormalizada}'`);

    // Filtra todos os produtos para encontrar apenas aqueles que SÃO KITS
    // E que em ALGUMA de suas variações de grade, contêm o produtoBaseId com a varianteBase como COMPONENTE.
    const kitsQueUtilizamOComponente = todosOsProdutosCadastrados.filter(kitProduto => {
        if (!kitProduto.is_kit || !kitProduto.grade || !Array.isArray(kitProduto.grade)) {
            return false; // Não é um kit ou não tem grade definida
        }
        // Verifica se ALGUMA variação deste kit (g) contém o componente desejado
        return kitProduto.grade.some(variacaoDoKit => 
            variacaoDoKit.composicao && Array.isArray(variacaoDoKit.composicao) &&
            variacaoDoKit.composicao.some(componenteDaComposicao => {
                const idComponente = componenteDaComposicao.produto_id; // ID do componente na definição do kit
                const nomeComponenteLog = componenteDaComposicao.produto_nome || componenteDaComposicao.produto; // Para log
                const variacaoComponenteNormalizada = (componenteDaComposicao.variacao === '-' || componenteDaComposicao.variacao === null || componenteDaComposicao.variacao === undefined ? '' : String(componenteDaComposicao.variacao)).toLowerCase();
                
                const match = idComponente && String(idComponente) === String(produtoBaseId) && variacaoComponenteNormalizada === varianteBaseNormalizada;
                if(match){
                     console.log(`  -> Item Base (ID: ${produtoBaseId}, Var: '${varianteBaseNormalizada}') ENCONTRADO como componente (ID: ${idComponente}, Nome: ${nomeComponenteLog}, Var: '${variacaoComponenteNormalizada}') no Kit: "${kitProduto.nome}", Variação do Kit: "${variacaoDoKit.variacao}"`);
                }
                return match;
            })
        );
    });

    console.log(`[carregarKitsDisponiveisNova] Total de kits filtrados que usam o item base: ${kitsQueUtilizamOComponente.length}`, kitsQueUtilizamOComponente.map(k => ({id: k.id, nome: k.nome})));

    if (kitsQueUtilizamOComponente.length === 0) {
        kitsListEl.innerHTML = '<p style="font-style:italic; color: var(--op-cor-cinza-texto);">Nenhum kit cadastrado utiliza este item base específico.</p>';
        return;
    }

    kitsListEl.innerHTML = ''; // Limpa a mensagem "Buscando..."

    kitsQueUtilizamOComponente.forEach(kit => {
        const button = document.createElement('button');
        button.className = 'ep-btn'; // Sua classe de botão
        button.textContent = kit.nome; // Mostra o nome do KIT que pode ser montado
        button.dataset.kitId = kit.id; // Armazena o ID do kit no botão para referência futura

        button.addEventListener('click', (e) => {
            // Lógica para quando um kit é selecionado da lista
            document.querySelectorAll('#kitsListNova button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            kitVariacaoWrapperEl.style.display = 'block'; // Mostra a seção para selecionar a variação do kit

            // Passa o NOME do kit selecionado e o ID e VARIANTE do ITEM BASE ORIGINAL para a próxima função
            // O NOME do kit é usado para encontrar o objeto kit em todosOsProdutosCadastrados
            // O ID e VARIANTE do item base são para filtrar as variações do kit que usam esse componente específico
            carregarVariacoesKitNova(kit.nome, produtoBaseId, varianteBase);
        });
        kitsListEl.appendChild(button);
    });
}

async function carregarVariacoesKitNova(nomeKitSelecionado, produtoBaseIdComponente, varianteBaseComponente) {
    const kitVariacoesSelect = document.getElementById('kitVariacoesNova');
    const kitTableContainerEl = document.getElementById('kitTableContainerNova'); // Referência correta
    const kitFooterEl = document.getElementById('kitFooterNova');             // Referência correta
    const kitErrorMessageEl = document.getElementById('kitErrorMessageNova');   // Referência correta

    if (!kitVariacoesSelect || !kitTableContainerEl || !kitFooterEl || !kitErrorMessageEl) {
        console.error("[carregarVariacoesKitNova] Elementos da UI para variações do kit não encontrados.");
        return;
    }

    console.log(`[carregarVariacoesKitNova] Carregando variações para Kit: "${nomeKitSelecionado}" que usa o componente ID: ${produtoBaseIdComponente}, Var Comp: "${varianteBaseComponente}"`);

    // Estado inicial enquanto carrega
    kitVariacoesSelect.innerHTML = '<option value="">Carregando variações do kit...</option>';
    kitVariacoesSelect.disabled = true;
    kitTableContainerEl.style.display = 'none';
    kitFooterEl.style.display = 'none';
    kitErrorMessageEl.classList.add('hidden');

    if (!nomeKitSelecionado || produtoBaseIdComponente === undefined || varianteBaseComponente === undefined) {
        console.warn("[carregarVariacoesKitNova] Argumentos inválidos recebidos.");
        kitVariacoesSelect.innerHTML = '<option value="">Erro nos dados de entrada</option>';
        return;
    }

    const kitObj = todosOsProdutosCadastrados.find(p => p.is_kit && p.nome === nomeKitSelecionado);
    if (!kitObj || !kitObj.grade || !Array.isArray(kitObj.grade)) {
        console.error(`[carregarVariacoesKitNova] Kit "${nomeKitSelecionado}" não encontrado ou não possui grade.`);
        kitVariacoesSelect.innerHTML = '<option value="">Erro: Kit não encontrado</option>';
        return;
    }

    // Normaliza a variante do componente base que estamos procurando
    const varianteBaseComponenteNormalizada = (
        varianteBaseComponente === '-' || varianteBaseComponente === null || varianteBaseComponente === undefined 
        ? '' 
        : String(varianteBaseComponente)
    ).toLowerCase();

    // Filtra as variações do KIT SELECIONADO (kitObj.grade)
    // para encontrar apenas aquelas que contêm o produtoBaseIdComponente com a varianteBaseComponenteNormalizada
    const variacoesDoKitQueUsamOComponente = kitObj.grade.filter(variacaoDoKitGradeItem => // cada item da grade do KIT
        variacaoDoKitGradeItem.composicao && Array.isArray(variacaoDoKitGradeItem.composicao) &&
        variacaoDoKitGradeItem.composicao.some(componenteNaComposicao => {
            const idDoComponente = componenteNaComposicao.produto_id;
            const variacaoDoComponenteNormalizada = (
                componenteNaComposicao.variacao === '-' || componenteNaComposicao.variacao === null || componenteNaComposicao.variacao === undefined
                ? ''
                : String(componenteNaComposicao.variacao)
            ).toLowerCase();
            
            return idDoComponente && 
                   String(idDoComponente) === String(produtoBaseIdComponente) && 
                   variacaoDoComponenteNormalizada === varianteBaseComponenteNormalizada;
        })
    );
    
    console.log(`[carregarVariacoesKitNova] Variações do kit "${nomeKitSelecionado}" que usam o componente (ID: ${produtoBaseIdComponente}, VarNorm: '${varianteBaseComponenteNormalizada}'): ${variacoesDoKitQueUsamOComponente.length}`, variacoesDoKitQueUsamOComponente.map(v => v.variacao));

    if (variacoesDoKitQueUsamOComponente.length === 0) {
        kitVariacoesSelect.innerHTML = '<option value="">Nenhuma variação deste kit utiliza o item base especificado.</option>';
        // Mantém as seções subsequentes escondidas
        kitTableContainerEl.style.display = 'none';
        kitFooterEl.style.display = 'none';
        return;
    }

    kitVariacoesSelect.innerHTML = '<option value="">Selecione a Variação do Kit</option>';
    variacoesDoKitQueUsamOComponente.forEach(gradeItemDoKit => {
        // O 'value' aqui é a string da variação do KIT (ex: "Marsala com Preto")
        kitVariacoesSelect.add(new Option(gradeItemDoKit.variacao || 'Padrão', gradeItemDoKit.variacao));
    });

    // Remove listener antigo para evitar duplicação
    const novoSelect = kitVariacoesSelect.cloneNode(true); // Clona para limpar listeners
    kitVariacoesSelect.parentNode.replaceChild(novoSelect, kitVariacoesSelect);
    // Reatribui a referência global se você a usa em outro lugar, ou pegue-a novamente pelo ID
    // elements.kitVariacoesSelect = novoSelect; // Se kitVariacoesSelectEl for uma referência em 'elements'

    document.getElementById('kitVariacoesNova').addEventListener('change', (e) => { // Adiciona listener ao novo select
        const variacaoDoKitSelecionadaString = e.target.value;
        if (variacaoDoKitSelecionadaString) {
            kitTableContainerEl.style.display = 'block';
            kitFooterEl.style.display = 'block';
            kitErrorMessageEl.classList.add('hidden');
            // Passa o nome do kit e a STRING da variação do kit selecionada para carregar a tabela de componentes
            carregarTabelaKitNova(nomeKitSelecionado, variacaoDoKitSelecionadaString);
        } else {
            kitTableContainerEl.style.display = 'none';
            kitFooterEl.style.display = 'none';
        }
    });
    
    document.getElementById('kitVariacoesNova').disabled = false; // Reabilita o select
}

async function carregarTabelaKitNova(kitNome, variacaoKitSelecionada) {
    const kitTableBody = document.getElementById('kitTableBodyNova');
    const qtdDisponivelKitsSpan = document.getElementById('qtdDisponivelKitsNova');
    const qtdEnviarKitsInput = document.getElementById('qtdEnviarKitsNova');
    const kitEstoqueBtn = document.getElementById('btnMontarEnviarKitsEstoque');
    const kitErrorMessage = document.getElementById('kitErrorMessageNova');
    
    if(!kitTableBody || !qtdDisponivelKitsSpan || !qtdEnviarKitsInput || !kitEstoqueBtn || !kitErrorMessage) {
        console.error("[carregarTabelaKitNova] Elementos da UI para a tabela de kit não encontrados.");
        return;
    }

    console.log(`[carregarTabelaKitNova] Carregando tabela para Kit: "${kitNome}", Variação do Kit: "${variacaoKitSelecionada}"`);

    kitErrorMessage.classList.add('hidden'); // Esconde mensagem de erro antiga
    kitTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;"><div class="spinner">Analisando componentes e disponibilidade...</div></td></tr>`;
    qtdEnviarKitsInput.disabled = true;
    kitEstoqueBtn.disabled = true;
    qtdDisponivelKitsSpan.textContent = '0';

    const kitSelecionado = todosOsProdutosCadastrados.find(p => p.nome === kitNome && p.is_kit === true);
    if (!kitSelecionado) {
        kitErrorMessage.textContent = `Kit "${kitNome}" não encontrado nos dados carregados.`;
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:red;">${kitErrorMessage.textContent}</td></tr>`;
        return;
    }

    const variacaoDoKitObj = kitSelecionado.grade?.find(g => g.variacao === variacaoKitSelecionada);
    const composicaoDoKit = variacaoDoKitObj?.composicao;

    if (!composicaoDoKit || composicaoDoKit.length === 0) {
        kitErrorMessage.textContent = 'Composição não definida ou vazia para esta variação do kit.';
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--op-cor-texto-aviso);">${kitErrorMessage.textContent}</td></tr>`;
        return;
    }

    kitTableBody.innerHTML = ''; // Limpa o spinner

    let menorQuantidadeKitsMontaveis = Infinity;
    let todosComponentesDisponiveisParaUmKitPeloMenos = true; // Para montar pelo menos UM kit

    for (const itemComponente of composicaoDoKit) {
        // CORREÇÃO 1: Obter o nome do componente corretamente
        const nomeProdutoComponente = itemComponente.produto_nome || itemComponente.produto || 'Componente Desconhecido';
        const varianteComponente = itemComponente.variacao || '-'; // Variante como está na definição do kit
        const quantidadeNecessariaPorKit = parseInt(itemComponente.quantidade) || 1;
        
        let qtdDisponivelTotalComponente = 0;

        // CORREÇÃO 2: Buscar o agregado do componente usando o produto_id do itemComponente
        const agregadoComponente = produtosAgregadosParaEmbalarGlobal.find(
            agg => String(agg.produto_id) === String(itemComponente.produto_id) && // Compara IDs
                   (agg.variante || '-') === (varianteComponente === '-' ? '-' : varianteComponente) // Compara variantes normalizadas
        );

        if (agregadoComponente) {
            qtdDisponivelTotalComponente = agregadoComponente.total_quantidade_disponivel_para_embalar;
        } else {
            console.warn(`[carregarTabelaKitNova] Agregado não encontrado para componente ID: ${itemComponente.produto_id} (${nomeProdutoComponente}) - Var: ${varianteComponente}. Saldo considerado 0.`);
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${nomeProdutoComponente} ${varianteComponente !== '-' ? `(${varianteComponente})` : ''}</td>
            <td style="text-align:center;">${quantidadeNecessariaPorKit}</td>
            <td style="text-align:center;">
                <input type="number" class="op-input readonly ep-kit-componente-disponivel-input" value="${qtdDisponivelTotalComponente}" readonly 
                       style="background:transparent; border:none; box-shadow:none; text-align:center; width: 60px;">
            </td>
        `;

        if (qtdDisponivelTotalComponente < quantidadeNecessariaPorKit) {
            tr.classList.add('item-insuficiente'); // Adicione estilo CSS para esta classe (ex: texto vermelho)
            todosComponentesDisponiveisParaUmKitPeloMenos = false;
        }
        kitTableBody.appendChild(tr);

        if (quantidadeNecessariaPorKit > 0) {
            menorQuantidadeKitsMontaveis = Math.min(menorQuantidadeKitsMontaveis, Math.floor(qtdDisponivelTotalComponente / quantidadeNecessariaPorKit));
        } else {
            // Se um componente tem quantidade necessária 0, isso é estranho.
            // Para evitar divisão por zero, mas indica problema na configuração do kit.
            menorQuantidadeKitsMontaveis = 0; 
        }
    }

    const maxKitsMontaveisFinal = (todosComponentesDisponiveisParaUmKitPeloMenos && composicaoDoKit.length > 0 && menorQuantidadeKitsMontaveis !== Infinity) 
                                  ? menorQuantidadeKitsMontaveis 
                                  : 0;
    
    qtdDisponivelKitsSpan.textContent = maxKitsMontaveisFinal;
    
    if (maxKitsMontaveisFinal <= 0 && composicaoDoKit.length > 0) {
        kitErrorMessage.textContent = 'Componentes insuficientes em estoque para montar este kit.';
        kitErrorMessage.classList.remove('hidden');
    }

    qtdEnviarKitsInput.value = maxKitsMontaveisFinal > 0 ? "1" : "0";
    qtdEnviarKitsInput.max = maxKitsMontaveisFinal;
    qtdEnviarKitsInput.disabled = maxKitsMontaveisFinal <= 0; // Desabilita se não pode montar nenhum
    
    atualizarEstadoBotaoMontarKitNova(); // Atualiza o estado do botão "Estocar Kits"
}

function atualizarEstadoBotaoMontarKitNova() {
    const inputQtd = document.getElementById('qtdEnviarKitsNova');
    const btnMontar = document.getElementById('btnMontarEnviarKitsEstoque');
    if (!inputQtd || !btnMontar) return;

    const valor = parseInt(inputQtd.value) || 0;
    const maxKits = parseInt(inputQtd.max) || 0;
    const podeMontar = permissoes.includes('montar-kit'); // Verifica a permissão aqui
    
    btnMontar.disabled = !(valor > 0 && valor <= maxKits && podeMontar);
}

// --- Controle de Views (Hash e LocalStorage) ---
async function handleHashChangeEmbalagem() {
    const hash = window.location.hash;
    const embalagemListViewEl = document.getElementById('embalagemListViewNova'); // Usar novo ID
    const embalarDetalheViewEl = document.getElementById('embalarDetalheView');   // Usar novo ID

    if (!embalagemListViewEl || !embalarDetalheViewEl) {
        console.error("Views principais de embalagem não encontradas no DOM.");
        return;
    }

    if (hash === '#embalar-produto') {
        const data = localStorage.getItem('embalarDetalheAtual');
        if (data) {
            await carregarDetalhesEmbalagemView(JSON.parse(data));
        } else {
            console.warn("Hash #embalar-produto sem dados no localStorage. Voltando para lista.");
            window.location.hash = ''; // Volta para a lista se não houver dados
        }
    } else { // Para hash vazio ou qualquer outro não reconhecido
        embalagemListViewEl.style.display = 'block';
        embalarDetalheViewEl.style.display = 'none';
        localStorage.removeItem('embalarDetalheAtual');
        embalagemAgregadoEmVisualizacao = null;
        // Recarrega os dados e renderiza os cards da lista principal
        await calcularEAgruparProntosParaEmbalar();
        await renderizarCardsEmbalagem();
    }
}

// --- Inicialização ---
async function inicializarDadosEViewsEmbalagem() {
    // Carrega dados essenciais primeiro
    await Promise.all([
    obterProdutosDoStorage(true).then(p => { // Deveria ser obterProdutosDoStorage(true) para forçar?
        todosOsProdutosCadastrados = p;
        console.log(`[inicializarDadosEViewsEmbalagem] ${todosOsProdutosCadastrados.length} produtos carregados.`);
    }),
    buscarArrematesCompletos()
]);

    // Após os dados base, processa a view correta
    await handleHashChangeEmbalagem();
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('embalagem-de-produtos.html', ['acesso-embalagem-de-produtos']);
        if (!auth) {
            return;
        }
        usuarioLogado = auth.usuario;
        permissoes = auth.permissoes || [];
        document.body.classList.add('autenticado');

        await inicializarDadosEViewsEmbalagem();

        window.addEventListener('hashchange', handleHashChangeEmbalagem);
        
        document.getElementById('fecharEmbalarDetalheBtn')?.addEventListener('click', () => {
            window.location.hash = '';
        });
        document.getElementById('btnEmbalarEnviarEstoqueUnidade')?.addEventListener('click', embalarUnidade);
        document.getElementById('btnMontarEnviarKitsEstoque')?.addEventListener('click', montarKits);
        
        document.querySelectorAll('#embalarDetalheView .ep-tabs .ep-tab-btn').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                const tabBtn = event.currentTarget;
                const tabId = tabBtn.dataset.tab;

                document.querySelectorAll('#embalarDetalheView .ep-tabs .ep-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('#embalarDetalheView .ep-tab-panel').forEach(p => {
                    p.classList.remove('active');
                    p.style.display = 'none';
                });

                tabBtn.classList.add('active');
                const activePanel = document.getElementById(`${tabId}-tab-nova`);
                if (activePanel) {
                    activePanel.classList.add('active');
                    activePanel.style.display = 'block';
                }
                
                if (tabId === 'kit' && embalagemAgregadoEmVisualizacao) {
            await carregarKitsDisponiveisNova(embalagemAgregadoEmVisualizacao.produto_id, embalagemAgregadoEmVisualizacao.variante);
        }
    });
});
        
        const searchInput = document.getElementById('searchProdutoEmbalagem');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(async () => {
                currentPageEmbalagemCards = 1;
                await renderizarCardsEmbalagem();
            }, 350));
        }

        // ADICIONAR ESTA LINHA:
        document.getElementById('qtdEnviarKitsNova')?.addEventListener('input', atualizarEstadoBotaoMontarKitNova);

    } catch (error) {
        console.error("[DOMContentLoaded Embalagem] Erro crítico na inicialização:", error);
        mostrarPopupMensagem("Erro crítico ao carregar a página. Tente recarregar.", "erro", 0);
        document.body.innerHTML = "<p style='color:red; text-align:center; padding:20px;'>Falha crítica na inicialização da página.</p>";
    }
});

// Função global para limpar cache (se necessário para debug)
window.limparCacheEmbalagemProdutos = async () => {
    todosArrematesRegistradosCache = [];
    produtosAgregadosParaEmbalarGlobal = [];
    embalagemAgregadoEmVisualizacao = null;
    await invalidateProdutosStorageCache(); // Invalida o cache de produtos no localStorage
    todosOsProdutosCadastrados = []; // Limpa o cache local de produtos
    console.log('[limparCacheEmbalagemProdutos] Caches limpos.');
    mostrarPopupMensagem('Cache local de embalagem de produtos limpo.', 'aviso');
    await inicializarDadosEViewsEmbalagem(); // Recarrega tudo
};