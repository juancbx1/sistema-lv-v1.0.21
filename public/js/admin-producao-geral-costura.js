// imports/js/admin-producao-geral-costura.js

import { verificarAutenticacao } from '/js/utils/auth.js';
// 'getCachedData' não parece estar sendo usada diretamente aqui, mas 'obterProdutos' e 'obterOrdensFinalizadas' são.
// Se 'obterOrdensFinalizadas' for necessária para o novo card, mantenha. Caso contrário, pode remover.
import { obterProdutos, /* obterOrdensFinalizadas */ } from '/js/utils/storage.js';
import { criarGrafico } from '/js/utils/chart-utils.js';

// --- VARIÁVEIS GLOBAIS E DE CACHE ---
let graficoDiario;
let graficoComparativoGeral;
let costureiras = []; // Array para armazenar objetos de costureiras (ex: {nome: 'Nome'})

let todasAsProducoesCache = [];
let todosOsProdutosCache = [];
let costureirasCache = []; // Cache específico para a lista de costureiras

// --- FUNÇÕES UTILITÁRIAS DE DADOS ---

// Busca todas as produções da API
async function fetchProducoesAPI() {
    console.log('[fetchProducoesAPI] Iniciando busca de produções...');
    const token = localStorage.getItem('token');
    const response = await fetch('/api/producoes', {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error('[fetchProducoesAPI] Erro na resposta da API:', response.status, errorText);
        throw new Error(`Erro ao buscar produções: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log('[fetchProducoesAPI] Dados de produções recebidos:', data.length);
    return Array.isArray(data) ? data : (data.rows || []);
}

// Obtém todas as produções, usando cache
async function getTodasAsProducoesComCache() {
    if (todasAsProducoesCache.length === 0) {
        console.log("[getTodasAsProducoesComCache] Cache de produções vazio, buscando da API...");
        todasAsProducoesCache = await fetchProducoesAPI();
        console.log("[getTodasAsProducoesComCache] Cache populado com produções:", todasAsProducoesCache); // DEBUG
    } else {
        console.log("[getTodasAsProducoesComCache] Usando produções do cache:", todasAsProducoesCache.length); // DEBUG
    }
    return todasAsProducoesCache;
}

// Obtém todos os produtos, usando cache
async function getTodosOsProdutosComCache() {
    if (todosOsProdutosCache.length === 0) {
        console.log("[getTodosOsProdutosComCache] Cache de produtos vazio, buscando da API...");
        todosOsProdutosCache = await obterProdutos(); // obterProdutos() vem de storage.js
    }
    return todosOsProdutosCache;
}

// Obtém lista de costureiras, usando cache
async function getCostureirasComCache() {
    if (costureirasCache.length === 0) {
        console.log("[getCostureirasComCache] Cache de costureiras vazio, buscando...");
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/usuarios?tipo=costureira', { // A query ?tipo=costureira é uma boa otimização se seu backend a suportar
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[getCostureirasComCache] Erro na API: ${response.status} - ${errorText}`);
                throw new Error('Erro ao buscar costureiras da API');
            }
            
            // ***** CORREÇÃO AQUI *****
            const todosOsUsuariosRecebidos = await response.json(); // Armazena o resultado da API
            // *************************

            // Agora use 'todosOsUsuariosRecebidos' para filtrar
            if (Array.isArray(todosOsUsuariosRecebidos)) {
                costureirasCache = todosOsUsuariosRecebidos.filter(u => 
                    u.tipos && 
                    u.tipos.includes('costureira') && 
                    u.nome && // Adiciona verificação se u.nome existe
                    u.nome.toLowerCase() !== 'lixeira'
                );
            } else {
                console.warn("[getCostureirasComCache] Resposta da API de usuários não foi um array:", todosOsUsuariosRecebidos);
                costureirasCache = [];
            }
            
            costureiras = costureirasCache; // Atualiza a variável global 'costureiras' também
            console.log("[getCostureirasComCache] Costureiras carregadas e cacheadas:", costureirasCache.length, costureirasCache); 
        } catch (error) {
            console.error("[getCostureirasComCache] Erro ao buscar/processar costureiras:", error);
            costureirasCache = []; 
            costureiras = [];
        }
    } else {
        console.log("[getCostureirasComCache] Usando costureiras do cache:", costureirasCache.length);
    }
    return costureirasCache;
}

// --- FUNÇÕES DE ATUALIZAÇÃO DOS CARDS ---

// Card: Produção do Dia
async function atualizarGraficoDiario() {
    console.log('[atualizarGraficoDiario] Iniciando atualização...');
    const hoje = new Date();
    const dataAtualStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    console.log('[atualizarGraficoDiario] Data atual para filtro:', dataAtualStr);

    // --- PONTO DE MODIFICAÇÃO PARA MENSAGEM "SEM DADOS" ---
    const canvasEl = document.getElementById('graficoDiario'); // Pega o elemento canvas
    const semDadosEl = document.getElementById('semDadosGraficoDiario'); // Pega o elemento da mensagem
    const tituloEl = document.getElementById('tituloGrafico'); // Pega o elemento do título

    if (!canvasEl || !semDadosEl || !tituloEl) { // Verifica se os elementos existem
        console.error('[atualizarGraficoDiario] Elementos essenciais do DOM (canvas, semDados, titulo) não encontrados.');
        return;
    }
    // --- FIM DO PONTO DE MODIFICAÇÃO ---

    try {
        const producoes = await getTodasAsProducoesComCache();
        console.log('[atualizarGraficoDiario] Total de produções do cache:', producoes.length);

        const listaCostureiras = await getCostureirasComCache();
        console.log('[atualizarGraficoDiario] Lista de costureiras do cache:', listaCostureiras);
        const nomesCostureiras = listaCostureiras.map(c => c.nome);
        console.log('[atualizarGraficoDiario] Nomes das costureiras para filtro:', nomesCostureiras);

        const producoesHoje = producoes.filter(p => {
            if (!p.data) return false;
            const dataProducao = new Date(p.data);
            const dataProducaoStr = `${dataProducao.getFullYear()}-${String(dataProducao.getMonth() + 1).padStart(2, '0')}-${String(dataProducao.getDate()).padStart(2, '0')}`;
            
            const condicaoData = dataProducaoStr === dataAtualStr;
            const condicaoFuncionario = p.funcionario && nomesCostureiras.includes(p.funcionario);
            return condicaoData && condicaoFuncionario;
        });
        console.log('[atualizarGraficoDiario] Produções filtradas para hoje e por costureiras:', producoesHoje);

        const dadosAgrupados = {};
        producoesHoje.forEach(p => {
            dadosAgrupados[p.funcionario] = (dadosAgrupados[p.funcionario] || 0) + (parseInt(p.quantidade) || 0);
        });
        console.log('[atualizarGraficoDiario] Dados agrupados por costureira:', dadosAgrupados);

        // --- PONTO DE MODIFICAÇÃO PARA MENSAGEM "SEM DADOS" ---
        if (Object.keys(dadosAgrupados).length === 0) {
            console.log('[atualizarGraficoDiario] Nenhum dado para exibir no gráfico diário.');
            if (graficoDiario) {
                graficoDiario.destroy(); // Destrói instância anterior do gráfico se existir
                graficoDiario = null;    // Limpa a referência
            }
            canvasEl.style.display = 'none';    // Esconde o canvas
            semDadosEl.style.display = 'flex';  // Mostra a mensagem "sem dados"
            semDadosEl.querySelector('p').textContent = 'Nenhuma produção registrada hoje pelas costureiras.'; // Define texto da msg
            tituloEl.textContent = `Produção do Dia (${hoje.toLocaleDateString('pt-BR')})`; // Atualiza título mesmo sem gráfico
            return; // Interrompe a função aqui, não há gráfico para criar
        }

        // Se chegou aqui, há dados para mostrar
        canvasEl.style.display = 'block';   // Garante que o canvas esteja visível
        semDadosEl.style.display = 'none'; // Esconde a mensagem "sem dados"
        // --- FIM DO PONTO DE MODIFICAÇÃO ---

        const labels = Object.keys(dadosAgrupados); // Não precisa mais do ternário para 'Nenhuma produção'
        const valores = Object.values(dadosAgrupados);
        console.log('[atualizarGraficoDiario] Labels para o gráfico:', labels, "Valores:", valores);

        const cores = ['rgba(54, 162, 235, 0.6)', 'rgba(255, 159, 64, 0.6)', 'rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'];
        const bordas = cores.map(cor => cor.replace('0.6', '1'));

        if (graficoDiario) graficoDiario.destroy(); // Destrói o anterior antes de criar um novo
        
        const ctx = canvasEl.getContext('2d'); // ctx já foi pego de canvasEl
        // Não precisa mais verificar ctx aqui, pois canvasEl já foi verificado no início

        console.log('[atualizarGraficoDiario] Criando gráfico...');
        graficoDiario = criarGrafico(ctx, 'bar', labels, 'Produção', valores, cores, bordas,
            { 
                elements: { bar: { borderRadius: 0 } }, 
                scales: { x: { title: { text: 'Costureiras' } } }
            }
        );
        
        tituloEl.textContent = `Produção do Dia (${hoje.toLocaleDateString('pt-BR')})`;
        console.log('[atualizarGraficoDiario] Gráfico diário atualizado.');

    } catch (error) {
        console.error('[atualizarGraficoDiario] Erro ao atualizar gráfico:', error);
        // Em caso de erro, também pode ser útil mostrar a mensagem "sem dados" ou uma mensagem de erro
        canvasEl.style.display = 'none';
        semDadosEl.style.display = 'flex';
        semDadosEl.querySelector('p').textContent = 'Erro ao carregar dados da produção do dia.';
    }
}

// Card: Comparativo Geral
async function atualizarComparativoGeral() {
    console.log('[atualizarComparativoGeral] Atualizando...');
    
    // --- PEGAR ELEMENTOS DO DOM E VALORES DOS NOVOS FILTROS ---
    const costureiraSelecionadaFiltro = document.getElementById('cg-filtro-costureira')?.value || 'todas';
    const dataSelecionadaStr = document.getElementById('cg-filtro-data')?.value;

    const canvasEl = document.getElementById('graficoComparativoGeral');
    const semDadosEl = document.getElementById('semDadosComparativoGeral');
    const tituloH2El = document.querySelector('.comparativo-geral-card h2'); // Para atualizar o título com a data

    if (!canvasEl || !semDadosEl || !dataSelecionadaStr) {
        console.error('[atualizarComparativoGeral] Elementos do DOM (canvas, semDados, input de data) ou data não encontrados/selecionada.');
        if (semDadosEl) {
            semDadosEl.style.display = 'flex';
            semDadosEl.querySelector('p').textContent = 'Configure os filtros para ver o comparativo.';
        }
        if (canvasEl) canvasEl.style.display = 'none';
        if (graficoComparativoGeral) {
            graficoComparativoGeral.destroy();
            graficoComparativoGeral = null;
        }
        return;
    }
    // Formata a data do filtro para YYYY-MM-DD para consistência na comparação
    const dataFiltro = new Date(dataSelecionadaStr + "T00:00:00-03:00"); // Adiciona fuso local
    const dataFiltroStr = `${dataFiltro.getFullYear()}-${String(dataFiltro.getMonth() + 1).padStart(2, '0')}-${String(dataFiltro.getDate()).padStart(2, '0')}`;

    if (tituloH2El) {
        tituloH2El.textContent = `Comparativo Geral - ${dataFiltro.toLocaleDateString('pt-BR')}`;
    }
    // --- FIM DA COLETA DE FILTROS ---

    try {
        const producoes = await getTodasAsProducoesComCache();
        let listaCostureiras = await getCostureirasComCache(); // Usada para obter a lista de nomes válidos
        
        let producoesFiltradas = producoes.filter(p => {
            if (!p.data) return false;
            const dataProducao = new Date(p.data);
            const dataProducaoStr = `${dataProducao.getFullYear()}-${String(dataProducao.getMonth() + 1).padStart(2, '0')}-${String(dataProducao.getDate()).padStart(2, '0')}`;
            return dataProducaoStr === dataFiltroStr; // Filtra pela data selecionada
        });

        // Aplica filtro de costureira
        if (costureiraSelecionadaFiltro !== 'todas') {
            producoesFiltradas = producoesFiltradas.filter(p => p.funcionario === costureiraSelecionadaFiltro);
            // Se uma costureira específica for selecionada, o gráfico de pizza talvez não faça tanto sentido
            // ou mostrará 100% para ela se houver produção.
            // Poderia mudar o tipo de gráfico ou a forma de apresentar.
            // Por enquanto, mantém a lógica de pizza.
            if (tituloH2El) { // Adiciona nome da costureira ao título
                 tituloH2El.textContent = `Comparativo Geral - ${costureiraSelecionadaFiltro} - ${dataFiltro.toLocaleDateString('pt-BR')}`;
            }
        } else {
            // Se "todas", filtra para incluir apenas costureiras válidas (exclui Lixeira, etc.)
            const nomesCostureirasValidas = listaCostureiras.map(c => c.nome);
            producoesFiltradas = producoesFiltradas.filter(p => p.funcionario && nomesCostureirasValidas.includes(p.funcionario));
        }


        const dadosAgrupados = {};
        producoesFiltradas.forEach(p => {
            const funcionario = p.funcionario || 'Desconhecido'; // Deveria ser sempre um nome de costureira aqui
            dadosAgrupados[funcionario] = (dadosAgrupados[funcionario] || 0) + (parseInt(p.quantidade) || 0);
        });

        // --- LÓGICA PARA EXIBIR MENSAGEM "SEM DADOS" ---
        if (Object.keys(dadosAgrupados).length === 0) {
            console.log('[atualizarComparativoGeral] Nenhum dado para exibir.');
            if (graficoComparativoGeral) {
                graficoComparativoGeral.destroy();
                graficoComparativoGeral = null;
            }
            canvasEl.style.display = 'none';
            semDadosEl.style.display = 'flex';
            semDadosEl.querySelector('p').textContent = `Nenhuma produção encontrada para ${costureiraSelecionadaFiltro === 'todas' ? 'as costureiras' : costureiraSelecionadaFiltro} em ${dataFiltro.toLocaleDateString('pt-BR')}.`;
            return;
        }
        canvasEl.style.display = 'block';
        semDadosEl.style.display = 'none';
        // --- FIM DA LÓGICA "SEM DADOS" ---

        const totalProducao = Object.values(dadosAgrupados).reduce((sum, val) => sum + val, 0);
        const labels = Object.keys(dadosAgrupados);
        const porcentagens = Object.values(dadosAgrupados).map(val => totalProducao > 0 ? Math.round((val / totalProducao) * 100) : 0);
        
        const cores = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FFCD56', '#C9CBCF']; // Mais cores

        if (graficoComparativoGeral) graficoComparativoGeral.destroy();
        
        const ctx = canvasEl.getContext('2d');
        graficoComparativoGeral = criarGrafico(ctx, 'doughnut', labels, 'Distribuição', porcentagens, 
            cores.slice(0, labels.length), // Garante que haja cores suficientes
            cores.slice(0, labels.length).map(c => c), // Borda da mesma cor
            { 
                cutout: '60%',
                elements: { arc: { borderWidth: 2, borderColor: '#fff' } },
                plugins: {
                    legend: { position: 'right', labels: {boxWidth: 12, padding: 10, font: {size: 11}} },
                    tooltip: { callbacks: { label: context => `${context.label}: ${context.raw}% (${dadosAgrupados[context.label] || 0} processos)` } }
                }
            }
        );
    } catch (error) {
        console.error('[atualizarComparativoGeral] Erro:', error);
        canvasEl.style.display = 'none';
        semDadosEl.style.display = 'flex';
        semDadosEl.querySelector('p').textContent = 'Erro ao carregar dados do comparativo geral.';
    }
}

// Card: Produção Geral Detalhada - Popular Filtros
async function popularFiltrosProducaoGeral() { // Esta função agora também popula filtros do Comparativo Geral
    console.log("[popularFiltrosProducaoGeral] Populando filtros...");
    // Filtros do card "Produção Geral Detalhada"
    const selectCostureiraPG = document.getElementById('pg-filtro-costureira');
    const selectProdutoPG = document.getElementById('pg-filtro-produto');
    const dataInicioPGEl = document.getElementById('pg-filtro-data-inicio');
    const dataFimPGEl = document.getElementById('pg-filtro-data-fim');

    // --- NOVOS ELEMENTOS: Filtros do card "Comparativo Geral" ---
    const selectCostureiraCG = document.getElementById('cg-filtro-costureira');
    const dataCGEl = document.getElementById('cg-filtro-data');

    // Validação básica dos elementos principais
    if (!selectCostureiraPG || !selectProdutoPG || !dataInicioPGEl || !dataFimPGEl || !selectCostureiraCG || !dataCGEl) {
        console.error("[popularFiltrosProducaoGeral] Elementos de filtro (PG ou CG) não encontrados no DOM.");
        return;
    }

    try {
        const listaCostureiras = await getCostureirasComCache();
        
        // Popular costureiras para "Produção Geral Detalhada"
        selectCostureiraPG.innerHTML = '<option value="todas">Todas as Costureiras</option>';
        listaCostureiras.forEach(c => {
            const option = document.createElement('option');
            option.value = c.nome;
            option.textContent = c.nome;
            selectCostureiraPG.appendChild(option.cloneNode(true)); // Clona para o outro select
            if (selectCostureiraCG) selectCostureiraCG.appendChild(option); // Adiciona ao select do Comparativo Geral
        });
         // Garante que o select do Comparativo Geral também tenha "Todas"
        if (selectCostureiraCG && selectCostureiraCG.options[0]?.value !== "todas") {
            const todasOption = document.createElement('option');
            todasOption.value = "todas";
            todasOption.textContent = "Todas";
            selectCostureiraCG.insertBefore(todasOption, selectCostureiraCG.firstChild);
        }


        // Popular Produtos para "Produção Geral Detalhada"
        const listaProdutos = await getTodosOsProdutosComCache();
        selectProdutoPG.innerHTML = '<option value="todos">Todos os Produtos</option>';
        listaProdutos.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")).forEach(p => {
            const option = document.createElement('option');
            option.value = p.nome;
            option.textContent = p.nome;
            selectProdutoPG.appendChild(option);
        });

        // Definir datas padrão para "Produção Geral Detalhada" (Semana Atual)
        const hoje = new Date();
        const diaDaSemana = hoje.getDay();
        const dataInicioSemana = new Date(hoje);
        dataInicioSemana.setDate(hoje.getDate() - diaDaSemana);
        const dataFimSemana = new Date(dataInicioSemana);
        dataFimSemana.setDate(dataInicioSemana.getDate() + 6);

        const formatarDataParaInput = (dateObj) => {
            // ... (função formatarDataParaInput como definida anteriormente) ...
            if (!(dateObj instanceof Date) || isNaN(dateObj.valueOf())) { 
                const fallbackDate = new Date();
                return `${fallbackDate.getFullYear()}-${String(fallbackDate.getMonth() + 1).padStart(2, '0')}-${String(fallbackDate.getDate()).padStart(2, '0')}`;
            }
            const ano = dateObj.getFullYear();
            const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dia = String(dateObj.getDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        };

        dataInicioPGEl.value = formatarDataParaInput(dataInicioSemana);
        dataFimPGEl.value = formatarDataParaInput(dataFimSemana);

        // --- Definir data padrão para "Comparativo Geral" (Hoje) ---
        if (dataCGEl) dataCGEl.value = formatarDataParaInput(new Date()); // Data de hoje

        console.log("[popularFiltrosProducaoGeral] Filtros populados.");

    } catch (error) {
        console.error("[popularFiltrosProducaoGeral] Erro ao popular filtros:", error);
    }
}

// Card: Produção Geral Detalhada - Aplicar Filtros e Renderizar Tabela
async function aplicarFiltrosProducaoGeral() {
    console.log("[aplicarFiltrosProducaoGeral] Aplicando filtros (versão compilada por produto)...");
    const costureiraFiltro = document.getElementById('pg-filtro-costureira').value;
    const dataInicioStr = document.getElementById('pg-filtro-data-inicio').value;
    const dataFimStr = document.getElementById('pg-filtro-data-fim').value;
    const produtoFiltro = document.getElementById('pg-filtro-produto').value;

    const tabelaCorpo = document.getElementById('corpoTabelaProducaoGeral');
    const tabelaEl = document.getElementById('tabelaProducaoGeral');
    const totalProduzidoEl = document.getElementById('pg-total-produzido');
    const mensagemResultadosEl = document.querySelector('.resultados-producao-geral p');

    // Certifique-se que os cabeçalhos da tabela no HTML correspondam a esta nova visão
    // Ex: Costureira | Produto | Quantidade
    // Precisaremos ajustar o HTML da tabela se as colunas mudarem significativamente.

    if (!tabelaCorpo || !tabelaEl || !totalProduzidoEl || !mensagemResultadosEl) return;

    tabelaCorpo.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>'; // Ajustar colspan se mudar colunas
    tabelaEl.style.display = 'table';
    mensagemResultadosEl.style.display = 'none';

    if (!dataInicioStr || !dataFimStr) {
        tabelaCorpo.innerHTML = '<tr><td colspan="3">Selecione as datas.</td></tr>';
        return;
    }
    const dataInicio = new Date(dataInicioStr + "T00:00:00-03:00");
    const dataFim = new Date(dataFimStr + "T23:59:59-03:00");

    if (dataFim < dataInicio) {
        tabelaCorpo.innerHTML = '<tr><td colspan="3">Data fim inválida.</td></tr>';
        return;
    }

    const todasProducoes = await getTodasAsProducoesComCache();
    const listaCostureiras = await getCostureirasComCache(); 
    const nomesCostureirasValidas = listaCostureiras.map(c => c.nome);

    let producoesFiltradas = todasProducoes.filter(p => {
        const dataProducao = new Date(p.data);
        return dataProducao >= dataInicio && dataProducao <= dataFim &&
               p.funcionario && nomesCostureirasValidas.includes(p.funcionario); // JÁ FILTRA AQUI
    });

    if (costureiraFiltro !== 'todas') {
        producoesFiltradas = producoesFiltradas.filter(p => p.funcionario === costureiraFiltro);
    }
    // Não precisamos mais do "else" para excluir Lixeira aqui, pois o filtro por `nomesCostureirasValidas` já fez isso.

    if (produtoFiltro !== 'todos') {
        producoesFiltradas = producoesFiltradas.filter(p => p.produto === produtoFiltro);
    }

    if (producoesFiltradas.length === 0) {
        tabelaCorpo.innerHTML = '<tr><td colspan="3">Nenhuma produção encontrada.</td></tr>';
        totalProduzidoEl.textContent = 'Total Produzido: 0';
        return;
    }

    // Agrupar por Costureira e Produto
    const dadosAgrupados = {};
    producoesFiltradas.forEach(p => {
        const chave = `${p.funcionario}#-#${p.produto}`; // Chave de agrupamento
        if (!dadosAgrupados[chave]) {
            dadosAgrupados[chave] = {
                costureira: p.funcionario,
                produto: p.produto,
                quantidade: 0
            };
        }
        dadosAgrupados[chave].quantidade += (parseInt(p.quantidade) || 0);
    });

    const resultadosFinais = Object.values(dadosAgrupados);
    // Ordenar: primeiro por costureira, depois por produto
    resultadosFinais.sort((a, b) => {
        const compCostureira = (a.costureira || "").localeCompare(b.costureira || "");
        if (compCostureira !== 0) return compCostureira;
        return (a.produto || "").localeCompare(b.produto || "");
    });


    let totalQuantidadeGeral = 0;
    tabelaCorpo.innerHTML = '';
    resultadosFinais.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.costureira || 'N/A'}</td>
            <td>${item.produto || 'N/A'}</td>
            <td>${item.quantidade}</td>
        `;
        tabelaCorpo.appendChild(tr);
        totalQuantidadeGeral += item.quantidade;
    });
    totalProduzidoEl.textContent = `Total Produzido (Processos): ${totalQuantidadeGeral}`;
}


// --- BLOCO PRINCIPAL DE EXECUÇÃO (IIFE) ---
(async () => {
    console.log('[IIFE] Iniciando script Produção Geral de Costura...');
    const auth = await verificarAutenticacao('producao-geral-costura.html', ['acesso-producao-geral-costura']);
    if (!auth) {
        console.error('[IIFE] Autenticação falhou. Encerrando script.');
        document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Acesso não autorizado. Você será redirecionado.</p>';
        // verificarAutenticacao já deve redirecionar, mas pode forçar aqui se necessário.
        return;
    }
    console.log('[IIFE] Autenticação bem-sucedida.');

    // Garante que a lista de costureiras seja carregada uma vez para uso global
    await getCostureirasComCache(); // GARANTIR QUE ESTÁ AQUI E FUNCIONA
    console.log('[IIFE] Costureiras (global) após getCostureirasComCache:', costureiras); // DEBUG

    await popularFiltrosProducaoGeral(); 
    await aplicarFiltrosProducaoGeral(); 

    await atualizarGraficoDiario();
    await atualizarComparativoGeral(); // Chamada inicial após filtros serem populados com padrão

    // Registra Event Listeners
    document.getElementById('atualizarGrafico')?.addEventListener('click', async () => {
        todasAsProducoesCache = []; // Limpa cache para forçar nova busca
        await atualizarGraficoDiario();
    });

    document.getElementById('pg-btn-aplicar-filtros')?.addEventListener('click', aplicarFiltrosProducaoGeral);
    
    // --- NOVOS Listeners para filtros do Comparativo Geral ---
    const filtroCostureiraCG = document.getElementById('cg-filtro-costureira');
    const filtroDataCG = document.getElementById('cg-filtro-data');

    if (filtroCostureiraCG) {
        filtroCostureiraCG.addEventListener('change', atualizarComparativoGeral);
    }
    if (filtroDataCG) {
        filtroDataCG.addEventListener('change', atualizarComparativoGeral);
    }
    // --- FIM DOS NOVOS Listeners ---

    console.log('[IIFE] Script Produção Geral de Costura inicializado.');
})();