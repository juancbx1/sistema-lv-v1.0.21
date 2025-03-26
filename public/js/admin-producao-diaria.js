// js/pages/admin-producao-diaria.js
import { verificarAutenticacaoSincrona } from './utils/auth.js';
import { obterUsuarios } from './utils/storage.js';
import { criarGrafico } from './utils/chart-utils.js';

// Verificação de autenticação síncrona no topo do script
const auth = verificarAutenticacaoSincrona('producao-diaria.html', ['acesso-producao-diaria']);
if (!auth) {
    console.error('[admin-producao-diaria] Autenticação falhou. Usuário logado:', localStorage.getItem('usuarioLogado'));
    window.location.href = 'acesso-negado.html';
    throw new Error('Autenticação falhou, redirecionando para acesso-negado.html...');
}

const permissoes = auth.permissoes || [];
console.log('[admin-producao-diaria] Autenticação bem-sucedida, permissões:', permissoes);

// Funções para producao-diaria.html
let graficoDiario;
let costureiraSelecionada = null;
let costureiras = []; // Armazenar a lista de costureiras para uso global

function atualizarGraficoDiario() {
    console.log('[atualizarGraficoDiario] Atualizando gráfico diário...');
    const hoje = new Date(); // Usar a data atual do sistema
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const dataAtual = `${ano}-${mes}-${dia}`; // Formato YYYY-MM-DD

    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    console.log('[atualizarGraficoDiario] Produções carregadas:', producoes);

    // Filtrar produções do dia atual
    const producoesHoje = producoes.filter(p => {
        const dataProducao = new Date(p.data);
        const anoProd = dataProducao.getFullYear();
        const mesProd = String(dataProducao.getMonth() + 1).padStart(2, '0');
        const diaProd = String(dataProducao.getDate()).padStart(2, '0');
        return `${anoProd}-${mesProd}-${diaProd}` === dataAtual;
    });
    console.log('[atualizarGraficoDiario] Produções do dia atual:', producoesHoje);

    // Filtrar apenas produções de costureiras
    const nomesCostureiras = costureiras.map(c => c.nome);
    const producoesCostureiras = producoesHoje.filter(p => nomesCostureiras.includes(p.funcionario));
    console.log('[atualizarGraficoDiario] Produções de costureiras:', producoesCostureiras);

    // Agrupar produções por costureira
    const dados = {};
    producoesCostureiras.forEach(p => {
        const funcionario = p.funcionario || 'Desconhecido';
        if (!dados[funcionario]) dados[funcionario] = 0;
        dados[funcionario] += parseInt(p.quantidade) || 0;
    });
    console.log('[atualizarGraficoDiario] Dados agrupados por costureira:', dados);

    const labels = Object.keys(dados).length > 0 ? Object.keys(dados) : ['Nenhum dado'];
    const valores = Object.keys(dados).length > 0 ? Object.values(dados) : [0];

    if (graficoDiario) graficoDiario.destroy();
    const ctx = document.getElementById('graficoDiario')?.getContext('2d');
    if (!ctx) {
        console.error('[atualizarGraficoDiario] Elemento #graficoDiario não encontrado.');
        return;
    }

    graficoDiario = criarGrafico(
        ctx,
        'bar',
        labels,
        `Produção do Dia ${dataAtual}`,
        valores,
        'rgba(0, 184, 148, 0.2)',
        'rgba(0, 184, 148, 1)'
    );
    console.log('[atualizarGraficoDiario] Gráfico criado com labels:', labels, 'e valores:', valores);

    const tituloGrafico = document.getElementById('tituloGrafico');
    if (tituloGrafico) {
        const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const dataFormatada = `${dia}/${mes}/${ano} - ${diasSemana[hoje.getDay()]}`;
        tituloGrafico.textContent = `Produção do Dia ${dataFormatada}`;
    }
}

function carregarCostureirasButtons() {
    console.log('[carregarCostureirasButtons] Carregando botões das costureiras...');
    const container = document.getElementById('costureirasButtons');
    if (!container) {
        console.error('[carregarCostureirasButtons] Elemento #costureirasButtons não encontrado.');
        return;
    }

    const usuarios = obterUsuarios();
    costureiras = usuarios.filter(u => {
        const tipos = u.tipos && Array.isArray(u.tipos) ? u.tipos : (u.tipo ? [u.tipo] : []);
        return tipos.includes('costureira');
    });
    console.log('[carregarCostureirasButtons] Costureiras encontradas:', costureiras);

    container.innerHTML = '';
    costureiras.forEach(c => {
        const button = document.createElement('button');
        button.textContent = c.nome;
        button.dataset.nome = c.nome; // Usar nome em vez de email
        button.onclick = () => toggleCostureiraDetalhes(c.nome, button);
        container.appendChild(button);
    });

    // Selecionar a primeira costureira por padrão, se houver
    if (costureiras.length > 0) {
        const primeiroBotao = container.querySelector('button');
        toggleCostureiraDetalhes(costureiras[0].nome, primeiroBotao);
    }
}

function toggleCostureiraDetalhes(nome, button) {
    console.log(`[toggleCostureiraDetalhes] Toggling detalhes para costureira: ${nome}`);
    const detalhesContainer = document.getElementById('detalhesContainer');
    const buttons = document.querySelectorAll('.costureiras-buttons button');

    if (costureiraSelecionada === nome) {
        detalhesContainer.style.display = 'none';
        costureiraSelecionada = null;
        button.classList.remove('active');
    } else {
        costureiraSelecionada = nome;
        detalhesContainer.style.display = 'flex';
        buttons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        atualizarProducaoIndividual(nome);
    }
}

function atualizarProducaoIndividual(nome) {
    console.log(`[atualizarProducaoIndividual] Atualizando produção individual para: ${nome}`);
    const hoje = new Date(); // Usar a data atual do sistema
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const dataAtual = `${ano}-${mes}-${dia}`; // Formato YYYY-MM-DD

    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const produtos = JSON.parse(localStorage.getItem('produtos')) || [];
    const ordensDeProducao = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];

    const producoesHoje = producoes.filter(p => {
        const dataProducao = new Date(p.data);
        const anoProd = dataProducao.getFullYear();
        const mesProd = String(dataProducao.getMonth() + 1).padStart(2, '0');
        const diaProd = String(dataProducao.getDate()).padStart(2, '0');
        return p.funcionario === nome && `${anoProd}-${mesProd}-${diaProd}` === dataAtual;
    });
    console.log('[atualizarProducaoIndividual] Produções do funcionário no dia atual:', producoesHoje);

    const corpoTabela = document.getElementById('corpoTabelaIndividual');
    const totalProcessos = document.getElementById('totalProcessos');

    if (!corpoTabela || !totalProcessos) {
        console.error('[atualizarProducaoIndividual] Elementos #corpoTabelaIndividual ou #totalProcessos não encontrados.');
        return;
    }

    corpoTabela.innerHTML = '';
    let total = 0;

    producoesHoje.forEach(p => {
        // Buscar o produto correspondente
        const produtoInfo = produtos.find(prod => prod.nome === p.produto);

        // Buscar a máquina na propriedade 'etapas' do produto
        let maquina = 'N/A';
        if (produtoInfo && Array.isArray(produtoInfo.etapas)) {
            const etapa = produtoInfo.etapas.find(e => e.processo === p.processo);
            maquina = etapa && etapa.maquina ? etapa.maquina : 'N/A';
        }

        const horario = new Date(p.data).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // Buscar a variante associada à ordem de produção, se disponível
        const op = ordensDeProducao.find(o => o.numero === p.opNumero);
        const variante = p.variante || (op ? op.variante : 'N/A') || 'N/A';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.id || 'N/A'}</td>
            <td>${p.produto || 'N/A'}</td>
            <td>${variante}</td>
            <td>${p.processo || 'N/A'}/${maquina}</td>
            <td>${p.quantidade || 0}</td>
            <td>${p.lancadoPor || 'Desconhecido'}</td>
            <td>${horario}</td>
        `;
        corpoTabela.appendChild(tr);
        total += parseInt(p.quantidade) || 0;
    });

    totalProcessos.textContent = total;
    console.log('[atualizarProducaoIndividual] Total de processos:', total);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    console.log('[DOMContentLoaded] DOM carregado, inicializando página');
    carregarCostureirasButtons(); // Carregar costureiras primeiro para preencher a variável global
    atualizarGraficoDiario();
    setInterval(atualizarGraficoDiario, 60000);
});