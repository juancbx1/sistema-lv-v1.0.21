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
    for (const arremate of todosArrematesRegistradosCache) { // todosArrematesRegistradosCache vem de GET /api/arremates
        const quantidadeTotal = parseInt(arremate.quantidade_arrematada) || 0;
        const quantidadeJaEmbalada = parseInt(arremate.quantidade_ja_embalada) || 0;
        const saldoParaEmbalar = quantidadeTotal - quantidadeJaEmbalada;

        if (saldoParaEmbalar > 0) {
            // AQUI ESTÁ A CORREÇÃO: Passamos o produto_id para o próximo objeto
            arrematesComSaldoParaEmbalar.push({
                id_arremate: arremate.id,
                op_numero_origem: arremate.op_numero,
                produto: arremate.produto,
                produto_id: arremate.produto_id,
                variante: arremate.variante || '-',
                quantidade_disponivel_para_embalar: saldoParaEmbalar,
                data_lancamento: arremate.data_lancamento
            });
        }
    }

    const aggregatedMap = new Map();
    arrematesComSaldoParaEmbalar.forEach(arremateComSaldo => {
        const produtoKey = `${arremateComSaldo.produto_id}|${arremateComSaldo.variante}`;
        
        if (!aggregatedMap.has(produtoKey)) {
            aggregatedMap.set(produtoKey, {
                produto: arremateComSaldo.produto,
                produto_id: arremateComSaldo.produto_id,
                variante: arremateComSaldo.variante,
                total_quantidade_disponivel_para_embalar: 0,
                arremates_detalhe: [],
                data_lancamento_mais_antiga: arremateComSaldo.data_lancamento // Inicializa com a data do primeiro arremate
            });
        }
        
        const aggregatedItem = aggregatedMap.get(produtoKey);
        aggregatedItem.total_quantidade_disponivel_para_embalar += arremateComSaldo.quantidade_disponivel_para_embalar;
        aggregatedItem.arremates_detalhe.push(arremateComSaldo);

        // Atualiza a data de lançamento mais antiga se a atual for mais antiga
        if (arremateComSaldo.data_lancamento) {
            const dataAtualDoArremate = new Date(arremateComSaldo.data_lancamento);
            const dataMaisAntigaRegistrada = new Date(aggregatedItem.data_lancamento_mais_antiga);
            if (dataAtualDoArremate < dataMaisAntigaRegistrada) {
                aggregatedItem.data_lancamento_mais_antiga = arremateComSaldo.data_lancamento;
            }
        }
    });
    
    produtosAgregadosParaEmbalarGlobal = Array.from(aggregatedMap.values());
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
    // A classe principal do card será definida abaixo, junto com o status.

    const produtoCadastrado = todosOsProdutosCadastrados.find(p => p.nome === item.produto);
    let imagemSrc = '/img/placeholder-image.png'; // Imagem padrão
    let skuProduto = 'N/A'; // SKU Padrão

    if (produtoCadastrado) {
        if (item.variante && item.variante !== '-') {
            const gradeInfo = produtoCadastrado.grade?.find(g => g.variacao === item.variante);
            if (gradeInfo) {
                imagemSrc = gradeInfo.imagem || produtoCadastrado.imagem || '/img/placeholder-image.png';
                skuProduto = gradeInfo.sku || produtoCadastrado.sku || 'N/A'; // Pega SKU da grade ou do produto principal
            } else {
                imagemSrc = produtoCadastrado.imagem || '/img/placeholder-image.png';
                skuProduto = produtoCadastrado.sku || 'N/A';
            }
        } else {
            imagemSrc = produtoCadastrado.imagem || '/img/placeholder-image.png';
            skuProduto = produtoCadastrado.sku || 'N/A'; // SKU do produto principal para itens sem variação ou padrão
        }
    }
     const imgElement = `<img src="${imagemSrc}" alt="${item.produto}" class="ep-consulta-card-img" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">`;
    card.className = `ep-consulta-card status-pronto-para-embalar`;

    // Lógica para formatar "dias esperando" usando item.data_lancamento_mais_antiga
    let diasEsperandoTexto = '-';
    if (item.data_lancamento_mais_antiga) { // << USA A NOVA PROPRIEDADE
        const dataAntiga = new Date(item.data_lancamento_mais_antiga);
        const hoje = new Date();
        
        // Zera as horas para comparar apenas dias completos
        const inicioDoDiaDataAntiga = new Date(dataAntiga.getFullYear(), dataAntiga.getMonth(), dataAntiga.getDate());
        const inicioDoDiaHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

        const diffTime = Math.abs(inicioDoDiaHoje - inicioDoDiaDataAntiga);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Diferença em dias
        
        if (diffDays === 0) {
            diasEsperandoTexto = 'Hoje';
        } else if (diffDays === 1) {
            diasEsperandoTexto = '1 dia';
        } else {
            diasEsperandoTexto = `${diffDays} dias`;
        }
    }

    card.innerHTML = `
        ${imgElement}
        <div class="ep-consulta-card-info">
            <h3>${item.produto}</h3>
            <p>${item.variante !== '-' ? item.variante : 'Padrão'}</p>
            <p class="ep-sku-info">SKU: ${skuProduto}</p>
        </div>
        <div class="ep-consulta-card-dados">
            <div class="ep-dado-bloco">
                <span class="label">Disponível</span>
                <span class="valor">${item.total_quantidade_disponivel_para_embalar}</span>
            </div>
            <div class="ep-dado-bloco">
                <span class="label">Aguardando</span>
                <span class="valor">${diasEsperandoTexto}</span>
            </div>
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
    localStorage.setItem('embalarDetalheAtual', JSON.stringify(embalagemAgregadoEmVisualizacao));
    window.location.hash = '#embalar-produto';
}

async function carregarDetalhesEmbalagemView(agregado) {
    console.log("[carregarDetalhesEmbalagemView] INÍCIO. Agregado:", JSON.parse(JSON.stringify(agregado)));

    document.getElementById('embalagemListViewNova').style.display = 'none';
    const embalarDetalheViewEl = document.getElementById('embalarDetalheView');
    if (embalarDetalheViewEl) {
        embalarDetalheViewEl.style.display = 'block';
    } else {
        console.error("ERRO CRÍTICO: View #embalarDetalheView não encontrada!");
        mostrarPopupMensagem("Erro ao carregar view de detalhe.", "erro");
        return;
    }

    embalagemAgregadoEmVisualizacao = agregado;

    // --- Preenchimento do CABEÇALHO da view de detalhe ---
    const tituloEl = document.getElementById('embalagemDetalheTitulo');
    if (tituloEl) tituloEl.textContent = `Embalar: ${agregado.produto}`;

    const subTituloEl = document.getElementById('embalagemDetalheSubTitle');
    if (subTituloEl) subTituloEl.textContent = agregado.variante !== '-' ? `Variação: ${agregado.variante}` : 'Padrão';

    const saldoTotalHeaderEl = document.getElementById('embalagemDetalheSaldoTotal');
    if (saldoTotalHeaderEl) {
        saldoTotalHeaderEl.textContent = agregado.total_quantidade_disponivel_para_embalar;
    } else {
        console.error("Elemento #embalagemDetalheSaldoTotal não encontrado!");
    }

    const produtoCadEmb = todosOsProdutosCadastrados.find(p => p.id == agregado.produto_id);
    let imgDetalheEmbSrc = '/img/placeholder-image.png';
    if (produtoCadEmb) {
        if (agregado.variante && agregado.variante !== '-') {
            const gradeDetEmb = produtoCadEmb.grade?.find(g => g.variacao === agregado.variante);
            imgDetalheEmbSrc = gradeDetEmb?.imagem || produtoCadEmb.imagem || '/img/placeholder-image.png';
        } else if (produtoCadEmb.imagem) {
            imgDetalheEmbSrc = produtoCadEmb.imagem;
        }
    }
    const thumbnailDetalheEl = document.getElementById('embalagemDetalheThumbnail');
    if (thumbnailDetalheEl) {
        thumbnailDetalheEl.innerHTML = `<img src="${imgDetalheEmbSrc}" alt="${agregado.produto}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">`;
    } else {
        console.error("Elemento #embalagemDetalheThumbnail não encontrado!");
    }
    
    // --- Reset e Configuração da Aba "Embalar Unidade" (Listeners são reconfigurados aqui) ---
    const inputQtdUnidadeEl = document.getElementById('inputQuantidadeEmbalarUnidade');
    const btnEmbalarUnidadeEl = document.getElementById('btnEmbalarEnviarEstoqueUnidade');
    const feedbackSaldoUnidadeEl = document.getElementById('feedbackSaldoRestanteUnidade');
    const observacaoInputUnidadeEl = document.getElementById('observacaoEmbalagemUnidade');

    if(inputQtdUnidadeEl) {
        inputQtdUnidadeEl.value = ''; 
        inputQtdUnidadeEl.max = agregado.total_quantidade_disponivel_para_embalar;
        inputQtdUnidadeEl.disabled = false; 
    }
    if(btnEmbalarUnidadeEl) {
        btnEmbalarUnidadeEl.disabled = true; 
        btnEmbalarUnidadeEl.innerHTML = '<i class="fas fa-box-open"></i> EMBALAR E ESTOCAR UNIDADES';
    }
    if(observacaoInputUnidadeEl) observacaoInputUnidadeEl.value = '';
    if(feedbackSaldoUnidadeEl) feedbackSaldoUnidadeEl.innerHTML = ' ';

    const btnEmbalarTudoUnidadeEl = document.getElementById('btnEmbalarTudoUnidade');
    if (btnEmbalarTudoUnidadeEl && inputQtdUnidadeEl) {
        const novoBtn = btnEmbalarTudoUnidadeEl.cloneNode(true);
        if(btnEmbalarTudoUnidadeEl.parentNode) btnEmbalarTudoUnidadeEl.parentNode.replaceChild(novoBtn, btnEmbalarTudoUnidadeEl);
        novoBtn.addEventListener('click', () => {
            if (embalagemAgregadoEmVisualizacao && inputQtdUnidadeEl) {
                inputQtdUnidadeEl.value = embalagemAgregadoEmVisualizacao.total_quantidade_disponivel_para_embalar;
                inputQtdUnidadeEl.dispatchEvent(new Event('input'));
            }
        });
    }

    const acoesRapidasUnidadeContainerEl = document.querySelector('#unidade-tab-nova .ep-acoes-rapidas-qtd');
    if (acoesRapidasUnidadeContainerEl && inputQtdUnidadeEl) {
        const novoContainer = acoesRapidasUnidadeContainerEl.cloneNode(true);
        if(acoesRapidasUnidadeContainerEl.parentNode) acoesRapidasUnidadeContainerEl.parentNode.replaceChild(novoContainer, acoesRapidasUnidadeContainerEl);
        novoContainer.addEventListener('click', (event) => {
            const targetButton = event.target.closest('.ep-btn-outline-pequeno');
            if (targetButton && targetButton.dataset.qtdAdd && inputQtdUnidadeEl) {
                const qtdAtual = parseInt(inputQtdUnidadeEl.value) || 0;
                const qtdAdd = parseInt(targetButton.dataset.qtdAdd);
                let novaQtd = qtdAtual + qtdAdd;
                const maxQtd = parseInt(inputQtdUnidadeEl.max) || 0;
                novaQtd = Math.max(0, Math.min(novaQtd, maxQtd)); 
                inputQtdUnidadeEl.value = novaQtd;
                inputQtdUnidadeEl.dispatchEvent(new Event('input')); 
            }
        });
    }

    if (inputQtdUnidadeEl && btnEmbalarUnidadeEl && feedbackSaldoUnidadeEl) {
        inputQtdUnidadeEl.oninput = () => { // Este oninput é simples e pode ser reatribuído
            const qtdDigitada = parseInt(inputQtdUnidadeEl.value) || 0;
            const maxDisponivel = agregado.total_quantidade_disponivel_para_embalar || 0;
            const podeEmbalarPermissao = permissoes.includes('lancar-embalagem');
            btnEmbalarUnidadeEl.disabled = !(qtdDigitada > 0 && qtdDigitada <= maxDisponivel && podeEmbalarPermissao);
            if (qtdDigitada > 0 && qtdDigitada <= maxDisponivel) {
                const restante = maxDisponivel - qtdDigitada;
                feedbackSaldoUnidadeEl.textContent = `Restarão ${restante} unidade(s) para embalar.`;
                feedbackSaldoUnidadeEl.style.color = 'var(--ep-cor-cinza-texto-secundario)';
            } else if (qtdDigitada > maxDisponivel) {
                feedbackSaldoUnidadeEl.textContent = `Quantidade excede o disponível (${maxDisponivel}).`;
                feedbackSaldoUnidadeEl.style.color = 'var(--ep-cor-vermelho-perigo)';
            } else {
                feedbackSaldoUnidadeEl.innerHTML = ' ';
                feedbackSaldoUnidadeEl.style.color = 'var(--ep-cor-cinza-texto-secundario)'; 
            }
        };
        inputQtdUnidadeEl.dispatchEvent(new Event('input')); // Estado inicial
    }

    // --- APENAS RESET VISUAL da Aba "Montar e Embalar Kit" ---
    // Os listeners de interação serão configurados UMA VEZ no DOMContentLoaded.
    console.log("[carregarDetalhesEmbalagemView] Resetando UI da Aba Kit...");
    const kitTabButtonEl = document.querySelector('#embalarDetalheView .ep-tabs button[data-tab="kit"]');
    const kitVariacaoWrapperEl = document.getElementById('kitVariacaoWrapperNova');
    const kitComposicaoWrapperEl = document.getElementById('kitComposicaoWrapperNova');
    const kitAcaoMontagemWrapperEl = document.getElementById('kitAcaoMontagemWrapperNova');
    const kitsListEl = document.getElementById('kitsListNova');
    const kitVariacoesSelectEl = document.getElementById('kitVariacoesNova');
    const kitImagemPreviewImgEl = document.querySelector('#kitImagemSelecionadoNova img');
    const kitTableBodyEl = document.getElementById('kitTableBodyNova');
    const kitErrorMessageEl = document.getElementById('kitErrorMessageNova');
    const observacaoMontagemKitInputEl = document.getElementById('observacaoMontagemKit');
    const qtdDispKitsSpanEl = document.getElementById('qtdDisponivelKitsNova'); // Renomeado para consistência
    const qtdEnvKitsInputEl = document.getElementById('qtdEnviarKitsNova');     // Renomeado para consistência
    const btnMontarEstoqueKitEl = document.getElementById('btnMontarEnviarKitsEstoque'); // Renomeado para consistência

    if (kitsListEl) kitsListEl.innerHTML = `<p class="ep-placeholder-kits">Selecione a aba "Montar Kit" para carregar...</p>`;
    if (kitVariacoesSelectEl) { kitVariacoesSelectEl.innerHTML = '<option value="">-- Selecione uma variação --</option>'; kitVariacoesSelectEl.disabled = true; }
    if (kitImagemPreviewImgEl) kitImagemPreviewImgEl.src = '/img/placeholder-image.png';
    if (kitTableBodyEl) kitTableBodyEl.innerHTML = '';
    if (kitErrorMessageEl) kitErrorMessageEl.classList.add('hidden');
    if(qtdDispKitsSpanEl) qtdDispKitsSpanEl.textContent = '0';
    if(qtdEnvKitsInputEl) { qtdEnvKitsInputEl.value = '0'; qtdEnvKitsInputEl.disabled = true; }
    if (observacaoMontagemKitInputEl) observacaoMontagemKitInputEl.value = '';
    if(btnMontarEstoqueKitEl) btnMontarEstoqueKitEl.disabled = true;
    
    if (kitVariacaoWrapperEl) kitVariacaoWrapperEl.style.display = 'none';
    if (kitComposicaoWrapperEl) kitComposicaoWrapperEl.style.display = 'none';
    if (kitAcaoMontagemWrapperEl) kitAcaoMontagemWrapperEl.style.display = 'none';

    const temKits = await temKitsDisponiveis(agregado.produto_id, agregado.variante);
    const podeMontarKitPermissao = permissoes.includes('montar-kit');
    if (kitTabButtonEl) {
        kitTabButtonEl.style.display = (temKits && podeMontarKitPermissao) ? 'inline-flex' : 'none';
    }
    
    // Define a aba "Unidade" como ativa por padrão ao carregar a view de detalhe
    const unidadeTabButtonEl = document.querySelector('#embalarDetalheView .ep-tabs button[data-tab="unidade"]');
    const unidadePanelEl = document.getElementById('unidade-tab-nova');
    
    document.querySelectorAll('#embalarDetalheView .ep-tabs .ep-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#embalarDetalheView .ep-tab-panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });

    if (unidadeTabButtonEl) unidadeTabButtonEl.classList.add('active');
    if (unidadePanelEl) {
        unidadePanelEl.classList.add('active');
        unidadePanelEl.style.display = 'block';
    }
    console.log("[carregarDetalhesEmbalagemView] FIM.");
}


// --- Funções para Embalar Unidade e Montar Kit (lógica de envio) ---
async function embalarUnidade() {
    if (!embalagemAgregadoEmVisualizacao || operacaoEmAndamento.has('embalarUnidade')) return;

    const inputQtd = document.getElementById('inputQuantidadeEmbalarUnidade');
    const btnEmbalar = document.getElementById('btnEmbalarEnviarEstoqueUnidade');
    const observacaoInput = document.getElementById('observacaoEmbalagemUnidade'); // Pega o campo de observação
    const quantidadeEnviada = parseInt(inputQtd.value);
    const observacao = observacaoInput ? observacaoInput.value.trim() : ''; // Pega o valor da observação

    if (isNaN(quantidadeEnviada) || quantidadeEnviada <= 0 || quantidadeEnviada > embalagemAgregadoEmVisualizacao.total_quantidade_disponivel_para_embalar) {
        mostrarPopupMensagem('Quantidade para embalar inválida.', 'erro');
        return;
    }

    operacaoEmAndamento.add('embalarUnidade');
    btnEmbalar.disabled = true;
    btnEmbalar.innerHTML = '<div class="spinner-btn-interno"></div> Processando...';
    inputQtd.disabled = true;
    if (observacaoInput) observacaoInput.disabled = true; // Desabilita observação durante envio

    try {
        let quantidadeRestanteDaMeta = quantidadeEnviada;
        const arrematesOrdenados = [...embalagemAgregadoEmVisualizacao.arremates_detalhe]
            .filter(arr => arr.quantidade_disponivel_para_embalar > 0)
            .sort((a, b) => a.id_arremate - b.id_arremate);

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
            throw new Error("Não foi possível alocar a quantidade total nos arremates. Saldo inconsistente.");
        }
        
        const payloadEstoque = {
            produto_id: embalagemAgregadoEmVisualizacao.produto_id,
            variante_nome: embalagemAgregadoEmVisualizacao.variante === '-' ? null : embalagemAgregadoEmVisualizacao.variante,
            quantidade_entrada: quantidadeEnviada,
            id_arremate_origem: arrematesOrdenados[0]?.id_arremate || null,
            observacao: observacao || null // << ADICIONA OBSERVAÇÃO AO PAYLOAD
        };
        
        // A API /estoque/entrada-producao precisa ser ajustada para receber e salvar 'observacao'
        await fetchFromAPI('/estoque/entrada-producao', {
            method: 'POST',
            body: JSON.stringify(payloadEstoque)
        });
        
        mostrarPopupMensagem(`${quantidadeEnviada} unidade(s) embalada(s) com sucesso!`, 'sucesso');
        
        // Resetar campos após sucesso (opcional, pois vai para outra tela)
        inputQtd.value = '';
        if (observacaoInput) observacaoInput.value = '';
        const feedbackSaldoEl = document.getElementById('feedbackSaldoRestanteUnidade');
        if (feedbackSaldoEl) feedbackSaldoEl.innerHTML = ' ';

        window.location.hash = ''; // Volta para a lista principal

    } catch (error) {
        console.error('[embalarUnidade] Erro:', error);
        mostrarPopupMensagem(`Falha ao embalar unidade: ${error.data?.details || error.message || error.message}`, 'erro');
        // Reabilita campos em caso de erro
        inputQtd.disabled = false;
        if (observacaoInput) observacaoInput.disabled = false;
        // O estado do botão de enviar será reavaliado pelo oninput se o usuário interagir novamente
    } finally {
        operacaoEmAndamento.delete('embalarUnidade');
        // Garante que o botão seja resetado mesmo se o usuário não interagir
        // O oninput do inputQtd já deve cuidar de reabilitar o btnEmbalar se as condições forem atendidas.
        // Mas, para garantir o texto, podemos fazer:
        if (btnEmbalar && !btnEmbalar.disabled) { // Se ele não foi desabilitado pelo oninput após erro
            btnEmbalar.innerHTML = '<i class="fas fa-box-open"></i> EMBALAR E ESTOCAR UNIDADES';
        }
        // Se o inputQtd foi reabilitado e tem valor, disparamos o oninput para o botão
        if (!inputQtd.disabled && inputQtd.value) {
            inputQtd.dispatchEvent(new Event('input'));
        } else if (!inputQtd.disabled && btnEmbalar) { // Se input está vazio, desabilita o botão
             btnEmbalar.disabled = true;
        }
    }
}

async function montarKits() {
    if (!embalagemAgregadoEmVisualizacao || operacaoEmAndamento.has('montarKits')) {
        console.warn('[montarKits] Operação já em andamento ou nenhum agregado em visualização.');
        return;
    }

    const kitSelecionadoBtnEl = document.querySelector('#kitsListNova button.active');
    const variacaoKitSelectEl = document.getElementById('kitVariacoesNova');
    const qtdKitsInputEl = document.getElementById('qtdEnviarKitsNova');
    const observacaoTextareaEl = document.getElementById('observacaoMontagemKit');
    const btnMontarEl = document.getElementById('btnMontarEnviarKitsEstoque');
    // Não precisamos pegar btnMontarMaximoKitsEl aqui para o fluxo principal, apenas para desabilitar

    if (!kitSelecionadoBtnEl || !variacaoKitSelectEl || !variacaoKitSelectEl.value || !qtdKitsInputEl || qtdKitsInputEl.value.trim() === '') {
        mostrarPopupMensagem('Selecione o kit, a variação e a quantidade para montar.', 'aviso');
        return;
    }

    const nomeKitProduto = kitSelecionadoBtnEl.textContent.trim();
    const variacaoKitProduto = variacaoKitSelectEl.value;
    const qtdKitsParaEnviar = parseInt(qtdKitsInputEl.value);
    const observacaoMontagem = observacaoTextareaEl ? observacaoTextareaEl.value.trim() : '';
    
    const qtdDisponivelKitsSpanEl = document.getElementById('qtdDisponivelKitsNova');
    const maxKitsMontaveis = parseInt(qtdDisponivelKitsSpanEl.textContent) || 0;

    if (isNaN(qtdKitsParaEnviar) || qtdKitsParaEnviar <= 0) {
        mostrarPopupMensagem('Quantidade de kits para montar deve ser maior que zero.', 'erro');
        return;
    }
    if (qtdKitsParaEnviar > maxKitsMontaveis) {
        mostrarPopupMensagem(`Não é possível montar ${qtdKitsParaEnviar} kit(s). Máximo disponível: ${maxKitsMontaveis}.`, 'erro');
        return;
    }

    const kitProdutoSelecionadoObj = todosOsProdutosCadastrados.find(p => p.id == kitSelecionadoBtnEl.dataset.kitId);
    if (!kitProdutoSelecionadoObj) {
        mostrarPopupMensagem(`Erro: Kit "${nomeKitProduto}" não encontrado nos dados locais.`, 'erro');
        return;
    }
    const idDoKitParaAPI = kitProdutoSelecionadoObj.id;

    operacaoEmAndamento.add('montarKits');
    const originalButtonHTML = btnMontarEl.innerHTML;
    btnMontarEl.disabled = true;
    btnMontarEl.innerHTML = '<div class="spinner-btn-interno"></div> Montando Kits...';
    
    // Desabilitar todos os controles relevantes durante a operação
    document.querySelectorAll('#kitsListNova button').forEach(b => b.disabled = true);
    if(variacaoKitSelectEl) variacaoKitSelectEl.disabled = true;
    if(qtdKitsInputEl) qtdKitsInputEl.disabled = true;
    if(observacaoTextareaEl) observacaoTextareaEl.disabled = true;
    document.querySelectorAll('#kit-tab-nova .ep-acoes-rapidas-qtd button').forEach(b => b.disabled = true);
    const btnMaximoReferencia = document.getElementById('btnMontarMaximoKits');
    if(btnMaximoReferencia) btnMaximoReferencia.disabled = true;

    let sucessoGeral = false;
    try {
        const variacaoDoKitObj = kitProdutoSelecionadoObj.grade?.find(g => g.variacao === variacaoKitProduto);
        const composicaoDoKitSelecionado = variacaoDoKitObj?.composicao;
        if (!composicaoDoKitSelecionado || composicaoDoKitSelecionado.length === 0) {
            throw new Error('Composição do kit não encontrada ou está vazia. Verifique o cadastro do kit.');
        }

        const componentesParaPayload = [];
        for (const itemCompDef of composicaoDoKitSelecionado) {
            const idComp = itemCompDef.produto_id;
            const nomeCompParaLog = itemCompDef.produto_nome || itemCompDef.produto;
            const varComp = itemCompDef.variacao === '-' ? null : (itemCompDef.variacao || null);
            const qtdNecPorKit = parseInt(itemCompDef.quantidade) || 1;
            let qtdTotalCompNec = qtdKitsParaEnviar * qtdNecPorKit;

            const agregadoDoComponente = produtosAgregadosParaEmbalarGlobal.find(
                agg => String(agg.produto_id) === String(idComp) && (agg.variante || '-') === (varComp || '-')
            );
            if (!agregadoDoComponente || agregadoDoComponente.total_quantidade_disponivel_para_embalar < qtdTotalCompNec) {
                 throw new Error(`Saldo insuficiente para componente "${nomeCompParaLog}" (${varComp || 'Padrão'}). Nec: ${qtdTotalCompNec}, Disp: ${agregadoDoComponente?.total_quantidade_disponivel_para_embalar || 0}.`);
            }

            const arrematesDisponiveisDoComponente = [...agregadoDoComponente.arremates_detalhe]
                .filter(arr => arr.quantidade_disponivel_para_embalar > 0)
                .sort((a, b) => new Date(a.data_lancamento) - new Date(b.data_lancamento)); 

            for (const arremateComp of arrematesDisponiveisDoComponente) {
                if (qtdTotalCompNec <= 0) break;
                const qtdUsarDesteArremate = Math.min(qtdTotalCompNec, arremateComp.quantidade_disponivel_para_embalar);
                if (qtdUsarDesteArremate > 0) {
                    componentesParaPayload.push({
                        id_arremate: arremateComp.id_arremate,
                        produto_id: idComp, 
                        produto_nome: nomeCompParaLog, 
                        variacao: varComp,
                        quantidade_usada: qtdUsarDesteArremate
                    });
                    qtdTotalCompNec -= qtdUsarDesteArremate;
                }
            }
            if (qtdTotalCompNec > 0) { 
                throw new Error(`Falha ao alocar saldo para "${nomeCompParaLog}" (${varComp || 'Padrão'}). Faltam ${qtdTotalCompNec}.`);
            }
        }

        const payloadAPI = {
            kit_produto_id: idDoKitParaAPI,
            kit_nome: nomeKitProduto, 
            kit_variante: variacaoKitProduto === '-' ? null : variacaoKitProduto,
            quantidade_kits_montados: qtdKitsParaEnviar,
            componentes_consumidos_de_arremates: componentesParaPayload,
            observacao: observacaoMontagem || null
        };
        
        await fetchFromAPI('/kits/montar', { method: 'POST', body: JSON.stringify(payloadAPI) });
        
        mostrarPopupMensagem(`${qtdKitsParaEnviar} kit(s) "${nomeKitProduto}" montado(s) e enviado(s) para estoque!`, 'sucesso');
        sucessoGeral = true;
        
        todosArrematesRegistradosCache = []; 
        await calcularEAgruparProntosParaEmbalar(); 
        window.location.hash = ''; // Redireciona para a lista principal

    } catch (error) {
        console.error('[montarKits] Erro:', error);
        mostrarPopupMensagem(`Erro ao montar kits: ${error.data?.details || error.message || error.message}`, 'erro');
        // sucessoGeral permanece false, o finally cuidará de reabilitar os botões
    } finally {
        operacaoEmAndamento.delete('montarKits');
        if (btnMontarEl) { // Restaura o botão principal de montar
            btnMontarEl.innerHTML = originalButtonHTML;
            // O estado 'disabled' dele será tratado por atualizarEstadoBotaoMontarKitNova
            // quando a view for recarregada ou a aba/variação for alterada.
        }

        // Se NÃO houve sucesso, reabilita os controles para permitir nova tentativa.
        // Se HOUVE sucesso, o redirecionamento via hashchange cuidará do estado dos controles
        // ao chamar carregarDetalhesEmbalagemView -> carregarTabelaKitNova.
        if (!sucessoGeral) {
            console.log("[montarKits FINALLY] Operação falhou. Tentando reabilitar controles.");
            
            // Reabilita botões de seleção de kit
            document.querySelectorAll('#kitsListNova button').forEach(b => {
                // Apenas reabilita se não for o botão ativo (o usuário pode querer trocar)
                // ou se for o único, reabilita.
                if (!b.classList.contains('active') || document.querySelectorAll('#kitsListNova button').length === 1) {
                    b.disabled = false;
                }
            });
             if(kitSelecionadoBtnEl) kitSelecionadoBtnEl.disabled = false; // Garante que o ativo também seja habilitado


            if(variacaoKitSelectEl) variacaoKitSelectEl.disabled = false;
            
            const qtdInputAtual = document.getElementById('qtdEnviarKitsNova');
            const qtdDisponivelAtual = document.getElementById('qtdDisponivelKitsNova');
            let aindaHaKitsMontaveis = 0;
            if(qtdDisponivelAtual) {
                aindaHaKitsMontaveis = parseInt(qtdDisponivelAtual.textContent) || 0;
            }

            if (qtdInputAtual) {
                qtdInputAtual.disabled = !(aindaHaKitsMontaveis > 0);
            }

            // Reabilita botões +/-/Max se o input de quantidade estiver habilitado
            const isDisabledBasedOnInput = qtdInputAtual ? qtdInputAtual.disabled : true;
            document.querySelectorAll('#kit-tab-nova .ep-acoes-rapidas-qtd button').forEach(b => b.disabled = isDisabledBasedOnInput);
            const btnMaximoAtual = document.getElementById('btnMontarMaximoKits');
            if(btnMaximoAtual) btnMaximoAtual.disabled = isDisabledBasedOnInput;

            if(observacaoTextareaEl) observacaoTextareaEl.disabled = false;
            
            atualizarEstadoBotaoMontarKitNova(); // Atualiza o estado do botão principal de montar
        }
        // Se sucessoGeral for true, não precisamos fazer nada aqui para os botões +/-/Max,
        // pois o redirecionamento e o recarregamento da view via carregarTabelaKitNova 
        // definirão o estado 'disabled' corretamente para esses botões.
    }
}

// --- Funções Auxiliares de Kit (copiadas e adaptadas com sufixo Nova) ---
async function temKitsDisponiveis(produtoIdBase, varianteBase) {
    if (todosOsProdutosCadastrados.length === 0) {
        todosOsProdutosCadastrados = await obterProdutosDoStorage(true);
    }
    const kits = todosOsProdutosCadastrados.filter(p => p.is_kit === true);
    if (kits.length === 0) return false;

    const varBaseNormalizada = (varianteBase === '-' || varianteBase === null || varianteBase === undefined ? '' : String(varianteBase)).toLowerCase();

    for (const kit of kits) {
        if (kit.grade && Array.isArray(kit.grade)) {
            for (const g of kit.grade) {
                if (g.composicao && Array.isArray(g.composicao)) {
                    for (const componente of g.composicao) {
                        const idComponenteNoKit = componente.produto_id;
                        const varComponenteNoKitNormalizada = (componente.variacao === '-' || componente.variacao === null || componente.variacao === undefined ? '' : String(componente.variacao)).toLowerCase();
                        if (idComponenteNoKit && String(idComponenteNoKit) === String(produtoIdBase) && varComponenteNoKitNormalizada === varBaseNormalizada) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

async function carregarKitsDisponiveisNova(produtoBaseId, varianteBase) {
    const panelKit = document.getElementById('kit-tab-nova');
    console.log(`[LOG 5] [carregarKitsDisponiveisNova] INÍCIO. Painel Kit display: ${window.getComputedStyle(panelKit).display}`);
    const kitsListEl = document.getElementById('kitsListNova');
    const kitVariacaoWrapperEl = document.getElementById('kitVariacaoWrapperNova');
    const kitComposicaoWrapperEl = document.getElementById('kitComposicaoWrapperNova');
    const kitAcaoMontagemWrapperEl = document.getElementById('kitAcaoMontagemWrapperNova');
    const kitVariacoesSelectEl = document.getElementById('kitVariacoesNova');
    const kitImagemPreviewEl = document.getElementById('kitImagemSelecionadoNova'); // O div container da imagem
    const kitImagemPreviewImgEl = kitImagemPreviewEl ? kitImagemPreviewEl.querySelector('img') : null; // A tag <img>

    if (!kitsListEl || !kitVariacaoWrapperEl || !kitComposicaoWrapperEl || !kitAcaoMontagemWrapperEl || !kitVariacoesSelectEl || !kitImagemPreviewEl || !kitImagemPreviewImgEl) {
        console.error("[LOG 5.1] [carregarKitsDisponiveisNova] ERRO: Um ou mais elementos da UI para kits não foram encontrados. Verifique os IDs no HTML.");
        console.error({
            kitsListEl_found: !!kitsListEl,
            kitVariacaoWrapperEl_found: !!kitVariacaoWrapperEl,
            kitComposicaoWrapperEl_found: !!kitComposicaoWrapperEl,
            kitAcaoMontagemWrapperEl_found: !!kitAcaoMontagemWrapperEl,
            kitVariacoesSelectEl_found: !!kitVariacoesSelectEl,
            kitImagemPreviewEl_found: !!kitImagemPreviewEl,
            kitImagemPreviewImgEl_found: !!kitImagemPreviewImgEl
        });
        if (kitsListEl) kitsListEl.innerHTML = '<p class="ep-placeholder-kits" style="color:red;">Erro crítico ao carregar interface da aba de kits.</p>';
        return;
    }

    // Reset inicial da UI da aba kit
    kitsListEl.innerHTML = `<p class="ep-placeholder-kits">Buscando kits que utilizam este item...</p>`;
    kitVariacaoWrapperEl.style.display = 'none';
    kitComposicaoWrapperEl.style.display = 'none';
    kitAcaoMontagemWrapperEl.style.display = 'none';
    kitVariacoesSelectEl.innerHTML = '<option value="">-- Selecione uma variação --</option>';
    kitVariacoesSelectEl.disabled = true;
    kitImagemPreviewImgEl.src = '/img/placeholder-image.png';
    kitImagemPreviewImgEl.alt = 'Preview do Kit';

    if (produtoBaseId === undefined || produtoBaseId === null) { // Checagem mais robusta
        console.warn("[LOG 5.2] [carregarKitsDisponiveisNova] produtoBaseId não fornecido ou inválido. Saindo.");
        kitsListEl.innerHTML = '<p class="ep-placeholder-kits" style="color: var(--ep-cor-cinza-texto-secundario);">Informação do item base inválida para buscar kits.</p>';
        return;
    }

    if (!todosOsProdutosCadastrados || todosOsProdutosCadastrados.length === 0) {
        try {
            todosOsProdutosCadastrados = await obterProdutosDoStorage(true); // Força busca se vazio
            if (!todosOsProdutosCadastrados || todosOsProdutosCadastrados.length === 0) {
                 kitsListEl.innerHTML = '<p class="ep-placeholder-kits" style="color:red;">Falha ao carregar dados dos produtos.</p>';
                 return;
            }
        } catch (error) {
            kitsListEl.innerHTML = '<p class="ep-placeholder-kits" style="color:red;">Erro ao carregar dados de produtos.</p>';
            return;
        }
    }

    const varianteBaseNormalizada = (varianteBase === '-' || varianteBase === null || varianteBase === undefined ? '' : String(varianteBase)).trim().toLowerCase();

    const kitsQueUtilizamOComponente = todosOsProdutosCadastrados.filter(kitProduto => {
        if (!kitProduto.is_kit) return false; // Só considera produtos que são kits

        if (!kitProduto.grade || !Array.isArray(kitProduto.grade) || kitProduto.grade.length === 0) {
            return false; // Kit sem grade ou grade vazia não pode ter composição detalhada por variação
        }

        return kitProduto.grade.some(variacaoDoKit => { // variacaoDoKit é um objeto da grade do kit (ex: {variacao: "Azul", sku:"...", composicao: [...]})
            if (!variacaoDoKit.composicao || !Array.isArray(variacaoDoKit.composicao) || variacaoDoKit.composicao.length === 0) {
                return false;
            }
            return variacaoDoKit.composicao.some(componenteDaComposicao => {
                const idComponente = componenteDaComposicao.produto_id;
                const varComponenteNoKit = componenteDaComposicao.variacao;
                const varComponenteNormalizadaKit = (varComponenteNoKit === '-' || varComponenteNoKit === null || varComponenteNoKit === undefined ? '' : String(varComponenteNoKit)).trim().toLowerCase();
                return idComponente !== undefined && idComponente !== null &&
                       String(idComponente) === String(produtoBaseId) && 
                       varComponenteNormalizadaKit === varianteBaseNormalizada;
            });
        });
    });


    if (kitsQueUtilizamOComponente.length === 0) {
        kitsListEl.innerHTML = '<p class="ep-placeholder-kits" style="color: var(--ep-cor-cinza-texto-secundario);">Nenhum kit cadastrado utiliza este item base como componente.</p>';
        return;
    }

    kitsListEl.innerHTML = ''; // Limpa "Buscando..."
    kitsQueUtilizamOComponente.forEach(kit => { // kit aqui é o objeto do PRODUTO KIT
        const button = document.createElement('button');
        button.className = 'ep-btn'; 
        button.textContent = kit.nome;
        button.dataset.kitId = kit.id; 
        button.dataset.kitNome = kit.nome; // Adiciona nome para referência em carregarVariacoesKitNova


        // Limpar listener antigo para segurança (embora kitsListEl seja limpo antes)
        const novoBotao = button.cloneNode(true);
        button.parentNode?.replaceChild(novoBotao, button); // Se já estiver no DOM (não deveria estar aqui)

        novoBotao.addEventListener('click', (e) => {
            document.querySelectorAll('#kitsListNova .ep-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            const clickedKitNome = e.target.dataset.kitNome; // Pega o nome do kit do botão clicado

            kitVariacaoWrapperEl.style.display = 'block'; 
            kitComposicaoWrapperEl.style.display = 'none'; 
            kitAcaoMontagemWrapperEl.style.display = 'none';

            // Passa o NOME do kit, ID do produto BASE e VARIAÇÃO do produto BASE (o componente original)
            carregarVariacoesKitNova(clickedKitNome, produtoBaseId, varianteBase); 
        });
        kitsListEl.appendChild(novoBotao);
    });
}


async function carregarVariacoesKitNova(nomeKitSelecionado, produtoBaseIdComponente, varianteBaseComponente) {
    const kitVariacoesSelectEl = document.getElementById('kitVariacoesNova');
    const kitImagemPreviewImgEl = document.querySelector('#kitImagemSelecionadoNova img');
    const kitComposicaoWrapperEl = document.getElementById('kitComposicaoWrapperNova');
    const kitAcaoMontagemWrapperEl = document.getElementById('kitAcaoMontagemWrapperNova');

    if (!kitVariacoesSelectEl || !kitImagemPreviewImgEl || !kitComposicaoWrapperEl || !kitAcaoMontagemWrapperEl) {
        console.error("[carregarVariacoesKitNova] Elementos da UI cruciais não encontrados.");
        return;
    }
    
    kitVariacoesSelectEl.innerHTML = '<option value="">Carregando variações...</option>';
    kitVariacoesSelectEl.disabled = true;
    kitImagemPreviewImgEl.src = '/img/placeholder-image.png';
    kitComposicaoWrapperEl.style.display = 'none';
    kitAcaoMontagemWrapperEl.style.display = 'none';

    const kitObj = todosOsProdutosCadastrados.find(p => p.is_kit && p.nome === nomeKitSelecionado);
    if (!kitObj || !kitObj.grade || !Array.isArray(kitObj.grade)) {
        kitVariacoesSelectEl.innerHTML = '<option value="">Erro: Kit ou grade não encontrado.</option>';
        return;
    }

    const varianteBaseComponenteNormalizada = (varianteBaseComponente === '-' || varianteBaseComponente === null || varianteBaseComponente === undefined ? '' : String(varianteBaseComponente)).toLowerCase();
    const variacoesDoKitQueUsamOComponente = kitObj.grade.filter(variacaoDoKitGradeItem =>
        variacaoDoKitGradeItem.composicao && Array.isArray(variacaoDoKitGradeItem.composicao) &&
        variacaoDoKitGradeItem.composicao.some(componenteNaComposicao => {
            const idDoComponente = componenteNaComposicao.produto_id;
            const variacaoDoComponenteNormalizada = (componenteNaComposicao.variacao === '-' || componenteNaComposicao.variacao === null || componenteNaComposicao.variacao === undefined ? '' : String(componenteNaComposicao.variacao)).toLowerCase();
            return idDoComponente && String(idDoComponente) === String(produtoBaseIdComponente) && variacaoDoComponenteNormalizada === varianteBaseComponenteNormalizada;
        })
    );

    if (variacoesDoKitQueUsamOComponente.length === 0) {
        kitVariacoesSelectEl.innerHTML = '<option value="">Nenhuma variação deste kit utiliza o item base especificado.</option>';
        return;
    }

    kitVariacoesSelectEl.innerHTML = '<option value="">-- Selecione uma variação --</option>';
    variacoesDoKitQueUsamOComponente.forEach(gradeItemDoKit => {
        kitVariacoesSelectEl.add(new Option(gradeItemDoKit.variacao || 'Padrão', gradeItemDoKit.variacao));
    });

    const novoSelect = kitVariacoesSelectEl.cloneNode(true);
    kitVariacoesSelectEl.parentNode.replaceChild(novoSelect, kitVariacoesSelectEl);
    
    novoSelect.addEventListener('change', (e) => {
        const variacaoDoKitSelecionadaString = e.target.value;
        // const kitObj = todosOsProdutosCadastrados.find(p => p.is_kit && p.nome === nomeKitSelecionado); // Já temos kitObj
        if (variacaoDoKitSelecionadaString && kitObj) {
            const gradeSelecionada = kitObj.grade.find(g => g.variacao === variacaoDoKitSelecionadaString);
            kitImagemPreviewImgEl.src = gradeSelecionada?.imagem || kitObj.imagem || '/img/placeholder-image.png';
            kitComposicaoWrapperEl.style.display = 'block';
            kitAcaoMontagemWrapperEl.style.display = 'none';
            carregarTabelaKitNova(nomeKitSelecionado, variacaoDoKitSelecionadaString);
        } else {
            kitImagemPreviewImgEl.src = '/img/placeholder-image.png';
            kitComposicaoWrapperEl.style.display = 'none';
            kitAcaoMontagemWrapperEl.style.display = 'none';
        }
    });
    novoSelect.disabled = false;
}

async function carregarTabelaKitNova(kitNome, variacaoKitSelecionada) {
    const kitTableBodyEl = document.getElementById('kitTableBodyNova');
    const qtdDisponivelKitsSpanEl = document.getElementById('qtdDisponivelKitsNova');
    const qtdEnviarKitsInputEl = document.getElementById('qtdEnviarKitsNova');
    const kitErrorMessageEl = document.getElementById('kitErrorMessageNova');
    const kitAcaoMontagemWrapperEl = document.getElementById('kitAcaoMontagemWrapperNova');

    if (!kitTableBodyEl || !qtdDisponivelKitsSpanEl || !qtdEnviarKitsInputEl || !kitErrorMessageEl || !kitAcaoMontagemWrapperEl) {
        console.error("[carregarTabelaKitNova] Elementos cruciais da UI para a tabela de kit não encontrados.");
        return;
    }

    console.log(`[carregarTabelaKitNova] INÍCIO para Kit: ${kitNome}, Variação: ${variacaoKitSelecionada}`);

    kitErrorMessageEl.classList.add('hidden');
    kitErrorMessageEl.textContent = ''; 
    kitTableBodyEl.innerHTML = `<tr><td colspan="4" style="text-align:center;"><div class="spinner">Analisando componentes...</div></td></tr>`;
    qtdEnviarKitsInputEl.disabled = true;
    qtdDisponivelKitsSpanEl.textContent = '0';
    kitAcaoMontagemWrapperEl.style.display = 'none';

    const kitSelecionado = todosOsProdutosCadastrados.find(p => p.nome === kitNome && p.is_kit === true);
    if (!kitSelecionado) {
        kitErrorMessageEl.textContent = `Kit "${kitNome}" não encontrado nos dados carregados.`;
        kitErrorMessageEl.classList.remove('hidden');
        kitTableBodyEl.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Kit não encontrado.</td></tr>`;
        return;
    }

    const variacaoDoKitObj = kitSelecionado.grade?.find(g => g.variacao === variacaoKitSelecionada);
    const composicaoDoKit = variacaoDoKitObj?.composicao;

    if (!composicaoDoKit || composicaoDoKit.length === 0) {
        kitErrorMessageEl.textContent = 'Composição não definida ou vazia para esta variação do kit.';
        kitErrorMessageEl.classList.remove('hidden');
        kitTableBodyEl.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--ep-cor-laranja-aviso);">Composição do kit não encontrada.</td></tr>`;
        return;
    }

    kitTableBodyEl.innerHTML = ''; 

    console.log('[LOG TABELA 1] [carregarTabelaKitNova] produtosAgregadosParaEmbalarGlobal ANTES:', JSON.parse(JSON.stringify(produtosAgregadosParaEmbalarGlobal)));

    let menorQuantidadeKitsMontaveis = Infinity;
    let todosComponentesDisponiveisParaUmKitPeloMenos = true;

    for (const itemComponente of composicaoDoKit) {
        const nomeProdutoComponente = itemComponente.produto_nome || itemComponente.produto || 'Componente Desconhecido';
        const varianteComponente = itemComponente.variacao || '-';
        const quantidadeNecessariaPorKit = parseInt(itemComponente.quantidade) || 1;
        let qtdDisponivelTotalComponente = 0;

        const agregadoComponente = produtosAgregadosParaEmbalarGlobal.find(
            agg => String(agg.produto_id) === String(itemComponente.produto_id) &&
                   (agg.variante || '-') === (varianteComponente === '-' ? '-' : varianteComponente)
        );
        
        if (agregadoComponente) {
            qtdDisponivelTotalComponente = agregadoComponente.total_quantidade_disponivel_para_embalar;
        }
        
        let statusTexto = 'OK'; 
        let statusClasse = 'ok';
        if (qtdDisponivelTotalComponente < quantidadeNecessariaPorKit) {
            statusTexto = 'EM FALTA'; statusClasse = 'em-falta'; todosComponentesDisponiveisParaUmKitPeloMenos = false;
        } else if (qtdDisponivelTotalComponente < quantidadeNecessariaPorKit * 2 && qtdDisponivelTotalComponente >= quantidadeNecessariaPorKit ) {
            statusTexto = 'ATENÇÃO'; statusClasse = 'atencao';
        }
        
        const tr = kitTableBodyEl.insertRow();
        tr.innerHTML = `
            <td>${nomeProdutoComponente} ${varianteComponente !== '-' ? `(${varianteComponente})` : ''}</td>
            <td style="text-align:center;">${quantidadeNecessariaPorKit}</td>
            <td style="text-align:center;"><input type="number" class="op-input readonly ep-kit-componente-disponivel-input" value="${qtdDisponivelTotalComponente}" readonly></td>
            <td style="text-align:center;"><span class="ep-status-componente ${statusClasse}">${statusTexto}</span></td>
        `;

        if (quantidadeNecessariaPorKit > 0) {
            menorQuantidadeKitsMontaveis = Math.min(menorQuantidadeKitsMontaveis, Math.floor(qtdDisponivelTotalComponente / quantidadeNecessariaPorKit));
        } else { 
            menorQuantidadeKitsMontaveis = 0; 
        }
    }

    const maxKitsMontaveisFinal = (todosComponentesDisponiveisParaUmKitPeloMenos && composicaoDoKit.length > 0 && menorQuantidadeKitsMontaveis !== Infinity) 
                                  ? menorQuantidadeKitsMontaveis 
                                  : 0;
    
    console.log(`[LOG TABELA 2] [carregarTabelaKitNova] maxKitsMontaveisFinal calculado: ${maxKitsMontaveisFinal}`);
    console.log(`[LOG TABELA 3] [carregarTabelaKitNova] Detalhes - todosComponentesDisponiveis: ${todosComponentesDisponiveisParaUmKitPeloMenos}, menorQtdKitsMontaveis: ${menorQuantidadeKitsMontaveis}`);
    
    qtdDisponivelKitsSpanEl.textContent = maxKitsMontaveisFinal;
    
    if (maxKitsMontaveisFinal > 0) {
        kitAcaoMontagemWrapperEl.style.display = 'block';
        kitErrorMessageEl.classList.add('hidden');
    } else {
        kitAcaoMontagemWrapperEl.style.display = 'none';
        if (composicaoDoKit.length > 0) { 
            kitErrorMessageEl.textContent = 'Componentes insuficientes para montar este kit.';
            kitErrorMessageEl.classList.remove('hidden');
        }
    }
    
    if (qtdEnviarKitsInputEl) {
        const isDisabled = maxKitsMontaveisFinal <= 0;
        qtdEnviarKitsInputEl.value = maxKitsMontaveisFinal > 0 ? "1" : "0";
        qtdEnviarKitsInputEl.max = maxKitsMontaveisFinal;
        qtdEnviarKitsInputEl.disabled = isDisabled;
        console.log(`[LOG TABELA 4] [carregarTabelaKitNova] qtdEnviarKitsInputEl.disabled definido para: ${isDisabled}`);

        // Habilita/Desabilita botões +/-/Máx baseado no estado do input de quantidade
        const btnMaximoEl = document.getElementById('btnMontarMaximoKits');
        if (btnMaximoEl) btnMaximoEl.disabled = isDisabled;
        document.querySelectorAll('#kit-tab-nova .ep-acoes-rapidas-qtd button').forEach(b => b.disabled = isDisabled);

        console.log("[carregarTabelaKitNova] Reconfigurando oninput para #qtdEnviarKitsNova.");
        qtdEnviarKitsInputEl.oninput = () => { // Reatribui o oninput aqui
            atualizarEstadoBotaoMontarKitNova(); 
        };
        qtdEnviarKitsInputEl.dispatchEvent(new Event('input')); // Dispara para estado inicial
    } else {
        console.error("[carregarTabelaKitNova] ERRO: #qtdEnviarKitsNova não encontrado para config.");
    }
}

function atualizarEstadoBotaoMontarKitNova() {
    const inputQtdEl = document.getElementById('qtdEnviarKitsNova'); // Pega sempre a referência atual
    const btnMontarEl = document.getElementById('btnMontarEnviarKitsEstoque'); // Pega sempre a referência atual
    const qtdDisponivelSpanEl = document.getElementById('qtdDisponivelKitsNova'); // Pega sempre a referência atual

    if (!inputQtdEl || !btnMontarEl || !qtdDisponivelSpanEl) {
        console.warn("[atualizarEstadoBotaoMontarKitNova] Elementos não encontrados, não é possível atualizar botão.");
        if(btnMontarEl) btnMontarEl.disabled = true; // Segurança
        return;
    }

    const valor = parseInt(inputQtdEl.value) || 0;
    const maxKitsMontaveis = parseInt(qtdDisponivelSpanEl.textContent) || 0; 
    const podeMontarPermissao = permissoes.includes('montar-kit');
    
    // Log para depurar o estado do botão
    // console.log(`[UPDATE BTN STATE] Valor: ${valor}, Max: ${maxKitsMontaveis}, Perm: ${podeMontarPermissao}, Result Disabled: ${!(valor > 0 && valor <= maxKitsMontaveis && podeMontarPermissao)}`);

    btnMontarEl.disabled = !(valor > 0 && valor <= maxKitsMontaveis && podeMontarPermissao);
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
        
        const fecharDetalheBtnEl = document.getElementById('fecharEmbalarDetalheBtn');
        if (fecharDetalheBtnEl) {
            fecharDetalheBtnEl.addEventListener('click', () => {
                window.location.hash = '';
            });
        }

        const btnEmbalarUnidadeEl = document.getElementById('btnEmbalarEnviarEstoqueUnidade');
        if (btnEmbalarUnidadeEl) {
            btnEmbalarUnidadeEl.addEventListener('click', embalarUnidade);
        }

        const btnMontarKitsEl = document.getElementById('btnMontarEnviarKitsEstoque');
        if (btnMontarKitsEl) {
            btnMontarKitsEl.addEventListener('click', montarKits);
        }
        
        // Listener para as ABAS dentro da view de detalhe
        document.querySelectorAll('#embalarDetalheView .ep-tabs .ep-tab-btn').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                const tabBtn = event.currentTarget;
                const tabId = tabBtn.dataset.tab;
                console.log(`[ABA CLICK] Aba clicada: ${tabId}`);

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
                    console.log(`[ABA CLICK] Painel #${activePanel.id} display ANTES de carregarKits: ${window.getComputedStyle(activePanel).display}`);
                } else {
                    console.error(`[ABA CLICK] ERRO: Painel para aba ${tabId} não encontrado!`);
                }
                
                if (tabId === 'kit') {
                    console.log('[ABA CLICK] Iniciando lógica para aba Kit.');
                    if (embalagemAgregadoEmVisualizacao && embalagemAgregadoEmVisualizacao.produto_id !== undefined) {
                        console.log(`[ABA CLICK] Chamando carregarKitsDisponiveisNova para produto_id: ${embalagemAgregadoEmVisualizacao.produto_id}, variante: ${embalagemAgregadoEmVisualizacao.variante}`);
                        await carregarKitsDisponiveisNova(embalagemAgregadoEmVisualizacao.produto_id, embalagemAgregadoEmVisualizacao.variante);
                        
                        const panelKitAfterLoad = document.getElementById('kit-tab-nova');
                        if (panelKitAfterLoad) {
                           console.log(`[ABA CLICK] Painel #${panelKitAfterLoad.id} display DEPOIS de carregarKits: ${window.getComputedStyle(panelKitAfterLoad).display}`);
                           // A função carregarTabelaKitNova agora configura o oninput e dispara o evento inicial.
                           // A chamada para atualizarEstadoBotaoMontarKitNova() foi movida para o final de carregarTabelaKitNova
                           // ou é acionada pelo dispatchEvent do input.
                        }
                    } else {
                        console.warn('[ABA CLICK] Aba Kit: embalagemAgregadoEmVisualizacao inválido.', embalagemAgregadoEmVisualizacao);
                        const kitsListEl = document.getElementById('kitsListNova');
                        if(kitsListEl) kitsListEl.innerHTML = '<p class="ep-placeholder-kits" style="color:orange;">Selecione um item válido da lista para ver os kits.</p>';
                    }
                }
            });
        });
        
        // Listener DELEGADO para os cliques nos botões +/-/Máx DENTRO da aba Kit - CONFIGURADO UMA VEZ
        const kitTabPanelEl = document.getElementById('kit-tab-nova');
        if (kitTabPanelEl) {
            console.log("[DOMContentLoaded] Configurando listener DELEGADO PERMANENTE de CLIQUE para #kit-tab-nova.");
            kitTabPanelEl.addEventListener('click', (event) => {
                const target = event.target;
                
                const btnMaximo = target.closest('#btnMontarMaximoKits');
                const acaoRapidaButton = target.closest('.ep-acoes-rapidas-qtd .ep-btn-outline-pequeno');

                if (btnMaximo) {
                    console.log('[DELEGATED LISTENER GLOBAL - KIT] Botão "Máximo" clicado.');
                    const currentQtdInput = document.getElementById('qtdEnviarKitsNova');
                    const currentDisponivelSpan = document.getElementById('qtdDisponivelKitsNova');
                    if (currentDisponivelSpan && currentQtdInput && !currentQtdInput.disabled) {
                        const maxMontaveis = parseInt(currentDisponivelSpan.textContent) || 0;
                        currentQtdInput.value = maxMontaveis;
                        currentQtdInput.dispatchEvent(new Event('input')); 
                    } else { console.warn('[DELEGATED LISTENER GLOBAL - KIT] Máximo: Input desabilitado ou elementos não encontrados.'); }
                    return; 
                }

                if (acaoRapidaButton && acaoRapidaButton.dataset.qtdAdd !== undefined) {
                    console.log(`[DELEGATED LISTENER GLOBAL - KIT] Botão Ação Rápida '${acaoRapidaButton.dataset.qtdAdd}' clicado.`);
                    const currentQtdInput = document.getElementById('qtdEnviarKitsNova');
                    const currentDisponivelSpan = document.getElementById('qtdDisponivelKitsNova');
                    if (currentQtdInput && currentDisponivelSpan && !currentQtdInput.disabled) {
                        const qtdAtual = parseInt(currentQtdInput.value) || 0;
                        const qtdAdd = parseInt(acaoRapidaButton.dataset.qtdAdd);
                        let novaQtd = qtdAtual + qtdAdd;
                        const maxQtd = parseInt(currentDisponivelSpan.textContent) || 0;
                        novaQtd = Math.max(0, Math.min(novaQtd, maxQtd));
                        currentQtdInput.value = novaQtd;
                        currentQtdInput.dispatchEvent(new Event('input'));
                    } else { console.warn('[DELEGATED LISTENER GLOBAL - KIT] Ação Rápida: Input desabilitado ou elementos não encontrados.'); }
                    return; 
                }
            });

            // O oninput para #qtdEnviarKitsNova será configurado/reconfigurado por carregarTabelaKitNova
            // Isso garante que ele esteja sempre no elemento input correto se o DOM for alterado.
            // Não precisa configurar aqui permanentemente se carregarTabelaKitNova já faz.
            
        } else {
            console.error("[DOMContentLoaded] Painel #kit-tab-nova não encontrado para configurar listener delegado.");
        }
        
        const searchInputEl = document.getElementById('searchProdutoEmbalagem');
        if (searchInputEl) {
            searchInputEl.addEventListener('input', debounce(async () => {
                currentPageEmbalagemCards = 1; 
                await renderizarCardsEmbalagem(); 
            }, 350));
        }

    } catch (error) {
        console.error("[DOMContentLoaded Embalagem] Erro crítico na inicialização:", error);
        mostrarPopupMensagem("Erro crítico ao carregar a página. Tente recarregar.", "erro", 0);
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