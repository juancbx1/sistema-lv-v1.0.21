// public/dashboard/desempenho.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterDataProximoPagamento } from '/js/utils/ciclos.js';
import { calcularComissaoSemanal } from '/js/utils/metas.js';

// Variáveis globais para armazenar dados da API e do usuário
let token = null;
let usuarioLogado = null;
let dadosCache = null;

// --- FUNÇÃO DE INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('ds-body');
    
    try {
        const auth = await verificarAutenticacao('dashboard/desempenho.html', ['acesso-desempenho']);
        if (!auth) return;

        usuarioLogado = auth.usuario;
        token = localStorage.getItem('token');
        document.body.classList.add('autenticado');

        await carregarDadosIniciais();
        configurarEventListeners();

    } catch (err) {
        console.error("Erro crítico na inicialização:", err);
        document.getElementById('tabs-content-body').innerHTML = '<p style="color:red; text-align: center;">Erro grave ao carregar a página. Tente novamente.</p>';
    }
});

// --- FUNÇÕES DE LÓGICA E DADOS ---

async function carregarDadosIniciais() {
    try {
        const response = await fetch('/api/dashboard/desempenho', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Falha ao buscar dados de desempenho.');
        
        dadosCache = await response.json(); // Armazena os dados em cache
        
        popularHeader(dadosCache.usuario);
        gerenciarVisibilidadeAbas();
        
        // Renderiza a aba padrão inicial ("Desempenho Atual")
        await mudarAba('atual');

    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        document.getElementById('tabs-content-body').innerHTML = '<p style="color:red; text-align: center;">Não foi possível carregar seus dados de desempenho.</p>';
    }
}

function gerenciarVisibilidadeAbas() {
    if (dadosCache && dadosCache.cicloFechado) {
        document.getElementById('tab-a-receber').style.display = 'flex';
        document.getElementById('badge-a-receber').style.display = 'block';
    }
}

async function mudarAba(tabAlvo) {
    const contentBody = document.getElementById('tabs-content-body');
    const filtroContainer = document.getElementById('tabs-filtro-container');
    
    // Atualiza a aparência dos botões de aba
    document.querySelectorAll('.ds-tab-btn').forEach(btn => {
        btn.classList.toggle('ativo', btn.dataset.tab === tabAlvo);
    });

    contentBody.innerHTML = '<div class="ds-spinner-container"><div class="ds-spinner"></div></div>';
    filtroContainer.innerHTML = ''; // Limpa o container do filtro

    // Renderiza o conteúdo com base na aba clicada
    switch (tabAlvo) {
        case 'atual':
            await renderizarDesempenhoAtual();
            break;
        case 'receber':
            await renderizarPagamentoPendente();
            break;
        case 'historico':
            await renderizarContainerHistorico();
            break;
    }
}

function configurarEventListeners() {
    const tabsContainer = document.getElementById('tabs-container');
    tabsContainer.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.ds-tab-btn');
        if (tabButton && !tabButton.classList.contains('ativo')) {
            mudarAba(tabButton.dataset.tab);
        }
    });
}

// --- FUNÇÕES DE RENDERIZAÇÃO DE CONTEÚDO ---

function popularHeader(usuario) {
    document.getElementById('header-nome-usuario').textContent = usuario.nome;
    document.getElementById('header-cargo-nivel').textContent = `${usuario.tipo.charAt(0).toUpperCase() + usuario.tipo.slice(1)} - Nível ${usuario.nivel || 'N/A'}`;
    document.getElementById('header-avatar-img').src = usuario.avatar_url || '/img/default-avatar.png';
}

async function renderizarPagamentoPendente() {
    const container = document.getElementById('tabs-content-body');
    const { cicloFechado, usuario } = dadosCache;

    if (!cicloFechado) {
        container.innerHTML = '<p style="text-align:center;">Nenhum ciclo fechado com pagamento pendente.</p>';
        return;
    }

    const dataFimCiclo = new Date(cicloFechado.semanas[cicloFechado.semanas.length - 1].fim + 'T12:00:00Z');
    // Mover a data de pagamento para o cabeçalho do conteúdo
    const dataPagamentoHtml = `
        <div class="ds-data-pagamento" style="margin-bottom: 20px; text-align: center; display: inline-block;">
            Pagamento estimado em: <span>${obterDataProximoPagamento(dataFimCiclo).toLocaleDateString('pt-BR')}</span>
        </div>`;

    const promessasSemanas = cicloFechado.semanas.map(async (semana) => {
        const inicioSemana = new Date(semana.inicio + 'T00:00:00');
        const fimSemana = new Date(semana.fim + 'T23:59:59');
        const fimSemanaUTC = new Date(semana.fim + 'T12:00:00Z');

        const atividadesDaSemana = cicloFechado.atividades.filter(atv => new Date(atv.data) >= inicioSemana && new Date(atv.data) <= fimSemana);
        const pontosFeitos = atividadesDaSemana.reduce((acc, atv) => acc + (parseFloat(atv.pontos_gerados) || 0), 0);
        
        const resultadoComissao = await calcularComissaoSemanal(pontosFeitos, usuario.tipo, usuario.nivel, fimSemanaUTC);
        const valorComissao = typeof resultadoComissao === 'number' ? resultadoComissao : 0;
        const statusMeta = valorComissao > 0 ? 'Meta atingida' : 'Meta não atingida';
        const periodoFormatado = `${inicioSemana.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${fimSemana.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;

        return {
            html: `<div class="ds-semana-item"><div class="ds-semana-info"><div class="periodo">Semana (${periodoFormatado})</div><div class="meta">${statusMeta} (Pontos: ${Math.round(pontosFeitos)})</div></div><div class="ds-semana-valor ${valorComissao > 0 ? '' : 'zerado'}">R$ ${valorComissao.toFixed(2)}</div></div>`,
            valorComissao: valorComissao
        };
    }); 

    const resultadosSemanas = await Promise.all(promessasSemanas);
    const comissaoTotal = resultadosSemanas.reduce((acc, res) => acc + res.valorComissao, 0);
    const semanasHtml = resultadosSemanas.map(res => res.html).join('');
    
    container.innerHTML = `
    <div style="text-align:center;">${dataPagamentoHtml}</div>
    <div class="ds-total-card">Total a Receber, referente ao <strong>${cicloFechado.nome}</strong>: <span>R$ ${comissaoTotal.toFixed(2)}</span></div>
    ${semanasHtml}
    `;
}

async function renderizarDesempenhoAtual() {
    const container = document.getElementById('tabs-content-body');
    const { cicloAtual, usuario } = dadosCache;

    if (!cicloAtual) {
        container.innerHTML = '<p style="text-align:center;">Nenhum ciclo de trabalho ativo no momento.</p>';
        return;
    }

    const hoje = new Date();
    const promessasSemanas = cicloAtual.semanas.map(async (semana, index) => {
        const inicioSemana = new Date(semana.inicio + 'T00:00:00');
        const fimSemana = new Date(semana.fim + 'T23:59:59');
        const fimSemanaUTC = new Date(semana.fim + 'T12:00:00Z');
        const nomeDaSemana = `Semana ${index + 1} (${inicioSemana.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${fimSemana.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`;

        const atividadesDaSemana = cicloAtual.atividades.filter(atv => new Date(atv.data) >= inicioSemana && new Date(atv.data) <= fimSemana);
        const pontosFeitos = atividadesDaSemana.reduce((acc, atv) => acc + (parseFloat(atv.pontos_gerados) || 0), 0);
        const resultadoComissao = await calcularComissaoSemanal(pontosFeitos, usuario.tipo, usuario.nivel, fimSemanaUTC);
        const valorComissao = typeof resultadoComissao === 'number' ? resultadoComissao : 0;
        
        let statusHtml = '';
        if (hoje >= inicioSemana && hoje <= fimSemana) {
            statusHtml = `<div class="meta status-andamento">Em andamento (Pontos: ${Math.round(pontosFeitos)})</div>`;
        } else if (hoje < inicioSemana) {
            statusHtml = `<div class="meta status-futuro">Semana futura</div>`;
        } else {
            statusHtml = `<div class="meta">${valorComissao > 0 ? `Meta atingida` : `Meta não atingida`} (Pontos: ${Math.round(pontosFeitos)})</div>`;
        }

        return {
            html: `<div class="ds-semana-item"><div class="ds-semana-info"><div class="periodo">${nomeDaSemana}</div>${statusHtml}</div><div class="ds-semana-valor ${valorComissao > 0 ? '' : 'zerado'}">R$ ${valorComissao.toFixed(2)}</div></div>`,
            valorComissao
        };
    });

    const resultadosSemanas = await Promise.all(promessasSemanas);
    const comissaoTotalEstimada = resultadosSemanas.reduce((acc, res) => acc + res.valorComissao, 0);
    const semanasHtml = resultadosSemanas.map(res => res.html).join('');

    container.innerHTML = `
    <div class="ds-total-card">Total Estimado a Receber no <strong>${cicloAtual.nome}</strong>: <span>R$ ${comissaoTotalEstimada.toFixed(2)}</span></div>
    ${semanasHtml}
    `;
}

async function renderizarContainerHistorico() {
    const filtroContainer = document.getElementById('tabs-filtro-container');
    
    // Cria e adiciona o filtro ao cabeçalho
    filtroContainer.innerHTML = `
        <label for="filtro-ciclo">Filtrar por Ciclo:</label>
        <select id="filtro-ciclo" class="ds-select">
            <option value="">Carregando ciclos...</option>
        </select>
    `;

    const filtroEl = document.getElementById('filtro-ciclo');
    filtroEl.addEventListener('change', (e) => carregarHistoricoComissoes(e.target.value));

    // Carrega os ciclos no filtro e o primeiro item do histórico
    try {
        const response = await fetch('/api/historico/ciclos-pagos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar ciclos.');
        const ciclos = await response.json();

        if (ciclos.length > 0) {
            filtroEl.innerHTML = ciclos.map(ciclo => `<option value="${ciclo}">${ciclo}</option>`).join('');
            await carregarHistoricoComissoes(ciclos[0]); // Carrega o primeiro ciclo por padrão
        } else {
            filtroEl.innerHTML = '<option value="">Nenhum histórico encontrado</option>';
            document.getElementById('tabs-content-body').innerHTML = '<p style="text-align:center;">Você ainda não possui histórico de comissões.</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar filtro de ciclos:', error);
        filtroEl.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

async function carregarHistoricoComissoes(cicloNome) {
    const container = document.getElementById('tabs-content-body');
    container.innerHTML = '<div class="ds-spinner-container"><div class="ds-spinner"></div></div>';
    
    if (!cicloNome) {
        container.innerHTML = '<p style="text-align:center;">Selecione um ciclo para ver o histórico.</p>';
        return;
    }

    try {
        const response = await fetch(`/api/historico/comissoes?ciclo_nome=${encodeURIComponent(cicloNome)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar histórico do ciclo.');
        
        const pagamentos = await response.json();
        
        if (pagamentos.length === 0) {
            container.innerHTML = '<p style="text-align:center;">Nenhum pagamento de comissão encontrado para este ciclo.</p>';
            return;
        }
        
        const pagamento = pagamentos[0];
        const detalhes = pagamento.detalhes_pagamento?.detalhesComissao;

        if (!detalhes || !detalhes.semanas) {
            container.innerHTML = '<p style="text-align:center;">Dados de comissão detalhados não encontrados.</p>';
            return;
        }

        const totalCiclo = detalhes.totalComissao || 0;
        const semanasHtml = detalhes.semanas.map(semana => `
            <div class="ds-semana-item">
                <div class="ds-semana-info">
                    <div class="periodo">${semana.periodo || 'Período não informado'}</div>
                    <div class="meta">${semana.metaAtingida} (Pontos: ${Math.round(semana.pontos || 0)})</div>
                </div>
                <div class="ds-semana-valor ${semana.valor > 0 ? '' : 'zerado'}">R$ ${semana.valor.toFixed(2)}</div>
            </div>
        `).join('');
        
        container.innerHTML = `
            <div class="ds-total-card">Total Recebido no Ciclo: <span>R$ ${totalCiclo.toFixed(2)}</span></div>
            ${semanasHtml}
        `;

    } catch (error) {
        console.error(`Erro ao carregar histórico para o ciclo ${cicloNome}:`, error);
        container.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar dados do ciclo.</p>';
    }
}

// Adicione esta função auxiliar caso não a tenha globalmente
Date.prototype.addDays = function(days) {
    var date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
}