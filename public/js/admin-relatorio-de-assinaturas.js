// js/pages/admin-relatorio-de-assinaturas.js
import { verificarAutenticacaoSincrona } from '/js/utils/auth.js';
import { obterUsuarios } from '/js/utils/storage.js';

// Verificação de autenticação síncrona no topo do script
const auth = verificarAutenticacaoSincrona('relatorio-de-assinaturas.html', ['acesso-relatorio-de-assinaturas']);
if (!auth) {
    window.location.href = 'acesso-negado.html'; // Redireciona para acesso-negado.html
    throw new Error('Autenticação falhou, redirecionando para acesso-negado.html...');
}

const permissoes = auth.permissoes || [];
console.log('[admin-relatorio-de-assinaturas] Autenticação bem-sucedida, permissões:', permissoes);

// Carrega o filtro de produtos
function carregarFiltroProdutos() {
    const selectProduto = document.getElementById('filtroProduto');
    if (!selectProduto) return;
    const produtos = JSON.parse(localStorage.getItem('produtos')) || [];
    selectProduto.innerHTML = '<option value="">Todos os Produtos</option>';
    const produtosUnicos = [...new Set(produtos.map(p => p.nome))]; // Evita duplicatas
    produtosUnicos.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        selectProduto.appendChild(option);
    });
}

// Carrega o filtro de costureiras
function carregarFiltroCostureiras() {
    const selectCostureira = document.getElementById('filtroCostureira');
    if (!selectCostureira) return;
    const usuarios = obterUsuarios();
    const costureiras = usuarios.filter(u => {
        const tipos = u.tipos && Array.isArray(u.tipos) ? u.tipos : (u.tipo ? [u.tipo] : []);
        return tipos.includes('costureira');
    });
    selectCostureira.innerHTML = '<option value="">Todas</option>';
    costureiras.forEach(c => {
        const option = document.createElement('option');
        option.value = c.email; // Usamos email como valor para filtrar
        option.textContent = c.nome; // Exibimos o nome
        selectCostureira.appendChild(option);
    });
}

// Carrega as assinaturas cadastradas
function carregarAssinaturasCadastradas() {
    const lista = document.getElementById('assinaturasLista');
    const filtroData = document.getElementById('filtroDataAssinatura')?.value || '';
    const filtroCostureira = document.getElementById('filtroCostureira')?.value || '';
    const filtroProduto = document.getElementById('filtroProduto')?.value || '';

    if (!lista) {
        console.error('Elemento #assinaturasLista não encontrado no DOM');
        return;
    }

    const assinaturas = JSON.parse(localStorage.getItem('assinaturas')) || [];
    const usuarios = obterUsuarios();

    let assinaturasFiltradas = assinaturas;
    if (filtroData) {
        assinaturasFiltradas = assinaturasFiltradas.filter(a => {
            const dataAssinatura = new Date(a.dataHora);
            const dataLocal = dataAssinatura.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                .split('/').reverse().join('-');
            return dataLocal === filtroData;
        });
    }
    if (filtroCostureira) {
        assinaturasFiltradas = assinaturasFiltradas.filter(a => a.costureira === filtroCostureira);
    }
    if (filtroProduto) {
        assinaturasFiltradas = assinaturasFiltradas.filter(a => {
            const producao = a.producoesAssinadas[0]; // Assume que todas as produções da assinatura são do mesmo produto
            return producao && producao.produto === filtroProduto;
        });
    }

    lista.innerHTML = '';
    if (assinaturasFiltradas.length === 0) {
        lista.innerHTML = '<p class="sem-assinaturas">Nenhuma assinatura encontrada para os filtros selecionados.</p>';
        return;
    }

    assinaturasFiltradas.forEach((assinatura, index) => {
        const costureira = usuarios.find(u => u.email === assinatura.costureira);
        const nomeCostureira = costureira ? costureira.nome : assinatura.costureira;

        const localizacao = typeof assinatura.localizacao === 'object' 
            ? `Lat: ${assinatura.localizacao.latitude}, Lon: ${assinatura.localizacao.longitude}`
            : assinatura.localizacao;

        const producoesLista = assinatura.producoesAssinadas.map(p => `
            <li>${p.produto} - ${p.processo} (${p.quantidade} un., ${new Date(p.dataProducao).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })})</li>
        `).join('');

        const card = document.createElement('div');
        card.className = 'assinatura-card';
        card.innerHTML = `
            <div class="assinatura-info">
                <p><span>ID:</span> ${assinatura.id}</p>
                <p><span>Costureira:</span> ${nomeCostureira}</p>
                <p><span>Data e Hora:</span> ${new Date(assinatura.dataHora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                <p><span>Dispositivo:</span> ${assinatura.dispositivo}</p>
                <p><span>Localização:</span> ${localizacao}</p>
                <p><span>Processos:</span></p>
                <ul>${producoesLista}</ul>
            </div>
            <button class="btn-excluir" data-index="${index}">Excluir</button>
        `;
        lista.appendChild(card);
    });

    document.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            excluirAssinatura(index);
        });
    });
}

// Exclui uma assinatura e reverte as produções associadas
function excluirAssinatura(index) {
    const confirmacao = confirm("Tem certeza que deseja excluir esta assinatura? As produções voltarão para 'não assinadas'.");
    if (!confirmacao) return;

    const assinaturas = JSON.parse(localStorage.getItem('assinaturas')) || [];
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const assinaturaExcluida = assinaturas[index];

    assinaturaExcluida.producoesAssinadas.forEach(assinaturaProd => {
        const producao = producoes.find(p => p.id === assinaturaProd.idProducao);
        if (producao) {
            producao.assinada = false;
            delete producao.dataAssinatura;
        }
    });

    assinaturas.splice(index, 1);
    localStorage.setItem('assinaturas', JSON.stringify(assinaturas));
    localStorage.setItem('producoes', JSON.stringify(producoes));
    carregarAssinaturasCadastradas();
}

// Define a data atual como padrão no filtro
function definirDataAtual() {
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        .split('/').reverse().join('-');
    document.getElementById('filtroDataAssinatura').value = hoje;
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    console.log('[DOMContentLoaded] DOM carregado, inicializando página');
    definirDataAtual();
    carregarFiltroCostureiras();
    carregarFiltroProdutos();
    carregarAssinaturasCadastradas();
    document.getElementById('filtroDataAssinatura')?.addEventListener('change', carregarAssinaturasCadastradas);
    document.getElementById('filtroCostureira')?.addEventListener('change', carregarAssinaturasCadastradas);
    document.getElementById('filtroProduto')?.addEventListener('change', carregarAssinaturasCadastradas);
});