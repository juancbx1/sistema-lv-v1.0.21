// public/dashboard/dashboard.js

// ==========================================================================
// 1. IMPORTS DE MÓDULOS E UTILITÁRIOS
// ==========================================================================
import { verificarAutenticacao, logout } from '/js/utils/auth.js';
import { criarGrafico } from '/js/utils/chart-utils.js';
import { obterMetas, calcularComissaoSemanal } from '/js/utils/metas.js'; // Usando o novo utilitário de metas unificado
import { getObjetoCicloCompletoAtual } from '/js/utils/ciclos.js';
import { formatarData } from '/js/utils/date-utils.js';

// ==========================================================================
// 2. VARIÁVEIS GLOBAIS E ESTADO DA APLICAÇÃO
// ==========================================================================

// Dados do Usuário e da API
let usuarioLogado = null;
let dadosDashboardCache = null; // Armazenará a resposta completa da API /api/dashboard/desempenho

// Controle de UI e Filtros
let filtroAtivo = 'dia'; // 'dia' ou 'semana'
let dataSelecionadaDia = new Date();
let dataSelecionadaSemana = new Date();
let paginaAtualDetalhes = 1;
const ITENS_POR_PAGINA_DETALHES = 8;

// Controle do Carrossel de Ciclo
let indiceSlideAtualCiclo = 0;
let totalSlidesCiclo = 0;
let slidesCicloElements = [];
let isDraggingCiclo = false;
let startPosXCiclo = 0;
let currentTranslateCiclo = 0;
let prevTranslateCiclo = 0;
let animationIDCiclo = 0;

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

    console.log('[carregarDadosDashboard] Buscando novos dados da API...');
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
        console.log('[carregarDadosDashboard] Dados recebidos e cacheados:', dadosDashboardCache);
        return dadosDashboardCache;
    } catch (error) {
        console.error('[carregarDadosDashboard] Erro:', error.message);
        mostrarPopup('Erro ao carregar seus dados. Por favor, tente recarregar a página.', 'erro');
        return null; // Retorna nulo para que as funções chamadoras saibam do erro.
    }
}

/**
 * Função principal que orquestra a atualização de todos os componentes da UI.
 */
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

        const { usuario, desempenho } = dados;
        const todasAsAtividades = desempenho.atividades || [];

        atualizarSaudacaoEInfoUsuario(usuario);
        atualizarCardMeta(todasAsAtividades, usuario);
        atualizarGraficoProducao(todasAsAtividades);
        await atualizarCardAndamentoCiclo(usuario, todasAsAtividades);
        atualizarBotaoAcaoAssinatura(todasAsAtividades);
        
        // CORREÇÃO: Colocamos a chamada de volta aqui
        await atualizarCentralComunicacao(false); // Passamos 'false' para não mostrar o spinner interno
        
        atualizarDetalhamentoAtividades(todasAsAtividades);

    } catch (error) {
        console.error('[atualizarDashboardCompleto] Erro inesperado ao atualizar a UI:', error);
        mostrarPopup('Ocorreu um erro ao exibir os dados do dashboard.', 'erro');
    } finally {
        if (mostrarSpinner) {
            esconderSpinnerGeral();
        }
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

// ==========================================================================
// 6. FUNÇÕES DE ATUALIZAÇÃO DA UI - CARDS SUPERIORES
// ==========================================================================

/**
 * Atualiza a saudação e as informações do usuário no cabeçalho.
 * @param {object} usuario - O objeto do usuário vindo da API.
 */
function atualizarSaudacaoEInfoUsuario(usuario) {
    const saudacaoEl = document.getElementById('saudacaoUsuario');
    // APENAS um conjunto de elementos para o nível, agora na Action Bar
    const nivelContainerEl = document.getElementById('nivelUsuarioContainer');
    const nivelValorEl = document.getElementById('nivelValor');

    if (!saudacaoEl || !nivelContainerEl || !nivelValorEl) {
        console.error("Elementos do cabeçalho ou de nível não encontrados.");
        return;
    }

    const hora = new Date().getHours();
    let saudacao;
    if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
    else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';
    
    saudacaoEl.textContent = `${saudacao}, ${usuario.nome}!`;

    // Lógica simplificada: só controla um elemento
    if (usuario.nivel) {
        nivelValorEl.textContent = usuario.nivel;
        nivelContainerEl.style.display = 'flex';
    } else {
        nivelContainerEl.style.display = 'none';
    }
}


/**
 * Atualiza o card de metas, incluindo a barra de progresso e a comissão.
 * @param {Array} todasAsAtividades - A lista completa de atividades do usuário.
 * @param {object} usuario - O objeto do usuário (para obter tipo e nível).
 */
function atualizarCardMeta(todasAsAtividades, usuario) {
    const metaSelectEl = document.getElementById('metaSelect');
    const progressoBarraEl = document.getElementById('progressoBarra');
    const pontosFeitosEl = document.getElementById('pontosFeitos');
    const pontosFaltantesEl = document.getElementById('pontosFaltantes');
    const comissaoGarantidaEl = document.getElementById('comissaoGarantida');
    const valorComissaoEl = document.getElementById('valorComissao');
    const semMetaBatidaEl = document.getElementById('semMetaBatida');

    // 1. Obter as metas disponíveis
    const metasDoNivel = obterMetas(usuario.tipo, usuario.nivel);
    
    if (!metasDoNivel || metasDoNivel.length === 0) {
        metaSelectEl.innerHTML = '<option value="">Nenhuma meta configurada</option>';
        metaSelectEl.disabled = true;
        document.getElementById('editarMetaBtn').style.display = 'none';
        progressoBarraEl.style.width = '0%';
        pontosFeitosEl.textContent = '0';
        comissaoGarantidaEl.style.display = 'none';
        if(semMetaBatidaEl) semMetaBatidaEl.style.display = 'none';
        
        // Atualiza o status box para o estado "sem meta"
        pontosFaltantesEl.className = 'ds-meta-status-box status-sem-meta';
        pontosFaltantesEl.innerHTML = `
            <i class="fas fa-info-circle ds-status-icon"></i>
            <span class="ds-status-texto">Não há metas configuradas para seu nível.</span>
        `;
        return;
    } else {
        document.getElementById('editarMetaBtn').style.display = 'inline-flex';
    }

    // 2. Obter meta selecionada
    const pontosMetaSalva = localStorage.getItem(`metaSelecionada_${usuario.nome}`);
    let metaSelecionada = metasDoNivel.find(m => m.pontos_meta == pontosMetaSalva);
    if (!metaSelecionada) {
        metaSelecionada = metasDoNivel[0];
        if (pontosMetaSalva) {
            localStorage.setItem(`metaSelecionada_${usuario.nome}`, metaSelecionada.pontos_meta);
        }
    }
    
    // 3. Calcular pontos da semana
    const cicloInfo = getObjetoCicloCompletoAtual(new Date());
    let totalPontosSemana = 0;
    if (cicloInfo && cicloInfo.semana) {
        const atividadesDaSemana = todasAsAtividades.filter(item => {
            const dataItem = new Date(item.data);
            return dataItem >= cicloInfo.semana.inicio && dataItem <= cicloInfo.semana.fim;
        });
        totalPontosSemana = atividadesDaSemana.reduce((acc, item) => acc + (parseFloat(item.pontos_gerados) || 0), 0);
    } else {
        console.warn("Nenhum ciclo/semana ativa encontrada para o cálculo de metas.");
    }

    // 4. Atualizar UI de progresso e select
    metaSelectEl.innerHTML = metasDoNivel.map(m => `
        <option value="${m.pontos_meta}" ${m.pontos_meta === metaSelecionada.pontos_meta ? 'selected' : ''}>
            ${m.descricao || 'Meta'}: ${m.pontos_meta} Pontos (R$ ${m.valor.toFixed(2)})
        </option>
    `).join('');
    metaSelectEl.disabled = true;

    const pontosMetaAlvo = metaSelecionada.pontos_meta;
    const progressoPercentual = pontosMetaAlvo > 0 ? (totalPontosSemana / pontosMetaAlvo) * 100 : 0;
    
    progressoBarraEl.style.width = `${Math.min(progressoPercentual, 100)}%`;
    pontosFeitosEl.textContent = Math.round(totalPontosSemana);
    
    // Lógica para o novo Status Box
    const pontosQueFaltam = pontosMetaAlvo - totalPontosSemana;

    if (pontosMetaAlvo > 0) {
        if (pontosQueFaltam > 0) {
            pontosFaltantesEl.className = 'ds-meta-status-box status-progresso';
            pontosFaltantesEl.innerHTML = `
                <i class="fas fa-flag-checkered ds-status-icon"></i>
                <span class="ds-status-texto">Faltam <strong class="highlight">${Math.ceil(pontosQueFaltam)}</strong> pontos para a meta!</span>
            `;
        } else {
            pontosFaltantesEl.className = 'ds-meta-status-box status-concluido';
            pontosFaltantesEl.innerHTML = `
                <i class="fas fa-check-circle ds-status-icon"></i>
                <span class="ds-status-texto">Parabéns, meta atingida!</span>
            `;
        }
    } else {
        pontosFaltantesEl.className = 'ds-meta-status-box status-sem-meta';
        pontosFaltantesEl.innerHTML = `
            <i class="fas fa-info-circle ds-status-icon"></i>
            <span class="ds-status-texto">Selecione uma meta para ver seu progresso.</span>
        `;
    }

    // 5. Atualizar UI da comissão
    const resultadoComissao = calcularComissaoSemanal(totalPontosSemana, usuario.tipo, usuario.nivel);
    comissaoGarantidaEl.style.display = 'none';
    if(semMetaBatidaEl) semMetaBatidaEl.style.display = 'none';
    if (typeof resultadoComissao === 'number' && resultadoComissao > 0) {
        valorComissaoEl.textContent = `R$ ${resultadoComissao.toFixed(2)}`;
        comissaoGarantidaEl.style.display = 'block';
    }
}



/**
 * Atualiza o gráfico de produção por hora do dia.
 * @param {Array} atividadesDaSemana - Array de atividades (produções e arremates).
 */
function atualizarGraficoProducao(atividadesDaSemana) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const producoesHoje = atividadesDaSemana.filter(item => {
        const dataItem = new Date(item.data);
        dataItem.setHours(0, 0, 0, 0);
        return dataItem.getTime() === hoje.getTime();
    });

    const horas = Array(24).fill(0);
    producoesHoje.forEach(item => {
        const hora = new Date(item.data).getHours();
        // O gráfico exibirá os PONTOS gerados por hora
        horas[hora] += (parseFloat(item.pontos_gerados) || 0);
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
    
    const ctx = document.getElementById('graficoProducaoDia').getContext('2d');
    if (window.graficoProducao) {
        window.graficoProducao.destroy();
    }
    
    ctx.canvas.style.width = '100%';
    ctx.canvas.style.height = 'auto';

    window.graficoProducao = criarGrafico(
        ctx,
        'line',
        labels,
        'Pontos Gerados por Hora',
        horas,
        ['rgba(var(--ds-cor-primaria-rgb), 0.2)'], // areaStyle
        ['rgba(var(--ds-cor-primaria-rgb), 1)']    // lineStyle
    );
}

// ==========================================================================
// 7. FUNÇÕES DE ATUALIZAÇÃO DA UI - CARROSSEL E ASSINATURAS
// ==========================================================================

/**
 * Atualiza o card de andamento do ciclo com um carrossel das semanas.
 * @param {object} usuario - O objeto do usuário logado.
 * @param {Array} atividadesDaSemana - Lista de atividades da semana atual para referência.
 */
async function atualizarCardAndamentoCiclo(usuario, atividadesDaSemana) {
    const tituloEl = document.getElementById('tituloAndamentoCiclo');
    const viewportEl = document.getElementById('cicloCarrosselViewport');
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    const indicadoresContainerEl = document.getElementById('cicloCarrosselIndicadores');
    const carregandoMsgEl = document.getElementById('cicloCarregandoMsg');

    // Reset do estado do carrossel
    sliderEl.innerHTML = '';
    indicadoresContainerEl.innerHTML = '';
    slidesCicloElements = [];
    indiceSlideAtualCiclo = 0;
    totalSlidesCiclo = 0;
    carregandoMsgEl.style.display = 'block';
    viewportEl.style.display = 'none';

    const cicloCompletoAtual = getObjetoCicloCompletoAtual(new Date());

    if (!cicloCompletoAtual || !cicloCompletoAtual.semanas || cicloCompletoAtual.semanas.length === 0) {
        tituloEl.textContent = 'Nenhum ciclo ativo no momento.';
        carregandoMsgEl.textContent = 'Fique de olho para o início do próximo ciclo.';
        return;
    }

    carregandoMsgEl.style.display = 'none';
    viewportEl.style.display = 'block';

    tituloEl.textContent = `Sua Jornada no ${cicloCompletoAtual.nome || "Ciclo Atual"}`;
    totalSlidesCiclo = cicloCompletoAtual.semanas.length;

    // Para evitar múltiplas chamadas à API, vamos buscar todas as atividades do usuário de uma vez
    // e depois filtrar por semana no frontend.
    // Usamos o cache se disponível, ou fazemos uma nova chamada.
    const todosDados = await carregarDadosDashboard(false); // false = usar cache se possível
    const todasAtividadesUsuario = todosDados ? todosDados.desempenho.atividades : [];


    const dataReferenciaHoje = new Date();
    const hojeParaComparacao = new Date(dataReferenciaHoje.getFullYear(), dataReferenciaHoje.getMonth(), dataReferenciaHoje.getDate());
    let semanaAtualEncontradaIndice = -1;

    cicloCompletoAtual.semanas.forEach((semana, index) => {
        const inicioSemanaDate = new Date(semana.inicio + 'T00:00:00-03:00');
        const fimSemanaDate = new Date(semana.fim + 'T23:59:59-03:00');

        // Filtra as atividades TOTAIS do usuário para esta semana específica do loop
        const atividadesDaSemanaDoLoop = todasAtividadesUsuario.filter(item => {
            const dataItem = new Date(item.data);
            return dataItem >= inicioSemanaDate && dataItem <= fimSemanaDate;
        });
        
        const totalPontosSemana = atividadesDaSemanaDoLoop.reduce((sum, item) => sum + (parseFloat(item.pontos_gerados) || 0), 0);

        const isSemanaAtual = hojeParaComparacao >= inicioSemanaDate && hojeParaComparacao <= fimSemanaDate;
        if (isSemanaAtual) semanaAtualEncontradaIndice = index;
        
        // Cria o slide
        const slideDiv = document.createElement('div');
        slideDiv.className = 'ds-carrossel-ciclo-slide';
        const conteudoSlideDiv = document.createElement('div');
        conteudoSlideDiv.className = 'ds-slide-conteudo';
        if (isSemanaAtual) conteudoSlideDiv.classList.add('semana-atual-destaque');

        conteudoSlideDiv.innerHTML = `
            <p class="ds-slide-numero-semana">Semana ${index + 1}</p>
            <p class="ds-slide-datas">(${formatarData(semana.inicio)} - ${formatarData(semana.fim)})</p>
            <p class="ds-slide-pontos">
                <span class="ds-pontos-valor">${Math.round(totalPontosSemana)}</span> 
                ${Math.round(totalPontosSemana) === 1 ? 'Ponto' : 'Pontos'}
            </p>
        `;
        slideDiv.appendChild(conteudoSlideDiv);
        sliderEl.appendChild(slideDiv);
        slidesCicloElements.push(slideDiv);

        // Cria o indicador (bolinha)
        const bolinha = document.createElement('div');
        bolinha.className = 'ds-indicador-bolinha';
        bolinha.dataset.indice = index;
        bolinha.addEventListener('click', () => irParaSlideCiclo(index));
        indicadoresContainerEl.appendChild(bolinha);
    });

    indiceSlideAtualCiclo = (semanaAtualEncontradaIndice !== -1) ? semanaAtualEncontradaIndice : 0;
    atualizarVisualizacaoCarrosselCiclo();
}

/**
 * Funções de controle do carrossel (movimento, estado visual, swipe).
 */
function moverCarrosselCiclo(direcao) {
    const novoIndice = indiceSlideAtualCiclo + direcao;
    if (novoIndice >= 0 && novoIndice < totalSlidesCiclo) {
        irParaSlideCiclo(novoIndice);
    }
}
function irParaSlideCiclo(indice) {
    indiceSlideAtualCiclo = indice;
    atualizarVisualizacaoCarrosselCiclo();
}
function atualizarVisualizacaoCarrosselCiclo() {
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    const prevBtn = document.getElementById('cicloCarrosselPrev');
    const nextBtn = document.getElementById('cicloCarrosselNext');
    const indicadoresContainerEl = document.getElementById('cicloCarrosselIndicadores');

    if (!sliderEl || !prevBtn || !nextBtn || !indicadoresContainerEl) return;

    const deslocamento = -indiceSlideAtualCiclo * 100;
    sliderEl.style.transform = `translateX(${deslocamento}%)`;
    
    // Atualiza o estado dos botões e indicadores
    prevBtn.disabled = indiceSlideAtualCiclo === 0;
    nextBtn.disabled = indiceSlideAtualCiclo === totalSlidesCiclo - 1;
    
    const bolinhas = indicadoresContainerEl.querySelectorAll('.ds-indicador-bolinha');
    bolinhas.forEach((bolinha, idx) => {
        bolinha.classList.toggle('ativo', idx === indiceSlideAtualCiclo);
    });
}

// Funções de swipe para o carrossel
function inicializarSwipeCarrossel() {
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    if (!sliderEl) return;
    sliderEl.addEventListener('mousedown', dragStartCiclo);
    sliderEl.addEventListener('touchstart', dragStartCiclo, { passive: true });
    sliderEl.addEventListener('mouseup', dragEndCiclo);
    sliderEl.addEventListener('mouseleave', dragEndCiclo);
    sliderEl.addEventListener('touchend', dragEndCiclo);
    sliderEl.addEventListener('mousemove', dragActionCiclo);
    sliderEl.addEventListener('touchmove', dragActionCiclo, { passive: true });
    sliderEl.ondragstart = () => false;
}
function dragStartCiclo(event) {
    isDraggingCiclo = true;
    startPosXCiclo = event.type === 'touchstart' ? event.touches[0].clientX : event.clientX;
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    sliderEl.classList.add('dragging');
    prevTranslateCiclo = -indiceSlideAtualCiclo * sliderEl.offsetWidth;
    animationIDCiclo = requestAnimationFrame(animationCiclo);
}
function dragActionCiclo(event) {
    if (!isDraggingCiclo) return;
    const currentX = event.type === 'touchmove' ? event.touches[0].clientX : event.clientX;
    currentTranslateCiclo = prevTranslateCiclo + (currentX - startPosXCiclo);
}
function animationCiclo() {
    if (!isDraggingCiclo) return;
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    sliderEl.style.transform = `translateX(${currentTranslateCiclo}px)`;
    requestAnimationFrame(animationCiclo);
}
function dragEndCiclo() {
    if (!isDraggingCiclo) return;
    isDraggingCiclo = false;
    cancelAnimationFrame(animationIDCiclo);
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    const movedBy = currentTranslateCiclo - prevTranslateCiclo;
    if (Math.abs(movedBy) > sliderEl.offsetWidth * 0.2) {
        if (movedBy < 0) moverCarrosselCiclo(1);
        else moverCarrosselCiclo(-1);
    } else {
        irParaSlideCiclo(indiceSlideAtualCiclo); // Snap back
    }
    sliderEl.classList.remove('dragging');
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
 * Busca os comunicados da API e atualiza o painel lateral e o badge de notificações.
 * @param {boolean} [mostrarSpinnerNoPainel=true] - Se false, não exibe o spinner dentro do painel.
 */
async function atualizarCentralComunicacao(mostrarSpinnerNoPainel = true) {
    const badgeMural = document.getElementById('badgeMural');
    const painelBody = document.getElementById('comunicacoes-panel-body');

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
        
        const naoLidos = comunicados.filter(c => c && !c.lido).length;
        if (naoLidos > 0) {
            badgeMural.textContent = naoLidos;
            badgeMural.style.display = 'flex';
        } else {
            badgeMural.style.display = 'none';
        }

        // A renderização do painel só acontece se o spinner foi mostrado.
        // Isso evita que o conteúdo seja renderizado duas vezes desnecessariamente no carregamento inicial.
        if (mostrarSpinnerNoPainel) {
            if (comunicados.length === 0) {
                painelBody.innerHTML = '<p style="text-align:center; padding: 20px;">Nenhuma comunicação no momento.</p>';
            } else {
                painelBody.innerHTML = comunicados.map(c => {
                    if (!c || !c.tipo_post) {
                        console.warn("Recebido um comunicado inválido ou sem tipo:", c);
                        return '';
                    }
                    
                    const tipoClasse = `tipo-${c.tipo_post.replace(/\s+/g, '-')}`;
                    const lidoClasse = c.lido ? '' : 'nao-lido';
                    const dataFormatada = new Date(c.data_criacao).toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'});

                    let footerHtml = '';
                    if (c.tipo_post === 'Mural Geral') {
                        const classeReagido = c.usuario_curtiu ? 'reagido' : '';
                        footerHtml = `
                            <div class="ds-comunicado-card-footer">
                                <button class="ds-like-btn ${classeReagido}" data-action="reagir" data-id="${c.id}">
                                    <i class="fas fa-thumbs-up"></i>
                                    <span>Curtir</span>
                                </button>
                                <span class="ds-like-count">${c.total_likes > 0 ? c.total_likes : ''}</span>
                            </div>
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
                            ${footerHtml}
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Erro ao atualizar central de comunicação:', error);
        // Se a chamada silenciosa falhar, não mostramos um erro na tela, apenas no console.
        if (mostrarSpinnerNoPainel) {
            painelBody.innerHTML = '<p style="text-align:center; padding: 20px; color: red;">Erro ao carregar comunicações.</p>';
        }
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


// ==========================================================================
// 8. FUNÇÕES DE ATUALIZAÇÃO DA UI - DETALHAMENTO E PAGINAÇÃO
// ==========================================================================

/**
 * Atualiza a seção de detalhamento de atividades, filtrando e paginando os resultados.
 * @param {Array} todasAtividades - A lista completa de atividades do usuário.
 */
function atualizarDetalhamentoAtividades(todasAtividades) {
    const totalAtividadesEl = document.getElementById('totalAtividades');
    const listaAtividadesEl = document.getElementById('listaAtividades');
    const paginacaoContainerEl = document.getElementById('paginacaoContainer');

    function filtrarItensAtuais() {
        const normalizarData = (data) => new Date(data.getFullYear(), data.getMonth(), data.getDate());
        
        if (filtroAtivo === 'dia') {
            const diaFiltrar = normalizarData(dataSelecionadaDia);
            return todasAtividades.filter(item => normalizarData(new Date(item.data)).getTime() === diaFiltrar.getTime());
        } else { // filtroAtivo === 'semana'
            const inicioSemana = normalizarData(new Date(dataSelecionadaSemana));
            inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
            const fimSemana = new Date(inicioSemana);
            fimSemana.setDate(fimSemana.getDate() + 6);
            return todasAtividades.filter(item => {
                const dataItem = normalizarData(new Date(item.data));
                return dataItem >= inicioSemana && dataItem <= fimSemana;
            });
        }
    }

    const atividadesFiltradas = filtrarItensAtuais();
    const totalPaginas = Math.ceil(atividadesFiltradas.length / ITENS_POR_PAGINA_DETALHES);
    paginaAtualDetalhes = Math.min(paginaAtualDetalhes, totalPaginas) || 1;

    const inicio = (paginaAtualDetalhes - 1) * ITENS_POR_PAGINA_DETALHES;
    const fim = inicio + ITENS_POR_PAGINA_DETALHES;
    const atividadesDaPagina = atividadesFiltradas.slice(inicio, fim);

    // Renderiza a lista
    listaAtividadesEl.innerHTML = '';
    if (atividadesDaPagina.length === 0) {
        listaAtividadesEl.innerHTML = '<li>Nenhuma atividade encontrada para o período selecionado.</li>';
    } else {
        atividadesDaPagina.forEach(item => {
            const tipoLabel = item.tipo_origem === 'OP' 
                ? `OP ${item.op_numero} (${item.processo})` 
                : `Arremate OP ${item.op_numero}`;
            
            const itemHTML = `
                <div class="ds-atividade-item">
                    <p><strong>Produto:</strong> ${item.produto} ${item.variacao ? `[${item.variacao}]` : ''}</p>
                    <p><strong>Tipo/Processo:</strong> ${tipoLabel}</p>
                    <p><strong>Quantidade:</strong> ${item.quantidade || 0}</p>
                    <p><strong>Hora:</strong> ${new Date(item.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p><strong>Pontos:</strong> ${(parseFloat(item.pontos_gerados) || 0).toFixed(2)}</p>
                    <p><strong>Status:</strong> ${item.assinada ? '<span style="color:var(--ds-cor-sucesso);">Assinado</span>' : '<span style="color:var(--ds-cor-perigo);">Pendente</span>'}</p>
                </div>
            `;
            listaAtividadesEl.innerHTML += itemHTML;
        });
    }

    // Atualiza o total
    const totalQuantidade = atividadesFiltradas.reduce((acc, item) => acc + (item.quantidade || 0), 0);
    totalAtividadesEl.textContent = `TOTAL DE ATIVIDADES (QTD): ${totalQuantidade}`;

    // Renderiza a paginação
    renderizarPaginacaoDetalhes(totalPaginas);
    paginacaoContainerEl.classList.toggle('visivel', totalPaginas > 1);
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
            // Chama a função principal de renderização, que já tem acesso ao cache
            atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
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
                <button class="ds-btn-fechar-modal" title="Fechar">X</button>
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
    overlay.querySelector('.ds-btn-fechar-modal').onclick = fecharModal;
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
            btnAssinar.className = 'ds-btn ds-btn-sucesso';
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
            <button type="submit" class="ds-btn ds-btn-aviso">Enviar para Correção</button>`;
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
// 10. CONFIGURAÇÃO DE EVENT LISTENERS GLOBAIS
// ==========================================================================

function configurarEventListenersGerais() {
    console.log("DEBUG: Configurando todos os Event Listeners...");

    // Listener para o botão de Logout
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // Listener para o botão de Editar/Salvar Meta
    document.getElementById('editarMetaBtn')?.addEventListener('click', () => {
        const metaSelectEl = document.getElementById('metaSelect');
        const editarMetaBtnEl = document.getElementById('editarMetaBtn');
        if (!metaSelectEl || !editarMetaBtnEl || !usuarioLogado) return;
        if (metaSelectEl.disabled) {
            metaSelectEl.disabled = false;
            editarMetaBtnEl.innerHTML = '<i class="fas fa-save"></i> Confirmar';
            metaSelectEl.focus();
        } else {
            metaSelectEl.disabled = true;
            editarMetaBtnEl.innerHTML = '<i class="fas fa-edit"></i> Editar Meta';
            const novaMetaPontos = metaSelectEl.value;
            localStorage.setItem(`metaSelecionada_${usuarioLogado.nome}`, novaMetaPontos);
            if (dadosDashboardCache) {
                atualizarCardMeta(dadosDashboardCache.desempenho.atividades, dadosDashboardCache.usuario);
            }
            mostrarPopup('Sua meta foi atualizada!', 'sucesso');
        }
    });

    // Listener para o botão de Ação de Assinatura
    document.getElementById('btnAcaoAssinatura')?.addEventListener('click', () => {
        const naoAssinados = dadosDashboardCache?.desempenho?.atividades.filter(item => !item.assinada) || [];
        if (naoAssinados.length > 0) {
            mostrarModalAssinatura(naoAssinados);
        } else {
            mostrarPopup('Você não tem nenhuma assinatura pendente. Parabéns!', 'sucesso');
        }
    });

    // --- DEBUD E CORREÇÃO DA CENTRAL DE COMUNICAÇÃO ---
    console.log("DEBUG: Procurando elementos da Central de Comunicação...");
    const btnAcaoMural = document.getElementById('btnAcaoMural');
    const overlayComunicacoes = document.getElementById('comunicacoes-overlay');
    const btnFecharPanel = document.getElementById('fechar-panel-comunicacoes');
    const painelBody = document.getElementById('comunicacoes-panel-body');

    if (btnAcaoMural && overlayComunicacoes && btnFecharPanel && painelBody) {
        console.log("DEBUG: Elementos da Central de Comunicação ENCONTRADOS. Adicionando listeners...");

        const togglePanelComunicacoes = (abrir = true) => {
            console.log(`DEBUG: togglePanelComunicacoes chamado com abrir = ${abrir}`);
            if (abrir) {
                overlayComunicacoes.classList.add('ativo');
            } else {
                overlayComunicacoes.classList.remove('ativo');
            }
        };

        btnAcaoMural.addEventListener('click', () => {
            console.log("DEBUG: Botão do Mural (megafone) clicado!");
            
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
        console.log({btnAcaoMural, overlayComunicacoes, btnFecharPanel, painelBody});
    }

    // --- Listeners para o modal de Ponto de Atenção ---
    // (O resto do código desta seção permanece o mesmo)
    const modalPA = document.getElementById('modal-ponto-atencao');
    const btnNovoPA = document.getElementById('btn-novo-ponto-atencao');
    const btnCancelarPA = document.getElementById('btn-cancelar-pa');
    const formPA = document.getElementById('form-ponto-atencao');

    const fecharModalPA = () => modalPA.classList.remove('ativo');
    const abrirModalPA = () => modalPA.classList.add('ativo');

    if (modalPA && btnNovoPA && btnCancelarPA && formPA) {
        btnNovoPA.addEventListener('click', abrirModalPA);
        btnCancelarPA.addEventListener('click', fecharModalPA);
        modalPA.addEventListener('click', (e) => {
            if (e.target === modalPA) fecharModalPA();
        });

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
                togglePanelComunicacoes(false);
                await atualizarCentralComunicacao();

            } catch (error) {
                mostrarPopup(error.message, 'erro');
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = 'Enviar';
            }
        });
    }

    // Configuração dos Filtros de Data com jQuery Datepicker
    const datepickerDiaEl = $('#datepickerDia');
    if (datepickerDiaEl.length) {
        datepickerDiaEl.datepicker({
            dateFormat: 'dd/mm/yy',
            onSelect: (dateText) => {
                dataSelecionadaDia = datepickerDiaEl.datepicker('getDate');
                filtroAtivo = 'dia';
                paginaAtualDetalhes = 1;
                document.getElementById('filtroDia').classList.add('active');
                document.getElementById('filtroSemana').classList.remove('active');
                if (dadosDashboardCache) {
                    atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
                }
            }
        }).datepicker('setDate', dataSelecionadaDia);
    }
    
    const datepickerSemanaEl = $('#datepickerSemana');
    if (datepickerSemanaEl.length) {
        datepickerSemanaEl.datepicker({
            dateFormat: 'dd/mm/yy',
            onSelect: (dateText) => {
                dataSelecionadaSemana = datepickerSemanaEl.datepicker('getDate');
                if (dataSelecionadaSemana) {
                    $('#datepickerSemanaDisplay').text(`${formatarData(dataSelecionadaSemana, 'inicioSemana')} - ${formatarData(dataSelecionadaSemana, 'fimSemana')}`);
                }
                filtroAtivo = 'semana';
                paginaAtualDetalhes = 1;
                document.getElementById('filtroSemana').classList.add('active');
                document.getElementById('filtroDia').classList.remove('active');
                if (dadosDashboardCache) {
                    atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
                }
            }
        });
        if (dadosDashboardCache && dadosDashboardCache.periodo) {
            dataSelecionadaSemana = new Date(dadosDashboardCache.periodo.inicio);
            $('#datepickerSemanaDisplay').text(`${formatarData(dataSelecionadaSemana, 'inicioSemana')} - ${formatarData(dataSelecionadaSemana, 'fimSemana')}`);
        } else {
            $('#datepickerSemanaDisplay').text('Nenhuma semana selecionada');
        }
        $('#datepickerSemanaDisplay').on('click', () => datepickerSemanaEl.datepicker('show'));
    }
    
    // Listeners para os textos de filtro (Dia/Semana)
    document.getElementById('filtroDia')?.addEventListener('click', () => {
        if (filtroAtivo === 'dia') return;
        filtroAtivo = 'dia';
        paginaAtualDetalhes = 1;
        document.getElementById('filtroDia').classList.add('active');
        document.getElementById('filtroSemana').classList.remove('active');
        if (dadosDashboardCache) {
            atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
        }
    });

    document.getElementById('filtroSemana')?.addEventListener('click', () => {
        if (filtroAtivo === 'semana') return;
        filtroAtivo = 'semana';
        paginaAtualDetalhes = 1;
        document.getElementById('filtroSemana').classList.add('active');
        document.getElementById('filtroDia').classList.remove('active');
        if (dadosDashboardCache) {
            atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
        }
    });
    
    // Listeners para Paginação do Detalhamento
    document.getElementById('btnAnterior')?.addEventListener('click', () => {
        if (paginaAtualDetalhes > 1 && dadosDashboardCache) {
            paginaAtualDetalhes--;
            atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
        }
    });

    document.getElementById('btnProximo')?.addEventListener('click', () => {
        if (dadosDashboardCache) {
            paginaAtualDetalhes++;
            atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
        }
    });

    // Listeners para o Carrossel do Ciclo
    document.getElementById('cicloCarrosselPrev')?.addEventListener('click', () => moverCarrosselCiclo(-1));
    document.getElementById('cicloCarrosselNext')?.addEventListener('click', () => moverCarrosselCiclo(1));
    inicializarSwipeCarrossel();
}

