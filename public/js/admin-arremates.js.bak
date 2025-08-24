// public/js/admin-ordens-de-arremates.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';
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
let totaisDaFilaDeArremate = { totalGrupos: 0, totalPecas: 0 };


// Paginação
let currentPageArremateCards = 1;
const itemsPerPageArremateCards = 6; // Aumentado para preencher melhor a tela
let currentPageHistorico = 1;
const itemsPerPageHistorico = 10;

let historicoArrematesCurrentPage = 1;


// Controle de UI
const lancamentosArremateEmAndamento = new Set();

// --- Funções de Fetch API (Centralizadas) ---
async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarMensagem('Sessão expirada. Faça login novamente.', 'erro');
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
            mostrarMensagem('Sessão inválida. Faça login novamente.', 'erro');
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        }
        throw new Error(errorData.error || `Erro ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
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

// helper para criar query strings
function objectToQueryString(obj) {
    return Object.keys(obj)
        .map(key => obj[key] ? `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}` : '')
        .filter(Boolean)
        .join('&');
}

async function renderizarItensNaFila(page = 1) {
    currentPageArremateCards = page;
    const container = document.getElementById('arremateCardsContainer');
    const paginationContainer = document.getElementById('arrematePaginationContainer');
    if (!container || !paginationContainer) return;

    container.innerHTML = '<div class="spinner">Buscando...</div>';
    paginationContainer.innerHTML = '';

    try {
        const searchTerm = document.getElementById('searchProdutoArremate').value;
        const sortBy = document.getElementById('ordenacaoSelect').value;
        
        const params = {
            search: searchTerm,
            sortBy: sortBy,
            page: currentPageArremateCards,
            limit: itemsPerPageArremateCards
        };

        // <<< CHAMANDO O NOVO ENDPOINT CORRETO >>>
        const response = await fetchFromAPI(`/arremates/fila?${objectToQueryString(params)}`);
        const { rows: agregados, pagination } = response;

        // <<< GUARDE OS TOTAIS AQUI >>>
        totaisDaFilaDeArremate.totalGrupos = pagination.totalItems || 0;
        totaisDaFilaDeArremate.totalPecas = pagination.totalPecas || 0;
        
        // Atualiza a variável global para ser usada na tela de detalhes
        produtosAgregadosParaArremateGlobal = agregados;

         await atualizarDashboard();

        container.innerHTML = '';
        if (agregados.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 20px;">Nenhum item aguardando arremate.</p>';
            paginationContainer.style.display = 'none';
            return;
        }

        agregados.forEach(item => {
            const card = document.createElement('div');
            card.className = 'oa-card-arremate';

            const produtoInfo = todosOsProdutosCadastrados.find(p => p.id == item.produto_id);
            const imagemSrc = obterImagemProduto(produtoInfo, item.variante);
            const opsOrigemCount = item.ops_detalhe.length;

            card.innerHTML = `
                <img src="${imagemSrc}" alt="${item.produto_nome}" class="oa-card-img" onerror="this.src='/img/placeholder-image.png'">
                <div class="oa-card-info">
                    <h3>${item.produto_nome}</h3>
                    <p>${item.variante && item.variante !== '-' ? item.variante : 'Padrão'}</p>
                </div>
                <div class="oa-card-dados">
                    <div class="dado-bloco">
                        <span class="label">Pendente:</span>
                        <span class="valor total-pendente">${item.saldo_para_arrematar}</span>
                    </div>
                    <div class="dado-bloco">
                        <span class="label">OPS:</span>
                        <span class="valor">${opsOrigemCount}</span>
                    </div>
                </div>
            `;
            
            // Prepara o objeto para a tela de detalhes
            const itemParaDetalhes = {
                produto_id: item.produto_id,
                produto: item.produto_nome,
                variante: item.variante,
                total_quantidade_pendente_arremate: item.saldo_para_arrematar,
                ops_detalhe: item.ops_detalhe
            };

            card.dataset.arremateAgregado = JSON.stringify(itemParaDetalhes);
            card.addEventListener('click', handleArremateCardClick);
            container.appendChild(card);
        });
        
        renderizarPaginacao(paginationContainer, pagination.totalPages, pagination.currentPage, renderizarItensNaFila);

    } catch (error) {
        console.error("Erro ao renderizar itens da fila de arremate:", error);
        container.innerHTML = `<p style="text-align: center; color: red;">Falha ao carregar itens. Tente novamente.</p>`;
    }
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
    // Preenche o cabeçalho
    const produtoInfo = todosOsProdutosCadastrados.find(p => p.id == agregado.produto_id);
    const imagemSrc = obterImagemProduto(produtoInfo, agregado.variante);
    document.getElementById('arremateDetalheThumbnail').innerHTML = `<img src="${imagemSrc}" alt="${agregado.produto}" onerror="this.src='/img/placeholder-image.png'">`;
    document.getElementById('arremateProdutoNomeDetalhe').textContent = agregado.produto;
    document.getElementById('arremateVarianteNomeDetalhe').textContent = agregado.variante && agregado.variante !== '-' ? `(${agregado.variante})` : '';
    document.getElementById('arremateTotalPendenteAgregado').textContent = agregado.total_quantidade_pendente_arremate;
    
    // Reseta e preenche o formulário da primeira aba (Lançar Arremate)
    const formLancar = document.getElementById('formLancarArremate');
    formLancar.reset();
    
    const selectUser = document.getElementById('selectUsuarioArremate');
    selectUser.innerHTML = '<option value="">Selecione o Tiktik</option>';
    const usuariosTiktik = todosOsUsuarios.filter(u => u.tipos?.includes('tiktik'));
    usuariosTiktik.forEach(user => selectUser.add(new Option(user.nome, user.id)));

    const inputQtd = document.getElementById('inputQuantidadeArrematar');
    inputQtd.max = agregado.total_quantidade_pendente_arremate;
    
    const btnLancar = document.getElementById('btnLancarArremateAgregado');
    
    // Lógica para habilitar/desabilitar o botão de lançar
    const validarCampos = () => {
        const usuarioValido = selectUser.value !== '';
        const qtdValida = parseInt(inputQtd.value) > 0 && parseInt(inputQtd.value) <= agregado.total_quantidade_pendente_arremate;
        btnLancar.disabled = !(usuarioValido && qtdValida && permissoes.includes('lancar-arremate'));
    };
    
    selectUser.onchange = validarCampos;
    inputQtd.oninput = validarCampos;
    validarCampos(); // Validação inicial

    // Reseta o formulário de ajuste (segunda aba)
    const formAjuste = document.getElementById('formRegistrarAjuste');
    formAjuste.reset();
    document.getElementById('inputQuantidadeAjuste').max = agregado.total_quantidade_pendente_arremate;
    
    // Define a primeira aba como ativa
    document.querySelectorAll('.oa-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.oa-tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelector('.oa-tab-btn[data-tab="lancar"]').classList.add('active');
    document.querySelector('#lancar-tab').classList.add('active');
}

async function lancarArremateAgregado() {
    if (!arremateAgregadoEmVisualizacao) return;

    const selectUser = document.getElementById('selectUsuarioArremate');
    const inputQtd = document.getElementById('inputQuantidadeArrematar');
    const btnLancar = document.getElementById('btnLancarArremateAgregado');

    const usuarioTiktikId = parseInt(selectUser.value);
    const quantidadeTotal = parseInt(inputQtd.value);

    // Validação
    if (!usuarioTiktikId || isNaN(quantidadeTotal) || quantidadeTotal <= 0 || quantidadeTotal > arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate) {
        mostrarMensagem('Verifique os dados. Usuário e quantidade válida são obrigatórios.', 'aviso');
        return;
    }

    const usuarioSelecionado = todosOsUsuarios.find(u => u.id === usuarioTiktikId);
    if (!usuarioSelecionado) {
        mostrarMensagem('Erro: Usuário Tiktik selecionado não foi encontrado.', 'erro');
        return;
    }
    const nomeUsuarioTiktik = usuarioSelecionado.nome;
    
    const lockKey = arremateAgregadoEmVisualizacao.produto + arremateAgregadoEmVisualizacao.variante;
    if (lancamentosArremateEmAndamento.has(lockKey)) return;
    lancamentosArremateEmAndamento.add(lockKey);

    btnLancar.disabled = true;
    btnLancar.innerHTML = '<div class="spinner-btn-interno"></div> Lançando...';

    try {
        let quantidadeRestante = quantidadeTotal;
        const opsOrdenadas = arremateAgregadoEmVisualizacao.ops_detalhe.sort((a, b) => a.numero - b.numero);

        for (const op of opsOrdenadas) {
            if (quantidadeRestante <= 0) break;
            
            // --- MUDANÇA AQUI ---
            // Usamos 'saldo_op' que vem da API, em vez de 'quantidade_pendente_nesta_op'
            const qtdParaEstaOP = Math.min(quantidadeRestante, op.saldo_op);

            
            if (qtdParaEstaOP > 0) {
                // Monta o payload para o backend
                const payload = {
                    op_numero: op.numero,
                    op_edit_id: op.edit_id,
                    produto_id: arremateAgregadoEmVisualizacao.produto_id,
                    variante: arremateAgregadoEmVisualizacao.variante === '-' ? null : arremateAgregadoEmVisualizacao.variante,
                    quantidade_arrematada: qtdParaEstaOP,
                    usuario_tiktik: nomeUsuarioTiktik,
                    usuario_tiktik_id: usuarioTiktikId
                };
                
                // Envia para a rota POST original
                await fetchFromAPI('/arremates', { method: 'POST', body: JSON.stringify(payload) });
                quantidadeRestante -= qtdParaEstaOP;
            }
        }
        
        mostrarMensagem('Arremate lançado com sucesso!', 'sucesso');
        // Força o recarregamento da lista
        window.location.hash = ''; 

    } catch (error) {
        console.error("Erro ao lançar arremate agregado:", error);
        mostrarMensagem(`Erro ao lançar arremate: ${error.message}`, 'erro');
    } finally {
        btnLancar.disabled = false;
        btnLancar.innerHTML = '<i class="fas fa-check"></i> Lançar Arremate';
        lancamentosArremateEmAndamento.delete(lockKey);
    }
}

function abrirModalPerda() {
    if (!arremateAgregadoEmVisualizacao) return;

    // Verifica a permissão antes de abrir
    if (!permissoes.includes('registrar-perda-arremate')) {
        mostrarMensagem('Você não tem permissão para registrar perdas.', 'aviso');
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

async function registrarAjuste() {
    if (!arremateAgregadoEmVisualizacao) return;

    const motivo = document.getElementById('selectMotivoAjuste').value;
    const quantidadePerdida = parseInt(document.getElementById('inputQuantidadeAjuste').value);
    const observacao = document.getElementById('textareaObservacaoAjuste').value;
    const totalPendente = arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate;

    // Validações
    if (!motivo) return mostrarMensagem('Por favor, selecione o motivo do ajuste.', 'aviso');
    if (isNaN(quantidadePerdida) || quantidadePerdida <= 0) return mostrarMensagem('A quantidade a ser descontada deve ser maior que zero.', 'aviso');
    if (quantidadePerdida > totalPendente) return mostrarMensagem(`A quantidade a descontar (${quantidadePerdida}) excede o saldo pendente (${totalPendente}).`, 'erro');

    const btnConfirmar = document.getElementById('btnConfirmarRegistroAjuste');
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<div class="spinner-btn-interno"></div> Registrando...';
    
    try {
        const payload = {
            produto_id: arremateAgregadoEmVisualizacao.produto_id,
            variante: arremateAgregadoEmVisualizacao.variante === '-' ? null : arremateAgregadoEmVisualizacao.variante,
            quantidadePerdida: quantidadePerdida,
            motivo: motivo,
            observacao: observacao,
            // O backend precisa das OPs originais para saber de onde dar baixa no saldo
            opsOrigem: arremateAgregadoEmVisualizacao.ops_detalhe.map(op => ({
                numero: op.numero,
                quantidade_pendente_nesta_op: op.saldo_op
            }))
        };
        
        // Usamos a mesma rota de registrar-perda, pois a lógica no backend é a mesma
        await fetchFromAPI('/arremates/registrar-perda', { method: 'POST', body: JSON.stringify(payload) });

        mostrarMensagem('Ajuste registrado com sucesso!', 'sucesso');
        window.location.hash = ''; // Volta para a lista

    } catch (error) {
        mostrarMensagem(`Erro ao registrar ajuste: ${error.message}`, 'erro');
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '<i class="fas fa-save"></i> Confirmar Ajuste de Saldo';
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


async function handleEstornoClick(event) {
    const button = event.currentTarget;
    const arremateId = button.dataset.id;
    const arremateInfo = button.dataset.info;

    const confirmado = await mostrarConfirmacao(
        `Tem certeza que deseja estornar o lançamento de <br><strong>${arremateInfo}</strong>?<br><br>Esta ação não pode ser desfeita.`,
        'perigo'
    );

    if (!confirmado) return;
    
    button.disabled = true;
    button.innerHTML = '<div class="spinner-btn-interno" style="border-top-color: white;"></div>';

    try {
        await fetchFromAPI('/arremates/estornar', {
            method: 'POST',
            body: JSON.stringify({ id_arremate: parseInt(arremateId) })
        });
        
        mostrarMensagem('Lançamento estornado com sucesso!', 'sucesso', 2500);
        
        // Agora, chama a nova função para recarregar o conteúdo do modal
        // com os dados da página atual em que estava, usando a variável de estado correta.
        await buscarErenderizarHistoricoArremates(HISTORICO_ARREMATES_STATE.currentPage);

        // E também forçamos a atualização da lista principal da página
        await renderizarItensNaFila(1);

    } catch (error) {
        mostrarMensagem(`Erro ao estornar: ${error.message}`, 'erro');
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-undo"></i>';
    }
}

async function atualizarDashboard() {
    // Referências aos elementos
    const contadorProdutosFilaEl = document.getElementById('contadorProdutosFila');
    const contadorPecasPendentesEl = document.getElementById('contadorPecasPendentes');
    const contadorArrematadoHojeEl = document.getElementById('contadorArrematadoHoje');

    // 1. e 2. Produtos na Fila e Peças Pendentes (usam dados da variável de cache)
    if (contadorProdutosFilaEl) {
        contadorProdutosFilaEl.textContent = totaisDaFilaDeArremate.totalGrupos;
    }
    if (contadorPecasPendentesEl) {
        contadorPecasPendentesEl.textContent = totaisDaFilaDeArremate.totalPecas;
    }

    // 3. Arrematado Hoje (continua com sua chamada de API dedicada)
    if (contadorArrematadoHojeEl) {
        try {
            contadorArrematadoHojeEl.textContent = '...';
            const response = await fetchFromAPI('/arremates/contagem-hoje');
            contadorArrematadoHojeEl.textContent = response.total || 0;
        } catch (error) {
            console.error("Erro ao buscar contagem de arremates de hoje:", error);
            contadorArrematadoHojeEl.textContent = "?";
        }
    }
}

// --- LÓGICA COMPLETA E REATORADA PARA O MODAL DE HISTÓRICO GERAL DE ARREMATES ---

// Adicione esta variável global no topo do seu arquivo
const HISTORICO_ARREMATES_STATE = {
    currentPage: 1,
    perPage: 10,
    modalElement: null
};

/**
 * Função principal para abrir e gerenciar o modal.
 * Ela cria o modal na primeira vez e apenas o exibe nas vezes seguintes.
 */
async function mostrarHistoricoArremates() {
    // Se o modal ainda não foi criado, cria-o em memória
    if (!HISTORICO_ARREMATES_STATE.modalElement) {
        criarElementoModalHistorico();
    }
    
    // Adiciona o modal ao DOM (se ainda não estiver lá) e o exibe
    document.body.appendChild(HISTORICO_ARREMATES_STATE.modalElement);
    HISTORICO_ARREMATES_STATE.modalElement.style.display = 'flex';
    
    // Inicia a busca dos dados
    await buscarErenderizarHistoricoArremates(1);
}

/**
 * Busca os dados da API e chama a função para renderizar a tabela.
 */
async function buscarErenderizarHistoricoArremates(page = 1) {
    HISTORICO_ARREMATES_STATE.currentPage = page;
    const modal = HISTORICO_ARREMATES_STATE.modalElement;
    if (!modal) return;

    const tabelaWrapper = modal.querySelector('#historicoArrematesTabelaWrapper');
    const paginacaoContainer = modal.querySelector('#historicoArrematesPaginacao');
    
    tabelaWrapper.innerHTML = '<div class="spinner">Buscando histórico...</div>';
    paginacaoContainer.innerHTML = '';

    try {
        const params = new URLSearchParams({
            busca: modal.querySelector('#filtroBuscaHistorico').value,
            tipoEvento: modal.querySelector('#filtroTipoEventoHistorico').value,
            periodo: modal.querySelector('#filtroPeriodoHistorico').value,
            page: HISTORICO_ARREMATES_STATE.currentPage,
            limit: HISTORICO_ARREMATES_STATE.perPage
        });

        const response = await fetchFromAPI(`/arremates/historico?${params.toString()}`);
        const { rows: eventos, pagination } = response;
        
        renderizarTabelaHistoricoArremates(eventos, pagination);

    } catch (error) {
        console.error("Erro ao carregar histórico de arremates:", error);
        tabelaWrapper.innerHTML = `<p style="text-align: center; color: red;">Erro ao carregar histórico.</p>`;
    }
}

/**
 * Renderiza o conteúdo (tabela e paginação) dentro do modal.
 */
function renderizarTabelaHistoricoArremates(eventos, pagination) {
    const modal = HISTORICO_ARREMATES_STATE.modalElement;
    if (!modal) return;

    const tabelaWrapper = modal.querySelector('#historicoArrematesTabelaWrapper');
    const paginacaoContainer = modal.querySelector('#historicoArrematesPaginacao');

    if (!eventos || eventos.length === 0) {
        tabelaWrapper.innerHTML = '<p style="text-align: center;">Nenhum evento encontrado para os filtros selecionados.</p>';
        return;
    }

    let tbodyHTML = '';
    eventos.forEach(item => {
        let classeLinha = '';
        let displayQuantidade = `<span>${item.quantidade_arrematada || 0}</span>`;
        let displayTiktik = item.usuario_tiktik || 'N/A';
        let displayLancadoPor = item.lancado_por || 'N/A';
        let acoesHTML = ''; // Inicia vazio

        // Lógica para formatar cada tipo de lançamento
        switch (item.tipo_lancamento) {
            case 'PRODUCAO':
                classeLinha = 'linha-producao';
                displayQuantidade = `<span style="color: var(--oa-cor-verde-sucesso); font-weight: bold;">+${item.quantidade_arrematada}</span>`;
                // O botão de estorno só aparece para produções que não foram anuladas
                if (permissoes.includes('estornar-arremate')) {
                    acoesHTML = `
                        <button class="oa-btn-icon oa-btn-perigo btn-estornar-historico" 
                                title="Estornar este lançamento"
                                data-id="${item.id}" 
                                data-info="${item.quantidade_arrematada} pçs para ${item.usuario_tiktik}">
                            <i class="fas fa-undo"></i>
                        </button>`;
                }
                break;

            case 'PERDA':
                classeLinha = 'linha-perda';
                displayQuantidade = `<span style="color: var(--oa-cor-vermelho-perigo); font-weight: bold;">${item.quantidade_arrematada > 0 ? '-' : ''}${item.quantidade_arrematada}</span>`;
                displayTiktik = `<i style="color: var(--oa-cor-vermelho-perigo);">Perda</i>`;
                break;

            case 'ESTORNO':
                classeLinha = 'linha-estorno';
                // O registro de estorno tem a quantidade negativa, usamos Math.abs para mostrar
                displayQuantidade = `<span style="color: var(--oa-cor-amarelo-atencao); font-weight: bold;">${Math.abs(item.quantidade_arrematada)}</span>`;
                displayTiktik = `<i style="color: #555;">(Ref. a ${item.usuario_tiktik})</i>`;
                displayLancadoPor = `<strong style="color: var(--oa-cor-amarelo-atencao);">${item.lancado_por} (Estornou)</strong>`;
                break;

            case 'PRODUCAO_ANULADA':
                classeLinha = 'linha-anulada';
                displayQuantidade = `<span style="text-decoration: line-through; color: #888;">${item.quantidade_arrematada}</span>`;
                // Mostra quem anulou
                displayLancadoPor = `<i style="color: #888;">Anulado por ${item.lancado_por}</i>`;
                break;
        }

        // Constrói a linha da tabela com todos os dados formatados
        tbodyHTML += `
            <tr class="${classeLinha}">
                <td data-label="Produto">${item.produto || 'Produto não encontrado'}${item.variante ? ` | ${item.variante}` : ''}</td>
                <td data-label="Quantidade">${displayQuantidade}</td>
                <td data-label="Tiktik (Feito por)">${displayTiktik}</td>
                <td data-label="Lançado/Estornado por">${displayLancadoPor}</td>
                <td data-label="Data">${new Date(item.data_lancamento).toLocaleString('pt-BR')}</td>
                <td data-label="OP Origem">${item.op_numero || '-'}</td>
                <td data-label="Ações" style="text-align: center;">${acoesHTML}</td>
            </tr>
        `;
    });
    
    // Constrói e injeta a tabela
    tabelaWrapper.innerHTML = `
        <table class="oa-tabela-historico">
            <thead>
                <tr>
                    <th>Produto | Variação</th>
                    <th>Qtde</th>
                    <th>Tiktik (Feito por)</th>
                    <th>Lançado/Estornado por</th>
                    <th>Data & Hora</th>
                    <th>OP Origem</th>
                    <th style="text-align: center;">Ações</th>
                </tr>
            </thead>
            <tbody>${tbodyHTML}</tbody>
        </table>
    `;

    // Adiciona os listeners aos botões de estorno
    tabelaWrapper.querySelectorAll('.btn-estornar-historico').forEach(btn => {
        btn.addEventListener('click', handleEstornoClick);
    });

    // Renderiza a paginação
    renderizarPaginacao(paginacaoContainer, pagination.totalPages, pagination.currentPage, buscarErenderizarHistoricoArremates);
}

/**
 * Cria o elemento HTML do modal e seus listeners UMA ÚNICA VEZ.
 */
function criarElementoModalHistorico() {
    const container = document.createElement('div');
    container.id = 'historicoArrematesModalContainer';
    container.className = 'popup-container';
    container.style.display = 'none';

    container.innerHTML = `
        <div class="popup-overlay"></div>
        <div class="oa-modal-historico">
            <div class="oa-modal-header">
                <h3 class="oa-modal-titulo">Histórico Geral de Arremates</h3>
                <button class="oa-modal-fechar-btn">X</button>
            </div>
            <div class="oa-modal-filtros">
                <div class="oa-form-grupo" style="flex-grow: 2;"><label for="filtroBuscaHistorico">Buscar</label><input type="text" id="filtroBuscaHistorico" class="oa-input" placeholder=" Busque por Produto, Tiktik ou Lançador..."></div>
                <div class="oa-form-grupo"><label for="filtroTipoEventoHistorico">Tipo</label><select id="filtroTipoEventoHistorico" class="oa-select"><option value="todos">Todos</option><option value="PRODUCAO">Lançamentos</option><option value="PERDA">Perdas</option><option value="ESTORNO">Estornos</option></select></div>
                <div class="oa-form-grupo"><label for="filtroPeriodoHistorico">Período</label><select id="filtroPeriodoHistorico" class="oa-select"><option value="7d">7 dias</option><option value="hoje">Hoje</option><option value="30d">30 dias</option><option value="mes_atual">Mês Atual</option></select></div>
            </div>
            <div class="oa-modal-body"><div id="historicoArrematesTabelaWrapper" class="oa-tabela-wrapper"></div></div>
            <div class="oa-modal-footer"><div id="historicoArrematesPaginacao" class="oa-paginacao-container"></div></div>
        </div>
    `;

    // Listeners
    const recarregar = () => buscarErenderizarHistoricoArremates(1);
    container.querySelector('#filtroBuscaHistorico').addEventListener('input', debounce(recarregar, 400));
    container.querySelector('#filtroTipoEventoHistorico').addEventListener('change', recarregar);
    container.querySelector('#filtroPeriodoHistorico').addEventListener('change', recarregar);

    const fechar = () => { container.style.display = 'none'; };
    container.querySelector('.oa-modal-fechar-btn').addEventListener('click', fechar);
    container.querySelector('.popup-overlay').addEventListener('click', fechar);

    HISTORICO_ARREMATES_STATE.modalElement = container;
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
        localStorage.removeItem('arremateDetalheAtual');
        arremateAgregadoEmVisualizacao = null; // Limpa o estado global

        arrematesListView.classList.remove('hidden');
        
        // Ela já busca os dados da API e renderiza tudo.
        // O spinner já é colocado dentro da própria função `renderizarItensNaFila`.
        await renderizarItensNaFila(1); // O '1' significa que sempre voltamos para a primeira página da lista.
        await atualizarDashboard();

    }
    } catch (e) {
        console.error("Erro no roteamento de hash:", e);
        mostrarMensagem(`Erro ao navegar: ${e.message}`, 'erro');
    }
}

function configurarEventListeners() {
    document.getElementById('fecharArremateDetalheBtn')?.addEventListener('click', () => window.location.hash = '');
    
    // Listener do botão de Lançar com verificação de permissão no clique
    document.getElementById('btnLancarArremateAgregado')?.addEventListener('click', () => {
        if (!permissoes.includes('lancar-arremate')) {
            mostrarMensagem('Você não tem permissão para lançar arremates.', 'aviso');
            return;
        }
        lancarArremateAgregado();
    });

    // --- LÓGICA DAS ABAS DA TELA DE DETALHES ---
    const abasContainer = document.querySelector('.oa-tabs');
    if (abasContainer) {
        abasContainer.addEventListener('click', (e) => {
            if (e.target.matches('.oa-tab-btn')) {
                const tabId = e.target.dataset.tab;
                
                document.querySelectorAll('.oa-tab-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                
                document.querySelectorAll('.oa-tab-panel').forEach(panel => panel.classList.remove('active'));
                
                // <<< CORREÇÃO AQUI, para garantir que o painel correto seja exibido >>>
                const panelToShow = document.getElementById(`${tabId}-tab`);
                if (panelToShow) {
                    panelToShow.classList.add('active');
                }
                
                if (tabId === 'historico-produto' && arremateAgregadoEmVisualizacao) {
                    carregarHistoricoDoProduto(arremateAgregadoEmVisualizacao.produto_id, arremateAgregadoEmVisualizacao.variante, 1);
                }
            }
        });
    }

    // Listeners para o novo modal de perda
    document.getElementById('btnAbrirModalPerda')?.addEventListener('click', abrirModalPerda);
    document.getElementById('btnFecharModalPerda')?.addEventListener('click', fecharModalPerda);
    document.querySelector('#modalRegistrarPerda .oa-popup-overlay')?.addEventListener('click', fecharModalPerda);

    window.addEventListener('hashchange', handleHashChange);


    // Conecta o botão de confirmar ajuste à nova função
    document.getElementById('btnConfirmarRegistroAjuste')?.addEventListener('click', registrarAjuste);
}

async function carregarHistoricoDoProduto(produtoId, variante, page = 1) {
    const container = document.getElementById('historicoProdutoContainer');
    const paginacaoContainer = document.getElementById('historicoProdutoPaginacao');
    container.innerHTML = '<div class="spinner">Carregando histórico do produto...</div>';
    paginacaoContainer.innerHTML = '';

    try {
        const params = new URLSearchParams({ 
            produto_id: produtoId,
            page: page,
            limit: 5 // Define o mesmo limite do backend
        });
        if (variante && variante !== '-') {
            params.append('variante', variante);
        }
        
        const response = await fetchFromAPI(`/arremates/historico-produto?${params.toString()}`);
        const { rows: historico, pagination } = response;
        
        if (historico.length === 0) {
            container.innerHTML = '<p style="text-align: center;">Nenhum lançamento encontrado para este produto.</p>';
            return;
        }

        let tabelaHTML = `
            <table class="oa-tabela-historico">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Qtd</th>
                        <th>Tiktik</th>
                        <th>OP</th>
                    </tr>
                </thead>
                <tbody>
        `;
        historico.forEach(item => {
            // Lógica de formatação para destacar estornos, perdas, etc. (opcional, mas recomendado)
            let qtdDisplay = item.quantidade_arrematada;
            if (item.tipo_lancamento === 'PERDA') {
                qtdDisplay = `<span style="color:var(--oa-cor-vermelho-perigo);">${item.quantidade_arrematada}</span>`;
            } else if (item.tipo_lancamento === 'ESTORNO') {
                qtdDisplay = `<span style="color:var(--oa-cor-amarelo-atencao);">${item.quantidade_arrematada}</span>`;
            }

            tabelaHTML += `
                <tr>
                    <td>${new Date(item.data_lancamento).toLocaleDateString('pt-BR')}</td>
                    <td>${item.tipo_lancamento}</td>
                    <td>${qtdDisplay}</td>
                    <td>${item.usuario_tiktik}</td>
                    <td>${item.op_numero}</td>
                </tr>
            `;
        });
        tabelaHTML += `</tbody></table>`;
        container.innerHTML = tabelaHTML;

        // Renderiza a paginação
        // Precisamos passar uma função de callback que saiba o produtoId e a variante
        const callbackPaginacao = (nextPage) => {
            carregarHistoricoDoProduto(produtoId, variante, nextPage);
        };
        renderizarPaginacao(paginacaoContainer, pagination.totalPages, pagination.currentPage, callbackPaginacao);

    } catch (error) {
        container.innerHTML = `<p style="text-align: center; color: red;">Erro ao carregar histórico.</p>`;
    }
}

async function inicializarPagina() {
    const overlay = document.getElementById('paginaLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        // Agora só carregamos os dados essenciais para a página principal
        await Promise.all([
             obterProdutosDoStorage(true).then(p => { todosOsProdutosCadastrados = p; }),
             fetchFromAPI('/usuarios').then(u => { todosOsUsuarios = u || []; })
        ]);
        
        // A lógica do histórico só é chamada quando o modal é aberto.
        await handleHashChange();

    } catch (error) {
        console.error("Erro na inicialização:", error);
        mostrarMensagem(`Falha ao carregar a página: ${error.message}`, 'erro');
    } finally {
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

        document.getElementById('btnAbrirHistorico')?.addEventListener('click', mostrarHistoricoArremates);


        configurarEventListeners();
        await inicializarPagina();
    } catch(err) {
        console.error("Falha de autenticação ou inicialização", err);
    }

    // --- NOVOS LISTENERS PARA FILTROS ---
    const searchInput = document.getElementById('searchProdutoArremate');
    const ordenacaoSelect = document.getElementById('ordenacaoSelect');
    const toggleFiltrosBtn = document.getElementById('toggleFiltrosAvancadosBtn');
    const filtrosContainer = document.getElementById('filtrosAvancadosContainer');
    const limparFiltrosBtn = document.getElementById('limparFiltrosBtn');
    const btnAtualizar = document.getElementById('btnAtualizarArremates');

    const debouncedRender = debounce(() => renderizarItensNaFila(1), 350);

    if (searchInput) searchInput.addEventListener('input', debouncedRender);
    if (ordenacaoSelect) ordenacaoSelect.addEventListener('change', () => renderizarItensNaFila(1));
    if (btnAtualizar) btnAtualizar.addEventListener('click', () => renderizarItensNaFila(1));

    if (toggleFiltrosBtn && filtrosContainer) {
        toggleFiltrosBtn.addEventListener('click', () => {
            filtrosContainer.classList.toggle('hidden');
        });
    }

    if (limparFiltrosBtn && searchInput && ordenacaoSelect) {
        limparFiltrosBtn.addEventListener('click', () => {
            searchInput.value = '';
            ordenacaoSelect.value = 'mais_recentes';
            renderizarItensNaFila(1);
            if (filtrosContainer) filtrosContainer.classList.add('hidden');
        });
    }

});