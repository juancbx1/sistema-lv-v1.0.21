// public/js/admin-embalagem-de-produtos.js

import { verificarAutenticacao } from '/js/utils/auth.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';
import { obterProdutos as obterProdutosDoStorage, invalidateCache as invalidateProdutosStorageCache } from '/js/utils/storage.js';
import { adicionarBotaoFechar } from '/js/utils/botoes-fechar.js';

// --- Variáveis Globais ---
let todosOsUsuarios = [];
let usuarioLogado = null;
let permissoes = [];

let todosOsProdutosCadastrados = []; // Para imagens, nomes de produtos, definições de kit
let totaisDaFilaDeEmbalagem = { totalItems: 0, aguardandoMuito: 0 };


let modalHistoricoGeralElement = null;

let todosArrematesRegistradosCache = []; // Cache dos arremates já feitos (com quantidade_ja_embalada)
let produtosAgregadosParaEmbalarGlobal = []; // Array dos itens agregados (produto|variante) prontos para embalar
let embalagemAgregadoEmVisualizacao = null; // Objeto do item agregado atualmente na tela de embalar/montar kit

let currentPageEmbalagemCards = 1;
const itemsPerPageEmbalagemCards = 6; // Quantos cards de "Pronto para Embalar" por página
const ARREMATES_ORIGEM_PER_PAGE = 6; // Quantos itens mostrar por página na aba voltar para arremate

const operacaoEmAndamento = new Set(); // Para evitar duplo clique em botões de ação

// Variáveis globais para paginação do histórico
let currentPageHistorico = 1;
const itemsPerPageHistorico = 5;

async function forcarAtualizacaoEmbalagem() {
    const btn = document.getElementById('btnAtualizarEmbalagem');
    if (!btn || btn.disabled) return;

    // Pega o container que vai receber o overlay
    const containerDaLista = document.querySelector('.ep-card-filtros');
    if (!containerDaLista) return;

    btn.disabled = true;
    const span = btn.querySelector('span');
    const originalText = span ? span.textContent : 'Atualizar';
    if (span) span.textContent = 'Atualizando...';

    // Cria e exibe o overlay
    const overlay = document.createElement('div');
    overlay.className = 'ep-lista-loading-overlay';
    overlay.innerHTML = '<div class="spinner">Atualizando fila...</div>';
    containerDaLista.appendChild(overlay);

    console.log('[forcarAtualizacaoEmbalagem] Forçando atualização da fila de embalagem...');


    try {
        await renderizarCardsEmbalagem(1);

        await atualizarContadoresPainel();
        mostrarMensagem('Fila de embalagem atualizada!', 'sucesso', 2500);

    } catch (error) {
        console.error('[forcarAtualizacaoEmbalagem] Erro:', error);
        mostrarMensagem('Falha ao atualizar a fila de embalagem.', 'erro');
    } finally {
        if (span) span.textContent = originalText;
        if (btn) btn.disabled = false;
        
        // Remove o overlay no final
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300); // Remove do DOM após a transição

        console.log('[forcarAtualizacaoEmbalagem] Atualização concluída.');
    }
}

/**
 * Cria o elemento HTML do modal em memória, mas NÃO o adiciona à página.
 * Faz isso apenas uma vez.
 */
function criarInstanciaDoModalHistorico() {
    // Se o modal já foi criado em memória, não faz nada.
    if (modalHistoricoGeralElement) return;

    console.log("Criando a instância do modal de histórico (versão corrigida)...");
    
    const container = document.createElement('div');
    container.id = 'historicoGeralModalContainer';
    container.className = 'popup-container es-modal'; // Usa a classe base do modal
    container.style.display = 'none';

    container.innerHTML = `
        <div class="popup-overlay"></div>
        <div class="es-modal-conteudo" style="max-width: 900px;">
            <!-- O botão 'X' será adicionado aqui pelo JS -->
            
            <div class="ep-modal-header">
                <h3 class="ep-modal-titulo">Histórico Geral de Embalagem</h3>
            </div>
            <div class="ep-modal-filtros">
                <div class="ep-form-grupo"><label for="filtroTipoEvento">Tipo</label><select id="filtroTipoEvento" class="ep-select"><option value="todos">Todos</option><option value="embalagem_unidade">Embalagem (UN)</option><option value="montagem_kit">Montagem (KIT)</option><option value="estorno_arremate">Estorno (p/ Arremate)</option><option value="estorno_estoque">Estorno (do Estoque)</option></select></div>
                <div class="ep-form-grupo"><label for="filtroUsuario">Usuário</label><select id="filtroUsuario" class="ep-select"><option value="todos">Todos</option></select></div>
                <div class="ep-form-grupo"><label for="filtroPeriodo">Período</label><select id="filtroPeriodo" class="ep-select"><option value="7d">7 dias</option><option value="hoje">Hoje</option><option value="30d">30 dias</option><option value="mes_atual">Este Mês</option></select></div>
            </div>
            <div class="ep-modal-body"><div id="historicoGeralTabelaWrapper" class="ep-tabela-wrapper"></div></div>
            <div class="ep-modal-footer"><div id="historicoGeralPaginacao" class="gs-paginacao-container"></div></div>
        </div>
    `;

    // Adiciona os listeners aos elementos recém-criados
    const recarregarHistorico = () => carregarHistoricoGeral(1);
    container.querySelector('#filtroTipoEvento').addEventListener('change', recarregarHistorico);
    container.querySelector('#filtroUsuario').addEventListener('change', recarregarHistorico);
    container.querySelector('#filtroPeriodo').addEventListener('change', recarregarHistorico);
    container.querySelector('.popup-overlay').addEventListener('click', fecharModalHistoricoGeral);

    // Guarda a referência na variável global
    modalHistoricoGeralElement = container;
}

function fecharModalHistoricoGeral() {
    if (modalHistoricoGeralElement && modalHistoricoGeralElement.parentNode) {
        // Apenas esconde o modal, não o remove
        modalHistoricoGeralElement.style.display = 'none';
    }
}

async function abrirModalHistoricoGeral() {
    // Garante que a instância do modal exista em memória
    criarInstanciaDoModalHistorico();

    adicionarBotaoFechar(modalHistoricoGeralElement, fecharModalHistoricoGeral);
    
    // Se o modal não estiver no DOM, adiciona-o.
    if (!document.body.contains(modalHistoricoGeralElement)) {
        document.body.appendChild(modalHistoricoGeralElement);
    }
    
    // Torna o modal visível
    modalHistoricoGeralElement.style.display = 'flex';
    
    // Popula o filtro de usuários
    const filtroUsuario = modalHistoricoGeralElement.querySelector('#filtroUsuario');
    if (filtroUsuario.options.length <= 1) {
        const usuariosRelevantes = todosOsUsuarios.filter(u => u.permissoes?.includes('lancar-embalagem') && u.id !== 11);
        usuariosRelevantes.forEach(user => filtroUsuario.add(new Option(user.nome, user.id)));
    }
    
    await carregarHistoricoGeral(1);
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



/**
 * Carrega a lista de arremates de origem para a aba "Voltar para Arremate".
 */
async function carregarArrematesDeOrigem(page = 1) { // Agora aceita o número da página
    if (!embalagemAgregadoEmVisualizacao) return;

    const container = document.getElementById('retornarArremateContainer');
    const paginacaoContainer = document.getElementById('retornarArrematePaginacao');
    container.innerHTML = '<div class="spinner">Carregando...</div>';
    paginacaoContainer.innerHTML = ''; // Limpa a paginação antiga

    try {
        const { produto_id, variante } = embalagemAgregadoEmVisualizacao;
        const params = new URLSearchParams({ 
            produto_id: produto_id,
            variante: variante || '-',
            page: page,
            limit: ARREMATES_ORIGEM_PER_PAGE // Usa a constante que já existe no seu código
        });

        // A API agora retorna um objeto { rows, pagination }
        const response = await fetchFromAPI(`/arremates?${params.toString()}`);
        const { rows: arrematesComSaldo, pagination } = response;
    
        if (arrematesComSaldo.length === 0) {
            container.innerHTML = '<p style="text-align: center;">Nenhum lançamento de arremate com saldo encontrado para este item.</p>';
            return;
        }

        let tabelaHTML = `
            <table class="ep-tabela-estilizada">
                <thead>...</thead>
                <tbody>`;
        
        arrematesComSaldo.forEach(item => {
            const saldo = item.quantidade_arrematada - item.quantidade_ja_embalada;
            tabelaHTML += `
                <tr data-arremate-id="${item.id}" data-arremate-info="${saldo} pçs para ${item.usuario_tiktik || 'N/A'}">
                    <td data-label="Data:"><span>${new Date(item.data_lancamento).toLocaleString('pt-BR')}</span></td>
                    <td data-label="Feito por:"><span>${item.usuario_tiktik || 'N/A'}</span></td>
                    <td data-label="Saldo:" style="font-weight: bold;"><span>${saldo}</span></td>
                    <td data-label="OP Origem:"><span>${item.op_numero || '-'}</span></td>
                    <td data-label="Ações:">
                        <span>
                            ${permissoes.includes('estornar-arremate') ? 
                                `<button class="gs-btn gs-btn-perigo" onclick="handleEstornoDeArremateClick(this)">Estornar</button>` : 
                                'Sem permissão'}
                        </span>
                    </td>
                </tr>
            `;
        });

        tabelaHTML += `</tbody></table>`;
        container.innerHTML = tabelaHTML;

        renderizarPaginacao(paginacaoContainer, pagination.totalPages, pagination.currentPage, carregarArrematesDeOrigem);

    } catch (error) {
        container.innerHTML = `<p style="text-align: center; color: red;">Erro ao carregar arremates de origem.</p>`;
    }
}

/**
 * Handler para o clique no botão de estorno na aba "Voltar para Arremate".
 * Precisa ser uma função global no escopo do módulo para ser chamada pelo onclick.
 */
window.handleEstornoDeArremateClick = async (button) => {
    const tr = button.closest('tr');
    const arremateId = tr.dataset.arremateId;
    const arremateInfo = tr.dataset.arremateInfo;

    const confirmado = await mostrarConfirmacao(
        `Tem certeza que deseja estornar o lançamento de <br><strong>${arremateInfo}</strong>?<br><br>Ele retornará para a fila de Arremates.`,
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
        
        mostrarMensagem('Lançamento estornado com sucesso!', 'sucesso', 2000);

        // A FORMA MAIS SIMPLES E GARANTIDA DE ATUALIZAR:
        // Apenas redireciona para a lista. O hashchange vai disparar e,
        // graças à nossa nova fetchFromAPI, ele buscará dados 100% novos.
        window.location.hash = '';

    } catch (error) {
        mostrarMensagem(`Erro ao estornar: ${error.message}`, 'erro');
        button.disabled = false;
        button.textContent = 'Estornar';
    }
};


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
        <button class="gs-paginacao-btn" data-page="${Math.max(1, currentPageHistorico - 1)}" ${currentPageHistorico === 1 ? 'disabled' : ''}>Anterior</button>
        <span class="gs-paginacao-info">Pág. ${currentPageHistorico} de ${totalPages}</span>
        <button class="gs-paginacao-btn" data-page="${Math.min(totalPages, currentPageHistorico + 1)}" ${currentPageHistorico === totalPages ? 'disabled' : ''}>Próximo</button>
    `;

    paginacaoEl.querySelectorAll('.gs-paginacao-btn').forEach(btn => {
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

    const confirmado = await mostrarConfirmacao(
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
        
        mostrarMensagem('Embalagem estornada com sucesso! A página será recarregada para refletir as mudanças.', 'sucesso');
        
        setTimeout(() => {
            window.location.hash = ''; // Volta para a lista principal, forçando recarga de todos os dados
        }, 2000);

    } catch (error) {
        mostrarMensagem(`Erro ao estornar: ${error.data?.details || error.data?.error || error.message}`, 'erro');
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-undo"></i>';
    }
}

// --- Funções Auxiliares Essenciais ---


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

// --- FUNÇÕES AUXILIARES DE PAGINAÇÃO ---

/**
 * Pega um array e retorna um objeto com os itens da página atual e informações de paginação.
 * @param {Array} array - O array completo a ser paginado.
 * @param {number} page - O número da página desejada (começando em 1).
 * @param {number} itemsPerPage - Quantos itens por página.
 * @returns {object} - { items, currentPage, totalPages }
 */
function paginarArray(array, page, itemsPerPage) {
    const totalPages = Math.ceil(array.length / itemsPerPage) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return {
        items: array.slice(start, end),
        currentPage: currentPage,
        totalPages: totalPages
    };
}

/**
 * Renderiza os controles de paginação (botões, texto) em um container HTML.
 * @param {HTMLElement} container - O elemento div onde a paginação será desenhada.
 * @param {number} totalPages - O número total de páginas.
 * @param {number} currentPage - A página atual.
 * @param {Function} callback - A função a ser chamada quando um botão de página é clicado (ex: renderizarCardsEmbalagem).
 */
function renderizarPaginacao(container, totalPages, currentPage, callback) {
    container.innerHTML = '';
    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    const criarBtn = (texto, page, isDisabled) => {
        const btn = document.createElement('button');
        btn.className = 'gs-paginacao-btn'; // Usando a classe de botão da página
        btn.textContent = texto;
        btn.disabled = isDisabled;
        if (!isDisabled) {
            btn.onclick = () => callback(page);
        }
        return btn;
    };

    container.appendChild(criarBtn('Anterior', currentPage - 1, currentPage === 1));
    
    const pageInfo = document.createElement('span');
    pageInfo.className = 'gs-paginacao-info';
    pageInfo.textContent = `Pág. ${currentPage} de ${totalPages}`;
    container.appendChild(pageInfo);
    
    container.appendChild(criarBtn('Próximo', currentPage + 1, currentPage === totalPages));
}

// --- Funções de Fetch ---
async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarMensagem('Sessão expirada. Faça login novamente.', 'erro');
        window.location.href = '/login.html';
        throw new Error('Token não encontrado');
    }

    // A variável 'url' será construída aqui
    let url = `/api${endpoint}`;

    // Lógica do 'cache buster' para requisições GET
    if (!options.method || options.method.toUpperCase() === 'GET') {
        const cacheBuster = `_=${Date.now()}`;
        url += (url.includes('?') ? '&' : '?') + cacheBuster;
    }

    try {
        // <<< A CORREÇÃO ESTÁ AQUI: Usamos a variável 'url' em vez de `/api${endpoint}` >>>
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
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
    } catch (error) {
        console.error(`[fetchFromAPI] Falha ao acessar ${url}:`, error);
        throw error;
    }
}

async function renderizarCardsEmbalagem(page = 1) {
    currentPageEmbalagemCards = page;
    const containerEl = document.getElementById('embalagemCardsContainer');
    const paginationContainerEl = document.getElementById('embalagemPaginationContainer');
    
    if (!containerEl || !paginationContainerEl) {
        console.error("Elementos DOM para renderização/filtros não encontrados.");
        return;
    }

    containerEl.innerHTML = '<div class="spinner">Buscando itens na fila...</div>';
    paginationContainerEl.innerHTML = '';

    try {
        // Referências aos filtros. Usamos 'El' no final para indicar que são elementos HTML.
        const searchInputEl = document.getElementById('searchProdutoEmbalagem');
        const ordenacaoEl = document.getElementById('ordenacaoSelect');
        const filtroAlertaEl = document.getElementById('filtroAlertaSelect');

        // Coleta os valores atuais dos filtros de forma segura
        const searchTerm = searchInputEl ? searchInputEl.value : '';
        // O sortBy no backend espera 'mais_recentes', 'mais_antigos', etc. 'padrao' não é mais usado.
        const ordenacao = ordenacaoEl ? ordenacaoEl.value : 'mais_recentes';
        const filtroAlerta = filtroAlertaEl ? filtroAlertaEl.value : 'todos';

        // Monta os parâmetros para a nova API de forma limpa
        const params = new URLSearchParams({
            search: searchTerm,
            sortBy: ordenacao,
            filterByAge: filtroAlerta, // Este parâmetro será usado pelo backend
            page: currentPageEmbalagemCards,
            limit: itemsPerPageEmbalagemCards,
        });

        // ÚNICA FONTE DE DADOS: A NOVA API INTELIGENTE
        const response = await fetchFromAPI(`/embalagens/fila?${params.toString()}`);
        const { rows: itensParaEmbalar, pagination } = response;

        // <<< GUARDE OS TOTAIS AQUI >>>
        totaisDaFilaDeEmbalagem.totalItems = pagination.totalItems || 0;

        // Atualiza a variável global (usada pelos contadores do dashboard)
        produtosAgregadosParaEmbalarGlobal = itensParaEmbalar;

        containerEl.innerHTML = ''; // Limpa o spinner
        if (!itensParaEmbalar || itensParaEmbalar.length === 0) {
            containerEl.innerHTML = `<p style="text-align: center; padding: 20px; grid-column: 1 / -1;">Nenhum item encontrado com os filtros aplicados.</p>`;
            paginationContainerEl.style.display = 'none';
            return;
        }

        itensParaEmbalar.forEach(item => {
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
                const diffDias = Math.floor((agora - dataAntiga) / (1000 * 60 * 60 * 24));

                if (diffDias < 1) {
                    diasEsperandoTexto = "Hoje";
                } else {
                    diasEsperandoTexto = diffDias === 1 ? '1 dia' : `${diffDias} dias`;
                }

                if (diffDias >= 2) { // Alterado para >= 2 para incluir "há 2 dias"
                    classeStatus = 'status-aguardando-muito';
                }
            }
            
            card.className = `ep-consulta-card ${classeStatus}`;

            card.innerHTML = `
                <img src="${imagemSrc}" alt="${item.produto}" class="ep-consulta-card-img" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">
                <div class="ep-consulta-card-info">
                    <h3>${item.produto}</h3>
                    <p>${item.variante && item.variante !== '-' ? item.variante : 'Padrão'}</p>
                    <p class="ep-sku-info">SKU: ${skuProduto}</p>
                </div>
                <div class="ep-consulta-card-dados">
                    <div class="ep-dado-bloco">
                        <span class="label">Disponível</span>
                        <span class="valor">${item.total_disponivel_para_embalar}</span>
                    </div>
                    <div class="ep-dado-bloco">
                        <span class="label">Aguardando</span>
                        <span class="valor" style="${classeStatus === 'status-aguardando-muito' ? 'color: var(--ep-cor-laranja-aviso);' : ''}">${diasEsperandoTexto}</span>
                    </div>
                </div>
            `;

            // Prepara o objeto para a tela de detalhes, garantindo compatibilidade com o que ela espera
            const itemParaDetalhes = {
                produto_id: item.produto_id,
                produto: item.produto,
                variante: item.variante,
                total_quantidade_disponivel_para_embalar: item.total_disponivel_para_embalar,
                arremates_detalhe: [] // Deixamos vazio, pois a aba "Voltar para Arremate" buscará isso sob demanda
            };
            
            card.dataset.embalagemAgregado = JSON.stringify(itemParaDetalhes);
            card.addEventListener('click', handleEmbalagemCardClick);
            containerEl.appendChild(card);
        });

        // Chama a função para desenhar os botões de paginação, usando os dados da API
        renderizarPaginacao(paginationContainerEl, pagination.totalPages, pagination.currentPage, renderizarCardsEmbalagem);

    } catch (error) {
        console.error('Erro ao renderizar cards de embalagem:', error);
        containerEl.innerHTML = `<p style="text-align: center; color: red;">Falha ao carregar a fila de embalagem.</p>`;
    }
}

/**
 * Busca os arremates individuais e com saldo para um produto/variante específico.
 * @param {number} produtoId - O ID do produto.
 * @param {string} variante - A variação do produto.
 * @returns {Promise<Array>} - Uma promessa que resolve para um array de arremates detalhados.
 */
async function buscarArrematesDetalhados(produtoId, variante) {
    try {
        const params = new URLSearchParams({ 
            produto_id: produtoId,
            variante: variante || '-',
            fetchAll: 'true' 
        });
        const response = await fetchFromAPI(`/arremates?${params.toString()}`);
        // A API já filtra por saldo, então apenas retornamos as linhas
        return response.rows || [];
    } catch (error) {
        console.error(`Erro ao buscar detalhes para produto ${produtoId}:`, error);
        mostrarMensagem(`Não foi possível buscar os lotes de arremate para este item.`, 'erro');
        return []; // Retorna um array vazio em caso de erro
    }
}

async function handleEmbalagemCardClick(event) {
    const card = event.currentTarget;
    const agregadoResumo = JSON.parse(card.dataset.embalagemAgregado);
    
    // Mostra um feedback visual de carregamento
    card.style.opacity = '0.5';
    card.style.pointerEvents = 'none';

    try {
        // Usa a nova função para buscar os detalhes
        const detalhes = await buscarArrematesDetalhados(agregadoResumo.produto_id, agregadoResumo.variante);
        
        const agregadoCompleto = {
            ...agregadoResumo,
            arremates_detalhe: detalhes.map(d => ({
                ...d,
                // Garante que a propriedade esperada exista
                quantidade_disponivel_para_embalar: d.quantidade_arrematada - d.quantidade_ja_embalada
            }))
        };
        
        embalagemAgregadoEmVisualizacao = agregadoCompleto;
        localStorage.setItem('embalarDetalheAtual', JSON.stringify(agregadoCompleto));
        window.location.hash = '#embalar-produto';

    } catch (error) {
        // O erro já é tratado dentro de buscarArrematesDetalhados
    } finally {
        card.style.opacity = '1';
        card.style.pointerEvents = 'auto';
    }
}

async function carregarDetalhesEmbalagemView(agregado) {
    document.getElementById('embalagemListViewNova').style.display = 'none';
    const embalarDetalheViewEl = document.getElementById('embalarDetalheView');
    if (embalarDetalheViewEl) {
        embalarDetalheViewEl.style.display = 'block';
    } else {
        console.error("ERRO CRÍTICO: View #embalarDetalheView não encontrada!");
        mostrarMensagem("Erro ao carregar view de detalhe.", "erro");
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

        if (skuProduto && skuProduto !== 'N/A') {
            carregarSugestoesDeEstoque(agregado.produto_id, agregado.variante, skuProduto);
        } else {
            // Esconde o painel se não houver SKU
            const painelSugestao = document.getElementById('painelSugestaoEstoque');
            if(painelSugestao) painelSugestao.style.display = 'none';
        }

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
}


// --- Funções para Embalar Unidade e Montar Kit (lógica de envio) ---
async function embalarUnidade() {
    if (!embalagemAgregadoEmVisualizacao || operacaoEmAndamento.has('embalarUnidade')) return;

    const itemEmbaladoCopia = { ...embalagemAgregadoEmVisualizacao };
    const inputQtdEl = document.getElementById('inputQuantidadeEmbalarUnidade');
    const btnEmbalarEl = document.getElementById('btnEmbalarEnviarEstoqueUnidade');
    const observacaoInputEl = document.getElementById('observacaoEmbalagemUnidade');
    const quantidadeEnviada = parseInt(inputQtdEl.value);
    const observacao = observacaoInputEl.value.trim();

    if (isNaN(quantidadeEnviada) || quantidadeEnviada <= 0 || quantidadeEnviada > itemEmbaladoCopia.total_quantidade_disponivel_para_embalar) {
        return mostrarMensagem('A quantidade para embalar é inválida ou excede o disponível.', 'erro');
    }

    const confirmado = await mostrarConfirmacao(
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

    try {
        let quantidadeRestanteDaMeta = quantidadeEnviada;
        const arrematesOrdenados = [...itemEmbaladoCopia.arremates_detalhe]
            .sort((a, b) => new Date(a.data_lancamento) - new Date(b.data_lancamento)); 

        for (const arremate of arrematesOrdenados) {
            if (quantidadeRestanteDaMeta <= 0) break;
            const saldoNesteArremate = arremate.quantidade_arrematada - arremate.quantidade_ja_embalada;
            const qtdAEmbalarDeste = Math.min(quantidadeRestanteDaMeta, saldoNesteArremate);

            if (qtdAEmbalarDeste > 0) {
                // Guarda a informação de quanto foi consumido deste lote
                arremate.quantidadeConsumida = qtdAEmbalarDeste; 

                await fetchFromAPI(`/arremates/${arremate.id}/registrar-embalagem`, {
                    method: 'PUT',
                    body: JSON.stringify({ quantidade_que_foi_embalada_desta_vez: qtdAEmbalarDeste })
                });
                quantidadeRestanteDaMeta -= qtdAEmbalarDeste;
            }
        }
        
        if (quantidadeRestanteDaMeta > 0) {
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

        // Vamos passar um array de IDs para o backend.
        const idsArrematesUsados = arrematesOrdenados
            .filter(arr => arr.quantidadeConsumida > 0) // Filtra apenas os arremates que realmente foram usados
            .map(arr => arr.id); // Pega apenas os IDs

        const payloadEstoque = {
            produto_id: itemEmbaladoCopia.produto_id,
            variante_nome: itemEmbaladoCopia.variante === '-' ? null : itemEmbaladoCopia.variante,
            produto_ref_id: skuUnidade,
            quantidade_entrada: quantidadeEnviada,
            // Passamos o ID do PRIMEIRO arremate usado. O estorno devolverá para ele.
            // É uma simplificação, mas funcional.
            id_arremate_origem: arrematesOrdenados[0]?.id || null, 
            observacao: observacao || null
        };
        
        // O backend /estoque/entrada-producao precisa estar preparado para receber 'id_arremate_origem'
        await fetchFromAPI('/estoque/entrada-producao', {
            method: 'POST',
            body: JSON.stringify(payloadEstoque)
        });
        
        mostrarMensagem(`${quantidadeEnviada} unidade(s) embalada(s) com sucesso!`, 'sucesso', 2500);
        
        // <<< A MUDANÇA ESTÁ AQUI: APENAS REDIRECIONA >>>
        // Não chamamos mais nenhuma função de cálculo.
        window.location.hash = '';

    } catch (error) {
        console.error('[embalarUnidade] Erro:', error);
        mostrarMensagem(`Falha ao embalar unidade: ${error.message}`, 'erro');
    } finally {
        operacaoEmAndamento.delete('embalarUnidade');
        btnEmbalarEl.disabled = false;
        btnEmbalarEl.innerHTML = '<i class="fas fa-box-open"></i> EMBALAR E ESTOCAR UNIDADES';
    }
}

async function montarKits() {
    if (operacaoEmAndamento.has('montarKits')) return;

    const kitSelecionadoBtnEl = document.querySelector('#kitsListNova button.active');
    const variacaoKitSelectEl = document.getElementById('kitVariacoesNova');
    const qtdKitsInputEl = document.getElementById('qtdEnviarKitsNova');
    const observacaoTextareaEl = document.getElementById('observacaoMontagemKit');
    const btnMontarEl = document.getElementById('btnMontarEnviarKitsEstoque');

    if (!kitSelecionadoBtnEl || !variacaoKitSelectEl || !variacaoKitSelectEl.value || !qtdKitsInputEl) {
        return mostrarMensagem('Selecione o kit, a variação e a quantidade para montar.', 'aviso');
    }

    const nomeKitProduto = kitSelecionadoBtnEl.textContent.trim();
    const variacaoKitProduto = variacaoKitSelectEl.value;
    const qtdKitsParaEnviar = parseInt(qtdKitsInputEl.value);
    const observacaoMontagem = observacaoTextareaEl ? observacaoTextareaEl.value.trim() : '';
    
    const qtdDisponivelKitsSpanEl = document.getElementById('qtdDisponivelKitsNova');
    const maxKitsMontaveis = parseInt(qtdDisponivelKitsSpanEl.textContent) || 0;

    if (isNaN(qtdKitsParaEnviar) || qtdKitsParaEnviar <= 0) {
        return mostrarMensagem('A quantidade de kits para montar deve ser maior que zero.', 'aviso');
    }
    if (qtdKitsParaEnviar > maxKitsMontaveis) {
        return mostrarMensagem(`Não é possível montar ${qtdKitsParaEnviar} kit(s). Máximo disponível: ${maxKitsMontaveis}.`, 'erro');
    }
    
    const kitProdutoSelecionadoObj = todosOsProdutosCadastrados.find(p => p.id == kitSelecionadoBtnEl.dataset.kitId);
    if (!kitProdutoSelecionadoObj) {
        return mostrarMensagem(`Erro: Kit "${nomeKitProduto}" não encontrado.`, 'erro');
    }

    const confirmado = await mostrarConfirmacao(
        `Confirma a montagem de <strong>${qtdKitsParaEnviar}</strong> kit(s) de <br><strong>${nomeKitProduto} - ${variacaoKitProduto}</strong>?`,
        'aviso'
    );
    if (!confirmado) return;

    operacaoEmAndamento.add('montarKits');
    btnMontarEl.disabled = true;
    btnMontarEl.innerHTML = '<div class="spinner-btn-interno"></div> Montando Kits...';
    
    try {
        const variacaoDoKitObj = kitProdutoSelecionadoObj.grade?.find(g => g.variacao === variacaoKitProduto);
        const composicaoDoKitSelecionado = variacaoDoKitObj?.composicao;
        if (!composicaoDoKitSelecionado || composicaoDoKitSelecionado.length === 0) {
            throw new Error('Composição do kit não encontrada ou está vazia.');
        }

        const componentesParaPayload = [];
        
        for (const itemCompDef of composicaoDoKitSelecionado) {
            const idComp = itemCompDef.produto_id;
            const varComp = itemCompDef.variacao === '-' ? null : (itemCompDef.variacao || null);
            const qtdNecPorKit = parseInt(itemCompDef.quantidade) || 1;
            let qtdTotalCompNec = qtdKitsParaEnviar * qtdNecPorKit;
            
            const arrematesDisponiveisDoComponente = await buscarArrematesDetalhados(idComp, varComp);
            arrematesDisponiveisDoComponente.sort((a, b) => new Date(a.data_lancamento) - new Date(b.data_lancamento));
            
            for (const arremateComp of arrematesDisponiveisDoComponente) {
                if (qtdTotalCompNec <= 0) break;
                
                const saldoNesteArremate = arremateComp.quantidade_arrematada - arremateComp.quantidade_ja_embalada;
                const qtdUsarDesteArremate = Math.min(qtdTotalCompNec, saldoNesteArremate);

                if (qtdUsarDesteArremate > 0) {
                    componentesParaPayload.push({
                        id_arremate: arremateComp.id,
                        produto_id: idComp, // Passando o ID para o backend
                        variacao: varComp,   // Passando a variação para o backend
                        quantidade_usada: qtdUsarDesteArremate
                    });
                    qtdTotalCompNec -= qtdUsarDesteArremate;
                }
            }

            if (qtdTotalCompNec > 0) {
                throw new Error(`Saldo insuficiente para o componente "${itemCompDef.produto_nome}".`);
            }
        }

        const payloadAPI = {
            kit_produto_id: kitProdutoSelecionadoObj.id,
            kit_variante: variacaoKitProduto === '-' ? null : variacaoKitProduto,
            quantidade_kits_montados: qtdKitsParaEnviar,
            componentes_consumidos_de_arremates: componentesParaPayload,
            observacao: observacaoMontagem
        };

        // Chama o endpoint correto em api/kits.js
        await fetchFromAPI('/kits/montar', { method: 'POST', body: JSON.stringify(payloadAPI) });
        
        mostrarMensagem(`${qtdKitsParaEnviar} kit(s) montado(s) com sucesso!`, 'sucesso', 3000);
        window.location.hash = '';
        
    } catch (error) {
        console.error('[montarKits] Erro:', error);
        mostrarMensagem(`Erro ao montar kits: ${error.message}`, 'erro');
    } finally {
        operacaoEmAndamento.delete('montarKits');
        btnMontarEl.disabled = false;
        btnMontarEl.innerHTML = '<i class="fas fa-boxes"></i> MONTAR E ESTOCAR KITS';
    }
}

async function atualizarContadoresPainel() {
    const contadorTotalEl = document.getElementById('contadorTotalAEmbalar');
    const contadorAguardandoEl = document.getElementById('contadorAguardandoMuitoTempo');
    const contadorHojeEl = document.getElementById('contadorEmbaladoHoje');

    // Usa o total de itens que guardamos da última chamada da API
    if (contadorTotalEl) {
        contadorTotalEl.textContent = totaisDaFilaDeEmbalagem.totalItems;
    }

    // Para o contador "Aguardando", vamos pedir esse número específico para a API
    if (contadorAguardandoEl) {
        try {
            const response = await fetchFromAPI('/embalagens/fila/contagem-antigos');
            totaisDaFilaDeEmbalagem.aguardandoMuito = response.total || 0;
            contadorAguardandoEl.textContent = totaisDaFilaDeEmbalagem.aguardandoMuito;
        } catch (error) {
            console.error("Erro ao buscar contagem de itens antigos:", error);
            contadorAguardandoEl.textContent = "?";
        }
    }
    
    // O contador "Embalado Hoje" já funciona bem e pode continuar como está
    if (contadorHojeEl) {
        try {
            contadorHojeEl.textContent = '...';
            const response = await fetchFromAPI('/embalagens/contagem-hoje');
            contadorHojeEl.textContent = response.total || 0;
        } catch (error) {
            console.error("Erro ao buscar contagem de embalagens de hoje:", error);
            contadorHojeEl.textContent = "?";
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

    // Garante que todos os elementos da interface existam antes de prosseguir.
    if (!kitTableBodyEl || !qtdDisponivelKitsSpanEl || !qtdEnviarKitsInputEl || !kitErrorMessageEl || !kitAcaoMontagemWrapperEl) {
        console.error("[carregarTabelaKitNova] ERRO: Elementos da UI para a aba de kits não foram encontrados.");
        return;
    }

    // Reset inicial da UI
    kitErrorMessageEl.classList.add('hidden');
    kitTableBodyEl.innerHTML = `<tr><td colspan="4"><div class="spinner">Analisando disponibilidade dos componentes...</div></td></tr>`;
    qtdEnviarKitsInputEl.disabled = true;
    qtdDisponivelKitsSpanEl.textContent = '0';
    kitAcaoMontagemWrapperEl.style.display = 'none';

    // Busca a definição do kit e sua composição
    const kitSelecionado = todosOsProdutosCadastrados.find(p => p.nome === kitNome && p.is_kit === true);
    if (!kitSelecionado) {
        kitTableBodyEl.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">Erro: Definição do kit "${kitNome}" não encontrada.</td></tr>`;
        return;
    }

    const variacaoDoKitObj = kitSelecionado.grade?.find(g => g.variacao === variacaoKitSelecionada);
    const composicaoDoKit = variacaoDoKitObj?.composicao;
    if (!composicaoDoKit || composicaoDoKit.length === 0) {
        kitErrorMessageEl.textContent = 'A composição para esta variação do kit não foi definida.';
        kitErrorMessageEl.classList.remove('hidden');
        kitTableBodyEl.innerHTML = '';
        return;
    }

    // Variáveis para o cálculo de disponibilidade
    let menorQuantidadeKitsMontaveis = Infinity;
    let todosComponentesDisponiveis = true; // << Nome correto da variável
    const linhasTabela = [];

    // Loop para verificar cada componente do kit
    for (const itemComponente of composicaoDoKit) {
        const nomeComp = itemComponente.produto_nome || 'Componente Desconhecido';
        const varComp = itemComponente.variacao || '-';
        const qtdNecPorKit = parseInt(itemComponente.quantidade) || 1;
        
        // Busca o saldo real e detalhado para este componente específico
        const arrematesDoComponente = await buscarArrematesDetalhados(itemComponente.produto_id, varComp);
        
        // Calcula o saldo total somando o saldo de cada lote de arremate individual
        const saldoTotalComponente = arrematesDoComponente.reduce((total, arr) => {
            return total + (arr.quantidade_arrematada - arr.quantidade_ja_embalada);
        }, 0);
        
        let statusTexto = 'OK', statusClasse = 'ok';
        if (saldoTotalComponente < qtdNecPorKit) {
            statusTexto = 'EM FALTA';
            statusClasse = 'em-falta';
            todosComponentesDisponiveis = false; // << Usando o nome correto
        } else if (saldoTotalComponente < (qtdNecPorKit * 2)) {
            statusTexto = 'ATENÇÃO';
            statusClasse = 'atencao';
        }
        
        linhasTabela.push(`
            <tr>
                <td>${nomeComp}${varComp !== '-' ? ` (${varComp})` : ''}</td>
                <td style="text-align:center;">${qtdNecPorKit}</td>
                <td style="text-align:center;">${saldoTotalComponente}</td>
                <td style="text-align:center;"><span class="ep-status-componente ${statusClasse}">${statusTexto}</span></td>
            </tr>
        `);

        if (qtdNecPorKit > 0) {
            const kitsPossiveisComEsteComponente = Math.floor(saldoTotalComponente / qtdNecPorKit);
            menorQuantidadeKitsMontaveis = Math.min(menorQuantidadeKitsMontaveis, kitsPossiveisComEsteComponente);
        } else {
             menorQuantidadeKitsMontaveis = 0;
        }
    }

    kitTableBodyEl.innerHTML = linhasTabela.join('');
    
    // <<< CÁLCULO FINAL USANDO O NOME CORRETO DA VARIÁVEL >>>
    const maxKitsMontaveisFinal = (todosComponentesDisponiveis && menorQuantidadeKitsMontaveis !== Infinity) 
                                  ? menorQuantidadeKitsMontaveis 
                                  : 0;
    
    qtdDisponivelKitsSpanEl.textContent = maxKitsMontaveisFinal;
    
    // Lógica para mostrar ou esconder a seção de montagem
    if (maxKitsMontaveisFinal > 0) {
        kitAcaoMontagemWrapperEl.style.display = 'block';
        kitErrorMessageEl.classList.add('hidden');
        qtdEnviarKitsInputEl.max = maxKitsMontaveisFinal;
        qtdEnviarKitsInputEl.value = '1'; // Define 1 como valor inicial
        qtdEnviarKitsInputEl.disabled = false;
    } else {
        kitAcaoMontagemWrapperEl.style.display = 'none';
        kitErrorMessageEl.textContent = 'Componentes insuficientes para montar este kit.';
        kitErrorMessageEl.classList.remove('hidden');
        qtdEnviarKitsInputEl.value = '0';
        qtdEnviarKitsInputEl.disabled = true;
    }

    // Garante que o estado do botão de montar seja atualizado
    atualizarEstadoBotaoMontarKitNova();
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
    
    btnMontarEl.disabled = !(valor > 0 && valor <= maxKitsMontaveis && podeMontarPermissao);
}

// --- Controle de Views (Hash e LocalStorage) ---
async function handleHashChangeEmbalagem() {
    const hash = window.location.hash;
    const embalagemListViewEl = document.getElementById('embalagemListViewNova');
    const embalarDetalheViewEl = document.getElementById('embalarDetalheView');

    if (!embalagemListViewEl || !embalarDetalheViewEl) return;

    // Esconde ambas as views para uma transição limpa
    embalagemListViewEl.style.display = 'none';
    embalarDetalheViewEl.style.display = 'none';

    if (hash === '#embalar-produto') {
        // --- MOSTRA A TELA DE DETALHES ---
        const data = localStorage.getItem('embalarDetalheAtual');
        if (data) {
            embalarDetalheViewEl.style.display = 'block';
            adicionarBotaoFechar(embalarDetalheViewEl, () => { window.location.hash = ''; });
            await carregarDetalhesEmbalagemView(JSON.parse(data));
        } else {
            // Se não encontrou dados, volta para a lista para evitar uma tela vazia
            window.location.hash = ''; 
        }
    } else { 
        // --- MOSTRA A TELA DE LISTA ---
        localStorage.removeItem('embalarDetalheAtual');
        embalagemAgregadoEmVisualizacao = null;

        embalagemListViewEl.style.display = 'block';
        
        // A mágica acontece aqui: chama a função que busca os dados da API e renderiza a lista.
        // O spinner já é controlado dentro desta função.
        await renderizarCardsEmbalagem(1); 
        
        // Após renderizar a lista, atualiza os contadores do dashboard.
        await atualizarContadoresPainel(); 
    }
}

async function inicializarDadosEViewsEmbalagem() {
    // Pega o container principal da lista de embalagem
    const containerPrincipal = document.getElementById('embalagemListViewNova');
    if (!containerPrincipal) return;

    // 1. Adiciona a classe de "carregando" para bloquear cliques
    containerPrincipal.classList.add('carregando-dados-iniciais');

    try {
        // 2. Carrega todos os dados essenciais em paralelo
        await Promise.all([
            obterProdutosDoStorage(true).then(p => { todosOsProdutosCadastrados = p; }),
            fetchFromAPI('/usuarios').then(users => { todosOsUsuarios = users || []; })
        ]);

        // 3. Somente depois que TUDO estiver carregado, chama o roteador
        await handleHashChangeEmbalagem();

    } catch (error) {
        console.error("Erro crítico na inicialização de dados:", error);
        mostrarMensagem("Não foi possível carregar os dados essenciais da página.", "erro");
    } finally {
        // 4. Remove a classe de "carregando", liberando os cliques
        containerPrincipal.classList.remove('carregando-dados-iniciais');
    }
}


// --- LÓGICA PARA O NOVO MODAL DE HISTÓRICO GERAL ---
let historicoGeralCurrentPage = 1;
const HISTORICO_GERAL_PER_PAGE = 10;


// Função principal que busca e renderiza os dados do histórico
async function carregarHistoricoGeral(page = 1) {
    historicoGeralCurrentPage = page;
    const tabelaWrapper = document.getElementById('historicoGeralTabelaWrapper');
    const paginacaoContainer = document.getElementById('historicoGeralPaginacao');
    tabelaWrapper.innerHTML = '<div class="spinner">Buscando histórico...</div>';
    paginacaoContainer.innerHTML = '';

    try {
        const params = new URLSearchParams({
            tipoEvento: document.getElementById('filtroTipoEvento').value,
            usuarioId: document.getElementById('filtroUsuario').value,
            periodo: document.getElementById('filtroPeriodo').value,
            page: page,
            limit: HISTORICO_GERAL_PER_PAGE
        });

        const response = await fetchFromAPI(`/embalagens/historico-geral?${params.toString()}`);
        const { rows: eventos, pagination } = response;

        if (eventos.length === 0) {
            tabelaWrapper.innerHTML = '<p style="text-align: center;">Nenhum evento encontrado para os filtros selecionados.</p>';
            return;
        }

        // Constrói a tabela (ou cards para mobile)
        let htmlResult = `
            <table class="ep-tabela-estilizada">
                <thead>
                    <tr>
                        <th>Evento</th>
                        <th>Produto</th>
                        <th style="text-align: right;">Qtd</th>
                        <th>Usuário</th>
                        <th>Data</th>
                    </tr>
                </thead>
                <tbody>
        `;
        eventos.forEach(ev => {
        const tipoFormatado = formatarTipoEvento(ev.tipo_evento, ev.status);
        htmlResult += `
            <tr>
                <td data-label="Evento">${tipoFormatado}</td>
                <td data-label="Produto">${ev.produto_nome}${ev.variante_nome ? ` (${ev.variante_nome})` : ''}</td>
                <td data-label="Qtd" style="text-align: right; font-weight: 500;">${ev.quantidade}</td>
                <td data-label="Usuário">${ev.usuario_nome}</td>
                <td data-label="Data">${new Date(ev.data_evento).toLocaleString('pt-BR')}</td>
            </tr>
        `;
    });
        htmlResult += `</tbody></table>`;
        tabelaWrapper.innerHTML = htmlResult;

        renderizarPaginacao(paginacaoContainer, pagination.totalPages, pagination.currentPage, carregarHistoricoGeral);

    } catch (error) {
        tabelaWrapper.innerHTML = `<p style="text-align: center; color: red;">Erro ao carregar histórico.</p>`;
    }
}

// Função auxiliar para formatar os nomes dos eventos
function formatarTipoEvento(tipo, status) {
    if (status === 'ESTORNADO') {
        return `<span class="ep-tag-estornado">Estornado</span>`;
    }
    const nomes = {
        'embalagem_unidade': 'Embalagem (UN)',
        'montagem_kit': 'Montagem (KIT)',
        'estorno_arremate': 'Estorno (p/ Arremate)',
        'estorno_estoque': 'Estorno (do Estoque)'
    };
    return nomes[tipo] || tipo;
}

async function carregarSugestoesDeEstoque(produtoId, variante, sku) {
    const painel = document.getElementById('painelSugestaoEstoque');
    const conteudo = document.getElementById('sugestaoConteudo');
    if (!painel || !conteudo) return;

    painel.style.display = 'none';
    conteudo.innerHTML = '<div class="spinner">Analisando estoque...</div>';

    try {
        const params = new URLSearchParams({
            produto_id: produtoId,
            variante: variante || '-',
            produto_ref_id: sku
        });

        const data = await fetchFromAPI(`/embalagens/sugestao-estoque?${params.toString()}`);
        
        if (!data.kits_relacionados || data.kits_relacionados.length === 0) {
            console.log(`[Sugestão Estoque] O item ${sku} não compõe nenhum kit. O painel não será exibido.`);
            return;
        }

        const header = painel.querySelector('.ep-sugestao-header');
        if (!header.dataset.listenerAttached) {
            header.addEventListener('click', () => {
                painel.classList.toggle('recolhido');
            });
            header.dataset.listenerAttached = 'true';
        }
        
        painel.classList.remove('recolhido');
        painel.style.display = 'block';

        const produtoPrincipalDef = todosOsProdutosCadastrados.find(p => p.id === produtoId);
        const gradePrincipalDef = produtoPrincipalDef?.grade.find(g => g.variacao === variante);
          
        // 1. Cria o HTML para o card do item principal
        const htmlPrincipal = `
            <div class="ep-radar-card principal">
                <img src="${gradePrincipalDef?.imagem || produtoPrincipalDef?.imagem || '/img/placeholder-image.png'}" class="ep-radar-img" alt="Item principal">
                <div class="nome">${produtoPrincipalDef?.nome || 'Item'} (${variante || 'Padrão'})</div>
                <div class="valor">${data.saldo_em_estoque_principal}</div>
            </div>
        `;

        // 2. Cria o HTML para os cards dos kits (se houver)
        const htmlKits = data.kits_relacionados.map(kit => {
            const kitDef = todosOsProdutosCadastrados.find(p => p.id === kit.kit_id);
            const gradeKitDef = kitDef?.grade.find(g => g.sku === kit.kit_sku);
            
            let classeSaldoKit = '';
            if (kit.saldo_em_estoque <= 5) classeSaldoKit = 'critico-estoque';
            else if (kit.saldo_em_estoque <= 15) classeSaldoKit = 'baixo-estoque';

            return `
                <div class="ep-radar-card ${classeSaldoKit}">
                    <img src="${gradeKitDef?.imagem || kitDef?.imagem || '/img/placeholder-image.png'}" class="ep-radar-img" alt="${kit.kit_nome}">
                    <div class="nome">${kit.kit_nome} (${kit.kit_variacao})</div>
                    <div class="valor">${kit.saldo_em_estoque}</div>
                </div>
            `;
        }).join('');

        // 3. Monta o wrapper final com o card principal e os cards dos kits JUNTOS
        conteudo.innerHTML = `<div class="ep-radar-cards-wrapper">${htmlPrincipal}${htmlKits}</div>`;

        // --- FIM DA CORREÇÃO ---

    } catch (error) {
        console.error("Erro ao carregar sugestões:", error);
        painel.style.display = 'none';
    }
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

        document.getElementById('btnAbrirHistoricoGeral')?.addEventListener('click', abrirModalHistoricoGeral);

        await inicializarDadosEViewsEmbalagem(); 

        window.addEventListener('hashchange', handleHashChangeEmbalagem);

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

            // Troca a classe 'active' dos botões
            document.querySelectorAll('#embalarDetalheView .ep-tabs .ep-tab-btn').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');

            // Troca a classe 'active' e a visibilidade dos painéis
            document.querySelectorAll('#embalarDetalheView .ep-tab-panel').forEach(p => {
                p.classList.remove('active');
                p.style.display = 'none'; 
            });

            const activePanel = document.getElementById(`${tabId}-tab-nova`);
            if (activePanel) {
                activePanel.classList.add('active');
                activePanel.style.display = 'block'; 
            }
            
            // Lógica para carregar o conteúdo específico de cada aba
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
            
            } else if (tabId === 'retornar' && embalagemAgregadoEmVisualizacao) {
                // Quando a aba "Voltar para Arremate" for clicada, chama a função para carregar os dados.
                carregarArrematesDeOrigem(1)
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
        mostrarMensagem("Erro crítico ao carregar a página. Tente recarregar.", "erro", 0);
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
    mostrarMensagem('Cache local de embalagem de produtos limpo.', 'aviso');
    await inicializarDadosEViewsEmbalagem(); // Recarrega tudo
};