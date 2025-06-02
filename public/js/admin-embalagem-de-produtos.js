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
    await buscarArrematesCompletos(); // Garante que `todosArrematesRegistradosCache` está atualizado
    if (todosOsProdutosCadastrados.length === 0) {
         todosOsProdutosCadastrados = await obterProdutosDoStorage();
    }

    const arrematesComSaldoParaEmbalar = [];
    for (const arremate of todosArrematesRegistradosCache) {
        const quantidadeTotalNesteArremate = parseInt(arremate.quantidade_arrematada) || 0;
        const quantidadeJaEmbaladaNesteArremate = parseInt(arremate.quantidade_ja_embalada) || 0;
        const saldoParaEmbalarNesteArremate = quantidadeTotalNesteArremate - quantidadeJaEmbaladaNesteArremate;

        if (saldoParaEmbalarNesteArremate > 0) {
            arrematesComSaldoParaEmbalar.push({
                id_arremate: arremate.id,
                op_numero_origem: arremate.op_numero, // Mantemos para rastreabilidade, se necessário
                produto: arremate.produto,
                variante: arremate.variante || '-', // Normaliza variante nula/vazia para '-'
                quantidade_disponivel_para_embalar: saldoParaEmbalarNesteArremate,
                // Outros dados relevantes do arremate podem ser adicionados aqui
            });
        }
    }

    const aggregatedMap = new Map();
    arrematesComSaldoParaEmbalar.forEach(arremateComSaldo => {
        const produtoKey = `${arremateComSaldo.produto}|${arremateComSaldo.variante}`; // Chave de agregação
        if (!aggregatedMap.has(produtoKey)) {
            aggregatedMap.set(produtoKey, {
                produto: arremateComSaldo.produto,
                variante: arremateComSaldo.variante,
                total_quantidade_disponivel_para_embalar: 0,
                arremates_detalhe: [] // Guarda os arremates individuais que compõem este agregado
            });
        }
        const aggregatedItem = aggregatedMap.get(produtoKey);
        aggregatedItem.total_quantidade_disponivel_para_embalar += arremateComSaldo.quantidade_disponivel_para_embalar;
        aggregatedItem.arremates_detalhe.push(arremateComSaldo); // Adiciona o arremate individual
    });
    produtosAgregadosParaEmbalarGlobal = Array.from(aggregatedMap.values());
    console.log('[calcularEAgruparProntosParaEmbalar] Produtos agregados para embalar:', produtosAgregadosParaEmbalarGlobal.length, produtosAgregadosParaEmbalarGlobal);
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

    document.getElementById('embalagemDetalheTitulo').textContent = `Embalar: ${agregado.produto}`;
    document.getElementById('embalagemDetalheSubTitle').textContent = agregado.variante !== '-' ? `Variação: ${agregado.variante}` : 'Variação: Padrão';
    
    const produtoCadEmb = todosOsProdutosCadastrados.find(p => p.nome === agregado.produto);
    let imgDetalheEmbSrc = '/img/placeholder-image.png'; // Caminho para imagem padrão
    if (produtoCadEmb) {
        if (agregado.variante && agregado.variante !== '-') {
            const gradeDetEmb = produtoCadEmb.grade?.find(g => g.variacao === agregado.variante);
            if (gradeDetEmb?.imagem) imgDetalheEmbSrc = gradeDetEmb.imagem;
            else if (produtoCadEmb.imagem) imgDetalheEmbSrc = produtoCadEmb.imagem;
        } else if (produtoCadEmb.imagem) {
            imgDetalheEmbSrc = produtoCadEmb.imagem;
        }
    }
    document.getElementById('embalagemDetalheThumbnail').innerHTML = `<img src="${imgDetalheEmbSrc}" alt="${agregado.produto}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';this.style.opacity=0.5;">`;

    // Aba Unidade
    document.getElementById('embalarProdutoNome').textContent = agregado.produto;
    document.getElementById('embalarVarianteNome').textContent = agregado.variante !== '-' ? agregado.variante : 'Padrão';
    document.getElementById('embalarQtdDisponivelUnidade').textContent = agregado.total_quantidade_disponivel_para_embalar;
    
    const inputQtdUnidade = document.getElementById('inputQuantidadeEmbalarUnidade');
    inputQtdUnidade.value = '';
    inputQtdUnidade.max = agregado.total_quantidade_disponivel_para_embalar;
    inputQtdUnidade.disabled = agregado.total_quantidade_disponivel_para_embalar === 0 || !permissoes.includes('lancar-embalagem');

    const btnEmbalarUnidade = document.getElementById('btnEmbalarEnviarEstoqueUnidade');
    btnEmbalarUnidade.disabled = true; 

    inputQtdUnidade.oninput = () => { // Arrow function para manter o `this` se necessário (aqui não é, mas boa prática)
        const qtd = parseInt(inputQtdUnidade.value) || 0;
        const maxQtd = parseInt(inputQtdUnidade.max) || 0;
        btnEmbalarUnidade.disabled = !(qtd > 0 && qtd <= maxQtd && permissoes.includes('lancar-embalagem'));
    };

    // Abas
    const kitTabButton = document.querySelector('#embalarDetalheView .ep-tabs button[data-tab="kit"]');
    const unidadeTabButton = document.querySelector('#embalarDetalheView .ep-tabs button[data-tab="unidade"]');
    const kitPanel = document.getElementById('kit-tab-nova');
    const unidadePanel = document.getElementById('unidade-tab-nova');

    const temKits = await temKitsDisponiveis(agregado.produto, agregado.variante);
    const podeMontarKit = permissoes.includes('montar-kit');

    if (kitTabButton) kitTabButton.style.display = (temKits && podeMontarKit) ? 'inline-flex' : 'none';
    
    // Força a aba "Unidade" a ser a ativa por padrão ao carregar esta view
    unidadeTabButton.classList.add('active');
    unidadePanel.classList.add('active'); // Adiciona 'active' para CSS
    unidadePanel.style.display = 'block'; // Garante visibilidade

    if (kitTabButton) kitTabButton.classList.remove('active');
    if (kitPanel) {
        kitPanel.classList.remove('active'); // Remove 'active'
        kitPanel.style.display = 'none'; // Esconde
    }
    // Esconde o wrapper de composição do kit inicialmente
    const kitVariacaoWrapper = document.getElementById('kitVariacaoComposicaoWrapperNova');
    if (kitVariacaoWrapper) kitVariacaoWrapper.style.display = 'none';
    const kitFooterEl = document.getElementById('kitFooterNova');
    if (kitFooterEl) kitFooterEl.style.display = 'none';

    console.log(`[carregarDetalhesEmbalagemView] Aba unidade ativada. Tem Kits: ${temKits}, Pode Montar: ${podeMontarKit}`);
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
    const originalButtonHTML = btnEmbalar.innerHTML;
    btnEmbalar.disabled = true;
    btnEmbalar.innerHTML = '<div class="spinner-btn-interno"></div> Embalando...';
    inputQtd.disabled = true;

    let sucessoGeral = false;
    try {
        let quantidadeRestanteDaMeta = quantidadeEnviada;
        const arrematesOrdenados = [...embalagemAgregadoEmVisualizacao.arremates_detalhe]
            .filter(arr => arr.quantidade_disponivel_para_embalar > 0)
            .sort((a, b) => a.id_arremate - b.id_arremate); // FIFO

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
        
        if (quantidadeRestanteDaMeta > 0) {
            throw new Error("Não foi possível alocar a quantidade total nos arremates de origem. Saldo inconsistente.");
        }

        await fetchFromAPI('/estoque/entrada-producao', {
            method: 'POST',
            body: JSON.stringify({
                produto_nome: embalagemAgregadoEmVisualizacao.produto,
                variante_nome: embalagemAgregadoEmVisualizacao.variante === '-' ? null : embalagemAgregadoEmVisualizacao.variante,
                quantidade_entrada: quantidadeEnviada,
                tipo_origem: "PRODUCAO_UNIDADE" // Identificador da origem
            })
        });
        mostrarPopupMensagem(`${quantidadeEnviada} unidade(s) embalada(s) e enviada(s) para o estoque!`, 'sucesso');
        sucessoGeral = true;
        
        // Após sucesso, limpar e voltar para a lista
        todosArrematesRegistradosCache = []; // Força recarga dos arremates na próxima vez
        await calcularEAgruparProntosParaEmbalar(); // Recalcula os agregados globais
        window.location.hash = ''; // Dispara handleHashChangeEmbalagem para mostrar a lista

    } catch (error) {
        console.error('[embalarUnidade] Erro:', error);
        mostrarPopupMensagem(`Falha ao embalar unidade: ${error.message}`, 'erro');
    } finally {
        operacaoEmAndamento.delete('embalarUnidade');
        if (document.body.contains(btnEmbalar)) { // Verifica se o botão ainda está no DOM
            btnEmbalar.innerHTML = originalButtonHTML;
             // A reabilitação do botão e input dependerá se a view será recarregada ou não
            if (!sucessoGeral && document.body.contains(inputQtd)) {
                inputQtd.disabled = false;
                // Reabilita o botão se ainda houver o que embalar e tiver permissão
                const podeEmbalar = parseInt(inputQtd.max) > 0 && permissoes.includes('lancar-embalagem');
                btnEmbalar.disabled = !podeEmbalar || (parseInt(inputQtd.value) || 0) <=0 ;
            } else if (sucessoGeral) {
                // Se sucesso, a navegação para #hash='' vai recarregar a lista e a tela de detalhe não estará visível
            }
        }
    }
}

async function montarKits() {
    if (!embalagemAgregadoEmVisualizacao || operacaoEmAndamento.has('montarKits')) return;

    const selectKitEl = document.getElementById('kitsListNova').querySelector('button.active');
    const selectVariacaoKitEl = document.getElementById('kitVariacoesNova');
    const inputQtdKitsEl = document.getElementById('qtdEnviarKitsNova');
    const btnMontarEl = document.getElementById('btnMontarEnviarKitsEstoque');

    if (!selectKitEl || !selectVariacaoKitEl.value || !inputQtdKitsEl.value) {
        mostrarPopupMensagem('Selecione o kit, a variação do kit e a quantidade.', 'aviso');
        return;
    }
    const nomeKitProduto = selectKitEl.textContent;
    const variacaoKitProduto = selectVariacaoKitEl.value;
    const qtdKitsParaEnviar = parseInt(inputQtdKitsEl.value);
    const maxKitsMontaveis = parseInt(document.getElementById('qtdDisponivelKitsNova').textContent) || 0;

    if (isNaN(qtdKitsParaEnviar) || qtdKitsParaEnviar <= 0 || qtdKitsParaEnviar > maxKitsMontaveis) {
        mostrarPopupMensagem('Quantidade de kits inválida ou excede o máximo montável.', 'erro');
        return;
    }

    operacaoEmAndamento.add('montarKits');
    const originalButtonHTML = btnMontarEl.innerHTML;
    btnMontarEl.disabled = true;
    btnMontarEl.innerHTML = '<div class="spinner-btn-interno"></div> Montando Kits...';
    document.querySelectorAll('#kitsListNova button').forEach(b => b.disabled = true);
    selectVariacaoKitEl.disabled = true;
    inputQtdKitsEl.disabled = true;

    let sucessoGeral = false;
    try {
        const kitSelecionadoObj = todosOsProdutosCadastrados.find(p => p.nome === nomeKitProduto && p.is_kit);
        const variacaoDoKitObj = kitSelecionadoObj?.grade?.find(g => g.variacao === variacaoKitProduto);
        const composicaoDoKitSelecionado = variacaoDoKitObj?.composicao;

        if (!composicaoDoKitSelecionado || composicaoDoKitSelecionado.length === 0) {
            throw new Error('Composição do kit não encontrada ou vazia.');
        }

        const componentesParaPayload = [];
        for (const itemCompDef of composicaoDoKitSelecionado) {
            const nomeComp = itemCompDef.produto;
            const varComp = itemCompDef.variacao || '-';
            const qtdNecPorKit = parseInt(itemCompDef.quantidade) || 1;
            let qtdTotalCompNec = qtdKitsParaEnviar * qtdNecPorKit;

            // Encontra o agregado do componente para pegar seus arremates_detalhe
            const agregadoDoComponente = produtosAgregadosParaEmbalarGlobal.find(
                agg => agg.produto === nomeComp && (agg.variante || '-') === varComp
            );
            if (!agregadoDoComponente) throw new Error(`Componente ${nomeComp} (${varComp}) não encontrado nos itens disponíveis para embalar.`);

            const arrematesDisponiveisDoComponente = [...agregadoDoComponente.arremates_detalhe]
                .filter(arr => arr.quantidade_disponivel_para_embalar > 0)
                .sort((a, b) => a.id_arremate - b.id_arremate);

            for (const arremateComp of arrematesDisponiveisDoComponente) {
                if (qtdTotalCompNec <= 0) break;
                const qtdUsarDesteArremate = Math.min(qtdTotalCompNec, arremateComp.quantidade_disponivel_para_embalar);
                if (qtdUsarDesteArremate > 0) {
                    componentesParaPayload.push({
                        id_arremate: arremateComp.id_arremate,
                        produto: arremateComp.produto,
                        variante: arremateComp.variante === '-' ? null : arremateComp.variante,
                        quantidade_usada: qtdUsarDesteArremate
                    });
                    qtdTotalCompNec -= qtdUsarDesteArremate;
                }
            }
            if (qtdTotalCompNec > 0) {
                throw new Error(`Saldo insuficiente para o componente ${nomeComp} (${varComp}). Faltam ${qtdTotalCompNec}.`);
            }
        }

        const payloadAPI = {
            kit_nome: nomeKitProduto,
            kit_variante: variacaoKitProduto === '-' ? null : variacaoKitProduto,
            quantidade_kits_montados: qtdKitsParaEnviar,
            componentes_consumidos_de_arremates: componentesParaPayload
        };
        await fetchFromAPI('/kits/montar', { method: 'POST', body: JSON.stringify(payloadAPI) });
        mostrarPopupMensagem(`${qtdKitsParaEnviar} kit(s) montado(s) e enviado(s) para estoque!`, 'sucesso');
        sucessoGeral = true;

        todosArrematesRegistradosCache = [];
        await calcularEAgruparProntosParaEmbalar();
        window.location.hash = '';

    } catch (error) {
        console.error('[montarKits] Erro:', error);
        mostrarPopupMensagem(`Erro ao montar kits: ${error.message}`, 'erro');
    } finally {
        operacaoEmAndamento.delete('montarKits');
         if (document.body.contains(btnMontarEl)) {
            btnMontarEl.innerHTML = originalButtonHTML;
            if (!sucessoGeral) { // Reabilita tudo para nova tentativa se falhou
                document.querySelectorAll('#kitsListNova button').forEach(b => b.disabled = false);
                if(document.body.contains(selectVariacaoKitEl)) selectVariacaoKitEl.disabled = false;
                if(document.body.contains(inputQtdKitsEl)) inputQtdKitsEl.disabled = false;
                // Reabilita o botão de montar se ainda for possível
                atualizarEstadoBotaoMontarKitNova();
            }
        }
    }
}

// --- Funções Auxiliares de Kit (copiadas e adaptadas com sufixo Nova) ---
async function temKitsDisponiveis(produto, variante) {
    if (todosOsProdutosCadastrados.length === 0) {
        todosOsProdutosCadastrados = await obterProdutosDoStorage();
    }
    const kits = todosOsProdutosCadastrados.filter(p => p.is_kit === true);
    if (kits.length === 0) return false;

    const produtoLower = produto.toLowerCase();
    const varAtualLower = (variante === '-' ? '' : variante).toLowerCase();

    for (const kit of kits) {
        if (kit.grade && Array.isArray(kit.grade)) {
            for (const g of kit.grade) {
                if (g.composicao && Array.isArray(g.composicao)) {
                    for (const c of g.composicao) {
                        const compProdutoNome = (c.produto || kit.nome);
                        const compProdutoNomeLower = compProdutoNome.toLowerCase();
                        const compVariacao = (c.variacao === '-' ? '' : (c.variacao || '')); // Trata null/undefined para ''
                        const compVariacaoLower = compVariacao.toLowerCase();
                        if (compProdutoNomeLower === produtoLower && compVariacaoLower === varAtualLower) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

async function carregarKitsDisponiveisNova(produtoBase, varianteBase) {
    if (todosOsProdutosCadastrados.length === 0) {
        todosOsProdutosCadastrados = await obterProdutosDoStorage();
    }
    const kitsListEl = document.getElementById('kitsListNova');
    const kitVariacaoWrapper = document.getElementById('kitVariacaoComposicaoWrapperNova');
    const kitFooter = document.getElementById('kitFooterNova');

    if (!kitsListEl || !kitVariacaoWrapper || !kitFooter) {
        console.error("Elementos da aba kit não encontrados em carregarKitsDisponiveisNova");
        return;
    }
    kitsListEl.innerHTML = '<p>Buscando kits...</p>';
    kitVariacaoWrapper.style.display = 'none';
    kitFooter.style.display = 'none';


    const varBaseLower = (varianteBase === '-' ? '' : varianteBase).toLowerCase();
    const kitsFiltrados = todosOsProdutosCadastrados.filter(kit =>
        kit.is_kit && kit.grade?.some(g =>
            g.composicao?.some(item =>
                (item.produto || kit.nome).toLowerCase() === produtoBase.toLowerCase() &&
                (item.variacao === '-' ? '' : (item.variacao || '')).toLowerCase() === varBaseLower
            )
        )
    );

    if (kitsFiltrados.length === 0) {
        kitsListEl.innerHTML = '<p style="font-style:italic; color: var(--op-cor-cinza-texto);">Nenhum kit cadastrado utiliza este item base.</p>';
        return;
    }
    kitsListEl.innerHTML = ''; // Limpa "Buscando..."

    kitsFiltrados.forEach(kit => {
        const button = document.createElement('button');
        button.className = 'ep-btn'; // Reutiliza classe de botão de filtro
        button.textContent = kit.nome;
        button.addEventListener('click', (e) => {
            document.querySelectorAll('#kitsListNova button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            kitVariacaoWrapper.style.display = 'block'; // Mostra a parte de seleção de variação
            carregarVariacoesKitNova(kit.nome, produtoBase, varianteBase);
        });
        kitsListEl.appendChild(button);
    });
    // Opcional: clicar no primeiro kit automaticamente
    // if (kitsListEl.children.length > 0) kitsListEl.children[0].click();
}

async function carregarVariacoesKitNova(nomeKit, produtoBase, varianteBase) {
    const kitVariacoesSelect = document.getElementById('kitVariacoesNova');
    const kitTableContainer = document.getElementById('kitTableContainerNova');
    const kitFooter = document.getElementById('kitFooterNova');
    const kitErrorMessage = document.getElementById('kitErrorMessageNova');

    if (!kitVariacoesSelect || !kitTableContainer || !kitFooter || !kitErrorMessage) return;

    kitVariacoesSelect.innerHTML = '<option value="">Carregando variações...</option>';
    kitTableContainer.style.display = 'none';
    kitFooter.style.display = 'none';
    kitErrorMessage.classList.add('hidden');

    const kit = todosOsProdutosCadastrados.find(p => p.is_kit && p.nome === nomeKit);
    if (!kit || !kit.grade) {
        kitVariacoesSelect.innerHTML = '<option value="">Erro: Kit não encontrado</option>';
        kitErrorMessage.textContent = 'Definição do kit não encontrada.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    const varBaseLower = (varianteBase === '-' ? '' : varianteBase).toLowerCase();
    const variacoesFiltradasDoKit = kit.grade.filter(g =>
        g.composicao?.some(item =>
            (item.produto || kit.nome).toLowerCase() === produtoBase.toLowerCase() &&
            (item.variacao === '-' ? '' : (item.variacao || '')).toLowerCase() === varBaseLower
        )
    );

    if (variacoesFiltradasDoKit.length === 0) {
        kitVariacoesSelect.innerHTML = '<option value="">Nenhuma variação deste kit utiliza o item base.</option>';
        kitErrorMessage.textContent = 'Nenhuma variação deste kit corresponde ao item base selecionado.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    kitVariacoesSelect.innerHTML = '<option value="">Selecione a Variação do Kit</option>';
    variacoesFiltradasDoKit.forEach(grade => {
        kitVariacoesSelect.add(new Option(grade.variacao || 'Padrão', grade.variacao)); // Armazena o valor real da variação
    });

    // Remove listener antigo para evitar duplicação
    const newSelect = kitVariacoesSelect.cloneNode(true);
    kitVariacoesSelect.parentNode.replaceChild(newSelect, kitVariacoesSelect);
    newSelect.addEventListener('change', (e) => {
        const selVariacaoKit = e.target.value;
        if (selVariacaoKit) {
            kitTableContainer.style.display = 'block';
            kitFooter.style.display = 'block';
            kitErrorMessage.classList.add('hidden');
            carregarTabelaKitNova(nomeKit, selVariacaoKit);
        } else {
            kitTableContainer.style.display = 'none';
            kitFooter.style.display = 'none';
        }
    });
}

async function carregarTabelaKitNova(kitNome, variacaoKitSelecionada) {
    const kitTableBody = document.getElementById('kitTableBodyNova');
    const qtdDisponivelKitsSpan = document.getElementById('qtdDisponivelKitsNova');
    const qtdEnviarKitsInput = document.getElementById('qtdEnviarKitsNova');
    const kitEstoqueBtn = document.getElementById('btnMontarEnviarKitsEstoque');
    const kitErrorMessage = document.getElementById('kitErrorMessageNova');
    
    if(!kitTableBody || !qtdDisponivelKitsSpan || !qtdEnviarKitsInput || !kitEstoqueBtn || !kitErrorMessage) {
        console.error("Elementos da tabela de kit não encontrados em carregarTabelaKitNova");
        return;
    }

    kitErrorMessage.classList.add('hidden');
    kitTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;"><div class="spinner">Analisando componentes...</div></td></tr>`;
    qtdEnviarKitsInput.disabled = true;
    kitEstoqueBtn.disabled = true;
    qtdDisponivelKitsSpan.textContent = '0';

    const kitSelecionado = todosOsProdutosCadastrados.find(p => p.nome === kitNome && p.is_kit === true);
    const variacaoDoKitObj = kitSelecionado?.grade?.find(g => g.variacao === variacaoKitSelecionada); // variacaoKitSelecionada já é o valor correto
    const composicaoDoKit = variacaoDoKitObj?.composicao;

    if (!composicaoDoKit || composicaoDoKit.length === 0) {
        kitErrorMessage.textContent = 'Composição não definida para esta variação do kit.';
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:red;">${kitErrorMessage.textContent}</td></tr>`;
        return;
    }
    kitTableBody.innerHTML = '';

    let menorQuantidadeKitsMontaveis = Infinity;
    let todosComponentesDisponiveisParaUmKit = true;

    for (const itemComponente of composicaoDoKit) {
        const nomeProdutoComponente = itemComponente.produto; // Nome do produto na composição do kit
        const varianteComponente = itemComponente.variacao || '-'; // Variante do produto na composição
        const quantidadeNecessariaPorKit = parseInt(itemComponente.quantidade) || 1;
        let qtdDisponivelTotalComponente = 0;

        const agregadoComponente = produtosAgregadosParaEmbalarGlobal.find(
            agg => agg.produto === nomeProdutoComponente && (agg.variante || '-') === varianteComponente
        );
        if (agregadoComponente) {
            qtdDisponivelTotalComponente = agregadoComponente.total_quantidade_disponivel_para_embalar;
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${nomeProdutoComponente} ${varianteComponente !== '-' ? `(${varianteComponente})` : ''}</td>
            <td style="text-align:center;">${quantidadeNecessariaPorKit}</td>
            <td style="text-align:center;">
                <input type="number" class="op-input readonly ep-kit-componente-disponivel-input" value="${qtdDisponivelTotalComponente}" readonly style="background:transparent; border:none; box-shadow:none;">
            </td>
        `;
        if (qtdDisponivelTotalComponente < quantidadeNecessariaPorKit) {
            tr.classList.add('item-insuficiente'); // Adicione estilo para esta classe (texto vermelho, etc.)
            todosComponentesDisponiveisParaUmKit = false;
        }
        kitTableBody.appendChild(tr);

        if (quantidadeNecessariaPorKit > 0) {
            menorQuantidadeKitsMontaveis = Math.min(menorQuantidadeKitsMontaveis, Math.floor(qtdDisponivelTotalComponente / quantidadeNecessariaPorKit));
        } else {
            menorQuantidadeKitsMontaveis = 0; // Evita divisão por zero e indica problema na config do kit
        }
    }
    const maxKitsMontaveisFinal = (todosComponentesDisponiveisParaUmKit && composicaoDoKit.length > 0 && menorQuantidadeKitsMontaveis !== Infinity) ? menorQuantidadeKitsMontaveis : 0;
    qtdDisponivelKitsSpan.textContent = maxKitsMontaveisFinal;
    
    if (maxKitsMontaveisFinal <= 0 && composicaoDoKit.length > 0) {
        kitErrorMessage.textContent = 'Componentes insuficientes para montar este kit.';
        kitErrorMessage.classList.remove('hidden');
    }
    qtdEnviarKitsInput.value = maxKitsMontaveisFinal > 0 ? "1" : "0"; // Sugere 1 se possível, senão 0
    qtdEnviarKitsInput.max = maxKitsMontaveisFinal;
    qtdEnviarKitsInput.disabled = maxKitsMontaveisFinal <= 0;
    
    atualizarEstadoBotaoMontarKitNova(); // Atualiza o estado do botão com base nos cálculos
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
        obterProdutosDoStorage().then(p => {
            todosOsProdutosCadastrados = p;
            console.log(`[inicializarDadosEViewsEmbalagem] ${todosOsProdutosCadastrados.length} produtos carregados.`);
        }),
        buscarArrematesCompletos() // Carrega todos os arremates no cache global
    ]);
    // Após os dados base, processa a view correta
    await handleHashChangeEmbalagem();
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('embalagem-de-produtos.html', ['acesso-embalagem-de-produtos']);
        if (!auth) {
            // Se verificarAutenticacao já redireciona, não precisa fazer de novo aqui
            // Apenas um return para parar a execução
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
                    p.classList.remove('active'); // Para CSS
                    p.style.display = 'none';    // Para JS
                });

                tabBtn.classList.add('active');
                const activePanel = document.getElementById(`${tabId}-tab-nova`);
                if (activePanel) {
                    activePanel.classList.add('active');
                    activePanel.style.display = 'block';
                }
                
                if (tabId === 'kit' && embalagemAgregadoEmVisualizacao) {
                    await carregarKitsDisponiveisNova(embalagemAgregadoEmVisualizacao.produto, embalagemAgregadoEmVisualizacao.variante);
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

        const inputQtdEnviarKitsNova = document.getElementById('qtdEnviarKitsNova');
        if(inputQtdEnviarKitsNova) {
            inputQtdEnviarKitsNova.addEventListener('input', atualizarEstadoBotaoMontarKitNova);
        }

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