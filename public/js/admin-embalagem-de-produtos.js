import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterOrdensFinalizadas, obterProdutos, invalidateCache, getCachedData } from '/js/utils/storage.js';

let filteredOPsGlobal = [];
let currentPage = 1;
const itemsPerPage = 10;
let permissoes = [];
let usuarioLogado = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('embalagem-de-produtos.html', ['acesso-embalagem-de-produtos']);
        if (!auth) {
            window.location.href = 'acesso-negado.html';
            return;
        }

        permissoes = auth.permissoes || [];
        usuarioLogado = auth.usuario;
        console.log('[admin-embalagem-de-produtos] Autenticação bem-sucedida, permissões:', permissoes);

        await inicializar(usuarioLogado, permissoes);
    } catch (error) {
        console.error('[DOMContentLoaded] Erro na autenticação:', error);
        window.location.href = 'acesso-negado.html';
    }
});


function setupEventListeners() {
    const searchProduto = document.getElementById('searchProduto');
    if (searchProduto) {
        searchProduto.addEventListener('input', debounce(filterProdutos, 300));
    }

    const voltarBtn = document.getElementById('voltarBtn');
    if (voltarBtn) {
        voltarBtn.addEventListener('click', () => {
            window.location.hash = '';
            showMainView();
        });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', alternarAba);
    });

    window.addEventListener('hashchange', handleHashChange);
}

async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    try {
        const response = await fetch(`/api${endpoint}`, {
            ...options,
            headers,
        });
        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`[fetchFromAPI] Erro ao acessar ${endpoint}:`, error);
        throw error;
    }
}

// Dentro do script, verifique o tamanho da tela
function adjustForMobile() {
    if (window.innerWidth <= 414) {
        const table = document.getElementById('produtosTable');
        const tableBody = document.getElementById('produtosTableBody');
        const productsSection = document.querySelector('.products-section');

        // Criar container para os cards
        const cardContainer = document.createElement('div');
        cardContainer.className = 'product-card-container';

        // Converter cada linha da tabela em um card
        Array.from(tableBody.getElementsByTagName('tr')).forEach(row => {
            const cells = row.getElementsByTagName('td');
            if (cells.length > 0) {
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.productId = row.dataset.productId; // Preservar qualquer ID ou dado

                // Adicionar campos ao card
                card.innerHTML = `
                    <div><strong>Produto:</strong> ${cells[0].textContent}</div>
                    <div><strong>Variação:</strong> ${cells[1].textContent}</div>
                    <div class="thumbnail">${cells[2].innerHTML}</div> <!-- Miniatura -->
                    <div><strong>Qtd Disp.:</strong> ${cells[3].textContent}</div>
                    <div><strong>OP:</strong> ${cells[4].textContent}</div>
                `;

                // Manter a funcionalidade de clique (se houver)
                card.addEventListener('click', () => row.click());

                cardContainer.appendChild(card);
            }
        });

        // Substituir a tabela pelos cards
        productsSection.insertBefore(cardContainer, table.nextSibling);
        table.style.display = 'none';
    }
}

// Chamar a função ao carregar e redimensionar
window.addEventListener('load', adjustForMobile);
window.addEventListener('resize', adjustForMobile);

// Função para verificar se há kits disponíveis para a variação
async function temKitsDisponiveis(produto, variante) {
    const produtosCadastrados = await obterProdutos() || [];
    console.log('[temKitsDisponiveis] Todos os produtos cadastrados:', produtosCadastrados);

    // Ajuste: usar p.is_kit em vez de p.isKit
    const kits = produtosCadastrados.filter(p => p.is_kit);
    const varianteAtual = variante === '-' ? '' : variante.toLowerCase();

    console.log(`[temKitsDisponiveis] Verificando kits para Produto: ${produto}, Variante: ${varianteAtual}`);
    console.log('[temKitsDisponiveis] Kits encontrados:', kits);

    const hasKits = kits.some(kit => {
        if (!kit.grade) {
            console.log(`[temKitsDisponiveis] Kit ${kit.nome} não tem grade.`);
            return false;
        }

        return kit.grade.some(g => {
            if (!g.composicao || g.composicao.length === 0) {
                console.log(`[temKitsDisponiveis] Variação ${g.variacao} do kit ${kit.nome} não tem composição.`);
                return false;
            }

            return g.composicao.some(c => {
                const produtoComposicao = c.produto || produto;
                const variacaoComposicao = c.variacao === '-' ? '' : c.variacao.toLowerCase();
                const isMatch = produtoComposicao === produto && variacaoComposicao === varianteAtual;
                console.log(`[temKitsDisponiveis] Comparando ${produtoComposicao}:${variacaoComposicao} com ${produto}:${varianteAtual} -> ${isMatch}`);
                return isMatch;
            });
        });
    });

    console.log(`[temKitsDisponiveis] Há kits disponíveis? ${hasKits}`);
    return hasKits;
}

async function carregarKitsDisponiveis(produto, variante) {
    const produtosCadastrados = await obterProdutos() || [];
    const kitsList = document.getElementById('kits-list');
    kitsList.innerHTML = '';

    console.log('[carregarKitsDisponiveis] Produtos cadastrados:', produtosCadastrados);

    if (!produto || !variante) {
        kitsList.innerHTML = '<p>Selecione um produto e variação para ver os kits disponíveis.</p>';
        return;
    }

    const varianteNormalizada = variante === '-' ? '' : variante.toLowerCase();
    console.log(`[carregarKitsDisponiveis] Filtrando kits para Produto: ${produto}, Variante: ${varianteNormalizada}`);

    // Ajuste: usar p.is_kit em vez de p.isKit
    const kitsFiltrados = produtosCadastrados.filter(kit => {
        if (!kit.is_kit || !kit.grade) return false;

        const match = kit.grade.some(grade => {
            return grade.composicao && grade.composicao.some(item => {
                const produtoComposicao = item.produto || produto;
                const itemVariacaoNormalizada = item.variacao === '-' ? '' : item.variacao.toLowerCase();
                const isMatch = produtoComposicao === produto && itemVariacaoNormalizada === varianteNormalizada;
                console.log(`[carregarKitsDisponiveis] Comparando ${produtoComposicao}:${itemVariacaoNormalizada} com ${produto}:${varianteNormalizada} -> ${isMatch}`);
                return isMatch;
            });
        });
        console.log(`[carregarKitsDisponiveis] Kit ${kit.nome} contém a variação ${varianteNormalizada}? ${match}`);
        return match;
    });

    console.log('[carregarKitsDisponiveis] Kits filtrados:', kitsFiltrados);

    if (kitsFiltrados.length === 0) {
        kitsList.innerHTML = '<p>Nenhum kit disponível para esta variação.</p>';
        return;
    }

    kitsFiltrados.forEach(kit => {
        const button = document.createElement('button');
        button.textContent = kit.nome;
        button.addEventListener('click', () => {
            document.querySelectorAll('#kits-list button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            carregarVariacoesKit(kit.nome, produto, variante);
        });
        kitsList.appendChild(button);
    });

    if (kitsList.children.length > 0) {
        kitsList.children[0].classList.add('active');
        carregarVariacoesKit(kitsFiltrados[0].nome, produto, variante);
    }
}

// Função para carregar as variações de um kit específico
async function carregarVariacoesKit(nomeKit, produto, variante) {
    const produtosCadastrados = await obterProdutos() || [];
    const kitVariacoesSelect = document.getElementById('kit-variacoes');
    if (!kitVariacoesSelect) {
        console.error('[carregarVariacoesKit] Elemento #kit-variacoes não encontrado no DOM');
        return;
    }
    kitVariacoesSelect.innerHTML = '<option value="">Selecione uma variação</option>';

    console.log(`[carregarVariacoesKit] Filtrando variações do kit ${nomeKit} para Produto: ${produto}, Variante: ${variante}`);

    // Ajuste: usar p.is_kit em vez de p.isKit
    const kit = produtosCadastrados.find(p => p.is_kit && p.nome === nomeKit);
    if (!kit || !kit.grade) {
        console.log(`[carregarVariacoesKit] Kit ${nomeKit} não encontrado ou sem grade.`);
        return;
    }

    const varianteNormalizada = variante === '-' ? '' : variante.toLowerCase();
    const variacoesFiltradas = kit.grade.filter(grade => {
        if (!grade.composicao || grade.composicao.length === 0) {
            console.log(`[carregarVariacoesKit] Variação ${grade.variacao} do kit ${nomeKit} sem composição.`);
            return false;
        }

        const contemVariacao = grade.composicao.some(item => {
            const produtoComposicao = item.produto || produto;
            const itemVariacaoNormalizada = item.variacao === '-' ? '' : item.variacao.toLowerCase();
            const isMatch = produtoComposicao === produto && itemVariacaoNormalizada === varianteNormalizada;
            console.log(`[carregarVariacoesKit] Comparando ${produtoComposicao}:${itemVariacaoNormalizada} com ${produto}:${varianteNormalizada} -> ${isMatch}`);
            return isMatch;
        });

        console.log(`[carregarVariacoesKit] Variação ${grade.variacao} contém a variação ${varianteNormalizada}? ${contemVariacao}`);
        return contemVariacao;
    });

    console.log('[carregarVariacoesKit] Variações filtradas:', variacoesFiltradas);

    if (variacoesFiltradas.length === 0) {
        console.log(`[carregarVariacoesKit] Nenhuma variação encontrada para ${nomeKit} com ${produto}:${variante}`);
        return;
    }

    variacoesFiltradas.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade.variacao;
        option.textContent = grade.variacao;
        kitVariacoesSelect.appendChild(option);
    });

    kitVariacoesSelect.addEventListener('change', () => {
        const variacaoSelecionada = kitVariacoesSelect.value;
        if (variacaoSelecionada) {
            console.log(`[carregarVariacoesKit] Variação selecionada: ${variacaoSelecionada}`);
            carregarTabelaKit(nomeKit, variacaoSelecionada, variante);
        }
    });

    if (variacoesFiltradas.length > 0) {
        kitVariacoesSelect.value = variacoesFiltradas[0].variacao;
        carregarTabelaKit(nomeKit, variacoesFiltradas[0].variacao, variante);
    }
}


// Função para carregar a mini tabela do kit selecionado
async function carregarTabelaKit(kitNome, variacao, varianteAtual) {
    const produtosCadastrados = await obterProdutos() || [];
    const kit = produtosCadastrados.find(p => p.nome === kitNome);
    const kitTableBody = document.getElementById('kit-table-body');
    const kitErrorMessage = document.getElementById('kit-error-message');
    kitTableBody.innerHTML = '';
    kitErrorMessage.classList.add('hidden');

    if (!kit || !kit.grade) {
        kitErrorMessage.textContent = 'Kit não encontrado ou sem grade definida.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    const variacaoKit = kit.grade.find(g => g.variacao === variacao);
    if (!variacaoKit || !variacaoKit.composicao || variacaoKit.composicao.length === 0) {
        kitErrorMessage.textContent = 'Esta variação do kit não possui composição definida.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    const composicao = variacaoKit.composicao;
    const ordensFinalizadas = await obterOrdensFinalizadas();
    const produtosAgrupados = {};
    await Promise.all(ordensFinalizadas.map(async op => {
        const chave = `${op.produto}:${op.variante || '-'}`;
        const qtdOriginal = obterQuantidadeDisponivel(op);
        const qtdAjustada = await obterQuantidadeDisponivelAjustada(op.produto, op.variante || '-', qtdOriginal);
        if (qtdAjustada > 0) {
            produtosAgrupados[chave] = (produtosAgrupados[chave] || 0) + qtdAjustada;
        }
    }));

    const embalagemAtual = JSON.parse(localStorage.getItem('embalagemAtual'));
    const produtoBase = embalagemAtual ? embalagemAtual.produto : 'Scrunchie (Padrão)';
    const varianteAtualNormalizada = varianteAtual === '-' ? '' : varianteAtual.toLowerCase();
    let menorQuantidadePossivel = Infinity;
    let todasDisponiveis = true;

    for (const item of composicao) {
        const chave = `${produtoBase}:${item.variacao}`;
        let qtdDisponivel = produtosAgrupados[chave] || 0;

        if (item.variacao.toLowerCase() === varianteAtualNormalizada) {
            qtdDisponivel = embalagemAtual ? embalagemAtual.quantidade : qtdDisponivel;
        }

        if (qtdDisponivel === 0) {
            todasDisponiveis = false;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.variacao} (${item.quantidade})</td>
            <td><input type="number" class="readonly" value="${qtdDisponivel}" readonly></td>
        `;
        kitTableBody.appendChild(tr);

        const qtdPossivel = Math.floor(qtdDisponivel / item.quantidade);
        if (!isNaN(qtdPossivel) && qtdPossivel >= 0) {
            menorQuantidadePossivel = Math.min(menorQuantidadePossivel, qtdPossivel);
        }
    }

    const kitFooter = document.getElementById('kit-footer');
    if (!kitFooter) {
        console.error('[carregarTabelaKit] Elemento #kit-footer não encontrado no DOM');
        return;
    }

    const qtdDisponivelElement = document.getElementById('qtd-disponivel-kits');
    if (!qtdDisponivelElement && kitFooter) {
        const div = document.createElement('div');
        div.className = 'qtd-disponivel-container';
        div.innerHTML = '<p>Qtd Disponível: <span id="qtd-disponivel-kits"></span></p>';
        kitFooter.appendChild(div);
    }

    const qtdDisponivelElementUpdated = document.getElementById('qtd-disponivel-kits');
    if (qtdDisponivelElementUpdated) {
        if (!todasDisponiveis || isNaN(menorQuantidadePossivel) || menorQuantidadePossivel <= 0) {
            qtdDisponivelElementUpdated.textContent = 'Insuficiente para montar Kit';
            kitErrorMessage.textContent = 'Faltam variações para montar o kit.';
            kitErrorMessage.classList.remove('hidden');
        } else {
            qtdDisponivelElementUpdated.textContent = menorQuantidadePossivel;
            kitErrorMessage.classList.add('hidden');
        }
    }

    kitFooter.innerHTML = `
        <div class="qtd-disponivel-container">
            <p>Qtd Disponível: <span id="qtd-disponivel-kits">${qtdDisponivelElementUpdated.textContent}</span></p>
        </div>
        <div class="qtd-enviar-container">
            <label>Quantidade a enviar: 
                <input type="number" id="qtd-enviar-kits" min="0" max="${isNaN(menorQuantidadePossivel) || menorQuantidadePossivel <= 0 ? 0 : menorQuantidadePossivel}" value="0">
            </label>
            <button id="kit-estoque-btn">Estoque</button>
        </div>
    `;

    const qtdEnviarKits = document.getElementById('qtd-enviar-kits');
    const kitEstoqueBtn = document.getElementById('kit-estoque-btn');
    kitEstoqueBtn.disabled = !todasDisponiveis || isNaN(menorQuantidadePossivel) || menorQuantidadePossivel <= 0;

    qtdEnviarKits.addEventListener('input', () => {
        let qtdInformada = parseInt(qtdEnviarKits.value) || 0;
        if (isNaN(menorQuantidadePossivel) || menorQuantidadePossivel <= 0 || !todasDisponiveis) {
            qtdInformada = 0;
            qtdEnviarKits.value = 0;
        } else if (qtdInformada > menorQuantidadePossivel) {
            qtdEnviarKits.value = menorQuantidadePossivel;
            qtdInformada = menorQuantidadePossivel;
        }
        kitEstoqueBtn.disabled = qtdInformada <= 0;
    });

    kitEstoqueBtn.addEventListener('click', () => {
        const qtdKits = parseInt(qtdEnviarKits.value) || 0;
        if (qtdKits > 0 && qtdKits <= (isNaN(menorQuantidadePossivel) ? 0 : menorQuantidadePossivel) && todasDisponiveis) {
            enviarKitParaEstoque(kitNome, variacao, qtdKits);
        } else {
            alert('Quantidade insuficiente ou variações faltando!');
        }
    });

    document.getElementById('kit-table-container').classList.remove('hidden');
}

// Função para enviar o kit ao estoque
async function enviarKitParaEstoque(kitNome, variacao, qtdKits) {
    const produtosCadastrados = await obterProdutos() || [];
    const kit = produtosCadastrados.find(p => p.nome === kitNome);
    const variacaoKit = kit.grade.find(g => g.variacao === variacao);
    const composicao = variacaoKit.composicao || [];

    const ordensFinalizadas = await obterOrdensFinalizadas();
    const embalagemAtual = JSON.parse(localStorage.getItem('embalagemAtual'));
    const produtoBase = embalagemAtual ? embalagemAtual.produto : 'Scrunchie (Padrão)';

    for (const item of composicao) {
        const chave = `${produtoBase}:${item.variacao}`;
        const ordem = ordensFinalizadas.find(op => op.produto === produtoBase && op.variante === item.variacao);
        if (ordem) {
            const qtdUsada = qtdKits * item.quantidade;
            await atualizarQuantidadeEmbalada(produtoBase, item.variacao, qtdUsada);
        }
    }

    carregarTabelaProdutos();
    alert(`Enviado ${qtdKits} kit(s) de ${kitNome} - ${variacao} para o estoque!`);
    window.location.hash = '';
    localStorage.removeItem('embalagemAtual');
}

function obterQuantidadeDisponivel(op) {
    const ultimaEtapa = op.etapas[op.etapas.length - 1];
    const qtd = ultimaEtapa && ultimaEtapa.quantidade ? parseInt(ultimaEtapa.quantidade) : 0;
    console.log(`[obterQuantidadeDisponivel] Produto: ${op.produto}, Variante: ${op.variante || '-'}, Qtd: ${qtd}`);
    return qtd;
}

async function atualizarQuantidadeEmbalada(produto, variante, quantidadeEnviada) {
    try {
        const ordens = await fetchFromAPI('/ordens-de-producao', { method: 'GET' });
        const ordensArray = Array.isArray(ordens) ? ordens : (ordens.rows || []);
        const ordem = ordensArray.find(op => op.produto === produto && op.variante === variante);

        if (!ordem) {
            console.error('[atualizarQuantidadeEmbalada] Ordem não encontrada');
            return;
        }

        const dadosAtualizados = {
            edit_id: ordem.edit_id,
            quantidadeEmbalada: (ordem.quantidadeEmbalada || 0) + quantidadeEnviada
        };

        await fetchFromAPI('/ordens-de-producao', {
            method: 'PUT',
            body: JSON.stringify(dadosAtualizados)
        });

        console.log(`[atualizarQuantidadeEmbalada] Produto: ${produto}, Variante: ${variante}, Quantidade Embalada Atualizada`);

        // Invalidar o cache após atualizar o estoque
        invalidateCache('ordensFinalizadas');
    } catch (error) {
        console.error('[atualizarQuantidadeEmbalada] Erro ao atualizar quantidade:', error);
    }
}

async function obterQuantidadeDisponivelAjustada(produto, variante, quantidadeOriginal) {
    try {
        const ordens = await obterOrdensFinalizadas(); // Usa o cache
        const ordem = ordens.find(op => op.produto === produto && op.variante === variante);

        let quantidadeEmbalada = 0;
        if (ordem && ordem.quantidadeEmbalada) {
            quantidadeEmbalada = ordem.quantidadeEmbalada;
        }

        const qtdAjustada = quantidadeOriginal - quantidadeEmbalada;
        console.log(`[obterQuantidadeDisponivelAjustada] Produto: ${produto}, Variante: ${variante}, Original: ${quantidadeOriginal}, Embalada: ${quantidadeEmbalada}, Ajustada: ${qtdAjustada}`);
        return Math.max(0, qtdAjustada);
    } catch (error) {
        console.error('[obterQuantidadeDisponivelAjustada] Erro ao ajustar quantidade:', error);
        return quantidadeOriginal; // Retorna a quantidade original em caso de erro
    }
} 

async function carregarTabelaProdutos(search = '') {
    console.log('[carregarTabelaProdutos] Iniciando carregamento da tabela');

    try {
        const ordensFinalizadas = await obterOrdensFinalizadas() || [];
        console.log('[carregarTabelaProdutos] Ordens finalizadas recebidas:', ordensFinalizadas.length);

        let filteredOPs = ordensFinalizadas.filter(op => op.status === 'finalizado');

        filteredOPs = filteredOPs.filter(op => 
            op.produto.toLowerCase().includes(search.toLowerCase()) || 
            (op.variante && op.variante.toLowerCase().includes(search.toLowerCase())) ||
            op.numero.toString().includes(search)
        );

        filteredOPsGlobal = filteredOPs;

        const totalItems = filteredOPs.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        const paginatedOPs = filteredOPs.slice(startIndex, endIndex);

        await atualizarTabela(paginatedOPs, totalPages);
    } catch (error) {
        console.error('[carregarTabelaProdutos] Erro ao carregar tabela:', error);
        const tbody = document.getElementById('produtosTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar produtos. Tente novamente.</td></tr>';
        }
    }
}

async function atualizarTabela(ordens, totalPages) {
    const tbody = document.getElementById('produtosTableBody');
    if (!tbody) {
        console.error('[atualizarTabela] Elemento #produtosTableBody não encontrado');
        return;
    }

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    ordens.forEach(op => {
        const tr = document.createElement('tr');
        tr.dataset.produto = op.produto;
        tr.dataset.variante = op.variante || '-';
        tr.innerHTML = `
            <td>${op.produto}</td>
            <td>${op.variante || '-'}</td>
            <td><div class="thumbnail"></div></td> <!-- Miniatura, a ser preenchida depois -->
            <td>${op.quantidade}</td>
            <td>${op.numero}</td>
        `;
        tr.addEventListener('click', () => handleProductClick(op));
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    // Paginação
    const paginationContainer = document.createElement('div');
    paginationContainer.id = 'paginationContainer';
    paginationContainer.className = 'pagination-container';

    let paginationHTML = '';
    if (totalPages > 1) {
        paginationHTML += `<button class="pagination-btn prev" data-page="${Math.max(1, currentPage - 1)}" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>`;
        paginationHTML += `<span class="pagination-current">Pág. ${currentPage} de ${totalPages}</span>`;
        paginationHTML += `<button class="pagination-btn next" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage === totalPages ? 'disabled' : ''}>Próximo</button>`;
    }

    paginationContainer.innerHTML = paginationHTML;
    const existingPagination = document.getElementById('paginationContainer');
    if (existingPagination) {
        existingPagination.replaceWith(paginationContainer);
    } else {
        tbody.parentElement.parentElement.appendChild(paginationContainer);
    }

    document.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page);
            filterProdutos(document.getElementById('searchProduto').value);
        });
    });

    console.log('[atualizarTabela] Tabela carregada com sucesso');
}

function filterProdutos(search) {
    currentPage = 1; // Reseta para a primeira página ao filtrar
    carregarTabelaProdutos(search);
}

function handleProductClick(op) {
    console.log(`[handleProductClick] Clicado em Produto: ${op.produto}, Variante: ${op.variante || '-'}, Qtd: ${op.quantidade}`);
    const mainView = document.getElementById('mainView');
    const embalagemView = document.getElementById('embalarView');
    if (mainView && embalagemView) {
        mainView.style.display = 'none';
        embalagemView.style.display = 'block';
        window.location.hash = '#embalar';
        localStorage.setItem('embalagemAtual', JSON.stringify({
            produto: op.produto,
            variante: op.variante || '-',
            quantidade: op.quantidade
        }));
        carregarEmbalagem(op.produto, op.variante || '-', op.quantidade);
    } else {
        console.error('[handleProductClick] mainView ou embalagemView não encontrados');
    }
}

// Atualizar a função carregarEmbalagem para incluir a aba Kit
async function carregarEmbalagem(produto, variante, quantidade) {
    console.log(`[carregarEmbalagem] Carregando para Produto: ${produto}, Variante: ${variante}, Qtd: ${quantidade}`);
    const embalagemTitle = document.getElementById('embalagemTitle');
    const produtoNome = document.getElementById('produtoNome');
    const varianteNome = document.getElementById('varianteNome');
    const qtdDisponivel = document.getElementById('qtdDisponivel');
    const qtdEnviar = document.getElementById('qtdEnviar');
    const estoqueBtn = document.getElementById('estoqueBtn');
    const embalagemThumbnail = document.getElementById('embalagemThumbnail');
    const kitTabBtn = document.querySelector('[data-tab="kit"]');
    const kitTabPanel = document.getElementById('kit-tab');
    const unidadeTabBtn = document.querySelector('[data-tab="unidade"]');
    const unidadeTabPanel = document.getElementById('unidade-tab');

    if (!embalagemTitle || !produtoNome || !varianteNome || !qtdDisponivel || !qtdEnviar || !estoqueBtn || !embalagemThumbnail || !kitTabBtn || !kitTabPanel || !unidadeTabBtn || !unidadeTabPanel) {
        console.error('[carregarEmbalagem] Um ou mais elementos DOM não foram encontrados');
        return;
    }

    const produtosCadastrados = await obterProdutos() || [];
    const produtoCadastrado = produtosCadastrados.find(p => p.nome === produto);
    const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === (variante === '-' ? '' : variante));
    const imagem = gradeItem?.imagem || '';
    embalagemThumbnail.innerHTML = imagem ? `<img src="${imagem}" alt="Imagem da variação ${variante}">` : '';

    embalagemTitle.textContent = `Como você deseja embalar a ${produto}${variante !== '-' ? `: ${variante}` : ''}?`;
    produtoNome.textContent = produto;
    varianteNome.textContent = variante !== '-' ? `: ${variante}` : '';
    qtdDisponivel.textContent = quantidade;
    qtdDisponivel.classList.remove('changing');
    qtdEnviar.value = '';
    estoqueBtn.disabled = true;

    const temKits = await temKitsDisponiveis(produto, variante);
    console.log(`[carregarEmbalagem] Produto ${produto} com variante ${variante} tem kits disponíveis? ${temKits}`);

    // Configuração das abas
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));

    if (temKits) {
        kitTabBtn.style.display = 'inline-block';
        kitTabPanel.classList.remove('hidden');
        kitTabBtn.classList.add('active'); // Ativa a aba "Kits" por padrão
        await carregarKitsDisponiveis(produto, variante); // Carrega os kits
        console.log('[carregarEmbalagem] Aba "Kits" ativada por padrão');
    } else {
        kitTabBtn.style.display = 'none';
        kitTabPanel.classList.add('hidden');
        unidadeTabBtn.classList.add('active'); // Ativa "Unidade" se não houver kits
        unidadeTabPanel.classList.remove('hidden');
        console.log('[carregarEmbalagem] Aba "Unidade" ativada por padrão (sem kits)');
    }

    // Configuração do botão "Estoque" para a aba "Unidade"
    const novoBotao = estoqueBtn.cloneNode(true);
    estoqueBtn.parentNode.replaceChild(novoBotao, estoqueBtn);
    const novoEstoqueBtn = document.getElementById('estoqueBtn');

    let quantidadeOriginal = quantidade;
    let isChanged = false;

    qtdEnviar.replaceWith(qtdEnviar.cloneNode(true));
    const newQtdEnviar = document.getElementById('qtdEnviar');

    newQtdEnviar.addEventListener('input', () => {
        const valor = parseInt(newQtdEnviar.value) || 0;
        console.log(`[carregarEmbalagem] Input Qtd Enviar alterado para: ${valor}`);

        if (valor >= 1 && valor <= quantidadeOriginal) {
            qtdDisponivel.textContent = quantidadeOriginal - valor;
            qtdDisponivel.classList.add('changing');
            novoEstoqueBtn.disabled = false;
            isChanged = true;
        } else {
            qtdDisponivel.textContent = quantidadeOriginal;
            qtdDisponivel.classList.remove('changing');
            novoEstoqueBtn.disabled = true;
            isChanged = false;
        }

        if (!newQtdEnviar.value) {
            qtdDisponivel.classList.remove('changing');
            isChanged = false;
        }
    });

    novoEstoqueBtn.addEventListener('click', async () => {
        const quantidadeEnviada = parseInt(newQtdEnviar.value);
        console.log(`[carregarEmbalagem] Botão Estoque clicado, Qtd Enviar: ${quantidadeEnviada}`);
        if (quantidadeEnviada < 1 || quantidadeEnviada > quantidadeOriginal) {
            console.warn('[carregarEmbalagem] Quantidade inválida detectada');
            alert('Quantidade inválida!');
            return;
        }

        await atualizarQuantidadeEmbalada(produto, variante, quantidadeEnviada);
        console.log(`[carregarEmbalagem] Salvando no estoque: Produto: ${produto}, Variante: ${variante}, Quantidade: ${quantidadeEnviada}`);
        await carregarTabelaProdutos();
        alert(`Enviado ${quantidadeEnviada} unidade(s) de ${produto}${variante !== '-' ? `: ${variante}` : ''} para o estoque!`);
        window.location.hash = '';
        localStorage.removeItem('embalagemAtual');
    });
}

// Atualizar a função alternarAba para destacar o kit ativo
async function alternarAba(event) {
    const tab = event.target.dataset.tab;
    console.log(`[alternarAba] Alternando para aba: ${tab}`);
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    const tabPanel = document.getElementById(`${tab}-tab`);
    if (tabPanel) {
        tabPanel.classList.remove('hidden');
        if (tab === 'kit') {
            const embalagemAtual = JSON.parse(localStorage.getItem('embalagemAtual'));
            if (embalagemAtual) {
                await carregarKitsDisponiveis(embalagemAtual.produto, embalagemAtual.variante);
            }
        }
    }
}

// Garantir que os eventos estejam corretamente configurados
async function inicializar(usuario, permissoes) {
    console.log('[inicializar] Inicializando a página com usuário:', usuario);

    // Carrega a tabela de produtos direto do banco de dados
    await carregarTabelaProdutos();

    const searchProduto = document.getElementById('searchProduto');
    if (searchProduto) {
        searchProduto.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            console.log(`[inicializar] Pesquisa alterada para: ${termo}`);
            const rows = document.querySelectorAll('#produtosTableBody tr');
            rows.forEach(row => {
                const produto = row.dataset.produto.toLowerCase();
                const variante = row.dataset.variante.toLowerCase();
                if (produto.includes(termo) || variante.includes(termo)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    const voltarBtn = document.getElementById('voltarBtn');
    if (voltarBtn) {
        voltarBtn.addEventListener('click', () => {
            console.log('[inicializar] Botão Voltar clicado');
            window.location.hash = '';
            localStorage.removeItem('embalagemAtual');
        });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', alternarAba);
    });

    window.addEventListener('hashchange', async () => {
        const hash = window.location.hash;
        console.log(`[inicializar] Hash alterado para: ${hash}`);
        const mainView = document.getElementById('mainView');
        const embalagemView = document.getElementById('embalarView');
        if (mainView && embalagemView) {
            if (hash === '#embalar') {
                mainView.style.display = 'none';
                embalagemView.style.display = 'block';
                const embalagemAtual = JSON.parse(localStorage.getItem('embalagemAtual'));
                if (embalagemAtual) {
                    await carregarEmbalagem(embalagemAtual.produto, embalagemAtual.variante, embalagemAtual.quantidade);
                }
            } else {
                mainView.style.display = 'block';
                embalagemView.style.display = 'none';
                await carregarTabelaProdutos();
            }
        }
    });

    const mainView = document.getElementById('mainView');
    const embalagemView = document.getElementById('embalarView');
    if (mainView && embalagemView) {
        if (window.location.hash === '#embalar') {
            mainView.style.display = 'none';
            embalagemView.style.display = 'block';
            const embalagemAtual = JSON.parse(localStorage.getItem('embalagemAtual'));
            if (embalagemAtual) {
                await carregarEmbalagem(embalagemAtual.produto, embalagemAtual.variante, embalagemAtual.quantidade);
            }
        } else {
            mainView.style.display = 'block';
            embalagemView.style.display = 'none';
        }
    }
    console.log('[inicializar] Inicialização concluída');
}

window.limparCache = function() {
    invalidateCache('ordensFinalizadas');
    invalidateCache('produtosCadastrados');
    console.log('[limparCache] Cache limpo');
    carregarTabelaProdutos(); // Recarrega a tabela
};