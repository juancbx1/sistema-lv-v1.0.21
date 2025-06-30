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
async function atualizarDashboardCompleto(forceRefresh = false) {
    mostrarSpinnerGeral('Carregando seu desempenho...');
    
    try {
        const dados = await carregarDadosDashboard(forceRefresh);
        if (!dados) {
            esconderSpinnerGeral();
            return;
        }

        const { usuario, desempenho } = dados;
        const todasAsAtividades = desempenho.atividades || [];

        atualizarSaudacaoEInfoUsuario(usuario);
        // Agora o frontend é responsável por calcular os pontos da semana atual
        atualizarCardMeta(todasAsAtividades, usuario);
        atualizarGraficoProducao(todasAsAtividades); // O gráfico filtra pelo dia atual
        await atualizarCardAndamentoCiclo(todasAsAtividades, usuario); // O carrossel filtra por semana do ciclo
        atualizarCardAssinatura(todasAsAtividades);
        atualizarDetalhamentoAtividades(todasAsAtividades);

    } catch (error) {
        console.error('[atualizarDashboardCompleto] Erro inesperado ao atualizar a UI:', error);
        mostrarPopup('Ocorreu um erro ao exibir os dados do dashboard.', 'erro');
    } finally {
        esconderSpinnerGeral();
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
    const nivelContainerEl = document.getElementById('nivelUsuarioContainer');
    const nivelValorEl = document.getElementById('nivelValor');

    if (!saudacaoEl || !nivelContainerEl || !nivelValorEl) {
        console.error("Elementos do cabeçalho não encontrados.");
        return;
    }

    const hora = new Date().getHours();
    let saudacao;
    if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
    else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';
    
    saudacaoEl.textContent = `${saudacao}, ${usuario.nome}!`;

    // Exibe o nível apenas se o usuário tiver um (costureira ou tiktik com nível definido)
    if (usuario.nivel) {
        nivelValorEl.innerHTML = `<i class="fas fa-trophy"></i> ${usuario.nivel}`;
        nivelContainerEl.style.display = 'inline-flex';
    } else {
        nivelContainerEl.style.display = 'none';
    }
}


/**
 * Atualiza o card de metas, incluindo a barra de progresso e a comissão.
 * @param {number} totalPontosSemana - Total de pontos já calculado.
 * @param {object} usuario - O objeto do usuário (para obter tipo e nível).
 */
function atualizarCardMeta(todasAsAtividades, usuario) {
    const metaSelectEl = document.getElementById('metaSelect');
    const progressoBarraEl = document.getElementById('progressoBarra');
    const pontosFeitosEl = document.getElementById('pontosFeitos');
    const pontosFaltantesEl = document.getElementById('pontosFaltantes');
    const comissaoGarantidaEl = document.getElementById('comissaoGarantida');
    const valorComissaoEl = document.getElementById('valorComissao');
    const semMetaBatidaEl = document.getElementById('semMetaBatida'); // Este elemento agora será apenas para o valor da comissão

    // 1. Filtrar atividades para a semana atual
    const cicloInfo = getObjetoCicloCompletoAtual(new Date());
    let totalPontosSemana = 0;
    
    if (cicloInfo && cicloInfo.semana) {
        const inicioSemana = cicloInfo.semana.inicio;
        const fimSemana = cicloInfo.semana.fim;
        const atividadesDaSemana = todasAsAtividades.filter(item => {
            const dataItem = new Date(item.data);
            return dataItem >= inicioSemana && dataItem <= fimSemana;
        });
        totalPontosSemana = atividadesDaSemana.reduce((acc, item) => acc + (parseFloat(item.pontos_gerados) || 0), 0);
    } else {
        console.warn("Nenhum ciclo/semana ativa encontrada para o cálculo de metas.");
    }
    
    // 2. Obter e popular as metas
    const metasDoNivel = obterMetas(usuario.tipo, usuario.nivel);
    if (metasDoNivel.length === 0) {
        metaSelectEl.innerHTML = '<option value="">Nenhuma meta configurada</option>';
        pontosFaltantesEl.textContent = 'Não há metas para seu nível.';
        // Garante que os outros elementos estejam no estado correto
        progressoBarraEl.style.width = '0%';
        pontosFeitosEl.textContent = Math.round(totalPontosSemana);
        comissaoGarantidaEl.style.display = 'none';
        semMetaBatidaEl.style.display = 'none'; // Esconde este também
        return;
    }

    const metaSalva = localStorage.getItem(`metaSelecionada_${usuario.nome}`);
    let metaSelecionada = metasDoNivel.find(m => m.pontos_meta == metaSalva) || metasDoNivel[0];

    metaSelectEl.innerHTML = metasDoNivel.map(m => `
        <option value="${m.pontos_meta}" ${m.pontos_meta === metaSelecionada.pontos_meta ? 'selected' : ''}>
            ${m.descricao || 'Meta'}: ${m.pontos_meta} Pontos (R$ ${m.valor.toFixed(2)})
        </option>
    `).join('');
    metaSelectEl.disabled = true;

    // 3. Atualizar progresso e texto principal
    const pontosMetaAlvo = metaSelecionada.pontos_meta;
    const progressoPercentual = pontosMetaAlvo > 0 ? (totalPontosSemana / pontosMetaAlvo) * 100 : 0;
    
    progressoBarraEl.style.width = `${Math.min(progressoPercentual, 100)}%`;
    pontosFeitosEl.textContent = Math.round(totalPontosSemana);
    
    const pontosQueFaltam = pontosMetaAlvo - totalPontosSemana;
    if (pontosMetaAlvo > 0) {
        pontosFaltantesEl.innerHTML = pontosQueFaltam > 0 
            ? `Faltam <span class="highlight">${Math.ceil(pontosQueFaltam)}</span> pontos para a meta selecionada.`
            : '<span class="ds-texto-sucesso">Parabéns, meta atingida!</span>';
    } else {
        pontosFaltantesEl.textContent = 'Selecione uma meta para ver o progresso.';
    }

    // 4. Lógica de comissão simplificada
    const resultadoComissao = calcularComissaoSemanal(totalPontosSemana, usuario.tipo, usuario.nivel);

    // Esconde os dois containers por padrão
    comissaoGarantidaEl.style.display = 'none';
    semMetaBatidaEl.style.display = 'none';

    if (typeof resultadoComissao === 'number') {
        // Se bateu alguma meta, mostra o valor da comissão
        valorComissaoEl.textContent = `R$ ${resultadoComissao.toFixed(2)}`;
        comissaoGarantidaEl.style.display = 'block'; // Mostra o "Comissão já garantida"
    }
    // Se não bateu nenhuma meta, não fazemos nada. Nenhum dos dois textos de comissão aparecerá.
    // A informação de "pontos faltantes" já é suficiente.
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
function atualizarCardAssinatura(atividades) {
    const btnConferirEl = document.getElementById('btnConferirAssinaturas');
    if (!btnConferirEl) return;

    const itensNaoAssinados = atividades.filter(item => item.assinada === false);
    
    btnConferirEl.classList.remove('dt-btn-aviso', 'ds-btn-aviso', 'ds-btn-primario'); // Limpa classes antigas

    if (itensNaoAssinados.length > 0) {
        btnConferirEl.classList.add('ds-btn-aviso');
        btnConferirEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${itensNaoAssinados.length} Pendente(s)`;
    } else {
        btnConferirEl.classList.add('ds-btn-sucesso');
        btnConferirEl.innerHTML = `<i class="fas fa-check-double"></i> Tudo assinado!`;
    }
    
    // O evento de clique será adicionado globalmente em configurarEventListenersGerais
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
    // Remove qualquer modal antigo para evitar duplicatas
    document.getElementById('ds-modal-assinatura-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ds-modal-assinatura-overlay';
    overlay.className = 'ds-popup-overlay';
    
    overlay.innerHTML = `
        <div class="ds-modal-assinatura-content">
            <h2 class="ds-modal-titulo">Assinaturas Pendentes</h2>
            <button class="ds-btn-fechar-modal" title="Fechar">X</button>
            <div class="ds-select-all-container">
                <input type="checkbox" id="selectAllCheckboxes">
                <label for="selectAllCheckboxes">Selecionar Todas</label>
            </div>
            <ul class="ds-lista-assinatura"></ul>
            <button id="btnAssinarSelecionados" class="ds-btn ds-btn-sucesso" disabled>Assinar Selecionados</button>
        </div>
    `;
    document.body.appendChild(overlay);
    
    const fecharModal = () => overlay.classList.remove('ativo');
    
    overlay.querySelector('.ds-btn-fechar-modal').onclick = fecharModal;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) fecharModal();
    });

    const listaEl = overlay.querySelector('.ds-lista-assinatura');
    listaEl.innerHTML = itensNaoAssinados.map(item => `
        <li>
            <input type="checkbox" class="item-checkbox" value="${item.id_original}" data-tipo="${item.tipo_origem}">
            <span>
                <strong>${item.produto} ${item.variacao ? `[${item.variacao}]` : ''}</strong>
                <em>Qtd: ${item.quantidade} - Pontos: ${(parseFloat(item.pontos_gerados) || 0).toFixed(2)} - Data: ${new Date(item.data).toLocaleDateString('pt-BR')}</em>
            </span>
        </li>
    `).join('');

    const btnAssinar = document.getElementById('btnAssinarSelecionados');
    const selectAll = document.getElementById('selectAllCheckboxes');
    const checkboxes = overlay.querySelectorAll('.item-checkbox');

    function atualizarBotaoAssinar() {
        const selecionados = overlay.querySelectorAll('.item-checkbox:checked').length;
        btnAssinar.disabled = selecionados === 0;
        btnAssinar.innerHTML = selecionados > 0 
            ? `<i class="fas fa-check-square"></i> Assinar ${selecionados} Item(ns)`
            : 'Assinar Selecionados';
    }

    selectAll.onchange = () => {
        checkboxes.forEach(cb => cb.checked = selectAll.checked);
        atualizarBotaoAssinar();
    };

    checkboxes.forEach(cb => cb.onchange = atualizarBotaoAssinar);

    btnAssinar.onclick = async () => {
        const itensParaAssinar = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => ({ id: cb.value, tipo: cb.dataset.tipo }));
        
        btnAssinar.disabled = true;
        btnAssinar.innerHTML = '<div class="ds-spinner" style="width:1em;height:1em;border-width:2px;"></div> Processando...';
        
        await executarAssinatura(itensParaAssinar);
        fecharModal();
        await atualizarDashboardCompleto(true); // Força a recarga total dos dados
    };

    // Adiciona a classe 'ativo' para o modal aparecer com a transição
    requestAnimationFrame(() => overlay.classList.add('ativo'));
}

/**
 * Envia as assinaturas para a API.
 * @param {Array} itensParaAssinar - Array de objetos {id, tipo}.
 */
async function executarAssinatura(itensParaAssinar) {
    const token = localStorage.getItem('token');
    const producoesOP = itensParaAssinar.filter(i => i.tipo === 'OP').map(i => i.id);
    const arremates = itensParaAssinar.filter(i => i.tipo === 'Arremate').map(i => i.id);

    try {
        if (producoesOP.length > 0) {
            // A API de produções espera um ID de cada vez
            for (const id of producoesOP) {
                const res = await fetch('/api/producoes', {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: id, assinada: true }) // Endpoint genérico de PUT
                });
                if (!res.ok) throw new Error(`Falha ao assinar produção OP ID ${id}`);
            }
        }
        if (arremates.length > 0) {
            const res = await fetch('/api/arremates/assinar-lote', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids_arremates: arremates })
            });
            if (!res.ok) throw new Error('Falha ao assinar lote de arremates.');
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
                // A função `atualizarCardMeta` já foi corrigida para filtrar os dados da semana
                atualizarCardMeta(dadosDashboardCache.desempenho.atividades, dadosDashboardCache.usuario);
            }
            mostrarPopup('Sua meta foi atualizada!', 'sucesso');
        }
    });

    // Listener para o botão Conferir Assinaturas
    document.getElementById('btnConferirAssinaturas')?.addEventListener('click', () => {
        const naoAssinados = dadosDashboardCache?.desempenho?.atividades.filter(item => !item.assinada) || [];
        if (naoAssinados.length > 0) {
            mostrarModalAssinatura(naoAssinados);
        } else {
            mostrarPopup('Parabéns! Todas as suas atividades já estão assinadas.', 'info');
        }
    });

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
                // *** A LÓGICA CORRIGIDA ESTÁ AQUI ***
                if (dataSelecionadaSemana) {
                    // A nova função formatarData cuidará de encontrar o início e o fim corretos
                    $('#datepickerSemanaDisplay').text(`${formatarData(dataSelecionadaSemana, 'inicioSemana')} - ${formatarData(dataSelecionadaSemana, 'fimSemana')}`);
                }
                // *** FIM DA CORREÇÃO ***
                filtroAtivo = 'semana';
                paginaAtualDetalhes = 1;
                document.getElementById('filtroSemana').classList.add('active');
                document.getElementById('filtroDia').classList.remove('active');
                if (dadosDashboardCache) {
                    atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
                }
            }
        });

        // Seta o texto inicial do display da semana
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
            // A validação para não passar do limite é feita dentro de renderizarPaginacaoDetalhes
            // que desabilita o botão, então este clique é seguro.
            paginaAtualDetalhes++;
            atualizarDetalhamentoAtividades(dadosDashboardCache.desempenho.atividades);
        }
    });

    // Listeners para o Carrossel do Ciclo
    document.getElementById('cicloCarrosselPrev')?.addEventListener('click', () => moverCarrosselCiclo(-1));
    document.getElementById('cicloCarrosselNext')?.addEventListener('click', () => moverCarrosselCiclo(1));
    inicializarSwipeCarrossel();
}

