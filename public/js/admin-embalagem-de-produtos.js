import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos, invalidateCache } from '/js/utils/storage.js';

// --- Variáveis Globais ---
let usuarioLogado = null;
let permissoes = [];
let todosOsProdutos = [];
let todosOsUsuarios = [];
let opDataCache = new Map();
let todosOsArrematesRegistrados = [];

// Paginação para Arremate
let currentPageArremate = 1;
const itemsPerPageArremate = 5;
let opsParaArrematarGlobal = [];


let produtosParaArrematarAgregados = [];
let arremateAgregadoEmVisualizacao = null; 


// Paginação para Embalagem
let currentPageEmbalagem = 1;
const itemsPerPageEmbalagem = 5; // Pode ser ajustado
let opsProntasParaEmbalarGlobal = [];
let produtosProntosParaEmbalarAgregados = [];
let embalagemAgregadoEmVisualizacao = null; 


const lancamentosArremateEmAndamento = new Set();

// --- Funções Auxiliares ---
async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
         mostrarPopupMensagem('Erro de autenticação. Faça login novamente.', 'erro');
         window.location.href = '/index.html'; //  MODIFICADO: Para a página inicial/login principal
         throw new Error('Token não encontrado');
    }
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const url = options.method === 'GET' || !options.method
               ? `/api${endpoint}${endpoint.includes('?') ? '&' : '?'}_=${Date.now()}`
               : `/api${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });
        if (!response.ok) {
            let errorData = { error: `Erro ${response.status} - ${response.statusText}` }; // Default error
            try {
                 const jsonError = await response.json();
                 errorData = jsonError || errorData;
            } catch (e) {
                 try {
                      const textError = await response.text();
                      errorData.error = textError || errorData.error;
                 } catch (textE) {
                      // Se tudo falhar, usa o statusText, já pego no default
                 }
            }
            console.error(`[fetchFromAPI] Erro ${response.status} em ${endpoint}:`, errorData);

            // Apenas redireciona para login/token-expirado se for 401 ou se o erro explicitamente mencionar "token"
            if (response.status === 401 || (errorData.error || '').toLowerCase().includes('token expirado') || (errorData.error || '').toLowerCase().includes('token inválido')) {
                 localStorage.removeItem('token');
                 localStorage.removeItem('usuarioLogado'); // Se você ainda usa isso
                 localStorage.removeItem('permissoes'); // Limpa cache de permissões
                 // Decide para onde redirecionar baseado na mensagem
                 if ((errorData.error || '').toLowerCase().includes('token expirado')) {
                    mostrarPopupMensagem('Sua sessão expirou. Faça login novamente.', 'aviso');
                    window.location.href = '/admin/token-expirado.html'; // Ou sua página de token expirado
                 } else {
                    mostrarPopupMensagem('Erro de autenticação. Faça login novamente.', 'erro');
                    window.location.href = '/index.html'; // Ou sua página de login principal
                 }
            }
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status; // Adiciona o status ao objeto de erro
            err.data = errorData; // Adiciona os dados completos do erro
            throw err;
        }
        if (response.status === 204 || options.method === 'DELETE') {
            return { success: true };
        }
        return await response.json();
    } catch (error) {
        console.error(`[fetchFromAPI] Falha ao acessar ${url}:`, error);
        throw error; // Re-lança o erro para ser tratado por quem chamou
    }
}

async function buscarOpsFinalizadas() {
    const endpoint = '/ops-para-embalagem?all=true';
    try {
        const data = await fetchFromAPI(endpoint);
        const ops = data?.rows || [];
        opDataCache.clear(); // Limpa cache antigo de OPs
        ops.forEach(op => opDataCache.set(op.numero, op)); // Popula com OPs completas
        return ops;
    } catch (error) {
        console.error('[buscarOpsFinalizadas] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar Ordens de Produção finalizadas.', 'erro');
        return [];
    }
}

async function buscarArrematesRegistrados(opNumero = null) {
    if (!opNumero && todosOsArrematesRegistrados.length > 0) {
        return todosOsArrematesRegistrados;
    }
    const endpoint = opNumero ? `/arremates?op_numero=${opNumero}` : '/arremates';
    console.log(`[buscarArrematesRegistrados] Buscando arremates em ${endpoint}...`);
    try {
        const arremates = await fetchFromAPI(endpoint);
        const arrematesArray = Array.isArray(arremates) ? arremates : (arremates?.rows || []);
        if (!opNumero) {
            todosOsArrematesRegistrados = arrematesArray;
            console.log(`[buscarArrematesRegistrados] Cache global de arremates atualizado com ${arrematesArray.length} registros.`);
        }
        return arrematesArray;
    } catch (error) {
        console.error('[buscarArrematesRegistrados] Erro:', error);
        return [];
    }
}

async function buscarUsuarios() {
    if (todosOsUsuarios.length > 0) return todosOsUsuarios;
    try {
        const data = await fetchFromAPI('/usuarios'); // API retorna { rows: [...] } ou array
        todosOsUsuarios = Array.isArray(data) ? data : (data?.rows || []);
        return todosOsUsuarios;
    } catch (error) {
        console.error('[buscarUsuarios] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar usuários.', 'erro');
        return [];
    }
}

async function buscarTodosProdutos() {
    if (todosOsProdutos.length > 0) return todosOsProdutos;
    try {
        todosOsProdutos = await obterProdutos();
        return todosOsProdutos;
    } catch (error) {
        console.error('[buscarTodosProdutos] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar definições de produtos.', 'erro');
        return [];
    }
}

async function buscarOpPorNumero(opNumero) {
    if (opDataCache.has(opNumero)) {
        return opDataCache.get(opNumero);
    }
    console.log(`[buscarOpPorNumero] Buscando OP ${opNumero} da API...`);
    try {
        const op = await fetchFromAPI(`/ordens-de-producao/${opNumero}`); // Assume que este endpoint retorna uma OP única
        if (op) opDataCache.set(opNumero, op);
        return op;
    } catch (error) {
        console.error(`[buscarOpPorNumero] Erro ao buscar OP ${opNumero}:`, error);
        return null;
    }
}

function obterQuantidadeFinalProduzida(op) {
    if (!op) return 0; // Adiciona verificação se OP é nula/undefined

    if (op.etapas && Array.isArray(op.etapas) && op.etapas.length > 0) {
        for (let i = op.etapas.length - 1; i >= 0; i--) {
            const etapa = op.etapas[i];
            // Verifica se a etapa existe e se 'quantidade' está definida (não null/undefined)
            if (etapa && typeof etapa.quantidade !== 'undefined' && etapa.quantidade !== null) {
                const qtdEtapa = parseInt(etapa.quantidade, 10);
                // Verifica se a conversão para int resultou em um número válido
                if (!isNaN(qtdEtapa) && qtdEtapa >= 0) {
                    // Considerar se uma etapa com quantidade 0 significa "sem produção finalizada"
                    // Para o propósito de "produto pronto", geralmente esperamos > 0, mas 0 pode ser válido.
                    return qtdEtapa;
                }
            }
        }
        console.warn(`[obterQuantidadeFinalProduzida] OP ${op.numero}: Nenhuma etapa com quantidade válida encontrada. Etapas:`, op.etapas);
    } else {
        console.warn(`[obterQuantidadeFinalProduzida] OP ${op.numero}: Não possui etapas ou etapas não é um array.`);
    }

    // Fallback para a quantidade principal da OP se nenhuma etapa tiver quantidade válida
    const qtdPrincipal = parseInt(op.quantidade, 10);
    if (!isNaN(qtdPrincipal) && qtdPrincipal >= 0) {
        console.log(`[obterQuantidadeFinalProduzida] OP ${op.numero}: Usando quantidade principal da OP: ${qtdPrincipal}`);
        return qtdPrincipal;
    }
    
    console.error(`[obterQuantidadeFinalProduzida] OP ${op.numero}: Não foi possível determinar a quantidade final. Retornando 0.`);
    return 0;
}

async function obterUsuariosTiktikParaProduto(produtoNome) {
    const produto = todosOsProdutos.find(p => p.nome === produtoNome);
    if (!produto) {
        console.warn(`[obterUsuariosTiktik] Produto "${produtoNome}" NÃO encontrado.`);
        return [];
    }
    if (!produto.etapasTiktik || !Array.isArray(produto.etapasTiktik) || produto.etapasTiktik.length === 0) {
        console.warn(`[obterUsuariosTiktik] Produto "${produtoNome}" não possui 'etapasTiktik'.`);
        return [];
    }
    const tipoFeitoPor = produto.etapasTiktik[0]?.feitoPor;
    if (!tipoFeitoPor) {
        console.warn(`[obterUsuariosTiktik] 'feitoPor' não definido para ${produtoNome}.`);
        return [];
    }
    const usuarios = await buscarUsuarios();
    const tipoFeitoPorLower = tipoFeitoPor.toLowerCase();
    const usuariosFiltrados = usuarios.filter(u => {
        const userTypes = u?.tipos;
        if (!userTypes) return false;
        if (Array.isArray(userTypes)) {
            return userTypes.some(type => typeof type === 'string' && type.toLowerCase() === tipoFeitoPorLower);
        } else if (typeof userTypes === 'string') {
            return userTypes.toLowerCase() === tipoFeitoPorLower;
        }
        return false;
    });
    return usuariosFiltrados;
}


// --- Lógica de Renderização (AJUSTADA PARA NOVO HTML/CSS) ---

// async function carregarTabelaArremate(opsParaArrematar) {
//     const tbody = document.getElementById('arremateTableBody');
//     const paginationContainer = document.getElementById('arrematePaginationContainer'); // ID do HTML novo
//     if (!tbody || !paginationContainer) {
//         console.error('[carregarTabelaArremate] Elementos tbody ou paginationContainer não encontrados.');
//         return;
//     }

//     tbody.innerHTML = '';
//     paginationContainer.innerHTML = '';

//     if (opsParaArrematar.length === 0) {
//         // Colspan agora é 8 por causa das colunas "Arrematar Qtd." e "Ação" separadas
//         tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum item aguardando arremate.</td></tr>`;
//         return;
//     }

//     const totalItems = opsParaArrematar.length;
//     const totalPages = Math.ceil(totalItems / itemsPerPageArremate);
//     const startIndex = (currentPageArremate - 1) * itemsPerPageArremate;
//     const endIndex = Math.min(startIndex + itemsPerPageArremate, totalItems);
//     const paginatedOPs = opsParaArrematar.slice(startIndex, endIndex);

//     const usuariosTiktikPromises = paginatedOPs.map(op => obterUsuariosTiktikParaProduto(op.produto));
//     const usuariosPorOP = await Promise.all(usuariosTiktikPromises);

//     const fragment = document.createDocumentFragment();
//     paginatedOPs.forEach((op, index) => {
//         const tr = document.createElement('tr');
//         tr.dataset.opNumero = op.numero;
//         tr.dataset.opEditId = op.edit_id;
//         tr.dataset.produto = op.produto;
//         tr.dataset.variante = op.variante || '-';

//         const quantidadePendente = op.quantidade_pendente_arremate;
//         const usuariosTiktikDisponiveis = usuariosPorOP[index];
//         const temPermissaoLancar = permissoes.includes('lancar-arremate');

//         // Desabilitar controles se não houver usuários, quantidade ou permissão
//         const controlesDesabilitados = usuariosTiktikDisponiveis.length === 0 || quantidadePendente === 0 || !temPermissaoLancar;

//         tr.innerHTML = `
//             <td>${op.numero}</td>
//             <td>${op.produto}</td>
//             <td>${op.variante || '-'}</td>
//             <td>${op.quantidade_produzida_original}</td>
//             <td class="quantidade-pendente-arremate">${quantidadePendente}</td>
//             <td>
//                 <select class="ep-select select-usuario-tiktik" ${controlesDesabilitados ? 'disabled' : ''} title="${!temPermissaoLancar ? 'Sem permissão' : ''}">
//                     <option value="">${usuariosTiktikDisponiveis.length === 0 ? 'Nenhum Tiktik' : 'Selecione...'}</option>
//                     ${usuariosTiktikDisponiveis.map(user => `<option value="${user.nome}">${user.nome}</option>`).join('')}
//                 </select>
//             </td>
//             <td>
//                 <input type="number" class="ep-input input-quantidade-arremate" value="${quantidadePendente}" 
//                        min="1" max="${quantidadePendente}" style="width: 80px;" ${controlesDesabilitados ? 'disabled' : ''} title="${!temPermissaoLancar ? 'Sem permissão' : ''}">
//             </td>
//             <td>
//                 <button class="ep-btn ep-btn-primary botao-lancar-arremate" ${controlesDesabilitados ? 'disabled' : ''} title="${!temPermissaoLancar ? 'Sem permissão para lançar' : (controlesDesabilitados && temPermissaoLancar ? 'Selecione usuário e/ou verifique quantidade' : 'Lançar Arremate')}">
//                     Lançar
//                 </button>
//             </td>
//         `;

//         const btnLancar = tr.querySelector('.botao-lancar-arremate');
//         const inputQuantidade = tr.querySelector('.input-quantidade-arremate');
//         const selectUser = tr.querySelector('.select-usuario-tiktik');

//         const atualizarEstadoBotaoLancar = () => {
//             if (btnLancar && inputQuantidade && selectUser) {
//                 const qtdValida = parseInt(inputQuantidade.value) > 0 && parseInt(inputQuantidade.value) <= parseInt(inputQuantidade.max);
//                 const usuarioSelecionado = selectUser.value !== "";
//                 btnLancar.disabled = !(qtdValida && usuarioSelecionado && temPermissaoLancar);
//             }
//         };
        
//         if (btnLancar) btnLancar.addEventListener('click', handleLancarArremateClick);
//         if (inputQuantidade) inputQuantidade.addEventListener('input', atualizarEstadoBotaoLancar);
//         if (selectUser) selectUser.addEventListener('change', atualizarEstadoBotaoLancar);
        
//         // Chamada inicial para definir o estado do botão
//         if (temPermissaoLancar) atualizarEstadoBotaoLancar();


//         fragment.appendChild(tr);
//     });

//     tbody.appendChild(fragment);

//     if (totalPages > 1) {
//         let paginationHTML = `<button class="ep-btn pagination-btn prev" data-page="${Math.max(1, currentPageArremate - 1)}" ${currentPageArremate === 1 ? 'disabled' : ''}>Anterior</button>`;
//         paginationHTML += `<span class="pagination-current">Pág. ${currentPageArremate} de ${totalPages}</span>`;
//         paginationHTML += `<button class="ep-btn pagination-btn next" data-page="${Math.min(totalPages, currentPageArremate + 1)}" ${currentPageArremate === totalPages ? 'disabled' : ''}>Próximo</button>`;
//         paginationContainer.innerHTML = paginationHTML;

//         paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
//             btn.addEventListener('click', () => {
//                 currentPageArremate = parseInt(btn.dataset.page);
//                 carregarTabelaArremate(opsParaArrematarGlobal);
//             });
//         });
//     }
// }


// public/js/admin-embalagem-de-produtos.js

// async function carregarTabelaProdutosEmbalagem(arrematesParaEmbalar) { // Nome do parâmetro mudou
//     console.log(`[carregarTabelaProdutosEmbalagem] Renderizando ${arrematesParaEmbalar.length} arremates para embalagem.`);
//     const tbody = document.getElementById('produtosTableBody');
//     const paginationContainer = document.getElementById('paginationContainer');
//     const searchInput = document.getElementById('searchProduto');

//     if (!tbody || !paginationContainer || !searchInput) {
//         console.error('[carregarTabelaProdutosEmbalagem] Elementos DOM não encontrados.');
//         return;
//     }

//     tbody.innerHTML = '';
//     paginationContainer.innerHTML = '';

//     const search = searchInput.value.toLowerCase();
//     let filteredArremates = arrematesParaEmbalar; // Nome da variável mudou
//     if (search) {
//         filteredArremates = arrematesParaEmbalar.filter(arr => // 'arr' de arremate
//             arr.produto.toLowerCase().includes(search) ||
//             (arr.variante && arr.variante.toLowerCase().includes(search)) ||
//             arr.op_numero_origem.toString().includes(search) || // Pode buscar pela OP de origem
//             arr.id_arremate.toString().includes(search) // Pode buscar pelo ID do arremate
//         );
//     }

//     const totalItems = filteredArremates.length;
//     const totalPages = Math.ceil(totalItems / itemsPerPageEmbalagem);
//     if (currentPageEmbalagem > totalPages) currentPageEmbalagem = Math.max(1, totalPages);

//     const startIndex = (currentPageEmbalagem - 1) * itemsPerPageEmbalagem;
//     const endIndex = Math.min(startIndex + itemsPerPageEmbalagem, totalItems);
//     const paginatedArremates = filteredArremates.slice(startIndex, endIndex); // Nome da variável mudou

//     if (paginatedArremates.length === 0) {
//         tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">${search ? 'Nenhum arremate encontrado para "' + search + '".' : 'Nenhum item pronto para embalar.'}</td></tr>`;
//         adjustForMobile();
//         return;
//     }

//     const fragment = document.createDocumentFragment();
//     const produtosCadastrados = await buscarTodosProdutos(); // Para imagens

//     for (const arremateItem of paginatedArremates) { // 'arremateItem'
//         const tr = document.createElement('tr');
//         // Armazenar dados importantes no dataset da linha
//         tr.dataset.idArremate = arremateItem.id_arremate; // ID do Arremate
//         tr.dataset.produto = arremateItem.produto;
//         tr.dataset.variante = arremateItem.variante || '-';
//         tr.dataset.opNumeroOrigem = arremateItem.op_numero_origem;
//         // A quantidade disponível é diretamente do objeto arremateItem
//         tr.dataset.quantidadeDisponivel = arremateItem.quantidade_disponivel_para_embalar;

//         const produtoCadastrado = produtosCadastrados.find(p => p.nome === arremateItem.produto);
//         const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (arremateItem.variante === '-' ? '' : arremateItem.variante));
//         const imagem = gradeItem?.imagem || '';

//         tr.innerHTML = `
//             <td>${arremateItem.produto}</td>
//             <td>${arremateItem.variante || '-'}</td>
//             <td class="col-img"><div class="ep-thumbnail-tabela">${imagem ? `<img src="${imagem}" alt="Miniatura">` : ''}</div></td>
//             <td class="col-qtd">${arremateItem.quantidade_disponivel_para_embalar}</td> 
//             <td>OP Origem: ${arremateItem.op_numero_origem} (Arremate ID: ${arremateItem.id_arremate})</td> 
//         `;
//         // A coluna OP Origem agora pode mostrar mais detalhes

//         if (arremateItem.quantidade_disponivel_para_embalar > 0 && permissoes.includes('lancar-embalagem')) {
//             tr.style.cursor = 'pointer';
//             // Passamos o objeto 'arremateItem' inteiro para handleProductClick
//             tr.addEventListener('click', () => handleProductClick(arremateItem));
//         } else {
//             tr.style.opacity = '0.6';
//             tr.style.cursor = 'not-allowed';
//             tr.title = arremateItem.quantidade_disponivel_para_embalar <= 0 ? 'Quantidade zerada para embalagem' : 'Sem permissão para embalar';
//         }
//         fragment.appendChild(tr);
//     }
//     tbody.appendChild(fragment);

//     if (totalPages > 1) {
//         // Lógica de paginação (existente)
//         let paginationHTML = `<button class="ep-btn pagination-btn prev" data-page="${Math.max(1, currentPageEmbalagem - 1)}" ${currentPageEmbalagem === 1 ? 'disabled' : ''}>Anterior</button>`;
//         paginationHTML += `<span class="pagination-current">Pág. ${currentPageEmbalagem} de ${totalPages}</span>`;
//         paginationHTML += `<button class="ep-btn pagination-btn next" data-page="${Math.min(totalPages, currentPageEmbalagem + 1)}" ${currentPageEmbalagem === totalPages ? 'disabled' : ''}>Próximo</button>`;
//         paginationContainer.innerHTML = paginationHTML;

//         paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
//             btn.addEventListener('click', () => {
//                 currentPageEmbalagem = parseInt(btn.dataset.page);
//                 // Passar a lista correta (arrematesParaEmbalar ou opsProntasParaEmbalarGlobal)
//                 carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal); 
//             });
//         });
//     }
//     adjustForMobile();
// }

async function handleLancarArremateAgregado() {
    // 1. Verificações Iniciais
    // Certifica-se de que há um item agregado em visualização (o card que foi clicado)
    if (!arremateAgregadoEmVisualizacao) {
        mostrarPopupMensagem('Erro: Nenhum produto agregado selecionado para arremate.', 'erro');
        return;
    }

    // 2. Obter Referências dos Elementos DOM
    // IMPORTANTE: Obtenha as referências dos elementos que estão ATUALMENTE na página.
    const selectUsuarioArremateEl = document.getElementById('selectUsuarioArremate');
    const inputQuantidadeArrematarEl = document.getElementById('inputQuantidadeArrematar');
    const btnLancarArremateAgregadoEl = document.getElementById('btnLancarArremateAgregado');

    // 3. Salvar o HTML Original do Botão ANTES DE MODIFICÁ-LO
    // Esta é a chave para restaurar o texto/ícone original após o spinner.
    const originalButtonHtml = btnLancarArremateAgregadoEl.innerHTML;

    // 4. Obter Valores dos Inputs e Validar
    const usuarioTiktik = selectUsuarioArremateEl?.value;
    const quantidadeParaArrematar = parseInt(inputQuantidadeArrematarEl?.value) || 0;
    const totalPendenteAgregado = arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate;

    // Validações básicas (estas são importantes para evitar requisições desnecessárias)
    if (!usuarioTiktik) {
        mostrarPopupMensagem('Selecione o usuário do arremate.', 'aviso');
        selectUsuarioArremateEl?.focus();
        return;
    }
    if (isNaN(quantidadeParaArrematar) || quantidadeParaArrematar <= 0) {
        mostrarPopupMensagem('Insira uma quantidade válida para arrematar.', 'aviso');
        inputQuantidadeArrematarEl?.focus();
        return;
    }
    if (quantidadeParaArrematar > totalPendenteAgregado) {
        mostrarPopupMensagem(`Quantidade excede o total pendente (${totalPendenteAgregado}).`, 'aviso');
        inputQuantidadeArrematarEl.value = totalPendenteAgregado; // Corrige o valor
        inputQuantidadeArrematarEl?.focus();
        return;
    }

    // 5. Desabilitar Controles e Mostrar Spinner
    // Isso evita cliques múltiplos e dá feedback ao usuário.
    btnLancarArremateAgregadoEl.disabled = true;
    btnLancarArremateAgregadoEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lançando...';
    selectUsuarioArremateEl.disabled = true;
    inputQuantidadeArrematarEl.disabled = true;

    // Variáveis para controlar o fluxo de lançamento e erro
    let quantidadeRestanteParaArrematar = quantidadeParaArrematar;
    const lancamentosRealizados = [];
    let erroDuranteLancamento = false; // Flag para indicar se houve um erro no `try`

    try {
        // 6. Lógica de Consumo FIFO (First-In, First-Out) das OPs individuais
        // Ordena as OPs pendentes pelo número (assumindo que número menor = OP mais antiga)
        const opsOrdenadas = arremateAgregadoEmVisualizacao.ops_detalhe
            .filter(op => op.quantidade_pendente_arremate > 0)
            .sort((a, b) => {
                // Tenta converter para int para ordem numérica, se não, compara como string
                const numA = parseInt(a.numero);
                const numB = parseInt(b.numero);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                return a.numero.localeCompare(b.numero);
            });

        // Itera sobre as OPs e lança arremates parciais/totais
        for (const op of opsOrdenadas) {
            if (quantidadeRestanteParaArrematar <= 0) break; // Já arrematou o suficiente

            const qtdPendenteNestaOP = op.quantidade_pendente_arremate;
            const qtdAArrematarDestaOP = Math.min(quantidadeRestanteParaArrematar, qtdPendenteNestaOP);

            if (qtdAArrematarDestaOP > 0) {
                const arremateData = {
                    op_numero: op.numero,
                    op_edit_id: op.edit_id,
                    produto: op.produto,
                    variante: op.variante === '-' ? null : op.variante,
                    quantidade_arrematada: qtdAArrematarDestaOP,
                    usuario_tiktik: usuarioTiktik
                };
                console.log(`[handleLancarArremateAgregado] Lançando ${qtdAArrematarDestaOP} para OP ${op.numero}`);
                const resultadoLancamento = await fetchFromAPI('/arremates', {
                    method: 'POST',
                    body: JSON.stringify(arremateData)
                });
                lancamentosRealizados.push(resultadoLancamento);
                quantidadeRestanteParaArrematar -= qtdAArrematarDestaOP;
            }
        }

        // 7. Feedback de Sucesso ao Usuário
        if (lancamentosRealizados.length > 0) {
            mostrarPopupMensagem(`Arremate de ${quantidadeParaArrematar} unidade(s) de ${arremateAgregadoEmVisualizacao.produto} (${arremateAgregadoEmVisualizacao.variante}) lançado!`, 'sucesso');
        } else {
            mostrarPopupMensagem('Nenhum arremate foi lançado.', 'aviso');
        }
        
        // 8. Atualizar a UI com os Novos Dados
        todosOsArrematesRegistrados = []; // Limpa cache para buscar dados frescos do servidor
        await atualizarListasArremateEEmbalagem(); // Re-fetch e re-renderiza todas as listas principais

        // Verifica se o item agregado ainda tem saldo pendente após o lançamento
        const itemAtualizado = produtosParaArrematarAgregados.find(item => 
            item.produto === arremateAgregadoEmVisualizacao.produto && item.variante === arremateAgregadoEmVisualizacao.variante
        );
        
        if (itemAtualizado && itemAtualizado.total_quantidade_pendente_arremate > 0) {
            // Se ainda houver saldo, recarrega a tela de detalhe com os dados atualizados
            localStorage.setItem('arremateAgregadoAtual', JSON.stringify(itemAtualizado));
            // Chamar sem await para que a função principal possa finalizar o finally rapidamente
            carregarArremateDetalhe(itemAtualizado); 
        } else {
            // Se não houver mais saldo para este produto/variação, volta para a lista principal
            window.location.hash = ''; // Isso irá acionar handleHashChange e limpar o localStorage
            localStorage.removeItem('arremateAgregadoAtual');
        }

    } catch (error) {
        // 9. Tratamento de Erros
        erroDuranteLancamento = true; // Define a flag de erro para o bloco `finally`
        console.error(`[handleLancarArremateAgregado] Erro ao lançar arremate agregado para ${arremateAgregadoEmVisualizacao.produto}:${arremateAgregadoEmVisualizacao.variante}:`, error);

        if (error.status === 403) {
            mostrarPopupMensagem('Você não possui autorização para lançar Arremate.', 'erro');
        } else if (error.status === 409) {
            mostrarPopupMensagem(`Conflito: Um dos arremates pode já ter sido lançado ou dados inconsistentes.`, 'aviso');
        } else if (error.message && error.status !== 401) { // 401 é tratado no `fetchFromAPI`
            mostrarPopupMensagem(`Erro ao lançar arremate: ${error.message}.`, 'erro');
        }

    } finally {
        // 10. Bloco `finally` para Limpeza e Restauração da UI
        // Este bloco é EXECUTADO SEMPRE, independentemente de haver sucesso (`try`) ou erro (`catch`).
        
        if (erroDuranteLancamento) {
            // Se houve um erro:
            // Restaura COMPLETAMENTE os elementos ao seu estado inicial (habilitados e com texto original)
            if (btnLancarArremateAgregadoEl) {
                btnLancarArremateAgregadoEl.disabled = false; // Reabilita o botão
                btnLancarArremateAgregadoEl.innerHTML = originalButtonHtml; // Restaura o texto/ícone original
            }
            if (selectUsuarioArremateEl) selectUsuarioArremateEl.disabled = false;
            if (inputQuantidadeArrematarEl) inputQuantidadeArrematarEl.disabled = false;
        } else {
            // Se a operação foi um SUCESSO:
            // Simplesmente restaura o texto/ícone original do botão (remove o spinner).
            // A reabilitação correta e a reconfiguração dos inputs/selects
            // serão feitas pela chamada de `carregarArremateDetalhe(itemAtualizado)`
            // ou pela navegação (`window.location.hash = ''`),
            // que por sua vez chama `atualizarListasArremateEEmbalagem` e re-renderiza tudo.
            // Isso evita que o spinner fique visível por um tempo desnecessário.
            if (btnLancarArremateAgregadoEl) {
                btnLancarArremateAgregadoEl.innerHTML = originalButtonHtml;
                // Não precisa mexer no `disabled` aqui; `carregarArremateDetalhe` vai cuidar disso.
            }
        }
    }
}

// --- Lógica de Eventos (AJUSTADA) ---

// async function handleLancarArremateClick(event) {
//     const btn = event.target.closest('.botao-lancar-arremate');
//     if (!btn) return;
//     const opCard = btn.closest('.ep-op-arremate-card'); // Mudou para opCard
//     if (!opCard) return;

//     const opNumero = opCard.dataset.opNumero; // Agora vem do dataset do card
//     const opEditId = opCard.dataset.opEditId;
//     const produto = opCard.dataset.produto;
//     const variante = opCard.dataset.variante;

//     const selectUser = opCard.querySelector('.select-usuario-tiktik');
//     const usuarioTiktik = selectUser?.value;
//     const inputQuantidadeArremate = opCard.querySelector('.input-quantidade-arremate');
    
//     if (!inputQuantidadeArremate) {
//         mostrarPopupMensagem('Erro: Campo de quantidade não encontrado.', 'erro');
//         return;
//     }

//     const quantidadeParaArrematar = parseInt(inputQuantidadeArremate.value);
//     const quantidadePendenteMax = parseInt(inputQuantidadeArremate.max);

//     if (!opNumero || !produto) {
//         mostrarPopupMensagem('Erro: Dados da OP não encontrados.', 'erro'); return;
//     }
//     if (!usuarioTiktik) {
//         mostrarPopupMensagem('Selecione o usuário do arremate.', 'aviso');
//         selectUser?.focus(); return;
//     }
//     if (isNaN(quantidadeParaArrematar) || quantidadeParaArrematar <= 0) {
//         mostrarPopupMensagem('Insira uma quantidade válida para arrematar.', 'aviso');
//         inputQuantidadeArremate.focus(); return;
//     }
//     if (quantidadeParaArrematar > quantidadePendenteMax) {
//         mostrarPopupMensagem(`Quantidade excede o pendente (${quantidadePendenteMax}).`, 'aviso');
//         inputQuantidadeArremate.value = quantidadePendenteMax;
//         inputQuantidadeArremate.focus(); return;
//     }

//     const lockKey = `${opNumero}-${usuarioTiktik}-${quantidadeParaArrematar}-${Date.now()}`;
//     if (lancamentosArremateEmAndamento.has(lockKey)) return;

//     btn.disabled = true;
//     const originalButtonText = btn.textContent;
//     btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lançando...';
//     if (selectUser) selectUser.disabled = true;
//     if (inputQuantidadeArremate) inputQuantidadeArremate.disabled = true; // Use if para garantir que existe
//     lancamentosArremateEmAndamento.add(lockKey);

//     try {
//         const arremateData = {
//             op_numero: opNumero,
//             op_edit_id: opEditId,
//             produto: produto,
//             variante: variante === '-' ? null : variante,
//             quantidade_arrematada: quantidadeParaArrematar,
//             usuario_tiktik: usuarioTiktik
//         };
//         const resultado = await fetchFromAPI('/arremates', {
//             method: 'POST',
//             body: JSON.stringify(arremateData)
//         });
//         console.log('[handleLancarArremateClick] Arremate salvo:', resultado);
//         mostrarPopupMensagem(`Arremate de ${quantidadeParaArrematar} unidade(s) para OP ${opNumero} lançado!`, 'sucesso');
        
//         // Re-renderizar o detalhe do arremate para refletir a mudança
//         todosOsArrematesRegistrados = []; // Limpa cache para buscar frescos
//         const arremateAgregadoAtual = JSON.parse(localStorage.getItem('arremateAgregadoAtual') || '{}');
//         if (arremateAgregadoAtual && arremateAgregadoAtual.produto) {
//             // Para atualizar o arremateDetailView, precisamos recriar o aggregatedItem
//             // Isso é feito chamando a atualização de listas global e depois re-navegando se necessário
//             await atualizarListasArremateEEmbalagem(); // Recarrega TODOS os dados globais

//             // Após a atualização, precisamos encontrar o item agregado atualizado
//             const itemAtualizado = produtosParaArrematarAgregados.find(item => 
//                 item.produto === arremateAgregadoAtual.produto && item.variante === arremateAgregadoAtual.variante
//             );
            
//             if (itemAtualizado && window.location.hash === '#arremate-detalhe') {
//                 // Atualiza o localStorage e recarrega a tela de detalhes se o item ainda existir
//                 localStorage.setItem('arremateAgregadoAtual', JSON.stringify(itemAtualizado));
//                 await carregarArremateDetalhe(itemAtualizado);
//             } else {
//                 // Se o item não tiver mais OPs pendentes, volta para a lista principal
//                 window.location.hash = ''; // Isso vai acionar handleHashChange
//                 localStorage.removeItem('arremateAgregadoAtual');
//             }
//         } else {
//             // Se não há dados agregados no localStorage, apenas volte para a lista principal
//             window.location.hash = '';
//             localStorage.removeItem('arremateAgregadoAtual');
//         }


//     } catch (error) {
//         console.error(`[handleLancarArremateClick] Erro ao lançar arremate para OP ${opNumero}:`, error);

//         if (error.status === 403) {
//             mostrarPopupMensagem('Você não possui autorização para lançar Arremate.', 'erro');
//         } else if (error.status === 409) {
//             mostrarPopupMensagem(`Este arremate específico pode já ter sido lançado. Verifique os registros.`, 'aviso');
//         } else if (error.message && error.status !== 401) {
//             mostrarPopupMensagem(`Erro ao lançar arremate: ${error.message}.`, 'erro');
//         }

//         // Reabilita o botão e inputs em caso de erro
//         if (opCard.contains(btn)) {
//             btn.disabled = false;
//             btn.innerHTML = originalButtonText; // Restaura o texto/ícone original
//         }
//         if (opCard.contains(selectUser)) selectUser.disabled = false;
//         if (opCard.contains(inputQuantidadeArremate)) inputQuantidadeArremate.disabled = false;

//     } finally {
//         lancamentosArremateEmAndamento.delete(lockKey);
//     }
// }


async function handleProductClick(agregado) { // Parâmetro agora é o objeto agregado
    console.log(`[handleProductClick] Clicado em Produto Agregado para Embalagem:`, agregado);

    const arremateView = document.getElementById('arremateView');
    const embalagemListView = document.getElementById('embalagemListView');
    const embalarView = document.getElementById('embalarView');
    const arremateDetailView = document.getElementById('arremateDetailView');

    // A quantidade disponível para esta sessão de embalagem é o total_quantidade_disponivel_para_embalar do agregado
    const quantidadeDisponivelReal = agregado.total_quantidade_disponivel_para_embalar;

    if (quantidadeDisponivelReal <= 0) {
        mostrarPopupMensagem('Este item não possui mais quantidade para embalagem.', 'aviso');
        // A lista já deve estar atualizada, mas uma recarga não faria mal se houvesse concorrência
        // await atualizarListasArremateEEmbalagem(); // Considerar se necessário
        return;
    }

    if (arremateView && embalagemListView && embalarView && arremateDetailView) {
        arremateView.classList.add('hidden');
        embalagemListView.classList.add('hidden');
        embalarView.classList.remove('hidden');
        arremateDetailView.classList.add('hidden'); // Certifica que a tela de detalhe de arremate está escondida
        window.location.hash = '#embalar'; // Navega para a view de embalagem

        embalagemAgregadoEmVisualizacao = agregado; // Armazena o objeto agregado globalmente

        // Armazenar dados importantes para a tela de embalagem no localStorage
        // O `id_arremate` individual não é mais necessário aqui, mas o `produto`, `variante` e `quantidade` agregada sim.
        localStorage.setItem('embalagemAtual', JSON.stringify({
            produto: agregado.produto,
            variante: agregado.variante || '-',
            quantidade: quantidadeDisponivelReal, // Total agregado disponível
            //arremates_origem: agregado.arremates_detalhe // Podemos passar os arremates individuais aqui, mas a carregarEmbalagem buscará do global
        }));

        // Chama carregarEmbalagem com os dados agregados
        await carregarEmbalagem(
            agregado.produto, 
            agregado.variante || '-', 
            quantidadeDisponivelReal // Passa a quantidade total disponível deste agregado
        );
    } else {
        console.error('[handleProductClick] Uma ou mais views não encontradas.');
    }
}


async function atualizarListasArremateEEmbalagem() {
    try {
        // Re-busque tudo para garantir dados frescos após qualquer operação
        const [opsFinalizadasOriginais, todosOsArrematesDoSistema] = await Promise.all([
            buscarOpsFinalizadas(),
            buscarArrematesRegistrados()
        ]);

        // --- 1. Calcular opsParaArrematarGlobal (Lista de OPs INDIVIDUAIS com saldo) ---
        opsParaArrematarGlobal = []; // Resetando a lista de OPs individuais pendentes
        for (const op of opsFinalizadasOriginais) {
            const quantidadeProduzidaOriginal = obterQuantidadeFinalProduzida(op);
            let totalJaArrematadoParaEstaOP = 0;
            todosOsArrematesDoSistema
                .filter(arremate => arremate.op_numero === op.numero)
                .forEach(arremate => {
                    totalJaArrematadoParaEstaOP += parseInt(arremate.quantidade_arrematada) || 0;
                });
            const quantidadePendenteDeArremate = quantidadeProduzidaOriginal - totalJaArrematadoParaEstaOP;
            if (quantidadePendenteDeArremate > 0) {
                opsParaArrematarGlobal.push({
                    ...op,
                    quantidade_produzida_original: quantidadeProduzidaOriginal,
                    quantidade_pendente_arremate: quantidadePendenteDeArremate,
                });
            }
        }
        console.log(`[atualizarListasArremateEEmbalagem] OPs individuais pendentes de arremate: ${opsParaArrematarGlobal.length}`);


        // --- 2. AGREGAR OPs INDIVIDUAIS em produtosParaArrematarAgregados ---
        const aggregatedMap = new Map(); // Mapa para agrupar por "produto|variante"

        opsParaArrematarGlobal.forEach(op => {
            const produtoKey = `${op.produto}|${op.variante || '-'}`;
            if (!aggregatedMap.has(produtoKey)) {
                aggregatedMap.set(produtoKey, {
                    produto: op.produto,
                    variante: op.variante || '-',
                    total_quantidade_pendente_arremate: 0,
                    ops_detalhe: [] // Array para guardar as OPs individuais
                });
            }
            const aggregatedItem = aggregatedMap.get(produtoKey);
            aggregatedItem.total_quantidade_pendente_arremate += op.quantidade_pendente_arremate;
            aggregatedItem.ops_detalhe.push(op); // Adiciona a OP completa ao detalhe
        });

        // Converter o mapa para um array global
        produtosParaArrematarAgregados = Array.from(aggregatedMap.values());
        console.log(`[atualizarListasArremateEEmbalagem] Produtos agregados para arremate: ${produtosParaArrematarAgregados.length}`);


        // --- 3. Calcular opsProntasParaEmbalarGlobal (Lista de ARREMATES INDIVIDUAIS com saldo) ---
        // Este passo já está correto e deve ser mantido.
        opsProntasParaEmbalarGlobal = [];
        for (const arremate of todosOsArrematesDoSistema) {
            const quantidadeTotalNesteArremate = parseInt(arremate.quantidade_arrematada) || 0;
            const quantidadeJaEmbaladaNesteArremate = parseInt(arremate.quantidade_ja_embalada) || 0;
            const saldoParaEmbalarNesteArremate = quantidadeTotalNesteArremate - quantidadeJaEmbaladaNesteArremate;

            if (saldoParaEmbalarNesteArremate > 0) {
                opsProntasParaEmbalarGlobal.push({ // Renomeei para 'arrematesDisponiveisParaEmbalar' internamente, mas a variável global é 'opsProntasParaEmbalarGlobal'
                    id_arremate: arremate.id,
                    op_numero_origem: arremate.op_numero,
                    op_edit_id_origem: arremate.op_edit_id,
                    produto: arremate.produto,
                    variante: arremate.variante,
                    quantidade_disponivel_para_embalar: saldoParaEmbalarNesteArremate,
                    quantidade_total_do_arremate: quantidadeTotalNesteArremate,
                    quantidade_ja_embalada_deste_arremate: quantidadeJaEmbaladaNesteArremate
                });
            }
        }
        console.log(`[atualizarListasArremateEEmbalagem] Arremates individuais prontos para embalar: ${opsProntasParaEmbalarGlobal.length}`);


        // --- 4. AGREGAR ARREMATES INDIVIDUAIS em produtosProntosParaEmbalarAgregados ---
        const aggregatedEmbalagemMap = new Map();

        opsProntasParaEmbalarGlobal.forEach(arremate => {
            const produtoKey = `${arremate.produto}|${arremate.variante || '-'}`;
            if (!aggregatedEmbalagemMap.has(produtoKey)) {
                aggregatedEmbalagemMap.set(produtoKey, {
                    produto: arremate.produto,
                    variante: arremate.variante || '-',
                    total_quantidade_disponivel_para_embalar: 0,
                    arremates_detalhe: [] // Array para guardar os objetos de arremate individuais
                });
            }
            const aggregatedItem = aggregatedEmbalagemMap.get(produtoKey);
            aggregatedItem.total_quantidade_disponivel_para_embalar += arremate.quantidade_disponivel_para_embalar;
            aggregatedItem.arremates_detalhe.push(arremate); // Adiciona o arremate completo ao detalhe
        });

        produtosProntosParaEmbalarAgregados = Array.from(aggregatedEmbalagemMap.values());
        console.log(`[atualizarListasArremateEEmbalagem] Produtos agregados para embalar: ${produtosProntosParaEmbalarAgregados.length}`);


        // --- Renderizar as novas views ---
        // Paginação para Arremate (cards agregados de arremate)
        const totalPagesArremateAggregated = Math.ceil(produtosParaArrematarAgregados.length / itemsPerPageArremate);
        currentPageArremate = Math.min(currentPageArremate, Math.max(1, totalPagesArremateAggregated));
        await carregarCardsArremate(produtosParaArrematarAgregados);

        // Paginação para Embalagem (cards agregados de embalagem)
        const totalPagesEmbalagemAggregated = Math.ceil(produtosProntosParaEmbalarAgregados.length / itemsPerPageEmbalagem);
        currentPageEmbalagem = Math.min(currentPageEmbalagem, Math.max(1, totalPagesEmbalagemAggregated));
        // AGORA CHAMA A NOVA FUNÇÃO PARA CARREGAR OS CARDS AGREGADOS DE EMBALAGEM
        await carregarCardsEmbalagem(produtosProntosParaEmbalarAgregados);


        // --- Controle de visibilidade das seções (NÃO MUDOU AQUI) ---
        const arremateView = document.getElementById('arremateView');
        const embalagemListView = document.getElementById('embalagemListView');
        const embalarView = document.getElementById('embalarView');
        const arremateDetailView = document.getElementById('arremateDetailView'); // NOVO ELEMENTO

        if (!arremateView || !embalagemListView || !embalarView || !arremateDetailView) {
            console.error("[atualizarListasArremateEEmbalagem] Views não encontradas."); return;
        }

        // ... (Lógica de visibilidade baseada no hash - MANTIDA) ...
        if (window.location.hash === '#embalar') {
            arremateView.classList.add('hidden');
            embalagemListView.classList.add('hidden');
            embalarView.classList.remove('hidden');
            arremateDetailView.classList.add('hidden');
            // carregarEmbalagem será chamada via handleHashChange
        } else if (window.location.hash === '#arremate-detalhe') {
            arremateView.classList.add('hidden');
            embalagemListView.classList.add('hidden');
            embalarView.classList.add('hidden');
            arremateDetailView.classList.remove('hidden');
            // carregarArremateDetalhe será chamada via handleHashChange
        } else {
            embalarView.classList.add('hidden');
            arremateDetailView.classList.add('hidden');
            arremateView.classList.remove('hidden');
            embalagemListView.classList.remove('hidden');
        }

    } catch (error) {
        console.error('[atualizarListasArremateEEmbalagem] Erro geral:', error);
        mostrarPopupMensagem('Erro ao atualizar dados da página de embalagem.', 'erro');
    }
}

async function carregarCardsEmbalagem(agregadosParaEmbalar) {
    console.log(`[carregarCardsEmbalagem] Renderizando ${agregadosParaEmbalar.length} produtos agregados para embalagem.`);
    const cardContainer = document.getElementById('productCardContainer');
    const paginationContainer = document.getElementById('paginationContainer');
    const searchInput = document.getElementById('searchProduto');

    if (!cardContainer || !paginationContainer || !searchInput) {
        console.error('[carregarCardsEmbalagem] Elementos DOM não encontrados.');
        return;
    }

    cardContainer.innerHTML = '';
    paginationContainer.innerHTML = '';

    const search = searchInput.value.toLowerCase();
    let filteredAggregated = agregadosParaEmbalar;
    if (search) {
        filteredAggregated = agregadosParaEmbalar.filter(item =>
            item.produto.toLowerCase().includes(search) ||
            (item.variante && item.variante.toLowerCase().includes(search))
            // Não buscamos por OP ou ID de arremate aqui, pois estamos agregando.
        );
    }

    const totalItems = filteredAggregated.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageEmbalagem);
    if (currentPageEmbalagem > totalPages) currentPageEmbalagem = Math.max(1, totalPages);

    const startIndex = (currentPageEmbalagem - 1) * itemsPerPageEmbalagem;
    const endIndex = Math.min(startIndex + itemsPerPageEmbalagem, totalItems);
    const paginatedAggregated = filteredAggregated.slice(startIndex, endIndex);

    if (paginatedAggregated.length === 0) {
        cardContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: var(--cor-cinza-texto-secundario);">
            ${search ? 'Nenhum produto encontrado para "' + search + '".' : 'Nenhum item pronto para embalar.'}
        </p>`;
        paginationContainer.classList.add('hidden'); // Esconde paginação se não há itens
        return;
    }
    paginationContainer.classList.remove('hidden'); // Mostra paginação se há itens


    const fragment = document.createDocumentFragment();
    const produtosCadastrados = await buscarTodosProdutos(); // Para imagens

    paginatedAggregated.forEach(item => {
        const card = document.createElement('div');
        card.className = 'ep-product-card';
        // Armazenar o objeto agregado completo no dataset
        card.dataset.embalagemAgregada = JSON.stringify(item);

        const produtoCadastrado = produtosCadastrados.find(p => p.nome === item.produto);
        const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (item.variante === '-' ? '' : item.variante));
        const imagem = gradeItem?.imagem || '';

        const temPermissaoEmbalar = permissoes.includes('lancar-embalagem');
        const quantidadeDisponivel = item.total_quantidade_disponivel_para_embalar;

        if (quantidadeDisponivel <= 0 || !temPermissaoEmbalar) {
            card.classList.add('disabled');
            card.title = quantidadeDisponivel <= 0 ? 'Quantidade zerada para embalagem' : 'Sem permissão para embalar';
        } else {
            // Ao clicar, passamos o item agregado completo para handleProductClick
            card.addEventListener('click', () => handleProductClick(item));
        }

        card.innerHTML = `
            <div class="ep-product-card-header">
                <div class="ep-thumbnail-card">${imagem ? `<img src="${imagem}" alt="Miniatura">` : ''}</div>
                <div class="ep-product-card-info">
                    <div class="product-name">${item.produto}</div>
                    <div class="product-variant">${item.variante !== '-' ? item.variante : 'Padrão'}</div>
                    <!-- REMOVIDO: OP Origem, pois não é relevante na agregação -->
                </div>
            </div>
            <div class="ep-product-card-qty">Disponível: ${quantidadeDisponivel}</div>
        `;
        fragment.appendChild(card);
    });
    cardContainer.appendChild(fragment);

    if (totalPages > 1) {
        let paginationHTML = `<button class="ep-btn pagination-btn prev" data-page="${Math.max(1, currentPageEmbalagem - 1)}" ${currentPageEmbalagem === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageEmbalagem} de ${totalPages}</span>`;
        paginationHTML += `<button class="ep-btn pagination-btn next" data-page="${Math.min(totalPages, currentPageEmbalagem + 1)}" ${currentPageEmbalagem === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainer.innerHTML = paginationHTML;

        paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageEmbalagem = parseInt(btn.dataset.page);
                carregarCardsEmbalagem(produtosProntosParaEmbalarAgregados); // Recarrega os cards agregados
            });
        });
    }
}



async function carregarCardsArremate(agregadosParaArremate) {
    const cardContainer = document.getElementById('arremateCardContainer');
    const paginationContainer = document.getElementById('arrematePaginationContainer');
    if (!cardContainer || !paginationContainer) {
        console.error('[carregarCardsArremate] Elementos cardContainer ou paginationContainer (arremate) não encontrados.');
        return;
    }

    cardContainer.innerHTML = '';
    paginationContainer.innerHTML = '';

    if (agregadosParaArremate.length === 0) {
        cardContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: var(--cor-cinza-texto-secundario);">Nenhum produto aguardando arremate.</p>`;
        paginationContainer.classList.add('hidden'); // Esconde paginação se não há itens
        return;
    }
    paginationContainer.classList.remove('hidden');

    const totalItems = agregadosParaArremate.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageArremate);
    const startIndex = (currentPageArremate - 1) * itemsPerPageArremate;
    const endIndex = Math.min(startIndex + itemsPerPageArremate, totalItems);
    const paginatedAggregated = agregadosParaArremate.slice(startIndex, endIndex);

    const produtosCadastrados = await buscarTodosProdutos(); // Para imagens

    const fragment = document.createDocumentFragment();
    paginatedAggregated.forEach(item => {
        const card = document.createElement('div');
        card.className = 'ep-arremate-card';
        // Armazene o objeto agregado completo no dataset ou globalmente
        // Usaremos JSON.stringify para armazenar, e JSON.parse para recuperar
        card.dataset.arremateAgregado = JSON.stringify(item);

        const produtoCadastrado = produtosCadastrados.find(p => p.nome === item.produto);
        const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (item.variante === '-' ? '' : item.variante));
        const imagem = gradeItem?.imagem || '';

        card.innerHTML = `
            <div class="ep-arremate-card-header">
                <div class="ep-thumbnail-card">${imagem ? `<img src="${imagem}" alt="Miniatura">` : ''}</div>
                <div class="ep-arremate-card-info">
                    <div class="product-name">${item.produto}</div>
                    <div class="product-variant">${item.variante !== '-' ? item.variante : 'Padrão'}</div>
                </div>
            </div>
            <div class="ep-arremate-card-qty">Pendente: <strong>${item.total_quantidade_pendente_arremate}</strong></div>
        `;
        
        // O card estará habilitado se houver quantidade pendente e permissão
        const temPermissaoParaArremate = permissoes.includes('lancar-arremate');
        if (item.total_quantidade_pendente_arremate > 0 && temPermissaoParaArremate) {
            card.addEventListener('click', () => handleArremateCardClick(item));
        } else {
            card.classList.add('disabled');
            card.title = item.total_quantidade_pendente_arremate <= 0 ? 'Quantidade zerada para arremate' : 'Sem permissão para lançar arremate';
        }

        fragment.appendChild(card);
    });
    cardContainer.appendChild(fragment);

    if (totalPages > 1) {
        let paginationHTML = `<button class="ep-btn pagination-btn prev" data-page="${Math.max(1, currentPageArremate - 1)}" ${currentPageArremate === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageArremate} de ${totalPages}</span>`;
        paginationHTML += `<button class="ep-btn pagination-btn next" data-page="${Math.min(totalPages, currentPageArremate + 1)}" ${currentPageArremate === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainer.innerHTML = paginationHTML;

        paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageArremate = parseInt(btn.dataset.page);
                carregarCardsArremate(produtosParaArrematarAgregados); // Recarrega os cards
            });
        });
    }
}

async function handleArremateCardClick(agregado) {
    console.log('[handleArremateCardClick] Clicado em Arremate Agregado:', agregado);

    const arremateView = document.getElementById('arremateView');
    const embalagemListView = document.getElementById('embalagemListView');
    const embalarView = document.getElementById('embalarView');
    const arremateDetailView = document.getElementById('arremateDetailView'); // NOVO ELEMENTO

    if (!arremateView || !embalagemListView || !embalarView || !arremateDetailView) {
        console.error('[handleArremateCardClick] Uma ou mais views não encontradas.');
        return;
    }

    // Esconde as views principais e mostra a de detalhe de arremate
    arremateView.classList.add('hidden');
    embalagemListView.classList.add('hidden');
    embalarView.classList.add('hidden'); // Certifica que a tela de embalar também está escondida
    arremateDetailView.classList.remove('hidden');
    
    // Armazenar os dados do item agregado no localStorage para que a página possa recarregar ou navegar
    localStorage.setItem('arremateAgregadoAtual', JSON.stringify(agregado));
    window.location.hash = '#arremate-detalhe'; // Define o hash para navegação e recarregamento

    // Carregar os detalhes na nova view
    await carregarArremateDetalhe(agregado);
}

async function carregarArremateDetalhe(agregado) {
    console.log('[carregarArremateDetalhe] Carregando detalhes para:', agregado);

    arremateAgregadoEmVisualizacao = agregado; // Armazena o objeto agregado globalmente

    const arremateDetailTitleEl = document.getElementById('arremateDetailTitle');
    const arremateDetailSubTitleEl = document.getElementById('arremateDetailSubTitle');
    const arremateDetailThumbnailEl = document.getElementById('arremateDetailThumbnail');
    const totalQtdPendenteArremateEl = document.getElementById('totalQtdPendenteArremate');
    
    const produtoNomeArremateDetalheEl = document.getElementById('produtoNomeArremateDetalhe');
    const varianteNomeArremateDetalheEl = document.getElementById('varianteNomeArremateDetalhe');
    const qtdPendenteTotalArremateEl = document.getElementById('qtdPendenteTotalArremate');
    
    // --- ATENÇÃO AQUI: PEGUE AS REFERÊNCIAS REAIS DOS ELEMENTOS ---
    // Se você está clonando e substituindo, as referências de const precisarão ser atualizadas
    // no momento em que os elementos são realmente usados após a substituição.
    // É mais seguro obter as referências DOS ELEMENTOS CLONADOS se você for substituí-los.
    // No entanto, para este caso, o cloneNode(true) só está sendo feito para "limpar" listeners.
    // Se você não for CLONAR E SUBSTITUIR O BOTÃO, NÃO PRECISA DA LÓGICA DE CLONE ABAIXO PARA ELE.
    // Pelo que entendi, você está clonando o SELECT e o INPUT.

    // Pegue as referências que VÃO SER CLONADAS/SUBSTITUÍDAS PRIMEIRO
    let selectUsuarioArremateEl = document.getElementById('selectUsuarioArremate');
    let inputQuantidadeArrematarEl = document.getElementById('inputQuantidadeArrematar');
    const btnLancarArremateAgregadoEl = document.getElementById('btnLancarArremateAgregado');


    if (!arremateDetailTitleEl || !selectUsuarioArremateEl || !inputQuantidadeArrematarEl || !btnLancarArremateAgregadoEl) {
        console.error('[carregarArremateDetalhe] Um ou mais elementos DOM do detalhe de arremate não foram encontrados.');
        mostrarPopupMensagem('Erro ao carregar detalhes do arremate.', 'erro');
        return;
    }

    // Preenche informações do cabeçalho
    arremateDetailTitleEl.textContent = `Arrematar: ${agregado.produto}`;
    arremateDetailSubTitleEl.textContent = agregado.variante !== '-' ? `Variação: ${agregado.variante}` : 'Variação: Padrão';
    totalQtdPendenteArremateEl.textContent = agregado.total_quantidade_pendente_arremate;
    
    // Preenche informações no card do formulário
    produtoNomeArremateDetalheEl.textContent = agregado.produto;
    varianteNomeArremateDetalheEl.textContent = agregado.variante !== '-' ? agregado.variante : 'Padrão';
    qtdPendenteTotalArremateEl.textContent = agregado.total_quantidade_pendente_arremate;


    const produtosCadastrados = await buscarTodosProdutos();
    const produtoCadastrado = produtosCadastrados.find(p => p.nome === agregado.produto);
    const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (agregado.variante === '-' ? '' : agregado.variante));
    const imagem = gradeItem?.imagem || '';
    arremateDetailThumbnailEl.innerHTML = imagem ? `<img src="${imagem}" alt="Imagem ${agregado.produto} ${agregado.variante}">` : 'Sem imagem';

    const usuariosTiktikDisponiveis = await obterUsuariosTiktikParaProduto(agregado.produto);
    const temPermissaoLancar = permissoes.includes('lancar-arremate');
    console.log('[carregarArremateDetalhe] Permissão "lancar-arremate":', temPermissaoLancar);


    // --- Gerenciamento de Listeners e Elementos Dinâmicos ---

    // 1. Preencher e re-adicionar listener para o SELECT de usuários
    const newSelectUsuario = selectUsuarioArremateEl.cloneNode(false); // Clone apenas a tag, não o conteúdo
    newSelectUsuario.id = 'selectUsuarioArremate'; // Garante o ID
    newSelectUsuario.className = 'ep-select'; // Garante a classe

    newSelectUsuario.innerHTML = `<option value="">${usuariosTiktikDisponiveis.length === 0 ? 'Nenhum Tiktik' : 'Selecione...'}</option>`;
    usuariosTiktikDisponiveis.forEach(user => {
        const option = document.createElement('option');
        option.value = user.nome;
        option.textContent = user.nome;
        newSelectUsuario.appendChild(option);
    });
    
    selectUsuarioArremateEl.parentNode.replaceChild(newSelectUsuario, selectUsuarioArremateEl);
    selectUsuarioArremateEl = newSelectUsuario; // ATUALIZA A REFERÊNCIA DA VARIÁVEL


    // 2. Re-adicionar listener para o INPUT de quantidade
    const newQuantidadeInput = inputQuantidadeArrematarEl.cloneNode(true);
    newQuantidadeInput.id = 'inputQuantidadeArrematar';
    newQuantidadeInput.className = 'ep-input ep-input-grande';
    inputQuantidadeArrematarEl.parentNode.replaceChild(newQuantidadeInput, inputQuantidadeArrematarEl);
    inputQuantidadeArrematarEl = newQuantidadeInput; // ATUALIZA A REFERÊNCIA DA VARIÁVEL


    // --- Funções de Validação e Habilitação/Desabilitação ---

    // Esta função será o callback dos listeners e também chamada uma vez
    const updateLancarButtonState = () => {
        // Pega os valores ATUAIS dos elementos (importante após clonagem/substituição)
        const currentQtd = parseInt(inputQuantidadeArrematarEl.value);
        const currentUsuario = selectUsuarioArremateEl.value;

        // Validação da quantidade
        const qtdValida = currentQtd > 0 && currentQtd <= agregado.total_quantidade_pendente_arremate;
        console.log(`[updateLancarButtonState] Quantidade (${currentQtd}) válida: ${qtdValida}`);

        // Validação do usuário
        const usuarioSelecionado = currentUsuario !== "";
        console.log(`[updateLancarButtonState] Usuário selecionado (${currentUsuario}): ${usuarioSelecionado}`);

        // Condições para habilitar o botão
        const shouldEnableButton = qtdValida && usuarioSelecionado && temPermissaoLancar;
        console.log(`[updateLancarButtonState] temPermissaoLancar: ${temPermissaoLancar}`);
        console.log(`[updateLancarButtonState] Habilitar botão? ${shouldEnableButton}`);

        btnLancarArremateAgregadoEl.disabled = !shouldEnableButton;
        // Ajusta a classe para feedback visual se a quantidade estiver acima do max
        if (currentQtd > agregado.total_quantidade_pendente_arremate) {
            inputQuantidadeArrematarEl.classList.add('ep-input-error'); // Adicione uma classe de erro no seu CSS
        } else {
            inputQuantidadeArrematarEl.classList.remove('ep-input-error');
        }
    };
    
    // Configurar input de quantidade e select de usuários
    inputQuantidadeArrematarEl.value = ''; // Limpa o valor
    inputQuantidadeArrematarEl.min = 1;
    inputQuantidadeArrematarEl.max = agregado.total_quantidade_pendente_arremate;
    
    // Desabilitar inicialmente se não houver quantidade ou permissão
    const initiallyDisabled = agregado.total_quantidade_pendente_arremate === 0 || !temPermissaoLancar || usuariosTiktikDisponiveis.length === 0;
    inputQuantidadeArrematarEl.disabled = initiallyDisabled;
    selectUsuarioArremateEl.disabled = initiallyDisabled;
    btnLancarArremateAgregadoEl.disabled = initiallyDisabled; // Define o estado inicial do botão

    if (initiallyDisabled) {
        if (!temPermissaoLancar) {
            btnLancarArremateAgregadoEl.title = 'Sem permissão para lançar arremate.';
        } else if (agregado.total_quantidade_pendente_arremate === 0) {
            btnLancarArremateAgregadoEl.title = 'Nenhuma quantidade pendente para arremate.';
        } else if (usuariosTiktikDisponiveis.length === 0) {
            btnLancarArremateAgregadoEl.title = 'Nenhum usuário Tiktik disponível para este produto.';
        }
    } else {
        btnLancarArremateAgregadoEl.title = 'Lançar Arremate';
    }


    // Adicionar os listeners aos elementos atualizados
    selectUsuarioArremateEl.addEventListener('change', updateLancarButtonState);
    inputQuantidadeArrematarEl.addEventListener('input', updateLancarButtonState);

    // Adicionar listener ao botão Lançar Arremate Agregado
    // Remover o listener antigo para evitar duplicidade
    if (btnLancarArremateAgregadoEl._clickListener) {
        btnLancarArremateAgregadoEl.removeEventListener('click', btnLancarArremateAgregadoEl._clickListener);
    }
    btnLancarArremateAgregadoEl.addEventListener('click', handleLancarArremateAgregado);
    btnLancarArremateAgregadoEl._clickListener = handleLancarArremateAgregado; // Armazena a referência


    updateLancarButtonState(); // Chama para definir o estado inicial do botão
    console.log('[carregarArremateDetalhe] Configuração de listeners e estado inicial do botão concluída.');
}

// --- Funções de Popup, Debounce (sem alteração significativa) ---
function mostrarPopupMensagem(mensagem, tipo = 'erro') {
    console.log(`[POPUP-${tipo.toUpperCase()}]: ${mensagem}`);
    const popupId = `popup-${Date.now()}`; // ID único para cada popup
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `ep-popup-mensagem ep-popup-${tipo}`; // Usar classes do novo CSS
    popup.textContent = mensagem;
    document.body.appendChild(popup);
    setTimeout(() => {
        const activePopup = document.getElementById(popupId);
        if (activePopup) activePopup.remove();
    }, 4000);
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


// --- Funções de Kit (AJUSTADAS PARA NOVOS IDs/CLASSES E LÓGICA) ---
async function temKitsDisponiveis(produto, variante) {
    console.log(`[temKitsDisponiveis] Verificando para Produto: "${produto}", Variante: "${variante}"`); // Log 1
    const produtos = await buscarTodosProdutos();
    if (!produtos || produtos.length === 0) {
        console.warn('[temKitsDisponiveis] Nenhum produto carregado (todosOsProdutos está vazio). Retornando false.');
        return false;
    }

    const kits = produtos.filter(p => p.is_kit === true); // Garanta a comparação com booleano se 'is_kit' for booleano
    console.log(`[temKitsDisponiveis] Encontrados ${kits.length} produtos marcados como is_kit.`); // Log 2

    if (kits.length === 0) return false;

    const produtoLower = produto.toLowerCase();
    const varAtualLower = (variante === '-' ? '' : variante).toLowerCase();
    console.log(`[temKitsDisponiveis] Buscando por produtoLower: "${produtoLower}", varAtualLower: "${varAtualLower}"`); // Log 3

    let encontrado = false;
    for (const kit of kits) {
        // console.log(`[temKitsDisponiveis] Verificando Kit: "${kit.nome}"`); // Log Detalhado (pode gerar muito log)
        if (kit.grade && Array.isArray(kit.grade)) {
            for (const g of kit.grade) {
                // console.log(`[temKitsDisponiveis] Verificando Grade do Kit "${kit.nome}", Variação da Grade: "${g.variacao}"`); // Log Detalhado
                if (g.composicao && Array.isArray(g.composicao)) {
                    for (const c of g.composicao) {
                        const compProdutoNome = (c.produto || kit.nome); // Se c.produto não existir, usa o nome do kit (comum para kits simples)
                        const compProdutoNomeLower = compProdutoNome.toLowerCase();
                        const compVariacao = (c.variacao === '-' ? '' : (c.variacao || ''));
                        const compVariacaoLower = compVariacao.toLowerCase();

                        // console.log(`[temKitsDisponiveis] -- Componente: P: "${compProdutoNomeLower}", V: "${compVariacaoLower}"`); // Log Detalhado

                        if (compProdutoNomeLower === produtoLower && compVariacaoLower === varAtualLower) {
                            console.log(`[temKitsDisponiveis] ENCONTRADO! Kit: "${kit.nome}", Componente: P:"${compProdutoNome}", V:"${compVariacao}"`); // Log 4
                            encontrado = true;
                            break; // Sai do loop de composicao
                        }
                    }
                }
                if (encontrado) break; // Sai do loop de grade
            }
        }
        if (encontrado) break; // Sai do loop de kits
    }
    console.log(`[temKitsDisponiveis] Resultado final para "${produto}"/"${variante}": ${encontrado}`); // Log 5
    return encontrado;
}

async function carregarKitsDisponiveis(produtoBase, varianteBase) {
    const produtos = await buscarTodosProdutos();
    const kitsListEl = document.getElementById('kits-list'); // Novo ID do HTML
    if (!kitsListEl) return;
    kitsListEl.innerHTML = '';

    const varBaseLower = (varianteBase === '-' ? '' : varianteBase).toLowerCase();
    const kitsFiltrados = produtos.filter(kit =>
        kit.is_kit && kit.grade?.some(g =>
            g.composicao?.some(item =>
                (item.produto || kit.nome).toLowerCase() === produtoBase.toLowerCase() &&
                (item.variacao === '-' ? '' : (item.variacao || '')).toLowerCase() === varBaseLower
            )
        )
    );

    if (kitsFiltrados.length === 0) {
        kitsListEl.innerHTML = '<p>Nenhum kit cadastrado utiliza este item base.</p>';
        document.getElementById('kit-variacao-composicao-wrapper')?.classList.add('hidden'); // Esconde o resto
        return;
    }
    document.getElementById('kit-variacao-composicao-wrapper')?.classList.remove('hidden'); // Mostra

    kitsFiltrados.forEach(kit => {
        const button = document.createElement('button');
        button.className = 'ep-btn'; // Classe do novo CSS
        button.textContent = kit.nome;
        button.addEventListener('click', (e) => {
            document.querySelectorAll('#kits-list button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            carregarVariacoesKit(kit.nome, produtoBase, varianteBase);
        });
        kitsListEl.appendChild(button);
    });
    if (kitsListEl.children.length > 0) kitsListEl.children[0].click();
}

async function carregarVariacoesKit(nomeKit, produtoBase, varianteBase) {
    const produtos = await buscarTodosProdutos();
    const kitVariacoesSelect = document.getElementById('kit-variacoes'); 
    const kitTableContainer = document.getElementById('kit-table-container'); 
    const kitFooter = document.getElementById('kit-footer'); // Ainda pegamos para controlar visibilidade se necessário
    const kitErrorMessage = document.getElementById('kit-error-message'); 

    // Validação básica dos elementos principais do kit
    if (!kitVariacoesSelect || !kitTableContainer || !kitFooter || !kitErrorMessage) {
        console.error("[carregarVariacoesKit] Elementos DOM para seleção de variação do kit não encontrados.");
        return;
    }

    kitVariacoesSelect.innerHTML = '<option value="">Carregando...</option>';
    
    // Apenas controlar a visibilidade, não limpar o conteúdo se ele for estático
    kitTableContainer.classList.add('hidden'); 
    kitFooter.classList.add('hidden'); // Esconde o footer inteiro inicialmente ou quando nenhuma variação é selecionada
    kitErrorMessage.classList.add('hidden');
    // NÃO FAÇA: kitFooter.innerHTML = ''; 

    const kit = produtos.find(p => p.is_kit && p.nome === nomeKit);
    if (!kit || !kit.grade) {
        kitVariacoesSelect.innerHTML = '<option value="">Erro: Kit não encontrado</option>'; 
        // Pode ser útil mostrar uma mensagem de erro no kitErrorMessage aqui também se kit não encontrado
        kitFooter.classList.remove('hidden'); // Mostra o footer para exibir a mensagem de erro
        kitErrorMessage.textContent = 'Kit não encontrado ou não possui grade.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    const varBaseLower = (varianteBase === '-' ? '' : varianteBase).toLowerCase();
    const variacoesFiltradas = kit.grade.filter(g =>
        g.composicao?.some(item =>
            (item.produto || kit.nome).toLowerCase() === produtoBase.toLowerCase() &&
            (item.variacao === '-' ? '' : (item.variacao || '')).toLowerCase() === varBaseLower
        )
    );

    if (variacoesFiltradas.length === 0) {
        kitVariacoesSelect.innerHTML = '<option value="">Nenhuma variação deste kit usa o item base</option>';
        kitFooter.classList.remove('hidden'); // Mostra o footer para exibir a mensagem de erro
        kitErrorMessage.textContent = 'Nenhuma variação do kit selecionado utiliza o produto/variante base.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    // Se chegou aqui, há variações, então o footer pode ser mostrado quando uma variação for selecionada
    // Mas ele ainda está escondido por padrão até uma seleção válida.
    kitVariacoesSelect.innerHTML = '<option value="">Selecione a variação do Kit</option>';
    variacoesFiltradas.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade.variacao;
        option.textContent = grade.variacao || 'Padrão';
        kitVariacoesSelect.appendChild(option);
    });

    // Limpar e adicionar listener
    const newSelect = kitVariacoesSelect.cloneNode(true);
    kitVariacoesSelect.parentNode.replaceChild(newSelect, kitVariacoesSelect);
    newSelect.addEventListener('change', (e) => {
        // Pegar os elementos novamente aqui ou passá-los para garantir o escopo correto
        const currentKitTableContainer = document.getElementById('kit-table-container');
        const currentKitFooter = document.getElementById('kit-footer');
        const currentKitErrorMessage = document.getElementById('kit-error-message');

        if (e.target.value) { // Se uma variação válida do kit foi selecionada
            currentKitTableContainer?.classList.remove('hidden'); // Mostra a tabela de composição
            currentKitFooter?.classList.remove('hidden');         // Mostra o footer
            currentKitErrorMessage?.classList.add('hidden');    // Esconde mensagens de erro antigas
            carregarTabelaKit(nomeKit, e.target.value);
        } else { // "Selecione a variação do Kit" foi escolhido
            currentKitTableContainer?.classList.add('hidden');
            currentKitFooter?.classList.add('hidden'); // Esconde o footer se nenhuma variação selecionada
            // NÃO FAÇA: currentKitFooter.innerHTML = '';
            currentKitErrorMessage?.classList.add('hidden'); // Garante que msg de erro também seja escondida
        }
    });
}

function atualizarEstadoBotaoMontarKit() {
    const inputQtd = document.getElementById('qtd-enviar-kits');
    const btnMontar = document.getElementById('kit-estoque-btn');
    if (!inputQtd || !btnMontar) {
        console.warn("[atualizarEstadoBotaoMontarKit] Input ou botão não encontrado.");
        return;
    }

    const valor = parseInt(inputQtd.value) || 0;
    const maxKits = parseInt(inputQtd.max) || 0; // Pega o max do atributo do input
    
    // Habilita se o valor for > 0, <= maxKits, E o usuário tiver permissão
    btnMontar.disabled = !(valor > 0 && valor <= maxKits && permissoes.includes('montar-kit'));
    console.log(`[atualizarEstadoBotaoMontarKit] Valor: ${valor}, Max: ${maxKits}, Permissão: ${permissoes.includes('montar-kit')}, Botão Desabilitado: ${btnMontar.disabled}`);
}


async function carregarTabelaKit(kitNome, variacaoKitSelecionada) {
    console.log(`[carregarTabelaKit] Carregando tabela para Kit: "${kitNome}", Variação: "${variacaoKitSelecionada}"`);

    // 1. Obter referências aos elementos DOM
    const kitTableBody = document.getElementById('kit-table-body');
    const qtdDisponivelKitsSpan = document.getElementById('qtd-disponivel-kits');
    const qtdEnviarKitsInput = document.getElementById('qtd-enviar-kits');
    const kitEstoqueBtn = document.getElementById('kit-estoque-btn');
    const kitErrorMessage = document.getElementById('kit-error-message');
    const kitTableContainer = document.getElementById('kit-table-container');

    // Validação dos elementos
    if (!kitTableBody || !qtdDisponivelKitsSpan || !qtdEnviarKitsInput || !kitEstoqueBtn || !kitErrorMessage || !kitTableContainer) {
        console.error("[carregarTabelaKit] Elementos DOM cruciais para a tabela de kit não encontrados.");
        if (!kitTableBody) console.error("-> Falta ID: kit-table-body");
        if (!qtdDisponivelKitsSpan) console.error("-> Falta ID: qtd-disponivel-kits");
        if (!qtdEnviarKitsInput) console.error("-> Falta ID: qtd-enviar-kits");
        if (!kitEstoqueBtn) console.error("-> Falta ID: kit-estoque-btn");
        if (!kitErrorMessage) console.error("-> Falta ID: kit-error-message");
        if (!kitTableContainer) console.error("-> Falta ID: kit-table-container");
        return; // Interrompe se elementos essenciais não existem
    }

    // Reset visual inicial
    kitErrorMessage.classList.add('hidden');
    kitErrorMessage.textContent = '';
    kitTableContainer.classList.remove('hidden'); // Garante que o container da tabela é visível
    kitTableBody.innerHTML = `<tr><td colspan="3">Analisando disponibilidade dos componentes...</td></tr>`;
    qtdEnviarKitsInput.disabled = true;
    kitEstoqueBtn.disabled = true;
    qtdDisponivelKitsSpan.textContent = '0'; // Reseta contagem

    // 2. Obter dados do kit e sua composição
    const todosOsProdutosCadastrados = await buscarTodosProdutos(); // Certifique-se que esta função retorna a lista correta
    const kitSelecionado = todosOsProdutosCadastrados.find(p => p.nome === kitNome && p.is_kit === true);

    if (!kitSelecionado || !kitSelecionado.grade) {
        kitErrorMessage.textContent = 'Definição do kit selecionado não encontrada ou inválida.';
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = ''; // Limpa "Analisando..."
        kitTableContainer.classList.add('hidden');
        console.error(`[carregarTabelaKit] Kit "${kitNome}" não encontrado ou sem grade.`, kitSelecionado);
        return;
    }

    const variacaoDoKitObj = kitSelecionado.grade.find(g => g.variacao === variacaoKitSelecionada);
    if (!variacaoDoKitObj || !variacaoDoKitObj.composicao || variacaoDoKitObj.composicao.length === 0) {
        kitErrorMessage.textContent = `A variação "${variacaoKitSelecionada}" do kit "${kitNome}" não possui componentes definidos.`;
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = ''; // Limpa "Analisando..."
        kitTableContainer.classList.add('hidden');
        console.warn(`[carregarTabelaKit] Variação "${variacaoKitSelecionada}" do kit "${kitNome}" sem composição.`);
        return;
    }
    const composicaoDoKit = variacaoDoKitObj.composicao; // Array de componentes do kit
    kitTableBody.innerHTML = ''; // Limpa o "Analisando..." para adicionar as linhas reais

    // 3. Calcular disponibilidade dos componentes e quantos kits são montáveis
    let menorQuantidadeKitsMontaveis = Infinity;
    let todosComponentesDisponiveisParaUmKit = true;

    console.log(`[carregarTabelaKit] Composição para "${kitNome} - ${variacaoKitSelecionada}":`, JSON.stringify(composicaoDoKit, null, 2));

    for (const itemComponente of composicaoDoKit) {
        const nomeProdutoComponente = itemComponente.produto; // Ex: "Scrunchie (Padrão)"
        const varianteComponente = itemComponente.variacao || '-'; // Ex: "Preto"
        const quantidadeNecessariaPorKit = parseInt(itemComponente.quantidade) || 1;

        if (!nomeProdutoComponente) {
            console.warn("[carregarTabelaKit] Componente na composição do kit sem nome de produto:", itemComponente);
            // Adicionar uma linha indicando o problema, mas não quebrar tudo
            const trError = document.createElement('tr');
            trError.classList.add('item-insuficiente');
            trError.innerHTML = `<td colspan="3">Erro: Componente mal definido no cadastro do kit.</td>`;
            kitTableBody.appendChild(trError);
            todosComponentesDisponiveisParaUmKit = false; // Impede a montagem
            menorQuantidadeKitsMontaveis = 0;
            continue; // Pula para o próximo componente
        }
        
        let qtdDisponivelTotalComponente = 0;
        console.log(`[carregarTabelaKit] Verificando componente: ${nomeProdutoComponente} (${varianteComponente}), Necessário/kit: ${quantidadeNecessariaPorKit}`);

        // Todos os componentes vêm da soma dos arremates com saldo
        opsProntasParaEmbalarGlobal // Esta é a lista de arremates com saldo
            .filter(arr => arr.produto === nomeProdutoComponente && (arr.variante || '-') === varianteComponente)
            .forEach(arr => {
                qtdDisponivelTotalComponente += arr.quantidade_disponivel_para_embalar;
            });
        
        console.log(`[carregarTabelaKit] -> Disponibilidade total do componente (soma de arremates): ${qtdDisponivelTotalComponente}`);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${nomeProdutoComponente} ${varianteComponente !== '-' ? `(${varianteComponente})` : ''}</td>
            <td style="text-align:center;">${quantidadeNecessariaPorKit}</td>
            <td style="text-align:center;">
                <input type="number" class="ep-input readonly" value="${qtdDisponivelTotalComponente}" readonly title="Disponível: ${qtdDisponivelTotalComponente}">
            </td>
        `;
        
        if (qtdDisponivelTotalComponente < quantidadeNecessariaPorKit) {
            tr.classList.add('item-insuficiente');
            todosComponentesDisponiveisParaUmKit = false; 
        }
        kitTableBody.appendChild(tr);

        if (quantidadeNecessariaPorKit > 0) {
            menorQuantidadeKitsMontaveis = Math.min(menorQuantidadeKitsMontaveis, Math.floor(qtdDisponivelTotalComponente / quantidadeNecessariaPorKit));
        } else { // Se um componente tem necessidade 0, algo está errado na definição do kit
            console.warn(`[carregarTabelaKit] Componente ${nomeProdutoComponente} tem quantidade necessária 0 no kit ${kitNome}.`);
            menorQuantidadeKitsMontaveis = 0; 
        }
    }

    const maxKitsMontaveisCalculado = todosComponentesDisponiveisParaUmKit ? menorQuantidadeKitsMontaveis : 0;
    const maxKitsMontaveisFinal = (maxKitsMontaveisCalculado === Infinity || composicaoDoKit.length === 0) ? 0 : maxKitsMontaveisCalculado;

    qtdDisponivelKitsSpan.textContent = maxKitsMontaveisFinal;
    console.log(`[carregarTabelaKit] Máximo de kits "${kitNome} - ${variacaoKitSelecionada}" montáveis: ${maxKitsMontaveisFinal}`);

    if (maxKitsMontaveisFinal <= 0 && composicaoDoKit.length > 0) {
        kitErrorMessage.textContent = 'Quantidade insuficiente de um ou mais componentes para montar este kit.';
        kitErrorMessage.classList.remove('hidden');
    }

    // 4. Configurar o input de quantidade de kits e o botão
    qtdEnviarKitsInput.value = maxKitsMontaveisFinal > 0 ? "1" : "0";
    qtdEnviarKitsInput.max = maxKitsMontaveisFinal;
    qtdEnviarKitsInput.disabled = maxKitsMontaveisFinal <= 0;

    // --- GERENCIAMENTO DOS EVENT LISTENERS ---
    // Remover listener antigo do input, se existir
    if (qtdEnviarKitsInput._inputListener) {
        qtdEnviarKitsInput.removeEventListener('input', qtdEnviarKitsInput._inputListener);
    }
    // Criar o novo handler para o input
    const handleQtdInputChange = () => {
        let valor = parseInt(qtdEnviarKitsInput.value) || 0;
        const maxKitsDoInput = parseInt(qtdEnviarKitsInput.max) || 0;
        
        if (valor < 0) valor = 0;
        else if (valor > maxKitsDoInput) valor = maxKitsDoInput;
        qtdEnviarKitsInput.value = valor; // Atualiza o valor do input se foi corrigido
        
        atualizarEstadoBotaoMontarKit(); 
    };
    // Adicionar o novo listener e armazenar sua referência
    qtdEnviarKitsInput.addEventListener('input', handleQtdInputChange);
    qtdEnviarKitsInput._inputListener = handleQtdInputChange;

    // Remover listener antigo do botão, se existir
    if (kitEstoqueBtn._clickListener) {
        kitEstoqueBtn.removeEventListener('click', kitEstoqueBtn._clickListener);
    }
    // Criar o novo handler para o botão
    const handleMontarKitClick = () => {
        const qtdKitsParaEnviar = parseInt(qtdEnviarKitsInput.value) || 0;
        const maxKitsPermitidos = parseInt(qtdEnviarKitsInput.max) || 0;

        if (qtdKitsParaEnviar > 0 && qtdKitsParaEnviar <= maxKitsPermitidos) {
            // Passa a 'composicaoDoKit' que foi lida da definição do kit
            enviarKitParaEstoque(kitNome, variacaoKitSelecionada, qtdKitsParaEnviar, composicaoDoKit);
        } else {
            mostrarPopupMensagem('Quantidade de kits inválida ou excede o máximo montável.', 'erro');
        }
    };
    // Adicionar o novo listener e armazenar sua referência
    kitEstoqueBtn.addEventListener('click', handleMontarKitClick);
    kitEstoqueBtn._clickListener = handleMontarKitClick;

    // Chamada inicial para definir o estado do botão
    atualizarEstadoBotaoMontarKit(); 
    console.log("[carregarTabelaKit] Configuração de listeners e estado inicial do botão concluída.");
}

async function enviarKitParaEstoque(nomeDoKitProduto, variacaoDoKitProduto, qtdKitsParaEnviar, composicaoDoKitSelecionado) {
    const btn = document.getElementById('kit-estoque-btn');
    const originalButtonHtml = btn.innerHTML; // Salva o HTML original
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Montando Kits...';
    }

    try {
        const componentesParaPayload = []; 

        // Para cada item na composição do kit que o usuário quer montar:
        for (const itemCompDefinicao of composicaoDoKitSelecionado) { 
            const nomeComp = itemCompDefinicao.produto;
            const varComp = itemCompDefinicao.variacao || '-';
            const qtdNecessariaPorKit = parseInt(itemCompDefinicao.quantidade) || 1;
            let qtdTotalDesteComponenteNecessaria = qtdKitsParaEnviar * qtdNecessariaPorKit;

            // Encontrar os arremates individuais disponíveis para ESTE componente específico
            // É crucial usar opsProntasParaEmbalarGlobal que já tem os saldos ATUALIZADOS
            const arrematesDisponiveisParaEsteComponente = opsProntasParaEmbalarGlobal
                .filter(arr => arr.produto === nomeComp && (arr.variante || '-') === varComp)
                .sort((a, b) => a.id_arremate - b.id_arremate); // FIFO: consumir dos mais antigos primeiro

            // Distribuir a quantidade necessária entre os arremates disponíveis
            for (const arremateOrigem of arrematesDisponiveisParaEsteComponente) {
                if (qtdTotalDesteComponenteNecessaria <= 0) break; // Já consumiu tudo que precisa

                const qtdDisponivelNesteArremateOrigem = arremateOrigem.quantidade_disponivel_para_embalar;
                const qtdAUsarDesteArremateOrigem = Math.min(qtdTotalDesteComponenteNecessaria, qtdDisponivelNesteArremateOrigem);

                if (qtdAUsarDesteArremateOrigem > 0) {
                    // Adiciona ao payload para a API de montagem de kit
                    componentesParaPayload.push({
                        id_arremate: arremateOrigem.id_arremate,
                        produto: arremateOrigem.produto,
                        variante: arremateOrigem.variante,
                        quantidade_usada: qtdAUsarDesteArremateOrigem 
                    });
                    qtdTotalDesteComponenteNecessaria -= qtdAUsarDesteArremateOrigem;
                }
            }

            if (qtdTotalDesteComponenteNecessaria > 0) {
                // Isso indica um erro lógico grave, pois a UI deveria ter impedido isso.
                throw new Error(`Insuficiência inesperada para o componente ${nomeComp} - ${varComp}. Faltam ${qtdTotalDesteComponenteNecessaria}.`);
            }
        }
        
        const payload = {
            kit_nome: nomeDoKitProduto,
            kit_variante: variacaoDoKitProduto === '-' ? null : variacaoDoKitProduto,
            quantidade_kits_montados: qtdKitsParaEnviar,
            componentes_consumidos_de_arremates: componentesParaPayload 
        };

        console.log("[enviarKitParaEstoque] Payload para /api/kits/montar:", JSON.stringify(payload, null, 2));

        // Chamar a API /api/kits/montar (que você já implementou no backend)
        const resultadoMontagem = await fetchFromAPI('/kits/montar', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        console.log("[enviarKitParaEstoque] Resposta da montagem do kit:", resultadoMontagem);
        mostrarPopupMensagem(resultadoMontagem.message || `${qtdKitsParaEnviar} kit(s) montado(s)!`, 'sucesso');
        
        // Limpar caches e recarregar
        todosOsArrematesRegistrados = []; 
        window.location.hash = ''; // Volta para a lista principal
        localStorage.removeItem('embalagemAtual'); // Limpa o cache da tela de embalagem
        embalagemAgregadoEmVisualizacao = null; // Limpa o objeto agregado global

        // Atualiza TODAS as listas para refletir as mudanças
        await atualizarListasArremateEEmbalagem(); 

    } catch (error) {
        console.error('[enviarKitParaEstoque] Erro:', error);
        mostrarPopupMensagem(`Erro ao montar kit: ${error.message || 'Verifique o console.'}`, 'erro');
        if (btn) { // Reabilita botão e restaura texto em caso de erro
            btn.disabled = false;
            btn.innerHTML = originalButtonHtml;
        }
    }
}




async function obterQuantidadeDisponivelAjustada(produto, variante, quantidadeInicialArrematada, opNumero) {
    try {
        const op = await buscarOpPorNumero(opNumero); // Busca a OP para pegar 'quantidadeEmbalada'
        if (!op) {
            console.warn(`[obterQtdDispAjustada] OP ${opNumero} não encontrada.`);
            return Math.max(0, quantidadeInicialArrematada);
        }
        const quantidadeJaEmbalada = parseInt(op.quantidadeEmbalada) || 0;
        const qtdAjustada = quantidadeInicialArrematada - quantidadeJaEmbalada;
        return Math.max(0, qtdAjustada);
    } catch (error) {
        console.error(`[obterQtdDispAjustada] Erro OP ${opNumero}:`, error);
        return Math.max(0, quantidadeInicialArrematada);
    }
}

async function atualizarQuantidadeEmbalada(produto, variante, quantidadeEnviada, opNumero, opEditId) {
    if (!opNumero && !opEditId) throw new Error('ID da OP não fornecido para atualização.');
    try {
        const opAtual = await buscarOpPorNumero(opNumero);
        const qtdJaEmbaladaAtual = parseInt(opAtual?.quantidadeEmbalada) || 0;
        const novaQtdEmbalada = qtdJaEmbaladaAtual + quantidadeEnviada;
        const dados = {
            edit_id: opEditId || undefined,
            numero: opEditId ? undefined : opNumero,
            quantidadeEmbalada: novaQtdEmbalada
        };
        await fetchFromAPI('/ordens-de-producao', { method: 'PUT', body: JSON.stringify(dados) });
        if (opAtual) {
            opAtual.quantidadeEmbalada = novaQtdEmbalada;
            opDataCache.set(opNumero, opAtual);
        } else {
            opDataCache.delete(opNumero); // Invalida se não estava no cache
        }
    } catch (error) {
        console.error('[atualizarQtdEmbalada] Erro:', error);
        mostrarPopupMensagem(`Erro ao atualizar estoque da OP ${opNumero}.`, 'erro');
        throw error;
    }
}


// --- Função Principal de Carregamento da Tela de Embalagem
async function carregarEmbalagem(produto, variante, quantidadeDisponivelParaEstaSessao) {
    console.log(`[carregarEmbalagem] Para ${produto}:${variante}, Qtd Disp (total agregado): ${quantidadeDisponivelParaEstaSessao}`);

    // Acessa o item agregado global. Se a navegação foi direta via hash, pode precisar buscar.
    if (!embalagemAgregadoEmVisualizacao || 
        embalagemAgregadoEmVisualizacao.produto !== produto || 
        (embalagemAgregadoEmVisualizacao.variante || '-') !== (variante || '-')) {
        
        embalagemAgregadoEmVisualizacao = produtosProntosParaEmbalarAgregados.find(item => 
            item.produto === produto && (item.variante || '-') === (variante || '-')
        );

        if (!embalagemAgregadoEmVisualizacao) {
            mostrarPopupMensagem('Erro: Dados do produto para embalagem não encontrados. Voltando para lista.', 'erro');
            window.location.hash = '';
            return;
        }
    }
    console.log('[carregarEmbalagem] Objeto agregado atual:', embalagemAgregadoEmVisualizacao);

    // --- Obter referências aos elementos DOM ---
    const embalagemTitleEl = document.getElementById('embalagemTitle');
    const embalagemSubTitleEl = document.getElementById('embalagemSubTitle');
    const produtoNomeEl = document.getElementById('produtoNome');
    const varianteNomeEl = document.getElementById('varianteNome');
    const opOrigemEmbalagemEl = document.getElementById('opOrigemEmbalagem');
    const qtdDisponivelElUnidade = document.getElementById('qtdDisponivel');
    const embalagemThumbnailEl = document.getElementById('embalagemThumbnail');
    
    // Referências dos botões e inputs das abas
    const kitTabBtn = document.querySelector('.ep-tabs button[data-tab="kit"]');
    const unidadeTabBtn = document.querySelector('.ep-tabs button[data-tab="unidade"]');
    const kitTabPanel = document.getElementById('kit-tab');
    const unidadeTabPanel = document.getElementById('unidade-tab');
    const kitVariacaoComposicaoWrapper = document.getElementById('kit-variacao-composicao-wrapper');

    // Validação básica dos elementos
    if (!embalagemTitleEl || !unidadeTabPanel || !kitTabBtn || !unidadeTabBtn) {
        console.error('[carregarEmbalagem] Um ou mais elementos DOM da tela de embalagem não foram encontrados.');
        mostrarPopupMensagem('Erro ao carregar interface de embalagem.', 'erro');
        window.location.hash = ''; return;
    }
    
    // --- Preencher informações do produto (cabeçalho e thumbnail) ---
    const produtoCadastrado = todosOsProdutos.find(p => p.nome === produto);
    const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (variante === '-' ? '' : variante));
    const imagem = gradeItem?.imagem || '';
    embalagemThumbnailEl.innerHTML = imagem ? `<img src="${imagem}" alt="Imagem ${produto} ${variante}">` : 'Sem imagem';

    embalagemTitleEl.textContent = `Embalar Detalhes`;
    embalagemSubTitleEl.textContent = `${produto}${variante !== '-' ? ` - ${variante}` : ''}`;
    
    produtoNomeEl.textContent = produto;
    varianteNomeEl.textContent = variante !== '-' ? variante : 'Padrão';
    opOrigemEmbalagemEl.textContent = `Origem: Várias OPs / Arremates`;

    qtdDisponivelElUnidade.textContent = quantidadeDisponivelParaEstaSessao; 
    if (qtdDisponivelElUnidade.parentElement?.classList.contains('ep-qtd-disponivel-destaque')) {
        qtdDisponivelElUnidade.parentElement.classList.remove('changing');
    }
    
    // --- CLONAR E SUBSTITUIR ELEMENTOS PARA REMOVER LISTENERS ANTIGOS ---
    // Isso é crucial para evitar listeners duplicados e garantir que estamos sempre
    // trabalhando com as referências mais recentes dos elementos no DOM.
    
    // Primeiro, obtenha as referências originais antes de clonar.
    const qtdEnviarInputUnidadeOriginal = document.getElementById('qtdEnviar');
    const estoqueBtnUnidadeOriginal = document.getElementById('estoqueBtn');

    // Clone e substitua o input de quantidade
    const newQtdEnviarInput = qtdEnviarInputUnidadeOriginal.cloneNode(true);
    qtdEnviarInputUnidadeOriginal.parentNode.replaceChild(newQtdEnviarInput, qtdEnviarInputUnidadeOriginal);
    const currentQtdEnviarInputUnidade = newQtdEnviarInput; // Esta é a referência ATUALizada

    // Clone e substitua o botão de estoque
    const newEstoqueBtnUnidade = estoqueBtnUnidadeOriginal.cloneNode(true);
    estoqueBtnUnidadeOriginal.parentNode.replaceChild(newEstoqueBtnUnidade, estoqueBtnUnidadeOriginal);
    const currentEstoqueBtnUnidade = newEstoqueBtnUnidade; // Esta é a referência ATUALizada
    
    // Configurar o input de quantidade (valores e estado inicial)
    currentQtdEnviarInputUnidade.value = '';
    currentQtdEnviarInputUnidade.min = 1;
    currentQtdEnviarInputUnidade.max = quantidadeDisponivelParaEstaSessao; 
    
    // Determinar permissões
    const podeEmbalarUnidade = permissoes.includes('lancar-embalagem');
    const podeMontarKit = permissoes.includes('montar-kit');

    // Desabilita o botão de estoque inicialmente se não houver permissão ou quantidade
    currentEstoqueBtnUnidade.disabled = !podeEmbalarUnidade || quantidadeDisponivelParaEstaSessao <= 0;


    // --- Lógica das Abas (Kit/Unidade) ---
    const temKits = await temKitsDisponiveis(produto, variante);

    unidadeTabBtn.classList.remove('active');
    kitTabBtn.classList.remove('active');
    unidadeTabPanel.classList.remove('active', 'hidden'); 
    kitTabPanel.classList.remove('active', 'hidden');   
    kitVariacaoComposicaoWrapper.classList.add('hidden');

    let abaInicialAtiva = null;

    // Lógica para decidir qual aba ativar inicialmente
    if (temKits && podeMontarKit) {
        kitTabBtn.style.display = 'inline-flex';
        unidadeTabBtn.style.display = 'inline-flex';
        abaInicialAtiva = 'kit';
    } else if (podeEmbalarUnidade) {
        kitTabBtn.style.display = 'none';
        unidadeTabBtn.style.display = 'inline-flex'; 
        abaInicialAtiva = 'unidade';
    } else {
        kitTabBtn.style.display = 'none';
        unidadeTabBtn.style.display = 'none';
        mostrarPopupMensagem('Nenhuma opção de embalagem permitida para este item.', 'aviso');
        kitTabPanel.classList.add('hidden');
        unidadeTabPanel.classList.add('hidden');
    }

    // Ativar a aba e carregar conteúdo conforme a decisão
    if (abaInicialAtiva === 'kit') {
        kitTabBtn.classList.add('active');
        kitTabPanel.classList.add('active');
        kitTabPanel.classList.remove('hidden');
        unidadeTabPanel.classList.add('hidden');
        unidadeTabBtn.classList.remove('active');
        await carregarKitsDisponiveis(produto, variante); 
    } else if (abaInicialAtiva === 'unidade') {
        unidadeTabBtn.classList.add('active');
        unidadeTabPanel.classList.add('active');
        unidadeTabPanel.classList.remove('hidden');
        kitTabPanel.classList.add('hidden');
        kitTabBtn.classList.remove('active');
    }


    // --- Listener para o Input de Quantidade da Unidade ---
    // Este listener é adicionado ao NOVO input (`currentQtdEnviarInputUnidade`)
    currentQtdEnviarInputUnidade.addEventListener('input', () => {
        let valor = parseInt(currentQtdEnviarInputUnidade.value) || 0;
        const qtdDispPai = currentQtdEnviarInputUnidade.closest('.ep-embalar-form-card')?.querySelector('.ep-qtd-disponivel-destaque');
        const qtdDispSpan = qtdDispPai?.querySelector('strong#qtdDisponivel');
        let habilitarBotao = false;

        // Garante que o valor no input não exceda o max
        if (valor > quantidadeDisponivelParaEstaSessao) {
            currentQtdEnviarInputUnidade.value = quantidadeDisponivelParaEstaSessao;
            valor = quantidadeDisponivelParaEstaSessao;
        } else if (valor < 0) {
            currentQtdEnviarInputUnidade.value = 0;
            valor = 0;
        }

        if (valor >= 1 && valor <= quantidadeDisponivelParaEstaSessao) {
            if (qtdDispSpan) qtdDispSpan.textContent = quantidadeDisponivelParaEstaSessao - valor;
            if (qtdDispPai) qtdDispPai.classList.add('changing');
            habilitarBotao = true;
        } else {
            if (qtdDispSpan) qtdDispSpan.textContent = quantidadeDisponivelParaEstaSessao;
            if (qtdDispPai) qtdDispPai.classList.remove('changing');
            habilitarBotao = false;
        }
        currentEstoqueBtnUnidade.disabled = !podeEmbalarUnidade || !habilitarBotao;
    });

    // --- Listener para o Botão "Embalar e Enviar para Estoque" ---
    // Este listener é adicionado ao NOVO botão (`currentEstoqueBtnUnidade`)
    // É importante remover o listener anterior ANTES de adicionar o novo para evitar duplicação.
    if (currentEstoqueBtnUnidade._clickListener) {
        currentEstoqueBtnUnidade.removeEventListener('click', currentEstoqueBtnUnidade._clickListener);
    }

    const handleEstoqueBtnClick = async () => { // Função nomeada para facilitar o reuso e remoção
        const quantidadeEnviada = parseInt(currentQtdEnviarInputUnidade.value);
        if (isNaN(quantidadeEnviada) || quantidadeEnviada <= 0 || quantidadeEnviada > quantidadeDisponivelParaEstaSessao) {
            mostrarPopupMensagem('Quantidade inválida!', 'erro'); return;
        }

        // --- Salvar o HTML original do botão ANTES de modificá-lo ---
        const originalButtonHtml = currentEstoqueBtnUnidade.innerHTML;

        // Desabilita o botão e o input e mostra o spinner
        currentEstoqueBtnUnidade.disabled = true;
        currentEstoqueBtnUnidade.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        currentQtdEnviarInputUnidade.disabled = true;
        
        const { produto: prodNome, variante: prodVar } = embalagemAgregadoEmVisualizacao;

        let erroDuranteOperacao = false; // Flag para controlar o comportamento do `finally`

        try {
            let quantidadeRestanteParaEmbalar = quantidadeEnviada;
            const lancamentosArremateAtualizados = [];

            // Ordena os arremates individuais por ID (FIFO) para consumir dos mais antigos
            const arrematesOrdenados = embalagemAgregadoEmVisualizacao.arremates_detalhe
                .filter(arremate => arremate.quantidade_disponivel_para_embalar > 0)
                .sort((a, b) => a.id_arremate - b.id_arremate);

            for (const arremate of arrematesOrdenados) {
                if (quantidadeRestanteParaEmbalar <= 0) break;

                const qtdDisponivelNesteArremate = arremate.quantidade_disponivel_para_embalar;
                const qtdAEmbalarDesteArremate = Math.min(quantidadeRestanteParaEmbalar, qtdDisponivelNesteArremate);

                if (qtdAEmbalarDesteArremate > 0) {
                    console.log(`[Embalar Unidade] Atualizando arremate ID ${arremate.id_arremate} para registrar ${qtdAEmbalarDesteArremate} como embaladas.`);
                    await fetchFromAPI(`/arremates/${arremate.id_arremate}/registrar-embalagem`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            quantidade_que_foi_embalada_desta_vez: qtdAEmbalarDesteArremate
                        })
                    });
                    lancamentosArremateAtualizados.push({ id: arremate.id_arremate, qtd: qtdAEmbalarDesteArremate });
                    quantidadeRestanteParaEmbalar -= qtdAEmbalarDesteArremate;
                }
            }

            if (quantidadeRestanteParaEmbalar > 0) {
                throw new Error('Erro interno: Quantidade restante não foi totalmente embalada. Saldo insuficiente inesperado.');
            }

            console.log(`[Embalar Unidade] Enviando para estoque final: Produto ${prodNome}, Qtd ${quantidadeEnviada}`);
            const resultadoEstoque = await fetchFromAPI('/estoque/entrada-producao', {
                method: 'POST',
                body: JSON.stringify({
                    produto_nome: prodNome,
                    variante_nome: prodVar === '-' ? null : prodVar,
                    quantidade_entrada: quantidadeEnviada,
                })
            });
            console.log('[Embalar Unidade] Resposta da API de entrada no estoque:', resultadoEstoque);
            mostrarPopupMensagem(`${quantidadeEnviada} unidade(s) de ${prodNome} enviada(s) para o estoque!`, 'sucesso');

            // Limpar caches globais para forçar recarga de dados frescos
            todosOsArrematesRegistrados = []; 
            // Limpa o estado da UI para forçar a navegação para a lista principal
            window.location.hash = ''; 
            localStorage.removeItem('embalagemAtual');
            embalagemAgregadoEmVisualizacao = null; // Limpa o objeto agregado global

            // Chamar a atualização das listas principais, mas não precisamos de await aqui
            // porque a navegação já está acontecendo e o `finally` vai resetar o botão.
            atualizarListasArremateEEmbalagem(); 

        } catch (error) {
            erroDuranteOperacao = true; // Sinaliza que houve um erro
            console.error('[Embalar Unidade] Erro ao embalar e enviar:', error);
            mostrarPopupMensagem(`Erro ao embalar: ${error.message || 'Verifique o console.'}`, 'erro');
        } finally {
            // Este bloco é EXECUTADO SEMPRE, independentemente de sucesso ou erro.
            // Ele restaura o estado visual do botão e do input.

            if (currentEstoqueBtnUnidade) { // Sempre verificar se o elemento ainda existe
                currentEstoqueBtnUnidade.innerHTML = originalButtonHtml; // Remove o spinner
                if (erroDuranteOperacao) {
                    currentEstoqueBtnUnidade.disabled = false; // Reabilita em caso de erro
                }
            }
            if (currentQtdEnviarInputUnidade) { // Sempre verificar se o elemento ainda existe
                currentQtdEnviarInputUnidade.disabled = false; // Reabilita em caso de erro/sucesso
                // Não redefinimos o value aqui, pois ele pode ter sido corrigido pelo usuário ou zerado pelo sucesso.
                // A nova renderização da UI ou o listener do input cuidará do valor.
            }
            // Para o caso de sucesso, o botão ainda pode estar desabilitado
            // se a quantidade total disponível agora for 0, o que é o comportamento esperado.
            // A re-validação pelo 'input' listener (ou a recarga da tela) cuida disso.
        }
    };
    // Anexa o novo listener ao botão, e armazena a referência para futura remoção.
    currentEstoqueBtnUnidade.addEventListener('click', handleEstoqueBtnClick);
    currentEstoqueBtnUnidade._clickListener = handleEstoqueBtnClick; // Salva a referência do listener


    // --- Lógica para o botão de Montar Kits (se a aba de Kit for ativa) ---
    // Esta parte foi modificada em discussões anteriores.
    // Garanta que a função `enviarKitParaEstoque` também tenha o mesmo padrão de `finally` para o seu botão.
    // (Não está incluída aqui para manter o foco apenas na `carregarEmbalagem` completa)
    // Se você usa o `carregarKitsDisponiveis` e ele anexa o listener a `kit-estoque-btn`,
    // você precisa garantir que `enviarKitParaEstoque` (que é o callback desse listener)
    // também tenha o `try...catch...finally` completo para resetar o `kit-estoque-btn`.
} // Fim da função carregarEmbalagem




function alternarAba(event) {
    const tabBtn = event.target.closest('.ep-tab-btn');
    if (!tabBtn || tabBtn.classList.contains('active')) return; // Não faz nada se já está ativa ou não é um botão de aba
    
    const tabId = tabBtn.dataset.tab;
    console.log(`[alternarAba] Alternando para aba: ${tabId}`);

    // Desativa todos os botões de aba e painéis
    document.querySelectorAll('.ep-tabs .ep-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.ep-embalar-view .ep-tab-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.classList.add('hidden');
    });

    // Ativa o botão e painel clicados
    tabBtn.classList.add('active');
    const activePanel = document.getElementById(`${tabId}-tab`);
    if (activePanel) {
        activePanel.classList.add('active');
        activePanel.classList.remove('hidden');
        console.log(`[alternarAba] Painel ${activePanel.id} ativado e visível.`);
    } else {
        console.error(`[alternarAba] Painel para aba ${tabId} não encontrado.`);
    }
}


// --- Inicialização e Listeners (AJUSTADOS) ---
async function inicializar() {
    try {
        const auth = await verificarAutenticacao('embalagem-de-produtos.html', ['acesso-embalagem-de-produtos']);
        if (!auth) { window.location.href = 'acesso-negado.html'; return; }
        permissoes = auth.permissoes || [];
        usuarioLogado = auth.usuario;

        // Adiciona classe ao body para CSS saber que o usuário está autenticado (se você usa isso)
        document.body.classList.add('autenticado');


        await Promise.all([buscarTodosProdutos(), buscarUsuarios()]);
        await atualizarListasArremateEEmbalagem(); // Carrega dados e renderiza
        setupEventListeners();
        handleHashChange(); // Verifica hash inicial
    } catch (error) {
        console.error('[inicializar] Erro geral:', error);
        mostrarPopupMensagem('Erro crítico ao carregar. Tente recarregar.', 'erro');
    }
}


function setupEventListeners() {
    const searchProdutoInput = document.getElementById('searchProduto');
    if (searchProdutoInput) {
        searchProdutoInput.addEventListener('input', debounce(() => {
            currentPageEmbalagem = 1;
            carregarCardsEmbalagem(produtosProntosParaEmbalarAgregados); // Modificado para carregarCardsEmbalagem
        }, 350));
    }

    // NOVO: Listener para o botão 'X' de fechar a tela de detalhe de ARREMATE
    const fecharArremateBtn = document.getElementById('fecharArremateBtn');
    if (fecharArremateBtn) {
        fecharArremateBtn.addEventListener('click', () => {
            window.location.hash = ''; // Volta para a raiz (lista de cards agregados de arremate)
            localStorage.removeItem('arremateAgregadoAtual');
            // Não precisa de await atualizarListasArremateEEmbalagem() aqui,
            // porque handleHashChange já fará isso quando o hash for limpo.
        });
    }

    // NOVO: Listener para o botão 'X' de fechar a tela de detalhe de EMBALAGEM
    const fecharEmbalagemBtn = document.getElementById('fecharEmbalagemBtn');
    if (fecharEmbalagemBtn) {
        fecharEmbalagemBtn.addEventListener('click', () => {
            window.location.hash = ''; // Volta para a raiz (lista de cards agregados de embalagem)
            localStorage.removeItem('embalagemAtual');
        });
    }

    document.querySelectorAll('.ep-tabs .ep-tab-btn').forEach(btn => {
        btn.addEventListener('click', alternarAba);
    });

    window.addEventListener('hashchange', handleHashChange);
}


async function handleHashChange() {
    const hash = window.location.hash;

    const arremateView = document.getElementById('arremateView');
    const embalagemListView = document.getElementById('embalagemListView');
    const embalarView = document.getElementById('embalarView');
    const arremateDetailView = document.getElementById('arremateDetailView');

    if (!arremateView || !embalagemListView || !embalarView || !arremateDetailView) {
        console.error("[handleHashChange] Views não encontradas."); return;
    }

    if (hash === '#embalar') {
        const embalagemData = JSON.parse(localStorage.getItem('embalagemAtual') || 'null');
        if (embalagemData && embalagemData.produto && typeof embalagemData.quantidade !== 'undefined') {
            arremateView.classList.add('hidden');
            embalagemListView.classList.add('hidden');
            embalarView.classList.remove('hidden');
            arremateDetailView.classList.add('hidden'); 
            await carregarEmbalagem(embalagemData.produto, embalagemData.variante, embalagemData.quantidade);
        } else {
            console.warn('[handleHashChange] #embalar sem dados válidos. Voltando para lista.');
            window.location.hash = ''; 
        }
    } else if (hash === '#arremate-detalhe') { 
        const arremateAgregadoData = JSON.parse(localStorage.getItem('arremateAgregadoAtual') || 'null');
        if (arremateAgregadoData && arremateAgregadoData.produto && arremateAgregadoData.ops_detalhe) {
            arremateView.classList.add('hidden');
            embalagemListView.classList.add('hidden');
            embalarView.classList.add('hidden');
            arremateDetailView.classList.remove('hidden');
            await carregarArremateDetalhe(arremateAgregadoData);
        } else {
            console.warn('[handleHashChange] #arremate-detalhe sem dados válidos. Voltando para lista de arremates.');
            window.location.hash = ''; 
        }
    } else { // Se não for nenhuma hash específica, mostra as listas principais
        embalarView.classList.add('hidden');
        arremateDetailView.classList.add('hidden'); 
        localStorage.removeItem('embalagemAtual'); 
        localStorage.removeItem('arremateAgregadoAtual'); 

        // Se o hash está vazio, mostre as duas seções principais
        arremateView.classList.remove('hidden');
        embalagemListView.classList.remove('hidden');
        
        // E só recarrega as listas se o hash está vazio.
        if (window.location.hash === '') { 
            await atualizarListasArremateEEmbalagem();
        }
    }
}

// --- Ponto de Entrada ---
document.addEventListener('DOMContentLoaded', inicializar);

window.limparCacheEmbalagem = () => {
    opDataCache.clear();
    todosOsProdutos = [];
    todosOsUsuarios = [];
    todosOsArrematesRegistrados = []; // Limpar este também
    opsParaArrematarGlobal = [];
    opsProntasParaEmbalarGlobal = [];
    invalidateCache('produtos');
    invalidateCache('usuarios'); // Se você tiver cache para usuários
    console.log('[limparCacheEmbalagem] Caches limpos.');
    mostrarPopupMensagem('Cache local limpo.', 'aviso');
    atualizarListasArremateEEmbalagem();
};