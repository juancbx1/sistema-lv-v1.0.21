// js/pages/admin-cadastrar-produto.js
import { verificarAutenticacaoSincrona } from './utils/auth.js';
import { obterProdutos, salvarProdutos } from './utils/storage.js';
import { resizeImage } from './utils/image-utils.js';
import { PRODUTOS, PRODUTOSKITS, MAQUINAS, PROCESSOS } from './utils/prod-proc-maq.js';

// Verificação de autenticação síncrona no topo do script
const auth = verificarAutenticacaoSincrona('cadastrar-produto.html', ['acesso-cadastrar-produto']);
if (!auth) {
    console.error('[admin-cadastrar-produto] Autenticação falhou. Usuário logado:', localStorage.getItem('usuarioLogado'));
    window.location.href = '/admin/acesso-negado.html';
    throw new Error('Autenticação falhou, redirecionando para acesso-negado.html...');
}

const permissoes = auth.permissoes || [];
const usuarioLogado = auth.usuario;
console.log('Inicializando cadastrar-produto para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);


const productListView = document.getElementById('productListView');
const productFormView = document.getElementById('productFormView');
const configurarVariacaoView = document.getElementById('configurarVariacaoView');
const productTableBody = document.getElementById('productTableBody');
const searchProduct = document.getElementById('searchProduct');
const productForm = document.getElementById('productForm');
const editProductName = document.getElementById('editProductName');
const sku = document.getElementById('sku');
const gtin = document.getElementById('gtin');
const unidade = document.getElementById('unidade');
const estoque = document.getElementById('estoque');
const imagemProduto = document.getElementById('imagemProduto');
const previewImagem = document.getElementById('previewImagem');
const removeImagem = document.getElementById('removeImagem');
const estruturaBody = document.getElementById('estruturaBody');
const stepsBody = document.getElementById('stepsBody');
const tabFilter = document.getElementById('tabFilter');
const gradeHeader = document.getElementById('gradeHeader');
const gradeBody = document.getElementById('gradeBody');
const variacaoPopup = document.getElementById('variacaoPopup');
const novaVariacaoDescricao = document.getElementById('novaVariacaoDescricao');
const gradeImagePopup = document.getElementById('gradeImagePopup');
const gradeImageInput = document.getElementById('gradeImageInput');
const produtoKitSelect = document.getElementById('produtoKitSelect');
const variacaoKitSelect = document.getElementById('variacaoKitSelect');
const addVariacaoKitBtn = document.getElementById('addVariacaoKitBtn');
const composicaoKitContainer = document.getElementById('composicaoKitContainer');
const configurarVariacaoTitle = document.getElementById('configurarVariacaoTitle');

let editingProduct = null;
let currentSelectIndex = null;
let currentGradeIndex = null;
let currentKitVariationIndex = null;
let kitComposicaoTemp = [];


// Função para inicializar a página
function inicializarPagina() {
    loadProductTable('todos');
    toggleView();
}

// Executa a inicialização imediatamente após a definição da função
inicializarPagina(); // Chama a inicialização logo após a autenticação

// Expor a função globalmente
window.atualizarProdutoNoStorage = atualizarProdutoNoStorage;

function loadProductTable(filterType = 'todos', search = '') {
    let produtos = obterProdutos() || [];
    const allProductNames = [...PRODUTOS, ...PRODUTOSKITS];

    allProductNames.forEach(nome => {
        if (!produtos.find(p => p.nome === nome)) {
            produtos.push({
                nome,
                sku: '',
                tipos: PRODUTOSKITS.includes(nome) ? ['kits'] : [],
                isKit: PRODUTOSKITS.includes(nome), // Adiciona isKit baseado em PRODUTOSKITS
                gtin: '',
                unidade: '',
                estoque: 0,
                imagem: '',
                variacoes: [],
                estrutura: [],
                etapas: [],
                grade: []
            });
        }
    });

    // Garantir que produtos existentes tenham isKit definido
    produtos = produtos.map(produto => ({
        ...produto,
        isKit: produto.tipos && produto.tipos.includes('kits')
    }));

    produtos = [...new Map(produtos.map(p => [p.nome, p])).values()];
    salvarProdutos(produtos);

    const filteredProdutos = produtos
        .filter(p => allProductNames.includes(p.nome))
        .filter(p => 
            (filterType === 'todos' || (p.tipos && p.tipos.includes(filterType))) &&
            p.nome.toLowerCase().includes(search.toLowerCase())
        );

    productTableBody.innerHTML = '';
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
        productTableBody.appendChild(tr);
    });
}


function editProduct(nome) {
    const produtos = obterProdutos() || [];
    editingProduct = produtos.find(p => p.nome === nome);
    if (editingProduct) {
        console.log(`[editProduct] Carregando produto ${nome} do localStorage:`, editingProduct);
        window.location.hash = '#editando';
        localStorage.setItem('ultimoProdutoEditado', nome);
        loadEditForm(editingProduct);
    } else {
        window.location.hash = '';
    }
}

function loadEditForm(produto) {
    console.log('[loadEditForm] Carregando formulário para produto:', produto.nome);
    console.log('[loadEditForm] Grade do produto:', produto.grade);
    editProductName.textContent = `Editando: ${produto.nome}`;
    sku.value = produto.sku || '';
    document.querySelectorAll('input[name="tipo"]').forEach(cb => {
        cb.checked = produto.tipos ? produto.tipos.includes(cb.value) : false;
    });
    gtin.value = produto.gtin || '';
    unidade.value = produto.unidade || '';
    estoque.value = produto.estoque || '';
    if (produto.imagem) {
        previewImagem.src = produto.imagem;
        previewImagem.style.display = 'block';
        removeImagem.style.display = 'inline-block';
    } else {
        previewImagem.src = '';
        previewImagem.style.display = 'none';
        removeImagem.style.display = 'none';
    }

    estruturaBody.innerHTML = '';
    (produto.estrutura || []).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${item.produto}" placeholder="Produto"></td>
            <td><input type="text" value="${item.unidade}" placeholder="Unidade"></td>
            <td><input type="number" value="${item.quantidade}" placeholder="Quantidade" onchange="updateStructureTotals()"></td>
            <td><input type="number" value="${item.custo}" placeholder="Custo" onchange="updateStructureTotals()"></td>
            <td><input type="text" value="${item.total.toFixed(2)}" readonly></td>
            <td><button class="cp-remove-btn" onclick="this.parentElement.parentElement.remove(); updateStructureTotals()">X</button></td>
        `;
        estruturaBody.appendChild(tr);
    });
    updateStructureTotals();

    // Recarregar etapas do produto
    stepsBody.innerHTML = '';
    (produto.etapas || []).forEach((etapa, index) => {
        addStepRow(etapa.processo || '', etapa.maquina || '', etapa.feitoPor || '', index);
    });
    window.updateProcessosOptions();

    loadVariacoes(produto);
    loadGrade(produto);
    toggleTabs();
    initializeDragAndDrop();

    const ultimaAba = localStorage.getItem('ultimaAbaAtiva') || 'dados-gerais';
    switchTab(ultimaAba);
}

function loadVariacoes(produto) {
    const variacoesContainer = document.getElementById('variacoesContainer');
    variacoesContainer.innerHTML = '';
    const variacoes = produto.variacoes || [{ chave: 'cor', valores: '' }];
    variacoes.forEach((variacao, index) => addVariacaoRow(variacao.chave, variacao.valores, index));
}

function loadGrade(produto) {
    console.log('[loadGrade] Iniciando carregamento da grade para produto:', produto.nome);
    console.log('[loadGrade] Grade atual do produto:', produto.grade);

    const variacoesAtuais = Array.from(document.querySelectorAll('.cp-variacao-row')).map((row, i) => ({
        chave: document.getElementById(`chaveVariacao${i}`)?.value || '',
        valores: Array.from(row.querySelectorAll('.cp-tag')).map(tag => tag.textContent).join(',')
    }));

    gradeHeader.innerHTML = `
        <tr>
            <th>Variação</th>
            <th>Composto Por</th>
            <th>Código (SKU)</th>
            <th>Imagens</th>
            <th>Ações</th>
        </tr>
    `;

    const hasValidVariacoes = variacoesAtuais.every(v => v.valores && v.valores.trim() !== '');
    if (!hasValidVariacoes) {
        console.log('[loadGrade] Nenhuma variação válida encontrada, limpando grade.');
        gradeBody.innerHTML = '';
        produto.grade = [];
        atualizarProdutoNoStorage();
        return;
    }

    const gradeGerada = generateGradeCombinations(variacoesAtuais);
    console.log('[loadGrade] Grade gerada:', gradeGerada);

    let grade = produto.grade || [];
    const isKit = produto.tipos && produto.tipos.includes('kits');

    const updatedGrade = [];
    const variacoesGeradasNomes = gradeGerada.map(g => g.variacao);

    grade.forEach(item => {
        if (variacoesGeradasNomes.includes(item.variacao)) {
            updatedGrade.push({
                ...item,
                composicao: item.composicao || (isKit ? [] : [{ variacao: '-', quantidade: 1 }])
            });
            console.log(`[loadGrade] Variação ${item.variacao} - Composição preservada:`, item.composicao);
        } else {
            console.log(`[loadGrade] Variação ${item.variacao} removida da grade.`);
        }
    });

    gradeGerada.forEach(nova => {
        if (!updatedGrade.find(g => g.variacao === nova.variacao)) {
            updatedGrade.push({
                variacao: nova.variacao,
                sku: '',
                imagem: '', // Inicializa vazio para novas variações
                composicao: isKit ? [] : [{ variacao: '-', quantidade: 1 }]
            });
            console.log(`[loadGrade] Nova variação adicionada: ${nova.variacao}`);
        }
    });

    grade = updatedGrade;

    gradeBody.innerHTML = '';
    grade.forEach((item, idx) => {
        console.log(`[loadGrade] Renderizando variação ${item.variacao} com imagem:`, item.imagem);
        const tr = document.createElement('tr');
        tr.dataset.index = idx;
        let composicaoHtml = isKit
            ? item.composicao && item.composicao.length > 0 && item.composicao[0].variacao !== '-'
                ? `<div class="composicao-tags">${item.composicao.map(c => `<span class="composicao-tag">${c.variacao} (${c.quantidade})</span>`).join('')}<button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${idx}')">Editar</button></div>`
                : `<div class="composicao-tags"><button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${idx}')">Editar</button></div>`
            : '-';
        tr.innerHTML = `
            <td>${item.variacao}</td>
            <td>${composicaoHtml}</td>
            <td><input type="text" class="cp-grade-sku" value="${item.sku || ''}" onblur="validarSku('${idx}', this)" placeholder="SKU"><span class="sku-error" style="display: none;">SKU duplicado!</span></td>
            <td class="cp-grade-img"><div class="img-placeholder" onclick="abrirImagemPopup('${idx}')">${item.imagem ? `<img src="${item.imagem}" class="cp-variacao-img" alt="Imagem da variação ${item.variacao}">` : ''}</div></td>
            <td class="cp-actions"><button class="cp-remove-btn" onclick="excluirGrade('${idx}')">X</button></td>
        `;
        gradeBody.appendChild(tr);
    });

    produto.grade = grade;
    console.log('[loadGrade] Grade final do produto:', produto.grade);
    atualizarProdutoNoStorage();
}

function generateGradeCombinations(variacoes) {
    if (!variacoes || variacoes.length === 0 || !variacoes.every(v => v.valores && v.valores.trim())) return [];
    const valoresPorChave = variacoes.map(v => v.valores.split(',').map(val => val.trim()).filter(val => val));
    if (valoresPorChave.length === 0 || valoresPorChave.some(arr => arr.length === 0)) return [];

    const combinations = valoresPorChave.reduce((acc, curr) => {
        if (acc.length === 0) return curr.map(val => [val]);
        return acc.flatMap(combo => curr.map(val => [...combo, val]));
    }, []);

    return combinations.map(combo => ({
        variacao: combo.join(' | '),
        sku: '',
        imagem: '',
        composicao: []
    }));
}

function filterProducts(type) {
    document.querySelectorAll('.cp-type-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.cp-type-btn[data-type="${type}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    loadProductTable(type, searchProduct.value);
}

function toggleView() {
    const hash = window.location.hash;
    if (hash === '#editando') {
        console.log('[toggleView] Hash #editando, editingProduct existe?', !!editingProduct);
        if (!editingProduct) {
            const ultimoProdutoEditado = localStorage.getItem('ultimoProdutoEditado');
            const produtos = obterProdutos() || [];
            editingProduct = produtos.find(p => p.nome === ultimoProdutoEditado);
            if (editingProduct) {
                console.log('[toggleView] Recarregando editingProduct do localStorage e chamando loadEditForm');
                loadEditForm(editingProduct);
            } else {
                console.log('[toggleView] Produto não encontrado, limpando hash');
                window.location.hash = '';
                localStorage.removeItem('ultimaAbaAtiva');
            }
        }
        productListView.style.display = 'none';
        productFormView.style.display = 'block';
        configurarVariacaoView.style.display = 'none';
    } else if (hash.startsWith('#configurar-variacao/')) {
        productListView.style.display = 'none';
        productFormView.style.display = 'block';
        configurarVariacaoView.style.display = 'flex';
        const index = hash.split('/')[1];
        carregarConfigurarVariacao(index);
    } else {
        productListView.style.display = 'block';
        productFormView.style.display = 'none';
        configurarVariacaoView.style.display = 'none';
        document.querySelectorAll('.cp-type-btn').forEach(btn => btn.classList.remove('active'));
        const todosBtn = document.querySelector('.cp-type-btn[data-type="todos"]');
        if (todosBtn) todosBtn.classList.add('active');
        loadProductTable('todos', searchProduct.value);
        localStorage.removeItem('ultimaAbaAtiva');
    }
}

window.switchTab = function(tab) {
    document.querySelectorAll('.cp-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.cp-tab-btn[data-tab="${tab}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.conteudo-aba-produto').forEach(content => content.classList.remove('active'));
    const activeTab = document.getElementById(tab);
    if (activeTab) {
        activeTab.classList.add('active');
        localStorage.setItem('ultimaAbaAtiva', tab);
    }
};

window.toggleTabs = function() {
    const tiposSelecionados = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
    const variacoesTabBtn = document.querySelector('.cp-tab-btn[data-tab="variacoes"]');
    const variacoesTab = document.getElementById('variacoes');
    const producaoTabBtn = document.querySelector('.cp-tab-btn[data-tab="producao"]');
    const producaoTab = document.getElementById('producao');

    if (tiposSelecionados.includes('variacoes') || tiposSelecionados.includes('kits')) {
        if (!variacoesTabBtn) {
            const btn = document.createElement('button');
            btn.className = 'cp-tab-btn';
            btn.dataset.tab = 'variacoes';
            btn.textContent = 'Variações';
            btn.onclick = () => switchTab('variacoes');
            tabFilter.appendChild(btn);
        }
    } else if (variacoesTabBtn) {
        variacoesTabBtn.remove();
        variacoesTab.classList.remove('active');
    }

    if (tiposSelecionados.includes('kits')) {
        if (producaoTabBtn) producaoTabBtn.style.display = 'none';
        producaoTab.classList.remove('active');
    } else if (producaoTabBtn) {
        producaoTabBtn.style.display = 'inline-block';
    }

    if (!document.querySelector('.cp-tab-btn.active')) switchTab(localStorage.getItem('ultimaAbaAtiva') || 'dados-gerais');
};

removeImagem.addEventListener('click', () => {
    imagemProduto.value = '';
    previewImagem.src = '';
    previewImagem.style.display = 'none';
    removeImagem.style.display = 'none';
    editingProduct.imagem = '';
    atualizarProdutoNoStorage();
});

imagemProduto.addEventListener('change', e => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    resizeImage(arquivo, imagemRedimensionada => {
        previewImagem.src = imagemRedimensionada;
        previewImagem.style.display = 'block';
        removeImagem.style.display = 'inline-block';
        editingProduct.imagem = imagemRedimensionada;
        atualizarProdutoNoStorage();
    });
});

window.addStructureRow = function() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" placeholder="Produto"></td>
        <td><input type="text" placeholder="Unidade"></td>
        <td><input type="number" placeholder="Quantidade" onchange="updateStructureTotals()"></td>
        <td><input type="number" placeholder="Custo" onchange="updateStructureTotals()"></td>
        <td><input type="text" readonly></td>
        <td><button class="cp-remove-btn" onclick="this.parentElement.parentElement.remove(); updateStructureTotals()">X</button></td>
    `;
    estruturaBody.appendChild(tr);
    atualizarProdutoNoStorage();
};

window.addStepRow = function(processo = '', maquina = '', feitoPor = '', index = null) {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.dataset.index = index !== null ? index : stepsBody.children.length;
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
        <td><button class="botao-remover-produto" onclick="this.parentElement.parentElement.remove(); updateProcessosOptions(); atualizarProdutoNoStorage()">X</button></td>
    `;
    stepsBody.appendChild(tr);

    // Adicionar listeners de evento programaticamente
    const processoSelect = tr.querySelector('.processo-select');
    const maquinaSelect = tr.querySelector('.maquina-select');
    const feitoPorSelect = tr.querySelector('.feito-por-select');

    processoSelect.addEventListener('change', () => {
        updateProcessosOptions();
        atualizarProdutoNoStorage();
    });
    maquinaSelect.addEventListener('change', atualizarProdutoNoStorage);
    feitoPorSelect.addEventListener('change', atualizarProdutoNoStorage);

    window.updateProcessosOptions();
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
            <select id="chaveVariacao${idx}" class="cp-select-variacao" onchange="verificarOutro(this, ${idx})">
                <option value="cor" ${chave === 'cor' ? 'selected' : ''}>Cor</option>
                <option value="tamanho" ${chave === 'tamanho' ? 'selected' : ''}>Tamanho</option>
                <option value="outro" ${chave === 'outro' ? 'selected' : ''}>Outro...</option>
                ${chave !== 'cor' && chave !== 'tamanho' && chave !== 'outro' && chave ? `<option value="${chave}" selected>${chave}</option>` : ''}
            </select>
        </div>
        <div class="grupo-form-produto">
            <label for="valoresVariacao${idx}">Valores</label>
            <div id="valoresVariacao${idx}" class="cp-tag-container"></div>
        </div>
        <button class="cp-remove-btn" onclick="removerVariacaoRow(this, ${idx})">X</button>
    `;
    variacoesContainer.appendChild(div);
    criarTags(`valoresVariacao${idx}`, valores);
    atualizarProdutoNoStorage();
};

window.removerVariacaoRow = function(btn, index) {
    const row = btn.parentElement;
    const chave = document.getElementById(`chaveVariacao${index}`)?.value || '';
    row.remove();
    removeVariacaoFromGrade(chave, index);
    atualizarProdutoNoStorage();
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
        variacaoPopup.style.display = 'flex';
        novaVariacaoDescricao.value = '';
    }
};

window.confirmarNovaVariacao = function() {
    const descricao = novaVariacaoDescricao.value.trim();
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
        atualizarProdutoNoStorage();
        loadGrade(editingProduct);
    }
};

window.fecharPopup = function() {
    variacaoPopup.style.display = 'none';
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
                atualizarProdutoNoStorage();
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
        atualizarProdutoNoStorage();
        loadGrade(editingProduct);
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

window.updateStructureTotals = function() {
    let totalQuantidade = 0;
    let totalCusto = 0;
    estruturaBody.querySelectorAll('tr').forEach(tr => {
        const quantidade = parseFloat(tr.querySelector('input:nth-child(3)').value) || 0;
        const custo = parseFloat(tr.querySelector('input:nth-child(4)').value) || 0;
        const total = quantidade * custo;
        tr.querySelector('input:nth-child(5)').value = total.toFixed(2);
        totalQuantidade += quantidade;
        totalCusto += total;
    });
    document.getElementById('totalQuantidade').textContent = totalQuantidade;
    document.getElementById('totalCusto').textContent = totalCusto.toFixed(2);
    atualizarProdutoNoStorage();
};

window.updateProcessosOptions = function() {
    const selects = stepsBody.querySelectorAll('.processo-select');
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
    stepsBody.addEventListener('dragstart', e => {
        const tr = e.target.closest('tr');
        if (tr) {
            tr.classList.add('dragging');
            e.dataTransfer.setData('text/plain', tr.dataset.index);
        }
    });

    stepsBody.addEventListener('dragend', e => {
        const tr = e.target.closest('tr');
        if (tr) tr.classList.remove('dragging');
    });

    stepsBody.addEventListener('dragover', e => e.preventDefault());

    stepsBody.addEventListener('drop', e => {
        e.preventDefault();
        const fromIndex = e.dataTransfer.getData('text/plain');
        const toRow = e.target.closest('tr');
        if (!toRow) return;

        const toIndex = toRow.dataset.index;
        const rows = Array.from(stepsBody.querySelectorAll('tr'));
        const fromRow = rows.find(row => row.dataset.index === fromIndex);

        if (fromRow && toRow && fromRow !== toRow) {
            if (parseInt(fromIndex) < parseInt(toIndex)) {
                toRow.after(fromRow);
            } else {
                toRow.before(fromRow);
            }

            // Reindexar todas as linhas após o drag-and-drop
            rows.forEach((row, index) => {
                row.dataset.index = index;
            });

            atualizarProdutoNoStorage();
        }
    });
}

function atualizarProdutoNoStorage() {
    if (!editingProduct) return;

    const produtos = obterProdutos() || [];
    const index = produtos.findIndex(p => p.nome === editingProduct.nome);
    if (index === -1) {
        console.error('[atualizarProdutoNoStorage] Produto não encontrado no localStorage:', editingProduct.nome);
        return;
    }

    const variacoes = Array.from(document.querySelectorAll('.cp-variacao-row')).map((row, i) => {
        const chave = document.getElementById(`chaveVariacao${i}`)?.value || '';
        const valores = Array.from(row.querySelectorAll('.cp-tag')).map(tag => tag.textContent).join(',');
        return { chave, valores };
    });

    const grade = editingProduct.grade || [];
    const updatedGrade = grade.map(item => {
        const tr = Array.from(gradeBody.querySelectorAll('tr')).find(tr => tr.cells[0].textContent === item.variacao);
        if (tr) {
            return {
                ...item,
                sku: tr.cells[2].querySelector('.cp-grade-sku')?.value || item.sku || '',
                imagem: tr.cells[3].querySelector('img')?.src || item.imagem || ''
            };
        }
        return item;
    });

    const etapas = Array.from(stepsBody.querySelectorAll('tr')).map(tr => ({
        processo: tr.querySelector('.processo-select')?.value || '',
        maquina: tr.querySelector('.maquina-select')?.value || '',
        feitoPor: tr.querySelector('.feito-por-select')?.value || ''
    }));

    const tiposSelecionados = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
    const updatedProduct = {
        ...editingProduct,
        sku: sku.value || '',
        tipos: tiposSelecionados,
        isKit: tiposSelecionados.includes('kits'), // Adiciona isKit baseado nos tipos selecionados
        gtin: gtin.value || '',
        unidade: unidade.value || '',
        estoque: parseInt(estoque.value) || 0,
        imagem: previewImagem.src || '',
        variacoes: variacoes.length > 0 ? variacoes : editingProduct.variacoes || [],
        estrutura: Array.from(estruturaBody.querySelectorAll('tr')).map(tr => ({
            produto: tr.querySelector('input:nth-child(1)')?.value || '',
            unidade: tr.querySelector('input:nth-child(2)')?.value || '',
            quantidade: parseFloat(tr.querySelector('input:nth-child(3)')?.value) || 0,
            custo: parseFloat(tr.querySelector('input:nth-child(4)')?.value) || 0,
            total: parseFloat(tr.querySelector('input:nth-child(5)')?.value) || 0
        })),
        etapas: etapas.filter(etapa => etapa.processo || etapa.maquina || etapa.feitoPor),
        grade: updatedGrade
    };

    console.log('[atualizarProdutoNoStorage] Produto atualizado:', updatedProduct);
    produtos[index] = updatedProduct;
    salvarProdutos(produtos);
    editingProduct = updatedProduct;
    console.log('[atualizarProdutoNoStorage] Produtos salvos no localStorage:', obterProdutos());
}

window.validarSku = function(index, input) {
    const grade = Array.from(gradeBody.querySelectorAll('tr')).map(tr => ({
        sku: tr.cells[2].querySelector('.cp-grade-sku').value || ''
    }));
    const skuValue = input.value.trim();
    const errorSpan = input.nextElementSibling;
    const isDuplicate = grade.some((item, i) => item.sku === skuValue && i !== parseInt(index));

    if (isDuplicate && skuValue) {
        errorSpan.style.display = 'inline';
        input.classList.add('error');
    } else {
        errorSpan.style.display = 'none';
        input.classList.remove('error');
        atualizarProdutoNoStorage();
    }
};

window.abrirImagemPopup = function(index) {
    currentGradeIndex = index;
    gradeImageInput.value = '';
    gradeImagePopup.style.display = 'flex';
};

window.confirmarImagemGrade = function() {
    const arquivo = gradeImageInput.files[0];
    if (arquivo) {
        resizeImage(arquivo, imagemRedimensionada => {
            const tr = gradeBody.querySelector(`tr[data-index="${currentGradeIndex}"]`);
            const imgDiv = tr.querySelector('.img-placeholder');
            imgDiv.innerHTML = `<img src="${imagemRedimensionada}" class="cp-variacao-img" alt="Imagem da variação">`;
            const grade = editingProduct.grade || [];
            grade[currentGradeIndex].imagem = imagemRedimensionada; // Salva a imagem no objeto grade
            console.log(`[confirmarImagemGrade] Imagem salva para variação ${grade[currentGradeIndex].variacao}:`, imagemRedimensionada);
            atualizarProdutoNoStorage();
            fecharImagemPopup();
        });
    }
};

window.fecharImagemPopup = function() {
    gradeImagePopup.style.display = 'none';
    currentGradeIndex = null;
};


window.excluirGrade = function(index) {
    const tr = gradeBody.querySelector(`tr[data-index="${index}"]`);
    if (!tr) return;
    const variacaoExcluida = tr.cells[0].textContent.split(' | ');
    tr.remove();

    const variacoesContainer = document.getElementById('variacoesContainer');
    const variacoesRows = Array.from(variacoesContainer.querySelectorAll('.cp-variacao-row'));

    variacoesRows.forEach((row, rowIdx) => {
        const valores = Array.from(row.querySelectorAll('.cp-tag')).map(tag => tag.textContent);
        const valorExcluido = variacaoExcluida[rowIdx];
        const gradeRestante = Array.from(gradeBody.querySelectorAll('tr')).map(tr => tr.cells[0].textContent);

        if (valores.includes(valorExcluido)) {
            const valorAindaExiste = gradeRestante.some(variacao => variacao.split(' | ')[rowIdx] === valorExcluido);
            if (!valorAindaExiste) {
                const tagIdx = valores.indexOf(valorExcluido);
                if (tagIdx !== -1) {
                    row.querySelectorAll('.cp-tag')[tagIdx].remove();
                    if (!Array.from(row.querySelectorAll('.cp-tag')).length) row.remove();
                }
            }
        }
    });

    editingProduct.grade = editingProduct.grade.filter((_, i) => i !== parseInt(index));
    atualizarProdutoNoStorage();
    loadGrade(editingProduct);
};

// Funções para Configuração de Variação do Kit
window.abrirConfigurarVariacao = function(index) {
    currentKitVariationIndex = index;
    window.location.hash = `#configurar-variacao/${index}`;
};

function carregarConfigurarVariacao(index) {
    kitComposicaoTemp = [];
    produtoKitSelect.value = '';
    produtoKitSelect.disabled = false;
    variacaoKitSelect.innerHTML = '<option value="">Selecione uma variação</option>';
    composicaoKitContainer.innerHTML = '';

    const grade = editingProduct.grade || [];
    const variacao = grade[index];
    configurarVariacaoTitle.textContent = `Configurar ${editingProduct.nome} - ${variacao.variacao}`;
    kitComposicaoTemp = variacao.composicao ? [...variacao.composicao] : [];
    console.log('[carregarConfigurarVariacao] Carregando composição para variação', variacao.variacao, ':', kitComposicaoTemp);

    const produtos = (obterProdutos() || []).filter(p => PRODUTOS.includes(p.nome) && p.nome !== editingProduct.nome);
    produtoKitSelect.innerHTML = '<option value="">Selecione um produto</option>';
    produtos.forEach(prod => {
        const option = document.createElement('option');
        option.value = prod.nome;
        option.textContent = prod.nome;
        produtoKitSelect.appendChild(option);
    });

    if (kitComposicaoTemp.length > 0) {
        const primeiroProduto = produtos.find(p => p.grade && p.grade.some(g => g.variacao === kitComposicaoTemp[0].variacao));
        if (primeiroProduto) {
            produtoKitSelect.value = primeiroProduto.nome;
            produtoKitSelect.disabled = true;
            loadVariacoesKit();
        }
    }
    renderizarComposicaoKit();
}

function composicaoHtmlFromTemp(composicao) {
    return composicao && composicao.length > 0 && composicao[0].variacao !== '-' 
        ? `<div class="composicao-tags">${composicao.map(c => `<span class="composicao-tag">${c.variacao} (${c.quantidade})</span>`).join('')}<button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${currentKitVariationIndex}')">Editar</button></div>` 
        : `<div class="composicao-tags"><button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${currentKitVariationIndex}')">Editar</button></div>`;
}

window.loadVariacoesKit = function() {
    const produtoNome = produtoKitSelect.value;
    if (!produtoNome) return;

    const produtos = (obterProdutos() || []).filter(p => PRODUTOS.includes(p.nome));
    const produto = produtos.find(p => p.nome === produtoNome);
    variacaoKitSelect.innerHTML = '<option value="">Selecione uma variação</option>';

    if (produto && produto.grade) {
        produto.grade.forEach(item => {
            const option = document.createElement('option');
            option.value = item.variacao;
            option.textContent = item.variacao;
            variacaoKitSelect.appendChild(option); // Não adicionar 'used' ou 'disabled'
        });
    }

    if (!produtoKitSelect.disabled) {
        produtoKitSelect.disabled = true;
        Array.from(produtoKitSelect.options).forEach(opt => {
            if (opt.value && opt.value !== produtoNome) opt.disabled = true;
        });
    }
};

addVariacaoKitBtn.addEventListener('click', () => {
    const variacao = variacaoKitSelect.value;
    if (!variacao || variacao === 'Selecione uma variação') return;

    // Adicionar a variação diretamente, sem verificar duplicatas
    kitComposicaoTemp.push({ variacao, quantidade: 1 });
    console.log('[addVariacaoKitBtn] Nova composição adicionada:', kitComposicaoTemp);
    renderizarComposicaoKit();
    // Não desabilitar a opção no select, apenas atualizar a interface
});

function renderizarComposicaoKit() {
    composicaoKitContainer.innerHTML = '';
    kitComposicaoTemp.forEach((comp, idx) => {
        const div = document.createElement('div');
        div.className = 'composicao-kit-row';
        div.innerHTML = `
            <input type="text" value="${comp.variacao}" readonly>
            <input type="number" min="1" value="${comp.quantidade}" onchange="atualizarQuantidadeKit(${idx}, this.value)">
            <button class="cp-remove-btn" onclick="removerComposicaoKit(${idx})">X</button>
        `;
        composicaoKitContainer.appendChild(div);
    });

    // Não reabilitar o produtoKitSelect se a composição estiver vazia, apenas manter o estado
};

window.atualizarQuantidadeKit = function(index, value) {
    kitComposicaoTemp[index].quantidade = parseInt(value) || 1;
    console.log('[atualizarQuantidadeKit] Quantidade atualizada para variação', kitComposicaoTemp[index].variacao, ':', kitComposicaoTemp);
    renderizarComposicaoKit();
    const tr = gradeBody.querySelector(`tr[data-index="${currentKitVariationIndex}"]`);
    if (tr) {
        const composicaoHtml = kitComposicaoTemp && kitComposicaoTemp.length > 0 && kitComposicaoTemp[0].variacao !== '-'
            ? `<div class="composicao-tags">${kitComposicaoTemp.map(c => `<span class="composicao-tag">${c.variacao} (${c.quantidade})</span>`).join('')}<button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${currentKitVariationIndex}')">Editar</button></div>`
            : `<div class="composicao-tags"><button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${currentKitVariationIndex}')">Editar</button></div>`;
        tr.cells[1].innerHTML = composicaoHtml;
    }
};

window.removerComposicaoKit = function(index) {
    const variacaoRemovida = kitComposicaoTemp[index].variacao;
    kitComposicaoTemp.splice(index, 1);
    console.log('[removerComposicaoKit] Variação removida:', variacaoRemovida, 'Composição atual:', kitComposicaoTemp);
    renderizarComposicaoKit();
    const tr = gradeBody.querySelector(`tr[data-index="${currentKitVariationIndex}"]`);
    if (tr) {
        const composicaoHtml = kitComposicaoTemp && kitComposicaoTemp.length > 0 && kitComposicaoTemp[0].variacao !== '-'
            ? `<div class="composicao-tags">${kitComposicaoTemp.map(c => `<span class="composicao-tag">${c.variacao} (${c.quantidade})</span>`).join('')}<button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${currentKitVariationIndex}')">Editar</button></div>`
            : `<div class="composicao-tags"><button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${currentKitVariationIndex}')">Editar</button></div>`;
        tr.cells[1].innerHTML = composicaoHtml;
    }
};

window.salvarComposicaoKit = function() {
    if (kitComposicaoTemp.length === 0) {
        alert('Adicione pelo menos uma variação ao kit!');
        return;
    }
    const grade = editingProduct.grade || [];
    grade[currentKitVariationIndex].composicao = [...kitComposicaoTemp];
    console.log('[salvarComposicaoKit] Salvando composição para variação', grade[currentKitVariationIndex].variacao, ':', grade[currentKitVariationIndex].composicao);
    atualizarProdutoNoStorage();

    // Atualizar a tabela "Grade das Variações" diretamente
    const tr = gradeBody.querySelector(`tr[data-index="${currentKitVariationIndex}"]`);
    if (tr) {
        const isKit = editingProduct.tipos && editingProduct.tipos.includes('kits');
        const composicaoHtml = isKit
            ? kitComposicaoTemp && kitComposicaoTemp.length > 0 && kitComposicaoTemp[0].variacao !== '-'
                ? `<div class="composicao-tags">${kitComposicaoTemp.map(c => `<span class="composicao-tag">${c.variacao} (${c.quantidade})</span>`).join('')}<button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${currentKitVariationIndex}')">Editar</button></div>`
                : `<div class="composicao-tags"><button class="composicao-tag composicao-edit-btn" onclick="abrirConfigurarVariacao('${currentKitVariationIndex}')">Editar</button></div>`
            : '-';
        tr.cells[1].innerHTML = composicaoHtml;
    }

    // Voltar para a tela de edição
    window.location.hash = '#editando';
};

productForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!editingProduct) return;

    const produtos = obterProdutos() || [];
    const index = produtos.findIndex(p => p.nome === editingProduct.nome);

    const tiposSelecionados = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
    if (tiposSelecionados.length === 0) {
        alert('Selecione pelo menos um tipo para o produto!');
        return;
    }

    const grade = editingProduct.grade || [];
    const updatedGrade = grade.map(item => {
        const tr = Array.from(gradeBody.querySelectorAll('tr')).find(tr => tr.cells[0].textContent === item.variacao);
        if (tr) {
            return {
                ...item,
                sku: tr.cells[2].querySelector('.cp-grade-sku').value || item.sku || '',
                imagem: tr.cells[3].querySelector('img')?.src || item.imagem || ''
            };
        }
        return item;
    });

    const skuDuplicados = updatedGrade.some((item, i) => 
        updatedGrade.some((other, j) => i !== j && item.sku && item.sku === other.sku)
    );

    if (skuDuplicados) {
        alert('Existem SKUs duplicados na grade. Corrija antes de salvar.');
        return;
    }

    const variacoes = Array.from(document.querySelectorAll('.cp-variacao-row')).map((row, i) => ({
        chave: document.getElementById(`chaveVariacao${i}`).value,
        valores: Array.from(row.querySelectorAll('.cp-tag')).map(tag => tag.textContent).join(',')
    }));

    const etapas = Array.from(stepsBody.querySelectorAll('tr')).map(tr => ({
        processo: tr.querySelector('.processo-select')?.value || '',
        maquina: tr.querySelector('.maquina-select')?.value || '',
        feitoPor: tr.querySelector('.feito-por-select')?.value || ''
    }));

    const updatedProduct = {
        ...editingProduct,
        sku: sku.value || '',
        tipos: tiposSelecionados,
        isKit: tiposSelecionados.includes('kits'), // Adiciona isKit baseado nos tipos selecionados
        gtin: gtin.value || '',
        unidade: unidade.value || '',
        estoque: parseInt(estoque.value) || 0,
        imagem: previewImagem.src || '',
        variacoes,
        estrutura: Array.from(estruturaBody.querySelectorAll('tr')).map(tr => ({
            produto: tr.querySelector('input:nth-child(1)')?.value || '',
            unidade: tr.querySelector('input:nth-child(2)')?.value || '',
            quantidade: parseFloat(tr.querySelector('input:nth-child(3)')?.value) || 0,
            custo: parseFloat(tr.querySelector('input:nth-child(4)')?.value) || 0,
            total: parseFloat(tr.querySelector('input:nth-child(5)')?.value) || 0
        })),
        etapas: etapas.filter(etapa => etapa.processo || etapa.maquina || etapa.feitoPor),
        grade: updatedGrade
    };

    produtos[index] = updatedProduct;
    salvarProdutos(produtos);
    editingProduct = updatedProduct;
    alert('Produto atualizado com sucesso!');
});

window.addEventListener('hashchange', toggleView);
searchProduct.addEventListener('input', () => {
    const activeFilter = document.querySelector('.cp-type-btn.active')?.dataset.type || 'todos';
    loadProductTable(activeFilter, searchProduct.value);
});

document.querySelectorAll('.cp-type-btn').forEach(btn => {
    btn.addEventListener('click', () => filterProducts(btn.dataset.type));
});