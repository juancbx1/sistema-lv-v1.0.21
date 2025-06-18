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
const itemsPerPageEstoqueTabela = 7;
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
const itemsPerPageHistorico = 7; 


// --- VARIÁVEIS PARA O MÓDULO DE SEPARAÇÃO ---
let itensEmSeparacao = new Map(); // Usaremos um Map para gerenciar os itens no "carrinho"
let produtoEmDetalheSeparacao = null;


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
    if (searchTerm && filtroAlertaAtivo) {
        filtroAlertaAtivo = null;
        document.getElementById('filtroAtivoHeader').style.display = 'none';
        document.querySelectorAll('.es-alerta-card').forEach(c => c.classList.remove('filtro-ativo'));
    }
    
    currentPageEstoqueTabela = parseInt(page) || 1;
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;"><div class="es-spinner"></div> Carregando...</td></tr>`;
    
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

        // Calcula contadores de alerta
        let countUrgente = 0, countBaixo = 0;
        dadosDeSaldo.forEach(item => {
            const configNivel = niveisAlertaValidos.find(n => n.produto_ref_id === item.produto_ref_id && n.ativo);
            if (configNivel) {
                const saldoNum = parseFloat(item.saldo_atual);
                if (configNivel.nivel_reposicao_urgente !== null && saldoNum <= configNivel.nivel_reposicao_urgente) countUrgente++;
                else if (configNivel.nivel_estoque_baixo !== null && saldoNum <= configNivel.nivel_estoque_baixo) countBaixo++;
            }
        });
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
                (item.variante_nome && item.variante_nome !== '-' && item.variante_nome.toLowerCase().includes(termo))
            );
        }
        
        const totalItems = itensFiltrados.length;
        const totalPages = Math.ceil(totalItems / itemsPerPageEstoqueTabela) || 1;
        currentPageEstoqueTabela = Math.min(currentPageEstoqueTabela, totalPages);
        const itensPaginados = itensFiltrados.slice((currentPageEstoqueTabela - 1) * itemsPerPageEstoqueTabela, currentPageEstoqueTabela * itemsPerPageEstoqueTabela);
           
        renderizarTabelaEstoque(itensPaginados, todosProdutosDef, niveisAlertaValidos);
        renderizarPaginacaoEstoque(totalPages, searchTerm);

        const btnMostrarTodosEl = document.getElementById('btnMostrarTodosEstoque');
        if (btnMostrarTodosEl) {
            btnMostrarTodosEl.style.display = (filtroAlertaAtivo || searchTerm) ? 'inline-flex' : 'none';
        }
    } catch (error) { 
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Erro ao carregar estoque.</td></tr>`;
        mostrarPopupEstoque("Erro inesperado ao carregar dados do estoque.", "erro");
    }
}

function renderizarTabelaEstoque(itensDeEstoque, produtosDefinicoes, niveisDeAlerta) {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (itensDeEstoque.length === 0) {
        // Colspan agora precisa ser 7 por causa da nova coluna de status
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Nenhum item encontrado.</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    itensDeEstoque.forEach(item => {
        const produtoDef = produtosDefinicoes.find(p => p.nome === item.produto_nome);
        let imagemSrc = '/img/placeholder-image.png';
        if (produtoDef) {
            if (item.variante_nome && item.variante_nome !== '-') {
                const gradeItem = produtoDef.grade?.find(g => g.variacao === item.variante_nome);
                if (gradeItem?.imagem) imagemSrc = gradeItem.imagem;
                else if (produtoDef.imagem) imagemSrc = produtoDef.imagem;
            } else if (produtoDef.imagem) {
                imagemSrc = produtoDef.imagem;
            }
        }

        const configNivel = niveisDeAlerta.find(n => n.produto_ref_id === item.produto_ref_id && n.ativo);
        let statusClass = 'status-ok';
        if (configNivel) {
            const saldoNum = parseFloat(item.saldo_atual);
            if (configNivel.nivel_reposicao_urgente !== null && saldoNum <= configNivel.nivel_reposicao_urgente) {
                statusClass = 'status-urgente';
            } else if (configNivel.nivel_estoque_baixo !== null && saldoNum <= configNivel.nivel_estoque_baixo) {
                statusClass = 'status-baixo';
            }
        }

        const tr = document.createElement('tr');
        tr.dataset.itemEstoque = JSON.stringify(item);

        // A MUDANÇA ESTÁ NA ORDEM DAS DUAS ÚLTIMAS CÉLULAS (<td>)
        tr.innerHTML = `
            <td class="status-cell"><div class="status-indicator ${statusClass}"></div></td>
            <td><div class="thumbnail">${imagemSrc !== '/img/placeholder-image.png' ? `<img src="${imagemSrc}" alt="${item.produto_nome}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">` : '<span></span>'}</div></td>
            <td>${item.produto_nome}</td>
            <td>${item.variante_nome || '-'}</td>
            
            <!-- ORDEM CORRIGIDA: Estoque Ideal primeiro -->
            <td style="text-align:center;">${configNivel?.nivel_estoque_ideal ?? '-'}</td>
            
            <!-- Saldo Atual por último, com a classe para o negrito -->
            <td class="saldo-estoque" style="text-align:center;">${item.saldo_atual}</td>
        `;

        if (permissoesGlobaisEstoque.includes('gerenciar-estoque')) {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', (event) => {
                const itemClicado = JSON.parse(event.currentTarget.dataset.itemEstoque);
                abrirViewMovimento(itemClicado);
            });
        }
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
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

    // 1. Preenche informações do cabeçalho
    const item = itemEstoqueSelecionado;
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

    // 2. Configura o formulário de movimento
    const qtdInput = document.getElementById('quantidadeMovimentar');
    const qtdLabel = document.getElementById('labelQuantidadeMovimentar');
    const inputTipoOperacaoOculto = document.getElementById('tipoMovimentoSelecionado');
    const containerBotoesTipoOp = document.querySelector('.movimento-tipo-operacao-container');
    
    // Função interna para atualizar a UI do formulário com base no tipo de operação
    const atualizarCamposPorTipoOperacao = (tipoSelecionado) => {
        if (!qtdLabel || !qtdInput || !inputTipoOperacaoOculto || !containerBotoesTipoOp) return;

        inputTipoOperacaoOculto.value = tipoSelecionado;
        containerBotoesTipoOp.querySelectorAll('.movimento-op-btn').forEach(btn => {
            btn.classList.remove('ativo');
            if (btn.dataset.tipo === tipoSelecionado) {
                btn.classList.add('ativo');
            }
        });

        if (tipoSelecionado === 'BALANCO') {
            qtdLabel.textContent = 'Ajustar saldo para (nova quantidade total):';
            qtdInput.placeholder = `Ex: ${itemEstoqueSelecionado.saldo_atual}`;
            qtdInput.value = itemEstoqueSelecionado.saldo_atual;
            qtdInput.min = "0";
        } else {
            qtdLabel.textContent = 'Quantidade a movimentar:';
            qtdInput.placeholder = 'Ex: 10';
            qtdInput.value = '';
            qtdInput.min = "1";
        }
    };

    // Reseta listeners para evitar duplicação (clonando e substituindo)
    containerBotoesTipoOp.querySelectorAll('.movimento-op-btn').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            atualizarCamposPorTipoOperacao(newBtn.dataset.tipo);
        });
    });

    // Define o estado inicial (ex: Entrada) e limpa o formulário
    atualizarCamposPorTipoOperacao('ENTRADA_MANUAL');
    document.getElementById('observacaoMovimento').value = '';
 
    // --- NOVO: Lógica de visibilidade do botão de arquivar ---
    const btnArquivar = document.getElementById('arquivarItemBtn');
    if (btnArquivar) {
        // Verifica se o array de permissões globais inclui a nova permissão
        if (permissoesGlobaisEstoque.includes('arquivar-produto-do-estoque')) {
            btnArquivar.style.display = 'inline-flex'; // Mostra o botão
        } else {
            btnArquivar.style.display = 'none'; // Garante que ele esteja escondido
        }
    }
}

async function estornarMovimento(movimentoId) {
    // Usa o nosso popup de confirmação para uma melhor experiência
    const confirmado = await mostrarPopupConfirmacao(
        'Tem certeza que deseja estornar este movimento?<br><br>Esta ação devolverá a quantidade ao estoque e não pode ser desfeita.',
        'aviso'
    );

    if (!confirmado) {
        return;
    }

    try {
        await fetchEstoqueAPI('/estoque/estornar-movimento', {
            method: 'POST',
            body: JSON.stringify({ id_movimento_original: movimentoId })
        });

        mostrarPopupEstoque('Estorno realizado com sucesso!', 'sucesso');

        // Recarrega o histórico para refletir a mudança
        // e atualiza o saldo na tela de detalhes
        if (itemEstoqueSelecionado) {
            // Atualiza o saldo localmente para feedback imediato
            const movimentoEstornado = saldosEstoqueGlobaisCompletos.find(m => m.id === movimentoId);
            if (movimentoEstornado) {
                itemEstoqueSelecionado.saldo_atual += Math.abs(movimentoEstornado.quantidade);
                document.getElementById('movimentoSaldoAtual').textContent = itemEstoqueSelecionado.saldo_atual;
            }
            
            // Força recarga do cache de saldos e recarrega histórico
            saldosEstoqueGlobaisCompletos = [];
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
    const tbody = document.getElementById('historicoMovimentacoesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!movimentos || movimentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma movimentação encontrada.</td></tr>';
        return;
    }

    // Adiciona uma nova coluna para Ações no cabeçalho
    const thead = tbody.previousElementSibling;
    if (thead && thead.rows[0].cells.length === 5) {
        thead.rows[0].insertCell().outerHTML = '<th>Ações</th>';
    }
    
    movimentos.forEach(mov => {
        const tr = tbody.insertRow();
        const quantidadeClasse = mov.quantidade > 0 ? 'quantidade-entrada' : 'quantidade-saida';
        
        let acoesHtml = '';
        // Adiciona o botão de estorno APENAS se:
        // 1. For um movimento de SAÍDA (quantidade < 0)
        // 2. AINDA NÃO foi estornado (mov.estornado !== true)
        // 3. O usuário tem permissão para gerenciar o estoque
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
    }
}


function renderizarCardsDeVariacao() {
    const container = document.getElementById('separacaoVariacoesCardsContainer');
    const nomeProduto = produtoEmDetalheSeparacao;

    // Garante que temos um produto selecionado para detalhar
    if (!nomeProduto) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Nenhum produto selecionado para detalhar.</p>';
        return;
    }
    
    container.innerHTML = ''; // Limpa o container antes de renderizar
    
    // Pega os valores dos filtros dinâmicos que o usuário selecionou
    const filtrosSelecionados = {};
    const produtoDefFiltro = todosOsProdutosCadastrados.find(p => p.nome === nomeProduto);
    if(produtoDefFiltro && produtoDefFiltro.variacoes) {
        produtoDefFiltro.variacoes.forEach(variacaoDef => {
            const selectFiltro = document.getElementById(`filtro-${variacaoDef.chave}`);
            if (selectFiltro && selectFiltro.value) {
                // Armazena o índice e o valor do filtro
                const index = produtoDefFiltro.variacoes.findIndex(v => v.chave === variacaoDef.chave);
                filtrosSelecionados[index] = selectFiltro.value;
            }
        });
    }

    // 1. Pega todas as variações com saldo em estoque que pertencem ao produto principal
    let variacoesDoProduto = saldosEstoqueGlobaisCompletos.filter(item => item.produto_nome === nomeProduto);
    
    // 2. Aplica os filtros selecionados pelo usuário
    if (Object.keys(filtrosSelecionados).length > 0) {
        variacoesDoProduto = variacoesDoProduto.filter(item => {
            const partesVariacao = item.variante_nome.split(' | ').map(p => p.trim());
            // Verifica se o item corresponde a TODOS os filtros ativos
            return Object.entries(filtrosSelecionados).every(([indexFiltro, valorFiltro]) => {
                return partesVariacao[parseInt(indexFiltro)] === valorFiltro;
            });
        });
    }
    
    if (variacoesDoProduto.length === 0) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">Nenhuma variação encontrada com os filtros selecionados.</p>';
        return;
    }

    // 3. Renderiza os cards para os itens que passaram pelos filtros
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
        
        // Adiciona a classe 'selecionado' se o item já estiver no carrinho
        if (itensEmSeparacao.has(item.produto_ref_id)) {
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
                <div class="es-separacao-card-saldo">Estoque: <strong>${item.saldo_atual}</strong></div>
                <div class="es-separacao-card-controls">
                    <button class="control-btn minus-btn">-</button>
                    <input type="number" class="qty-input" value="${itensEmSeparacao.get(item.produto_ref_id)?.quantidade_movimentada || 0}" min="0" max="${item.saldo_atual}">
                    <button class="control-btn plus-btn">+</button>
                </div>
            </div>
        `;

        const qtyInput = card.querySelector('.qty-input');
        const plusBtn = card.querySelector('.plus-btn');
        const minusBtn = card.querySelector('.minus-btn');

        const atualizarItem = (novaQtd) => {
            const saldoMax = parseInt(item.saldo_atual);
            let qtdFinal = Math.max(0, Math.min(novaQtd, saldoMax));
            qtyInput.value = qtdFinal;

            if (qtdFinal > 0) {
                itensEmSeparacao.set(item.produto_ref_id, {
                    produto_nome: item.produto_nome,
                    variante_nome: item.variante_nome,
                    quantidade_movimentada: qtdFinal
                });
                card.classList.add('selecionado');
            } else {
                itensEmSeparacao.delete(item.produto_ref_id);
                card.classList.remove('selecionado');
            }
            atualizarCarrinhoFlutuante();
        };

        plusBtn.addEventListener('click', () => atualizarItem(parseInt(qtyInput.value) + 1));
        minusBtn.addEventListener('click', () => atualizarItem(parseInt(qtyInput.value) - 1));
        qtyInput.addEventListener('change', () => atualizarItem(parseInt(qtyInput.value)));
        qtyInput.addEventListener('keyup', (e) => { 
            if (e.key === 'Enter') {
                e.target.blur(); // Tira o foco para "confirmar" o valor digitado
                atualizarItem(parseInt(qtyInput.value));
            }
        });

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
    console.log(`%c[ABRINDO MODAL] - 'Finalizar Separação' foi chamada.`, 'color: #3498db; font-weight: bold;');
    
    const modal = document.getElementById('modalFinalizarSeparacao');
    const corpoTabela = document.getElementById('resumoCarrinhoBody');
    const canalVendaContainer = document.getElementById('canalVendaContainer');
    const canalVendaInput = document.getElementById('canalVendaSelecionado');
    const inputObs = document.getElementById('observacaoSaida');
    const btnConfirmar = document.getElementById('btnConfirmarSaidaEstoque');

    corpoTabela.innerHTML = '';
    canalVendaContainer.innerHTML = '';
    canalVendaInput.value = '';
    inputObs.value = '';
    btnConfirmar.disabled = true;

    itensEmSeparacao.forEach((item, refId) => {
        const tr = corpoTabela.insertRow();
        tr.innerHTML = `
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
        `;
    });

    const canais = [
        { id: 'SAIDA_PEDIDO_SHOPEE', label: 'Shopee' },
        { id: 'SAIDA_PEDIDO_SHEIN', label: 'Shein' },
        { id: 'SAIDA_PEDIDO_MERCADO_LIVRE', label: 'Mercado Livre' },
        { id: 'SAIDA_PEDIDO_PONTO_FISICO', label: 'Ponto Físico', disabled: true }
    ];

    canais.forEach(canal => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'es-btn es-btn-tipo-op'; // A classe base
    btn.dataset.valor = canal.id; // O data-attribute que o CSS usa
    btn.textContent = canal.label;
    btn.disabled = canal.disabled || false;

    // A lógica de clique que adiciona/remove a classe 'ativo'
    btn.onclick = () => {
        canalVendaContainer.querySelectorAll('button').forEach(b => b.classList.remove('ativo'));
        btn.classList.add('ativo');
        canalVendaInput.value = canal.id;
        btnConfirmar.disabled = false;
    };
    canalVendaContainer.appendChild(btn);
});

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
    
    // Obter referências aos elementos do modal de níveis
    modalNiveisElement = document.getElementById('modalConfigurarNiveis');
    modalHistoricoElement = document.getElementById('modalHistoricoMovimentacoes');

    // VERIFICAÇÃO DE SEGURANÇA: Garante que os modais existem no HTML
    if (!modalNiveisElement || !modalHistoricoElement) {
        console.error("ERRO CRÍTICO: Um ou mais elementos de modal não foram encontrados no DOM. Verifique os IDs no HTML: #modalConfigurarNiveis, #modalHistoricoMovimentacoes");
        mostrarPopupEstoque("Erro de interface. A página não pode ser carregada corretamente.", "erro", 0);
        return; // Interrompe a inicialização
    }
    
    // O resto da inicialização permanece o mesmo
    try {
        if (todosOsProdutosCadastrados.length === 0) {
            todosOsProdutosCadastrados = await obterProdutos();
        }
    } catch (error) {
        console.error("[inicializarPaginaEstoque] Erro ao carregar definições de produtos:", error);
        mostrarPopupEstoque("Falha ao carregar dados base de produtos.", "aviso");
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
    document.getElementById('cardReposicaoUrgente')?.addEventListener('click', () => filtrarEstoquePorAlerta('urgente'));
    document.getElementById('cardEstoqueBaixo')?.addEventListener('click', () => filtrarEstoquePorAlerta('baixo'));
    document.getElementById('btnMostrarTodosEstoque')?.addEventListener('click', () => {
        filtroAlertaAtivo = null; document.getElementById('searchEstoque').value = ''; currentPageEstoqueTabela = 1;
        document.getElementById('filtroAtivoHeader').style.display = 'none';
        document.querySelectorAll('.es-alerta-card').forEach(c => c.classList.remove('filtro-ativo'));
        carregarTabelaEstoque('', 1);
    });
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

window.estornarMovimento = estornarMovimento;
