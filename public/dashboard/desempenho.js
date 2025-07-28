// public/dashboard/desempenho.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterDataProximoPagamento } from '/js/utils/ciclos.js';
import { calcularComissaoSemanal } from '/js/utils/metas.js';

let token = null;
let usuarioLogado = null;

document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('ds-body');
    
    try {
        const auth = await verificarAutenticacao('dashboard/desempenho.html', ['acesso-desempenho']);
        if (!auth) return;

        usuarioLogado = auth.usuario;
        token = localStorage.getItem('token');
        document.body.classList.add('autenticado');

        await carregarTudo();
        
        document.getElementById('filtro-ciclo')?.addEventListener('change', (e) => {
            carregarHistoricoComissoes(e.target.value);
        });

    } catch (err) {
        console.error("Erro crítico na inicialização da página de desempenho:", err);
        document.body.innerHTML = '<h1>Erro ao carregar a página. Tente novamente.</h1>';
    }
});

async function carregarTudo() {
    try {
        const response = await fetch('/api/dashboard/desempenho', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Falha ao buscar dados de desempenho.');
        
        const dados = await response.json();
        
        popularHeader(dados.usuario);

        // Renderiza os dois cards com os dados recebidos
        await renderizarPagamentoPendente(dados.cicloFechado, dados.usuario);
        await renderizarDesempenhoAtual(dados.cicloAtual, dados.usuario);

        await carregarFiltroDeCiclos();

    } catch (error) {
        console.error('Erro ao carregar dados de desempenho:', error);
        document.getElementById('desempenho-atual-container').innerHTML = '<p style="color:red;">Erro ao carregar seus dados.</p>';
    }
}

async function renderizarPagamentoPendente(cicloFechado, usuario) {
    const card = document.getElementById('card-pagamento-pendente');
    const container = document.getElementById('pagamento-pendente-container');
    
    if (!cicloFechado) {
        card.style.display = 'none'; // Se não há ciclo fechado, esconde o card.
        return;
    }

    // Se há um ciclo fechado, garante que o card esteja visível.
    card.style.display = 'block';
    document.getElementById('titulo-pagamento-pendente').textContent = `Comissão a Receber (${cicloFechado.nome})`;
    
    // Calcula a data de pagamento estimada.
    const dataFimCiclo = new Date(cicloFechado.semanas[cicloFechado.semanas.length - 1].fim);
    document.querySelector('#data-pagamento-estimada span').textContent = obterDataProximoPagamento(dataFimCiclo).toLocaleDateString('pt-BR');

    // Mapeia cada semana para uma promessa que calcula seus detalhes.
    const promessasSemanas = cicloFechado.semanas.map(async (semana) => {
        const inicioSemana = new Date(semana.inicio + 'T00:00:00');
        const fimSemana = new Date(semana.fim + 'T23:59:59');
        let valorComissao = 0;

        const atividadesDaSemana = cicloFechado.atividades.filter(atv => new Date(atv.data) >= inicioSemana && new Date(atv.data) <= fimSemana);
        const pontosFeitos = atividadesDaSemana.reduce((acc, atv) => acc + (parseFloat(atv.pontos_gerados) || 0), 0);
        
        // Usa a data de fim da semana para garantir que as regras de meta corretas (do passado) sejam usadas.
        const resultadoComissao = await calcularComissaoSemanal(pontosFeitos, usuario.tipo, usuario.nivel, fimSemana);
        
        if (typeof resultadoComissao === 'number') {
            valorComissao = resultadoComissao;
        }
        
        const statusMeta = typeof resultadoComissao === 'number' ? 'Meta atingida' : 'Meta não atingida';
        const periodoFormatado = `${new Date(semana.inicio + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${new Date(semana.fim + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;

        return {
            html: `
                <div class="ds-semana-item">
                    <div class="ds-semana-info">
                        <div class="periodo">Semana (${periodoFormatado})</div>
                        <div class="meta ${valorComissao > 0 ? '' : 'status-sem-meta'}">
                            ${statusMeta} (Pontos: ${Math.round(pontosFeitos)})
                        </div>
                    </div>
                    <div class="ds-semana-valor ${valorComissao > 0 ? '' : 'zerado'}">
                        R$ ${valorComissao.toFixed(2)}
                    </div>
                </div>`,
            valorComissao: valorComissao
        };
    }); 

    // Espera todos os cálculos terminarem.
    const resultadosSemanas = await Promise.all(promessasSemanas);

    // Soma o total e junta o HTML.
    const comissaoTotal = resultadosSemanas.reduce((acc, res) => acc + res.valorComissao, 0);
    const semanasHtml = resultadosSemanas.map(res => res.html).join('');
    
    // Monta o conteúdo final do card.
    container.innerHTML = `
        <div class="ds-total-card">
            Total a Receber: <span>R$ ${comissaoTotal.toFixed(2)}</span>
        </div>
        ${semanasHtml}
    `;
}

async function renderizarDesempenhoAtual(cicloAtual, usuario) {
    const card = document.getElementById('card-desempenho-atual');
    const container = document.getElementById('desempenho-atual-container');
    
    if (!cicloAtual) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    document.getElementById('titulo-desempenho-atual').textContent = `Desempenho do Ciclo Atual (${cicloAtual.nome})`;

    const hoje = new Date();
    const formatarDataSimples = (dataStr) => new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    const promessasSemanas = cicloAtual.semanas.map(async (semana, index) => {
        const inicioSemana = new Date(semana.inicio + 'T00:00:00');
        const fimSemana = new Date(semana.fim + 'T23:59:59');
        let statusHtml = '', valorComissao = 0;
        const nomeDaSemana = `Semana ${index + 1} (${formatarDataSimples(semana.inicio)} - ${formatarDataSimples(semana.fim)})`;

        const atividadesDaSemana = cicloAtual.atividades.filter(atv => new Date(atv.data) >= inicioSemana && new Date(atv.data) <= fimSemana);
        const pontosFeitos = atividadesDaSemana.reduce((acc, atv) => acc + (parseFloat(atv.pontos_gerados) || 0), 0);
        const resultadoComissao = await calcularComissaoSemanal(pontosFeitos, usuario.tipo, usuario.nivel, fimSemana);
        
        if (typeof resultadoComissao === 'number') valorComissao = resultadoComissao;

        if (hoje >= inicioSemana && hoje <= fimSemana) {
            statusHtml = `<div class="meta status-andamento">Em andamento (Pontos: ${Math.round(pontosFeitos)})</div>`;
        } else if (hoje < inicioSemana) {
            statusHtml = `<div class="meta status-futuro">Semana futura</div>`;
        } else {
            statusHtml = `<div class="meta ${valorComissao > 0 ? '' : 'status-sem-meta'}">${typeof resultadoComissao === 'number' ? `Meta atingida` : `Meta não atingida`} (Pontos: ${Math.round(pontosFeitos)})</div>`;
        }

        return {
            html: `<div class="ds-semana-item"><div class="ds-semana-info"><div class="periodo">${nomeDaSemana}</div>${statusHtml}</div><div class="ds-semana-valor ${valorComissao > 0 ? '' : 'zerado'}">R$ ${valorComissao.toFixed(2)}</div></div>`,
            valorComissao: valorComissao
        };
    });

    const resultadosSemanas = await Promise.all(promessasSemanas);
    const comissaoTotalEstimada = resultadosSemanas.reduce((acc, res) => acc + res.valorComissao, 0);
    const semanasHtml = resultadosSemanas.map(res => res.html).join('');

    container.innerHTML = `
        <div class="ds-total-card">Total Estimado a Receber: <span>R$ ${comissaoTotalEstimada.toFixed(2)}</span></div>
        ${semanasHtml}
    `;
}

function popularHeader(usuario) {
    document.getElementById('header-nome-usuario').textContent = usuario.nome;
    document.getElementById('header-cargo-nivel').textContent = `${usuario.tipo.charAt(0).toUpperCase() + usuario.tipo.slice(1)} - Nível ${usuario.nivel || 'N/A'}`;
    document.getElementById('header-avatar-img').src = usuario.avatar_url || '/img/default-avatar.png';
}

// As funções carregarFiltroDeCiclos e carregarHistoricoComissoes permanecem as mesmas
async function carregarFiltroDeCiclos() {
    const filtroEl = document.getElementById('filtro-ciclo');
    try {
        const response = await fetch('/api/historico/ciclos-pagos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar ciclos.');

        const ciclos = await response.json();
        if (ciclos.length > 0) {
            filtroEl.innerHTML = ciclos.map(ciclo => `<option value="${ciclo}">${ciclo}</option>`).join('');
            await carregarHistoricoComissoes(ciclos[0]);
        } else {
            filtroEl.innerHTML = '<option value="">Nenhum histórico encontrado</option>';
            document.getElementById('historico-container').innerHTML = '<p style="text-align:center;">Você ainda não possui histórico de comissões.</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar filtro de ciclos:', error);
        filtroEl.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

async function carregarHistoricoComissoes(cicloNome) {
    const container = document.getElementById('historico-container');
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
        renderizarHistoricoPago(pagamentos);

    } catch (error) {
        console.error(`Erro ao carregar histórico para o ciclo ${cicloNome}:`, error);
        container.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar dados do ciclo.</p>';
    }
}

function renderizarHistoricoPago(pagamentos) {
    const container = document.getElementById('historico-container');
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
    const nomeDoCiclo = pagamento.ciclo_nome;

    container.innerHTML = `
        <div class="ds-total-card">Total Recebido no ${nomeDoCiclo}: <span>R$ ${totalCiclo.toFixed(2)}</span></div>
        ${detalhes.semanas.map(semana => `
            <div class="ds-semana-item">
                <div class="ds-semana-info">
                    <div class="periodo">${semana.periodo || 'Período não informado'}</div>
                    <div class="meta ${semana.valor > 0 ? '' : 'sem-meta'}">${semana.metaAtingida} (Pontos: ${Math.round(semana.pontos || 0)})</div>
                </div>
                <div class="ds-semana-valor ${semana.valor > 0 ? '' : 'zerado'}">R$ ${semana.valor.toFixed(2)}</div>
            </div>
        `).join('')}
    `;
}

// Adicione a função para que a data de pagamento funcione corretamente
Date.prototype.addDays = function(days) {
    var date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
}