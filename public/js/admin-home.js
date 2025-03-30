import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterUsuarios } from '/js/utils/storage.js';
import { criarGrafico } from '/js/utils/chart-utils.js';

// Registra o plugin datalabels explicitamente
import ChartDataLabels from 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2/+esm';
Chart.register(ChartDataLabels);

let grafico;
let graficoTempoReal;

// Lista de páginas disponíveis com suas permissões necessárias
const paginasDisponiveis = [
    { href: "ordens-de-producao.html", texto: "Ordens de Produção", permissao: "acesso-ordens-de-producao" },
    { href: "relatorio-de-comissao.html", texto: "Ver Relatório de Comissão", permissao: "acesso-relatorio-de-comissao" },
    { href: "producao-diaria.html", texto: "Ver Produção Diária", permissao: "acesso-producao-diaria" },
    { href: "embalagem-de-produtos.html", texto: "Embalagem de Produtos", permissao: "acesso-embalagem-de-produtos" },
    { href: "gerenciar-producao.html", texto: "Gerenciar Produção", permissao: "acesso-gerenciar-producao" }
];

// Função para selecionar 3 páginas aleatórias permitidas
function gerarLinksAleatorios(permissoesUsuario) {
    const paginasPermitidas = paginasDisponiveis.filter(pagina => permissoesUsuario.includes(pagina.permissao));
    for (let i = paginasPermitidas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [paginasPermitidas[i], paginasPermitidas[j]] = [paginasPermitidas[j], paginasPermitidas[i]];
    }
    return paginasPermitidas.slice(0, Math.min(3, paginasPermitidas.length));
}

// Função para renderizar os botões no card
function renderizarAcoes(permissoes) {
    const acoesMenu = document.getElementById("acoesMenu");
    if (!acoesMenu) {
        console.error('[renderizarAcoes] Elemento #acoesMenu não encontrado');
        return;
    }

    const paginasSelecionadas = gerarLinksAleatorios(permissoes);
    console.log('[renderizarAcoes] Páginas selecionadas:', paginasSelecionadas);
    acoesMenu.innerHTML = "";
    paginasSelecionadas.forEach(pagina => {
        const link = document.createElement("a");
        link.href = pagina.href;
        link.className = "acao-btn";
        link.textContent = pagina.texto;
        acoesMenu.appendChild(link);
    });
}

function atualizarGrafico() {
    const filtroCostureira = document.getElementById('filtroCostureira');
    if (!filtroCostureira) return;
    const filtro = filtroCostureira.value;
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const producoesHoje = producoes.filter(p => p.data.startsWith(hoje.split('/').reverse().join('-')));
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

async function atualizarGraficoTempoReal() {
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const hojeQuery = hoje.split('/').reverse().join('-');
    const token = localStorage.getItem('token');

    try {
        const response = await fetch('/api/producao-home', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Erro na API: ${response.status}`);
        }

        const producoesHoje = await response.json();
        console.log('[atualizarGraficoTempoReal] Produções recebidas:', producoesHoje);

        const dados = {};
        producoesHoje.forEach(producao => {
            const nomeCostureira = producao.nome || `Funcionário ${producao.funcionario}`;
            console.log('[atualizarGraficoTempoReal] Processando costureira:', nomeCostureira, 'Quantidade:', producao.quantidade);
            if (!dados[nomeCostureira]) dados[nomeCostureira] = 0;
            dados[nomeCostureira] += Number(producao.quantidade) || 0;
        });

        const labels = Object.keys(dados);
        const valores = Object.values(dados);
        console.log('[atualizarGraficoTempoReal] Labels:', labels, 'Valores:', valores);

        if (labels.length === 0) {
            console.log('[atualizarGraficoTempoReal] Nenhum dado para exibir no gráfico');
            const ctx = document.getElementById('graficoProducaoTempoReal');
            if (ctx) {
                ctx.nextSibling || ctx.insertAdjacentHTML('afterend', `<p>Nenhuma produção registrada para ${hoje}</p>`);
            }
            return;
        }

        if (graficoTempoReal) graficoTempoReal.destroy();
        const ctx = document.getElementById('graficoProducaoTempoReal');
        if (!ctx) {
            console.error('[atualizarGraficoTempoReal] Elemento canvas não encontrado');
            return;
        }

        graficoTempoReal = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: `Produção das Costureiras - ${hoje}`,
                    data: valores,
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 1,
                    barThickness: 20
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            padding: 10
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            padding: 10
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        formatter: (value) => value,
                        color: '#000'
                    },
                    title: {
                        display: true,
                        text: 'Produção Diária das Costureiras',
                        font: { size: 20 }
                    }
                }
            }
        });
    } catch (error) {
        console.error('[atualizarGraficoTempoReal] Erro ao atualizar gráfico:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('home.html', []);
        if (!auth) {
            console.log('[admin-home] Autenticação falhou, redirecionando para acesso-negado');
            window.location.href = '/admin/acesso-negado.html';
            return;
        }

        const usuarioLogado = auth.usuario;
        const permissoes = auth.permissoes || [];
        const nomeAdmin = document.getElementById('nomeAdmin');
        if (nomeAdmin && usuarioLogado) {
            nomeAdmin.textContent = usuarioLogado.nome;
        }

        renderizarAcoes(permissoes);
        atualizarGrafico();
        atualizarGraficoTempoReal();

        // Adiciona botão de atualização manual
        const refreshButton = document.createElement('button');
        refreshButton.className = 'btn-refresh';
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
        refreshButton.addEventListener('click', atualizarGraficoTempoReal);
        const cardProducao = document.querySelector('.card-producao-diaria');
        if (cardProducao) cardProducao.appendChild(refreshButton);
    } catch (error) {
        console.error('[admin-home] Erro ao carregar home:', error);
        window.location.href = '/admin/acesso-negado.html';
    }
});