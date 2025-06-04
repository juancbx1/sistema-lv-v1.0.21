// public/js/admin-estoque.js
import { verificarAutenticacao } from '/js/utils/auth.js';
// Se você tiver 'obterProdutos' em utils/storage.js para pegar definições e imagens de produtos, mantenha.
import { obterProdutos, invalidateCache } from '/js/utils/storage.js'; 

// --- Variáveis Globais ---
let permissoesGlobaisEstoque = [];
let usuarioLogadoEstoque = null;
let itemEstoqueEmEdicao = null;
let itemEstoqueEmDetalhe = null;
let niveisEstoqueAlertaCache = [];
let produtoSelecionadoParaConfigNiveis = null;
let editandoNivelId = null;
let currentPageEstoqueTabela = 1;
const itemsPerPageEstoqueTabela = 7; // Ajustado para um valor mais comum
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

let currentPageHistorico = 1;
const itemsPerPageHistorico = 7; // Quantos movimentos por página

// --- FUNÇÃO DE POPUP DE MENSAGEM (Simples - Adapte ou use uma global se tiver) ---
function mostrarPopupEstoque(mensagem, tipo = 'info', duracao = 4000, permitirHTML = false) { // Adicionado duracao e permitirHTML
    const popupId = `popup-estoque-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    // ATUALIZAR CLASSES AQUI:
    popup.className = `es-popup-mensagem popup-${tipo}`; // Usa es-popup-mensagem e o tipo (ex: popup-sucesso)

    const overlayId = `overlay-estoque-${popupId}`;
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    // ATUALIZAR CLASSE AQUI:
    overlay.className = 'es-popup-overlay';

    if (permitirHTML) {
        popup.innerHTML = `<p>${mensagem}</p>`;
    } else {
        const p = document.createElement('p');
        p.textContent = mensagem;
        popup.appendChild(p);
    }

    const fecharBtnManual = document.createElement('button'); // O CSS já estiliza 'button' dentro de .es-popup-mensagem
    fecharBtnManual.textContent = 'OK';
    fecharBtnManual.onclick = () => {
        popup.style.animation = 'es-fadeOutPopup 0.3s ease-out forwards'; // Usar animação com prefixo
        overlay.style.animation = 'es-fadeOutOverlayPopup 0.3s ease-out forwards'; // Usar animação com prefixo
        setTimeout(() => {
            if (document.body.contains(popup)) document.body.removeChild(popup);
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        }, 300); // Tempo para a animação de saída
    };
    popup.appendChild(fecharBtnManual);

    document.body.appendChild(overlay); // Adiciona overlay primeiro
    document.body.appendChild(popup);   // Depois o popup

    if (duracao > 0) {
        setTimeout(() => {
            const el = document.getElementById(popupId);
            if (el && document.body.contains(el)) {
                // Aciona a animação de saída antes de remover
                el.style.animation = 'es-fadeOutPopup 0.3s ease-out forwards';
                const ov = document.getElementById(overlayId);
                if (ov) ov.style.animation = 'es-fadeOutOverlayPopup 0.3s ease-out forwards';
                
                setTimeout(() => {
                    if (document.body.contains(el)) document.body.removeChild(el);
                    if (ov && document.body.contains(ov)) document.body.removeChild(ov);
                }, 300); // Espera a animação terminar
            }
        }, duracao);
    }
}

function debounce(func, wait) { 
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}


// --- FUNÇÃO PARA CHAMADAS À API (Autenticada) ---
async function fetchEstoqueAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarPopupEstoque('Erro de autenticação. Faça login novamente.', 'erro');
        window.location.href = '/index.html'; // Ou sua página de login
        throw new Error('Token não encontrado');
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Adiciona cache-busting para GET requests se não for especificado de outra forma
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
            } catch (e) { /* Ignora se o corpo do erro não for JSON */ }
            
            console.error(`[fetchEstoqueAPI] Erro ${response.status} em ${endpoint}:`, errorData);

            if (response.status === 401 || (errorData.error || '').toLowerCase().includes('token')) {
                localStorage.removeItem('token');
                // Limpar outros caches de usuário se houver
                mostrarPopupEstoque('Sessão expirada ou inválida. Faça login novamente.', 'erro');
                window.location.href = '/index.html'; // Redireciona para o login
            }
            
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status;
            err.data = errorData;
            throw err;
        }
        if (response.status === 204 || options.method === 'DELETE') { // 204 No Content
            return { success: true };
        }
        return await response.json();
    } catch (error) {
        console.error(`[fetchEstoqueAPI] Falha ao acessar ${url}:`, error);
        // Não mostra popup aqui para evitar duplicidade se a função chamadora já o fizer.
        throw error; 
    }
}

async function abrirModalConfigurarNiveis() {
    if (!permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque')) { // Use a permissão correta
        mostrarPopupEstoque('Você não tem permissão para configurar níveis de estoque.', 'aviso');
        return;
    }
    modalNiveisTituloElement.textContent = 'Configurar Níveis de Alerta de Estoque';
    const validationMsgEl = document.getElementById('niveisLoteValidationMessage');
    if(validationMsgEl) validationMsgEl.style.display = 'none';
    
    const tbody = document.getElementById('tbodyConfigNiveis');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><div class="es-spinner">Carregando produtos...</div></td></tr>`;
    
    document.getElementById('buscaProdutoNiveisModal').value = ''; // Limpa busca
    modalNiveisElement.style.display = 'flex';

    // Busca todas as configurações de níveis existentes para preencher os valores
    // e todos os produtos para listar
    try {
        const [todosProdutos, niveisSalvos] = await Promise.all([
            obterProdutos(),
            fetchEstoqueAPI('/niveis-estoque') // GET todas as configs de níveis ativas
        ]);
        niveisEstoqueAlertaCache = niveisSalvos || []; // Atualiza cache global

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
        // niveisEstoqueAlertaCache deve estar atualizado com dados do backend
        const configExistente = niveisEstoqueAlertaCache.find(n => n.produto_ref_id === item.produto_ref_id);
        
        const tr = tbody.insertRow();
        tr.dataset.produtoRefId = item.produto_ref_id; 

        const nivelBaixoOriginal = configExistente?.nivel_estoque_baixo ?? '';
        const nivelUrgenteOriginal = configExistente?.nivel_reposicao_urgente ?? '';
        const ativoOriginal = configExistente?.ativo !== false; // Default to true if not present or explicitly false

        tr.innerHTML = `
            <td data-label="Produto/Variação">${item.nome_completo}</td>
            <td data-label="Nível Estoque Baixo">
                <input type="number" class="es-input input-nivel-baixo" 
                       value="${nivelBaixoOriginal}" 
                       placeholder="0" min="0" 
                       data-original-value="${nivelBaixoOriginal}">
            </td>
            <td data-label="Nível Rep. Urgente">
                <input type="number" class="es-input input-nivel-urgente" 
                       value="${nivelUrgenteOriginal}" 
                       placeholder="0" min="0" 
                       data-original-value="${nivelUrgenteOriginal}">
            </td>
            <td data-label="Ativo" style="text-align:center;">
                <input type="checkbox" class="input-nivel-ativo" 
                       ${ativoOriginal ? 'checked' : ''} 
                       data-original-value="${ativoOriginal}">
            </td>
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
        tr.classList.remove('linha-erro-validacao'); // Limpa destaque de erro anterior
        const inputBaixoEl = tr.querySelector('.input-nivel-baixo');
        const inputUrgenteEl = tr.querySelector('.input-nivel-urgente');
        const inputAtivoEl = tr.querySelector('.input-nivel-ativo');

        if (!inputBaixoEl || !inputUrgenteEl || !inputAtivoEl) return; // Pula linha mal formada

        const produtoRefId = tr.dataset.produtoRefId;
        const nomeCompletoProduto = tr.cells[0].textContent; // Para mensagens de erro

        const valBaixoStr = inputBaixoEl.value.trim();
        const valUrgenteStr = inputUrgenteEl.value.trim();
        const ativo = inputAtivoEl.checked;

        const originalBaixo = inputBaixoEl.dataset.originalValue;
        const originalUrgente = inputUrgenteEl.dataset.originalValue;
        const originalAtivo = inputAtivoEl.dataset.originalValue === 'true';

        // Verifica se houve alteração ou se é um novo item sendo configurado (sem valor original e com input)
        const baixoFoiAlterado = valBaixoStr !== originalBaixo;
        const urgenteFoiAlterado = valUrgenteStr !== originalUrgente;
        const ativoFoiAlterado = ativo !== originalAtivo;
        
        // Considera alterado se algum campo mudou, ou se era vazio e agora tem valor
        // E também se o checkbox de ativo mudou
        const precisaSalvar = baixoFoiAlterado || urgenteFoiAlterado || ativoFoiAlterado ||
                              (!originalBaixo && valBaixoStr) || // Era vazio, agora tem valor
                              (!originalUrgente && valUrgenteStr); // Era vazio, agora tem valor

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
            
            // Se ambos os níveis foram preenchidos, verifica a lógica entre eles
            if (nivelBaixo !== null && nivelUrgente !== null) {
                if (nivelUrgente > nivelBaixo) {
                    errosDeValidacao.push(`"${nomeCompletoProduto}": Rep. Urgente (${nivelUrgente}) não pode ser > Estoque Baixo (${nivelBaixo}).`);
                    linhaValida = false;
                }
            } 
            // Se um está preenchido e o outro não (e queremos que ambos sejam obrigatórios se um for preenchido)
            else if ((nivelBaixo !== null && nivelUrgente === null) || (nivelBaixo === null && nivelUrgente !== null)) {
                 // Permitir limpar ambos os campos para desativar/remover configuração (a API trata isso como null)
                 // Se o usuário quer limpar, ele deixará os campos vazios e talvez desmarque "ativo".
                 // Mas se um estiver preenchido, o outro também deveria estar se "ativo" está marcado.
                if (ativo && (valBaixoStr === '' || valUrgenteStr === '')) {
                    errosDeValidacao.push(`"${nomeCompletoProduto}": Se um nível é definido, o outro também deve ser (ou desative).`);
                    linhaValida = false;
                }
            }


            if (linhaValida) {
                configsParaSalvar.push({
                    produto_ref_id: produtoRefId,
                    nivel_estoque_baixo: nivelBaixo, // Pode ser null se o campo estiver vazio
                    nivel_reposicao_urgente: nivelUrgente, // Pode ser null
                    ativo: ativo
                });
            } else {
                algumaValidacaoFalhou = true;
                tr.classList.add('linha-erro-validacao'); // Adiciona classe para destacar a linha com erro
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

    const btnSalvarLoteEl = document.getElementById('btnSalvarNiveisEmLote'); // Corrigido para _El
    const originalText = btnSalvarLoteEl.textContent;
    btnSalvarLoteEl.disabled = true;
    btnSalvarLoteEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        await fetchEstoqueAPI('/niveis-estoque/batch', { method: 'POST', body: JSON.stringify({ configs: configsParaSalvar }) });
        mostrarPopupEstoque(`${configsParaSalvar.length} configuração(ões) de nível salvas/atualizadas com sucesso!`, 'sucesso');
        
        // Atualiza o cache local de níveis para refletir as mudanças imediatamente
        // Isso é uma otimização para não precisar refazer o fetch de todos os níveis.
        configsParaSalvar.forEach(savedConfig => {
            const index = niveisEstoqueAlertaCache.findIndex(c => c.produto_ref_id === savedConfig.produto_ref_id);
            if (index > -1) {
                // Se o item salvo tem níveis null e está inativo, removemos do cache (ou marcamos inativo)
                if (savedConfig.nivel_estoque_baixo === null && savedConfig.nivel_reposicao_urgente === null && !savedConfig.ativo) {
                    niveisEstoqueAlertaCache.splice(index, 1);
                } else {
                    niveisEstoqueAlertaCache[index] = { ...niveisEstoqueAlertaCache[index], ...savedConfig };
                }
            } else if (savedConfig.ativo && (savedConfig.nivel_estoque_baixo !== null || savedConfig.nivel_reposicao_urgente !== null)) {
                // Adiciona nova configuração ao cache apenas se estiver ativa e tiver níveis
                niveisEstoqueAlertaCache.push(savedConfig); // A API retorna o objeto completo, incluindo ID.
            }
        });

        fecharModalNiveis(); // Fecha o modal
        // Recarrega a tabela principal, que usará o niveisEstoqueAlertaCache atualizado para os cards de alerta
        await carregarTabelaEstoque(document.getElementById('searchEstoque')?.value || '');
    } catch (error) {
        mostrarPopupEstoque(`Erro ao salvar níveis em lote: ${error.message}`, 'erro');
    } finally {
        if (btnSalvarLoteEl) { // Verifica se o elemento ainda existe (pode ter sido fechado)
            btnSalvarLoteEl.disabled = false;
            btnSalvarLoteEl.innerHTML = originalText;
        }
    }
}


async function carregarNiveisParaProdutoSelecionado() {
    const produtoRefId = selectProdutoNiveisElement.value;
    formModalNiveisElement.reset(); 
    inputNivelBaixoElement.value = ''; // Garante limpeza
    inputNivelUrgenteElement.value = ''; // Garante limpeza
    niveisValidationMessageElement.style.display = 'none';
    document.getElementById('produtoRefIdNiveis').value = produtoRefId;
    editandoNivelId = null; // Assume novo até encontrar um existente

    if (!produtoRefId) {
        inputNivelBaixoElement.disabled = true;
        inputNivelUrgenteElement.disabled = true;
        return;
    }
    inputNivelBaixoElement.disabled = false;
    inputNivelUrgenteElement.disabled = false;

    try {
        const configExistente = await fetchEstoqueAPI(`/niveis-estoque/${produtoRefId}`); // API GET por produtoRefId
        if (configExistente && configExistente.id) { 
            inputNivelBaixoElement.value = configExistente.nivel_estoque_baixo;
            inputNivelUrgenteElement.value = configExistente.nivel_reposicao_urgente;
            editandoNivelId = configExistente.id; // Guarda o ID da config para PUT (se sua API de save for PUT para update)
                                               // Se a API de save fizer UPSERT com POST, não precisa guardar o ID.
            console.log('Configuração de nível existente carregada:', configExistente);
        } else {
            console.log('Nenhuma configuração de nível existente para:', produtoRefId);
        }
    } catch (error) {
        if (error.status !== 404) { // 404 é esperado se não houver config
            mostrarPopupEstoque('Erro ao buscar configuração de níveis existente.', 'erro');
        }
         console.log('Nenhuma configuração de nível existente (ou erro ao buscar) para:', produtoRefId);
    }
}

 function fecharModalNiveis() {
     if (modalNiveisElement) modalNiveisElement.style.display = 'none';
     if (formModalNiveisElement) formModalNiveisElement.reset();
     editandoNivelId = null; // <<< USA editandoNivelId
     produtoSelecionadoParaConfigNiveis = null; // Limpa também o produto selecionado no modal
     if(selectProdutoNiveisElement) selectProdutoNiveisElement.value = ''; // Reseta o select
     if(inputNivelBaixoElement) inputNivelBaixoElement.disabled = true; // Desabilita inputs
     if(inputNivelUrgenteElement) inputNivelUrgenteElement.disabled = true;
     if(niveisValidationMessageElement) niveisValidationMessageElement.style.display = 'none';
 }

async function salvarConfiguracaoNiveis(event) {
    event.preventDefault();
    const produtoRefId = document.getElementById('produtoRefIdNiveis').value;
    const nivelBaixo = parseInt(inputNivelBaixoElement.value);
    const nivelUrgente = parseInt(inputNivelUrgenteElement.value);

    if (!produtoRefId) {
        mostrarPopupEstoque('Selecione um produto/variação.', 'aviso');
        return;
    }
    if (isNaN(nivelBaixo) || nivelBaixo < 0 || isNaN(nivelUrgente) || nivelUrgente < 0) {
        mostrarPopupEstoque('Os níveis de estoque devem ser números não negativos.', 'erro');
        return;
    }
    if (nivelUrgente > nivelBaixo) {
        niveisValidationMessageElement.textContent = 'O nível de "Reposição Urgente" não pode ser maior que o nível de "Estoque Baixo".';
        niveisValidationMessageElement.style.display = 'block';
        inputNivelUrgenteElement.focus();
        return;
    }
    niveisValidationMessageElement.style.display = 'none';

    const payload = {
        produto_ref_id: produtoRefId,
        nivel_estoque_baixo: nivelBaixo,
        nivel_reposicao_urgente: nivelUrgente
    };

    // A API POST para /niveis-estoque fará UPSERT baseado no produto_ref_id
    const endpoint = '/niveis-estoque'; 
    const method = 'POST'; // Sempre POST para o endpoint de UPSERT

    const btnSalvar = document.getElementById('btnSalvarModalNiveis');
    const originalText = btnSalvar.textContent;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        await fetchEstoqueAPI(endpoint, { method, body: JSON.stringify(payload) });
        mostrarPopupEstoque('Níveis de alerta salvos com sucesso!', 'sucesso');
        fecharModalNiveis();
        // Recarregar os dados da tabela principal para que os cards de alerta sejam atualizados
        await carregarTabelaEstoque(document.getElementById('searchEstoque')?.value || '');
    } catch (error) {
        mostrarPopupEstoque(`Erro ao salvar níveis: ${error.message}`, 'erro');
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = originalText;
    }
}


// --- LÓGICA DE DADOS E TABELA ---
async function obterSaldoEstoqueAtualAPI() {
    console.log('[obterSaldoEstoqueAtualAPI] Buscando saldo do estoque...');
    try {
        const saldo = await fetchEstoqueAPI('/estoque/saldo'); 
        saldosEstoqueGlobaisCompletos = saldo || []; // GUARDA AQUI
        return saldosEstoqueGlobaisCompletos; // Retorna para uso imediato também
    } catch (error) {
        console.error('[obterSaldoEstoqueAtualAPI] Erro ao buscar saldo:', error);
        mostrarPopupEstoque('Falha ao carregar dados do estoque.', 'erro');
        return [];
    }
}

async function carregarTabelaEstoque(searchTerm = '', page = 1) {
    console.log('[Estoque carregarTabelaEstoque] Busca:', searchTerm, 
                'Página:', page, 
                'Filtro Alerta Ativo:', filtroAlertaAtivo);
    currentPageEstoqueTabela = page; 

    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) { console.error("tbody não encontrado"); return; }
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><div class="es-spinner">Carregando...</div></td></tr>`;

    const contadorUrgenteEl = document.getElementById('contadorUrgente');
    const contadorBaixoEl = document.getElementById('contadorBaixo');
    if (contadorUrgenteEl) contadorUrgenteEl.textContent = '-';
    if (contadorBaixoEl) contadorBaixoEl.textContent = '-';

    try {
        if (saldosEstoqueGlobaisCompletos.length === 0 && !searchTerm && page === 1 && !filtroAlertaAtivo) {
            await obterSaldoEstoqueAtualAPI(); 
        }
        
        let todosOsProdutosDef, niveisDeAlertaConfigurados;
        try {
            [todosOsProdutosDef, niveisDeAlertaConfigurados] = await Promise.all([
                obterProdutos(), 
                // Se o cache de níveis já foi carregado E o usuário tem permissão para vê-los, usa o cache.
                // Caso contrário, tenta buscar. A API /niveis-estoque já tem verificação de permissão.
                (niveisEstoqueAlertaCache.length > 0 && permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque')) 
                    ? Promise.resolve(niveisEstoqueAlertaCache) 
                    : fetchEstoqueAPI('/niveis-estoque') 
            ]);
            
            // Atualiza o cache apenas se buscou e teve sucesso
            if (!(niveisEstoqueAlertaCache.length > 0 && permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque')) && niveisDeAlertaConfigurados) {
                 niveisEstoqueAlertaCache = niveisDeAlertaConfigurados || [];
            }

        } catch (error) {
            // === TRATAMENTO DO ERRO DE PERMISSÃO AQUI ===
            if (error.status === 403 && error.message && error.message.toLowerCase().includes('níveis de alerta')) {
                mostrarPopupEstoque('Você não tem permissão para visualizar/gerenciar os níveis de alerta de estoque. Os cards de alerta podem não funcionar corretamente.', 'aviso', 6000);
                // Define niveisEstoqueAlertaCache como vazio para que os cálculos de alerta não quebrem
                niveisEstoqueAlertaCache = []; 
                // Busca apenas os produtos para popular a tabela, sem os níveis
                todosOsProdutosDef = await obterProdutos();
            } else {
                // Outro erro ao buscar produtos ou níveis, relança para o catch principal
                throw error; 
            }
            // ==========================================
        }


        let countUrgente = 0;
        let countBaixo = 0;
        // Só tenta calcular os contadores se o usuário tiver permissão para ver os níveis.
        // Se não tiver, os contadores permanecerão '-' ou 0.
        if (permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque') || niveisEstoqueAlertaCache.length > 0) {
            saldosEstoqueGlobaisCompletos.forEach(item => {
                const produtoRefIdParaAlerta = item.produto_ref_id;
                if (!produtoRefIdParaAlerta) return; 
                const configNivel = niveisEstoqueAlertaCache.find(n => n.produto_ref_id === produtoRefIdParaAlerta && n.ativo);
                if (configNivel) {
                    if (item.saldo_atual <= configNivel.nivel_reposicao_urgente) countUrgente++;
                    else if (item.saldo_atual <= configNivel.nivel_estoque_baixo) countBaixo++;
                }
            });
        }
        if (contadorUrgenteEl) contadorUrgenteEl.textContent = countUrgente;
        if (contadorBaixoEl) contadorBaixoEl.textContent = countBaixo;

        let itensParaExibirNaTabela = [...saldosEstoqueGlobaisCompletos];
        if (filtroAlertaAtivo && (permissoesGlobaisEstoque.includes('gerenciar-niveis-alerta-estoque') || niveisEstoqueAlertaCache.length > 0)) {
            console.log(`Aplicando filtro de alerta '${filtroAlertaAtivo}' à tabela.`);
            itensParaExibirNaTabela = itensParaExibirNaTabela.filter(item => {
                const produtoRefIdParaAlerta = item.produto_ref_id;
                if (!produtoRefIdParaAlerta) return false;
                const configNivel = niveisEstoqueAlertaCache.find(n => n.produto_ref_id === produtoRefIdParaAlerta && n.ativo);
                if (!configNivel) return false; 
                if (filtroAlertaAtivo === 'urgente') return item.saldo_atual <= configNivel.nivel_reposicao_urgente;
                if (filtroAlertaAtivo === 'baixo') return item.saldo_atual <= configNivel.nivel_estoque_baixo && item.saldo_atual > configNivel.nivel_reposicao_urgente;
                return false;
            });
        }

        if (searchTerm) {
            console.log(`Aplicando filtro de busca textual: '${searchTerm}'`);
            itensParaExibirNaTabela = itensParaExibirNaTabela.filter(item =>
                item.produto_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.variante_nome && item.variante_nome !== '-' && item.variante_nome.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        
        itensParaExibirNaTabela.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome) || (a.variante_nome || '').localeCompare(b.variante_nome || ''));
        
        const totalItemsParaPaginar = itensParaExibirNaTabela.length;
        const totalPages = Math.ceil(totalItemsParaPaginar / itemsPerPageEstoqueTabela);
        currentPageEstoqueTabela = Math.max(1, Math.min(page, totalPages));

        const startIndex = (currentPageEstoqueTabela - 1) * itemsPerPageEstoqueTabela;
        const endIndex = startIndex + itemsPerPageEstoqueTabela;
        const itensPaginados = itensParaExibirNaTabela.slice(startIndex, endIndex);
           
        renderizarTabelaEstoque(itensPaginados, todosOsProdutosDef || []);
        renderizarPaginacaoEstoque(totalPages, searchTerm);

        const btnMostrarTodosEl = document.getElementById('btnMostrarTodosEstoque');
        if (btnMostrarTodosEl) {
            btnMostrarTodosEl.style.display = (filtroAlertaAtivo || searchTerm) ? 'inline-flex' : 'none';
        }


    } catch (error) { 
        console.error("Erro em carregarTabelaEstoque:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:red;">Erro ao carregar estoque.</td></tr>`;
        // Se o erro de permissão não foi pego no try/catch interno, pode ser pego aqui.
        if (!(error.status === 403 && error.message && error.message.toLowerCase().includes('níveis de alerta'))) {
            mostrarPopupEstoque("Erro inesperado ao carregar dados do estoque.", "erro");
        }
    }
}

function renderizarTabelaEstoque(itensDeEstoque, produtosDefinicoes, isFilteredByAlert = false) {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) {
        console.error("[renderizarTabelaEstoque] Elemento tbody #estoqueTableBody não encontrado!");
        return;
    }
    tbody.innerHTML = '';

    if (itensDeEstoque.length === 0) {
        const searchVal = document.getElementById('searchEstoque')?.value;
        const msg = searchVal ? 'Nenhum item encontrado para esta busca.' : 'Tudo OK por aqui!';
        // Ajuste no colspan para 4, já que removemos a coluna de ações
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">${msg}</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    itensDeEstoque.forEach(item => {
        const produtoDef = produtosDefinicoes.find(p => p.nome === item.produto_nome);
        let imagemSrc = '/img/placeholder-image.png'; // Seu placeholder
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
        // Adiciona um data attribute com o item para fácil acesso no listener
        // É importante que o objeto 'item' aqui seja uma cópia ou o original que não será modificado por outras partes
        // antes do clique.
        tr.dataset.itemEstoque = JSON.stringify(item); 

        tr.innerHTML = `
            <td><div class="thumbnail">${imagemSrc !== '/img/placeholder-image.png' ? `<img src="${imagemSrc}" alt="${item.produto_nome}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';this.style.opacity=0.5;">` : '<span></span>'}</div></td>
            <td>${item.produto_nome}</td>
            <td>${item.variante_nome || '-'}</td>
            <td class="saldo-estoque" style="text-align:center;">${item.saldo_atual}</td>
        `;

        // Adiciona listener de clique à linha se houver permissão para gerenciar estoque
        if (permissoesGlobaisEstoque.includes('gerenciar-estoque')) { // Ou uma permissão mais genérica de 'ver-detalhe-estoque' se quiser separar
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (event) => {
        const itemClicadoString = event.currentTarget.dataset.itemEstoque;
        if (itemClicadoString) {
            const itemClicado = JSON.parse(itemClicadoString);
            // ANTES: handleAjustarEstoqueClick(itemClicado);
            // AGORA:
            mostrarDetalheItemEstoque(itemClicado);
        }
            });
        }
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    console.log('[renderizarTabelaEstoque] Tabela de estoque renderizada com itens:', itensDeEstoque.length);
}

// Adicione esta nova função
function mostrarDetalheItemEstoque(item) {
    console.log('[mostrarDetalheItemEstoque] Mostrando detalhes para:', item);
    itemEstoqueEmDetalhe = { ...item }; // Armazena uma cópia do item
    window.location.hash = '#detalhe-item-estoque'; // Dispara o handleHashChangeEstoque
}

function renderizarPaginacaoEstoque(totalPages, searchTermAtual = '') {
    const paginacaoContainer = document.getElementById('estoquePaginacaoContainer');
    if (!paginacaoContainer) {
        console.error("Elemento #estoquePaginacaoContainer não encontrado para renderizar paginação.");
        return;
    }
    paginacaoContainer.innerHTML = ''; // Limpa paginação anterior

    // Não mostra paginação se houver apenas uma página ou nenhuma
    if (totalPages <= 1) {
        paginacaoContainer.style.display = 'none';
        return;
    }
    paginacaoContainer.style.display = 'flex'; // Garante que está visível

    let paginationHTML = '';

    // Botão Anterior
    paginationHTML += `<button 
        class="pagination-btn es-btn" 
        data-page="${Math.max(1, currentPageEstoqueTabela - 1)}" 
        ${currentPageEstoqueTabela === 1 ? 'disabled' : ''}>
        Anterior
    </button>`;

    // Informação da Página Atual
    paginationHTML += `<span class="pagination-current">Pág. ${currentPageEstoqueTabela} de ${totalPages}</span>`;

    // Botão Próximo
    paginationHTML += `<button 
        class="pagination-btn es-btn" 
        data-page="${Math.min(totalPages, currentPageEstoqueTabela + 1)}" 
        ${currentPageEstoqueTabela === totalPages ? 'disabled' : ''}>
        Próximo
    </button>`;
    
    paginacaoContainer.innerHTML = paginationHTML;

    // Adiciona event listeners aos novos botões de paginação
    paginacaoContainer.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = parseInt(btn.dataset.page);
            // Chama carregarTabelaEstoque com o searchTermAtual e a nova página
            // O filtro de alerta (filtroAlertaAtivo) já será considerado dentro de carregarTabelaEstoque
            carregarTabelaEstoque(searchTermAtual, targetPage); 
        });
    });
}


// Na função filtrarEstoquePorAlerta:
async function filtrarEstoquePorAlerta(tipoAlerta) {
    console.log(`Filtrando estoque por: ${tipoAlerta}`);
    filtroAlertaAtivo = tipoAlerta; 

    const searchInput = document.getElementById('searchEstoque');
    if(searchInput) searchInput.value = ''; 
    
    currentPageEstoqueTabela = 1; // Resetar para a primeira página do filtro de alerta
    await carregarTabelaEstoque('', 1); // searchTerm é '', page 1

    // O botão "Mostrar Todos" já será exibido pela lógica em carregarTabelaEstoque
    
    const tabelaEl = document.getElementById('estoqueTable');
    if(tabelaEl) tabelaEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- LÓGICA DE EDIÇÃO/MOVIMENTAÇÃO DE ESTOQUE ---
function handleAjustarEstoqueClick(item) {
    console.log(`[handleAjustarEstoqueClick] Item:`, item);
    itemEstoqueEmEdicao = { ...item }; // Copia o item para edição

    document.getElementById('editEstoqueTitle').textContent = `Ajustar Estoque: ${item.produto_nome} ${item.variante_nome && item.variante_nome !== '-' ? `(${item.variante_nome})` : ''}`;
    document.getElementById('produtoNomeEstoque').value = item.produto_nome;
    document.getElementById('varianteNomeEstoque').value = item.variante_nome || '-'; // Mostra '-' se for null/vazio
    document.getElementById('saldoAtualDisplay').textContent = item.saldo_atual; 
    
    const tipoMovSelect = document.getElementById('tipoMovimentoEstoque');
    const qtdInput = document.getElementById('quantidadeMovimentoEstoque');
    const qtdLabel = document.querySelector('label[for="quantidadeMovimentoEstoque"]');
    
    tipoMovSelect.value = 'ENTRADA_MANUAL'; // Default ao abrir
    qtdInput.value = '';
    document.getElementById('observacaoMovimentoEstoque').value = '';
    
    const updateLabelAndInput = () => {
        if (!qtdLabel || !qtdInput) return;
        if (tipoMovSelect.value === 'BALANCO') {
            qtdLabel.textContent = 'Ajustar Saldo Para (Nova Quantidade Total):';
            qtdInput.placeholder = `Ex: ${itemEstoqueEmEdicao.saldo_atual}`; // Sugere o saldo atual
            qtdInput.value = itemEstoqueEmEdicao.saldo_atual; // Preenche com o saldo atual para balanço
            qtdInput.min = "0"; 
        } else {
            qtdLabel.textContent = 'Quantidade a Movimentar:';
            qtdInput.placeholder = 'Ex: 10';
            qtdInput.value = ''; // Limpa para entrada/saída
            qtdInput.min = "1"; 
        }
    };

    if (tipoMovSelect._changeListener) {
        tipoMovSelect.removeEventListener('change', tipoMovSelect._changeListener);
    }
    tipoMovSelect.addEventListener('change', updateLabelAndInput);
    tipoMovSelect._changeListener = updateLabelAndInput;
    updateLabelAndInput(); 

    window.location.hash = '#editar-estoque';
}

async function salvarMovimentoManualEstoque() {
    if (!itemEstoqueEmEdicao) {
        mostrarPopupEstoque('Nenhum item selecionado para edição.', 'erro');
        return;
    }

    const tipoOperacao = document.getElementById('tipoMovimentoEstoque').value;
    const quantidadeStr = document.getElementById('quantidadeMovimentoEstoque').value;
    const observacao = document.getElementById('observacaoMovimentoEstoque').value;

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
        produto_nome: itemEstoqueEmEdicao.produto_nome,
        variante_nome: (itemEstoqueEmEdicao.variante_nome === '-' || !itemEstoqueEmEdicao.variante_nome) ? null : itemEstoqueEmEdicao.variante_nome,
        quantidade_movimentada: quantidade,
        tipo_operacao: tipoOperacao,
        observacao: observacao
    };

    console.log('[salvarMovimentoManualEstoque] Enviando Payload:', payload);
    const salvarBtn = document.getElementById('salvarEstoqueBtn');
    salvarBtn.disabled = true;
    salvarBtn.textContent = 'Salvando...'; // Mais simples que innerHTML com ícone aqui

    try {
        const resultado = await fetchEstoqueAPI('/estoque/movimento-manual', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        mostrarPopupEstoque(resultado.message || 'Movimento de estoque salvo com sucesso!', 'sucesso');
        
        // === INVALIDAR DADOS LOCAIS PARA FORÇAR RECARGA ===
        saldosEstoqueGlobaisCompletos = []; // Limpa o cache de saldos
        niveisEstoqueAlertaCache = []; // Limpa o cache de níveis também, pois podem ter mudado o status de alerta
        // =================================================

        window.location.hash = '';
    } catch (error) {
        console.error('[salvarMovimentoManualEstoque] Erro ao salvar:', error);
        mostrarPopupEstoque(error.data?.details || error.message || 'Erro desconhecido ao salvar movimento.', 'erro');
    } finally {
        salvarBtn.disabled = false;
        salvarBtn.textContent = 'Salvar Movimento';
    }
}

function handleHashChangeEstoque() {
    const mainView = document.getElementById('mainViewEstoque');
    const editView = document.getElementById('editEstoqueView');
    const detalheView = document.getElementById('detalheItemEstoqueView'); 

    if (!mainView || !editView || !detalheView) { 
        console.error("[handleHashChangeEstoque] Uma ou mais views principais não encontradas.");
        return;
    }

    // Esconde todas as views
    mainView.style.display = 'none';
    mainView.classList.add('hidden'); // Adiciona hidden para garantir se o CSS usa

    editView.style.display = 'none';
    editView.classList.add('hidden');

    detalheView.style.display = 'none';
    detalheView.classList.add('hidden');

    const hash = window.location.hash;

    if (hash === '#editar-estoque') {
        if (!itemEstoqueEmEdicao) {
            window.location.hash = ''; 
            return;
        }
        editView.style.display = 'block'; 
        editView.classList.remove('hidden'); // Remove hidden
    } else if (hash === '#detalhe-item-estoque') { 
        if (!itemEstoqueEmDetalhe) {
            window.location.hash = '';
            return;
        }
        detalheView.style.display = 'block';
        detalheView.classList.remove('hidden'); // Remove hidden
        carregarDetalhesEHistoricoItem(itemEstoqueEmDetalhe); 
    } else { 
        mainView.style.display = 'block';
        mainView.classList.remove('hidden'); // Remove hidden
        
        // Se for a visualização principal, recarrega a tabela (se necessário)
        if (mainView.style.display === 'block' && !filtroAlertaAtivo) {
             carregarTabelaEstoque(document.getElementById('searchEstoque')?.value || '', currentPageEstoqueTabela);
        }
    }
}

async function carregarHistoricoMovimentacoes(produtoNome, varianteNome, page) {
    currentPageHistorico = page;
    const tbody = document.getElementById('historicoMovimentacoesTableBody');
    const paginacaoContainer = document.getElementById('paginacaoHistoricoMovimentacoes');
    if (!tbody || !paginacaoContainer) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;"><div class="es-spinner">Carregando histórico...</div></td></tr>`;
    paginacaoContainer.innerHTML = '';

    try {
        // Ajusta varianteNome para a API (null se for '-' ou vazia)
        const varianteParaAPI = (varianteNome === '-' || !varianteNome) ? null : varianteNome;
        
        const params = new URLSearchParams({
            produto_nome: produtoNome,
            limit: itemsPerPageHistorico,
            page: currentPageHistorico
        });
        if (varianteParaAPI) { // Só adiciona se tiver uma variante real
            params.append('variante_nome', varianteParaAPI);
        }

        const data = await fetchEstoqueAPI(`/estoque/movimentos?${params.toString()}`);
        
        renderizarHistoricoMovimentacoes(data.rows || []);
        renderizarPaginacaoHistorico(data.pages || 0, produtoNome, varianteNome); // Passa produto e variante para os botões de pag.
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red;">Erro ao carregar histórico.</td></tr>`;
        mostrarPopupEstoque('Erro ao carregar histórico de movimentações.', 'erro');
    }
}

function renderizarHistoricoMovimentacoes(movimentos) {
    const tbody = document.getElementById('historicoMovimentacoesTableBody');
    if (!tbody) {
        console.error("tbody #historicoMovimentacoesTableBody não encontrado em renderizarHistoricoMovimentacoes");
        return;
    }
    tbody.innerHTML = '';
    console.log("[renderizarHistoricoMovimentacoes] Recebeu movimentos:", movimentos); // LOG

    if (!movimentos || movimentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma movimentação encontrada para este item.</td></tr>';
        return;
    }
    movimentos.forEach(mov => {
        console.log("[renderizarHistoricoMovimentacoes] Renderizando movimento:", mov); // LOG
        const tr = tbody.insertRow();
        const quantidadeClasse = mov.quantidade > 0 && (mov.tipo_movimento.includes('ENTRADA') || mov.tipo_movimento.includes('POSITIVO')) ? 'quantidade-entrada' : 
                               mov.quantidade < 0 && (mov.tipo_movimento.includes('SAIDA') || mov.tipo_movimento.includes('NEGATIVO')) ? 'quantidade-saida' : '';
        
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

    let paginationHTML = `<button class="pagination-btn es-btn" data-page="${Math.max(1, currentPageHistorico - 1)}" ${currentPageHistorico === 1 ? 'disabled' : ''}>Anterior</button>`;
    paginationHTML += `<span class="pagination-current">Pág. ${currentPageHistorico} de ${totalPages}</span>`;
    paginationHTML += `<button class="pagination-btn es-btn" data-page="${Math.min(totalPages, currentPageHistorico + 1)}" ${currentPageHistorico === totalPages ? 'disabled' : ''}>Próximo</button>`;
    paginacaoContainer.innerHTML = paginationHTML;

    paginacaoContainer.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = parseInt(btn.dataset.page);
            carregarHistoricoMovimentacoes(produtoNome, varianteNome, targetPage);
        });
    });
}


async function carregarDetalhesEHistoricoItem(item) {
    if (!item || typeof item.produto_nome === 'undefined') { // Verifica se item e produto_nome existem
        console.error("[carregarDetalhesEHistoricoItem] Item inválido ou sem produto_nome:", item);
        mostrarPopupEstoque("Não foi possível carregar os detalhes do item selecionado.", "erro");
        window.location.hash = ''; // Volta para a lista para evitar view quebrada
        return;
    }
    console.log("[carregarDetalhesEHistoricoItem] Iniciando para item:", JSON.stringify(item));

    const detalheView = document.getElementById('detalheItemEstoqueView');
    if (!detalheView) {
        console.error("ERRO CRÍTICO: View #detalheItemEstoqueView NÃO encontrada no DOM!");
        return;
    }

    const tituloEl = document.getElementById('detalheItemTitulo');
    const skuEl = document.getElementById('detalheItemSKU'); 
    const skuSpan = skuEl ? skuEl.querySelector('span') : null; 
    const saldoEl = document.getElementById('detalheItemSaldoAtual');
    const thumbnailEl = document.getElementById('detalheItemThumbnail');

    if (tituloEl) {
        tituloEl.textContent = `${item.produto_nome} ${item.variante_nome && item.variante_nome !== '-' ? `(${item.variante_nome})` : '(Padrão)'}`;
    } else { console.warn("Elemento #detalheItemTitulo não encontrado."); }

    // Usa a variável global todosOsProdutosCadastrados
    const produtoDef = todosOsProdutosCadastrados.find(p => p.nome === item.produto_nome);
    let skuParaExibir = item.produto_ref_id || 'N/A'; // Prioriza o produto_ref_id que veio do saldo, se existir
    let imagemSrcDetalhe = '/img/placeholder-image.png'; // CAMINHO CORRETO DO SEU PLACEHOLDER

    if (produtoDef) {
        // Se o produto_ref_id não veio do item de saldo, tenta encontrá-lo/construí-lo
        if (skuParaExibir === 'N/A') {
            if (item.variante_nome && item.variante_nome !== '-' && item.variante_nome !== 'Padrão') {
                const gradeItem = produtoDef.grade?.find(g => g.variacao === item.variante_nome);
                skuParaExibir = gradeItem?.sku || produtoDef.sku || 'SKU Indisp.';
            } else {
                skuParaExibir = produtoDef.sku || 'SKU Indisp.';
            }
        }

        // Lógica para imagem
        if (item.variante_nome && item.variante_nome !== '-' && item.variante_nome !== 'Padrão') {
            const gradeItem = produtoDef.grade?.find(g => g.variacao === item.variante_nome);
            if (gradeItem?.imagem) imagemSrcDetalhe = gradeItem.imagem;
            else if (produtoDef.imagem) imagemSrcDetalhe = produtoDef.imagem;
        } else if (produtoDef.imagem) {
            imagemSrcDetalhe = produtoDef.imagem;
        }
    } else {
        console.warn(`Definição do produto "${item.produto_nome}" não encontrada em todosOsProdutosCadastrados.`);
    }
    
    if (skuSpan) {
        skuSpan.textContent = skuParaExibir;
    } else if (skuEl) {
         skuEl.innerHTML = `SKU: <span>${skuParaExibir}</span>`; // Recria o span se necessário
    } else { console.warn("Elemento #detalheItemSKU (ou seu span) não encontrado."); }

    if (saldoEl) {
        saldoEl.textContent = item.saldo_atual;
    } else { console.warn("Elemento #detalheItemSaldoAtual não encontrado."); }

    if (thumbnailEl) {
        thumbnailEl.innerHTML = `<img src="${imagemSrcDetalhe}" alt="${item.produto_nome}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';this.style.opacity=0.5;">`;
    } else { console.warn("Elemento #detalheItemThumbnail não encontrado."); }

    console.log("[carregarDetalhesEHistoricoItem] Info básica preenchida. SKU usado:", skuParaExibir);
    console.log("[carregarDetalhesEHistoricoItem] Chamando carregarHistoricoMovimentacoes...");
    await carregarHistoricoMovimentacoes(item.produto_nome, item.variante_nome, 1); // Passa o nome da variante como veio do saldo
    console.log("[carregarDetalhesEHistoricoItem] carregarHistoricoMovimentacoes chamado.");
}

async function inicializarPaginaEstoque() {
    console.log('[Estoque inicializarPaginaEstoque]');
    
    // Obter referências aos elementos do modal de níveis uma vez
    modalNiveisElement = document.getElementById('modalConfigurarNiveis');
    modalNiveisTituloElement = document.getElementById('modalNiveisTitulo');
    formModalNiveisElement = document.getElementById('formModalNiveis');
    selectProdutoNiveisElement = document.getElementById('selectProdutoNiveis');
    inputNivelBaixoElement = document.getElementById('nivelEstoqueBaixoInput');
    inputNivelUrgenteElement = document.getElementById('nivelReposicaoUrgenteInput');
    niveisValidationMessageElement = document.getElementById('niveisValidationMessage');

    // === CARREGAR DEFINIÇÕES DE PRODUTOS UMA VEZ ===
    try {
        if (todosOsProdutosCadastrados.length === 0) { // Só carrega se ainda não tiver
            todosOsProdutosCadastrados = await obterProdutos(); // obterProdutos() é do seu storage.js
            console.log(`[inicializarPaginaEstoque] ${todosOsProdutosCadastrados.length} definições de produtos carregadas.`);
        }
    } catch (error) {
        console.error("[inicializarPaginaEstoque] Erro ao carregar definições de produtos:", error);
        mostrarPopupEstoque("Falha ao carregar dados base de produtos. Algumas informações podem não aparecer.", "aviso");
        // A página pode continuar, mas imagens/SKUs podem falhar.
    }
    // =============================================

    await carregarTabelaEstoque(); 
    setupEventListenersEstoque(); 
    handleHashChangeEstoque(); 
    console.log('[Estoque inicializarPaginaEstoque] Concluído.');
}

function setupEventListenersEstoque() {
    // Listener para a barra de busca principal da tabela de estoque
    const searchEstoqueInput = document.getElementById('searchEstoque');
    if (searchEstoqueInput) {
        searchEstoqueInput.addEventListener('input', debounce(() => {
            filtroAlertaAtivo = null; // Busca textual limpa o filtro de alerta
            currentPageEstoqueTabela = 1; // Reset para a primeira página nos resultados da busca
            carregarTabelaEstoque(searchEstoqueInput.value, 1);
        }, 350));
    }

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
    if (btnSalvarLote) {
    btnSalvarLote.addEventListener('click', salvarNiveisEmLote);
    }

    // Listener para o botão "X" (Voltar) da view de AJUSTE de estoque
    const voltarBtnAjuste = document.getElementById('voltarBtnEstoque');
    if (voltarBtnAjuste) {
        voltarBtnAjuste.addEventListener('click', () => {
            window.location.hash = ''; // Limpa o hash para acionar handleHashChangeEstoque
        });
    }

    const btnVoltarDetalhe = document.getElementById('voltarListaDeDetalheBtn');
if (btnVoltarDetalhe) {
    btnVoltarDetalhe.addEventListener('click', () => {
        window.location.hash = ''; // Volta para a lista principal
    });
}

const btnAbrirModalAjusteEl = document.getElementById('btnAbrirModalAjuste');
if (btnAbrirModalAjusteEl) {
    btnAbrirModalAjusteEl.addEventListener('click', () => {
        if (itemEstoqueEmDetalhe && permissoesGlobaisEstoque.includes('ajustar-saldo')) {
            handleAjustarEstoqueClick(itemEstoqueEmDetalhe);
        } else if (!permissoesGlobaisEstoque.includes('ajustar-saldo')) {
            mostrarPopupEstoque("Você não tem permissão para ajustar o estoque.", "aviso");
        }
    });
}

    // Listener para o botão "Salvar Movimento" na view de AJUSTE de estoque
    const salvarAjusteBtn = document.getElementById('salvarEstoqueBtn');
    if (salvarAjusteBtn) {
        salvarAjusteBtn.addEventListener('click', salvarMovimentoManualEstoque);
    }

    // --- Listeners para o Modal de Configuração de Níveis de Alerta ---
    const btnConfigNiveis = document.getElementById('btnConfigurarNiveisEstoque');
    if (btnConfigNiveis) {
        btnConfigNiveis.addEventListener('click', abrirModalConfigurarNiveis);
    }

    const btnFecharModalNiveis = document.getElementById('fecharModalNiveis');
    if (btnFecharModalNiveis) {
        btnFecharModalNiveis.addEventListener('click', fecharModalNiveis);
    }

    const btnCancelarModalNiveis = document.getElementById('btnCancelarModalNiveis');
    if (btnCancelarModalNiveis) {
        btnCancelarModalNiveis.addEventListener('click', fecharModalNiveis);
    }
    
    // formModalNiveisElement é uma variável global definida em inicializarPaginaEstoque
    if (formModalNiveisElement) { 
        formModalNiveisElement.addEventListener('submit', salvarConfiguracaoNiveis);
    }

    // Listeners para validação em tempo real dos inputs de níveis dentro do modal
    // inputNivelBaixoElement e inputNivelUrgenteElement são vars globais definidas em inicializarPaginaEstoque
    if (inputNivelBaixoElement && inputNivelUrgenteElement && niveisValidationMessageElement) {
        const validarNiveisInputsHandler = () => {
            const baixo = parseInt(inputNivelBaixoElement.value);
            const urgente = parseInt(inputNivelUrgenteElement.value);
            if (!isNaN(baixo) && !isNaN(urgente) && urgente > baixo) {
                niveisValidationMessageElement.textContent = 'O nível de "Reposição Urgente" não pode ser maior que o de "Estoque Baixo".';
                niveisValidationMessageElement.style.display = 'block';
            } else {
                niveisValidationMessageElement.style.display = 'none';
            }
        };
        inputNivelBaixoElement.addEventListener('input', validarNiveisInputsHandler);
        inputNivelUrgenteElement.addEventListener('input', validarNiveisInputsHandler);
    }
    // --- Fim Listeners Modal de Níveis ---

    // --- Listeners para os Cards de Alerta de Estoque ---
    const cardUrgente = document.getElementById('cardReposicaoUrgente');
    if (cardUrgente) {
        cardUrgente.addEventListener('click', () => {
            filtrarEstoquePorAlerta('urgente');
        });
    }

    const cardBaixo = document.getElementById('cardEstoqueBaixo');
    if (cardBaixo) {
        cardBaixo.addEventListener('click', () => {
            filtrarEstoquePorAlerta('baixo');
        });
    }
    // --- Fim Listeners Cards de Alerta ---

    // --- Listener para o Botão "Mostrar Todos os Itens" ---
    const btnMostrarTodosEl = document.getElementById('btnMostrarTodosEstoque');
    if (btnMostrarTodosEl) {
        btnMostrarTodosEl.addEventListener('click', () => {
            console.log("Botão Mostrar Todos clicado");
            filtroAlertaAtivo = null; // Limpa o filtro de alerta
            const searchInput = document.getElementById('searchEstoque');
            if (searchInput) searchInput.value = ''; // Limpa a busca textual
            currentPageEstoqueTabela = 1; // Volta para a primeira página
            
            // Chama carregarTabelaEstoque. Como filtroAlertaAtivo é null e searchTerm é '',
            // nenhum filtro será aplicado, e a tabela completa (paginada) será carregada.
            carregarTabelaEstoque('', 1); 
            
            // A lógica para esconder o botão "Mostrar Todos" já está dentro de carregarTabelaEstoque
        });
    }
    // --- Fim Listener "Mostrar Todos" ---

    // Listener para mudanças na hash da URL (para navegação entre views)
    window.addEventListener('hashchange', handleHashChangeEstoque);

    console.log('[Estoque setupEventListenersEstoque] Todos os listeners configurados.');
}

// --- INICIALIZAÇÃO DA PÁGINA ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/estoque.html', ['acesso-estoque']);
        if (!auth) return; 
        permissoesGlobaisEstoque = auth.permissoes || [];
        usuarioLogadoEstoque = auth.usuario;
        document.body.classList.add('autenticado'); // Adiciona classe para o CSS
        await inicializarPaginaEstoque();
    } catch (error) {
        console.error('[Estoque DOMContentLoaded] Erro na autenticação ou inicialização:', error);
        mostrarPopupEstoque('Erro crítico ao carregar a página de estoque. Tente recarregar.', 'erro');
    }
});
