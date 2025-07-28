// public/dashboard/dashboard.js

// ==========================================================================
// 1. IMPORTS DE MÓDULOS E UTILITÁRIOS
// ==========================================================================
import { verificarAutenticacao, logout } from '/js/utils/auth.js';
import { obterMetas, calcularComissaoSemanal } from '/js/utils/metas.js'; // Usando o novo utilitário de metas unificado
import { getObjetoCicloCompletoAtual } from '/js/utils/ciclos.js';
import { formatarData } from '/js/utils/date-utils.js';

// ==========================================================================
// 2. VARIÁVEIS GLOBAIS E ESTADO DA APLICAÇÃO
// ==========================================================================

// Dados do Usuário e da API
let usuarioLogado = null;
let dadosDashboardCache = null; // Armazenará a resposta completa da API /api/dashboard/desempenho
let todasAsAtividadesRelevantes = [];

// Controle de UI e Filtros
let paginaAtualDetalhes = 1;
const ITENS_POR_PAGINA_DETALHES = 8;

// --- Estado dos Filtros de Detalhamento ---
let filtrosAtivosDetalhes = {
    busca: '',
    periodo: 'hoje', // Valor inicial
    dataInicio: null,
    dataFim: null,
};


// ==========================================================================
// 3. FUNÇÕES DE INICIALIZAÇÃO E COMUNICAÇÃO COM API
// ==========================================================================

/**
 * Função principal que busca os dados unificados do dashboard da nova API.
 * @param {boolean} forceRefresh - Se true, ignora o cache e busca novos dados.
 * @returns {Promise<object|null>} O objeto com os dados do dashboard ou null em caso de erro.
 */
async function carregarDadosDashboard(forceRefresh = false) {
    if (dadosDashboardCache && !forceRefresh) {
        console.log('[carregarDadosDashboard] Usando dados em cache.');
        return dadosDashboardCache;
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Token de autenticação não encontrado.');

        const response = await fetch('/api/dashboard/desempenho', {
        headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
            throw new Error(errorData.error || 'Falha ao buscar dados do dashboard.');
        }

        dadosDashboardCache = await response.json();
        return dadosDashboardCache;
    } catch (error) {
        console.error('[carregarDadosDashboard] Erro:', error.message);
        mostrarPopup('Erro ao carregar seus dados. Por favor, tente recarregar a página.', 'erro');
        return null; // Retorna nulo para que as funções chamadoras saibam do erro.
    }
}

// ==========================================================================
// 4. FUNÇÕES DE UI - SPINNERS E POPUPS (Funções de Apoio)
// ==========================================================================

/**
 * Exibe um spinner de tela cheia para carregamentos principais.
 * @param {string} mensagem - O texto a ser exibido abaixo do spinner.
 */
function mostrarSpinnerGeral(mensagem = "Carregando...") {
    let spinnerOverlay = document.getElementById('ds-fullpage-spinner-overlay');
    if (!spinnerOverlay) {
        spinnerOverlay = document.createElement('div');
        spinnerOverlay.id = 'ds-fullpage-spinner-overlay';
        spinnerOverlay.className = 'ds-popup-overlay'; // Reutiliza estilo de overlay
        spinnerOverlay.style.zIndex = '20000';
        spinnerOverlay.innerHTML = `
            <div class="ds-spinner-container" style="flex-direction:column; gap:15px; color: var(--ds-cor-branco);">
                <div class="ds-spinner"></div>
                <p style="font-weight:500; font-size: 1.1rem;">${mensagem}</p>
            </div>`;
        document.body.appendChild(spinnerOverlay);
    }
    spinnerOverlay.querySelector('p').textContent = mensagem;
    spinnerOverlay.classList.add('ativo');
}

/**
 * Esconde o spinner de tela cheia.
 */
function esconderSpinnerGeral() {
    const spinnerOverlay = document.getElementById('ds-fullpage-spinner-overlay');
    if (spinnerOverlay) {
        spinnerOverlay.classList.remove('ativo');
    }
}

/**
 * Exibe um popup de confirmação que espera a decisão do usuário.
 * @param {string} mensagem - A pergunta a ser exibida.
 * @param {'info' | 'sucesso' | 'erro' | 'aviso'} [tipo='aviso'] - O tipo de popup para estilização.
 * @param {string} [textoConfirmar='Confirmar'] - O texto para o botão de confirmação.
 * @param {string} [textoCancelar='Cancelar'] - O texto para o botão de cancelamento.
 * @returns {Promise<boolean>} Resolve para `true` se o usuário confirmar, `false` caso contrário.
 */
function mostrarPopupConfirmacao(mensagem, tipo = 'aviso', textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar') {
    return new Promise((resolve) => {
        // Cria um overlay temporário para este popup específico
        const overlay = document.createElement('div');
        overlay.className = 'ds-popup-overlay ativo';
        
        // Reutiliza os estilos do popup genérico, mas com estrutura customizada
        overlay.innerHTML = `
            <div class="ds-popup-mensagem popup-${tipo}">
                <i id="popupIcone" class="fas ds-popup-icone"></i>
                <p id="popupMensagemTexto">${mensagem}</p>
                <div class="ds-popup-botoes-container">
                    <button id="popupBotaoCancelar" class="ds-btn ds-btn-secundario">${textoCancelar}</button>
                    <button id="popupBotaoConfirmar" class="ds-btn ds-btn-perigo ds-btn-texto-claro">${textoConfirmar}</button>
                </div>
            </div>
        `;

        // Adiciona os ícones corretos baseados no tipo
        const icones = {
            sucesso: 'fa-check-circle', erro: 'fa-times-circle',
            aviso: 'fa-exclamation-triangle', info: 'fa-info-circle'
        };
        overlay.querySelector('#popupIcone').classList.add(icones[tipo]);

        document.body.appendChild(overlay);

        const btnConfirmar = overlay.querySelector('#popupBotaoConfirmar');
        const btnCancelar = overlay.querySelector('#popupBotaoCancelar');

        // Função para limpar e resolver a promessa
        const fecharEresolver = (valor) => {
            overlay.remove();
            resolve(valor);
        };

        btnConfirmar.onclick = () => fecharEresolver(true);
        btnCancelar.onclick = () => fecharEresolver(false);
        
        // Clicar fora também cancela
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                fecharEresolver(false);
            }
        });
    });
}

/**
 * Exibe um popup de mensagem estilizado.
 * @param {string} mensagem - O texto da mensagem a ser exibida.
 * @param {'info' | 'sucesso' | 'erro' | 'aviso'} [tipo='info'] - O tipo de popup.
 * @param {number} [duracao=4000] - Duração em ms. 0 para não fechar sozinho.
 */
function mostrarPopup(mensagem, tipo = 'info', duracao = 4000) {
    const overlay = document.getElementById('popupGenerico');
    const popupMensagem = overlay.querySelector('.ds-popup-mensagem');
    const iconeEl = document.getElementById('popupIcone');
    const textoEl = document.getElementById('popupMensagemTexto');
    const botaoOk = document.getElementById('popupBotaoOk');

    // Remove classes de tipo anteriores
    popupMensagem.className = 'ds-popup-mensagem';
    iconeEl.className = 'fas ds-popup-icone';

    // Adiciona as novas classes de tipo
    popupMensagem.classList.add(`popup-${tipo}`);
    const icones = {
        sucesso: 'fa-check-circle',
        erro: 'fa-times-circle',
        aviso: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    iconeEl.classList.add(icones[tipo]);

    textoEl.textContent = mensagem;

    const fecharPopup = () => overlay.classList.remove('ativo');
    
    botaoOk.onclick = fecharPopup;

    overlay.classList.add('ativo');
    botaoOk.focus();

    if (duracao > 0) {
        setTimeout(fecharPopup, duracao);
    }
}


// ==========================================================================
// 5. EVENTO DE INICIALIZAÇÃO PRINCIPAL
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Adiciona a classe ao body para aplicar os estilos base
    document.body.classList.add('ds-body');
    mostrarSpinnerGeral('Autenticando...');

    try {
        // *** AQUI ESTÁ A CORREÇÃO ***
        // Agora pedimos apenas pela nova permissão 'acesso-dashboard'.
        // Não precisamos mais do modo 'any', pois é uma única permissão.
        const auth = await verificarAutenticacao('dashboard/dashboard.html', ['acesso-dashboard']);
        
        if (!auth) {
            // A função verificarAutenticacao já deve ter redirecionado
            console.error("Falha na autenticação. Dashboard não será renderizado.");
            esconderSpinnerGeral();
            return;
        }

        usuarioLogado = auth.usuario; // Define o usuário logado globalmente
        document.body.classList.add('autenticado');

        // Chama a função principal que carrega e renderiza todos os dados
        await atualizarDashboardCompleto(true);

        // Configura todos os event listeners da página
        configurarEventListenersGerais();

    } catch (err) {
        console.error("Erro crítico durante a inicialização do Dashboard:", err);
        esconderSpinnerGeral();
        mostrarPopup('Ocorreu um erro grave ao carregar a página. Tente novamente.', 'erro', 0);
    }
});

function abrirPainelFiltros() {

    const labelBusca = document.querySelector('label[for="input-busca-op"]');
    const inputBusca = document.getElementById('input-busca-op');
    if (labelBusca && dadosDashboardCache) {
        const tipoUsuario = dadosDashboardCache.usuario.tipo;
        if (tipoUsuario === 'costureira') {
            labelBusca.textContent = 'Buscar por OP';
            inputBusca.placeholder = 'Digite o número da OP...';
        } else { // tiktik ou outros
            labelBusca.textContent = 'Buscar por OP / Arremate';
            inputBusca.placeholder = 'Digite o nº da OP ou "arremate"...';
        }
    }


    const overlay = document.getElementById('painel-filtros-overlay');
    if (overlay) overlay.classList.add('ativo');
}

function fecharPainelFiltros() {
    const overlay = document.getElementById('painel-filtros-overlay');
    if (overlay) overlay.classList.remove('ativo');
}


// ==========================================================================
// 6. FUNÇÕES DE ATUALIZAÇÃO DA UI - CARDS SUPERIORES
// ==========================================================================

async function atualizarDashboardCompleto(forceRefresh = false, mostrarSpinner = true) {
    if (mostrarSpinner) {
        mostrarSpinnerGeral('Carregando seu desempenho...');
    }
    
    try {
        const dados = await carregarDadosDashboard(forceRefresh);
        if (!dados) {
            if (mostrarSpinner) esconderSpinnerGeral();
            return;
        }

        const { usuario, cicloAtual, cicloFechado } = dados;

        // 1. Unifica as atividades dos ciclos relevantes em um único array.
        // Isso é crucial para as funções de detalhamento e assinatura.
        const atividadesDoCicloAtual = cicloAtual ? cicloAtual.atividades : [];
        const atividadesDoCicloFechado = cicloFechado ? cicloFechado.atividades : [];
        todasAsAtividadesRelevantes = [...atividadesDoCicloAtual, ...atividadesDoCicloFechado];

        document.getElementById('header-nome-usuario').textContent = usuario.nome;
        document.getElementById('header-cargo-nivel').textContent = `${usuario.tipo.charAt(0).toUpperCase() + usuario.tipo.slice(1)} - Nível ${usuario.nivel || 'N/A'}`;
        document.getElementById('header-avatar-img').src = usuario.avatar_url || '/img/default-avatar.png';
        const nivelBadgeEl = document.getElementById('header-level-badge');
        if (nivelBadgeEl) {
            nivelBadgeEl.textContent = usuario.nivel || '?';
            nivelBadgeEl.style.display = usuario.nivel ? 'flex' : 'none';
        }

        // 2. Passa para cada função os dados que ela realmente precisa.

        // O painel de desempenho só precisa dos dados do ciclo ATUAL.
        await atualizarPainelDesempenho(usuario, cicloAtual);

        // O badge de assinaturas precisa de TODAS as atividades relevantes.
        atualizarBotaoAcaoAssinatura(todasAsAtividadesRelevantes);

        // A Central de Comunicação é independente.
        await atualizarCentralComunicacao(false);

        // O detalhamento também usa a lista unificada.
        atualizarDetalhamentoAtividades(); // Agora não precisa de parâmetro, usará a variável global

        // As conquistas são independentes.
        preencherTotalConquistas();

        } catch (error) {
        console.error('[atualizarDashboardCompleto] Erro inesperado ao atualizar a UI:', error);
        mostrarPopup('Ocorreu um erro ao exibir os dados do dashboard.', 'erro');
    } finally {
        if (mostrarSpinner) {
            esconderSpinnerGeral();
        }
    }
}

/**
 * Busca o perfil do usuário para preencher o total de conquistas na métrica.
 */
async function preencherTotalConquistas() {
    const metricaConquistasEl = document.getElementById('metrica-conquistas');
    try {
        const response = await fetch('/api/perfis/meu-perfil', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (response.ok) {
            const perfil = await response.json();
            metricaConquistasEl.textContent = perfil.conquistas.filter(c => c.desbloqueada).length;
        } else {
            metricaConquistasEl.textContent = '0';
        }
    } catch (error) {
        console.error("Erro ao buscar total de conquistas para a métrica:", error);
        metricaConquistasEl.textContent = '0';
    }
}

async function atualizarPainelDesempenho(usuario, cicloAtual) {

    // --- 1. REFERÊNCIAS AOS ELEMENTOS DO DOM ---
    const focoDiarioEl = document.querySelector('.ds-foco-diario');
    const progressRingFgEl = document.getElementById('progress-ring-fg');
    const textoCentralGrandeEl = document.querySelector('#foco-diario-texto-central .ds-texto-grande');
    const textoCentralPequenoEl = document.querySelector('#foco-diario-texto-central .ds-texto-pequeno');
    const legendaMetaDiaStrong = document.querySelector('#legenda-meta-dia strong');
    const legendaFeitosDiaStrong = document.querySelector('#legenda-feitos-dia strong');
    
    const sliderEl = document.getElementById('meta-slider');
    const ticksContainerEl = document.getElementById('slider-ticks');
    const feedbackMetaEl = document.getElementById('feedback-meta-selecionada');
    const feedbackComissaoEl = document.getElementById('feedback-comissao');
    const feedbackPontosFaltantesEl = document.getElementById('feedback-pontos-faltantes');

    const metricaPontosSemanaEl = document.getElementById('metrica-pontos-semana');
    const metricaMediaDiariaEl = document.getElementById('metrica-media-diaria');

    // Se não houver ciclo atual, o painel não tem o que exibir.
    if (!cicloAtual) {
        document.querySelector('.ds-painel-desempenho').innerHTML = '<p style="text-align:center; padding: 20px;">Nenhum ciclo de trabalho ativo no momento.</p>';
        return;
    }

    // --- 2. OBTENÇÃO DA META SEMANAL ESCOLHIDA ---
    const metasDoNivel = await obterMetas(usuario.tipo, usuario.nivel, new Date());
    const pontosMetaSalva = localStorage.getItem(`metaSelecionada_${usuario.nome}`);
    let metaSelecionada = metasDoNivel.find(m => m.pontos_meta == pontosMetaSalva) || metasDoNivel[0];

    if (!metaSelecionada) {
        console.warn("Nenhuma meta encontrada para o usuário.");
        metaSelecionada = { pontos_meta: 0, descricao: "Nenhuma", valor: 0 };
    }
    const pontosMetaSemanal = metaSelecionada.pontos_meta;
    
    // --- 3. CÁLCULOS DE PONTOS E DATAS ---
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Normaliza para o início do dia
    const diaDaSemana = hoje.getDay(); // Domingo = 0, Segunda = 1, ..., Sábado = 6

    const atividadesDaSemana = cicloAtual.atividades.filter(item => {
        const dataItem = new Date(item.data);
        const inicioSemana = new Date(cicloAtual.semana.inicio);
        const fimSemana = new Date(cicloAtual.semana.fim);
        return dataItem >= inicioSemana && dataItem <= fimSemana;
    });

    const totalPontosSemana = atividadesDaSemana.reduce((acc, item) => acc + (parseFloat(item.pontos_gerados) || 0), 0);
    const pontosFeitosHoje = atividadesDaSemana
        .filter(item => new Date(item.data).toDateString() === hoje.toDateString())
        .reduce((acc, item) => acc + (parseFloat(item.pontos_gerados) || 0), 0);
    const pontosFaltantesSemana = Math.max(0, pontosMetaSemanal - totalPontosSemana);

    // --- 4. LÓGICA DA META DIÁRIA INTELIGENTE E CONFIGURAÇÃO DA UI DO ANEL ---
    let metaDiariaParaPill;
    let textoAnelPrincipal;
    let textoAnelInferior;
    let progressoPercentualAnel;

    if (pontosFaltantesSemana <= 0) {
        // CASO 1: META SEMANAL JÁ BATIDA!
        focoDiarioEl.classList.add('sucesso');
        textoAnelPrincipal = 'Meta Batida!';
        textoAnelInferior = '🎉';
        metaDiariaParaPill = pontosFeitosHoje; // Meta do dia é o que já foi feito, pois já bateu.
        progressoPercentualAnel = 100;
    } else {
        // CASO 2: META SEMANAL EM ANDAMENTO
        focoDiarioEl.classList.remove('sucesso');

        if (diaDaSemana >= 1 && diaDaSemana <= 4) { // Segunda a Quinta
            const diasRestantes = 6 - diaDaSemana;
            metaDiariaParaPill = pontosFaltantesSemana / diasRestantes;
            textoAnelPrincipal = Math.ceil(pontosFaltantesSemana);
            textoAnelInferior = 'Faltam na semana';
            progressoPercentualAnel = metaDiariaParaPill > 0 ? (pontosFeitosHoje / metaDiariaParaPill) * 100 : 0;
        } else if (diaDaSemana === 5) { // Sexta-feira
            metaDiariaParaPill = pontosFaltantesSemana;
            textoAnelPrincipal = Math.ceil(pontosFaltantesSemana);
            textoAnelInferior = 'Falta hoje';
            progressoPercentualAnel = metaDiariaParaPill > 0 ? (pontosFeitosHoje / metaDiariaParaPill) * 100 : 0;
        } else if (diaDaSemana === 6) { // Sábado
            metaDiariaParaPill = pontosFaltantesSemana;
            textoAnelPrincipal = Math.ceil(pontosFaltantesSemana);
            textoAnelInferior = 'Faltou na semana';
            progressoPercentualAnel = pontosMetaSemanal > 0 ? (totalPontosSemana / pontosMetaSemanal) * 100 : 0;
        } else { // Domingo
            metaDiariaParaPill = pontosMetaSemanal > 0 ? pontosMetaSemanal / 5 : 0;
            textoAnelPrincipal = Math.ceil(metaDiariaParaPill);
            textoAnelInferior = 'Meta para Seg.';
            progressoPercentualAnel = 0;
        }
    }

    // --- 5. ATUALIZAÇÃO DA INTERFACE (UI) ---

    // 5.1 Atualiza o Anel e as Pílulas
    textoCentralGrandeEl.textContent = textoAnelPrincipal;
    textoCentralPequenoEl.textContent = textoAnelInferior;
    legendaMetaDiaStrong.textContent = `${Math.round(metaDiariaParaPill)} pts`;
    legendaFeitosDiaStrong.textContent = `${Math.round(pontosFeitosHoje)} pts`;

    // 5.2 Animação do Anel de Progresso
    const raio = progressRingFgEl.r.baseVal.value;
    const circunferencia = 2 * Math.PI * raio;
    progressRingFgEl.style.strokeDasharray = `${circunferencia} ${circunferencia}`;
    const progressoFinal = Math.min(progressoPercentualAnel, 100);
    const offsetFinal = circunferencia - (progressoFinal / 100) * circunferencia;

    let start = null;
    const duracaoAnimacao = 1000;
    function animarAnel(timestamp) {
        if (!start) start = timestamp;
        const progressoTempo = timestamp - start;
        const progressoAnimacao = Math.min(progressoTempo / duracaoAnimacao, 1);
        const offsetAtual = circunferencia - (progressoAnimacao * progressoFinal / 100) * circunferencia;
        progressRingFgEl.style.strokeDashoffset = offsetAtual;

        if (progressoTempo < duracaoAnimacao) {
            requestAnimationFrame(animarAnel);
        } else {
            progressRingFgEl.style.strokeDashoffset = offsetFinal;
        }
    }
    requestAnimationFrame(animarAnel);

    // 5.3 Lógica do Planejador Semanal (Slider)
    if (metasDoNivel.length > 0) {
        sliderEl.style.display = 'block';
        const valoresValidos = metasDoNivel.map(m => m.pontos_meta);
        let indiceAtual = valoresValidos.indexOf(pontosMetaSemanal);
        if (indiceAtual === -1) indiceAtual = 0;

        sliderEl.min = 0;
        sliderEl.max = valoresValidos.length - 1;
        sliderEl.value = indiceAtual;
        ticksContainerEl.innerHTML = valoresValidos.map(() => '<div class="tick"></div>').join('');

        const atualizarFeedbackSlider = (indice) => {
            const metaAlvo = metasDoNivel[indice];
            if (!metaAlvo) return;
            feedbackMetaEl.querySelector('span:first-child').textContent = metaAlvo.descricao;
            feedbackMetaEl.querySelector('span:last-child').textContent = `${metaAlvo.pontos_meta} pts`;
            feedbackComissaoEl.textContent = `R$ ${metaAlvo.valor.toFixed(2)}`;
            const faltamParaAlvo = metaAlvo.pontos_meta - totalPontosSemana;
            feedbackPontosFaltantesEl.textContent = `${Math.ceil(Math.max(0, faltamParaAlvo))} pts`;
        };

        atualizarFeedbackSlider(indiceAtual);
        
        sliderEl.oninput = () => {
            atualizarFeedbackSlider(parseInt(sliderEl.value));
        };

        sliderEl.onchange = async () => {
            const novaMeta = metasDoNivel[parseInt(sliderEl.value)];
            if (novaMeta) {
                localStorage.setItem(`metaSelecionada_${usuario.nome}`, novaMeta.pontos_meta);
                mostrarPopup('Meta semanal atualizada!', 'sucesso', 2000);
                await atualizarPainelDesempenho(usuario, cicloAtual);
            }
        };
    } else {
        sliderEl.style.display = 'none';
        feedbackMetaEl.textContent = 'Nenhuma meta configurada para seu nível.';
    }

    // 5.4 Métricas Rápidas
    metricaPontosSemanaEl.textContent = Math.round(totalPontosSemana);
    
    const diasUteisPassados = (diaDaSemana === 0 || diaDaSemana > 5) ? 5 : diaDaSemana;
    const mediaDiaria = diasUteisPassados > 0 ? totalPontosSemana / diasUteisPassados : 0;
    metricaMediaDiariaEl.textContent = Math.round(mediaDiaria);
}

/**
 * Atualiza o card de assinaturas, mostrando se há pendências.
 * @param {Array} atividades - Lista completa de atividades do usuário.
 */
function atualizarBotaoAcaoAssinatura(atividades) {
    const btnAcao = document.getElementById('btnAcaoAssinatura');
    const badge = document.getElementById('badgeAssinatura');

    if (!btnAcao || !badge) {
        console.error("Elementos da Action Bar para assinatura não encontrados.");
        return;
    }

    const itensNaoAssinados = atividades.filter(item => item.assinada === false);
    
    if (itensNaoAssinados.length > 0) {
        badge.textContent = itensNaoAssinados.length;
        badge.style.display = 'flex';
        btnAcao.classList.add('tem-pendencia');
        btnAcao.title = `${itensNaoAssinados.length} assinatura(s) pendente(s)`;
    } else {
        badge.style.display = 'none';
        btnAcao.classList.remove('tem-pendencia');
        btnAcao.title = 'Nenhuma assinatura pendente';
    }
}

/**
 * Busca os comunicados da API e atualiza o painel lateral do Mural Geral.
 * @param {boolean} [mostrarSpinnerNoPainel=true] - Se false, não exibe o spinner dentro do painel.
 */
async function atualizarCentralComunicacao(mostrarSpinnerNoPainel = true) {
    const badgeMural = document.getElementById('badgeMural');
    const painelBody = document.getElementById('comunicacoes-painel-body');

    if (!badgeMural || !painelBody) {
        console.error("Elementos da Central de Comunicação não encontrados.");
        return;
    }

    if (mostrarSpinnerNoPainel) {
        painelBody.innerHTML = '<div class="ds-spinner-container"><div class="ds-spinner"></div></div>';
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/comunicacoes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            badgeMural.style.display = 'none';
            throw new Error(`Falha ao buscar comunicados. Status: ${response.status}`);
        }

        const comunicados = await response.json();
        
        const comunicadosDoMural = comunicados.filter(c => c && c.tipo_post === 'Mural Geral');
        
        const naoLidos = comunicadosDoMural.filter(c => c && !c.lido).length;
        if (naoLidos > 0) {
            badgeMural.textContent = naoLidos;
            badgeMural.style.display = 'flex';
        } else {
            badgeMural.style.display = 'none';
        }

        if (mostrarSpinnerNoPainel) {
            if (comunicadosDoMural.length === 0) {
                painelBody.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhuma comunicação no momento.</p>';
            } else {
                painelBody.innerHTML = comunicadosDoMural.map(c => {
                    if (!c || !c.tipo_post) {
                        console.warn("Recebido um comunicado inválido ou sem tipo:", c);
                        return '';
                    }
                    
                    const tipoClasse = `tipo-${c.tipo_post.replace(/\s+/g, '-')}`;
                    const lidoClasse = c.lido ? '' : 'nao-lido';
                    const dataFormatada = new Date(c.data_criacao).toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'});

                    let footerAcoesHtml = '';
                    if (c.tipo_post === 'Mural Geral') {
                        const classeReagido = c.usuario_curtiu ? 'reagido' : '';
                        footerAcoesHtml = `
                            <div class="ds-comunicado-card-footer">
                                <button class="ds-like-btn ${classeReagido}" data-action="reagir" data-id="${c.id}">
                                    <i class="fas fa-thumbs-up"></i>
                                    <span>Curtir</span>
                                </button>
                                <span class="ds-like-count">${c.total_likes > 0 ? c.total_likes : ''}</span>
                                <a href="#" class="ds-comentarios-toggle" data-action="toggle-comentarios">
                                    <i class="fas fa-comments"></i> Comentários (<span class="ds-total-comentarios">${c.total_comentarios}</span>)
                                </a>
                            </div>
                            <div class="ds-comentarios-container" style="display: none;"></div>
                        `;
                    }

                    return `
                        <div class="ds-comunicado-card ${tipoClasse} ${lidoClasse}" data-id="${c.id}">
                            <div class="ds-comunicado-card-header">
                                <strong>${c.nome_autor || 'Autor desconhecido'}</strong> em ${dataFormatada}
                            </div>
                            <div class="ds-comunicado-card-body">
                                <h4>${c.titulo || 'Sem Título'}</h4>
                                <p>${c.conteudo || 'Sem conteúdo.'}</p>
                            </div>
                            ${footerAcoesHtml}
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Erro ao atualizar central de comunicação:', error);
        if (mostrarSpinnerNoPainel) {
            painelBody.innerHTML = '<p style="text-align:center; padding: 20px; color: red;">Erro ao carregar comunicações.</p>';
        }
    }
}

/**
 * Busca os comunicados e atualiza o painel de Suporte do usuário.
 */
async function atualizarPainelSuporte() {
    const painelBody = document.getElementById('suporte-painel-body');
    const badgeSuporte = document.getElementById('badgeSuporte');

    if (!painelBody) return;
    painelBody.innerHTML = '<div class="ds-spinner-container"><div class="ds-spinner"></div></div>';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/comunicacoes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Falha ao buscar comunicados de suporte.`);

        const todosComunicados = await response.json();
        
        const comunicadosDeSuporte = todosComunicados.filter(c => 
            c && (c.tipo_post === 'Ponto de Atenção' || c.tipo_post === 'Resposta Supervisor')
        );

        const respostasNaoLidas = comunicadosDeSuporte.filter(c => c.tipo_post === 'Resposta Supervisor' && !c.lido).length;
        if (respostasNaoLidas > 0) {
            badgeSuporte.textContent = respostasNaoLidas;
            badgeSuporte.style.display = 'flex';
        } else {
            badgeSuporte.style.display = 'none';
        }

        if (comunicadosDeSuporte.length === 0) {
            painelBody.innerHTML = '<p style="text-align:center; padding: 20px;">Você não enviou nenhum ponto de atenção ainda.</p>';
        } else {
            painelBody.innerHTML = comunicadosDeSuporte.map(c => {
                const tipoClasse = `tipo-${c.tipo_post.replace(/\s+/g, '-')}`;
                const lidoClasse = c.lido ? '' : 'nao-lido';
                const dataFormatada = new Date(c.data_criacao).toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'});
                
                return `
                    <div class="ds-comunicado-card ${tipoClasse} ${lidoClasse}" data-id="${c.id}">
                        <div class="ds-comunicado-card-header">
                            <strong>${c.nome_autor}</strong> em ${dataFormatada}
                        </div>
                        <div class="ds-comunicado-card-body">
                            <h4>${c.titulo}</h4>
                            <p>${c.conteudo}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Erro ao atualizar painel de suporte:', error);
        painelBody.innerHTML = '<p style="text-align:center; color: red;">Erro ao carregar seus chamados.</p>';
    }
}

/**
 * Envia para a API o pedido para marcar uma comunicação como lida.
 * @param {string} id - O ID da comunicação.
 * @param {HTMLElement} cardElement - O elemento do card para remover o destaque.
 */
async function marcarComoLido(id, cardElement) {
    // Remove o destaque visual imediatamente para uma resposta rápida
    cardElement.classList.remove('nao-lido');

    // Atualiza o contador no badge
    const badgeMural = document.getElementById('badgeMural');
    let contagemAtual = parseInt(badgeMural.textContent, 10);
    contagemAtual--;
    if (contagemAtual > 0) {
        badgeMural.textContent = contagemAtual;
    } else {
        badgeMural.style.display = 'none';
    }
    
    try {
        const token = localStorage.getItem('token');
        await fetch(`/api/comunicacoes/${id}/marcar-como-lido`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        // Não precisamos fazer mais nada em caso de sucesso, a UI já foi atualizada.
    } catch (error) {
        console.error(`Erro ao marcar comunicação ${id} como lida:`, error);
        // Opcional: Adicionar a classe de volta se a API falhar
        cardElement.classList.add('nao-lido'); 
    }
}

/**
 * Processa o clique no botão de like/unlike, atualizando a UI e chamando a API.
 * @param {string} id - O ID da comunicação.
 * @param {HTMLElement} buttonElement - O elemento do botão que foi clicado.
 */
async function processarReacao(id, buttonElement) {
    const card = buttonElement.closest('.ds-comunicado-card');
    const countElement = card.querySelector('.ds-like-count');
    let totalLikes = parseInt(countElement.textContent || '0', 10);

    // ATUALIZAÇÃO OTIMISTA DA UI: muda a aparência antes mesmo da resposta da API
    buttonElement.classList.toggle('reagido');
    if (buttonElement.classList.contains('reagido')) {
        totalLikes++;
    } else {
        totalLikes--;
    }
    countElement.textContent = totalLikes > 0 ? totalLikes : '';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/comunicacoes/${id}/reagir`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo_reacao: 'like' })
        });

        if (!response.ok) throw new Error('Falha ao processar reação.');

        // A API retorna o total de likes atualizado. Podemos usar para corrigir a contagem se necessário.
        const data = await response.json();
        countElement.textContent = data.total_likes > 0 ? data.total_likes : '';

    } catch (error) {
        console.error(`Erro ao processar reação para o post ${id}:`, error);
        // REVERTE A MUDANÇA NA UI em caso de erro
        buttonElement.classList.toggle('reagido');
        alert('Não foi possível registrar sua reação. Tente novamente.');
    }
}

/**
 * Busca os comentários de um post na API e os renderiza na tela.
 * @param {string} id - O ID do post de comunicação.
 * @param {HTMLElement} container - O elemento onde os comentários serão renderizados.
 */
async function carregarEExibirComentarios(id, container) {
    container.innerHTML = '<div class="ds-spinner-container"><div class="ds-spinner"></div></div>';
    container.style.display = 'block';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/comunicacoes/${id}/comentarios`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao carregar comentários.');
        
        const comentarios = await response.json();
        
        // Atualiza o contador de comentários no link
        const card = container.closest('.ds-comunicado-card');
        card.querySelector('.ds-total-comentarios').textContent = comentarios.length;

        let comentariosHtml = comentarios.map(comentario => {
        // Verifica se o comentário pertence ao usuário logado
        const ehDoUsuario = comentario.id_autor === usuarioLogado.id;
        
        // Botão de opções (só aparece se for do usuário)
        const opcoesHtml = ehDoUsuario ? `
            <div class="ds-comentario-opcoes">
                <button class="ds-btn-opcoes-comentario" data-action="editar-comentario" data-id-comentario="${comentario.id}">
                    <i class="fas fa-pencil-alt"></i>
                </button>
            </div>
        ` : '';

        return `
            <div class="ds-comentario-item">
                <div class="ds-comentario-avatar">
                    <img src="${comentario.avatar_url || '/img/default-avatar.png'}" alt="Avatar">
                </div>
                <div class="ds-comentario-conteudo">
                    <strong>${comentario.nome_autor}</strong>
                    <p>${comentario.conteudo.replace(/\n/g, '<br>')}</p>
                    
                    <!-- Formulário de Edição (escondido) -->
                    <form class="ds-form-edicao-comentario" data-id-post="${id}" data-id-comentario="${comentario.id}"> <!-- << CORREÇÃO AQUI -->
                        <textarea>${comentario.conteudo}</textarea>
                        <div class="botoes-edicao">
                            <button type="button" class="ds-btn ds-btn-secundario ds-btn-sm" data-action="cancelar-edicao">Cancelar</button>
                            <button type="submit" class="ds-btn ds-btn-primario ds-btn-sm">Salvar</button>
                        </div>
                    </form>

                </div>
                ${opcoesHtml}
            </div>
        `;
    }).join('');



        // Adiciona o formulário para postar um novo comentário
        container.innerHTML = `
            <div class="ds-lista-comentarios">${comentariosHtml}</div>
            <form class="ds-form-comentario" data-id-post="${id}">
                <textarea name="conteudo" required placeholder="Escreva um comentário..."></textarea>
                <button type="submit" class="ds-btn ds-btn-primario">Enviar</button>
            </form>
        `;
        
        // Adiciona um listener GERAL no container de comentários para todas as ações
        container.addEventListener('click', (e) => {
            const btnEditar = e.target.closest('[data-action="editar-comentario"]');
            const btnCancelar = e.target.closest('[data-action="cancelar-edicao"]');

            if (btnEditar) {
                const itemConteudo = btnEditar.closest('.ds-comentario-item').querySelector('.ds-comentario-conteudo');
                itemConteudo.classList.add('editando');
            }

            if (btnCancelar) {
                const itemConteudo = btnCancelar.closest('.ds-comentario-conteudo');
                itemConteudo.classList.remove('editando');
            }
        });

        // Adiciona o listener para o formulário de NOVO comentário
        const formNovoComentario = container.querySelector('form.ds-form-comentario');
        if (formNovoComentario) {
            formNovoComentario.addEventListener('submit', postarNovoComentario);
        }

        // Adiciona os listeners para os formulários de EDIÇÃO
        const formsEdicao = container.querySelectorAll('form.ds-form-edicao-comentario');
        formsEdicao.forEach(form => {
            form.addEventListener('submit', salvarEdicaoComentario);
        });

    } catch (error) {
        console.error("Erro ao carregar comentários:", error);
        container.innerHTML = '<p style="color:red;">Não foi possível carregar os comentários.</p>';
    }
}

/**
 * Lida com o evento de submit do formulário de edição de um comentário.
 * @param {Event} event 
 */
async function salvarEdicaoComentario(event) {
    event.preventDefault();
    const form = event.target;
    const btnSalvar = form.querySelector('button[type="submit"]');
    const textarea = form.querySelector('textarea');
    const item = form.closest('.ds-comentario-item');
    const idComentario = form.dataset.idComentario; // << Pega direto do form
    const conteudo = textarea.value.trim();

    if (!conteudo) return;

    btnSalvar.disabled = true;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/comunicacoes/comentarios/${idComentario}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ conteudo })
        });
        const comentarioAtualizado = await response.json();
        if (!response.ok) throw new Error(comentarioAtualizado.error || 'Falha ao salvar edição.');
        
        // Atualiza a UI sem recarregar tudo
        const p = item.querySelector('.ds-comentario-conteudo p');
        p.innerHTML = comentarioAtualizado.conteudo.replace(/\n/g, '<br>');
        form.closest('.ds-comentario-conteudo').classList.remove('editando');

    } catch (error) {
        alert(`Erro: ${error.message}`);
    } finally {
        btnSalvar.disabled = false;
    }
}

/**
 * Lida com o evento de submit do formulário de novo comentário.
 * @param {Event} event - O evento de submit.
 */
async function postarNovoComentario(event) {
    event.preventDefault();
    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const textarea = form.querySelector('textarea');
    const idPost = form.dataset.idPost;
    const conteudo = textarea.value.trim();

    if (!conteudo) return;

    btn.disabled = true;
    btn.innerHTML = '<div class="ds-spinner" style="width:1em;height:1em;border-width:2px;"></div>';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/comunicacoes/${idPost}/comentarios`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ conteudo })
        });
        const novoComentario = await response.json();
        if (!response.ok) throw new Error(novoComentario.error || 'Falha ao postar comentário.');

        // Recarrega a seção de comentários para mostrar o novo
        const container = form.closest('.ds-comentarios-container');
        carregarEExibirComentarios(idPost, container);

    } catch (error) {
        console.error("Erro ao postar comentário:", error);
        alert(`Erro: ${error.message}`);
        btn.disabled = false;
        btn.innerHTML = 'Enviar';
    }
}

function abrirPainelPerfil() {
    const overlay = document.getElementById('perfil-overlay');
    const painelBody = document.getElementById('perfil-painel-body');
    
    if (!overlay || !painelBody) return;

    painelBody.innerHTML = '<div class="ds-spinner-container"><div class="ds-spinner"></div></div>';
    overlay.classList.add('ativo');

    fetch('/api/perfis/meu-perfil', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => {
        if (!res.ok) throw new Error('Falha ao carregar dados do perfil.');
        return res.json();
    })
    .then(perfil => {
        renderizarPerfil(perfil, painelBody);
    })
    .catch(err => {
        console.error("Erro ao buscar perfil:", err);
        painelBody.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar perfil.</p>';
    });
}

/**
 * Renderiza o conteúdo do painel de perfil com os dados recebidos.
 * @param {object} perfil - O objeto de perfil vindo da API.
 * @param {HTMLElement} painelBody - O elemento onde o conteúdo será renderizado.
 */
function renderizarPerfil(perfil, painelBody) {
    verificarEnotificarNovasConquistas(perfil.conquistas);

    const todasAsConquistasHtml = perfil.conquistas
        .map(conquista => criarHtmlDoBadge(conquista, perfil.badge_destaque_id))
        .join('');

    painelBody.innerHTML = `
        <!-- Header do Painel Lateral com Título e Botão de Fechar -->
        <div class="ds-side-painel-header">
            <h3>Meu Perfil</h3>
            <button id="fechar-painel-perfil" class="ds-btn-fechar-painel-padrao">X</button>
        </div>
        
        <!-- Wrapper para o conteúdo principal, estilizado como um card -->
        <div class="ds-perfil-conteudo-wrapper">
            <!-- Header interno do Perfil (avatar, nome, etc.) -->
            <div class="ds-perfil-header">
                <div class="ds-perfil-avatar">
                    <img id="perfil-avatar-img" src="${perfil.avatar_url || '/img/default-avatar.png'}" alt="Avatar">
                    <button class="ds-btn-trocar-foto" title="Trocar foto"><i class="fas fa-camera"></i></button>
                </div>
                <h3>${perfil.nome}</h3>
                <p>Nível ${perfil.nivel || 'N/A'}</p>
            </div>
            
            <!-- Galeria Única de Conquistas -->
            <h4 class="ds-perfil-secao-titulo">Minhas Conquistas</h4>
            <div class="ds-galeria-conquistas">
                ${todasAsConquistasHtml}
            </div>
        </div>
    `;

    // Adiciona os event listeners
    document.getElementById('fechar-painel-perfil').addEventListener('click', () => {
        document.getElementById('perfil-overlay').classList.remove('ativo');
    });
    
    const btnTrocarFoto = painelBody.querySelector('.ds-btn-trocar-foto');
    if (btnTrocarFoto) {
        btnTrocarFoto.addEventListener('click', abrirModalGaleriaAvatar);
    }
    
    // Listener de clique na galeria (VERSÃO CORRIGIDA E SEGURA)
    const galeria = painelBody.querySelector('.ds-galeria-conquistas');
    if (galeria) { // << Adiciona esta verificação
        galeria.addEventListener('click', (e) => {
            const itemClicado = e.target.closest('.ds-badge-item');
            if (!itemClicado) return;

            const idConquista = itemClicado.dataset.idConquista;
            const conquistaSelecionada = perfil.conquistas.find(c => c.id === idConquista);
            if (conquistaSelecionada) {
                abrirModalDetalhesConquista(conquistaSelecionada);
            }
        });
    } else {
        console.error("Elemento .ds-galeria-conquistas não encontrado dentro do painel do perfil.");
    }

}

/**
 * Função auxiliar para gerar o HTML de um único badge de conquista.
 * @param {object} conquista - O objeto da conquista.
 * @param {string} badgeDestaqueId - O ID do badge atualmente em destaque (se houver).
 * @returns {string} O HTML do badge.
 */
function criarHtmlDoBadge(conquista, badgeDestaqueId) {
    const isDesbloqueada = conquista.desbloqueada;
    const isDestaque = badgeDestaqueId === conquista.id;
    const classeBloqueado = isDesbloqueada ? '' : 'bloqueado';
    const classeDestaque = isDestaque ? 'em-destaque' : '';
    
    // --- LÓGICA DO TÍTULO CORRIGIDA ---
    // Se a conquista estiver desbloqueada, o título mostra a descrição.
    // Se estiver bloqueada, o título é um mistério para incentivar o clique.
    const titulo = isDesbloqueada 
        ? `${conquista.nome}: ${conquista.descricao}` 
        : 'Conquista Secreta (clique para ver a dica)';

    return `
        <div 
            class="ds-badge-item ${classeBloqueado} ${classeDestaque}" 
            title="${titulo}"
            data-id-conquista="${conquista.id}"
            data-desbloqueada="${isDesbloqueada}"
        >
            <div class="ds-badge-img-wrapper">
                <img src="${conquista.badge_url}" alt="${conquista.nome}">
            </div>
            <p>${isDesbloqueada ? conquista.nome : '???'}</p>
        </div>
    `;
}

/**
 * Lida com o processo completo de upload de avatar: seleciona, redimensiona, e envia.
 * @param {Event} event - O evento do input de arquivo.
 */
async function processarUploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;

    mostrarSpinnerGeral('Enviando e compactando...');
    
    try {
        // Usando a biblioteca de compressão que você já tem
        const compressedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 800 });

        const formData = new FormData();
        formData.append('foto', compressedFile, compressedFile.name);

        const response = await fetch('/api/avatares/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        mostrarPopup('Novo avatar adicionado!', 'sucesso');
        carregarAvataresNaGaleria(); // Apenas recarrega a galeria

    } catch (error) {
        console.error('Erro no processo de upload de avatar:', error);
        mostrarPopup(`Erro ao enviar foto: ${error.message}`, 'erro');
    } finally {
        esconderSpinnerGeral();
        event.target.value = ''; // Limpa o input para permitir o mesmo arquivo de novo
    }
}

// ==========================================================================
// 8. FUNÇÕES DE ATUALIZAÇÃO DA UI - DETALHAMENTO E PAGINAÇÃO
// ==========================================================================

/**
 * Atualiza toda a seção de detalhamento de atividades com base nos filtros ativos.
 */
function atualizarDetalhamentoAtividades() {
    // Usa a nova variável global com a lista de atividades já unificada.
    let atividadesFiltradas = [...todasAsAtividadesRelevantes];
    
    // Se houver uma busca por OP, ela tem prioridade MÁXIMA e ignora outros filtros de data/processo.
    if (filtrosAtivosDetalhes.busca) {
        const buscaLower = filtrosAtivosDetalhes.busca.toLowerCase();
        atividadesFiltradas = atividadesFiltradas.filter(item => 
            (item.op_numero && item.op_numero.toString().includes(buscaLower)) ||
            (item.tipo_origem && item.tipo_origem.toLowerCase().includes(buscaLower))
        );
        // IMPORTANTE: Limpamos outros filtros para não conflitarem
        filtrosAtivosDetalhes.periodo = ''; // Reseta o período para a pílula não aparecer
        filtrosAtivosDetalhes.processo = '';
    } else {
        // Se NÃO houver busca por OP, aplicamos os outros filtros normalmente.
        // 1. Filtro de Período
        if (filtrosAtivosDetalhes.periodo) {
            // ... (toda a lógica do switch case do período que já fizemos, permanece aqui dentro) ...
            let dataInicio, dataFim;
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);

            switch (filtrosAtivosDetalhes.periodo) {
                case 'hoje':
                    dataInicio = hoje; dataFim = hoje; break;
                case 'ontem':
                    const ontem = new Date(); ontem.setDate(hoje.getDate() - 1); ontem.setHours(0, 0, 0, 0);
                    dataInicio = ontem; dataFim = ontem; break;
                case 'esta-semana':
                    const cicloAtual = getObjetoCicloCompletoAtual(new Date());
                    if (cicloAtual && cicloAtual.semana) {
                        dataInicio = new Date(cicloAtual.semana.inicio); dataFim = new Date(cicloAtual.semana.fim);
                    } break;
                case 'semana-passada':
                    const cicloAtualSP = getObjetoCicloCompletoAtual(new Date());
                    if (cicloAtualSP && cicloAtualSP.semana) {
                        const dataRef = new Date(cicloAtualSP.semana.inicio); dataRef.setDate(dataRef.getDate() - 1);
                        const cicloPassado = getObjetoCicloCompletoAtual(dataRef);
                        if (cicloPassado && cicloPassado.semana) {
                            dataInicio = new Date(cicloPassado.semana.inicio); dataFim = new Date(cicloPassado.semana.fim);
                        }
                    } break;
                case 'dia-especifico': case 'semana-especifica':
                    dataInicio = filtrosAtivosDetalhes.dataInicio; dataFim = filtrosAtivosDetalhes.dataFim; break;
            }

            if (dataInicio && dataFim) {
                const inicioDoPeriodo = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), dataInicio.getDate(), 0, 0, 0, 0);
                const fimDoPeriodo = new Date(dataFim.getFullYear(), dataFim.getMonth(), dataFim.getDate(), 23, 59, 59, 999);
                atividadesFiltradas = atividadesFiltradas.filter(item => {
                    const dataItem = new Date(item.data);
                    return dataItem >= inicioDoPeriodo && dataItem <= fimDoPeriodo;
                });
            }
        }
        
    }
            
    // --- LÓGICA DE RENDERIZAÇÃO ---
    const listaAtividadesEl = document.getElementById('listaAtividades');
    const paginacaoContainerEl = document.getElementById('paginacaoContainer');

    // Renderização das pílulas de filtros ativos
    renderizarPilulasFiltro();

    // Renderização dos totalizadores dinâmicos
    renderizarTotalizadores(atividadesFiltradas);

    // Paginação e renderização da lista
    const totalPaginas = Math.ceil(atividadesFiltradas.length / ITENS_POR_PAGINA_DETALHES);
    paginaAtualDetalhes = Math.min(paginaAtualDetalhes, totalPaginas) || 1;
    const inicio = (paginaAtualDetalhes - 1) * ITENS_POR_PAGINA_DETALHES;
    const fim = inicio + ITENS_POR_PAGINA_DETALHES;
    const atividadesDaPagina = atividadesFiltradas.slice(inicio, fim);

    listaAtividadesEl.innerHTML = '';
    if (atividadesDaPagina.length === 0) {
        listaAtividadesEl.innerHTML = '<li class="ds-item-vazio">Nenhuma atividade encontrada para os filtros selecionados.</li>';
    } else {
        atividadesDaPagina.forEach(item => {
            const tipoLabel = item.tipo_origem === 'OP' 
                ? `OP ${item.op_numero} (${item.processo})` 
                : `Arremate ${item.op_numero}`;
            const classeStatus = item.assinada ? 'status-assinado' : 'status-pendente';
            const itemHTML = `
            <div class="ds-atividade-item ${classeStatus}">
                <p><strong>Produto:</strong> ${item.produto} ${item.variacao ? `[${item.variacao}]` : ''}</p>
                <p><strong>Tipo/Processo:</strong> ${tipoLabel}</p>
                <p><strong>Data:</strong> ${new Date(item.data).toLocaleDateString('pt-BR')}</p>
                <p><strong>Hora:</strong> ${new Date(item.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                <p><strong>Quantidade:</strong> ${item.quantidade || 0}</p>
                <p><strong>Pontos:</strong> ${(parseFloat(item.pontos_gerados) || 0).toFixed(2)}</p>
                <p><strong>Status:</strong> ${item.assinada ? '<span style="color:var(--ds-cor-sucesso);">Assinado</span>' : '<span style="color:var(--ds-cor-perigo);">Pendente</span>'}</p>
            </div>`;
            listaAtividadesEl.innerHTML += itemHTML;
        });
    }

    renderizarPaginacaoDetalhes(totalPaginas);
    paginacaoContainerEl.classList.toggle('visivel', totalPaginas > 1);
}

/**
 * Funções auxiliares de renderização para o detalhamento
 */
function renderizarPilulasFiltro() {
    const container = document.getElementById('filtros-ativos-container');
    container.innerHTML = '';

    const criarPilula = (tipo, valor, callbackRemover) => {
        if (!valor) return;
        const pilula = document.createElement('div');
        pilula.className = 'ds-filtro-pilula';
        pilula.innerHTML = `<strong>${tipo}:</strong> ${valor} <button title="Remover filtro">×</button>`;
        pilula.querySelector('button').addEventListener('click', callbackRemover);
        container.appendChild(pilula);
    };

    // Função que será chamada ao remover uma pílula
    const aoRemoverPilula = () => {
        // --- MUDANÇA PRINCIPAL ---
        // Se após remover uma pílula, não houver mais NENHUM filtro ativo (nem busca, nem período customizado)
        // então forçamos o filtro padrão 'hoje'.
        if (!filtrosAtivosDetalhes.busca && !filtrosAtivosDetalhes.periodo) {
            filtrosAtivosDetalhes.periodo = 'hoje';
            document.getElementById('select-periodo').value = 'hoje';
        }
        atualizarDetalhamentoAtividades();
    };

    // Pílula para o Período
    let textoPeriodo = '';
    const periodoSelecionado = filtrosAtivosDetalhes.periodo;
    if (periodoSelecionado) {
        const selectPeriodoEl = document.getElementById('select-periodo');
        if (selectPeriodoEl.querySelector(`option[value="${periodoSelecionado}"]`)) {
            textoPeriodo = selectPeriodoEl.querySelector(`option[value="${periodoSelecionado}"]`).textContent.replace('...', '');
        }
        if (periodoSelecionado === 'dia-especifico' && filtrosAtivosDetalhes.dataInicio) {
            textoPeriodo += `: ${filtrosAtivosDetalhes.dataInicio.toLocaleDateString('pt-BR')}`;
        } else if (periodoSelecionado === 'semana-especifica' && filtrosAtivosDetalhes.dataInicio) {
            textoPeriodo += `: ${filtrosAtivosDetalhes.dataInicio.toLocaleDateString('pt-BR')} - ${filtrosAtivosDetalhes.dataFim.toLocaleDateString('pt-BR')}`;
        }
    }

    if (textoPeriodo) {
        criarPilula('Período', textoPeriodo, () => {
            filtrosAtivosDetalhes.periodo = ''; // Limpa o período
            aoRemoverPilula();
        });
    }

    // Pílula para Busca
    criarPilula('Busca', filtrosAtivosDetalhes.busca, () => {
        filtrosAtivosDetalhes.busca = '';
        document.getElementById('input-busca-op').value = '';
        aoRemoverPilula();
    });
}

function renderizarTotalizadores(atividadesFiltradas) {
    const container = document.getElementById('totalizadores-detalhamento');
    // Renomeado de "totalPecas" para "totalProcessos"
    const totalProcessos = atividadesFiltradas.reduce((acc, item) => acc + (item.quantidade || 0), 0);
    const totalPontos = atividadesFiltradas.reduce((acc, item) => acc + (parseFloat(item.pontos_gerados) || 0), 0);
    
    container.innerHTML = `
        <div class="ds-total-item">
            <span class="ds-total-label">Total de Processos</span>
            <strong class="ds-total-valor">${totalProcessos}</strong>
        </div>
        <div class="ds-total-item">
            <span class="ds-total-label">Total de Pontos</span>
            <strong class="ds-total-valor">${Math.round(totalPontos)}</strong>
        </div>
    `;
}

/**
 * Renderiza os controles de paginação para a lista de detalhes.
 * @param {number} totalPaginas - O número total de páginas.
 */
function renderizarPaginacaoDetalhes(totalPaginas) {
    const paginacaoNumerosEl = document.getElementById('paginacaoNumeros');
    const btnAnterior = document.getElementById('btnAnterior');
    const btnProximo = document.getElementById('btnProximo');
    paginacaoNumerosEl.innerHTML = '';

    btnAnterior.disabled = paginaAtualDetalhes === 1;
    btnProximo.disabled = paginaAtualDetalhes === totalPaginas || totalPaginas === 0;

    if (totalPaginas <= 1) {
        return; // Não mostra números se tiver 0 ou 1 página
    }

    const criarBotao = (numero) => {
        const btn = document.createElement('button');
        btn.textContent = numero;
        btn.className = (numero === paginaAtualDetalhes) ? 'active' : '';
        btn.onclick = () => {
        paginaAtualDetalhes = numero;
        // Ela agora usa a variável global 'todasAsAtividadesRelevantes'.
        atualizarDetalhamentoAtividades(); 
    };
        paginacaoNumerosEl.appendChild(btn);
    };

    const criarDots = () => {
        const dots = document.createElement('span');
        dots.textContent = '...';
        dots.className = 'ds-paginacao-dots'; // Adiciona uma classe para estilização se desejar
        paginacaoNumerosEl.appendChild(dots);
    };

    // Lógica de paginação "inteligente"
    // Mostra: 1 ... (p-1) p (p+1) ... N
    const paginasVizinhas = 1; // Quantos vizinhos de cada lado da página atual

    // Sempre mostra o botão da primeira página
    criarBotao(1);

    // Mostra '...' se a página atual estiver longe do início
    if (paginaAtualDetalhes > paginasVizinhas + 2) {
        criarDots();
    }

    // Mostra os vizinhos da página atual
    const inicio = Math.max(2, paginaAtualDetalhes - paginasVizinhas);
    const fim = Math.min(totalPaginas - 1, paginaAtualDetalhes + paginasVizinhas);

    for (let i = inicio; i <= fim; i++) {
        criarBotao(i);
    }

    // Mostra '...' se a página atual estiver longe do fim
    if (paginaAtualDetalhes < totalPaginas - (paginasVizinhas + 1)) {
        criarDots();
    }

    // Sempre mostra o botão da última página (se não for a primeira)
    if (totalPaginas > 1) {
        criarBotao(totalPaginas);
    }
}

// ==========================================================================
// 9. LÓGICA DO MODAL DE ASSINATURA
// ==========================================================================

/**
 * Cria e exibe o modal com os itens pendentes de assinatura.
 * @param {Array} itensNaoAssinados - Lista de atividades não assinadas.
 */
function mostrarModalAssinatura(itensNaoAssinados) {
    document.getElementById('ds-modal-assinatura-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ds-modal-assinatura-overlay';
    overlay.className = 'ds-popup-overlay';
    
    // ESTRUTURA HTML FINAL COM HEADER, CORPO (SCROLL) E FOOTER (FIXO)
    overlay.innerHTML = `
        <div class="ds-modal-assinatura-content">
            <div class="ds-modal-header-static">
                <h2 class="ds-modal-titulo">Conferência de Atividades</h2>
                <button class="ds-btn-fechar-painel-padrao" title="Fechar">X</button>
                <div class="ds-modal-tabs">
                    <button class="ds-modal-tab-btn ativo" data-tab="assinar">Assinar Pendências</button>
                    <button class="ds-modal-tab-btn" data-tab="corrigir">Reportar Problema</button>
                </div>
            </div>

            <div class="ds-modal-body-scrollable">
                <div class="ds-modal-tab-content ativo" id="tab-content-assinar">
                    <div class="ds-select-all-container">
                        <input type="checkbox" id="selectAllCheckboxes">
                        <label for="selectAllCheckboxes">Selecionar Todas</label>
                    </div>
                    <ul class="ds-lista-assinatura" id="lista-assinaturas-pendentes"></ul>
                </div>
                <div class="ds-modal-tab-content" id="tab-content-corrigir">
                    <p>Selecione o item e o tipo de problema a ser reportado.</p>
                    <ul id="lista-itens-para-corrigir" class="ds-lista-assinatura"></ul>
                    <form id="formCorrecao" class="ds-form-divergencia" style="display:none; margin-top: 15px;">
                        <div id="selecao-tipo-problema">
                            <label for="select-tipo-divergencia">Qual o tipo do problema?</label>
                            <select id="select-tipo-divergencia" class="ds-select">
                                <option value="">-- Selecione o tipo --</option>
                                <option value="Quantidade">Quantidade errada</option>
                                <option value="Cor/Variação">Cor ou Variação errada</option>
                                <option value="Funcionário Incorreto">Lançamento não é meu</option>
                                <option value="Outro">Outro problema</option>
                            </select>
                        </div>
                        <div id="campos-problema-container" style="display:none; flex-direction: column; gap: 15px; margin-top: 10px;"></div>
                    </form>
                </div>
            </div>

            <div class="ds-modal-tab-footer">
                <!-- Botões de ação das abas aparecerão aqui dinamicamente -->
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const fecharModal = () => overlay.classList.remove('ativo');
    overlay.querySelector('.ds-btn-fechar-painel-padrao').onclick = fecharModal;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });
    
    const tabButtons = overlay.querySelectorAll('.ds-modal-tab-btn');
    const tabContents = overlay.querySelectorAll('.ds-modal-tab-content');
    const footer = overlay.querySelector('.ds-modal-tab-footer');

    // --- LÓGICA DE RENDERIZAÇÃO E EVENTOS ---

    // Função para renderizar o rodapé correto para a aba ativa
    const renderizarFooter = (tabAtiva) => {
        footer.innerHTML = '';
        if (tabAtiva === 'assinar') {
            const btnAssinar = document.createElement('button');
            btnAssinar.id = 'btnAssinarSelecionados';
            btnAssinar.className = 'ds-btn ds-btn-sucesso ds-btn-texto-claro';
            btnAssinar.disabled = true;
            btnAssinar.textContent = 'Assinar Selecionados';
            footer.appendChild(btnAssinar);
            configurarLogicaAssinatura();
        } else if (tabAtiva === 'corrigir') {
            // O formulário de correção tem seu próprio botão de submit, então o footer fica vazio
            // ou pode ter um botão de "Limpar seleção" no futuro.
        }
    };

    // Função para configurar os eventos da aba de assinatura
    const configurarLogicaAssinatura = () => {
        const btnAssinar = document.getElementById('btnAssinarSelecionados');
        if (!btnAssinar) return;
        
        const selectAll = document.getElementById('selectAllCheckboxes');
        const checkboxes = overlay.querySelectorAll('#lista-assinaturas-pendentes .item-checkbox:not(:disabled)');
        
        const atualizarBotaoAssinar = () => {
            const selecionados = overlay.querySelectorAll('#lista-assinaturas-pendentes .item-checkbox:checked').length;
            btnAssinar.disabled = selecionados === 0;
            btnAssinar.innerHTML = selecionados > 0 ? `<i class="fas fa-check-square"></i> Assinar ${selecionados} Item(ns)` : 'Assinar Selecionados';
        };

        selectAll.onchange = () => { checkboxes.forEach(cb => cb.checked = selectAll.checked); atualizarBotaoAssinar(); };
        checkboxes.forEach(cb => cb.onchange = atualizarBotaoAssinar);
        
       btnAssinar.onclick = async () => {
            const itensParaAssinar = Array.from(checkboxes).filter(cb => cb.checked).map(cb => ({ id: cb.value, tipo: cb.dataset.tipo }));
            btnAssinar.disabled = true;
            btnAssinar.innerHTML = '<div class="ds-spinner" style="width:1em;height:1em;border-width:2px;"></div> Processando...';
            
            await executarAssinatura(itensParaAssinar);
            fecharModal();
            
            // CORREÇÃO: Passamos 'false' como terceiro argumento para não mostrar o spinner
            await atualizarDashboardCompleto(true, false); 
        };
        atualizarBotaoAssinar();
    };

    // Listener para troca de abas
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('ativo'));
            button.classList.add('ativo');
            const tabId = `tab-content-${button.dataset.tab}`;
            tabContents.forEach(content => {
                const parentScrollable = content.closest('.ds-modal-body-scrollable');
                if (parentScrollable) parentScrollable.scrollTop = 0;
                content.classList.toggle('ativo', content.id === tabId);
            });
            renderizarFooter(button.dataset.tab);
        });
    });

    // --- LÓGICA DE PREENCHIMENTO DAS LISTAS ---

    // Preenche a lista da ABA 1 (Assinar)
    const listaAssinaturaEl = document.getElementById('lista-assinaturas-pendentes');
    if (itensNaoAssinados.length > 0) {
        listaAssinaturaEl.innerHTML = itensNaoAssinados.map(item => {
            const isReportado = item.divergencia_pendente;
            const classeBloqueado = isReportado ? 'bloqueado-por-divergencia' : '';
            const tipoRegistro = item.tipo_origem === 'OP' ? 'OP' : 'AR';
            return `
                <li class="${classeBloqueado}">
                    <input type="checkbox" class="item-checkbox" value="${item.id_original}" data-tipo="${item.tipo_origem}" ${isReportado ? 'disabled' : ''}>
                    <span>
                        <strong>${item.produto} ${item.variacao ? `[${item.variacao}]` : ''}</strong>
                        <em>${isReportado ? 'Bloqueado - Aguardando análise do supervisor.' : `Qtd: ${item.quantidade} - Tipo: ${tipoRegistro} - Data: ${new Date(item.data).toLocaleDateString('pt-BR')}`}</em>
                    </span>
                </li>`;
        }).join('');
    } else {
        document.querySelector('#tab-content-assinar .ds-select-all-container').style.display = 'none';
        listaAssinaturaEl.innerHTML = `<p style="text-align:center; padding: 40px 20px;">Nenhuma pendência encontrada.</p>`;
    }

    // Preenche a lista da ABA 2 (Corrigir)
    const listaCorrecaoEl = document.getElementById('lista-itens-para-corrigir');
    if (itensNaoAssinados.length > 0) {
        listaCorrecaoEl.innerHTML = itensNaoAssinados.map((item, index) => {
            const isReportado = item.divergencia_pendente;
            const classeReportado = isReportado ? 'divergencia-reportada' : '';
            const tipoRegistro = item.tipo_origem === 'OP' ? 'OP' : 'AR';
            return `
                <li data-index="${index}" class="${classeReportado}">
                    <input type="radio" name="item-para-corrigir" id="corr-item-${index}" value="${index}" ${isReportado ? 'disabled' : ''}>
                    <label for="corr-item-${index}" style="width:100%; cursor:inherit;">
                        <span>
                            <strong>${item.produto} ${item.variacao ? `[${item.variacao}]` : ''}</strong>
                            <em>Qtd: ${item.quantidade} - Tipo: ${tipoRegistro} - Data: ${new Date(item.data).toLocaleDateString('pt-BR')}</em>
                        </span>
                    </label>
                    ${isReportado ? '<span class="aviso-divergencia"><i class="fas fa-hourglass-half"></i>Aguardando Análise</span>' : ''}
                </li>`;
        }).join('');
    } else {
        document.getElementById('tab-content-corrigir').innerHTML = `<p style="text-align:center; padding: 40px 20px;">Nenhuma pendência para corrigir.</p>`;
    }

    // --- LÓGICA DO FORMULÁRIO DE CORREÇÃO ---
    const formCorrecao = document.getElementById('formCorrecao');
    const selectTipoDivergencia = document.getElementById('select-tipo-divergencia');
    const camposProblemaContainer = document.getElementById('campos-problema-container');
    
    let itemSelecionadoParaCorrecao = null;
    listaCorrecaoEl.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li || li.classList.contains('divergencia-reportada')) {
            formCorrecao.style.display = 'none'; return;
        }
        listaCorrecaoEl.querySelectorAll('li').forEach(item => item.classList.remove('selecionado'));
        li.classList.add('selecionado');
        const radio = li.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        const selectedIndex = li.dataset.index;
        itemSelecionadoParaCorrecao = itensNaoAssinados[selectedIndex];
        formCorrecao.style.display = 'flex';
        selectTipoDivergencia.value = '';
        camposProblemaContainer.style.display = 'none';
        camposProblemaContainer.innerHTML = '';
    });

    selectTipoDivergencia.addEventListener('change', () => {
        const tipo = selectTipoDivergencia.value;
        camposProblemaContainer.style.display = 'none';
        camposProblemaContainer.innerHTML = '';
        if (!tipo || !itemSelecionadoParaCorrecao) return;
        let formHtml = '';
        if (tipo === 'Quantidade') {
            formHtml = `
                <div class="ds-info-item"><strong>Qtd. Original Lançada:</strong> ${itemSelecionadoParaCorrecao.quantidade}</div>
                <div>
                    <label for="input-qtd-correta">Qual a quantidade correta?</label>
                    <input type="number" id="input-qtd-correta" class="ds-input" required min="0">
                </div>`;
        }
        formHtml += `
            <div>
                <label for="input-obs-correcao">Observação (obrigatório):</label>
                <textarea id="input-obs-correcao" class="ds-input" rows="3" required placeholder="Descreva o problema em detalhes. Ex: A cor lançada foi 'Preto' mas a correta é 'Azul'."></textarea>
            </div>
            <button type="submit" class="ds-btn ds-btn-aviso ds-btn-texto-claro">Enviar para Correção</button>`;
        camposProblemaContainer.innerHTML = formHtml;
        camposProblemaContainer.style.display = 'flex';
    });

    formCorrecao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const radioChecked = listaCorrecaoEl.querySelector('input[type="radio"]:checked');
        if (!radioChecked || !itemSelecionadoParaCorrecao) {
            mostrarPopup('Por favor, selecione um item da lista para corrigir.', 'aviso'); return;
        }
        const btnEnviar = formCorrecao.querySelector('button[type="submit"]');
        btnEnviar.disabled = true;
        btnEnviar.innerHTML = '<div class="ds-spinner" style="width:1em;height:1em;border-width:2px;"></div> Enviando...';
        
        const payload = {
            id_registro: itemSelecionadoParaCorrecao.id_original,
            tipo_registro: itemSelecionadoParaCorrecao.tipo_origem.toLowerCase() === 'op' ? 'producao' : 'arremate',
            tipo_divergencia: selectTipoDivergencia.value,
            observacao: document.getElementById('input-obs-correcao').value,
            quantidade_original: itemSelecionadoParaCorrecao.quantidade,
            quantidade_correta_reportada: document.getElementById('input-qtd-correta')?.value || null,
        };
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/divergencias/reportar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Falha ao enviar o reporte.');
            
            mostrarPopup(data.message || 'Reporte enviado com sucesso!', 'sucesso');
            fecharModal();

            // CORREÇÃO: Passamos 'false' como segundo argumento para não mostrar o spinner
            await atualizarDashboardCompleto(true, false);

        } catch (error) {
            console.error('[formCorrecao.submit] Erro:', error);
            mostrarPopup(error.message, 'erro');
        } finally {
            btnEnviar.disabled = false;
            btnEnviar.innerHTML = 'Enviar para Correção';
        }
    });

    // --- INICIALIZAÇÃO FINAL ---
    renderizarFooter('assinar');
    requestAnimationFrame(() => overlay.classList.add('ativo'));
}

/**
 * Coleta informações sobre o dispositivo e, opcionalmente, a geolocalização.
 * @returns {Promise<object>} Uma promessa que resolve para um objeto com os dados coletados.
 */
function coletarDadosDeAssinatura() {
    return new Promise((resolve) => {
        // 1. Coleta os dados síncronos imediatamente
        const dados = {
            timestamp_iso: new Date().toISOString(),
            fuso_horario: Intl.DateTimeFormat().resolvedOptions().timeZone,
            user_agent: navigator.userAgent,
            resolucao_tela: `${window.screen.width}x${window.screen.height}`,
            geolocalizacao: null // Inicia como nulo
        };

        // 2. Tenta obter a geolocalização de forma assíncrona
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                // Callback de sucesso
                (position) => {
                    dados.geolocalizacao = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        precisao: position.coords.accuracy,
                        timestamp: new Date(position.timestamp).toISOString()
                    };
                    resolve(dados);
                },
                // Callback de erro
                (error) => {
                    console.warn('Erro ao obter geolocalização:', error.message);
                    dados.geolocalizacao = { error: error.message }; // Registra o erro
                    resolve(dados);
                },
                // Opções
                {
                    enableHighAccuracy: true, // Tenta obter a localização mais precisa possível
                    timeout: 5000,          // Tempo máximo de espera: 5 segundos
                    maximumAge: 0           // Força a obtenção de uma nova localização
                }
            );
        } else {
            // Se o navegador não suporta geolocalização
            console.warn('Geolocalização não é suportada por este navegador.');
            dados.geolocalizacao = { error: 'Não suportado pelo navegador' };
            resolve(dados);
        }
    });
}

/**
 * Envia as assinaturas para a API, incluindo os dados de evidência.
 * @param {Array} itensParaAssinar - Array de objetos {id, tipo}.
 */
async function executarAssinatura(itensParaAssinar) {
    const token = localStorage.getItem('token');
    
    // Separa os IDs por tipo
    const producoesOP = itensParaAssinar.filter(i => i.tipo === 'OP' || i.tipo === 'producao').map(i => i.id);
    const arremates = itensParaAssinar.filter(i => i.tipo === 'Arremate').map(i => i.id);

    try {
        // Coleta os dados de assinatura ANTES de qualquer chamada à API
        const dadosColetados = await coletarDadosDeAssinatura();
        const tipoUsuario = dadosDashboardCache.usuario.tipo;

        // Assinatura de Produções (Costureira ou TikTik)
        if (producoesOP.length > 0) {
            let endpoint, body;
            for (const id of producoesOP) {
                if (tipoUsuario === 'costureira') {
                    endpoint = '/api/producoes';
                    body = { id: id, assinada: true, dadosColetados: dadosColetados };
                } else if (tipoUsuario === 'tiktik') {
                    endpoint = '/api/producoes/assinar-tiktik-op';
                    body = { id_producao_op: id, dadosColetados: dadosColetados };
                } else {
                    // Caso de segurança, não deveria acontecer
                    continue;
                }

                const res = await fetch(endpoint, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(`Falha ao assinar produção ID ${id}: ${errorData.error}`);
                }
            }
        }

        // Assinatura de Arremates (TikTik)
        if (arremates.length > 0) {
            const res = await fetch('/api/arremates/assinar-lote', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    ids_arremates: arremates, 
                    dadosColetados: dadosColetados 
                })
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(`Falha ao assinar lote de arremates: ${errorData.error}`);
            }
        }
        
        mostrarPopup('Atividades assinadas com sucesso!', 'sucesso');
    } catch (error) {
        console.error('[executarAssinatura] Erro:', error);
        mostrarPopup(error.message, 'erro');
    }
}


// ==========================================================================
// LÓGICA DE CONQUISTAS E PERFIL
// ==========================================================================
/**
 * Compara conquistas da API com as salvas localmente e mostra notificações para as novas.
 * @param {Array} conquistasDaApi - Array de conquistas vindo do perfil.
 */
function verificarEnotificarNovasConquistas(conquistasDaApi) {
    if (!usuarioLogado) return; // Garante que o usuário já foi definido

    const conquistasDesbloqueadas = conquistasDaApi.filter(c => c.desbloqueada);
    const idsConquistasSalvas = new Set(JSON.parse(localStorage.getItem(`conquistasVistas_${usuarioLogado.nome}`) || '[]'));

    const novasConquistas = conquistasDesbloqueadas.filter(c => !idsConquistasSalvas.has(c.id));

    if (novasConquistas.length > 0) {
        setTimeout(() => { // Adiciona um pequeno delay para a notificação não ser tão abrupta
            const conquista = novasConquistas[0];
            mostrarPopupNotificacaoConquista(conquista);
            
            const todosOsIdsDesbloqueados = conquistasDesbloqueadas.map(c => c.id);
            localStorage.setItem(`conquistasVistas_${usuarioLogado.nome}`, JSON.stringify(todosOsIdsDesbloqueados));
        }, 1000); // Delay de 1 segundo
    } else {
        // Se não há novas conquistas, apenas garante que o localStorage está sincronizado
        const todosOsIdsDesbloqueados = conquistasDesbloqueadas.map(c => c.id);
        localStorage.setItem(`conquistasVistas_${usuarioLogado.nome}`, JSON.stringify(todosOsIdsDesbloqueados));
    }
}

/**
 * Mostra um popup customizado para uma nova conquista.
 * @param {object} conquista - O objeto da conquista.
 */
function mostrarPopupNotificacaoConquista(conquista) {
    const overlay = document.getElementById('popupGenerico');
    overlay.innerHTML = `
        <div class="ds-popup-mensagem popup-conquista">
            <img src="/img/confetti.gif" class="popup-conquista-confete" alt="">
            <img src="${conquista.badge_url}" class="popup-conquista-badge" alt="${conquista.nome}">
            <h3>Conquista Desbloqueada!</h3>
            <p>${conquista.nome}</p>
            <div class="popup-conquista-footer">
                <button id="popupBotaoCompartilhar" class="ds-btn ds-btn-primario ds-btn-texto-claro ">Compartilhar no Mural</button>
                <button id="popupBotaoFecharConquista" class="ds-btn ds-btn-secundario">Fechar</button>
            </div>
        </div>
    `;

    const fecharPopup = () => {
        overlay.classList.remove('ativo');
        // Restaura o HTML original do popup genérico para uso futuro
        overlay.innerHTML = `
            <div class="ds-popup-mensagem">
                <i id="popupIcone" class="fas ds-popup-icone"></i>
                <p id="popupMensagemTexto"></p>
                <button id="popupBotaoOk" class="ds-btn ds-btn-primario ds-btn-texto-claro">OK</button>
            </div>
        `;
    };
    
    document.getElementById('popupBotaoFecharConquista').onclick = fecharPopup;
    document.getElementById('popupBotaoCompartilhar').onclick = () => {
        compartilharConquistaNoMural(conquista);
        fecharPopup();
    };

    overlay.classList.add('ativo');
}

/**
 * Posta uma mensagem no mural sobre a nova conquista.
 * @param {object} conquista - O objeto da conquista.
 */
async function compartilharConquistaNoMural(conquista) {
    const titulo = `🎉 Nova Conquista Desbloqueada!`;
    const conteudo = `${usuarioLogado.nome} acaba de desbloquear a conquista: "${conquista.nome}"!`;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/comunicacoes', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, conteudo, tipo_post: 'Mural Geral' })
        });
        if (!response.ok) throw new Error('Falha ao compartilhar.');
        
        mostrarPopup('Compartilhado no mural com sucesso!', 'sucesso');
    } catch (error) {
        mostrarPopup(`Erro ao compartilhar: ${error.message}`, 'erro');
    }
}

/**
 * Abre o modal com detalhes de uma conquista clicada.
 * @param {object} conquista - O objeto da conquista.
 */
function abrirModalDetalhesConquista(conquista) {
    const overlay = document.getElementById('modal-detalhes-conquista');
    const container = overlay.querySelector('.ds-popup-mensagem');

    let detalhesHtml = '';
    if (conquista.desbloqueada) {
        const data = conquista.data_desbloqueio ? new Date(conquista.data_desbloqueio).toLocaleDateString('pt-BR') : 'Data não registrada';
        detalhesHtml = `<p class="detalhe-desbloqueio">🏆 Desbloqueada em: ${data}</p>`;
    } else {
        detalhesHtml = `<p class="detalhe-bloqueio">🔒 Dica: ${conquista.descricao}</p>`;
    }

    container.innerHTML = `
        <button class="ds-btn-fechar-painel-padrao" onclick="this.closest('.ds-popup-overlay').classList.remove('ativo')">X</button>
        <div class="detalhes-conquista-conteudo">
            <img src="${conquista.badge_url}" alt="${conquista.nome}">
            <h3>${conquista.nome}</h3>
            <p class="descricao">${conquista.desbloqueada ? conquista.descricao : 'Conquista Secreta'}</p>
            ${detalhesHtml}
        </div>
    `;

    overlay.classList.add('ativo');
}

// ==========================================================================
// LÓGICA DO MODAL DE GALERIA DE AVATARES
// ==========================================================================

const MAX_AVATARES = 3;

/** Abre o modal de galeria e inicia o carregamento dos avatares. */
function abrirModalGaleriaAvatar() {
    const modal = document.getElementById('modal-galeria-avatar');
    if (modal) {
        modal.classList.add('ativo');
        carregarAvataresNaGaleria();
    }
}

/** Carrega os avatares do usuário na galeria do modal. */
async function carregarAvataresNaGaleria() {
    const grid = document.getElementById('galeria-avatar-grid');
    const textoAjuda = document.getElementById('galeria-avatar-ajuda');
    const token = localStorage.getItem('token');
    grid.innerHTML = '<div class="ds-spinner-container"><div class="ds-spinner"></div></div>';

    try {
        const response = await fetch('/api/avatares', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Falha ao buscar seus avatares.');
        const avatares = await response.json();
        
        grid.innerHTML = '';
        
        avatares.forEach(avatar => {
            const slot = document.createElement('div');
            slot.className = `ds-avatar-slot ${avatar.ativo ? 'ativo' : ''}`;
            slot.innerHTML = `
                <img src="${avatar.url_blob}" alt="Avatar">
                <button class="ds-btn-excluir-avatar" title="Excluir avatar">×</button>
            `;
            grid.appendChild(slot);

            // Ação: Definir avatar como ativo
            slot.querySelector('img').onclick = () => definirAvatarAtivo(avatar.id, slot);
            
            // Ação: Excluir avatar
            slot.querySelector('.ds-btn-excluir-avatar').onclick = (e) => {
                e.stopPropagation();
                excluirAvatar(avatar.id);
            };
        });

        // Adiciona slots vazios para upload
        const slotsVazios = MAX_AVATARES - avatares.length;
        for (let i = 0; i < slotsVazios; i++) {
            const slotVazio = document.createElement('div');
            slotVazio.className = 'ds-avatar-slot ds-avatar-slot-vazio';
            slotVazio.innerHTML = '<i class="fas fa-plus"></i>';
            slotVazio.title = 'Adicionar novo avatar';
            slotVazio.onclick = () => document.getElementById('input-avatar-upload').click(); // Reutiliza o input existente
            grid.appendChild(slotVazio);
        }

        textoAjuda.textContent = avatares.length >= MAX_AVATARES 
            ? 'Limite de 3 avatares atingido. Exclua um para adicionar um novo.'
            : 'Clique em "+" para adicionar um novo avatar.';

    } catch (error) {
        grid.innerHTML = `<p style="color:red; text-align:center;">${error.message}</p>`;
    }
}

/** Define um avatar como ativo, atualiza a UI e fecha o modal. */
async function definirAvatarAtivo(avatarId, slotElement) {
    // Se estiver em modo de edição, não faz nada ao clicar na imagem
    if (document.getElementById('galeria-avatar-grid').classList.contains('em-edicao')) {
        return;
    }
    slotElement.insertAdjacentHTML('beforeend', '<div class="loading-overlay"></div>');
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`/api/avatares/definir-ativo/${avatarId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        
        // Atualiza as fotos na página principal
        document.getElementById('header-avatar-img').src = result.newAvatarUrl;
        document.getElementById('perfil-avatar-img').src = result.newAvatarUrl;

        document.getElementById('modal-galeria-avatar').classList.remove('ativo');
        mostrarPopup('Avatar atualizado com sucesso!', 'sucesso');
    } catch (error) {
        mostrarPopup(error.message, 'erro');
    } finally {
        slotElement.querySelector('.loading-overlay')?.remove();
    }
}

/** Exclui um avatar e recarrega a galeria. */
async function excluirAvatar(avatarId) {
    const confirmado = await mostrarPopupConfirmacao(
        'Tem certeza que deseja excluir este avatar? Esta ação não pode ser desfeita.',
        'aviso',          // Tipo do popup (ícone de aviso)
        'Sim, Excluir',   // Texto do botão de confirmação (vermelho)
        'Cancelar'        // Texto do botão de cancelar
    );

    if (!confirmado) {
        return; // Se o usuário clicou em "Cancelar", a função para aqui.
    }

    const token = localStorage.getItem('token');
    try {
        mostrarSpinnerGeral('Excluindo avatar...');
        const response = await fetch(`/api/avatares/${avatarId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        
        // Se a API informou que o avatar principal foi limpo, atualiza a UI para o padrão.
        if (result.avatarUrlCleared) {
            const defaultAvatar = '/img/default-avatar.png';
            document.getElementById('header-avatar-img').src = defaultAvatar;
            
            // O elemento do perfil pode não estar renderizado, então verificamos antes.
            const perfilAvatarImg = document.getElementById('perfil-avatar-img');
            if (perfilAvatarImg) perfilAvatarImg.src = defaultAvatar;
        }
        
        mostrarPopup('Avatar excluído.', 'info');
        carregarAvataresNaGaleria(); // Recarrega o modal para refletir a exclusão
    } catch (error) {
        mostrarPopup(error.message, 'erro');
    } finally {
        esconderSpinnerGeral();
    }
}

// ==========================================================================
// 10. CONFIGURAÇÃO DE EVENT LISTENERS GLOBAIS
// ==========================================================================

function configurarEventListenersGerais() {
    // Listener para o botão de Logout
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // Listener para o botão de Ação de Assinatura
    document.getElementById('btnAcaoAssinatura')?.addEventListener('click', () => {
        const naoAssinados = todasAsAtividadesRelevantes.filter(item => !item.assinada);

        if (naoAssinados.length > 0) {
            mostrarModalAssinatura(naoAssinados);
        } else {
            mostrarPopup('Você não tem nenhuma assinatura pendente. Parabéns!', 'sucesso');
        }
    });

    // Listener para o novo botão de Perfil/Avatar
    document.getElementById('btnAcaoPerfil')?.addEventListener('click', abrirPainelPerfil);

    // --- DEBUD E CORREÇÃO DA CENTRAL DE COMUNICAÇÃO ---
    const btnAcaoMural = document.getElementById('btnAcaoMural');
    const overlayComunicacoes = document.getElementById('comunicacoes-overlay');
    const btnFecharPanel = document.getElementById('fechar-painel-comunicacoes');
    const painelBody = document.getElementById('comunicacoes-painel-body');

    if (btnAcaoMural && overlayComunicacoes && btnFecharPanel && painelBody) {

        const togglePanelComunicacoes = (abrir = true) => {
            if (abrir) {
                overlayComunicacoes.classList.add('ativo');
            } else {
                overlayComunicacoes.classList.remove('ativo');
            }
        };

        btnAcaoMural.addEventListener('click', () => {
            
            // CHAMA A FUNÇÃO PARA BUSCAR OS DADOS
            atualizarCentralComunicacao();
            
            // ABRE O PAINEL
            togglePanelComunicacoes(true);
        });

        btnFecharPanel.addEventListener('click', () => togglePanelComunicacoes(false));
        
        overlayComunicacoes.addEventListener('click', (e) => {
            if (e.target === overlayComunicacoes) {
                togglePanelComunicacoes(false);
            }
        });

        painelBody.addEventListener('click', (e) => {
            // Tenta encontrar um botão de like que foi clicado
            const likeButton = e.target.closest('button[data-action="reagir"]');
            if (likeButton) {
                const idComunicacao = likeButton.dataset.id;
                processarReacao(idComunicacao, likeButton);
                return; // Encerra a função aqui, pois a ação foi de like
            }

            // --- ADICIONE ESTE BLOCO ---
            const comentariosToggle = e.target.closest('a[data-action="toggle-comentarios"]');
            if (comentariosToggle) {
                e.preventDefault();
                const card = comentariosToggle.closest('.ds-comunicado-card');
                const idComunicacao = card.dataset.id;
                const container = card.querySelector('.ds-comentarios-container');
                
                // Se o container está visível, esconde. Senão, carrega e mostra.
                if (container.style.display === 'block') {
                    container.style.display = 'none';
                } else {
                    carregarEExibirComentarios(idComunicacao, container);
                }
                return;
            }

            // Se não foi um clique no botão de like, verifica se foi no card não lido
            const cardNaoLido = e.target.closest('.ds-comunicado-card.nao-lido');
            if (cardNaoLido) {
                const idComunicacao = cardNaoLido.dataset.id;
                marcarComoLido(idComunicacao, cardNaoLido);
                return; // Encerra a função aqui
            }
        });
    } else {
        // Se algum elemento não for encontrado, este log nos dirá qual é.
        console.error("DEBUG: FALHA! Um ou mais elementos da Central de Comunicação não foram encontrados no DOM.");
    }

    const inputAvatar = document.getElementById('input-avatar-upload');
    if(inputAvatar) {
        inputAvatar.addEventListener('change', processarUploadAvatar);
    }

    // --- Listeners para o modal e painel de Ponto de Atenção / Suporte ---
    const modalPA = document.getElementById('modal-ponto-atencao');
    const btnNovoPASuporte = document.getElementById('btn-novo-ponto-atencao-suporte');
    const btnCancelarPA = document.getElementById('btn-cancelar-pa');
    const formPA = document.getElementById('form-ponto-atencao');

    // A função 'abrirModalPA' agora é chamada por qualquer botão que precise abrir o modal
    const abrirModalPA = () => {
        if (modalPA) modalPA.classList.add('ativo');
    };
    const fecharModalPA = () => {
        if (modalPA) modalPA.classList.remove('ativo');
    };

    // Verifica se todos os elementos necessários existem
    if (modalPA && btnNovoPASuporte && btnCancelarPA && formPA) {
        // O novo botão no painel de suporte abre o modal
        btnNovoPASuporte.addEventListener('click', abrirModalPA);
        
        // O botão de cancelar fecha o modal
        btnCancelarPA.addEventListener('click', fecharModalPA);
        
        // Clicar fora do conteúdo do modal também fecha
        modalPA.addEventListener('click', (e) => {
            if (e.target === modalPA) fecharModalPA();
        });

        // Lógica de submit do formulário (permanece a mesma)
        formPA.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = formPA.querySelector('button[type="submit"]');
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<div class="ds-spinner" style="width:1em;height:1em;border-width:2px;"></div> Enviando...';

            const titulo = document.getElementById('input-pa-titulo').value;
            const conteudo = document.getElementById('textarea-pa-conteudo').value;

            try {
                const token = localStorage.getItem('token');
                const response = await fetch('/api/comunicacoes', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ titulo, conteudo })
                });

                if (!response.ok) throw new Error('Falha ao enviar Ponto de Atenção.');
                
                mostrarPopup('Ponto de Atenção enviado com sucesso!', 'sucesso');
                formPA.reset();
                fecharModalPA();
                
                // Fecha o painel de suporte (se estiver aberto) e atualiza seus dados
                document.getElementById('suporte-overlay')?.classList.remove('ativo');
                await atualizarPainelSuporte();

            } catch (error) {
                mostrarPopup(error.message, 'erro');
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = 'Enviar';
            }
        });
    }

    // Listeners para Paginação do Detalhamento
    document.getElementById('btnAnterior')?.addEventListener('click', () => {
        if (paginaAtualDetalhes > 1) { // Não precisa mais verificar dadosDashboardCache
            paginaAtualDetalhes--;
            atualizarDetalhamentoAtividades();
        }
    });

    document.getElementById('btnProximo')?.addEventListener('click', () => {
        paginaAtualDetalhes++;
        atualizarDetalhamentoAtividades();
    });

    // --- Listeners para o Novo Painel de Filtros ---
    document.getElementById('btn-abrir-filtros')?.addEventListener('click', () => {
        abrirPainelFiltros();
    });

    document.getElementById('btn-fechar-filtros')?.addEventListener('click', fecharPainelFiltros);
    document.getElementById('painel-filtros-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'painel-filtros-overlay') {
            fecharPainelFiltros();
        }
    });

    // Listener para o seletor de período
    const selectPeriodo = document.getElementById('select-periodo');
    const datepickerDiaFiltro = $('#datepicker-dia-filtro');
    const datepickerSemanaFiltro = $('#datepicker-semana-filtro');

    selectPeriodo?.addEventListener('change', () => {
        const valor = selectPeriodo.value;
        datepickerDiaFiltro.hide();
        datepickerSemanaFiltro.hide();

        if (valor === 'dia-especifico') {
            datepickerDiaFiltro.show().datepicker({
                dateFormat: 'dd/mm/yy',
                onSelect: () => selectPeriodo.value = 'dia-especifico' // Mantém o select
            }).datepicker('setDate', new Date());
        } else if (valor === 'semana-especifica') {
            datepickerSemanaFiltro.show().datepicker({
                dateFormat: 'dd/mm/yy',
                onSelect: () => selectPeriodo.value = 'semana-especifica'
            }).datepicker('setDate', new Date());
        }
    });

// Listener para o botão APLICAR FILTROS
    document.getElementById('btn-aplicar-filtros')?.addEventListener('click', () => {
    // 1. Coleta todos os valores dos filtros
    filtrosAtivosDetalhes.busca = document.getElementById('input-busca-op').value.trim();
    filtrosAtivosDetalhes.periodo = document.getElementById('select-periodo').value;
    
    // Lógica especial para datas específicas
    if (filtrosAtivosDetalhes.periodo === 'dia-especifico') {
        filtrosAtivosDetalhes.dataInicio = datepickerDiaFiltro.datepicker('getDate');
        filtrosAtivosDetalhes.dataFim = datepickerDiaFiltro.datepicker('getDate');
    } else if (filtrosAtivosDetalhes.periodo === 'semana-especifica') {
        const dataSelecionada = datepickerSemanaFiltro.datepicker('getDate');
        if (dataSelecionada) {
            const inicioSemana = new Date(dataSelecionada);
            inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
            const fimSemana = new Date(inicioSemana);
            fimSemana.setDate(fimSemana.getDate() + 6);
            filtrosAtivosDetalhes.dataInicio = inicioSemana;
            filtrosAtivosDetalhes.dataFim = fimSemana;
        }
    } else {
        filtrosAtivosDetalhes.dataInicio = null;
        filtrosAtivosDetalhes.dataFim = null;
    }
    
    // 2. Reseta a paginação e atualiza a lista
    paginaAtualDetalhes = 1;
    atualizarDetalhamentoAtividades(); // Agora sem parâmetros, pois usará as variáveis globais

    // 3. Fecha o painel
    fecharPainelFiltros();
    });

    // Listener para o botão LIMPAR FILTROS
    document.getElementById('btn-limpar-filtros')?.addEventListener('click', () => {
        // Reseta o objeto de filtros para o estado inicial
        filtrosAtivosDetalhes = {
            busca: '',
            periodo: 'hoje',
            dataInicio: null,
            dataFim: null
        };
        // Limpa os campos do formulário
        document.getElementById('input-busca-op').value = '';
        document.getElementById('select-periodo').value = 'hoje';
        datepickerDiaFiltro.hide();
        datepickerSemanaFiltro.hide();

        // Atualiza a lista com os filtros resetados
        paginaAtualDetalhes = 1;
        atualizarDetalhamentoAtividades();
        fecharPainelFiltros();
    });

    // --- Painel de Suporte ---
    const btnAcaoSuporte = document.getElementById('btnAcaoSuporte');
    const overlaySuporte = document.getElementById('suporte-overlay');
    const btnFecharPanelSuporte = document.getElementById('fechar-painel-suporte');

    if (btnAcaoSuporte && overlaySuporte && btnFecharPanelSuporte) {
        const togglePanelSuporte = (abrir = true) => {
            if (abrir) {
                atualizarPainelSuporte(); // Carrega os dados ao abrir
                overlaySuporte.classList.add('ativo');
            } else {
                overlaySuporte.classList.remove('ativo');
            }
        };

        btnAcaoSuporte.addEventListener('click', () => togglePanelSuporte(true));
        btnFecharPanelSuporte.addEventListener('click', () => togglePanelSuporte(false));
        overlaySuporte.addEventListener('click', (e) => {
            if (e.target === overlaySuporte) {
                togglePanelSuporte(false);
            }
        });
    }

    // Listener para o botão de gerenciar avatares no modal
    const btnGerenciar = document.getElementById('btn-gerenciar-avatares');
    const galeriaGrid = document.getElementById('galeria-avatar-grid');

    if (btnGerenciar && galeriaGrid) {
        btnGerenciar.addEventListener('click', () => {
            const emEdicao = galeriaGrid.classList.toggle('em-edicao');
            if (emEdicao) {
                btnGerenciar.textContent = 'Concluir';
                btnGerenciar.classList.replace('ds-btn-secundario', 'ds-btn-primario');
            } else {
                btnGerenciar.textContent = 'Gerenciar';
                btnGerenciar.classList.replace('ds-btn-primario', 'ds-btn-secundario');
            }
        });
    }
}
