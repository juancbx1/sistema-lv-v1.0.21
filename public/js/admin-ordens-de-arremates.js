// public/js/admin-ordens-de-arremates.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';

// --- Variáveis Globais ---
let usuarioLogado = null;
let permissoes = [];
let todosOsProdutosCadastrados = [];
let todosOsUsuarios = [];
let opsFinalizadasCompletas = [];
let todosArrematesRegistradosCache = [];
let produtosAgregadosParaArremateGlobal = [];
let arremateAgregadoEmVisualizacao = null;
let historicoDeArrematesCache = [];

// Paginação
let currentPageArremateCards = 1;
const itemsPerPageArremateCards = 6; // Aumentado para preencher melhor a tela
let currentPageHistorico = 1;
const itemsPerPageHistorico = 10;

// Controle de UI
const lancamentosArremateEmAndamento = new Set();

// --- Funções de Fetch API (Centralizadas) ---
async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarPopupMensagem('Sessão expirada. Faça login novamente.', 'erro');
        window.location.href = '/login.html';
        throw new Error('Token não encontrado');
    }

    const response = await fetch(`/api${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache', // Para garantir dados sempre frescos
            ...options.headers
        }
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP Error ${response.status}` }));
        if (response.status === 401) {
            mostrarPopupMensagem('Sessão inválida. Faça login novamente.', 'erro');
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        }
        throw new Error(errorData.error || `Erro ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
}

// --- Funções de Renderização e UI ---
function mostrarPopupMensagem(mensagem, tipo = 'erro', duracao = 5000, permitirHTML = false) {
    // Garante que não haja popups duplicados
    const popupExistente = document.querySelector('.popup-mensagem');
    if (popupExistente) popupExistente.closest('.popup-container-oa').remove();

    const containerId = `popup-container-oa-${Date.now()}`;
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'popup-container-oa'; // Um wrapper para o popup e o overlay

    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';

    const popup = document.createElement('div');
    popup.className = `popup-mensagem popup-${tipo}`;
    
    if (permitirHTML) {
        popup.innerHTML = `<p>${mensagem}</p>`;
    } else {
        const p = document.createElement('p');
        p.textContent = mensagem;
        popup.appendChild(p);
    }
    
    const fecharBtn = document.createElement('button');
    fecharBtn.textContent = 'OK';
    
    // Função para fechar o popup com animação
    const removerPopup = () => {
        const popupEl = popup;
        const overlayEl = overlay;
        
        // Adiciona classes de animação de saída (se definidas no CSS)
        popupEl.style.animation = 'oa-fadeOutPopup 0.3s ease-out forwards';
        overlayEl.style.animation = 'oa-fadeOutOverlayPopup 0.3s ease-out forwards';
        
        // Remove os elementos após a animação
        setTimeout(() => {
            const containerEl = document.getElementById(containerId);
            if (containerEl) containerEl.remove();
        }, 300);
    };

    fecharBtn.onclick = removerPopup;
    popup.appendChild(fecharBtn);
    
    container.appendChild(overlay);
    container.appendChild(popup);
    document.body.appendChild(container);
    
    if (duracao > 0) {
        setTimeout(removerPopup, duracao);
    }
}

function obterQuantidadeFinalProduzida(op) {
    if (!op || !op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) {
        return parseInt(op?.quantidade) || 0;
    }
    for (let i = op.etapas.length - 1; i >= 0; i--) {
        const etapa = op.etapas[i];
        if (etapa && etapa.lancado && typeof etapa.quantidade !== 'undefined' && etapa.quantidade !== null) {
            const qtdEtapa = parseInt(etapa.quantidade, 10);
            if (!isNaN(qtdEtapa) && qtdEtapa >= 0) {
                return qtdEtapa;
            }
        }
    }
    return parseInt(op.quantidade) || 0;
}

// --- Lógica de Dados ---
async function buscarDadosIniciais() {
    const [produtos, usuarios, opsFinalizadas, arrematesRegistrados] = await Promise.all([
        obterProdutosDoStorage(true),
        fetchFromAPI('/usuarios'),
        fetchFromAPI('/ops-para-embalagem?all=true'),
        fetchFromAPI('/arremates')
    ]);

    todosOsProdutosCadastrados = produtos || [];
    todosOsUsuarios = usuarios || [];
    opsFinalizadasCompletas = opsFinalizadas?.rows || [];
    todosArrematesRegistradosCache = arrematesRegistrados || [];
}

function calcularPendenciasDeArremate(itemParaPriorizar = null) {
    const opsComSaldo = opsFinalizadasCompletas.map(op => {
        const quantidadeProduzida = obterQuantidadeFinalProduzida(op);
        const totalJaArrematado = todosArrematesRegistradosCache
            .filter(arremate => arremate.op_numero === op.numero)
            .reduce((acc, curr) => acc + (parseInt(curr.quantidade_arrematada) || 0), 0);
        
        const quantidadePendente = quantidadeProduzida - totalJaArrematado;

        return {
            ...op,
            quantidade_produzida_original: quantidadeProduzida,
            quantidade_pendente_arremate: quantidadePendente
        };
    }).filter(op => op.quantidade_pendente_arremate > 0);

    const aggregatedMap = new Map();
    opsComSaldo.forEach(op => {
        const key = `${op.produto}|${op.variante || '-'}`;
        if (!aggregatedMap.has(key)) {
            aggregatedMap.set(key, {
                produto: op.produto,
                variante: op.variante || '-',
                total_quantidade_pendente_arremate: 0,
                ops_detalhe: [],
                ultima_atualizacao: new Date(0) 
            });
        }
        const item = aggregatedMap.get(key);
        item.total_quantidade_pendente_arremate += op.quantidade_pendente_arremate;
        item.ops_detalhe.push({
            numero: op.numero,
            edit_id: op.edit_id,
            quantidade_pendente_nesta_op: op.quantidade_pendente_arremate
        });
        const dataCriacaoOP = new Date(op.data_criacao || op.data_final);
        if (dataCriacaoOP > item.ultima_atualizacao) {
            item.ultima_atualizacao = dataCriacaoOP;
        }
    });

    let listaAgregada = Array.from(aggregatedMap.values());
    
    // Lógica de Priorização
    if (itemParaPriorizar) {
        const itemIndex = listaAgregada.findIndex(
            p => p.produto === itemParaPriorizar.produto && p.variante === itemParaPriorizar.variante
        );
        if (itemIndex !== -1) {
            const [itemMovido] = listaAgregada.splice(itemIndex, 1);
            // Ordena o resto da lista
            const restoOrdenado = listaAgregada.sort((a, b) => b.ultima_atualizacao - a.ultima_atualizacao);
            // Coloca o item movido no topo
            produtosAgregadosParaArremateGlobal = [itemMovido, ...restoOrdenado];
            return; // Encerra a função aqui
        }
    }
    
    // Se não há item a priorizar, faz a ordenação padrão
    produtosAgregadosParaArremateGlobal = listaAgregada.sort((a, b) => b.ultima_atualizacao - a.ultima_atualizacao);
}

// --- Funções de Renderização da UI ---
function renderizarDashboard() {
    const totalProdutos = produtosAgregadosParaArremateGlobal.length;
    const totalUnidades = produtosAgregadosParaArremateGlobal.reduce((acc, item) => acc + item.total_quantidade_pendente_arremate, 0);

    document.getElementById('contadorProdutosPendentes').textContent = totalProdutos;
    document.getElementById('contadorUnidadesPendentes').textContent = totalUnidades;
}

function renderizarCardsArremate(page = 1) {
    currentPageArremateCards = page;
    const container = document.getElementById('arremateCardsContainer');
    const paginationContainer = document.getElementById('arrematePaginationContainer');
    container.innerHTML = '';
    paginationContainer.innerHTML = '';

    if (produtosAgregadosParaArremateGlobal.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--oa-cor-cinza-texto-secundario);">Nenhum item aguardando arremate. Bom trabalho!</p>';
        return;
    }

    const paginatedItems = paginarArray(produtosAgregadosParaArremateGlobal, currentPageArremateCards, itemsPerPageArremateCards);

    paginatedItems.items.forEach(item => {
        const card = document.createElement('div');
        // A classe base já tem a borda cinza por padrão. Nenhuma lógica de status é mais necessária.
        card.className = 'oa-card-arremate';

        const produtoInfo = todosOsProdutosCadastrados.find(p => p.nome === item.produto);
        const imagemSrc = obterImagemProduto(produtoInfo, item.variante);
        const opsOrigemCount = item.ops_detalhe.length;

        card.innerHTML = `
            <img src="${imagemSrc}" alt="${item.produto}" class="oa-card-img" onerror="this.src='/img/placeholder-image.png'">
            <div class="oa-card-info">
                <h3>${item.produto}</h3>
                <p>${item.variante !== '-' ? item.variante : 'Padrão'}</p>
            </div>
            <div class="oa-card-dados">
                <div class="dado-bloco">
                    <span class="label">Pendente:</span>
                    <span class="valor total-pendente">${item.total_quantidade_pendente_arremate}</span>
                </div>
                <div class="dado-bloco">
                    <span class="label">OPS:</span>
                    <span class="valor">${opsOrigemCount}</span>
                </div>
            </div>
        `;
        card.dataset.arremateAgregado = JSON.stringify(item);
        card.addEventListener('click', handleArremateCardClick);
        container.appendChild(card);
    });

    renderizarPaginacao(paginationContainer, paginatedItems.totalPages, currentPageArremateCards, renderizarCardsArremate);
}

function renderizarViewPrincipal() {
    renderizarDashboard();
    renderizarCardsArremate(1);
    document.getElementById('arrematesListView').classList.remove('hidden');
    document.getElementById('arremateDetalheView').classList.add('hidden');
}

// --- Funções de Detalhe e Lançamento ---
function handleArremateCardClick(event) {
    const card = event.currentTarget;
    const agregadoString = card.dataset.arremateAgregado;
    if (!agregadoString) return;
    
    arremateAgregadoEmVisualizacao = JSON.parse(agregadoString);
    localStorage.setItem('arremateDetalheAtual', agregadoString);
    window.location.hash = '#lancar-arremate';
}

async function carregarDetalhesArremateView(agregado) {
    // Busca as referências dos elementos
    const selectUser = document.getElementById('selectUsuarioArremate');
    const inputQtd = document.getElementById('inputQuantidadeArrematar');
    const btnLancar = document.getElementById('btnLancarArremateAgregado');
    const btnAbrirModalPerda = document.getElementById('btnAbrirModalPerda'); // Novo botão

    // Preenchimento de informações do produto (código existente)
     const produtoInfo = todosOsProdutosCadastrados.find(p => p.nome === agregado.produto);
    const imagemSrc = obterImagemProduto(produtoInfo, agregado.variante);
    document.getElementById('arremateDetalheThumbnail').innerHTML = `<img src="${imagemSrc}" alt="${agregado.produto}" onerror="this.src='/img/placeholder-image.png'">`;
    document.getElementById('arremateProdutoNomeDetalhe').textContent = agregado.produto;
    document.getElementById('arremateVarianteNomeDetalhe').textContent = agregado.variante !== '-' ? `(${agregado.variante})` : '';
    document.getElementById('arremateTotalPendenteAgregado').textContent = agregado.total_quantidade_pendente_arremate;
    const opsContainer = document.getElementById('arremateOpsOrigemContainer');
    opsContainer.innerHTML = '';
    agregado.ops_detalhe.sort((a, b) => a.numero - b.numero).forEach(op => {
        opsContainer.innerHTML += `<p>OP ${op.numero}: <strong>${op.quantidade_pendente_nesta_op}</strong> pendente(s)</p>`;
    });

    // --- RESET E PREENCHIMENTO DO FORMULÁRIO ---
    selectUser.disabled = false;
    inputQtd.disabled = false;
    btnLancar.disabled = true;
    btnAbrirModalPerda.disabled = false; // Botão de perda começa habilitado por padrão
    
    // Popula o select de usuários
    selectUser.innerHTML = '<option value="">Selecione o Tiktik</option>';
    const usuariosTiktik = todosOsUsuarios.filter(u => u.tipos?.includes('tiktik'));
    if (usuariosTiktik.length === 0) {
        selectUser.innerHTML = '<option value="">Nenhum usuário Tiktik encontrado</option>';
        selectUser.disabled = true;
    } else {
        usuariosTiktik.forEach(user => selectUser.add(new Option(user.nome, user.nome)));
    }

    // Configura o input de quantidade
    inputQtd.value = '';
    inputQtd.max = agregado.total_quantidade_pendente_arremate;
    
    // --- LÓGICA DE HABILITAÇÃO E PERMISSÕES ---
    const validarCamposParaLancar = () => {
        if (!permissoes.includes('lancar-arremate')) {
            btnLancar.disabled = true;
            return;
        }
        const quantidadeValida = parseInt(inputQtd.value) > 0 && parseInt(inputQtd.value) <= agregado.total_quantidade_pendente_arremate;
        const usuarioValido = selectUser.value !== '';
        btnLancar.disabled = !(quantidadeValida && usuarioValido);
    };
    
    // Verifica a permissão para o botão de perda
    if (!permissoes.includes('registrar-perda-arremate')) {
        btnAbrirModalPerda.disabled = true;
    }

    // Adiciona os listeners
    selectUser.addEventListener('change', validarCamposParaLancar);
    inputQtd.addEventListener('input', validarCamposParaLancar);
    validarCamposParaLancar(); // Executa uma vez para definir o estado inicial
}

async function lancarArremateAgregado() {
    if (!arremateAgregadoEmVisualizacao) return;

    const selectUser = document.getElementById('selectUsuarioArremate');
    const inputQtd = document.getElementById('inputQuantidadeArrematar');
    const btnLancar = document.getElementById('btnLancarArremateAgregado');

    const usuarioTiktik = selectUser.value;
    const quantidadeTotal = parseInt(inputQtd.value);

    // Validações... (permanecem as mesmas)
    if (!usuarioTiktik) return mostrarPopupMensagem('Por favor, selecione um usuário Tiktik para continuar.', 'aviso');
    if (isNaN(quantidadeTotal) || quantidadeTotal <= 0) return mostrarPopupMensagem('A quantidade a ser arrematada deve ser um número maior que zero.', 'aviso');
    if (quantidadeTotal > arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate) return mostrarPopupMensagem('A quantidade informada excede o total pendente para este item.', 'aviso');
    
    // Bloqueio de UI... (permanece o mesmo)
    const lockKey = arremateAgregadoEmVisualizacao.produto + arremateAgregadoEmVisualizacao.variante;
    if (lancamentosArremateEmAndamento.has(lockKey)) return;
    lancamentosArremateEmAndamento.add(lockKey);

    const originalButtonHTML = btnLancar.innerHTML;
    btnLancar.disabled = true;
    btnLancar.innerHTML = '<div class="spinner-btn-interno"></div> Lançando...';
    selectUser.disabled = true;
    inputQtd.disabled = true;

    try {
        let quantidadeRestante = quantidadeTotal;
        const opsOrdenadas = arremateAgregadoEmVisualizacao.ops_detalhe.sort((a, b) => a.numero - b.numero);

        for (const op of opsOrdenadas) {
            if (quantidadeRestante <= 0) break;
            const qtdParaEstaOP = Math.min(quantidadeRestante, op.quantidade_pendente_nesta_op);
            if (qtdParaEstaOP > 0) {
                const payload = {
                    op_numero: op.numero,
                    produto: arremateAgregadoEmVisualizacao.produto,
                    variante: arremateAgregadoEmVisualizacao.variante === '-' ? null : arremateAgregadoEmVisualizacao.variante,
                    quantidade_arrematada: qtdParaEstaOP,
                    usuario_tiktik: usuarioTiktik
                };
                await fetchFromAPI('/arremates', { method: 'POST', body: JSON.stringify(payload) });
                quantidadeRestante -= qtdParaEstaOP;
            }
        }
        
        mostrarPopupMensagem('Arremate lançado com sucesso!', 'sucesso');
        
        // CORREÇÃO: Volta para a tela principal programaticamente
        window.location.hash = '';

    } catch (error) {
        console.error("Erro ao lançar arremate agregado:", error);
        mostrarPopupMensagem(`Erro ao lançar arremate: ${error.message}`, 'erro');
        // Reabilita a UI para o usuário tentar novamente em caso de erro
        selectUser.disabled = false;
        inputQtd.disabled = false;
    } finally {
        // Garante que o botão e o lock sejam resetados
        btnLancar.disabled = false;
        btnLancar.innerHTML = '<i class="fas fa-check"></i> Lançar Arremate';
        lancamentosArremateEmAndamento.delete(lockKey);
    }
}

function abrirModalPerda() {
    if (!arremateAgregadoEmVisualizacao) return;

    // Verifica a permissão antes de abrir
    if (!permissoes.includes('registrar-perda-arremate')) {
        mostrarPopupMensagem('Você não tem permissão para registrar perdas.', 'aviso');
        return;
    }

    const modal = document.getElementById('modalRegistrarPerda');
    const infoProdutoEl = document.getElementById('infoProdutoModalPerda');
    const inputQtd = document.getElementById('inputQuantidadePerdida');

    // Preenche as informações do produto no modal
    infoProdutoEl.textContent = `${arremateAgregadoEmVisualizacao.produto} (${arremateAgregadoEmVisualizacao.variante || 'Padrão'})`;
    
    // Reseta o formulário
    document.getElementById('formRegistrarPerda').reset();
    
    // Define o máximo que pode ser perdido
    inputQtd.max = arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate;

    modal.classList.remove('hidden');
}

function fecharModalPerda() {
    document.getElementById('modalRegistrarPerda').classList.add('hidden');
}

async function registrarPerda() {
    if (!arremateAgregadoEmVisualizacao) return;

    const motivo = document.getElementById('selectMotivoPerda').value;
    const quantidadePerdida = parseInt(document.getElementById('inputQuantidadePerdida').value);
    const observacao = document.getElementById('textareaObservacaoPerda').value;
    const totalPendente = arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate;

    // Validações...
    if (!motivo) return mostrarPopupMensagem('Selecione o motivo da perda.', 'aviso');
    if (isNaN(quantidadePerdida) || quantidadePerdida <= 0) return mostrarPopupMensagem('A quantidade perdida deve ser maior que zero.', 'aviso');
    if (quantidadePerdida > totalPendente) return mostrarPopupMensagem(`A quantidade perdida não pode ser maior que o total pendente de ${totalPendente}.`, 'aviso');
    
    const btnConfirmar = document.getElementById('btnConfirmarRegistroPerda');
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<div class="spinner-btn-interno"></div> Registrando...';
    
    try {
        const payload = {
            produto: arremateAgregadoEmVisualizacao.produto,
            variante: arremateAgregadoEmVisualizacao.variante === '-' ? null : arremateAgregadoEmVisualizacao.variante,
            quantidadePerdida: quantidadePerdida,
            motivo: motivo,
            observacao: observacao,
            opsOrigem: arremateAgregadoEmVisualizacao.ops_detalhe 
        };
        
        await fetchFromAPI('/arremates/registrar-perda', { method: 'POST', body: JSON.stringify(payload) });

        mostrarPopupMensagem('Perda registrada com sucesso!', 'sucesso', 2500); // Popup com duração de 2.5s
        fecharModalPerda();

        // Espera um pouco para o usuário ver o popup antes de redirecionar
        await new Promise(resolve => setTimeout(resolve, 500)); 
        window.location.hash = '';

    } catch (error) {
        mostrarPopupMensagem(`Erro ao registrar perda: ${error.message}`, 'erro');
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '<i class="fas fa-save"></i> Confirmar Perda';
    }
}


// --- Funções Auxiliares de UI (Paginação, Imagem, etc.) ---
function paginarArray(array, page, itemsPerPage) {
    const totalPages = Math.ceil(array.length / itemsPerPage) || 1;
    page = Math.max(1, Math.min(page, totalPages));
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return {
        items: array.slice(start, end),
        currentPage: page,
        totalPages: totalPages
    };
}

function renderizarPaginacao(container, totalPages, currentPage, callback) {
    container.innerHTML = '';
    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    const criarBtn = (texto, page, isDisabled) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn';
        btn.textContent = texto;
        btn.disabled = isDisabled;
        btn.onclick = () => callback(page);
        return btn;
    };

    container.appendChild(criarBtn('Anterior', currentPage - 1, currentPage === 1));
    const pageInfo = document.createElement('span');
    pageInfo.className = 'pagination-current';
    pageInfo.textContent = `Pág. ${currentPage} de ${totalPages}`;
    container.appendChild(pageInfo);
    container.appendChild(criarBtn('Próximo', currentPage + 1, currentPage === totalPages));
}

function obterImagemProduto(produtoInfo, varianteNome) {
    if (!produtoInfo) return '/img/placeholder-image.png';
    if (varianteNome && varianteNome !== '-') {
        const gradeItem = produtoInfo.grade?.find(g => g.variacao === varianteNome);
        if (gradeItem?.imagem) return gradeItem.imagem;
    }
    return produtoInfo.imagem || '/img/placeholder-image.png';
}

// --- Histórico ---
async function carregarHistorico() {
    try {
        historicoDeArrematesCache = await fetchFromAPI('/arremates/historico');
    } catch (error) {
        mostrarPopupMensagem('Erro ao carregar histórico.', 'erro');
        historicoDeArrematesCache = [];
    }
}

function renderizarHistoricoModal(page = 1) {
    currentPageHistorico = page;
    const corpoTabela = document.getElementById('historicoTabelaCorpo');
    const paginacaoContainer = document.getElementById('historicoPaginacao');
    corpoTabela.innerHTML = '';
    
    if (historicoDeArrematesCache.length === 0) {
        corpoTabela.innerHTML = '<tr><td data-label="Status" colspan="6" style="text-align: center;">Nenhum arremate nos últimos 7 dias.</td></tr>';
        paginacaoContainer.innerHTML = '';
        return;
    }

    const paginated = paginarArray(historicoDeArrematesCache, page, itemsPerPageHistorico);
    paginated.items.forEach(item => {
        const isPerda = item.tipo_lancamento === 'PERDA';
        const classeLinha = isPerda ? 'linha-perda' : '';
        const quantidadeDisplay = isPerda ? `-${item.quantidade_arrematada}` : `+${item.quantidade_arrematada}`;
        const tiktikDisplay = isPerda ? `<span style="color: var(--oa-cor-vermelho-perigo); font-style: italic;">Perda</span>` : item.usuario_tiktik;
        
        // Adicionamos data-label a cada <td>
        const tr = `
            <tr class="${classeLinha}">
                <td data-label="Produto">${item.produto}${item.variante ? ` | ${item.variante}` : ''}</td>
                <td data-label="Quantidade" style="font-weight: bold; color: ${isPerda ? 'var(--oa-cor-vermelho-perigo)' : 'var(--oa-cor-verde-sucesso)'};">${quantidadeDisplay}</td>
                <td data-label="Feito por">${tiktikDisplay}</td>
                <td data-label="Lançado por">${item.lancado_por || 'N/A'}</td>
                <td data-label="Data">${new Date(item.data_lancamento).toLocaleString('pt-BR')}</td>
                <td data-label="OP Origem">${item.op_numero}</td>
            </tr>
        `;
        corpoTabela.innerHTML += tr;
    });

    renderizarPaginacao(paginacaoContainer, paginated.totalPages, paginated.currentPage, renderizarHistoricoModal);
}

function abrirModalHistorico() {
    document.getElementById('historicoModalContainer').classList.remove('hidden');
    renderizarHistoricoModal(1);
}

function fecharModalHistorico() {
    document.getElementById('historicoModalContainer').classList.add('hidden');
}

// --- Roteador e Inicialização ---
async function handleHashChange() {
    const hash = window.location.hash;
    const arrematesListView = document.getElementById('arrematesListView');
    const arremateDetalheView = document.getElementById('arremateDetalheView');

    arrematesListView.classList.add('hidden');
    arremateDetalheView.classList.add('hidden');

    try {
        if (hash === '#lancar-arremate') {
            const data = localStorage.getItem('arremateDetalheAtual');
            if (data) {
                arremateDetalheView.classList.remove('hidden');
                await carregarDetalhesArremateView(JSON.parse(data));
            } else {
                window.location.hash = '';
            }
        } else {
            const itemModificado = arremateAgregadoEmVisualizacao; // Guarda a referência antes de limpar
            localStorage.removeItem('arremateDetalheAtual');
            arremateAgregadoEmVisualizacao = null; // Limpa o estado global

            arrematesListView.classList.remove('hidden');
            const container = document.getElementById('arremateCardsContainer');
            container.innerHTML = '<div class="spinner">Atualizando...</div>';

            await buscarDadosIniciais();
            
            // Passa o item modificado para a função de cálculo
            calcularPendenciasDeArremate(itemModificado); 
            renderizarViewPrincipal();
        }
    } catch (e) {
        console.error("Erro no roteamento de hash:", e);
        mostrarPopupMensagem(`Erro ao navegar: ${e.message}`, 'erro');
    }
}

function configurarEventListeners() {
    document.getElementById('fecharArremateDetalheBtn')?.addEventListener('click', () => window.location.hash = '');
    
    // Listener do botão de Lançar com verificação de permissão no clique
    document.getElementById('btnLancarArremateAgregado')?.addEventListener('click', () => {
        if (!permissoes.includes('lancar-arremate')) {
            mostrarPopupMensagem('Você não tem permissão para lançar arremates.', 'aviso');
            return;
        }
        lancarArremateAgregado();
    });

    // Listeners para o novo modal de perda
    document.getElementById('btnAbrirModalPerda')?.addEventListener('click', abrirModalPerda);
    document.getElementById('btnFecharModalPerda')?.addEventListener('click', fecharModalPerda);
    document.getElementById('btnConfirmarRegistroPerda')?.addEventListener('click', registrarPerda);
    document.querySelector('#modalRegistrarPerda .oa-popup-overlay')?.addEventListener('click', fecharModalPerda);

    // Listeners do histórico
    document.getElementById('btnAbrirHistorico')?.addEventListener('click', abrirModalHistorico);
    document.getElementById('btnFecharHistorico')?.addEventListener('click', fecharModalHistorico);
    document.querySelector('#historicoModalContainer .oa-popup-overlay')?.addEventListener('click', fecharModalHistorico);

    window.addEventListener('hashchange', handleHashChange);
}

async function inicializarPagina() {
    const overlay = document.getElementById('paginaLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden'); // Mostra o overlay

    try {
        await buscarDadosIniciais();
        await carregarHistorico();
        await handleHashChange();
    } catch (error) {
        console.error("Erro na inicialização:", error);
        mostrarPopupMensagem(`Falha ao carregar a página: ${error.message}`, 'erro');
    } finally {
        // Esconde o overlay no final, seja com sucesso ou erro
        if (overlay) overlay.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/ordens-de-arremates.html', ['acesso-ordens-de-arremates']);
        if (!auth) return;
        usuarioLogado = auth.usuario;
        permissoes = auth.permissoes || [];
        document.body.classList.add('autenticado');
        configurarEventListeners();
        await inicializarPagina();
    } catch(err) {
        console.error("Falha de autenticação ou inicialização", err);
    }
});