import { verificarAutenticacao } from '../js/utils/auth.js';
import { obterUsuarios } from '../js/utils/storage.js';
import { criarGrafico } from '../js/utils/chart-utils.js';

// Funções para public/admin/home.html
let grafico;
let graficoTempoReal;

function atualizarGrafico() {
    const filtroCostureira = document.getElementById('filtroCostureira');
    if (!filtroCostureira) return;
    const filtro = filtroCostureira.value;
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const hoje = new Date().toISOString().split('T')[0];

    const producoesHoje = producoes.filter(p => p.data.startsWith(hoje));
    const dados = {};

    producoesHoje.forEach(p => {
        if (!filtro || p.costureira === filtro) {
            if (!dados[p.costureira]) dados[p.costureira] = 0;
            dados[p.costureira] += p.quantidade;
        }
    });

    const labels = Object.keys(dados);
    const valores = Object.values(dados);

    if (window.grafico) window.grafico.destroy();
    const ctx = document.getElementById('graficoProducao');
    if (!ctx) return;

    window.grafico = criarGrafico(
        ctx, 'bar', labels.map(email => {
            const user = obterUsuarios().find(u => u.email === email);
            return user ? user.nome : email;
        }), 'Processos Hoje', valores,
        'rgba(75, 192, 192, 0.2)', 'rgba(75, 192, 192, 1)'
    );
}

function atualizarGraficoTempoReal() {
    const hoje = new Date().toISOString().split('T')[0];
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const usuarios = obterUsuarios();
    const producoesHoje = producoes.filter(p => p.data.startsWith(hoje));

    const dados = {};
    producoesHoje.forEach(p => {
        if (!dados[p.costureira]) dados[p.costureira] = 0;
        dados[p.costureira] += p.quantidade;
    });

    const labels = Object.keys(dados).map(email => {
        const user = usuarios.find(u => u.email === email);
        return user ? user.nome : email;
    });
    const valores = Object.values(dados);

    if (graficoTempoReal) graficoTempoReal.destroy();
    const ctx = document.getElementById('graficoProducaoTempoReal');
    if (!ctx) return;

    graficoTempoReal = criarGrafico(
        ctx, 'bar', labels, `Processos Hoje (${hoje})`, valores,
        'rgba(52, 152, 219, 0.6)', 'rgba(52, 152, 219, 1)'
    );
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Verifica autenticação
    const auth = verificarAutenticacao('home.html', []); // Não requer permissões de ação, apenas acesso à página
    if (!auth) {
        return; // Redireciona se não autenticado
    }

    // Obtém o usuário logado e permissões
    const usuarioLogado = auth.usuario;
    const permissoes = auth.permissoes || [];
    console.log('Inicializando home para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);

    // Atualiza o nome do administrador no DOM
    const nomeAdmin = document.getElementById('nomeAdmin');
    if (nomeAdmin && usuarioLogado) {
        nomeAdmin.textContent = usuarioLogado.nome;
    }

    // Executa a lógica da página
    atualizarGrafico();
    atualizarGraficoTempoReal();
    setInterval(atualizarGraficoTempoReal, 60000);
});