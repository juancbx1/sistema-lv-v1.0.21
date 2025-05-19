import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos, salvarProdutos } from '/js/utils/storage.js';
import { resizeImage } from '/js/utils/image-utils.js';
import { PRODUTOS, PRODUTOSKITS, MAQUINAS, PROCESSOS } from '/js/utils/prod-proc-maq.js';
import { invalidateCache } from '/js/utils/storage.js';

// Variável global para armazenar produtos
let produtos = [];
let variacoesAlteradas = false;
let gradeAlteradas = false;
let variacoesTemp = [];
let gradeTemp = [];

// Elementos DOM agrupados em um objeto
const elements = {
    productListView: document.getElementById('productListView'),
    productFormView: document.getElementById('productFormView'),
    configurarVariacaoView: document.getElementById('configurarVariacaoView'),
    productTableBody: document.getElementById('productTableBody'),
    searchProduct: document.getElementById('searchProduct'),
    productForm: document.getElementById('productForm'),
    editProductNameDisplay: document.getElementById('editProductName'), // Renomeei para clareza (o H2)
    inputProductName: document.getElementById('inputProductName'),    // <<< NOVO INPUT ADICIONADO AQUI    
    sku: document.getElementById('sku'),
    gtin: document.getElementById('gtin'),
    unidade: document.getElementById('unidade'),
    estoque: document.getElementById('estoque'),
    imagemProduto: document.getElementById('imagemProduto'),
    previewImagem: document.getElementById('previewImagem'),
    removeImagem: document.getElementById('removeImagem'),
    stepsBody: document.getElementById('stepsBody'),
    etapasTiktikBody: document.getElementById('etapasTiktikBody'),
    tabFilter: document.getElementById('tabFilter'),
    gradeHeader: document.getElementById('gradeHeader'),
    gradeBody: document.getElementById('gradeBody'),
    variacaoPopup: document.getElementById('variacaoPopup'),
    novaVariacaoDescricao: document.getElementById('novaVariacaoDescricao'),
    gradeImagePopup: document.getElementById('gradeImagePopup'),
    gradeImageInput: document.getElementById('gradeImageInput'),
    produtoKitSelect: document.getElementById('produtoKitSelect'),
    variacaoKitSelect: document.getElementById('variacaoKitSelect'),
    addVariacaoKitBtn: document.getElementById('addVariacaoKitBtn'),
    composicaoKitContainer: document.getElementById('composicaoKitContainer'),
    configurarVariacaoTitle: document.getElementById('configurarVariacaoTitle')
};

let editingProduct = null;
let currentSelectIndex = null;
let currentGradeIndex = null;
let currentKitVariationIndex = null;
let kitComposicaoTemp = [];

// Função para clonar objeto profundamente
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function configurarEventListenersPrincipais() {
    console.log('[configurarEventListenersPrincipais] Configurando listeners...');

    // --- Listener para o NOVO BOTÃO "Adicionar Novo Produto" ---
    const btnAdicionarNovoProduto = document.getElementById('btnAdicionarNovoProduto');
if (btnAdicionarNovoProduto) {
    btnAdicionarNovoProduto.addEventListener('click', () => {
        console.log('[btnAdicionarNovoProduto] Botão "Adicionar Novo Produto" clicado');
        editingProduct = { // Objeto esqueleto para um NOVO produto
            nome: '',        // Nome começa vazio para o usuário preencher
            sku: '',
            gtin: '',
            unidade: 'pç',   // Default
            estoque: 0,
            imagem: '',
            tipos: [],       // Default para array vazio
            variacoes: [],   // Default para array vazio
            estrutura: [],   // Default para array vazio
            etapas: [],      // Default para array vazio
            etapasTiktik: [],// Default para array vazio
            grade: [],       // Default para array vazio
            is_kit: false,
            id: undefined    // GARANTE que não tem ID, para ser tratado como novo
        };
        localStorage.removeItem('ultimoProdutoEditado'); // ESSENCIAL
        localStorage.removeItem('produtoComDuplicidade'); // Boa prática
        
        window.location.hash = '#editando'; 
        
        // Forçar o recarregamento do formulário se a view já estiver ativa
        // O toggleView chamado pelo hashchange deve cuidar disso,
        // mas isso é uma garantia extra se a hash não mudar ou houver algum timing.
        if (elements.productFormView.style.display === 'block' && window.location.hash === '#editando') {
            console.log('[btnAdicionarNovoProduto] Forçando loadEditForm para novo produto.');
            loadEditForm(editingProduct);
        }
    });
    console.log('[configurarEventListenersPrincipais] Listener para btnAdicionarNovoProduto configurado.');
} else {
    console.warn('[configurarEventListenersPrincipais] Botão #btnAdicionarNovoProduto não encontrado.');
}

    // --- Seus OUTROS LISTENERS que já existem ---
    // Por exemplo, o listener para o input de busca:
    if (elements.searchProduct) { // elements.searchProduct é document.getElementById('searchProduct')
        elements.searchProduct.addEventListener('input', () => {
            const activeFilter = document.querySelector('.cp-type-btn.active')?.dataset.type || 'todos';
            loadProductTable(activeFilter, elements.searchProduct.value);
        });
        console.log('[configurarEventListenersPrincipais] Listener para searchProduct configurado.');
    } else {
        console.warn('[configurarEventListenersPrincipais] Elemento #searchProduct não encontrado.');
    }


    // Listener para os botões de filtro de tipo:
    document.querySelectorAll('.cp-type-btn').forEach(btn => {
        btn.addEventListener('click', () => filterProducts(btn.dataset.type));
    });
    console.log('[configurarEventListenersPrincipais] Listeners para .cp-type-btn configurados.');


    // Listener para o formulário principal (productForm)
    if (elements.productForm) { // elements.productForm é document.getElementById('productForm')
        elements.productForm.addEventListener('submit', async e => {
            e.preventDefault();
            if (!editingProduct) return;

            // ... (sua lógica de validação e coleta de dados do formulário) ...

            // A função salvarProdutoNoBackend() será chamada aqui dentro
            // como você já faz.
            try {
                const produtoSalvo = await salvarProdutoNoBackend(); // salvarProdutoNoBackend já existe no seu código
                if (produtoSalvo) {
                    alert('Produto salvo com sucesso!');
                    window.location.hash = ''; // Volta para a lista
                }
            } catch (error) {
                // salvarProdutoNoBackend já deve mostrar o alerta de erro
                console.error("Erro no submit do productForm:", error);
            }
        });
        console.log('[configurarEventListenersPrincipais] Listener para productForm (submit) configurado.');
    } else {
        console.warn('[configurarEventListenersPrincipais] Elemento #productForm não encontrado.');
    }
    
    // Listener para o campo de imagem (se não estiver já em elements)
    const imagemProdutoInput = document.getElementById('imagemProduto');
    if (imagemProdutoInput && elements.previewImagem && elements.removeImagem) {
        imagemProdutoInput.addEventListener('change', e => {
            const arquivo = e.target.files[0];
            if (!arquivo) return;
            resizeImage(arquivo, imagemRedimensionada => {
                elements.previewImagem.src = imagemRedimensionada;
                elements.previewImagem.style.display = 'block';
                elements.removeImagem.style.display = 'inline-block';
                if(editingProduct) editingProduct.imagem = imagemRedimensionada;
            });
        });

        elements.removeImagem.addEventListener('click', () => {
            imagemProdutoInput.value = ''; // Limpa o input file
            elements.previewImagem.src = '';
            elements.previewImagem.style.display = 'none';
            elements.removeImagem.style.display = 'none';
            if(editingProduct) editingProduct.imagem = '';
        });
        console.log('[configurarEventListenersPrincipais] Listeners para imagemProduto e removeImagem configurados.');
    } else {
        if(!imagemProdutoInput) console.warn('[configurarEventListenersPrincipais] Elemento #imagemProduto não encontrado.');
    }


    // Adicione AQUI quaisquer outros event listeners de nível de página que você tinha,
    // como para abas, botões de adicionar etapa, etc., se eles não estiverem
    // sendo adicionados dinamicamente ou se fizer sentido agrupá-los.
    // Por exemplo, os listeners para os checkboxes de tipo de produto:
    document.querySelectorAll('input[name="tipo"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            if (editingProduct) { // Atualiza o editingProduct se estiver editando
                const tiposSelecionados = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
                editingProduct.tipos = tiposSelecionados;
                editingProduct.is_kit = tiposSelecionados.includes('kits');
            }
            toggleTabs(); // Atualiza a visibilidade das abas
        });
    });
    console.log('[configurarEventListenersPrincipais] Listeners para input[name="tipo"] configurados.');

} // Fim da função configurarEventListenersPrincipais

// Inicialização
async function inicializarPagina() {
    document.documentElement.setAttribute('hidden', 'true'); // Esconde a página até tudo carregar

    const auth = await verificarAutenticacao('cadastrar-produto.html', ['acesso-cadastrar-produto']);
    if (!auth) {
        // verificarAutenticacao já deve ter redirecionado
        return;
    }
    // Não precisamos armazenar auth.permissoes ou auth.usuario em variáveis globais aqui
    // se as funções chamadas por eles (como salvarProdutoNoBackend) já pegam o token do localStorage
    // para enviar à API, e a API valida as permissões.

    await loadProductTable('todos', '', true); // Carrega a tabela de produtos

    configurarEventListenersPrincipais(); // CHAMA A FUNÇÃO PARA CONFIGURAR OS LISTENERS

    // Listener para hashchange deve ser configurado APENAS UMA VEZ
    if (!window.cadastrarProdutoHashChangeListenerAttached) {
        window.addEventListener('hashchange', toggleView);
        window.cadastrarProdutoHashChangeListenerAttached = true;
        console.log('[inicializarPagina] Listener de hashchange configurado para cadastrar-produto.');
    }

    toggleView(); // Processa a hash inicial para mostrar a view correta

    document.documentElement.removeAttribute('hidden'); // Mostra a página
    console.log('[inicializarPagina] Página de cadastro de produto inicializada.');
}

// Chame inicializarPagina quando o DOM estiver pronto (você já faz isso no final do arquivo)
// inicializarPagina(); // Se você chama no final do arquivo, mantenha lá.



async function loadProductTable(filterType = 'todos', search = '', forceRefresh = false) {
    try {
        // 1. Obter produtos diretamente da API/cache
        produtos = await obterProdutos(forceRefresh); 
        console.log('[loadProductTable] Produtos obtidos da API/cache:', produtos.length, 'Primeiro produto:', produtos.length > 0 ? produtos[0] : 'Nenhum');

        // 2. REMOVIDO: Bloco que comparava com PRODUTOS/PRODUTOSKITS de prod-proc-maq.js e criava novosProdutos.
        //    A criação de produtos agora será manual através de um botão "Adicionar Novo Produto".

        // 3. Mapear e Filtrar os produtos existentes (como antes, mas sem os produtos esqueleto automáticos)
        const mappedProdutos = produtos.map(produto => ({
            ...produto,
            isKit: produto.is_kit // ou produto.tipos?.includes('kits')
        }));

        // Filtrar apenas pelos produtos que REALMENTE existem.
        // Se você ainda quiser usar PRODUTOS e PRODUTOSKITS de prod-proc-maq.js para algum tipo de filtro
        // ou verificação de consistência, pode manter, mas eles não devem mais ditar a CRIAÇÃO.
        // Para simplificar, vamos filtrar apenas com base nos tipos e busca por enquanto.
        // const allProductNames = [...PRODUTOS, ...PRODUTOSKITS]; // Não mais necessário para forçar existência

        const filteredProdutos = mappedProdutos.filter(p =>
            (filterType === 'todos' || (Array.isArray(p.tipos) && p.tipos.includes(filterType))) && // Garantir que p.tipos seja array
            p.nome.toLowerCase().includes(search.toLowerCase())
        );

        elements.productTableBody.innerHTML = '';
        if (filteredProdutos.length === 0) {
            elements.productTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum produto encontrado. Use o botão "Adicionar Novo Produto".</td></tr>`;
        } else {
            filteredProdutos.forEach(produto => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.dataset.nome = produto.nome; // Usado por editProduct
                tr.innerHTML = `
                    <td>${produto.imagem ? `<img src="${produto.imagem}" class="miniatura-produto" onclick="editProduct('${produto.nome}')">` : '<span class="espaco-miniatura-produto"></span>'}</td>
                    <td>${produto.nome}</td>
                    <td>${produto.sku || '-'}</td>
                    <td>${Array.isArray(produto.unidade) ? produto.unidade.join(', ') : (produto.unidade || '-') }</td> <!-- Adicionado Array.isArray para unidade -->
                    <td>${produto.estoque || 0}</td>
                    <td>${Array.isArray(produto.tipos) ? produto.tipos.join(', ') : '-'}</td> <!-- Correção para o erro de join -->
                `;
                tr.addEventListener('click', () => editProduct(produto.nome));
                elements.productTableBody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('[loadProductTable] Erro:', error);
        elements.productTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Erro ao carregar produtos.</td></tr>`;
    }
}

inicializarPagina();

async function editProduct(nome) {
    const produtoOriginal = produtos.find(p => p.nome === nome);
    if (produtoOriginal) {
        editingProduct = deepClone(produtoOriginal);
        console.log(`[editProduct] Carregando produto ${nome}:`, editingProduct);

        const produtoComDuplicidade = localStorage.getItem('produtoComDuplicidade');
        if (produtoComDuplicidade) {
            const produtoTemp = JSON.parse(produtoComDuplicidade);
            if (produtoTemp.id === produtoOriginal.id) {
                editingProduct = deepClone(produtoTemp);
            } else {
                localStorage.removeItem('produtoComDuplicidade');
            }
        }

        window.location.hash = '#editando';
        localStorage.setItem('ultimoProdutoEditado', nome);
        loadEditForm(editingProduct);
    } else {
        console.error(`[editProduct] Produto ${nome} não encontrado`);
        window.location.hash = '';
        editingProduct = null;
    }
}

function loadEditForm(produto) {
    console.log('[loadEditForm] Produto recebido:', produto);

    // Atualiza o título H2
    if (elements.editProductNameDisplay) {
        elements.editProductNameDisplay.textContent = (produto && produto.id) ? `Editando: ${produto.nome}` : 'Cadastrando Novo Produto';
    }

    // Preenche o INPUT de nome do produto
    if (elements.inputProductName) {
        elements.inputProductName.value = produto.nome || '';
        // Opcional: Desabilitar edição do nome para produtos existentes se você quiser
        // A API já lida com ON CONFLICT, então pode ser seguro permitir a edição.
        // elements.inputProductName.readOnly = !!(produto && produto.id);
    } else {
        console.warn('[loadEditForm] Elemento #inputProductName não encontrado.');
    }

    // Preenche os outros campos como antes
    elements.sku.value = produto.sku || '';
    document.querySelectorAll('input[name="tipo"]').forEach(cb => {
        cb.checked = produto.tipos ? produto.tipos.includes(cb.value) : false;
    });
    elements.gtin.value = produto.gtin || '';
    elements.unidade.value = produto.unidade || '';
    elements.estoque.value = produto.estoque || '';
    if (produto.imagem) {
        elements.previewImagem.src = produto.imagem;
        elements.previewImagem.style.display = 'block';
        elements.removeImagem.style.display = 'inline-block';
    } else {
        elements.previewImagem.src = '';
        elements.previewImagem.style.display = 'none';
        elements.removeImagem.style.display = 'none';
    }

    elements.stepsBody.innerHTML = '';
    (produto.etapas || []).forEach((etapa, index) => {
        addStepRow(etapa.processo || '', etapa.maquina || '', etapa.feitoPor || '', index);
    });
    window.updateProcessosOptions();

    elements.etapasTiktikBody.innerHTML = '';
    (produto.etapasTiktik|| []).forEach((etapa, index) => {
        addEtapaTiktikRow(etapa.processo || '', etapa.maquina || '', etapa.feitoPor || '', index);
    });
    window.updateEtapasTiktikOptions();

    console.log('[loadEditForm] Chamando loadVariacoes');
    loadVariacoes(produto);
    console.log('[loadEditForm] Chamando loadGrade');
    loadGrade(produto);
    console.log('[loadEditForm] Chamando toggleTabs');
    toggleTabs();

    const tipos = produto.tipos || [];
    const abaInicial = tipos.includes('variacoes') || tipos.includes('kits') ? 'variacoes' : 'dados-gerais';
    console.log('[loadEditForm] Ativando aba inicial:', abaInicial);
    switchTab(abaInicial);
    initializeDragAndDrop();

    const produtoComDuplicidade = localStorage.getItem('produtoComDuplicidade');
    if (produtoComDuplicidade) {
        const produtoTemp = JSON.parse(produtoComDuplicidade);
        if (produtoTemp.id === produto.id && temDuplicatasDeSku()) {
            editingProduct = deepClone(produtoTemp);
            loadGrade(produtoTemp);
            bloquearCampos('Corrija o SKU duplicado antes de continuar editando.');
            const erroInputs = elements.gradeBody.querySelectorAll('.cp-grade-sku');
            erroInputs.forEach((input, idx) => {
                const grade = editingProduct.grade || [];
                const sku = grade[idx]?.sku || '';
                const allSkus = produtos
                    .filter(prod => prod.id !== editingProduct.id)
                    .flatMap(prod => [prod.sku, ...(prod.grade || []).map(g => g.sku)])
                    .filter(s => s);
                const gradeSkus = grade.map(g => g.sku).filter((s, i) => i !== idx);
                if (sku && (allSkus.includes(sku) || gradeSkus.includes(sku))) {
                    input.classList.add('error');
                    let errorSpan = input.nextElementSibling;
                    if (!errorSpan || !errorSpan.classList.contains('error-message')) {
                        errorSpan = document.createElement('span');
                        errorSpan.className = 'error-message';
                        input.parentNode.appendChild(errorSpan);
                    }
                    errorSpan.textContent = 'Este SKU já está em uso!';
                    errorSpan.style.display = 'inline';
                }
            });
        }
    }
}

function loadVariacoes(produto) {
    console.log('[loadVariacoes] Variações do produto:', produto.variacoes);
    const variacoesContainer = document.getElementById('variacoesContainer');
    if (!variacoesContainer) {
        console.error('[loadVariacoes] #variacoesContainer não encontrado no DOM');
        return;
    }
    variacoesContainer.innerHTML = '';

    // Se variacoes está vazio, mas há grade, reconstruir variacoes
    let variacoesIniciais = produto.variacoes || [];
    if (!variacoesIniciais.length && produto.grade && produto.grade.length > 0) {
        const variacoesInferidas = {};
        produto.grade.forEach(item => {
            const partes = item.variacao.split(' | ');
            partes.forEach((parte, idx) => {
                if (!variacoesInferidas[idx]) {
                    variacoesInferidas[idx] = new Set();
                }
                variacoesInferidas[idx].add(parte);
            });
        });

        variacoesIniciais = Object.keys(variacoesInferidas).map((idx, i) => ({
            chave: i === 0 ? 'cor' : (i === 1 ? 'tamanho' : `variacao${i}`),
            valores: Array.from(variacoesInferidas[idx]).join(',')
        }));
        console.log('[loadVariacoes] Variações inferidas a partir da grade:', variacoesIniciais);
        editingProduct.variacoes = deepClone(variacoesIniciais);
    }

    // Definir variações iniciais (mesmo para kits)
    variacoesTemp = deepClone(variacoesIniciais.length > 0 ? variacoesIniciais : [{ chave: 'cor', valores: '' }]);
    console.log('[loadVariacoes] Variações temporárias:', variacoesTemp);
    variacoesTemp.forEach((variacao, index) => {
        console.log('[loadVariacoes] Adicionando variação:', variacao, 'índice:', index);
        addVariacaoRow(variacao.chave, variacao.valores, index);
    });

    variacoesAlteradas = false;
}

function loadGrade(produto) {
    const variacoesContainer = document.getElementById('variacoesContainer');
    if (!variacoesContainer) {
        console.error('[loadGrade] #variacoesContainer não encontrado no DOM');
        return;
    }
    const variacoesAtuais = Array.from(variacoesContainer.querySelectorAll('.cp-variacao-row')).map((row, i) => ({
        chave: document.getElementById(`chaveVariacao${i}`)?.value || '',
        valores: document.getElementById(`valoresVariacao${i}`)?.value || ''
    }));
    console.log('[loadGrade] Variações atuais do DOM:', variacoesAtuais);

    // Limpar completamente o gradeBody
    while (elements.gradeBody.firstChild) {
        elements.gradeBody.removeChild(elements.gradeBody.firstChild);
    }

    elements.gradeHeader.innerHTML = `
        <tr>
            <th>Variação</th>
            <th>Composto Por</th>
            <th>Código (SKU)</th>
            <th>Imagens</th>
            <th>Ações</th>
        </tr>
    `;

    const isKit = produto.tipos && produto.tipos.includes('kits');
    gradeTemp = deepClone(produto.grade || []);
    console.log('[loadGrade] gradeTemp inicializado:', gradeTemp);

    if (!variacoesAtuais.every(v => v.valores && v.valores.trim() !== '')) {
        console.log('[loadGrade] Variações inválidas, exibindo mensagem');
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="5">Adicione valores às variações acima para gerar a grade.</td>';
        elements.gradeBody.appendChild(tr);
        gradeTemp = [];
        editingProduct.grade = []; // Sincronizar editingProduct.grade
        return;
    }

    const gradeGerada = generateGradeCombinations(variacoesAtuais);
    console.log('[loadGrade] Grade gerada a partir das variações:', gradeGerada);

    const updatedGrade = [];
    gradeGerada.forEach(nova => {
        const existente = gradeTemp.find(g => g.variacao === nova.variacao) || {
            variacao: nova.variacao,
            sku: '',
            imagem: '',
            composicao: isKit ? [] : ['-']
        };
        updatedGrade.push(existente);
    });
    gradeTemp = updatedGrade;
    editingProduct.grade = deepClone(gradeTemp); // Sincronizar editingProduct.grade com gradeTemp
    console.log('[loadGrade] gradeTemp atualizado:', gradeTemp);

    if (gradeTemp.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="5">Nenhuma variação configurada. Clique em "Adicionar Outra Variação" para começar.</td>';
        elements.gradeBody.appendChild(tr);
        return;
    }

    gradeTemp.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.index = idx.toString();
        const composicaoHtml = isKit
            ? item.composicao?.length > 0 && item.composicao[0].variacao !== '-'
                ? `<div class="composicao-tags">${item.composicao.map(c => `<span class="composicao-tag">${c.variacao} (${c.quantidade})</span>`).join('')}<button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${idx}')">Editar</button></div>`
                : `<div class="composicao-tags"><button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${idx}')">Editar</button></div>`
            : '-';
        tr.innerHTML = `
            <td>${item.variacao}</td>
            <td>${composicaoHtml}</td>
            <td><input type="text" class="cp-grade-sku" value="${item.sku || ''}" onblur="validarSku('${idx}', this); marcarGradeAlteradas()"><span class="error-message"></span></td>
            <td class="cp-grade-img"><div class="img-placeholder" onclick="abrirImagemPopup('${idx}')">${item.imagem ? `<img src="${item.imagem}" class="cp-variacao-img">` : ''}</div></td>
            <td><button class="cp-remove-btn" onclick="excluirGrade('${idx}')">X</button></td>
        `;
        elements.gradeBody.appendChild(tr);
    });

    console.log('[loadGrade] Grade temporária final:', gradeTemp, 'Total de linhas no DOM:', elements.gradeBody.children.length);
    gradeAlteradas = false;
}

window.marcarGradeAlteradas = function() {
    gradeAlteradas = true;
};

window.salvarGrade = async function() {
    if (!editingProduct) {
        alert('Erro: Nenhum produto está sendo editado.');
        return;
    }

    const gradeRows = Array.from(elements.gradeBody.querySelectorAll('tr'));
    const validRows = gradeRows.filter(tr => tr.cells[0]);

    gradeTemp = validRows.map((tr, idx) => {
        const variacao = tr.cells[0].textContent;
        const existingItem = gradeTemp.find(item => item.variacao === variacao) || {};
        return {
            variacao: variacao,
            sku: tr.cells[2]?.querySelector('.cp-grade-sku')?.value || existingItem.sku || '',
            imagem: tr.cells[3]?.querySelector('img')?.src || existingItem.imagem || '',
            composicao: existingItem.composicao || []
        };
    });

    editingProduct.grade = deepClone(gradeTemp);
    gradeAlteradas = false;
    console.log('[salvarGrade] Grade atualizada localmente:', editingProduct.grade);

    try {
        const savedProduct = await salvarProdutoNoBackend();
        console.log('[salvarGrade] Salvamento no backend concluído com sucesso:', savedProduct.grade);
        alert('Grade salva com sucesso!');
    } catch (error) {
        console.error('[salvarGrade] Erro ao salvar no backend:', error.message, error.stack);
        alert('Erro ao salvar a grade: ' + error.message);
        throw error;
    }
};

function generateGradeCombinations(variacoes) {
    if (!variacoes || !variacoes.every(v => v.valores)) return [];
    const valoresPorChave = variacoes.map(v => v.valores.split(',').map(val => val.trim()).filter(val => val));
    const combinations = valoresPorChave.reduce((acc, curr) => {
        return acc.length === 0 ? curr.map(val => [val]) : acc.flatMap(combo => curr.map(val => [...combo, val]));
    }, []);
    return combinations.map(combo => ({ variacao: combo.join(' | '), sku: '', imagem: '', composicao: [] }));
}

function filterProducts(type) {
    document.querySelectorAll('.cp-type-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.cp-type-btn[data-type="${type}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    loadProductTable(type, elements.searchProduct.value);
}

function toggleView() {
    const hash = window.location.hash;
    console.log('[toggleView] Hash atual:', hash, 'Produto em edição (editingProduct):', editingProduct);

    // Esconder todas as views principais primeiro
    elements.productListView.style.display = 'none';
    elements.productFormView.style.display = 'none';
    elements.configurarVariacaoView.style.display = 'none'; // Popup de configuração de kit

    if (hash === '#editando') {
        elements.productFormView.style.display = 'block'; // Mostra o formulário

        let produtoParaCarregar = editingProduct; // Usa o que já está em editingProduct (novo ou existente)

        if (!produtoParaCarregar) { // Se editingProduct não foi setado (ex: refresh na página com #editando)
            const ultimoProdutoEditadoNome = localStorage.getItem('ultimoProdutoEditado');
            if (ultimoProdutoEditadoNome) {
                const produtoOriginal = produtos.find(p => p.nome === ultimoProdutoEditadoNome);
                if (produtoOriginal) {
                    produtoParaCarregar = deepClone(produtoOriginal);
                    editingProduct = produtoParaCarregar; // Atualiza o global editingProduct
                    console.log('[toggleView #editando] Carregado do localStorage:', ultimoProdutoEditadoNome);
                } else {
                    console.warn(`[toggleView #editando] Produto "${ultimoProdutoEditadoNome}" do localStorage não encontrado. Limpando.`);
                    localStorage.removeItem('ultimoProdutoEditado');
                }
            }
        }

        if (produtoParaCarregar) {
            loadEditForm(produtoParaCarregar); // Carrega os dados no formulário
            // Ativar a aba correta (dados-gerais ou a última usada se existir)
            const ultimaAba = localStorage.getItem('ultimaAbaAtiva');
            if (ultimaAba && document.getElementById(ultimaAba) && document.querySelector(`.cp-tab-btn[data-tab="${ultimaAba}"]`)) {
                switchTab(ultimaAba);
            } else {
                // Define uma aba padrão se a última não for válida ou não existir
                const tiposProduto = produtoParaCarregar.tipos || [];
                const abaPadrao = tiposProduto.includes('variacoes') || tiposProduto.includes('kits') ? 'variacoes' : 'dados-gerais';
                switchTab(abaPadrao);
            }
            toggleTabs(); // Garante que os botões de abas estejam corretos
        } else {
            // Se não há produto para carregar (nem em editingProduct, nem no localStorage)
            // e o usuário tentou acessar #editando diretamente.
            console.warn("[toggleView #editando] Nenhum produto para editar. Redirecionando para a lista.");
            window.location.hash = ''; // Volta para a lista (o que acionará toggleView novamente)
            // Não precisa return aqui, pois a mudança de hash fará o toggleView rodar de novo
        }

    } else if (hash.startsWith('#configurar-variacao/')) {
        // Esta view é um popup sobre a productFormView
        elements.productFormView.style.display = 'block'; // Mantém o formulário de produto visível por baixo
        elements.configurarVariacaoView.style.display = 'flex'; // Mostra o popup
        const index = hash.split('/')[1];
        if (editingProduct) { // Precisa do produto principal para configurar a variação do kit
            carregarConfigurarVariacao(index); // Função que preenche o popup de configuração
        } else {
            console.error("[toggleView #configurar-variacao] Tentando configurar variação sem um produto principal em edição.");
            window.location.hash = '#editando'; // Volta para a edição (que pode redirecionar para lista se não houver produto)
        }

    } else { // Hash vazia, #, ou qualquer outra coisa: mostrar lista de produtos
        // Lógica para sair da edição: verificar alterações não salvas
        if (elements.productFormView.style.display === 'block' && (variacoesAlteradas || gradeAlteradas)) {
            const confirmar = confirm('Você tem alterações não salvas em "Variações" ou "Grade". Deseja sair sem salvar?');
            if (!confirmar) {
                // Usuário não quer sair, força a hash de volta para #editando para evitar loop
                // window.history.pushState(null, "", '#editando'); // Evita acionar hashchange
                // Ou simplesmente não faz nada, deixando o usuário na tela de edição.
                // Para evitar que o toggleView continue e esconda o form, precisamos de um return.
                // Mas isso pode ser complicado se a hash já mudou.
                // A melhor abordagem é o usuário clicar "Cancelar" no confirm e o código não prosseguir.
                // Se ele clicou "OK", então prosseguimos para limpar.
                // Para simplificar: se o usuário clicou em algo que mudou a hash, e ele confirma o "sair sem salvar",
                // então a lógica abaixo prossegue. Se ele cancelou o "sair sem salvar",
                // ele mesmo deve voltar para #editando ou o estado da hash já foi revertido pelo navegador.
                // Para garantir, se ele cancelou, podemos tentar forçar a volta:
                 // O problema é que window.location.hash = '#editando' acionaria toggleView de novo.
                 // Uma solução é ter um estado "saindoDaEdicao" para ignorar um ciclo.
                 // Por ora, vamos assumir que se ele cancelou o 'confirm', ele permanece.
                 // Se ele confirmou, a lógica abaixo limpa tudo.
            } else {
                // Se ele cancelou a saída, não fazemos nada, ele continua na edição
                // Para que ele não saia, precisamos que a hash NÃO MUDE.
                // Se a hash já mudou (ex: clicou no menu lateral), precisamos forçá-la de volta.
                // Isso pode ser complexo. Uma solução simples é que os links que tiram da edição
                // já façam essa verificação ANTES de mudar a hash.
                // Por enquanto, se ele cancelou o confirm, vamos impedir a mudança de view.
                // Isso requer que o `confirm` seja chamado ANTES da hash realmente mudar.
                // O listener de hashchange é reativo.

                // Vamos simplificar: Se ele chegou aqui e confirmou (ou não havia alterações)
                // A lógica abaixo de limpar e mostrar a lista executa.
            }
        }

        // Limpar estado de edição ao sair da view de formulário
        elements.productListView.style.display = 'block';
        editingProduct = null;
        variacoesAlteradas = false;
        gradeAlteradas = false;
        variacoesTemp = [];
        gradeTemp = [];
        localStorage.removeItem('ultimoProdutoEditado');
        localStorage.removeItem('ultimaAbaAtiva');
        localStorage.removeItem('produtoComDuplicidade'); // Limpa qualquer estado de erro de SKU

        // Resetar e carregar a tabela de produtos
        if (elements.searchProduct) elements.searchProduct.value = ''; // Limpa busca
        document.querySelectorAll('.cp-type-btn').forEach(btn => btn.classList.remove('active'));
        const todosBtn = document.querySelector('.cp-type-btn[data-type="todos"]');
        if (todosBtn) todosBtn.classList.add('active');
        
        // Só recarrega a tabela se ela não foi carregada ainda ou se explicitamente necessário
        // Geralmente, ao voltar para a lista, queremos ver os dados mais recentes.
        if (document.body.dataset.initialLoadComplete === 'true') { // Evita recarga dupla na inicialização
            loadProductTable('todos', '', true); // Força refresh ao voltar para a lista
        }
    }
}



window.switchTab = function(tabId) {
    console.log('[switchTab] Alternando para aba:', tabId);
    document.querySelectorAll('.cp-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.conteudo-aba-produto').forEach(tab => tab.classList.remove('active'));

    const btn = document.querySelector(`.cp-tab-btn[data-tab="${tabId}"]`);
    const tab = document.getElementById(tabId);

    if (btn && tab) {
        btn.classList.add('active');
        tab.classList.add('active');
        localStorage.setItem('ultimaAbaAtiva', tabId);
        console.log('[switchTab] Aba ativada:', tabId);
    } else {
        console.error('[switchTab] Botão ou aba não encontrado para:', tabId);
    }
};

window.toggleTabs = function() {
    const tiposSelecionados = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
    console.log('[toggleTabs] Tipos selecionados:', tiposSelecionados);
    const variacoesTabBtn = document.querySelector('.cp-tab-btn[data-tab="variacoes"]');
    const variacoesTab = document.getElementById('variacoes');

    if (tiposSelecionados.includes('variacoes') || tiposSelecionados.includes('kits')) {
        if (!variacoesTabBtn) {
            console.log('[toggleTabs] Criando botão da aba Variações');
            const btn = document.createElement('button');
            btn.className = 'cp-tab-btn';
            btn.dataset.tab = 'variacoes';
            btn.textContent = 'Variações';
            btn.onclick = () => switchTab('variacoes');
            elements.tabFilter.appendChild(btn);
        } else {
            console.log('[toggleTabs] Botão da aba Variações já existe');
        }
    } else if (variacoesTabBtn) {
        console.log('[toggleTabs] Removendo botão da aba Variações');
        variacoesTabBtn.remove();
        variacoesTab.classList.remove('active');
    }

    // Garantir que uma aba esteja ativa
    if (!document.querySelector('.cp-tab-btn.active')) {
        console.log('[toggleTabs] Nenhuma aba ativa, definindo padrão');
        const defaultTab = tiposSelecionados.includes('variacoes') || tiposSelecionados.includes('kits') ? 'variacoes' : 'dados-gerais';
        switchTab(defaultTab);
    }
};

elements.removeImagem.addEventListener('click', () => {
    elements.imagemProduto.value = '';
    elements.previewImagem.src = '';
    elements.previewImagem.style.display = 'none';
    elements.removeImagem.style.display = 'none';
    editingProduct.imagem = '';
});

elements.imagemProduto.addEventListener('change', e => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    resizeImage(arquivo, imagemRedimensionada => {
        elements.previewImagem.src = imagemRedimensionada;
        elements.previewImagem.style.display = 'block';
        elements.removeImagem.style.display = 'inline-block';
        editingProduct.imagem = imagemRedimensionada;
    });
});


window.addStepRow = function(processo = '', maquina = '', feitoPor = '', index = null) {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.dataset.index = index !== null ? index : elements.stepsBody.children.length;
    tr.innerHTML = `
        <td><span class="icone-arrastar">☰</span></td>
        <td><select class="processo-select">
            <option value="">Selecione um processo</option>
            ${PROCESSOS.map(p => `<option value="${p}" ${p === processo ? 'selected' : ''}>${p}</option>`).join('')}
        </select></td>
        <td><select class="maquina-select">
            <option value="">Selecione uma máquina</option>
            ${MAQUINAS.map(m => `<option value="${m}" ${m === maquina ? 'selected' : ''}>${m}</option>`).join('')}
        </select></td>
        <td><select class="feito-por-select">
            <option value="">Selecione um tipo</option>
            ${['costureira', 'tiktik', 'cortador'].map(tipo => `<option value="${tipo}" ${tipo === feitoPor ? 'selected' : ''}>${tipo.charAt(0).toUpperCase() + tipo.slice(1)}</option>`).join('')}
        </select></td>
        <td><button class="botao-remover-produto" onclick="this.parentElement.parentElement.remove(); updateProcessosOptions()">X</button></td>
    `;
    elements.stepsBody.appendChild(tr);

    const processoSelect = tr.querySelector('.processo-select');
    const maquinaSelect = tr.querySelector('.maquina-select');
    const feitoPorSelect = tr.querySelector('.feito-por-select');

    processoSelect.addEventListener('change', () => {
        updateProcessosOptions();
    });
    maquinaSelect.addEventListener('change', () => {
    });
    feitoPorSelect.addEventListener('change', () => {
    });

    window.updateProcessosOptions();
};

window.addEtapaTiktikRow = function(processo = '', maquina = '', feitoPor = '', index = null) {
    const tr = document.createElement('tr');
    tr.draggable = true;
    const rowIndex = index !== null ? index : elements.etapasTiktikBody.children.length;
    tr.dataset.index = rowIndex;
    tr.innerHTML = `
        <td><span class="icone-arrastar">☰</span></td>
        <td><select class="processo-select">
            <option value="">Selecione um processo</option>
            ${PROCESSOS.map(p => `<option value="${p}" ${p === processo ? 'selected' : ''}>${p}</option>`).join('')}
        </select></td>
        <td><select class="maquina-select">
            <option value="">Selecione uma máquina</option>
            ${MAQUINAS.map(m => `<option value="${m}" ${m === maquina ? 'selected' : ''}>${m}</option>`).join('')}
        </select></td>
        <td><select class="feito-por-select">
            <option value="">Selecione um tipo</option>
            ${['costureira', 'tiktik', 'cortador'].map(tipo => `<option value="${tipo}" ${tipo === feitoPor ? 'selected' : ''}>${tipo.charAt(0).toUpperCase() + tipo.slice(1)}</option>`).join('')}
        </select></td>
        <td><button class="botao-remover-produto" onclick="this.parentElement.parentElement.remove(); updateEtapasTiktikOptions()">X</button></td>
    `;
    elements.etapasTiktikBody.appendChild(tr);

        if (!editingProduct) editingProduct = {};
        if (!editingProduct.etapasTiktik) editingProduct.etapasTiktik = [];
        if (!editingProduct.etapasTiktik[rowIndex]) {
            // Criar um objeto placeholder com os valores iniciais
            editingProduct.etapasTiktik[rowIndex] = { processo: processo, maquina: maquina, feitoPor: feitoPor };
        } else {
        // Atualizar o objeto existente no array com os valores iniciais do loadEditForm
            editingProduct.etapasTiktik[rowIndex].processo = processo;
            editingProduct.etapasTiktik[rowIndex].maquina = maquina;
            editingProduct.etapasTiktik[rowIndex].feitoPor = feitoPor;
        }

    const processoSelect = tr.querySelector('.processo-select');
    const maquinaSelect = tr.querySelector('.maquina-select');
    const feitoPorSelect = tr.querySelector('.feito-por-select');

    processoSelect.addEventListener('change', () => {
            editingProduct.etapasTiktik[rowIndex].processo = processoSelect.value; // Salva no objeto
            window.updateEtapasTiktikOptions(); // Atualiza as opções nos selects do DOM
             });
            maquinaSelect.addEventListener('change', () => {
            editingProduct.etapasTiktik[rowIndex].maquina = maquinaSelect.value; // Salva no objeto
            });
            feitoPorSelect.addEventListener('change', () => {
            editingProduct.etapasTiktik[rowIndex].feitoPor = feitoPorSelect.value; // Salva no objeto
            });

    window.updateEtapasTiktikOptions();
};

// ** <-- INÍCIO: ADICIONAR FUNÇÃO PARA REMOVER LINHA E ATUALIZAR editingProduct.etapasTiktik --> **
window.removerEtapaTiktikRow = function(btn, index) {
        const row = btn.parentElement.parentElement; // Pega o <tr> pai
        const rowIndex = parseInt(row.dataset.index); // Pega o índice salvo no data-index
        console.log('[removerEtapaTiktikRow] Removendo linha de etapa de arremate/tiktik no índice:', rowIndex);
    
        // Remove o elemento <tr> do DOM
        row.remove();
    
        // Remove o item correspondente do array editingProduct.etapasTiktik
        if (editingProduct && editingProduct.etapasTiktik && Array.isArray(editingProduct.etapasTiktik)) {
                editingProduct.etapasTiktik.splice(rowIndex, 1);
            console.log('[removerEtapaTiktikRow] Item removido do array editingProduct.etapasTiktik:', editingProduct.etapasTiktik);
        } else {
            console.warn('[removerEtapaTiktikRow] editingProduct.etapasTiktik não encontrado ou não é um array.');
        }
    
        // Reindexa os data-index no DOM para corresponder ao novo array
        Array.from(elements.etapasTiktikBody.querySelectorAll('tr')).forEach((updatedRow, newIndex) => {
            updatedRow.dataset.index = newIndex;
            // Atualiza os onclick/onchange para usar o novo índice
            const removeBtn = updatedRow.querySelector('.botao-remover-produto');
            if (removeBtn) removeBtn.onclick = () => removerEtapaTiktikRow(removeBtn, newIndex);
    
            const processoSelect = updatedRow.querySelector('.processo-select');
            if (processoSelect) processoSelect.removeEventListener('change', updateFinishStepListener); // Remove listener antigo
            processoSelect.addEventListener('change', (e) => updateFinishStepListener(e, newIndex, 'processo')); // Adiciona novo com índice atualizado
    
            const maquinaSelect = updatedRow.querySelector('.maquina-select');
            if (maquinaSelect) maquinaSelect.removeEventListener('change', updateFinishStepListener);
            maquinaSelect.addEventListener('change', (e) => updateFinishStepListener(e, newIndex, 'maquina'));
    
            const feitoPorSelect = updatedRow.querySelector('.feito-por-select');
            if (feitoPorSelect) feitoPorSelect.removeEventListener('change', updateFinishStepListener);
            feitoPorSelect.addEventListener('change', (e) => updateFinishStepListener(e, newIndex, 'feitoPor'));
        });
    
        // Atualiza as opções dos selects após a remoção
        window.updateEtapasTiktikOptions();
    
    };

    // Função auxiliar para os event listeners de select
function updateFinishStepListener(event, index, field) {
        const value = event.target.value;
        if (editingProduct && editingProduct.etapasTiktik && editingProduct.etapasTiktik[index]) {
            editingProduct.etapasTiktik[index][field] = value;
            console.log(`[updateFinishStepListener] Atualizado etapasTiktik[${index}].${field}: ${value}`, editingProduct.etapasTiktik[index]);
        } else {
            console.warn('[updateFinishStepListener] editingProduct.etapasTiktik ou índice inválido:', index);
        }
    };

window.updateEtapasTiktikOptions = function() {
    const selects = elements.etapasTiktikBody.querySelectorAll('.processo-select');
    const processosUsados = Array.from(selects).map(select => select.value).filter(v => v);

    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = `<option value="">Selecione um processo</option>`;
        PROCESSOS.forEach(processo => {
            const option = document.createElement('option');
            option.value = processo;
            option.textContent = processo;
            if (processosUsados.includes(processo) && processo !== currentValue) {
                option.disabled = true;
                option.classList.add('processo-usado');
            }
            if (processo === currentValue) option.selected = true;
            select.appendChild(option);
        });
    });
};

window.addVariacaoRow = function(chave = 'cor', valores = '', index = null) {
    const variacoesContainer = document.getElementById('variacoesContainer');
    const idx = index !== null ? index : variacoesContainer.children.length;
    const div = document.createElement('div');
    div.className = 'cp-variacao-row';
    div.dataset.index = idx;
    div.innerHTML = `
        <div class="grupo-form-produto">
            <label for="chaveVariacao${idx}">Variação</label>
            <select id="chaveVariacao${idx}" class="cp-select-variacao" onchange="verificarOutro(this, ${idx}); marcarVariacoesAlteradas()">
                <option value="cor" ${chave === 'cor' ? 'selected' : ''}>Cor</option>
                <option value="tamanho" ${chave === 'tamanho' ? 'selected' : ''}>Tamanho</option>
                <option value="outro" ${chave === 'outro' ? 'selected' : ''}>Outro...</option>
                ${chave !== 'cor' && chave !== 'tamanho' && chave !== 'outro' && chave ? `<option value="${chave}" selected>${chave}</option>` : ''}
            </select>
        </div>
        <div class="grupo-form-produto">
            <label for="valoresVariacao${idx}">Valores (separados por vírgula)</label>
            <input type="text" id="valoresVariacao${idx}" class="valores-variacao-input" value="${valores}" oninput="marcarVariacoesAlteradas()">
        </div>
        <button class="cp-remove-btn" onclick="removerVariacaoRow(this, ${idx})">X</button>
    `;
    variacoesContainer.appendChild(div);
    variacoesTemp.push({ chave, valores: valores.split(',').map(v => v.trim()).filter(v => v) });
};


window.marcarVariacoesAlteradas = function() {
    variacoesAlteradas = true;
};

window.removerVariacaoRow = function(btn, index) {
    const row = btn.parentElement;
    const chave = document.getElementById(`chaveVariacao${index}`)?.value || '';
    row.remove();
    removeVariacaoFromGrade(chave, index);
    variacoesTemp.splice(index, 1);
    variacoesAlteradas = true;
    loadGrade(editingProduct);
    variacoesAlteradas = true; // Apenas marque como alterado, o usuário deve salvar manualmente
};

window.salvarVariacoes = async function() {
    const variacoesRows = Array.from(document.querySelectorAll('.cp-variacao-row'));
    variacoesTemp = variacoesRows.map((row, i) => ({
        chave: document.getElementById(`chaveVariacao${i}`)?.value || '',
        valores: document.getElementById(`valoresVariacao${i}`)?.value || ''
    }));

    editingProduct.variacoes = variacoesTemp.map(v => ({
        chave: v.chave,
        valores: v.valores
    }));

    variacoesAlteradas = false;
    console.log('[salvarVariacoes] Variações atualizadas localmente:', editingProduct.variacoes);

    try {
        const savedProduct = await salvarProdutoNoBackend();
        console.log('[salvarVariacoes] Variações salvas no backend com sucesso:', savedProduct.variacoes);
        alert('Variações salvas com sucesso!');
    } catch (error) {
        console.error('[salvarVariacoes] Erro ao salvar no backend:', error.message, error.stack);
        alert('Erro ao salvar as variações: ' + error.message);
        throw error;
    }

    loadGrade(editingProduct);
};

function removeVariacaoFromGrade(chaveRemovida, indexRemovido) {
    const variacoesRows = Array.from(document.querySelectorAll('.cp-variacao-row'));
    const variacoes = variacoesRows.map(row => ({
        chave: document.getElementById(`chaveVariacao${row.dataset.index}`)?.value || '',
        valores: Array.from(row.querySelectorAll('.cp-tag')).map(tag => tag.textContent)
    }));

    const grade = editingProduct.grade || [];
    editingProduct.grade = grade.map(item => {
        const partes = item.variacao.split(' | ');
        const variacaoIndex = variacoes.findIndex(v => v.chave === chaveRemovida);
        if (variacaoIndex !== -1 && partes.length > 1) {
            partes.splice(variacaoIndex, 1);
            return { ...item, variacao: partes.join(' | ') };
        }
        return item;
    }).filter(item => item.variacao.trim() !== '');
}

window.verificarOutro = function(select, index) {
    if (select.value === 'outro') {
        currentSelectIndex = index;
        elements.variacaoPopup.style.display = 'flex';
        elements.novaVariacaoDescricao.value = '';
    }
};

window.confirmarNovaVariacao = function() {
    const descricao = elements.novaVariacaoDescricao.value.trim();
    if (descricao) {
        const select = document.getElementById(`chaveVariacao${currentSelectIndex}`);
        const options = Array.from(select.options).map(opt => opt.value.toLowerCase());
        if (options.includes(descricao.toLowerCase())) {
            alert('Erro: Esta variação já existe!');
            return;
        }
        const option = document.createElement('option');
        option.value = descricao;
        option.textContent = descricao;
        option.selected = true;
        select.insertBefore(option, select.querySelector('option[value="outro"]'));
        fecharPopup();
        variacoesAlteradas = true; // Apenas marcar como alterado
        loadGrade(editingProduct); // Atualizar a grade no DOM
    }
};

window.fecharPopup = function() {
    elements.variacaoPopup.style.display = 'none';
    currentSelectIndex = null;
};

function criarTags(containerId, valores) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const tags = valores ? valores.split(',').map(v => v.trim()) : [];
    tags.forEach(tag => {
        if (tag) {
            const span = document.createElement('span');
            span.className = 'cp-tag';
            span.textContent = tag;
            span.onclick = () => editarTag(span);
            container.appendChild(span);
        }
    });
    const input = document.createElement('input');
    input.className = 'cp-tag-input';
    input.type = 'text';
    input.onkeydown = e => {
        if (e.key === ',' || e.key === 'Enter') {
            e.preventDefault();
            const valor = input.value.trim();
            if (valor) {
                const span = document.createElement('span');
                span.className = 'cp-tag';
                span.textContent = valor;
                span.onclick = () => editarTag(span);
                container.insertBefore(span, input);
                input.value = '';
                salvarProdutoNoBackend();
                loadGrade(editingProduct);
            }
        }
    };
    container.appendChild(input);
}

function editarTag(span) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = span.textContent;
    input.className = 'cp-tag-input';
    input.onblur = () => {
        const novoValor = input.value.trim();
        if (novoValor) {
            span.textContent = novoValor;
        } else {
            span.remove();
            removerTagFromGrade(span.textContent);
        }
        span.style.display = 'inline-block';
        input.remove();
        variacoesAlteradas = true; // Apenas marcar como alterado
        loadGrade(editingProduct); // Atualizar a grade no DOM
    };
    input.onkeydown = e => { if (e.key === 'Enter') input.blur(); };
    span.style.display = 'none';
    span.parentNode.insertBefore(input, span.nextSibling);
    input.focus();
}

function removerTagFromGrade(valorRemovido) {
    const grade = editingProduct.grade || [];
    editingProduct.grade = grade.filter(item => !item.variacao.includes(valorRemovido));
}


window.updateProcessosOptions = function() {
    const selects = elements.stepsBody.querySelectorAll('.processo-select');
    const processosUsados = Array.from(selects).map(select => select.value).filter(v => v);

    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = `<option value="">Selecione um processo</option>`;
        PROCESSOS.forEach(processo => {
            const option = document.createElement('option');
            option.value = processo;
            option.textContent = processo;
            if (processosUsados.includes(processo) && processo !== currentValue) {
                option.disabled = true;
                option.classList.add('processo-usado');
            }
            if (processo === currentValue) option.selected = true;
            select.appendChild(option);
        });
    });
};

// Lógica de Drag and Drop (garante que os data-index estejam corretos após o drop)
function initializeDragAndDrop() {
        function setupDragAndDrop(container, updateDataFn) { // Adicionado updateDataFn
    
            container.addEventListener('drop', e => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain')); // Parse para número
                const toRow = e.target.closest('tr');
                if (!toRow) return;
    
                const toIndex = parseInt(toRow.dataset.index); // Parse para número
                const rows = Array.from(container.querySelectorAll('tr'));
                const fromRow = rows.find(row => parseInt(row.dataset.index) === fromIndex); // Parse para número
    
                if (fromRow && toRow && fromRow !== toRow) {

                        if (fromIndex < toIndex) {
                        toRow.after(fromRow);
                    } else {
                        toRow.before(fromRow);
                    }
    
                    const updatedRows = Array.from(container.querySelectorAll('tr'));
                    updatedRows.forEach((row, index) => {
                        row.dataset.index = index.toString(); // Garante que o data-index seja string
    
                        const removeBtn = row.querySelector('.botao-remover-produto');
                        if (removeBtn) removeBtn.onclick = () => {
                            // Passa o índice CORRETO para a função de remover
                            if (container.id === 'stepsBody') removerStepRow(removeBtn, index); // Função de remover etapas normais
                            else if (container.id === 'etapasTiktikBody') removerEtapaTiktikRow(removeBtn, index); // Função de remover etapasTiktik
                        };
    
                        const processoSelect = row.querySelector('.processo-select');
                        if (processoSelect) {
                            // Remover listener antigo e adicionar novo com o novo 'index' e 'container.id'
                            processoSelect.removeEventListener('change', handleStepSelectChange); // Assumindo um handler genérico
                            processoSelect.addEventListener('change', (e) => handleStepSelectChange(e, index, 'processo', container.id));
                        }
                    });
    
                    const dataArray = container.id === 'stepsBody' ? editingProduct.etapas : editingProduct.etapasTiktik;
                    const [movedItem] = dataArray.splice(fromIndex, 1); // Remove do local original
                    dataArray.splice(toIndex, 0, movedItem); // Insere no novo local
    
                    // Atualizar referências no editingProduct
                    if (container.id === 'stepsBody') editingProduct.etapas = dataArray;
                    else if (container.id === 'etapasTiktikBody') editingProduct.etapasTiktik = dataArray;

                    console.log(`[initializeDragAndDrop] Linha movida de ${fromIndex} para ${toIndex}. Dados reorganizados.`, dataArray);
                }
            });
        }
    
        setupDragAndDrop(elements.stepsBody);
        setupDragAndDrop(elements.etapasTiktikBody);
    }

function bloquearCampos(mensagem = '', erroNaGrade = false) {
    const camposEditaveis = document.querySelectorAll(
        '#productForm input, #productForm select, #productForm button:not(.cp-remove-btn), #productForm textarea'
    );
    camposEditaveis.forEach(campo => {
        if (!campo.classList.contains('cp-grade-sku')) { // Exceto o campo SKU com erro
            campo.disabled = true;
        }
    });

    // Remover qualquer aviso anterior
    const avisoAnterior = document.getElementById('aviso-duplicidade');
    if (avisoAnterior) avisoAnterior.remove();

    if (mensagem) {
        // Determinar a aba onde o erro deve ser exibido
        const abaAlvo = erroNaGrade ? 'variacoes' : 'dados-gerais';
        const abaElement = document.getElementById(abaAlvo);

        // Criar o elemento de aviso
        const aviso = document.createElement('div');
        aviso.id = 'aviso-duplicidade';
        aviso.style.color = 'red';
        aviso.style.marginBottom = '10px';
        aviso.textContent = mensagem;

        // Adicionar o aviso no início da aba correta
        abaElement.prepend(aviso);

        // Redirecionar para a aba correta, se necessário
        const abaAtiva = document.querySelector('.conteudo-aba-produto.active').id;
        if (abaAtiva !== abaAlvo) {
            switchTab(abaAlvo);
        }
    }
}

function desbloquearCampos() {
    const camposEditaveis = document.querySelectorAll(
        '#productForm input, #productForm select, #productForm button:not(.cp-remove-btn), #productForm textarea'
    );
    camposEditaveis.forEach(campo => {
        campo.disabled = false;
    });
    const aviso = document.getElementById('aviso-duplicidade');
    if (aviso) aviso.remove();
}


// Ajuste na função temDuplicatasDeSku para receber o produto a ser verificado
function temDuplicatasDeSku(produtoParaVerificar) {
    if (!produtoParaVerificar) return { hasDuplicates: false, erroNaGrade: false };

    const gradeDoProduto = produtoParaVerificar.grade || [];
    const skuPrincipalDoProduto = produtoParaVerificar.sku || '';

    // SKUs DENTRO do produto atual (principal + grade)
    const currentSkusDoProduto = [
        skuPrincipalDoProduto,
        ...gradeDoProduto.map(g => g.sku)
    ].filter(sku => sku && sku.trim() !== '');

    // Verificar duplicatas internas no produto atual
    const duplicatasInternas = currentSkusDoProduto.some((sku, i, arr) => 
        arr.indexOf(sku) !== i // Se o primeiro índice do SKU não for o índice atual, é duplicata
    );

    // SKUs de OUTROS produtos
    const skusDeOutrosProdutos = produtos
        .filter(p => p.id !== produtoParaVerificar.id) // Exclui o próprio produto da verificação global
        .flatMap(prod => [
            prod.sku,
            ...(prod.grade || []).map(g => g.sku)
        ])
        .filter(s => s && s.trim() !== '');

    // Verificar se algum SKU do produto atual existe em outros produtos
    const duplicatasGlobais = currentSkusDoProduto.some(sku => skusDeOutrosProdutos.includes(sku));

    const hasOverallDuplicates = duplicatasInternas || duplicatasGlobais;

    // Determinar se o erro é especificamente na grade do produto atual
    // (se o SKU principal está duplicado na grade, ou se SKUs da grade estão duplicados entre si,
    // ou se um SKU da grade está duplicado globalmente)
    let erroNaGradeEspecifico = false;
    if (duplicatasInternas) {
        // Verifica se a duplicata interna envolve a grade
        const skusUnicosDaGrade = [...new Set(gradeDoProduto.map(g => g.sku).filter(s => s && s.trim() !== ''))];
        if (skusUnicosDaGrade.length < gradeDoProduto.filter(g => g.sku && g.sku.trim() !== '').length) { // SKUs duplicados DENTRO da grade
            erroNaGradeEspecifico = true;
        }
        if (skuPrincipalDoProduto && gradeDoProduto.some(g => g.sku === skuPrincipalDoProduto)) { // SKU principal duplicado na grade
            erroNaGradeEspecifico = true;
        }
    }
    if (!erroNaGradeEspecifico && duplicatasGlobais) {
        // Verifica se a duplicata global é por causa de um SKU da grade
        if (gradeDoProduto.some(g => g.sku && skusDeOutrosProdutos.includes(g.sku))) {
            erroNaGradeEspecifico = true;
        }
    }
    
    if (hasOverallDuplicates) {
        console.warn('[temDuplicatasDeSku] Duplicata de SKU encontrada:', {
            produtoVerificado: produtoParaVerificar.nome,
            skuPrincipal: skuPrincipalDoProduto,
            skusNaGrade: gradeDoProduto.map(g => g.sku),
            duplicatasInternas,
            duplicatasGlobais,
            erroNaGrade: erroNaGradeEspecifico
        });
    }

    return { hasDuplicates: hasOverallDuplicates, erroNaGrade: erroNaGradeEspecifico };
}


window.validarSku = function(index, input) {
    const skuValue = input.value.trim();
    const grade = Array.from(elements.gradeBody.querySelectorAll('tr')).map(tr => ({
        sku: tr.cells[2].querySelector('.cp-grade-sku')?.value || ''
    }));
    const currentIndex = parseInt(index);

    let errorSpan = input.nextElementSibling;
    if (errorSpan && errorSpan.classList.contains('error-message')) {
        errorSpan.remove(); // Remover mensagem antiga
    }

    errorSpan = document.createElement('span');
    errorSpan.className = 'error-message';
    input.parentNode.appendChild(errorSpan);

    const isDuplicateInGrade = grade.some((item, i) => item.sku === skuValue && i !== currentIndex);

    const allSkus = produtos
        .filter(prod => prod.id !== editingProduct.id)
        .flatMap(prod => [
            prod.sku,
            ...(prod.grade || []).map(g => g.sku)
        ])
        .filter(sku => sku && sku !== (editingProduct.grade[currentIndex]?.sku || ''));

    const isDuplicateGlobally = allSkus.includes(skuValue);

    if ((isDuplicateInGrade || isDuplicateGlobally) && skuValue) {
        input.classList.add('error');
        errorSpan.textContent = 'Este SKU já está em uso!';
        errorSpan.style.display = 'inline';
        bloquearCampos('Corrija o SKU duplicado antes de continuar editando.', true);
        localStorage.setItem('produtoComDuplicidade', JSON.stringify(editingProduct));
    } else {
        input.classList.remove('error');
        errorSpan.textContent = '';
        errorSpan.style.display = 'none';
        desbloquearCampos();
        localStorage.removeItem('produtoComDuplicidade');
        gradeAlteradas = true;
    }
};

async function salvarProdutoNoBackend() {
    if (!editingProduct) {
        console.error('[salvarProdutoNoBackend] Nenhum produto está sendo editado.');
        alert('Erro: Nenhum produto selecionado para salvar.');
        throw new Error('Nenhum produto selecionado para salvar.'); // Interrompe a execução
    }

    // 1. Ler nome do produto do input
    const nomeDoProdutoDoInput = elements.inputProductName ? elements.inputProductName.value.trim() : (editingProduct.nome || '');
    if (!nomeDoProdutoDoInput) {
        alert("O nome do produto é obrigatório!");
        elements.inputProductName?.focus();
        throw new Error("Nome do produto é obrigatório."); // Interrompe a execução
    }

    // 2. Ler outros dados do formulário e do estado
    const tiposSelecionados = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
    const isKit = tiposSelecionados.includes('kits');

    // console.log('[salvarProdutoNoBackend] Lendo etapas do DOM:'); // Log já existente se você adicionou
    const etapasDoDom = Array.from(elements.stepsBody.querySelectorAll('tr')).map(tr => ({
        processo: tr.querySelector('.processo-select')?.value || '',
        maquina: tr.querySelector('.maquina-select')?.value || '',
        feitoPor: tr.querySelector('.feito-por-select')?.value || ''
    }));
    // console.log('[salvarProdutoNoBackend] Etapas lidas do DOM:', JSON.stringify(etapasDoDom, null, 2)); // Log já existente

    // console.log('[salvarProdutoNoBackend] Lendo etapasTiktik do DOM:'); // Log já existente
    const etapasTiktikDoDom = Array.from(elements.etapasTiktikBody.querySelectorAll('tr')).map(tr => ({
        processo: tr.querySelector('.processo-select')?.value || '',
        maquina: tr.querySelector('.maquina-select')?.value || '',
        feitoPor: tr.querySelector('.feito-por-select')?.value || ''
    }));
    // console.log('[salvarProdutoNoBackend] EtapasTiktik lidas do DOM:', JSON.stringify(etapasTiktikDoDom, null, 2)); // Log já existente

    // 3. Montar o objeto `updatedProduct`
    // Usar o `editingProduct` como base para manter `id` (se for edição) e outras propriedades
    // que não são diretamente do formulário (como `variacoes` e `grade` que são salvas separadamente
    // ou que já estão em `editingProduct.grade` após `salvarGrade`).
    const updatedProduct = {
        ...editingProduct, // Começa com o estado atual do produto em edição (importante para manter o ID e dados não alterados)
        nome: nomeDoProdutoDoInput,
        sku: elements.sku.value || '',
        tipos: tiposSelecionados,
        is_kit: isKit, // Usar is_kit consistentemente
        gtin: elements.gtin.value || '',
        unidade: elements.unidade.value || '',
        estoque: parseInt(elements.estoque.value) || 0,
        imagem: elements.previewImagem.src || '', // Pega da preview, que é atualizada pelo input de imagem
        // Variações e Grade são mais complexas e podem já estar atualizadas em `editingProduct`
        // por suas próprias funções de salvar (`salvarVariacoes`, `salvarGrade`).
        // Se elas não são salvas separadamente ANTES daqui, você precisaria lê-las do DOM aqui também.
        // Assumindo que `editingProduct.variacoes` e `editingProduct.grade` estão atualizados:
        variacoes: editingProduct.variacoes || [], // Pega de editingProduct
        grade: editingProduct.grade || [],         // Pega de editingProduct
        etapas: isKit ? [] : etapasDoDom,
        etapasTiktik: isKit ? [] : etapasTiktikDoDom
        // As colunas `pontos`, `pontos_expiracao`, `pontos_criacao` foram removidas
    };
    // Remover a propriedade 'isKit' duplicada se 'is_kit' já estiver sendo usada consistentemente
    delete updatedProduct.isKit;


    // 4. Validar SKUs duplicados (sua lógica existente)
    // A função temDuplicatasDeSku() precisa ser ajustada para ler do `updatedProduct`
    const { hasDuplicates, erroNaGrade } = temDuplicatasDeSku(updatedProduct); // Passar o produto atualizado
    if (hasDuplicates) {
        console.log('[salvarProdutoNoBackend] Salvamento bloqueado devido a SKUs duplicados.');
        bloquearCampos('Corrija o SKU duplicado antes de continuar editando.', erroNaGrade);
        localStorage.setItem('produtoComDuplicidade', JSON.stringify(updatedProduct)); // Salva o estado com erro
        throw new Error('SKU duplicado detectado.'); // Interrompe a execução
    }

    // 5. Logs de verificação de tipo (já existentes)
    console.log('[salvarProdutoNoBackend] Verificando tipos para JSONB antes do fetch:');
    console.log('typeof updatedProduct.tipos:', typeof updatedProduct.tipos, Array.isArray(updatedProduct.tipos));
    console.log('typeof updatedProduct.variacoes:', typeof updatedProduct.variacoes, Array.isArray(updatedProduct.variacoes));
    console.log('typeof updatedProduct.estrutura:', typeof updatedProduct.estrutura, Array.isArray(updatedProduct.estrutura)); // Se estrutura ainda existir
    console.log('typeof updatedProduct.etapas:', typeof updatedProduct.etapas, Array.isArray(updatedProduct.etapas));
    console.log('typeof updatedProduct.etapasTiktik:', typeof updatedProduct.etapasTiktik, Array.isArray(updatedProduct.etapasTiktik));
    console.log('typeof updatedProduct.grade:', typeof updatedProduct.grade, Array.isArray(updatedProduct.grade));
    // console.log('typeof updatedProduct.pontos:', typeof updatedProduct.pontos, Array.isArray(updatedProduct.pontos)); // Removido

    // 6. Enviar para o backend
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('[salvarProdutoNoBackend] Nenhum token encontrado.');
            alert('Sessão expirada. Por favor, faça login novamente.');
            window.location.href = '/login.html'; // Ou '/index.html' se for sua página de login
            throw new Error('Token não encontrado.');
        }

        console.log('[salvarProdutoNoBackend] Enviando produto para o backend:', JSON.stringify(updatedProduct, null, 2)); // Log detalhado
        const response = await fetch('/api/produtos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updatedProduct)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status} - ${response.statusText}` }));
            console.error('[salvarProdutoNoBackend] Resposta do servidor com erro:', response.status, errorData);
            throw new Error(errorData.error || `Erro ao salvar produto: ${response.status}`);
        }

        const savedProduct = await response.json();
        console.log('[salvarProdutoNoBackend] Produto salvo com sucesso no backend:', savedProduct);

        // Atualizar o estado global de `editingProduct` e a lista `produtos`
        editingProduct = deepClone(savedProduct);
        const productIndex = produtos.findIndex(p => p.id === savedProduct.id);
        if (productIndex > -1) {
            produtos[productIndex] = deepClone(savedProduct);
        } else {
            produtos.push(deepClone(savedProduct)); // Adiciona se for um produto completamente novo
        }

        desbloquearCampos(); // Se os campos foram bloqueados por erro de SKU
        localStorage.removeItem('produtoComDuplicidade');
        invalidateCache('produtosCadastrados'); // Invalida o cache do storage.js
        console.log('[salvarProdutoNoBackend] Cache de produtos invalidado após salvamento');
        
        return savedProduct; // Retorna o produto salvo/atualizado

    } catch (error) {
        console.error('[salvarProdutoNoBackend] Erro detalhado no try-catch do fetch:', error.message, error.stack);
        // Tenta extrair a mensagem de erro do objeto de erro, se existir
        const errorMessage = error.details || error.message || "Erro desconhecido ao salvar produto.";
        alert('Erro ao salvar o produto: ' + errorMessage);
        throw error; // Re-lança o erro para que o listener de submit do formulário possa tratar
    }
}

window.abrirImagemPopup = function(index) {
    currentGradeIndex = index;
    elements.gradeImageInput.value = '';
    elements.gradeImagePopup.style.display = 'flex';
};

window.confirmarImagemGrade = function() {
    const arquivo = elements.gradeImageInput.files[0];
    if (arquivo) {
        resizeImage(arquivo, imagemRedimensionada => {
            const tr = elements.gradeBody.querySelector(`tr[data-index="${currentGradeIndex}"]`);
            const imgDiv = tr.querySelector('.img-placeholder');
            imgDiv.innerHTML = `<img src="${imagemRedimensionada}" class="cp-variacao-img" alt="Imagem da variação">`;
            const grade = editingProduct.grade || [];
            grade[currentGradeIndex].imagem = imagemRedimensionada;
            console.log(`[confirmarImagemGrade] Imagem salva para variação ${grade[currentGradeIndex].variacao}:`, imagemRedimensionada);
            gradeAlteradas = true; // Marcar que a grade foi alterada
            fecharImagemPopup();
        });
    }
};

window.fecharImagemPopup = function() {
    elements.gradeImagePopup.style.display = 'none';
    currentGradeIndex = null;
};

window.excluirGrade = function(index) {
    const parsedIndex = parseInt(index);
    if (isNaN(parsedIndex) || !editingProduct || !editingProduct.grade || !Array.isArray(editingProduct.grade) || parsedIndex < 0 || parsedIndex >= gradeTemp.length) {
        console.error('[excluirGrade] Índice inválido:', index, 'Tamanho da gradeTemp:', gradeTemp.length, 'Grade:', editingProduct.grade);
        return;
    }

    const tr = elements.gradeBody.querySelector(`tr[data-index="${parsedIndex}"]`);
    if (!tr) {
        console.error('[excluirGrade] Linha não encontrada para índice:', parsedIndex, 'DOM atual:', elements.gradeBody.innerHTML);
        return;
    }

    const variacaoExcluida = tr.cells[0].textContent;
    console.log('[excluirGrade] Excluindo variação:', variacaoExcluida, 'Índice:', parsedIndex);

    gradeTemp = gradeTemp.filter((_, i) => i !== parsedIndex);
    editingProduct.grade = deepClone(gradeTemp);
    gradeAlteradas = true;

    console.log('[excluirGrade] Grade após exclusão:', editingProduct.grade);
    loadGrade(editingProduct);
    salvarGrade();
};


window.abrirConfigurarVariacao = function(index) {
    const parsedIndex = parseInt(index);
    if (isNaN(parsedIndex) || !editingProduct || !editingProduct.grade || !Array.isArray(editingProduct.grade)) {
        console.error('[abrirConfigurarVariacao] Índice ou grade inválidos:', index, 'Produto:', editingProduct);
        alert('Erro: Índice de variação inválido ou produto não carregado!');
        return;
    }
    if (parsedIndex < 0 || parsedIndex >= editingProduct.grade.length) {
        console.error('[abrirConfigurarVariacao] Índice fora dos limites:', parsedIndex, 'Tamanho da grade:', editingProduct.grade.length, 'Grade:', editingProduct.grade);
        alert('Erro: Índice de variação fora dos limites!');
        return;
    }
    console.log('[abrirConfigurarVariacao] Abrindo configuração para índice:', parsedIndex, 'Variação:', editingProduct.grade[parsedIndex]);
    currentKitVariationIndex = parsedIndex;
    window.location.hash = `#configurar-variacao/${parsedIndex}`;
};

function carregarConfigurarVariacao(index) {
    const parsedIndex = parseInt(index);
    if (isNaN(parsedIndex) || (!index && index !== 0)) {
        console.error('[carregarConfigurarVariacao] Índice inválido:', index);
        alert('Índice de variação inválido. Voltando para a edição.');
        window.location.hash = '#editando';
        return;
    }

    if (!editingProduct || !editingProduct.grade || !Array.isArray(editingProduct.grade)) {
        console.error('[carregarConfigurarVariacao] Produto ou grade não inicializados. Produto:', editingProduct);
        alert('Erro: Produto não está corretamente carregado.');
        window.location.hash = '#editando';
        return;
    }

    if (parsedIndex < 0 || parsedIndex >= editingProduct.grade.length) {
        console.error('[carregarConfigurarVariacao] Índice fora dos limites:', parsedIndex, 'Tamanho da grade:', editingProduct.grade.length, 'Grade:', editingProduct.grade);
        alert('Índice de variação fora dos limites. Voltando para a edição.');
        window.location.hash = '#editando';
        return;
    }

    currentKitVariationIndex = parsedIndex;
    kitComposicaoTemp = deepClone(editingProduct.grade[parsedIndex].composicao || []);
    console.log('[carregarConfigurarVariacao] Carregando composição para variação:', editingProduct.grade[parsedIndex].variacao, 'Composição:', kitComposicaoTemp);

    elements.produtoKitSelect.value = '';
    elements.produtoKitSelect.disabled = false;
    elements.variacaoKitSelect.innerHTML = '<option value="">Selecione uma variação</option>';
    elements.composicaoKitContainer.innerHTML = '';

    elements.configurarVariacaoTitle.textContent = `Configurar ${editingProduct.nome} - ${editingProduct.grade[parsedIndex].variacao}`;

    const produtosFiltrados = produtos.filter(p => PRODUTOS.includes(p.nome) && p.nome !== editingProduct.nome);
    elements.produtoKitSelect.innerHTML = '<option value="">Selecione um produto</option>';
    produtosFiltrados.forEach(prod => {
        const option = document.createElement('option');
        option.value = prod.nome;
        option.textContent = prod.nome;
        elements.produtoKitSelect.appendChild(option);
    });

    renderizarComposicaoKit();

    // Associar evento ao botão "Configurar" correto
    const configurarBtn = document.getElementById('saveKitConfigBtn');
    if (configurarBtn) {
        configurarBtn.removeEventListener('click', salvarComposicaoKit);
        configurarBtn.addEventListener('click', salvarComposicaoKit);
        console.log('[carregarConfigurarVariacao] Evento click associado ao botão Configurar:', configurarBtn);
    } else {
        console.error('[carregarConfigurarVariacao] Botão Configurar (#saveKitConfigBtn) não encontrado no DOM');
    }
}

window.loadVariacoesKit = function() {
    const produtoNome = elements.produtoKitSelect.value;
    if (!produtoNome) return;

    const produto = produtos.find(p => p.nome === produtoNome);
    elements.variacaoKitSelect.innerHTML = '<option value="">Selecione uma variação</option>';

    if (produto && produto.grade) {
        produto.grade.forEach(item => {
            const option = document.createElement('option');
            option.value = item.variacao;
            option.textContent = item.variacao;
            elements.variacaoKitSelect.appendChild(option);
        });
    }

    if (!elements.produtoKitSelect.disabled) {
        elements.produtoKitSelect.disabled = true;
        Array.from(elements.produtoKitSelect.options).forEach(opt => {
            if (opt.value && opt.value !== produtoNome) opt.disabled = true;
        });
    }
};


elements.addVariacaoKitBtn.addEventListener('click', () => {
    const produtoNome = elements.produtoKitSelect.value; // <<< CAPTURAR O NOME DO PRODUTO BASE
    const variacao = elements.variacaoKitSelect.value;
    
    if (!produtoNome) { // Validar se um produto base foi selecionado
        alert('Selecione o produto base para o componente do kit.');
        elements.produtoKitSelect.focus();
        return;
    }
    if (!variacao || variacao === 'Selecione uma variação') {
        alert('Selecione uma variação para o componente do kit.');
        elements.variacaoKitSelect.focus();
        return;
    }

    // Adicionar à composição temporária com o nome do produto
    kitComposicaoTemp.push({ 
        produto: produtoNome, // <<< SALVAR O NOME DO PRODUTO
        variacao: variacao, 
        quantidade: 1 // Default inicial
    });
    renderizarComposicaoKit();
    console.log('[addVariacaoKitBtn] Composição adicionada localmente:', kitComposicaoTemp);
    // Não precisa de gradeAlteradas = true aqui, pois isso é para a grade do kit principal, não sua composição.
    // O salvamento da composição acontece em salvarComposicaoKit.
});

function renderizarComposicaoKit() {
    elements.composicaoKitContainer.innerHTML = '';
    kitComposicaoTemp.forEach((comp, idx) => {
        const div = document.createElement('div');
        div.className = 'composicao-kit-row';
        // Exibir o nome do produto e a variação. Tornar o nome do produto readonly.
        div.innerHTML = `
            <input type="text" value="${comp.produto} - ${comp.variacao}" readonly class="composicao-produto-variacao-display"> 
            <input type="number" min="1" value="${comp.quantidade}" onchange="atualizarQuantidadeKit(${idx}, this.value)">
            <button class="cp-remove-btn" onclick="removerComposicaoKit(${idx})">X</button>
        `;
        elements.composicaoKitContainer.appendChild(div);
    });
}

window.atualizarQuantidadeKit = function(index, value) {
    kitComposicaoTemp[index].quantidade = parseInt(value) || 1;
    renderizarComposicaoKit();
    gradeAlteradas = true;
};

window.removerComposicaoKit = function(index) {
    kitComposicaoTemp.splice(index, 1);
    renderizarComposicaoKit();
    gradeAlteradas = true;
};

window.salvarComposicaoKit = async function() {
    console.log('[salvarComposicaoKit] Iniciando salvamento. currentKitVariationIndex:', currentKitVariationIndex, 'kitComposicaoTemp:', kitComposicaoTemp);
    if (!currentKitVariationIndex && currentKitVariationIndex !== 0) {
        alert('Nenhuma variação de kit selecionada para configuração!');
        return;
    }

    if (!editingProduct || !editingProduct.grade || !Array.isArray(editingProduct.grade)) {
        alert('Erro: Produto ou grade não estão corretamente inicializados.');
        return;
    }

    if (currentKitVariationIndex < 0 || currentKitVariationIndex >= editingProduct.grade.length) {
        alert('Índice de variação inválido!');
        return;
    }

    if (kitComposicaoTemp.length === 0) {
        alert('Adicione pelo menos uma variação ao kit!');
        return;
    }

    console.log('[salvarComposicaoKit] Salvando composição para índice:', currentKitVariationIndex, 'Composição:', kitComposicaoTemp);
    editingProduct.grade[currentKitVariationIndex].composicao = deepClone(kitComposicaoTemp);
    gradeTemp = deepClone(editingProduct.grade);
    gradeAlteradas = false; // Resetar após salvar

    try {
        const savedProduct = await salvarProdutoNoBackend();
        console.log('[salvarComposicaoKit] Composição do kit salva no backend com sucesso:', savedProduct.grade[currentKitVariationIndex]);
        alert('Composição do kit salva com sucesso!');
        kitComposicaoTemp = deepClone(savedProduct.grade[currentKitVariationIndex].composicao || []); // Atualizar kitComposicaoTemp

        // Recarregar a grade após o salvamento
        loadGrade(savedProduct); // Usar o produto salvo para garantir consistência
        window.location.hash = '#editando'; // Fechar o popup
    } catch (error) {
        console.error('[salvarComposicaoKit] Erro ao salvar no backend:', error.message, error.stack);
        alert('Erro ao salvar a composição do kit: ' + error.message);
    }
};

elements.productForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!editingProduct) return;

    const tiposSelecionados = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
    if (!tiposSelecionados.length) {
        alert('Selecione pelo menos um tipo!');
        return;
    }

    const grade = editingProduct.grade || [];
    const updatedGrade = grade.map(item => {
        const tr = Array.from(elements.gradeBody.querySelectorAll('tr')).find(tr => tr.cells[0].textContent === item.variacao);
        if (tr) {
            return {
                ...item,
                sku: tr.cells[2].querySelector('.cp-grade-sku')?.value || item.sku || '',
                imagem: tr.cells[3].querySelector('img')?.src || item.imagem || ''
            };
        }
        return item;
    });

    // Verificar duplicatas antes de salvar
    const allSkus = produtos.flatMap(p => [
        p.sku,
        ...(p.grade || []).map(g => g.sku)
    ]).filter(sku => sku);
    const currentSkus = [elements.sku.value, ...updatedGrade.map(g => g.sku)].filter(sku => sku);
    const hasDuplicates = currentSkus.some(sku => 
        allSkus.includes(sku) && sku !== editingProduct.sku && !editingProduct.grade.some(g => g.sku === sku)
    );

    if (hasDuplicates) {
        alert('Existem SKUs duplicados. Corrija antes de salvar.');
        return;
    }

    const skuDuplicadosNaGrade = updatedGrade.some((item, i) =>
        updatedGrade.some((other, j) => i !== j && item.sku && item.sku === other.sku)
    );

    if (skuDuplicadosNaGrade) {
        alert('Existem SKUs duplicados na grade. Corrija antes de salvar.');
        return;
    }

    await salvarProdutoNoBackend();
    alert('Produto atualizado com sucesso!');
    window.location.hash = '';
});

window.addEventListener('hashchange', toggleView);
elements.searchProduct.addEventListener('input', () => {
    const activeFilter = document.querySelector('.cp-type-btn.active')?.dataset.type || 'todos';
    loadProductTable(activeFilter, elements.searchProduct.value);
});

document.querySelectorAll('.cp-type-btn').forEach(btn => {
    btn.addEventListener('click', () => filterProducts(btn.dataset.type));
});

// Exportar funções globais
window.salvarProdutoNoBackend = salvarProdutoNoBackend;
window.editProduct = editProduct;
window.switchTab = switchTab;
window.toggleTabs = toggleTabs;
window.addStepRow = addStepRow;
window.addVariacaoRow = addVariacaoRow;
window.removerVariacaoRow = removerVariacaoRow;
window.verificarOutro = verificarOutro;
window.confirmarNovaVariacao = confirmarNovaVariacao;
window.fecharPopup = fecharPopup;
window.updateProcessosOptions = updateProcessosOptions;
window.validarSku = validarSku;
window.abrirImagemPopup = abrirImagemPopup;
window.confirmarImagemGrade = confirmarImagemGrade;
window.fecharImagemPopup = fecharImagemPopup;
window.excluirGrade = excluirGrade;
window.abrirConfigurarVariacao = abrirConfigurarVariacao;
window.loadVariacoesKit = loadVariacoesKit;
window.atualizarQuantidadeKit = atualizarQuantidadeKit;
window.removerComposicaoKit = removerComposicaoKit;
window.salvarComposicaoKit = salvarComposicaoKit;