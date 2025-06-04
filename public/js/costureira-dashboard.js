import { verificarAutenticacao, logout } from '/js/utils/auth.js';
import { criarGrafico } from '/js/utils/chart-utils.js';
import { calcularComissaoSemanal, obterMetasPorNivel } from '/js/utils/metas.js';
import { obterProdutos } from '/js/utils/storage.js';
import { getCicloAtual, getObjetoCicloCompletoAtual } from '/js/utils/ciclos.js';
import { formatarData } from '/js/utils/date-utils.js'; // Adicione esta linha

// Variáveis globais
let usuarioLogado = null;
let processosExibidos = 0;
let filtroAtivo = 'dia'; // Padrão: dia
let dataSelecionadaDia = new Date();
let dataSelecionadaSemana = new Date();
let paginaAtualDetalhes = 1; // NOVA VARIÁVEL GLOBAL para a paginação do detalhamento

let indiceSlideAtualCiclo = 0;
let totalSlidesCiclo = 0;
let slidesCicloElements = []; // Para armazenar referências aos elementos dos slides

// lógica de swipe do carrossel de ciclo
let isDraggingCiclo = false;
let startPosXCiclo = 0;
let currentTranslateCiclo = 0;
let prevTranslateCiclo = 0;
let animationIDCiclo = 0; // Para requestAnimationFrame

function mostrarSpinnerGeralDashboardCostureira(mensagem = "Carregando Dashboard...") { // Nome específico
    let spinnerOverlay = document.getElementById('dc-fullpage-spinner-overlay');
    if (!spinnerOverlay) {
        spinnerOverlay = document.createElement('div');
        spinnerOverlay.id = 'dc-fullpage-spinner-overlay';
        // Estilos do overlay (pode mover para CSS se preferir)
        spinnerOverlay.style.position = 'fixed';
        spinnerOverlay.style.top = '0';
        spinnerOverlay.style.left = '0';
        spinnerOverlay.style.width = '100%';
        spinnerOverlay.style.height = '100%';
        spinnerOverlay.style.backgroundColor = 'rgba(255,255,255,0.75)'; // Fundo branco semi-transparente
        spinnerOverlay.style.zIndex = '20000'; // Muito alto
        spinnerOverlay.style.display = 'flex';
        spinnerOverlay.style.justifyContent = 'center';
        spinnerOverlay.style.alignItems = 'center';
        // O spinner em si usará classes dc-spinner e dc-spinner-container definidas no CSS
        spinnerOverlay.innerHTML = `<div class="dc-spinner-container" style="flex-direction:column; gap:10px;">
                                       <div class="dc-spinner" style="width:50px; height:50px; border-width:5px; margin-right:0;"></div>
                                       <p style="color:var(--dc-cor-texto-principal); font-weight:500;">${mensagem}</p>
                                   </div>`;
        document.body.appendChild(spinnerOverlay);
    }
    spinnerOverlay.querySelector('p').textContent = mensagem; // Atualiza a mensagem se já existir
    spinnerOverlay.style.display = 'flex';
}

function esconderSpinnerGeralDashboardCostureira() {
    const spinnerOverlay = document.getElementById('dc-fullpage-spinner-overlay');
    if (spinnerOverlay) {
        spinnerOverlay.style.display = 'none';
    }
}

async function obterProducoes() {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Token não encontrado');
    const response = await fetch('/api/producoes', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Erro ao carregar produções: ${responseText}`);
    const producoes = JSON.parse(responseText);
    return producoes;
}

function normalizarTexto(texto) {
    return texto
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

async function verificarAutenticacaoCostureira() {
    const auth = await verificarAutenticacao('costureira-dashboard', ['acesso-costureira-dashboard']);
    if (!auth) {
        console.warn('[verificarAutenticacaoCostureira] Autenticação falhou, redirecionando para login...');
        window.location.href = '/index.html';
        return null;
    }
    return auth.usuario;
}

function verificarDadosServidor(producoes, produtos) {
    const produtosNaoEncontrados = new Set();
    producoes.forEach(p => {
        const produtoNomeNormalizado = normalizarTexto(p.produto);
        const produto = produtos.find(prod => normalizarTexto(prod.nome) === produtoNomeNormalizado);
        if (!produto) produtosNaoEncontrados.add(p.produto);
    });

    if (produtosNaoEncontrados.size > 0) {
        console.warn('Produtos em produções não encontrados na lista de produtos:', Array.from(produtosNaoEncontrados));
    }
}

function atualizarSaudacao() {
    const hora = new Date().getHours();
    let saudacao;
    if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
    else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';
    document.getElementById('saudacaoCostureira').textContent = `${saudacao}, ${usuarioLogado.nome}!`;
}

// Coloque esta função em algum lugar acessível no seu costureira-dashboard.js

/**
 * Exibe um popup de mensagem estilizado.
 * @param {string} mensagem O texto da mensagem a ser exibida.
 * @param {'info' | 'sucesso' | 'erro' | 'aviso'} [tipo='info'] O tipo de popup, para estilização.
 * @param {number} [duracao=3000] Duração em milissegundos antes do popup fechar automaticamente. Se 0, não fecha sozinho.
 */
function mostrarPopupDC(mensagem, tipo = 'info', duracao = 3000) {
    // Remover qualquer popup existente para evitar sobreposição
    const popupExistente = document.querySelector('.dc-popup-overlay.popup-dinamico');
    if (popupExistente) {
        popupExistente.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'dc-popup-overlay popup-dinamico'; // Adiciona 'popup-dinamico' para diferenciar

    const popupMensagem = document.createElement('div');
    popupMensagem.className = `dc-popup-mensagem popup-${tipo}`;

    // Adicionar ícone baseado no tipo (opcional, mas melhora UX)
    const icone = document.createElement('i');
    icone.className = 'fas dc-popup-icone'; // Classe base para ícone
    if (tipo === 'sucesso') icone.classList.add('fa-check-circle');
    else if (tipo === 'erro') icone.classList.add('fa-times-circle');
    else if (tipo === 'aviso') icone.classList.add('fa-exclamation-triangle');
    else icone.classList.add('fa-info-circle'); // Padrão para 'info'
    popupMensagem.appendChild(icone);

    const textoMensagem = document.createElement('p');
    textoMensagem.textContent = mensagem;
    popupMensagem.appendChild(textoMensagem);

    const botaoOk = document.createElement('button');
    botaoOk.className = 'dc-btn dc-btn-primario'; // Use suas classes de botão padronizadas
    botaoOk.textContent = 'OK';

    const fecharPopup = () => {
        overlay.classList.remove('ativo');
        // Esperar a animação de fadeOut terminar antes de remover do DOM
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 300); // 300ms é a duração da transição no CSS
    };

    botaoOk.addEventListener('click', fecharPopup);
    popupMensagem.appendChild(botaoOk);

    overlay.appendChild(popupMensagem);
    document.body.appendChild(overlay);

    // Forçar reflow para a animação de entrada funcionar corretamente
    // eslint-disable-next-line no-unused-expressions
    overlay.offsetHeight; 

    // Adicionar classe 'ativo' para iniciar a animação de entrada
    overlay.classList.add('ativo');
    botaoOk.focus(); // Focar no botão OK

    // Fechar automaticamente após a duração, se especificado
    if (duracao > 0) {
        setTimeout(fecharPopup, duracao);
    }
}

function getMetaSelecionada() {
    const metaSalva = localStorage.getItem(`metaSelecionada_${usuarioLogado.nome}`);
    return metaSalva ? parseInt(metaSalva) : null;
}

function salvarMetaSelecionada(meta) {
    localStorage.setItem(`metaSelecionada_${usuarioLogado.nome}`, meta);
}

function carregarMetas(metaAtual) {
    const nivel = usuarioLogado.nivel || 1;
    const metas = obterMetasPorNivel(nivel);
    const metaSelect = document.getElementById('metaSelect');
    
    if (!metas || metas.length === 0) {
        console.error('Nenhuma meta disponível para o nível:', nivel);
        metaSelect.innerHTML = '<option value="0">Nenhuma meta disponível</option>';
        return;
    }
    
    metaSelect.innerHTML = metas.map(m => 
        `<option value="${m.processos}" ${m.processos === metaAtual ? 'selected' : ''}>${m.processos} Pontos (R$ ${m.valor.toFixed(2)})</option>`
    ).join('');
    metaSelect.disabled = true;
}

async function atualizarDashboard() {
    try {
        const todasProducoes = await obterProducoes(); // Pega TODAS as produções
        const produtos = await obterProdutos();
        
        if (!usuarioLogado) {
            console.error("[atualizarDashboard] Usuário não logado ao tentar atualizar dashboard.");
            // Adicione uma mensagem para o usuário na UI, se possível
            document.getElementById('saudacaoCostureira').textContent = 'Erro: Usuário não identificado. Por favor, recarregue a página ou faça login novamente.';
            // Opcionalmente, desabilitar ou esconder os cards
            const cardsSection = document.querySelector('.dc-cards-grids');
            if(cardsSection) cardsSection.style.display = 'none';
            return; 
        }

        verificarDadosServidor(todasProducoes, produtos); 
        atualizarSaudacao();
        document.getElementById('nivelValor').innerHTML = `<i class="fas fa-trophy"></i> ${usuarioLogado.nivel || 1}`;

        // Filtra UMA VEZ aqui para obter apenas as produções do usuário logado
        const producoesDoUsuarioLogado = todasProducoes.filter(p => p.funcionario === usuarioLogado.nome);

        // Passe a lista JÁ FILTRADA para todas as funções que precisam dela
        atualizarCardMeta(producoesDoUsuarioLogado, produtos);
        atualizarGraficoProducao(producoesDoUsuarioLogado); 
        atualizarAssinaturaCard(producoesDoUsuarioLogado); 
        atualizarDetalhamentoProcessos(producoesDoUsuarioLogado, produtos);
        await atualizarCardAndamentoCiclo(producoesDoUsuarioLogado, produtos);

    } catch (error) {
        console.error('[atualizarDashboard] Erro ao carregar dados:', error.message);
        const saudacaoEl = document.getElementById('saudacaoCostureira');
        if (saudacaoEl) saudacaoEl.textContent = 'Ops! Algo deu errado ao carregar seus dados.';
        // Poderia mostrar uma mensagem mais detalhada ou um botão para tentar novamente
       mostrarPopupDC('Erro ao carregar o dashboard. Verifique sua conexão e tente recarregar a página.');
    }
}

function atualizarCardMeta(producoesDaCostureira, produtos) {
    const metaSelect = document.getElementById('metaSelect');

    // --- INÍCIO DA LÓGICA RESTAURADA PARA metaSelecionada ---
    let metaSelecionada = getMetaSelecionada(); // Tenta pegar do localStorage

    if (!metaSelecionada && metaSelect) { // Adicionei verificação se metaSelect existe
        // Pega do valor atual do select, ou usa 0 como padrão se o select não tiver valor ou não existir
        metaSelecionada = parseInt(metaSelect.value) || 0;
    } else if (!metaSelecionada) { // Se metaSelect não existe e não tem nada no localStorage
        metaSelecionada = 0; // Define um padrão
    }
    // --- FIM DA LÓGICA RESTAURADA PARA metaSelecionada ---

    carregarMetas(metaSelecionada); // Agora metaSelecionada deve estar definida

    const cicloInfo = getCicloAtual(); 
    if (!cicloInfo || !cicloInfo.semana) { 
        console.error('Nenhuma semana de ciclo atual encontrada para o card de metas.');
        const qtdProcessosEl = document.getElementById('quantidadeProcessos');
        const processosFaltantesEl = document.getElementById('processosFaltantes');
        if (qtdProcessosEl) qtdProcessosEl.textContent = 0;
        if (processosFaltantesEl) processosFaltantesEl.textContent = 'Informação da semana atual indisponível.';
        // Para evitar mais erros, limpe também os outros campos relacionados à meta
        const comissaoGarantidaEl = document.getElementById('comissaoGarantida');
        const semMetaBatidaEl = document.getElementById('semMetaBatida');
        if (comissaoGarantidaEl) comissaoGarantidaEl.style.display = 'none';
        if (semMetaBatidaEl) semMetaBatidaEl.style.display = 'block'; // Ou 'Informação indisponível'
        return;
    }

    const inicioSemana = cicloInfo.semana.inicio; 
    const fimSemana = cicloInfo.semana.fim;

    const producoesSemana = producoesDaCostureira.filter(p => {
        const dataProducao = new Date(p.data);
        return dataProducao >= inicioSemana && dataProducao <= fimSemana;
    });

    let totalPontosDaSemana = 0;
    producoesSemana.forEach(p => {
        if (p.pontos_gerados !== undefined && p.pontos_gerados !== null) {
            const pontos = parseFloat(p.pontos_gerados);
            if (!isNaN(pontos)) {
                totalPontosDaSemana += pontos;
            } else {
                console.warn(`[atualizarCardMeta] Produção ID ${p.id} com 'pontos_gerados' não numérico ('${p.pontos_gerados}'). Usando quantidade como fallback.`);
                totalPontosDaSemana += p.quantidade || 0;
            }
        } else {
            console.warn(`[atualizarCardMeta] Produção ID ${p.id} (OP: ${p.op_numero}, Produto: ${p.produto}, Processo: ${p.processo}) não possui 'pontos_gerados'. Usando p.quantidade como fallback para pontos.`);
            totalPontosDaSemana += p.quantidade || 0; 
        }
    });

    // Renomeando para totalPontos para manter consistência com o resto da função original
    const totalPontos = totalPontosDaSemana; 
    const nivel = usuarioLogado.nivel || 1;
    const metas = obterMetasPorNivel(nivel);
    const metaInfo = metas.find(m => m.processos === metaSelecionada) || { valor: 0, processos: metaSelecionada }; // Garante que metaInfo.processos exista

    const progresso = metaInfo.processos ? (totalPontos / metaInfo.processos) * 100 : 0;
    const progressoBarraEl = document.getElementById('progressoBarra');
    const quantidadeProcessosEl = document.getElementById('quantidadeProcessos');
    const processosFaltantesEl = document.getElementById('processosFaltantes');

    if (progressoBarraEl) progressoBarraEl.style.width = `${Math.min(progresso, 100)}%`;
    if (quantidadeProcessosEl) quantidadeProcessosEl.textContent = Math.round(totalPontos);

    const pontosFaltantes = metaInfo.processos - totalPontos;
    if (processosFaltantesEl) {
        if (metaInfo.processos > 0) { // Só mostra "faltam" se houver uma meta definida
             processosFaltantesEl.innerHTML = pontosFaltantes > 0 
            ? `Faltam <span class="highlight">${Math.ceil(pontosFaltantes)}</span> pontos para atingir a meta de ${metaInfo.processos} pontos` 
            : 'Meta atingida!';
        } else {
            processosFaltantesEl.innerHTML = 'Nenhuma meta selecionada para calcular o progresso.';
        }
    }

    const metasBatidas = metas.filter(m => totalPontos >= m.processos);
    const maiorMetaBatida = metasBatidas.length > 0 ? metasBatidas.sort((a, b) => b.processos - a.processos)[0] : null; // Pega a de maior valor
    
    const comissaoGarantidaEl = document.getElementById('comissaoGarantida');
    const valorComissaoEl = document.getElementById('valorComissao');
    const semMetaBatidaEl = document.getElementById('semMetaBatida');

    if (maiorMetaBatida) {
        if(valorComissaoEl) valorComissaoEl.textContent = `R$ ${maiorMetaBatida.valor.toFixed(2)}`;
        if(comissaoGarantidaEl) comissaoGarantidaEl.style.display = 'block';
        if(semMetaBatidaEl) semMetaBatidaEl.style.display = 'none';
    } else {
        if(comissaoGarantidaEl) comissaoGarantidaEl.style.display = 'none';
        if(semMetaBatidaEl) semMetaBatidaEl.style.display = 'block';
        if(valorComissaoEl) valorComissaoEl.textContent = `R$ 0,00`; // Limpa o valor se nenhuma meta foi batida
    }
}

function atualizarGraficoProducao(producoesDaCostureira) { // Parâmetro agora é a lista JÁ FILTRADA
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // O filtro por 'p.funcionario === usuarioLogado.nome' FOI REMOVIDO daqui
    // pois 'producoesDaCostureira' já contém apenas as produções do usuário logado.
    const producoesHoje = producoesDaCostureira.filter(p => {
        const dataProducao = new Date(p.data);
        dataProducao.setHours(0, 0, 0, 0);
        return dataProducao.getTime() === hoje.getTime(); // Mantém apenas o filtro de data
    });

    const horas = Array(24).fill(0);
    producoesHoje.forEach(p => {
        const hora = new Date(p.data).getHours();
        horas[hora] += p.quantidade || 0;
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
    const dados = horas;

    const ctx = document.getElementById('graficoProducaoDia').getContext('2d');
    if (window.graficoProducao) window.graficoProducao.destroy();
    
    ctx.canvas.style.width = '100%';
    ctx.canvas.style.height = 'auto';

    window.graficoProducao = criarGrafico(
        ctx,
        'line',
        labels,
        '', // Título do gráfico pode ser removido se não usado ou definido aqui
        dados,
        ['rgba(66, 153, 225, 0.2)'], // areaStyle
        ['rgba(66, 153, 225, 1)']  // lineStyle
    );
}

// Função para inicializar os eventos de swipe no slider do ciclo
function inicializarSwipeCarrosselCiclo() {
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    const viewportEl = document.getElementById('cicloCarrosselViewport');

    if (!sliderEl || !viewportEl) return;

    // Remover listeners antigos para evitar duplicação se a função for chamada múltiplas vezes
    sliderEl.removeEventListener('mousedown', dragStartCiclo);
    sliderEl.removeEventListener('touchstart', dragStartCiclo, { passive: true }); // passive: true para melhor performance de scroll

    sliderEl.removeEventListener('mouseup', dragEndCiclo);
    sliderEl.removeEventListener('mouseleave', dragEndCiclo); // Se sair do slider com mouse pressionado
    sliderEl.removeEventListener('touchend', dragEndCiclo);

    sliderEl.removeEventListener('mousemove', dragActionCiclo);
    sliderEl.removeEventListener('touchmove', dragActionCiclo, { passive: true });

    // Adicionar novos listeners
    sliderEl.addEventListener('mousedown', dragStartCiclo);
    sliderEl.addEventListener('touchstart', dragStartCiclo, { passive: true });

    sliderEl.addEventListener('mouseup', dragEndCiclo);
    sliderEl.addEventListener('mouseleave', dragEndCiclo);
    sliderEl.addEventListener('touchend', dragEndCiclo);

    sliderEl.addEventListener('mousemove', dragActionCiclo);
    sliderEl.addEventListener('touchmove', dragActionCiclo, { passive: true });

    // Prevenir o comportamento padrão de arrastar imagem (especialmente no Firefox)
    sliderEl.ondragstart = () => false;
}

function dragStartCiclo(event) {
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    if (event.type === 'touchstart') {
        startPosXCiclo = event.touches[0].clientX;
    } else {
        startPosXCiclo = event.clientX;
        // Prevenir seleção de texto ao arrastar com o mouse
        event.preventDefault();
    }
    isDraggingCiclo = true;
    sliderEl.classList.add('dragging'); // Remove a transição CSS
    // Pegar a translação atual do slider (se já houver alguma de um swipe anterior não finalizado ou do posicionamento inicial)
    // A translação é baseada no índice do slide atual
    prevTranslateCiclo = -indiceSlideAtualCiclo * sliderEl.offsetWidth; // Largura do slide (que é 100% do viewport)
    currentTranslateCiclo = prevTranslateCiclo; // Inicia a translação atual com a anterior

    animationIDCiclo = requestAnimationFrame(animationCiclo); // Inicia o loop de animação
}

function dragActionCiclo(event) {
    if (!isDraggingCiclo) return;
    let currentPosX = 0;
    if (event.type === 'touchmove') {
        currentPosX = event.touches[0].clientX;
    } else {
        currentPosX = event.clientX;
    }
    const diffX = currentPosX - startPosXCiclo;
    currentTranslateCiclo = prevTranslateCiclo + diffX; // Calcula a nova posição do slider
}

function animationCiclo() {
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    if (!sliderEl) return;
    
    // Aplica a translação calculada em dragActionCiclo
    sliderEl.style.transform = `translateX(${currentTranslateCiclo}px)`; 
    
    if (isDraggingCiclo) {
        requestAnimationFrame(animationCiclo); // Continua o loop se ainda estiver arrastando
    }
}

function dragEndCiclo() {
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    if (!isDraggingCiclo || !sliderEl) return;

    isDraggingCiclo = false;
    sliderEl.classList.remove('dragging'); // Restaura a transição CSS
    cancelAnimationFrame(animationIDCiclo); // Para o loop de animação manual

    const slideWidth = sliderEl.offsetWidth; // Largura do viewport/slide
    const movedBy = currentTranslateCiclo - prevTranslateCiclo;

    // Determinar se o swipe foi suficiente para mudar de slide
    // Se moveu mais de uma certa porcentagem da largura do slide (ex: 20%)
    if (Math.abs(movedBy) > slideWidth * 0.2) {
        if (movedBy < 0 && indiceSlideAtualCiclo < totalSlidesCiclo - 1) { // Swipe para a esquerda (próximo)
            indiceSlideAtualCiclo++;
        } else if (movedBy > 0 && indiceSlideAtualCiclo > 0) { // Swipe para a direita (anterior)
            indiceSlideAtualCiclo--;
        }
    }
    // Reposiciona o slider suavemente para o slide correto (seja o novo ou o antigo)
    irParaSlideCiclo(indiceSlideAtualCiclo);
}

async function atualizarCardAndamentoCiclo(producoesUsuario, produtos) {
    const tituloEl = document.getElementById('tituloAndamentoCiclo');
    const viewportEl = document.getElementById('cicloCarrosselViewport');
    const sliderEl = document.getElementById('cicloCarrosselSlider');
    const prevBtn = document.getElementById('cicloCarrosselPrev');
    const nextBtn = document.getElementById('cicloCarrosselNext');
    const indicadoresContainerEl = document.getElementById('cicloCarrosselIndicadores');
    const carregandoMsgEl = document.getElementById('cicloCarregandoMsg');

    if (!tituloEl || !viewportEl || !sliderEl || !prevBtn || !nextBtn || !indicadoresContainerEl || !carregandoMsgEl) {
        console.warn('[atualizarCardAndamentoCiclo] Um ou mais elementos do carrossel não encontrados.');
        return;
    }

    sliderEl.innerHTML = '';
    indicadoresContainerEl.innerHTML = '';
    slidesCicloElements = [];
    indiceSlideAtualCiclo = 0;
    totalSlidesCiclo = 0;
    carregandoMsgEl.style.display = 'block';
    viewportEl.style.display = 'none';
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    // Resetar transformações do slider
    sliderEl.style.transform = 'translateX(0px)';
    currentTranslateCiclo = 0;
    prevTranslateCiclo = 0;


    const cicloCompletoAtual = getObjetoCicloCompletoAtual(new Date());

    if (!cicloCompletoAtual || !cicloCompletoAtual.semanas || cicloCompletoAtual.semanas.length === 0) {
        tituloEl.textContent = 'Nenhum ciclo ativo no momento.';
        carregandoMsgEl.textContent = 'Fique de olho para o início do próximo ciclo.';
        return;
    }

    carregandoMsgEl.style.display = 'none';
    viewportEl.style.display = 'block';
    // A exibição dos botões prev/next será controlada pelo CSS com breakpoints

    const nomeCiclo = cicloCompletoAtual.nome || "Ciclo Atual";
    tituloEl.textContent = `Sua Jornada no ${nomeCiclo}`;
    totalSlidesCiclo = cicloCompletoAtual.semanas.length;

    const inicioPrimeiraSemanaCiclo = new Date(cicloCompletoAtual.semanas[0].inicio + 'T00:00:00-03:00');
    const fimUltimaSemanaCiclo = new Date(cicloCompletoAtual.semanas[totalSlidesCiclo - 1].fim + 'T23:59:59-03:00');

    const producoesDoCicloParaCostureira = producoesUsuario.filter(p => {
        const dataProducao = new Date(p.data);
        return dataProducao >= inicioPrimeiraSemanaCiclo && dataProducao <= fimUltimaSemanaCiclo;
    });

    const dataReferenciaHoje = new Date();
    const hojeParaComparacao = new Date(dataReferenciaHoje.getFullYear(), dataReferenciaHoje.getMonth(), dataReferenciaHoje.getDate());
    let semanaAtualEncontradaIndice = -1;

    cicloCompletoAtual.semanas.forEach((semana, index) => {
        const inicioSemanaDate = new Date(semana.inicio + 'T00:00:00-03:00');
        const fimSemanaDate = new Date(semana.fim + 'T23:59:59-03:00');

        const producoesDaSemana = producoesDoCicloParaCostureira.filter(p => {
            const dataProducao = new Date(p.data);
            return dataProducao >= inicioSemanaDate && dataProducao <= fimSemanaDate;
        });

        let pontosSemanaPonderados = 0;
        producoesDaSemana.forEach(p => {
            let pontos = 0;
            if (p.pontos_gerados !== undefined && p.pontos_gerados !== null && String(p.pontos_gerados).trim() !== "") {
                const valorFloat = parseFloat(p.pontos_gerados);
                pontos = !isNaN(valorFloat) ? valorFloat : (p.quantidade || 0);
            } else {
                pontos = p.quantidade || 0;
            }
            pontosSemanaPonderados += pontos;
        });

        const inicioSemanaComp = new Date(inicioSemanaDate.getFullYear(), inicioSemanaDate.getMonth(), inicioSemanaDate.getDate());
        const fimSemanaComp = new Date(fimSemanaDate.getFullYear(), fimSemanaDate.getMonth(), fimSemanaDate.getDate());
        const isSemanaAtual = hojeParaComparacao >= inicioSemanaComp && hojeParaComparacao <= fimSemanaComp;

        if (isSemanaAtual && semanaAtualEncontradaIndice === -1) {
            semanaAtualEncontradaIndice = index;
        }

        const slideDiv = document.createElement('div');
        slideDiv.className = 'dc-carrossel-ciclo-slide';
        
        const conteudoSlideDiv = document.createElement('div');
        conteudoSlideDiv.className = 'dc-slide-conteudo';
        if (isSemanaAtual) {
            conteudoSlideDiv.classList.add('semana-atual-destaque');
        }

        conteudoSlideDiv.innerHTML = `
            <p class="dc-slide-numero-semana">Semana ${index + 1}</p>
            <p class="dc-slide-datas">(${formatarData(semana.inicio)} - ${formatarData(semana.fim)})</p>
            <p class="dc-slide-pontos">
                <span class="dc-pontos-valor">${Math.round(pontosSemanaPonderados)}</span> 
                ${Math.round(pontosSemanaPonderados) === 1 ? 'Ponto' : 'Pontos'}
            </p>
        `;
        slideDiv.appendChild(conteudoSlideDiv);
        sliderEl.appendChild(slideDiv);
        slidesCicloElements.push(slideDiv); // Adiciona à lista de elementos de slide

        // Cria bolinha indicadora
        const bolinha = document.createElement('div');
        bolinha.className = 'dc-indicador-bolinha';
        bolinha.dataset.indice = index;
        if (isSemanaAtual) {
            bolinha.classList.add('ativo');
        }
        bolinha.addEventListener('click', () => irParaSlideCiclo(index));
        indicadoresContainerEl.appendChild(bolinha);
    });

    // Define o slide inicial (semana atual ou o primeiro se não encontrar)
    indiceSlideAtualCiclo = (semanaAtualEncontradaIndice !== -1) ? semanaAtualEncontradaIndice : 0;
    
    // Configura listeners dos botões (como estava, clonando para evitar duplicatas)
    const newPrevBtn = prevBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
    newPrevBtn.addEventListener('click', () => moverCarrosselCiclo(-1));

    const newNextBtn = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    newNextBtn.addEventListener('click', () => moverCarrosselCiclo(1));

    atualizarVisualizacaoCarrosselCiclo(); // Posiciona o carrossel
    inicializarSwipeCarrosselCiclo(); // <<< INICIALIZA OS EVENTOS DE SWIPE AQUI
}

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

    if (!sliderEl || !prevBtn || !nextBtn || !indicadoresContainerEl || slidesCicloElements.length === 0) return;

    // Ao "snapar" para um slide, usamos porcentagem para ser responsivo
    // A transição CSS cuidará da animação suave
    const deslocamentoPorcentagem = -indiceSlideAtualCiclo * 100;
    sliderEl.style.transform = `translateX(${deslocamentoPorcentagem}%)`;
    // Atualiza prevTranslateCiclo para o novo ponto de "snap" para o próximo swipe
    prevTranslateCiclo = -indiceSlideAtualCiclo * sliderEl.offsetWidth; 
    currentTranslateCiclo = prevTranslateCiclo;


    prevBtn.disabled = indiceSlideAtualCiclo === 0;
    nextBtn.disabled = indiceSlideAtualCiclo === totalSlidesCiclo - 1;

    const bolinhas = indicadoresContainerEl.querySelectorAll('.dc-indicador-bolinha');
    bolinhas.forEach((bolinha, idx) => {
        bolinha.classList.toggle('ativo', idx === indiceSlideAtualCiclo);
    });
}


function atualizarTextoDatepickerSemana() {
    const inputSemana = $("#datepickerSemana");
    if (!inputSemana.length) return;

    const dataBaseParaCalculo = new Date(dataSelecionadaSemana.getTime()); // Cria uma cópia

    // Calcula o início da semana (Domingo)
    const diaDaSemana = dataBaseParaCalculo.getDay(); // 0 para Domingo, 1 para Segunda, ..., 6 para Sábado
    // Subtrai o número de dias correspondente ao dia da semana para chegar ao Domingo
    // Ex: Se for Terça (dia 2), subtrai 2 dias. Se for Domingo (dia 0), subtrai 0 dias.
    dataBaseParaCalculo.setDate(dataBaseParaCalculo.getDate() - diaDaSemana);
    const inicioSemanaDisplay = new Date(dataBaseParaCalculo.getTime());
    inicioSemanaDisplay.setHours(0, 0, 0, 0);

    // Calcula o fim da semana (Sábado)
    const fimSemanaDisplay = new Date(inicioSemanaDisplay.getTime());
    fimSemanaDisplay.setDate(inicioSemanaDisplay.getDate() + 6);
    fimSemanaDisplay.setHours(23, 59, 59, 999);

    inputSemana.val(`${inicioSemanaDisplay.toLocaleDateString('pt-BR')} - ${fimSemanaDisplay.toLocaleDateString('pt-BR')}`);
    console.log(`[atualizarTextoDatepickerSemana] dataSelecionadaSemana: ${dataSelecionadaSemana.toLocaleDateString('pt-BR')}, Início Display: ${inicioSemanaDisplay.toLocaleDateString('pt-BR')}, Fim Display: ${fimSemanaDisplay.toLocaleDateString('pt-BR')}`);
}


function atualizarAssinaturaCard(producoesDaCostureira) {
    const btnConferirEl = document.getElementById('btnConferirAssinaturas'); // ID do HTML
    if (!btnConferirEl) {
        console.warn("[atualizarAssinaturaCard] Botão 'btnConferirAssinaturas' não encontrado.");
        return;
    }

    const producoesNaoAssinadas = producoesDaCostureira.filter(p => !p.assinada);

    if (producoesNaoAssinadas.length > 0) {
        btnConferirEl.classList.remove('dc-btn-primario'); // Remove estilo padrão
        btnConferirEl.classList.add('dc-btn-aviso');    // Adiciona estilo de aviso
        btnConferirEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${producoesNaoAssinadas.length} Pendente(s)`;
        btnConferirEl.disabled = false;
    } else {
        btnConferirEl.classList.remove('dc-btn-aviso');
        btnConferirEl.classList.add('dc-btn-primario');
        btnConferirEl.innerHTML = `<i class="fas fa-check-double"></i> Conferir Pendências`;
        btnConferirEl.disabled = false; 
    }
    
    // O onclick já está definido para chamar verificarAssinaturas
    // Mas é bom garantir que ele esteja atribuído aqui se a função for chamada múltiplas vezes
    // e o botão for recriado (o que não é o caso aqui, pois ele é do HTML estático).
    btnConferirEl.onclick = () => verificarAssinaturas(producoesNaoAssinadas);
}

function verificarAssinaturas(producoesNaoAssinadas) {
    const popupSemPendenciasOverlay = document.getElementById('popupSemAssinaturas');
    
    // Primeiro, certifique-se de que o popup de "sem pendências" esteja escondido
    if (popupSemPendenciasOverlay) {
        popupSemPendenciasOverlay.classList.remove('ativo'); // GARANTE QUE ELE COMECE ESCONDIDO
    }

    if (producoesNaoAssinadas.length === 0) {
        // Situação 1: Nenhum processo pendente
        console.log("Nenhuma assinatura pendente, mostrando popup de aviso.");
        if (popupSemPendenciasOverlay) {
            popupSemPendenciasOverlay.classList.add('ativo'); // MOSTRA ESTE
            const botaoOk = popupSemPendenciasOverlay.querySelector('#fecharPopupSemAssinaturas');
            if (botaoOk) {
                botaoOk.focus();
            }
        } else {
            console.error("Elemento #popupSemAssinaturas não encontrado no DOM.");
        }
    } else {
        // Situação 2: Há processos pendentes
        console.log("Assinaturas pendentes encontradas, mostrando modal de assinatura.");
        // Ocultar o popup de "sem pendências" explicitamente aqui também, caso ele
        // tenha sido ativado por algum outro fluxo (embora o remove no início da função deva cobrir)
        if (popupSemPendenciasOverlay) {
            popupSemPendenciasOverlay.classList.remove('ativo');
        }
        
        mostrarTelaAssinaturas(producoesNaoAssinadas); // MOSTRA O OUTRO MODAL
    }
}

function mostrarTelaAssinaturas(producoes) {
    const modalExistente = document.getElementById('assinatura'); // ID do overlay do modal
    if (modalExistente) modalExistente.remove(); // Remove se já existir para evitar duplicatas

    const container = document.createElement('div');
    container.id = 'assinatura'; // ID para o overlay, estilizado no CSS
    // container.className = 'dc-popup-overlay'; // Se quiser usar a classe genérica de overlay

    // Adapte este HTML para ser IDÊNTICO em estrutura e classes ao modal da Tiktik,
    // apenas trocando dt- por dc- e os IDs internos se necessário.
    container.innerHTML = `
        <div id="assinatura-content" class="dc-card"> <!-- dc-card para o conteúdo do modal -->
            <button id="fecharAssinatura" class="dc-btn-fechar-modal" title="Fechar">X</button>
            <h2 class="dc-card-titulo">Assinaturas Pendentes</h2>
            <div class="dc-select-all-container">
                <input type="checkbox" id="selectAllCheckboxes" name="selectAll">
                <label for="selectAllCheckboxes">Selecionar Todas</label>
            </div>
            <ul class="dc-lista-assinatura" id="assinaturaLista"></ul>
            <button id="btnAssinarSelecionados" class="dc-btn dc-btn-sucesso" style="width: 100%; margin-top: 15px;">
                <i class="fas fa-check-square"></i> Assinar Selecionados
            </button>
        </div>
    `;
    document.body.appendChild(container);
    // eslint-disable-next-line no-unused-expressions
    container.offsetHeight; // Forçar reflow
    container.classList.add('ativo'); // ATIVA O MODAL (CSS para #assinatura.ativo deve estar ok)

    const listaEl = document.getElementById('assinaturaLista');
    const selectAllEl = document.getElementById('selectAllCheckboxes');
    const btnAssinarEl = document.getElementById('btnAssinarSelecionados');
    const btnFecharEl = document.getElementById('fecharAssinatura');

    listaEl.innerHTML = producoes.map(p => {
        const variacao = p.variacao || 'N/A';
        const dataFormatada = new Date(p.data).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
        return `
            <li>
                <input type="checkbox" name="processo" value="${p.id}" class="processo-checkbox">
                <span>
                    <strong>${p.produto} ${variacao !== 'N/A' ? `[${variacao}]` : ''}</strong> - ${p.processo}
                    <br><em>Qtd: ${p.quantidade} - Data: ${dataFormatada}</em>
                </span>
            </li>
        `;
    }).join('');

    function atualizarEstadoBotaoAssinar() { // Renomeado para evitar conflito se ambas dashboards usarem mesmo nome global
        const checkboxes = container.querySelectorAll('.processo-checkbox:checked');
        btnAssinarEl.disabled = checkboxes.length === 0;
        if (checkboxes.length > 0) {
            btnAssinarEl.innerHTML = `<i class="fas fa-check-square"></i> Assinar ${checkboxes.length} Selecionado(s)`;
        } else {
            btnAssinarEl.innerHTML = `<i class="fas fa-check-square"></i> Assinar Selecionados`;
        }
    }
    
    selectAllEl.addEventListener('change', () => {
        container.querySelectorAll('.processo-checkbox').forEach(cb => cb.checked = selectAllEl.checked);
        atualizarEstadoBotaoAssinar();
    });
    container.querySelectorAll('.processo-checkbox').forEach(cb => cb.addEventListener('change', atualizarEstadoBotaoAssinar));
    atualizarEstadoBotaoAssinar();

    btnAssinarEl.onclick = async () => {
        const checkboxes = container.querySelectorAll('.processo-checkbox:checked');
        const idsParaAssinar = Array.from(checkboxes).map(cb => cb.value);

        if (idsParaAssinar.length === 0) {
            mostrarPopupDC("Nenhum processo selecionado para assinatura.", "aviso");
            return;
        }

        const originalText = btnAssinarEl.innerHTML;
        btnAssinarEl.innerHTML = '<div class="dc-spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Assinando...';
        btnAssinarEl.disabled = true;
        selectAllEl.disabled = true;

        try {
            await assinarSelecionados(idsParaAssinar); // Sua função de API existente
            fecharEsteModal();
            await atualizarDashboard(true); // Força refresh
        } catch (error) {
            // assinarSelecionados já deve mostrar o popup de erro
            btnAssinarEl.innerHTML = originalText;
            btnAssinarEl.disabled = false;
            selectAllEl.disabled = false;
        }
    };
    
    const fecharEsteModal = () => {
        container.classList.remove('ativo');
        setTimeout(() => { if (document.body.contains(container)) container.remove(); }, 300);
        window.location.hash = ''; // Limpa hash se você usa para o modal
        document.removeEventListener('keydown', escListenerAssinaturaModalCostureira);
    };

    btnFecharEl.onclick = fecharEsteModal;
    container.addEventListener('click', e => { if (e.target === container) fecharEsteModal(); });
    
    const escListenerAssinaturaModalCostureira = (e) => { // Nome diferente para o listener
        if (e.key === 'Escape') fecharEsteModal();
    };
    document.addEventListener('keydown', escListenerAssinaturaModalCostureira);
    container.addEventListener('transitionend', function handleTransition(event) {
        if (event.propertyName === 'opacity' && !container.classList.contains('ativo')) {
            document.removeEventListener('keydown', escListenerAssinaturaModalCostureira);
            container.removeEventListener('transitionend', handleTransition);
        }
    });
}

async function assinarSelecionados(ids) {
    try {
        const token = localStorage.getItem('token');
        // const agora = new Date(); // Não precisamos mais de 'agora' aqui
        // const assinaturas = JSON.parse(localStorage.getItem('assinaturas')) || []; // Lógica de 'assinaturas' no localStorage pode ser mantida se quiser um log local

        // REMOVIDO: A busca por 'producoes' e 'edicoesAtual' aqui, pois não devem ser enviados pela costureira ao assinar.
        // O backend agora lida com o que pode ser alterado com base na permissão.

        for (const id of ids) {
            const requestBody = {
                id: id,         // Envia o ID da produção
                assinada: true  // Envia a intenção de marcar como assinada
                // NÃO ENVIE 'quantidade' NEM 'edicoes' daqui quando a costureira está apenas assinando
            };
            console.log('[assinarSelecionados] Enviando requestBody:', JSON.stringify(requestBody)); // Log para confirmar

            const response = await fetch('/api/producoes', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody), // Envia o corpo corrigido
            });

            const responseText = await response.text(); // Sempre tente ler o texto para debug
            console.log(`[assinarSelecionados] Resposta do servidor para ID ${id}: ${response.status} - ${responseText}`);

            if (!response.ok) {
                // Tenta parsear como JSON se for um erro estruturado
                let errorJson = { error: `Erro HTTP ${response.status}` };
                try {
                    errorJson = JSON.parse(responseText);
                } catch(e) {
                    // Mantém o erro HTTP se não for JSON
                    if (responseText.trim() !== "") errorJson.error = responseText;
                }
                throw new Error(`Erro ao assinar produção ${id}: ${errorJson.error || `Status ${response.status}`}`);
            }
        }

        mostrarPopupDC('Processos selecionados foram enviados para assinatura!'); // Mensagem mais genérica

    } catch (error) {
        console.error('[assinarSelecionados] Erro:', error.message, error.stack ? error.stack.substring(0,300) : "");
        // Garante que a mensagem do erro seja mostrada
        const errorMessage = error.message.includes("Erro ao assinar produção") ? error.message : `Erro ao processar assinaturas: ${error.message}`;
        mostrarPopupDC(errorMessage);
    }
}

function mostrarSpinnerDetalhes() {
    const listaProcessos = document.getElementById('listaProcessos');
    if (listaProcessos) {
        listaProcessos.innerHTML = `
            <div class="dc-spinner-container">
                <div class="dc-spinner"></div>
                Carregando detalhes...
            </div>
        `;
    }
    const paginacaoContainer = document.getElementById('paginacaoContainer');
    const filtroDia = document.getElementById('filtroDia');
    const filtroSemana = document.getElementById('filtroSemana');
    const datepickerDiaEl = document.getElementById('datepickerDia'); // Renomeado para evitar conflito
    const datepickerSemanaEl = document.getElementById('datepickerSemana'); // Renomeado

    if(paginacaoContainer) paginacaoContainer.style.visibility = 'hidden';
    if(filtroDia) filtroDia.style.pointerEvents = 'none';
    if(filtroSemana) filtroSemana.style.pointerEvents = 'none';
    if(datepickerDiaEl) datepickerDiaEl.disabled = true;
    if(datepickerSemanaEl) datepickerSemanaEl.disabled = true;
}

function esconderSpinnerDetalhesEReabilitarControles() {
    const paginacaoContainer = document.getElementById('paginacaoContainer');
    const filtroDia = document.getElementById('filtroDia');
    const filtroSemana = document.getElementById('filtroSemana');
    const datepickerDiaEl = document.getElementById('datepickerDia'); // Renomeado
    const datepickerSemanaEl = document.getElementById('datepickerSemana'); // Renomeado

    if(paginacaoContainer) paginacaoContainer.style.visibility = 'visible';
    if(filtroDia) filtroDia.style.pointerEvents = 'auto';
    if(filtroSemana) filtroSemana.style.pointerEvents = 'auto';
    if(datepickerDiaEl) datepickerDiaEl.disabled = false;
    if(datepickerSemanaEl) datepickerSemanaEl.disabled = false;
}

function gerarIdUnico() {
    return 'assinatura_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}


// Função `atualizarDetalhamentoProcessos` completa e corrigida
function atualizarDetalhamentoProcessos(producoesDaCostureira, produtos) {
    const filtroDiaTexto = document.getElementById('filtroDia');
    const filtroSemanaTexto = document.getElementById('filtroSemana');
    const totalProcessosEl = document.getElementById('totalProcessos');
    const listaProcessos = document.getElementById('listaProcessos');
    const btnAnterior = document.getElementById('btnAnterior');
    const btnProximo = document.getElementById('btnProximo');
    const paginacaoNumeros = document.getElementById('paginacaoNumeros');

    if (!filtroDiaTexto || !filtroSemanaTexto || !totalProcessosEl || !listaProcessos || !btnAnterior || !btnProximo || !paginacaoNumeros) {
        console.error('Um ou mais elementos necessários para o detalhamento de processos não foram encontrados no DOM.');
        return;
    }

    const producoesUsuarioOrdenadas = producoesDaCostureira.sort((a, b) => new Date(b.data) - new Date(a.data));
    const itensPorPagina = 8;

    function normalizarData(data) {
        const d = new Date(data);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function filtrarProducoes() {
        if (filtroAtivo === 'dia') {
            const diaSelecionado = normalizarData(dataSelecionadaDia);
            return producoesUsuarioOrdenadas.filter(p => normalizarData(p.data).getTime() === diaSelecionado.getTime());
        } else { // filtroAtivo === 'semana'
            const inicioSemanaSelecionada = normalizarData(dataSelecionadaSemana);
            inicioSemanaSelecionada.setDate(inicioSemanaSelecionada.getDate() - inicioSemanaSelecionada.getDay());
            const fimSemanaSelecionada = new Date(inicioSemanaSelecionada);
            fimSemanaSelecionada.setDate(inicioSemanaSelecionada.getDate() + 6);
            fimSemanaSelecionada.setHours(23, 59, 59, 999);
            return producoesUsuarioOrdenadas.filter(p => {
                const dataProducaoNormalizada = normalizarData(p.data);
                return dataProducaoNormalizada >= inicioSemanaSelecionada && dataProducaoNormalizada <= fimSemanaSelecionada;
            });
        }
    }

    function calcularTotalPontos(producoesFiltradas) {
        return producoesFiltradas.reduce((total, p) => {
            let pontosParaEsteItem = 0;
            if (p.pontos_gerados !== undefined && p.pontos_gerados !== null) {
                const pontos = parseFloat(p.pontos_gerados);
                pontosParaEsteItem = !isNaN(pontos) ? pontos : (p.quantidade || 0);
            } else {
                pontosParaEsteItem = p.quantidade || 0;
            }
            return total + pontosParaEsteItem;
        }, 0);
    }

    function renderizarPaginacao(producoesFiltradas) {
        const totalItens = producoesFiltradas.length;
        const totalPaginas = Math.ceil(totalItens / itensPorPagina);
        paginacaoNumeros.innerHTML = '';

        const deveMostrarPaginacao = totalPaginas > 1;
        btnAnterior.style.display = deveMostrarPaginacao ? 'inline-flex' : 'none';
        btnProximo.style.display = deveMostrarPaginacao ? 'inline-flex' : 'none';
        paginacaoNumeros.style.display = deveMostrarPaginacao ? 'flex' : 'none';

        if (!deveMostrarPaginacao) {
            // Garante que os botões estejam corretamente desabilitados se não houver paginação
            btnAnterior.disabled = true;
            btnProximo.disabled = true;
            return;
        }
        
        // Lógica de exibição dos números de página (como estava antes, revisada)
        const maxBotoesVisiveis = 3; // Máximo de botões de número além do primeiro e último e "..."
        let startPage, endPage;

        if (totalPaginas <= (maxBotoesVisiveis + 2)) { // +2 para primeiro e último
            startPage = 1;
            endPage = totalPaginas;
        } else {
            if (paginaAtualDetalhes <= Math.ceil(maxBotoesVisiveis / 2) +1 ) {
                startPage = 1;
                endPage = maxBotoesVisiveis +1; // mostra 1 ... (2,3,4) ... N ou 1,2,3,4 ... N
            } else if (paginaAtualDetalhes + Math.floor(maxBotoesVisiveis / 2) >= totalPaginas -1) {
                startPage = totalPaginas - maxBotoesVisiveis ;
                endPage = totalPaginas;
            } else {
                startPage = paginaAtualDetalhes - Math.floor(maxBotoesVisiveis / 2);
                endPage = paginaAtualDetalhes + Math.floor(maxBotoesVisiveis / 2);
            }
        }
        
        // Botão da Primeira Página (se não estiver no range principal)
        if (startPage > 1) {
            const btn = document.createElement('button');
            btn.textContent = 1;
            btn.className = (1 === paginaAtualDetalhes ? 'active' : 'inactive');
            btn.addEventListener('click', () => {
                paginaAtualDetalhes = 1;
                renderizarProcessos();
                listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            paginacaoNumeros.appendChild(btn);
            if (startPage > 2) { // Adiciona "..." se houver um gap
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.margin = '0 5px';
                dots.style.color = 'var(--dc-cor-cinza-texto-secundario)';
                paginacaoNumeros.appendChild(dots);
            }
        }

        // Números do Meio
        for (let i = startPage; i <= endPage; i++) {
            if (i < 1 || i > totalPaginas) continue; // Segurança
             // Não recria o primeiro e o último se já foram adicionados ou serão
            if ( (startPage > 1 && i===1) || (endPage < totalPaginas && i===totalPaginas) ) continue;

            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = (i === paginaAtualDetalhes ? 'active' : 'inactive');
            btn.addEventListener('click', () => {
                paginaAtualDetalhes = i;
                renderizarProcessos();
                listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            paginacaoNumeros.appendChild(btn);
        }
        
        // Botão da Última Página (se não estiver no range principal)
        if (endPage < totalPaginas) {
            if (endPage < totalPaginas - 1) { // Adiciona "..." se houver um gap
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.margin = '0 5px';
                dots.style.color = 'var(--dc-cor-cinza-texto-secundario)';
                paginacaoNumeros.appendChild(dots);
            }
            const btn = document.createElement('button');
            btn.textContent = totalPaginas;
            btn.className = (totalPaginas === paginaAtualDetalhes ? 'active' : 'inactive');
            btn.addEventListener('click', () => {
                paginaAtualDetalhes = totalPaginas;
                renderizarProcessos();
                listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            paginacaoNumeros.appendChild(btn);
        }

        btnAnterior.disabled = paginaAtualDetalhes === 1;
        btnProximo.disabled = paginaAtualDetalhes === totalPaginas || totalPaginas === 0;
    }

    function renderizarProcessos() {
        const producoesFiltradas = filtrarProducoes();
        const inicio = (paginaAtualDetalhes - 1) * itensPorPagina;
        const fim = inicio + itensPorPagina;
        const processosParaExibir = producoesFiltradas.slice(inicio, fim);

        listaProcessos.innerHTML = processosParaExibir.length > 0
            ? processosParaExibir.map(p => {
                const variacao = p.variacao || 'N/A';
                const statusAssinatura = p.assinada ? 'Assinado' : 'Pendente';
                return `
                    <div class="dc-processo-item">
                        <p><strong>Produto:</strong> ${p.produto} [${variacao}]</p>
                        <p><strong>Processo:</strong> ${p.processo}</p>
                        <p><strong>Pontos:</strong> ${p.pontos_gerados !== undefined && p.pontos_gerados !== null ? parseFloat(p.pontos_gerados).toFixed(2) : (p.quantidade || 0)}</p>
                        <p><strong>Hora:</strong> ${new Date(p.data).toLocaleTimeString('pt-BR')}</p>
                        <p><strong>Status:</strong> ${statusAssinatura}</p>
                    </div>
                `;
            }).join('')
            : '<li>Nenhuma produção encontrada para o período selecionado.</li>';

        const totalPontosCalculados = calcularTotalPontos(producoesFiltradas);
        totalProcessosEl.textContent = `TOTAL DE PONTOS: ${Math.round(totalPontosCalculados)}`;
        renderizarPaginacao(producoesFiltradas);
    }

    // ** ONCLICK LISTENERS PARA btnAnterior e btnProximo **
    // ** DEVEM SER ATRIBUÍDOS UMA VEZ, FORA DE renderizarProcessos ou renderizarPaginacao **
    // Eles já estão no DOMContentLoaded e usam as referências `btnAnterior` e `btnProximo`
    // que são obtidas no início desta função `atualizarDetalhamentoProcessos`.
    // O importante é que `renderizarProcessos` seja chamado após `paginaAtualDetalhes` mudar.

    // ** LISTENERS PARA OS TEXTOS DE FILTRO (Dia/Semana) **
    // Estes também são configurados no DOMContentLoaded e não aqui.
    // A função `atualizarDetalhamentoProcessos` apenas lê `filtroAtivo` e as datas.

    // Lógica para definir qual filtro de texto está ativo (dia/semana)
    if (filtroDiaTexto && filtroSemanaTexto) {
        if (filtroAtivo === 'dia') {
            filtroDiaTexto.classList.add('active');
            filtroSemanaTexto.classList.remove('active');
        } else {
            filtroSemanaTexto.classList.add('active');
            filtroDiaTexto.classList.remove('active');
        }
    }
    
    renderizarProcessos(); // Chamada inicial para renderizar com os dados e filtros atuais
}

// public/js/costureira-dashboard.js

// ... (imports, variáveis globais, e TODAS as suas funções auxiliares e de atualização de UI
// como mostrarPopupDC, getDadosParaFiltros, atualizarDashboard, atualizarCardMeta, etc.
// devem estar definidas ANTES deste bloco DOMContentLoaded) ...

// --- EVENT LISTENER PRINCIPAL ---
document.addEventListener('DOMContentLoaded', async () => {
     // --- INICIALIZAÇÃO DO DASHBOARD E CONFIGURAÇÃO DE EVENTOS ---
    mostrarSpinnerGeralDashboardCostureira("Autenticando & carregando...");
    usuarioLogado = await verificarAutenticacaoCostureira();
    if (!usuarioLogado) {
        console.error("Falha na autenticação. Interrompendo inicialização do dashboard da costureira.");
        document.body.classList.remove('dc-body'); // Garante que não aplique estilos de body se não autenticado
        document.body.innerHTML = '<p style="text-align:center; padding: 20px; font-size: 1.2em; color: var(--dc-cor-perigo);">Falha na autenticação. Você será redirecionado para a página de login.</p>';
        return;
    }
    document.body.classList.add('autenticado');

    // Cache para produções e produtos
    let cachedProducoesUsuario = [];
    let cachedProdutos = [];

    // Referências a elementos do DOM
    const listaProcessosEl = document.getElementById('listaProcessos');
    const btnAnteriorPaginacaoEl = document.getElementById('btnAnterior');
    const btnProximoPaginacaoEl = document.getElementById('btnProximo');
    const filtroDiaTextoEl = document.getElementById('filtroDia');
    const filtroSemanaTextoEl = document.getElementById('filtroSemana');
    const datepickerDiaEl = $("#datepickerDia");
    const datepickerSemanaEl = $("#datepickerSemana");
    const metaSelectEl = document.getElementById('metaSelect');
    const editarMetaBtnEl = document.getElementById('editarMetaBtn');
    const fecharPopupSemAssinaturasBtnEl = document.getElementById('fecharPopupSemAssinaturas');
    const logoutBtnEl = document.getElementById('logoutBtn');

    // Função para buscar e cachear dados (certifique-se que está definida no escopo global ou acima)
    async function getDadosParaFiltros() {
        if (cachedProducoesUsuario.length === 0 || cachedProdutos.length === 0) {
            console.log("[getDadosParaFiltros - Costureira] Cache vazio, buscando dados da API...");
            try {
                const todasProducoes = await obterProducoes(); // Sua função obterProducoes
                cachedProdutos = await obterProdutos();     // Sua função obterProdutos
                if (usuarioLogado && usuarioLogado.nome) {
                    cachedProducoesUsuario = todasProducoes.filter(p => p.funcionario === usuarioLogado.nome);
                } else {
                    console.error("[getDadosParaFiltros - Costureira] Nome do usuário logado não encontrado.");
                    cachedProducoesUsuario = [];
                }
            } catch (error) {
                console.error("[getDadosParaFiltros - Costureira] Erro ao buscar dados:", error);
                mostrarPopupDC("Erro ao buscar dados do servidor.", "erro");
                cachedProducoesUsuario = []; cachedProdutos = [];
            }
        }
        return { producoes: cachedProducoesUsuario, produtos: cachedProdutos };
    }

    // Wrapper para atualizar o detalhamento com spinner (certifique-se que está definida)
    const atualizarDetalhesComSpinnerCostureira = async () => {
        mostrarSpinnerDetalhes(); 
        try {
            const dados = await getDadosParaFiltros(); 
            atualizarDetalhamentoProcessos(dados.producoes, dados.produtos);
        } catch (error) {
            console.error("Erro ao atualizar detalhamento da costureira:", error);
            mostrarPopupDC("Falha ao carregar detalhes da produção.", "erro");
        } finally {
            esconderSpinnerDetalhesEReabilitarControles(); 
        }
    };

    try {
        // Tradução do Datepicker
        if ($.datepicker && $.datepicker.regional['pt-BR']) {
            $.datepicker.setDefaults($.datepicker.regional['pt-BR']);
        } else {
            console.warn("Localização pt-BR do jQuery UI Datepicker não carregada (Costureira). Usando fallback manual.");
            $.datepicker.setDefaults({ /* ... seu fallback de tradução ... */ });
        }

        await atualizarDashboard(); 

        // Configuração dos Datepickers
        if (datepickerDiaEl.length) {
            datepickerDiaEl.datepicker({
                dateFormat: 'dd/mm/yy', defaultDate: dataSelecionadaDia,
                onSelect: async function(dateText) {
                    const [dia, mes, ano] = dateText.split('/');
                    dataSelecionadaDia = new Date(ano, mes - 1, dia);
                    paginaAtualDetalhes = 1; filtroAtivo = 'dia';
                    await atualizarDetalhesComSpinnerCostureira();
                    listaProcessosEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }).datepicker('setDate', dataSelecionadaDia);
        }

        if (datepickerSemanaEl.length) {
            datepickerSemanaEl.datepicker({
                dateFormat: 'dd/mm/yy',
                onSelect: async function(dateText) {
                    const [dia, mes, ano] = dateText.split('/');
                    dataSelecionadaSemana = new Date(ano, mes - 1, dia); 
                    atualizarTextoDatepickerSemana();
                    paginaAtualDetalhes = 1; filtroAtivo = 'semana';
                    await atualizarDetalhesComSpinnerCostureira();
                    listaProcessosEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            dataSelecionadaSemana = new Date(); 
            dataSelecionadaSemana.setHours(0,0,0,0); 
            atualizarTextoDatepickerSemana(); 
        }

        // Listeners para os TEXTOS "Filtrar por Dia" e "Filtrar por Semana"
        if (filtroDiaTextoEl) {
            filtroDiaTextoEl.addEventListener('click', async () => {
                const dataAtualPicker = datepickerDiaEl.datepicker('getDate');
                if (filtroAtivo === 'dia' && dataAtualPicker && dataAtualPicker.getTime() === dataSelecionadaDia.getTime()) return;
                paginaAtualDetalhes = 1; filtroAtivo = 'dia';
                const dataDoPicker = datepickerDiaEl.datepicker('getDate');
                if (dataDoPicker) dataSelecionadaDia = dataDoPicker;
                else datepickerDiaEl.datepicker('setDate', dataSelecionadaDia);
                await atualizarDetalhesComSpinnerCostureira();
                listaProcessosEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        if (filtroSemanaTextoEl) {
            filtroSemanaTextoEl.addEventListener('click', async () => {
                if (filtroAtivo === 'semana') { /* ... */ }
                paginaAtualDetalhes = 1; filtroAtivo = 'semana';
                atualizarTextoDatepickerSemana(); 
                await atualizarDetalhesComSpinnerCostureira();
                listaProcessosEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        // Listeners para os botões de paginação Anterior/Próximo
        if (btnAnteriorPaginacaoEl && listaProcessosEl) {
            btnAnteriorPaginacaoEl.addEventListener('click', () => {
                if (paginaAtualDetalhes > 1 && !btnAnteriorPaginacaoEl.disabled) {
                    paginaAtualDetalhes--;
                    atualizarDetalhesComSpinnerCostureira();
                }
            });
        }

        if (btnProximoPaginacaoEl && listaProcessosEl) {
            btnProximoPaginacaoEl.addEventListener('click', () => {
                if (!btnProximoPaginacaoEl.disabled) {
                    paginaAtualDetalhes++;
                    atualizarDetalhesComSpinnerCostureira();
                }
            });
        }

        // --- Listener para o botão Editar/Confirmar Meta ---
        // A lógica de salvar a meta e mostrar o popup está APENAS AQUI.
        if (editarMetaBtnEl && metaSelectEl) {
            editarMetaBtnEl.addEventListener('click', async () => { 
                if (metaSelectEl.disabled) {
                    // MODO: Habilitar Edição
                    metaSelectEl.disabled = false;
                    editarMetaBtnEl.innerHTML = '<i class="fas fa-save"></i> Confirmar Meta'; 
                    metaSelectEl.focus(); 
                } else {
                    // MODO: Confirmar e Salvar Meta
                    metaSelectEl.disabled = true; 
                    editarMetaBtnEl.innerHTML = '<i class="fas fa-edit"></i> Editar Meta'; 
                    
                    const novaMetaValor = parseInt(metaSelectEl.value);
                    if (isNaN(novaMetaValor)) { // Validação básica
                        mostrarPopupDC("Por favor, selecione uma meta válida.", "aviso");
                        // Reabilitar para o usuário corrigir, se desejar
                        metaSelectEl.disabled = false;
                        editarMetaBtnEl.innerHTML = '<i class="fas fa-save"></i> Confirmar Meta';
                        return;
                    }
                    const metaSelecionadaTexto = metaSelectEl.options[metaSelectEl.selectedIndex]?.text || `${novaMetaValor} Pontos`;

                    salvarMetaSelecionada(novaMetaValor); 
                    
                    try {
                        const dados = await getDadosParaFiltros(); 
                        atualizarCardMeta(dados.producoes, dados.produtos);
                    } catch (error) {
                        console.error("Erro ao atualizar card de meta após confirmação:", error);
                        mostrarPopupDC("Erro ao atualizar a exibição da meta.", "erro");
                    }

                    mostrarPopupDC(`Meta atualizada para: ${metaSelecionadaTexto}!`, 'sucesso', 3000);
                }
            });
        }

        // NÃO DEVE HAVER OUTRO LISTENER PARA O EVENTO 'CHANGE' DO metaSelectEl QUE SALVE A META.
        // Se houver, ele deve ser removido.

        // Listener para fechar o popup de "Sem Assinaturas Pendentes"
        if (fecharPopupSemAssinaturasBtnEl) {
            fecharPopupSemAssinaturasBtnEl.addEventListener('click', () => {
                const popupOverlay = document.getElementById('popupSemAssinaturas');
                if (popupOverlay) {
                    popupOverlay.classList.remove('ativo');
                }
            });
        }

        // Listener para o botão de Logout
        if (logoutBtnEl) {
            logoutBtnEl.addEventListener('click', () => {
                logout(); 
            });
        }

    } catch (e) {
        console.error("Erro crítico durante a inicialização dos componentes da dashboard da costureira:", e);
        mostrarPopupDC("Ocorreu um erro grave ao carregar sua dashboard. Tente recarregar a página.", "erro", 0); 
    } finally {
        esconderSpinnerGeralDashboardCostureira(); 
    }
});