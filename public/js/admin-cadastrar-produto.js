import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos, invalidateCache } from '/js/utils/storage.js';
import { PRODUTOS, PRODUTOSKITS, MAQUINAS, PROCESSOS } from '/js/utils/prod-proc-maq.js';

// --- Variáveis Globais ---
let produtos = [];
let editingProduct = null;
let gradeTemp = [];

// --- Elementos do DOM ---
const elements = {
    productListView: document.getElementById('productListView'),
    productFormView: document.getElementById('productFormView'),
    productTableBody: document.getElementById('productTableBody'),
    searchProduct: document.getElementById('searchProduct'),
    productForm: document.getElementById('productForm'),
    editProductNameDisplay: document.getElementById('editProductName'),
    inputProductName: document.getElementById('inputProductName'),
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
    variationsComponentContainer: document.getElementById('variationsComponentContainer'),
    gradeImagePopup: document.getElementById('gradeImagePopup'),
    gradeImageInput: document.getElementById('gradeImageInput'),
    variacaoPopup: document.getElementById('variacaoPopup'),
    novaVariacaoDescricao: document.getElementById('novaVariacaoDescricao'),
    configurarVariacaoView: document.getElementById('configurarVariacaoView'),
    configurarVariacaoTitle: document.getElementById('configurarVariacaoTitle'),
    produtoKitSelect: document.getElementById('produtoKitSelect'),
    variacaoKitSelect: document.getElementById('variacaoKitSelect'),
    addVariacaoKitBtn: document.getElementById('addVariacaoKitBtn'),
    composicaoKitContainer: document.getElementById('composicaoKitContainer'),
};

let currentGradeIndex = null;
let currentKitVariationIndex = null;
let kitComposicaoTemp = [];

function mostrarPopup(mensagem, tipo = 'sucesso', duracao = 4000) {
    // Encontra ou cria o container para os pop-ups
    let wrapper = document.getElementById('cp-popup-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'cp-popup-wrapper';
        wrapper.className = 'cp-popup-mensagem-wrapper';
        document.body.appendChild(wrapper);
    }

    const popup = document.createElement('div');
    popup.className = `cp-popup-mensagem ${tipo}`;

    const iconMap = {
        sucesso: 'fa-check-circle',
        erro: 'fa-times-circle',
        aviso: 'fa-exclamation-triangle'
    };

    popup.innerHTML = `
        <i class="fas ${iconMap[tipo]} icon"></i>
        <span class="text">${mensagem}</span>
    `;

    wrapper.appendChild(popup);

    // Remove o popup após a animação de saída terminar
    setTimeout(() => {
        popup.style.animation = 'cp-fadeOut 0.4s ease-out forwards';
        setTimeout(() => {
            popup.remove();
            if (wrapper.children.length === 0) {
                wrapper.remove();
            }
        }, 400);
    }, duracao);
}


function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.error("Erro ao clonar objeto:", obj, e);
        return {};
    }
}

// --- Funções de Inicialização e Eventos ---
async function inicializarPagina() {
    await verificarAutenticacao('admin/cadastrar-produto.html', ['acesso-cadastrar-produto']);
    document.body.classList.add('autenticado');
    produtos = await obterProdutos(true);
    configurarEventListeners();
    window.addEventListener('hashchange', toggleView);
    toggleView();
}

function configurarEventListeners() {
    console.log('[configurarEventListeners] Configurando listeners...');
    document.getElementById('btnAdicionarNovoProduto').addEventListener('click', handleAdicionarNovoProduto);
    elements.searchProduct.addEventListener('input', () => filterProducts());
    document.querySelectorAll('.cp-type-btn').forEach(btn => btn.addEventListener('click', () => filterProducts(btn.dataset.type)));
    elements.productForm.addEventListener('submit', handleFormSubmit);
    // CORREÇÃO: Passando os parâmetros corretos
    elements.imagemProduto.addEventListener('change', (event) => handleImagemChange(event, 'principal'));
    elements.removeImagem.addEventListener('click', handleRemoveImagem);
    document.querySelectorAll('input[name="tipo"]').forEach(cb => cb.addEventListener('change', toggleTabs));
    initializeDragAndDrop();
    document.getElementById('saveKitConfigBtn').addEventListener('click', salvarComposicaoKit);
    elements.addVariacaoKitBtn.addEventListener('click', handleAddVariacaoKit);
}

// --- Navegação e Views ---
function toggleView() {
    const hash = window.location.hash;
    const isEditing = hash === '#editando';
    elements.productListView.style.display = isEditing ? 'none' : 'block';
    elements.productFormView.style.display = isEditing ? 'block' : 'none';
    if (!isEditing) {
        editingProduct = null;
        localStorage.removeItem('ultimoProdutoEditado');
        filterProducts();
    } else if (!editingProduct) {
        const ultimoProdutoNome = localStorage.getItem('ultimoProdutoEditado');
        const produtoRecuperado = produtos.find(p => p.nome === ultimoProdutoNome);
        produtoRecuperado ? editProduct(produtoRecuperado.nome) : handleAdicionarNovoProduto();
    }
}

// --- Lista de Produtos ---
function loadProductTable(filteredProdutos) {
    elements.productTableBody.innerHTML = '';
    if (!filteredProdutos || filteredProdutos.length === 0) {
        elements.productTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum produto encontrado.</td></tr>`;
        return;
    }
    filteredProdutos.forEach(produto => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td data-label=""><img src="${produto.imagem || '/img/placeholder-image.png'}" class="cp-product-thumbnail" onerror="this.onerror=null;this.src='/img/placeholder-image.png';"></td>
            <td data-label="Produto">${produto.nome}</td>
            <td data-label="SKU">${produto.sku || '-'}</td>
            <td data-label="Unidade">${produto.unidade || '-'}</td>
            <td data-label="Estoque">${produto.estoque || 0}</td>
            <td data-label="Tipo">${(produto.tipos || []).join(', ') || '-'}</td>
        `;
        tr.addEventListener('click', () => editProduct(produto.nome));
        elements.productTableBody.appendChild(tr);
    });
}

function filterProducts(type = 'todos') {
    document.querySelectorAll('.cp-type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === type));
    const searchTerm = elements.searchProduct.value.toLowerCase();
    const filtered = produtos.filter(p =>
        (type === 'todos' || (p.tipos || []).includes(type)) &&
        p.nome.toLowerCase().includes(searchTerm)
    );
    loadProductTable(filtered);
}

// --- Edição de Produto ---
function handleAdicionarNovoProduto() {
    editingProduct = {
        nome: '', sku: '', gtin: '', unidade: 'pç', estoque: 0, imagem: '',
        tipos: [], variacoes: [{ chave: 'Cor', valores: '' }], grade: [], is_kit: false, id: undefined,
        etapas: [], etapasTiktik: []
    };
    gradeTemp = [];
    localStorage.removeItem('ultimoProdutoEditado');
    window.location.hash = '#editando';
    loadEditForm(editingProduct);
}

function editProduct(nome) {
    const produtoOriginal = produtos.find(p => p.nome === nome);
    if (!produtoOriginal) return;
    editingProduct = deepClone(produtoOriginal);
    gradeTemp = deepClone(editingProduct.grade || []);
    localStorage.setItem('ultimoProdutoEditado', nome);
    window.location.hash = '#editando';
    loadEditForm(editingProduct);
}

function loadEditForm(produto) {
    elements.editProductNameDisplay.textContent = produto.id ? `Editando: ${produto.nome}` : 'Cadastrando Novo Produto';
    elements.inputProductName.value = produto.nome || '';
    elements.sku.value = produto.sku || '';
    elements.gtin.value = produto.gtin || '';
    elements.unidade.value = produto.unidade || 'pç';
    elements.estoque.value = produto.estoque || 0;
    document.querySelectorAll('input[name="tipo"]').forEach(cb => { cb.checked = (produto.tipos || []).includes(cb.value); });
    handleRemoveImagem();
    if (produto.imagem) {
        elements.previewImagem.src = produto.imagem;
        elements.previewImagem.style.display = 'block';
        elements.removeImagem.style.display = 'inline-block';
    }
    elements.stepsBody.innerHTML = '';
    (produto.etapas || []).forEach((etapa, index) => addStepRow(etapa.processo, etapa.maquina, etapa.feitoPor, index));
    elements.etapasTiktikBody.innerHTML = '';
    (produto.etapasTiktik || []).forEach((etapa, index) => addEtapaTiktikRow(etapa.processo, etapa.maquina, etapa.feitoPor, index));
    loadVariacoesComponent(produto);
    loadGrade();
    toggleTabs();
    const abaPadrao = (produto.tipos || []).find(t => t === 'variacoes' || t === 'kits') ? 'variacoes' : 'dados-gerais';
    switchTab(abaPadrao);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    try {
        await salvarProdutoNoBackend();
        alert('Produto salvo com sucesso!');
        window.location.hash = '';
    } catch (error) { /* erro já tratado em salvarProdutoNoBackend */ }
}

// --- Variações e Grade ---
function loadVariacoesComponent(produto) {
    elements.variationsComponentContainer.innerHTML = '';
    const variacoes = produto.variacoes && produto.variacoes.length > 0 ? produto.variacoes : [{ chave: 'Cor', valores: '' }];
    variacoes.forEach((variacao, index) => addVariacaoRow(variacao.chave, variacao.valores, index));
}

window.addVariacaoRow = function (chave = '', valores = '', index = null) {
    const idx = index !== null ? index : elements.variationsComponentContainer.children.length;
    const div = document.createElement('div');
    div.className = 'cp-variation-row';
    div.dataset.index = idx;
    div.innerHTML = `
        <div class="cp-form-group cp-variation-key-group">
            <label for="chaveVariacao${idx}">Variação</label>
            <input type="text" id="chaveVariacao${idx}" class="cp-input" value="${chave}" placeholder="Ex: Cor">
        </div>
        <div class="cp-form-group cp-variation-values-group">
            <label>Valores</label>
            <div class="cp-tags-input-wrapper" id="tagsWrapper${idx}">
                <input type="text" class="cp-tag-input-field" placeholder="Digite e tecle Enter...">
            </div>
        </div>
        <button type="button" class="cp-remove-btn" onclick="removeVariacaoRow(this)">×</button>
    `;
    elements.variationsComponentContainer.appendChild(div);
    const tagsWrapper = div.querySelector(`#tagsWrapper${idx}`);
    const inputField = div.querySelector('.cp-tag-input-field');
    const chaveInput = div.querySelector(`#chaveVariacao${idx}`);
    if (valores) {
        valores.split(',').map(v => v.trim()).filter(Boolean).forEach(valor => {
            tagsWrapper.insertBefore(createTag(valor), inputField);
        });
    }
    tagsWrapper.addEventListener('click', () => inputField.focus());
    inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const valor = inputField.value.trim();
            if (valor && !Array.from(tagsWrapper.querySelectorAll('.cp-tag')).some(t => t.firstChild.textContent.trim() === valor)) {
                tagsWrapper.insertBefore(createTag(valor), inputField);
                inputField.value = '';
                gerarCombinacoesEAtualizarGrade();
            }
        }
    });
    chaveInput.addEventListener('blur', gerarCombinacoesEAtualizarGrade);
}

function createTag(text) {
    const tag = document.createElement('span');
    tag.className = 'cp-tag';
    tag.textContent = text;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-tag-btn';
    removeBtn.innerHTML = '×';
    removeBtn.type = "button";
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        tag.remove();
        gerarCombinacoesEAtualizarGrade();
    };
    tag.appendChild(removeBtn);
    return tag;
}

window.removeVariacaoRow = function (btn) {
    btn.closest('.cp-variation-row').remove();
    gerarCombinacoesEAtualizarGrade();
}

function gerarCombinacoesEAtualizarGrade() {
    const variacoesRows = Array.from(elements.variationsComponentContainer.querySelectorAll('.cp-variation-row'));
    const variacoes = variacoesRows.map(row => ({
        chave: row.querySelector('input[id^="chaveVariacao"]').value.trim(),
        valores: Array.from(row.querySelectorAll('.cp-tag')).map(tag => tag.firstChild.textContent.trim())
    })).filter(v => v.chave && v.valores.length > 0);
    if (variacoes.length === 0) {
        gradeTemp = [];
        loadGrade();
        return;
    }
    const combinations = variacoes.reduce((acc, curr) => (
        acc.length === 0 ? curr.valores.map(val => [val]) : acc.flatMap(combo => curr.valores.map(val => [...combo, val]))
    ), []);
    const novasCombinacoesStr = combinations.map(combo => combo.join(' | '));
    const novasCombinacoesSet = new Set(novasCombinacoesStr);
    gradeTemp = gradeTemp.filter(item => novasCombinacoesSet.has(item.variacao));
    novasCombinacoesStr.forEach(novaVariacao => {
        if (!gradeTemp.some(item => item.variacao === novaVariacao)) {
            gradeTemp.push({ variacao: novaVariacao, sku: '', imagem: '', composicao: (editingProduct?.is_kit) ? [] : ['-'] });
        }
    });
    loadGrade();
}

function loadGrade() {
    elements.gradeBody.innerHTML = '';
    const isKit = (editingProduct?.tipos || []).includes('kits');
    const headers = Array.from(elements.variationsComponentContainer.querySelectorAll('input[id^="chaveVariacao"]')).map(input => input.value.trim() || 'Variação');
    elements.gradeHeader.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}${isKit ? '<th>Composto Por</th>' : ''}<th>Código (SKU)</th><th>Imagem</th><th>Ações</th></tr>`;
    if (gradeTemp.length === 0) {
        elements.gradeBody.innerHTML = `<tr><td colspan="${headers.length + (isKit ? 3 : 2)}" style="text-align:center;">Defina as variações acima.</td></tr>`;
        return;
    }
    gradeTemp.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.index = idx;
        const valores = item.variacao.split(' | ');
        let rowHTML = valores.map((v, i) => `<td data-label="${headers[i] || ''}">${v}</td>`).join('');
        if (isKit) {
            const composicaoHtml = item.composicao?.length > 0 && item.composicao[0]?.produto
               ? `<div class="composicao-tags">${item.composicao.map(c => `<span class="composicao-tag">${c.produto} - ${c.variacao} (${c.quantidade})</span>`).join('')}<button type="button" class="cp-btn" onclick="abrirConfigurarVariacao('${idx}')">Editar</button></div>`
               : `<div class="composicao-tags"><button type="button" class="cp-btn" onclick="abrirConfigurarVariacao('${idx}')">Configurar</button></div>`;
           rowHTML += `<td data-label="Composto Por">${composicaoHtml}</td>`;
        }
        rowHTML += `<td data-label="SKU"><input type="text" class="cp-input cp-grade-sku" value="${item.sku || ''}" onblur="updateGradeSku(${idx}, this.value)"></td>
                    <td data-label="Imagem"><div class="cp-grade-img-placeholder" onclick="abrirImagemPopup('${idx}')">${item.imagem ? `<img src="${item.imagem}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">` : ''}</div></td>
                    <td data-label="Ações"><button type="button" class="cp-remove-btn" onclick="excluirGrade('${idx}')">X</button></td>`;
        tr.innerHTML = rowHTML;
        elements.gradeBody.appendChild(tr);
    });
}

window.updateGradeSku = (index, sku) => { if (gradeTemp[index]) gradeTemp[index].sku = sku.trim(); };
window.excluirGrade = (index) => {
    const idx = parseInt(index);
    if (isNaN(idx) || idx < 0 || idx >= gradeTemp.length) return;
    if (confirm(`Tem certeza que deseja excluir a variação "${gradeTemp[idx].variacao}"?`)) {
        gradeTemp.splice(idx, 1);
        loadGrade();
    }
};

window.salvarGrade = async () => {
    if (!editingProduct) return;
    try {
        await salvarProdutoNoBackend();
        alert('Grade e Variações salvas com sucesso!');
    } catch (error) { /* erro já tratado */ }
};

// --- Função Principal de Salvamento ---
async function salvarProdutoNoBackend() {
    if (!editingProduct) throw new Error('Nenhum produto para salvar.');
    editingProduct.variacoes = Array.from(elements.variationsComponentContainer.querySelectorAll('.cp-variation-row')).map(row => ({
        chave: row.querySelector('input[id^="chaveVariacao"]').value.trim(),
        valores: Array.from(row.querySelectorAll('.cp-tag')).map(tag => tag.firstChild.textContent.trim()).join(',')
    })).filter(v => v.chave);
    gradeTemp.forEach((item, idx) => {
        const skuInput = elements.gradeBody.querySelector(`tr[data-index="${idx}"] .cp-grade-sku`);
        if (skuInput) item.sku = skuInput.value.trim();
    });
    const updatedProduct = {
        ...editingProduct,
        nome: elements.inputProductName.value.trim(),
        sku: elements.sku.value.trim(),
        gtin: elements.gtin.value.trim(),
        unidade: elements.unidade.value,
        tipos: Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value),
        imagem: elements.previewImagem.src.startsWith('data:') ? elements.previewImagem.src : (editingProduct.imagem || ''),
        etapas: Array.from(elements.stepsBody.querySelectorAll('tr')).map(tr => ({
            processo: tr.querySelector('.processo-select')?.value || '', maquina: tr.querySelector('.maquina-select')?.value || '', feitoPor: tr.querySelector('.feito-por-select')?.value || ''
        })),
        etapasTiktik: Array.from(elements.etapasTiktikBody.querySelectorAll('tr')).map(tr => ({
            processo: tr.querySelector('.processo-select')?.value || '', maquina: tr.querySelector('.maquina-select')?.value || '', feitoPor: tr.querySelector('.feito-por-select')?.value || ''
        })),
        grade: deepClone(gradeTemp),
    };
    updatedProduct.is_kit = updatedProduct.tipos.includes('kits');
    if (!updatedProduct.nome) { alert('O nome do produto é obrigatório!'); throw new Error('Nome do produto é obrigatório.'); }
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/produtos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(updatedProduct)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro do servidor: ${response.status}`);
        }
        const savedProduct = await response.json();
        const index = produtos.findIndex(p => p.id === savedProduct.id);
        if (index > -1) produtos[index] = savedProduct; else produtos.push(savedProduct);
        editingProduct = deepClone(savedProduct);
        gradeTemp = deepClone(savedProduct.grade || []);
        await invalidateCache('produtos');
        return savedProduct;
    } catch (error) {
        alert('Falha ao salvar o produto: ' + error.message);
        console.error('Erro em salvarProdutoNoBackend:', error);
        throw error;
    }
}

// --- Funções Utilitárias e Popups ---
async function handleImagemChange(event, tipo, index = null) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;

    let previewElement;
    if (tipo === 'principal') {
        previewElement = elements.previewImagem;
    } else if (tipo === 'grade') {
        const tr = elements.gradeBody.querySelector(`tr[data-index="${index}"]`);
        previewElement = tr?.querySelector('.cp-grade-img-placeholder');
    }
    if (!previewElement) return;

    previewElement.innerHTML = '<div class="spinner-btn-interno"></div>';
    if (elements.removeImagem && tipo === 'principal') elements.removeImagem.style.display = 'none';

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': file.type,
                'x-filename': file.name
            },
            body: file,
        });

        const blobData = await response.json();
        if (!response.ok) {
            throw new Error(blobData.error || 'Falha no upload do arquivo.');
        }

        const imageUrl = blobData.url;

        // Atualiza a UI com a imagem
        if (tipo === 'principal') {
            previewElement.src = imageUrl;
            previewElement.style.display = 'block';
            previewElement.innerHTML = '';
            if (elements.removeImagem) elements.removeImagem.style.display = 'inline-block';
            if (editingProduct) editingProduct.imagem = imageUrl;
        } else if (tipo === 'grade') {
            previewElement.innerHTML = `<img src="${imageUrl}" onerror="this.onerror=null;this.src='/img/placeholder-image.png';">`;
            if (gradeTemp[index]) gradeTemp[index].imagem = imageUrl;
        }

        // --- MUDANÇA PRINCIPAL AQUI ---
        // Salva automaticamente o produto no backend para persistir a URL da imagem
        console.log("Imagem atualizada. Salvando produto para persistir a URL...");
        await salvarProdutoNoBackend();
        
        // Mostra o pop-up de sucesso DEPOIS de salvar no banco
        mostrarPopup('Imagem salva com sucesso!', 'sucesso');

    } catch (error) {
        console.error('Erro no processo de upload ou salvamento:', error);
        mostrarPopup(`Erro: ${error.message}`, 'erro');

        // Reverte a UI em caso de erro
        if (tipo === 'principal') {
            previewElement.style.display = 'none';
        } else if (tipo === 'grade') {
            previewElement.innerHTML = ''; // Remove o spinner
        }
    } finally {
        input.value = '';
    }
}



function handleRemoveImagem() {
    elements.imagemProduto.value = '';
    elements.previewImagem.src = '';
    elements.previewImagem.style.display = 'none';
    elements.removeImagem.style.display = 'none';
    if (editingProduct) editingProduct.imagem = '';
}
window.switchTab = function(tabId) {
    document.querySelectorAll('.cp-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.cp-tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.cp-tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');
};
window.toggleTabs = function() {
    const tipos = Array.from(document.querySelectorAll('input[name="tipo"]:checked')).map(cb => cb.value);
    let variacoesBtn = document.querySelector('.cp-tab-btn[data-tab="variacoes"]');
    if (tipos.includes('variacoes') || tipos.includes('kits')) {
        if (!variacoesBtn) {
            const btn = document.createElement('button');
            btn.className = 'cp-tab-btn';
            btn.dataset.tab = 'variacoes';
            btn.textContent = 'Variações e Grade';
            btn.onclick = () => switchTab('variacoes');
            elements.tabFilter.appendChild(btn);
        }
    } else if (variacoesBtn) {
        variacoesBtn.remove();
        if (document.getElementById('variacoes').classList.contains('active')) switchTab('dados-gerais');
    }
};

window.abrirImagemPopup = function(index) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // O `onchange` agora chama a nova handleImagemChange
    input.onchange = (event) => handleImagemChange(event, 'grade', index);
    input.click(); // Abre o seletor de arquivos do sistema
};

window.fecharPopup = function() { document.querySelectorAll('.cp-popup.active').forEach(p => p.classList.remove('active')); };
window.confirmarImagemGrade = function() {
    const file = elements.gradeImageInput.files[0];
    if (file && currentGradeIndex !== null && gradeTemp[currentGradeIndex]) {
        resizeImage(file, base64 => {
            gradeTemp[currentGradeIndex].imagem = base64;
            loadGrade();
            fecharPopup();
        });
    }
};

// --- Funções de Estrutura, Kit e Drag-and-Drop (Completas) ---
window.addStepRow = function(processo = '', maquina = '', feitoPor = '') {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.innerHTML = `<td><span class="icone-arrastar">☰</span></td><td><select class="cp-select processo-select">${PROCESSOS.map(p => `<option value="${p}" ${p === processo ? 'selected' : ''}>${p}</option>`).join('')}</select></td><td><select class="cp-select maquina-select">${MAQUINAS.map(m => `<option value="${m}" ${m === maquina ? 'selected' : ''}>${m}</option>`).join('')}</select></td><td><select class="cp-select feito-por-select">${['costureira', 'tiktik', 'cortador'].map(t => `<option value="${t}" ${t === feitoPor ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}</select></td><td><button type="button" class="cp-remove-btn" onclick="this.parentElement.parentElement.remove()">X</button></td>`;
    elements.stepsBody.appendChild(tr);
};
window.addEtapaTiktikRow = function(processo = '', maquina = '', feitoPor = '') {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.innerHTML = `<td><span class="icone-arrastar">☰</span></td><td><select class="cp-select processo-select">${PROCESSOS.map(p => `<option value="${p}" ${p === processo ? 'selected' : ''}>${p}</option>`).join('')}</select></td><td><select class="cp-select maquina-select">${MAQUINAS.map(m => `<option value="${m}" ${m === maquina ? 'selected' : ''}>${m}</option>`).join('')}</select></td><td><select class="cp-select feito-por-select">${['costureira', 'tiktik', 'cortador'].map(t => `<option value="${t}" ${t === feitoPor ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}</select></td><td><button type="button" class="cp-remove-btn" onclick="this.parentElement.parentElement.remove()">X</button></td>`;
    elements.etapasTiktikBody.appendChild(tr);
};
function initializeDragAndDrop() {
    [elements.stepsBody, elements.etapasTiktikBody].forEach(container => {
        let draggingEle;
        container.addEventListener('dragstart', (e) => { draggingEle = e.target; });
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = [...container.querySelectorAll('tr:not(.dragging)')].reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = e.clientY - box.top - box.height / 2;
                return (offset < 0 && offset > closest.offset) ? { offset: offset, element: child } : closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
            if (afterElement == null) { container.appendChild(draggingEle); } else { container.insertBefore(draggingEle, afterElement); }
        });
    });
}
window.abrirConfigurarVariacao = function(index) {
    currentKitVariationIndex = parseInt(index);
    if (isNaN(currentKitVariationIndex) || !editingProduct?.grade[currentKitVariationIndex]) { alert('Erro: Variação de kit não encontrada.'); return; }
    const variacaoKit = editingProduct.grade[currentKitVariationIndex];
    elements.configurarVariacaoTitle.textContent = `Configurar: ${variacaoKit.variacao}`;
    kitComposicaoTemp = deepClone(variacaoKit.composicao || []);
    const produtosComponentes = produtos.filter(p => (p.tipos?.includes('simples') || p.tipos?.includes('variacoes')) && p.id !== editingProduct.id);
    elements.produtoKitSelect.innerHTML = '<option value="">Selecione um produto</option>' + produtosComponentes.map(p => `<option value="${p.nome}">${p.nome}</option>`).join('');
    elements.variacaoKitSelect.innerHTML = '<option value="">Selecione uma variação</option>';
    renderizarComposicaoKit();
    elements.configurarVariacaoView.classList.add('active');
};
window.loadVariacoesKit = function() {
    const produtoNome = elements.produtoKitSelect.value;
    const produto = produtos.find(p => p.nome === produtoNome);
    elements.variacaoKitSelect.innerHTML = '<option value="">Selecione uma variação</option>';
    if (produto?.grade?.length > 0) {
        produto.grade.forEach(g => { elements.variacaoKitSelect.innerHTML += `<option value="${g.variacao}">${g.variacao}</option>`; });
    } else {
        elements.variacaoKitSelect.innerHTML += '<option value="-">Padrão</option>';
    }
};
function handleAddVariacaoKit() {
    const produto = elements.produtoKitSelect.value;
    const variacao = elements.variacaoKitSelect.value;
    if (!produto || !variacao) { alert('Selecione produto e variação.'); return; }
    if (kitComposicaoTemp.some(c => c.produto === produto && c.variacao === variacao)) { alert('Componente já adicionado.'); return; }
    kitComposicaoTemp.push({ produto, variacao, quantidade: 1 });
    renderizarComposicaoKit();
}
function renderizarComposicaoKit() {
    elements.composicaoKitContainer.innerHTML = '';
    kitComposicaoTemp.forEach((comp, idx) => {
        const div = document.createElement('div');
        div.className = 'composicao-kit-row';
        div.innerHTML = `<span>${comp.produto} - ${comp.variacao}</span><input type="number" class="cp-input" min="1" value="${comp.quantidade}" onchange="atualizarQuantidadeKit(${idx}, this.value)"><button type="button" class="cp-remove-btn" onclick="removerComposicaoKit(${idx})">X</button>`;
        elements.composicaoKitContainer.appendChild(div);
    });
}
window.atualizarQuantidadeKit = (index, qty) => { kitComposicaoTemp[index].quantidade = parseInt(qty) || 1; };
window.removerComposicaoKit = (index) => { kitComposicaoTemp.splice(index, 1); renderizarComposicaoKit(); };
async function salvarComposicaoKit() {
    if (currentKitVariationIndex !== null && editingProduct.grade[currentKitVariationIndex]) {
        editingProduct.grade[currentKitVariationIndex].composicao = deepClone(kitComposicaoTemp);
        gradeTemp = deepClone(editingProduct.grade);
        loadGrade();
        fecharPopup();
        await salvarGrade(); // Salva a alteração no backend
    }
}

// --- Ponto de Entrada ---
document.addEventListener('DOMContentLoaded', inicializarPagina);

// --- Exposição de Funções Globais para o HTML ---
Object.assign(window, {
    addVariacaoRow, removeVariacaoRow, excluirGrade, salvarGrade, switchTab, toggleTabs,
    abrirImagemPopup, fecharPopup, confirmarImagemGrade, updateGradeSku, addStepRow, addEtapaTiktikRow,
    abrirConfigurarVariacao, loadVariacoesKit, atualizarQuantidadeKit, removerComposicaoKit
});