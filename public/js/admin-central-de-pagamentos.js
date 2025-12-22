// public/js/admin-central-de-pagamentos.js

import { verificarAutenticacao } from '/js/utils/auth.js';
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

/** 
 * Gera e preenche o filtro de competências (Meses)
 */
function atualizarFiltroCicloComissao() {
    const filtroCicloEl = document.getElementById('comissao-filtro-ciclo');
    const empregadoIdValue = document.getElementById('comissao-filtro-empregado').value;
    const empregadoId = empregadoIdValue ? parseInt(empregadoIdValue, 10) : null;

    if (!filtroCicloEl) return;

    if (empregadoId) {
        filtroCicloEl.disabled = false;
        filtroCicloEl.innerHTML = '<option value="">Selecione a competência...</option>';

        const hoje = new Date();
        const diaHoje = hoje.getDate();
        
        // CORREÇÃO LÓGICA DE COMPETÊNCIA:
        // Se hoje é dia <= 20, estamos no fim da competência X. A competência X+1 ainda não começou.
        // Se hoje é dia >= 21, já estamos no início da competência X+1.
        
        // Ex: Hoje 14/Dez. Competência atual: Dezembro (fecha 20/Dez). Janeiro só começa 21/Dez.
        // Então começamos a lista a partir do mês ATUAL.
        
        let cursor = new Date(hoje.getFullYear(), hoje.getMonth(), 1); 
        
        // Se já passou do dia 20, o mês "oficial" de trabalho já virou.
        if (diaHoje >= 21) {
            cursor.setMonth(cursor.getMonth() + 1);
        }

        for (let i = 0; i < 6; i++) {
            const nomeMes = cursor.toLocaleString('pt-BR', { month: 'long' });
            const ano = cursor.getFullYear();
            // Capitaliza (janeiro -> Janeiro)
            const nomeFormatado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
            const valorCompetencia = `${nomeFormatado}/${ano}`; // Ex: "Janeiro/2026"

            // Verifica se já foi pago (usando string da competência)
            const jaFoiPago = historicoComissoesPagas.some(
                p => p.usuario_id === empregadoId && p.ciclo_nome === valorCompetencia
            );

            // Verifica se o ciclo já fechou
            // Ciclo Janeiro/2026 fecha em 20/01/2026
            const dataFechamento = new Date(ano, cursor.getMonth(), 20, 23, 59, 59);
            const cicloFechado = hoje > dataFechamento;

            let textoExtra = '';
            if (jaFoiPago) textoExtra = ' [PAGO]';
            else if (!cicloFechado) textoExtra = ' (Em aberto)';

            filtroCicloEl.innerHTML += `<option value="${valorCompetencia}">${valorCompetencia}${textoExtra}</option>`;

            // Volta 1 mês
            cursor.setMonth(cursor.getMonth() - 1);
        }

    } else {
        filtroCicloEl.disabled = true;
        filtroCicloEl.innerHTML = '<option value="">Selecione o empregado</option>';
        document.getElementById('comissao-resultado-container').innerHTML = '';
    }
}

function renderizarResultadoComissao(dados) {
    const container = document.getElementById('comissao-resultado-container');
    if (!container) return;

    const { proventos, totais, dadosDetalhados } = dados;
    const empregadoId = dados.detalhes.funcionario.id;
    const cicloNome = dados.detalhes.ciclo.nome; // Ex: "Janeiro/2026"

    // Verifica se já foi pago no histórico local
    const jaFoiPago = historicoComissoesPagas.some(
        p => p.usuario_id === empregadoId && p.ciclo_nome === cicloNome
    );

    let htmlAcaoPagamento = '';

    if (jaFoiPago) {
        // Se já foi pago, mostra mensagem de sucesso
        htmlAcaoPagamento = `
            <div class="cpg-card" style="margin-top: 30px; background-color: #e8f5e9; border-left: 5px solid var(--cpg-cor-receita);">
                <h3 class="cpg-section-title" style="color: var(--cpg-cor-receita); border:none; padding:0; margin:0;">
                    <i class="fas fa-check-circle"></i> Comissão Paga
                </h3>
                <p style="margin-top:10px;">O pagamento referente à competência <strong>${cicloNome}</strong> já foi registrado.</p>
            </div>
        `;
    } else if (proventos.comissao > 0) {
        // Se não foi pago e tem valor, mostra o formulário de pagamento
        htmlAcaoPagamento = `
            <div id="cpg-area-acao" class="cpg-card" style="margin-top: 30px; background-color: #fcfcfc;">
                <h3 class="cpg-section-title">Confirmar Pagamento</h3>
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
                            <i class="fas fa-money-check-alt"></i> Pagar Comissão
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Sem valor a pagar
        htmlAcaoPagamento = `
            <div class="cpg-card" style="margin-top: 30px; text-align: center; color: #7f8c8d;">
                <p>Nenhuma comissão gerada neste período.</p>
            </div>
        `;
    }
    
    // TABELA DIÁRIA COM RESGATES
    // Verifica se dadosDetalhados e dias existem para evitar erro
    const dias = (dadosDetalhados && dadosDetalhados.dias) ? dadosDetalhados.dias : [];
    const resumo = (dadosDetalhados && dadosDetalhados.resumo) ? dadosDetalhados.resumo : { totalProduzido: 0, totalResgatado: 0 };
    
    const tabelaBodyHtml = dias.map(dia => {
        const temResgate = dia.pontosResgatados > 0;
        const estiloResgate = temResgate ? 'color: var(--cpg-cor-primaria); font-weight:bold;' : 'color: #ccc;';
        const estiloMeta = dia.valor > 0 ? 'color: var(--cpg-cor-receita); font-weight:600;' : 'color: #999;';
        const temExtra = dia.pontosExtras > 0;

        return `
        <tr>
            <td>${dia.data}</td>
            <td style="text-align: center;">${Math.round(dia.pontosProduzidos)}</td>
            
            <!-- Coluna de Extras (Cofre Entrada) -->
            <td style="text-align: center; color: ${temExtra ? '#27ae60' : '#ccc'}; font-weight: ${temExtra ? 'bold' : 'normal'};">
                ${temExtra ? `+${Math.round(dia.pontosExtras)}` : '-'}
            </td>

            <td style="text-align: center; ${estiloResgate}">
                ${temResgate ? `+${Math.round(dia.pontosResgatados)}` : '-'}
            </td>
            <td style="text-align: center; font-weight: bold; background-color: #f9f9f9;">${Math.round(dia.totalPontos)}</td>
            <td style="text-align: center;">${dia.meta}</td>
            <td style="text-align: right; ${estiloMeta}">
                ${formatCurrency(dia.valor)}
            </td>
        </tr>
    `}).join('');

    const htmlCompleto = `
        <div class="cpg-resultado-comissao">
            <div class="cpg-resumo-grid">
                <div class="cpg-resumo-card">
                    <p class="label">Pontos Produzidos</p>
                    <p class="valor">${Math.round(resumo.totalProduzido)}</p>
                </div>
                <div class="cpg-resumo-card">
                    <p class="label">Cofre (Resgatados)</p>
                    <p class="valor" style="color: var(--cpg-cor-primaria)">${Math.round(resumo.totalResgatado)}</p>
                </div>
                <div class="cpg-resumo-card">
                    <p class="label">${jaFoiPago ? 'Valor Pago' : 'Total a Pagar'}</p>
                    <p class="valor ${jaFoiPago ? '' : 'positivo'}">${formatCurrency(proventos.comissao)}</p>
                </div>
            </div>
            
            <h3 class="cpg-section-title" style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
                Extrato Diário da Competência
            </h3>
            <div class="cpg-tabela-container">
                <table class="cpg-tabela-detalhes">
                    <thead>
                        <tr>
                            <th style="width: 15%;">Data</th>
                            <th style="text-align: center;">Produção</th>
                            <th style="text-align: center;">Resgate</th>
                            <th style="text-align: center;">Extras (Cofre)</th> <!-- NOVA COLUNA -->
                            <th style="text-align: center; background-color: #f0f0f0;">Total Dia</th>
                            <th style="text-align: center;">Meta Batida</th>
                            <th style="text-align: right;">Comissão</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dias.length > 0 ? tabelaBodyHtml : '<tr><td colspan="6" style="text-align:center; padding: 30px; color: #999;">Nenhuma atividade registrada neste período.</td></tr>'}
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
    const competencia = document.getElementById('comissao-filtro-ciclo').value; // Agora pega a string "Dezembro/2025"
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
            competencia: competencia, // <<< Parametro novo
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
        timeZone: 'local',
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

// --- LÓGICA DA ABA DE RECIBOS ---

let dadosReciboCache = [];

function preencherFiltroRecibo() {
    const el = document.getElementById('recibo-filtro-empregado');
    if(!el) return;
    el.innerHTML = '<option value="">Selecione...</option>';
    cachedUsuarios.filter(u => u.elegivel_pagamento).forEach(u => {
        el.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
    });
}

async function verificarConflitoRecibo() {
    const uid = document.getElementById('recibo-filtro-empregado').value;
    const inicio = document.getElementById('recibo-data-inicio').value;
    const fim = document.getElementById('recibo-data-fim').value;
    const alerta = document.getElementById('recibo-alerta-conflito');
    
    if(!uid || !inicio || !fim) return;

    const res = await fetchAPI(`/api/pagamentos/recibos/verificar?usuario_id=${uid}&data_inicio=${inicio}&data_fim=${fim}`);
    
    if (res.jaExiste) {
        alerta.style.display = 'block';
        alerta.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>Atenção:</strong> Já existem recibos gerados dentro deste período.`;
    } else {
        alerta.style.display = 'none';
    }
}

async function visualizarDadosRecibo() {
    const uid = document.getElementById('recibo-filtro-empregado').value;
    const inicio = document.getElementById('recibo-data-inicio').value;
    const fim = document.getElementById('recibo-data-fim').value;

    if(!uid || !inicio || !fim) {
        mostrarPopupPagamentos('Preencha todos os campos.', 'aviso');
        return;
    }

    const btn = document.getElementById('recibo-btn-visualizar');
    const tbodyPrincipal = document.querySelector('#tabela-recibo-preview tbody');
    const tbodyCofre = document.querySelector('#tabela-recibo-cofre tbody');
    const containerPrincipal = document.getElementById('recibo-preview-container');
    const containerCofre = document.getElementById('recibo-cofre-container');

    if (!tbodyPrincipal || !containerPrincipal) {
        console.error("Elementos da tabela de recibo não encontrados no HTML.");
        mostrarPopupPagamentos('Erro de estrutura HTML. Recarregue a página.', 'erro');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

    try {
        const dados = await fetchAPI(`/api/pagamentos/recibos/dados?usuario_id=${uid}&data_inicio=${inicio}&data_fim=${fim}`);
        dadosReciboCache = dados;

        // --- 1. RENDERIZAÇÃO DA TABELA PRINCIPAL (PAGAMENTO) ---
        // 1. Primeiro filtramos os dados para remover dias vazios
        const dadosFiltrados = dados.filter(d => d.totalDia > 0 || d.valor > 0);

        if (dadosFiltrados.length === 0) {
            tbodyPrincipal.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhum dia produtivo encontrado neste período.</td></tr>';
        } else {
            // 2. Depois mapeamos apenas os dados filtrados
            tbodyPrincipal.innerHTML = dadosFiltrados.map(d => {
                const dataObj = new Date(d.data);
                const dataStr = `${dataObj.getUTCDate().toString().padStart(2, '0')}/${(dataObj.getUTCMonth()+1).toString().padStart(2, '0')}/${dataObj.getUTCFullYear()}`;
                
                let colunaResgate = '-';
                let estiloResgate = 'color: #ccc;';
                if (d.resgate > 0) {
                    colunaResgate = `+${Math.round(d.resgate)}`;
                    estiloResgate = 'color: #e67e22; font-weight: bold;';
                }

                const estiloValor = d.valor > 0 ? 'color: var(--cpg-cor-receita); font-weight: bold;' : 'color: #999;';

                return `
                <tr>
                    <td>${dataStr}</td>
                    <td style="text-align: center;">${Math.round(d.pontos)}</td>
                    <td style="text-align: center; ${estiloResgate}">${colunaResgate}</td>
                    <td style="text-align: center; font-weight: bold;">${Math.round(d.totalDia)}</td>
                    <td style="text-align: center;">${d.metaNome}</td>
                    
                </tr>
                `;
            }).join('');
        }

        const total = dados.reduce((acc, d) => acc + d.valor, 0);
        document.getElementById('recibo-total-valor').textContent = formatCurrency(total);
        
        
        // --- 2. RENDERIZAÇÃO DA TABELA DE COFRE (AUDITORIA) ---
        if (tbodyCofre && containerCofre) {
            const movimentosCofre = dados.filter(d => d.ganhoCofre > 0 || d.resgate > 0);
            
            if (movimentosCofre.length > 0) {
                tbodyCofre.innerHTML = movimentosCofre.map(d => {
                    const dataObj = new Date(d.data);
                    const dataStr = `${dataObj.getUTCDate().toString().padStart(2, '0')}/${(dataObj.getUTCMonth()+1).toString().padStart(2, '0')}/${dataObj.getUTCFullYear()}`;

                    let descricao = '';
                    let valor = '';
                    let cor = '';

                    if (d.ganhoCofre > 0) {
                        const dataRef = new Date(d.data);
                        dataRef.setDate(dataRef.getDate() - 1);
                        const dataRefStr = `${dataRef.getUTCDate().toString().padStart(2, '0')}/${(dataRef.getUTCMonth()+1).toString().padStart(2, '0')}`;
                        descricao = `Sobra de Produção (Ref. ${dataRefStr})`;
                        valor = `+${Math.round(d.ganhoCofre)}`;
                        cor = 'var(--cpg-cor-receita)';
                    } else {
                        descricao = 'Resgate Utilizado para Meta';
                        valor = `-${Math.round(d.resgate)}`;
                        cor = '#e67e22';
                    }

                    return `
                        <tr>
                            <td>${dataStr}</td>
                            <td>${descricao}</td>
                            <td style="text-align: right; color: ${cor}; font-weight: bold;">${valor}</td>
                        </tr>
                    `;
                }).join('');
                
                containerCofre.style.display = 'block';
            } else {
                containerCofre.style.display = 'none';
            }
        }

        // --- FINALIZAÇÃO ---
        containerPrincipal.style.display = 'block';
        document.getElementById('recibo-btn-gerar').disabled = false;

        verificarConflitoRecibo(); 

    } catch (error) {
        mostrarPopupPagamentos(error.message, 'erro');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-eye"></i> Visualizar Dados';
    }
}

async function gerarPDFRecibo() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const uid = document.getElementById('recibo-filtro-empregado').value;
    const nomeEmpregado = document.getElementById('recibo-filtro-empregado').options[document.getElementById('recibo-filtro-empregado').selectedIndex].text;
    const inicio = document.getElementById('recibo-data-inicio').value;
    const fim = document.getElementById('recibo-data-fim').value;
    
    // --- CABEÇALHO ---
    doc.setFontSize(18);
    doc.text("Recibo de Conferência de Produção", 105, 20, null, null, "center");
    
    const inicioObj = new Date(inicio);
    const fimObj = new Date(fim);
    const emissaoObj = new Date();
    const inicioStr = `${inicioObj.getUTCDate()}/${inicioObj.getUTCMonth()+1}/${inicioObj.getUTCFullYear()}`;
    const fimStr = `${fimObj.getUTCDate()}/${fimObj.getUTCMonth()+1}/${fimObj.getUTCFullYear()}`;
    const emissaoStr = emissaoObj.toLocaleDateString('pt-BR');

    doc.setFontSize(10);
    doc.text(`Empregado: ${nomeEmpregado}`, 14, 30);
    doc.text(`Período: ${inicioStr} a ${fimStr}`, 14, 36);
    doc.text(`Data de Emissão: ${emissaoStr}`, 14, 42);

    // --- TABELA 1: PRODUÇÃO (CÁLCULO FINANCEIRO) ---
    // Adicione o .filter() antes do .map()
    const tableData1 = dadosReciboCache
        .filter(d => d.totalDia > 0 || d.valor > 0) // <<< FILTRO NOVO
        .map(d => {
        const dataObj = new Date(d.data);
        const dataStr = `${dataObj.getUTCDate().toString().padStart(2, '0')}/${(dataObj.getUTCMonth()+1).toString().padStart(2, '0')}/${dataObj.getUTCFullYear()}`;
        
        let infoResgate = '-';
        if (d.resgate > 0) infoResgate = `+${Math.round(d.resgate)}`;

        return [
            dataStr,
            Math.round(d.pontos),
            infoResgate,
            Math.round(d.totalDia),
            d.metaNome
        ];
    });

    const total = dadosReciboCache.reduce((acc, d) => acc + d.valor, 0);

    doc.autoTable({
        startY: 50,
        head: [['Data', 'Prod.', 'Resgate', 'Total Dia', 'Meta']],
        body: tableData1,
        theme: 'grid',
        foot: [['', '', '', 'TOTAL:', formatCurrency(total)]],
        headStyles: { fillColor: [41, 128, 185] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold', halign: 'right' }, // Alinha total à direita
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 
            4: { halign: 'right', fontStyle: 'bold' } // A coluna 4 agora é a última (Meta/Total)
        }
    });

    let finalY = doc.lastAutoTable.finalY + 15;

    // --- TABELA 2: MOVIMENTAÇÕES DO COFRE (AUDITORIA) ---
    const movimentosCofre = dadosReciboCache.filter(d => d.ganhoCofre > 0 || d.resgate > 0);

    if (movimentosCofre.length > 0) {
        doc.setFontSize(11);
        doc.text("Auditoria do Banco de Resgate (Cofre)", 14, finalY);
        finalY += 5;

        const tableData2 = movimentosCofre.map(d => {
            const dataObj = new Date(d.data);
            const dataStr = `${dataObj.getUTCDate().toString().padStart(2, '0')}/${(dataObj.getUTCMonth()+1).toString().padStart(2, '0')}/${dataObj.getUTCFullYear()}`;

            let descricao = '';
            let valor = '';

            if (d.ganhoCofre > 0) {
                const dataRef = new Date(d.data);
                dataRef.setDate(dataRef.getDate() - 1);
                const dataRefStr = `${dataRef.getUTCDate().toString().padStart(2, '0')}/${(dataRef.getUTCMonth()+1).toString().padStart(2, '0')}`;
                descricao = `Sobra de Produção (Ref. ${dataRefStr})`;
                valor = `+${Math.round(d.ganhoCofre)}`;
            } else {
                descricao = 'Resgate Utilizado para Meta';
                valor = `-${Math.round(d.resgate)}`;
            }

            return [dataStr, descricao, valor];
        });

        doc.autoTable({
            startY: finalY,
            head: [['Data', 'Descrição', 'Pontos']],
            body: tableData2,
            theme: 'striped',
            headStyles: { fillColor: [108, 117, 125] }, // Cinza
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }
        });

        finalY = doc.lastAutoTable.finalY + 15;
    } else {
        finalY += 10;
    }

    // --- RODAPÉ DE ASSINATURA ---
    finalY += 15; // Espaço extra

    // Verifica se cabe na página, senão cria nova
    if (finalY > 250) {
        doc.addPage();
        finalY = 40;
    }
    
    doc.setLineWidth(0.5);
    doc.line(14, finalY, 90, finalY);
    doc.line(110, finalY, 196, finalY);

    doc.setFontSize(8);
    doc.text("Assinatura do Empregado", 14, finalY + 5);
    doc.text("Visto do Supervisor", 110, finalY + 5);

    doc.text("Declaro que conferi os dados acima e estou de acordo com TODOS os valores apresentados.", 105, finalY + 20, null, null, "center");

    // Salva e Registra
    doc.save(`Recibo_${nomeEmpregado.replace(/\s+/g, '_')}_${inicio}.pdf`);

    await fetchAPI('/api/pagamentos/recibos/registrar', {
        method: 'POST',
        body: JSON.stringify({ usuario_id: uid, data_inicio: inicio, data_fim: fim })
    });
    
    mostrarPopupPagamentos('Recibo gerado e registrado com sucesso!', 'sucesso');
    verificarConflitoRecibo();
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

    // aba filtros recibo!
    preencherFiltroRecibo();

    document.getElementById('recibo-btn-visualizar').addEventListener('click', visualizarDadosRecibo);
    document.getElementById('recibo-btn-gerar').addEventListener('click', gerarPDFRecibo);
        
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