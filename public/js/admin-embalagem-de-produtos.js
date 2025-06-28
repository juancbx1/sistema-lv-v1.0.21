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

// Variáveis globais para paginação do histórico
let currentPageHistorico = 1;
const itemsPerPageHistorico = 5;

async function forcarAtualizacaoEmbalagem() {
    const btn = document.getElementById('btnAtualizarEmbalagem');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    const span = btn.querySelector('span');
    if (span) span.textContent = 'Atualizando...';

    console.log('[forcarAtualizacaoEmbalagem] Forçando atualização da fila de embalagem...');

    try {
        // Limpa os caches relevantes para forçar busca na API
        todosArrematesRegistradosCache = [];
        // Não precisa invalidar o cache de produtos, pois a definição deles raramente muda.
        
        // A função abaixo já busca os arremates frescos e reordena a lista
        await calcularEAgruparProntosParaEmbalar();
        
        // Renderiza a lista com os dados atualizados.
        // A função renderizarCardsEmbalagem já respeita os filtros atuais.
        await renderizarCardsEmbalagem();

        // Atualiza os contadores do painel superior
        await atualizarContadoresPainel();

        mostrarPopupMensagem('Fila de embalagem atualizada!', 'sucesso', 2500);

    } catch (error) {
        console.error('[forcarAtualizacaoEmbalagem] Erro:', error);
        mostrarPopupMensagem('Falha ao atualizar a fila de embalagem.', 'erro');
    } finally {
        if (span) span.textContent = 'Atualizar';
        if (btn) btn.disabled = false;
        console.log('[forcarAtualizacaoEmbalagem] Atualização concluída.');
    }
}

// 1. FUNÇÃO PARA BUSCAR O HISTÓRICO DA API
async function carregarHistoricoEmbalagem(produtoRefId, page) {
    currentPageHistorico = page;
    const tbodyEl = document.getElementById('historicoEmbalagemTableBody');
    const paginacaoEl = document.getElementById('paginacaoHistoricoEmbalagem');

    if (!tbodyEl || !paginacaoEl) return;
    
    tbodyEl.innerHTML = `<tr><td colspan="6" style="text-align:center;"><div class="spinner">Carregando...</div></td></tr>`;
    paginacaoEl.style.display = 'none';

    if (!produtoRefId) {
        tbodyEl.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Erro: SKU do item não fornecido.</td></tr>`;
        return;
    }

    try {
        const params = new URLSearchParams({
            produto_ref_id: produtoRefId,
            limit: itemsPerPageHistorico,
            page: currentPageHistorico
        });

        const data = await fetchFromAPI(`/embalagens/historico?${params.toString()}`);
        renderizarHistoricoEmbalagem(data.rows || []);
        renderizarPaginacaoHistorico(data.pages || 0, produtoRefId);
    } catch (error) {
        tbodyEl.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Erro ao carregar histórico.</td></tr>`;
    }
}


// 2. FUNÇÃO PARA RENDERIZAR AS LINHAS DO HISTÓRICO NA TABELA
function renderizarHistoricoEmbalagem(registros) {
    const tbodyEl = document.getElementById('historicoEmbalagemTableBody');
    if (!tbodyEl) return;
    tbodyEl.innerHTML = '';

    if (!registros || registros.length === 0) {
        tbodyEl.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma embalagem registrada para este item.</td></tr>';
        return;
    }

    registros.forEach(reg => {
        const tr = tbodyEl.insertRow();
        
        // Formata o nome do item para exibição (útil para kits)
        let nomeExibicao = reg.tipo_embalagem;
        if (reg.tipo_embalagem === 'KIT') {
            // A API de histórico precisa retornar 'produto_embalado_nome' e 'variante_embalada_nome'
            nomeExibicao = `KIT: ${reg.produto_embalado_nome || ''} ${reg.variante_embalada_nome || ''}`.trim();
        }

        tr.innerHTML = `
            <td data-label="Data">${new Date(reg.data_embalagem).toLocaleString('pt-BR')}</td>
            <td data-label="Tipo" title="${nomeExibicao}">${reg.tipo_embalagem}</td>
            <td data-label="Qtd." style="text-align:right;">${reg.quantidade_embalada}</td>
            <td data-label="Usuário">${reg.usuario_responsavel || '-'}</td>
            <td data-label="Obs.">${reg.observacao || '-'}</td>
            <td data-label="Ações" style="text-align:center;"></td>
        `;

        const acoesCell = tr.cells[5];

        if (reg.status === 'ESTORNADO') {
            acoesCell.innerHTML = `<span class="ep-tag-estornado">Estornado</span>`;
        } else if (permissoes.includes('lancar-embalagem')) { // Permissão para estornar
            const btnEstornar = document.createElement('button');
            btnEstornar.className = 'ep-btn-icon-estorno';
            btnEstornar.title = 'Estornar esta embalagem';
            btnEstornar.innerHTML = '<i class="fas fa-undo"></i>';
            btnEstornar.dataset.id = reg.id;
            btnEstornar.dataset.info = `${reg.quantidade_embalada}x ${nomeExibicao}`;
            btnEstornar.addEventListener('click', handleEstornoClick);
            acoesCell.appendChild(btnEstornar);
        }
    });
}

// 3. FUNÇÃO PARA RENDERIZAR A PAGINAÇÃO DO HISTÓRICO
function renderizarPaginacaoHistorico(totalPages, produtoRefId) {
    const paginacaoEl = document.getElementById('paginacaoHistoricoEmbalagem');
    if (!paginacaoEl) {
        console.error("Elemento #paginacaoHistoricoEmbalagem não encontrado.");
        return;
    }
    
    paginacaoEl.innerHTML = '';
    
    if (totalPages <= 1) {
        paginacaoEl.style.display = 'none';
        return;
    }
    paginacaoEl.style.display = 'flex';

    paginacaoEl.innerHTML = `
        <button class="pagination-btn ep-btn" data-page="${Math.max(1, currentPageHistorico - 1)}" ${currentPageHistorico === 1 ? 'disabled' : ''}>Anterior</button>
        <span class="pagination-current">Pág. ${currentPageHistorico} de ${totalPages}</span>
        <button class="pagination-btn ep-btn" data-page="${Math.min(totalPages, currentPageHistorico + 1)}" ${currentPageHistorico === totalPages ? 'disabled' : ''}>Próximo</button>
    `;

    paginacaoEl.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = parseInt(btn.dataset.page);
            // Chama a função de carregar histórico passando o SKU (produtoRefId) e a nova página
            carregarHistoricoEmbalagem(produtoRefId, targetPage);
        });
    });
}

// 4. HANDLER PARA O CLIQUE NO BOTÃO DE ESTORNO
async function handleEstornoClick(event) {
    const button = event.currentTarget;
    const embalagemId = button.dataset.id;
    const embalagemInfo = button.dataset.info;

    if (!embalagemId) {
        console.error("ID da embalagem não encontrado no botão de estorno.");
        return;
    }

    const confirmado = await mostrarPopupConfirmacao(
        `Tem certeza que deseja estornar (reverter) esta embalagem?<br><strong>${embalagemInfo}</strong><br><br>A quantidade voltará a ficar disponível para embalagem e a entrada no estoque será revertida.`,
        'perigo'
    );

    if (!confirmado) return;
    
    button.disabled = true;
    button.innerHTML = '<div class="spinner-btn-interno" style="width:12px; height:12px; border-width:2px; margin:0;"></div>';

    try {
        await fetchFromAPI(`/embalagens/estornar`, {
            method: 'POST',
            body: JSON.stringify({ id_embalagem_realizada: parseInt(embalagemId) })
        });
        
        mostrarPopupMensagem('Embalagem estornada com sucesso! A página será recarregada para refletir as mudanças.', 'sucesso');
        
        setTimeout(() => {
            window.location.hash = ''; // Volta para a lista principal, forçando recarga de todos os dados
        }, 2000);

    } catch (error) {
        mostrarPopupMensagem(`Erro ao estornar: ${error.data?.details || error.data?.error || error.message}`, 'erro');
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-undo"></i>';
    }
}

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

function mostrarPopupConfirmacao(mensagem, tipo = 'aviso') {
    return new Promise((resolve) => {
        // Remove qualquer popup de confirmação existente
        const popupExistente = document.getElementById('ep-popup-confirmacao');
        if (popupExistente) popupExistente.parentElement.remove();

        const container = document.createElement('div');
        container.id = 'ep-popup-confirmacao';

        const popup = document.createElement('div');
        popup.className = `popup-mensagem popup-${tipo}`;
        
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';

        const p = document.createElement('p');
        p.innerHTML = mensagem;
        popup.appendChild(p);

        const botoesContainer = document.createElement('div');
        botoesContainer.style.display = 'flex';
        botoesContainer.style.gap = '10px';
        botoesContainer.style.justifyContent = 'center';

        const fecharEResolver = (valor) => {
            // Animação de saída se desejar...
            document.body.removeChild(container);
            resolve(valor);
        };

        const btnConfirmar = document.createElement('button');
        btnConfirmar.textContent = 'Sim, Confirmar';
        btnConfirmar.className = 'ep-btn-confirmar'; // Estilize no CSS se quiser
        btnConfirmar.onclick = () => fecharEResolver(true);

        const btnCancelar = document.createElement('button');
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.className = 'ep-btn-cancelar'; // Estilize no CSS se quiser
        btnCancelar.onclick = () => fecharEResolver(false);
        
        botoesContainer.appendChild(btnCancelar);
        botoesContainer.appendChild(btnConfirmar);
        popup.appendChild(botoesContainer);

        container.appendChild(overlay);
        container.appendChild(popup);
        document.body.appendChild(container);
    });
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
    // 1. Garante que os dados mais frescos sejam usados
    await buscarArrematesCompletos(); 
    if (todosOsProdutosCadastrados.length === 0) {
         todosOsProdutosCadastrados = await obterProdutosDoStorage();
    }

    // 2. Cria uma lista de todos os itens de arremate com saldo para embalar
    const arrematesComSaldoParaEmbalar = [];
    for (const arremate of todosArrematesRegistradosCache) {
        const quantidadeTotal = parseInt(arremate.quantidade_arrematada) || 0;
        const quantidadeJaEmbalada = parseInt(arremate.quantidade_ja_embalada) || 0;
        const saldoParaEmbalar = quantidadeTotal - quantidadeJaEmbalada;

        if (saldoParaEmbalar > 0) {
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

    // 3. Agrega os itens de arremate por produto/variação
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
                data_lancamento_mais_antiga: arremateComSaldo.data_lancamento
            });
        }
        
        const aggregatedItem = aggregatedMap.get(produtoKey);
        aggregatedItem.total_quantidade_disponivel_para_embalar += arremateComSaldo.quantidade_disponivel_para_embalar;
        aggregatedItem.arremates_detalhe.push(arremateComSaldo);

        if (arremateComSaldo.data_lancamento) {
            const dataAtualDoArremate = new Date(arremateComSaldo.data_lancamento);
            if (!aggregatedItem.data_lancamento_mais_antiga || dataAtualDoArremate < new Date(aggregatedItem.data_lancamento_mais_antiga)) {
                aggregatedItem.data_lancamento_mais_antiga = arremateComSaldo.data_lancamento;
            }
        }
    });
    
    // 4. Converte o Map para um Array
    let itensAgregados = Array.from(aggregatedMap.values());
    console.log('[calcularEAgruparProntosParaEmbalar] Produtos agregados (antes da ordenação):', itensAgregados.length);

    // --- AJUSTE PRINCIPAL: ORDENAÇÃO PADRÃO ---
    // 5. Aplica a ordenação padrão ("Mais Recentes Primeiro") imediatamente após agregar os dados.
    // Usamos 'data_lancamento_mais_antiga' porque um item que recebeu uma nova remessa de arremate
    // deve ser considerado "recente" novamente. Se preferir a data do primeiro arremate,
    // podemos ajustar a lógica de data no passo 3. Por ora, vamos usar a data do arremate mais recente
    // que compõe o agregado. Para isso, precisamos ajustar o passo 3 para guardar também a data mais RECENTE.
    
    // Ajuste no Passo 3 para guardar a data mais recente também.
    // (A lógica será adicionada na reescrita completa abaixo)

    // Vamos refazer a lógica de agregação para incluir a data mais recente.
    const aggregatedMapComDataRecente = new Map();
    arrematesComSaldoParaEmbalar.forEach(arremateComSaldo => {
        const produtoKey = `${arremateComSaldo.produto_id}|${arremateComSaldo.variante}`;
        
        if (!aggregatedMapComDataRecente.has(produtoKey)) {
            aggregatedMapComDataRecente.set(produtoKey, {
                produto: arremateComSaldo.produto,
                produto_id: arremateComSaldo.produto_id,
                variante: arremateComSaldo.variante,
                total_quantidade_disponivel_para_embalar: 0,
                arremates_detalhe: [],
                data_lancamento_mais_antiga: arremateComSaldo.data_lancamento,
                data_lancamento_mais_recente: arremateComSaldo.data_lancamento // NOVO CAMPO
            });
        }
        
        const aggregatedItem = aggregatedMapComDataRecente.get(produtoKey);
        aggregatedItem.total_quantidade_disponivel_para_embalar += arremateComSaldo.quantidade_disponivel_para_embalar;
        aggregatedItem.arremates_detalhe.push(arremateComSaldo);

        if (arremateComSaldo.data_lancamento) {
            const dataAtualDoArremate = new Date(arremateComSaldo.data_lancamento);
            // Atualiza data mais antiga
            if (!aggregatedItem.data_lancamento_mais_antiga || dataAtualDoArremate < new Date(aggregatedItem.data_lancamento_mais_antiga)) {
                aggregatedItem.data_lancamento_mais_antiga = arremateComSaldo.data_lancamento;
            }
            // Atualiza data mais recente
            if (!aggregatedItem.data_lancamento_mais_recente || dataAtualDoArremate > new Date(aggregatedItem.data_lancamento_mais_recente)) {
                aggregatedItem.data_lancamento_mais_recente = arremateComSaldo.data_lancamento;
            }
        }
    });

    let itensAgregadosFinal = Array.from(aggregatedMapComDataRecente.values());

    // Agora, ordenamos por 'data_lancamento_mais_recente'
    itensAgregadosFinal.sort((a, b) => {
        return new Date(b.data_lancamento_mais_recente) - new Date(a.data_lancamento_mais_recente);
    });

    // Atualiza a variável global com os dados já ordenados
    produtosAgregadosParaEmbalarGlobal = itensAgregadosFinal;
    
    console.log('[calcularEAgruparProntosParaEmbalar] Produtos agregados e ordenados por padrão:', produtosAgregadosParaEmbalarGlobal.length);
}

// --- Funções de Renderização ---
async function renderizarCardsEmbalagem() {
    const containerEl = document.getElementById('embalagemCardsContainer');
    const paginationContainerEl = document.getElementById('embalagemPaginationContainer');
    const searchInputEl = document.getElementById('searchProdutoEmbalagem');
    const filtroAlertaEl = document.getElementById('filtroAlertaSelect');
    const ordenacaoEl = document.getElementById('ordenacaoSelect');

    if (!containerEl || !paginationContainerEl || !searchInputEl || !filtroAlertaEl || !ordenacaoEl) {
        console.error("Elementos DOM para renderização/filtros não encontrados.");
        if(containerEl) containerEl.innerHTML = `<p style="color:red; text-align:center;">Erro de interface. Recarregue a página.</p>`;
        return;
    }

    containerEl.innerHTML = '<div class="spinner">Carregando e aplicando filtros...</div>';
    paginationContainerEl.innerHTML = '';

    let itensProcessados = [...produtosAgregadosParaEmbalarGlobal];

    const filtroAlerta = filtroAlertaEl.value;
    if (filtroAlerta === 'antigos' || filtroAlerta === 'recentes') {
        const doisDiasAtras = new Date();
        doisDiasAtras.setHours(0, 0, 0, 0);
        doisDiasAtras.setDate(doisDiasAtras.getDate() - 2);
        itensProcessados = itensProcessados.filter(item => {
            if (!item.data_lancamento_mais_antiga) return false;
            const dataItem = new Date(item.data_lancamento_mais_antiga);
            dataItem.setHours(0, 0, 0, 0);
            return filtroAlerta === 'antigos' ? dataItem < doisDiasAtras : dataItem >= doisDiasAtras;
        });
    }

    const searchTerm = searchInputEl.value.toLowerCase().trim();
    if (searchTerm) {
        itensProcessados = itensProcessados.filter(item =>
            item.produto.toLowerCase().includes(searchTerm) ||
            (item.variante && item.variante !== '-' && item.variante.toLowerCase().includes(searchTerm)) ||
            (item.sku && String(item.sku).toLowerCase().includes(searchTerm))
        );
    }
    
    const ordenacao = ordenacaoEl.value;
    if (ordenacao !== 'padrao') {
        itensProcessados.sort((a, b) => {
            switch (ordenacao) {
                case 'mais_antigos': return new Date(a.data_lancamento_mais_antiga) - new Date(b.data_lancamento_mais_antiga);
                case 'maior_quantidade': return b.total_quantidade_disponivel_para_embalar - a.total_quantidade_disponivel_para_embalar;
                case 'menor_quantidade': return a.total_quantidade_disponivel_para_embalar - b.total_quantidade_disponivel_para_embalar;
                default: return new Date(b.data_lancamento_mais_recente) - new Date(a.data_lancamento_mais_recente);
            }
        });
    }

    if (itensProcessados.length === 0) {
        containerEl.innerHTML = `<p style="text-align: center; grid-column: 1 / -1;">Nenhum item encontrado com os filtros aplicados.</p>`;
        paginationContainerEl.style.display = 'none';
        return;
    }
    
    containerEl.innerHTML = ''; 
    paginationContainerEl.style.display = 'flex';

    const totalItems = itensProcessados.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageEmbalagemCards) || 1;
    currentPageEmbalagemCards = Math.max(1, Math.min(currentPageEmbalagemCards, totalPages));
    const startIndex = (currentPageEmbalagemCards - 1) * itemsPerPageEmbalagemCards;
    const paginatedItems = itensProcessados.slice(startIndex, startIndex + itemsPerPageEmbalagemCards);

    const fragment = document.createDocumentFragment();
    if (todosOsProdutosCadastrados.length === 0) {
        todosOsProdutosCadastrados = await obterProdutosDoStorage();
    }

    paginatedItems.forEach(item => {
        const card = document.createElement('div');
        const produtoCadastrado = todosOsProdutosCadastrados.find(p => p.id == item.produto_id);
        let imagemSrc = '/img/placeholder-image.png';
        let skuProduto = 'N/A';
        if (produtoCadastrado) {
            if (item.variante && item.variante !== '-') {
                const gradeInfo = produtoCadastrado.grade?.find(g => g.variacao === item.variante);
                if (gradeInfo) {
                    imagemSrc = gradeInfo.imagem || produtoCadastrado.imagem || '/img/placeholder-image.png';
                    skuProduto = gradeInfo.sku || produtoCadastrado.sku || 'N/A';
                }
            } else {
                imagemSrc = produtoCadastrado.imagem || '/img/placeholder-image.png';
                skuProduto = produtoCadastrado.sku || 'N/A';
            }
        }
        
        let classeStatus = 'status-pronto-para-embalar'; 
        let diasEsperandoTexto = '-';

        if (item.data_lancamento_mais_antiga) {
            const dataAntiga = new Date(item.data_lancamento_mais_antiga);
            const agora = new Date();
            
            const diffTime = Math.abs(agora - dataAntiga);
            const diffHoras = Math.floor(diffTime / (1000 * 60 * 60));

            if (diffHoras < 1) {
                const diffMinutos = Math.floor(diffTime / (1000 * 60));
                diasEsperandoTexto = diffMinutos < 5 ? "Agora" : `${diffMinutos} min`;
            } else if (diffHoras < 24) {
                diasEsperandoTexto = `${diffHoras}h`;
            } else {
                const diffDias = Math.floor(diffHoras / 24);
                diasEsperandoTexto = diffDias === 1 ? '1 dia' : `${diffDias} dias`;
                if (diffDias > 2) {
                    classeStatus = 'status-aguardando-muito';
                }
            }
        }
        
        card.className = `ep-consulta-card ${classeStatus}`;

        let estiloDiasAguardando = '';
        if (classeStatus === 'status-aguardando-muito') {
            estiloDiasAguardando = `style="color: var(--ep-cor-laranja-aviso); font-weight: 600;"`;
        }

        card.innerHTML = `
            <img src="${imagemSrc}" alt="${item.produto}" class="ep-consulta-card-img" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">
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
                    <span class="valor" ${estiloDiasAguardando}>${diasEsperandoTexto}</span>
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
    
    containerEl.appendChild(fragment);

    if (totalPages > 1) {
        let paginationHTML = `<button class="pagination-btn ep-btn" data-page="${Math.max(1, currentPageEmbalagemCards - 1)}" ${currentPageEmbalagemCards === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageEmbalagemCards} de ${totalPages}</span>`;
        paginationHTML += `<button class="pagination-btn ep-btn" data-page="${Math.min(totalPages, currentPageEmbalagemCards + 1)}" ${currentPageEmbalagemCards === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainerEl.innerHTML = paginationHTML;
        paginationContainerEl.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageEmbalagemCards = parseInt(btn.dataset.page);
                renderizarCardsEmbalagem(); 
            });
        });
    } else {
         paginationContainerEl.style.display = 'none';
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

    // Lógica para buscar e preencher o SKU
    const skuEl = document.getElementById('embalagemDetalheSKU');
    if (skuEl) {
        let skuProduto = 'N/A';
        const produtoCad = todosOsProdutosCadastrados.find(p => p.id == agregado.produto_id);
        if (produtoCad) {
            if (agregado.variante && agregado.variante !== '-') {
                const gradeInfo = produtoCad.grade?.find(g => g.variacao === agregado.variante);
                skuProduto = gradeInfo?.sku || produtoCad.sku || 'N/A';
            } else {
                skuProduto = produtoCad.sku || 'N/A';
            }
        }
        skuEl.textContent = `SKU: ${skuProduto}`;
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
    if (!embalagemAgregadoEmVisualizacao || operacaoEmAndamento.has('embalarUnidade')) {
        return; 
    }

    const itemEmbaladoCopia = { ...embalagemAgregadoEmVisualizacao }; // Guarda uma cópia para referência futura

    const inputQtdEl = document.getElementById('inputQuantidadeEmbalarUnidade');
    const btnEmbalarEl = document.getElementById('btnEmbalarEnviarEstoqueUnidade');
    const observacaoInputEl = document.getElementById('observacaoEmbalagemUnidade');

    if (!inputQtdEl || !btnEmbalarEl || !observacaoInputEl) {
        console.error("Erro: Elementos do formulário de embalagem de unidade não foram encontrados.");
        mostrarPopupMensagem("Erro na interface. Tente recarregar a página.", "erro");
        return;
    }

    const quantidadeEnviada = parseInt(inputQtdEl.value);
    const observacao = observacaoInputEl.value.trim();

    if (isNaN(quantidadeEnviada) || quantidadeEnviada <= 0 || quantidadeEnviada > itemEmbaladoCopia.total_quantidade_disponivel_para_embalar) {
        mostrarPopupMensagem('A quantidade para embalar é inválida ou excede o disponível.', 'erro');
        return;
    }

    const confirmado = await mostrarPopupConfirmacao(
        `Confirma a embalagem de <strong>${quantidadeEnviada}</strong> unidade(s) de <br><strong>${itemEmbaladoCopia.produto} - ${itemEmbaladoCopia.variante}</strong>?`,
        'aviso'
    );

    if (!confirmado) {
        console.log("Embalagem de unidade cancelada pelo usuário.");
        return; 
    }

    operacaoEmAndamento.add('embalarUnidade');
    btnEmbalarEl.disabled = true;
    btnEmbalarEl.innerHTML = '<div class="spinner-btn-interno"></div> Processando...';
    inputQtdEl.disabled = true;
    observacaoInputEl.disabled = true;

    try {
        let quantidadeRestanteDaMeta = quantidadeEnviada;
        const arrematesOrdenados = [...itemEmbaladoCopia.arremates_detalhe]
            .filter(arr => arr.quantidade_disponivel_para_embalar > 0)
            .sort((a, b) => new Date(a.data_lancamento) - new Date(b.data_lancamento)); 

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
            throw new Error("Não foi possível alocar a quantidade total nos arremates disponíveis.");
        }
        
        let skuUnidade = null;
        const produtoCad = todosOsProdutosCadastrados.find(p => p.id == itemEmbaladoCopia.produto_id);
        if (produtoCad) {
            if (itemEmbaladoCopia.variante && itemEmbaladoCopia.variante !== '-') {
                const gradeInfo = produtoCad.grade?.find(g => g.variacao === itemEmbaladoCopia.variante);
                skuUnidade = gradeInfo?.sku || produtoCad.sku;
            } else {
                skuUnidade = produtoCad.sku;
            }
        }
        if (!skuUnidade) {
            throw new Error("Não foi possível determinar o SKU da unidade para registro.");
        }

        const payloadEstoque = {
            produto_id: itemEmbaladoCopia.produto_id,
            variante_nome: itemEmbaladoCopia.variante === '-' ? null : itemEmbaladoCopia.variante,
            produto_ref_id: skuUnidade,
            quantidade_entrada: quantidadeEnviada,
            id_arremate_origem: arrematesOrdenados[0]?.id_arremate || null,
            observacao: observacao || null
        };
        
        await fetchFromAPI('/estoque/entrada-producao', {
            method: 'POST',
            body: JSON.stringify(payloadEstoque)
        });
        
        mostrarPopupMensagem(`${quantidadeEnviada} unidade(s) embalada(s) com sucesso!`, 'sucesso');
        
        // --- LÓGICA DE ATUALIZAÇÃO E REORDENAÇÃO PÓS-AÇÃO ---
        // 1. Recalcula todos os saldos e aplica a ordenação padrão por data
        await calcularEAgruparProntosParaEmbalar(); 

        // 2. Encontra o índice do item que acabamos de embalar no array global atualizado
        const indexDoItem = produtosAgregadosParaEmbalarGlobal.findIndex(
            item => item.produto_id === itemEmbaladoCopia.produto_id && item.variante === itemEmbaladoCopia.variante
        );

        // 3. Se o item ainda existe na lista (ou seja, ainda tem saldo), move para o topo
        if (indexDoItem > -1) {
            const [itemAtualizado] = produtosAgregadosParaEmbalarGlobal.splice(indexDoItem, 1);
            produtosAgregadosParaEmbalarGlobal.unshift(itemAtualizado);
            console.log(`Item "${itemAtualizado.produto} - ${itemAtualizado.variante}" movido para o topo da lista.`);
        }
        
        // 4. Reseta a paginação para a primeira página
        currentPageEmbalagemCards = 1;
        
        // 5. Redireciona para a lista principal, que agora usará os dados reordenados e a página 1
        window.location.hash = '';

    } catch (error) {
        console.error('[embalarUnidade] Erro:', error);
        mostrarPopupMensagem(`Falha ao embalar unidade: ${error.data?.details || error.message || error.message}`, 'erro');
        inputQtdEl.disabled = false;
        observacaoInputEl.disabled = false;
        inputQtdEl.dispatchEvent(new Event('input'));

    } finally {
        operacaoEmAndamento.delete('embalarUnidade');
        if (btnEmbalarEl && !btnEmbalarEl.disabled) {
            btnEmbalarEl.innerHTML = '<i class="fas fa-box-open"></i> EMBALAR E ESTOCAR UNIDADES';
        }
    }
}

async function montarKits() {
    if (!embalagemAgregadoEmVisualizacao || operacaoEmAndamento.has('montarKits')) {
        return;
    }

    // Guarda uma cópia do COMPONENTE que iniciou a ação de montagem
    const componenteBaseCopia = { ...embalagemAgregadoEmVisualizacao };

    const kitSelecionadoBtnEl = document.querySelector('#kitsListNova button.active');
    const variacaoKitSelectEl = document.getElementById('kitVariacoesNova');
    const qtdKitsInputEl = document.getElementById('qtdEnviarKitsNova');
    const observacaoTextareaEl = document.getElementById('observacaoMontagemKit');
    const btnMontarEl = document.getElementById('btnMontarEnviarKitsEstoque');

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

    const confirmado = await mostrarPopupConfirmacao(
        `Confirma a montagem de <strong>${qtdKitsParaEnviar}</strong> kit(s) de <br><strong>${nomeKitProduto} - ${variacaoKitProduto}</strong>?`,
        'aviso'
    );
    if (!confirmado) return;

    operacaoEmAndamento.add('montarKits');
    const originalButtonHTML = btnMontarEl.innerHTML;
    btnMontarEl.disabled = true;
    btnMontarEl.innerHTML = '<div class="spinner-btn-interno"></div> Montando Kits...';
    
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
            throw new Error('Composição do kit não encontrada ou está vazia.');
        }

        const componentesParaPayload = [];
        for (const itemCompDef of composicaoDoKitSelecionado) {
            const idComp = itemCompDef.produto_id;
            const nomeCompParaLog = itemCompDef.produto_nome || itemCompDef.produto;
            const varComp = itemCompDef.variacao === '-' ? null : (itemCompDef.variacao || null);
            const qtdNecPorKit = parseInt(itemCompDef.quantidade) || 1;
            let qtdTotalCompNec = qtdKitsParaEnviar * qtdNecPorKit;
            const agregadoDoComponente = produtosAgregadosParaEmbalarGlobal.find(agg => String(agg.produto_id) === String(idComp) && (agg.variante || '-') === (varComp || '-'));
            if (!agregadoDoComponente || agregadoDoComponente.total_quantidade_disponivel_para_embalar < qtdTotalCompNec) {
                 throw new Error(`Saldo insuficiente para componente "${nomeCompParaLog}" (${varComp || 'Padrão'}).`);
            }
            const arrematesDisponiveisDoComponente = [...agregadoDoComponente.arremates_detalhe].filter(arr => arr.quantidade_disponivel_para_embalar > 0).sort((a, b) => new Date(a.data_lancamento) - new Date(b.data_lancamento)); 
            for (const arremateComp of arrematesDisponiveisDoComponente) {
                if (qtdTotalCompNec <= 0) break;
                const qtdUsarDesteArremate = Math.min(qtdTotalCompNec, arremateComp.quantidade_disponivel_para_embalar);
                if (qtdUsarDesteArremate > 0) {
                    componentesParaPayload.push({ id_arremate: arremateComp.id_arremate, produto_id: idComp, produto_nome: nomeCompParaLog, variacao: varComp, quantidade_usada: qtdUsarDesteArremate });
                    qtdTotalCompNec -= qtdUsarDesteArremate;
                }
            }
            if (qtdTotalCompNec > 0) { throw new Error(`Falha ao alocar saldo para "${nomeCompParaLog}" (${varComp || 'Padrão'}).`); }
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
        
        mostrarPopupMensagem(`${qtdKitsParaEnviar} kit(s) "${nomeKitProduto}" montado(s) com sucesso!`, 'sucesso');
        
        // --- LÓGICA DE ATUALIZAÇÃO E REORDENAÇÃO PÓS-AÇÃO ---
        // 1. Recalcula todos os saldos e aplica a ordenação padrão por data
        await calcularEAgruparProntosParaEmbalar(); 

        // 2. Encontra o índice do componente base que usamos para iniciar a montagem
        const indexDoComponente = produtosAgregadosParaEmbalarGlobal.findIndex(
            item => item.produto_id === componenteBaseCopia.produto_id && item.variante === componenteBaseCopia.variante
        );

        // 3. Se o componente ainda existe na lista, move para o topo
        if (indexDoComponente > -1) {
            const [componenteAtualizado] = produtosAgregadosParaEmbalarGlobal.splice(indexDoComponente, 1);
            produtosAgregadosParaEmbalarGlobal.unshift(componenteAtualizado);
            console.log(`Componente "${componenteAtualizado.produto} - ${componenteAtualizado.variante}" movido para o topo da lista.`);
        }

        // 4. Reseta a paginação para a primeira página
        currentPageEmbalagemCards = 1;
        
        // 5. Redireciona
        window.location.hash = '';
        
    } catch (error) {
        console.error('[montarKits] Erro:', error);
        mostrarPopupMensagem(`Erro ao montar kits: ${error.data?.details || error.message || error.message}`, 'erro');
    } finally {
        operacaoEmAndamento.delete('montarKits');
        if (btnMontarEl) {
            btnMontarEl.innerHTML = originalButtonHTML;
        }
        // Em caso de falha, os controles serão reabilitados quando o usuário interagir novamente
        // ou quando a view for recarregada. A lógica no 'finally' foi simplificada para
        // confiar no fluxo de recarregamento/reatualização da view.
    }
}

async function atualizarContadoresPainel() {
    console.log("[atualizarContadoresPainel] Atualizando dados do painel...");
    
    // Referências aos elementos do contador
    const contadorTotalEl = document.getElementById('contadorTotalAEmbalar');
    const contadorAguardandoEl = document.getElementById('contadorAguardandoMuitoTempo');
    const contadorHojeEl = document.getElementById('contadorEmbaladoHoje');

    // --- Contadores que usam dados já carregados (são rápidos) ---

    // 1. Total de Itens (grupos de produto/variação) a Embalar
    if (contadorTotalEl) {
        const totalAEmbalar = produtosAgregadosParaEmbalarGlobal.length;
        contadorTotalEl.textContent = totalAEmbalar;
    }

    // 2. Aguardando há mais de 2 dias
    if (contadorAguardandoEl) {
        const doisDiasAtras = new Date();
        doisDiasAtras.setHours(0, 0, 0, 0);
        doisDiasAtras.setDate(doisDiasAtras.getDate() - 2);
        
        const aguardandoMuitoTempo = produtosAgregadosParaEmbalarGlobal.filter(item => {
            if (!item.data_lancamento_mais_antiga) return false;
            const dataItem = new Date(item.data_lancamento_mais_antiga);
            dataItem.setHours(0, 0, 0, 0);
            return dataItem < doisDiasAtras;
        }).length;
        contadorAguardandoEl.textContent = aguardandoMuitoTempo;
    }
    
    // --- Contador que precisa de uma chamada de API (pode ser um pouco mais lento) ---

    // 3. Embalado Hoje
    if (contadorHojeEl) {
        try {
            // Define como "Carregando..." enquanto busca
            contadorHojeEl.textContent = '...'; 
            
            // Chama a nova API
            const response = await fetchFromAPI('/embalagens/contagem-hoje');
            
            // Atualiza com o valor real
            contadorHojeEl.textContent = response.total || 0;
            console.log(`[atualizarContadoresPainel] Total embalado hoje: ${response.total}`);
        } catch (error) {
            console.error("Erro ao buscar contagem de embalagens de hoje:", error);
            contadorHojeEl.textContent = "?"; // Indica erro na busca
            contadorHojeEl.title = "Não foi possível carregar esta informação.";
        }
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
    const embalagemListViewEl = document.getElementById('embalagemListViewNova');
    const embalarDetalheViewEl = document.getElementById('embalarDetalheView');

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
            window.location.hash = ''; 
        }
    } else { 
        embalagemListViewEl.style.display = 'block';
        embalarDetalheViewEl.style.display = 'none';
        localStorage.removeItem('embalarDetalheAtual');
        embalagemAgregadoEmVisualizacao = null;

        // --- AJUSTE PRINCIPAL ---
        console.log("Voltando para a lista. Resetando paginação e recarregando dados...");
        
        // 1. Reseta para a primeira página
        currentPageEmbalagemCards = 1; 

        // 2. Reseta os filtros para os valores padrão
        const filtroAlertaEl = document.getElementById('filtroAlertaSelect');
        const ordenacaoEl = document.getElementById('ordenacaoSelect');
        const searchInputEl = document.getElementById('searchProdutoEmbalagem');
        if (filtroAlertaEl) filtroAlertaEl.value = 'todos';
        if (ordenacaoEl) ordenacaoEl.value = 'padrao';
        if (searchInputEl) searchInputEl.value = '';
        
        // 3. Recarrega e reordena os dados
        await calcularEAgruparProntosParaEmbalar();
        
        // 4. Renderiza a lista (que agora usará currentPageEmbalagemCards = 1)
        await renderizarCardsEmbalagem();

        // 5. Atualiza os contadores do painel
        atualizarContadoresPainel();
    }
}

// --- Inicialização ---
async function inicializarDadosEViewsEmbalagem() {
    await Promise.all([
        obterProdutosDoStorage(true).then(p => { todosOsProdutosCadastrados = p; }),
        buscarArrematesCompletos()
    ]);
    await calcularEAgruparProntosParaEmbalar();
    
    // Atualiza os contadores do painel com os dados carregados
    await atualizarContadoresPainel(); // A chamada deve estar aqui e agora ser com await
    
    // Processa a view correta (lista ou detalhe)
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
        
        // Listeners de navegação e ação principais (permanentes na página)
        const fecharDetalheBtnEl = document.getElementById('fecharEmbalarDetalheBtn');
        if (fecharDetalheBtnEl) {
            fecharDetalheBtnEl.addEventListener('click', () => { window.location.hash = ''; });
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
                }
                
                if (tabId === 'kit' && embalagemAgregadoEmVisualizacao) {
                    await carregarKitsDisponiveisNova(embalagemAgregadoEmVisualizacao.produto_id, embalagemAgregadoEmVisualizacao.variante);
                } else if (tabId === 'historico' && embalagemAgregadoEmVisualizacao) {
                    let skuParaBusca = null;
                    const produtoCad = todosOsProdutosCadastrados.find(p => p.id == embalagemAgregadoEmVisualizacao.produto_id);
                    if(produtoCad) {
                        if(embalagemAgregadoEmVisualizacao.variante && embalagemAgregadoEmVisualizacao.variante !== '-') {
                            const gradeInfo = produtoCad.grade?.find(g => g.variacao === embalagemAgregadoEmVisualizacao.variante);
                            skuParaBusca = gradeInfo?.sku || produtoCad.sku;
                        } else {
                            skuParaBusca = produtoCad.sku;
                        }
                    }
                    if (skuParaBusca) {
                        carregarHistoricoEmbalagem(skuParaBusca, 1);
                    } else {
                        const tbodyHistEl = document.getElementById('historicoEmbalagemTableBody');
                        if (tbodyHistEl) tbodyHistEl.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Erro ao identificar SKU.</td></tr>';
                    }
                }
            });
        });
        
        // Listener DELEGADO para os cliques nos controles DENTRO da aba Kit (Configurado UMA VEZ)
        const kitTabPanelEl = document.getElementById('kit-tab-nova');
        if (kitTabPanelEl) {
            console.log("[DOMContentLoaded] Configurando listener DELEGADO PERMANENTE para #kit-tab-nova.");
            kitTabPanelEl.addEventListener('click', (event) => {
                const target = event.target;
                const btnMaximo = target.closest('#btnMontarMaximoKits');
                const acaoRapidaButton = target.closest('.ep-acoes-rapidas-qtd .ep-btn-outline-pequeno');

                if (btnMaximo) {
                    const currentQtdInput = document.getElementById('qtdEnviarKitsNova');
                    const currentDisponivelSpan = document.getElementById('qtdDisponivelKitsNova');
                    if (currentDisponivelSpan && currentQtdInput && !currentQtdInput.disabled) {
                        const maxMontaveis = parseInt(currentDisponivelSpan.textContent) || 0;
                        currentQtdInput.value = maxMontaveis;
                        currentQtdInput.dispatchEvent(new Event('input')); 
                    }
                    return; 
                }

                if (acaoRapidaButton && acaoRapidaButton.dataset.qtdAdd !== undefined) {
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
                    }
                    return; 
                }
            });

            const qtdEnviarKitsInputEl = document.getElementById('qtdEnviarKitsNova');
            if (qtdEnviarKitsInputEl) {
                qtdEnviarKitsInputEl.oninput = () => {
                    atualizarEstadoBotaoMontarKitNova(); 
                };
            }
        }

        // Listeners para filtros, ordenação e atualização na tela principal
        const btnAtualizarEmbalagemEl = document.getElementById('btnAtualizarEmbalagem');
        if(btnAtualizarEmbalagemEl) {
            btnAtualizarEmbalagemEl.addEventListener('click', forcarAtualizacaoEmbalagem);
        }

        const toggleFiltrosBtnEl = document.getElementById('toggleFiltrosAvancadosBtn');
        const filtrosContainerEl = document.getElementById('filtrosAvancadosContainer');
        if (toggleFiltrosBtnEl && filtrosContainerEl) {
            toggleFiltrosBtnEl.addEventListener('click', () => {
                filtrosContainerEl.classList.toggle('hidden');
                const isHidden = filtrosContainerEl.classList.contains('hidden');
                const span = toggleFiltrosBtnEl.querySelector('span');
                if (span) {
                    span.textContent = isHidden ? 'Filtros Avançados' : 'Fechar Filtros';
                }
            });
        }

        const filtroAlertaSelectEl = document.getElementById('filtroAlertaSelect');
        const ordenacaoSelectEl = document.getElementById('ordenacaoSelect');
        const searchInputEl = document.getElementById('searchProdutoEmbalagem');
        const limparFiltrosBtnEl = document.getElementById('limparFiltrosBtn');
        
        const aplicarFiltrosEOrdenar = () => {
            currentPageEmbalagemCards = 1; 
            renderizarCardsEmbalagem();
        };

        if (filtroAlertaSelectEl) filtroAlertaSelectEl.addEventListener('change', aplicarFiltrosEOrdenar);
        if (ordenacaoSelectEl) ordenacaoSelectEl.addEventListener('change', aplicarFiltrosEOrdenar);
        if(searchInputEl) searchInputEl.addEventListener('input', debounce(aplicarFiltrosEOrdenar, 350));

        if (limparFiltrosBtnEl && filtroAlertaSelectEl && ordenacaoSelectEl && searchInputEl && toggleFiltrosBtnEl && filtrosContainerEl) {
            limparFiltrosBtnEl.addEventListener('click', () => {
                filtroAlertaSelectEl.value = 'todos';
                ordenacaoSelectEl.value = 'padrao';
                searchInputEl.value = '';
                aplicarFiltrosEOrdenar();
                
                filtrosContainerEl.classList.add('hidden');
                const span = toggleFiltrosBtnEl.querySelector('span');
                if (span) {
                    span.textContent = 'Filtros Avançados';
                }
            });
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