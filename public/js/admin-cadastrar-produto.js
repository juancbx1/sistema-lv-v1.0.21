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
    editProductName: document.getElementById('editProductName'),
    sku: document.getElementById('sku'),
    gtin: document.getElementById('gtin'),
    unidade: document.getElementById('unidade'),
    estoque: document.getElementById('estoque'),
    imagemProduto: document.getElementById('imagemProduto'),
    previewImagem: document.getElementById('previewImagem'),
    removeImagem: document.getElementById('removeImagem'),
    stepsBody: document.getElementById('stepsBody'),
    finishStepsBody: document.getElementById('finishStepsBody'),
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

// Inicialização
async function inicializarPagina() {
    document.documentElement.setAttribute('hidden', 'true');

    const auth = await verificarAutenticacao('cadastrar-produto.html', ['acesso-cadastrar-produto']);
    if (!auth) {
        console.error('[admin-cadastrar-produto] Autenticação falhou. Usuário logado:', localStorage.getItem('usuarioLogado'));
        return;
    }

    const permissoes = auth.permissoes || [];
    const usuarioLogado = auth.usuario;
    console.log('Inicializando cadastrar-produto para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);

    await loadProductTable('todos', '', true);
    toggleView();
    document.documentElement.removeAttribute('hidden');
}


async function loadProductTable(filterType = 'todos', search = '', forceRefresh = false) {
    try {
        produtos = await obterProdutos(forceRefresh);
        console.log('[loadProductTable] Produtos obtidos:', produtos);

        const allProductNames = [...PRODUTOS, ...PRODUTOSKITS];
        const novosProdutos = [];
        allProductNames.forEach(nome => {
            if (!produtos.find(p => p.nome === nome)) {
                novosProdutos.push({
                    nome,
                    sku: '',
                    tipos: PRODUTOSKITS.includes(nome) ? ['kits'] : [],
                    isKit: PRODUTOSKITS.includes(nome),
                    gtin: '',
                    unidade: '',
                    estoque: 0,
                    imagem: '',
                    variacoes: [],
                    etapas: [],
                    finishEtapas: [],
                    grade: []
                });
            }
        });

        if (novosProdutos.length > 0) {
            console.log('[loadProductTable] Salvando novos produtos:', novosProdutos);
            await salvarProdutos(novosProdutos);
            produtos = await obterProdutos(true);
            console.log('[loadProductTable] Produtos após salvar:', produtos);
        }

        const mappedProdutos = produtos.map(produto => ({
            ...produto,
            isKit: produto.is_kit
        }));

        const filteredProdutos = mappedProdutos
            .filter(p => allProductNames.includes(p.nome))
            .filter(p =>
                (filterType === 'todos' || (p.tipos && p.tipos.includes(filterType))) &&
                p.nome.toLowerCase().includes(search.toLowerCase())
            );

        elements.productTableBody.innerHTML = '';
        filteredProdutos.forEach(produto => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.dataset.nome = produto.nome;
            tr.innerHTML = `
                <td>${produto.imagem ? `<img src="${produto.imagem}" class="miniatura-produto" onclick="editProduct('${produto.nome}')">` : '<span class="espaco-miniatura-produto"></span>'}</td>
                <td>${produto.nome}</td>
                <td>${produto.sku || '-'}</td>
                <td>${produto.unidade || '-'}</td>
                <td>${produto.estoque || 0}</td>
                <td>${produto.tipos ? produto.tipos.join(', ') : '-'}</td>
            `;
            tr.addEventListener('click', () => editProduct(produto.nome));
            elements.productTableBody.appendChild(tr);
        });
    } catch (error) {
        console.error('[loadProductTable] Erro:', error);
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
    console.log('[loadEditForm] Carregando formulário para:', produto.nome);
    console.log('[loadEditForm] Tipos do produto:', produto.tipos);
    elements.editProductName.textContent = `Editando: ${produto.nome}`;
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

    elements.finishStepsBody.innerHTML = '';
    (produto.finishEtapas || []).forEach((etapa, index) => {
        addFinishStepRow(etapa.processo || '', etapa.maquina || '', etapa.feitoPor || '', index);
    });
    window.updateFinishProcessosOptions();

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
    console.log('[loadGrade] Carregando grade para produto:', produto.nome, 'Grade atual:', produto.grade);
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
        console.log('[loadGrade] Renderizando item - Índice:', idx, 'Item:', item);
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
    if (hash === '#editando') {
        if (!editingProduct) {
            const ultimoProdutoEditado = localStorage.getItem('ultimoProdutoEditado');
            const produtoOriginal = produtos.find(p => p.nome === ultimoProdutoEditado);
            if (produtoOriginal) {
                editingProduct = deepClone(produtoOriginal);
                loadEditForm(editingProduct);
            } else {
                window.location.hash = '';
                localStorage.removeItem('ultimaAbaAtiva');
                editingProduct = null;
            }
        }
        elements.productListView.style.display = 'none';
        elements.productFormView.style.display = 'block';
        elements.configurarVariacaoView.style.display = 'none';
    } else if (hash.startsWith('#configurar-variacao/')) {
        elements.productListView.style.display = 'none';
        elements.productFormView.style.display = 'block';
        elements.configurarVariacaoView.style.display = 'flex';
        const index = hash.split('/')[1];
        carregarConfigurarVariacao(index);
    } else {
        if (variacoesAlteradas || gradeAlteradas) {
            const confirmar = confirm('Você tem alterações não salvas em "Variações" ou "Grade". Deseja sair sem salvar?');
            if (!confirmar) {
                window.location.hash = '#editando';
                return;
            }
        }
        elements.productListView.style.display = 'block';
        elements.productFormView.style.display = 'none';
        elements.configurarVariacaoView.style.display = 'none';
        document.querySelectorAll('.cp-type-btn').forEach(btn => btn.classList.remove('active'));
        const todosBtn = document.querySelector('.cp-type-btn[data-type="todos"]');
        if (todosBtn) todosBtn.classList.add('active');
        loadProductTable('todos', elements.searchProduct.value);
        localStorage.removeItem('ultimaAbaAtiva');
        editingProduct = null;
        variacoesAlteradas = false;
        gradeAlteradas = false;
        variacoesTemp = [];
        gradeTemp = [];
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

window.addFinishStepRow = function(processo = '', maquina = '', feitoPor = '', index = null) {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.dataset.index = index !== null ? index : elements.finishStepsBody.children.length;
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
        <td><button class="botao-remover-produto" onclick="this.parentElement.parentElement.remove(); updateFinishProcessosOptions()">X</button></td>
    `;
    elements.finishStepsBody.appendChild(tr);

    const processoSelect = tr.querySelector('.processo-select');
    const maquinaSelect = tr.querySelector('.maquina-select');
    const feitoPorSelect = tr.querySelector('.feito-por-select');

    processoSelect.addEventListener('change', () => {
        updateFinishProcessosOptions();
    });
    maquinaSelect.addEventListener('change', () => {
    });
    feitoPorSelect.addEventListener('change', () => {
    });

    window.updateFinishProcessosOptions();
};

window.updateFinishProcessosOptions = function() {
    const selects = elements.finishStepsBody.querySelectorAll('.processo-select');
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

function initializeDragAndDrop() {
    // Função auxiliar para configurar eventos de drag-and-drop
    function setupDragAndDrop(container) {
        container.addEventListener('dragstart', e => {
            const tr = e.target.closest('tr');
            if (tr) {
                tr.classList.add('dragging');
                e.dataTransfer.setData('text/plain', tr.dataset.index);
            }
        });

        container.addEventListener('dragend', e => {
            const tr = e.target.closest('tr');
            if (tr) tr.classList.remove('dragging');
        });

        container.addEventListener('dragover', e => e.preventDefault());

        container.addEventListener('drop', e => {
            e.preventDefault();
            const fromIndex = e.dataTransfer.getData('text/plain');
            const toRow = e.target.closest('tr');
            if (!toRow) return;

            const toIndex = toRow.dataset.index;
            const rows = Array.from(container.querySelectorAll('tr'));
            const fromRow = rows.find(row => row.dataset.index === fromIndex);

            if (fromRow && toRow && fromRow !== toRow) {
                if (parseInt(fromIndex) < parseInt(toIndex)) {
                    toRow.after(fromRow);
                } else {
                    toRow.before(fromRow);
                }
                rows.forEach((row, index) => row.dataset.index = index);
            }
        });
    }

    // Configurar drag-and-drop para stepsBody e finishStepsBody
    setupDragAndDrop(elements.stepsBody);
    setupDragAndDrop(elements.finishStepsBody);
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


function temDuplicatasDeSku() {
    const grade = editingProduct.grade || [];
    const currentSkus = [
        elements.sku.value,
        ...grade.map(g => g.sku)
    ].filter(sku => sku);

    // Verificar duplicatas dentro do produto atual
    const duplicatasInternas = currentSkus.some((sku, i) => 
        currentSkus.indexOf(sku) !== i
    );

    // Verificar duplicatas em outros produtos
    const allSkus = produtos
        .filter(prod => prod.id !== editingProduct.id)
        .flatMap(prod => [
            prod.sku,
            ...(prod.grade || []).map(g => g.sku)
        ])
        .filter(s => s);

    const duplicatasGlobais = currentSkus.some(sku => allSkus.includes(sku));

    // Determinar se o erro está na grade
    const erroNaGrade = duplicatasInternas || grade.some(g => g.sku && allSkus.includes(g.sku));

    return { hasDuplicates: duplicatasInternas || duplicatasGlobais, erroNaGrade };
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
        return;
    }

    const tiposSelecionados = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
    const isKit = tiposSelecionados.includes('kits');
    console.log('[salvarProdutoNoBackend] Tipos selecionados:', tiposSelecionados, 'isKit:', isKit);

    const updatedProduct = {
        ...editingProduct,
        sku: elements.sku.value || '',
        tipos: tiposSelecionados,
        isKit: isKit,
        gtin: elements.gtin.value || '',
        unidade: elements.unidade.value || '',
        estoque: parseInt(elements.estoque.value) || 0,
        imagem: elements.previewImagem.src || '',
        variacoes: Array.from(document.querySelectorAll('.cp-variacao-row')).map((row, i) => ({
            chave: document.getElementById(`chaveVariacao${i}`)?.value || '',
            valores: document.getElementById(`valoresVariacao${i}`)?.value || ''
        })),
        etapas: isKit ? [] : Array.from(elements.stepsBody.querySelectorAll('tr')).map(tr => ({
            processo: tr.querySelector('.processo-select')?.value || '',
            maquina: tr.querySelector('.maquina-select')?.value || '',
            feitoPor: tr.querySelector('.feito-por-select')?.value || ''
        })),
        finishEtapas: isKit ? [] : Array.from(elements.finishStepsBody.querySelectorAll('tr')).map(tr => ({ // Novo
            processo: tr.querySelector('.processo-select')?.value || '',
            maquina: tr.querySelector('.maquina-select')?.value || '',
            feitoPor: tr.querySelector('.feito-por-select')?.value || ''
        })),
        grade: (editingProduct.grade || []).map(item => {
            const tr = Array.from(elements.gradeBody.querySelectorAll('tr')).find(tr => tr.cells[0].textContent === item.variacao);
            return tr ? {
                ...item,
                sku: tr.cells[2].querySelector('.cp-grade-sku')?.value || item.sku || '',
                imagem: tr.cells[3].querySelector('img')?.src || item.imagem || ''
            } : item;
        })
    };

    const { hasDuplicates, erroNaGrade } = temDuplicatasDeSku();
    if (hasDuplicates) {
        console.log('[salvarProdutoNoBackend] Salvamento bloqueado devido a SKUs duplicados.');
        bloquearCampos('Corrija o SKU duplicado antes de continuar editando.', erroNaGrade);
        localStorage.setItem('produtoComDuplicidade', JSON.stringify(updatedProduct));
        return;
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('[salvarProdutoNoBackend] Nenhum token encontrado. Redirecionando para login.');
            alert('Sessão expirada. Por favor, faça login novamente.');
            window.location.href = '/index.html';
            return;
        }

        console.log('[salvarProdutoNoBackend] Enviando produto para o backend:', updatedProduct);
        const response = await fetch('/api/produtos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updatedProduct)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[salvarProdutoNoBackend] Resposta do servidor:', response.status, errorText);
            throw new Error(`Erro ao salvar produto: ${response.status} - ${errorText}`);
        }

        const savedProduct = await response.json();
        console.log('[salvarProdutoNoBackend] Produto salvo com sucesso:', savedProduct);
        editingProduct = deepClone(savedProduct);
        produtos = produtos.map(p => p.id === savedProduct.id ? deepClone(savedProduct) : p);
        desbloquearCampos();
        localStorage.removeItem('produtoComDuplicidade');
        invalidateCache('produtosCadastrados');
        console.log('[salvarProdutoNoBackend] Cache invalidado após salvamento');
        return savedProduct;
    } catch (error) {
        console.error('[salvarProdutoNoBackend] Erro detalhado:', error.message, error.stack);
        alert('Erro ao salvar o produto: ' + error.message);
        throw error;
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
    const variacao = elements.variacaoKitSelect.value;
    if (!variacao || variacao === 'Selecione uma variação') return;

    kitComposicaoTemp.push({ variacao, quantidade: 1 });
    renderizarComposicaoKit();
    console.log('[addVariacaoKitBtn] Composição adicionada localmente (sem salvamento automático):', kitComposicaoTemp);
    // Remover gradeAlteradas = true aqui
});

function renderizarComposicaoKit() {
    elements.composicaoKitContainer.innerHTML = '';
    kitComposicaoTemp.forEach((comp, idx) => {
        const div = document.createElement('div');
        div.className = 'composicao-kit-row';
        div.innerHTML = `
            <input type="text" value="${comp.variacao}" readonly>
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