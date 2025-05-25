// public/js/tiktik-dashboard.js
import { verificarAutenticacao, logout } from '/js/utils/auth.js';
import { criarGrafico } from '/js/utils/chart-utils.js'; // Usaremos o mesmo
import { obterMetasTiktik } from '/js/utils/metas-tiktik.js'; // Novo arquivo de metas
import { obterProdutos } from '/js/utils/storage.js';
import { getCicloAtual, getObjetoCicloCompletoAtual } from '/js/utils/ciclos.js';
import { formatarData } from '/js/utils/date-utils.js';
// Variáveis globais
let usuarioLogado = null;
// let processosExibidos = 0; // Se for controlar a exibição de itens na lista
let filtroAtivo = 'dia'; // Padrão: dia
let dataSelecionadaDia = new Date(); 
let dataSelecionadaSemana = new Date();
let paginaAtualDetalhes = 1;
const ITENS_POR_PAGINA_DETALHES = 8; // Constante para itens por página

let dadosProducaoCombinadosCache = []; // Cache para os dados combinados

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
    if (!forceRefresh && dadosProducaoCombinadosCache.length > 0) {
        console.log('[obterDadosProducaoCombinados] Usando cache.');
        return dadosProducaoCombinadosCache;
    }
    console.log('[obterDadosProducaoCombinados] Buscando dados...');

    const producoesOP = await obterProducoesApi();
    const arremates = await obterArrematesDoUsuarioApi();
    const dadosCombinados = [];

    producoesOP.forEach(p => {
        if (p.funcionario === usuarioLogado.nome) { // Confirma se é do usuário logado
            dadosCombinados.push({
                tipoOrigem: 'OP',
                idOriginal: p.id,
                data: new Date(p.data),
                produto: p.produto,
                variacao: p.variacao,
                quantidade: parseInt(p.quantidade) || 0,
                opNumero: p.op_numero,
                processo: p.processo,
            });
        }
    });

    arremates.forEach(arr => {
        dadosCombinados.push({
            tipoOrigem: 'Arremate',
            idOriginal: arr.id,
            data: new Date(arr.data_lancamento),
            produto: arr.produto,
            variacao: arr.variante,
            quantidade: parseInt(arr.quantidade_arrematada) || 0,
            opNumero: arr.op_numero,
            processo: 'Arremate',
        });
    });
    
    dadosCombinados.sort((a, b) => b.data.getTime() - a.data.getTime());
    dadosProducaoCombinadosCache = dadosCombinados; // Atualiza o cache
    return dadosCombinados;
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
    const metaSalva = localStorage.getItem(`metaSelecionadaTiktik_${usuarioLogado.nome}`);
    if (metaSalva) {
        try {
            return JSON.parse(metaSalva); // As metas agora têm tipo e quantidade
        } catch (e) {
            console.error("Erro ao parsear meta salva do localStorage", e);
            return null;
        }
    }
    // Se não houver nada salvo, podemos pegar a primeira meta diária como padrão
    const metasDisponiveis = obterMetasTiktik('diaria');
    return metasDisponiveis.length > 0 ? metasDisponiveis[0] : null;
}

function salvarMetaSelecionadaTiktik(metaObj) { // Salva o objeto da meta
    localStorage.setItem(`metaSelecionadaTiktik_${usuarioLogado.nome}`, JSON.stringify(metaObj));
}

function carregarMetasSelectTiktik(metaAtualObj) {
    const metas = obterMetasTiktik(); // Pega todas as metas
    const metaSelect = document.getElementById('metaSelectTiktik');
    
    if (!metas || metas.length === 0) {
        metaSelect.innerHTML = '<option value="">Nenhuma meta disponível</option>';
        return;
    }
    
    // O valor da option será o índice da meta no array METAS_TIKTIK para fácil recuperação
    metaSelect.innerHTML = metas.map((m, index) => 
        `<option value="${index}" ${metaAtualObj && m.descricao === metaAtualObj.descricao && m.quantidade === metaAtualObj.quantidade ? 'selected' : ''}>${m.descricao} (${m.quantidade} arremates)</option>`
    ).join('');
    metaSelect.disabled = true;
}

async function atualizarDashboard(forceRefreshData = false) {
    try {
        if (!usuarioLogado) {
            console.error("[atualizarDashboard] Usuário Tiktik não logado.");
            document.getElementById('saudacaoTiktik').textContent = 'Erro: Usuário não identificado.';
            return; 
        }

        const dadosCombinados = await obterDadosProducaoCombinados(forceRefreshData);
        // const produtos = await obterProdutos(); // Se precisar para algo específico dos produtos

        atualizarSaudacao();
        // Não há nível para Tiktik

        atualizarCardMetaTiktik(dadosCombinados);
        atualizarGraficoProducaoTiktik(dadosCombinados); 
        await atualizarCardAndamentoCicloTiktik(dadosCombinados);
        atualizarDetalhamentoProducaoTiktik(dadosCombinados);

    } catch (error) {
        console.error('[atualizarDashboard Tiktik] Erro ao carregar dados:', error.message, error.stack);
        const saudacaoEl = document.getElementById('saudacaoTiktik');
        if (saudacaoEl) saudacaoEl.textContent = 'Ops! Algo deu errado ao carregar seus dados.';
        alert('Erro ao carregar o dashboard Tiktik. Verifique sua conexão e tente recarregar a página.');
    }
}

function atualizarCardMetaTiktik(dadosCombinados) {
    const metaSelect = document.getElementById('metaSelectTiktik');
    let metaSelecionadaObj = getMetaSelecionadaTiktik();

    if (!metaSelecionadaObj && metaSelect && metaSelect.value !== "") {
        const todasMetas = obterMetasTiktik();
        metaSelecionadaObj = todasMetas[parseInt(metaSelect.value)];
    } else if (!metaSelecionadaObj) {
        const metasDiarias = obterMetasTiktik('diaria');
        metaSelecionadaObj = metasDiarias.length > 0 ? metasDiarias[0] : { tipo: 'diaria', descricao: 'Padrão', quantidade: 0 };
    }
    
    carregarMetasSelectTiktik(metaSelecionadaObj);

    const cicloInfo = getCicloAtual(); 
    if (!cicloInfo || !cicloInfo.semana) {
        console.error('Nenhuma semana de ciclo atual encontrada para o card de metas Tiktik.');
        // Lógica para UI quando não há ciclo (similar à costureira, mas adaptado para Tiktik IDs)
        document.getElementById('quantidadeProduzidaTiktik').textContent = 0;
        document.getElementById('itensFaltantesTiktik').textContent = 'Informação da semana/dia atual indisponível.';
        return;
    }

    let producoesNoPeriodoMeta;
    if (metaSelecionadaObj.tipo === 'diaria') {
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        producoesNoPeriodoMeta = dadosCombinados.filter(item => {
            const dataItem = new Date(item.data);
            dataItem.setHours(0,0,0,0);
            return dataItem.getTime() === hoje.getTime();
        });
    } else { // semanal
        const inicioSemana = cicloInfo.semana.inicio; 
        const fimSemana = cicloInfo.semana.fim;
        producoesNoPeriodoMeta = dadosCombinados.filter(item => {
            const dataItem = new Date(item.data);
            return dataItem >= inicioSemana && dataItem <= fimSemana;
        });
    }

    const totalQuantidadeNoPeriodo = producoesNoPeriodoMeta.reduce((sum, item) => sum + (item.quantidade || 0), 0);
    
    const progresso = metaSelecionadaObj.quantidade > 0 ? (totalQuantidadeNoPeriodo / metaSelecionadaObj.quantidade) * 100 : 0;
    
    document.getElementById('progressoBarraTiktik').style.width = `${Math.min(progresso, 100)}%`;
    document.getElementById('quantidadeProduzidaTiktik').textContent = Math.round(totalQuantidadeNoPeriodo);

    const itensFaltantes = metaSelecionadaObj.quantidade - totalQuantidadeNoPeriodo;
    const faltantesEl = document.getElementById('itensFaltantesTiktik');
    if (metaSelecionadaObj.quantidade > 0) {
        faltantesEl.innerHTML = itensFaltantes > 0 
            ? `Faltam <span class="highlight">${Math.ceil(itensFaltantes)}</span> arremates para a meta de ${metaSelecionadaObj.quantidade}`
            : 'Meta atingida!';
    } else {
        faltantesEl.innerHTML = 'Nenhuma meta selecionada.';
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
        horas[hora] += (item.quantidade || 0);
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
    const dados = horas;

    const ctx = document.getElementById('graficoProducaoDiaTiktik').getContext('2d');
    if (window.graficoProducaoTiktik) window.graficoProducaoTiktik.destroy();
    
    ctx.canvas.style.width = '100%';
    ctx.canvas.style.height = 'auto'; // Ou um valor fixo se preferir

    window.graficoProducaoTiktik = criarGrafico(
        ctx, 'line', labels, '', dados,
        ['rgba(75, 192, 192, 0.2)'], // Cor da área (exemplo)
        ['rgba(75, 192, 192, 1)']    // Cor da linha (exemplo)
    );
}

async function atualizarCardAndamentoCicloTiktik(dadosCombinados) {
    const cardContainer = document.getElementById('cd-weeks-list-tiktik');
    const tituloEl = document.getElementById('tituloAndamentoCicloTiktik');

    if (!cardContainer || !tituloEl) return;
    cardContainer.innerHTML = '<p>Analisando seu progresso...</p>';

    const cicloCompletoAtual = getObjetoCicloCompletoAtual(new Date());

    if (!cicloCompletoAtual || !cicloCompletoAtual.semanas || cicloCompletoAtual.semanas.length === 0) {
        tituloEl.textContent = 'Nenhum ciclo ativo no momento.';
        cardContainer.innerHTML = '<p>Fique de olho para o início do próximo ciclo.</p>';
        return;
    }

    const nomeCiclo = cicloCompletoAtual.nome || "Ciclo Atual";
    tituloEl.textContent = `Sua jornada no ${nomeCiclo}:`;
    cardContainer.innerHTML = ''; 

    const dataReferenciaHoje = new Date();
    const hojeParaComparacao = new Date(dataReferenciaHoje.getFullYear(), dataReferenciaHoje.getMonth(), dataReferenciaHoje.getDate());

    cicloCompletoAtual.semanas.forEach((semana, index) => {
        const inicioSemanaDate = new Date(semana.inicio + 'T00:00:00-03:00');
        const fimSemanaDate = new Date(semana.fim + 'T23:59:59-03:00');

        const producoesDaSemana = dadosCombinados.filter(item => {
            const dataItem = new Date(item.data);
            return dataItem >= inicioSemanaDate && dataItem <= fimSemanaDate;
        });

        const totalItensSemana = producoesDaSemana.reduce((sum, item) => sum + (item.quantidade || 0), 0);

        const inicioSemanaParaComparacao = new Date(inicioSemanaDate.getFullYear(), inicioSemanaDate.getMonth(), inicioSemanaDate.getDate());
        const fimSemanaParaComparacao = new Date(fimSemanaDate.getFullYear(), fimSemanaDate.getMonth(), fimSemanaDate.getDate());
        const isSemanaAtual = hojeParaComparacao >= inicioSemanaParaComparacao && hojeParaComparacao <= fimSemanaParaComparacao;

        const semanaDiv = document.createElement('div');
        semanaDiv.className = 'cd-week-item'; // Usar mesma classe CSS por enquanto
        semanaDiv.innerHTML = `
            <button class="${isSemanaAtual ? 'semana-atual-cd' : ''}" disabled>
                S${index + 1} (${formatarData(semana.inicio)} a ${formatarData(semana.fim)})
            </button>
            <span class="${isSemanaAtual ? 'pontos-atual-cd' : ''}">
                ${Math.round(totalItensSemana)} ${Math.round(totalItensSemana) === 1 ? 'Arremate' : 'Arremates'}
            </span>
        `;
        cardContainer.appendChild(semanaDiv);
    });
    if (cicloCompletoAtual.semanas.length === 0 && cardContainer.innerHTML === '') {
        cardContainer.innerHTML = '<p>Este ciclo ainda não tem semanas definidas.</p>';
    }
}

function normalizarDataParaComparacao(data) {
    const d = new Date(data);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function atualizarDetalhamentoProducaoTiktik(dadosCombinados) {
    const filtroDiaTexto = document.getElementById('filtroDiaTiktik');
    const filtroSemanaTexto = document.getElementById('filtroSemanaTiktik');
    const totalItensEl = document.getElementById('totalItensTiktik');
    const listaProducaoEl = document.getElementById('listaProducaoTiktik');
    const btnAnterior = document.getElementById('btnAnteriorTiktik');
    const btnProximo = document.getElementById('btnProximoTiktik');
    const paginacaoNumerosEl = document.getElementById('paginacaoNumerosTiktik');

    if (!filtroDiaTexto || !totalItensEl || !listaProducaoEl) {
        console.error('Elementos do detalhamento Tiktik não encontrados.');
        return;
    }

    function filtrarItens() {
        if (filtroAtivo === 'dia') {
            const diaSelecionado = normalizarDataParaComparacao(dataSelecionadaDia);
            return dadosCombinados.filter(item => {
                const dataItem = normalizarDataParaComparacao(item.data);
                return dataItem.getTime() === diaSelecionado.getTime();
            });
        } else { // filtroAtivo === 'semana'
            const inicioSemanaSelecionada = normalizarDataParaComparacao(dataSelecionadaSemana);
            inicioSemanaSelecionada.setDate(inicioSemanaSelecionada.getDate() - inicioSemanaSelecionada.getDay());
            
            const fimSemanaSelecionada = new Date(inicioSemanaSelecionada);
            fimSemanaSelecionada.setDate(inicioSemanaSelecionada.getDate() + 6);
            fimSemanaSelecionada.setHours(23, 59, 59, 999);

            return dadosCombinados.filter(item => {
                const dataItem = normalizarDataParaComparacao(item.data);
                return dataItem >= inicioSemanaSelecionada && dataItem <= fimSemanaSelecionada;
            });
        }
    }

    function calcularTotalItens(itensFiltrados) {
        return itensFiltrados.reduce((total, item) => total + (item.quantidade || 0), 0);
    }

    function renderizarPaginacaoDetalhes(itensFiltrados) {
        const totalPaginas = Math.ceil(itensFiltrados.length / ITENS_POR_PAGINA_DETALHES);
        paginacaoNumerosEl.innerHTML = '';

        // Lógica de paginação simplificada para Tiktik (pode copiar da costureira se quiser mais complexa)
        for (let i = 1; i <= totalPaginas; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.classList.toggle('active', i === paginaAtualDetalhes);
            btn.addEventListener('click', () => {
                paginaAtualDetalhes = i;
                renderizarItensDetalhados();
                listaProducaoEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            paginacaoNumerosEl.appendChild(btn);
        }
        btnAnterior.disabled = paginaAtualDetalhes === 1;
        btnProximo.disabled = paginaAtualDetalhes === totalPaginas || totalPaginas === 0;
    }

    function renderizarItensDetalhados() {
        const itensFiltrados = filtrarItens();
        const inicio = (paginaAtualDetalhes - 1) * ITENS_POR_PAGINA_DETALHES;
        const fim = inicio + ITENS_POR_PAGINA_DETALHES;
        const itensParaExibir = itensFiltrados.slice(inicio, fim);

        listaProducaoEl.innerHTML = itensParaExibir.length > 0 
            ? itensParaExibir.map(item => `
                <div class="processo-item" style="background: #F9F9F9; border: 1px solid #EDEDED; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                    <p><strong>Produto:</strong> ${item.produto} ${item.variacao ? `[${item.variacao}]` : ''}</p>
                    <p><strong>Tipo:</strong> ${item.tipoOrigem === 'OP' ? `Prod. OP ${item.opNumero} (${item.processo || 'N/A'})` : `Arremate OP ${item.opNumero || 'N/A'}`}</p>
                    <p><strong>Quantidade:</strong> ${item.quantidade}</p>
                    <p><strong>Hora:</strong> ${item.data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
            `).join('')
            : '<li>Nenhum arremate encontrado para o período selecionado.</li>';

        const total = calcularTotalItens(itensFiltrados);
        totalItensEl.textContent = `TOTAL DE ARREMATE: ${total}`;
        renderizarPaginacaoDetalhes(itensFiltrados);
    }

    btnAnterior.onclick = () => {
        if (paginaAtualDetalhes > 1) {
            paginaAtualDetalhes--;
            renderizarItensDetalhados();
            listaProducaoEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    btnProximo.onclick = () => {
        const totalPaginas = Math.ceil(filtrarItens().length / ITENS_POR_PAGINA_DETALHES);
        if (paginaAtualDetalhes < totalPaginas) {
            paginaAtualDetalhes++;
            renderizarItensDetalhados();
            listaProducaoEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };
    
    // Chamada inicial para renderizar
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
    if (!usuarioLogado) return;

    await atualizarDashboard(true); // Força refresh na primeira carga

    // Configuração dos Datepickers
    $("#datepickerDiaTiktik").datepicker({
        dateFormat: 'dd/mm/yy',
        defaultDate: dataSelecionadaDia,
        onSelect: async function(dateText) {
            const [dia, mes, ano] = dateText.split('/');
            dataSelecionadaDia = new Date(ano, mes - 1, dia);
            filtroAtivo = 'dia';
            document.getElementById('filtroDiaTiktik').classList.add('active');
            document.getElementById('filtroSemanaTiktik').classList.remove('active');
            paginaAtualDetalhes = 1; // Reseta paginação
            atualizarDetalhamentoProducaoTiktik(dadosProducaoCombinadosCache); // Usa cache
        }
    }).datepicker('setDate', dataSelecionadaDia);

    $("#datepickerSemanaTiktik").datepicker({
        dateFormat: 'dd/mm/yy',
        onSelect: async function(dateText) {
            const [dia, mes, ano] = dateText.split('/');
            dataSelecionadaSemana = new Date(ano, mes - 1, dia); 
            atualizarTextoDatepickerSemanaTiktik();
            filtroAtivo = 'semana';
            document.getElementById('filtroSemanaTiktik').classList.add('active');
            document.getElementById('filtroDiaTiktik').classList.remove('active');
            paginaAtualDetalhes = 1; // Reseta paginação
            atualizarDetalhamentoProducaoTiktik(dadosProducaoCombinadosCache); // Usa cache
        }
    });
    dataSelecionadaSemana = new Date(); // Define para hoje
    atualizarTextoDatepickerSemanaTiktik();

    // Eventos para botões de filtro (Dia/Semana)
    document.getElementById('filtroDiaTiktik').addEventListener('click', async () => {
        if (filtroAtivo === 'dia' && $("#datepickerDiaTiktik").datepicker('getDate').getTime() === dataSelecionadaDia.getTime()) return;
        filtroAtivo = 'dia';
        document.getElementById('filtroDiaTiktik').classList.add('active');
        document.getElementById('filtroSemanaTiktik').classList.remove('active');
         if (!$("#datepickerDiaTiktik").datepicker('getDate') || $("#datepickerDiaTiktik").datepicker('getDate').getTime() !== dataSelecionadaDia.getTime()) {
            $("#datepickerDiaTiktik").datepicker('setDate', dataSelecionadaDia);
        }
        paginaAtualDetalhes = 1;
        atualizarDetalhamentoProducaoTiktik(dadosProducaoCombinadosCache); // Usa cache
        document.getElementById('listaProducaoTiktik').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('filtroSemanaTiktik').addEventListener('click', async () => {
        if (filtroAtivo === 'semana') return;
        filtroAtivo = 'semana';
        document.getElementById('filtroSemanaTiktik').classList.add('active');
        document.getElementById('filtroDiaTiktik').classList.remove('active');
        atualizarTextoDatepickerSemanaTiktik();
        paginaAtualDetalhes = 1;
        atualizarDetalhamentoProducaoTiktik(dadosProducaoCombinadosCache); // Usa cache
        document.getElementById('listaProducaoTiktik').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    
    // Eventos para meta
    const metaSelectEl = document.getElementById('metaSelectTiktik');
    const editarMetaBtnEl = document.getElementById('editarMetaBtnTiktik');

    metaSelectEl.addEventListener('change', async () => {
        const todasMetas = obterMetasTiktik();
        const metaSelecionadaObj = todasMetas[parseInt(metaSelectEl.value)];
        salvarMetaSelecionadaTiktik(metaSelecionadaObj);
        metaSelectEl.disabled = true;
        editarMetaBtnEl.textContent = 'Editar Meta';
        atualizarCardMetaTiktik(dadosProducaoCombinadosCache); // Usa cache
    });

    editarMetaBtnEl.addEventListener('click', () => {
        if (metaSelectEl.disabled) {
            metaSelectEl.disabled = false;
            editarMetaBtnEl.textContent = 'Salvar Meta';
            metaSelectEl.focus();
        } else {
            metaSelectEl.disabled = true;
            editarMetaBtnEl.textContent = 'Editar Meta';
            // A meta já foi salva no 'change' do select, aqui só atualiza o card
            const todasMetas = obterMetasTiktik();
            const metaObj = todasMetas[parseInt(metaSelectEl.value)];
            salvarMetaSelecionadaTiktik(metaObj); // Garante que a última seleção seja salva
            atualizarCardMetaTiktik(dadosProducaoCombinadosCache); // Usa cache
        }
    });

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) logoutBtn.addEventListener('click', logout);
});