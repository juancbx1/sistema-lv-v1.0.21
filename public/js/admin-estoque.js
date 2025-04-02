import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterOrdensFinalizadas, obterProdutos, invalidateCache } from '/js/utils/storage.js';

let permissoes = [];
let usuarioLogado = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('estoque.html', ['acesso-estoque']); // Ajuste a permissão conforme necessário
        if (!auth) {
            window.location.href = 'acesso-negado.html';
            return;
        }

        permissoes = auth.permissoes || [];
        usuarioLogado = auth.usuario;
        console.log('[admin-estoque] Autenticação bem-sucedida, permissões:', permissoes);

        await inicializar();
    } catch (error) {
        console.error('[DOMContentLoaded] Erro na autenticação:', error);
        window.location.href = 'acesso-negado.html';
    }
});

async function inicializar() {
    console.log('[inicializar] Inicializando a página com usuário:', usuarioLogado);

    // Limpa cache para garantir dados frescos
    invalidateCache('ordensFinalizadas');

    await carregarTabelaEstoque();
    setupEventListeners();
    console.log('[inicializar] Inicialização concluída');
}

function setupEventListeners() {
    const searchEstoque = document.getElementById('searchEstoque');
    if (searchEstoque) {
        searchEstoque.addEventListener('input', debounce(filterEstoque, 300));
    }

    const voltarBtn = document.getElementById('voltarBtn');
    if (voltarBtn) {
        voltarBtn.addEventListener('click', () => {
            window.location.hash = '';
            showMainView();
        });
    }

    const salvarEstoqueBtn = document.getElementById('salvarEstoqueBtn');
    if (salvarEstoqueBtn) {
        salvarEstoqueBtn.addEventListener('click', salvarMovimentoEstoque);
    }

    window.addEventListener('hashchange', handleHashChange);
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function carregarTabelaEstoque(search = '') {
    console.log('[carregarTabelaEstoque] Iniciando carregamento da tabela');

    try {
        const ordensFinalizadas = await obterOrdensFinalizadas() || [];
        const produtosCadastrados = await obterProdutos() || [];
        const estoqueAgrupado = {};

        ordensFinalizadas.forEach(op => {
            if (op.status === 'finalizado') {
                const chave = `${op.produto}:${op.variante || '-'}`;
                const qtdOriginal = obterQuantidadeDisponivel(op);
                const qtdEmbalada = op.quantidadeEmbalada || 0;
                const qtdDisponivel = qtdOriginal - qtdEmbalada;
                if (qtdDisponivel > 0) {
                    estoqueAgrupado[chave] = (estoqueAgrupado[chave] || 0) + qtdDisponivel;
                }
            }
        });

        let produtosFiltrados = Object.entries(estoqueAgrupado).map(([chave, quantidade]) => {
            const [produto, variante] = chave.split(':');
            return { produto, variante, quantidade };
        }).filter(item =>
            item.produto.toLowerCase().includes(search.toLowerCase()) ||
            item.variante.toLowerCase().includes(search.toLowerCase())
        );

        atualizarTabelaEstoque(produtosFiltrados);
    } catch (error) {
        console.error('[carregarTabelaEstoque] Erro ao carregar tabela:', error);
        const tbody = document.getElementById('estoqueTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4">Erro ao carregar estoque. Tente novamente.</td></tr>';
        }
    }
}

function atualizarTabelaEstoque(produtos) {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) {
        console.error('[atualizarTabelaEstoque] Elemento #estoqueTableBody não encontrado');
        return;
    }

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    produtos.forEach(item => {
        const produtoCadastrado = obterProdutos().find(p => p.nome === item.produto);
        const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === item.variante);
        const imagem = gradeItem?.imagem || '/images/placeholder.png'; // Imagem placeholder

        const tr = document.createElement('tr');
        tr.dataset.produto = item.produto;
        tr.dataset.variante = item.variante;
        tr.innerHTML = `
            <td><div class="thumbnail">${imagem ? `<img src="${imagem}" alt="Imagem de ${item.variante}">` : '<span class="espaco-miniatura-produto"></span>'}</div></td>
            <td>${item.produto}</td>
            <td>${item.variante}</td>
            <td>${item.quantidade}</td>
        `;
        tr.addEventListener('click', () => handleProductClick(item));
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
    console.log('[atualizarTabelaEstoque] Tabela carregada com sucesso');
}

function filterEstoque(search) {
    carregarTabelaEstoque(search);
}

function handleProductClick(item) {
    console.log(`[handleProductClick] Clicado em Produto: ${item.produto}, Variante: ${item.variante}, Qtd: ${item.quantidade}`);
    const mainView = document.getElementById('mainView');
    const editView = document.getElementById('editEstoqueView');
    if (mainView && editView) {
        mainView.style.display = 'none';
        editView.classList.add('active');
        window.location.hash = `#editar/${item.produto}/${item.variante}`;
        document.getElementById('estoqueTitle').textContent = `Estoque: ${item.produto}: ${item.variante}`;
        document.getElementById('quantidadeEstoque').value = '';
    } else {
        console.error('[handleProductClick] mainView ou editEstoqueView não encontrados');
    }
}

function handleHashChange() {
    const hash = window.location.hash;
    console.log('[handleHashChange] Hash alterado para:', hash);
    const mainView = document.getElementById('mainView');
    const editView = document.getElementById('editEstoqueView');
    if (mainView && editView) {
        if (hash.startsWith('#editar/')) {
            mainView.style.display = 'none';
            editView.classList.add('active');
            const [_, produto, variante] = hash.split('/');
            const item = { produto, variante, quantidade: 0 }; // Quantidade será atualizada ao salvar
            document.getElementById('estoqueTitle').textContent = `Estoque: ${produto}: ${variante}`;
        } else {
            mainView.style.display = 'block';
            editView.classList.remove('active');
            carregarTabelaEstoque(document.getElementById('searchEstoque').value);
        }
    }
}

function showMainView() {
    const mainView = document.getElementById('mainView');
    const editView = document.getElementById('editEstoqueView');
    if (mainView && editView) {
        mainView.style.display = 'block';
        editView.classList.remove('active');
    }
}

async function salvarMovimentoEstoque() {
    const tipoMovimento = document.getElementById('tipoMovimento').value;
    const quantidade = parseInt(document.getElementById('quantidadeEstoque').value) || 0;
    const [_, produto, variante] = window.location.hash.split('/');

    if (!produto || !variante || quantidade < 0) {
        alert('Dados inválidos!');
        return;
    }

    const ordensFinalizadas = await obterOrdensFinalizadas();
    const ordem = ordensFinalizadas.find(op => op.produto === produto && op.variante === variante);

    if (!ordem) {
        console.error('[salvarMovimentoEstoque] Ordem não encontrada');
        alert('Produto não encontrado no estoque!');
        return;
    }

    let novaQuantidade = ordem.quantidadeEmbalada || 0;
    switch (tipoMovimento) {
        case 'entrada':
            novaQuantidade += quantidade;
            break;
        case 'balanco':
            novaQuantidade = quantidade;
            break;
        case 'saida':
            novaQuantidade -= quantidade;
            if (novaQuantidade < 0) {
                alert('Quantidade insuficiente para saída!');
                return;
            }
            break;
    }

    const dadosAtualizados = {
        edit_id: ordem.edit_id,
        quantidadeEmbalada: novaQuantidade
    };

    try {
        await fetchFromAPI('/ordens-de-producao', {
            method: 'PUT',
            body: JSON.stringify(dadosAtualizados)
        });
        invalidateCache('ordensFinalizadas');
        alert(`Movimento de estoque salvo! Nova quantidade: ${novaQuantidade}`);
        window.location.hash = '';
        carregarTabelaEstoque(document.getElementById('searchEstoque').value);
    } catch (error) {
        console.error('[salvarMovimentoEstoque] Erro ao salvar movimento:', error);
        alert('Erro ao salvar movimento de estoque!');
    }
}

function obterQuantidadeDisponivel(op) {
    const ultimaEtapa = op.etapas[op.etapas.length - 1];
    return ultimaEtapa && ultimaEtapa.quantidade ? parseInt(ultimaEtapa.quantidade) : 0;
}

function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    return fetch(`/api${endpoint}`, { ...options, headers })
        .then(response => {
            if (!response.ok) throw new Error(`Erro na requisição: ${response.status}`);
            return response.json();
        })
        .catch(error => {
            console.error(`[fetchFromAPI] Erro ao acessar ${endpoint}:`, error);
            throw error;
        });
}