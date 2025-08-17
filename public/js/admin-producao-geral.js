// public/js/admin/acompanhamento-producao.js

// ==========================================================================
// 1. IMPORTS DE MÓDULOS E UTILITÁRIOS
// ==========================================================================
import { verificarAutenticacao } from '/js/utils/auth.js';
import { mostrarMensagem } from '/js/utils/popups.js'; // Usaremos para feedback
import { adicionarBotaoFechar } from '/js/utils/botoes-fechar.js';

// ==========================================================================
// 2. VARIÁVEIS GLOBAIS E ESTADO DA APLICAÇÃO
// ==========================================================================
let dadosDoDiaCache = null; // Armazena a resposta completa da API
let autoAtualizacaoInterval = null; // Referência para o setInterval
let paginaLoadingOverlayEl = null;

const LIMITE_OCIOSIDADE_MINUTOS = 120;

// Variável que estava faltando e causando o erro. Agora está no escopo global.
let filtroPeriodoAtivo = 'dia-inteiro';

let paginaAtualFeed = 1;
const ITENS_POR_PAGINA_FEED = 9; // Itens por página no feed principal

// ==========================================================================
// 3. FUNÇÃO PRINCIPAL E COMUNICAÇÃO COM API
// ==========================================================================

/**
 * Função principal que busca os dados da API e dispara a renderização.
 */
async function carregarErenderizarDados() {
    const filtroDataEl = document.getElementById('pg-filtro-data');
    const dataSelecionada = filtroDataEl.value;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/real-producao/diaria?data=${dataSelecionada}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Falha ao buscar dados da produção.');
        }

        dadosDoDiaCache = await response.json();
        await filtrarPorMomentoChave();

    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        mostrarMensagem(error.message, 'erro');
        limparConteudo();
    }
}

/**
 * Busca o desempenho histórico para uma lista de funcionários.
 * @param {Array<number>} idsFuncionarios - Um array com os IDs dos funcionários.
 * @returns {Promise<Object>} Uma promessa que resolve para um mapa de ID -> mediaPph.
 */
async function buscarDesempenhoHistorico(idsFuncionarios) {
    const desempenhoMap = {};
    const token = localStorage.getItem('token');

    // Cria uma lista de promessas, uma para cada funcionário
    const promessas = idsFuncionarios.map(id =>
        fetch(`/api/real-producao/desempenho-historico?funcionarioId=${id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        }).then(res => res.json())
    );

    // Executa todas as buscas em paralelo para mais performance
    const resultados = await Promise.all(promessas);

    resultados.forEach(res => {
        if (res.mediaPphHistorica) {
            desempenhoMap[res.funcionarioId] = res.mediaPphHistorica;
        }
    });

    return desempenhoMap;
}

// ==========================================================================
// 4. FUNÇÕES DE RENDERIZAÇÃO DA UI
// ==========================================================================

/**
 * Limpa o conteúdo dinâmico da página (usado em erros ou antes de carregar novos dados).
 */
function limparConteudo() {
    // Garante que tentamos limpar apenas elementos que existem
    const kpiContainer = document.getElementById('pg-resumo-kpi');
    const rankingContainer = document.getElementById('pg-ranking-lista');
    const metasContainer = document.getElementById('pg-metas-lista');
    const feedContainer = document.getElementById('pg-feed-atividades');

    if (kpiContainer) kpiContainer.innerHTML = '<p>Erro ao carregar.</p>';
    if (rankingContainer) rankingContainer.innerHTML = '';
    if (metasContainer) metasContainer.innerHTML = '';
    if (feedContainer) feedContainer.innerHTML = '';
}

/**
 * Renderiza os cards de KPI no topo da página, com comparativo.
 * @param {Array} atividades - A lista de atividades do período filtrado.
 * @param {object} totaisDiaAnterior - Os totais consolidados do dia anterior.
 */
function renderizarKPIs(atividades, totaisDiaAnterior) {
    const container = document.getElementById('pg-resumo-kpi');
    if (!container) {
        console.error("Elemento com ID 'pg-resumo-kpi' não foi encontrado no DOM.");
        return;
    }

    const processosCostura = atividades.filter(atv => atv.tipo_funcionario.includes('costureira')).reduce((acc, atv) => acc + atv.quantidade, 0);
    const processosTiktik = atividades.filter(atv => atv.tipo_funcionario.includes('tiktik') && atv.tipo_atividade === 'processo').reduce((acc, atv) => acc + atv.quantidade, 0);
    const arremates = atividades.filter(atv => atv.tipo_atividade === 'arremate').reduce((acc, atv) => acc + atv.quantidade, 0);
    const totalFinalizados = arremates;

    const criarCardKPI = (id, titulo, valorAtual, valorAnterior, icone, tipo = 'neutro', ehClicavel = false) => {
    let comparativoHTML = '';

    // Lógica antiga para o filtro 'Dia Inteiro'
    if (filtroPeriodoAtivo === 'dia-inteiro' && valorAnterior !== undefined) {
        const diff = valorAtual - valorAnterior;
        const percent = valorAnterior > 0 ? (diff / valorAnterior) * 100 : (valorAtual > 0 ? 100 : 0);
        const classeCor = diff > 0 ? 'sucesso' : (diff < 0 ? 'perigo' : 'neutro');
        const iconeSeta = diff > 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        
        if (diff !== 0) {
             comparativoHTML = `<p class="pg-info-card-descricao comparativo-${classeCor}">
                <i class="fas ${iconeSeta}"></i> ${Math.round(percent)}% vs ontem
            </p>`;
        } else {
             comparativoHTML = `<p class="pg-info-card-descricao">Igual a ontem</p>`;
        }
    } 
    // === INÍCIO DA NOVA LÓGICA ===
    else if (filtroPeriodoAtivo !== 'dia-inteiro' && dadosDoDiaCache) {
        // Se um filtro de período está ativo, calcula a % do total do dia
        
        // Pega os totais do dia inteiro do nosso cache de dados
        const totalCosturaDia = dadosDoDiaCache.atividadesDoDia.filter(atv => atv.tipo_funcionario.includes('costureira')).reduce((acc, atv) => acc + atv.quantidade, 0);
        const totalTiktikDia = dadosDoDiaCache.atividadesDoDia.filter(atv => atv.tipo_funcionario.includes('tiktik') && atv.tipo_atividade === 'processo').reduce((acc, atv) => acc + atv.quantidade, 0);
        const totalArrematesDia = dadosDoDiaCache.atividadesDoDia.filter(atv => atv.tipo_atividade === 'arremate').reduce((acc, atv) => acc + atv.quantidade, 0);
        const totalFinalizadosDia = totalArrematesDia;
        
        let totalDoDiaParaEsteKPI = 0;
        switch (id) {
            case 'kpi-costura': totalDoDiaParaEsteKPI = totalCosturaDia; break;
            case 'kpi-tiktik': totalDoDiaParaEsteKPI = totalTiktikDia; break;
            case 'kpi-arremates': totalDoDiaParaEsteKPI = totalArrematesDia; break;
            case 'kpi-finalizados': totalDoDiaParaEsteKPI = totalFinalizadosDia; break;
        }

        if (totalDoDiaParaEsteKPI > 0 && valorAtual > 0) {
            const percentDoTotal = (valorAtual / totalDoDiaParaEsteKPI) * 100;
            comparativoHTML = `<p class="pg-info-card-descricao comparativo-neutro">
                ${Math.round(percentDoTotal)}% do total do dia
            </p>`;
        } else {
            // Se não houver produção no dia, não mostra nada
            comparativoHTML = '<p class="pg-info-card-descricao">&nbsp;</p>';
        }
    }
    // === FIM DA NOVA LÓGICA ===
    else {
        // Se não for nem 'dia-inteiro' e nem tiver dados de cache, deixa um espaço vazio
        comparativoHTML = '<p class="pg-info-card-descricao">&nbsp;</p>';
    }

    const classeClicavel = ehClicavel ? 'pg-kpi-clicavel' : '';

    return `
        <div id="${id}" class="gs-info-card ${tipo} ${classeClicavel}">
            <i class="gs-info-card-icone ${icone}"></i>
            <h3>${titulo}</h3>
            <span class="gs-info-card-contador">${valorAtual}</span>
            ${comparativoHTML}
        </div>
    `;
};
    // --- LÓGICA DE RENDERIZAÇÃO CORRIGIDA ---
        // 1. Monta todo o HTML em uma string
        let cardsHTML = '';
        cardsHTML += criarCardKPI('kpi-costura', 'Processos de Costura', processosCostura, totaisDiaAnterior?.processosCostura, 'fas fa-cut', 'neutro', true); // Passa true para ehClicavel
        cardsHTML += criarCardKPI('kpi-tiktik', 'Processos de Tiktik', processosTiktik, totaisDiaAnterior?.processosTiktik, 'fas fa-tape');
        cardsHTML += criarCardKPI('kpi-arremates', 'Arremates Realizados', arremates, totaisDiaAnterior?.arremates, 'fas fa-tag');
        cardsHTML += criarCardKPI('kpi-finalizados', 'Itens Finalizados', totalFinalizados, totaisDiaAnterior?.totalFinalizados, 'fas fa-check-double', 'sucesso');

        // 2. Insere o HTML no DOM de uma só vez
        container.innerHTML = cardsHTML;

        // 3. AGORA, com os elementos no DOM, encontramos o card e adicionamos o listener
        const cardCostura = document.getElementById('kpi-costura');
        if (cardCostura) {
            cardCostura.addEventListener('click', () => {
                if (processosCostura > 0) {
                    abrirModalDetalhesCostura();
                }
            });
        }
}
/**
 * Renderiza os rankings separados e o radar de metas, incluindo o alerta de ociosidade e o alerta preditivo.
 * @param {Array} atividades - A lista de atividades do período.
 * @param {object} regrasDeMetas - O objeto com as regras de metas.
 */
async function renderizarRankingERadar(atividades, regrasDeMetas) {
    const rankingContainer = document.getElementById('pg-ranking-lista');
    const metasContainer = document.getElementById('pg-metas-lista');

    // Limpa os containers
    rankingContainer.innerHTML = '';
    metasContainer.innerHTML = '';

    // Agrupa dados por funcionário
    const dadosPorFuncionario = {};
    atividades.forEach(atv => {
        if (!dadosPorFuncionario[atv.funcionario_id]) {
            dadosPorFuncionario[atv.funcionario_id] = {
                id: atv.funcionario_id,
                nome: atv.nome_funcionario,
                avatar: atv.avatar_url || '/img/default-avatar.png',
                tipo: atv.tipo_funcionario[0],
                nivel: atv.nivel,
                totalPontos: 0,
                totalPecas: 0,
                ultimaAtividade: new Date(0),
                primeiraAtividade: new Date() // Inicializa com data atual para encontrar a mais antiga
            };
        }
        dadosPorFuncionario[atv.funcionario_id].totalPontos += parseFloat(atv.pontos_gerados) || 0;
        dadosPorFuncionario[atv.funcionario_id].totalPecas += atv.quantidade;
        
        const dataAtividade = new Date(atv.data_hora);
        if (dataAtividade > dadosPorFuncionario[atv.funcionario_id].ultimaAtividade) {
            dadosPorFuncionario[atv.funcionario_id].ultimaAtividade = dataAtividade;
        }
        if (dataAtividade < dadosPorFuncionario[atv.funcionario_id].primeiraAtividade) {
            dadosPorFuncionario[atv.funcionario_id].primeiraAtividade = dataAtividade;
        }
    });

    const listaFuncionariosBruta = Object.values(dadosPorFuncionario);
    const listaFuncionarios = listaFuncionariosBruta.filter(f => f.id !== 12); // Remove o usuário "Lixeira"

    // Busca o desempenho histórico para os alertas preditivos
    const idsAtivos = listaFuncionarios.map(f => f.id);
    let desempenhoHistorico = {};
    if (idsAtivos.length > 0) {
        desempenhoHistorico = await buscarDesempenhoHistorico(idsAtivos);
    }

    if (listaFuncionarios.length === 0) {
        const msg = '<p style="text-align:center; padding: 20px;">Nenhuma atividade registrada.</p>';
        rankingContainer.innerHTML = msg;
        metasContainer.innerHTML = msg;
        return;
    }

    // Separa por tipo
    const costureiras = listaFuncionarios.filter(f => f.tipo === 'costureira');
    const tiktiks = listaFuncionarios.filter(f => f.tipo === 'tiktik');

    // Função auxiliar para criar um card de funcionário
    const criarCardFuncionario = (func, rankingPos, desempenhoHistoricoMap) => {
        const tipoFunc = func.tipo.toLowerCase();
        const nivelFunc = func.nivel;
        let metaDiaria = 0;
        
        if (regrasDeMetas[tipoFunc] && regrasDeMetas[tipoFunc][nivelFunc]) {
            const metasDoNivel = regrasDeMetas[tipoFunc][nivelFunc];
            const metaMaximaSemanal = metasDoNivel[metasDoNivel.length - 1]?.pontos_meta || 0;
            metaDiaria = metaMaximaSemanal / 5;
        }

        const pontosFeitos = Math.round(func.totalPontos);
        const metaDiariaFormatada = Math.round(metaDiaria);
        
        const progressoPercent = metaDiaria > 0 ? (pontosFeitos / metaDiaria) * 100 : 0;
        let classeStatusMeta = 'perigo';
        let iconeStatusMeta = 'fas fa-flag';
        if (progressoPercent > 100) { classeStatusMeta = 'bonus'; iconeStatusMeta = 'fas fa-rocket'; }
        else if (progressoPercent >= 75) { classeStatusMeta = 'sucesso'; iconeStatusMeta = 'fas fa-bullseye'; }
        else if (progressoPercent >= 40) { classeStatusMeta = 'aviso'; iconeStatusMeta = 'fas fa-tasks'; }

        const agora = new Date();
        const diffMinutos = (agora - func.ultimaAtividade) / (1000 * 60);
        const estaOcioso = diffMinutos > LIMITE_OCIOSIDADE_MINUTOS && filtroPeriodoAtivo === 'dia-inteiro';
        const ociosoHTML = estaOcioso ? `<i class="fas fa-exclamation-triangle ocioso-alerta" title="Última atividade às ${func.ultimaAtividade.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}"></i>` : '';

        // Lógica de PPH e Alerta Preditivo
        let pphAlertaHTML = '';
        const horasTrabalhadas = (func.ultimaAtividade - func.primeiraAtividade) / (1000 * 3600);
        
        if (horasTrabalhadas > 0.1) {
            const pphHoje = func.totalPontos / horasTrabalhadas;
            const pphHistorico = desempenhoHistoricoMap[func.id];
            
            if (pphHistorico) {
                const variacao = ((pphHoje - pphHistorico) / pphHistorico) * 100;
                if (variacao < -25) {
                    pphAlertaHTML = `<i class="fas fa-arrow-trend-down pph-alerta" title="Desempenho ${Math.round(Math.abs(variacao))}% abaixo da média histórica."></i>`;
                }
            }
        }

        const trofeus = ['🥇', '🥈', '🥉'];
        const posicaoRanking = rankingPos > 0 && rankingPos <= 3 ? trofeus[rankingPos - 1] : (rankingPos > 3 ? `${rankingPos}º` : '');

        const cardElement = document.createElement('div');
        cardElement.className = 'pg-funcionario-card-v2';
        cardElement.dataset.funcionarioId = func.id;
        cardElement.innerHTML = `
            <div class="pg-card-v2-header">
                <img src="${func.avatar}" alt="Avatar de ${func.nome}">
                <div class="pg-card-v2-info-principal">
                    <h4>${posicaoRanking} ${func.nome} ${ociosoHTML} ${pphAlertaHTML}</h4>
                    <span class="pg-card-v2-pontos">${pontosFeitos} pts</span>
                </div>
            </div>
            <div class="pg-card-v2-meta-info">
                <div class="pg-meta-texto">
                    <i class="${iconeStatusMeta} icone-meta ${classeStatusMeta}"></i>
                    <span>Meta: ${pontosFeitos} / ${metaDiariaFormatada}</span>
                </div>
                <div class="pg-progress-bar-container">
                    <div class="pg-progress-bar ${classeStatusMeta}" style="width: ${Math.min(progressoPercent, 100)}%;"></div>
                </div>
            </div>
        `;
        return cardElement;
    };

    // Função auxiliar para renderizar um grupo de funcionários
    const renderizarGrupo = (container, lista, titulo, ordenadoPorPontos = false) => {
        if (lista.length > 0) {
            const tituloEl = document.createElement('h4');
            tituloEl.className = 'pg-ranking-titulo';
            tituloEl.textContent = titulo;
            container.appendChild(tituloEl);
        }
        lista.forEach((func, index) => {
            const card = criarCardFuncionario(func, ordenadoPorPontos ? index + 1 : 0, desempenhoHistorico);
            container.appendChild(card);
        });
    };
    
    // Função auxiliar para o Radar de Metas
    const calcularProgresso = (func) => {
        const tipoFunc = func.tipo.toLowerCase();
        const nivelFunc = func.nivel;
        if (regrasDeMetas[tipoFunc] && regrasDeMetas[tipoFunc][nivelFunc]) {
            const metasDoNivel = regrasDeMetas[tipoFunc][nivelFunc];
            const metaMaximaSemanal = metasDoNivel[metasDoNivel.length - 1]?.pontos_meta || 0;
            const metaDiaria = metaMaximaSemanal / 5;
            if (metaDiaria > 0) {
                return (func.totalPontos / metaDiaria) * 100;
            }
        }
        return 1000; // Joga quem não tem meta para o final da lista.
    };

    // 1. Renderiza a Aba de Ranking
    const costureirasPorPontos = [...costureiras].sort((a, b) => b.totalPontos - a.totalPontos);
    const tiktiksPorPontos = [...tiktiks].sort((a, b) => b.totalPontos - a.totalPontos);
    renderizarGrupo(rankingContainer, costureirasPorPontos, '🏆 Costureiras', true);
    renderizarGrupo(rankingContainer, tiktiksPorPontos, '🏆 Tiktiks', true);

    // 2. Renderiza a Aba "Radar de Metas"
    costureiras.forEach(c => c.progressoMeta = calcularProgresso(c));
    tiktiks.forEach(t => t.progressoMeta = calcularProgresso(t));
    const costureirasPorProgresso = [...costureiras].sort((a, b) => a.progressoMeta - b.progressoMeta);
    const tiktiksPorProgresso = [...tiktiks].sort((a, b) => a.progressoMeta - b.progressoMeta);
    renderizarGrupo(metasContainer, costureirasPorProgresso, '📡 Costureiras em Foco');
    renderizarGrupo(metasContainer, tiktiksPorProgresso, '📡 Tiktiks em Foco');

    // 3. Adiciona o listener para a "Lupa de Desempenho"
    document.querySelectorAll('.pg-funcionario-card-v2').forEach(card => {
        card.addEventListener('click', () => {
            abrirModalLupaDesempenho(card.dataset.funcionarioId);
        });
    });
}

/**
 * Renderiza um gráfico de barras da linha do tempo de produção do funcionário.
 * @param {Array} atividadesFuncionario - Lista de atividades do funcionário selecionado.
 */
function renderizarGraficoLinhaTempo(atividadesFuncionario) {
    const ctx = document.getElementById('grafico-linha-tempo');
    if (!ctx) return; // Se o elemento do gráfico não existir, não faz nada

    // 1. Preparar os dados para o gráfico
    const producaoPorHora = {}; // Objeto para armazenar pontos por hora, ex: { 8: 50, 9: 120 }

    atividadesFuncionario.forEach(atv => {
        const hora = new Date(atv.data_hora).getHours(); // Pega apenas a hora (0-23)
        const pontos = parseFloat(atv.pontos_gerados) || 0;

        if (!producaoPorHora[hora]) {
            producaoPorHora[hora] = 0;
        }
        producaoPorHora[hora] += pontos;
    });

    // 2. Criar labels e datasets para o Chart.js de forma dinâmica
    const horasComProducao = Object.keys(producaoPorHora).map(Number); // Pega todas as horas que tiveram atividade

    // Se não houver produção, define um padrão para não quebrar o gráfico
    if (horasComProducao.length === 0) {
        horasComProducao.push(7, 18); // Exibe um gráfico vazio das 7h às 18h
    }

    // Descobre a primeira e a última hora de atividade do dia
    const horaMinima = Math.min(...horasComProducao);
    const horaMaxima = Math.max(...horasComProducao);

    // Garante um intervalo mínimo (ex: se só trabalhou às 10h, mostra das 9h às 11h)
    const horaInicio = Math.min(horaMinima, new Date().getHours() - 1);
    const horaFim = Math.max(horaMaxima, new Date().getHours() + 1);

    const labels = [];  // Eixo X: as horas
    const data = [];    // Eixo Y: os pontos de cada hora

    for (let h = horaInicio; h <= horaFim; h++) {
        // Adiciona apenas as horas do período de trabalho real, com uma margem
        labels.push(`${String(h).padStart(2, '0')}h`);
        data.push(producaoPorHora[h] ? Math.round(producaoPorHora[h]) : 0);
    }
    
    // 3. Destruir qualquer gráfico anterior que possa existir no canvas
    // Isso é importante para quando o modal é aberto várias vezes
    if (ctx.chart) {
        ctx.chart.destroy();
    }

    // 4. Criar o novo gráfico
    ctx.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pontos Gerados',
                data: data,
                backgroundColor: 'rgba(52, 152, 219, 0.6)', // Cor das barras (azul primário com transparência)
                borderColor: 'rgba(52, 152, 219, 1)', // Cor da borda
                borderWidth: 1,
                borderRadius: 4, // Bordas arredondadas nas barras
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Permite que o gráfico preencha o container
            plugins: {
                legend: {
                    display: false // Não precisa de legenda para um único dataset
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw} pontos`; // Texto que aparece ao passar o mouse
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Pontos'
                    }
                },
                x: {
                    grid: {
                        display: false // Remove as linhas de grade verticais
                    }
                }
            }
        }
    });
}

/**
 * Renderiza a lista de itens produzidos pelo funcionário no modal "Lupa".
 * @param {Array} atividadesFuncionario - Lista de atividades do funcionário selecionado.
 */
function renderizarListaProdutosLupa(atividadesFuncionario) {
    const container = document.getElementById('pg-lupa-lista-produtos');
    if (!container) return;

    // 1. Agrupar atividades por item (produto + variação) e somar quantidades
    const producaoPorItem = {};
    atividadesFuncionario.forEach(atv => {
        // Chave única para agrupar
        const chaveItem = `${atv.nome_produto}|${atv.variacao || 'Padrão'}`;
        
        if (!producaoPorItem[chaveItem]) {
            producaoPorItem[chaveItem] = {
                nomeProduto: atv.nome_produto,
                variacao: atv.variacao,
                imagemUrl: atv.imagem_url || '/img/placeholder-image.png',
                quantidadeTotal: 0,
                // Um objeto para detalhar a quantidade por tipo de atividade
                detalhes: {}
            };
        }
        
        const item = producaoPorItem[chaveItem];
        item.quantidadeTotal += atv.quantidade;
        
        // Agrupa as quantidades por nome da atividade (ex: Fechamento, Arremate)
        const nomeAtividade = atv.nome_atividade;
        if (!item.detalhes[nomeAtividade]) {
            item.detalhes[nomeAtividade] = 0;
        }
        item.detalhes[nomeAtividade] += atv.quantidade;
    });

    // 2. Gerar o HTML dos cards para cada item
    const cardsHTML = Object.values(producaoPorItem)
        .sort((a, b) => b.quantidadeTotal - a.quantidadeTotal) // Ordena por quem produziu mais
        .map(item => {
            // Gera a lista de detalhes (ex: 20x Fechamento, 15x Arremate)
            const detalhesHTML = Object.entries(item.detalhes)
                .map(([nome, qtd]) => `
                    <li class="pg-detalhe-item">
                        <span class="pg-detalhe-atividade">${nome}</span>
                        <span class="pg-detalhe-quantidade">${qtd}</span>
                    </li>
                `).join('');

            const tituloHTML = item.variacao
                ? `${item.nomeProduto} <span class="pg-card-variacao-destaque">[${item.variacao}]</span>`
                : item.nomeProduto;

            // Usa exatamente o mesmo layout de card do modal de costura para consistência
            return `
                <div class="pg-produto-card-detalhe-v2">
                    <img src="${item.imagemUrl}" alt="Imagem de ${item.nomeProduto}" class="pg-card-imagem-produto" loading="lazy">
                    <div class="pg-card-info-produto">
                        <h4 class="pg-produto-card-titulo">${tituloHTML}</h4>
                        <ul class="pg-produto-card-lista">
                            ${detalhesHTML}
                        </ul>
                    </div>
                </div>
            `;
    }).join('');

    // 3. Insere o HTML no container
    if (cardsHTML.length > 0) {
        container.innerHTML = cardsHTML;
    } else {
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhuma produção registrada para este funcionário hoje.</p>';
    }
}


/**
 * Abre o modal "Lupa de Desempenho" com os dados agrupados do funcionário.
 * @param {string} funcionarioId - O ID do funcionário a ser analisado.
 */
function abrirModalLupaDesempenho(funcionarioId) {
    // Busca os dados do funcionário no cache
    const atividadesFuncionario = dadosDoDiaCache.atividadesDoDia.filter(atv => atv.funcionario_id == funcionarioId);
    if (atividadesFuncionario.length === 0) return;

    const funcInfo = atividadesFuncionario[0]; // Pega os dados gerais do primeiro registro

    // Calcula os totais para o cabeçalho
    const totalPontos = atividadesFuncionario.reduce((acc, atv) => acc + parseFloat(atv.pontos_gerados), 0);

    // Cria o conteúdo do modal
    const modal = document.getElementById('pg-modal-todas-atividades');
    const conteudo = modal.querySelector('.pg-modal-conteudo');
    
    // Este HTML é a nova estrutura do modal
    conteudo.innerHTML = `
        <div class="pg-lupa-header-v2">
            <img src="${funcInfo.avatar_url || '/img/default-avatar.png'}" alt="Avatar">
            <div class="pg-lupa-info-v2">
                <h2>${funcInfo.nome_funcionario}</h2>
                <p>Desempenho de Hoje</p>
            </div>
            <div class="pg-lupa-kpi-v2">
                <span>${Math.round(totalPontos)}</span>
                <label>Pontos Totais</label>
            </div>
        </div>

        <div class="pg-lupa-secao">
            <h3>Linha do Tempo (Pontos por Hora)</h3>
            <div class="pg-lupa-grafico-container">
                <!-- O GRÁFICO SERÁ INSERIDO AQUI NO PLANO 5 -->
                <canvas id="grafico-linha-tempo"></canvas>
            </div>
        </div>

        <div class="pg-lupa-secao">
            <h3>Itens Produzidos Hoje</h3>
            <div id="pg-lupa-lista-produtos" class="pg-layout-cards-v2">
                <!-- A LISTA DE PRODUTOS SERÁ INSERIDA AQUI -->
                <p>Carregando produtos...</p>
            </div>
        </div>
    `;

    adicionarBotaoFechar(conteudo, () => modal.classList.remove('ativo'));
    modal.classList.add('ativo');

    renderizarGraficoLinhaTempo(atividadesFuncionario);
    renderizarListaProdutosLupa(atividadesFuncionario);
}

/**
 * Abre um modal detalhado mostrando TUDO que foi produzido pela costura no dia,
 * agrupado por produto e variação.
 */
function abrirModalDetalhesCostura() {
    const atividadesCostura = dadosDoDiaCache.atividadesDoDia.filter(atv =>
        atv.tipo_funcionario.includes('costureira') && atv.tipo_atividade === 'processo'
    );

    if (atividadesCostura.length === 0) {
        // Opcional: mostrar uma mensagem se não houver nada
        mostrarMensagem('Nenhum processo de costura registrado para hoje.', 'info');
        return;
    }

    // 1. Agrupamento inteligente por item específico (produto + variação)
    const producaoPorItem = {};
    atividadesCostura.forEach(atv => {
        // Cria uma chave única para cada variação de produto
        const chaveItem = `${atv.nome_produto}|${atv.variacao || 'Padrão'}`;

        if (!producaoPorItem[chaveItem]) {
            producaoPorItem[chaveItem] = {
                nomeProduto: atv.nome_produto,
                variacao: atv.variacao,
                // Pega a URL da imagem da primeira atividade encontrada para este item
                imagemUrl: atv.imagem_url || '/img/placeholder-image.png', // Fallback para uma imagem padrão
                processos: {} // Objeto para agrupar processos
            };
        }

        // 2. Agrupa os processos e soma as quantidades dentro de cada item
        const processoNome = atv.nome_atividade;
        if (!producaoPorItem[chaveItem].processos[processoNome]) {
            producaoPorItem[chaveItem].processos[processoNome] = 0;
        }
        producaoPorItem[chaveItem].processos[processoNome] += atv.quantidade;
    });

    // 3. Gera o HTML dos cards para cada item produzido
    const cardsDeProdutoHTML = Object.values(producaoPorItem).map(item => {
        // Gera a lista de processos para este item
        const processosHTML = Object.entries(item.processos)
            .sort((a, b) => a[0].localeCompare(b[0])) // Ordena processos alfabeticamente
            .map(([nomeProcesso, quantidade]) => `
                <li class="pg-detalhe-item">
                    <span class="pg-detalhe-atividade">${nomeProcesso}</span>
                    <span class="pg-detalhe-quantidade">${quantidade}</span>
                </li>
            `).join('');

        // Formata o título como você pediu
        const tituloHTML = item.variacao
            ? `${item.nomeProduto} <span class="pg-card-variacao-destaque">[${item.variacao}]</span>`
            : item.nomeProduto;

        // Monta o card completo
        return `
            <div class="pg-produto-card-detalhe-v2">
                <img src="${item.imagemUrl}" alt="Imagem de ${item.nomeProduto}" class="pg-card-imagem-produto" loading="lazy">
                <div class="pg-card-info-produto">
                    <h4 class="pg-produto-card-titulo">${tituloHTML}</h4>
                    <ul class="pg-produto-card-lista">
                        ${processosHTML}
                    </ul>
                </div>
            </div>
        `;
    }).join('');

    // 4. Cria e exibe o modal com o novo layout
    const modal = document.getElementById('pg-modal-todas-atividades');
    const conteudo = modal.querySelector('.pg-modal-conteudo');

    conteudo.innerHTML = `
        <h2 class="pg-modal-titulo">Produção Detalhada da Costura (Hoje)</h2>
        <p class="pg-modal-subtitulo">O que foi produzido hoje, item por item.</p>
        <div class="pg-modal-lista-container pg-layout-cards-v2">
            ${cardsDeProdutoHTML.length > 0 ? cardsDeProdutoHTML : '<p>Nenhuma atividade de costura encontrada.</p>'}
        </div>
    `;

    adicionarBotaoFechar(conteudo, () => modal.classList.remove('ativo'));
    modal.classList.add('ativo');
}

async function filtrarPorMomentoChave() {
    if (!dadosDoDiaCache) return;

    // Pega o overlay
    const rankingOverlay = document.getElementById('ranking-loading-overlay');

    if (filtroPeriodoAtivo !== 'dia-inteiro') {
        paginaAtualFeed = 1;
    }
    
    let atividadesFiltradas = [...dadosDoDiaCache.atividadesDoDia];
    const dataBase = document.getElementById('pg-filtro-data').value;
    const getFullDate = (time) => new Date(`${dataBase}T${time}`);
    
    switch (filtroPeriodoAtivo) {
        case 'inicio-dia':
            atividadesFiltradas = atividadesFiltradas.filter(atv => new Date(atv.data_hora) < getFullDate('09:00:00'));
            break;
        case 'pico-manha':
            atividadesFiltradas = atividadesFiltradas.filter(atv => {
                const d = new Date(atv.data_hora);
                return d >= getFullDate('09:00:00') && d < getFullDate('12:00:00');
            });
            break;
        case 'vale-tarde':
            atividadesFiltradas = atividadesFiltradas.filter(atv => {
                const d = new Date(atv.data_hora);
                return d >= getFullDate('14:00:00') && d < getFullDate('16:00:00');
            });
            break;
        case 'sprint-final':
            atividadesFiltradas = atividadesFiltradas.filter(atv => new Date(atv.data_hora) >= getFullDate('16:00:00'));
            break;
    }
    
    renderizarKPIs(atividadesFiltradas, dadosDoDiaCache.totaisDiaAnterior);
    
    // MOSTRA o overlay antes de começar o trabalho pesado
    rankingOverlay.classList.add('ativo');

    // A função abaixo é a que demora, pois busca dados na API
    await renderizarRankingERadar(atividadesFiltradas, dadosDoDiaCache.regrasDeMetas);

    renderizarFeedAtividades(atividadesFiltradas);

    // ESCONDE o overlay depois que o trabalho terminou
    rankingOverlay.classList.remove('ativo');
}

/**
 * Renderiza a lista paginada de atividades recentes diretamente na página.
 * @param {Array} atividades - A lista de atividades do período.
 */
function renderizarFeedAtividades(atividades) {
    const feedContainer = document.getElementById('pg-feed-atividades');
    const paginacaoContainer = document.getElementById('paginacao-feed');

    if (!feedContainer || !paginacaoContainer) return;

    const totalPaginas = Math.ceil(atividades.length / ITENS_POR_PAGINA_FEED);
    paginaAtualFeed = Math.min(paginaAtualFeed, totalPaginas) || 1;

    const inicio = (paginaAtualFeed - 1) * ITENS_POR_PAGINA_FEED;
    const fim = inicio + ITENS_POR_PAGINA_FEED;
    const atividadesDaPagina = atividades.slice(inicio, fim);

    if (atividadesDaPagina.length === 0) {
        feedContainer.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhuma atividade neste período.</p>';
        paginacaoContainer.style.display = 'none';
        return;
    }

    feedContainer.innerHTML = atividadesDaPagina.map(atv => `
        <li>
            <span class="horario">[${new Date(atv.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}]</span> - 
            <strong>${atv.nome_funcionario.split(' ')[0]}</strong> fez 
            <strong>${atv.quantidade}</strong> de 
            <em>${atv.nome_atividade}</em> em 
            <strong>${atv.nome_produto}</strong>.
        </li>
    `).join('');

    // Lógica da Paginação
    if (totalPaginas > 1) {
        paginacaoContainer.style.display = 'flex';
        paginacaoContainer.innerHTML = `
            <button id="feed-btn-anterior" class="gs-paginacao-btn">Anterior</button>
            <span class="gs-paginacao-info">Página ${paginaAtualFeed} de ${totalPaginas}</span>
            <button id="feed-btn-proximo" class="gs-paginacao-btn">Próximo</button>
        `;
        
        const btnAnterior = document.getElementById('feed-btn-anterior');
        const btnProximo = document.getElementById('feed-btn-proximo');
        
        btnAnterior.disabled = paginaAtualFeed === 1;
        btnProximo.disabled = paginaAtualFeed === totalPaginas;
        
        btnAnterior.onclick = () => {
            if (paginaAtualFeed > 1) {
                paginaAtualFeed--;
                // OTIMIZAÇÃO: Re-renderiza apenas o feed, usando as atividades já filtradas
                renderizarFeedAtividades(atividades); 
            }
        };
        btnProximo.onclick = () => {
            if (paginaAtualFeed < totalPaginas) {
                paginaAtualFeed++;
                // OTIMIZAÇÃO: Re-renderiza apenas o feed, usando as atividades já filtradas
                renderizarFeedAtividades(atividades); 
            }
        };
    } else {
        paginacaoContainer.style.display = 'none';
    }
}

// ==========================================================================
// 5. EVENT LISTENERS E INICIALIZAÇÃO
// ==========================================================================

/**
 * Configura todos os event listeners da página.
 */
function configurarEventListeners() {
    // Listener do filtro de data
    document.getElementById('pg-filtro-data').addEventListener('change', () => {
        pararAutoAtualizacao();
        document.querySelector('.pg-momento-btn.ativo').classList.remove('ativo');
        document.querySelector('.pg-momento-btn[data-periodo="dia-inteiro"]').classList.add('ativo');
        filtroPeriodoAtivo = 'dia-inteiro';
        paginaAtualFeed = 1; // Reseta a paginação ao mudar de data
        carregarErenderizarDados();
        iniciarAutoAtualizacaoSeHoje();
    });

    // Listener do NOVO botão de atualização manual
    document.getElementById('btn-atualizar-agora').addEventListener('click', async () => {
        const btn = document.getElementById('btn-atualizar-agora');
        const icon = btn.querySelector('i');
        const span = btn.querySelector('span');

        icon.classList.add('fa-spin');
        btn.disabled = true;
        span.textContent = 'Atualizando...';

        pararAutoAtualizacao();
        
        await carregarErenderizarDados(); // Espera a conclusão
        
        // Lógica para reativar o botão após a conclusão
        icon.classList.remove('fa-spin');
        btn.disabled = false;
        span.textContent = 'Atualizar';
        iniciarAutoAtualizacaoSeHoje();
    });

    // Listeners para os botões de "Momentos-Chave"
    document.querySelectorAll('.pg-momento-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.pg-momento-btn.ativo').classList.remove('ativo');
            btn.classList.add('ativo');
            filtroPeriodoAtivo = btn.dataset.periodo;
            paginaAtualFeed = 1; // Reseta a paginação ao mudar o filtro de período
            filtrarPorMomentoChave();
        });
    });

    // Listeners das abas de Ranking/Metas
    document.getElementById('btn-tab-ranking').addEventListener('click', () => alternarAbas('ranking'));
    document.getElementById('btn-tab-metas').addEventListener('click', () => alternarAbas('metas'));
}


/**
 * Lógica para alternar a visualização das abas de Ranking e Metas.
 * @param {string} abaAtiva - 'ranking' ou 'metas'.
 */
function alternarAbas(abaAtiva) {
    const btnTabRanking = document.getElementById('btn-tab-ranking');
    const btnTabMetas = document.getElementById('btn-tab-metas');
    const contentRanking = document.getElementById('tab-content-ranking');
    const contentMetas = document.getElementById('tab-content-metas');

    btnTabRanking.classList.toggle('ativo', abaAtiva === 'ranking');
    contentRanking.classList.toggle('ativo', abaAtiva === 'ranking');
    
    btnTabMetas.classList.toggle('ativo', abaAtiva === 'metas');
    contentMetas.classList.toggle('ativo', abaAtiva === 'metas');
}

/**
 * Inicia o intervalo de auto-atualização e o indicador visual.
 */
function iniciarAutoAtualizacaoSeHoje() {
    const hoje = new Date();
    hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
    const dataCorreta = hoje.toISOString().split('T')[0];
    const dataSelecionada = document.getElementById('pg-filtro-data').value;
    const indicador = document.getElementById('indicador-ultima-att');

    if (dataSelecionada === dataCorreta) {
        if (autoAtualizacaoInterval) clearInterval(autoAtualizacaoInterval);
        
        let segundosDesdeAtualizacao = 0;
        indicador.textContent = 'Atualizado agora';

        autoAtualizacaoInterval = setInterval(() => {
            segundosDesdeAtualizacao += 1;
            if (segundosDesdeAtualizacao < 60) {
                indicador.textContent = `Atualizado há ${segundosDesdeAtualizacao}s`;
            } else {
                indicador.textContent = `Atualizado há ${Math.floor(segundosDesdeAtualizacao / 60)}min`;
            }

            // A cada 60 segundos, busca novos dados
            if (segundosDesdeAtualizacao % 60 === 0) {
                console.log('Atualizando dados automaticamente...');
                // Passo 3b: Torna a função interna 'async' e usa 'await'
                (async () => {
                    await carregarErenderizarDados();
                    segundosDesdeAtualizacao = 0; // Reseta o contador
                    indicador.textContent = 'Atualizado agora';
                })();
            }
        }, 1000); 
    } else {
        indicador.textContent = ''; 
    }
}


/**
 * Para o intervalo de auto-atualização.
 */
function pararAutoAtualizacao() {
    if (autoAtualizacaoInterval) {
        clearInterval(autoAtualizacaoInterval);
        autoAtualizacaoInterval = null;
        document.getElementById('indicador-ultima-att').textContent = '';
    }
}
/**
 * Função de inicialização que roda quando a página carrega.
 */
async function init() {
    await verificarAutenticacao('admin/producao-geral.html', ['acesso-producao-geral']);
    
    const filtroDataEl = document.getElementById('pg-filtro-data');
    const hoje = new Date();
    hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
    const dataCorreta = hoje.toISOString().split('T')[0];
    filtroDataEl.value = dataCorreta;

    configurarEventListeners();
    await carregarErenderizarDados();
    iniciarAutoAtualizacaoSeHoje();

    const overlayInicial = document.getElementById('carregamento-inicial');
    if (overlayInicial) {
        overlayInicial.style.opacity = '0';
        setTimeout(() => {
            overlayInicial.remove();
        }, 500);
    }
}

// Inicia todo o processo quando o DOM está pronto.
document.addEventListener('DOMContentLoaded', init);