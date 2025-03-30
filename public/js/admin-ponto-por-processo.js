import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterProdutos, salvarProdutos } from '/js/utils/storage.js';

// Cache local
let produtosCache = null;

(async () => {
    const auth = await verificarAutenticacao('ponto-por-processo.html', ['acesso-ponto-por-processo']);
    if (!auth) {
        console.log('Autenticação falhou, redirecionamento já ocorreu.');
        return;
    }

    const permissoes = auth.permissoes || [];
    const usuarioLogado = auth.usuario;
    console.log('Inicializando ponto-por-processo para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);

    async function carregarProdutos(forceRefresh = false) {
        console.log('Função carregarProdutos chamada, forceRefresh:', forceRefresh);
        try {
            if (!forceRefresh && produtosCache) {
                console.log('Usando cache local de produtos');
                renderizarProdutos(produtosCache);
                return;
            }

            const produtos = await obterProdutos();
            produtosCache = produtos;
            renderizarProdutos(produtos);
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            document.getElementById('produtosContainer').innerHTML = '<p>Erro ao carregar produtos. Tente novamente mais tarde.</p>';
        }
    }

    function renderizarProdutos(produtos) {
        const container = document.getElementById('produtosContainer');
        if (!container) {
            console.error('Elemento produtosContainer não encontrado no DOM');
            return;
        }

        console.log('Produtos para renderizar:', produtos);
        container.innerHTML = '';

        if (!Array.isArray(produtos) || produtos.length === 0) {
            container.innerHTML = '<p>Nenhum produto cadastrado ainda.</p>';
            console.log('Nenhum produto para exibir');
            return;
        }

        produtos.forEach(produto => {
            console.log('Renderizando card para produto:', produto.nome);
            const card = document.createElement('div');
            card.className = 'produto-card';

            const title = document.createElement('h3');
            title.textContent = produto.nome;
            card.appendChild(title);

            const processosContainer = document.createElement('div');
            processosContainer.className = 'processos-container';

            let processos = produto.processos || produto.etapas || [];
            if (!Array.isArray(processos) || processos.length === 0) {
                console.warn('Produto sem processos ou etapas:', produto.nome);
                processosContainer.innerHTML = '<p>Nenhum processo/etapa definido.</p>';
            } else {
                processos.forEach((processo, index) => {
                    const processoDiv = document.createElement('div');
                    processoDiv.className = 'processo-item';

                    let processoNome = typeof processo === 'object' && processo !== null ? processo.processo || `Processo ${index + 1}` : processo;
                    const label = document.createElement('label');
                    label.textContent = processoNome;
                    processoDiv.appendChild(label);

                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = '0.1';
                    input.step = '0.1';
                    const pontosExpirados = produto.pontos_expiracao && new Date(produto.pontos_expiracao) < new Date();
                    input.value = pontosExpirados ? 1 : (produto.pontos && produto.pontos[index]) || 1;
                    input.dataset.processoIndex = index;
                    processoDiv.appendChild(input);

                    processosContainer.appendChild(processoDiv);
                });
            }
            card.appendChild(processosContainer);

            // Campo de Duração
            const duracaoContainer = document.createElement('div');
            duracaoContainer.className = 'duracao-container';

            const duracaoLabel = document.createElement('label');
            duracaoLabel.textContent = 'Expiração dos Pontos:';
            duracaoContainer.appendChild(duracaoLabel);

            const duracaoInput = document.createElement('input');
            duracaoInput.type = 'datetime-local';
            if (produto.pontos_expiracao) {
                const expiracaoLocal = new Date(produto.pontos_expiracao);
                duracaoInput.value = expiracaoLocal.toLocaleString('sv').replace(' ', 'T').slice(0, 16);
            }
            duracaoContainer.appendChild(duracaoInput);

            // Contador de Tempo Restante
            const tempoRestante = document.createElement('span');
            tempoRestante.className = 'tempo-restante';
            if (produto.pontos_expiracao) {
                atualizarTempoRestante(tempoRestante, produto.pontos_expiracao);
                setInterval(() => atualizarTempoRestante(tempoRestante, produto.pontos_expiracao), 1000);
            }
            duracaoContainer.appendChild(tempoRestante);

            card.appendChild(duracaoContainer);

            const saveButton = document.createElement('button');
            saveButton.textContent = 'Salvar';
            saveButton.onclick = () => salvarPontos(produto.nome, processosContainer, duracaoInput.value);
            card.appendChild(saveButton);

            container.appendChild(card);
        });
    }

    function atualizarTempoRestante(elemento, expiracao) {
        const agora = new Date();
        const prazo = new Date(expiracao);
        const diffMs = prazo - agora;

        if (diffMs <= 0) {
            elemento.textContent = 'Expirado';
            elemento.style.color = '#e74c3c';
        } else {
            const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const segundos = Math.floor((diffMs % (1000 * 60)) / 1000);
            elemento.textContent = `Faltam ${dias}d ${horas}h ${minutos}m ${segundos}s`;
            elemento.style.color = diffMs < 3600000 ? '#e74c3c' : '#2ecc71';
        }
    }

    async function salvarPontos(nomeProduto, processosContainer, duracao) {
        try {
            if (!produtosCache) {
                await carregarProdutos(true);
            }

            const produto = produtosCache.find(p => p.nome === nomeProduto);
            if (!produto) {
                console.error('Produto não encontrado para salvar pontos:', nomeProduto);
                return;
            }

            const inputs = processosContainer.querySelectorAll('input');
            const pontos = Array.from(inputs).map(input => parseFloat(input.value) || 1);
            produto.pontos = pontos;

            // Salvar data de criação e expiração
            const agora = new Date();
            produto.pontos_criacao = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
            if (duracao) {
                const dataLocal = new Date(duracao);
                produto.pontos_expiracao = `${dataLocal.getFullYear()}-${String(dataLocal.getMonth() + 1).padStart(2, '0')}-${String(dataLocal.getDate()).padStart(2, '0')} ${String(dataLocal.getHours()).padStart(2, '0')}:${String(dataLocal.getMinutes()).padStart(2, '0')}:${String(dataLocal.getSeconds()).padStart(2, '0')}`;
            } else {
                produto.pontos_expiracao = null;
            }

            await salvarProdutos(produtosCache);
            console.log('Pontos e expiração salvos para', nomeProduto, 'Pontos:', pontos, 'Criação:', produto.pontos_criacao, 'Expiração:', produto.pontos_expiracao);
            alert(`Pontos e expiração salvos para ${nomeProduto}!`);
            await carregarProdutos(true); // Refresh após salvar
        } catch (error) {
            console.error('Erro ao salvar pontos:', error);
            alert('Erro ao salvar pontos. Tente novamente.');
        }
    }

    await carregarProdutos();

    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM carregado, evitando chamadas adicionais');
    }, { once: true });
})();

window.onerror = function(message, source, lineno, colno, error) {
    console.error('Erro no script:', { message, source, line: lineno, column: colno, error });
};