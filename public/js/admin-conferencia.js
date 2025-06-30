import { verificarAutenticacao } from '/js/utils/auth.js';

// ==========================================================================
// 1. VARIÁVEIS GLOBAIS E ESTADO DA PÁGINA
// ==========================================================================
let usuarioLogado = null;
let usuariosCache = [];
let divergenciasCache = [];
let logsCache = [];

// FUNÇÃO DE UTILIDADE
function getHojeFormatado() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0'); // Mês de 0-11, então +1
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`; // Formato YYYY-MM-DD
}

// ==========================================================================
// 2. INICIALIZAÇÃO E EVENT LISTENERS PRINCIPAIS
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/conferencia.html', ['acesso-conferencia-e-auditoria']);
        if (!auth) return;
        usuarioLogado = auth.usuario;

        configurarEventListeners();
        
        // CORREÇÃO: Chamando a nova função unificada
        await carregarTickets();

    } catch (error) {
        console.error("Erro na inicialização da página de conferência:", error);
        document.body.innerHTML = '<p>Erro ao carregar a página. Verifique suas permissões e tente novamente.</p>';
    }
});

function configurarEventListeners() {
    const tabButtons = document.querySelectorAll('.ca-tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.ca-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.ca-tab-panel').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            const tabId = `tab-content-${button.dataset.tab}`;
            document.getElementById(tabId).classList.add('active');

            if (button.dataset.tab === 'divergencias' && divergenciasCache.length === 0) {
                // CORREÇÃO: Chamando a nova função
                carregarTickets();
            } else if (button.dataset.tab === 'logs' && logsCache.length === 0) {
                carregarLogs();
                carregarFiltroUsuarios();
            }
        });
    });

    // CORREÇÃO: Listener para o filtro agora chama a função correta
    document.getElementById('filtro-divergencia-status').addEventListener('change', carregarTickets);

    // Listener para o botão de filtrar logs
    document.getElementById('btn-aplicar-filtros-log').addEventListener('click', carregarLogs);

    // Preenche as datas padrão ao carregar a página
    const hoje = getHojeFormatado();
    document.getElementById('filtro-log-data-inicio').value = hoje;
    document.getElementById('filtro-log-data-fim').value = hoje;
}

// ==========================================================================
// 3. FUNÇÕES PARA A ABA DE DIVERGÊNCIAS
// ==========================================================================
async function carregarTickets() {
    const listaEl = document.getElementById('divergencias-list');
    listaEl.innerHTML = '<div class="spinner">Carregando solicitações...</div>';
    const status = document.getElementById('filtro-divergencia-status').value;

    try {
        const token = localStorage.getItem('token');
        // Chama a nova rota unificada
        const response = await fetch(`/api/tickets?status=${status}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Falha ao buscar dados dos tickets.');
        
        const tickets = await response.json();
        divergenciasCache = tickets; // Reutilizamos o cache
        renderizarDivergencias(); // A função de renderização continua a mesma
    } catch (error) {
        console.error("Erro ao carregar tickets:", error);
        listaEl.innerHTML = '<p class="error-message">Não foi possível carregar as solicitações.</p>';
    }
}

function renderizarDivergencias() {
    const listaEl = document.getElementById('divergencias-list');
    const badgeEl = document.getElementById('badge-divergencias-pendentes');
    const divergencias = divergenciasCache;

    if (divergencias.length === 0) {
        listaEl.innerHTML = '<p class="empty-message" style="text-align:center; padding: 20px;">Nenhuma solicitação encontrada para este status.</p>';
    } else {
        listaEl.innerHTML = divergencias.map(d => criarCardDivergencia(d)).join('');
        configurarEventListenersAcoes(); // <-- ADICIONE ESTA LINHA
    }

    const pendentes = divergencias.filter(d => d.status === 'Pendente').length;
    if (pendentes > 0) {
        badgeEl.textContent = pendentes;
        badgeEl.style.display = 'inline-block';
    } else {
        badgeEl.style.display = 'none';
    }
}

function criarCardDivergencia(ticket) {
    const dataCriacao = new Date(ticket.data_criacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const statusClass = `status-${ticket.status.replace(/\s+/g, '')}`;
    
    let detalhesHtml = '';
    let acoesHtml = '';
    
    // Constrói o conteúdo do card com base no TIPO de ticket
    switch (ticket.tipo_ticket) {
        case 'Divergência':
            detalhesHtml = `
                <p><strong>Item:</strong> ${ticket.detalhes_ticket.nome_produto} (OP: ${ticket.detalhes_ticket.op_numero || 'N/A'})</p>
                <p><strong>Problema:</strong> ${ticket.titulo}</p>
                ${ticket.titulo === 'Quantidade' ? `
                    <p>
                        <strong>Quantidade:</strong>
                        <span class="original-value">${ticket.detalhes_ticket.quantidade_original}</span>
                        <i class="fas fa-long-arrow-alt-right"></i>
                        <span class="reported-value">${ticket.detalhes_ticket.quantidade_sugerida}</span>
                    </p>` : ''}
            `;
            // Ações para Divergências
            if (ticket.status === 'Pendente' || ticket.status === 'Em Análise') {
                acoesHtml = `<button class="ca-btn ca-btn-sucesso" data-action="resolver" data-type="divergencia">
                                <i class="fas fa-check-circle"></i> Resolver
                             </button>`;
                if (ticket.status === 'Pendente') {
                    acoesHtml += `<button class="ca-btn ca-btn-secundario" data-action="analisar" data-type="divergencia">
                                    <i class="fas fa-search"></i> Em Análise
                                  </button>`;
                }
            }
            break;

        case 'Ponto de Atenção':
            detalhesHtml = `<p><strong>Assunto:</strong> ${ticket.titulo}</p>`;
            // Ações para Pontos de Atenção (futuramente pode ter um botão "Responder")
            acoesHtml = `<span class="ca-action-placeholder">A responder no mural</span>`;
            break;
    }

    // Informações de resolução (comum a ambos se forem resolvidos)
    if (ticket.status === 'Resolvida' || ticket.status === 'Recusada') {
        const dataResolucao = ticket.data_resolucao ? new Date(ticket.data_resolucao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A';
        acoesHtml = `<div class="ca-resolvido-info">
                        <strong>${ticket.status} por:</strong> ${ticket.nome_usuario_resolveu || 'N/A'}<br>
                        <strong>Em:</strong> ${dataResolucao}
                    </div>`;
    }

    return `
        <div class="ca-divergencia-card ${statusClass}" data-id="${ticket.id}" data-dados='${JSON.stringify(ticket)}'>
            <div class="ca-divergencia-info">
                <div class="ca-divergencia-header">
                    Reportado por: <strong>${ticket.nome_autor}</strong>
                </div>
                <div class="ca-divergencia-details">
                    ${detalhesHtml}
                </div>
                ${ticket.conteudo ? `<div class="ca-divergencia-obs"><strong>Mensagem:</strong> ${ticket.conteudo}</div>` : ''}
                ${ticket.observacao_resolucao ? `<div class="ca-divergencia-obs" style="background-color: #eaf2f8;"><strong>Resposta do supervisor:</strong> ${ticket.observacao_resolucao}</div>` : ''}
                <div class="ca-divergencia-footer">
                    Recebido em: ${dataCriacao}
                </div>
            </div>
            <div class="ca-divergencia-actions">
                ${acoesHtml}
            </div>
        </div>
    `;
}

// ==========================================================================
// 4. FUNÇÕES PARA A ABA DE LOGS DE ASSINATURA (PLACEHOLDERS)
// ==========================================================================
async function carregarLogs() {
    const tbodyEl = document.querySelector("#logs-table tbody");
    tbodyEl.innerHTML = `<tr><td colspan="4"><div class="spinner">Carregando logs...</div></td></tr>`;

    // Pega os valores dos filtros
    const dataInicio = document.getElementById('filtro-log-data-inicio').value;
    const dataFim = document.getElementById('filtro-log-data-fim').value;
    const idUsuario = document.getElementById('filtro-log-usuario').value;

    // Constrói a query string para a API
    const params = new URLSearchParams();
    if (dataInicio) params.append('dataInicio', dataInicio);
    if (dataFim) params.append('dataFim', dataFim);
    if (idUsuario) params.append('idUsuario', idUsuario);

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/auditoria/assinaturas?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Falha ao buscar logs de assinatura.');
        
        const logs = await response.json();
        logsCache = logs; // Armazena em cache
        renderizarLogs();

    } catch (error) {
        console.error("Erro ao carregar logs:", error);
        tbodyEl.innerHTML = `<tr><td colspan="4" class="error-message">Não foi possível carregar os logs.</td></tr>`;
    }
}

function renderizarLogs() {
    const tbodyEl = document.querySelector("#logs-table tbody");
    const logs = logsCache;

    if (logs.length === 0) {
        tbodyEl.innerHTML = `<tr><td colspan="4" class="empty-message">Nenhum log encontrado para os filtros selecionados.</td></tr>`;
        return;
    }

    tbodyEl.innerHTML = logs.map(log => {
        const dataAssinatura = new Date(log.timestamp_assinatura).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const variacaoHtml = log.variacao ? `[${log.variacao}]` : '';

        return `
            <tr data-log-id="${log.id}">
                <td>${log.nome_funcionario}</td>
                <td>${log.nome_produto} ${variacaoHtml}</td>
                <td>${log.tipo_registro}</td>
                <td>${dataAssinatura}</td>
                <td>
                    <button class="ca-btn ca-btn-secundario" data-action="ver-detalhes-log">
                        <i class="fas fa-eye"></i> Detalhes
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Adiciona o listener para os novos botões de detalhes
    configurarEventListenersLogs();
}

async function carregarFiltroUsuarios() {
    // Evita buscar usuários repetidamente se já tivermos em cache
    if (usuariosCache.length > 0) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/usuarios?tipos=costureira,tiktik', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar lista de usuários.');
        
        const usuarios = await response.json();
        usuariosCache = usuarios; // Salva no cache

        const selectEl = document.getElementById('filtro-log-usuario');
        usuarios.forEach(user => {
            const option = new Option(`${user.nome} (${user.tipos.join(', ')})`, user.id);
            selectEl.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao carregar filtro de usuários:", error);
    }
}

function configurarEventListenersLogs() {
    const tabelaEl = document.getElementById('logs-table');
    tabelaEl.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action="ver-detalhes-log"]');
        if (!button) return;

        const tr = e.target.closest('tr');
        const logId = parseInt(tr.dataset.logId, 10);
        const logData = logsCache.find(log => log.id === logId);

        if (logData) {
            abrirModalDetalhesLog(logData);
        }
    });
}



// ==========================================================================
// 5. MODAIS E AÇÕES DO SUPERVISOR
// ==========================================================================

function configurarEventListenersAcoes() {
    const listaEl = document.getElementById('divergencias-list');
    
    listaEl.addEventListener('click', (e) => {
        const button = e.target.closest('button.ca-btn');
        if (!button) return;

        const card = e.target.closest('.ca-divergencia-card');
        const action = button.dataset.action;
        // Pega os dados completos da divergência que armazenamos no atributo data-dados
        const dadosDivergencia = JSON.parse(card.dataset.dados);

        if (action === 'resolver') {
            abrirModalResolver(dadosDivergencia);
        } else if (action === 'analisar') {
            mudarStatusDivergencia(dadosDivergencia.id, 'Em Análise');
        }
    });
}

function abrirModalResolver(dados) {
    const overlay = document.getElementById('ca-modal-overlay');
    const modalContent = document.getElementById('ca-modal-content');

    // O HTML do modal agora é focado em comunicação e registro da ação
    modalContent.innerHTML = `
        <div class="ca-modal-header">
            <h3>Registrar Resolução</h3>
            <button class="ca-modal-close-btn">×</button>
        </div>
        <form id="form-resolver-divergencia" class="ca-modal-form">
            <div class="ca-divergencia-info" style="background-color: #f8f9fa; padding: 15px; border-radius: 8px;">
                <p><strong>Funcionário:</strong> ${dados.nome_usuario_reportou}</p>
                <p><strong>Problema Reportado:</strong> <strong style="color: var(--ca-cor-laranja-aviso);">${dados.tipo_divergencia}</strong></p>
                ${dados.observacao ? `<p><strong>Observação do Funcionário:</strong> <em>"${dados.observacao}"</em></p>` : ''}
            </div>
            
            <div>
                <label for="input-obs-resolucao">Mensagem para o Funcionário (Obrigatório):</label>
                <textarea id="input-obs-resolucao" class="ca-modal-textarea" rows="4" placeholder="Ex: Quantidade corrigida, pode assinar. ou Ex: O lançamento foi movido para o funcionário correto." required></textarea>
            </div>

            <div class="ca-modal-footer">
                <button type="button" class="ca-btn ca-btn-perigo" data-action="recusar">Recusar Solicitação</button>
                <button type="submit" class="ca-btn ca-btn-sucesso">Marcar como Resolvido</button>
            </div>
        </form>
    `;

    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('active'));

    // Adiciona listeners para o modal recém-criado
    modalContent.querySelector('.ca-modal-close-btn').onclick = fecharModal;
    
    // Listener para o botão RECUSAR
    modalContent.querySelector('[data-action="recusar"]').onclick = () => {
        const obs = modalContent.querySelector('#input-obs-resolucao').value;
        if (!obs.trim()) {
            alert('Para recusar, é obrigatório preencher a mensagem para o funcionário.');
            return;
        }
        mudarStatusDivergencia(dados.id, 'Recusada', obs);
        fecharModal();
    };

    // Listener para o formulário (botão RESOLVER)
    modalContent.querySelector('#form-resolver-divergencia').onsubmit = async (e) => {
        e.preventDefault();
        const obs = modalContent.querySelector('#input-obs-resolucao').value;
        if (!obs.trim()) {
            alert('Para resolver, é obrigatório preencher a mensagem para o funcionário.');
            return;
        }
        await mudarStatusDivergencia(dados.id, 'Resolvida', obs);
        fecharModal();
    };
}

function fecharModal() {
    const overlay = document.getElementById('ca-modal-overlay');
    overlay.classList.remove('active');
    // Espera a transição de opacidade terminar para esconder o elemento
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

async function mudarStatusDivergencia(id, novoStatus, observacao = '') {
    // Adicionamos um feedback visual para o usuário
    const btn = document.querySelector(`.ca-divergencia-card[data-id="${id}"] button`);
    if(btn) btn.innerHTML = '<div class="spinner"></div>'; // Usando uma classe de spinner genérica

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/divergencias/${id}/status`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ novoStatus: novoStatus, observacaoResolucao: observacao })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        
        // alert(`Status da divergência atualizado para "${novoStatus}".`); // Podemos remover o alert
        await carregarDivergencias(); // Recarrega a lista para refletir a mudança
    } catch (error) {
        console.error("Erro ao mudar status:", error);
        alert(`Erro ao mudar status da divergência: ${error.message}`);
        // Restaura o botão em caso de erro
        await carregarDivergencias();
    }
}


async function resolverDivergencia(id, novaQuantidade, observacao) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/divergencias/${id}/resolver`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ novaQuantidade: novaQuantidade, observacaoResolucao: observacao })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao resolver divergência.');
        
        alert(data.message);
        await carregarDivergencias(); // Recarrega a lista
    } catch (error) {
        console.error("Erro ao resolver divergência:", error);
        alert(`Erro: ${error.message}`);
    }
}

function abrirModalDetalhesLog(log) {
    const overlay = document.getElementById('ca-modal-overlay');
    const modalContent = document.getElementById('ca-modal-content');

    const dados = log.dados_coletados || {};
    const geo = dados.geolocalizacao || {};
    let geoHtml = '<p><strong>Geolocalização:</strong> Não registrada.</p>';
    if (geo.latitude && geo.longitude) {
        const mapsUrl = `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}`;
        geoHtml = `<p><strong>Geolocalização:</strong> <a href="${mapsUrl}" target="_blank">Ver no mapa</a> (Precisão: ${geo.precisao || 'N/A'}m)</p>`;
    } else if (geo.error) {
        geoHtml = `<p><strong>Geolocalização:</strong> Falha ao obter (${geo.error})</p>`;
    }

    modalContent.innerHTML = `
        <div class="ca-modal-header">
            <h3>Detalhes da Assinatura</h3>
            <button class="ca-modal-close-btn">×</button>
        </div>
        <div class="ca-log-details">
            <p><strong>Funcionário:</strong> ${log.nome_funcionario}</p>
            <p><strong>Data/Hora:</strong> ${new Date(log.timestamp_assinatura).toLocaleString('pt-BR')}</p>
            <hr>
            <h4>Evidências Coletadas:</h4>
            ${geoHtml}
            <p><strong>Dispositivo:</strong> ${dados.user_agent || 'Não registrado'}</p>
            <p><strong>Resolução da Tela:</strong> ${dados.resolucao_tela || 'Não registrada'}</p>
            <p><strong>Fuso Horário:</strong> ${dados.fuso_horario || 'Não registrado'}</p>
        </div>
        <div class="ca-modal-footer">
            <button type="button" class="ca-btn ca-btn-secundario">Fechar</button>
        </div>
    `;

    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('active'));

    // Adiciona listeners para o modal
    modalContent.querySelector('.ca-modal-close-btn').onclick = fecharModal;
    modalContent.querySelector('.ca-modal-footer button').onclick = fecharModal;
}