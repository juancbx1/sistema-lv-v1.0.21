// public/js/admin-estoque.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos, invalidateCache } from '/js/utils/storage.js'; 

// --- Variáveis Globais ---
let permissoesGlobaisEstoque = [];
let usuarioLogadoEstoque = null;
let itemEstoqueSelecionado = null; // << NOVO: Variável unificada para o item em edição/detalhe
let niveisEstoqueAlertaCache = [];
let produtoSelecionadoParaConfigNiveis = null;
let editandoNivelId = null;
let currentPageEstoqueTabela = 1;
const itemsPerPageEstoqueTabela = 6;
let saldosEstoqueGlobaisCompletos = [];
let filtroAlertaAtivo = null;
let todosOsProdutosCadastrados = [];
let todosProdutosParaConfigNiveis = [];

let modalNiveisElement; 
let modalNiveisTituloElement;
let formModalNiveisElement;
let selectProdutoNiveisElement;
let inputNivelBaixoElement;
let inputNivelUrgenteElement;
let niveisValidationMessageElement;

// NOVO: Variáveis para o modal de histórico
let modalHistoricoElement;

let currentPageHistorico = 1;
const itemsPerPageHistorico = 6; 


// --- VARIÁVEIS PARA O MÓDULO DE SEPARAÇÃO ---
let itensEmSeparacao = new Map(); // Usaremos um Map para gerenciar os itens no "carrinho"
let produtoEmDetalheSeparacao = null;

// --- VARIÁVEIS PARA O MÓDULO DE FILA DE PRODUCAO ---
let promessasDeProducaoCache = [];



// --- FUNÇÃO DE POPUP DE MENSAGEM (Sem alterações) ---
function mostrarPopupEstoque(mensagem, tipo = 'info', duracao = 4000, permitirHTML = false) { 
    const popupId = `popup-estoque-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `es-popup-mensagem popup-${tipo}`; 

    const overlayId = `overlay-estoque-${popupId}`;
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'es-popup-overlay';

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
        popup.style.animation = 'es-fadeOutPopup 0.3s ease-out forwards';
        overlay.style.animation = 'es-fadeOutOverlayPopup 0.3s ease-out forwards';
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
                el.style.animation = 'es-fadeOutPopup 0.3s ease-out forwards';
                const ov = document.getElementById(overlayId);
                if (ov) ov.style.animation = 'es-fadeOutOverlayPopup 0.3s ease-out forwards';
                
                setTimeout(() => {
                    if (document.body.contains(el)) document.body.removeChild(el);
                    if (ov && document.body.contains(ov)) document.body.removeChild(ov);
                }, 300);
            }
        }, duracao);
    }
}

// NOVO: Função para um popup de confirmação (Sim/Não)
function mostrarPopupConfirmacao(mensagem, tipo = 'aviso') {
    return new Promise((resolve) => {
        // Remove qualquer popup de confirmação existente para evitar duplicação
        const popupExistente = document.getElementById('popup-confirmacao-estoque');
        if (popupExistente) popupExistente.parentElement.remove();

        const container = document.createElement('div');
        container.id = 'popup-confirmacao-estoque';

        const popup = document.createElement('div');
        popup.className = `es-popup-mensagem popup-${tipo}`;
        popup.style.animation = 'es-fadeInPopup 0.3s ease-out';
        
        const overlay = document.createElement('div');
        overlay.className = 'es-popup-overlay';
        overlay.style.animation = 'es-fadeInOverlayPopup 0.3s ease-out';

        const p = document.createElement('p');
        p.innerHTML = mensagem; // Usar innerHTML para permitir <br> etc.
        popup.appendChild(p);

        const botoesContainer = document.createElement('div');
        botoesContainer.style.display = 'flex';
        botoesContainer.style.gap = '10px';
        botoesContainer.style.justifyContent = 'center';

        const fecharEResolver = (valor) => {
            popup.style.animation = 'es-fadeOutPopup 0.3s ease-out forwards';
            overlay.style.animation = 'es-fadeOutOverlayPopup 0.3s ease-out forwards';
            setTimeout(() => {
                document.body.removeChild(container);
                resolve(valor);
            }, 300);
        };

        const btnConfirmar = document.createElement('button');
        btnConfirmar.textContent = 'Sim, continuar';
        btnConfirmar.className = 'es-btn-confirmar'; // Adicionaremos um estilo para ele
        btnConfirmar.onclick = () => fecharEResolver(true);

        const btnCancelar = document.createElement('button');
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.className = 'es-btn-cancelar'; // Adicionaremos um estilo para ele
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
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Função para gerar texto de plural de forma inteligente
function getLabelFiltro(chave) {
    if (chave.toLowerCase().endsWith('r')) {
        return `Todos(as) ${chave}es`; // Ex: Cor -> Cores
    }
    if (chave.toLowerCase().endsWith('o')) {
        return `Todos os ${chave}s`; // Ex: Tamanho -> Tamanhos
    }
    return `Todos(as) ${chave}s`; // Padrão
}

// --- FUNÇÃO PARA CHAMADAS À API (Sem alterações) ---
async function fetchEstoqueAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarPopupEstoque('Erro de autenticação. Faça login novamente.', 'erro');
        window.location.href = '/index.html';
        throw new Error('Token não encontrado');
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    let url = `/api${endpoint}`;
    if ((!options.method || options.method.toUpperCase() === 'GET') && !url.includes('?')) {
        url += `?_=${Date.now()}`;
    } else if ((!options.method || options.method.toUpperCase() === 'GET') && url.includes('?')) {
        url += `&_=${Date.now()}`;
    }

    try {
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            let errorData = { error: `Erro ${response.status} - ${response.statusText}` };
            try {
                const jsonError = await response.json();
                errorData = jsonError || errorData;
            } catch (e) { /* Ignora */ }
            
            console.error(`[fetchEstoqueAPI] Erro ${response.status} em ${endpoint}:`, errorData);

            if (response.status === 401 || (errorData.error || '').toLowerCase().includes('token')) {
                localStorage.removeItem('token');
                mostrarPopupEstoque('Sessão expirada ou inválida. Faça login novamente.', 'erro');
                window.location.href = '/index.html';
            }
            
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status;
            err.data = errorData;
            throw err;
        }
        if (response.status === 204 || options.method === 'DELETE') {
            return { success: true };
        }
        return await response.json();
    } catch (error) {
        console.error(`[fetchEstoqueAPI] Falha ao acessar ${url}:`, error);
        throw error; 
    }
}

// --- LÓGICA DE NÍVEIS DE ALERTA (Sem alterações) ---
async function abrirModalConfigurarNiveis() {
    console.log(`%c[ABRINDO MODAL] - 'Configurar Níveis' foi chamada.`, 'color: #27ae60; font-weight: bold;');
    
    if (!permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque')) {
        mostrarPopupEstoque('Você não tem permissão para configurar níveis de estoque.', 'aviso');
        return;
    }

    // Reseta o estado do modal antes de abrir
    const tbody = document.getElementById('tbodyConfigNiveis');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;"><div class="es-spinner"></div></td></tr>`;
    document.getElementById('buscaProdutoNiveisModal').value = '';
    
    // Mostra o modal
    modalNiveisElement.style.display = 'flex';

    try {
        // A lógica de fetch e renderização permanece a mesma
        const [todosProdutos, niveisSalvos] = await Promise.all([
            obterProdutos(),
            fetchEstoqueAPI('/niveis-estoque')
        ]);
        niveisEstoqueAlertaCache = niveisSalvos || [];
        todosProdutosParaConfigNiveis = [];
        todosProdutos.forEach(p => {
            if (p.grade && p.grade.length > 0) {
                p.grade.forEach(g => {
                    const nomeVar = g.variacao || 'Padrão';
                    const skuVariacao = g.sku || `${p.sku || p.nome.toUpperCase().replace(/\W/g, '')}-${nomeVar.replace(/\W/g, '')}`;
                    todosProdutosParaConfigNiveis.push({ produto_ref_id: skuVariacao, nome_completo: `${p.nome} ${nomeVar !== 'Padrão' ? `(${nomeVar})` : ''}` });
                });
            } else {
                 const skuBase = p.sku || p.nome.toUpperCase().replace(/\W/g, '');
                 todosProdutosParaConfigNiveis.push({ produto_ref_id: skuBase, nome_completo: `${p.nome} (Padrão)` });
            }
        });
        todosProdutosParaConfigNiveis.sort((a,b) => a.nome_completo.localeCompare(b.nome_completo));
        renderizarTabelaConfigNiveis(todosProdutosParaConfigNiveis);
    } catch (error) {
        mostrarPopupEstoque("Erro ao carregar dados para configuração de níveis.", "erro");
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red;">Erro ao carregar.</td></tr>`;
    }
}

function renderizarTabelaConfigNiveis(itensParaRenderizar) {
    const tbody = document.getElementById('tbodyConfigNiveis');
    if (!tbody) return;
    tbody.innerHTML = ''; 

    if (!itensParaRenderizar || itensParaRenderizar.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nenhum produto/variação para configurar.</td></tr>`;
        return;
    }

    itensParaRenderizar.forEach(item => {
        const configExistente = niveisEstoqueAlertaCache.find(n => n.produto_ref_id === item.produto_ref_id);
        const tr = tbody.insertRow();
        tr.dataset.produtoRefId = item.produto_ref_id; 

        const nivelBaixoOriginal = configExistente?.nivel_estoque_baixo ?? '';
        const nivelUrgenteOriginal = configExistente?.nivel_reposicao_urgente ?? '';
        const nivelIdealOriginal = configExistente?.nivel_estoque_ideal ?? ''; // NOVO
        const ativoOriginal = configExistente?.ativo !== false;

        tr.innerHTML = `
            <td data-label="Produto/Variação">${item.nome_completo}</td>
            <td data-label="Nível Estoque Baixo">
                <input type="number" class="es-input input-nivel-baixo" value="${nivelBaixoOriginal}" placeholder="0" min="0" data-original-value="${nivelBaixoOriginal}">
            </td>
            <td data-label="Nível Rep. Urgente">
                <input type="number" class="es-input input-nivel-urgente" value="${nivelUrgenteOriginal}" placeholder="0" min="0" data-original-value="${nivelUrgenteOriginal}">
            </td>
            <!-- NOVO INPUT PARA ESTOQUE IDEAL -->
            <td data-label="Nível Estoque Ideal">
                <input type="number" class="es-input input-nivel-ideal" value="${nivelIdealOriginal}" placeholder="0" min="0" data-original-value="${nivelIdealOriginal}">
            </td>
            <td data-label="Ativo" style="text-align:center;">
                <input type="checkbox" class="input-nivel-ativo" ${ativoOriginal ? 'checked' : ''} data-original-value="${ativoOriginal}">
            </td>
        `;
    });
}

async function salvarNiveisEmLote() {
    const validationMsgEl = document.getElementById('niveisLoteValidationMessage');
    if (validationMsgEl) { validationMsgEl.textContent = ''; validationMsgEl.style.display = 'none'; }

    const configsParaSalvar = [];
    const linhasTabela = document.querySelectorAll('#tbodyConfigNiveis tr');
    let algumaValidacaoFalhou = false;
    let errosDeValidacao = [];

    linhasTabela.forEach(tr => {
        tr.classList.remove('linha-erro-validacao');
        const inputBaixoEl = tr.querySelector('.input-nivel-baixo');
        const inputUrgenteEl = tr.querySelector('.input-nivel-urgente');
        const inputIdealEl = tr.querySelector('.input-nivel-ideal'); // NOVO
        const inputAtivoEl = tr.querySelector('.input-nivel-ativo');
        if (!inputBaixoEl || !inputUrgenteEl || !inputIdealEl || !inputAtivoEl) return;

        const produtoRefId = tr.dataset.produtoRefId;
        const nomeCompletoProduto = tr.cells[0].textContent;
        
        const valBaixoStr = inputBaixoEl.value.trim();
        const valUrgenteStr = inputUrgenteEl.value.trim();
        const valIdealStr = inputIdealEl.value.trim(); // NOVO
        const ativo = inputAtivoEl.checked;

        const originalBaixo = inputBaixoEl.dataset.originalValue;
        const originalUrgente = inputUrgenteEl.dataset.originalValue;
        const originalIdeal = inputIdealEl.dataset.originalValue; // NOVO
        const originalAtivo = inputAtivoEl.dataset.originalValue === 'true';

        const precisaSalvar = valBaixoStr !== originalBaixo || valUrgenteStr !== originalUrgente || valIdealStr !== originalIdeal || ativo !== originalAtivo;

        if (precisaSalvar) {
            let nivelBaixo = null, nivelUrgente = null, nivelIdeal = null; // NOVO
            let linhaValida = true;

            if (valBaixoStr !== '') nivelBaixo = parseInt(valBaixoStr);
            if (valUrgenteStr !== '') nivelUrgente = parseInt(valUrgenteStr);
            if (valIdealStr !== '') nivelIdeal = parseInt(valIdealStr); // NOVO

            // Validações
            if (valIdealStr !== '' && (isNaN(nivelIdeal) || nivelIdeal < 0)) { errosDeValidacao.push(`"${nomeCompletoProduto}": Nível Ideal inválido.`); linhaValida = false; }
            if (valBaixoStr !== '' && (isNaN(nivelBaixo) || nivelBaixo < 0)) { errosDeValidacao.push(`"${nomeCompletoProduto}": Nível Baixo inválido.`); linhaValida = false; }
            if (valUrgenteStr !== '' && (isNaN(nivelUrgente) || nivelUrgente < 0)) { errosDeValidacao.push(`"${nomeCompletoProduto}": Nível Urgente inválido.`); linhaValida = false; }
            if (nivelUrgente !== null && nivelBaixo !== null && nivelUrgente > nivelBaixo) { errosDeValidacao.push(`"${nomeCompletoProduto}": Urgente > Baixo.`); linhaValida = false; }
            if (nivelBaixo !== null && nivelIdeal !== null && nivelBaixo > nivelIdeal) { errosDeValidacao.push(`"${nomeCompletoProduto}": Baixo > Ideal.`); linhaValida = false; }

            if (linhaValida) {
                configsParaSalvar.push({
                    produto_ref_id: produtoRefId,
                    nivel_estoque_baixo: nivelBaixo,
                    nivel_reposicao_urgente: nivelUrgente,
                    nivel_estoque_ideal: nivelIdeal, // NOVO
                    ativo: ativo
                });
            } else {
                algumaValidacaoFalhou = true;
                tr.classList.add('linha-erro-validacao');
            }
        }
    });

    if (algumaValidacaoFalhou) {
        if (validationMsgEl) {
            validationMsgEl.innerHTML = `Corrija os erros:<br>${errosDeValidacao.join('<br>')}`;
            validationMsgEl.style.display = 'block';
        }
        mostrarPopupEstoque('Existem erros de validação.', 'erro');
        return;
    }

    if (configsParaSalvar.length === 0) {
        mostrarPopupEstoque('Nenhuma alteração para salvar.', 'info');
        return;
    }

    const btnSalvarLoteEl = document.getElementById('btnSalvarNiveisEmLote');
    const originalText = btnSalvarLoteEl.textContent;
    btnSalvarLoteEl.disabled = true;
    btnSalvarLoteEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        await fetchEstoqueAPI('/niveis-estoque/batch', { method: 'POST', body: JSON.stringify({ configs: configsParaSalvar }) });
        mostrarPopupEstoque('Configurações de nível salvas com sucesso!', 'sucesso');
        
        // Atualiza cache local
        configsParaSalvar.forEach(savedConfig => {
            const index = niveisEstoqueAlertaCache.findIndex(c => c.produto_ref_id === savedConfig.produto_ref_id);
            if (index > -1) niveisEstoqueAlertaCache[index] = { ...niveisEstoqueAlertaCache[index], ...savedConfig };
            else niveisEstoqueAlertaCache.push(savedConfig);
        });

        fecharModalNiveis();
        await carregarTabelaEstoque(document.getElementById('searchEstoque')?.value || '');
    } catch (error) {
        mostrarPopupEstoque(`Erro ao salvar: ${error.data?.details || error.message}`, 'erro');
    } finally {
        if (btnSalvarLoteEl) { btnSalvarLoteEl.disabled = false; btnSalvarLoteEl.innerHTML = originalText; }
    }
}


function fecharModalNiveis() {
     if (modalNiveisElement) modalNiveisElement.style.display = 'none';
     if (formModalNiveisElement) formModalNiveisElement.reset();
     editandoNivelId = null; 
     produtoSelecionadoParaConfigNiveis = null;
     if(selectProdutoNiveisElement) selectProdutoNiveisElement.value = '';
     if(inputNivelBaixoElement) inputNivelBaixoElement.disabled = true;
     if(inputNivelUrgenteElement) inputNivelUrgenteElement.disabled = true;
     if(niveisValidationMessageElement) niveisValidationMessageElement.style.display = 'none';
 }
// --- FIM DA LÓGICA DE NÍVEIS ---


// --- LÓGICA DE DADOS E TABELA PRINCIPAL (Sem alterações significativas) ---
async function obterSaldoEstoqueAtualAPI() {
    console.log('[obterSaldoEstoqueAtualAPI] Buscando saldo do estoque...');
    try {
        const saldo = await fetchEstoqueAPI('/estoque/saldo'); 
        saldosEstoqueGlobaisCompletos = saldo || [];
        return saldosEstoqueGlobaisCompletos;
    } catch (error) {
        console.error('[obterSaldoEstoqueAtualAPI] Erro ao buscar saldo:', error);
        mostrarPopupEstoque('Falha ao carregar dados do estoque.', 'erro');
        return [];
    }
}

async function carregarTabelaEstoque(searchTerm = '', page = 1) {
    // A lógica de filtros, busca de dados e paginação permanece a mesma
    if (searchTerm && filtroAlertaAtivo) {
        filtroAlertaAtivo = null;
        document.getElementById('filtroAtivoHeader').style.display = 'none';
        document.querySelectorAll('.es-alerta-card').forEach(c => c.classList.remove('filtro-ativo'));
    }
    
    currentPageEstoqueTabela = parseInt(page) || 1;
    const container = document.getElementById('estoqueCardsContainer'); // Alvo agora é o container de cards
    if (!container) return;
    container.innerHTML = `<div class="es-spinner" style="grid-column: 1 / -1;"></div>`;
    
    try {
        let dadosDeSaldo;
        if (saldosEstoqueGlobaisCompletos.length === 0 || filtroAlertaAtivo) {
            dadosDeSaldo = await obterSaldoEstoqueAtualAPI(); 
        } else {
            dadosDeSaldo = [...saldosEstoqueGlobaisCompletos];
        }

        const [todosProdutosDef, niveisDeAlertaApi] = await Promise.all([
            obterProdutos(), 
            niveisEstoqueAlertaCache.length > 0 ? Promise.resolve([...niveisEstoqueAlertaCache]) : fetchEstoqueAPI('/niveis-estoque')
        ]);
        
        if (niveisEstoqueAlertaCache.length === 0) niveisEstoqueAlertaCache = Array.isArray(niveisDeAlertaApi) ? niveisDeAlertaApi : [];
        const niveisAlertaValidos = niveisEstoqueAlertaCache;

        // ... (lógica de cálculo de contadores de alerta permanece a mesma) ...
        let countUrgente = 0, countBaixo = 0;
        dadosDeSaldo.forEach(item => {
            const configNivel = niveisAlertaValidos.find(n => n.produto_ref_id === item.produto_ref_id && n.ativo);
            if (configNivel) {
                const saldoNum = parseFloat(item.saldo_atual);
                if (configNivel.nivel_reposicao_urgente !== null && saldoNum <= configNivel.nivel_reposicao_urgente) countUrgente++;
                else if (configNivel.nivel_estoque_baixo !== null && saldoNum <= configNivel.nivel_estoque_baixo) countBaixo++;
            }
        });

        // --- Lógica para fazer o ícone piscar ---
        const iconeUrgente = document.querySelector('#cardReposicaoUrgente .es-alerta-icone');
        if (iconeUrgente) {
            if (countUrgente > 0) {
                iconeUrgente.classList.add('icone-piscando');
            } else {
                iconeUrgente.classList.remove('icone-piscando');
            }
        }
        // --- Fim da lógica de icone piscando ---

        document.getElementById('contadorUrgente').textContent = countUrgente;
        document.getElementById('contadorBaixo').textContent = countBaixo;

        let itensFiltrados = [...dadosDeSaldo];
        if (filtroAlertaAtivo) {
            itensFiltrados = itensFiltrados.filter(item => {
                const configNivel = niveisAlertaValidos.find(n => n.produto_ref_id === item.produto_ref_id && n.ativo);
                if (!configNivel) return false;
                const saldoNum = parseFloat(item.saldo_atual);
                if (filtroAlertaAtivo === 'urgente') return configNivel.nivel_reposicao_urgente !== null && saldoNum <= configNivel.nivel_reposicao_urgente;
                if (filtroAlertaAtivo === 'baixo') return configNivel.nivel_estoque_baixo !== null && saldoNum <= configNivel.nivel_estoque_baixo && (configNivel.nivel_reposicao_urgente === null || saldoNum > configNivel.nivel_reposicao_urgente);
                return false;
            });
        }

        if (searchTerm) {
            const termo = searchTerm.toLowerCase();
            itensFiltrados = itensFiltrados.filter(item =>
                item.produto_nome.toLowerCase().includes(termo) ||
                (item.variante_nome && item.variante_nome !== '-' && item.variante_nome.toLowerCase().includes(termo)) ||
                (item.produto_ref_id && item.produto_ref_id.toLowerCase().includes(termo)) // Adicionado busca por SKU
            );
        }
        
        const totalItems = itensFiltrados.length;
        const totalPages = Math.ceil(totalItems / itemsPerPageEstoqueTabela) || 1;
        currentPageEstoqueTabela = Math.min(currentPageEstoqueTabela, totalPages);
        const itensPaginados = itensFiltrados.slice((currentPageEstoqueTabela - 1) * itemsPerPageEstoqueTabela, currentPageEstoqueTabela * itemsPerPageEstoqueTabela);
           
        // Chama a NOVA função de renderização
        renderizarCardsConsulta(itensPaginados, todosProdutosDef, niveisAlertaValidos);
        
        renderizarPaginacaoEstoque(totalPages, searchTerm);

        const btnMostrarTodosEl = document.getElementById('btnMostrarTodosEstoque');
        if (btnMostrarTodosEl) {
            btnMostrarTodosEl.style.display = (filtroAlertaAtivo || searchTerm) ? 'inline-flex' : 'none';
        }
    } catch (error) { 
        container.innerHTML = `<p style="text-align: center; color: red; grid-column: 1 / -1;">Erro ao carregar estoque.</p>`;
        mostrarPopupEstoque("Erro inesperado ao carregar dados do estoque.", "erro");
    }
}

// FUNÇÃO para renderizar os cards em vez da tabela
function renderizarCardsConsulta(itensDeEstoque, produtosDefinicoes, niveisDeAlerta) {
    const container = document.getElementById('estoqueCardsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (itensDeEstoque.length === 0) {
        container.innerHTML = `<p style="text-align: center; grid-column: 1 / -1;">Nenhum item encontrado.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    itensDeEstoque.forEach(item => {
        const produtoDef = produtosDefinicoes.find(p => p.nome === item.produto_nome);
        let imagemSrc = '/img/placeholder-image.png';
        if (produtoDef) {
            const gradeItem = produtoDef.grade?.find(g => g.variacao === item.variante_nome);
            imagemSrc = gradeItem?.imagem || produtoDef.imagem || '/img/placeholder-image.png';
        }

        const configNivel = niveisDeAlerta.find(n => n.produto_ref_id === item.produto_ref_id && n.ativo);
        let statusClass = 'status-ok';
        if (configNivel) {
            const saldoNum = parseFloat(item.saldo_atual);
            if (configNivel.nivel_reposicao_urgente !== null && saldoNum <= configNivel.nivel_reposicao_urgente) statusClass = 'status-urgente';
            else if (configNivel.nivel_estoque_baixo !== null && saldoNum <= configNivel.nivel_estoque_baixo) statusClass = 'status-baixo';
        }

        const card = document.createElement('div');
        card.className = `es-consulta-card ${statusClass}`;
        card.dataset.itemEstoque = JSON.stringify(item);
        
        // --- ESTRUTURA HTML SIMPLIFICADA ---
        // Não usamos mais o wrapper extra. O CSS vai cuidar de tudo.
        card.innerHTML = `
            <img src="${imagemSrc}" alt="${item.produto_nome}" class="es-consulta-card-img" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">
            
            <div class="es-consulta-card-info">
                <h3>${item.produto_nome}</h3>
                <p>${item.variante_nome || 'Padrão'}</p>
                <p class="sku-info">SKU: ${item.produto_ref_id || 'N/A'}</p>
            </div>

            <div class="es-consulta-card-dados">
                <div class="dado-bloco">
                    <span class="label">Ideal</span>
                    <span class="valor">${configNivel?.nivel_estoque_ideal ?? '-'}</span>
                </div>
                <div class="dado-bloco">
                    <span class="label">Saldo</span>
                    <span class="valor saldo-atual">${item.saldo_atual}</span>
                </div>
            </div>
        `;

        if (permissoesGlobaisEstoque.includes('gerenciar-estoque')) {
            card.addEventListener('click', (event) => {
                const itemClicado = JSON.parse(event.currentTarget.dataset.itemEstoque);
                abrirViewMovimento(itemClicado);
            });
        }
        fragment.appendChild(card);
    });
    container.appendChild(fragment);
}


function renderizarPaginacaoEstoque(totalPages, searchTermAtual = '') {
    const paginacaoContainer = document.getElementById('estoquePaginacaoContainer');
    if (!paginacaoContainer) return;
    paginacaoContainer.innerHTML = '';

    if (totalPages <= 1) {
        paginacaoContainer.style.display = 'none';
        return;
    }
    paginacaoContainer.style.display = 'flex';

    paginacaoContainer.innerHTML = `
        <button class="pagination-btn es-btn" data-page="${Math.max(1, currentPageEstoqueTabela - 1)}" ${currentPageEstoqueTabela === 1 ? 'disabled' : ''}>Anterior</button>
        <span class="pagination-current">Pág. ${currentPageEstoqueTabela} de ${totalPages}</span>
        <button class="pagination-btn es-btn" data-page="${Math.min(totalPages, currentPageEstoqueTabela + 1)}" ${currentPageEstoqueTabela === totalPages ? 'disabled' : ''}>Próximo</button>
    `;

    paginacaoContainer.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = parseInt(btn.dataset.page);
            carregarTabelaEstoque(searchTermAtual, targetPage); 
        });
    });
}

async function filtrarEstoquePorAlerta(tipoAlerta) {
    filtroAlertaAtivo = tipoAlerta; 
    const searchInput = document.getElementById('searchEstoque');
    if(searchInput) searchInput.value = ''; 
    currentPageEstoqueTabela = 1;

    // NOVO: Adiciona a lógica de feedback visual
    const headerFiltro = document.getElementById('filtroAtivoHeader');
    const tituloFiltro = document.getElementById('filtroAtivoTitulo');
    document.querySelectorAll('.es-alerta-card').forEach(c => c.classList.remove('filtro-ativo'));

    if (tipoAlerta === 'urgente') {
        headerFiltro.className = 'es-filtro-ativo-header urgente';
        tituloFiltro.textContent = 'Mostrando Itens com Reposição Urgente';
        headerFiltro.style.display = 'block';
        document.getElementById('cardReposicaoUrgente')?.classList.add('filtro-ativo');
    } else if (tipoAlerta === 'baixo') {
        headerFiltro.className = 'es-filtro-ativo-header baixo';
        tituloFiltro.textContent = 'Mostrando Itens com Estoque Baixo';
        headerFiltro.style.display = 'block';
        document.getElementById('cardEstoqueBaixo')?.classList.add('filtro-ativo');
    }

    await carregarTabelaEstoque('', 1);
    
    const tabelaEl = document.getElementById('estoqueTable');
    if(tabelaEl) tabelaEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function mostrarViewFilaProducao() {
    if (!permissoesGlobaisEstoque.includes('acesso-estoque')) {
        mostrarPopupEstoque('Você não tem permissão para acessar esta área.', 'aviso');
        return;
    }

    const overlay = document.getElementById('filaLoadingOverlay');
    // Mostra o overlay e esconde as views antigas
    if (overlay) overlay.classList.remove('hidden');
    document.getElementById('mainViewEstoque').style.display = 'none';
    const filaView = document.getElementById('filaProducaoView');
    filaView.classList.remove('hidden');
    filaView.style.display = 'block';

    try {
        const btnSalvar = document.getElementById('btnSalvarPrioridades');
        btnSalvar.classList.toggle('hidden', !permissoesGlobaisEstoque.includes('gerenciar-fila-de-producao'));

        // Busca as promessas ativas do backend
        promessasDeProducaoCache = await fetchEstoqueAPI('/producao-promessas');
        
        // Renderiza as duas abas
        renderizarFilaDeProducao();
        renderizarPromessasEmProducao();

        // Configura troca de abas
        mudarAbaFila('prioridades');

    } catch(error) {
        console.error("Erro ao carregar fila de produção:", error);
        mostrarPopupEstoque("Erro ao carregar a fila de produção.", "erro");
    } finally {
        // Esconde o overlay DEPOIS que tudo carregou
        if (overlay) overlay.classList.add('hidden');
    }
}

function moverItemFila(produtoRefId, direcao) {
    const container = document.getElementById('filaProducaoContainer');
    const cards = Array.from(container.querySelectorAll('.es-fila-card'));
    const indexAtual = cards.findIndex(card => card.dataset.produtoRefId === produtoRefId);

    if (indexAtual === -1) return;

    let indexNovo = indexAtual + direcao;

    // Garante que o novo índice não saia dos limites do array
    if (indexNovo < 0 || indexNovo >= cards.length) return;

    const cardAtual = cards[indexAtual];
    const cardAlvo = cards[indexNovo];

    // Troca a posição dos elementos no DOM
    if (direcao === -1) { // Mover para cima
        container.insertBefore(cardAtual, cardAlvo);
    } else { // Mover para baixo
        container.insertBefore(cardAlvo, cardAtual);
    }
    
    // Marca que a ordem foi alterada para habilitar o botão de salvar
    const btnSalvar = document.getElementById('btnSalvarPrioridades');
    if(btnSalvar) {
        btnSalvar.style.backgroundColor = 'var(--es-cor-verde-sucesso)';
        btnSalvar.disabled = false;
    }

    atualizarInterfaceFila();
}

function atualizarInterfaceFila() {
    const container = document.getElementById('filaProducaoContainer');
    const cards = container.querySelectorAll('.es-fila-card');
    
    cards.forEach((card, index) => {
        // Atualiza o número da posição
        card.querySelector('.fila-card-posicao').textContent = `#${index + 1}`;

        // Habilita/desabilita os botões de seta
        const btnCima = card.querySelector('.reordenar-btn.up');
        const btnBaixo = card.querySelector('.reordenar-btn.down');

        if (btnCima) btnCima.disabled = (index === 0);
        if (btnBaixo) btnBaixo.disabled = (index === cards.length - 1);
    });
}


function voltarDaFilaParaEstoque() {
    document.getElementById('filaProducaoView').style.display = 'none';
    document.getElementById('mainViewEstoque').style.display = 'block';
}

function renderizarFilaDeProducao() {
    const container = document.getElementById('filaProducaoContainer');
    container.innerHTML = `<div class="es-spinner"></div>`;

    const idsEmProducao = new Set(promessasDeProducaoCache.map(p => p.produto_ref_id));
    const itensNaFila = niveisEstoqueAlertaCache
        .filter(config => {
            if (!config.ativo || idsEmProducao.has(config.produto_ref_id)) return false;
            const itemSaldo = saldosEstoqueGlobaisCompletos.find(s => s.produto_ref_id === config.produto_ref_id);
            if (!itemSaldo) return false;
            const saldoNum = parseFloat(itemSaldo.saldo_atual);
            return (config.nivel_reposicao_urgente !== null && saldoNum <= config.nivel_reposicao_urgente) ||
                   (config.nivel_estoque_baixo !== null && saldoNum <= config.nivel_estoque_baixo);
        })
        .sort((a, b) => (a.prioridade || 99) - (b.prioridade || 99));

    container.innerHTML = '';
    if (itensNaFila.length === 0) {
        container.innerHTML = '<p style="text-align: center;">Nenhum item na fila de prioridades.</p>';
        return;
    }

    itensNaFila.forEach((config, index) => {
        const itemSaldo = saldosEstoqueGlobaisCompletos.find(s => s.produto_ref_id === config.produto_ref_id);
        const produtoDef = todosOsProdutosCadastrados.find(p => p.nome === itemSaldo.produto_nome);
        
        let imagemSrc = '/img/placeholder-image.png';
        if (produtoDef) {
            const gradeItem = produtoDef.grade?.find(g => g.variacao === itemSaldo.variante_nome);
            imagemSrc = gradeItem?.imagem || produtoDef.imagem || '/img/placeholder-image.png';
        }

        const saldoNum = parseFloat(itemSaldo.saldo_atual);
        const status = (config.nivel_reposicao_urgente !== null && saldoNum <= config.nivel_reposicao_urgente) ? 'urgente' : 'baixo';
        
        const card = document.createElement('div');
        card.className = `es-fila-card status-${status}`;
        card.dataset.produtoRefId = config.produto_ref_id;

        const podeReordenar = permissoesGlobaisEstoque.includes('gerenciar-fila-de-producao');
        
        // HTML para os botões de reordenamento
        const reordenarHTML = podeReordenar
            ? `<div class="fila-card-reordenar">
                   <button class="reordenar-btn up" onclick="moverItemFila('${config.produto_ref_id}', -1)" title="Mover para cima">
                       <i class="fas fa-arrow-up"></i>
                   </button>
                   <button class="reordenar-btn down" onclick="moverItemFila('${config.produto_ref_id}', 1)" title="Mover para baixo">
                       <i class="fas fa-arrow-down"></i>
                   </button>
               </div>`
            : '';

        const acaoProducaoHTML = podeArrastar
            ? `<div class="fila-card-acao-producao">
                   <button class="es-btn-icon-estorno" onclick="iniciarProducao('${config.produto_ref_id}')" title="Iniciar Produção deste Item">
                       <i class="fas fa-play-circle"></i>
                   </button>
               </div>`
            : '';

        card.innerHTML = `
            ${reordenarHTML}
            <div class="fila-card-posicao">#${index + 1}</div>
            <div class="fila-card-info-wrapper">
                <img src="${imagemSrc}" class="fila-card-img" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">
                <div class="fila-card-info">
                    <h3>${itemSaldo.produto_nome}</h3>
                    <p>${itemSaldo.variante_nome || 'Padrão'}</p>
                </div>
            </div>
            <div class="fila-card-footer">
                <div class="fila-card-dados-producao">
                    <span>Estoque: <strong>${saldoNum}</strong> / Ideal: <strong>${config.nivel_estoque_ideal || '-'}</strong></span>
                </div>
                <div class="fila-card-status-acao-wrapper">
                    <div class="fila-card-status-badge status-${status}">${status.toUpperCase()}</div>
                    ${acaoProducaoHTML}
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    // Chama a função para ajustar os botões (desabilitar primeira seta para cima, etc.)
    atualizarInterfaceFila();
}

function mudarAbaFila(abaAtiva) {
    document.querySelectorAll('.es-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === abaAtiva);
    });
    document.querySelectorAll('.es-tab-panel').forEach(panel => {
        panel.style.display = (panel.id === `tab-${abaAtiva}`) ? 'block' : 'none';
    });
}

function renderizarPromessasEmProducao() {
    const container = document.getElementById('emProducaoContainer');
    const contadorBadge = document.getElementById('contadorEmProducao');
    container.innerHTML = '';
    
    const promessasAtivas = promessasDeProducaoCache.filter(p => new Date(p.data_expiracao) > new Date());
    
    contadorBadge.textContent = promessasAtivas.length;
    contadorBadge.style.display = promessasAtivas.length > 0 ? 'inline-block' : 'none';

    if (promessasAtivas.length === 0) {
        container.innerHTML = '<p style="text-align: center;">Nenhum item em produção no momento.</p>';
        return;
    }

    promessasAtivas.sort((a,b) => new Date(a.data_expiracao) - new Date(b.data_expiracao));

    promessasAtivas.forEach(promessa => {
        const itemSaldo = saldosEstoqueGlobaisCompletos.find(s => s.produto_ref_id === promessa.produto_ref_id);
        if (!itemSaldo) return; 

        const produtoDef = todosOsProdutosCadastrados.find(p => p.nome === itemSaldo.produto_nome);
        let imagemSrc = '/img/placeholder-image.png';
        if (produtoDef) {
            const gradeItem = produtoDef.grade?.find(g => g.variacao === itemSaldo.variante_nome);
            imagemSrc = gradeItem?.imagem || produtoDef.imagem || '/img/placeholder-image.png';
        }

        const card = document.createElement('div');
        card.className = `es-fila-card status-ok`; 
        card.dataset.promessaId = promessa.id;

        // --- MUDANÇA NA LÓGICA DO BOTÃO ---
        // O botão agora é sempre renderizado.
        // A lógica de permissão será tratada no clique.
        const anularPromessaHTML = `
            <div class="fila-card-acao-producao">
               <button class="es-btn-icon-danger" 
                       onclick="anularPromessa(${promessa.id}, '${itemSaldo.produto_nome.replace(/'/g, "\\'")}')" 
                       title="Anular esta Promessa de Produção">
                   <i class="fas fa-times-circle"></i>
               </button>
           </div>`;

        card.innerHTML = `
            <div class="fila-card-info-wrapper">
                <img src="${imagemSrc}" class="fila-card-img" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">
                <div class="fila-card-info">
                    <h3>${itemSaldo.produto_nome}</h3>
                    <p>${itemSaldo.variante_nome || 'Padrão'}</p>
                </div>
            </div>
            <div class="fila-card-footer">
                <div class="fila-card-dados-producao">
                    <span>Iniciado por: <strong>${promessa.usuario_nome || 'N/A'}</strong></span>
                    <span class="timer" id="timer-${promessa.id}">Calculando...</span>
                </div>
            </div>
            ${anularPromessaHTML}
        `;
        container.appendChild(card);
        iniciarTimerContagemRegressiva(promessa);
    });
}

async function anularPromessa(promessaId, nomeProduto) {
    // --- VERIFICAÇÃO DE PERMISSÃO NO INÍCIO ---
    if (!permissoesGlobaisEstoque.includes('anular-promessa-producao')) {
        mostrarPopupEstoque('Você não tem permissão para anular promessas de produção.', 'aviso');
        return;
    }

    const confirmado = await mostrarPopupConfirmacao(
        `Tem certeza que deseja anular a promessa de produção para <br><b>${nomeProduto}</b>?<br><br>O item voltará para a fila de prioridades.`,
        'perigo'
    );

    if (!confirmado) return;

    try {
        await fetchEstoqueAPI(`/producao-promessas/${promessaId}`, {
            method: 'DELETE',
        });

        promessasDeProducaoCache = promessasDeProducaoCache.filter(p => p.id !== promessaId);

        renderizarFilaDeProducao();
        renderizarPromessasEmProducao();

        mostrarPopupEstoque('Promessa anulada. O item voltou para a fila de prioridades.', 'sucesso');
    } catch (error) {
        mostrarPopupEstoque(`Erro ao anular promessa: ${error.data?.details || error.message}`, 'erro');
    }
}

async function iniciarProducao(produtoRefId) {
    const item = saldosEstoqueGlobaisCompletos.find(s => s.produto_ref_id === produtoRefId);
    const confirmado = await mostrarPopupConfirmacao(`Confirma o início da produção para <br><b>${item.produto_nome} - ${item.variante_nome || 'Padrão'}</b>?`, 'aviso');

    if (!confirmado) return;

    try {
        const novaPromessa = await fetchEstoqueAPI('/producao-promessas', {
            method: 'POST',
            body: JSON.stringify({ produto_ref_id: produtoRefId })
        });
        promessasDeProducaoCache.push(novaPromessa);
        
        // Re-renderiza as duas abas para atualizar as listas
        renderizarFilaDeProducao();
        renderizarPromessasEmProducao();
        
        mostrarPopupEstoque('Item enviado para a fila de produção ativa!', 'sucesso');
    } catch (error) {
        mostrarPopupEstoque(`Erro ao iniciar produção: ${error.message}`, 'erro');
    }
}

function iniciarTimerContagemRegressiva(promessa) {
    const timerEl = document.getElementById(`timer-${promessa.id}`);
    if (!timerEl) return;

    const intervalId = setInterval(() => {
        const agora = new Date();
        const expiracao = new Date(promessa.data_expiracao);
        const diff = expiracao - agora;

        if (diff <= 0) {
            timerEl.textContent = "Expirado! Repriorizar.";
            timerEl.style.color = "red";
            clearInterval(intervalId);
            return;
        }
        const horas = Math.floor((diff / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
        const minutos = Math.floor((diff / 1000 / 60) % 60).toString().padStart(2, '0');
        const segundos = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
        timerEl.textContent = `Expira em: ${horas}:${minutos}:${segundos}`;
    }, 1000);
}



async function salvarPrioridades() {
    const btn = document.getElementById('btnSalvarPrioridades');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    
    const cards = document.querySelectorAll('#filaProducaoContainer .es-fila-card');
    const prioridadesPayload = Array.from(cards).map((card, index) => ({
        produto_ref_id: card.dataset.produtoRefId,
        prioridade: index + 1
    }));

    try {
        await fetchEstoqueAPI('/niveis-estoque/prioridade', {
            method: 'POST',
            body: JSON.stringify({ prioridades: prioridadesPayload })
        });

        // Atualiza o cache local
        prioridadesPayload.forEach(p => {
            const configCache = niveisEstoqueAlertaCache.find(c => c.produto_ref_id === p.produto_ref_id);
            if(configCache) configCache.prioridade = p.prioridade;
        });

        mostrarPopupEstoque('Ordem da fila salva com sucesso!', 'sucesso');
        btn.style.backgroundColor = 'var(--es-cor-azul-primario)';
    } catch(error) {
        mostrarPopupEstoque('Erro ao salvar prioridades.', 'erro');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Ordem da Fila';
    }
}

// --- LÓGICA DA NOVA VIEW DE MOVIMENTAÇÃO DE ESTOQUE ---

// NOVO: Função para abrir a nova view unificada
function abrirViewMovimento(item) {
    console.log('[abrirViewMovimento] Abrindo para o item:', item);
    if (!permissoesGlobaisEstoque.includes('gerenciar-estoque')) {
        mostrarPopupEstoque('Você não tem permissão para gerenciar o estoque.', 'aviso');
        return;
    }
    itemEstoqueSelecionado = { ...item }; // Armazena o item na variável de estado unificada
    window.location.hash = '#editar-estoque-movimento'; // Dispara o handleHashChangeEstoque
}

// NOVO: Função para preparar e popular a nova view unificada
function prepararViewMovimento() {
    if (!itemEstoqueSelecionado) return;
    const item = itemEstoqueSelecionado;

    // --- PREENCHE O CABEÇALHO (lado esquerdo) ---
    document.getElementById('movimentoItemNome').textContent = `${item.produto_nome} ${item.variante_nome && item.variante_nome !== '-' ? `(${item.variante_nome})` : ''}`;
    document.getElementById('movimentoSaldoAtual').textContent = item.saldo_atual;
    const produtoDef = todosOsProdutosCadastrados.find(p => p.nome === item.produto_nome);
    let skuParaExibir = item.produto_ref_id || 'N/A';
    let imagemSrc = '/img/placeholder-image.png';
    if (produtoDef) {
        if (skuParaExibir === 'N/A') {
            if (item.variante_nome && item.variante_nome !== '-' && item.variante_nome !== 'Padrão') {
                const gradeItem = produtoDef.grade?.find(g => g.variacao === item.variante_nome);
                skuParaExibir = gradeItem?.sku || produtoDef.sku || 'SKU Indisp.';
            } else {
                skuParaExibir = produtoDef.sku || 'SKU Indisp.';
            }
        }
        if (item.variante_nome && item.variante_nome !== '-' && item.variante_nome !== 'Padrão') {
            const gradeItem = produtoDef.grade?.find(g => g.variacao === item.variante_nome);
            if (gradeItem?.imagem) imagemSrc = gradeItem.imagem;
            else if (produtoDef.imagem) imagemSrc = produtoDef.imagem;
        } else if (produtoDef.imagem) {
            imagemSrc = produtoDef.imagem;
        }
    }
    document.getElementById('movimentoItemSKU').textContent = `SKU: ${skuParaExibir}`;
    document.getElementById('movimentoThumbnail').innerHTML = `<img src="${imagemSrc}" alt="${item.produto_nome}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">`;

     // --- PREENCHE O FORMULÁRIO DE AÇÃO (lado direito) ---
    const qtdInput = document.getElementById('quantidadeMovimentar');
    const qtdLabel = document.getElementById('labelQuantidadeMovimentar');
    const inputTipoOperacaoOculto = document.getElementById('tipoMovimentoSelecionado');
    const containerBotoesTipoOp = document.querySelector('.movimento-tipo-operacao-container');
    
    const atualizarCamposPorTipoOperacao = (tipoSelecionado) => {
        if (!inputTipoOperacaoOculto) return;
        inputTipoOperacaoOculto.value = tipoSelecionado;
        containerBotoesTipoOp.querySelectorAll('.movimento-op-btn').forEach(btn => {
            btn.classList.toggle('ativo', btn.dataset.tipo === tipoSelecionado);
        });
        if (tipoSelecionado === 'BALANCO') {
            qtdLabel.textContent = 'Ajustar Saldo Para:';
            qtdInput.value = item.saldo_atual;
        } else {
            qtdLabel.textContent = 'Quantidade a Movimentar:';
            qtdInput.value = '';
        }
    };
    containerBotoesTipoOp.querySelectorAll('.movimento-op-btn').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => atualizarCamposPorTipoOperacao(newBtn.dataset.tipo));
    });
    atualizarCamposPorTipoOperacao('ENTRADA_MANUAL');
    document.getElementById('observacaoMovimento').value = '';
    const btnArquivar = document.getElementById('arquivarItemBtn');
    if (btnArquivar) {
        btnArquivar.style.display = permissoesGlobaisEstoque.includes('arquivar-produto-do-estoque') ? 'inline' : 'none';
    }

    // --- CARREGA O HISTÓRICO DIRETAMENTE NA PÁGINA ---
    const historicoBody = document.getElementById('historicoMovimentacoesBody');
    if (historicoBody) historicoBody.innerHTML = '<tr><td colspan="6"><div class="es-spinner"></div></td></tr>';
    carregarHistoricoMovimentacoes(item.produto_nome, item.variante_nome, 1);
}



async function estornarMovimento(movimentoId) {
    const confirmado = await mostrarPopupConfirmacao(
        'Tem certeza que deseja estornar este movimento?<br><br>Esta ação devolverá a quantidade ao estoque.',
        'aviso'
    );

    if (!confirmado) return;

    try {
        const response = await fetchEstoqueAPI('/estoque/estornar-movimento', {
            method: 'POST',
            body: JSON.stringify({ id_movimento_original: movimentoId })
        });

        const movimentoDeEstorno = response.movimentoDeEstorno;
        if (!movimentoDeEstorno) {
            throw new Error("A API não retornou os dados do estorno.");
        }

        mostrarPopupEstoque('Estorno realizado com sucesso!', 'sucesso');

        // --- CORREÇÃO DA LÓGICA DE ATUALIZAÇÃO E PERSISTÊNCIA ---

        // 1. Atualiza o saldo do item específico DENTRO do nosso cache global
        const itemNoCache = saldosEstoqueGlobaisCompletos.find(
            item => item.produto_ref_id === movimentoDeEstorno.produto_ref_id
        );
        
        if (itemNoCache) {
            const saldoAtualCache = parseFloat(itemNoCache.saldo_atual);
            const quantidadeEstornada = parseFloat(movimentoDeEstorno.quantidade);
            itemNoCache.saldo_atual = saldoAtualCache + quantidadeEstornada;
            console.log(`Cache atualizado para ${itemNoCache.produto_ref_id}. Novo saldo em cache: ${itemNoCache.saldo_atual}`);
        } else {
            // Se o item não estava no cache por algum motivo (raro, mas possível),
            // a melhor opção é limpar o cache inteiro para forçar uma recarga completa.
            saldosEstoqueGlobaisCompletos = [];
        }

        // 2. Atualiza a UI da tela de detalhes para feedback imediato
        if (itemEstoqueSelecionado) {
            const saldoAtualEl = document.getElementById('movimentoSaldoAtual');
            if (saldoAtualEl) {
                const saldoAtualNumerico = parseInt(saldoAtualEl.textContent);
                const quantidadeEstornada = parseInt(movimentoDeEstorno.quantidade);
                const novoSaldo = saldoAtualNumerico + quantidadeEstornada;
                saldoAtualEl.textContent = novoSaldo;
                itemEstoqueSelecionado.saldo_atual = novoSaldo;
            }
        }
        
        // 3. Recarrega a tabela de histórico para remover o botão de estorno
        if (itemEstoqueSelecionado) {
            carregarHistoricoMovimentacoes(itemEstoqueSelecionado.produto_nome, itemEstoqueSelecionado.variante_nome, currentPageHistorico);
        }

    } catch (error) {
        console.error('Erro ao estornar movimento:', error);
        mostrarPopupEstoque(`Falha no estorno: ${error.data?.details || error.message}`, 'erro');
    }
}

// Função para arquivar um item de estoque (ATUALIZADA)
async function arquivarItemEstoque() {
    if (!itemEstoqueSelecionado || !itemEstoqueSelecionado.produto_ref_id) {
        mostrarPopupEstoque('Nenhum item selecionado ou item sem SKU para arquivar.', 'erro');
        return;
    }

    const mensagemConfirmacao = `Tem certeza que deseja arquivar o item <br><b>"${itemEstoqueSelecionado.produto_nome} - ${itemEstoqueSelecionado.variante_nome}"</b>?<br><br>Esta ação irá removê-lo da lista de estoque.`;

    // Usa o novo popup de confirmação
    const confirmado = await mostrarPopupConfirmacao(mensagemConfirmacao, 'perigo');

    if (!confirmado) {
        return; // Usuário clicou em "Cancelar"
    }

    const btnArquivar = document.getElementById('arquivarItemBtn');
    btnArquivar.disabled = true;
    btnArquivar.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // Spinner sem texto

    try {
        await fetchEstoqueAPI('/estoque/arquivar-item', {
            method: 'POST',
            body: JSON.stringify({ produto_ref_id: itemEstoqueSelecionado.produto_ref_id })
        });
        
        mostrarPopupEstoque('Item arquivado com sucesso!', 'sucesso');

        // Força a recarga da lista principal ao voltar
        saldosEstoqueGlobaisCompletos = []; 
        window.location.hash = '#';

    } catch (error) {
        console.error('[arquivarItemEstoque] Erro ao arquivar:', error);
        mostrarPopupEstoque(error.data?.details || error.message || 'Erro ao arquivar o item.', 'erro');
    } finally {
        btnArquivar.disabled = false;
        btnArquivar.innerHTML = '<i class="fas fa-archive"></i>';
    }
}

async function salvarMovimentoManualEstoque() {
    // AJUSTADO para usar itemEstoqueSelecionado e novos IDs
    if (!itemEstoqueSelecionado) {
        mostrarPopupEstoque('Nenhum item selecionado para edição.', 'erro');
        return;
    }

    const tipoOperacao = document.getElementById('tipoMovimentoSelecionado').value;
    const quantidadeStr = document.getElementById('quantidadeMovimentar').value;
    const observacao = document.getElementById('observacaoMovimento').value;

    if (tipoOperacao === '') {
        mostrarPopupEstoque('Selecione um tipo de operação (+, - ou =).', 'aviso');
        return;
    }
    if (quantidadeStr.trim() === '') {
        mostrarPopupEstoque('O campo de quantidade é obrigatório.', 'aviso');
        return;
    }
    const quantidade = parseInt(quantidadeStr);

    if (isNaN(quantidade)) {
        mostrarPopupEstoque('Quantidade deve ser um número.', 'aviso');
        return;
    }
    if ((tipoOperacao === 'ENTRADA_MANUAL' || tipoOperacao === 'SAIDA_MANUAL') && quantidade <= 0) {
        mostrarPopupEstoque('Quantidade para entrada/saída manual deve ser maior que zero.', 'aviso');
        return;
    }
    if (tipoOperacao === 'BALANCO' && quantidade < 0) {
        mostrarPopupEstoque('Quantidade para balanço não pode ser negativa.', 'aviso');
        return;
    }

    const payload = {
        produto_nome: itemEstoqueSelecionado.produto_nome,
        variante_nome: (itemEstoqueSelecionado.variante_nome === '-' || !itemEstoqueSelecionado.variante_nome) ? null : itemEstoqueSelecionado.variante_nome,
        quantidade_movimentada: quantidade,
        tipo_operacao: tipoOperacao,
        observacao: observacao
    };

    const salvarBtn = document.getElementById('salvarMovimentoBtn');
    const originalSalvarBtnText = salvarBtn.innerHTML;
    salvarBtn.disabled = true;
    salvarBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const resultado = await fetchEstoqueAPI('/estoque/movimento-manual', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        mostrarPopupEstoque(resultado.message || 'Movimento de estoque salvo com sucesso!', 'sucesso');
        
        // Invalida caches para forçar recarga dos dados
        saldosEstoqueGlobaisCompletos = [];
        niveisEstoqueAlertaCache = [];
        invalidateCache('produtos');

        filtroAlertaAtivo = null;
        const searchInput = document.getElementById('searchEstoque');
        if(searchInput) searchInput.value = '';
        currentPageEstoqueTabela = 1;
        
        window.location.hash = '#'; // Volta para a tela principal

    } catch (error) {
        console.error('[salvarMovimentoManualEstoque] Erro ao salvar:', error);
        mostrarPopupEstoque(error.data?.details || error.message || 'Erro desconhecido ao salvar movimento.', 'erro');
    } finally {
        salvarBtn.disabled = false;
        salvarBtn.innerHTML = originalSalvarBtnText;
    }
}

// --- LÓGICA DE ROTEAMENTO (HASHCHANGE) ---
function handleHashChangeEstoque() {
    const mainView = document.getElementById('mainViewEstoque');
    const movimentoView = document.getElementById('editarEstoqueMovimentoView');
    const separacaoView = document.getElementById('separacaoView'); 

    if (!mainView || !movimentoView || !separacaoView) {
        console.error("[handleHashChangeEstoque] Uma ou mais views não encontradas.");
        return;
    }

    // Oculta todas as views principais, incluindo a nova
    mainView.style.display = 'none'; mainView.classList.remove('hidden');
    movimentoView.style.display = 'none'; movimentoView.classList.remove('hidden');
    separacaoView.style.display = 'none'; separacaoView.classList.remove('hidden');

    const hash = window.location.hash;

    // Rota para a nova view de movimento
    if (hash === '#editar-estoque-movimento') {
        if (!itemEstoqueSelecionado) {
            console.warn("Tentativa de acessar #editar-estoque-movimento sem um item selecionado. Redirecionando.");
            window.location.hash = ''; // Volta para a lista
            return;
        }
        movimentoView.style.display = 'block';
        prepararViewMovimento(); // Prepara e preenche a view
    } 
    // Rota padrão (lista de estoque)
    else {
        mainView.style.display = 'block';
        itemEstoqueSelecionado = null; // Limpa o item selecionado ao voltar para a lista

        const searchTermAtual = document.getElementById('searchEstoque')?.value || '';
        
        // Sempre que voltamos para a lista, é uma boa prática recarregar os dados
        // para refletir quaisquer mudanças feitas.
        const tbodyEstoque = document.getElementById('estoqueTableBody');
        if (tbodyEstoque) tbodyEstoque.innerHTML = `<tr><td colspan="4" style="text-align:center;"><div class="es-spinner"></div> Atualizando lista...</td></tr>`;
        
        carregarTabelaEstoque(searchTermAtual, currentPageEstoqueTabela).catch(err => {
            console.error("Erro ao recarregar tabela de estoque via handleHashChange:", err);
            mostrarPopupEstoque("Falha ao atualizar tabela de estoque.", "erro");
        });
    }
}


// --- LÓGICA DO HISTÓRICO DE MOVIMENTAÇÕES (Agora em um Modal) ---

// NOVO: Funções para controlar o modal de histórico
function abrirModalHistorico() {
    if (!itemEstoqueSelecionado) return;
    
    const tbodyHistorico = document.getElementById('historicoMovimentacoesTableBody');
    const paginacaoHistorico = document.getElementById('paginacaoHistoricoMovimentacoes');
    
    if(tbodyHistorico) tbodyHistorico.innerHTML = `<tr><td colspan="5" style="text-align:center;"><div class="es-spinner"></div> Carregando...</td></tr>`;
    if(paginacaoHistorico) paginacaoHistorico.style.display = 'none';

    if (modalHistoricoElement) modalHistoricoElement.style.display = 'flex';
    
    carregarHistoricoMovimentacoes(itemEstoqueSelecionado.produto_nome, itemEstoqueSelecionado.variante_nome, 1);
}

function fecharModalHistorico() {
    if (modalHistoricoElement) modalHistoricoElement.style.display = 'none';
}

async function carregarHistoricoMovimentacoes(produtoNome, varianteNome, page) {
    currentPageHistorico = page;
    const tbody = document.getElementById('historicoMovimentacoesTableBody');
    const paginacaoContainer = document.getElementById('paginacaoHistoricoMovimentacoes');
    if (!tbody || !paginacaoContainer) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;"><div class="es-spinner">Carregando...</div></td></tr>`;
    paginacaoContainer.innerHTML = '';

    try {
        const varianteParaAPI = (varianteNome === '-' || !varianteNome) ? null : varianteNome;
        const params = new URLSearchParams({
            produto_nome: produtoNome,
            limit: itemsPerPageHistorico,
            page: currentPageHistorico
        });
        if (varianteParaAPI) {
            params.append('variante_nome', varianteParaAPI);
        }

        const data = await fetchEstoqueAPI(`/estoque/movimentos?${params.toString()}`);
        
        renderizarHistoricoMovimentacoes(data.rows || []);
        renderizarPaginacaoHistorico(data.pages || 0, produtoNome, varianteNome);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red;">Erro ao carregar histórico.</td></tr>`;
        mostrarPopupEstoque('Erro ao carregar histórico de movimentações.', 'erro');
    }
}

function renderizarHistoricoMovimentacoes(movimentos) {
    // CORREÇÃO: O ID do tbody foi corrigido no HTML para 'historicoMovimentacoesBody'
    const tbody = document.getElementById('historicoMovimentacoesBody');
    if (!tbody) {
        console.error("Elemento #historicoMovimentacoesBody não encontrado.");
        return;
    }
    tbody.innerHTML = '';

    if (!movimentos || movimentos.length === 0) {
        // Agora a tabela tem 6 colunas, então o colspan deve ser 6
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma movimentação encontrada.</td></tr>';
        return;
    }
    
    movimentos.forEach(mov => {
        const tr = tbody.insertRow();
        const quantidadeClasse = mov.quantidade > 0 ? 'quantidade-entrada' : 'quantidade-saida';
        
        let acoesHtml = '';
        if (mov.quantidade < 0 && mov.estornado !== true && permissoesGlobaisEstoque.includes('gerenciar-estoque')) {
            acoesHtml = `<button class="es-btn-icon-estorno" title="Estornar este movimento" onclick="estornarMovimento(${mov.id})">
                            <i class="fas fa-undo"></i>
                         </button>`;
        }

        tr.innerHTML = `
            <td>${new Date(mov.data_movimento).toLocaleString('pt-BR')}</td>
            <td>${mov.tipo_movimento.replace(/_/g, ' ')}</td>
            <td class="${quantidadeClasse}" style="text-align:right;">${mov.quantidade}</td>
            <td>${mov.usuario_responsavel || '-'}</td>
            <td>${mov.observacao || '-'}</td>
            <td style="text-align:center;">${acoesHtml}</td>
        `;
    });
}


function renderizarPaginacaoHistorico(totalPages, produtoNome, varianteNome) {
    const paginacaoContainer = document.getElementById('paginacaoHistoricoMovimentacoes');
    paginacaoContainer.innerHTML = '';
    if (totalPages <= 1) {
        paginacaoContainer.style.display = 'none';
        return;
    }
    paginacaoContainer.style.display = 'flex';

    paginacaoContainer.innerHTML = `
        <button class="pagination-btn es-btn" data-page="${Math.max(1, currentPageHistorico - 1)}" ${currentPageHistorico === 1 ? 'disabled' : ''}>Anterior</button>
        <span class="pagination-current">Pág. ${currentPageHistorico} de ${totalPages}</span>
        <button class="pagination-btn es-btn" data-page="${Math.min(totalPages, currentPageHistorico + 1)}" ${currentPageHistorico === totalPages ? 'disabled' : ''}>Próximo</button>
    `;

    paginacaoContainer.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = parseInt(btn.dataset.page);
            carregarHistoricoMovimentacoes(produtoNome, varianteNome, targetPage);
        });
    });
}

// =========================================================================
// ### INÍCIO - MÓDULO DE SEPARAÇÃO DE PEDIDOS (PICKING) ###
// =========================================================================

function mostrarViewSeparacao() {
    document.getElementById('mainViewEstoque').style.display = 'none';
    document.getElementById('editarEstoqueMovimentoView').style.display = 'none';
    document.getElementById('separacaoDetalheView').style.display = 'none'; // Esconde a nova tela de detalhe
    
    const separacaoView = document.getElementById('separacaoView');
    separacaoView.classList.remove('hidden');
    separacaoView.style.display = 'block';

    // Limpa a busca e renderiza os produtos base
    document.getElementById('searchSeparacaoProdutoBase').value = '';
    renderizarProdutosBase();
}

function renderizarProdutosBase() {
    const container = document.getElementById('separacaoProdutosBaseContainer');
    const termoBusca = document.getElementById('searchSeparacaoProdutoBase').value.toLowerCase();
    container.innerHTML = '';

    // Lógica para agrupar produtos (sem alteração)
    const produtosBase = saldosEstoqueGlobaisCompletos.reduce((acc, item) => {
        if (!acc[item.produto_nome]) {
            acc[item.produto_nome] = { produto_nome: item.produto_nome, variacoesComEstoque: 0, imagem: null };
        }
        acc[item.produto_nome].variacoesComEstoque++;
        if (!acc[item.produto_nome].imagem) {
            const produtoDef = todosOsProdutosCadastrados.find(p => p.nome === item.produto_nome);
            if (produtoDef) {
                acc[item.produto_nome].imagem = produtoDef.imagem || (produtoDef.grade && produtoDef.grade[0]?.imagem) || '/img/placeholder-image.png';
            }
        }
        return acc;
    }, {});

    let listaProdutosBase = Object.values(produtosBase);
    if (termoBusca) {
        listaProdutosBase = listaProdutosBase.filter(p => p.produto_nome.toLowerCase().includes(termoBusca));
    }
    if (listaProdutosBase.length === 0) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Nenhum produto encontrado.</p>';
        return;
    }

    listaProdutosBase.forEach(produto => {
        const card = document.createElement('div');
        card.className = 'es-produto-base-card';
        // Usando data-attributes para passar a informação
        card.dataset.nomeProduto = produto.produto_nome;
        card.innerHTML = `
            <img src="${produto.imagem || '/img/placeholder-image.png'}" alt="${produto.produto_nome}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">
            <div class="es-produto-base-card-info">
                <h3>${produto.produto_nome}</h3>
                <p>${produto.variacoesComEstoque} variações com estoque</p>
            </div>
        `;
        container.appendChild(card);
    });

    // Removendo o listener antigo do container se existir
    const novoContainer = container.cloneNode(true);
    container.parentNode.replaceChild(novoContainer, container);
    
    // Adicionando um ÚNICO listener ao container pai (Delegação de Eventos)
    novoContainer.addEventListener('click', function(event) {
        // Encontra o card mais próximo que foi clicado
        const cardClicado = event.target.closest('.es-produto-base-card');
        if (cardClicado) {
            const nomeProduto = cardClicado.dataset.nomeProduto;
            if (nomeProduto) {
                console.log(`Card clicado: ${nomeProduto}`);
                mostrarViewDetalheSeparacao(nomeProduto);
            }
        }
    });
}

function mostrarViewDetalheSeparacao(nomeProduto) {
    produtoEmDetalheSeparacao = nomeProduto;

    document.getElementById('separacaoView').style.display = 'none';
    const detalheView = document.getElementById('separacaoDetalheView');
    detalheView.classList.remove('hidden');
    detalheView.style.display = 'block';

    document.getElementById('detalheSeparacaoTitulo').textContent = `Separando: ${nomeProduto}`;
    
    // Carrega os filtros e os cards de variação para este produto
    renderizarFiltrosDeVariacao(nomeProduto);
    renderizarCardsDeVariacao(nomeProduto);
}


function voltarParaListaProdutos() {
    produtoEmDetalheSeparacao = null;
    document.getElementById('separacaoDetalheView').style.display = 'none';
    document.getElementById('separacaoView').style.display = 'block';
    // Não precisa recarregar, pois a lista de produtos base não mudou
}

function voltarParaEstoquePrincipal() {
    if (itensEmSeparacao.size > 0) {
        mostrarPopupConfirmacao('Você tem itens no carrinho de separação.<br>Deseja descartá-los e voltar?', 'aviso')
            .then(confirmado => {
                if (confirmado) {
                    itensEmSeparacao.clear();
                    atualizarCarrinhoFlutuante(); // Garante que a UI do carrinho seja atualizada
                    document.getElementById('mainViewEstoque').style.display = 'block';
                    document.getElementById('separacaoView').style.display = 'none';
                    document.getElementById('separacaoDetalheView').style.display = 'none';
                }
            });
    } else {
        document.getElementById('mainViewEstoque').style.display = 'block';
        document.getElementById('separacaoView').style.display = 'none';
        document.getElementById('separacaoDetalheView').style.display = 'none';
        document.getElementById('carrinhoSeparacao').classList.add('hidden');

    }
}


function renderizarCardsDeVariacao() {
    const container = document.getElementById('separacaoVariacoesCardsContainer');
    const nomeProduto = produtoEmDetalheSeparacao;
    if (!nomeProduto) return;
    
    container.innerHTML = '';
    
    const filtrosSelecionados = {};
    const produtoDefFiltro = todosOsProdutosCadastrados.find(p => p.nome === nomeProduto);
    if(produtoDefFiltro && produtoDefFiltro.variacoes) {
        produtoDefFiltro.variacoes.forEach(variacaoDef => {
            const selectFiltro = document.getElementById(`filtro-${variacaoDef.chave}`);
            if (selectFiltro && selectFiltro.value) {
                const index = produtoDefFiltro.variacoes.findIndex(v => v.chave === variacaoDef.chave);
                filtrosSelecionados[index] = selectFiltro.value;
            }
        });
    }

    let variacoesDoProduto = saldosEstoqueGlobaisCompletos.filter(item => item.produto_nome === nomeProduto);
    
    if (Object.keys(filtrosSelecionados).length > 0) {
        variacoesDoProduto = variacoesDoProduto.filter(item => {
            const partesVariacao = item.variante_nome.split(' | ').map(p => p.trim());
            return Object.entries(filtrosSelecionados).every(([indexFiltro, valorFiltro]) => {
                return partesVariacao[parseInt(indexFiltro)] === valorFiltro;
            });
        });
    }
    
    if (variacoesDoProduto.length === 0) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Nenhuma variação encontrada com os filtros selecionados.</p>';
        return;
    }

    variacoesDoProduto.forEach(item => {
        const produtoDef = todosOsProdutosCadastrados.find(p => p.nome === item.produto_nome);
        let imagemSrc = '/img/placeholder-image.png';
        if (produtoDef && item.variante_nome && item.variante_nome !== '-') {
            const gradeItem = produtoDef.grade?.find(g => g.variacao === item.variante_nome);
            imagemSrc = gradeItem?.imagem || produtoDef.imagem || '/img/placeholder-image.png';
        }

        const card = document.createElement('div');
        card.className = 'es-separacao-card';
        card.dataset.produtoRefId = item.produto_ref_id;

        const saldoInicial = parseInt(item.saldo_atual);
        const quantidadeNoCarrinho = itensEmSeparacao.get(item.produto_ref_id)?.quantidade_movimentada || 0;
        const saldoProjetado = saldoInicial - quantidadeNoCarrinho;

        if (quantidadeNoCarrinho > 0) {
            card.classList.add('selecionado');
        }
        
        card.innerHTML = `
            <div class="es-separacao-card-header">
                <img src="${imagemSrc}" alt="${item.variante_nome}" class="es-separacao-card-img" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">
                <div class="es-separacao-card-info">
                    <h3>${item.variante_nome || 'Padrão'}</h3>
                    <p>SKU: ${item.produto_ref_id || 'N/A'}</p>
                </div>
            </div>
            <div class="es-separacao-card-body">
                <div class="es-separacao-card-saldo">
                    Estoque: <strong class="saldo-display" style="color: ${quantidadeNoCarrinho > 0 ? '#e74c3c' : 'var(--es-cor-azul-primario)'};">${saldoProjetado}</strong>
                </div>
                <div class="es-separacao-card-controls">
                    <button class="control-btn minus-btn">-</button>
                    <input type="number" class="qty-input" value="${quantidadeNoCarrinho}" min="0" max="${saldoInicial}">
                    <button class="control-btn plus-btn">+</button>
                </div>
            </div>
        `;
        
        const qtyInput = card.querySelector('.qty-input');
        const plusBtn = card.querySelector('.plus-btn');
        const minusBtn = card.querySelector('.minus-btn');
        const saldoDisplay = card.querySelector('.saldo-display');

        const atualizarItem = (novaQtd) => {
            let qtdFinal = Math.max(0, Math.min(novaQtd, saldoInicial));
            qtyInput.value = qtdFinal;
            
            saldoDisplay.textContent = saldoInicial - qtdFinal;

            if (qtdFinal > 0) {
                itensEmSeparacao.set(item.produto_ref_id, { produto_nome: item.produto_nome, variante_nome: item.variante_nome, quantidade_movimentada: qtdFinal });
                card.classList.add('selecionado');
                saldoDisplay.style.color = '#e74c3c';
            } else {
                itensEmSeparacao.delete(item.produto_ref_id);
                card.classList.remove('selecionado');
                saldoDisplay.style.color = 'var(--es-cor-azul-primario)';
            }
            atualizarCarrinhoFlutuante();
        };

        plusBtn.addEventListener('click', () => atualizarItem(parseInt(qtyInput.value) + 1));
        minusBtn.addEventListener('click', () => atualizarItem(parseInt(qtyInput.value) - 1));
        qtyInput.addEventListener('change', () => atualizarItem(parseInt(qtyInput.value)));
        qtyInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') { e.target.blur(); } });
        container.appendChild(card);
    });
}


function renderizarFiltrosDeVariacao(nomeProduto) {
    const container = document.getElementById('filtrosVariacaoContainer');
    container.innerHTML = '';
    const produtoDef = todosOsProdutosCadastrados.find(p => p.nome === nomeProduto);
    if (!produtoDef || !produtoDef.variacoes || produtoDef.variacoes.length === 0) return;

    produtoDef.variacoes.forEach(variacao => {
        const formGrupo = document.createElement('div');
        formGrupo.className = 'es-form-grupo';
        const label = document.createElement('label');
        label.textContent = variacao.chave;
        label.htmlFor = `filtro-${variacao.chave}`;
        const select = document.createElement('select');
        select.className = 'es-select';
        select.id = `filtro-${variacao.chave}`;
        select.dataset.chave = variacao.chave;
        
        // MUDANÇA AQUI: Usa a nova função para o texto
        select.innerHTML = `<option value="">${getLabelFiltro(variacao.chave)}</option>`; 
        
        const valoresUnicos = variacao.valores.split(',').map(v => v.trim()).filter(Boolean);
        valoresUnicos.forEach(valor => {
            select.innerHTML += `<option value="${valor}">${valor}</option>`;
        });
        select.onchange = () => renderizarCardsDeVariacao();
        formGrupo.appendChild(label);
        formGrupo.appendChild(select);
        container.appendChild(formGrupo);
    });
}

function atualizarCarrinhoFlutuante() {
    const carrinhoBtn = document.getElementById('carrinhoSeparacao');
    const badge = document.getElementById('carrinhoContadorBadge');
    
    if (!carrinhoBtn || !badge) return; // Verificação de segurança

    const numeroDeItens = itensEmSeparacao.size;

    if (numeroDeItens > 0) {
        badge.textContent = numeroDeItens;
        badge.classList.remove('hidden'); // Mostra o badge
        carrinhoBtn.classList.remove('hidden'); // Mostra o botão principal
    } else {
        carrinhoBtn.classList.add('hidden'); // Esconde o botão principal
        badge.classList.add('hidden'); // Garante que o badge também seja escondido
    }
}

function abrirModalFinalizacao() {
    console.log(`[abrirModalFinalizacao] Chamada. Itens no carrinho: ${itensEmSeparacao.size}`);
    
    // Pega as referências dos elementos
    const modal = document.getElementById('modalFinalizarSeparacao');
    const corpoTabela = document.getElementById('resumoCarrinhoBody'); 
    const canalVendaContainer = document.getElementById('canalVendaContainer');
    const canalVendaInput = document.getElementById('canalVendaSelecionado');
    const inputObs = document.getElementById('observacaoSaida');
    const btnConfirmar = document.getElementById('btnConfirmarSaidaEstoque');

    // Validação robusta dos elementos
    if (!modal || !corpoTabela || !canalVendaContainer || !btnConfirmar) {
        console.error("Erro fatal: Elementos do modal de finalização não encontrados. Verifique os IDs no HTML.");
        mostrarPopupEstoque("Erro ao abrir janela de finalização (E-01).", "erro");
        return;
    }

    // --- Reset do estado do modal ---
    corpoTabela.innerHTML = ''; // Limpa a tabela
    canalVendaContainer.innerHTML = '';
    canalVendaInput.value = '';
    inputObs.value = '';
    btnConfirmar.disabled = true;

    // --- Populando a tabela de resumo ---
    if (itensEmSeparacao.size === 0) {
        console.log("[abrirModalFinalizacao] Carrinho vazio. Exibindo mensagem.");
        corpoTabela.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">O carrinho de separação está vazio.</td></tr>';
    } else {
        console.log("[abrirModalFinalizacao] Populando tabela com itens:", itensEmSeparacao);
        let tabelaHTML = '';
        itensEmSeparacao.forEach((item, refId) => {
            tabelaHTML += `
                <tr>
                    <td colspan="3">
                        <div class="resumo-carrinho-item">
                            <div class="info">
                                <div class="produto-nome">${item.produto_nome}</div>
                                <div class="variante-nome">${item.variante_nome || '-'}</div>
                            </div>
                            <div class="actions">
                                <span class="quantidade">${item.quantidade_movimentada}</span>
                                <button class="remover-item-btn" title="Remover item" data-ref-id="${refId}">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
        corpoTabela.innerHTML = tabelaHTML;
    }

    // --- Gerando os botões de canal de venda ---
    const canais = [
        { id: 'SAIDA_PEDIDO_SHOPEE', label: 'Shopee' },
        { id: 'SAIDA_PEDIDO_SHEIN', label: 'Shein' },
        { id: 'SAIDA_PEDIDO_MERCADO_LIVRE', label: 'Mercado Livre' },
        { id: 'SAIDA_PEDIDO_PONTO_FISICO', label: 'Ponto Físico', disabled: true }
    ];
    canais.forEach(canal => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'es-btn es-btn-tipo-op';
        btn.dataset.valor = canal.id;
        btn.textContent = canal.label;
        btn.disabled = canal.disabled || false;
        btn.addEventListener('click', () => { // Usando addEventListener por segurança
            canalVendaContainer.querySelectorAll('button').forEach(b => b.classList.remove('ativo'));
            btn.classList.add('ativo');
            canalVendaInput.value = canal.id;
            btnConfirmar.disabled = itensEmSeparacao.size === 0;
        });
        canalVendaContainer.appendChild(btn);
    });

    // Mostra o modal
    modal.style.display = 'flex';
}

function fecharModalFinalizacao() {
    const modal = document.getElementById('modalFinalizarSeparacao');
    modal.style.display = 'none';
}

async function confirmarSaidaEstoque() {
    const tipo_operacao = document.getElementById('canalVendaSelecionado').value;
    const observacao = document.getElementById('observacaoSaida').value;

    if (!tipo_operacao) {
        mostrarPopupEstoque('Selecione um canal de venda para a saída.', 'aviso');
        return;
    }

    const itensParaEnviar = Array.from(itensEmSeparacao.values());
    if (itensParaEnviar.length === 0) {
        mostrarPopupEstoque('O carrinho de separação está vazio.', 'aviso');
        fecharModalFinalizacao();
        return;
    }
    
    const payload = { itens: itensParaEnviar, tipo_operacao, observacao };

    const btnConfirmar = document.getElementById('btnConfirmarSaidaEstoque');
    const originalBtnHTML = btnConfirmar.innerHTML;
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';

    try {
        await fetchEstoqueAPI('/estoque/movimento-em-lote', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        mostrarPopupEstoque('Saída de estoque registrada com sucesso!', 'sucesso');
        
        // CORREÇÃO 1: Limpa o carrinho e ATUALIZA a interface do carrinho flutuante
        itensEmSeparacao.clear();
        atualizarCarrinhoFlutuante(); // <<< CHAVE: Atualiza a UI do carrinho para 0
        
        fecharModalFinalizacao();
        
        saldosEstoqueGlobaisCompletos = [];
        await carregarTabelaEstoque();
        
        // CORREÇÃO 2: Volta para a tela principal de estoque de forma limpa
        document.getElementById('mainViewEstoque').style.display = 'block';
        document.getElementById('separacaoView').style.display = 'none';
        document.getElementById('separacaoDetalheView').style.display = 'none'; // Garante que a tela de detalhe também seja escondida

    } catch (error) {
        console.error('[confirmarSaidaEstoque] Erro:', error);
        mostrarPopupEstoque(`Falha ao registrar saída: ${error.data?.details || error.message}`, 'erro');
    } finally {
        // Garante que o estado do botão seja resetado em qualquer cenário (sucesso ou falha)
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = originalBtnHTML;
        }
    }
}

// FUNÇÃO para remover itens do modal
window.removerItemDoCarrinho = function(produtoRefId) {
    if (itensEmSeparacao.has(produtoRefId)) {
        itensEmSeparacao.delete(produtoRefId);
        abrirModalFinalizacao(); // Reabre/atualiza o modal com a lista nova
        atualizarCarrinhoFlutuante(); 
        const card = document.querySelector(`.es-separacao-card[data-produto-ref-id="${produtoRefId}"]`);
        if (card) {
            card.classList.remove('selecionado');
            card.querySelector('.qty-input').value = 0;
        }
    }
};


// --- INICIALIZAÇÃO DA PÁGINA E EVENT LISTENERS ---

async function inicializarPaginaEstoque() {
    console.log('[Estoque inicializarPaginaEstoque]');
    
    const overlay = document.getElementById('paginaLoadingOverlay');
    // Mostra o overlay imediatamente
    if(overlay) overlay.classList.remove('hidden');

    // ... (resto da lógica de obter elementos de modal) ...
    modalNiveisElement = document.getElementById('modalConfigurarNiveis');

    try {
        // A busca de dados continua a mesma
        if (todosOsProdutosCadastrados.length === 0) {
            todosOsProdutosCadastrados = await obterProdutos();
        }
        await carregarTabelaEstoque(); // Esta função agora vai popular tudo

    } catch (error) {
        console.error("[inicializarPaginaEstoque] Erro:", error);
        mostrarPopupEstoque("Falha ao carregar dados do estoque.", "erro");
    } finally {
        // Esconde o overlay DEPOIS que tudo carregou
        if(overlay) overlay.classList.add('hidden');
    }
    
    setupEventListenersEstoque();
    handleHashChangeEstoque(); 
    console.log('[Estoque inicializarPaginaEstoque] Concluído.');
}


function setupEventListenersEstoque() {
    console.log('[Estoque setupEventListenersEstoque] Configurando listeners...');

    // Listener para o corpo do documento para tratar cliques em botões dinâmicos de forma segura
    document.getElementById('modalFinalizarSeparacao')?.addEventListener('click', function(event) {
        const removerBtn = event.target.closest('.remover-item-btn');
        if (removerBtn) {
            event.stopPropagation(); // Impede que o clique se propague
            const refId = removerBtn.dataset.refId;
            if (refId) {
                removerItemDoCarrinho(refId);
            }
        }
    });

    // --- Listeners de Elementos Estáticos ---
    // (O resto da função permanece o mesmo que a versão anterior que te passei)
    document.getElementById('searchEstoque')?.addEventListener('input', debounce(() => {
        filtroAlertaAtivo = null; currentPageEstoqueTabela = 1;
        carregarTabelaEstoque(document.getElementById('searchEstoque').value, 1);
    }, 350));
    document.getElementById('cardReposicaoUrgente')?.addEventListener('click', mostrarViewFilaProducao);
    document.getElementById('cardEstoqueBaixo')?.addEventListener('click', mostrarViewFilaProducao);
    document.getElementById('btnMostrarTodosEstoque')?.addEventListener('click', () => {
    filtroAlertaAtivo = null; document.getElementById('searchEstoque').value = ''; currentPageEstoqueTabela = 1;
    document.getElementById('filtroAtivoHeader').style.display = 'none';
    document.querySelectorAll('.es-alerta-card').forEach(c => c.classList.remove('filtro-ativo'));
    carregarTabelaEstoque('', 1);
    });

    document.querySelectorAll('.es-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => mudarAbaFila(btn.dataset.tab));
    });

    // Listeners para os botões da nova view
    document.getElementById('btnVoltarDaFila')?.addEventListener('click', voltarDaFilaParaEstoque);
    document.getElementById('btnSalvarPrioridades')?.addEventListener('click', salvarPrioridades);

    document.getElementById('btnGerenciarFila')?.addEventListener('click', mostrarViewFilaProducao);
    document.getElementById('btnConfigurarNiveisEstoque')?.addEventListener('click', abrirModalConfigurarNiveis);
    document.getElementById('fecharModalNiveis')?.addEventListener('click', fecharModalNiveis);
    document.getElementById('btnCancelarModalNiveis')?.addEventListener('click', fecharModalNiveis);
    document.getElementById('btnSalvarNiveisEmLote')?.addEventListener('click', salvarNiveisEmLote);
    document.getElementById('buscaProdutoNiveisModal')?.addEventListener('input', debounce(() => {
        const termo = document.getElementById('buscaProdutoNiveisModal').value.toLowerCase();
        const itensFiltrados = todosProdutosParaConfigNiveis.filter(item => item.nome_completo.toLowerCase().includes(termo));
        renderizarTabelaConfigNiveis(itensFiltrados);
    }, 300));
    document.getElementById('voltarParaListaBtn')?.addEventListener('click', () => { window.location.hash = ''; });
    document.getElementById('salvarMovimentoBtn')?.addEventListener('click', salvarMovimentoManualEstoque);
    document.getElementById('btnAbrirHistorico')?.addEventListener('click', abrirModalHistorico);
    document.getElementById('fecharModalHistorico')?.addEventListener('click', fecharModalHistorico);
    document.getElementById('arquivarItemBtn')?.addEventListener('click', arquivarItemEstoque);
    document.getElementById('btnIniciarSeparacao')?.addEventListener('click', mostrarViewSeparacao);
    document.getElementById('btnVoltarDaSeparacao')?.addEventListener('click', voltarParaEstoquePrincipal);
    document.getElementById('searchSeparacaoProdutoBase')?.addEventListener('input', debounce(renderizarProdutosBase, 350));
    document.getElementById('btnVoltarParaListaProdutos')?.addEventListener('click', voltarParaListaProdutos);
    document.getElementById('carrinhoSeparacao')?.addEventListener('click', abrirModalFinalizacao);    document.getElementById('fecharModalFinalizar')?.addEventListener('click', fecharModalFinalizacao);
    document.getElementById('btnCancelarFinalizacao')?.addEventListener('click', fecharModalFinalizacao);
    document.getElementById('btnConfirmarSaidaEstoque')?.addEventListener('click', confirmarSaidaEstoque);
    window.addEventListener('hashchange', handleHashChangeEstoque);
    console.log('[Estoque setupEventListenersEstoque] Todos os listeners foram configurados corretamente.');
            // --- LÓGICA DO BOTÃO VOLTAR AO TOPO ---
        const btnVoltarAoTopo = document.getElementById('btnVoltarAoTopo');
        if (btnVoltarAoTopo) {
            // Ação de clique: rolar para o topo suavemente
            btnVoltarAoTopo.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

            // Mostra/esconde o botão baseado na posição da rolagem
            window.addEventListener('scroll', () => {
                if (window.scrollY > 300) { // Mostra o botão se o usuário rolou mais de 300px
                    btnVoltarAoTopo.classList.remove('hidden');
                } else {
                    btnVoltarAoTopo.classList.add('hidden');
                }
            });
        }


}

// --- INICIALIZAÇÃO DA PÁGINA (Ponto de entrada) ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/estoque.html', ['acesso-estoque']);
        if (!auth) return; 
        permissoesGlobaisEstoque = auth.permissoes || [];
        usuarioLogadoEstoque = auth.usuario;
        document.body.classList.add('autenticado');
        await inicializarPaginaEstoque();
    } catch (error) {
        console.error('[Estoque DOMContentLoaded] Erro:', error);
        mostrarPopupEstoque('Erro crítico ao carregar a página de estoque.', 'erro');
    }
});

const funcoesGlobaisEstoque = {
    // Funções da Fila de Produção
    iniciarProducao,

    // Funções do Histórico de Movimentação
    estornarMovimento,

    //anular uma promessa
    anularPromessa,

    moverItemFila

};

// Anexa todas as funções acima ao objeto window
Object.assign(window, funcoesGlobaisEstoque);