// public/js/admin-ordens-de-arremates.js
import { verificarAutenticacao } from '/js/utils/auth.js'; 
import { mostrarMensagem, mostrarConfirmacao, mostrarPromptNumerico } from '/js/utils/popups.js';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import { renderizarPaginacao } from './utils/Paginacao.js';
import { inicializarControlador, atualizarDadosControlador } from './utils/ControladorFiltros.js';

// --- Variáveis Globais --- 
let usuarioLogado = null;
let permissoes = [];
let todosOsProdutosCadastrados = [];
let todosOsUsuarios = [];
let opsFinalizadasCompletas = [];
let todosArrematesRegistradosCache = [];
let produtosAgregadosParaArremateGlobal = [];
let arremateAgregadoEmVisualizacao = null;
let historicoDeArrematesCache = [];
let totaisDaFilaDeArremate = { totalGrupos: 0, totalPecas: 0 };
let modalAtribuirTarefaElemento = null;
let statusTiktiksCache = [];
let modalModoFocoElemento = null;

// --- Cache para evitar piscada de imagens ---
const imageCache = new Set();


// Paginação
let currentPageArremateCards = 1;
const itemsPerPageArremateCards = 6; // Aumentado para preencher melhor a tela
let currentPageHistorico = 1;
const itemsPerPageHistorico = 10;

let historicoArrematesCurrentPage = 1;

const STATUS = {
    PRODUZINDO: 'PRODUZINDO',
    LIVRE: 'LIVRE',
    ALMOCO: 'ALMOÇO',
    PAUSA: 'PAUSA',
    FORA_DO_HORARIO: 'FORA_DO_HORARIO', // Sem espaço
    FALTOU: 'FALTOU',
    PAUSA_MANUAL: 'PAUSA_MANUAL',
    ALOCADO_EXTERNO: 'ALOCADO_EXTERNO'
};

const STATUS_TEXTO_EXIBICAO = {
    [STATUS.PRODUZINDO]: 'Produzindo',
    [STATUS.LIVRE]: 'Livre',
    [STATUS.ALMOCO]: 'Almoço',
    [STATUS.PAUSA]: 'Pausa',
    [STATUS.FORA_DO_HORARIO]: 'Fora do Horário', // Com espaço
    [STATUS.FALTOU]: 'Faltou',
    [STATUS.PAUSA_MANUAL]: 'Pausa Manual',
    [STATUS.ALOCADO_EXTERNO]: 'Outro Setor'
};


// Controle de UI
const lancamentosArremateEmAndamento = new Set();

// ==========================================================================
// # LÓGICA DO NOVO PAINEL DE ATIVIDADES
// ==========================================================================
let cronometrosUpdateInterval;
let ultimaAtualizacaoTimestamp = null;
let feedbackUpdateInterval;  
/**
 * Função principal que busca os dados e renderiza o painel de status.
 */
async function renderizarPainelStatus() {
    const containerDisponiveis = document.getElementById('painelDisponiveisContainer');
    const containerInativos = document.getElementById('painelInativosContainer');
    const badgeInativos = document.getElementById('accordionBadge');
    const feedbackEl = document.getElementById('feedbackAtualizacao'); // <<< Pega o elemento

    if (!containerDisponiveis || !containerInativos) return;

    // Mostra "Atualizando..." durante a busca
    if (feedbackEl) feedbackEl.textContent = 'Atualizando...';

    try {
        const tiktiks = await fetchFromAPI('/arremates/status-tiktiks');
        await precarregarImagens(tiktiks);
        statusTiktiksCache = tiktiks;
        
        containerDisponiveis.innerHTML = '';
        containerInativos.innerHTML = '';
        let contadorInativos = 0;

        if (tiktiks.length === 0) {
            containerDisponiveis.innerHTML = '<p>Nenhum usuário do tipo "TikTik" encontrado.</p>';
            return;
        }

        tiktiks.forEach(tiktik => {
            const card = document.createElement('div');
            card.dataset.tiktikId = tiktik.id;
            
            // --- MUDANÇA AQUI: Pegamos os 3 valores ---
            const { statusBruto, statusFinal, classeStatus } = determinarStatusFinal(tiktik);

            // Usa o status BRUTO para a lógica interna
            if (statusBruto === STATUS.PRODUZINDO) {
                card.dataset.inicioTarefa = tiktik.data_inicio;
            }

            card.className = `oa-card-status-tiktik ${classeStatus}`;
            // Passa o texto de EXIBIÇÃO para a função que cria o HTML
            card.innerHTML = criarHTMLCardStatus(tiktik, statusFinal, classeStatus, statusBruto); 
                
            // Usa o status BRUTO para a lógica de separação de containers
            if (statusBruto === STATUS.LIVRE || statusBruto === STATUS.PRODUZINDO) {
                containerDisponiveis.appendChild(card);
            } else {
                containerInativos.appendChild(card);
                contadorInativos++;
            }
        });
        
        if(badgeInativos) badgeInativos.textContent = contadorInativos;

        // Ao final da renderização bem-sucedida:
        ultimaAtualizacaoTimestamp = Date.now();
        atualizarFeedbackTempo();

    } catch (error) {
        console.error("Erro ao renderizar painel de status:", error);
        containerDisponiveis.innerHTML = `<p class="erro-painel">Erro ao carregar o painel. Tente atualizar a página.</p>`;
        if (feedbackEl) feedbackEl.textContent = 'Falha ao atualizar';
    }
}

/**
 * Garante que as imagens de uma lista de tiktiks estejam pré-carregadas no cache do navegador.
 * @param {Array<object>} tiktiks - A lista de tiktiks vinda da API.
 * @returns {Promise<void>} - Uma promessa que resolve quando todas as novas imagens foram carregadas.
 */
function precarregarImagens(tiktiks) {
    const promessasDeImagens = [];

    tiktiks.forEach(tiktik => {
        const url = tiktik.avatar_url;
        
        // Se a URL for válida e AINDA NÃO estiver no nosso cache...
        if (url && !imageCache.has(url)) {
            
            const promessa = new Promise((resolve) => {
                const img = new Image();
                img.src = url;
                // Quando a imagem carregar (ou der erro), a promessa resolve.
                // Isso garante que não vamos travar a renderização por uma imagem quebrada.
                img.onload = () => {
                    imageCache.add(url); // Adiciona ao cache para não carregar de novo
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Não foi possível pré-carregar a imagem: ${url}`);
                    resolve(); // Resolve mesmo em caso de erro.
                };
            });
            
            promessasDeImagens.push(promessa);
        }
    });
    
    // Retorna uma única promessa que espera por todas as outras
    return Promise.all(promessasDeImagens);
}


function atualizarCronometros() {
    const agora = new Date(); 

    document.querySelectorAll('.oa-card-status-tiktik').forEach(card => {
        const tiktikId = parseInt(card.dataset.tiktikId);
        const tiktikData = statusTiktiksCache.find(t => t.id === tiktikId);
        if (!tiktikData) return;

        // --- CORREÇÃO PRINCIPAL AQUI ---
        // Pegamos os 3 valores retornados pela função.
        const { statusBruto, statusFinal, classeStatus } = determinarStatusFinal(tiktikData);

        // A verificação de mudança de status agora usa a variável 'classeStatus' que acabamos de obter.
        if (!card.classList.contains(classeStatus)) {
            renderizarPainelStatus();
            return; 
        }

        // A lógica do cronômetro agora usa 'statusBruto'
        if (statusBruto === STATUS.PRODUZINDO) {
            const cronometroEl = card.querySelector('.cronometro-tarefa');
            if (cronometroEl && tiktikData.tempo_decorrido_real_segundos !== null && ultimaAtualizacaoTimestamp) {
                const tempoBaseSegundos = tiktikData.tempo_decorrido_real_segundos;
                const deltaSegundos = (Date.now() - ultimaAtualizacaoTimestamp) / 1000;
                const tempoAtualizadoSegundos = tempoBaseSegundos + deltaSegundos;
                const tempoDecorridoStr = new Date(Math.max(0, tempoAtualizadoSegundos) * 1000).toISOString().substr(11, 8);
                cronometroEl.innerHTML = `<i class="fas fa-clock"></i> ${tempoDecorridoStr}`;
            }
        }
        
        // A lógica de ociosidade foi desativada, então removemos o resto.
    });
}


function atualizarFeedbackTempo() {
    const feedbackEl = document.getElementById('feedbackAtualizacao');
    if (!feedbackEl || ultimaAtualizacaoTimestamp === null) return;

    const agora = Date.now();
    const segundosAtras = Math.round((agora - ultimaAtualizacaoTimestamp) / 1000);

    if (segundosAtras < 5) {
        feedbackEl.textContent = 'Atualizado agora';
    } else if (segundosAtras < 60) {
        feedbackEl.textContent = `Atualizado há ${segundosAtras} segundos`;
    } else {
        const minutosAtras = Math.floor(segundosAtras / 60);
        feedbackEl.textContent = `Atualizado há ${minutosAtras} min`;
    }
}

/**
 * Determina o status final de um empregado baseado na hierarquia de regras.
 */
function determinarStatusFinal(tiktik) {
    const formatarClasse = (status) => {
        // Guarda de segurança: se status for undefined ou null, retorna uma string vazia.
        if (!status) return ''; 
        return `status-${status.toLowerCase().replace(/_/g, '-')}`;
    };
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    let statusFinalBruto;

    // --- HIERARQUIA DE STATUS CORRIGIDA ---

    // NÍVEL 1: Produzindo (Prioridade sobre pausas automáticas)
    if (tiktik.status_atual === STATUS.PRODUZINDO) {
        statusFinalBruto = STATUS.PRODUZINDO;
    } 
    // NÍVEL 2: Status manuais de dia inteiro
    else if ([STATUS.FALTOU, STATUS.ALOCADO_EXTERNO].includes(tiktik.status_atual) && tiktik.status_data_modificacao?.startsWith(hoje)) {
        statusFinalBruto = tiktik.status_atual;
    }
    // NÍVEL 3: Pausa manual
    else if (tiktik.status_atual === STATUS.PAUSA_MANUAL) {
        statusFinalBruto = STATUS.PAUSA_MANUAL;
    }
    // NÍVEL 4: Lógica de horário para todos os outros casos
    else {
        const agora = new Date();
        const horaAtualStr = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        const { horario_entrada_1, horario_saida_1, horario_entrada_2, horario_saida_2, horario_entrada_3, horario_saida_3 } = tiktik;
        
        const saidaFinal = horario_saida_3 || horario_saida_2 || horario_saida_1 || '23:59';
        const entradaInicial = horario_entrada_1 || '00:00';

        if (horaAtualStr < entradaInicial || horaAtualStr > saidaFinal) {
            statusFinalBruto = STATUS.FORA_DO_HORARIO;
        } else if (horario_saida_1 && horario_entrada_2 && horaAtualStr > horario_saida_1 && horaAtualStr < horario_entrada_2) {
            statusFinalBruto = STATUS.ALMOCO;
        } else if (horario_saida_2 && horario_entrada_3 && horaAtualStr > horario_saida_2 && horaAtualStr < horario_entrada_3) {
            statusFinalBruto = STATUS.PAUSA;
        } else {
            // Se passou por tudo, o status é o que está no banco (provavelmente LIVRE), ou LIVRE como fallback.
            statusFinalBruto = tiktik.status_atual || STATUS.LIVRE;
        }
    }
    
    // Fallback final para garantir que statusFinalBruto NUNCA seja undefined
    if (!statusFinalBruto) {
        statusFinalBruto = STATUS.LIVRE;
    }

    return {
        statusBruto: statusFinalBruto,
        statusFinal: STATUS_TEXTO_EXIBICAO[statusFinalBruto] || statusFinalBruto,
        classeStatus: formatarClasse(statusFinalBruto)
    };
}

/**
 * Verifica se um tiktik produzindo está em um horário de pausa ou fora do expediente.
 * @param {object} tiktik - O objeto completo do tiktik do cache.
 * @returns {object|null} - Retorna um objeto { texto: string, nivel: string } ou null se o horário estiver normal.
 */
function verificarHorarioEstendido(tiktik) {
    const agoraStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const { 
        horario_entrada_1, horario_saida_1, horario_entrada_2, horario_saida_2, 
        horario_entrada_3, horario_saida_3 
    } = tiktik;

    const entradaInicial = horario_entrada_1 || '00:00';
    const saidaFinal = horario_saida_3 || horario_saida_2 || horario_saida_1 || '23:59';

    if (agoraStr < entradaInicial) {
        return { texto: '🕒 Expediente Ainda Não Iniciado', nivel: 'info' };
    }
    if (agoraStr > saidaFinal) {
        return { texto: '🚫 Trabalhando Fora do Expediente', nivel: 'critico' };
    }
    if (horario_saida_1 && horario_entrada_2 && agoraStr > horario_saida_1 && agoraStr < horario_entrada_2) {
        return { texto: '⚠️ Pausa para Almoço em Atraso', nivel: 'atencao' };
    }
    if (horario_saida_2 && horario_entrada_3 && agoraStr > horario_saida_2 && agoraStr < horario_entrada_3) {
        return { texto: '⚠️ Pausa da Tarde em Atraso', nivel: 'atencao' };
    }

    return null; // Horário normal
}

/**
 * Cria o HTML interno de um card de status de um empregado.
 */
function criarHTMLCardStatus(tiktik, statusFinalTexto, classeStatus, statusBrutoDecidido) {
    let infoTarefaHTML = '';
    let botoesAcaoHTML = '';
    let avisoHorarioHTML = '';

     if (statusBrutoDecidido === STATUS.PRODUZINDO) {
        // --- INÍCIO DA NOVA LÓGICA DE AVISO ---
        const infoHorarioEstendido = verificarHorarioEstendido(tiktik);
        if (infoHorarioEstendido) {
            avisoHorarioHTML = `
                <div class="aviso-horario-estendido nivel-${infoHorarioEstendido.nivel}">
                    ${infoHorarioEstendido.texto}
                </div>
            `;
        }
        // --- FIM DA NOVA LÓGICA ---

        const tempoSegundosBase = tiktik.tempo_decorrido_real_segundos || 0;
        const tempoDecorridoStr = new Date(tempoSegundosBase * 1000).toISOString().substr(11, 8);
        let progresso = 0;
        let classeProgresso = '';
        let mediaInfoHTML = '<p class="media-info">Sem média de tempo registrada para este produto.</p>';
        if (tiktik.media_tempo_por_peca && tiktik.quantidade_entregue > 0) {
            const tempoMedioTotalSegundos = tiktik.media_tempo_por_peca * tiktik.quantidade_entregue;
            const tempoDecorridoSegundos = tempoSegundosBase; 
            progresso = Math.min(100, (tempoDecorridoSegundos / tempoMedioTotalSegundos) * 100);
            if (progresso >= 100) classeProgresso = 'lento';
            else if (progresso > 75) classeProgresso = 'atencao';
            const tempoMedioFormatado = new Date(tempoMedioTotalSegundos * 1000).toISOString().substr(11, 8);
            mediaInfoHTML = `<p class="media-info">Tempo médio estimado: <strong>${tempoMedioFormatado}</strong></p>`;
        }
        infoTarefaHTML = `
            <div class="info-tarefa">
                <p class="produto-tarefa">${tiktik.produto_nome} ${tiktik.variante ? `(${tiktik.variante})` : ''}</p>
                <p class="quantidade-tarefa">${tiktik.quantidade_entregue} pçs</p>
                <div class="cronometro-tarefa">
                    <i class="fas fa-clock"></i> ${tempoDecorridoStr}
                </div>
                <div class="barra-progresso-container">
                    <div class="barra-progresso ${classeProgresso}" style="width: ${progresso}%;"></div>
                </div>
                ${mediaInfoHTML}
            </div>
        `;

         // Botões de ação
        const podeFinalizar = permissoes.includes('lancar-arremate');
        const podeCancelar = permissoes.includes('cancelar-tarefa-arremate');
        const attrsFinalizar = podeFinalizar ? `data-action="finalizar"` : `data-action="permissao-negada" data-permissao-necessaria="Finalizar Tarefa"`;
        const attrsCancelar = podeCancelar ? `data-action="cancelar"` : `data-action="permissao-negada" data-permissao-necessaria="Cancelar Tarefa"`;
        botoesAcaoHTML = `
            <div class="oa-card-botoes-acao-container">
                <button class="btn-acao cancelar" 
                        ${attrsCancelar} 
                        title="Cancelar esta tarefa"
                        ${!podeCancelar ? 'disabled' : ''}>
                    <i class="fas fa-times"></i> Cancelar
                </button>
                <button class="btn-acao finalizar"
                        ${attrsFinalizar}
                        ${!podeFinalizar ? 'disabled' : ''}>
                    <i class="fas fa-check-double"></i> Finalizar
                </button>
            </div>
        `;
    } else if (statusBrutoDecidido === STATUS.LIVRE) {
        const podeAtribuir = permissoes.includes('lancar-arremate');
        const attrsAtribuir = podeAtribuir ? `data-action="iniciar"` : `data-action="permissao-negada" data-permissao-necessaria="Atribuir Tarefa"`;
        botoesAcaoHTML = `
            <button class="btn-acao iniciar"
                    ${attrsAtribuir}
                    ${!podeAtribuir ? 'disabled' : ''}>
                <i class="fas fa-play"></i> Atribuir Tarefa
            </button>
        `;
    }
    
     // --- LÓGICA DO NOVO MENU DE AÇÕES ---
    let menuAcoesHTML = '';
    const menuItens = [];

    // Opções disponíveis quando o tiktik está ativo
     if ([STATUS.LIVRE, STATUS.PRODUZINDO].includes(tiktik.status_atual)) {
        menuItens.push({ action: 'pausa-manual', label: 'Iniciar Pausa Manual', icon: 'fa-coffee' });
        menuItens.push({ action: 'marcar-falta', label: 'Marcar Falta', icon: 'fa-user-slash' });
        menuItens.push({ action: 'alocar-externo', label: 'Alocar em Outro Setor', icon: 'fa-shipping-fast' });
    }
    else if (tiktik.status_atual === STATUS.PAUSA_MANUAL) {
        menuItens.push({ action: 'reverter-status', label: 'Finalizar Pausa', icon: 'fa-play' });
    }
    else if (tiktik.status_atual === STATUS.FALTOU) {
         menuItens.push({ action: 'reverter-status', label: 'Remover Falta', icon: 'fa-user-check' });
    }
    else if (tiktik.status_atual === STATUS.ALOCADO_EXTERNO) {
         menuItens.push({ action: 'reverter-status', label: 'Retornar ao Setor', icon: 'fa-undo' });
    }
    // ATENÇÃO: Aqui usamos o statusFinalTexto, que é o texto de exibição
    else if (['Almoço', 'Pausa', 'Fora do Horário'].includes(statusFinalTexto)) {
         menuItens.push({ action: 'reverter-status', label: 'Interromper e Liberar', icon: 'fa-play' });
    }

    if (menuItens.length > 0) {
    menuAcoesHTML = `
        <button class="btn-menu-acoes" data-action="abrir-menu-acoes" title="Mais Ações">
            <i class="fas fa-ellipsis-v"></i>
        </button>
        
        <div class="menu-acoes-popup" id="menu-acoes-${tiktik.id}">
            ${menuItens.map(item => `
                <button data-action="${item.action}">
                    <i class="fas ${item.icon}"></i>
                    <span>${item.label}</span>
                </button>
            `).join('')}
        </div>
    `;
    }

    return `
        <div class="card-status-header">
            <div class="avatar-tiktik oa-avatar-foco" style="background-image: url('${tiktik.avatar_url}')"></div>
            <div class="info-empregado">
                <span class="nome-tiktik">${tiktik.nome}</span>
                <span class="status-selo ${classeStatus}">${statusFinalTexto}</span>
            </div>
            ${menuAcoesHTML}
        </div>
        ${avisoHorarioHTML}
        ${infoTarefaHTML}
        <div class="card-status-footer">
            ${botoesAcaoHTML}
        </div>
    `;
}

async function handleAcaoManualStatus(tiktik, novoStatus, mensagemConfirmacao, mensagemSucesso) {
    if (mensagemConfirmacao) {
        const confirmado = await mostrarConfirmacao(mensagemConfirmacao, 'aviso');
        if (!confirmado) return;
    }

    const cardDoTiktik = document.querySelector(`.oa-card-status-tiktik[data-tiktik-id="${tiktik.id}"]`);
    let htmlOriginalDoCard = null;

    if (cardDoTiktik) {
        htmlOriginalDoCard = cardDoTiktik.innerHTML;
        cardDoTiktik.classList.add('acao-em-andamento');
    }

    try {
        const payload = { status: novoStatus }; // <<< Criamos o payload
        await fetchFromAPI(`/usuarios/${tiktik.id}/status`, {
            method: 'PUT',
            body: JSON.stringify(payload) // <<< Enviamos o payload
        });
        
        mostrarMensagem(mensagemSucesso, 'sucesso', 2000);
        await renderizarPainelStatus(); // Atualiza com os dados reais

    } catch (error) {
        mostrarMensagem(`Erro ao atualizar status: ${error.message}`, 'erro');
        if (cardDoTiktik && htmlOriginalDoCard) {
            cardDoTiktik.classList.remove('acao-em-andamento');
            cardDoTiktik.innerHTML = htmlOriginalDoCard; // Reverte!
        }
    }
}
// --- Funções de Manipulação de Ações (Handles) ---
async function handleAtribuirTarefa(tiktik) {
    if (!modalAtribuirTarefaElemento) {
        console.error("FALHA CRÍTICA: O elemento do modal não foi inicializado.");
        return mostrarMensagem("Erro ao abrir painel (código: M03).", "erro");
    }

    // Garante que o modal esteja no body para ser manipulado
    document.body.appendChild(modalAtribuirTarefaElemento);
    
    // A variável 'modal' continua sendo a referência ao container principal
    const modal = modalAtribuirTarefaElemento;
    
    const fecharModal = () => {
        modal.style.display = 'none';
        if (modal.parentNode === document.body) {
            document.body.removeChild(modal);
        }
    };

    // Seletores mais seguros com verificação de existência
    const overlay = modal.querySelector('.popup-overlay');
    const btnFechar = modal.querySelector('.oa-modal-fechar-btn');

    if (overlay) {
        overlay.onclick = fecharModal;
    } else {
        console.warn("Aviso: O elemento .popup-overlay não foi encontrado no modal de atribuir tarefa.");
    }

    if (btnFechar) {
        btnFechar.onclick = fecharModal;
    } else {
        console.warn("Aviso: O botão .oa-modal-fechar-btn não foi encontrado no modal de atribuir tarefa.");
    }
    
    const titulo = modal.querySelector('#modalAtribuirTitulo');
    const colunaLista = modal.querySelector('.coluna-lista-produtos');
    const colunaConfirmacao = modal.querySelector('.coluna-confirmacao');
    const filaWrapper = modal.querySelector('#modalAtribuirFilaWrapper');
    const formContainer = modal.querySelector('#modalAtribuirFormContainer');
    const buscaInput = modal.querySelector('#buscaProdutoModal');
    const paginacaoContainer = modal.querySelector('#modalPaginacaoContainer');

    let todosItensDaFila = [];
    let itemSelecionado = null;
    let currentPage = 1;
    const itemsPerPage = 6;

    // --- INICIALIZAÇÃO E EXIBIÇÃO DO MODAL (FLUXO CORRIGIDO) ---
    titulo.innerHTML = `Atribuir Tarefa para <span class="nome-destaque-modal">${tiktik.nome}</span>`;
    buscaInput.value = '';
    formContainer.innerHTML = `<div class="placeholder-confirmacao"><i class="fas fa-mouse-pointer"></i><p>Selecione um item da lista para começar.</p></div>`;
    filaWrapper.innerHTML = '<div class="spinner">Carregando fila...</div>';
    paginacaoContainer.innerHTML = '';

    colunaLista.style.display = 'flex';
    colunaConfirmacao.style.display = 'flex';
    
    modal.querySelector('.popup-overlay').onclick = fecharModal;
    modal.querySelector('.oa-modal-fechar-btn').onclick = fecharModal;
    modal.style.display = 'flex';

    const mostrarTela = (tela) => {
        if (window.innerWidth > 768) return;
        colunaLista.style.display = (tela === 'lista') ? 'flex' : 'none';
        colunaConfirmacao.style.display = (tela === 'confirmacao') ? 'flex' : 'none';
    };

    const renderizarItensPaginados = () => {
        const termoBusca = buscaInput.value.toLowerCase();
        const itensFiltrados = todosItensDaFila.filter(item => 
            item.produto_nome.toLowerCase().includes(termoBusca) ||
            item.variante.toLowerCase().includes(termoBusca)
        );

        const totalPages = Math.ceil(itensFiltrados.length / itemsPerPage) || 1;
        currentPage = Math.min(currentPage, totalPages);
        const inicio = (currentPage - 1) * itemsPerPage;
        const fim = inicio + itemsPerPage;
        const itensDaPagina = itensFiltrados.slice(inicio, fim);

        const produtosEmTrabalho = new Map();
        statusTiktiksCache
            .filter(t => t.status_atual === 'STATUS.PRODUZINDO' && t.produto_id)
            .forEach(t => {
                const chave = `${t.produto_id}|${t.variante || '-'}`;
                if (!produtosEmTrabalho.has(chave)) {
                    produtosEmTrabalho.set(chave, []);
                }
                produtosEmTrabalho.get(chave).push({ nome: t.nome, quantidade: t.quantidade_entregue });
            });

        filaWrapper.innerHTML = '';
        if (itensDaPagina.length === 0) {
            filaWrapper.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhum item encontrado.</p>';
            paginacaoContainer.style.display = 'none';
            return;
        }

        itensDaPagina.forEach(item => {
            const produtoInfo = todosOsProdutosCadastrados.find(p => p.id == item.produto_id);
            const imagemSrc = obterImagemProduto(produtoInfo, item.variante);
            
            const chaveProduto = `${item.produto_id}|${item.variante || '-'}`;
            const tarefasAtivas = produtosEmTrabalho.get(chaveProduto);

            let saldoDisplay; // Declarada aqui
            let classesAdicionais = '';
            
            if (tarefasAtivas) {
                const quantidadeReservada = tarefasAtivas.reduce((total, task) => total + task.quantidade, 0);
                const saldoDisponivel = item.saldo_para_arrematar - quantidadeReservada;

                saldoDisplay = `Disp: ${saldoDisponivel > 0 ? saldoDisponivel : 0} / ${item.saldo_para_arrematar}`;
                classesAdicionais = 'em-trabalho-modal';
            } else {
                saldoDisplay = `Disp: ${item.saldo_para_arrematar}`;
            }
            
            const cardHTML = `
                <div class="oa-card-arremate-modal ${classesAdicionais}" data-produto-id="${item.produto_id}" data-variante="${item.variante}">
                    <img src="${imagemSrc}" alt="${item.produto_nome}" class="oa-card-img" onerror="this.src='/img/placeholder-image.png'">
                    <div class="oa-card-info">
                        <h3>${item.produto_nome}</h3>
                        <p>${item.variante && item.variante !== '-' ? item.variante : 'Padrão'}</p>
                    </div>
                    <div class="oa-card-dados-modal">
                        <span class="valor">${saldoDisplay}</span>
                    </div>
                </div>`;
            filaWrapper.insertAdjacentHTML('beforeend', cardHTML);
        });
        
        filaWrapper.querySelectorAll('.oa-card-arremate-modal').forEach(card => {
            card.addEventListener('click', () => selecionarItem(card.dataset.produtoId, card.dataset.variante));
        });
        
        renderizarPaginacao(paginacaoContainer, totalPages, currentPage, (page) => {
            currentPage = page;
            renderizarItensPaginados();
        });
    };

        const selecionarItem = (produtoId, variante) => {
        filaWrapper.querySelector('.selecionada')?.classList.remove('selecionada');
        const cardSelecionado = filaWrapper.querySelector(`[data-produto-id="${produtoId}"][data-variante="${variante}"]`);
        if (cardSelecionado) {
            cardSelecionado.classList.add('selecionada');
        }

        itemSelecionado = todosItensDaFila.find(p => p.produto_id == produtoId && p.variante == variante);

        if (itemSelecionado) {
            const produtoInfo = todosOsProdutosCadastrados.find(p => p.id == itemSelecionado.produto_id);
            const imagemSrc = obterImagemProduto(produtoInfo, itemSelecionado.variante);

            // Mapa de produtos em trabalho
            const produtosEmTrabalho = new Map();
            statusTiktiksCache
                .filter(t => t.status_atual === 'STATUS.PRODUZINDO' && t.produto_id)
                .forEach(t => {
                    const chave = `${t.produto_id}|${t.variante || '-'}`;
                    if (!produtosEmTrabalho.has(chave)) {
                        produtosEmTrabalho.set(chave, []);
                    }
                    produtosEmTrabalho.get(chave).push({ nome: t.nome, quantidade: t.quantidade_entregue });
                });

            const chaveProduto = `${itemSelecionado.produto_id}|${itemSelecionado.variante || '-'}`;
            const tarefasAtivas = produtosEmTrabalho.get(chaveProduto);
            
            let saldoDisponivel = itemSelecionado.saldo_para_arrematar;
            if (tarefasAtivas) {
                const quantidadeReservada = tarefasAtivas.reduce((total, task) => total + task.quantidade, 0);
                saldoDisponivel = itemSelecionado.saldo_para_arrematar - quantidadeReservada;
            }
            saldoDisponivel = saldoDisponivel > 0 ? saldoDisponivel : 0;

            // Gera a lista de OPs de origem
            let opsOrigemHTML = '';
            if (itemSelecionado.ops_detalhe && itemSelecionado.ops_detalhe.length > 0) {
                const listaOps = itemSelecionado.ops_detalhe
                    .map(op => `<li>OP ${op.numero} (Saldo: ${op.saldo_op})</li>`)
                    .join('');
                opsOrigemHTML = `
                    <div class="origem-lancamento-container">
                        <strong>Origem do Lançamento:</strong>
                        <ul>${listaOps}</ul>
                    </div>
                `;
            }

            // --- INÍCIO DA PARTE MODIFICADA ---
            
            // 1. ATUALIZAÇÃO DO HTML DO FORMULÁRIO
            formContainer.innerHTML = `
                <button id="btnVoltarParaLista" class="oa-btn-voltar-mobile"><i class="fas fa-arrow-left"></i> Voltar</button>
                <img src="${imagemSrc}" alt="Produto" class="img-confirmacao">
                <h4>${itemSelecionado.produto_nome}</h4>
                <p>${itemSelecionado.variante && itemSelecionado.variante !== '-' ? itemSelecionado.variante : 'Padrão'}</p>
                
                ${opsOrigemHTML} 

                <div class="info-saldo-atribuir">
                    <div class="saldo-item">
                        <label>Disponível Agora</label>
                        <span class="saldo-valor pendente">${saldoDisponivel}</span>
                    </div>
                    <div class="saldo-item">
                        <label>Restará</label>
                        <span id="saldoRestante" class="saldo-valor restante">--</span>
                    </div>
                </div>

                <div class="seletor-quantidade-wrapper">
                    <label for="inputQuantidadeAtribuir">Qtd. a Arrematar:</label>
                    <div class="input-container">
                        <button type="button" class="ajuste-qtd-btn" data-ajuste="-1">-</button>
                        <input type="number" id="inputQuantidadeAtribuir" class="oa-input-tarefas" min="0" max="${saldoDisponivel}" required>
                        <button type="button" class="ajuste-qtd-btn" data-ajuste="1">+</button>
                    </div>
                    <div class="atalhos-qtd-container">
                        <button type="button" class="atalho-qtd-btn" data-atalho="10">+10</button>
                        <button type="button" class="atalho-qtd-btn" data-atalho="50">+50</button>
                        <button type="button" class="atalho-qtd-btn" data-atalho="tudo">TUDO</button>
                    </div>
                </div>
                <button id="btnConfirmarAtribuicao" class="oa-btn oa-btn-sucesso" disabled><i class="fas fa-check"></i> Confirmar</button>
            `;

            // 2. ADIÇÃO DOS NOVOS LISTENERS E LÓGICA DE INTERAÇÃO
            const inputQtd = formContainer.querySelector('#inputQuantidadeAtribuir');
            const btnConfirmar = formContainer.querySelector('#btnConfirmarAtribuicao');
            const saldoRestanteEl = formContainer.querySelector('#saldoRestante');
            const maxQtd = saldoDisponivel;

            const atualizarInput = (novaQtd) => {
                let valor = Math.max(0, Math.min(novaQtd, maxQtd));
                inputQtd.value = valor;
                inputQtd.dispatchEvent(new Event('input', { bubbles: true }));
            };

            formContainer.querySelectorAll('.ajuste-qtd-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const ajuste = parseInt(btn.dataset.ajuste);
                    const valorAtual = parseInt(inputQtd.value) || 0;
                    atualizarInput(valorAtual + ajuste);
                });
            });

            formContainer.querySelectorAll('.atalho-qtd-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const atalho = btn.dataset.atalho;
                    const valorAtual = parseInt(inputQtd.value) || 0;
                    
                    if (atalho === 'tudo') {
                        atualizarInput(maxQtd);
                    } else {
                        const incremento = parseInt(atalho);
                        atualizarInput(valorAtual + incremento);
                    }
                });
            });

        // 3. SEU LISTENER PRINCIPAL (COM O AVISO INTELIGENTE)
        inputQtd.addEventListener('input', debounce(() => {
                const qtd = parseInt(inputQtd.value) || 0;
                const restante = saldoDisponivel - qtd;
                saldoRestanteEl.textContent = restante >= 0 ? restante : '--';
                btnConfirmar.disabled = !(qtd > 0 && qtd <= saldoDisponivel);

                // --- INÍCIO DA NOVA LÓGICA DE CONFLITO DE HORÁRIO ---
                
                // Remove qualquer aviso antigo
                formContainer.querySelector('.aviso-pausa-inteligente')?.remove();

                if (qtd > 0) {
                    // Pega a média de tempo para este produto
                    const mediaTempo = itemSelecionado.media_tempo_por_peca || 0;
                    
                    // Pega os dados completos do tiktik para quem estamos atribuindo a tarefa
                    const tiktikDadosCompletos = statusTiktiksCache.find(t => t.id === tiktik.id);

                    if (mediaTempo > 0 && tiktikDadosCompletos) {
                        const tempoEstimadoSegundos = qtd * mediaTempo;
                        const infoProximaPausa = calcularTempoAteProximaPausa(tiktikDadosCompletos);
                        
                        // Verifica se existe uma pausa futura E se o tempo estimado a ultrapassa
                        if (infoProximaPausa && tempoEstimadoSegundos > infoProximaPausa.segundosAtePausa) {
                            const tempoEstimadoFormatado = formatarDuracaoSegundos(tempoEstimadoSegundos);
                            const avisoEl = document.createElement('p');
                            avisoEl.className = 'aviso-pausa-inteligente';
                            avisoEl.innerHTML = `⚠️ Tempo estimado de <strong>${tempoEstimadoFormatado}</strong> excede a próxima pausa.`; 
                                                    
                            // Insere o aviso logo após o seletor de quantidade
                            formContainer.querySelector('.seletor-quantidade-wrapper').insertAdjacentElement('afterend', avisoEl);
                        }
                    }
                }
            }, 300));

            // O resto do seu código permanece igual
            formContainer.querySelector('#btnVoltarParaLista').addEventListener('click', () => mostrarTela('lista'));
            inputQtd.focus();
            btnConfirmar.onclick = () => confirmarAtribuicao(tiktik, itemSelecionado, parseInt(inputQtd.value));
            mostrarTela('confirmacao');
            const colunaConfirmacao = formContainer.closest('.coluna-confirmacao');
                if (colunaConfirmacao) {
                    colunaConfirmacao.scrollTop = 0;
                }
            }
        };

    const confirmarAtribuicao = async (tiktik, item, quantidade) => {
            const btnConfirmar = formContainer.querySelector('#btnConfirmarAtribuicao');
            
            // --- INÍCIO DA LÓGICA DE DECISÃO ---
            const tiktikDadosCompletos = statusTiktiksCache.find(t => t.id === tiktik.id);
            const mediaTempo = item.media_tempo_por_peca || 0;
            const tempoEstimadoSegundos = quantidade * mediaTempo;
            const infoProximaPausa = tiktikDadosCompletos ? calcularTempoAteProximaPausa(tiktikDadosCompletos) : null;

            // Se existe um conflito de horário...
            if (infoProximaPausa && tempoEstimadoSegundos > infoProximaPausa.segundosAtePausa) {
                const tempoEstimadoFormatado = formatarDuracaoSegundos(tempoEstimadoSegundos);
                const tempoAtePausaFormatado = formatarDuracaoSegundos(infoProximaPausa.segundosAtePausa);

                const mensagem = `
                    <strong>Conflito de Horário!</strong><br><br>
                    A tarefa levará cerca de <strong>${tempoEstimadoFormatado}</strong>, mas a próxima pausa de ${tiktik.nome} começa em aproximadamente <strong>${tempoAtePausaFormatado}</strong>.<br><br>
                    Realmente deseja atribuir esta tarefa? O horário de pausa será ajustado.
                `;

                const confirmado = await mostrarConfirmacao(mensagem, 'aviso');

                if (!confirmado) {
                    return;
                }
            }
            // --- FIM DA LÓGICA DE DECISÃO ---

            // --- INÍCIO DA LÓGICA OTIMISTA ---

                // 1. Fechar o modal IMEDIATAMENTE.
                const modal = document.getElementById('modalAtribuirTarefa');
                if (modal) modal.style.display = 'none';

                // 2. Encontrar o card do tiktik na tela.
                const cardDoTiktik = document.querySelector(`.oa-card-status-tiktik[data-tiktik-id="${tiktik.id}"]`);
                let htmlOriginalDoCard = null; // Guardar o estado original para reverter em caso de erro

                if (cardDoTiktik) {
                    htmlOriginalDoCard = cardDoTiktik.innerHTML; // Salva o HTML
                    // Adiciona a classe de carregamento para feedback visual
                    cardDoTiktik.classList.add('acao-em-andamento');
                }

                // 3. Montar o payload da API.
                const payload = {
                    usuario_tiktik_id: tiktik.id,
                    produto_id: item.produto_id,
                    variante: item.variante === '-' ? null : item.variante,
                    quantidade_entregue: quantidade,
                    dados_ops: item.ops_detalhe 
                };

                // 4. Chamar a API em segundo plano.
                try {
                    await fetchFromAPI('/arremates/sessoes/iniciar', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });

                    // SUCESSO! A API confirmou.
                    mostrarMensagem('Tarefa iniciada com sucesso!', 'sucesso', 2000);

                    // Agora, atualizamos o painel e a fila com os dados reais do servidor.
                    // A classe 'acao-em-andamento' será removida pela re-renderização.
                    await renderizarPainelStatus();
                    await forcarAtualizacaoFilaDeArremates();

                } catch (error) {
                    // ERRO! A API falhou.
                    mostrarMensagem(`Erro ao iniciar tarefa: ${error.message}`, 'erro');

                    // Reverte a UI para o estado anterior.
                    if (cardDoTiktik && htmlOriginalDoCard) {
                        cardDoTiktik.classList.remove('acao-em-andamento');
                        cardDoTiktik.innerHTML = htmlOriginalDoCard; // Restaura o HTML
                    }
                }
                // --- FIM DA LÓGICA OTIMISTA ---
            };
    
    titulo.innerHTML = `Atribuir Tarefa para <span class="nome-destaque-modal">${tiktik.nome}</span>`;
    buscaInput.value = '';
    formContainer.innerHTML = `<div class="placeholder-confirmacao"><i class="fas fa-mouse-pointer"></i><p>Selecione um item da lista para começar.</p></div>`;
    colunaLista.style.display = 'flex';
    colunaConfirmacao.style.display = 'flex';
    modal.querySelector('.popup-overlay').onclick = fecharModal;
    modal.querySelector('.oa-modal-fechar-btn').onclick = fecharModal;
    modal.style.display = 'flex';

    try {
        const response = await fetchFromAPI('/arremates/fila?fetchAll=true&sortBy=maior_quantidade');
        todosItensDaFila = response.rows;
        currentPage = 1;
        renderizarItensPaginados();
        buscaInput.oninput = debounce(() => {
            currentPage = 1;
            renderizarItensPaginados();
        }, 300);
    } catch (error) {
        console.error("Erro em handleAtribuirTarefa:", error);
        filaWrapper.innerHTML = `<p class="erro-painel">Erro ao carregar fila de arremates.</p>`;
    }
}

/**
 * Formata uma duração em segundos para um texto amigável (ex: "1 hora e 15 minutos", "32 minutos", "45 segundos").
 * @param {number} totalSegundos - A quantidade total de segundos.
 * @returns {string} - O texto formatado.
 */
function formatarDuracaoSegundos(totalSegundos) {
    if (totalSegundos < 60) {
        return `${Math.round(totalSegundos)} segundos`;
    }

    const totalMinutos = Math.floor(totalSegundos / 60);
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;

    if (horas > 0) {
        if (minutos > 0) {
            return `${horas} hora${horas > 1 ? 's' : ''} e ${minutos} minuto${minutos > 1 ? 's' : ''}`;
        }
        return `${horas} hora${horas > 1 ? 's' : ''}`;
    }
    
    return `${minutos} minuto${minutos > 1 ? 's' : ''}`;
}

async function handleFinalizarTarefa(tiktik) {
    const mensagem = `Finalizando tarefa para <strong>${tiktik.nome}</strong>.<br>Produto: ${tiktik.produto_nome}<br><br>Confirme a quantidade realmente finalizada:`;
    
    const quantidadeFinalizada = await mostrarPromptNumerico(mensagem, {
        valorInicial: tiktik.quantidade_entregue,
        tipo: 'info'
    });
    
    // Se o usuário cancelou, a função retorna null
    if (quantidadeFinalizada === null) {
        return; 
    }

    try {
        await fetchFromAPI('/arremates/sessoes/finalizar', {
            method: 'POST',
            body: JSON.stringify({
                id_sessao: tiktik.id_sessao,
                quantidade_finalizada: quantidadeFinalizada
            })
        });
        
        mostrarMensagem('Tarefa finalizada e arremate registrado!', 'sucesso');

        await renderizarPainelStatus();
        await forcarAtualizacaoFilaDeArremates();

    } catch (error) {
        mostrarMensagem(`Erro ao finalizar tarefa: ${error.message}`, 'erro');
    }
}

async function handleCancelarTarefa(tiktik) {
    // 1. Pede confirmação ao usuário
    const confirmado = await mostrarConfirmacao(
        `Tem certeza que deseja cancelar a tarefa de <strong>${tiktik.produto_nome}</strong> atribuída para <strong>${tiktik.nome}</strong>? <br><br>O cronômetro será zerado e o produto voltará para a fila.`,
        'aviso' // Usamos 'aviso' (amarelo) pois não é um erro, mas requer atenção
    );

    if (!confirmado) {
        return; // Usuário clicou em "Não"
    }

    // 2. Chama a nova API que criamos no backend
    try {
        await fetchFromAPI('/arremates/sessoes/cancelar', {
            method: 'POST',
            body: JSON.stringify({
                id_sessao: tiktik.id_sessao 
            })
        });
        
        mostrarMensagem('Tarefa cancelada com sucesso!', 'sucesso');

        // 3. Atualiza a interface para refletir a mudança
        await renderizarPainelStatus();
        await forcarAtualizacaoFilaDeArremates(); // O saldo do produto na fila principal será corrigido

    } catch (error) {
        mostrarMensagem(`Erro ao cancelar tarefa: ${error.message}`, 'erro');
    }
}

/**
 * Inicia ou para o intervalo de atualização automática do painel.
 */
function controlarAtualizacaoPainel(iniciar = true) {
    // Para os intervalos que rodam a cada segundo, podemos mantê-los como estão,
    // pois são leves e apenas manipulam a UI.
    clearInterval(cronometrosUpdateInterval);
    clearInterval(feedbackUpdateInterval);

    // Para o polling da API, usamos a nova lógica
    clearTimeout(pollingTimeoutId);

    if (iniciar) {
        // Inicia o loop de atualização do cronômetro e feedback de tempo
        cronometrosUpdateInterval = setInterval(atualizarCronometros, 1000);
        feedbackUpdateInterval = setInterval(atualizarFeedbackTempo, 5000);

        // Inicia o polling inteligente da API imediatamente
        iniciarPollingPainel();
        
        // Adiciona um listener para pausar/retomar o polling quando a aba muda
        document.addEventListener('visibilitychange', iniciarPollingPainel);

    } else {
        // Se a instrução for para parar, remove o listener também
        document.removeEventListener('visibilitychange', iniciarPollingPainel);
    }
}

// Variável para controlar o timer do polling
let pollingTimeoutId = null; 
const POLLING_INTERVAL_MS = 20000; // 20 segundos

async function iniciarPollingPainel() {
    // Se a aba não estiver visível, não faz nada e tenta de novo mais tarde.
    if (document.hidden) {
        // Limpa qualquer timer antigo para garantir que não haja duplicação
        clearTimeout(pollingTimeoutId); 
        // Agenda uma nova verificação para quando a aba talvez já esteja visível
        pollingTimeoutId = setTimeout(iniciarPollingPainel, POLLING_INTERVAL_MS);
        return; // Para a execução aqui
    }

    try {
        // Chama a função que busca os dados e atualiza a tela
        await renderizarPainelStatus();
    } catch (error) {
        console.error("[Polling Inteligente] Erro ao atualizar o painel, tentando novamente mais tarde.", error);
        // Em caso de erro, podemos aumentar o tempo de espera antes de tentar de novo
    } finally {
        // Bloco FINALLY: Este código SEMPRE será executado, com ou sem erro.
        // Garante que o loop continue.
        
        // Limpa qualquer timer antigo para segurança
        clearTimeout(pollingTimeoutId); 
        // Agenda a PRÓXIMA execução da função
        pollingTimeoutId = setTimeout(iniciarPollingPainel, POLLING_INTERVAL_MS);
    }
}

/**
 * Calcula o tempo em segundos até a próxima pausa programada de um tiktik.
 * @param {object} tiktikDados - O objeto completo do tiktik do cache.
 * @returns {object|null} - Retorna um objeto { proximaPausaInicio: 'HH:MM', segundosAtePausa: number } ou null se não houver pausas futuras no dia.
 */
function calcularTempoAteProximaPausa(tiktikDados) {
    const agora = new Date();
    const horaAtualStr = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

    const { horario_saida_1, horario_entrada_2, horario_saida_2, horario_entrada_3 } = tiktikDados;

    let proximaPausaInicio = null;

    // Verifica se a pausa do almoço ainda vai acontecer hoje
    if (horario_saida_1 && horario_entrada_2 && horaAtualStr < horario_saida_1) {
        proximaPausaInicio = horario_saida_1;
    } 
    // Se a pausa do almoço já passou, verifica a pausa da tarde
    else if (horario_saida_2 && horario_entrada_3 && horaAtualStr < horario_saida_2) {
        proximaPausaInicio = horario_saida_2;
    }

    // Se não encontrou nenhuma pausa futura, retorna null
    if (!proximaPausaInicio) {
        return null;
    }

    // Calcula a diferença em segundos
    const dataPausa = new Date(agora.getTime());
    const [h_pausa, m_pausa] = proximaPausaInicio.split(':');
    dataPausa.setHours(parseInt(h_pausa), parseInt(m_pausa), 0, 0);

    // Garante que a data da pausa é no futuro (caso seja um horário que já passou)
    if (dataPausa <= agora) {
        return null;
    }

    const segundosAtePausa = (dataPausa - agora) / 1000;
    
    return { proximaPausaInicio, segundosAtePausa };
}


async function handleDesfazerTarefa(sessaoId) {
    const confirmado = await mostrarConfirmacao(
        "Tem certeza que deseja desfazer esta tarefa finalizada?<br><br>O saldo do produto será devolvido à fila de arremate e esta tarefa não contará mais para as métricas de performance.",
        'perigo'
    );

    if (!confirmado) return;

    try {
        // Mostra o spinner global para feedback imediato
        document.getElementById('carregamentoGlobal').classList.add('visivel');

        await fetchFromAPI('/arremates/sessoes/estornar', {
            method: 'POST',
            body: JSON.stringify({ id_sessao: sessaoId })
        });

        mostrarMensagem("Tarefa desfeita com sucesso!", 'sucesso');
        
        if (modalModoFocoElemento) {
            modalModoFocoElemento.style.display = 'none';
        }
        
        await renderizarPainelStatus();
        await forcarAtualizacaoFilaDeArremates();

    } catch (error) {
        mostrarMensagem(`Erro ao desfazer tarefa: ${error.message}`, 'erro');
    } finally {
        document.getElementById('carregamentoGlobal').classList.remove('visivel');
    }
}


// Em: public/js/admin-arremates.js
// SUBSTITUA a sua função abrirModoFoco inteira por esta:

async function abrirModoFoco(tiktik) {
    // 1. Verifica se temos o elemento do modal em memória
    if (!modalModoFocoElemento) {
        console.error("ERRO CRÍTICO: O elemento do modal não foi inicializado.");
        mostrarMensagem("Erro ao abrir painel (código: M01).", "erro");
        return;
    }
    
    // 2. GARANTE que o modal está anexado ao body do documento
    document.body.appendChild(modalModoFocoElemento);
    
    // 3. Agora podemos trabalhar com ele com segurança, usando a variável global
    const modal = modalModoFocoElemento;

    // 2. Preenche os dados básicos e mostra o modal com spinners
    modal.querySelector('#focoAvatar').src = tiktik.avatar_url || '/img/placeholder-image.png';
    modal.querySelector('#focoNome').textContent = `Desempenho de ${tiktik.nome}`;
    modal.querySelector('#focoMetricas').innerHTML = '<div class="spinner"></div>';
    modal.querySelector('#focoResumoProdutos').innerHTML = '<div class="spinner">Calculando resumo...</div>';
    modal.querySelector('#focoTarefas').innerHTML = '<div class="spinner"></div>';

    // 3. Define as funções de fechar usando as referências recém-buscadas
    const fecharModal = () => {
        modal.style.display = 'none';
        if (modal.parentNode === document.body) {
            document.body.removeChild(modal);
        }
    };
    modal.querySelector('.popup-overlay').onclick = fecharModal;
    modal.querySelector('.oa-modal-fechar-btn').onclick = fecharModal;
    
    // 4. Exibe o modal
    modal.style.display = 'flex';

    try {
        const dados = await fetchFromAPI(`/arremates/desempenho-diario/${tiktik.id}`);
        
        renderizarMetricasFoco(dados);
        renderizarTarefasFoco(dados);
        
        const tarefasContainer = modal.querySelector('#focoTarefas');
        // Adiciona um listener novo a cada abertura. Removê-lo ao fechar seria ideal,
        // mas para este caso, não causará problemas significativos.
        tarefasContainer.addEventListener('click', (event) => {
            const undoButton = event.target.closest('.btn-desfazer-tarefa');
            if (undoButton && !undoButton.disabled) {
                const sessaoId = parseInt(undoButton.dataset.sessaoId);
                handleDesfazerTarefa(sessaoId);
            }
        });
        
    } catch (error) {
        mostrarMensagem(`Erro ao carregar dados de desempenho: ${error.message}`, 'erro');
        fecharModal(); // Fecha o modal se a API der erro
    }
}

function renderizarMetricasFoco(dados) {
    const container = document.getElementById('focoMetricas');
    const { metricas } = dados;
    
    const tempoTrabalhado = new Date(metricas.tempoTotalTrabalhadoSegundos * 1000).toISOString().substr(11, 8);
    const eficiencia = metricas.eficienciaMediaPorPecaSegundos.toFixed(1);

    container.innerHTML = `
        <div class="metrica-item">
            <span class="metrica-valor">${metricas.totalPecasArrematadas}</span>
            <span class="metrica-label">Peças Arrematadas</span>
        </div>
        <div class="metrica-item">
            <span class="metrica-valor">${tempoTrabalhado}</span>
            <span class="metrica-label">Tempo Produtivo</span>
        </div>
        <div class="metrica-item">
            <span class="metrica-valor">${eficiencia}s</span>
            <span class="metrica-label">Média por Peça</span>
        </div>
    `;
}

function renderizarTarefasFoco(dados) {
    const resumoContainer = document.getElementById('focoResumoProdutos');
    const tarefasContainer = document.getElementById('focoTarefas');
    const { sessoes } = dados;

    if (!sessoes || sessoes.length === 0) {
        resumoContainer.innerHTML = '<p>Nenhum produto finalizado hoje.</p>';
        tarefasContainer.innerHTML = '<p>Nenhuma tarefa finalizada hoje.</p>';
        return;
    }

    // --- 1. Processar dados para o Resumo ---
    const resumoProdutos = {};
    sessoes.forEach(sessao => {
        if (sessao.status === 'FINALIZADA') {
            const nomeProduto = sessao.produto_nome;
            if (!resumoProdutos[nomeProduto]) {
                resumoProdutos[nomeProduto] = { 
                    totalPecas: 0, 
                    nome: nomeProduto,
                    imagem: obterImagemProduto(
                        todosOsProdutosCadastrados.find(p => p.id == sessao.produto_id), 
                        null // Para o resumo, usamos a imagem principal do produto
                    )
                };
            }
            resumoProdutos[nomeProduto].totalPecas += sessao.quantidade_finalizada || 0;
        }
    });

    // --- 2. Renderizar o Resumo ---
    const resumoArray = Object.values(resumoProdutos).sort((a, b) => b.totalPecas - a.totalPecas);
    if (resumoArray.length > 0) {
        resumoContainer.innerHTML = resumoArray.map(produto => `
            <div class="foco-resumo-item">
                <img src="${produto.imagem}" alt="${produto.nome}" class="foco-resumo-img">
                <div class="foco-resumo-info">
                    <span class="foco-resumo-nome">${produto.nome}</span>
                    <span class="foco-resumo-qtd">${produto.totalPecas} pçs</span>
                </div>
            </div>
        `).join('');
    } else {
        resumoContainer.innerHTML = '<p>Nenhum produto finalizado hoje.</p>';
    }

    // --- 3. Renderizar os Cards de Tarefas Detalhadas ---
    const sessoesFinalizadas = sessoes.filter(s => s.status === 'FINALIZADA');
    if (sessoesFinalizadas.length > 0) {
        tarefasContainer.innerHTML = sessoesFinalizadas.map(s => {
            const produtoInfo = todosOsProdutosCadastrados.find(p => p.id == s.produto_id);
            const imagemSrc = obterImagemProduto(produtoInfo, s.variante);
            const duracaoMs = s.data_fim ? new Date(s.data_fim) - new Date(s.data_inicio) : 0;
            const duracaoFormatada = new Date(duracaoMs).toISOString().substr(11, 8);
            const podeDesfazer = permissoes.includes('estornar-arremate');

            return `
                <div class="foco-tarefa-card">
                    <img src="${imagemSrc}" alt="${s.produto_nome}" class="foco-tarefa-img">
                    <div class="foco-tarefa-info">
                        <span class="foco-tarefa-produto">${s.produto_nome}</span>
                        <span class="foco-tarefa-variante">${s.variante || 'Padrão'}</span>
                        <div class="foco-tarefa-metricas">
                            <span><i class="fas fa-box"></i> ${s.quantidade_finalizada || 0} pçs</span>
                            <span><i class="fas fa-clock"></i> ${duracaoFormatada}</span>
                        </div>
                    </div>
                    <button class="btn-desfazer-tarefa" 
                            data-sessao-id="${s.id}" 
                            title="Desfazer este lançamento"
                            ${podeDesfazer ? '' : 'disabled'}>
                        <i class="fas fa-undo"></i>
                    </button>
                </div>
            `;
        }).join('');
    } else {
        tarefasContainer.innerHTML = '<p>Nenhuma tarefa finalizada hoje.</p>';
    }
}

// --- Funções de Fetch API (Centralizadas) ---
async function fetchFromAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarMensagem('Sessão expirada. Faça login novamente.', 'erro');
        window.location.href = '/login.html';
        throw new Error('Token não encontrado');
    }

    const response = await fetch(`/api${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache', // Para garantir dados sempre frescos
            ...options.headers
        }
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP Error ${response.status}` }));
        if (response.status === 401) {
            mostrarMensagem('Sessão inválida. Faça login novamente.', 'erro');
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        }
        throw new Error(errorData.error || `Erro ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
}

// Função que extrai as opções de filtro a partir dos dados brutos
function extrairOpcoesDeFiltroArremates(itensDaFila) {
    const produtos = new Set();
    const cores = new Set();
    const tamanhos = new Set();

    itensDaFila.forEach(item => {
        // Agora usamos 'item.produto' porque estamos recebendo a lista já traduzida
        if (item.produto) {
            produtos.add(item.produto);
        }

        // 2. Extrai cores e tamanhos da variante (ex: "Preto | G")
        if (item.variante && item.variante !== '-') {
            const partes = item.variante.split('|').map(p => p.trim());
            partes.forEach(parte => {
                // Heurística simples para identificar tamanho (pode ajustar se necessário)
                if (['P', 'M', 'G', 'GG', 'U', 'UNICO'].includes(parte.toUpperCase())) {
                    tamanhos.add(parte);
                } else if (parte) { // Se não for tamanho e não for vazio
                    // Lógica para cores compostas (ex: "Preto com Branco")
                    const subCores = parte.split(/ com | e /i).map(c => c.trim());
                    subCores.forEach(subCor => cores.add(subCor));
                }
            });
        }
    });

    // Converte os Sets para Arrays e os ordena
    return {
        produtos: Array.from(produtos).sort(),
        cores: Array.from(cores).sort(),
        tamanhos: Array.from(tamanhos).sort((a, b) => { // Ordenação especial para tamanhos
            const ordem = { 'P': 1, 'M': 2, 'G': 3, 'GG': 4, 'U': 5, 'UNICO': 6 };
            return (ordem[a.toUpperCase()] || 99) - (ordem[b.toUpperCase()] || 99);
        }),
    };
}


function obterQuantidadeFinalProduzida(op) {
    if (!op || !op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) {
        return parseInt(op?.quantidade) || 0;
    }
    for (let i = op.etapas.length - 1; i >= 0; i--) {
        const etapa = op.etapas[i];
        if (etapa && etapa.lancado && typeof etapa.quantidade !== 'undefined' && etapa.quantidade !== null) {
            const qtdEtapa = parseInt(etapa.quantidade, 10);
            if (!isNaN(qtdEtapa) && qtdEtapa >= 0) {
                return qtdEtapa;
            }
        }
    }
    return parseInt(op.quantidade) || 0;
}



function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// helper para criar query strings
function objectToQueryString(obj) {
    return Object.keys(obj)
        .map(key => obj[key] ? `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}` : '')
        .filter(Boolean)
        .join('&');
}

function renderizarCardsDaPagina(itensParaRenderizar, page = 1) {
    const container = document.getElementById('arremateCardsContainer');
    const paginationContainer = document.getElementById('arrematePaginationContainer');
    const itemsPerPage = 6;

    if (!container || !paginationContainer) return;

    const totalItems = itensParaRenderizar.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const currentPage = Math.min(page, totalPages);
    const inicio = (currentPage - 1) * itemsPerPage;
    const fim = inicio + itemsPerPage;
    const itensDaPagina = itensParaRenderizar.slice(inicio, fim);

    container.innerHTML = '';
    if (itensDaPagina.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Nenhum item encontrado com os filtros aplicados.</p>';
    } else {
        itensDaPagina.forEach(item => {
            const card = document.createElement('div');
            card.className = 'oa-card-arremate';
            
            const produtoInfo = todosOsProdutosCadastrados.find(p => p.id == item.produto_id);
            
            let imagemSrc = obterImagemProduto(produtoInfo, item.variante);

            const opsOrigemCount = item.ops_detalhe?.length || 0;
            
            card.innerHTML = `
                <img src="${imagemSrc}" alt="${item.produto}" class="oa-card-img">
                <div class="oa-card-info">
                    <h3>${item.produto}</h3>
                    <p>${item.variante && item.variante !== '-' ? item.variante : 'Padrão'}</p>
                </div>
                <div class="oa-card-dados">
                    <div class="dado-bloco">
                        <span class="label">Pendente:</span>
                        <span class="valor total-pendente">${item.total_disponivel_para_embalar}</span>
                    </div>
                    <div class="dado-bloco">
                        <span class="label">OPS:</span>
                        <span class="valor">${opsOrigemCount}</span>
                    </div>
                </div>
            `;

            // IMPORTANTE: O dataset para a view de detalhes deve usar os dados ORIGINAIS
            const itemParaDetalhes = {
                produto_id: item.produto_id,
                produto: item.produto_nome, // <--- Usa o nome original aqui
                variante: item.variante,
                total_quantidade_pendente_arremate: item.saldo_para_arrematar, // <--- Usa o nome original aqui
                ops_detalhe: item.ops_detalhe
            };
            card.dataset.arremateAgregado = JSON.stringify(itemParaDetalhes);
            card.addEventListener('click', handleArremateCardClick);
            container.appendChild(card);
        });
    }

    const paginacaoCallback = (newPage) => {
        renderizarCardsDaPagina(itensParaRenderizar, newPage);
    };
    renderizarPaginacao(paginationContainer, totalPages, currentPage, paginacaoCallback);
}

function renderizarViewPrincipal() {
    renderizarDashboard();
    renderizarCardsArremate(1);
    document.getElementById('arrematesListView').classList.remove('hidden');
    document.getElementById('arremateDetalheView').classList.add('hidden');
}

// --- Funções de Detalhe e Lançamento ---
function handleArremateCardClick(event) {
    const card = event.currentTarget;
    const agregadoString = card.dataset.arremateAgregado;
    if (!agregadoString) return;
    arremateAgregadoEmVisualizacao = JSON.parse(agregadoString);
    localStorage.setItem('arremateDetalheAtual', agregadoString);
    window.location.hash = '#lancar-arremate';
}

async function carregarDetalhesArremateView(agregado) {
    document.getElementById('arrematesListView').style.display = 'none';
    document.getElementById('arremateDetalheView').classList.remove('hidden');

    const produtoInfo = todosOsProdutosCadastrados.find(p => p.id == agregado.produto_id);
    const imagemSrc = obterImagemProduto(produtoInfo, agregado.variante);
    document.getElementById('arremateDetalheThumbnail').innerHTML = `<img src="${imagemSrc}" alt="${agregado.produto}" onerror="this.src='/img/placeholder-image.png'">`;
    document.getElementById('arremateProdutoNomeDetalhe').textContent = agregado.produto;
    document.getElementById('arremateVarianteNomeDetalhe').textContent = agregado.variante && agregado.variante !== '-' ? `(${agregado.variante})` : '';
    document.getElementById('arremateTotalPendenteAgregado').textContent = agregado.total_quantidade_pendente_arremate;
    const formAjuste = document.getElementById('formRegistrarAjuste');
    if (formAjuste) {
        formAjuste.reset();
        document.getElementById('inputQuantidadeAjuste').max = agregado.total_quantidade_pendente_arremate;
    }
    document.querySelectorAll('.oa-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.oa-tab-panel').forEach(panel => panel.classList.remove('active'));
    const abaAjusteBtn = document.querySelector('.oa-tab-btn[data-tab="ajuste"]');
    const abaAjustePanel = document.querySelector('#ajuste-tab');
    if (abaAjusteBtn && abaAjustePanel) {
        abaAjusteBtn.classList.add('active');
        abaAjustePanel.classList.add('active');
    }
}

async function lancarArremateAgregado() {
    if (!arremateAgregadoEmVisualizacao) return;

    const selectUser = document.getElementById('selectUsuarioArremate');
    const inputQtd = document.getElementById('inputQuantidadeArrematar');
    const btnLancar = document.getElementById('btnLancarArremateAgregado');

    const usuarioTiktikId = parseInt(selectUser.value);
    const quantidadeTotal = parseInt(inputQtd.value);

    // Validação
    if (!usuarioTiktikId || isNaN(quantidadeTotal) || quantidadeTotal <= 0 || quantidadeTotal > arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate) {
        mostrarMensagem('Verifique os dados. Usuário e quantidade válida são obrigatórios.', 'aviso');
        return;
    }

    const usuarioSelecionado = todosOsUsuarios.find(u => u.id === usuarioTiktikId);
    if (!usuarioSelecionado) {
        mostrarMensagem('Erro: Usuário Tiktik selecionado não foi encontrado.', 'erro');
        return;
    }
    const nomeUsuarioTiktik = usuarioSelecionado.nome;
    
    const lockKey = arremateAgregadoEmVisualizacao.produto + arremateAgregadoEmVisualizacao.variante;
    if (lancamentosArremateEmAndamento.has(lockKey)) return;
    lancamentosArremateEmAndamento.add(lockKey);

    btnLancar.disabled = true;
    btnLancar.innerHTML = '<div class="spinner-btn-interno"></div> Lançando...';

    try {
        let quantidadeRestante = quantidadeTotal;
        const opsOrdenadas = arremateAgregadoEmVisualizacao.ops_detalhe.sort((a, b) => a.numero - b.numero);

        for (const op of opsOrdenadas) {
            if (quantidadeRestante <= 0) break;
            
            // --- MUDANÇA AQUI ---
            // Usamos 'saldo_op' que vem da API, em vez de 'quantidade_pendente_nesta_op'
            const qtdParaEstaOP = Math.min(quantidadeRestante, op.saldo_op);

            
            if (qtdParaEstaOP > 0) {
                // Monta o payload para o backend
                const payload = {
                    op_numero: op.numero,
                    op_edit_id: op.edit_id,
                    produto_id: arremateAgregadoEmVisualizacao.produto_id,
                    variante: arremateAgregadoEmVisualizacao.variante === '-' ? null : arremateAgregadoEmVisualizacao.variante,
                    quantidade_arrematada: qtdParaEstaOP,
                    usuario_tiktik: nomeUsuarioTiktik,
                    usuario_tiktik_id: usuarioTiktikId
                };
                
                // Envia para a rota POST original
                await fetchFromAPI('/arremates', { method: 'POST', body: JSON.stringify(payload) });
                quantidadeRestante -= qtdParaEstaOP;
            }
        }
        
        mostrarMensagem('Arremate lançado com sucesso!', 'sucesso');
        // Força o recarregamento da lista
        window.location.hash = ''; 

    } catch (error) {
        console.error("Erro ao lançar arremate agregado:", error);
        mostrarMensagem(`Erro ao lançar arremate: ${error.message}`, 'erro');
    } finally {
        btnLancar.disabled = false;
        btnLancar.innerHTML = '<i class="fas fa-check"></i> Lançar Arremate';
        lancamentosArremateEmAndamento.delete(lockKey);
    }
}

function abrirModalPerda() {
    if (!arremateAgregadoEmVisualizacao) return;

    // Verifica a permissão antes de abrir
    if (!permissoes.includes('registrar-perda-arremate')) {
        mostrarMensagem('Você não tem permissão para registrar perdas.', 'aviso');
        return;
    }

    const modal = document.getElementById('modalRegistrarPerda');
    const infoProdutoEl = document.getElementById('infoProdutoModalPerda');
    const inputQtd = document.getElementById('inputQuantidadePerdida');

    // Preenche as informações do produto no modal
    infoProdutoEl.textContent = `${arremateAgregadoEmVisualizacao.produto} (${arremateAgregadoEmVisualizacao.variante || 'Padrão'})`;
    
    // Reseta o formulário
    document.getElementById('formRegistrarPerda').reset();
    
    // Define o máximo que pode ser perdido
    inputQtd.max = arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate;

    modal.classList.remove('hidden');
}

function fecharModalPerda() {
    document.getElementById('modalRegistrarPerda').classList.add('hidden');
}

async function registrarAjuste() {
    if (!arremateAgregadoEmVisualizacao) return;

    const motivo = document.getElementById('selectMotivoAjuste').value;
    const quantidadePerdida = parseInt(document.getElementById('inputQuantidadeAjuste').value);
    const observacao = document.getElementById('textareaObservacaoAjuste').value;
    const totalPendente = arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate;

    // Validações
    if (!motivo) return mostrarMensagem('Por favor, selecione o motivo do ajuste.', 'aviso');
    if (isNaN(quantidadePerdida) || quantidadePerdida <= 0) return mostrarMensagem('A quantidade a ser descontada deve ser maior que zero.', 'aviso');
    if (quantidadePerdida > totalPendente) return mostrarMensagem(`A quantidade a descontar (${quantidadePerdida}) excede o saldo pendente (${totalPendente}).`, 'erro');

    const btnConfirmar = document.getElementById('btnConfirmarRegistroAjuste');
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<div class="spinner-btn-interno"></div> Registrando...';
    
    try {
        const payload = {
            produto_id: arremateAgregadoEmVisualizacao.produto_id,
            variante: arremateAgregadoEmVisualizacao.variante === '-' ? null : arremateAgregadoEmVisualizacao.variante,
            quantidadePerdida: quantidadePerdida,
            motivo: motivo,
            observacao: observacao,
            // O backend precisa das OPs originais para saber de onde dar baixa no saldo
            opsOrigem: arremateAgregadoEmVisualizacao.ops_detalhe.map(op => ({
                numero: op.numero,
                quantidade_pendente_nesta_op: op.saldo_op
            }))
        };
        
        // Usamos a mesma rota de registrar-perda, pois a lógica no backend é a mesma
        await fetchFromAPI('/arremates/registrar-perda', { method: 'POST', body: JSON.stringify(payload) });

        mostrarMensagem('Ajuste registrado com sucesso!', 'sucesso');
        window.location.hash = ''; // Volta para a lista

    } catch (error) {
        mostrarMensagem(`Erro ao registrar ajuste: ${error.message}`, 'erro');
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '<i class="fas fa-save"></i> Confirmar Ajuste de Saldo';
    }
}


// --- Funções Auxiliares de UI (Paginação, Imagem, etc.) ---
function paginarArray(array, page, itemsPerPage) {
    const totalPages = Math.ceil(array.length / itemsPerPage) || 1;
    page = Math.max(1, Math.min(page, totalPages));
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return {
        items: array.slice(start, end),
        currentPage: page,
        totalPages: totalPages
    };
}


function obterImagemProduto(produtoInfo, varianteNome) {
    const placeholder = '/img/placeholder-image.png'; // Mantemos um placeholder local como último recurso

    if (!produtoInfo) {
        return placeholder;
    }

    // 1. Tenta pegar a imagem da variação específica
    if (varianteNome && varianteNome !== '-') {
        const gradeItem = produtoInfo.grade?.find(g => g.variacao === varianteNome);
        if (gradeItem?.imagem) {
            return gradeItem.imagem;
        }
    }
    
    // 2. Se não encontrou na variação, pega a imagem do "produto pai"
    //    Se o produto pai também não tiver, retorna o placeholder.
    return produtoInfo.imagem || placeholder;
}

async function handleEstornoClick(event) {
    const button = event.currentTarget;
    const arremateId = button.dataset.id;
    const arremateInfo = button.dataset.info;

    const confirmado = await mostrarConfirmacao(
        `Tem certeza que deseja estornar o lançamento de <br><strong>${arremateInfo}</strong>?<br><br>Esta ação não pode ser desfeita.`,
        'perigo'
    );

    if (!confirmado) return;
    
    button.disabled = true;
    button.innerHTML = '<div class="spinner-btn-interno" style="border-top-color: white;"></div>';

    try {
        await fetchFromAPI('/arremates/estornar', {
            method: 'POST',
            body: JSON.stringify({ id_arremate: parseInt(arremateId) })
        });
        
        mostrarMensagem('Lançamento estornado com sucesso!', 'sucesso', 2500);
        
        // Agora, chama a nova função para recarregar o conteúdo do modal
        // com os dados da página atual em que estava, usando a variável de estado correta.
        await buscarErenderizarHistoricoArremates(HISTORICO_ARREMATES_STATE.currentPage);

        await forcarAtualizacaoFilaDeArremates();

    } catch (error) {
        mostrarMensagem(`Erro ao estornar: ${error.message}`, 'erro');
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-undo"></i>';
    }
}

async function atualizarDashboard() {
    // Referências aos elementos
    const contadorProdutosFilaEl = document.getElementById('contadorProdutosFila');
    const contadorPecasPendentesEl = document.getElementById('contadorPecasPendentes');
    const contadorArrematadoHojeEl = document.getElementById('contadorArrematadoHoje');

    // 1. e 2. Produtos na Fila e Peças Pendentes (usam dados da variável de cache)
    if (contadorProdutosFilaEl) {
        contadorProdutosFilaEl.textContent = totaisDaFilaDeArremate.totalGrupos;
    }
    if (contadorPecasPendentesEl) {
        contadorPecasPendentesEl.textContent = totaisDaFilaDeArremate.totalPecas;
    }

    // 3. Arrematado Hoje (continua com sua chamada de API dedicada)
    if (contadorArrematadoHojeEl) {
        try {
            contadorArrematadoHojeEl.textContent = '...';
            const response = await fetchFromAPI('/arremates/contagem-hoje');
            contadorArrematadoHojeEl.textContent = response.total || 0;
        } catch (error) {
            console.error("Erro ao buscar contagem de arremates de hoje:", error);
            contadorArrematadoHojeEl.textContent = "?";
        }
    }
}

// --- LÓGICA COMPLETA E REATORADA PARA O MODAL DE HISTÓRICO GERAL DE ARREMATES ---

// Adicione esta variável global no topo do seu arquivo
const HISTORICO_ARREMATES_STATE = {
    currentPage: 1,
    perPage: 10,
    modalElement: null
};

/**
 * Função principal para abrir e gerenciar o modal.
 * Ela cria o modal na primeira vez e apenas o exibe nas vezes seguintes.
 */
async function mostrarHistoricoArremates() {
    // Se o modal ainda não foi criado, cria-o em memória
    if (!HISTORICO_ARREMATES_STATE.modalElement) {
        criarElementoModalHistorico();
    }
    
    // Adiciona o modal ao DOM (se ainda não estiver lá) e o exibe
    document.body.appendChild(HISTORICO_ARREMATES_STATE.modalElement);
    HISTORICO_ARREMATES_STATE.modalElement.style.display = 'flex';
    
    // Inicia a busca dos dados
    await buscarErenderizarHistoricoArremates(1);
}



/**
 * Busca os dados da API e chama a função para renderizar a tabela.
 */
async function buscarErenderizarHistoricoArremates(page = 1) {
    HISTORICO_ARREMATES_STATE.currentPage = page;
    const modal = HISTORICO_ARREMATES_STATE.modalElement;
    if (!modal) return;

    const tabelaWrapper = modal.querySelector('#historicoArrematesTabelaWrapper');
    const paginacaoContainer = modal.querySelector('#historicoArrematesPaginacao');
    
    tabelaWrapper.innerHTML = '<div class="spinner">Buscando histórico...</div>';
    paginacaoContainer.innerHTML = '';

    try {
        const params = new URLSearchParams({
            busca: modal.querySelector('#filtroBuscaHistorico').value,
            tipoEvento: modal.querySelector('#filtroTipoEventoHistorico').value,
            periodo: modal.querySelector('#filtroPeriodoHistorico').value,
            page: HISTORICO_ARREMATES_STATE.currentPage,
            limit: HISTORICO_ARREMATES_STATE.perPage
        });

        const response = await fetchFromAPI(`/arremates/historico?${params.toString()}`);
        const { rows: eventos, pagination } = response;
        
        renderizarTabelaHistoricoArremates(eventos, pagination);

    } catch (error) {
        console.error("Erro ao carregar histórico de arremates:", error);
        tabelaWrapper.innerHTML = `<p style="text-align: center; color: red;">Erro ao carregar histórico.</p>`;
    }
}

/**
 * Renderiza o conteúdo (tabela e paginação) dentro do modal.
 */
function renderizarTabelaHistoricoArremates(eventos, pagination) {
    const modal = HISTORICO_ARREMATES_STATE.modalElement;
    if (!modal) return;

    const tabelaWrapper = modal.querySelector('#historicoArrematesTabelaWrapper');
    const paginacaoContainer = modal.querySelector('#historicoArrematesPaginacao');

    if (!eventos || eventos.length === 0) {
        tabelaWrapper.innerHTML = '<p style="text-align: center;">Nenhum evento encontrado para os filtros selecionados.</p>';
        return;
    }

    let tbodyHTML = '';
    eventos.forEach(item => {
        let classeLinha = '';
        let displayQuantidade = `<span>${item.quantidade_arrematada || 0}</span>`;
        let displayTiktik = item.usuario_tiktik || 'N/A';
        let displayLancadoPor = item.lancado_por || 'N/A';
        let acoesHTML = ''; // Inicia vazio

        // Lógica para formatar cada tipo de lançamento
        switch (item.tipo_lancamento) {
            case 'PRODUCAO':
                classeLinha = 'linha-producao';
                displayQuantidade = `<span style="color: var(--oa-cor-verde-sucesso); font-weight: bold;">+${item.quantidade_arrematada}</span>`;
                // O botão de estorno só aparece para produções que não foram anuladas
                if (permissoes.includes('estornar-arremate')) {
                    acoesHTML = `
                        <button class="oa-btn-icon oa-btn-perigo btn-estornar-historico" 
                                title="Estornar este lançamento"
                                data-id="${item.id}" 
                                data-info="${item.quantidade_arrematada} pçs para ${item.usuario_tiktik}">
                            <i class="fas fa-undo"></i>
                        </button>`;
                }
                break;

            case 'PERDA':
                classeLinha = 'linha-perda';
                displayQuantidade = `<span style="color: var(--oa-cor-vermelho-perigo); font-weight: bold;">${item.quantidade_arrematada > 0 ? '-' : ''}${item.quantidade_arrematada}</span>`;
                displayTiktik = `<i style="color: var(--oa-cor-vermelho-perigo);">Perda</i>`;
                break;

            case 'ESTORNO':
                classeLinha = 'linha-estorno';
                // O registro de estorno tem a quantidade negativa, usamos Math.abs para mostrar
                displayQuantidade = `<span style="color: var(--oa-cor-amarelo-atencao); font-weight: bold;">${Math.abs(item.quantidade_arrematada)}</span>`;
                displayTiktik = `<i style="color: #555;">(Ref. a ${item.usuario_tiktik})</i>`;
                displayLancadoPor = `<strong style="color: var(--oa-cor-amarelo-atencao);">${item.lancado_por} (Estornou)</strong>`;
                break;

            case 'PRODUCAO_ANULADA':
                classeLinha = 'linha-anulada';
                displayQuantidade = `<span style="text-decoration: line-through; color: #888;">${item.quantidade_arrematada}</span>`;
                // Mostra quem anulou
                displayLancadoPor = `<i style="color: #888;">Anulado por ${item.lancado_por}</i>`;
                break;
        }

        // Constrói a linha da tabela com todos os dados formatados
        tbodyHTML += `
            <tr class="${classeLinha}">
                <td data-label="Produto">${item.produto || 'Produto não encontrado'}${item.variante ? ` | ${item.variante}` : ''}</td>
                <td data-label="Quantidade">${displayQuantidade}</td>
                <td data-label="Tiktik (Feito por)">${displayTiktik}</td>
                <td data-label="Lançado/Estornado por">${displayLancadoPor}</td>
                <td data-label="Data">${new Date(item.data_lancamento).toLocaleString('pt-BR')}</td>
                <td data-label="OP Origem">${item.op_numero || '-'}</td>
                <td data-label="Ações" style="text-align: center;">${acoesHTML}</td>
            </tr>
        `;
    });
    
    // Constrói e injeta a tabela
    tabelaWrapper.innerHTML = `
        <table class="oa-tabela-historico">
            <thead>
                <tr>
                    <th>Produto | Variação</th>
                    <th>Qtde</th>
                    <th>Tiktik (Feito por)</th>
                    <th>Lançado/Estornado por</th>
                    <th>Data & Hora</th>
                    <th>OP Origem</th>
                    <th style="text-align: center;">Ações</th>
                </tr>
            </thead>
            <tbody>${tbodyHTML}</tbody>
        </table>
    `;

    // Adiciona os listeners aos botões de estorno
    tabelaWrapper.querySelectorAll('.btn-estornar-historico').forEach(btn => {
        btn.addEventListener('click', handleEstornoClick);
    });

    // Renderiza a paginação
    renderizarPaginacao(paginacaoContainer, pagination.totalPages, pagination.currentPage, buscarErenderizarHistoricoArremates);
}

/**
 * Cria o elemento HTML do modal e seus listeners UMA ÚNICA VEZ.
 */
function criarElementoModalHistorico() {
    const container = document.createElement('div');
    container.id = 'historicoArrematesModalContainer';
    container.className = 'popup-container';
    container.style.display = 'none';

    container.innerHTML = `
        <div class="popup-overlay"></div>
        <div class="oa-modal-historico">
            <div class="oa-modal-header">
                <h3 class="oa-modal-titulo">Histórico Geral de Arremates</h3>
                <button class="oa-modal-fechar-btn">X</button>
            </div>
            <div class="oa-modal-filtros">
                <div class="oa-form-grupo" style="flex-grow: 2;"><label for="filtroBuscaHistorico">Buscar</label><input type="text" id="filtroBuscaHistorico" class="oa-input" placeholder=" Busque por Produto, Tiktik ou Lançador..."></div>
                <div class="oa-form-grupo"><label for="filtroTipoEventoHistorico">Tipo</label><select id="filtroTipoEventoHistorico" class="oa-select"><option value="todos">Todos</option><option value="PRODUCAO">Lançamentos</option><option value="PERDA">Perdas</option><option value="ESTORNO">Estornos</option></select></div>
                <div class="oa-form-grupo"><label for="filtroPeriodoHistorico">Período</label><select id="filtroPeriodoHistorico" class="oa-select"><option value="7d">7 dias</option><option value="hoje">Hoje</option><option value="30d">30 dias</option><option value="mes_atual">Mês Atual</option></select></div>
            </div>
            <div class="oa-modal-body"><div id="historicoArrematesTabelaWrapper" class="oa-tabela-wrapper"></div></div>
            <div class="oa-modal-footer"><div id="historicoArrematesPaginacao" class="oa-paginacao-container"></div></div>
        </div>
    `;

    // Listeners
    const recarregar = () => buscarErenderizarHistoricoArremates(1);
    container.querySelector('#filtroBuscaHistorico').addEventListener('input', debounce(recarregar, 400));
    container.querySelector('#filtroTipoEventoHistorico').addEventListener('change', recarregar);
    container.querySelector('#filtroPeriodoHistorico').addEventListener('change', recarregar);

    const fechar = () => { container.style.display = 'none'; };
    container.querySelector('.oa-modal-fechar-btn').addEventListener('click', fechar);
    container.querySelector('.popup-overlay').addEventListener('click', fechar);

    HISTORICO_ARREMATES_STATE.modalElement = container;
}


// --- Roteador e Inicialização ---
async function handleHashChange() {
    const hash = window.location.hash;
    const arrematesListView = document.getElementById('arrematesListView');
    const arremateDetalheView = document.getElementById('arremateDetalheView');

    if (hash === '#lancar-arremate') {
        arrematesListView.style.display = 'none';
        const data = localStorage.getItem('arremateDetalheAtual');
        if (data) {
            arremateDetalheView.classList.remove('hidden');
            await carregarDetalhesArremateView(JSON.parse(data));
        } else {
            window.location.hash = '';
        }
    } else {
        arremateDetalheView.classList.add('hidden');
        arrematesListView.style.display = 'block';
        localStorage.removeItem('arremateDetalheAtual');
        arremateAgregadoEmVisualizacao = null;
        
    }
}

//  Delegação de eventos para o painel de atividades e accordion
     const painelClickHandler = async (event) => {
            // 1. Identifica os possíveis alvos do clique
            const avatarClicado = event.target.closest('.oa-avatar-foco');
            const actionButton = event.target.closest('[data-action]');
            
            // Se não clicou nem no avatar nem em um botão de ação, não faz nada.
            if (!avatarClicado && !actionButton) return;
            
            // 2. Encontra o card pai e os dados do tiktik (lógica que já tínhamos)
            const card = event.target.closest('.oa-card-status-tiktik');
            if (!card) return;

            const tiktikId = parseInt(card.dataset.tiktikId);
            const tiktikData = statusTiktiksCache.find(t => t.id === tiktikId);
            if (!tiktikData) return;

            // 3. Decide o que fazer com base no alvo clicado
            
            // Se o clique foi no avatar, abre o Modo Foco.
            if (avatarClicado) {
                abrirModoFoco(tiktikData);
                return; // Ação concluída.
            }

            // Se o clique foi em um botão de ação, continua com a lógica que já tínhamos.
            if (actionButton) {
                const action = actionButton.dataset.action;

                // --- LÓGICA DO MENU (continua igual) ---
                if (action === 'abrir-menu-acoes') {
                    document.querySelectorAll('.menu-acoes-popup.visivel').forEach(menu => {
                        if (!card.contains(menu)) menu.classList.remove('visivel');
                    });
                    const menu = card.querySelector('.menu-acoes-popup');
                    if (menu) menu.classList.toggle('visivel');
                    return;
                }

                // --- LÓGICA DAS AÇÕES (continua igual) ---
                switch(action) {
                    case 'abrir-menu-acoes': {
                        const menu = card.querySelector('.menu-acoes-popup');
                        if (menu) {
                            // Fecha todos os outros menus antes de abrir o novo
                            document.querySelectorAll('.menu-acoes-popup.visivel').forEach(m => {
                                if (m !== menu) m.classList.remove('visivel');
                            });
                            // Alterna a visibilidade do menu atual
                            menu.classList.toggle('visivel');
                        }
                        break; // Sai do switch
                    }
                    case 'iniciar': 
                        handleAtribuirTarefa(tiktikData); 
                        break;
                    case 'finalizar': 
                    handleFinalizarTarefa(tiktikData); 
                        break;
                    case 'cancelar': 
                    handleCancelarTarefa(tiktikData); 
                        break;
                    case 'pausa-manual':
                        await handleAcaoManualStatus(tiktikData, STATUS.PAUSA_MANUAL, 
                            `Confirmar início de pausa manual para <strong>${tiktikData.nome}</strong>?`,
                            `Pausa manual iniciada para ${tiktikData.nome}.`);
                        break;
                    case 'marcar-falta':
                        await handleAcaoManualStatus(tiktikData, STATUS.FALTOU, 
                            `Confirmar falta para <strong>${tiktikData.nome}</strong> hoje?`,
                            `Falta registrada para ${tiktikData.nome}.`);
                        break;
                    case 'alocar-externo':
                        await handleAcaoManualStatus(tiktikData, STATUS.ALOCADO_EXTERNO, 
                            `Alocar <strong>${tiktikData.nome}</strong> em outro setor pelo resto do dia? (Ele sairá desta tela)`,
                            `${tiktikData.nome} alocado em outro setor.`);
                        break;
                    case 'reverter-status':
                        await handleAcaoManualStatus(tiktikData, STATUS.LIVRE, null,
                            `Status de ${tiktikData.nome} revertido para LIVRE.`);
                        break;
                        
                }

                const menuAberto = card.querySelector('.menu-acoes-popup');
                if (menuAberto) menuAberto.classList.remove('visivel');
            }
        };

function configurarEventListeners() {
    // Mantém o listener para fechar a view de detalhes. Perfeito.
    document.getElementById('fecharArremateDetalheBtn')?.addEventListener('click', () => window.location.hash = '');

    // Mantém o listener para o Accordion de Inativos. Perfeito.
    const accordionHeader = document.getElementById('accordionHeader');
    const accordionContent = document.getElementById('accordionContent');
    if (accordionHeader && accordionContent) {
        accordionHeader.addEventListener('click', () => {
            accordionHeader.classList.toggle('active');
            if (accordionContent.style.maxHeight) {
                accordionContent.style.maxHeight = null;
            } else {
                accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
            }
        });
    }
    
    // Mantém os listeners para as abas da view de detalhes. Perfeito.
    const abasContainer = document.querySelector('.oa-tabs');
    if (abasContainer) {
        abasContainer.addEventListener('click', (e) => {
            if (e.target.matches('.oa-tab-btn')) {
                const tabId = e.target.dataset.tab;
                document.querySelectorAll('.oa-tab-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                document.querySelectorAll('.oa-tab-panel').forEach(panel => panel.classList.remove('active'));
                const panelToShow = document.getElementById(`${tabId}-tab`);
                if (panelToShow) panelToShow.classList.add('active');
                if (tabId === 'historico-produto' && arremateAgregadoEmVisualizacao) {
                    carregarHistoricoDoProduto(arremateAgregadoEmVisualizacao.produto_id, arremateAgregadoEmVisualizacao.variante, 1);
                }
            }
        });
    }

    // Mantém o listener para o botão de ajuste. Perfeito.
    document.getElementById('btnConfirmarRegistroAjuste')?.addEventListener('click', registrarAjuste);

    // Mantém o listener para o evento customizado. Perfeito.
    window.addEventListener('forcarAtualizacaoFila', () => {
        forcarAtualizacaoFilaDeArremates().then(() => {
            mostrarMensagem('Fila de arremates atualizada!', 'sucesso', 2000);
        });
    });

    

    // =========================================================================
    // <<< INÍCIO DA NOVA LÓGICA INTEGRADA - O LISTENER MESTRE >>>
    // =========================================================================
    
    // Este único listener no documento agora gerencia as ações dinâmicas da página
    // que antes estavam espalhadas.
    document.addEventListener('click', async (event) => {

         // Primeiro, verificamos se o clique foi DENTRO do botão que ABRE o menu.
        const foiCliqueParaAbrirMenu = event.target.closest('[data-action="abrir-menu-acoes"]');
        
        // Se o clique NÃO foi para abrir um menu, e também NÃO foi dentro de um menu já aberto,
        // então consideramos que foi "fora".
        if (!foiCliqueParaAbrirMenu && !event.target.closest('.menu-acoes-popup')) {
            document.querySelectorAll('.menu-acoes-popup.visivel').forEach(menu => {
                menu.classList.remove('visivel');
            });
        }

        // Alvo 1: Botão de abrir o Histórico Geral (vindo do header React)
        if (event.target.closest('#btnAbrirHistorico')) {
            mostrarHistoricoArremates();
            return; 
        }

        // Alvo 2: Botão de atualizar o Painel de Atividades
        if (event.target.closest('#btnAtualizarPainel')) {
            renderizarPainelStatus();
            return; 
        }
        
        // Alvo 3: Qualquer interação DENTRO do painel de atividades
        // Verifica se o clique ocorreu dentro de um card de tiktik
        const cardClicado = event.target.closest('.oa-card-status-tiktik');
        if (cardClicado) {
            // Se sim, delega a lógica para o painelClickHandler, que é especialista nisso.
            await painelClickHandler(event);
            return; 
        }

        // Alvo 4: O header do Accordion de Inativos
            const accordionHeaderClicado = event.target.closest('#accordionHeader');
                if (accordionHeaderClicado) {
                    accordionHeaderClicado.classList.toggle('active');
                    return; // Ação concluída
                }
    });

    
}

async function carregarHistoricoDoProduto(produtoId, variante, page = 1) {
    const container = document.getElementById('historicoProdutoContainer');
    const paginacaoContainer = document.getElementById('historicoProdutoPaginacao');
    container.innerHTML = '<div class="spinner">Carregando histórico do produto...</div>';
    paginacaoContainer.innerHTML = '';

    try {
        const params = new URLSearchParams({ 
            produto_id: produtoId,
            page: page,
            limit: 5 // Define o mesmo limite do backend
        });
        if (variante && variante !== '-') {
            params.append('variante', variante);
        }
        
        const response = await fetchFromAPI(`/arremates/historico-produto?${params.toString()}`);
        const { rows: historico, pagination } = response;
        
        if (historico.length === 0) {
            container.innerHTML = '<p style="text-align: center;">Nenhum lançamento encontrado para este produto.</p>';
            return;
        }

        let tabelaHTML = `
            <table class="oa-tabela-historico">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Qtd</th>
                        <th>Tiktik</th>
                        <th>OP</th>
                    </tr>
                </thead>
                <tbody>
        `;
        historico.forEach(item => {
            // Lógica de formatação para destacar estornos, perdas, etc. (opcional, mas recomendado)
            let qtdDisplay = item.quantidade_arrematada;
            if (item.tipo_lancamento === 'PERDA') {
                qtdDisplay = `<span style="color:var(--oa-cor-vermelho-perigo);">${item.quantidade_arrematada}</span>`;
            } else if (item.tipo_lancamento === 'ESTORNO') {
                qtdDisplay = `<span style="color:var(--oa-cor-amarelo-atencao);">${item.quantidade_arrematada}</span>`;
            }

            tabelaHTML += `
                <tr>
                    <td>${new Date(item.data_lancamento).toLocaleDateString('pt-BR')}</td>
                    <td>${item.tipo_lancamento}</td>
                    <td>${qtdDisplay}</td>
                    <td>${item.usuario_tiktik}</td>
                    <td>${item.op_numero}</td>
                </tr>
            `;
        });
        tabelaHTML += `</tbody></table>`;
        container.innerHTML = tabelaHTML;

        // Renderiza a paginação
        // Precisamos passar uma função de callback que saiba o produtoId e a variante
        const callbackPaginacao = (nextPage) => {
            carregarHistoricoDoProduto(produtoId, variante, nextPage);
        };
        renderizarPaginacao(paginacaoContainer, pagination.totalPages, pagination.currentPage, callbackPaginacao);

    } catch (error) {
        container.innerHTML = `<p style="text-align: center; color: red;">Erro ao carregar histórico.</p>`;
    }
}

async function inicializarPagina() {
    const overlay = document.getElementById('paginaLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        await Promise.all([
             obterProdutosDoStorage(true).then(p => { todosOsProdutosCadastrados = p; }),
             fetchFromAPI('/usuarios').then(u => { todosOsUsuarios = u || []; })
        ]);
        
        await renderizarPainelStatus(); // Carrega o painel pela primeira vez
        controlarAtualizacaoPainel(true); // Inicia o auto-update
        
        await handleHashChange();

    } catch (error) {
        console.error("Erro na inicialização:", error);
        mostrarMensagem(`Falha ao carregar a página: ${error.message}`, 'erro');
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
}

async function forcarAtualizacaoFilaDeArremates() {
    try {
        const respostaFila = await fetchFromAPI('/arremates/fila?fetchAll=true');
        const itensOriginaisDaFila = respostaFila.rows || [];

        // >>>>> A MESMA LÓGICA DE TRADUÇÃO DA INICIALIZAÇÃO <<<<<
        const itensTraduzidosParaControlador = itensOriginaisDaFila.map(item => ({
            produto: item.produto_nome,
            variante: item.variante,
            total_disponivel_para_embalar: item.saldo_para_arrematar,
            data_lancamento_mais_recente: item.data_op_mais_recente,
            data_lancamento_mais_antiga: item.data_op_mais_recente,
            ...item
        }));

        // Agora entregamos os dados JÁ TRADUZIDOS para o controlador
        atualizarDadosControlador(itensTraduzidosParaControlador);
        
        // Atualiza o dashboard
        totaisDaFilaDeArremate.totalGrupos = itensOriginaisDaFila.length;
        totaisDaFilaDeArremate.totalPecas = itensOriginaisDaFila.reduce((acc, item) => acc + item.saldo_para_arrematar, 0);
        await atualizarDashboard();

    } catch (error) {
        console.error("Erro ao forçar atualização da fila de arremates:", error);
        mostrarMensagem("Não foi possível atualizar a lista de itens.", "erro");
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const carregamentoEl = document.getElementById('carregamentoGlobal');
    const conteudoEl = document.getElementById('conteudoPrincipal');
  
    try {
        const auth = await verificarAutenticacao('admin/arremates.html', ['acesso-ordens-de-arremates']);
        if (!auth) return;
        usuarioLogado = auth.usuario;
        permissoes = auth.permissoes || [];
        document.body.classList.add('autenticado');
        
        // 1. CARREGAMENTO DE DADOS ESSENCIAIS E CONFIGS
        const [configuracoesPublicas, produtosCadastrados, respostaFila, usuarios] = await Promise.all([
            fetch('/api/configuracoes/publicas').then(res => res.json()), // Busca as configs
            obterProdutosDoStorage(true),
            fetchFromAPI('/arremates/fila?fetchAll=true'),
            fetchFromAPI('/usuarios')
        ]);

        // Armazena as URLs padrão na janela global para fácil acesso
        window.DEFAULT_PRODUCT_IMAGE_URL = configuracoesPublicas.DEFAULT_PRODUCT_IMAGE_URL;
        window.DEFAULT_AVATAR_URL = configuracoesPublicas.DEFAULT_AVATAR_URL;

       // "Sequestra" o modal de foco para gerenciamento via JS
        const modalFocoOriginal = document.getElementById('modalModoFoco');
        if (modalFocoOriginal) {
            modalModoFocoElemento = modalFocoOriginal;
            modalFocoOriginal.parentNode.removeChild(modalFocoOriginal);
        } else {
            console.error("CRÍTICO: Elemento #modalModoFoco não encontrado no HTML inicial.");
        }

        // "Sequestra" o modal de ATRIBUIR TAREFA para gerenciamento via JS
        const modalAtribuirOriginal = document.getElementById('modalAtribuirTarefa');
        if (modalAtribuirOriginal) {
            modalAtribuirTarefaElemento = modalAtribuirOriginal;
            modalAtribuirOriginal.parentNode.removeChild(modalAtribuirOriginal);
        } else {
            console.error("CRÍTICO: Elemento #modalAtribuirTarefa não encontrado no HTML inicial.");
        }
        
        todosOsProdutosCadastrados = produtosCadastrados || [];
        todosOsUsuarios = usuarios || [];
        const itensOriginaisDaFila = respostaFila.rows || [];

        const itensTraduzidosParaControlador = itensOriginaisDaFila.map(item => ({
            // Mapeia os campos de Arremate para os campos que o Controlador espera
            produto: item.produto_nome,
            variante: item.variante, // <--- Mantém o mesmo nome
            total_disponivel_para_embalar: item.saldo_para_arrematar,
            data_lancamento_mais_recente: item.data_op_mais_recente,
            data_lancamento_mais_antiga: item.data_op_mais_recente,

            // Mantém os dados originais que usamos em outras partes do código
            ...item
        }));

        // 2. EXTRAIR OPÇÕES DE FILTRO
        // Agora usamos os dados JÁ traduzidos para extrair os filtros
        const opcoesDeFiltro = extrairOpcoesDeFiltroArremates(itensTraduzidosParaControlador);

        // 3. RENDERIZAÇÃO DOS COMPONENTES REACT
        if (window.renderizarComponentesReactArremates) {
            window.renderizarComponentesReactArremates({ opcoesDeFiltro });
        } else {
            console.error("ERRO: A função de renderização do React para Arremates não foi encontrada.");
        }

        // 4. INICIALIZAÇÃO DO CONTROLADOR
        // Agora passamos os dados traduzidos. O controlador vai entender perfeitamente.
        inicializarControlador({
            dadosCompletos: itensTraduzidosParaControlador,
            renderizarResultados: renderizarCardsDaPagina,
            camposParaBusca: ['produto', 'variante'], // Agora usamos os nomes traduzidos
        });

        // 5. ATUALIZAÇÃO DO DASHBOARD E PAINEL TIKTIK
        await atualizarDashboard();
        await renderizarPainelStatus();
        controlarAtualizacaoPainel(true); // Inicia o auto-update do painel de tiktiks

        // 6. CONFIGURAÇÃO DE TODOS OS EVENT LISTENERS
        configurarEventListeners();

        const accordionHeader = document.getElementById('accordionHeader');
        const accordionContent = document.getElementById('accordionContent');
        if (accordionHeader && accordionContent) {
            accordionHeader.addEventListener('click', () => {
                accordionHeader.classList.toggle('active');
                if (accordionContent.style.maxHeight) {
                    accordionContent.style.maxHeight = null;
                } else {
                    accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
                }
            });
        }

        // 7. NAVEGAÇÃO
        window.addEventListener('hashchange', handleHashChange);
        await handleHashChange(); // Executa na primeira carga para verificar o hash inicial

   } catch (error) {
    console.error("[DOMContentLoaded Arremates] Erro crítico na inicialização:", error);
    mostrarMensagem("Erro crítico ao carregar a página. Tente recarregar.", "erro");
  } finally {
    if (carregamentoEl) carregamentoEl.classList.remove('visivel');
    if (conteudoEl) conteudoEl.classList.remove('gs-conteudo-carregando');
  }
});