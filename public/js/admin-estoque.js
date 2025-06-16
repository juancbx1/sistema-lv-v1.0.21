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
    if (!permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque')) {
        mostrarPopupEstoque('Você não tem permissão para configurar níveis de estoque.', 'aviso');
        return;
    }
    modalNiveisTituloElement.textContent = 'Configurar Níveis de Alerta de Estoque';
    const validationMsgEl = document.getElementById('niveisLoteValidationMessage');
    if(validationMsgEl) validationMsgEl.style.display = 'none';
    
    const tbody = document.getElementById('tbodyConfigNiveis');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><div class="es-spinner">Carregando produtos...</div></td></tr>`;
    
    document.getElementById('buscaProdutoNiveisModal').value = '';
    modalNiveisElement.style.display = 'flex';

    try {
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
                    todosProdutosParaConfigNiveis.push({
                        produto_ref_id: skuVariacao,
                        nome_completo: `${p.nome} ${nomeVar !== 'Padrão' ? `(${nomeVar})` : ''}`,
                        nome_base: p.nome,
                        nome_variacao: nomeVar
                    });
                });
            } else {
                 const skuBase = p.sku || p.nome.toUpperCase().replace(/\W/g, '');
                 todosProdutosParaConfigNiveis.push({
                    produto_ref_id: skuBase,
                    nome_completo: `${p.nome} (Padrão)`,
                    nome_base: p.nome,
                    nome_variacao: 'Padrão'
                });
            }
        });
        todosProdutosParaConfigNiveis.sort((a,b) => a.nome_completo.localeCompare(b.nome_completo));
        renderizarTabelaConfigNiveis(todosProdutosParaConfigNiveis);

    } catch (error) {
        mostrarPopupEstoque("Erro ao carregar dados para configuração de níveis.", "erro");
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:red;">Erro ao carregar.</td></tr>`;
    }
}

function renderizarTabelaConfigNiveis(itensParaRenderizar) {
    const tbody = document.getElementById('tbodyConfigNiveis');
    if (!tbody) {
        console.error("Elemento tbody #tbodyConfigNiveis não encontrado.");
        return;
    }
    tbody.innerHTML = ''; 

    if (!itensParaRenderizar || itensParaRenderizar.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Nenhum produto/variação para configurar (verifique a busca).</td></tr>`;
        return;
    }

    itensParaRenderizar.forEach(item => {
        const configExistente = niveisEstoqueAlertaCache.find(n => n.produto_ref_id === item.produto_ref_id);
        const tr = tbody.insertRow();
        tr.dataset.produtoRefId = item.produto_ref_id; 
        const nivelBaixoOriginal = configExistente?.nivel_estoque_baixo ?? '';
        const nivelUrgenteOriginal = configExistente?.nivel_reposicao_urgente ?? '';
        const ativoOriginal = configExistente?.ativo !== false;

        tr.innerHTML = `
            <td data-label="Produto/Variação">${item.nome_completo}</td>
            <td data-label="Nível Estoque Baixo"><input type="number" class="es-input input-nivel-baixo" value="${nivelBaixoOriginal}" placeholder="0" min="0" data-original-value="${nivelBaixoOriginal}"></td>
            <td data-label="Nível Rep. Urgente"><input type="number" class="es-input input-nivel-urgente" value="${nivelUrgenteOriginal}" placeholder="0" min="0" data-original-value="${nivelUrgenteOriginal}"></td>
            <td data-label="Ativo" style="text-align:center;"><input type="checkbox" class="input-nivel-ativo" ${ativoOriginal ? 'checked' : ''} data-original-value="${ativoOriginal}"></td>
        `;
    });
}

async function salvarNiveisEmLote() {
    const validationMsgEl = document.getElementById('niveisLoteValidationMessage');
    if (validationMsgEl) {
        validationMsgEl.textContent = '';
        validationMsgEl.style.display = 'none';
    }

    const configsParaSalvar = [];
    const linhasTabela = document.querySelectorAll('#tbodyConfigNiveis tr');
    let algumaValidacaoFalhou = false;
    let errosDeValidacao = [];

    linhasTabela.forEach(tr => {
        tr.classList.remove('linha-erro-validacao');
        const inputBaixoEl = tr.querySelector('.input-nivel-baixo');
        const inputUrgenteEl = tr.querySelector('.input-nivel-urgente');
        const inputAtivoEl = tr.querySelector('.input-nivel-ativo');
        if (!inputBaixoEl || !inputUrgenteEl || !inputAtivoEl) return;

        const produtoRefId = tr.dataset.produtoRefId;
        const nomeCompletoProduto = tr.cells[0].textContent;
        const valBaixoStr = inputBaixoEl.value.trim();
        const valUrgenteStr = inputUrgenteEl.value.trim();
        const ativo = inputAtivoEl.checked;
        const originalBaixo = inputBaixoEl.dataset.originalValue;
        const originalUrgente = inputUrgenteEl.dataset.originalValue;
        const originalAtivo = inputAtivoEl.dataset.originalValue === 'true';
        
        const precisaSalvar = valBaixoStr !== originalBaixo || valUrgenteStr !== originalUrgente || ativo !== originalAtivo ||
                              (!originalBaixo && valBaixoStr) || (!originalUrgente && valUrgenteStr);

        if (precisaSalvar) {
            let nivelBaixo = null;
            let nivelUrgente = null;
            let linhaValida = true;

            if (valBaixoStr !== '') {
                nivelBaixo = parseInt(valBaixoStr);
                if (isNaN(nivelBaixo) || nivelBaixo < 0) {
                    errosDeValidacao.push(`"${nomeCompletoProduto}": Nível Baixo inválido.`);
                    linhaValida = false;
                }
            }

            if (valUrgenteStr !== '') {
                nivelUrgente = parseInt(valUrgenteStr);
                if (isNaN(nivelUrgente) || nivelUrgente < 0) {
                    errosDeValidacao.push(`"${nomeCompletoProduto}": Nível Urgente inválido.`);
                    linhaValida = false;
                }
            }
            
            if (nivelBaixo !== null && nivelUrgente !== null) {
                if (nivelUrgente > nivelBaixo) {
                    errosDeValidacao.push(`"${nomeCompletoProduto}": Rep. Urgente (${nivelUrgente}) não pode ser > Estoque Baixo (${nivelBaixo}).`);
                    linhaValida = false;
                }
            } 
            else if ((nivelBaixo !== null && nivelUrgente === null) || (nivelBaixo === null && nivelUrgente !== null)) {
                if (ativo && (valBaixoStr === '' || valUrgenteStr === '')) {
                    errosDeValidacao.push(`"${nomeCompletoProduto}": Se um nível é definido, o outro também deve ser (ou desative).`);
                    linhaValida = false;
                }
            }

            if (linhaValida) {
                configsParaSalvar.push({
                    produto_ref_id: produtoRefId,
                    nivel_estoque_baixo: nivelBaixo,
                    nivel_reposicao_urgente: nivelUrgente,
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
        mostrarPopupEstoque('Existem erros na configuração dos níveis. Verifique os campos destacados.', 'erro');
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
        mostrarPopupEstoque(`${configsParaSalvar.length} configuração(ões) de nível salvas/atualizadas com sucesso!`, 'sucesso');
        
        configsParaSalvar.forEach(savedConfig => {
            const index = niveisEstoqueAlertaCache.findIndex(c => c.produto_ref_id === savedConfig.produto_ref_id);
            if (index > -1) {
                if (savedConfig.nivel_estoque_baixo === null && savedConfig.nivel_reposicao_urgente === null && !savedConfig.ativo) {
                    niveisEstoqueAlertaCache.splice(index, 1);
                } else {
                    niveisEstoqueAlertaCache[index] = { ...niveisEstoqueAlertaCache[index], ...savedConfig };
                }
            } else if (savedConfig.ativo && (savedConfig.nivel_estoque_baixo !== null || savedConfig.nivel_reposicao_urgente !== null)) {
                niveisEstoqueAlertaCache.push(savedConfig);
            }
        });

        fecharModalNiveis();
        await carregarTabelaEstoque(document.getElementById('searchEstoque')?.value || '');
    } catch (error) {
        mostrarPopupEstoque(`Erro ao salvar níveis em lote: ${error.message}`, 'erro');
    } finally {
        if (btnSalvarLoteEl) {
            btnSalvarLoteEl.disabled = false;
            btnSalvarLoteEl.innerHTML = originalText;
        }
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
    console.log(`[carregarTabelaEstoque] Iniciando. Search: '${searchTerm}', Page: ${page}, Filtro Alerta Ativo: ${filtroAlertaAtivo}`);
    
    if (searchTerm && filtroAlertaAtivo) filtroAlertaAtivo = null;
    if (filtroAlertaAtivo && searchTerm) {
        const searchInput = document.getElementById('searchEstoque');
        if (searchInput) searchInput.value = '';
        searchTerm = '';
    }
    currentPageEstoqueTabela = parseInt(page) || 1;

    const tbody = document.getElementById('estoqueTableBody');
    const paginacaoContainer = document.getElementById('estoquePaginacaoContainer');
    if (!tbody) { console.error("[carregarTabelaEstoque] #estoqueTableBody não encontrado!"); return; }
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><div class="es-spinner"></div> Carregando...</td></tr>`;
    if (paginacaoContainer) paginacaoContainer.style.display = 'none';

    const contadorUrgenteEl = document.getElementById('contadorUrgente');
    const contadorBaixoEl = document.getElementById('contadorBaixo');
    if (contadorUrgenteEl) contadorUrgenteEl.textContent = '-';
    if (contadorBaixoEl) contadorBaixoEl.textContent = '-';

    try {
        let dadosDeSaldoParaProcessar;
        if (saldosEstoqueGlobaisCompletos.length === 0 || filtroAlertaAtivo) {
            dadosDeSaldoParaProcessar = await obterSaldoEstoqueAtualAPI(); 
        } else {
            dadosDeSaldoParaProcessar = [...saldosEstoqueGlobaisCompletos];
        }

        if (!Array.isArray(dadosDeSaldoParaProcessar)) {
            throw new Error("Dados de saldo inválidos.");
        }
        
        let todosOsProdutosDef = [];
        let niveisDeAlertaConfiguradosApi = [];
        try {
            [todosOsProdutosDef, niveisDeAlertaConfiguradosApi] = await Promise.all([
                obterProdutos(), 
                (niveisEstoqueAlertaCache.length > 0 && permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque')) 
                    ? Promise.resolve([...niveisEstoqueAlertaCache])
                    : fetchEstoqueAPI('/niveis-estoque') 
            ]);
            
            if (!(niveisEstoqueAlertaCache.length > 0 && permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque')) && Array.isArray(niveisDeAlertaConfiguradosApi)) {
                 niveisEstoqueAlertaCache = niveisDeAlertaConfiguradosApi;
            } else if (!Array.isArray(niveisDeAlertaConfiguradosApi)){
                if (niveisEstoqueAlertaCache.length === 0) niveisEstoqueAlertaCache = [];
            }
        } catch (error) {
            if (error.status === 403 && error.message && error.message.toLowerCase().includes('níveis de alerta')) {
                mostrarPopupEstoque('Permissão negada para níveis de alerta. Cards de alerta podem não funcionar.', 'aviso', 6000);
                niveisEstoqueAlertaCache = []; 
                todosOsProdutosDef = await obterProdutos();
            } else {
                mostrarPopupEstoque("Falha ao carregar dados auxiliares (produtos/níveis).", "erro");
            }
        }

         todosOsProdutosDef = Array.isArray(todosOsProdutosDef) ? todosOsProdutosDef : [];
        const niveisAlertaValidos = Array.isArray(niveisEstoqueAlertaCache) ? niveisEstoqueAlertaCache : [];

        let countUrgente = 0;
        let countBaixo = 0;
        if (permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque') || niveisAlertaValidos.length > 0) {
            dadosDeSaldoParaProcessar.forEach(item => {
                const produtoRefIdParaAlerta = item.produto_ref_id;
                if (!produtoRefIdParaAlerta) return; 
                const configNivel = niveisAlertaValidos.find(n => n.produto_ref_id === produtoRefIdParaAlerta && n.ativo);
                if (configNivel && configNivel.nivel_reposicao_urgente !== null && configNivel.nivel_estoque_baixo !== null) {
                    const saldoAtualNum = parseFloat(item.saldo_atual);
                    const nivelUrgenteNum = parseFloat(configNivel.nivel_reposicao_urgente);
                    const nivelBaixoNum = parseFloat(configNivel.nivel_estoque_baixo);
                    if (!isNaN(saldoAtualNum) && !isNaN(nivelUrgenteNum) && saldoAtualNum <= nivelUrgenteNum) {
                        countUrgente++;
                    } else if (!isNaN(saldoAtualNum) && !isNaN(nivelBaixoNum) && saldoAtualNum <= nivelBaixoNum) {
                        countBaixo++;
                    }
                }
            });
        }
        if (contadorUrgenteEl) contadorUrgenteEl.textContent = countUrgente;
        if (contadorBaixoEl) contadorBaixoEl.textContent = countBaixo;

        let itensFiltradosLocalmente = [...dadosDeSaldoParaProcessar];
        if (filtroAlertaAtivo && (permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque') || niveisAlertaValidos.length > 0)) {
            itensFiltradosLocalmente = itensFiltradosLocalmente.filter(item => {
                const produtoRefIdParaAlerta = item.produto_ref_id;
                if (!produtoRefIdParaAlerta) return false;
                const configNivel = niveisAlertaValidos.find(n => n.produto_ref_id === produtoRefIdParaAlerta && n.ativo);
                if (!configNivel || configNivel.nivel_reposicao_urgente === null || configNivel.nivel_estoque_baixo === null) return false;
                const saldoAtualNum = parseFloat(item.saldo_atual);
                const nivelUrgenteNum = parseFloat(configNivel.nivel_reposicao_urgente);
                const nivelBaixoNum = parseFloat(configNivel.nivel_estoque_baixo);
                if (isNaN(saldoAtualNum) || isNaN(nivelUrgenteNum) || isNaN(nivelBaixoNum)) return false;
                if (filtroAlertaAtivo === 'urgente') return saldoAtualNum <= nivelUrgenteNum;
                if (filtroAlertaAtivo === 'baixo') return saldoAtualNum <= nivelBaixoNum && saldoAtualNum > nivelUrgenteNum;
                return false;
            });
        }

        if (searchTerm) {
            const termoBuscaLower = searchTerm.toLowerCase();
            itensFiltradosLocalmente = itensFiltradosLocalmente.filter(item =>
                item.produto_nome.toLowerCase().includes(termoBuscaLower) ||
                (item.variante_nome && item.variante_nome !== '-' && item.variante_nome.toLowerCase().includes(termoBuscaLower))
            );
        }
        
        const totalItemsParaPaginar = itensFiltradosLocalmente.length;
        const totalPages = Math.ceil(totalItemsParaPaginar / itemsPerPageEstoqueTabela) || 1;
        currentPageEstoqueTabela = Math.max(1, Math.min(currentPageEstoqueTabela, totalPages));

        const startIndex = (currentPageEstoqueTabela - 1) * itemsPerPageEstoqueTabela;
        const endIndex = startIndex + itemsPerPageEstoqueTabela;
        const itensPaginados = itensFiltradosLocalmente.slice(startIndex, endIndex);
           
        renderizarTabelaEstoque(itensPaginados, todosOsProdutosDef || []);
        renderizarPaginacaoEstoque(totalPages, searchTerm);

        const btnMostrarTodosEl = document.getElementById('btnMostrarTodosEstoque');
        if (btnMostrarTodosEl) {
            btnMostrarTodosEl.style.display = (filtroAlertaAtivo || searchTerm) ? 'inline-flex' : 'none';
        }
    } catch (error) { 
        console.error("Erro em carregarTabelaEstoque:", error.message, error.stack);
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:red;">Erro ao carregar estoque.</td></tr>`;
        if (!(error.status === 403 && error.message && error.message.toLowerCase().includes('níveis de alerta'))) {
            mostrarPopupEstoque("Erro inesperado ao carregar dados do estoque.", "erro");
        }
    }
}

function renderizarTabelaEstoque(itensDeEstoque, produtosDefinicoes) {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (itensDeEstoque.length === 0) {
        const searchVal = document.getElementById('searchEstoque')?.value;
        const msg = searchVal ? 'Nenhum item encontrado para esta busca.' : 'Tudo OK por aqui!';
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">${msg}</td></tr>`;
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

        const tr = document.createElement('tr');
        tr.dataset.itemEstoque = JSON.stringify(item); 
        tr.innerHTML = `
            <td><div class="thumbnail">${imagemSrc !== '/img/placeholder-image.png' ? `<img src="${imagemSrc}" alt="${item.produto_nome}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';this.style.opacity=0.5;">` : '<span></span>'}</div></td>
            <td>${item.produto_nome}</td>
            <td>${item.variante_nome || '-'}</td>
            <td class="saldo-estoque" style="text-align:center;">${item.saldo_atual}</td>
        `;

        if (permissoesGlobaisEstoque.includes('gerenciar-estoque')) {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', (event) => {
                const itemClicadoString = event.currentTarget.dataset.itemEstoque;
                if (itemClicadoString) {
                    const itemClicado = JSON.parse(itemClicadoString);
                    // ANTES: mostrarDetalheItemEstoque(itemClicado);
                    // AGORA:
                    abrirViewMovimento(itemClicado); // << NOVO: Chama a função para abrir a view unificada
                }
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
// Totalmente refatorado para a nova estrutura
function handleHashChangeEstoque() {
    const mainView = document.getElementById('mainViewEstoque');
    const movimentoView = document.getElementById('editarEstoqueMovimentoView');

    if (!mainView || !movimentoView) {
        console.error("[handleHashChangeEstoque] Uma ou mais views não encontradas.");
        return;
    }

    // Oculta todas as views principais
    mainView.style.display = 'none'; mainView.classList.remove('hidden');
    movimentoView.style.display = 'none'; movimentoView.classList.remove('hidden');

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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma movimentação encontrada.</td></tr>';
        return;
    }
    movimentos.forEach(mov => {
        const tr = tbody.insertRow();
        const quantidadeClasse = mov.quantidade > 0 ? 'quantidade-entrada' : 'quantidade-saida';
        let qtdExibida = mov.quantidade;

        tr.innerHTML = `
            <td>${new Date(mov.data_movimento).toLocaleString('pt-BR')}</td>
            <td>${mov.tipo_movimento.replace(/_/g, ' ')}</td>
            <td class="${quantidadeClasse}" style="text-align:right;">${qtdExibida}</td>
            <td>${mov.usuario_responsavel || '-'}</td>
            <td>${mov.observacao || '-'}</td>
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


// --- INICIALIZAÇÃO DA PÁGINA E EVENT LISTENERS ---

async function inicializarPaginaEstoque() {
    console.log('[Estoque inicializarPaginaEstoque]');
    
    // Obter referências aos elementos do modal de níveis
    modalNiveisElement = document.getElementById('modalConfigurarNiveis');
    modalNiveisTituloElement = document.getElementById('modalNiveisTitulo');
    formModalNiveisElement = document.getElementById('formModalNiveis');
    
    // NOVO: Obter referência ao modal de histórico
    modalHistoricoElement = document.getElementById('modalHistoricoMovimentacoes');
    
    try {
        if (todosOsProdutosCadastrados.length === 0) {
            todosOsProdutosCadastrados = await obterProdutos();
        }
    } catch (error) {
        console.error("[inicializarPaginaEstoque] Erro ao carregar definições de produtos:", error);
        mostrarPopupEstoque("Falha ao carregar dados base de produtos.", "aviso");
    }

    setupEventListenersEstoque();
    handleHashChangeEstoque(); // Chama para tratar o estado inicial da URL
    console.log('[Estoque inicializarPaginaEstoque] Concluído.');
}

function setupEventListenersEstoque() {
    // --- Listeners da View Principal (sem alterações) ---
    const searchEstoqueInput = document.getElementById('searchEstoque');
    if (searchEstoqueInput) {
        searchEstoqueInput.addEventListener('input', debounce(() => {
            filtroAlertaAtivo = null;
            currentPageEstoqueTabela = 1;
            carregarTabelaEstoque(searchEstoqueInput.value, 1);
        }, 350));
    }
    const cardUrgente = document.getElementById('cardReposicaoUrgente');
    if (cardUrgente) cardUrgente.addEventListener('click', () => filtrarEstoquePorAlerta('urgente'));
    const cardBaixo = document.getElementById('cardEstoqueBaixo');
    if (cardBaixo) cardBaixo.addEventListener('click', () => filtrarEstoquePorAlerta('baixo'));
    const btnMostrarTodosEl = document.getElementById('btnMostrarTodosEstoque');
    if (btnMostrarTodosEl) {
        btnMostrarTodosEl.addEventListener('click', () => {
            filtroAlertaAtivo = null;
            if (searchEstoqueInput) searchEstoqueInput.value = '';
            currentPageEstoqueTabela = 1;
            carregarTabelaEstoque('', 1);
        });
    }

    const btnArquivar = document.getElementById('arquivarItemBtn');
    if (btnArquivar) {
        btnArquivar.addEventListener('click', arquivarItemEstoque);
    }

    // --- Listeners do Modal de Configuração de Níveis (sem alterações) ---
    const btnConfigNiveis = document.getElementById('btnConfigurarNiveisEstoque');
    if (btnConfigNiveis) btnConfigNiveis.addEventListener('click', abrirModalConfigurarNiveis);
    const btnFecharModalNiveis = document.getElementById('fecharModalNiveis');
    if (btnFecharModalNiveis) btnFecharModalNiveis.addEventListener('click', fecharModalNiveis);
    const btnCancelarModalNiveis = document.getElementById('btnCancelarModalNiveis');
    if (btnCancelarModalNiveis) btnCancelarModalNiveis.addEventListener('click', fecharModalNiveis);
    const buscaNiveisModalInput = document.getElementById('buscaProdutoNiveisModal');
    if (buscaNiveisModalInput) {
        buscaNiveisModalInput.addEventListener('input', debounce(() => {
            const termo = buscaNiveisModalInput.value.toLowerCase();
            const itensFiltrados = todosProdutosParaConfigNiveis.filter(item => 
                item.nome_completo.toLowerCase().includes(termo)
            );
            renderizarTabelaConfigNiveis(itensFiltrados);
        }, 300));
    }
    const btnSalvarLote = document.getElementById('btnSalvarNiveisEmLote');
    if (btnSalvarLote) btnSalvarLote.addEventListener('click', salvarNiveisEmLote);
    
    // --- NOVOS Listeners para a View de Movimentação e Modal de Histórico ---
    const voltarBtn = document.getElementById('voltarParaListaBtn');
    if (voltarBtn) {
        voltarBtn.addEventListener('click', () => {
            window.location.hash = ''; // Volta para a lista
        });
    }
    
    const salvarBtn = document.getElementById('salvarMovimentoBtn');
    if (salvarBtn) {
        salvarBtn.addEventListener('click', salvarMovimentoManualEstoque);
    }
    
    const btnAbrirHistorico = document.getElementById('btnAbrirHistorico');
    if (btnAbrirHistorico) {
        btnAbrirHistorico.addEventListener('click', abrirModalHistorico);
    }

    const btnFecharHistorico = document.getElementById('fecharModalHistorico');
    if (btnFecharHistorico) {
        btnFecharHistorico.addEventListener('click', fecharModalHistorico);
    }
    
    // Listener de Roteamento
    window.addEventListener('hashchange', handleHashChangeEstoque);

    console.log('[Estoque setupEventListenersEstoque] Todos os listeners configurados.');
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