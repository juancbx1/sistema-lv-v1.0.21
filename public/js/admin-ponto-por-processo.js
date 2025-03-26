// js/pages/admin-ponto-por-processo.js
import { verificarAutenticacaoSincrona } from './utils/auth.js';
import { obterProdutos, salvarProdutos } from './utils/storage.js';


// Verificação de Autenticação
const auth = verificarAutenticacaoSincrona('ponto-por-processo.html', ['acesso-ponto-por-processo']);
if (!auth) {
    throw new Error('Autenticação falhou, redirecionando...');
}

const permissoes = auth.permissoes || [];
const usuarioLogado = auth.usuario;
console.log('Inicializando relatorio-de-comissao para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);




function carregarProdutos() {
    console.log('Função carregarProdutos chamada'); // Verifica se a função é executada
    const produtos = obterProdutos();
    const container = document.getElementById('produtosContainer');
    
    if (!container) {
        console.error('Elemento produtosContainer não encontrado no DOM');
        return;
    }

    console.log('Produtos encontrados no localStorage:', produtos); // Log dos produtos
    container.innerHTML = '';

    if (produtos.length === 0) {
        container.innerHTML = '<p>Nenhum produto cadastrado ainda.</p>';
        console.log('Nenhum produto para exibir');
        return;
    }

    produtos.forEach(produto => {
        console.log('Renderizando card para produto:', produto.nome); // Log por produto
        const card = document.createElement('div');
        card.className = 'produto-card';
        
        const title = document.createElement('h3');
        title.textContent = produto.nome;
        card.appendChild(title);

        const processosContainer = document.createElement('div');
        processosContainer.className = 'processos-container';

        produto.processos.forEach((processo, index) => {
            const processoDiv = document.createElement('div');
            processoDiv.className = 'processo-item';

            const label = document.createElement('label');
            label.textContent = processo;
            processoDiv.appendChild(label);

            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0.1';
            input.step = '0.1';
            input.value = produto.pontos?.[index] || 1; // Padrão 1 se não houver pontos
            input.dataset.processoIndex = index;
            processoDiv.appendChild(input);

            processosContainer.appendChild(processoDiv);
        });

        card.appendChild(processosContainer);

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Salvar';
        saveButton.onclick = () => salvarPontos(produto.nome, processosContainer);
        card.appendChild(saveButton);

        container.appendChild(card);
    });
}

function salvarPontos(nomeProduto, processosContainer) {
    const produtos = obterProdutos();
    const produto = produtos.find(p => p.nome === nomeProduto);
    if (!produto) {
        console.error('Produto não encontrado para salvar pontos:', nomeProduto);
        return;
    }

    const inputs = processosContainer.querySelectorAll('input');
    const pontos = Array.from(inputs).map(input => parseFloat(input.value) || 1);
    produto.pontos = pontos;

    salvarProdutos(produtos);
    console.log('Pontos salvos para', nomeProduto, 'Pontos:', pontos);
    alert(`Pontos salvos para ${nomeProduto}!`);
}

// Chama carregarProdutos diretamente, pois o script é carregado dinamicamente após o DOM estar pronto
carregarProdutos();