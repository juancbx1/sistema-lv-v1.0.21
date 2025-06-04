// public/js/tiktik-dashboard.js
import { verificarAutenticacao, logout } from '/js/utils/auth.js';
import { criarGrafico } from '/js/utils/chart-utils.js';
import { obterMetasTiktik } from '/js/utils/metas-tiktik.js'; // Usando o arquivo de metas tiktik
import { getCicloAtual, getObjetoCicloCompletoAtual } from '/js/utils/ciclos.js';
import { formatarData } from '/js/utils/date-utils.js';

// Variáveis globais
let usuarioLogado = null;
let filtroAtivo = 'dia';
let dataSelecionadaDia = new Date();
let dataSelecionadaSemana = new Date();
let paginaAtualDetalhes = 1;
const ITENS_POR_PAGINA_DETALHES = 8;
let dadosProducaoCombinadosCache = [];


// Variáveis globais para o carrossel do ciclo Tiktik
let indiceSlideAtualCicloTiktik = 0;
let totalSlidesCicloTiktik = 0;
let slidesCicloElementsTiktik = [];
let isDraggingCicloTiktik = false;
let startPosXCicloTiktik = 0;
let currentTranslateCicloTiktik = 0;
let prevTranslateCicloTiktik = 0;
let animationIDCicloTiktik = 0;

// --- FUNÇÃO DE POPUP ESTILIZADO ---
function mostrarPopupDT(mensagem, tipo = 'info', duracao = 3500) {
    const popupExistente = document.querySelector('.dt-popup-overlay.popup-dinamico');
    if (popupExistente) popupExistente.remove();

    const overlay = document.createElement('div');
    overlay.className = 'dt-popup-overlay popup-dinamico';
    const popupMensagem = document.createElement('div');
    popupMensagem.className = `dt-popup-mensagem popup-${tipo}`;
    const icone = document.createElement('i');
    icone.className = 'fas dt-popup-icone';
    if (tipo === 'sucesso') icone.classList.add('fa-check-circle');
    else if (tipo === 'erro') icone.classList.add('fa-times-circle');
    else if (tipo === 'aviso') icone.classList.add('fa-exclamation-triangle');
    else icone.classList.add('fa-info-circle');
    popupMensagem.appendChild(icone);
    const textoMensagem = document.createElement('p');
    textoMensagem.textContent = mensagem;
    popupMensagem.appendChild(textoMensagem);
    const botaoOk = document.createElement('button');
    botaoOk.className = 'dt-btn dt-btn-primario';
    botaoOk.textContent = 'OK';
    const fecharPopup = () => {
        overlay.classList.remove('ativo');
        setTimeout(() => { if (document.body.contains(overlay)) document.body.removeChild(overlay); }, 300);
    };
    botaoOk.addEventListener('click', fecharPopup);
    popupMensagem.appendChild(botaoOk);
    overlay.appendChild(popupMensagem);
    document.body.appendChild(overlay);
    // eslint-disable-next-line no-unused-expressions
    overlay.offsetHeight;
    overlay.classList.add('ativo');
    botaoOk.focus();
    if (duracao > 0) setTimeout(fecharPopup, duracao);
}

// --- FUNÇÕES DE OBTENÇÃO DE DADOS ---
async function obterProducoesApi() {
    // Esta função busca da API /api/producoes.
    // Se o usuário logado for Tiktik, a API deve retornar apenas as suas produções.
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Token não encontrado');
    const response = await fetch('/api/producoes', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao carregar produções da API: ${errorText}`);
    }
    return await response.json();
}




async function obterArrematesDoUsuarioApi() {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Token não encontrado');
    
    // Tenta buscar filtrado pela API primeiro
    let response = await fetch(`/api/arremates?usuario_tiktik=${encodeURIComponent(usuarioLogado.nome)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
        // Se a API não suportar o filtro ou der erro, tenta buscar todos e filtrar no cliente
        console.warn(`Falha ao buscar arremates filtrados por usuário (status ${response.status}). Tentando buscar todos.`);
        response = await fetch('/api/arremates', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error('Erro ao buscar arremates (tentativa geral).');
        }
        const todosArremates = await response.json();
        return todosArremates.filter(arr => arr.usuario_tiktik === usuarioLogado.nome);
    }
    return await response.json();
}


async function obterDadosProducaoCombinados(forceRefresh = false) {
    if (!forceRefresh && dadosProducaoCombinadosCache.length > 0 && 
        dadosProducaoCombinadosCache.every(item => item.assinada !== undefined && item.pontos_gerados !== undefined)) {
        console.log('[obterDadosProducaoCombinados] Usando cache completo.');
        return dadosProducaoCombinadosCache;
    }

    console.log('[obterDadosProducaoCombinados] Buscando ou reprocessando dados...');
    let producoesOPApi = [];
    let arrematesApi = [];

    try { producoesOPApi = await obterProducoesApi(); } 
    catch (e) { console.error("Erro obterProducoesApi:", e); mostrarPopupDT("Falha produções.", "erro");}
    try { arrematesApi = await obterArrematesDoUsuarioApi(); } 
    catch (e) { console.error("Erro obterArrematesApi:", e); mostrarPopupDT("Falha arremates.", "erro");}
    
    const dadosCombinados = [];

    if (Array.isArray(producoesOPApi)) {
        producoesOPApi.forEach(p => {
            if (p.funcionario === usuarioLogado.nome) {
                dadosCombinados.push({
                    tipoOrigem: 'OP',
                    idOriginal: p.id, 
                    data: new Date(p.data),
                    produto: p.produto,
                    variacao: p.variacao,
                    quantidade: parseInt(p.quantidade) || 0,
                    pontos_gerados: parseFloat(p.pontos_gerados) || 0, // Vem da API
                    valor_ponto_aplicado: parseFloat(p.valor_ponto_aplicado) || 0, // Vem da API
                    opNumero: p.op_numero,
                    processo: p.processo,
                    assinada: p.assinada_por_tiktik || false 
                });
            }
        });
    }

    if (Array.isArray(arrematesApi)) {
        arrematesApi.forEach(arr => {
            dadosCombinados.push({
                tipoOrigem: 'Arremate',
                idOriginal: arr.id, 
                data: new Date(arr.data_lancamento),
                produto: arr.produto,
                variacao: arr.variante,
                quantidade: parseInt(arr.quantidade_arrematada) || 0,
                // AGORA OS PONTOS VÊM DA API JUNTO COM O ARREMATE
                pontos_gerados: parseFloat(arr.pontos_gerados) || 0, 
                valor_ponto_aplicado: parseFloat(arr.valor_ponto_aplicado) || 0,
                opNumero: arr.op_numero,
                processo: 'Arremate', 
                assinada: arr.assinada || false 
            });
        });
    }
    
    dadosCombinados.sort((a, b) => b.data.getTime() - a.data.getTime());
    dadosProducaoCombinadosCache = dadosCombinados;
    console.log('[obterDadosProducaoCombinados] Dados combinados finais (com pontos do DB):', dadosProducaoCombinadosCache);
    return dadosProducaoCombinadosCache;
}

// --- FUNÇÕES DE ATUALIZAÇÃO DA UI ---
function atualizarSaudacao() {
    const hora = new Date().getHours();
    let saudacao;
    if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
    else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';
    const saudacaoEl = document.getElementById('saudacaoTiktik');
    if (saudacaoEl) saudacaoEl.textContent = `${saudacao}, ${usuarioLogado.nome}!`;
}


function getMetaSelecionadaTiktik() {
    const metaSalvaJSON = localStorage.getItem(`metaSelecionadaTiktik_${usuarioLogado.nome}`);
    const todasMetas = obterMetasTiktik(); // Pega o array de metas atual e ordenado

    if (metaSalvaJSON) {
        try {
            const metaSalvaObj = JSON.parse(metaSalvaJSON);
            // Procura a meta salva no array de metas atual para retornar o objeto de referência correto
            const metaEncontrada = todasMetas.find(m => 
                m.pontos === metaSalvaObj.pontos && 
                m.valor === metaSalvaObj.valor &&
                m.descricao === metaSalvaObj.descricao 
            );
            // Se encontrou uma correspondência exata, retorna ela.
            // Se não encontrou (ex: metas mudaram), retorna a primeira meta disponível.
            return metaEncontrada || (todasMetas.length > 0 ? todasMetas[0] : null);
        } catch (e) {
            console.error("Erro ao parsear meta salva do localStorage para Tiktik:", e);
            // Em caso de erro no parse, retorna a primeira meta disponível como fallback
            return todasMetas.length > 0 ? todasMetas[0] : null;
        }
    }
    // Se não houver nada salvo, retorna a primeira meta disponível
    return todasMetas.length > 0 ? todasMetas[0] : null;
}

function salvarMetaSelecionadaTiktik(metaObj) {
    localStorage.setItem(`metaSelecionadaTiktik_${usuarioLogado.nome}`, JSON.stringify(metaObj));
}

function carregarMetasSelectTiktik(metaAtualObj) {
    const metas = obterMetasTiktik(); 
    const metaSelect = document.getElementById('metaSelectTiktik'); // Use o ID correto aqui
    
    if (!metaSelect) {
        console.error("[carregarMetasSelectTiktik] ERRO: Elemento metaSelectTiktik não encontrado!");
        return;
    }
    console.log("[carregarMetasSelectTiktik] Iniciando. metaAtualObj:", metaAtualObj);

    if (!metas || metas.length === 0) {
        metaSelect.innerHTML = '<option value="">Nenhuma meta disponível</option>';
        metaSelect.disabled = true;
        console.log("[carregarMetasSelectTiktik] Nenhuma meta, select desabilitado.");
        return;
    }

    metaSelect.innerHTML = metas.map((m, index) => {
        const textoOpcao = `${m.descricao}: ${m.pontos} Pontos (R$ ${m.valor.toFixed(2)})`;
        const isSelected = metaAtualObj && 
                           m.pontos === metaAtualObj.pontos && 
                           m.valor === metaAtualObj.valor &&
                           m.descricao === metaAtualObj.descricao;
        if (isSelected) {
            console.log("[carregarMetasSelectTiktik] Meta selecionada (para 'selected' no HTML):", m);
        }
        return `<option value="${index}" ${isSelected ? 'selected' : ''}>${textoOpcao}</option>`;
    }).join('');
    
    // FORÇAR A DESABILITAÇÃO E LOGAR
    metaSelect.disabled = true; 
    console.log("[carregarMetasSelectTiktik] Metas carregadas. Estado do select:", 
                "ID:", metaSelect.id,
                "Disabled:", metaSelect.disabled, 
                "Value:", metaSelect.value,
                "Options length:", metaSelect.options.length);

    // Tentar atualizar o botão AQUI também, como um teste
    const editarMetaBtnElProvisorio = document.getElementById('editarMetaBtnTiktik');
    if (editarMetaBtnElProvisorio && metaSelect.disabled && metaSelect.options.length > 0 && metaSelect.value !== "") {
        console.log("[carregarMetasSelectTiktik] Tentando setar botão para 'Editar Meta' DE DENTRO DESTA FUNÇÃO.");
        editarMetaBtnElProvisorio.innerHTML = '<i class="fas fa-edit"></i> Editar Meta';
    }
}


async function atualizarDashboard(forceRefreshData = false) {
    try {
        if (!usuarioLogado) {
            console.error("[atualizarDashboard] Usuário Tiktik não logado.");
            document.getElementById('saudacaoTiktik').textContent = 'Erro: Usuário não identificado.';
            return;
        }

        // Garante que dadosCombinados seja sempre um array, mesmo que vazio.
        const dadosCombinados = await obterDadosProducaoCombinados(forceRefreshData) || []; // Adicionado || []

        if (!Array.isArray(dadosCombinados)) {
        // Mostrar erro na UI do card de meta
            console.error("[atualizarDashboard] dadosCombinados não é um array após obterDadosProducaoCombinados. Valor:", dadosCombinados);
            mostrarPopupDT("Erro inesperado ao processar dados. Tente recarregar.", "erro");
            // Define como array vazio para evitar quebras subsequentes
            dadosProducaoCombinadosCache = []; // Reseta o cache se estiver inválido
            // As funções de atualização de card devem ser robustas para lidar com array vazio
        }

        atualizarSaudacao();
        atualizarCardMetaTiktik(dadosCombinados); 
        atualizarGraficoProducaoTiktik(dadosCombinados);
        await atualizarCardAndamentoCicloTiktik(dadosCombinados);
        atualizarDetalhamentoProducaoTiktik(dadosCombinados);
        atualizarCardAssinaturaTiktik(dadosCombinados);

    } catch (error) {
        console.error('[atualizarDashboard Tiktik] Erro:', error.message, error.stack);
        const saudacaoEl = document.getElementById('saudacaoTiktik');
        if (saudacaoEl) saudacaoEl.textContent = 'Ops! Algo deu errado ao carregar seus dados.';
        mostrarPopupDT('Erro ao carregar o dashboard. Tente recarregar a página.', 'erro');
    }
}

// --- FUNÇÕES DE ASSINATURA TIKTIK ---

function atualizarCardAssinaturaTiktik(dadosCombinados) {
    const btnConferirEl = document.getElementById('btnConferirAssinaturasTiktik');
    if (!btnConferirEl) {
        console.warn("[atualizarCardAssinaturaTiktik] Botão 'btnConferirAssinaturasTiktik' não encontrado.");
        return;
    }

    // 'dadosCombinados' agora deve ter a propriedade 'assinada' (booleana) para cada item,
    // vinda de 'assinada_por_tiktik' (para OPs) ou 'assinada' (para Arremates).
    // A função obterDadosProducaoCombinados() precisa ser ajustada para isso.
    const itensNaoAssinados = dadosCombinados.filter(item => item.assinada === false);
    
    if (itensNaoAssinados.length > 0) {
        btnConferirEl.classList.add('dt-btn-aviso'); // Adiciona classe para destacar
        btnConferirEl.classList.remove('dt-btn-primario'); // Remove a classe primária se ela o deixa cinza
        btnConferirEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${itensNaoAssinados.length} Pendente(s)`;
        btnConferirEl.disabled = false; // GARANTE QUE O BOTÃO ESTEJA HABILITADO
    } else {
        btnConferirEl.classList.remove('dt-btn-aviso');
        btnConferirEl.classList.add('dt-btn-primario');
        btnConferirEl.innerHTML = `<i class="fas fa-check-double"></i> Conferir Pendências`;
        btnConferirEl.disabled = false; // Mesmo sem pendências, o botão pode ser clicável para mostrar o popup "nada pendente"
    }
    
    btnConferirEl.onclick = () => verificarAssinaturasTiktik(itensNaoAssinados);
}

function verificarAssinaturasTiktik(itensNaoAssinados) {
    const popupSemPendenciasEl = document.getElementById('popupSemAssinaturasTiktik');
    
    if (popupSemPendenciasEl) {
        popupSemPendenciasEl.classList.remove('ativo');
    }

    if (!Array.isArray(itensNaoAssinados)) {
        console.error("[verificarAssinaturasTiktik] itensNaoAssinados não é um array.");
        mostrarPopupDT("Erro ao verificar pendências de assinatura.", "erro");
        return;
    }

    if (itensNaoAssinados.length === 0) {
        if (popupSemPendenciasEl) {
            popupSemPendenciasEl.classList.add('ativo');
            const botaoOk = popupSemPendenciasEl.querySelector('#fecharPopupSemAssinaturasTiktik');
            if (botaoOk) botaoOk.focus();
        }
    } else {
        mostrarTelaAssinaturasTiktik(itensNaoAssinados);
    }
}

function mostrarTelaAssinaturasTiktik(itens) {
    console.log("[mostrarTelaAssinaturasTiktik] Iniciando com itens:", itens);

    const modalExistente = document.getElementById('assinaturaTiktikModal');
    if (modalExistente) modalExistente.remove();

    const container = document.createElement('div');
    container.id = 'assinaturaTiktikModal';
    container.className = 'dt-popup-overlay'; // Certifique-se que esta classe tem os estilos de overlay

    container.innerHTML = `
        <div id="assinaturaTiktik-content" class="dt-card"> 
            <button id="fecharAssinaturaTiktikModal" class="dt-btn-fechar-modal" title="Fechar">X</button>
            <h2 class="dt-card-titulo">Atividades Pendentes de Assinatura</h2>
            <div class="dt-select-all-container">
                <input type="checkbox" id="selectAllCheckboxesTiktik" name="selectAllTiktik">
                <label for="selectAllCheckboxesTiktik">Selecionar Todas</label>
            </div>
            <ul class="dt-lista-assinatura" id="assinaturaListaTiktik"></ul>
            <button id="btnAssinarSelecionadosTiktik" class="dt-btn dt-btn-sucesso" style="width: 100%; margin-top: 15px;">
                <i class="fas fa-check-square"></i> Assinar Selecionadas
            </button>
        </div>
    `;
    document.body.appendChild(container);
    console.log("[mostrarTelaAssinaturasTiktik] Container adicionado ao body. Elemento:", container);

    // eslint-disable-next-line no-unused-expressions
    container.offsetHeight; // Forçar reflow

    console.log("[mostrarTelaAssinaturasTiktik] Adicionando classe 'ativo' ao container.");
    container.classList.add('ativo'); // MOSTRA O MODAL

    if (container.classList.contains('ativo')) {
        console.log("[mostrarTelaAssinaturasTiktik] Classe 'ativo' FOI adicionada com sucesso.");
    } else {
        console.error("[mostrarTelaAssinaturasTiktik] ERRO: Classe 'ativo' NÃO foi adicionada ao container.");
    }

    const listaEl = document.getElementById('assinaturaListaTiktik');
    const selectAllEl = document.getElementById('selectAllCheckboxesTiktik');
    const btnAssinarEl = document.getElementById('btnAssinarSelecionadosTiktik');
    const btnFecharEl = document.getElementById('fecharAssinaturaTiktikModal');

    listaEl.innerHTML = itens.map(item => {
        const tipoLabel = item.tipoOrigem === 'OP' ? `OP ${item.opNumero || ''} (${item.processo || 'N/A'})` : `Arremate OP ${item.opNumero || 'N/A'}`;
        const dataFormatada = item.data ? new Date(item.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : 'Data Inválida';
        return `
            <li>
                <input type="checkbox" 
                       name="atividadeTiktik" 
                       value="${item.idOriginal}" 
                       data-tipo="${item.tipoOrigem}" 
                       class="item-checkbox-tiktik">
                <span>
                    <strong>${item.produto} ${item.variacao ? `[${item.variacao}]` : ''}</strong> - ${tipoLabel}
                    <br><em>Qtd/Pts: ${item.pontos_gerados !== undefined ? item.pontos_gerados.toFixed(2) : (item.quantidade || 0)} - Data: ${dataFormatada}</em>
                </span>
            </li>
        `;
    }).join('');

    function atualizarEstadoBotaoAssinar() {
        const checkboxes = container.querySelectorAll('.item-checkbox-tiktik:checked');
        btnAssinarEl.disabled = checkboxes.length === 0;
        if (checkboxes.length > 0) {
            btnAssinarEl.innerHTML = `<i class="fas fa-check-square"></i> Assinar ${checkboxes.length} Selecionada(s)`;
        } else {
            btnAssinarEl.innerHTML = `<i class="fas fa-check-square"></i> Assinar Selecionadas`;
        }
    }
    
    selectAllEl.addEventListener('change', () => {
        container.querySelectorAll('.item-checkbox-tiktik').forEach(cb => cb.checked = selectAllEl.checked);
        atualizarEstadoBotaoAssinar();
    });
    container.querySelectorAll('.item-checkbox-tiktik').forEach(cb => cb.addEventListener('change', atualizarEstadoBotaoAssinar));
    atualizarEstadoBotaoAssinar(); 

    btnAssinarEl.onclick = async () => {
        const checkboxes = container.querySelectorAll('.item-checkbox-tiktik:checked');
        const itensParaAssinar = Array.from(checkboxes).map(cb => ({
            id: cb.value,
            tipo: cb.dataset.tipo 
        }));

        if (itensParaAssinar.length === 0) {
            mostrarPopupDT("Nenhuma atividade selecionada para assinatura.", "aviso");
            return;
        }
        
        const originalText = btnAssinarEl.innerHTML;
        btnAssinarEl.innerHTML = '<div class="dt-spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Assinando...';
        btnAssinarEl.disabled = true;
        selectAllEl.disabled = true; // Desabilita selectAll durante o processo

        try {
            await assinarSelecionadosTiktik(itensParaAssinar); // Chama a função que interage com a API
            fecharEsteModal();
            await atualizarDashboard(true); // Força refresh dos dados da dashboard
        } catch (error) {
            // assinarSelecionadosTiktik já deve mostrar o popup de erro
            btnAssinarEl.innerHTML = originalText; // Restaura texto do botão em caso de erro
            btnAssinarEl.disabled = false;
            selectAllEl.disabled = false;
        }
    };
    
    const fecharEsteModal = () => {
        container.classList.remove('ativo');
        setTimeout(() => { if (document.body.contains(container)) container.remove(); }, 300);
        document.removeEventListener('keydown', escListenerAssinaturaModal);
    };

    btnFecharEl.onclick = fecharEsteModal;
    container.addEventListener('click', e => { if (e.target === container) fecharEsteModal(); });
    
    const escListenerAssinaturaModal = (e) => {
        if (e.key === 'Escape') fecharEsteModal();
    };
    document.addEventListener('keydown', escListenerAssinaturaModal);
    container.addEventListener('transitionend', function handleTransition(event) {
        if (event.propertyName === 'opacity' && !container.classList.contains('ativo')) {
            document.removeEventListener('keydown', escListenerAssinaturaModal);
            container.removeEventListener('transitionend', handleTransition);
        }
    });
    console.log("[mostrarTelaAssinaturasTiktik] Configuração dos listeners e lista concluída.");

}

async function assinarSelecionadosTiktik(itensParaAssinar) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarPopupDT("Erro de autenticação. Faça login novamente.", "erro");
        throw new Error("Token não encontrado");
    }

    const producoesOPParaAssinar = itensParaAssinar
        .filter(item => item.tipo === 'OP')
        .map(item => item.id);

    const arrematesParaAssinar = itensParaAssinar
        .filter(item => item.tipo === 'Arremate')
        .map(item => item.id);

    let sucessoOP = true;
    let sucessoArremate = true;

    try {
        if (producoesOPParaAssinar.length > 0) {
            // Assumindo que a API pode receber um lote ou você faz um loop
            // Por simplicidade, vou fazer um loop (idealmente o backend aceitaria um lote)
            for (const idProducaoOP of producoesOPParaAssinar) {
                const response = await fetch(`/api/producoes/assinar-tiktik-op`, { // SEU ENDPOINT AQUI
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_producao_op: idProducaoOP })
                });
                if (!response.ok) {
                    const errData = await response.json();
                    console.error(`Erro ao assinar OP ${idProducaoOP}:`, errData.error);
                    sucessoOP = false; 
                    // Continuar tentando assinar os outros, ou parar? Decidimos continuar.
                }
            }
        }

        if (arrematesParaAssinar.length > 0) {
            const response = await fetch(`/api/arremates/assinar-lote`, { // SEU ENDPOINT AQUI
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids_arremates: arrematesParaAssinar })
            });
            if (!response.ok) {
                const errData = await response.json();
                console.error('Erro ao assinar lote de arremates:', errData.error);
                sucessoArremate = false;
            }
        }

        if (sucessoOP && sucessoArremate) {
            mostrarPopupDT("Atividades selecionadas foram assinadas com sucesso!", "sucesso");
        } else {
            let msgErro = "Algumas atividades não puderam ser assinadas:";
            if (!sucessoOP) msgErro += " Falha ao assinar produções de OP.";
            if (!sucessoArremate) msgErro += " Falha ao assinar arremates.";
            mostrarPopupDT(msgErro, "aviso"); // Aviso porque parte pode ter funcionado
        }

    } catch (error) {
        console.error('[assinarSelecionadosTiktik] Erro geral:', error);
        mostrarPopupDT(`Erro ao processar assinaturas: ${error.message}`, "erro");
        throw error; // Re-lança para o handler do botão poder restaurar o estado
    }
}


function atualizarCardMetaTiktik(dadosCombinados) {

    if (!Array.isArray(dadosCombinados)) {
        document.getElementById('progressoBarraTiktik').style.width = '0%';
        document.getElementById('quantidadeProduzidaTiktik').textContent = 'Erro';
        document.getElementById('itensFaltantesTiktik').textContent = 'Erro ao carregar dados da meta.';
        return;
    }

    const metaSelect = document.getElementById('metaSelectTiktik');
    let metaSelecionadaObj = getMetaSelecionadaTiktik();

    if (!metaSelecionadaObj && metaSelect && metaSelect.value !== "" && obterMetasTiktik()[parseInt(metaSelect.value)]) {
        const todasMetas = obterMetasTiktik();
        metaSelecionadaObj = todasMetas[parseInt(metaSelect.value)];
    } else if (!metaSelecionadaObj) {
        const metasDefault = obterMetasTiktik();
        metaSelecionadaObj = metasDefault.length > 0 ? metasDefault[0] : { pontos: 0, valor: 0, descricao: "Meta Padrão (0 pts)" };
    }
    
    carregarMetasSelectTiktik(metaSelecionadaObj);

    const cicloInfo = getCicloAtual(); 
    if (!cicloInfo || !cicloInfo.semana) {
        document.getElementById('quantidadeProduzidaTiktik').textContent = 0;
        document.getElementById('itensFaltantesTiktik').textContent = 'Info da semana indisponível.';
        return;
    }

    const inicioPeriodo = cicloInfo.semana.inicio; 
    const fimPeriodo = cicloInfo.semana.fim;

    const producoesNoPeriodoMeta = dadosCombinados.filter(item => {
        if (!item || !item.data) {
            return false;
        }
        const dataItem = new Date(item.data);
        return dataItem >= inicioPeriodo && dataItem <= fimPeriodo;
    });

    // **** VERIFICAÇÃO CRÍTICA IMEDIATAMENTE APÓS O FILTRO ****
    if (!Array.isArray(producoesNoPeriodoMeta)) {
        // Tentar forçar um array vazio para evitar o erro no reduce, mas isso mascara o problema real.
        // O ideal é descobrir PORQUE ele se tornou undefined.
        document.getElementById('quantidadeProduzidaTiktik').textContent = 'Erro Filtro';
        document.getElementById('itensFaltantesTiktik').textContent = 'Erro ao processar filtro da meta.';
        return; // Interrompe a função aqui se o array se perdeu.
    }
    // ***********************************************************
    
    const totalPontosNoPeriodo = producoesNoPeriodoMeta.reduce((sum, item) => {
        const pontos = (item && typeof item.pontos_gerados === 'number') ? item.pontos_gerados : 0;
        return sum + pontos;
    }, 0);
    

    const metaPontos = metaSelecionadaObj ? (metaSelecionadaObj.pontos || 0) : 0;
    const progresso = metaPontos > 0 ? (totalPontosNoPeriodo / metaPontos) * 100 : 0;
    
    document.getElementById('progressoBarraTiktik').style.width = `${Math.min(progresso, 100)}%`;
    document.getElementById('quantidadeProduzidaTiktik').textContent = Math.round(totalPontosNoPeriodo);

    const pontosFaltantes = metaPontos - totalPontosNoPeriodo;
    const faltantesEl = document.getElementById('itensFaltantesTiktik');
    if (metaPontos > 0) {
        faltantesEl.innerHTML = pontosFaltantes > 0 
            ? `Faltam <span class="highlight">${Math.ceil(pontosFaltantes)}</span> pontos para a meta de ${metaPontos}`
            : 'Meta atingida!';
    } else {
        faltantesEl.innerHTML = 'Nenhuma meta de pontos definida.';
    }
}



function atualizarGraficoProducaoTiktik(dadosCombinados) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const producoesHoje = dadosCombinados.filter(item => {
        const dataItem = new Date(item.data);
        dataItem.setHours(0, 0, 0, 0);
        return dataItem.getTime() === hoje.getTime();
    });

    const horas = Array(24).fill(0);
    producoesHoje.forEach(item => {
        const hora = new Date(item.data).getHours();
        horas[hora] += (item.pontos_gerados || 0); // Usar PONTOS GERADOS
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
    const dados = horas;

    const ctx = document.getElementById('graficoProducaoDiaTiktik')?.getContext('2d');
    if(!ctx) return;
    if (window.graficoProducaoTiktik) window.graficoProducaoTiktik.destroy();
    window.graficoProducaoTiktik = criarGrafico(ctx, 'line', labels, '', dados,
        ['rgba(75, 192, 192, 0.2)'], // Cor da área (exemplo)
        ['rgba(75, 192, 192, 1)']    // Cor da linha (exemplo)
    );
}

// public/js/tiktik-dashboard.js

// --- Funções do Carrossel de Ciclo para Tiktik ---
// (Estas funções auxiliares são chamadas por atualizarCardAndamentoCicloTiktik)
function inicializarSwipeCarrosselCicloTiktik() {
    const sliderEl = document.getElementById('cicloCarrosselSliderTiktik');
    if (!sliderEl) return;

    // Remover listeners antigos para evitar duplicação
    sliderEl.removeEventListener('mousedown', dragStartCicloTiktik);
    sliderEl.removeEventListener('touchstart', dragStartCicloTiktik);
    sliderEl.removeEventListener('mouseup', dragEndCicloTiktik);
    sliderEl.removeEventListener('mouseleave', dragEndCicloTiktik);
    sliderEl.removeEventListener('touchend', dragEndCicloTiktik);
    sliderEl.removeEventListener('mousemove', dragActionCicloTiktik);
    sliderEl.removeEventListener('touchmove', dragActionCicloTiktik);

    // Adicionar novos listeners
    sliderEl.addEventListener('mousedown', dragStartCicloTiktik);
    sliderEl.addEventListener('touchstart', dragStartCicloTiktik, { passive: true });
    sliderEl.addEventListener('mouseup', dragEndCicloTiktik);
    sliderEl.addEventListener('mouseleave', dragEndCicloTiktik);
    sliderEl.addEventListener('touchend', dragEndCicloTiktik);
    sliderEl.addEventListener('mousemove', dragActionCicloTiktik);
    sliderEl.addEventListener('touchmove', dragActionCicloTiktik, { passive: true });
    sliderEl.ondragstart = () => false;
}

function dragStartCicloTiktik(event) {
    const sliderEl = document.getElementById('cicloCarrosselSliderTiktik');
    if (event.type === 'touchstart') {
        startPosXCicloTiktik = event.touches[0].clientX;
    } else {
        startPosXCicloTiktik = event.clientX;
        event.preventDefault();
    }
    isDraggingCicloTiktik = true;
    sliderEl.classList.add('dragging'); // Remove a transição CSS (classe .dt-carrossel-ciclo-slider.dragging)
    
    // Calcula o offset do slide atual em pixels
    const slideWidth = slidesCicloElementsTiktik.length > 0 ? slidesCicloElementsTiktik[0].offsetWidth : sliderEl.offsetWidth;
    prevTranslateCicloTiktik = -indiceSlideAtualCicloTiktik * slideWidth;
    currentTranslateCicloTiktik = prevTranslateCicloTiktik;
    animationIDCicloTiktik = requestAnimationFrame(animationCicloTiktik);
}

function dragActionCicloTiktik(event) {
    if (!isDraggingCicloTiktik) return;
    let currentPosX = (event.type === 'touchmove') ? event.touches[0].clientX : event.clientX;
    const diffX = currentPosX - startPosXCicloTiktik;
    currentTranslateCicloTiktik = prevTranslateCicloTiktik + diffX;
}

function animationCicloTiktik() {
    const sliderEl = document.getElementById('cicloCarrosselSliderTiktik');
    if (!sliderEl) return;
    sliderEl.style.transform = `translateX(${currentTranslateCicloTiktik}px)`;
    if (isDraggingCicloTiktik) requestAnimationFrame(animationCicloTiktik);
}

function dragEndCicloTiktik() {
    const sliderEl = document.getElementById('cicloCarrosselSliderTiktik');
    if (!isDraggingCicloTiktik || !sliderEl) return;

    isDraggingCicloTiktik = false;
    sliderEl.classList.remove('dragging'); // Restaura a transição CSS
    cancelAnimationFrame(animationIDCicloTiktik);

    const slideWidth = slidesCicloElementsTiktik.length > 0 ? slidesCicloElementsTiktik[0].offsetWidth : sliderEl.offsetWidth;
    const movedBy = currentTranslateCicloTiktik - prevTranslateCicloTiktik;

    if (Math.abs(movedBy) > slideWidth * 0.2) { // Limiar para mudar de slide
        if (movedBy < 0 && indiceSlideAtualCicloTiktik < totalSlidesCicloTiktik - 1) {
            indiceSlideAtualCicloTiktik++;
        } else if (movedBy > 0 && indiceSlideAtualCicloTiktik > 0) {
            indiceSlideAtualCicloTiktik--;
        }
    }
    irParaSlideCicloTiktik(indiceSlideAtualCicloTiktik);
}

function moverCarrosselCicloTiktik(direcao) {
    const novoIndice = indiceSlideAtualCicloTiktik + direcao;
    if (novoIndice >= 0 && novoIndice < totalSlidesCicloTiktik) {
        irParaSlideCicloTiktik(novoIndice);
    }
}

function irParaSlideCicloTiktik(indice) {
    indiceSlideAtualCicloTiktik = indice;
    atualizarVisualizacaoCarrosselCicloTiktik();
}

function atualizarVisualizacaoCarrosselCicloTiktik() {
    const sliderEl = document.getElementById('cicloCarrosselSliderTiktik');
    const prevBtn = document.getElementById('cicloCarrosselPrevTiktik');
    const nextBtn = document.getElementById('cicloCarrosselNextTiktik');
    const indicadoresContainerEl = document.getElementById('cicloCarrosselIndicadoresTiktik');

    if (!sliderEl || !prevBtn || !nextBtn || !indicadoresContainerEl || slidesCicloElementsTiktik.length === 0) return;

    // Para o "snap" final, usamos porcentagem para responsividade
    const deslocamentoPorcentagem = -indiceSlideAtualCicloTiktik * 100;
    sliderEl.style.transform = `translateX(${deslocamentoPorcentagem}%)`;
    
    // Atualiza prevTranslateCicloTiktik para o novo ponto de "snap" em pixels
    const slideWidth = slidesCicloElementsTiktik.length > 0 ? slidesCicloElementsTiktik[0].offsetWidth : sliderEl.offsetWidth;
    prevTranslateCicloTiktik = -indiceSlideAtualCicloTiktik * slideWidth; 
    currentTranslateCicloTiktik = prevTranslateCicloTiktik;

    prevBtn.disabled = indiceSlideAtualCicloTiktik === 0;
    nextBtn.disabled = indiceSlideAtualCicloTiktik === totalSlidesCicloTiktik - 1;

    const bolinhas = indicadoresContainerEl.querySelectorAll('.dt-indicador-bolinha');
    bolinhas.forEach((bolinha, idx) => {
        bolinha.classList.toggle('ativo', idx === indiceSlideAtualCicloTiktik);
    });
}


async function atualizarCardAndamentoCicloTiktik(dadosCombinados) {
    const tituloEl = document.getElementById('tituloAndamentoCicloTiktik');
    const viewportEl = document.getElementById('cicloCarrosselViewportTiktik');
    const sliderEl = document.getElementById('cicloCarrosselSliderTiktik');
    const prevBtn = document.getElementById('cicloCarrosselPrevTiktik');
    const nextBtn = document.getElementById('cicloCarrosselNextTiktik');
    const indicadoresContainerEl = document.getElementById('cicloCarrosselIndicadoresTiktik');
    const carregandoMsgEl = document.getElementById('cicloCarregandoMsgTiktik');

    if (!tituloEl || !viewportEl || !sliderEl || !prevBtn || !nextBtn || !indicadoresContainerEl || !carregandoMsgEl) {
        console.warn('[atualizarCardAndamentoCicloTiktik] Elementos do carrossel não encontrados.');
        return;
    }

    sliderEl.innerHTML = '';
    indicadoresContainerEl.innerHTML = '';
    slidesCicloElementsTiktik = []; // Limpa array de refs dos slides
    indiceSlideAtualCicloTiktik = 0;
    totalSlidesCicloTiktik = 0;
    carregandoMsgEl.style.display = 'block';
    viewportEl.style.display = 'none';
    // A visibilidade dos botões prev/next será controlada pelo CSS via media queries

    sliderEl.style.transform = 'translateX(0px)'; // Reset transform
    currentTranslateCicloTiktik = 0;
    prevTranslateCicloTiktik = 0;

    const cicloCompletoAtual = getObjetoCicloCompletoAtual(new Date());

    if (!cicloCompletoAtual || !cicloCompletoAtual.semanas || cicloCompletoAtual.semanas.length === 0) {
        tituloEl.textContent = 'Nenhum ciclo ativo no momento.';
        carregandoMsgEl.textContent = 'Fique de olho para o início do próximo ciclo.';
        return;
    }

    carregandoMsgEl.style.display = 'none';
    viewportEl.style.display = 'block';

    const nomeCiclo = cicloCompletoAtual.nome || "Ciclo Atual";
    tituloEl.textContent = `Sua Jornada no ${nomeCiclo}`;
    totalSlidesCicloTiktik = cicloCompletoAtual.semanas.length;

    const inicioPrimeiraSemanaCiclo = new Date(cicloCompletoAtual.semanas[0].inicio + 'T00:00:00-03:00');
    const fimUltimaSemanaCiclo = new Date(cicloCompletoAtual.semanas[totalSlidesCicloTiktik - 1].fim + 'T23:59:59-03:00');

    const producoesDoCicloParaTiktik = dadosCombinados.filter(item => {
        const dataItem = new Date(item.data);
        return dataItem >= inicioPrimeiraSemanaCiclo && dataItem <= fimUltimaSemanaCiclo;
    });

    const dataReferenciaHoje = new Date();
    const hojeParaComparacao = new Date(dataReferenciaHoje.getFullYear(), dataReferenciaHoje.getMonth(), dataReferenciaHoje.getDate());
    let semanaAtualEncontradaIndice = -1;

    cicloCompletoAtual.semanas.forEach((semana, index) => {
        const inicioSemanaDate = new Date(semana.inicio + 'T00:00:00-03:00');
        const fimSemanaDate = new Date(semana.fim + 'T23:59:59-03:00');

        const producoesDaSemana = producoesDoCicloParaTiktik.filter(item => {
            const dataItem = new Date(item.data);
            return dataItem >= inicioSemanaDate && dataItem <= fimSemanaDate;
        });

        const totalPontosSemana = producoesDaSemana.reduce((sum, item) => sum + (item.pontos_gerados || 0), 0);

        const inicioSemanaComp = new Date(inicioSemanaDate.getFullYear(), inicioSemanaDate.getMonth(), inicioSemanaDate.getDate());
        const fimSemanaComp = new Date(fimSemanaDate.getFullYear(), fimSemanaDate.getMonth(), fimSemanaDate.getDate());
        const isSemanaAtual = hojeParaComparacao >= inicioSemanaComp && hojeParaComparacao <= fimSemanaComp;

        if (isSemanaAtual && semanaAtualEncontradaIndice === -1) {
            semanaAtualEncontradaIndice = index;
        }

        const slideDiv = document.createElement('div');
        slideDiv.className = 'dt-carrossel-ciclo-slide';
        const conteudoSlideDiv = document.createElement('div');
        conteudoSlideDiv.className = 'dt-slide-conteudo';
        if (isSemanaAtual) {
            conteudoSlideDiv.classList.add('semana-atual-destaque');
        }
        conteudoSlideDiv.innerHTML = `
            <p class="dt-slide-numero-semana">Semana ${index + 1}</p>
            <p class="dt-slide-datas">(${formatarData(semana.inicio)} - ${formatarData(semana.fim)})</p>
            <p class="dt-slide-pontos">
                <span class="dt-pontos-valor">${Math.round(totalPontosSemana)}</span> 
                ${Math.round(totalPontosSemana) === 1 ? 'Ponto' : 'Pontos'}
            </p>
        `;
        slideDiv.appendChild(conteudoSlideDiv);
        sliderEl.appendChild(slideDiv);
        slidesCicloElementsTiktik.push(slideDiv);

        const bolinha = document.createElement('div');
        bolinha.className = 'dt-indicador-bolinha';
        bolinha.dataset.indice = index;
        // A classe 'ativo' será adicionada em atualizarVisualizacaoCarrosselCicloTiktik
        bolinha.addEventListener('click', () => irParaSlideCicloTiktik(index));
        indicadoresContainerEl.appendChild(bolinha);
    });

    indiceSlideAtualCicloTiktik = (semanaAtualEncontradaIndice !== -1) ? semanaAtualEncontradaIndice : 0;
    
    // Reatribuir listeners para prev/next para evitar duplicação (clonando)
    const newPrevBtn = prevBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
    newPrevBtn.addEventListener('click', () => moverCarrosselCicloTiktik(-1));

    const newNextBtn = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    newNextBtn.addEventListener('click', () => moverCarrosselCicloTiktik(1));
    
    atualizarVisualizacaoCarrosselCicloTiktik();
    inicializarSwipeCarrosselCicloTiktik();
}


function normalizarDataParaComparacao(data) {
    const d = new Date(data);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function atualizarDetalhamentoProducaoTiktik(dadosCombinados) {
    const filtroDiaTextoEl = document.getElementById('filtroDiaTiktik');
    const filtroSemanaTextoEl = document.getElementById('filtroSemanaTiktik');
    const totalPontosEl = document.getElementById('totalItensTiktik'); // ID do HTML
    const listaAtividadesEl = document.getElementById('listaProducaoTiktik'); // ID do HTML
    const btnAnteriorEl = document.getElementById('btnAnteriorTiktik');
    const btnProximoEl = document.getElementById('btnProximoTiktik');
    const paginacaoNumerosEl = document.getElementById('paginacaoNumerosTiktik');

    if (!filtroDiaTextoEl || !filtroSemanaTextoEl || !totalPontosEl || !listaAtividadesEl || !btnAnteriorEl || !btnProximoEl || !paginacaoNumerosEl) {
        console.error('Um ou mais elementos do detalhamento Tiktik não foram encontrados no DOM.');
        // Poderia mostrar um erro na UI aqui se a listaAtividadesEl existir
        if(listaAtividadesEl) listaAtividadesEl.innerHTML = '<li>Erro ao carregar estrutura do detalhamento.</li>';
        return;
    }

    // dadosCombinados já devem estar ordenados por data decrescente
    
    function filtrarItensAtuais() {
        if (filtroAtivo === 'dia') {
            const diaSelecionado = normalizarDataParaComparacao(dataSelecionadaDia);
            return dadosCombinados.filter(item => normalizarDataParaComparacao(item.data).getTime() === diaSelecionado.getTime());
        } else { // filtroAtivo === 'semana'
            const inicioSemanaSelecionada = normalizarDataParaComparacao(dataSelecionadaSemana);
            inicioSemanaSelecionada.setDate(inicioSemanaSelecionada.getDate() - inicioSemanaSelecionada.getDay());
            const fimSemanaSelecionada = new Date(inicioSemanaSelecionada);
            fimSemanaSelecionada.setDate(inicioSemanaSelecionada.getDate() + 6);
            fimSemanaSelecionada.setHours(23, 59, 59, 999);
            return dadosCombinados.filter(item => {
                const dataItemNormalizada = normalizarDataParaComparacao(item.data);
                return dataItemNormalizada >= inicioSemanaSelecionada && dataItemNormalizada <= fimSemanaSelecionada;
            });
        }
    }

    function calcularTotalPontosFiltrados(itensFiltrados) {
        return itensFiltrados.reduce((total, item) => total + (item.pontos_gerados || 0), 0);
    }

    function renderizarPaginacaoDetalhes(itensFiltrados) {
        const totalItens = itensFiltrados.length;
        const totalPaginas = Math.ceil(totalItens / ITENS_POR_PAGINA_DETALHES);
        paginacaoNumerosEl.innerHTML = '';

        const deveMostrarPaginacao = totalPaginas > 1;
        btnAnteriorEl.style.display = deveMostrarPaginacao ? 'inline-flex' : 'none';
        btnProximoEl.style.display = deveMostrarPaginacao ? 'inline-flex' : 'none';
        paginacaoNumerosEl.style.display = deveMostrarPaginacao ? 'flex' : 'none';
        
        if (!deveMostrarPaginacao) {
            btnAnteriorEl.disabled = true;
            btnProximoEl.disabled = true;
            return;
        }
        
        const criarBotaoPagina = (numeroPagina) => {
            const btn = document.createElement('button');
            btn.textContent = numeroPagina;
            // Adicionar classes dt- se você criou estilos específicos para botões de paginação
            btn.className = (numeroPagina === paginaAtualDetalhes ? 'active' : 'inactive'); 
            btn.addEventListener('click', () => {
                paginaAtualDetalhes = numeroPagina;
                renderizarItensDetalhados(); 
                listaAtividadesEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            return btn;
        };

        const criarDots = () => {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.style.margin = '0 5px';
            dots.style.color = 'var(--dt-cor-cinza-texto-secundario, #6c757d)'; // Usa var CSS
            return dots;
        };

        // Lógica de paginação "inteligente"
        const maxBotoesLado = 1; // Quantos botões de cada lado do atual, além do primeiro e último
        const primeiroBotao = 1;
        const ultimoBotao = totalPaginas;

        // Botão da Primeira Página
        paginacaoNumerosEl.appendChild(criarBotaoPagina(primeiroBotao));

        // "..." à esquerda
        if (paginaAtualDetalhes > primeiroBotao + maxBotoesLado + 1) {
            paginacaoNumerosEl.appendChild(criarDots());
        }

        // Botões do Meio
        let inicioLoop = Math.max(primeiroBotao + 1, paginaAtualDetalhes - maxBotoesLado);
        let fimLoop = Math.min(ultimoBotao - 1, paginaAtualDetalhes + maxBotoesLado);

        for (let i = inicioLoop; i <= fimLoop; i++) {
            paginacaoNumerosEl.appendChild(criarBotaoPagina(i));
        }

        // "..." à direita
        if (paginaAtualDetalhes < ultimoBotao - maxBotoesLado - 1) {
            paginacaoNumerosEl.appendChild(criarDots());
        }

        // Botão da Última Página (só adiciona se não for o mesmo que o primeiro)
        if (totalPaginas > 1) {
            paginacaoNumerosEl.appendChild(criarBotaoPagina(ultimoBotao));
        }
        
        btnAnteriorEl.disabled = (paginaAtualDetalhes === 1);
        btnProximoEl.disabled = (paginaAtualDetalhes === totalPaginas || totalPaginas === 0);
    }

    function renderizarItensDetalhados() {
        const itensFiltrados = filtrarItensAtuais();
        const inicio = (paginaAtualDetalhes - 1) * ITENS_POR_PAGINA_DETALHES;
        const fim = inicio + ITENS_POR_PAGINA_DETALHES;
        const itensParaExibir = itensFiltrados.slice(inicio, fim);

        listaAtividadesEl.innerHTML = itensParaExibir.length > 0
            ? itensParaExibir.map(item => `
                <div class="dt-atividade-item">
                    <p><strong>Produto:</strong> ${item.produto} ${item.variacao ? `[${item.variacao}]` : ''}</p>
                    <p><strong>Tipo:</strong> ${item.tipoOrigem === 'OP' ? `Prod. OP ${item.opNumero || ''} (${item.processo || 'N/A'})` : `Arremate OP ${item.opNumero || 'N/A'}`}</p>
                    <p><strong>Pontos:</strong> ${(item.pontos_gerados || 0).toFixed(2)}</p>
                    <p><strong>Hora:</strong> ${item.data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    ${item.assinada !== undefined ? `<p><strong>Status:</strong> ${item.assinada ? 'Assinado' : 'Pendente'}</p>` : ''}
                </div>
            `).join('')
            : '<li>Nenhuma atividade encontrada para o período selecionado.</li>';

        const totalPontos = calcularTotalPontosFiltrados(itensFiltrados);
        totalPontosEl.textContent = `TOTAL DE PONTOS: ${Math.round(totalPontos)}`;
        renderizarPaginacaoDetalhes(itensFiltrados);
    }
    
    // Atualiza classes 'active' dos filtros de texto
    if (filtroDiaTextoEl && filtroSemanaTextoEl) {
        filtroDiaTextoEl.classList.toggle('active', filtroAtivo === 'dia');
        filtroSemanaTextoEl.classList.toggle('active', filtroAtivo === 'semana');
    }

    renderizarItensDetalhados();
}


// --- FUNÇÕES DE EVENTOS E INICIALIZAÇÃO ---
async function verificarAutenticacaoTiktik() {
    const auth = await verificarAutenticacao('dashboard-tiktik', ['acesso-dashboard-tiktik']); 
    if (!auth) {
        window.location.href = '/index.html'; // Ou página de acesso negado
        return null;
    }
    return auth.usuario;
}

function atualizarTextoDatepickerSemanaTiktik() {
    const inputSemana = $("#datepickerSemanaTiktik");
    if (!inputSemana.length) return;
    const dataBase = new Date(dataSelecionadaSemana.getTime());
    dataBase.setDate(dataBase.getDate() - dataBase.getDay());
    const inicioSemana = new Date(dataBase.getTime());
    const fimSemana = new Date(inicioSemana.getTime());
    fimSemana.setDate(inicioSemana.getDate() + 6);
    inputSemana.val(`${inicioSemana.toLocaleDateString('pt-BR')} - ${fimSemana.toLocaleDateString('pt-BR')}`);
}


document.addEventListener('DOMContentLoaded', async () => {
    usuarioLogado = await verificarAutenticacaoTiktik();
    if (!usuarioLogado) {
        document.body.classList.remove('dt-body');
        document.body.innerHTML = '<p style="text-align:center; padding:20px;font-size:1.2em;color:var(--dt-cor-perigo);">Falha na autenticação. Redirecionando...</p>';
        return;
    }
    document.body.classList.add('autenticado');

    const listaAtividadesEl = document.getElementById('listaProducaoTiktik');
    const btnAnteriorPaginacao = document.getElementById('btnAnteriorTiktik');
    const btnProximoPaginacao = document.getElementById('btnProximoTiktik');
    const filtroDiaTextoEl = document.getElementById('filtroDiaTiktik');
    const filtroSemanaTextoEl = document.getElementById('filtroSemanaTiktik');
    const datepickerDiaEl = $("#datepickerDiaTiktik");
    const datepickerSemanaEl = $("#datepickerSemanaTiktik");
    const metaSelectEl = document.getElementById('metaSelectTiktik');
    const editarMetaBtnEl = document.getElementById('editarMetaBtnTiktik');
    const fecharPopupSemAssinaturasBtn = document.getElementById('fecharPopupSemAssinaturasTiktik');
    const logoutBtnEl = document.getElementById('logoutBtn');
    const btnConferirAssinaturasEl = document.getElementById('btnConferirAssinaturasTiktik');

    function mostrarSpinnerGeral(mensagem = "Carregando...") {
        let spinnerOverlay = document.getElementById('dt-fullpage-spinner-overlay');
        if (!spinnerOverlay) {
            spinnerOverlay = document.createElement('div');
            spinnerOverlay.id = 'dt-fullpage-spinner-overlay';
            spinnerOverlay.style.position = 'fixed';
            spinnerOverlay.style.top = '0';
            spinnerOverlay.style.left = '0';
            spinnerOverlay.style.width = '100%';
            spinnerOverlay.style.height = '100%';
            spinnerOverlay.style.backgroundColor = 'rgba(255,255,255,0.7)';
            spinnerOverlay.style.zIndex = '20000';
            spinnerOverlay.style.display = 'flex';
            spinnerOverlay.style.justifyContent = 'center';
            spinnerOverlay.style.alignItems = 'center';
            spinnerOverlay.innerHTML = `<div class="dt-spinner-container" style="flex-direction:column; gap:10px;">
                                           <div class="dt-spinner" style="width:40px; height:40px; border-width:4px; margin-right:0;"></div>
                                           <p style="color:var(--dt-cor-texto-principal); font-weight:500;">${mensagem}</p>
                                       </div>`;
            document.body.appendChild(spinnerOverlay);
        }
        spinnerOverlay.querySelector('p').textContent = mensagem; // Atualiza a mensagem
        spinnerOverlay.style.display = 'flex';
    }
    function esconderSpinnerGeral() {
        const spinnerOverlay = document.getElementById('dt-fullpage-spinner-overlay');
        if (spinnerOverlay) {
            spinnerOverlay.style.display = 'none';
        }
    }
    
   function mostrarSpinnerDetalhesAtividades() {
    const listaAtividadesEl = document.getElementById('listaProducaoTiktik');
    if (listaAtividadesEl) {
        listaAtividadesEl.innerHTML = `<div class="dt-spinner-container"><div class="dt-spinner"></div>Carregando atividades...</div>`;
    }

    const btnAnteriorPaginacao = document.getElementById('btnAnteriorTiktik');
    const btnProximoPaginacao = document.getElementById('btnProximoTiktik');
    const filtroDiaTextoEl = document.getElementById('filtroDiaTiktik');
    const filtroSemanaTextoEl = document.getElementById('filtroSemanaTiktik');
    const datepickerDiaEl = $("#datepickerDiaTiktik");
    const datepickerSemanaEl = $("#datepickerSemanaTiktik");
    const paginacaoContainerEl = document.getElementById('paginacaoContainerTiktik');

    if (paginacaoContainerEl) {
        paginacaoContainerEl.style.setProperty('visibility', 'hidden', 'important');
    }
    if (btnAnteriorPaginacao) { btnAnteriorPaginacao.style.pointerEvents = 'none'; btnAnteriorPaginacao.style.opacity = '0.7'; }
    if (btnProximoPaginacao) { btnProximoPaginacao.style.pointerEvents = 'none'; btnProximoPaginacao.style.opacity = '0.7'; }
    if (filtroDiaTextoEl) { filtroDiaTextoEl.style.pointerEvents = 'none'; filtroDiaTextoEl.style.opacity = '0.7'; }
    if (filtroSemanaTextoEl) { filtroSemanaTextoEl.style.pointerEvents = 'none'; filtroSemanaTextoEl.style.opacity = '0.7'; }
    
    if (datepickerDiaEl.length) datepickerDiaEl.datepicker("option", "disabled", true);
    if (datepickerSemanaEl.length) datepickerSemanaEl.datepicker("option", "disabled", true);
}

    function esconderSpinnerDetalhesAtividades() {
    const btnAnteriorPaginacao = document.getElementById('btnAnteriorTiktik');
    const btnProximoPaginacao = document.getElementById('btnProximoTiktik');
    const filtroDiaTextoEl = document.getElementById('filtroDiaTiktik');
    const filtroSemanaTextoEl = document.getElementById('filtroSemanaTiktik');
    const datepickerDiaEl = $("#datepickerDiaTiktik");
    const datepickerSemanaEl = $("#datepickerSemanaTiktik");
    const paginacaoContainerEl = document.getElementById('paginacaoContainerTiktik');

    if (paginacaoContainerEl) {
        paginacaoContainerEl.style.visibility = 'visible';
    }
    if (btnAnteriorPaginacao) { btnAnteriorPaginacao.style.pointerEvents = 'auto'; btnAnteriorPaginacao.style.opacity = '1'; }
    if (btnProximoPaginacao) { btnProximoPaginacao.style.pointerEvents = 'auto'; btnProximoPaginacao.style.opacity = '1'; }
    if (filtroDiaTextoEl) { filtroDiaTextoEl.style.pointerEvents = 'auto'; filtroDiaTextoEl.style.opacity = '1'; }
    if (filtroSemanaTextoEl) { filtroSemanaTextoEl.style.pointerEvents = 'auto'; filtroSemanaTextoEl.style.opacity = '1'; }

    if (datepickerDiaEl.length) datepickerDiaEl.datepicker("option", "disabled", false);
    if (datepickerSemanaEl.length) datepickerSemanaEl.datepicker("option", "disabled", false);
}

    const atualizarDetalhesComSpinner = async () => {
        mostrarSpinnerDetalhesAtividades();
        try {
            atualizarDetalhamentoProducaoTiktik(dadosProducaoCombinadosCache);
        } catch (error) {
            console.error("Erro ao atualizar detalhamento Tiktik:", error);
            mostrarPopupDT("Falha ao carregar detalhes das atividades.", "erro");
        } finally {
            esconderSpinnerDetalhesAtividades();
        }
    };
    
    if ($.datepicker && $.datepicker.regional['pt-BR']) {
        $.datepicker.setDefaults($.datepicker.regional['pt-BR']);
    } else {
        console.warn("Localização pt-BR do jQuery UI Datepicker não carregada. Usando fallback manual.");
        $.datepicker.setDefaults({
            monthNames: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
            monthNamesShort: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
            dayNames: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],
            dayNamesShort: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
            dayNamesMin: ['D','S','T','Q','Q','S','S'],
            dateFormat: 'dd/mm/yy', firstDay: 0, isRTL: false, showMonthAfterYear: false, yearSuffix: ''
        });
    }

    mostrarSpinnerGeral("Carregando Dashboard Tiktik...");

    try {
        await atualizarDashboard(true); // Carga inicial de todos os dados e cards

       // **** AJUSTE PARA O ESTADO INICIAL DO BOTÃO DE META (REVISADO) ****
        console.log("[DOMContentLoaded] Iniciando sincronização do botão de meta.");
        if (metaSelectEl && editarMetaBtnEl) {
            console.log("[DOMContentLoaded] Estado do metaSelectEl ANTES da sincronização: Disabled:", metaSelectEl.disabled, "Value:", metaSelectEl.value, "Options:", metaSelectEl.options.length);

            // A função carregarMetasSelectTiktik é chamada por atualizarCardMetaTiktik,
            // que é chamada por atualizarDashboard.
            // Ela DEVE ter desabilitado o select se metas foram carregadas.
            if (metaSelectEl.disabled && metaSelectEl.options.length > 0 && metaSelectEl.value !== "") {
                console.log("[DOMContentLoaded] Condição para 'Editar Meta' ATENDIDA. Alterando botão.");
                editarMetaBtnEl.innerHTML = '<i class="fas fa-edit"></i> Editar Meta';
            } else if (!metaSelectEl.disabled && metaSelectEl.options.length > 0 && metaSelectEl.value !== "") {
                // Se o select foi carregado com uma meta mas, por algum motivo, NÃO está desabilitado,
                // talvez o botão devesse ser "Confirmar Meta" ou algo que force uma ação.
                // Ou forçar a desabilitação e o botão para "Editar".
                console.warn("[DOMContentLoaded] metaSelectEl carregado com valor mas NÃO está desabilitado. Forçando 'Editar Meta' e desabilitando select.");
                metaSelectEl.disabled = true; // Força desabilitar
                editarMetaBtnEl.innerHTML = '<i class="fas fa-edit"></i> Editar Meta';
            } else if (metaSelectEl.options.length === 0 || metaSelectEl.value === "") {
                console.log("[DOMContentLoaded] Nenhuma meta carregada ou selecionada no select. Botão deve ser 'Confirmar Meta' ou texto padrão.");
                // Se não há metas, o select estará desabilitado por carregarMetasSelectTiktik.
                // O botão deve indicar que precisa de uma ação ou que não há o que editar.
                // Manter o texto padrão do botão ou "Confirmar Meta" se o select estiver vazio/editável.
                // A lógica do listener de clique do botão já trata o caso de não haver valor selecionado.
                // Se o select está vazio e desabilitado (por não ter metas), o botão "Editar Meta" não faria sentido.
                // Se você quiser um texto diferente para "nenhuma meta", adicione aqui.
                // Por ora, se não cair no if acima, o texto do botão permanecerá o que estiver no HTML ou
                // o que o listener de clique definir.
            }
             console.log("[DOMContentLoaded] Estado FINAL do editarMetaBtnEl.innerHTML:", editarMetaBtnEl.innerHTML);
        } else {
            console.warn("[DOMContentLoaded] metaSelectEl ou editarMetaBtnEl não encontrado para sincronização.");
        }
        // **** FIM DO AJUSTE ****

        // Configuração dos Datepickers
        if (datepickerDiaEl.length) {
            datepickerDiaEl.datepicker({
                dateFormat: 'dd/mm/yy', defaultDate: dataSelecionadaDia,
                onSelect: async function() { // Removido dateText se não usado
                    dataSelecionadaDia = datepickerDiaEl.datepicker('getDate'); // Pega a data diretamente
                    paginaAtualDetalhes = 1; filtroAtivo = 'dia';
                    await atualizarDetalhesComSpinner();
                    listaAtividadesEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }).datepicker('setDate', dataSelecionadaDia);
        }

        if (datepickerSemanaEl.length) {
            datepickerSemanaEl.datepicker({
                dateFormat: 'dd/mm/yy',
                onSelect: async function() { // Removido dateText se não usado
                    dataSelecionadaSemana = datepickerSemanaEl.datepicker('getDate'); 
                    atualizarTextoDatepickerSemanaTiktik();
                    paginaAtualDetalhes = 1; filtroAtivo = 'semana';
                    await atualizarDetalhesComSpinner();
                    listaAtividadesEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            dataSelecionadaSemana = new Date(); // Define para hoje na inicialização
            atualizarTextoDatepickerSemanaTiktik(); // Atualiza o display do input
        }

        // Listeners para os TEXTOS "Filtrar por Dia" e "Filtrar por Semana"
        if (filtroDiaTextoEl) {
            filtroDiaTextoEl.addEventListener('click', async () => {
                const dataAtualPicker = datepickerDiaEl.datepicker('getDate');
                if (filtroAtivo === 'dia' && dataAtualPicker && dataSelecionadaDia && dataAtualPicker.getTime() === dataSelecionadaDia.getTime()) return;
                
                paginaAtualDetalhes = 1; filtroAtivo = 'dia';
                const dataDoPicker = datepickerDiaEl.datepicker('getDate');
                if (dataDoPicker) dataSelecionadaDia = dataDoPicker;
                else datepickerDiaEl.datepicker('setDate', dataSelecionadaDia); // Seta se estiver vazio
                
                await atualizarDetalhesComSpinner();
                listaAtividadesEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        if (filtroSemanaTextoEl) {
            filtroSemanaTextoEl.addEventListener('click', async () => {
                paginaAtualDetalhes = 1; filtroAtivo = 'semana';
                // dataSelecionadaSemana já deve ter um valor (do onSelect ou da inicialização)
                atualizarTextoDatepickerSemanaTiktik(); 
                await atualizarDetalhesComSpinner();
                listaAtividadesEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        // Listeners para os botões de paginação Anterior/Próximo
        if (btnAnteriorPaginacao) {
            btnAnteriorPaginacao.addEventListener('click', () => {
                if (paginaAtualDetalhes > 1 && !btnAnteriorPaginacao.disabled) {
                    paginaAtualDetalhes--;
                    atualizarDetalhesComSpinner();
                }
            });
        }
        if (btnProximoPaginacao) {
            btnProximoPaginacao.addEventListener('click', () => {
                if (!btnProximoPaginacao.disabled) {
                    paginaAtualDetalhes++;
                    atualizarDetalhesComSpinner();
                }
            });
        }

        // Listener para o botão Editar/Confirmar Meta (FLUXO B - Salva apenas no clique de "Confirmar")
        if (editarMetaBtnEl && metaSelectEl) {
            editarMetaBtnEl.addEventListener('click', async () => { 
                if (metaSelectEl.disabled) {
                    metaSelectEl.disabled = false;
                    editarMetaBtnEl.innerHTML = '<i class="fas fa-save"></i> Confirmar Meta'; 
                    metaSelectEl.focus(); 
                } else {
                    const todasMetas = obterMetasTiktik();
                    const indiceSelecionado = parseInt(metaSelectEl.value); 
                    let metaParaSalvarEExibir;

                    if (!isNaN(indiceSelecionado) && todasMetas[indiceSelecionado]) {
                        metaParaSalvarEExibir = todasMetas[indiceSelecionado];
                    } else if (todasMetas.length > 0) { 
                        console.warn("Nenhuma meta válida selecionada, usando primeira meta como padrão.");
                        metaParaSalvarEExibir = todasMetas[0];
                        metaSelectEl.value = "0"; 
                    } else {
                        mostrarPopupDT("Nenhuma meta configurada para selecionar.", "aviso");
                        return; 
                    }
                    
                    metaSelectEl.disabled = true; 
                    editarMetaBtnEl.innerHTML = '<i class="fas fa-edit"></i> Editar Meta'; 
                    
                    const metaSelecionadaTexto = metaParaSalvarEExibir.descricao ? 
                        `${metaParaSalvarEExibir.descricao}: ${metaParaSalvarEExibir.pontos} Pontos (R$ ${metaParaSalvarEExibir.valor.toFixed(2)})` : 
                        `${metaParaSalvarEExibir.pontos} Pontos (R$ ${metaParaSalvarEExibir.valor.toFixed(2)})`;

                    salvarMetaSelecionadaTiktik(metaParaSalvarEExibir); 
                    
                    try {
                        atualizarCardMetaTiktik(dadosProducaoCombinadosCache); 
                    } catch (error) {
                        console.error("Erro ao atualizar card de meta Tiktik após confirmação:", error);
                        mostrarPopupDT("Erro ao atualizar a exibição da meta.", "erro");
                    }
                    mostrarPopupDT(`Meta atualizada para: ${metaSelecionadaTexto}!`, 'sucesso', 3000);
                }
            });
        }
        // O listener para 'change' do metaSelectEl FOI REMOVIDO para implementar o Fluxo B.

        if (fecharPopupSemAssinaturasBtn) {
            fecharPopupSemAssinaturasBtn.addEventListener('click', () => {
                document.getElementById('popupSemAssinaturasTiktik')?.classList.remove('ativo');
            });
        }

        if (logoutBtnEl) logoutBtnEl.addEventListener('click', logout);

        if(btnConferirAssinaturasEl) {
            btnConferirAssinaturasEl.addEventListener('click', async () => {
                mostrarSpinnerGeral("Verificando pendências...");
                try {
                    const dadosRecentes = await obterDadosProducaoCombinados(true); 
                    atualizarCardAssinaturaTiktik(dadosRecentes); 
                } catch (error) {
                    mostrarPopupDT("Erro ao buscar dados para assinatura.", "erro");
                } finally {
                    esconderSpinnerGeral();
                }
            });
        }

    } catch (e) {
        console.error("Erro crítico na inicialização da Dashboard Tiktik:", e);
        mostrarPopupDT("Erro grave ao carregar o dashboard. Tente novamente mais tarde.", "erro");
    } finally {
        esconderSpinnerGeral();
    }
});