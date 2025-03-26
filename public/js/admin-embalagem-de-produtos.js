// js/pages/admin-embalagem-de-produtos.js
import { verificarAutenticacaoSincrona } from './utils/auth.js';
import { obterUsuarios, obterProdutos } from './utils/storage.js';

// Verificação de autenticação síncrona no topo do script
const auth = verificarAutenticacaoSincrona('embalagem-de-produtos.html', ['acesso-embalagem-de-produtos']);
if (!auth) {
    window.location.href = 'acesso-negado.html';
    throw new Error('Autenticação falhou, redirecionando para acesso-negado.html...');
}

const permissoes = auth.permissoes || [];
console.log('[admin-embalagem-de-produtos] Autenticação bem-sucedida, permissões:', permissoes);

// Função para verificar se há kits disponíveis para a variação
function temKitsDisponiveis(produto, variante) {
    const produtosCadastrados = obterProdutos() || [];
    console.log('[temKitsDisponiveis] Todos os produtos cadastrados:', produtosCadastrados);

    const kits = produtosCadastrados.filter(p => p.isKit);
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
                // Se o campo 'produto' não existir, assume-se que é o produto base (parâmetro 'produto')
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


// Função para carregar os kits disponíveis
function carregarKitsDisponiveis(produto, variante) {
    const produtosCadastrados = obterProdutos() || [];
    const kitsList = document.getElementById('kits-list');
    kitsList.innerHTML = '';

    console.log('[carregarKitsDisponiveis] Produtos cadastrados:', produtosCadastrados);

    if (!produto || !variante) {
        kitsList.innerHTML = '<p>Selecione um produto e variação para ver os kits disponíveis.</p>';
        return;
    }

    const varianteNormalizada = variante === '-' ? '' : variante.toLowerCase();
    console.log(`[carregarKitsDisponiveis] Filtrando kits para Produto: ${produto}, Variante: ${varianteNormalizada}`);

    const kitsFiltrados = produtosCadastrados.filter(kit => {
        if (!kit.isKit || !kit.grade) return false;

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
            carregarVariacoesKit(kit.nome, produto, variante); // Passa produto e variante
        });
        kitsList.appendChild(button);
    });

    if (kitsList.children.length > 0) {
        kitsList.children[0].classList.add('active');
        carregarVariacoesKit(kitsFiltrados[0].nome, produto, variante); // Passa produto e variante
    }
}

// Função para carregar as variações de um kit específico
function carregarVariacoesKit(nomeKit, produto, variante) {
    const produtosCadastrados = obterProdutos() || [];
    const kitVariacoesSelect = document.getElementById('kit-variacoes');
    if (!kitVariacoesSelect) {
        console.error('[carregarVariacoesKit] Elemento #kit-variacoes não encontrado no DOM');
        return;
    }
    kitVariacoesSelect.innerHTML = '<option value="">Selecione uma variação</option>';

    console.log(`[carregarVariacoesKit] Filtrando variações do kit ${nomeKit} para Produto: ${produto}, Variante: ${variante}`);

    const kit = produtosCadastrados.find(p => p.isKit && p.nome === nomeKit);
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

    // Adicionar evento ao select
    kitVariacoesSelect.addEventListener('change', () => {
        const variacaoSelecionada = kitVariacoesSelect.value;
        if (variacaoSelecionada) {
            console.log(`[carregarVariacoesKit] Variação selecionada: ${variacaoSelecionada}`);
            carregarTabelaKit(nomeKit, variacaoSelecionada, variante);
        }
    });

    // Carregar automaticamente a primeira variação
    if (variacoesFiltradas.length > 0) {
        kitVariacoesSelect.value = variacoesFiltradas[0].variacao;
        carregarTabelaKit(nomeKit, variacoesFiltradas[0].variacao, variante);
    }
}


// Função para carregar a mini tabela do kit selecionado
function carregarTabelaKit(kitNome, variacao, varianteAtual) {
    const produtosCadastrados = obterProdutos() || [];
    const kit = produtosCadastrados.find(p => p.nome === kitNome);
    const kitTableBody = document.getElementById('kit-table-body');
    const kitErrorMessage = document.getElementById('kit-error-message');
    kitTableBody.innerHTML = '';
    kitErrorMessage.classList.add('hidden');

    const variacaoKit = kit.grade.find(g => g.variacao === variacao);
    const composicao = variacaoKit.composicao || [];

    if (composicao.length === 0) {
        kitErrorMessage.textContent = 'Este kit não possui composição definida.';
        kitErrorMessage.classList.remove('hidden');
        return;
    }

    const ordensFinalizadas = obterOrdensFinalizadas();
    const produtosAgrupados = {};
    ordensFinalizadas.forEach(op => {
        const chave = `${op.produto}:${op.variante || '-'}`;
        if (!produtosAgrupados[chave]) {
            produtosAgrupados[chave] = obterQuantidadeDisponivelAjustada(op.produto, op.variante || '-', obterQuantidadeDisponivel(op));
        } else {
            produtosAgrupados[chave] += obterQuantidadeDisponivelAjustada(op.produto, op.variante || '-', obterQuantidadeDisponivel(op));
        }
    });

    const varianteAtualNormalizada = varianteAtual === '-' ? '' : varianteAtual;
    let menorQuantidadePossivel = Infinity;

    const embalagemAtual = JSON.parse(localStorage.getItem('embalagemAtual'));
    const produtoBase = embalagemAtual ? embalagemAtual.produto : 'Scrunchie (Padrão)';

    composicao.forEach(item => {
        const chave = `${produtoBase}:${item.variacao}`;
        let qtdDisponivel = produtosAgrupados[chave] || 0;

        if (item.variacao === varianteAtualNormalizada) {
            qtdDisponivel = embalagemAtual ? embalagemAtual.quantidade : qtdDisponivel;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.variacao} (${item.quantidade})</td>
            <td><input type="number" class="readonly" value="${qtdDisponivel}" readonly></td>
        `;
        kitTableBody.appendChild(tr);

        const qtdPossivel = Math.floor(qtdDisponivel / item.quantidade);
        menorQuantidadePossivel = Math.min(menorQuantidadePossivel, qtdPossivel);
    });

    const kitFooter = document.getElementById('kit-footer');
    kitFooter.innerHTML = `
        <div class="qtd-disponivel-container">
            <p>Qtd Disponível: <span id="qtd-disponivel-kits">${menorQuantidadePossivel}</span></p>
        </div>
        <div class="qtd-enviar-container">
            <label>Quantidade a enviar: 
                <input type="number" id="qtd-enviar-kits" min="0" max="${menorQuantidadePossivel}" value="0">
            </label>
            <button id="kit-estoque-btn">Estoque</button>
        </div>
    `;

    const qtdEnviarKits = document.getElementById('qtd-enviar-kits');
    const kitEstoqueBtn = document.getElementById('kit-estoque-btn');
    kitEstoqueBtn.disabled = true;

    qtdEnviarKits.addEventListener('input', () => {
        let qtdInformada = parseInt(qtdEnviarKits.value) || 0;
        if (qtdInformada > menorQuantidadePossivel) {
            qtdEnviarKits.value = menorQuantidadePossivel;
            qtdInformada = menorQuantidadePossivel;
        }
        if (qtdInformada <= 0) {
            kitErrorMessage.classList.add('hidden');
            kitEstoqueBtn.disabled = true;
        } else {
            kitErrorMessage.classList.add('hidden');
            kitEstoqueBtn.disabled = false;
        }
    });

    kitEstoqueBtn.addEventListener('click', () => {
        const qtdKits = parseInt(qtdEnviarKits.value) || 0;
        if (qtdKits > 0 && qtdKits <= menorQuantidadePossivel) {
            enviarKitParaEstoque(kitNome, variacao, qtdKits);
        }
    });

    document.getElementById('kit-table-container').classList.remove('hidden');
}


// Função para enviar o kit ao estoque
function enviarKitParaEstoque(kitNome, variacao, qtdKits) {
    const produtosCadastrados = obterProdutos() || [];
    const kit = produtosCadastrados.find(p => p.nome === kitNome);
    const variacaoKit = kit.grade.find(g => g.variacao === variacao);
    const composicao = variacaoKit.composicao || [];

    composicao.forEach(item => {
        const qtdTotal = qtdKits * item.quantidade;
        atualizarQuantidadeEmbalada(kitNome.split(' ')[1], item.variacao, qtdTotal);
    });

    carregarTabelaProdutos();
    alert(`Enviado ${qtdKits} kit(s) de ${kitNome} - ${variacao} para o estoque!`);
    window.location.hash = '';
    localStorage.removeItem('embalagemAtual');
}

// Funções auxiliares
function obterOrdensFinalizadas() {
    const ordensDeProducao = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
    console.log('[obterOrdensFinalizadas] Ordens finalizadas encontradas:', ordensDeProducao.length);
    return ordensDeProducao.filter(op => op.status === 'finalizado');
}

function obterQuantidadeDisponivel(op) {
    const ultimaEtapa = op.etapas[op.etapas.length - 1];
    const qtd = ultimaEtapa && ultimaEtapa.quantidade ? parseInt(ultimaEtapa.quantidade) : 0;
    console.log(`[obterQuantidadeDisponivel] Produto: ${op.produto}, Variante: ${op.variante || '-'}, Qtd: ${qtd}`);
    return qtd;
}

function atualizarQuantidadeEmbalada(produto, variante, quantidadeEnviada) {
    let embalagens = JSON.parse(localStorage.getItem('embalagens')) || {};
    const chave = `${produto}:${variante}`;
    if (!embalagens[chave]) {
        embalagens[chave] = { produto, variante, quantidadeEmbalada: 0 };
    }
    embalagens[chave].quantidadeEmbalada += quantidadeEnviada;
    console.log(`[atualizarQuantidadeEmbalada] Produto: ${produto}, Variante: ${variante}, Quantidade Embalada Atualizada: ${embalagens[chave].quantidadeEmbalada}`);
    localStorage.setItem('embalagens', JSON.stringify(embalagens));
}

function obterQuantidadeDisponivelAjustada(produto, variante, quantidadeOriginal) {
    const embalagens = JSON.parse(localStorage.getItem('embalagens')) || {};
    const chave = `${produto}:${variante}`;
    const quantidadeEmbalada = embalagens[chave]?.quantidadeEmbalada || 0;
    const qtdAjustada = quantidadeOriginal - quantidadeEmbalada;
    console.log(`[obterQuantidadeDisponivelAjustada] Produto: ${produto}, Variante: ${variante}, Original: ${quantidadeOriginal}, Embalada: ${quantidadeEmbalada}, Ajustada: ${qtdAjustada}`);
    return Math.max(0, qtdAjustada); // Garantir que não retorne valores negativos
}

function carregarTabelaProdutos() {
    console.log('[carregarTabelaProdutos] Iniciando carregamento da tabela');
    const ordensFinalizadas = obterOrdensFinalizadas();
    const produtosAgrupados = {};
    const produtosCadastrados = JSON.parse(localStorage.getItem('produtos')) || [];

    ordensFinalizadas.forEach(op => {
        const produto = op.produto;
        const variante = op.variante || '-';
        const qtdOriginal = obterQuantidadeDisponivel(op);
        const qtdAjustada = obterQuantidadeDisponivelAjustada(produto, variante, qtdOriginal);

        if (qtdAjustada > 0) {
            const chave = `${produto}:${variante}`;
            if (!produtosAgrupados[chave]) {
                produtosAgrupados[chave] = {
                    produto,
                    variante,
                    quantidade: 0,
                    opNumeros: new Set()
                };
            }
            produtosAgrupados[chave].quantidade += qtdOriginal;
            produtosAgrupados[chave].opNumeros.add(op.numero);
        }
    });

    const tbody = document.getElementById('produtosTableBody');
    if (!tbody) {
        console.error('[carregarTabelaProdutos] Elemento #produtosTableBody não encontrado');
        return;
    }
    tbody.innerHTML = '';
    console.log('[carregarTabelaProdutos] Tabela limpa, populando com:', Object.values(produtosAgrupados));

    Object.values(produtosAgrupados).forEach(item => {
        const qtdAjustada = obterQuantidadeDisponivelAjustada(item.produto, item.variante, item.quantidade);
        const opNumerosString = Array.from(item.opNumeros).join(', ');
        const produtoCadastrado = produtosCadastrados.find(p => p.nome === item.produto);
        const gradeItem = produtoCadastrado?.grade?.find(g => g.variacao === item.variante);
        const imagem = gradeItem?.imagem || '';

        const tr = document.createElement('tr');
        tr.dataset.produto = item.produto;
        tr.dataset.variante = item.variante;
        tr.innerHTML = `
            <td>${item.produto}</td>
            <td>${item.variante}</td>
            <td><div class="thumbnail">${imagem ? `<img src="${imagem}" alt="Imagem da variação ${item.variante}">` : ''}</div></td>
            <td>${qtdAjustada}</td>
            <td>${opNumerosString}</td>
        `;
        tr.addEventListener('click', () => {
            console.log(`[carregarTabelaProdutos] Clicado em Produto: ${item.produto}, Variante: ${item.variante}, Qtd: ${qtdAjustada}`);
            const mainView = document.getElementById('mainView');
            const embalagemView = document.getElementById('embalarView');
            if (mainView && embalagemView) {
                mainView.style.display = 'none';
                embalagemView.style.display = 'block';
                window.location.hash = '#embalar';
                localStorage.setItem('embalagemAtual', JSON.stringify({
                    produto: item.produto,
                    variante: item.variante,
                    quantidade: qtdAjustada
                }));
                carregarEmbalagem(item.produto, item.variante, qtdAjustada);
            } else {
                console.error('[carregarTabelaProdutos] mainView ou embalagemView não encontrados');
            }
        });
        tbody.appendChild(tr);
    });
    console.log('[carregarTabelaProdutos] Tabela carregada com sucesso');
}

// Atualizar a função carregarEmbalagem para incluir a aba Kit
function carregarEmbalagem(produto, variante, quantidade) {
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

    if (!embalagemTitle || !produtoNome || !varianteNome || !qtdDisponivel || !qtdEnviar || !estoqueBtn || !embalagemThumbnail || !kitTabBtn || !kitTabPanel) {
        console.error('[carregarEmbalagem] Um ou mais elementos DOM não foram encontrados');
        return;
    }

    const produtosCadastrados = obterProdutos() || [];
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

    const temKits = temKitsDisponiveis(produto, variante);
    if (temKits) {
        kitTabBtn.style.display = 'inline-block';
        kitTabPanel.classList.remove('hidden');
    } else {
        kitTabBtn.style.display = 'none';
        kitTabPanel.classList.add('hidden');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-tab="unidade"]').classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
        document.getElementById('unidade-tab').classList.remove('hidden');
    }

    const novoBotao = estoqueBtn.cloneNode(true);
    estoqueBtn.parentNode.replaceChild(novoBotao, estoqueBtn);
    const novoEstoqueBtn = document.getElementById('estoqueBtn');

    const unidadeTab = document.getElementById('unidade-tab');
    if (unidadeTab) {
        if (temKits) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector('[data-tab="unidade"]').classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
            unidadeTab.classList.remove('hidden');
            console.log('[carregarEmbalagem] Aba Unidade ativada');
        }
    }

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

    novoEstoqueBtn.addEventListener('click', () => {
        const quantidadeEnviada = parseInt(newQtdEnviar.value);
        console.log(`[carregarEmbalagem] Botão Estoque clicado, Qtd Enviar: ${quantidadeEnviada}`);
        if (quantidadeEnviada < 1 || quantidadeEnviada > quantidadeOriginal) {
            console.warn('[carregarEmbalagem] Quantidade inválida detectada');
            alert('Quantidade inválida!');
            return;
        }

        atualizarQuantidadeEmbalada(produto, variante, quantidadeEnviada);
        console.log(`[carregarEmbalagem] Salvando no estoque: Produto: ${produto}, Variante: ${variante}, Quantidade: ${quantidadeEnviada}`);
        carregarTabelaProdutos();
        alert(`Enviado ${quantidadeEnviada} unidade(s) de ${produto}${variante !== '-' ? `: ${variante}` : ''} para o estoque!`);
        console.log('[carregarEmbalagem] Processo concluído, retornando à tela principal');
        window.location.hash = '';
        localStorage.removeItem('embalagemAtual');
    });

    if (temKits) {
        carregarKitsDisponiveis(produto, variante);
    }
}

// Atualizar a função alternarAba para destacar o kit ativo
function alternarAba(event) {
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
                carregarKitsDisponiveis(embalagemAtual.produto, embalagemAtual.variante);
            }
        }
    }
}

// Garantir que os eventos estejam corretamente configurados
function inicializar() {
    console.log('[inicializar] Inicializando a página');
    carregarTabelaProdutos();

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

    window.addEventListener('hashchange', () => {
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
                    carregarEmbalagem(embalagemAtual.produto, embalagemAtual.variante, embalagemAtual.quantidade);
                }
            } else {
                mainView.style.display = 'block';
                embalagemView.style.display = 'none';
                carregarTabelaProdutos();
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
                carregarEmbalagem(embalagemAtual.produto, embalagemAtual.variante, embalagemAtual.quantidade);
            }
        } else {
            mainView.style.display = 'block';
            embalagemView.style.display = 'none';
        }
    }
    console.log('[inicializar] Inicialização concluída');
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('[DOMContentLoaded] DOM carregado, inicializando página');
    inicializar();
});