// public/js/admin-ordens-de-arremates.js
import { verificarAutenticacao } from '/js/utils/auth.js'; 
import { mostrarMensagem, mostrarConfirmacao, mostrarPromptNumerico } from '/js/utils/popups.js';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import { renderizarPaginacao as renderizarPaginacaoJS } from './utils/Paginacao.js';
window.renderizarPaginacao = renderizarPaginacaoJS;

import { inicializarControlador, atualizarDadosControlador } from './utils/ControladorFiltros.js';

// --- Variáveis Globais --- 
let usuarioLogado = null;
let permissoes = [];
let todosOsProdutosCadastrados = [];
let todosOsUsuarios = [];
let opsFinalizadasCompletas = [];
let todosArrematesRegistradosCache = [];
let produtosAgregadosParaArremateGlobal = [];
let historicoDeArrematesCache = [];
let totaisDaFilaDeArremate = { totalGrupos: 0, totalPecas: 0 };
let statusTiktiksCache = [];
let modalModoFocoElemento = null;
let cronometroIntervalId = null;

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
    LIVRE_MANUAL: 'LIVRE_MANUAL',
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
    [STATUS.LIVRE_MANUAL]: 'Livre',
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
 * Obtém a imagem correta para um produto (versão para JS puro).
 * @param {object} produtoInfo - O objeto completo do produto vindo do cache 'todosOsProdutosCadastrados'.
 * @param {string} varianteNome - O nome da variação (ex: "Preto com Preto | P").
 * @returns {string} - A URL da imagem ou um placeholder.
 */
function obterImagemProduto(produtoInfo, varianteNome) {
    const placeholder = '/img/placeholder-image.png';

    if (!produtoInfo) {
        return placeholder;
    }

    // 1. Tenta encontrar a imagem específica da variação na grade.
    if (varianteNome && varianteNome !== '-' && Array.isArray(produtoInfo.grade)) {
        const gradeItem = produtoInfo.grade.find(g => g.variacao === varianteNome);
        if (gradeItem && gradeItem.imagem) {
            return gradeItem.imagem;
        }
    }
    
    // 2. Se não encontrou, retorna a imagem principal do produto "pai".
    return produtoInfo.imagem || placeholder;
}

function atualizarCronometrosVisuais() {
    const cards = document.querySelectorAll('.oa-card-status-tiktik.status-produzindo');
    
    if (cards.length === 0 && cronometroIntervalId) {
        pararCronometrosVisuais();
        return;
    }

    cards.forEach(card => {
        // ... (cálculos de tempo e cronômetro continuam os mesmos)
        const inicioTimestamp = parseFloat(card.dataset.inicioTimestamp);
        const tempoPausadoInicial = parseFloat(card.dataset.pausadoSegundos);
        const mediaTempoPeca = parseFloat(card.dataset.mediaTempoPeca);
        const qtdEntregue = parseInt(card.dataset.qtdEntregue, 10);

        if (isNaN(inicioTimestamp) || isNaN(tempoPausadoInicial)) return;

        const agoraTimestamp = Date.now();
        const tempoLiquidoSegundos = Math.max(0, (agoraTimestamp - inicioTimestamp) / 1000 - tempoPausadoInicial);
        const tempoFormatado = new Date(tempoLiquidoSegundos * 1000).toISOString().substr(11, 8);
        
        const cronometroEl = card.querySelector('.cronometro-tarefa');
        if (cronometroEl) {
            cronometroEl.innerHTML = `<i class="fas fa-clock"></i> ${tempoFormatado}`;
        }

        // --- LÓGICA FINAL DA BARRA E RITMO ---
        const barraEl = card.querySelector('.barra-progresso');
        const containerBarraEl = card.querySelector('.barra-progresso-container');
        const indicadorRitmoEl = card.querySelector('.indicador-ritmo-tarefa');

        if (barraEl && indicadorRitmoEl && !isNaN(mediaTempoPeca) && mediaTempoPeca > 0 && !isNaN(qtdEntregue) && qtdEntregue > 0) {
            
            // O tempo total que a tarefa DEVERIA levar, com base na média
            const tempoTotalEstimado = mediaTempoPeca * qtdEntregue;

            // A porcentagem de progresso é baseada no TEMPO, não nas peças estimadas
            const progressoPercentual = Math.min(100, (tempoLiquidoSegundos / tempoTotalEstimado) * 100);
            
            barraEl.style.width = `${progressoPercentual}%`;
            
            if (containerBarraEl) {
                const tempoRestanteEstimado = Math.max(0, tempoTotalEstimado - tempoLiquidoSegundos);
                containerBarraEl.title = `Tempo estimado restante: ${new Date(tempoRestanteEstimado * 1000).toISOString().substr(11, 8)}`;
                containerBarraEl.dataset.tooltipMobile = `Tempo estimado restante: ${new Date(tempoRestanteEstimado * 1000).toISOString().substr(11, 8)}`;
            }

            let ritmoTexto = '';
            let ritmoClasse = 'ritmo-normal';
            let corBarraClasse = '';

            // A lógica de cor e emoji agora é baseada diretamente no progresso do tempo
            if (progressoPercentual > 90) {
                ritmoTexto = '🐢 Lento';
                ritmoClasse = 'ritmo-lento';
                corBarraClasse = 'lento'; // Vermelho
            } else if (progressoPercentual > 75) {
                ritmoTexto = '⚠️ Ficar de Olho';
                ritmoClasse = 'ritmo-normal'; // Cor do texto normal
                corBarraClasse = 'atencao'; // Amarelo
            } else {
                ritmoTexto = '✅ Em andamento';
                ritmoClasse = 'ritmo-normal';
                corBarraClasse = ''; // Verde padrão
            }
            
            indicadorRitmoEl.textContent = ritmoTexto;
            indicadorRitmoEl.className = `indicador-ritmo-tarefa ${ritmoClasse}`;

            barraEl.classList.remove('atencao', 'lento');
            if (corBarraClasse) {
                barraEl.classList.add(corBarraClasse);
            }

        } else if (indicadorRitmoEl) {
            indicadorRitmoEl.textContent = '';
            indicadorRitmoEl.className = 'indicador-ritmo-tarefa';
        }
    });
}


function iniciarCronometrosVisuais() {
    if (cronometroIntervalId) {
        return;
    }
    cronometroIntervalId = setInterval(atualizarCronometrosVisuais, 1000);
}

function pararCronometrosVisuais() {
    clearInterval(cronometroIntervalId);
    cronometroIntervalId = null;
}

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
        window.statusTiktiksCache = tiktiks;
        
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
            
            const { statusBruto, statusFinal, classeStatus } = determinarStatusFinal(tiktik);

            // Usa o status BRUTO para a lógica interna
            if (statusBruto === STATUS.PRODUZINDO) {
                const dataInicio = new Date(tiktik.data_inicio);
                const agora = new Date();
                
                // Calcula o tempo total em segundos desde o início
                const tempoTotalBrutoSegundos = (agora - dataInicio) / 1000;
                
                // O tempo pausado é a diferença entre o tempo total e o tempo que ele efetivamente trabalhou
                const tempoPausadoSegundos = tempoTotalBrutoSegundos - (tiktik.tempo_decorrido_real_segundos || 0);

                card.dataset.inicioTimestamp = dataInicio.getTime();
                card.dataset.pausadoSegundos = tempoPausadoSegundos; // << Cálculo mais simples e robusto
                card.dataset.mediaTempoPeca = tiktik.media_tempo_por_peca || 0;
                card.dataset.qtdEntregue = tiktik.quantidade_entregue || 0;
            }

            
            card.className = `oa-card-status-tiktik ${classeStatus}`;
            card.innerHTML = criarHTMLCardStatus(tiktik, statusFinal, classeStatus, statusBruto); 
                
            if (
                statusBruto === STATUS.LIVRE ||
                statusBruto === STATUS.LIVRE_MANUAL ||
                statusBruto === STATUS.PRODUZINDO
                ) {
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
        containerDisponiveis.innerHTML = `<p class="erro-painel">Erro ao carregar o painel. RECARREGUE A PÁGINA.</p>`;
        if (feedbackEl) feedbackEl.textContent = 'Falha ao atualizar';
    } finally {
        // <<< ADICIONE A CHAMADA AQUI, NO FINALLY, PARA GARANTIR QUE SEMPRE RODE >>>
        // (Re)inicia o motor do cronômetro após cada renderização do painel
        iniciarCronometrosVisuais();
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
            if (!status) return '';
            // Substitui o status especial pelo status visual correto para a classe CSS
            const statusVisual = status === STATUS.LIVRE_MANUAL ? STATUS.LIVRE : status;
            
            const semAcentos = statusVisual
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            
            return `status-${semAcentos.toLowerCase().replace(/_/g, '-')}`;
        };
        const hoje = new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' });

        let statusFinalBruto;

        // --- NOVA HIERARQUIA DE STATUS ---

        // NÍVEL 1: Produzindo (Prioridade máxima)
        if (tiktik.status_atual === STATUS.PRODUZINDO) {
            statusFinalBruto = STATUS.PRODUZINDO;
        }
        // NÍVEL 2: Status manuais de dia inteiro
        else if (
            [STATUS.FALTOU, STATUS.ALOCADO_EXTERNO, STATUS.LIVRE_MANUAL].includes(tiktik.status_atual)
            ) {
            // Pega a data de hoje no formato YYYY-MM-DD, no fuso de São Paulo
            const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            
            // Pega a data da modificação que veio do banco (ex: "2025-09-14T03:00:00.000Z")
            // e pega APENAS a parte da data (os 10 primeiros caracteres)
            const dataModificacao = tiktik.status_data_modificacao?.substring(0, 10);

            // Compara APENAS as datas. Isso é à prova de fuso horário e hora.
            if (hojeSP === dataModificacao) {
                statusFinalBruto = tiktik.status_atual;
            } 
        }
        // NÍVEL 3: Pausa manual
        else if (tiktik.status_atual === STATUS.PAUSA_MANUAL) {
            statusFinalBruto = STATUS.PAUSA_MANUAL;
        }
        // NÍVEL 4: Lógica de horário (só entra aqui se nenhum status manual prioritário for encontrado)
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
                statusFinalBruto = tiktik.status_atual || STATUS.LIVRE;
            }
        }
        
        if (!statusFinalBruto) {
            statusFinalBruto = STATUS.LIVRE;
        }

        // Se o status final for LIVRE_MANUAL, o texto a ser exibido ainda é "Livre"
        const textoExibicao = (statusFinalBruto === STATUS.LIVRE_MANUAL) 
                                ? STATUS_TEXTO_EXIBICAO[STATUS.LIVRE] 
                                : STATUS_TEXTO_EXIBICAO[statusFinalBruto] || statusFinalBruto;

        return {
            statusBruto: statusFinalBruto,
            statusFinal: textoExibicao,
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
    let menuAcoesHTML = '';
    

     if (statusBrutoDecidido === STATUS.PRODUZINDO) {
        // --- LÓGICA DE AVISO (EXISTENTE E MANTIDA) ---
        const infoHorarioEstendido = verificarHorarioEstendido(tiktik);
        if (infoHorarioEstendido) {
            avisoHorarioHTML = `
                <div class="aviso-horario-estendido nivel-${infoHorarioEstendido.nivel}">
                    ${infoHorarioEstendido.texto}
                </div>
            `;
        }

        // --- LÓGICA DO TEMPO INICIAL (EXISTENTE E MANTIDA) ---
        const tempoSegundosBase = tiktik.tempo_decorrido_real_segundos || 0;
        const tempoDecorridoStr = new Date(tempoSegundosBase * 1000).toISOString().substr(11, 8);

        // --- HTML REDESENHADO (NOVO) ---
        // --- HTML REDESENHADO (NOVO) ---
    infoTarefaHTML = `
        <div class="info-tarefa-redesenhada">
            <div class="quantidade-tarefa-destaque">
                ${tiktik.quantidade_entregue}<small>pçs</small>
            </div>
            <div class="produto-tarefa-subtitulo">
                ${tiktik.produto_nome} ${tiktik.variante ? `(${tiktik.variante})` : ''}
            </div>
            
            <div class="metricas-tarefa-container">
                <div class="cronometro-tarefa">
                    <i class="fas fa-clock"></i> ${tempoDecorridoStr}
                </div>

                <div class="indicador-ritmo-tarefa"></div>

                <div class="barra-progresso-container" title="Estimativa de conclusão baseada no tempo médio">
                    <div class="barra-progresso" style="width: 0%;"></div>
                </div>
            </div>
        </div>
    `;

        // --- LÓGICA DOS BOTÕES (EXISTENTE E MANTIDA) ---
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
    } else if (statusBrutoDecidido === STATUS.LIVRE || statusBrutoDecidido === STATUS.LIVRE_MANUAL) {
        // --- LÓGICA PARA O CARD "LIVRE" ---
        const podeAtribuir = permissoes.includes('lancar-arremate');
        const attrsAtribuir = podeAtribuir ? `data-action="iniciar"` : `data-action="permissao-negada" data-permissao-necessaria="Atribuir Tarefa"`;
        botoesAcaoHTML = `<button class="btn-acao iniciar" ${attrsAtribuir} ${!podeAtribuir ? 'disabled' : ''}><i class="fas fa-play"></i> Atribuir Tarefa</button>`;
        
        // Adiciona o carimbo
        infoTarefaHTML = `<div class="status-carimbo-container"><div class="status-carimbo">${statusFinalTexto}</div></div>`;

    } else {
        // --- LÓGICA PARA TODOS OS OUTROS CARDS INATIVOS (PAUSA, ALMOÇO, ETC) ---
        // Apenas adiciona o carimbo, sem botões de ação no rodapé
        infoTarefaHTML = `<div class="status-carimbo-container"><div class="status-carimbo">${statusFinalTexto}</div></div>`;
    }
    
     // --- LÓGICA DO NOVO MENU DE AÇÕES ---
    
    const menuItens = [];

    // Agora a decisão é baseada no status REAL que o usuário está vendo (statusBrutoDecidido)
    switch (statusBrutoDecidido) {
        case STATUS.LIVRE:
        case STATUS.LIVRE_MANUAL:
        case STATUS.PRODUZINDO:
            // Ações para quando o Tiktik está ativo
            menuItens.push({ action: 'pausa-manual', label: 'Iniciar Pausa Manual', icon: 'fa-coffee' });
            menuItens.push({ action: 'marcar-falta', label: 'Marcar Falta', icon: 'fa-user-slash' });
            menuItens.push({ action: 'alocar-externo', label: 'Alocar em Outro Setor', icon: 'fa-shipping-fast' });
            break;

        case STATUS.PAUSA_MANUAL:
            menuItens.push({ action: 'reverter-status', label: 'Finalizar Pausa', icon: 'fa-play' });
            break;

        case STATUS.FALTOU:
            menuItens.push({ action: 'reverter-status', label: 'Remover Falta', icon: 'fa-user-check' });
            break;

        case STATUS.ALOCADO_EXTERNO:
            menuItens.push({ action: 'reverter-status', label: 'Retornar ao Setor', icon: 'fa-undo' });
            break;

        case STATUS.ALMOCO:
        case STATUS.PAUSA:
        case STATUS.FORA_DO_HORARIO:
            // Aqui está a chave! Agora o botão aparecerá para esses 3 status.
            menuItens.push({ action: 'reverter-status', label: 'Interromper e Liberar', icon: 'fa-play' });
            break;
    }


    if (menuItens.length > 0) {
        // O HTML do menu permanece o mesmo
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
    modal.querySelector('#focoTitulo').innerHTML = `Desempenho de Hoje`;
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
            // <<< 2. MODIFICAÇÃO AQUI: Buscamos o produto completo no cache
            const produtoCompleto = todosOsProdutosCadastrados.find(p => p.id == sessao.produto_id);
            
            // O nome do produto continua sendo a chave para agrupar
            const nomeProdutoAgrupado = sessao.produto_nome; 
            
            if (!resumoProdutos[nomeProdutoAgrupado]) {
                resumoProdutos[nomeProdutoAgrupado] = { 
                    totalPecas: 0, 
                    nome: nomeProdutoAgrupado,
                    // Usamos a imagem principal do produto para o resumo agrupado
                    imagem: produtoCompleto ? produtoCompleto.imagem || '/img/placeholder-image.png' : '/img/placeholder-image.png'
                };
            }
            resumoProdutos[nomeProdutoAgrupado].totalPecas += sessao.quantidade_finalizada || 0;
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
            
            // Agora chamamos nossa nova função para pegar a imagem da VARIAÇÃO
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

function renderizarResultadosReact(resultados) {
    if (window.renderizarResultadosReact) {
        window.renderizarResultadosReact(resultados);
    }
    // A antiga lógica de paginação é removida
}

function renderizarViewPrincipal() {
    renderizarDashboard();
    renderizarCardsArremate(1);
    document.getElementById('arrematesListView').classList.remove('hidden');
    document.getElementById('arremateDetalheView').classList.add('hidden');
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

        // Lógica para formatar cada tipo de lançamento
        switch (item.tipo_lancamento) {
            case 'PRODUCAO':
                classeLinha = 'linha-producao';
                displayQuantidade = `<span style="color: var(--oa-cor-verde-sucesso); font-weight: bold;">+${item.quantidade_arrematada}</span>`;
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
                </tr>
            </thead>
            <tbody>${tbodyHTML}</tbody>
        </table>
    `;


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

            <!-- <<< ESTRUTURA DO ACORDEÃO ADICIONADA AQUI >>> -->
            <div class="oa-filtros-acordeao">
                <button id="historicoFiltrosToggle" class="oa-acordeao-header">
                    <i class="fas fa-filter"></i>
                    <span>Filtros</span>
                    <i class="fas fa-chevron-down oa-acordeao-icone"></i>
                </button>
                <div id="historicoFiltrosContent" class="oa-acordeao-content">
                    <div class="oa-modal-filtros">
                        <div class="oa-form-grupo" style="flex-grow: 2;"><label for="filtroBuscaHistorico">Buscar</label><input type="text" id="filtroBuscaHistorico" class="oa-input" placeholder="Busque por Produto, Tiktik ou Lançador..."></div>
                        <div class="oa-form-grupo"><label for="filtroTipoEventoHistorico">Tipo</label><select id="filtroTipoEventoHistorico" class="oa-select"><option value="todos">Todos</option><option value="PRODUCAO">Lançamentos</option><option value="PERDA">Perdas</option><option value="ESTORNO">Estornos</option></select></div>
                        <div class="oa-form-grupo"><label for="filtroPeriodoHistorico">Período</label><select id="filtroPeriodoHistorico" class="oa-select"><option value="7d">7 dias</option><option value="hoje">Hoje</option><option value="30d">30 dias</option><option value="mes_atual">Mês Atual</option></select></div>
                    </div>
                </div>
            </div>
            
            <div class="oa-modal-body"><div id="historicoArrematesTabelaWrapper" class="oa-tabela-wrapper"></div></div>
            <div class="oa-modal-footer"><div id="historicoArrematesPaginacao" class="oa-paginacao-container"></div></div>
        </div>
    `;

    // <<< LÓGICA DO ACORDEÃO >>>
    container.querySelector('#historicoFiltrosToggle').addEventListener('click', (e) => {
        const header = e.currentTarget;
        const content = container.querySelector('#historicoFiltrosContent');
        header.classList.toggle('active');
        content.classList.toggle('open');
    });

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


//  Delegação de eventos para o painel de atividades e accordion
     const painelClickHandler = async (event) => {
        const avatarClicado = event.target.closest('.oa-avatar-foco');
        const actionButton = event.target.closest('[data-action]');
        if (!avatarClicado && !actionButton) return;
        
        const card = event.target.closest('.oa-card-status-tiktik');
        if (!card) return;

        const tiktikId = parseInt(card.dataset.tiktikId);
        const tiktikData = window.statusTiktiksCache.find(t => t.id === tiktikId);
        if (!tiktikData) return;

        if (avatarClicado) {
            abrirModoFoco(tiktikData);
            return;
        }

        if (actionButton) {
            const action = actionButton.dataset.action;
            const menu = card.querySelector('.menu-acoes-popup');

            if (action === 'abrir-menu-acoes') {
                document.querySelectorAll('.menu-acoes-popup.visivel').forEach(m => {
                    if (m !== menu) m.classList.remove('visivel');
                });
                if (menu) menu.classList.toggle('visivel');
                return;
            }

            switch(action) {
                case 'iniciar': 
                    if (window.abrirModalAtribuicao) {
                        window.abrirModalAtribuicao(tiktikData);
                    } else {
                        console.error("React não está pronto para abrir o modal.");
                        mostrarMensagem("Erro ao abrir painel (código: R01).", "erro");
                    }
                    break;
                case 'finalizar': handleFinalizarTarefa(tiktikData); break;
                case 'cancelar': handleCancelarTarefa(tiktikData); break;
                case 'pausa-manual':
                    await handleAcaoManualStatus(tiktikData, STATUS.PAUSA_MANUAL, `Confirmar pausa para ${tiktikData.nome}?`, `Pausa iniciada.`);
                    break;
                case 'marcar-falta':
                    await handleAcaoManualStatus(tiktikData, STATUS.FALTOU, `Confirmar falta para ${tiktikData.nome}?`, `Falta registrada.`);
                    break;
                case 'alocar-externo':
                    await handleAcaoManualStatus(tiktikData, STATUS.ALOCADO_EXTERNO, `Alocar ${tiktikData.nome} em outro setor?`, `Status atualizado.`);
                    break;
                case 'reverter-status': {
                    const { statusBruto, statusFinal } = determinarStatusFinal(tiktikData);
                    let novoStatus = STATUS.LIVRE;
                    let msgConfirmacao = null;
                    let msgSucesso = `${tiktikData.nome} está livre.`;
                    if ([STATUS.ALMOCO, STATUS.PAUSA, STATUS.FORA_DO_HORARIO].includes(statusBruto)) {
                        novoStatus = STATUS.LIVRE_MANUAL;
                        msgConfirmacao = `Interromper "${statusFinal}" de ${tiktikData.nome} e liberá-lo?`;
                    }
                    await handleAcaoManualStatus(tiktikData, novoStatus, msgConfirmacao, msgSucesso);
                    break;
                }
            }
            if (menu) menu.classList.remove('visivel');
        }
    };

function configurarEventListeners() {
    window.addEventListener('forcarAtualizacaoPainelTiktik', renderizarPainelStatus);

    document.addEventListener('click', async (event) => {
        const barraProgressoClicada = event.target.closest('.barra-progresso-container');
        if (barraProgressoClicada && barraProgressoClicada.dataset.tooltipMobile) {
            // Verifica se o dispositivo é "touch" (uma boa heurística para mobile)
            if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
                event.preventDefault(); // Evita qualquer outro comportamento de clique
                // Usa a sua função de popup já existente!
                mostrarMensagem(barraProgressoClicada.dataset.tooltipMobile, 'info', 3000);
            }
            return; // Encerra para não processar outros cliques
        }

        const foiCliqueParaAbrirMenu = event.target.closest('[data-action="abrir-menu-acoes"]');
        if (!foiCliqueParaAbrirMenu && !event.target.closest('.menu-acoes-popup')) {
            document.querySelectorAll('.menu-acoes-popup.visivel').forEach(menu => menu.classList.remove('visivel'));
        }

        if (event.target.closest('#btnAbrirHistorico')) { /* Lógica do Histórico aqui */ }
        if (event.target.closest('#btnAtualizarPainel')) { renderizarPainelStatus(); }
        
        const cardClicado = event.target.closest('.oa-card-status-tiktik');
        if (cardClicado) {
            await painelClickHandler(event);
            return; 
        }

        const accordionHeader = event.target.closest('#accordionHeader');
        if (accordionHeader) {
            const content = document.getElementById('accordionContent');
            accordionHeader.classList.toggle('active');
            if (content) content.style.maxHeight = content.style.maxHeight ? null : `${content.scrollHeight}px`;
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
        
    } catch (error) {
        console.error("Erro na inicialização:", error);
        mostrarMensagem(`Falha ao carregar a página: ${error.message}`, 'erro');
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
}

async function forcarAtualizacaoFilaDeArremates() {
    console.log("[JS Puro] Disparando evento 'atualizar-fila-react'...");
    // Dispara um evento global que qualquer componente React pode ouvir.
    window.dispatchEvent(new Event('atualizar-fila-react'));

    // A função ainda pode ser responsável por atualizar o dashboard,
    // pois isso é do mundo do JS puro.
    try {
        const respostaFila = await fetchFromAPI('/arremates/fila?fetchAll=true');
        const itensDaFila = respostaFila.rows || [];
        
        totaisDaFilaDeArremate.totalGrupos = itensDaFila.length;
        totaisDaFilaDeArremate.totalPecas = itensDaFila.reduce((acc, item) => acc + item.saldo_para_arrematar, 0);
        await atualizarDashboard();
    } catch (error) {
        console.error("Erro ao atualizar dados do dashboard:", error);
    }
}


// Garante que ao fechar a página o intervalo seja limpo
window.addEventListener('beforeunload', () => {
    pararCronometrosVisuais();
});

document.addEventListener('DOMContentLoaded', async () => {
    const carregamentoEl = document.getElementById('carregamentoGlobal');
    const conteudoEl = document.getElementById('conteudoPrincipal');
  
    try {
        const auth = await verificarAutenticacao('admin/arremates.html', ['acesso-ordens-de-arremates']);
        if (!auth) return;

        // Expõe dados globais necessários
        usuarioLogado = auth.usuario;
        permissoes = auth.permissoes || [];
        document.body.classList.add('autenticado');
        
        // "Sequestra" os modais do HTML para gerenciamento via JS
        const modalFoco = document.getElementById('modalModoFoco');
        if (modalFoco) {
            modalModoFocoElemento = modalFoco;
            modalFoco.parentNode.removeChild(modalFoco);
        }
        // Expõe a função para que o componente React HeaderPagina possa chamá-la
        window.abrirModalHistorico = mostrarHistoricoArremates;

        todosOsProdutosCadastrados = await obterProdutosDoStorage(true);
        // Agora que temos os produtos, podemos carregar o resto que depende deles.
        window.todosOsUsuarios = await fetchFromAPI('/usuarios');

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                pararCronometrosVisuais();
            } else {
                // Ao voltar para a aba, força uma atualização dos dados da API para ter os números mais recentes
                // antes de reiniciar os cronômetros visuais.
                renderizarPainelStatus(); 
            }
        });

        await renderizarPainelStatus();
        configurarEventListeners();

    } catch (error) {
        console.error("[DOMContentLoaded Arremates] Erro crítico:", error);
        mostrarMensagem("Erro crítico ao carregar a página. Tente recarregar.", "erro");
    } finally {
        if (carregamentoEl) carregamentoEl.classList.remove('visivel');
        if (conteudoEl) conteudoEl.classList.remove('gs-conteudo-carregando');
    }
});