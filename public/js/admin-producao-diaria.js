// js/pages/admin-producao-diaria.js

import { verificarAutenticacao } from '/js/utils/auth.js';
import { getCachedData, obterProdutos, obterOrdensFinalizadas } from '/js/utils/storage.js';
import { criarGrafico } from '/js/utils/chart-utils.js';

function debugScope(message) {
    console.log(`[Debug] ${message} - Escopo ativo`);
}



(async () => {
    debugScope('Iniciando autenticação');
    const auth = await verificarAutenticacao('producao-diaria.html', ['acesso-producao-diaria']);
    if (!auth) {
        console.error('[admin-producao-diaria] Autenticação falhou.');
        return;
    }

    const permissoes = auth.permissoes || [];
    console.log('[admin-producao-diaria] Autenticação bem-sucedida, permissões:', permissoes);

    let graficoDiario;
    let graficoComparativo;
    let graficoComparativoGeral; // Novo gráfico
    let costureiraSelecionada = null;
    let costureiras = [];
    let sortState = { column: null, direction: 'asc' };

    // Nova função para o Comparativo Geral
    async function atualizarComparativoGeral() {
        console.log('[atualizarComparativoGeral] Atualizando gráfico comparativo geral...');
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        const dataAtual = `${ano}-${mes}-${dia}`;
    
        try {
            const producoes = await fetchProducoes();
            const nomesCostureiras = costureiras.map(c => c.nome);
    
            const producoesHoje = producoes.filter(p => {
                if (!p.data) {
                    console.warn('[atualizarComparativoGeral] Produção sem data:', p);
                    return false;
                }
                const dataProducao = new Date(p.data);
                if (isNaN(dataProducao.getTime())) {
                    console.error('[atualizarComparativoGeral] Data inválida:', p.data);
                    return false;
                }
                const anoProd = dataProducao.getFullYear();
                const mesProd = String(dataProducao.getMonth() + 1).padStart(2, '0');
                const diaProd = String(dataProducao.getDate()).padStart(2, '0');
                return `${anoProd}-${mesProd}-${diaProd}` === dataAtual && 
                       p.funcionario && nomesCostureiras.includes(p.funcionario);
            });
    
            console.log('[atualizarComparativoGeral] Produções filtradas do dia:', producoesHoje);
    
            const dados = {};
            producoesHoje.forEach(p => {
                const funcionario = p.funcionario || 'Desconhecido';
                if (!dados[funcionario]) dados[funcionario] = 0;
                dados[funcionario] += parseInt(p.quantidade) || 0;
            });
    
            const labels = Object.keys(dados).length > 0 ? Object.keys(dados) : ['Nenhum dado'];
            const valores = Object.keys(dados).length > 0 ? Object.values(dados) : [0];
            const total = valores.reduce((a, b) => a + b, 0);
            const porcentagens = valores.map(valor => total > 0 ? Math.round((valor / total) * 100) : 0);
    
            const cores = [
                'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)', 'rgba(255, 206, 86, 0.8)',
                'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)', 'rgba(255, 159, 64, 0.8)'
            ];
            const bordas = cores.map(cor => cor.replace('0.8', '1'));
    
            if (graficoComparativoGeral) graficoComparativoGeral.destroy();
            const ctx = document.getElementById('graficoComparativoGeral')?.getContext('2d');
            if (!ctx) {
                console.error('[atualizarComparativoGeral] Elemento #graficoComparativoGeral não encontrado.');
                return;
            }
    
            graficoComparativoGeral = criarGrafico(
                ctx,
                'pie',
                labels,
                '',
                porcentagens,
                cores.slice(0, labels.length),
                bordas.slice(0, labels.length),
                {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                boxWidth: 20,
                                padding: 15,
                                font: {
                                    size: 14,
                                    weight: 'bold'
                                },
                                color: '#2c3e50'
                            }
                        },
                        tooltip: {
                            enabled: true,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleFont: { size: 14 },
                            bodyFont: { size: 12 },
                            padding: 10,
                            callbacks: {
                                label: function(context) {
                                    const percentage = context.raw; // Já é a porcentagem arredondada
                                    return `${percentage}%`; // Mostrar apenas "42%"
                                }
                            }
                        }
                    },
                    elements: {
                        arc: {
                            borderWidth: 3,
                            shadowOffsetX: 3,
                            shadowOffsetY: 3,
                            shadowBlur: 10,
                            shadowColor: 'rgba(0, 0, 0, 0.3)'
                        }
                    },
                    cutout: '50%',
                    animation: {
                        animateScale: true,
                        animateRotate: true
                    }
                }
            );
        } catch (error) {
            console.error('[atualizarComparativoGeral] Erro ao atualizar gráfico comparativo geral:', error);
        }
    }

    async function fetchProducoes() {
        console.log('[fetchProducoes] Iniciando busca de produções...');
        const token = localStorage.getItem('token');
        console.log('[fetchProducoes] Token usado:', token ? 'Encontrado' : 'Não encontrado');

        const response = await fetch('/api/producoes', {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[fetchProducoes] Erro na resposta da API:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText,
            });
            throw new Error(`Erro ao buscar produções: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[fetchProducoes] Dados retornados pela API:', data);
        return Array.isArray(data) ? data : (data.rows || []);
    }

    async function atualizarGraficoDiario() {
        console.log('[atualizarGraficoDiario] Atualizando gráfico diário...');
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        const dataAtual = `${ano}-${mes}-${dia}`;
    
        try {
            const producoes = await fetchProducoes();
    
            const producoesHoje = producoes.filter(p => {
                if (!p.data) {
                    console.warn('[atualizarGraficoDiario] Produção sem data:', p);
                    return false;
                }
                const dataProducao = new Date(p.data);
                if (isNaN(dataProducao.getTime())) {
                    console.error('[atualizarGraficoDiario] Data inválida:', p.data);
                    return false;
                }
                const anoProd = dataProducao.getFullYear();
                const mesProd = String(dataProducao.getMonth() + 1).padStart(2, '0');
                const diaProd = String(dataProducao.getDate()).padStart(2, '0');
                return `${anoProd}-${mesProd}-${diaProd}` === dataAtual;
            });
    
            console.log('[atualizarGraficoDiario] Produções filtradas do dia:', producoesHoje);
    
            // Filtrar apenas costureiras
            const nomesCostureiras = costureiras.map(c => c.nome);
            const producoesCostureiras = producoesHoje.filter(p => 
                p.funcionario && nomesCostureiras.includes(p.funcionario)
            );
    
            const dados = {};
            producoesCostureiras.forEach(p => {
                const funcionario = p.funcionario || 'Desconhecido';
                if (!dados[funcionario]) dados[funcionario] = 0;
                dados[funcionario] += parseInt(p.quantidade) || 0;
            });
    
            const labels = Object.keys(dados).length > 0 ? Object.keys(dados) : ['Nenhum dado'];
            const valores = Object.keys(dados).length > 0 ? Object.values(dados) : [0];

            const cores = [
                'rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(255, 206, 86, 0.2)',
                'rgba(75, 192, 192, 0.2)', 'rgba(153, 102, 255, 0.2)', 'rgba(255, 159, 64, 0.2)'
            ];
            const bordas = cores.map(cor => cor.replace('0.2', '1'));

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
                '',
                valores,
                cores.slice(0, labels.length),
                bordas.slice(0, labels.length),
                {
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: 'Produção',
                                color: '#2c3e50',
                                font: { size: 14 }
                            }
                        }
                    }
                }
            );

            const tituloGrafico = document.getElementById('tituloGrafico');
            if (tituloGrafico) {
                const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
                const dataFormatada = `${dia}/${mes}/${ano} - ${diasSemana[hoje.getDay()]}`;
                tituloGrafico.textContent = `Produção do Dia ${dataFormatada}`;
            }
        } catch (error) {
            console.error('[atualizarGraficoDiario] Erro ao atualizar gráfico:', error);
        }
    }

    async function carregarCostureirasButtons() {
        console.log('[carregarCostureirasButtons] Carregando botões das costureiras...');
        const container = document.getElementById('costureirasButtons');
        if (!container) {
            console.error('[carregarCostureirasButtons] Elemento #costureirasButtons não encontrado.');
            return;
        }

        const fetchCostureiras = async () => {
            const token = localStorage.getItem('token');
            console.log('[fetchCostureiras] Token usado:', token ? 'Encontrado' : 'Não encontrado');

            const response = await fetch('/api/usuarios?tipo=costureira', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Erro ao buscar costureiras');
            const usuarios = await response.json();
            return usuarios.filter(u => u.tipos && u.tipos.includes('costureira'));
        };

        try {
            costureiras = await getCachedData('costureiras', fetchCostureiras, 10);
            console.log('[carregarCostureirasButtons] Costureiras encontradas:', costureiras);

            container.innerHTML = '';
            costureiras.forEach(c => {
                const button = document.createElement('button');
                button.textContent = c.nome;
                button.dataset.nome = c.nome;
                button.onclick = () => toggleCostureiraDetalhes(c.nome, button);
                container.appendChild(button);
            });

            if (costureiras.length > 0) {
                const primeiroBotao = container.querySelector('button');
                toggleCostureiraDetalhes(costureiras[0].nome, primeiroBotao);
            }
        } catch (error) {
            console.error('[carregarCostureirasButtons] Erro ao carregar costureiras:', error);
        }
    }

    async function toggleCostureiraDetalhes(nome, button) {
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
            await atualizarProducaoIndividual(nome);
        }
    }

    function sortTable(especiaisAgrupados, dadosAgrupados, column, direction) {
        const compare = (a, b) => {
            let valA, valB;
            switch (column) {
                case 'id':
                    valA = a.id || 'N/A';
                    valB = b.id || 'N/A';
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'produto':
                    valA = a.produto || '';
                    valB = b.produto || '';
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'procMaq':
                    valA = `${a.processo || 'N/A'}/${a.maquina || 'N/A'}`;
                    valB = `${b.processo || 'N/A'}/${b.maquina || 'N/A'}`;
                    return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'quantidade':
                    valA = parseInt(a.quantidade) || 0;
                    valB = parseInt(b.quantidade) || 0;
                    return direction === 'asc' ? valA - valB : valB - valA;
                default:
                    return 0;
            }
        };

        especiaisAgrupados.sort(compare);
        dadosAgrupados.sort(compare);
    }

    async function atualizarProducaoIndividual(nome) {
        console.log(`[atualizarProducaoIndividual] Atualizando produção individual para: ${nome}`);
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        const dataAtual = `${ano}-${mes}-${dia}`;

        try {
            const producoes = await fetchProducoes();
            const produtos = await obterProdutos();
            const ordensDeProducao = await obterOrdensFinalizadas();

            const producoesHoje = producoes.filter(p => {
                if (!p.data || !p.funcionario) return false;
                const dataProducao = new Date(p.data);
                if (isNaN(dataProducao.getTime())) return false;
                const anoProd = dataProducao.getFullYear();
                const mesProd = String(dataProducao.getMonth() + 1).padStart(2, '0');
                const diaProd = String(dataProducao.getDate()).padStart(2, '0');
                return p.funcionario === nome && `${anoProd}-${mesProd}-${diaProd}` === dataAtual;
            });

            const corpoTabela = document.getElementById('corpoTabelaIndividual');
            const totalProcessos = document.getElementById('totalProcessos');
            const headers = document.querySelectorAll('#tabelaIndividual th');
            if (!corpoTabela || !totalProcessos) {
                console.error('[atualizarProducaoIndividual] Elementos #corpoTabelaIndividual ou #totalProcessos não encontrados.');
                return;
            }

            const especiais = [
                { produto: 'Scrunchie (Padrão)', variacao: 'Preto' },
                { produto: 'Touca de Cetim (Dupla Face)', variacao: 'Preto com Preto | P' },
                { produto: 'Touca de Cetim (Dupla Face)', variacao: 'Preto com Preto | G' },
                { produto: 'Touca de Cetim (Dupla Face)', variacao: 'Preto com Preto | GG' }
            ];

            const dadosAgrupados = {};
            const especiaisAgrupados = [];
            let total = 0;

            producoesHoje.forEach(p => {
                const produtoInfo = produtos.find(prod => prod.nome === p.produto);
                const maquina = produtoInfo?.etapas?.find(e => e.processo === p.processo)?.maquina || 'N/A';
                const op = ordensDeProducao.find(o => o.numero === p.opNumero);
                const variacao = p.variacao || (op ? op.variante : 'N/A') || 'N/A';

                const chave = `${p.produto}-${p.processo}-${maquina}`;
                const especial = especiais.find(e => e.produto === p.produto && e.variacao === variacao);

                if (especial) {
                    especiaisAgrupados.push({ ...p, maquina });
                } else {
                    if (!dadosAgrupados[chave]) {
                        dadosAgrupados[chave] = { id: p.id, produto: p.produto, processo: p.processo, maquina, quantidade: 0 };
                    }
                    dadosAgrupados[chave].quantidade += parseInt(p.quantidade) || 0;
                }
                total += parseInt(p.quantidade) || 0;
            });

            const renderTable = () => {
                corpoTabela.innerHTML = '';

                especiaisAgrupados.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.classList.add('especial');
                    tr.innerHTML = `
                        <td>${p.id || 'N/A'}</td>
                        <td>${p.produto} - ${p.variacao}</td>
                        <td>${p.processo || 'N/A'}/${p.maquina}</td>
                        <td>${p.quantidade || 0}</td>
                    `;
                    corpoTabela.appendChild(tr);
                });

                Object.values(dadosAgrupados).forEach(d => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${d.id || 'N/A'}</td>
                        <td>${d.produto}</td>
                        <td>${d.processo}/${d.maquina}</td>
                        <td>${d.quantidade}</td>
                    `;
                    corpoTabela.appendChild(tr);
                });

                totalProcessos.textContent = total;
                console.log('[atualizarProducaoIndividual] Total de processos:', total);
            };

            if (sortState.column) {
                sortTable(especiaisAgrupados, Object.values(dadosAgrupados), sortState.column, sortState.direction);
            }

            renderTable();

            headers.forEach((header, index) => {
                header.classList.add('sortable');
                header.addEventListener('click', () => {
                    const column = index === 0 ? 'id' : index === 1 ? 'produto' : index === 2 ? 'procMaq' : 'quantidade';
                    const newDirection = sortState.column === column && sortState.direction === 'asc' ? 'desc' : 'asc';

                    headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
                    header.classList.add(newDirection === 'asc' ? 'sort-asc' : 'sort-desc');

                    sortState = { column, direction: newDirection };
                    sortTable(especiaisAgrupados, Object.values(dadosAgrupados), column, newDirection);
                    renderTable();
                });
            });
        } catch (error) {
            console.error('[atualizarProducaoIndividual] Erro ao atualizar produção individual:', error);
        }
    }

    async function carregarProdutosSelect(producoesFiltradas) {
        const select = document.getElementById('produtoSelect');
        if (!select) return;
    
        try {
            const produtoAtual = select.value; // Preservar o valor atual
            const produtosComProducao = [...new Set(producoesFiltradas.map(p => p.produto))];
            select.innerHTML = '<option value="todos">Todos</option>';
            produtosComProducao.forEach(produto => {
                const option = document.createElement('option');
                option.value = produto;
                option.textContent = produto;
                select.appendChild(option);
            });
            // Restaurar o valor selecionado se ainda estiver nas opções, senão voltar para "todos"
            if (produtoAtual && produtosComProducao.includes(produtoAtual)) {
                select.value = produtoAtual;
            } else {
                select.value = 'todos';
            }
        } catch (error) {
            console.error('[carregarProdutosSelect] Erro ao carregar produtos:', error);
        }
    }
    

    async function atualizarComparativoProduto() {
        console.log('[atualizarComparativoProduto] Atualizando gráfico comparativo...');
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
    
        const produtoSelecionado = document.getElementById('produtoSelect')?.value || 'todos'; // Default para 'todos' na inicialização
        const filtroPeriodo = document.querySelector('.data-buttons .btn.active')?.id;
    
        let dataInicio, dataFim;
        switch (filtroPeriodo) {
            case 'filtroHoje':
                dataInicio = dataFim = `${ano}-${mes}-${dia}`;
                break;
            case 'filtroSemana':
                const diaSemana = hoje.getDay();
                dataInicio = new Date(hoje);
                dataInicio.setDate(hoje.getDate() - diaSemana);
                dataFim = new Date(hoje);
                dataFim.setDate(hoje.getDate() + (6 - diaSemana));
                dataInicio = `${dataInicio.getFullYear()}-${String(dataInicio.getMonth() + 1).padStart(2, '0')}-${String(dataInicio.getDate()).padStart(2, '0')}`;
                dataFim = `${dataFim.getFullYear()}-${String(dataFim.getMonth() + 1).padStart(2, '0')}-${String(dataFim.getDate()).padStart(2, '0')}`;
                break;
            case 'filtroMes':
                dataInicio = `${ano}-${mes}-01`;
                dataFim = `${ano}-${mes}-${new Date(ano, hoje.getMonth() + 1, 0).getDate()}`;
                break;
            default:
                dataInicio = dataFim = `${ano}-${mes}-${dia}`;
        }
    
        try {
            const producoes = await fetchProducoes();
            const nomesCostureiras = costureiras.map(c => c.nome);
            const producoesFiltradas = producoes.filter(p => {
                if (!p.data) return false;
                const dataProducao = new Date(p.data);
                const dataStr = `${dataProducao.getFullYear()}-${String(dataProducao.getMonth() + 1).padStart(2, '0')}-${String(dataProducao.getDate()).padStart(2, '0')}`;
                return (
                    dataStr >= dataInicio &&
                    dataStr <= dataFim &&
                    p.funcionario && nomesCostureiras.includes(p.funcionario)
                );
            });
    
            console.log('[atualizarComparativoProduto] Produções filtradas:', producoesFiltradas);
    
            await carregarProdutosSelect(producoesFiltradas);
    
            const producoesProduto = producoesFiltradas.filter(p => 
                produtoSelecionado === 'todos' || p.produto === produtoSelecionado
            );
    
            const dados = {};
            producoesProduto.forEach(p => {
                const funcionario = p.funcionario || 'Desconhecido';
                if (!dados[funcionario]) dados[funcionario] = 0;
                dados[funcionario] += parseInt(p.quantidade) || 0;
            });
    
            const labels = Object.keys(dados).length > 0 ? Object.keys(dados) : ['Nenhum dado'];
            const valores = Object.keys(dados).length > 0 ? Object.values(dados) : [0];
    
            const cores = [
                'rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(255, 206, 86, 0.2)',
                'rgba(75, 192, 192, 0.2)', 'rgba(153, 102, 255, 0.2)', 'rgba(255, 159, 64, 0.2)'
            ];
            const bordas = cores.map(cor => cor.replace('0.2', '1'));
    
            const graficoElement = document.getElementById('graficoComparativo');
            const semDadosElement = document.getElementById('semDadosComparativo');
    
            if (producoesProduto.length === 0) { // Verificar se há produções após o filtro
                graficoElement.style.display = 'none';
                semDadosElement.style.display = 'block';
            } else {
                graficoElement.style.display = 'block';
                semDadosElement.style.display = 'none';
    
                if (graficoComparativo) graficoComparativo.destroy();
                const ctx = graficoElement.getContext('2d');
                if (!ctx) {
                    console.error('[atualizarComparativoProduto] Elemento #graficoComparativo não encontrado.');
                    return;
                }
    
                graficoComparativo = criarGrafico(
                    ctx,
                    'bar',
                    labels,
                    '',
                    valores,
                    cores.slice(0, labels.length),
                    bordas.slice(0, labels.length),
                    {
                        scales: {
                            y: {
                                title: {
                                    display: true,
                                    text: 'Produção',
                                    color: '#2c3e50',
                                    font: { size: 14 }
                                }
                            }
                        }
                    }
                );
            }
        } catch (error) {
            console.error('[atualizarComparativoProduto] Erro ao atualizar gráfico comparativo:', error);
        }
    }

    // Ajustar a inicialização direta e o único DOMContentLoaded
// Ajustar a inicialização direta
debugScope('Inicializando página diretamente');
await carregarCostureirasButtons();
await atualizarGraficoDiario();
await atualizarComparativoProduto();
await atualizarComparativoGeral();

// Mover os eventos para fora do DOMContentLoaded
document.getElementById('atualizarGrafico')?.addEventListener('click', atualizarGraficoDiario);
document.getElementById('produtoSelect')?.addEventListener('change', atualizarComparativoProduto);
document.getElementById('filtroHoje')?.addEventListener('click', () => {
    document.querySelectorAll('.data-buttons .btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('filtroHoje').classList.add('active');
    atualizarComparativoProduto();
});
document.getElementById('filtroSemana')?.addEventListener('click', () => {
    document.querySelectorAll('.data-buttons .btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('filtroSemana').classList.add('active');
    atualizarComparativoProduto();
});
document.getElementById('filtroMes')?.addEventListener('click', () => {
    document.querySelectorAll('.data-buttons .btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('filtroMes').classList.add('active');
    atualizarComparativoProduto();
});

// Ajustar o DOMContentLoaded para apenas inicialização
document.addEventListener('DOMContentLoaded', async () => {
    debugScope('DOM carregado, inicializando página');
    console.log('[DOMContentLoaded] DOM carregado, inicializando página');
    await carregarCostureirasButtons();
    await atualizarGraficoDiario();
    await atualizarComparativoProduto();
    await atualizarComparativoGeral();
});

})();