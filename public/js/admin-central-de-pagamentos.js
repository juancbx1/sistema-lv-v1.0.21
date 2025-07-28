// public/js/admin-central-de-pagamentos.js

import { verificarAutenticacao } from '/js/utils/auth.js';
import { ciclos } from '/js/utils/ciclos.js';
import { fetchAPI } from '/js/utils/api-utils.js';


/**
 * Formata um número como moeda brasileira (BRL).
 * @param {number} value - O valor numérico a ser formatado.
 * @returns {string} O valor formatado como string (ex: "R$ 1.234,56").
 */
const formatCurrency = (value) => {
    // Garante que o valor seja um número, tratando casos de null, undefined, etc.
    const numberValue = Number(value) || 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(numberValue);
};


// --- Variáveis Globais ---
let cachedUsuarios = [];
let cachedContasFinanceiro = [];
let cachedConcessionariasVT = [];
let historicoComissoesPagas = [];
let calendarioObj = null; // Armazenará a instância do FullCalendar
let diasSelecionados = new Map(); // Armazenará os dias selecionados para pagamento
let usuarioLogado = null;



// --- Funções de UI e Lógica ---

/**
 * Controla a visibilidade das abas e painéis.
 * @param {string} abaAtiva - O valor do 'data-tab' da aba a ser ativada.
 */
function mudarAba(abaAtiva) {
    // Atualiza os botões das abas
    document.querySelectorAll('.cpg-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === abaAtiva);
    });
    // Atualiza os painéis de conteúdo
    document.querySelectorAll('.cpg-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${abaAtiva}`);
    });
}

function mostrarPopupPagamentos(mensagem, tipo = 'info', duracao = 4000) {
    const overlay = document.createElement('div');
    overlay.className = 'cpg-popup-overlay'; // Usando um prefixo para evitar conflitos

    const popup = document.createElement('div');
    popup.className = `cpg-popup-mensagem popup-${tipo}`;
    popup.innerHTML = `<p>${mensagem}</p><button class="cpg-btn cpg-btn-primario">OK</button>`;

    const fecharPopup = () => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    };

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    overlay.querySelector('button').addEventListener('click', fecharPopup);
    if (duracao > 0) {
        setTimeout(fecharPopup, duracao);
    }
}

function mostrarPopupConfirmacao(mensagem) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'cpg-popup-overlay';

        const popup = document.createElement('div');
        popup.className = 'cpg-popup-mensagem popup-aviso'; // Usando o estilo de aviso
        popup.innerHTML = `
            <p>${mensagem}</p>
            <div class="botoes-container">
                <button class="cpg-btn cpg-btn-secundario" id="popup-btn-cancelar">Cancelar</button>
                <button class="cpg-btn cpg-btn-primario" id="popup-btn-confirmar">Sim, Confirmar</button>
            </div>
        `;

        const fecharPopup = (resultado) => {
            document.body.removeChild(overlay);
            resolve(resultado); // Resolve a Promise com true ou false
        };

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        overlay.querySelector('#popup-btn-confirmar').addEventListener('click', () => fecharPopup(true));
        overlay.querySelector('#popup-btn-cancelar').addEventListener('click', () => fecharPopup(false));
    });
}

/**
 * Preenche os filtros da aba de COMISSÃO.
 */
function preencherFiltrosComissao() {
    const filtroEmpregadoEl = document.getElementById('comissao-filtro-empregado');
    if (!filtroEmpregadoEl) return;

    const empregados = cachedUsuarios.filter(u => (u.tipos?.includes('costureira') || u.tipos?.includes('tiktik')) && u.elegivel_pagamento === true);
    filtroEmpregadoEl.innerHTML = '<option value="">Selecione um empregado...</option>';
    empregados.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(u => {
        filtroEmpregadoEl.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
    });
    filtroEmpregadoEl.disabled = false;
}

/** Atualiza o filtro de ciclo na aba de COMISSÃO. */
function atualizarFiltroCicloComissao() {
    const filtroCicloEl = document.getElementById('comissao-filtro-ciclo');
    const empregadoIdValue = document.getElementById('comissao-filtro-empregado').value;
    const empregadoId = empregadoIdValue ? parseInt(empregadoIdValue, 10) : null;

    if (!filtroCicloEl) return;

    if (empregadoId) {
        filtroCicloEl.disabled = false;
        
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        // <<< MUDANÇA: Agora vamos procurar pelo último ciclo fechado, independentemente do status de pagamento >>>
        let ultimoCicloFechadoIndex = -1;
        let htmlOptions = '<option value="">Selecione um ciclo...</option>';

        ciclos.forEach((ciclo, index) => {
            const dataFimCicloStr = ciclo.semanas[ciclo.semanas.length - 1].fim;
            const dataFimCiclo = new Date(dataFimCicloStr + 'T23:59:59');
            const cicloJaTerminou = dataFimCiclo < hoje;

            const jaFoiPago = historicoComissoesPagas.some(
                p => p.usuario_id === empregadoId && p.ciclo_nome === ciclo.nome
            );

            let statusTexto = '';
            let desabilitado = false;

            if (jaFoiPago) {
                statusTexto = '[PAGO]';
            } else if (!cicloJaTerminou) {
                statusTexto = '(Em andamento)';
                desabilitado = true;
            }

            // <<< MUDANÇA: A lógica de encontrar o índice foi simplificada >>>
            // Se o ciclo já terminou, ele é um candidato. O último a satisfazer isso será o escolhido.
            if (cicloJaTerminou) {
                ultimoCicloFechadoIndex = index;
            }
            
            htmlOptions += `<option value="${index}" ${desabilitado ? 'disabled' : ''}>${ciclo.nome} ${statusTexto}</option>`;
        });

        filtroCicloEl.innerHTML = htmlOptions;

        // <<< MUDANÇA: Usa a nova variável para pré-selecionar >>>
        if (ultimoCicloFechadoIndex !== -1) {
            filtroCicloEl.value = ultimoCicloFechadoIndex;
            // Dispara o cálculo automaticamente para o ciclo pré-selecionado
            handleCalcularComissao(); 
        }

    } else {
        filtroCicloEl.disabled = true;
        filtroCicloEl.innerHTML = '<option value="">Selecione o empregado</option>';
        // Limpa a área de resultados se nenhum empregado for selecionado
        const resultadoContainer = document.getElementById('comissao-resultado-container');
        if (resultadoContainer) resultadoContainer.innerHTML = '';
    }
}


function renderizarResultadoComissao(dados) {
    const container = document.getElementById('comissao-resultado-container');
    if (!container) return;

    const { proventos, totais, detalhesComissao } = dados;
    const empregadoId = dados.detalhes.funcionario.id;
    const cicloNome = dados.detalhes.ciclo.nome;

    const jaFoiPago = historicoComissoesPagas.some(
        p => p.usuario_id === empregadoId && p.ciclo_nome === cicloNome
    );

    let htmlAcaoPagamento = '';

    if (jaFoiPago) {
        // Se já foi pago, mostra uma mensagem de status em destaque
        htmlAcaoPagamento = `
            <div class="cpg-card" style="margin-top: 30px; background-color: #e8f5e9; border-left: 5px solid var(--cpg-cor-receita);">
                <h3 class="cpg-section-title" style="color: var(--cpg-cor-receita);"><i class="fas fa-check-circle"></i> Comissão Paga</h3>
                <p>O pagamento de comissão para este ciclo e empregado já foi registrado no sistema.</p>
            </div>
        `;
    } else if (proventos.comissao > 0) {
        // Se não foi pago e há comissão, mostra a área para pagar
        htmlAcaoPagamento = `
            <div id="cpg-area-acao" class="cpg-card" style="margin-top: 30px;">
                <h3 class="cpg-section-title">Confirmar Pagamento da Comissão</h3>
                <div class="cpg-form-row">
                    <div class="cpg-form-group">
                        <label for="comissao-conta-debito">Debitar da Conta Financeira*</label>
                        <select id="comissao-conta-debito" class="cpg-select" required>
                            <option value="">Selecione a conta...</option>
                            ${cachedContasFinanceiro.map(c => `<option value="${c.id}">${c.nome_conta}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cpg-form-group" style="align-self: flex-end;">
                        <button id="comissao-btn-efetuar-pagamento" class="cpg-btn cpg-btn-primario" style="width: 100%;">
                            <i class="fas fa-check-circle"></i> Pagar Comissão
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    const tabelaBodyHtml = detalhesComissao.semanas.map(semana => `
        <tr>
            <td>${semana.periodo}</td>
            <td style="text-align: center;">${Math.round(semana.pontos)}</td>
            <td style="text-align: center;">${semana.metaAtingida}</td>
            <td style="text-align: right;">${formatCurrency(semana.valor)}</td>
        </tr>
    `).join('');

    const htmlCompleto = `
        <div class="cpg-resultado-comissao">
            <div class="cpg-resumo-grid">
                <div class="cpg-resumo-card">
                    <p class="label">Total de Pontos no Ciclo</p>
                    <p class="valor">${Math.round(detalhesComissao.totalPontos)}</p>
                </div>
                <div class="cpg-resumo-card">
                    <p class="label">${jaFoiPago ? 'Comissão Paga' : 'Comissão Total a Pagar'}</p>
                    <p class="valor ${jaFoiPago ? '' : 'positivo'}">${formatCurrency(proventos.comissao)}</p>
                </div>
            </div>
            
            <h3 class="cpg-section-title" style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">Detalhes por Semana</h3>
            <div class="cpg-tabela-container">
                <table class="cpg-tabela-detalhes">
                    <thead>
                        <tr>
                            <th>Período da Semana</th>
                            <th style="text-align: center;">Pontos</th>
                            <th style="text-align: center;">Meta Atingida</th>
                            <th style="text-align: right;">Valor da Comissão</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tabelaBodyHtml}
                    </tbody>
                </table>
            </div>
            ${htmlAcaoPagamento}
        </div>
    `;

    container.innerHTML = htmlCompleto;

    // Adiciona o listener de evento ao botão de pagamento, se ele existir
    const btnPagar = document.getElementById('comissao-btn-efetuar-pagamento');
    if (btnPagar) {
        btnPagar.addEventListener('click', () => handleEfetuarPagamentoComissao(dados));
        
        verificarPermissaoEConfigurarBotao(
            'comissao-btn-efetuar-pagamento', 
            'permitir-pagar-comissao', 
            'Você não tem permissão para pagar comissões.'
        );
    }
}

async function handleCalcularComissao() {
    const empregadoId = document.getElementById('comissao-filtro-empregado').value;
    const cicloIndex = document.getElementById('comissao-filtro-ciclo').value;
    const resultadoContainer = document.getElementById('comissao-resultado-container');

    resultadoContainer.innerHTML = ''; // Limpa resultados anteriores

    if (!empregadoId || cicloIndex === "") {
        return; // Não faz nada se os filtros não estiverem completos
    }

    resultadoContainer.innerHTML = `<div class="cpg-spinner"><span>Calculando...</span></div>`;

    try {
        const params = new URLSearchParams({
            usuario_id: empregadoId,
            ciclo_index: cicloIndex,
            tipo_pagamento: 'COMISSAO'
        });

        const resultado = await fetchAPI(`/api/pagamentos/calcular?${params.toString()}`);
        renderizarResultadoComissao(resultado);
        
    } catch (error) {
        resultadoContainer.innerHTML = `<p style="color: red; text-align: center;">Erro ao calcular comissão: ${error.message}</p>`;
    }
}

async function handleEfetuarPagamentoComissao(dadosDoCalculo) {
    const contaDebitoEl = document.getElementById('comissao-conta-debito');
    if (!contaDebitoEl || !contaDebitoEl.value) {
        mostrarPopupPagamentos("Por favor, selecione a conta financeira para o débito.", 'erro');
        return;
    }

    const idContaDebito = parseInt(contaDebitoEl.value);
    const valorAPagar = dadosDoCalculo.proventos.comissao;
    const nomeEmpregado = dadosDoCalculo.detalhes.funcionario.nome;

    if (valorAPagar <= 0) {
        mostrarPopupPagamentos("Não há comissão a ser paga.", 'aviso');
        return;
    }

    const confirmado = await mostrarPopupConfirmacao(`Confirma o pagamento da comissão de ${formatCurrency(valorAPagar)} para ${nomeEmpregado}? <br><br>Esta ação lançará a despesa no módulo financeiro.`);    if (!confirmado) return;

    const btnPagar = document.getElementById('comissao-btn-efetuar-pagamento');
    btnPagar.disabled = true;
    btnPagar.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processando...`;

    const payload = { calculo: dadosDoCalculo, id_conta_debito: idContaDebito };

    try {
        const resultado = await fetchAPI('/api/pagamentos/efetuar', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // <<< CORREÇÃO NA ATUALIZAÇÃO DO CACHE >>>
        // Adiciona um objeto ao cache local com a mesma estrutura que a API de histórico retorna.
        historicoComissoesPagas.push({
            usuario_id: dadosDoCalculo.detalhes.funcionario.id,
            ciclo_nome: dadosDoCalculo.detalhes.ciclo.nome,
            // Adicionamos outros campos para consistência, mesmo que não sejam usados na verificação.
            descricao: 'Pagamento de Comissão', 
            valor_liquido_pago: dadosDoCalculo.totais.totalLiquidoAPagar
        });

        mostrarPopupPagamentos(resultado.message || "Pagamento de comissão efetuado com sucesso!", 'sucesso');

        // Limpa a tela
        document.getElementById('comissao-resultado-container').innerHTML = '';
        // Chama a função para atualizar o filtro, que agora lerá o cache atualizado
        atualizarFiltroCicloComissao();

    } catch (error) {
        mostrarPopupPagamentos(`Erro ao processar o pagamento: ${error.message}`, 'erro');
    } finally {
        btnPagar.disabled = false;
        btnPagar.innerHTML = `<i class="fas fa-check-circle"></i> Pagar Comissão`;
    }
}

/**
 * Preenche os filtros da aba de BÔNUS.
 */
function preencherFiltrosBonus() {
    const filtroEmpregadoEl = document.getElementById('bonus-filtro-empregado');
    const contaDebitoEl = document.getElementById('bonus-conta-debito');

    if (!filtroEmpregadoEl || !contaDebitoEl) return;

    // Preenche empregados elegíveis
    const empregados = cachedUsuarios.filter(u => u.elegivel_pagamento === true);
    filtroEmpregadoEl.innerHTML = '<option value="">Selecione um empregado...</option>';
    empregados.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(u => {
        filtroEmpregadoEl.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
    });
    filtroEmpregadoEl.disabled = false;

    // Preenche contas financeiras
    contaDebitoEl.innerHTML = '<option value="">Selecione a conta para o débito...</option>';
    cachedContasFinanceiro.forEach(c => {
        contaDebitoEl.innerHTML += `<option value="${c.id}">${c.nome_conta}</option>`;
    });
    contaDebitoEl.disabled = false;
}

/**
 * Lida com o clique do botão "Conceder Bônus".
 */
async function handleConcederBonus() {
    const empregadoId = parseInt(document.getElementById('bonus-filtro-empregado').value);
    const valor = parseFloat(document.getElementById('bonus-valor').value);
    const motivo = document.getElementById('bonus-motivo').value.trim();
    const contaDebitoId = parseInt(document.getElementById('bonus-conta-debito').value);

    // Validações
    if (!empregadoId) { mostrarPopupPagamentos("Por favor, selecione um empregado.", 'erro'); return; }
    if (isNaN(valor) || valor <= 0) { mostrarPopupPagamentos("Por favor, insira um valor de bônus válido.", 'erro'); return; }
    if (!motivo) { mostrarPopupPagamentos("Por favor, descreva o motivo do bônus.", 'erro'); return; }
    if (!contaDebitoId) { mostrarPopupPagamentos("Por favor, selecione a conta de débito.", 'erro'); return; }

    const empregado = cachedUsuarios.find(u => u.id === empregadoId);
    if (!empregado || !empregado.id_contato_financeiro) {
        mostrarPopupPagamentos(`Erro: O empregado selecionado não possui um contato financeiro vinculado. Verifique o cadastro de usuários.`, 'erro');
        return;
    }

    const confirmado = await mostrarPopupConfirmacao(`Confirma o bônus de ${formatCurrency(valor)} para ${empregado.nome}?`);
    if (!confirmado) {
    // Restaura o botão se o usuário cancelar
    const btn = document.getElementById('bonus-btn-conceder');
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-gift"></i> Conceder Bônus`;
    return;
}

    const btn = document.getElementById('bonus-btn-conceder');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Concedendo...`;

    try {
        // A API de efetuar pagamento agora é a nossa porta de entrada única.
        // Montamos um payload específico para ela.
        const payload = {
            calculo: {
                detalhes: {
                    funcionario: { id: empregadoId, nome: empregado.nome },
                    ciclo: { nome: motivo }, // Usamos o motivo como "ciclo" para o histórico
                    tipoPagamento: 'BONUS'
                },
                proventos: {
                    salarioProporcional: 0,
                    comissao: 0,
                    valeTransporte: 0,
                    // Aqui entra o valor do bônus, que será mapeado para a categoria "Bônus e Premiações"
                    beneficios: valor 
                },
                descontos: { valeTransporte: 0 },
                totais: { totalLiquidoAPagar: valor }
            },
            id_conta_debito: contaDebitoId
        };

        // Chamamos a mesma API de efetuar pagamento!
        const resultado = await fetchAPI('/api/pagamentos/efetuar', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        mostrarPopupPagamentos(resultado.message || "Bônus concedido com sucesso!", 'sucesso');

        // Limpa o formulário
        document.getElementById('bonus-filtro-empregado').value = '';
        document.getElementById('bonus-valor').value = '';
        document.getElementById('bonus-motivo').value = '';
        document.getElementById('bonus-conta-debito').value = '';

    } catch (error) {
        mostrarPopupPagamentos(`Erro ao conceder bônus: ${error.message}`, 'erro');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-gift"></i> Conceder Bônus`;
    }
}

function preencherFiltroPassagem() {
    const filtroEmpregadoEl = document.getElementById('passagem-filtro-empregado');
    if (!filtroEmpregadoEl) return;

    const empregados = cachedUsuarios.filter(u => u.elegivel_pagamento === true);
    filtroEmpregadoEl.innerHTML = '<option value="">Selecione um empregado...</option>';
    empregados.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(u => {
        // Guardamos o valor da passagem no próprio option para fácil acesso
        filtroEmpregadoEl.innerHTML += `<option value="${u.id}" data-valor-passagem="${u.valor_passagem_diaria || 0}">${u.nome}</option>`;
    });
    filtroEmpregadoEl.disabled = false;
}

function inicializarCalendarioParaEmpregado() {
    const filtroEmpregadoEl = document.getElementById('passagem-filtro-empregado');
    const empregadoId = filtroEmpregadoEl.value;
    const calendarioContainerEl = document.getElementById('calendario-passagens');
    const layoutPrincipalEl = document.getElementById('passagem-layout-principal');
    const msgInicialEl = document.getElementById('passagem-mensagem-inicial');

    if (!empregadoId) {
        layoutPrincipalEl.classList.add('hidden');
        msgInicialEl.style.display = 'block';
        if (calendarioObj) {
            calendarioObj.destroy();
            calendarioObj = null;
        }
        return;
    }

    layoutPrincipalEl.classList.remove('hidden');
    msgInicialEl.style.display = 'none';
    diasSelecionados.clear();
    atualizarResumoPagamento();

    // Se o calendário já existe, destruímos para recriar.
    // Isso é mais simples do que gerenciar fontes de eventos dinâmicas com a nossa nova abordagem.
    if (calendarioObj) {
        calendarioObj.destroy();
    }

    calendarioObj = new FullCalendar.Calendar(calendarioContainerEl, {
        locale: 'pt-br',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        buttonText: {
            today: 'Hoje'
        },
        selectable: true,
        
        // <<< A MUDANÇA PRINCIPAL ESTÁ AQUI >>>
        // Usamos a função 'events' que nos dá controle total.
        events: async function(fetchInfo, successCallback, failureCallback) {
            try {
                // Montamos a URL com as datas que o FullCalendar nos fornece.
                const start = fetchInfo.start.toISOString().split('T')[0];
                const end = fetchInfo.end.toISOString().split('T')[0];
                const url = `/api/pagamentos/registros-dias?usuario_id=${empregadoId}&start=${start}&end=${end}`;

                // Usamos nossa função fetchAPI confiável!
                const eventos = await fetchAPI(url);
                
                // Entregamos os eventos para o FullCalendar renderizar.
                successCallback(eventos);

            } catch (error) {
                console.error("Erro ao buscar eventos para o calendário:", error);
                mostrarPopupPagamentos("Não foi possível carregar os dados do calendário.", "erro");
                failureCallback(error); // Informa o FullCalendar sobre a falha.
            }
        },

        dateClick: async function(info) {
            const evento = calendarioObj.getEventById(info.dateStr);
            const empregadoId = document.getElementById('passagem-filtro-empregado').value;

            // CASO 1: O dia já tem um evento.
            if (evento) {
                // Se for FNJ, pergunta se quer remover.
                if (evento.extendedProps.status === 'FALTA_NAO_JUSTIFICADA') {
                    const confirmado = await mostrarPopupConfirmacao('Deseja remover o registro de falta para este dia?');
                    if (confirmado) {
                        try {
                            const spinnerOverlay = document.getElementById('cpg-global-spinner');
                            spinnerOverlay.style.display = 'flex';
                            await fetchAPI('/api/pagamentos/remover-registro-dia', {
                                method: 'POST',
                                body: JSON.stringify({ usuario_id: empregadoId, data: info.dateStr })
                            });
                            mostrarPopupPagamentos('Falta removida com sucesso.', 'sucesso');
                            calendarioObj.refetchEvents();
                        } catch (error) {
                            mostrarPopupPagamentos(`Erro ao remover falta: ${error.message}`, 'erro');
                        } finally {
                            const spinnerOverlay = document.getElementById('cpg-global-spinner');
                            spinnerOverlay.style.display = 'none';
                        }
                    }
                } else {
                    // Se for PAGO ou outro status, informa que precisa usar o estorno do histórico.
                    mostrarPopupPagamentos(`Este dia está marcado como "${evento.title}". Para estornar um pagamento, use o "Histórico de Recargas".`, 'aviso');
                }
                return; // Impede a seleção do dia.
            }

            // CASO 2: O dia está em branco, lógica de seleção normal.
            const cell = info.dayEl;
            if (diasSelecionados.has(info.dateStr)) {
                diasSelecionados.delete(info.dateStr);
                cell.classList.remove('fc-day-selected');
            } else {
                diasSelecionados.set(info.dateStr, {});
                cell.classList.add('fc-day-selected');
            }
            atualizarResumoPagamento();
        }
    });

    calendarioObj.render();
}

/**
 * Atualiza a UI do "carrinho" de pagamento de passagens, incluindo o cálculo da taxa.
 */
function atualizarResumoPagamento() {
    const resumoContainer = document.getElementById('passagem-resumo-pagamento');
    const areaPagamento = document.getElementById('passagem-area-pagamento');
    const acoesRapidasEl = document.getElementById('passagem-acoes-rapidas'); 
    const filtroEmpregadoEl = document.getElementById('passagem-filtro-empregado');
    const optionSelecionada = filtroEmpregadoEl.options[filtroEmpregadoEl.selectedIndex];
    
    const empregadoId = parseInt(filtroEmpregadoEl.value);
    const empregado = cachedUsuarios.find(u => u.id === empregadoId);

    // Campos da área de pagamento
    const concessionariaNomeEl = document.getElementById('passagem-concessionaria-nome');
    const taxaValorEl = document.getElementById('passagem-taxa-valor');
    const valorTotalEl = document.getElementById('passagem-valor-total');
    const contaDebitoEl = document.getElementById('passagem-conta-debito');
    
    // Preenche as contas de débito (uma única vez)
    if (contaDebitoEl.options.length <= 1) { // Evita repreencher
        contaDebitoEl.innerHTML = '<option value="">Selecione a conta...</option>';
        cachedContasFinanceiro.forEach(c => {
            contaDebitoEl.innerHTML += `<option value="${c.id}">${c.nome_conta}</option>`;
        });
    }

    if (diasSelecionados.size === 0 || !empregado) {
        resumoContainer.innerHTML = `<p class="cpg-resumo-placeholder">Clique nos dias do calendário para selecionar as passagens a pagar.</p>`;
        areaPagamento.classList.add('hidden');
        acoesRapidasEl.classList.add('hidden');
        return;
    }

    const valorDiario = parseFloat(empregado.valor_passagem_diaria) || 0;
    const totalDias = diasSelecionados.size;
    const totalPassagens = totalDias * valorDiario;

    // Lógica da Concessionária e Taxa
    let taxaEstimada = 0;
    let nomeConcessionaria = 'N/A';
    if (empregado.concessionarias_vt && empregado.concessionarias_vt.length > 0) {
        const idConcessionaria = empregado.concessionarias_vt[0]; // Pega a primeira vinculada
        const concessionaria = cachedConcessionariasVT.find(c => c.id === idConcessionaria);
        if (concessionaria) {
            nomeConcessionaria = concessionaria.nome;
            const taxaPercentual = parseFloat(concessionaria.taxa_recarga_percentual) || 0;
            taxaEstimada = totalPassagens * (taxaPercentual / 100);
        }
    }
    
    // Atualiza o resumo no topo
    resumoContainer.innerHTML = `
        <div class="cpg-resumo-item"><span>Dias selecionados:</span> <strong>${totalDias}</strong></div>
        <div class="cpg-resumo-item"><span>Valor diário (VT):</span> <strong>${formatCurrency(valorDiario)}</strong></div>
        <div class="cpg-resumo-item cpg-resumo-total"><span>Subtotal (Passagens):</span> <span>${formatCurrency(totalPassagens)}</span></div>
    `;

    // Atualiza os campos na área de pagamento
    concessionariaNomeEl.value = nomeConcessionaria;
    taxaValorEl.value = taxaEstimada.toFixed(2); // Preenche a taxa estimada

    // Função para recalcular o total quando a taxa for editada
    const recalcularTotal = () => {
        const taxaFinal = parseFloat(taxaValorEl.value) || 0;
        const totalGeral = totalPassagens + taxaFinal;
        valorTotalEl.value = formatCurrency(totalGeral);
    };

    // Adiciona o listener para o input da taxa
    taxaValorEl.removeEventListener('input', recalcularTotal); // Remove listener antigo para evitar duplicidade
    taxaValorEl.addEventListener('input', recalcularTotal);

    // Calcula e exibe o total inicial
    recalcularTotal();
    
    areaPagamento.classList.remove('hidden');
    acoesRapidasEl.classList.remove('hidden'); 
}

async function handleMarcarFalta() {
    const filtroEmpregadoEl = document.getElementById('passagem-filtro-empregado');
    const empregadoId = parseInt(filtroEmpregadoEl.value);
    
    if (!empregadoId || diasSelecionados.size === 0) {
        mostrarPopupPagamentos("Selecione um empregado e os dias no calendário.", 'erro');
        return;
    }

    const datas = Array.from(diasSelecionados.keys());

    const confirmado = await mostrarPopupConfirmacao(
        `Confirma o registro de ${datas.length} falta(s) para este empregado?`
    );
    if (!confirmado) return;

    const btn = document.getElementById('passagem-btn-marcar-falta');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Registrando...`;

    try {
        const resultado = await fetchAPI('/api/pagamentos/registrar-falta', {
        method: 'POST',
        body: JSON.stringify({
            usuario_id: empregadoId,
            datas: datas
        })
        });
        
        mostrarPopupPagamentos("Faltas registradas com sucesso!", 'sucesso');
        
        // Limpa e atualiza a UI
        diasSelecionados.clear();
        document.querySelectorAll('.fc-day-selected').forEach(cell => cell.classList.remove('fc-day-selected'));
        atualizarResumoPagamento();
        if (calendarioObj) {
            calendarioObj.refetchEvents();
        }

    } catch (error) {
        mostrarPopupPagamentos(`Erro ao registrar faltas: ${error.message}`, 'erro');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-user-clock"></i> Marcar Dias Selecionados como Falta`;
    }
}

async function handleEfetuarPagamentoPassagem() {
    // 1. Coleta e Validação dos dados
    const filtroEmpregadoEl = document.getElementById('passagem-filtro-empregado');
    const empregadoId = parseInt(filtroEmpregadoEl.value);
    const empregado = cachedUsuarios.find(u => u.id === empregadoId);

    const contaDebitoId = parseInt(document.getElementById('passagem-conta-debito').value);
    const taxaValor = parseFloat(document.getElementById('passagem-taxa-valor').value);
    
    if (!empregadoId || !empregado) { mostrarPopupPagamentos("Selecione um empregado válido.", 'erro'); return; }
    if (diasSelecionados.size === 0) { mostrarPopupPagamentos("Selecione pelo menos um dia no calendário para pagar.", 'erro'); return; }
    if (isNaN(taxaValor) || taxaValor < 0) { mostrarPopupPagamentos("O valor da taxa é inválido.", 'erro'); return; }
    if (!contaDebitoId) { mostrarPopupPagamentos("Selecione a conta financeira para o débito.", 'erro'); return; }
    
    // 2. Cálculo dos valores
    const valorDiario = parseFloat(empregado.valor_passagem_diaria) || 0;
    const totalPassagens = diasSelecionados.size * valorDiario;
    const totalAPagar = totalPassagens + taxaValor;
    const datasPagas = Array.from(diasSelecionados.keys()); // Pega as datas do Map

    // 3. Montagem do Payload
    const payload = {
        calculo: {
            detalhes: {
                funcionario: { id: empregado.id, nome: empregado.nome },
                // Usamos a data atual para criar uma referência
                ciclo: { nome: `Recarga VT - ${new Date().toLocaleDateString('pt-BR')}` },
                tipoPagamento: 'VALE_TRANSPORTE'
            },
            proventos: {
                // O valor total entra aqui
                valeTransporte: totalAPagar 
            },
            totais: {
                totalLiquidoAPagar: totalAPagar
            }
        },
        id_conta_debito: contaDebitoId,
        datas_pagas: datasPagas,
        valor_passagem_diaria: valorDiario
    };

    // Mostra um popup de confirmação antes de enviar
    const confirmado = await mostrarPopupConfirmacao(
        `Confirma o pagamento de ${formatCurrency(totalAPagar)} para ${empregado.nome}?<br><br>
         Isso registrará ${datasPagas.length} dias como pagos e lançará a despesa no financeiro.`
    );
    if (!confirmado) return;

    // 4. Envio para a API (a ser implementado)
    const btnPagar = document.getElementById('passagem-btn-efetuar-pagamento');
    btnPagar.disabled = true;
    btnPagar.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processando...`;

    try {
        const resultado = await fetchAPI('/api/pagamentos/efetuar', {
        method: 'POST',
        body: JSON.stringify(payload)
        });

        mostrarPopupPagamentos("Pagamento de passagens efetuado com sucesso!", 'sucesso');
        
        // Limpa a seleção e atualiza a UI
        diasSelecionados.clear();
        atualizarResumoPagamento();
        if (calendarioObj) {
            calendarioObj.refetchEvents(); // Recarrega os eventos do calendário!
        }

    } catch (error) {
        mostrarPopupPagamentos(`Erro ao processar pagamento: ${error.message}`, 'erro');
    } finally {
        btnPagar.disabled = false;
        btnPagar.innerHTML = `<i class="fas fa-check-circle"></i> Efetuar Pagamento`;
    }
}

async function abrirModalHistorico() {
    const overlay = document.createElement('div');
    overlay.className = 'cpg-modal-overlay'; // Reutilizando a classe de modal
    overlay.innerHTML = `
        <div class="cpg-modal-content" style="max-width: 800px;">
            <div class="cpg-modal-header">
                <h2>Histórico de Pagamentos</h2>
                <button class="cpg-modal-close-btn">×</button>
            </div>
            <div class="cpg-modal-body">
                <div id="historico-spinner" class="cpg-spinner"><span>Carregando histórico...</span></div>
                <div id="historico-tabela-container" class="cpg-tabela-container"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const fecharModal = () => document.body.removeChild(overlay);
    overlay.querySelector('.cpg-modal-close-btn').addEventListener('click', fecharModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });

    try {
        const historico = await fetchAPI('/api/pagamentos/historico');
        
        const tabelaContainer = overlay.querySelector('#historico-tabela-container');
        if (historico.length === 0) {
            tabelaContainer.innerHTML = '<p>Nenhum pagamento registrado ainda.</p>';
        } else {
            tabelaContainer.innerHTML = `
                <table class="cpg-tabela-detalhes">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Empregado</th>
                            <th>Descrição</th>
                            <th style="text-align: right;">Valor Pago</th>
                            <th>Confirmado por</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historico.map(p => `
                            <tr>
                                <td>${new Date(p.data_pagamento).toLocaleDateString('pt-BR')}</td>
                                <td>${p.nome_empregado}</td>
                                <td>${p.ciclo_nome || p.descricao}</td>
                                <td style="text-align: right;">${formatCurrency(p.valor_liquido_pago)}</td>
                                <td>${p.nome_pagador}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
        overlay.querySelector('#historico-spinner').style.display = 'none';
    } catch (error) {
        overlay.querySelector('#historico-tabela-container').innerHTML = `<p style="color: red;">Erro ao carregar histórico: ${error.message}</p>`;
        overlay.querySelector('#historico-spinner').style.display = 'none';
    }
}

async function abrirModalHistoricoRecargas() {
    const filtroEmpregadoEl = document.getElementById('passagem-filtro-empregado');
    const empregadoId = parseInt(filtroEmpregadoEl.value);

    if (!empregadoId) {
        mostrarPopupPagamentos("Por favor, selecione um empregado para ver o histórico.", 'aviso');
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'cpg-modal-overlay';
    overlay.innerHTML = `
        <div class="cpg-modal-content" style="max-width: 700px;">
            <div class="cpg-modal-header">
                <h2>Histórico de Recargas de VT</h2>
                <button class="cpg-modal-close-btn">×</button>
            </div>
            <div class="cpg-modal-body">
                <div id="historico-vt-spinner" class="cpg-spinner"><span>Carregando histórico...</span></div>
                <div id="historico-vt-container"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const fecharModal = () => document.body.removeChild(overlay);
    overlay.querySelector('.cpg-modal-close-btn').addEventListener('click', fecharModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });

    try {
        const historico = await fetchAPI(`/api/pagamentos/historico-vt?usuario_id=${empregadoId}`);
        const container = overlay.querySelector('#historico-vt-container');
        
        if (historico.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 20px 0;">Nenhuma recarga de VT encontrada para este empregado.</p>';
        } else {
            // <<<< LÓGICA DE PERMISSÃO INTEGRADA NA GERAÇÃO DO HTML >>>>
            const podeEstornar = usuarioLogado && usuarioLogado.permissoes.includes('permitir-estornar-passagens');

            container.innerHTML = `
                <table class="cpg-tabela-detalhes">
                    <thead>
                        <tr>
                            <th>Data da Recarga</th>
                            <th>Descrição</th>
                            <th style="text-align: right;">Valor Pago</th>
                            <th style="text-align: center;">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historico.map(recarga => {
                            // Gera o HTML do botão baseado na permissão
                            const botaoEstornarHtml = `
                                <button class="cpg-btn cpg-btn-aviso" 
                                        data-recarga-id="${recarga.id}" 
                                        style="padding: 5px 10px; font-size: 0.8rem; ${!podeEstornar ? 'background-color: #dce4e6; border-color: #dce4e6; cursor: not-allowed;' : ''}"
                                        ${!podeEstornar ? 'disabled title="Você não tem permissão para estornar passagens."' : ''}>
                                    <i class="fas fa-undo"></i> Estornar
                                </button>`;

                            return `
                                <tr>
                                    <td>${new Date(recarga.data_pagamento).toLocaleDateString('pt-BR')}</td>
                                    <td>${recarga.descricao}</td>
                                    <td style="text-align: right;">${formatCurrency(recarga.valor_liquido_pago)}</td>
                                    <td style="text-align: center;">
                                        ${recarga.estornado_em 
                                            ? `<span style="color: #c0392b; font-weight: bold;">Estornado</span>`
                                            : botaoEstornarHtml
                                        }
                                    </td>
                                </tr>
                            `
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        // Adiciona o event listener para todos os botões de estorno
        container.querySelectorAll('button[data-recarga-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Se o botão estiver desabilitado (sem permissão), mostra o popup.
                if (btn.disabled) {
                    e.preventDefault();
                    mostrarPopupPagamentos('Você não tem permissão para estornar passagens.', 'erro');
                    return;
                }
                const recargaId = btn.dataset.recargaId;
                handleEstornarRecarga(recargaId, fecharModal);
            });
        });

    } catch (error) {
        overlay.querySelector('#historico-vt-container').innerHTML = `<p style="color: red;">Erro ao carregar histórico: ${error.message}</p>`;
    } finally {
        overlay.querySelector('#historico-vt-spinner').style.display = 'none';
    }
}

async function handleEstornarRecarga(recargaId, callbackFecharModal) {
    const confirmado = await mostrarPopupConfirmacao(
        "Você tem certeza que deseja estornar os dias desta recarga?<br><br>Esta ação removerá os registros de dias pagos e não poderá ser desfeita. O lançamento financeiro deverá ser tratado manualmente."
    );

    if (!confirmado) return;
    
    // Mostra o que enviaremos para a API
    console.log(`Pronto para estornar a recarga com ID de histórico: ${recargaId}`);
    
    // Simulação de chamada de API
    const spinnerOverlay = document.getElementById('cpg-global-spinner');
    spinnerOverlay.style.display = 'flex';
    
    try {
        const resultado = await fetchAPI('/api/pagamentos/estornar-vt', {
            method: 'POST',
            body: JSON.stringify({ recarga_id: recargaId })
        });

        mostrarPopupPagamentos("Recarga estornada com sucesso! O calendário será atualizado.", 'sucesso');
        
        // Fecha o modal e atualiza o calendário
        if (callbackFecharModal) callbackFecharModal();
        if (calendarioObj) calendarioObj.refetchEvents();

    } catch (error) {
        mostrarPopupPagamentos(`Erro ao estornar recarga: ${error.message}`, 'erro');
    } finally {
        spinnerOverlay.style.display = 'none';
    }
}

function verificarPermissaoEConfigurarBotao(idBotao, permissaoNecessaria, mensagemSemPermissao) {
    const botao = document.getElementById(idBotao);
    if (!botao) return;

    if (usuarioLogado && usuarioLogado.permissoes.includes(permissaoNecessaria)) {
        // Usuário TEM a permissão, garante que o botão está normal
        botao.disabled = false;
        botao.style.cursor = 'pointer';
        botao.title = ''; // Remove a dica de "sem permissão"
    } else {
        // Usuário NÃO TEM a permissão
        botao.disabled = true;
        botao.style.cursor = 'not-allowed';
        botao.style.backgroundColor = '#dce4e6'; // Cor cinza claro
        botao.title = 'Você não tem permissão para executar esta ação.';

        // Adiciona um listener para mostrar popup se o usuário tentar clicar
        botao.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Impede outros listeners de serem acionados
            mostrarPopupPagamentos(mensagemSemPermissao || 'Você não tem permissão para executar esta ação.', 'erro');
        }, true); // O 'true' captura o evento na fase de "captura", antes de outros listeners
    }
}

// --- Inicialização da Página ---
document.addEventListener('DOMContentLoaded', async () => {
    // Esconde o conteúdo principal e mostra o spinner global
    const mainContent = document.querySelector('.cpg-main-container');
    const globalSpinner = document.getElementById('cpg-global-spinner');
    if (mainContent) mainContent.style.visibility = 'hidden';
    if (globalSpinner) globalSpinner.style.display = 'flex';

    try {
        await verificarAutenticacao('central-de-pagamentos.html', ['acessar-central-pagamentos']);
        usuarioLogado = await fetchAPI('/api/usuarios/me');

        const [usuarios, configFinanceiro, historico, concessionarias] = await Promise.all([
            fetchAPI('/api/usuarios'),
            fetchAPI('/api/financeiro/configuracoes'),
            fetchAPI('/api/pagamentos/historico'),
            fetchAPI('/api/financeiro/concessionarias-vt')
        ]);
        
        cachedUsuarios = usuarios;
        cachedContasFinanceiro = configFinanceiro.contas;
        cachedConcessionariasVT = concessionarias;
        historicoComissoesPagas = historico;

        preencherFiltrosComissao();
        preencherFiltrosBonus();
        preencherFiltroPassagem();

        // --- LÓGICA DE SELEÇÃO ALEATÓRIA CORRIGIDA ---
        const filtroEmpregadoComissao = document.getElementById('comissao-filtro-empregado');
        const opcoesEmpregados = Array.from(filtroEmpregadoComissao.options).filter(opt => opt.value);

        if (opcoesEmpregados.length > 0) {
            const randomIndex = Math.floor(Math.random() * opcoesEmpregados.length);
            const empregadoAleatorio = opcoesEmpregados[randomIndex];
            
            filtroEmpregadoComissao.value = empregadoAleatorio.value;

            // 1. Primeiro, atualizamos o filtro de ciclo.
            atualizarFiltroCicloComissao();
            
            // 2. SÓ DEPOIS, chamamos o cálculo.
            // Isso garante que o handleCalcularComissao() lerá o valor correto do filtro de ciclo.
            handleCalcularComissao(); 
        }

    } catch (error) {
        console.error("Erro na inicialização da página:", error);
        mostrarPopupPagamentos(`Erro crítico ao carregar a página: ${error.message}`, 'erro');
    } finally {
        // Ao final de tudo (sucesso ou erro), esconde o spinner e mostra o conteúdo
        if (globalSpinner) globalSpinner.style.display = 'none';
        if (mainContent) mainContent.style.visibility = 'visible';
    }

    // Listener para a troca de abas
    const tabsContainer = document.querySelector('.cpg-tabs-container');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.cpg-tab-btn');
            if (tabButton) {
                mudarAba(tabButton.dataset.tab);
            }
        });
    }
    
    // Listeners da aba COMISSÃO
    const filtroEmpregadoComissao = document.getElementById('comissao-filtro-empregado');
    const filtroCicloComissao = document.getElementById('comissao-filtro-ciclo');
    if (filtroEmpregadoComissao) {
        filtroEmpregadoComissao.addEventListener('change', () => {
            atualizarFiltroCicloComissao();
            handleCalcularComissao();
        });
    }
    if (filtroCicloComissao) {
        filtroCicloComissao.addEventListener('change', handleCalcularComissao);
    }

    // Listeners da aba BÔNUS
    const btnConcederBonus = document.getElementById('bonus-btn-conceder');
    if (btnConcederBonus) {
        btnConcederBonus.addEventListener('click', handleConcederBonus);
    }
    
    // Listener do botão de histórico (a fazer no futuro)
    const btnHistorico = document.getElementById('cpg-btn-historico');
        if (btnHistorico) {
            btnHistorico.addEventListener('click', abrirModalHistorico);
        }

    const filtroEmpregadoPassagem = document.getElementById('passagem-filtro-empregado');
    if (filtroEmpregadoPassagem) {
        filtroEmpregadoPassagem.addEventListener('change', inicializarCalendarioParaEmpregado);
    }

     const btnEfetuarPagamentoPassagem = document.getElementById('passagem-btn-efetuar-pagamento');
    if (btnEfetuarPagamentoPassagem) {
        btnEfetuarPagamentoPassagem.addEventListener('click', handleEfetuarPagamentoPassagem);
    }

    const btnMarcarFalta = document.getElementById('passagem-btn-marcar-falta');
    if (btnMarcarFalta) {
        btnMarcarFalta.addEventListener('click', handleMarcarFalta);
    }

    const btnHistoricoRecargas = document.getElementById('passagem-btn-historico-recargas');
    if (btnHistoricoRecargas) {
        btnHistoricoRecargas.addEventListener('click', abrirModalHistoricoRecargas);
    }

    verificarPermissaoEConfigurarBotao('bonus-btn-conceder', 'permitir-conceder-bonus');
    verificarPermissaoEConfigurarBotao('passagem-btn-efetuar-pagamento', 'permitir-pagar-passagens');
verificarPermissaoEConfigurarBotao('passagem-btn-marcar-falta', 'permitir-lancar-falta-nao-justificada');
});