import { verificarAutenticacao } from '/js/utils/auth.js';
// Importe obterProdutos de onde ele estiver (talvez storage.js ou direto da API)
import { obterProdutos, invalidateCache, getCachedData } from '/js/utils/storage.js';
// Importe obterUsuarios se precisar (ou crie uma função similar aqui)
// import { obterUsuarios } from '/js/admin/ordens-de-producao.js'; // Exemplo - Adapte o caminho se necessário

// --- Variáveis Globais ---
let usuarioLogado = null;
let permissoes = [];
let todosOsProdutos = []; // Cache local de produtos
let todosOsUsuarios = []; // Cache local de usuarios (filtrar por tiktik depois)
let opDataCache = new Map(); // Cache para dados de OPs individuais (op_numero -> op_data)

// Paginação para Arremate
let currentPageArremate = 1;
const itemsPerPageArremate = 10;
let opsParaArrematarGlobal = []; // Guarda OPs filtradas para arremate

// Paginação para Embalagem (existente)
let currentPageEmbalagem = 1;
const itemsPerPageEmbalagem = 10; // Você pode ajustar este valor
let opsProntasParaEmbalarGlobal = []; // Guarda OPs filtradas para embalagem

// Flag para evitar lançamentos duplicados
const lancamentosArremateEmAndamento = new Set();

// --- Funções Auxiliares ---

// Função para buscar dados da API (Melhorada para evitar cache GET e tratar erros)
async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
         mostrarPopupMensagem('Erro de autenticação. Faça login novamente.', 'erro');
         window.location.href = '/login.html'; // Redireciona para login
         throw new Error('Token não encontrado');
    }
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Adiciona timestamp para evitar cache de GETs
    const url = options.method === 'GET' || !options.method
               ? `/api${endpoint}${endpoint.includes('?') ? '&' : '?'}_=${Date.now()}` // Adiciona /api e timestamp
               : `/api${endpoint}`; // Adiciona /api

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });
        if (!response.ok) {
            let errorData = { error: `Erro ${response.status}` }; // Default error
            try {
                 // Tenta ler como JSON, mas pode falhar se não for JSON
                 const jsonError = await response.json();
                 errorData = jsonError || errorData;
            } catch (e) {
                 // Se falhar, tenta ler como texto
                 try {
                      const textError = await response.text();
                      errorData.error = textError || errorData.error;
                 } catch (textE) {
                      // Se tudo falhar, usa o statusText
                      errorData.error = response.statusText;
                 }
            }
            console.error(`[fetchFromAPI] Erro ${response.status} em ${endpoint}:`, errorData);
            // Se for erro de token expirado, redireciona
            if (response.status === 401 || response.status === 403 || (errorData.error || '').toLowerCase().includes('token')) {
                 mostrarPopupMensagem('Sessão expirada ou inválida. Faça login novamente.', 'erro');
                 localStorage.removeItem('token');
                 localStorage.removeItem('usuarioLogado');
                 window.location.href = '/login.html';
            }
            throw new Error(`Erro ${response.status}: ${errorData.error}`);
        }
        // Se for DELETE ou status 204 (No Content), não tenta fazer .json()
        if (response.status === 204 || options.method === 'DELETE') {
            return { success: true }; // Retorna um objeto indicando sucesso
        }
        return await response.json();
    } catch (error) {
        console.error(`[fetchFromAPI] Falha ao acessar ${url}:`, error);
        // Não mostra popup aqui diretamente, deixa a função chamadora decidir
        throw error; // Re-lança o erro para ser tratado por quem chamou
    }
}


// Função para buscar OPs Finalizadas
async function buscarOpsFinalizadas() {
    // Chama a nova API dedicada
    const endpoint = '/ops-para-embalagem?all=true'; // Pede todas as finalizadas
    console.log(`[buscarOpsFinalizadas] Buscando OPs finalizadas em ${endpoint}...`);
    try {
        const data = await fetchFromAPI(endpoint); // Usa a função fetchFromAPI existente

        // A nova API já retorna o formato { rows: [...] }
        const ops = data?.rows || [];

        console.log(`[buscarOpsFinalizadas] ${ops.length} OPs finalizadas encontradas da nova API.`);

        // Limpa e preenche o cache local (se ainda for útil)
        opDataCache.clear();
        ops.forEach(op => opDataCache.set(op.numero, op));

        return ops; // Retorna apenas o array de OPs

    } catch (error) {
        console.error('[buscarOpsFinalizadas] Erro ao buscar OPs na nova API:', error);
        mostrarPopupMensagem('Erro ao buscar Ordens de Produção finalizadas.', 'erro');
        return []; // Retorna array vazio em caso de erro
    }
}


// Função para buscar Arremates registrados
async function buscarArrematesRegistrados(opNumero = null) {
    const endpoint = opNumero ? `/arremates?op_numero=${opNumero}` : '/arremates';
    console.log(`[buscarArrematesRegistrados] Buscando arremates em ${endpoint}...`);
    try {
        const arremates = await fetchFromAPI(endpoint);
        const arrematesArray = Array.isArray(arremates) ? arremates : (arremates?.rows || []);
        console.log(`[buscarArrematesRegistrados] ${arrematesArray.length} arremates encontrados.`);
        return arrematesArray;
    } catch (error) {
        console.error('[buscarArrematesRegistrados] Erro:', error);
        return [];
    }
}

// Função para buscar Usuários
async function buscarUsuarios() {
    // Implemente cache se necessário
    if (todosOsUsuarios.length > 0) return todosOsUsuarios;
    console.log('[buscarUsuarios] Buscando usuários da API...');
    try {
        const usuarios = await fetchFromAPI('/usuarios');
        todosOsUsuarios = Array.isArray(usuarios) ? usuarios : (usuarios?.rows || []);
        console.log(`[buscarUsuarios] ${todosOsUsuarios.length} usuários carregados.`);
        return todosOsUsuarios;
    } catch (error) {
        console.error('[buscarUsuarios] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar usuários.', 'erro');
        return [];
    }
}

// Função para buscar Produtos
async function buscarTodosProdutos() {
    // Usa a função importada que já deve ter cache
    if (todosOsProdutos.length > 0) return todosOsProdutos;
    console.log('[buscarTodosProdutos] Buscando produtos...');
    try {
        todosOsProdutos = await obterProdutos(); // Usa a função importada
        console.log(`[buscarTodosProdutos] ${todosOsProdutos.length} produtos carregados.`);
        return todosOsProdutos;
    } catch (error) {
        console.error('[buscarTodosProdutos] Erro:', error);
        mostrarPopupMensagem('Erro ao buscar definições de produtos.', 'erro');
        return [];
    }
}

// Função para buscar dados de UMA OP específica (do cache ou API)
async function buscarOpPorNumero(opNumero) {
    if (opDataCache.has(opNumero)) {
        return opDataCache.get(opNumero);
    }
    console.log(`[buscarOpPorNumero] Buscando OP ${opNumero} da API...`);
    try {
        // Assume que existe um endpoint /api/ordens-de-producao/:numero
        const op = await fetchFromAPI(`/ordens-de-producao/${opNumero}`);
        if (op) {
            opDataCache.set(opNumero, op); // Salva no cache
        }
        return op;
    } catch (error) {
        console.error(`[buscarOpPorNumero] Erro ao buscar OP ${opNumero}:`, error);
        // Não mostra popup aqui, pois pode ser erro esperado (OP não existe)
        return null;
    }
}


// Função para obter a quantidade final da OP
function obterQuantidadeFinalProduzida(op) {
    if (op?.etapas && op.etapas.length > 0) {
        const ultimaEtapa = op.etapas[op.etapas.length - 1];
        // Prioriza a quantidade da última etapa, se existir e for maior que zero
        const qtdUltimaEtapa = parseInt(ultimaEtapa?.quantidade);
        if (!isNaN(qtdUltimaEtapa) && qtdUltimaEtapa > 0) {
            return qtdUltimaEtapa;
        }
    }
    // Fallback: Usa a quantidade principal da OP se a da última etapa não for válida
    const qtdPrincipal = parseInt(op?.quantidade);
    return isNaN(qtdPrincipal) ? 0 : qtdPrincipal;
}


async function obterUsuariosTiktikParaProduto(produtoNome) {
    // LOG: Qual produto estamos buscando?
    console.log(`[obterUsuariosTiktik] Buscando TikTiks para Produto: ${produtoNome}`);

    const produto = todosOsProdutos.find(p => p.nome === produtoNome);

    // LOG: Produto encontrado? Tem etapasTiktik?
    if (!produto) {
        console.warn(`[obterUsuariosTiktik] Produto "${produtoNome}" NÃO encontrado no cache de produtos.`);
        return [];
    }
    console.log(`[obterUsuariosTiktik] Produto "${produtoNome}" encontrado. Verificando etapasTiktik...`, produto.etapasTiktik);

    if (!produto.etapasTiktik || !Array.isArray(produto.etapasTiktik) || produto.etapasTiktik.length === 0) {
        console.warn(`[obterUsuariosTiktik] Produto "${produtoNome}" não possui 'etapasTiktik' definidas ou está vazio.`);
        return [];
    }

    // Assumindo a primeira etapa tiktik define o tipo
    const etapaDefinidora = produto.etapasTiktik[0];
    const tipoFeitoPor = etapaDefinidora?.feitoPor;

    // LOG: Qual tipo de usuário (feitoPor) estamos procurando?
    console.log(`[obterUsuariosTiktik] Etapa definidora:`, etapaDefinidora);
    console.log(`[obterUsuariosTiktik] Procurando por usuários do tipo/cargo: '${tipoFeitoPor}'`);

    if (!tipoFeitoPor) {
        console.warn(`[obterUsuariosTiktik] 'feitoPor' não definido na primeira etapaTiktik para ${produtoNome}.`);
        return [];
    }

    const usuarios = await buscarUsuarios(); // Busca todos os usuários
    const tipoFeitoPorLower = tipoFeitoPor.toLowerCase();
    const usuariosFiltrados = usuarios.filter(u => {
        const userTypes = u?.tipos; // <--- USA O CAMPO CORRETO 'tipos'
    
        if (!userTypes) {
            return false; // Ignora usuário se não tiver o campo 'tipos'
        }
        // Verifica se 'tipos' é um array e se inclui o tipo desejado (ignorando case)
        if (Array.isArray(userTypes)) {
            // '.some()' verifica se pelo menos um elemento no array satisfaz a condição
            return userTypes.some(type => typeof type === 'string' && type.toLowerCase() === tipoFeitoPorLower);
        }
        // Verifica se 'tipos' é uma string e se é igual ao tipo desejado (ignorando case)
        else if (typeof userTypes === 'string') {
            return userTypes.toLowerCase() === tipoFeitoPorLower;
        }
    
        // Se 'tipos' não for nem array nem string, ignora
        return false;
    });
    
    // Não se esqueça de corrigir o console.log também (se ainda não o fez):
    console.log(`[obterUsuariosTiktik] <span class="math-inline">\{usuariosFiltrados\.length\} usuários encontrados com tipo '</span>{tipoFeitoPor}' para ${produtoNome}.`);
    
    return usuariosFiltrados;
}

// --- Lógica de Renderização --- (Funções da resposta anterior)

// NOVA Função: Carregar e renderizar tabela de Arremate
async function carregarTabelaArremate(opsParaArrematar) {
    // ... (código da resposta anterior) ...
    console.log(`[carregarTabelaArremate] Renderizando ${opsParaArrematar.length} OPs pendentes.`);
    const tbody = document.getElementById('arremateTableBody');
    const paginationContainer = document.getElementById('arrematePaginationContainer');
    if (!tbody || !paginationContainer) return;

    tbody.innerHTML = ''; // Limpa tabela
    paginationContainer.innerHTML = ''; // Limpa paginação

    if (opsParaArrematar.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhum item aguardando arremate no momento.</td></tr>';
        return;
    }

    // Paginação
    const totalItems = opsParaArrematar.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageArremate);
    const startIndex = (currentPageArremate - 1) * itemsPerPageArremate;
    const endIndex = Math.min(startIndex + itemsPerPageArremate, totalItems);
    const paginatedOPs = opsParaArrematar.slice(startIndex, endIndex);

    // Busca usuários tiktik em paralelo para as OPs da página atual
    const usuariosTiktikPromises = paginatedOPs.map(op => obterUsuariosTiktikParaProduto(op.produto));
    const usuariosPorOP = await Promise.all(usuariosTiktikPromises);

    const fragment = document.createDocumentFragment();
    paginatedOPs.forEach((op, index) => {
        const tr = document.createElement('tr');
        tr.dataset.opNumero = op.numero; // Guarda o número da OP na linha
        tr.dataset.opEditId = op.edit_id; // Guarda o edit_id também

        const quantidadeFinal = obterQuantidadeFinalProduzida(op);
        const usuariosTiktikDisponiveis = usuariosPorOP[index];

        tr.innerHTML = `
            <td>${op.numero}</td>
            <td>${op.produto}</td>
            <td>${op.variante || '-'}</td>
            <td>${quantidadeFinal}</td>
            <td>
                <select class="select-usuario-tiktik" ${usuariosTiktikDisponiveis.length === 0 ? 'disabled' : ''}>
                    <option value="">${usuariosTiktikDisponiveis.length === 0 ? 'Nenhum Tiktik' : 'Selecione...'}</option>
                    ${usuariosTiktikDisponiveis.map(user => `<option value="${user.nome}">${user.nome}</option>`).join('')}
                </select>
            </td>
            <td>
                <button class="botao-lancar-arremate" ${usuariosTiktikDisponiveis.length === 0 ? 'disabled' : ''}>
                    Lançar Arremate
                </button>
            </td>
        `;

        // Pega a célula de Ação (a última TD criada pelo innerHTML acima)
        const tdAction = tr.cells[tr.cells.length - 1];

        const btnLancar = document.createElement('button');
        btnLancar.textContent = 'Lançar Arremate';
        btnLancar.className = 'botao-lancar-arremate';

        btnLancar.disabled = usuariosTiktikDisponiveis.length === 0;

        if (!permissoes.includes('lancar-arremate')) {
            btnLancar.disabled = true; // Garante que o botão fique desabilitado
            btnLancar.title = 'Permissão necessária: lançar-arremate'; // Dica útil
            // Adiciona classe para CSS (opcional)
            btnLancar.classList.add('botao-sem-permissao');
        }

        btnLancar.addEventListener('click', handleLancarArremateClick);
        tdAction.appendChild(btnLancar);
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    // Renderizar Paginação Arremate
    if (totalPages > 1) {
        let paginationHTML = `<button class="pagination-btn prev" data-page="${Math.max(1, currentPageArremate - 1)}" ${currentPageArremate === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageArremate} de ${totalPages}</span>`;
        paginationHTML += `<button class="pagination-btn next" data-page="${Math.min(totalPages, currentPageArremate + 1)}" ${currentPageArremate === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainer.innerHTML = paginationHTML;

        paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageArremate = parseInt(btn.dataset.page);
                carregarTabelaArremate(opsParaArrematarGlobal); // Re-renderiza com a nova página
            });
        });
    }
}

// MODIFICADA: Carregar tabela de produtos prontos para embalar
async function carregarTabelaProdutosEmbalagem(opsProntas) {
     // ... (código da resposta anterior, com ajustes abaixo) ...
    console.log(`[carregarTabelaProdutosEmbalagem] Renderizando ${opsProntas.length} OPs prontas.`);
    const tbody = document.getElementById('produtosTableBody');
    const paginationContainer = document.getElementById('paginationContainer'); // Paginação existente
    const searchInput = document.getElementById('searchProduto'); // Input de busca

    if (!tbody || !paginationContainer || !searchInput) return;

    tbody.innerHTML = '';
    paginationContainer.innerHTML = '';

    // Aplicar busca local
    const search = searchInput.value.toLowerCase();
    let filteredOPs = opsProntas;
    if (search) {
        filteredOPs = opsProntas.filter(op =>
            op.produto.toLowerCase().includes(search) ||
            (op.variante && op.variante.toLowerCase().includes(search)) ||
            op.numero.toString().includes(search)
        );
    }

     // Paginação (Embalagem) - Aplicada *após* o filtro de busca
    const totalItems = filteredOPs.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageEmbalagem);

     // Ajusta a página atual se o filtro reduziu o número total de páginas
    if (currentPageEmbalagem > totalPages) {
       currentPageEmbalagem = Math.max(1, totalPages);
    }

    const startIndex = (currentPageEmbalagem - 1) * itemsPerPageEmbalagem;
    const endIndex = Math.min(startIndex + itemsPerPageEmbalagem, totalItems);
    const paginatedOPs = filteredOPs.slice(startIndex, endIndex);

    if (paginatedOPs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">${search ? 'Nenhum produto encontrado com o termo "' + search + '".' : 'Nenhum produto pronto para embalar.'}</td></tr>`;
        // Limpa paginação se não há itens
        paginationContainer.innerHTML = '';
        return; // Sai da função se não há o que renderizar
    }


    const fragment = document.createDocumentFragment();
    const produtosCadastrados = await buscarTodosProdutos();

    for (const op of paginatedOPs) { // Usar for...of para permitir await dentro do loop
        const tr = document.createElement('tr');
        tr.dataset.opNumero = op.numero;
        tr.dataset.opEditId = op.edit_id;
        tr.dataset.produto = op.produto;
        tr.dataset.variante = op.variante || '-';

        const quantidadeInicialArrematada = op.quantidade_arrematada ?? obterQuantidadeFinalProduzida(op); // Usa qtd arrematada ou da OP
        // Busca a quantidade real disponível AGORA
        const quantidadeDisponivelReal = await obterQuantidadeDisponivelAjustada(
            op.produto,
            op.variante || '-',
            quantidadeInicialArrematada,
            op.numero // Passa o número da OP para buscar dados específicos
        );

        tr.dataset.quantidadeDisponivel = quantidadeDisponivelReal; // Guarda a quantidade REAL atual

        // Busca imagem
        const produtoCadastrado = produtosCadastrados.find(p => p.nome === op.produto);
        const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (op.variante === '-' ? '' : op.variante));
        const imagem = gradeItem?.imagem || '';

        tr.innerHTML = `
            <td>${op.produto}</td>
            <td>${op.variante || '-'}</td>
            <td><div class="thumbnail">${imagem ? `<img src="${imagem}" alt="Miniatura">` : ''}</div></td>
            <td class="quantidade-embalagem">${quantidadeDisponivelReal}</td> <td>${op.numero}</td>
        `;

        if (quantidadeDisponivelReal > 0) {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => handleProductClick(op));
        } else {
            tr.style.opacity = '0.5'; // Indica visualmente que não há mais estoque
            tr.style.cursor = 'not-allowed';
            tr.title = 'Quantidade zerada para embalagem';
        }

        fragment.appendChild(tr);
    }

    tbody.appendChild(fragment);

    // Renderizar Paginação Embalagem
    if (totalPages > 1) {
        let paginationHTML = `<button class="pagination-btn prev" data-page="${Math.max(1, currentPageEmbalagem - 1)}" ${currentPageEmbalagem === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPageEmbalagem} de ${totalPages}</span>`;
        paginationHTML += `<button class="pagination-btn next" data-page="${Math.min(totalPages, currentPageEmbalagem + 1)}" ${currentPageEmbalagem === totalPages ? 'disabled' : ''}>Próximo</button>`;
        paginationContainer.innerHTML = paginationHTML;

        paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentPageEmbalagem = parseInt(btn.dataset.page);
                carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal); // Re-renderiza embalagem
            });
        });
    } else {
         paginationContainer.innerHTML = ''; // Limpa se só tem 1 página
    }

    // Chamar adjustForMobile
    adjustForMobile();
}


// --- Lógica de Eventos --- (Handlers da resposta anterior + Ajustes)

// NOVO: Handler para clique no botão "Lançar Arremate"
async function handleLancarArremateClick(event) {
    // ... (código da resposta anterior, sem alterações significativas aqui) ...
    const btn = event.target;
    const tr = btn.closest('tr');
    const opNumero = tr.dataset.opNumero;
    const opEditId = tr.dataset.opEditId;
    const selectUser = tr.querySelector('.select-usuario-tiktik');
    const usuarioTiktik = selectUser?.value;
    const opOriginal = opsParaArrematarGlobal.find(op => op.numero === opNumero);

    if (!opOriginal) {
        mostrarPopupMensagem('Erro: OP não encontrada nos dados locais.', 'erro');
        return;
    }
    if (!usuarioTiktik) {
        mostrarPopupMensagem('Por favor, selecione o usuário que realizou o arremate.', 'aviso');
        selectUser.focus(); // Foca no select
        return;
    }

    const quantidadeArrematada = obterQuantidadeFinalProduzida(opOriginal);

    const lockKey = `${opNumero}`;
    if (lancamentosArremateEmAndamento.has(lockKey)) return;

    btn.disabled = true;
    btn.textContent = 'Lançando...';
    lancamentosArremateEmAndamento.add(lockKey);

    try {
        const arremateData = {
            op_numero: opNumero,
            op_edit_id: opEditId,
            produto: opOriginal.produto,
            variante: opOriginal.variante || null,
            quantidade_arrematada: quantidadeArrematada,
            usuario_tiktik: usuarioTiktik
        };

        const resultado = await fetchFromAPI('/arremates', {
            method: 'POST',
            body: JSON.stringify(arremateData)
        });

        console.log('[handleLancarArremateClick] Arremate salvo:', resultado);
        mostrarPopupMensagem(`Arremate para OP ${opNumero} lançado com sucesso!`, 'sucesso');

        // Remove a OP do cache local para garantir que não seja re-buscada incorretamente
        opDataCache.delete(opNumero);

        await atualizarListasArremateEEmbalagem(); // Atualiza ambas as tabelas

    } catch (error) {
        console.error(`[handleLancarArremateClick] Erro ao lançar arremate para OP ${opNumero}:`, error);
        mostrarPopupMensagem(`Erro ao lançar arremate: ${error.message || 'Erro desconhecido'}.`, 'erro');
         // Reabilita o botão em caso de erro SOMENTE se ele ainda existir no DOM
         if (tr.contains(btn)) {
            btn.disabled = false;
            btn.textContent = 'Lançar Arremate';
        }
    } finally {
        lancamentosArremateEmAndamento.delete(lockKey);
    }
}


// MODIFICADO: Handler para clique na tabela de produtos prontos
async function handleProductClick(op) {
    // ... (código da resposta anterior, com quantidade já ajustada) ...
    console.log(`[handleProductClick] Clicado em Produto pronto: ${op.produto}, Variante: ${op.variante || '-'}, OP: ${op.numero}`);

    const arremateView = document.getElementById('arremateView');
    const mainView = document.getElementById('mainView'); // Lista de embalagem
    const embalagemView = document.getElementById('embalarView'); // Detalhes (Unidade/Kit)

    // Busca a quantidade disponível REAL NO MOMENTO DO CLIQUE
    const quantidadeInicial = op.quantidade_arrematada ?? obterQuantidadeFinalProduzida(op);
    const quantidadeDisponivelReal = await obterQuantidadeDisponivelAjustada(
        op.produto,
        op.variante || '-',
        quantidadeInicial,
        op.numero
    );

    // Verifica se ainda há quantidade após buscar novamente
    if (quantidadeDisponivelReal <= 0) {
        mostrarPopupMensagem('Este item não possui mais quantidade disponível para embalagem.', 'aviso');
        // Recarrega a tabela de embalagem para remover/atualizar o item visualmente
        await carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal);
        return;
    }


    if (arremateView && mainView && embalagemView) {
        // Não precisa esconder arremateView aqui, ele já deve estar escondido
        mainView.style.display = 'none'; // Esconde a lista de embalagem
        embalagemView.style.display = 'block'; // Mostra a tela de detalhes
        window.location.hash = '#embalar';

        localStorage.setItem('embalagemAtual', JSON.stringify({
            op_numero: op.numero, // Importante para atualizar a OP correta
            op_edit_id: op.edit_id, // Importante para atualizar a OP correta
            produto: op.produto,
            variante: op.variante || '-',
            quantidade: quantidadeDisponivelReal // Passa a quantidade REAL disponível
        }));

        carregarEmbalagem(op.produto, op.variante || '-', quantidadeDisponivelReal);
    } else {
        console.error('[handleProductClick] Views não encontradas (mainView, embalarView)');
    }
}

// Função para atualizar ambas as listas (Arremate e Embalagem)
async function atualizarListasArremateEEmbalagem() {
    // ... (código da resposta anterior, com ajustes na decisão de qual view mostrar) ...
     console.log('[atualizarListasArremateEEmbalagem] Atualizando listas...');
    try {
        // Busca os dados mais recentes em paralelo
        const [opsFinalizadas, arrematesRegistrados] = await Promise.all([
            buscarOpsFinalizadas(), // Busca OPs finalizadas
            buscarArrematesRegistrados() // Busca todos os arremates
        ]);

        // Processa os dados para separar as listas
        const numerosArrematados = new Set(arrematesRegistrados.map(a => a.op_numero));

        opsParaArrematarGlobal = opsFinalizadas.filter(op => !numerosArrematados.has(op.numero));
        opsProntasParaEmbalarGlobal = opsFinalizadas
            .filter(op => numerosArrematados.has(op.numero))
            .map(op => {
                const arremateInfo = arrematesRegistrados.find(a => a.op_numero === op.numero);
                return { ...op, quantidade_arrematada: arremateInfo?.quantidade_arrematada };
            });

        // Ajusta páginas atuais se necessário
        const totalPagesArremate = Math.ceil(opsParaArrematarGlobal.length / itemsPerPageArremate);
        currentPageArremate = Math.min(currentPageArremate, Math.max(1, totalPagesArremate));

        // A paginação da embalagem é recalculada dentro de carregarTabelaProdutosEmbalagem

        // Re-renderiza as tabelas
        await carregarTabelaArremate(opsParaArrematarGlobal);
        await carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal); // Passa a lista completa para ela filtrar e paginar

         // Controla a visibilidade das seções principais
         const arremateView = document.getElementById('arremateView');
         const embalagemListView = document.getElementById('embalagemListView'); // <--- MUDOU AQUI
         const embalarView = document.getElementById('embalarView'); // Detalhe embalagem
        
         if (window.location.hash === '#embalar') {
             // Se já está na tela de detalhe, mantém ela visível
             arremateView.style.display = 'none';
             embalagemListView.style.display = 'none'; // <--- MUDOU AQUI
             embalarView.style.display = 'block';
         } else {
             // Se não está na tela de detalhe, mostra as listas apropriadas
             embalarView.style.display = 'none'; // Esconde detalhe
             arremateView.style.display = opsParaArrematarGlobal.length > 0 ? 'block' : 'none';
             embalagemListView.style.display = 'block'; // <--- MUDOU AQUI (Sempre mostra a lista, mesmo vazia)
        } 

    } catch (error) {
        console.error('[atualizarListasArremateEEmbalagem] Erro:', error);
        mostrarPopupMensagem('Erro ao atualizar dados da página.', 'erro');
    }
    console.log('[atualizarListasArremateEEmbalagem] Listas atualizadas.');
}


// --- Funções Existentes (Finalizando a implementação) ---

// Função para mostrar popup
function mostrarPopupMensagem(mensagem, tipo = 'erro') {
    // ... (código da resposta anterior ou sua implementação) ...
    console.log(`[POPUP-${tipo.toUpperCase()}]: ${mensagem}`);
        const popup = document.createElement('div');
        popup.className = `popup-mensagem popup-${tipo}`;
        popup.style.position = 'fixed';
        popup.style.bottom = '20px';
        popup.style.left = '50%';
        popup.style.transform = 'translateX(-50%)';
        popup.style.padding = '10px 20px';
        popup.style.borderRadius = '5px';
        popup.style.backgroundColor = tipo === 'sucesso' ? '#d4edda' : tipo === 'aviso' ? '#fff3cd' : '#f8d7da';
        popup.style.color = tipo === 'sucesso' ? '#155724' : tipo === 'aviso' ? '#856404' : '#721c24';
        popup.style.zIndex = '1001';
        popup.textContent = mensagem;
        document.body.appendChild(popup);
        setTimeout(() => {
           if (document.body.contains(popup)) {
               document.body.removeChild(popup);
           }
        }, 4000);
}

// Função debounce
function debounce(func, wait) {
    // ... (código da resposta anterior ou sua implementação) ...
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

// Função para mobile
function adjustForMobile() {
    // ... (código da resposta anterior) ...
     if (window.innerWidth <= 600) { // Ajuste o breakpoint se necessário
            const table = document.getElementById('produtosTable'); // Foca na tabela de embalagem
            const tableBody = document.getElementById('produtosTableBody');
            const productsSection = document.querySelector('.products-section'); // Container pai

             if (!table || !tableBody || !productsSection) return; // Sai se elementos não existem

            const existingCardContainer = productsSection.querySelector('.product-card-container');
            if (existingCardContainer) existingCardContainer.remove(); // Remove cards antigos

            const cardContainer = document.createElement('div');
            cardContainer.className = 'product-card-container';

            let hasRows = false;
            Array.from(tableBody.getElementsByTagName('tr')).forEach(row => {
                const cells = row.getElementsByTagName('td');
                 // Verifica se a linha tem células e não é a mensagem de "nenhum item"
                 if (cells.length > 0 && row.querySelectorAll('td[colspan]').length === 0) {
                    hasRows = true;
                    const card = document.createElement('div');
                    card.className = 'product-card';
                    // Copia os data attributes importantes
                    Object.keys(row.dataset).forEach(key => {
                        card.dataset[key] = row.dataset[key];
                    });

                     // Adicionar campos ao card
                    card.innerHTML = `
                        <div><strong>OP:</strong> ${cells[4]?.textContent || 'N/A'}</div>
                        <div><strong>Produto:</strong> ${cells[0]?.textContent || 'N/A'}</div>
                        <div><strong>Variação:</strong> ${cells[1]?.textContent || '-'}</div>
                        <div class="thumbnail">${cells[2]?.innerHTML || ''}</div>
                        <div><strong>Qtd Disp.:</strong> ${cells[3]?.textContent || '0'}</div>
                    `;

                     // Manter a funcionalidade de clique se a linha for clicável
                    if (row.style.cursor === 'pointer') {
                        card.addEventListener('click', () => row.click());
                    } else {
                         card.style.opacity = '0.5'; // Mantém estilo de desabilitado
                         card.style.cursor = 'not-allowed';
                         card.title = 'Quantidade zerada para embalagem';
                    }


                    cardContainer.appendChild(card);
                }
            });

            if (hasRows) {
                 if (table.nextSibling) productsSection.insertBefore(cardContainer, table.nextSibling);
                 else productsSection.appendChild(cardContainer);
                 table.style.display = 'none';
            } else {
                 table.style.display = ''; // Mostra a tabela (com msg de nenhum item)
            }


        } else {
             // Tela maior: garante que a tabela esteja visível e remove os cards
            const table = document.getElementById('produtosTable');
             if (table) table.style.display = '';

             const existingCardContainer = document.querySelector('.product-card-container');
            if (existingCardContainer) existingCardContainer.remove();
        }
}

// Funções relacionadas à lógica de Kits e Unidades
// (Cole suas funções temKitsDisponiveis, carregarKitsDisponiveis, etc. aqui)
// ...
// Função para verificar se há kits disponíveis para a variação
async function temKitsDisponiveis(produto, variante) {
    const produtosCadastrados = await buscarTodosProdutos() || [];
    //console.log('[temKitsDisponiveis] Todos os produtos cadastrados:', produtosCadastrados);

    const kits = produtosCadastrados.filter(p => p.is_kit);
    const varianteAtual = variante === '-' ? '' : variante.toLowerCase();

    //console.log(`[temKitsDisponiveis] Verificando kits para Produto: ${produto}, Variante: ${varianteAtual}`);
    //console.log('[temKitsDisponiveis] Kits encontrados:', kits);

    const hasKits = kits.some(kit => {
        if (!kit.grade) {
            //console.log(`[temKitsDisponiveis] Kit ${kit.nome} não tem grade.`);
            return false;
        }
        return kit.grade.some(g => {
            if (!g.composicao || g.composicao.length === 0) {
                //console.log(`[temKitsDisponiveis] Variação ${g.variacao} do kit ${kit.nome} não tem composição.`);
                return false;
            }
            // Verifica se ALGUM item na composição da grade do kit bate com o produto/variante base
            return g.composicao.some(c => {
                // Assume que se c.produto não está definido, ele usa o produto base do kit (que não é o que queremos aqui)
                // Queremos comparar com o PRODUTO E VARIANTE que estamos tentando embalar
                const produtoComposicao = c.produto || kit.nome; // Se item.produto não existir, não deve bater
                const variacaoComposicao = c.variacao === '-' ? '' : (c.variacao || '').toLowerCase();
                const isMatch = produtoComposicao.toLowerCase() === produto.toLowerCase() && variacaoComposicao === varianteAtual;
                //console.log(`[temKitsDisponiveis] Kit ${kit.nome}, Grade ${g.variacao}: Comparando Comp. ${produtoComposicao}:${variacaoComposicao} com Base ${produto}:${varianteAtual} -> ${isMatch}`);
                return isMatch;
            });
        });
    });

    console.log(`[temKitsDisponiveis] Produto ${produto}:${varianteAtual} é usado em algum kit? ${hasKits}`);
    return hasKits;
}

// Função para carregar os kits disponíveis que USAM o produto/variante atual
async function carregarKitsDisponiveis(produtoBase, varianteBase) {
    const produtosCadastrados = await buscarTodosProdutos() || [];
    const kitsList = document.getElementById('kits-list');
    kitsList.innerHTML = ''; // Limpa a lista

    console.log(`[carregarKitsDisponiveis] Buscando kits que usam Produto: ${produtoBase}, Variante: ${varianteBase}`);

    const varianteBaseNormalizada = varianteBase === '-' ? '' : varianteBase.toLowerCase();

    const kitsFiltrados = produtosCadastrados.filter(kit => {
        if (!kit.is_kit || !kit.grade) return false;

        // Verifica se ALGUMA grade do kit contém o produto/variante base na sua composição
        return kit.grade.some(grade =>
            grade.composicao && grade.composicao.some(item => {
                const produtoComposicao = item.produto || kit.nome; // Se item.produto não existe, assume produto do kit
                const itemVariacaoNormalizada = item.variacao === '-' ? '' : (item.variacao || '').toLowerCase();
                return produtoComposicao.toLowerCase() === produtoBase.toLowerCase() && itemVariacaoNormalizada === varianteBaseNormalizada;
            })
        );
    });

    console.log('[carregarKitsDisponiveis] Kits filtrados que usam o item base:', kitsFiltrados.map(k => k.nome));

    if (kitsFiltrados.length === 0) {
        kitsList.innerHTML = '<p>Nenhum kit usa esta variação específica.</p>';
        // Considerar desabilitar a aba Kit ou mostrar mensagem clara
        return;
    }

    // Cria botões para cada kit encontrado
    kitsFiltrados.forEach(kit => {
        const button = document.createElement('button');
        button.textContent = kit.nome;
        button.addEventListener('click', () => {
            document.querySelectorAll('#kits-list button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            // Carrega as variações DESTE kit que usam o produto/variante base
            carregarVariacoesKit(kit.nome, produtoBase, varianteBase);
        });
        kitsList.appendChild(button);
    });

    // Seleciona o primeiro kit por padrão
    if (kitsList.children.length > 0) {
        kitsList.children[0].click(); // Simula o clique para carregar as variações
    }
}

// Função para carregar as variações de um kit específico QUE USAM o produto/variante base
async function carregarVariacoesKit(nomeKit, produtoBase, varianteBase) {
    const produtosCadastrados = await buscarTodosProdutos() || [];
    const kitVariacoesSelect = document.getElementById('kit-variacoes');
    if (!kitVariacoesSelect) return;

    kitVariacoesSelect.innerHTML = '<option value="">Carregando...</option>';
    console.log(`[carregarVariacoesKit] Carregando variações do kit ${nomeKit} que usam ${produtoBase}:${varianteBase}`);

    const kit = produtosCadastrados.find(p => p.is_kit && p.nome === nomeKit);
    if (!kit || !kit.grade) {
        kitVariacoesSelect.innerHTML = '<option value="">Erro: Kit não encontrado</option>';
        return;
    }

    const varianteBaseNormalizada = varianteBase === '-' ? '' : varianteBase.toLowerCase();

    // Filtra as grades do kit: apenas aquelas cuja composição INCLUI o produto/variante base
    const variacoesFiltradas = kit.grade.filter(grade => {
        if (!grade.composicao || grade.composicao.length === 0) return false;
        return grade.composicao.some(item => {
             const produtoComposicao = item.produto || kit.nome;
             const itemVariacaoNormalizada = item.variacao === '-' ? '' : (item.variacao || '').toLowerCase();
             return produtoComposicao.toLowerCase() === produtoBase.toLowerCase() && itemVariacaoNormalizada === varianteBaseNormalizada;
        });
    });

     console.log('[carregarVariacoesKit] Variações do kit filtradas:', variacoesFiltradas.map(g => g.variacao));


    if (variacoesFiltradas.length === 0) {
        kitVariacoesSelect.innerHTML = '<option value="">Nenhuma variação deste kit usa este item</option>';
         // Limpa a tabela de kit se estava visível
         document.getElementById('kit-table-body').innerHTML = '';
         document.getElementById('kit-footer').innerHTML = '';
         document.getElementById('kit-error-message').textContent = 'Nenhuma variação do kit selecionado utiliza o produto/variante base.';
         document.getElementById('kit-error-message').classList.remove('hidden');
        return;
    }

    kitVariacoesSelect.innerHTML = '<option value="">Selecione uma variação do Kit</option>';
    variacoesFiltradas.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade.variacao; // A variação do *kit*
        option.textContent = grade.variacao;
        kitVariacoesSelect.appendChild(option);
    });

     // Limpa listeners antigos antes de adicionar novo
     const newSelect = kitVariacoesSelect.cloneNode(true); // Clona para limpar listeners
     kitVariacoesSelect.parentNode.replaceChild(newSelect, kitVariacoesSelect);

     newSelect.addEventListener('change', () => {
         const variacaoKitSelecionada = newSelect.value;
         if (variacaoKitSelecionada) {
             console.log(`[carregarVariacoesKit] Variação do kit selecionada: ${variacaoKitSelecionada}`);
             // Carrega a tabela de composição para esta variação do kit
             carregarTabelaKit(nomeKit, variacaoKitSelecionada);
         } else {
              // Limpa a tabela se "Selecione" for escolhido
              document.getElementById('kit-table-body').innerHTML = '';
              document.getElementById('kit-footer').innerHTML = '';
              document.getElementById('kit-error-message').classList.add('hidden');
         }
     });

     // Seleciona a primeira variação por padrão, se houver apenas uma? Ou deixa "Selecione"?
     // if (variacoesFiltradas.length === 1) {
     //     newSelect.value = variacoesFiltradas[0].variacao;
     //     newSelect.dispatchEvent(new Event('change')); // Dispara o evento para carregar a tabela
     // }
}


// Função para carregar a mini tabela da composição do kit selecionado
async function carregarTabelaKit(kitNome, variacaoKitSelecionada) {
    const produtosCadastrados = await buscarTodosProdutos() || [];
    const kit = produtosCadastrados.find(p => p.nome === kitNome && p.is_kit);
    const kitTableBody = document.getElementById('kit-table-body');
    const kitFooter = document.getElementById('kit-footer');
    const kitErrorMessage = document.getElementById('kit-error-message');

    kitTableBody.innerHTML = '<tr><td colspan="2">Carregando composição...</td></tr>'; // Feedback
    kitFooter.innerHTML = ''; // Limpa footer
    kitErrorMessage.classList.add('hidden'); // Esconde erros

    if (!kit || !kit.grade) {
        kitErrorMessage.textContent = 'Kit não encontrado ou sem grade.';
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = '';
        return;
    }

    const variacaoDoKit = kit.grade.find(g => g.variacao === variacaoKitSelecionada);
    if (!variacaoDoKit || !variacaoDoKit.composicao || variacaoDoKit.composicao.length === 0) {
        kitErrorMessage.textContent = 'Variação do kit sem composição definida.';
        kitErrorMessage.classList.remove('hidden');
        kitTableBody.innerHTML = '';
        return;
    }

    const composicao = variacaoDoKit.composicao;
    kitTableBody.innerHTML = ''; // Limpa o "Carregando..."

    let menorQuantidadePossivel = Infinity;
    let todasDisponiveis = true;
    const fragment = document.createDocumentFragment();

    // Precisamos buscar as quantidades disponíveis ATUAIS de CADA item da composição
    for (const item of composicao) {
        const produtoComponente = item.produto || kit.nome; // Nome do produto componente
        const varianteComponente = item.variacao || '-'; // Variação do componente
        const quantidadeNecessaria = parseInt(item.quantidade) || 1; // Qtd necessária por kit

        // Busca a quantidade disponível AJUSTADA para este componente
        // A quantidade inicial vem da OP finalizada + arremate DELE
        // Precisamos encontrar a OP correspondente a este componente
        // ISSO É COMPLEXO! Assumindo que temos acesso a todas as OPs prontas
        const opComponente = opsProntasParaEmbalarGlobal.find(op =>
            op.produto === produtoComponente && (op.variante || '-') === varianteComponente
        );

        let qtdDisponivelComponente = 0;
        if (opComponente) {
             const qtdInicialComp = opComponente.quantidade_arrematada ?? obterQuantidadeFinalProduzida(opComponente);
             qtdDisponivelComponente = await obterQuantidadeDisponivelAjustada(
                 produtoComponente,
                 varianteComponente,
                 qtdInicialComp,
                 opComponente.numero
             );
        }


        if (qtdDisponivelComponente < quantidadeNecessaria) {
            todasDisponiveis = false;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.variacao || 'Padrão'} (${quantidadeNecessaria}x)</td>
            <td><input type="number" class="readonly" value="${qtdDisponivelComponente}" readonly title="Disponível: ${qtdDisponivelComponente}"></td>
        `;
         if (qtdDisponivelComponente < quantidadeNecessaria) {
             tr.style.color = 'red'; // Destaca itens faltando
             tr.title = `Faltam ${quantidadeNecessaria - qtdDisponivelComponente} unidades`;
         }

        fragment.appendChild(tr);

        // Calcula quantos kits são possíveis com base neste item
        const qtdPossivelComEsteItem = Math.floor(qtdDisponivelComponente / quantidadeNecessaria);
        menorQuantidadePossivel = Math.min(menorQuantidadePossivel, qtdPossivelComEsteItem);
    }

    kitTableBody.appendChild(fragment);

    // Define a quantidade máxima de kits montáveis (0 se algum item falta)
    const maxKitsMontaveis = todasDisponiveis ? menorQuantidadePossivel : 0;

    if (maxKitsMontaveis <= 0) {
         kitErrorMessage.textContent = 'Quantidade insuficiente de um ou mais componentes para montar o kit.';
         kitErrorMessage.classList.remove('hidden');
    }


    // Monta o Footer com input e botão
    kitFooter.innerHTML = `
        <div class="qtd-disponivel-container">
            <p>Kits Montáveis: <span id="qtd-disponivel-kits">${maxKitsMontaveis}</span></p>
        </div>
        <div class="qtd-enviar-container">
            <label>Qtd. Kits a Enviar:
                <input type="number" id="qtd-enviar-kits" min="0" max="${maxKitsMontaveis}" value="0" ${maxKitsMontaveis <= 0 ? 'disabled' : ''}>
            </label>
            <button id="kit-estoque-btn" ${maxKitsMontaveis <= 0 ? 'disabled' : ''}>Embalar Kit</button>
        </div>
    `;

    const qtdEnviarKitsInput = document.getElementById('qtd-enviar-kits');
    const kitEstoqueBtn = document.getElementById('kit-estoque-btn');

    // Listener para validar input de quantidade de kits
    qtdEnviarKitsInput.addEventListener('input', () => {
        let valor = parseInt(qtdEnviarKitsInput.value) || 0;
        if (valor < 0) {
             qtdEnviarKitsInput.value = 0;
             valor = 0;
        } else if (valor > maxKitsMontaveis) {
            qtdEnviarKitsInput.value = maxKitsMontaveis;
            valor = maxKitsMontaveis;
        }
        kitEstoqueBtn.disabled = valor <= 0; // Habilita botão se qtd > 0
    });


    // Listener para o botão de enviar kit
    kitEstoqueBtn.addEventListener('click', () => {
        const qtdKitsParaEnviar = parseInt(qtdEnviarKitsInput.value) || 0;
        if (qtdKitsParaEnviar > 0 && qtdKitsParaEnviar <= maxKitsMontaveis) {
            enviarKitParaEstoque(kitNome, variacaoKitSelecionada, qtdKitsParaEnviar);
        } else {
            mostrarPopupMensagem('Quantidade de kits inválida ou insuficiente.', 'erro');
        }
    });

     document.getElementById('kit-table-container').classList.remove('hidden'); // Mostra a tabela
}


// Função para enviar o kit ao estoque (PRECISA SER AJUSTADA CUIDADOSAMENTE)
async function enviarKitParaEstoque(kitNome, variacaoKit, qtdKitsEnviados) {
    console.log(`[enviarKitParaEstoque] Enviando ${qtdKitsEnviados} kit(s) de ${kitNome} - ${variacaoKit}`);
    const btn = document.getElementById('kit-estoque-btn'); // Para desabilitar durante o processo
    if (btn) btn.disabled = true;


    try {
        const produtosCadastrados = await buscarTodosProdutos();
        const kit = produtosCadastrados.find(p => p.nome === kitNome && p.is_kit);
        if (!kit) throw new Error('Definição do kit não encontrada.');

        const variacaoDoKit = kit.grade.find(g => g.variacao === variacaoKit);
        if (!variacaoDoKit || !variacaoDoKit.composicao) throw new Error('Composição da variação do kit não encontrada.');

        const composicao = variacaoDoKit.composicao;

        // Itera sobre cada item da composição para deduzir do estoque
        for (const item of composicao) {
            const produtoComponente = item.produto || kit.nome;
            const varianteComponente = item.variacao || '-';
            const quantidadeNecessariaPorKit = parseInt(item.quantidade) || 1;
            const quantidadeTotalUsada = qtdKitsEnviados * quantidadeNecessariaPorKit;

            // Encontra a OP correspondente a este componente na lista global de OPs prontas
            const opComponente = opsProntasParaEmbalarGlobal.find(op =>
                op.produto === produtoComponente && (op.variante || '-') === varianteComponente
            );

            if (!opComponente) {
                 throw new Error(`OP finalizada para o componente ${produtoComponente}:${varianteComponente} não encontrada.`);
            }

            console.log(`   - Consumindo ${quantidadeTotalUsada} de ${produtoComponente}:${varianteComponente} (OP: ${opComponente.numero})`);

            // Atualiza a quantidade embalada DESTA OP componente
            await atualizarQuantidadeEmbalada(
                produtoComponente,
                varianteComponente,
                quantidadeTotalUsada,
                opComponente.numero, // Passa o número da OP componente
                opComponente.edit_id // Passa o edit_id da OP componente
            );
        }

        // TODO: Registrar a SAÍDA dos componentes e a ENTRADA do KIT MONTADO no estoque
        // Isso pode envolver chamadas API adicionais para um sistema de inventário, se existir.
        // Por enquanto, apenas deduzimos a 'quantidadeEmbalada' das OPs componentes.

        mostrarPopupMensagem(`${qtdKitsEnviados} kit(s) de ${kitNome} - ${variacaoKit} registrados como embalados!`, 'sucesso');

        // Voltar para a lista principal e atualizar tudo
        window.location.hash = '';
        localStorage.removeItem('embalagemAtual');
        await atualizarListasArremateEEmbalagem();

    } catch (error) {
        console.error('[enviarKitParaEstoque] Erro:', error);
        mostrarPopupMensagem(`Erro ao embalar kit: ${error.message}`, 'erro');
         if (btn) btn.disabled = false; // Reabilita o botão em caso de erro
    }
}


// Função que calcula a quantidade disponível real (Refinada)
async function obterQuantidadeDisponivelAjustada(produto, variante, quantidadeInicial, opNumero) {
    console.log(`[obterQuantidadeDisponivelAjustada] Verificando ${produto}:${variante} (OP: ${opNumero}). Qtd Inicial: ${quantidadeInicial}`);
    try {
        // Busca os dados da OP específica (do cache ou API) para obter quantidadeEmbalada
        const op = await buscarOpPorNumero(opNumero);

        if (!op) {
             console.warn(`[obterQuantidadeDisponivelAjustada] OP ${opNumero} não encontrada para buscar qtdEmbalada.`);
             return Math.max(0, quantidadeInicial); // Retorna a inicial se não achar a OP
        }

        // Assume que a OP tem um campo 'quantidadeEmbalada' atualizado pela API
        const quantidadeJaEmbalada = parseInt(op.quantidadeEmbalada) || 0;
        const qtdAjustada = quantidadeInicial - quantidadeJaEmbalada;

        console.log(`   - Qtd já embalada (API): ${quantidadeJaEmbalada}. Qtd Ajustada: ${qtdAjustada}`);
        return Math.max(0, qtdAjustada); // Garante que não seja negativo

    } catch (error) {
        console.error(`[obterQuantidadeDisponivelAjustada] Erro ao buscar/ajustar qtd para OP ${opNumero}:`, error);
        return Math.max(0, quantidadeInicial); // Retorna a inicial em caso de erro
    }
}

// Função para atualizar a quantidade embalada (UNIDADE ou COMPONENTE de KIT)
async function atualizarQuantidadeEmbalada(produto, variante, quantidadeEnviada, opNumero, opEditId) {
    console.log(`[atualizarQuantidadeEmbalada] Atualizando OP ${opNumero}: +${quantidadeEnviada} de ${produto}:${variante}`);
    if (!opNumero && !opEditId) {
         console.error('[atualizarQuantidadeEmbalada] Falta opNumero ou opEditId para atualizar.');
         throw new Error('Identificador da OP não fornecido para atualização.');
    }

    try {
        // Busca a OP atual para obter a quantidade já embalada
        const opAtual = await buscarOpPorNumero(opNumero);
        const quantidadeJaEmbaladaAtual = parseInt(opAtual?.quantidadeEmbalada) || 0;
        const novaQuantidadeEmbalada = quantidadeJaEmbaladaAtual + quantidadeEnviada;

        const dadosAtualizados = {
            // Envia o identificador que a API espera (edit_id ou numero)
             edit_id: opEditId || undefined, // Envia se tiver
             numero: opEditId ? undefined : opNumero, // Envia numero se não tiver edit_id
             quantidadeEmbalada: novaQuantidadeEmbalada // Envia o NOVO TOTAL embalado
        };

        await fetchFromAPI('/ordens-de-producao', {
            method: 'PUT',
            body: JSON.stringify(dadosAtualizados)
        });

        console.log(`[atualizarQuantidadeEmbalada] OP ${opNumero} atualizada. Nova qtdEmbalada: ${novaQuantidadeEmbalada}`);

        // Atualiza o cache local da OP
        if (opAtual) {
            opAtual.quantidadeEmbalada = novaQuantidadeEmbalada;
            opDataCache.set(opNumero, opAtual);
        } else {
            // Se não estava no cache, invalida para forçar busca na próxima vez
             opDataCache.delete(opNumero);
        }

        // Invalidar caches das listas pode ser necessário se elas não buscarem dados frescos sempre
        // invalidateCache('ordensFinalizadas'); // Ou similar, dependendo do seu cache

    } catch (error) {
        console.error('[atualizarQuantidadeEmbalada] Erro ao atualizar quantidade:', error);
        mostrarPopupMensagem(`Erro ao atualizar estoque da OP ${opNumero}.`, 'erro');
        throw error; // Re-lança para quem chamou saber do erro
    }
}


// MODIFICADA: Função principal que carrega a tela de embalagem (Unidade/Kit)
async function carregarEmbalagem(produto, variante, quantidadeDisponivel) {
    console.log(`[carregarEmbalagem] Carregando para ${produto}:${variante}, Qtd Disponível REAL: ${quantidadeDisponivel}`);
    const embalagemTitle = document.getElementById('embalagemTitle');
    const produtoNome = document.getElementById('produtoNome');
    const varianteNome = document.getElementById('varianteNome');
    const qtdDisponivelEl = document.getElementById('qtdDisponivel'); // Span que mostra qtd disponível
    const qtdEnviarInput = document.getElementById('qtdEnviar'); // Input para unidade
    const estoqueBtnUnidade = document.getElementById('estoqueBtn'); // Botão para unidade
    const embalagemThumbnail = document.getElementById('embalagemThumbnail');
    const kitTabBtn = document.querySelector('[data-tab="kit"]');
    const kitTabPanel = document.getElementById('kit-tab');
    const unidadeTabBtn = document.querySelector('[data-tab="unidade"]');
    const unidadeTabPanel = document.getElementById('unidade-tab');

    if (!embalagemTitle || !produtoNome || !varianteNome || !qtdDisponivelEl || !qtdEnviarInput || !estoqueBtnUnidade || !embalagemThumbnail || !kitTabBtn || !kitTabPanel || !unidadeTabBtn || !unidadeTabPanel) {
        console.error('[carregarEmbalagem] Um ou mais elementos DOM da tela de embalagem não foram encontrados');
        mostrarPopupMensagem('Erro ao carregar a interface de embalagem.', 'erro');
        window.location.hash = ''; // Volta para lista
        return;
    }

     // Busca dados da embalagem atual do localStorage
     const embalagemAtualData = JSON.parse(localStorage.getItem('embalagemAtual') || '{}');
     const opNumeroAtual = embalagemAtualData.op_numero;
     const opEditIdAtual = embalagemAtualData.op_edit_id;


     // Preenche informações básicas
     const produtoCadastrado = todosOsProdutos.find(p => p.nome === produto);
     const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (variante === '-' ? '' : variante));
     const imagem = gradeItem?.imagem || '';
     embalagemThumbnail.innerHTML = imagem ? `<img src="${imagem}" alt="Imagem da variação ${variante}">` : '';

     embalagemTitle.textContent = `Embalar: ${produto}${variante !== '-' ? ` - ${variante}` : ''} (OP: ${opNumeroAtual})`;
     produtoNome.textContent = produto;
     varianteNome.textContent = variante !== '-' ? `: ${variante}` : '';
     qtdDisponivelEl.textContent = quantidadeDisponivel; // Mostra a quantidade REAL disponível
     qtdDisponivelEl.classList.remove('changing'); // Reseta estilo
     qtdEnviarInput.value = ''; // Limpa input de unidade
     qtdEnviarInput.max = quantidadeDisponivel; // Define o máximo para o input
     estoqueBtnUnidade.disabled = true; // Desabilita botão unidade inicialmente


     // Lógica das Abas (Kit/Unidade)
     const temKits = await temKitsDisponiveis(produto, variante);
     console.log(`[carregarEmbalagem] Produto ${produto}:${variante} tem kits disponíveis? ${temKits}`);

     document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
     document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
     document.getElementById('kit-table-container')?.classList.add('hidden'); // Esconde tabela kit


     if (temKits) {
         kitTabBtn.style.display = 'inline-block';
         kitTabPanel.classList.remove('hidden'); // Mostra painel kit
         kitTabBtn.classList.add('active'); // Ativa aba kit
         unidadeTabPanel.classList.add('hidden'); // Esconde painel unidade
         await carregarKitsDisponiveis(produto, variante); // Carrega a lista de botões de kit
         console.log('[carregarEmbalagem] Aba "Kits" ativada.');
     } else {
         kitTabBtn.style.display = 'none'; // Esconde aba kit
         kitTabPanel.classList.add('hidden');
         unidadeTabBtn.classList.add('active'); // Ativa aba unidade
         unidadeTabPanel.classList.remove('hidden'); // Mostra painel unidade
         console.log('[carregarEmbalagem] Aba "Unidade" ativada (sem kits).');
     }


    // --- Configuração da Aba Unidade ---
    // Limpa listeners antigos do input e botão de unidade antes de adicionar novos
    const newQtdEnviarInput = qtdEnviarInput.cloneNode(true);
    qtdEnviarInput.parentNode.replaceChild(newQtdEnviarInput, qtdEnviarInput);

    const newEstoqueBtnUnidade = estoqueBtnUnidade.cloneNode(true);
    estoqueBtnUnidade.parentNode.replaceChild(newEstoqueBtnUnidade, estoqueBtnUnidade);
    newEstoqueBtnUnidade.disabled = true; // Garante que comece desabilitado

    newQtdEnviarInput.addEventListener('input', () => {
        const valor = parseInt(newQtdEnviarInput.value) || 0;
        let qtdValida = 0;

        if (!isNaN(valor) && valor >= 1 && valor <= quantidadeDisponivel) {
            qtdValida = valor;
            qtdDisponivelEl.textContent = quantidadeDisponivel - qtdValida;
            qtdDisponivelEl.classList.add('changing');
            newEstoqueBtnUnidade.disabled = false;
        } else {
            // Se inválido ou zero, reseta
            if (valor > quantidadeDisponivel) {
                 newQtdEnviarInput.value = quantidadeDisponivel; // Corrige para o máximo
                 qtdValida = quantidadeDisponivel;
                 qtdDisponivelEl.textContent = 0;
                 qtdDisponivelEl.classList.add('changing');
                 newEstoqueBtnUnidade.disabled = false;
            } else {
                newQtdEnviarInput.value = ''; // Limpa se for <= 0
                qtdDisponivelEl.textContent = quantidadeDisponivel;
                qtdDisponivelEl.classList.remove('changing');
                newEstoqueBtnUnidade.disabled = true;
            }
        }
    });

    newEstoqueBtnUnidade.addEventListener('click', async () => {
        const quantidadeEnviada = parseInt(newQtdEnviarInput.value);
        if (isNaN(quantidadeEnviada) || quantidadeEnviada < 1 || quantidadeEnviada > quantidadeDisponivel) {
            mostrarPopupMensagem('Quantidade inválida!', 'erro');
            return;
        }

        newEstoqueBtnUnidade.disabled = true; // Desabilita durante o processo
        newEstoqueBtnUnidade.textContent = 'Enviando...';

        try {
            // Chama a função para atualizar o backend
            await atualizarQuantidadeEmbalada(
                produto,
                variante,
                quantidadeEnviada,
                opNumeroAtual, // Passa o número da OP
                opEditIdAtual // Passa o edit_id da OP
            );

            mostrarPopupMensagem(`Enviado ${quantidadeEnviada} unidade(s) de ${produto}${variante !== '-' ? `: ${variante}` : ''} para o estoque!`, 'sucesso');

             // Voltar para a lista principal e atualizar
             window.location.hash = '';
             localStorage.removeItem('embalagemAtual');
             await atualizarListasArremateEEmbalagem(); // Atualiza as listas

        } catch (error) {
            console.error('[carregarEmbalagem] Erro ao enviar unidade para estoque:', error);
            // Mensagem de erro já deve ter sido mostrada por atualizarQuantidadeEmbalada
             newEstoqueBtnUnidade.disabled = false; // Reabilita em caso de erro
             newEstoqueBtnUnidade.textContent = 'Estoque';
        }
    });

}

// Função para alternar abas (Unidade/Kit) - Manter a existente
function alternarAba(event) {
    const tab = event.target.dataset.tab;
    if (!tab) return; // Ignora cliques fora dos botões

    console.log(`[alternarAba] Alternando para aba: ${tab}`);
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));

    const tabPanel = document.getElementById(`${tab}-tab`);
    if (tabPanel) {
        tabPanel.classList.remove('hidden');
        // Se for a aba kit, pode ser necessário recarregar algo,
        // mas carregarKitsDisponiveis já foi chamado em carregarEmbalagem se aplicável.
        // A seleção de kit/variação dentro da aba kit chamará as funções de recarga da tabela kit.
    }
}

// --- Inicialização ---
async function inicializar() {
    console.log('[inicializar] Inicializando página de embalagem...');
    try {
        const auth = await verificarAutenticacao('embalagem-de-produtos.html', ['acesso-embalagem-de-produtos']);
        if (!auth) {
            window.location.href = 'acesso-negado.html';
            return;
        }
        permissoes = auth.permissoes || [];
        usuarioLogado = auth.usuario;

        // Busca dados essenciais em paralelo
        await Promise.all([
             buscarTodosProdutos(),
             buscarUsuarios()
             // Adicione outras buscas iniciais se necessário
        ]);


        // Carrega as listas de Arremate e Embalagem
        await atualizarListasArremateEEmbalagem();

        // Configura Listeners Globais
        setupEventListeners();

        // Verifica hash inicial (caso o usuário recarregue na tela de embalar)
        handleHashChange();


    } catch (error) {
        console.error('[inicializar] Erro geral na inicialização:', error);
         mostrarPopupMensagem('Erro crítico ao carregar a página. Tente recarregar.', 'erro');
        // Talvez redirecionar para uma página de erro ou login
         window.location.href = 'acesso-negado.html'; // Ou outra página
    }
     console.log('[inicializar] Inicialização concluída.');
}

// Configura listeners que rodam apenas uma vez
function setupEventListeners() {
    // Listener para busca na tabela de Embalagem
    const searchProdutoInput = document.getElementById('searchProduto');
    if (searchProdutoInput) {
        // Debounce para evitar buscas a cada tecla
        const debouncedFilter = debounce(() => {
             currentPageEmbalagem = 1; // Reseta página ao buscar
             carregarTabelaProdutosEmbalagem(opsProntasParaEmbalarGlobal); // Re-renderiza com filtro
        }, 350); // Atraso de 350ms
        searchProdutoInput.addEventListener('input', debouncedFilter);
    }

    // Listener para o botão Voltar (presente na tela #embalarView)
    const voltarBtn = document.getElementById('voltarBtn');
    if (voltarBtn) {
        voltarBtn.addEventListener('click', () => {
            window.location.hash = ''; // Limpa hash para voltar às listas
            localStorage.removeItem('embalagemAtual'); // Limpa dados da embalagem
            // O handleHashChange cuidará de mostrar as listas corretas
        });
    }

    // Listener para os botões das abas Unidade/Kit
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', alternarAba);
    });

    // Listener para mudanças no Hash da URL (navegação entre listas e detalhe)
    window.addEventListener('hashchange', handleHashChange);

    // Listener para redimensionamento (mobile)
    window.addEventListener('resize', debounce(adjustForMobile, 200)); // Debounce no resize
}

// Gerencia a exibição das seções com base no Hash
async function handleHashChange() {
    const hash = window.location.hash;
    console.log(`[handleHashChange] Hash alterado para: ${hash}`);

    const arremateView = document.getElementById('arremateView');
    const mainView = document.getElementById('mainView'); // Lista embalagem
    const embalarView = document.getElementById('embalarView'); // Detalhe embalagem

    if (!arremateView || !mainView || !embalarView) return;

    if (hash === '#embalar') {
        // Tenta carregar dados do localStorage para a tela de embalagem
        const embalagemData = JSON.parse(localStorage.getItem('embalagemAtual') || 'null');
        if (embalagemData) {
            arremateView.style.display = 'none';
            mainView.style.display = 'none';
            embalarView.style.display = 'block';
            // Recarrega a view de embalagem com os dados do localStorage
            // A quantidade já deve ser a disponível real
            await carregarEmbalagem(embalagemData.produto, embalagemData.variante, embalagemData.quantidade);
        } else {
            // Se não há dados, volta para a lista
            console.warn('[handleHashChange] Hash #embalar sem dados no localStorage. Voltando para lista.');
            window.location.hash = '';
        }
    } else {
        // Se o hash não for #embalar, mostra as listas e esconde o detalhe
        embalarView.style.display = 'none';
        localStorage.removeItem('embalagemAtual'); // Garante limpeza

        // Mostra as listas corretas (Arremate e/ou Embalagem)
        // A função atualizarListas já decide quais mostrar, mas podemos forçar aqui
        arremateView.style.display = opsParaArrematarGlobal.length > 0 ? 'block' : 'none';
        mainView.style.display = 'block';

         // Recarrega as listas caso algo tenha mudado enquanto estava na tela de embalar?
         // await atualizarListasArremateEEmbalagem(); // Descomente se necessário
    }
}


// --- Ponto de Entrada ---
document.addEventListener('DOMContentLoaded', inicializar);

// Adiciona função de limpar cache ao objeto window (opcional, para debug)
window.limparCacheEmbalagem = () => {
    opDataCache.clear();
    todosOsProdutos = [];
    todosOsUsuarios = [];
    opsParaArrematarGlobal = [];
    opsProntasParaEmbalarGlobal = [];
    // Chame invalidateCache se você usa o storage.js para cache de API
    invalidateCache('produtos'); // Exemplo
    console.log('[limparCacheEmbalagem] Caches locais limpos.');
    mostrarPopupMensagem('Cache local limpo.', 'aviso');
    // Recarrega os dados
    atualizarListasArremateEEmbalagem();
};
