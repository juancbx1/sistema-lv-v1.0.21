import { verificarAutenticacao } from '/js/utils/auth.js';
import { formatarData } from '/js/utils/date-utils.js';
import { ciclos } from '/js/utils/ciclos.js';
import { calcularComissaoSemanal } from '/js/utils/metas.js';

let permissoes = [];
let usuarioLogado = null;
let cachedUsuarios = null;
let cachedProdutos = null;
let allProducoes = null; // Cache para todos os lançamentos de produção relevantes
let cachedComissoesPagas = null;

async function obterUsuariosAPI(forceUpdate = false) {
    if (cachedUsuarios && !forceUpdate) {
        return cachedUsuarios;
    }
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/usuarios', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error(`Erro ao buscar usuários: ${response.statusText}`);
        }
        cachedUsuarios = await response.json();
        return cachedUsuarios;
    } catch (error) {
        console.error('[obterUsuariosAPI] Erro:', error);
        mostrarPopupMensagem(`Erro ao carregar dados dos usuários: ${error.message}`, 'erro');
        return [];
    }
} 

async function obterProdutosAPI(forceUpdate = false) {
    if (cachedProdutos && !forceUpdate) {
        return cachedProdutos;
    }
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/produtos', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error(`Erro ao buscar produtos: ${response.statusText}`);
        }
        cachedProdutos = await response.json();
        return cachedProdutos;
    } catch (error) {
        console.error('[obterProdutosAPI] Erro:', error);
        mostrarPopupMensagem(`Erro ao carregar dados dos produtos: ${error.message}`, 'erro');
        return [];
    }
}

async function obterDadosProducaoAPI(forceUpdate = false) {
    if (allProducoes && !forceUpdate) {
        console.log('[obterDadosProducaoAPI] Retornando produções do cache simples.');
        return allProducoes;
    }

    console.log('[obterDadosProducaoAPI] Buscando produções da API...');
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/producoes', { // Não precisa de ?all=true aqui, a API decide
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Erro ao buscar dados de produção: ${response.statusText} - ${errorData.error || ''}`);
        }
        allProducoes = await response.json();
        console.log(`[obterDadosProducaoAPI] ${allProducoes.length} produções recebidas.`);
        return allProducoes;
    } catch (error) {
        console.error('[obterDadosProducaoAPI] Erro:', error);
        mostrarPopupMensagem(`Erro ao carregar dados de produção: ${error.message}`, 'erro');
        return []; // Retorna array vazio em caso de erro para não quebrar as funções seguintes
    }
}

function preencherSelect(selectElement, defaultOptionText, items, valueField = 'nome', textField = 'nome') {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${defaultOptionText}</option>`;
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueField];
        option.textContent = item[textField];
        selectElement.appendChild(option);
    });
}

function mostrarPopupMensagem(mensagem, tipo = 'erro') {
    console.log(`POPUP (${tipo}): ${mensagem}`);
    alert(`POPUP (${tipo}): ${mensagem}`); // Placeholder
}

async function carregarFiltrosRelatorio() {
    const filtroCostureiraEl = document.getElementById('rc-filter-costureira');
    const filtroCicloEl = document.getElementById('rc-filter-ciclo');

    if (filtroCostureiraEl) filtroCostureiraEl.disabled = true;
    if (filtroCicloEl) filtroCicloEl.disabled = true;

    const usuarios = cachedUsuarios; 
    if (!usuarios) {
        console.error("Erro: Usuários não carregados antes de carregar filtros.");
        mostrarPopupMensagem("Não foi possível carregar os filtros de costureira.", "erro");
        return; // Impede a continuação se os usuários não estiverem disponíveis
    }

    if (filtroCostureiraEl) {
        const costureirasSelecionaveis = usuarios.filter(u => 
            u.tipos && u.tipos.includes('costureira') && 
            u.nome && u.nome.toLowerCase() !== 'lixeira'
        );

        preencherSelect(filtroCostureiraEl, 'Selecione uma costureira', costureirasSelecionaveis, 'nome', 'nome');

        if (costureirasSelecionaveis.length > 0) {
            if (usuarioLogado.tipos && usuarioLogado.tipos.includes('costureira') &&
                usuarioLogado.nome.toLowerCase() !== 'lixeira' &&
                !permissoes.includes('acesso-total-relatorio-comissao')) {
                filtroCostureiraEl.value = usuarioLogado.nome;
                filtroCostureiraEl.disabled = true;
            } else {
                filtroCostureiraEl.disabled = false;
                const randomIndex = Math.floor(Math.random() * costureirasSelecionaveis.length);
                filtroCostureiraEl.value = costureirasSelecionaveis[randomIndex].nome;
            }
        } else {
             filtroCostureiraEl.disabled = true;
        }
        filtroCostureiraEl.onchange = atualizarRelatorio; 
    }

    if (filtroCicloEl) {
        filtroCicloEl.innerHTML = ''; // Limpa opções anteriores
        ciclos.forEach((ciclo, index) => {
            const option = document.createElement('option');
            option.value = index; // Armazena o índice do ciclo no array 'ciclos'
            option.textContent = ciclo.nome;
            filtroCicloEl.appendChild(option);
        });

        const dataParaReferenciaCiclo = new Date(); // USA A DATA ATUAL REAL
        const hojeNormalizado = new Date(dataParaReferenciaCiclo.getFullYear(), dataParaReferenciaCiclo.getMonth(), dataParaReferenciaCiclo.getDate());

        let indiceCicloASerSelecionado = -1;
        let indiceUltimoCicloFinalizado = -1;

        for (let i = 0; i < ciclos.length; i++) {
            const ciclo = ciclos[i];
            if (ciclo.semanas && ciclo.semanas.length > 0) {
                const primeiraSemanaDoCiclo = ciclo.semanas[0];
                const ultimaSemanaDoCiclo = ciclo.semanas[ciclo.semanas.length - 1];

                // As datas de início e fim do ciclo completo, normalizadas para comparação
                const dataInicioCiclo = new Date(primeiraSemanaDoCiclo.inicio + 'T00:00:00-03:00');
                const dataFimCiclo = new Date(ultimaSemanaDoCiclo.fim + 'T23:59:59-03:00');
                
                const dataInicioCicloNormalizada = new Date(dataInicioCiclo.getFullYear(), dataInicioCiclo.getMonth(), dataInicioCiclo.getDate());
                const dataFimCicloNormalizada = new Date(dataFimCiclo.getFullYear(), dataFimCiclo.getMonth(), dataFimCiclo.getDate());

                // 1. Verificar se hoje está dentro deste ciclo
                if (hojeNormalizado >= dataInicioCicloNormalizada && hojeNormalizado <= dataFimCicloNormalizada) {
                    indiceCicloASerSelecionado = i;
                    break; // Encontrou o ciclo atual, pode parar de procurar
                }

                // 2. Se não for o ciclo atual, verificar se é o último finalizado até agora
                if (dataFimCicloNormalizada < hojeNormalizado) {
                    // Este ciclo terminou antes de hoje.
                    // Se 'indiceUltimoCicloFinalizado' ainda não foi setado, ou se este ciclo
                    // terminou DEPOIS do que já estava em 'indiceUltimoCicloFinalizado', atualizamos.
                    if (indiceUltimoCicloFinalizado === -1 || dataFimCicloNormalizada > new Date(ciclos[indiceUltimoCicloFinalizado].semanas[ciclos[indiceUltimoCicloFinalizado].semanas.length -1].fim + 'T23:59:59-03:00')) {
                        indiceUltimoCicloFinalizado = i;
                    }
                }
            }
        }
        
        // Definir o valor do select com base na prioridade
        if (indiceCicloASerSelecionado !== -1) {
            filtroCicloEl.value = indiceCicloASerSelecionado; // Prioridade 1: Ciclo atual
        } else if (indiceUltimoCicloFinalizado !== -1) {
            filtroCicloEl.value = indiceUltimoCicloFinalizado; // Prioridade 2: Último ciclo finalizado
        } else if (ciclos.length > 0) {
            filtroCicloEl.value = 0; // Fallback: Primeiro ciclo da lista
        } else {
            filtroCicloEl.value = ''; // Nenhum ciclo disponível
        }
        
        filtroCicloEl.disabled = false;
        // Atribui o onchange DEPOIS de definir o valor inicial
        filtroCicloEl.onchange = atualizarRelatorio; 
    }

    console.log("[carregarFiltrosRelatorio] Filtros configurados. Chamando atualizarRelatorio...");
    await atualizarRelatorio(); 
}

async function atualizarRelatorio() {
    const costureiraSelecionadaNome = document.getElementById('rc-filter-costureira')?.value;
    const filtroCicloIndex = document.getElementById('rc-filter-ciclo')?.value;

    // Elementos do DOM
    const totalProcessosEl = document.getElementById('rc-total-processos');
    const totalPontosEl = document.getElementById('rc-total-pontos');
    const comissionEl = document.getElementById('rc-comission-value');
    const semanasList = document.getElementById('rc-weeks-list');
    const comissionBox = document.querySelector('.rc-comission-box');

    // Limpar status de pagamento e botão anteriores
    if (comissionBox) {
        const oldStatus = comissionBox.querySelector('.rc-status-pagamento');
        if (oldStatus) oldStatus.remove();
        const oldButton = comissionBox.querySelector('.btn-confirmar-pagamento');
        if (oldButton) oldButton.remove();
    }

    if (!costureiraSelecionadaNome || filtroCicloIndex === undefined || filtroCicloIndex === "") {
        if (totalProcessosEl) totalProcessosEl.textContent = '0';
        if (totalPontosEl) totalPontosEl.textContent = '0';
        if (comissionEl) {
            comissionEl.textContent = `R$ 0,00`;
            comissionEl.classList.remove('nao-bateu');
        }
        if (semanasList) semanasList.innerHTML = '<p>Selecione uma costureira e um ciclo.</p>';
        return;
    }

    const producoes = allProducoes;
    const produtos = cachedProdutos;
    const usuarios = cachedUsuarios;

    if (!producoes || !produtos || !usuarios) {
        console.warn("[atualizarRelatorio] Dados essenciais (produções, produtos, ou usuários) não estão carregados no cache. Verifique a inicialização.");
        mostrarPopupMensagem("Dados essenciais não carregados. Tente recarregar.", "erro");
        // Limpa a UI para indicar o problema
        if (totalProcessosEl) totalProcessosEl.textContent = '0';
        if (totalPontosEl) totalPontosEl.textContent = '0';
        if (comissionEl) {
            comissionEl.textContent = `R$ 0,00`;
            comissionEl.classList.remove('nao-bateu');
        }
        if (semanasList) semanasList.innerHTML = '<p>Erro ao carregar dados base.</p>';
        return;
    }

    const cicloSelecionado = ciclos[parseInt(filtroCicloIndex)];
    if (!cicloSelecionado) {
        console.warn("[atualizarRelatorio] Ciclo selecionado não encontrado para o índice:", filtroCicloIndex);
        return;
    }

    const costureiraObj = usuarios.find(u => u.nome === costureiraSelecionadaNome);
    const nivelCostureira = costureiraObj?.nivel || 1;

    let totalProcessosCrusCiclo = 0;
    let totalPontosPonderadosCiclo = 0;
    let comissaoTotalDoCicloCalculada = 0;

    const dataReferenciaHoje = new Date(); 
    const hojeParaComparacao = new Date(dataReferenciaHoje.getFullYear(), dataReferenciaHoje.getMonth(), dataReferenciaHoje.getDate());

    if (semanasList) {
        semanasList.innerHTML = ''; // Limpa a lista de semanas antes de preencher
        cicloSelecionado.semanas.forEach((semana, index) => {
            const inicioSemanaDate = new Date(semana.inicio + 'T00:00:00-03:00');
            const fimSemanaDate = new Date(semana.fim + 'T23:59:59-03:00');

            const producoesDaSemanaParaCostureira = producoes.filter(p => {
                const dataProducao = new Date(p.data);
                return p.funcionario === costureiraSelecionadaNome &&
                    dataProducao >= inicioSemanaDate &&
                    dataProducao <= fimSemanaDate;
            });

            let pontosSemanaPonderados = 0;
            let processosSemanaCrus = 0; // Mantém para o total de peças se necessário
            producoesDaSemanaParaCostureira.forEach(p => {
                processosSemanaCrus += p.quantidade; // Soma a quantidade de peças
            console.log(`Processando prod ID: ${p.id}, OP: ${p.op_numero}, Qtd: ${p.quantidade}, Pontos Gerados (raw): '${p.pontos_gerados}', Tipo: ${typeof p.pontos_gerados}`);
                // Usar os pontos_gerados diretamente do registro de produção
                
            let pontosParaEsteLancamento = 0; // Começa com 0 para este lançamento

            if (p.pontos_gerados !== undefined && p.pontos_gerados !== null && String(p.pontos_gerados).trim() !== "") {
            const valorFloat = parseFloat(p.pontos_gerados);
            
            if (!isNaN(valorFloat)) { // Verifica se a conversão para float foi bem-sucedida
                    pontosParaEsteLancamento = valorFloat;
                } else {
                    // Se parseFloat falhou (ex: p.pontos_gerados era uma string não numérica)
                    console.warn(`WARN: p.pontos_gerados para ID ${p.id} ('${p.pontos_gerados}') não pôde ser convertido para um número válido. Usando quantidade como fallback.`);
                    pontosParaEsteLancamento = p.quantidade; // Fallback: usa a quantidade
                }
            } else {
                // Se p.pontos_gerados é undefined, null, ou string vazia
                console.warn(`WARN: Produção ID ${p.id} não possui valor válido em 'pontos_gerados' ('${p.pontos_gerados}'). Usando quantidade como fallback.`);
                pontosParaEsteLancamento = p.quantidade; // Fallback: usa a quantidade
            }
            console.log(`Pontos calculados para este lançamento (ID ${p.id}): ${pontosParaEsteLancamento}`);
            pontosSemanaPonderados += pontosParaEsteLancamento;
        });
            console.log(`Fim do loop da semana: processosSemanaCrus = ${processosSemanaCrus}, pontosSemanaPonderados = ${pontosSemanaPonderados}`);

            totalProcessosCrusCiclo += processosSemanaCrus; // Acumula processos crus do ciclo
            totalPontosPonderadosCiclo += pontosSemanaPonderados; // Acumula pontos ponderados do ciclo

            const comissaoDaSemana = calcularComissaoSemanal(
                pontosSemanaPonderados,
                nivelCostureira,
                producoesDaSemanaParaCostureira,
                produtos // Passa a lista completa de produtos para calcularComissaoSemanal
            );

            let comissaoSemanaValor = 0;
            if (typeof comissaoDaSemana === 'number') {
                comissaoSemanaValor = comissaoDaSemana;
                comissaoTotalDoCicloCalculada += comissaoSemanaValor;
            }

            const inicioSemanaParaComparacao = new Date(inicioSemanaDate.getFullYear(), inicioSemanaDate.getMonth(), inicioSemanaDate.getDate());
            const fimSemanaParaComparacao = new Date(fimSemanaDate.getFullYear(), fimSemanaDate.getMonth(), fimSemanaDate.getDate());
            const isSemanaAtual = hojeParaComparacao >= inicioSemanaParaComparacao && hojeParaComparacao <= fimSemanaParaComparacao;

            const semanaDiv = document.createElement('div');
            semanaDiv.className = 'rc-week-item';
            semanaDiv.innerHTML = `
                <button class="${isSemanaAtual ? 'semana-atual' : ''}">
                    S${index + 1} (${formatarData(semana.inicio)} a ${formatarData(semana.fim)})
                </button>
                <span class="${isSemanaAtual ? 'processos-atual' : ''}">
                    ${Math.round(pontosSemanaPonderados)} ${pontosSemanaPonderados === 1 ? 'Ponto' : 'Pontos'}
                    (Comissão Sem.: R$ ${comissaoSemanaValor.toFixed(2).replace('.', ',')})
                    ${typeof comissaoDaSemana !== 'number' ? ` (Faltam ${comissaoDaSemana.faltam} pts p/ meta)` : ''}
                </span>
            `;
            semanasList.appendChild(semanaDiv);
        });
    }

    if (totalProcessosEl) totalProcessosEl.textContent = Math.round(totalProcessosCrusCiclo);
    if (totalPontosEl) totalPontosEl.textContent = Math.round(totalPontosPonderadosCiclo);

    if (comissionEl && comissionBox) {
        comissionEl.textContent = `R$ ${comissaoTotalDoCicloCalculada.toFixed(2).replace('.', ',')}`;
        comissionEl.classList.toggle('nao-bateu', comissaoTotalDoCicloCalculada === 0 && totalPontosPonderadosCiclo > 0);

        const statusPagamentoEl = document.createElement('p');
        statusPagamentoEl.className = 'rc-status-pagamento';

        const ultimaSemanaDoCiclo = cicloSelecionado.semanas[cicloSelecionado.semanas.length - 1];
        const dataFimCicloSelecionado = new Date(ultimaSemanaDoCiclo.fim + 'T23:59:59-03:00');

        let dataPrevistaPagamento;
        const diaFimCiclo = dataFimCicloSelecionado.getDate();
        let mesCalculo = dataFimCicloSelecionado.getMonth();
        let anoCalculo = dataFimCicloSelecionado.getFullYear();

        if (diaFimCiclo < 15) {
            dataPrevistaPagamento = new Date(anoCalculo, mesCalculo, 15);
        } else {
            mesCalculo++;
            if (mesCalculo > 11) {
                mesCalculo = 0;
                anoCalculo++;
            }
            dataPrevistaPagamento = new Date(anoCalculo, mesCalculo, 15);
        }
        
        const comissaoJaPaga = await verificarSeComissaoFoiPaga(costureiraSelecionadaNome, cicloSelecionado.nome);
        
        if (hojeParaComparacao > dataFimCicloSelecionado) { 
            if (comissaoJaPaga && comissaoJaPaga.pago) {
                statusPagamentoEl.textContent = `PAGO em ${formatarData(new Date(comissaoJaPaga.data_pagamento_efetivo).toISOString().split('T')[0])} (Confirmado por: ${comissaoJaPaga.confirmado_por_nome || 'N/A'}) (Ref. ${cicloSelecionado.nome})`;
                statusPagamentoEl.style.color = 'darkblue';
            } else if (comissaoTotalDoCicloCalculada > 0) {
                let textoStatus = `Pagar até ${formatarData(dataPrevistaPagamento.toISOString().split('T')[0])}`;
                let corStatus = 'green';

                if (hojeParaComparacao >= dataPrevistaPagamento) {
                    textoStatus = `Pagamento ATRASADO desde ${formatarData(dataPrevistaPagamento.toISOString().split('T')[0])}`;
                    corStatus = 'red';
                }
                statusPagamentoEl.textContent = `${textoStatus} (Ref. ${cicloSelecionado.nome})`;
                statusPagamentoEl.style.color = corStatus;

                if (permissoes.includes('confirmar-pagamento-comissao')) { 
                    const btnConfirmarPagamento = document.createElement('button');
                    btnConfirmarPagamento.textContent = 'Confirmar Pagamento Deste Ciclo';
                    btnConfirmarPagamento.className = 'btn-confirmar-pagamento';
                    btnConfirmarPagamento.style.marginLeft = '10px';
                    btnConfirmarPagamento.dataset.costureiraNome = costureiraSelecionadaNome;
                    btnConfirmarPagamento.dataset.cicloNome = cicloSelecionado.nome;
                    btnConfirmarPagamento.dataset.cicloInicio = cicloSelecionado.semanas[0].inicio;
                    btnConfirmarPagamento.dataset.cicloFim = ultimaSemanaDoCiclo.fim;
                    btnConfirmarPagamento.dataset.valorComissao = comissaoTotalDoCicloCalculada.toFixed(2);
                    btnConfirmarPagamento.dataset.dataPrevistaPagamento = dataPrevistaPagamento.toISOString().split('T')[0];
                    btnConfirmarPagamento.onclick = async () => handleConfirmarPagamento(btnConfirmarPagamento.dataset);
                    statusPagamentoEl.appendChild(btnConfirmarPagamento);
                }
            } else { 
                statusPagamentoEl.textContent = `Ciclo finalizado sem comissão a pagar (Ref. ${cicloSelecionado.nome}).`;
                statusPagamentoEl.style.color = 'grey';
            }
        } else { 
            statusPagamentoEl.textContent = `Ciclo em andamento. Finaliza em: ${formatarData(ultimaSemanaDoCiclo.fim)}. (Comissão parcial: R$ ${comissaoTotalDoCicloCalculada.toFixed(2).replace('.',',')})`;
            statusPagamentoEl.style.color = 'orange';
        }
        comissionBox.appendChild(statusPagamentoEl);
    }
    // Atualiza a lista de comissões pagas sempre que o relatório principal for atualizado
    await carregarComissoesPagas(); 
}

async function handleConfirmarPagamento(dadosComissao) {
    console.log("Confirmar pagamento para:", dadosComissao);
    const { costureiraNome, cicloNome, cicloInicio, cicloFim, valorComissao, dataPrevistaPagamento } = dadosComissao;

    if (!confirm(`Confirma o pagamento da comissão de R$ ${valorComissao} para ${costureiraNome} referente ao ciclo ${cicloNome} (${formatarData(cicloInicio)} - ${formatarData(cicloFim)})?`)) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/comissoes-pagas', { // << CRIAR ESTA API (POST) >>
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                costureira_nome: costureiraNome,
                ciclo_nome: cicloNome,
                ciclo_inicio: cicloInicio,
                ciclo_fim: cicloFim,
                valor_pago: parseFloat(valorComissao),
                data_prevista_pagamento: dataPrevistaPagamento,
                data_pagamento_efetivo: new Date().toISOString(), // Data atual da confirmação
                confirmado_por_nome: usuarioLogado.nome // Ou ID do usuário
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Falha ao registrar pagamento da comissão.');
        }
        const resultado = await response.json();
        mostrarPopupMensagem(`Pagamento da comissão para ${costureiraNome} (Ciclo: ${cicloNome}) registrado com sucesso! ID: ${resultado.id}`, 'sucesso');
        
        cachedComissoesPagas = null; 
        await atualizarRelatorio(); // Re-renderiza o status e o botão

    } catch (error) {
        console.error("Erro ao registrar pagamento da comissão:", error);
        mostrarPopupMensagem(`Erro ao registrar pagamento: ${error.message}`, 'erro');
    }
}

async function verificarSeComissaoFoiPaga(costureiraNome, cicloNome) {
    if (!cachedComissoesPagas) {
        await obterComissoesPagasAPI(); // Popula cachedComissoesPagas
    }
    if (cachedComissoesPagas) {
        const paga = cachedComissoesPagas.find(cp => cp.costureira_nome === costureiraNome && cp.ciclo_nome === cicloNome);
        return paga ? { pago: true, ...paga } : { pago: false };
    }
    return { pago: false }; // Fallback
}

async function obterComissoesPagasAPI(filtros = {}, forceUpdate = false) {
    if (cachedComissoesPagas && !forceUpdate && Object.keys(filtros).length === 0) { // Cache simples para busca geral
        return cachedComissoesPagas;
    }
    console.log("Buscando comissões pagas da API com filtros:", filtros);
    const queryParams = new URLSearchParams();
    if (filtros.costureiraNome) queryParams.append('costureira_nome', filtros.costureiraNome);
    if (filtros.mesPagamento) queryParams.append('mes_pagamento', filtros.mesPagamento); // YYYY-MM

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/comissoes-pagas?${queryParams.toString()}`, { // << CRIAR ESTA API (GET) >>
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Erro ao buscar comissões pagas: ${response.statusText} (${errData.error || ''})`);
        }
        const data = await response.json();
        if (Object.keys(filtros).length === 0) { // Só atualiza cache geral se não houver filtros específicos
            cachedComissoesPagas = data;
        }
        return data;
    } catch (error) {
        console.error("[obterComissoesPagasAPI] Erro:", error);
        mostrarPopupMensagem(`Erro ao carregar comissões pagas: ${error.message}`, 'erro');
        return [];
    }
}

async function popularFiltrosComissoesPagas() {
    const filtroCostureiraEl = document.getElementById('rc-paid-filter-costureira');
    const mesPagamentoEl = document.getElementById('rc-paid-filter-month'); // Adicione esta linha para pegar o elemento

    const usuarios = cachedUsuarios || await obterUsuariosAPI(); 
    const costureiras = usuarios.filter(u => 
        u.tipos && u.tipos.includes('costureira') &&
        u.nome && u.nome.toLowerCase() !== 'lixeira' // Já corrigido
    );

    if (filtroCostureiraEl) {
        preencherSelect(filtroCostureiraEl, 'Todas as Costureiras', costureiras, 'nome', 'nome');
        if (usuarioLogado.tipos && usuarioLogado.tipos.includes('costureira') && !permissoes.includes('acesso-total-relatorio-comissao')) {
            filtroCostureiraEl.value = usuarioLogado.nome;
            filtroCostureiraEl.disabled = true;
        }
    }

    // Adicione este bloco para pré-selecionar o mês atual
    if (mesPagamentoEl) {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = (hoje.getMonth() + 1).toString().padStart(2, '0'); // Mês é 0-indexado, +1 para o formato AAAA-MM
        mesPagamentoEl.value = `${ano}-${mes}`;
    }
    
    document.getElementById('rc-apply-paid-filters-btn')?.addEventListener('click', carregarComissoesPagas);
}

async function carregarComissoesPagas() {
    const costureiraNomeFiltro = document.getElementById('rc-paid-filter-costureira')?.value;
    const mesPagamentoFiltro = document.getElementById('rc-paid-filter-month')?.value; // YYYY-MM

    const filtros = {};
    if (costureiraNomeFiltro) filtros.costureiraNome = costureiraNomeFiltro;
    if (mesPagamentoFiltro) filtros.mesPagamento = mesPagamentoFiltro;
    
    const comissoesPagas = await obterComissoesPagasAPI(filtros, true);

    const tbody = document.getElementById('rc-paid-comissions-tbody');
    const noDataMsgEl = document.getElementById('rc-no-paid-comissions-message');

    if (!tbody || !noDataMsgEl) return;
    tbody.innerHTML = ''; // Limpa tabela

    if (comissoesPagas && comissoesPagas.length > 0) {
        noDataMsgEl.style.display = 'none';
        comissoesPagas.sort((a,b) => new Date(b.data_pagamento_efetivo || b.created_at) - new Date(a.data_pagamento_efetivo || a.created_at)); // Mais recentes primeiro

                comissoesPagas.forEach(cp => {
            const tr = tbody.insertRow();

            // Coluna 1: Costureira
            tr.insertCell().textContent = cp.costureira_nome || 'N/A';
            
            // Coluna 2: Ciclo Ref.
            tr.insertCell().textContent = cp.ciclo_nome || 'N/A';
            
            // Coluna 3: Período Ciclo
            let periodoCicloTexto = 'N/A';
            if (cp.ciclo_inicio && cp.ciclo_fim) {
                try {
                    // Assume que formatarData espera 'YYYY-MM-DD' e cp.ciclo_inicio/fim estão nesse formato ou são compatíveis
                    const dataInicioFormatada = formatarData(cp.ciclo_inicio.split('T')[0]); // Pega YYYY-MM-DD se for timestamp
                    const dataFimFormatada = formatarData(cp.ciclo_fim.split('T')[0]);       // Pega YYYY-MM-DD se for timestamp

                    if (dataInicioFormatada && !dataInicioFormatada.toLowerCase().includes('invalid') && !dataInicioFormatada.toLowerCase().includes('nan') &&
                        dataFimFormatada && !dataFimFormatada.toLowerCase().includes('invalid') && !dataFimFormatada.toLowerCase().includes('nan')) {
                        periodoCicloTexto = `${dataInicioFormatada} - ${dataFimFormatada}`;
                    } else {
                        console.warn(`Problema ao formatar período do ciclo: ${cp.ciclo_inicio} a ${cp.ciclo_fim}. Comissao ID: ${cp.id || 'N/D'}`);
                        periodoCicloTexto = 'Datas Inválidas';
                    }
                } catch (e) {
                    console.error(`Erro ao formatar período do ciclo para ${cp.ciclo_inicio}-${cp.ciclo_fim}:`, e);
                    periodoCicloTexto = 'Erro Formatação';
                }
            }
            tr.insertCell().textContent = periodoCicloTexto;
            
            // Coluna 4: Valor Pago
            const valorPagoNumerico = parseFloat(cp.valor_pago);
            tr.insertCell().textContent = `R$ ${(isNaN(valorPagoNumerico) ? 0 : valorPagoNumerico).toFixed(2).replace('.', ',')}`;
            
            // Coluna 5: Data Pagamento
            // A linha com comentário no meio que você passou estava errada. Esta é a forma correta:
            let dataPagamentoTexto = 'N/A';
            if (cp.data_pagamento_efetivo) {
                try {
                    // cp.data_pagamento_efetivo pode ser um timestamp completo (ex: "2023-10-26T10:00:00.000Z")
                    // formatarData deve receber a parte da data 'YYYY-MM-DD'
                    const dataApenas = cp.data_pagamento_efetivo.split('T')[0];
                    dataPagamentoTexto = formatarData(dataApenas);
                    if (!dataPagamentoTexto || dataPagamentoTexto.toLowerCase().includes('invalid') || dataPagamentoTexto.toLowerCase().includes('nan')) {
                        console.warn(`Problema ao formatar data de pagamento: ${cp.data_pagamento_efetivo}. Comissao ID: ${cp.id || 'N/D'}`);
                        dataPagamentoTexto = 'Data Inválida';
                    }
                } catch (e) {
                    console.error(`Erro ao formatar data de pagamento ${cp.data_pagamento_efetivo}:`, e);
                    dataPagamentoTexto = 'Erro Formatação';
                }
            }
            tr.insertCell().textContent = dataPagamentoTexto;
            
            // Coluna 6: Confirmado Por
            tr.insertCell().textContent = cp.confirmado_por_nome || 'N/A';
        });


    } else {
        noDataMsgEl.style.display = 'block';
    }
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const authData = await verificarAutenticacao('relatorio-de-comissao.html', ['acesso-relatorio-de-comissao', 'confirmar-pagamento-comissao']); // Adicionar permissão de confirmar
        if (!authData) {
            window.location.href = '/login.html'; // Redirecionamento já deve ocorrer em verificarAutenticacao
            return;
        }
        permissoes = authData.permissoes || [];
        usuarioLogado = authData.usuario;

        // Pré-carregar dados essenciais em paralelo
        await Promise.all([
            obterUsuariosAPI(true),
            obterProdutosAPI(true),
            obterDadosProducaoAPI(true), // Carrega todas as produções inicialmente
            obterComissoesPagasAPI({}, true) // Carrega todas as comissões pagas para o cache inicial
        ]);

        await carregarFiltrosRelatorio(); // Popula filtros e chama atualizarRelatorio
        // atualizarRelatorio() já chama carregarComissoesPagas() no final

        await popularFiltrosComissoesPagas(); // Popula os filtros do novo card

    } catch (error) {
        console.error("Erro na inicialização do relatório de comissão:", error);
        mostrarPopupMensagem("Ocorreu um erro ao carregar a página. Tente recarregar.", "erro");
    }
});