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
            const cardsSection = document.querySelector('.dashboard-cards');
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
        alert('Erro ao carregar o dashboard. Verifique sua conexão e tente recarregar a página.');
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

// Adicione esta função em algum lugar no seu arquivo,
// talvez perto das outras funções de atualização de UI.

async function atualizarCardAndamentoCiclo(producoesUsuario, produtos) {
    const cardContainer = document.getElementById('cd-weeks-list');
    const tituloEl = document.getElementById('tituloAndamentoCiclo');

    if (!cardContainer || !tituloEl) {
        console.warn('[atualizarCardAndamentoCiclo] Elementos do card não encontrados.');
        return;
    }

    cardContainer.innerHTML = '<p>Analisando seu progresso...</p>';

    // ANTES: const cicloAtual = getObjetoCicloAtual(new Date()); // Ou algo similar que passamos na resposta anterior
    // DEPOIS: Usar a nova função importada corretamente
    const cicloCompletoAtual = getObjetoCicloCompletoAtual(new Date()); // <<< MUDANÇA AQUI

    // Agora 'cicloCompletoAtual' é o objeto do ciclo ou null
    if (!cicloCompletoAtual || !cicloCompletoAtual.semanas || cicloCompletoAtual.semanas.length === 0) {
        tituloEl.textContent = 'Nenhum ciclo ativo no momento.';
        cardContainer.innerHTML = '<p>Fique de olho para o início do próximo ciclo ou verifique as configurações de ciclo.</p>';
        return;
    }

    // O resto da função usa 'cicloCompletoAtual' no lugar de 'cicloAtual' que usamos no rascunho anterior
    const nomeCiclo = cicloCompletoAtual.nome || "Ciclo Atual";
    tituloEl.textContent = `Sua jornada no ${nomeCiclo}:`;

    const inicioPrimeiraSemanaCiclo = new Date(cicloCompletoAtual.semanas[0].inicio + 'T00:00:00-03:00');
    const fimUltimaSemanaCiclo = new Date(cicloCompletoAtual.semanas[cicloCompletoAtual.semanas.length - 1].fim + 'T23:59:59-03:00');

    const producoesDoCicloParaCostureira = producoesUsuario.filter(p => {
        const dataProducao = new Date(p.data);
        return dataProducao >= inicioPrimeiraSemanaCiclo && dataProducao <= fimUltimaSemanaCiclo;
    });

    cardContainer.innerHTML = ''; 

    const dataReferenciaHoje = new Date();
    const hojeParaComparacao = new Date(dataReferenciaHoje.getFullYear(), dataReferenciaHoje.getMonth(), dataReferenciaHoje.getDate());

    cicloCompletoAtual.semanas.forEach((semana, index) => { // Usa cicloCompletoAtual.semanas
        const inicioSemanaDate = new Date(semana.inicio + 'T00:00:00-03:00');
        const fimSemanaDate = new Date(semana.fim + 'T23:59:59-03:00');

        const producoesDaSemana = producoesDoCicloParaCostureira.filter(p => {
            const dataProducao = new Date(p.data);
            return dataProducao >= inicioSemanaDate && dataProducao <= fimSemanaDate;
        });

        let pontosSemanaPonderados = 0;
        producoesDaSemana.forEach(p => {
            let pontosParaEsteLancamento = 0;
            if (p.pontos_gerados !== undefined && p.pontos_gerados !== null && String(p.pontos_gerados).trim() !== "") {
                const valorFloat = parseFloat(p.pontos_gerados);
                if (!isNaN(valorFloat)) {
                    pontosParaEsteLancamento = valorFloat;
                } else {
                    pontosParaEsteLancamento = p.quantidade; 
                }
            } else {
                pontosParaEsteLancamento = p.quantidade; 
            }
            pontosSemanaPonderados += pontosParaEsteLancamento;
        });

        const inicioSemanaParaComparacao = new Date(inicioSemanaDate.getFullYear(), inicioSemanaDate.getMonth(), inicioSemanaDate.getDate());
        const fimSemanaParaComparacao = new Date(fimSemanaDate.getFullYear(), fimSemanaDate.getMonth(), fimSemanaDate.getDate());
        const isSemanaAtual = hojeParaComparacao >= inicioSemanaParaComparacao && hojeParaComparacao <= fimSemanaParaComparacao;

        const semanaDiv = document.createElement('div');
        semanaDiv.className = 'cd-week-item';
        semanaDiv.innerHTML = `
            <button class="${isSemanaAtual ? 'semana-atual-cd' : ''}" disabled>
                S${index + 1} (${formatarData(semana.inicio)} a ${formatarData(semana.fim)})
            </button>
            <span class="${isSemanaAtual ? 'pontos-atual-cd' : ''}">
                ${Math.round(pontosSemanaPonderados)} ${Math.round(pontosSemanaPonderados) === 1 ? 'Ponto' : 'Pontos'}
            </span>
        `;
        cardContainer.appendChild(semanaDiv);
    });
     if (cicloCompletoAtual.semanas.length === 0 && cardContainer.innerHTML === '') { // Adicional para garantir mensagem se não houver semanas
        cardContainer.innerHTML = '<p>Este ciclo ainda não tem semanas definidas.</p>';
    }
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


function atualizarAssinaturaCard(producoesDaCostureira) { // Parâmetro agora é a lista JÁ FILTRADA
    // O filtro por 'p.funcionario === usuarioLogado.nome' FOI REMOVIDO daqui
    // pois 'producoesDaCostureira' já contém apenas as produções do usuário logado.
    const producoesNaoAssinadas = producoesDaCostureira.filter(p => !p.assinada); // Mantém apenas o filtro de !p.assinada

    const btnConferir = document.getElementById('btnConferirAssinaturas');
    if (btnConferir) {
        btnConferir.onclick = () => verificarAssinaturas(producoesNaoAssinadas);
    } else {
        console.warn("[atualizarAssinaturaCard] Botão 'btnConferirAssinaturas' não encontrado.");
    }
}


function verificarAssinaturas(producoesNaoAssinadas) {
    if (producoesNaoAssinadas.length === 0) {
        // Situação 1: Nenhum processo pendente
        const popup = document.getElementById('popupSemAssinaturas');
        popup.style.display = 'flex';
    } else {
        // Situação 2: Há processos pendentes
        window.location.hash = '#assinatura';
        mostrarTelaAssinaturas(producoesNaoAssinadas);
    }
}

function mostrarTelaAssinaturas(producoes) {
    const container = document.createElement('div');
    container.id = 'assinatura';
    container.innerHTML = `
        <div id="assinatura-content">
            <h2>Assinaturas Pendentes</h2>
            <button id="fecharAssinatura" class="fechar-btn">X</button>
            <div class="select-all">
                <input type="checkbox" id="selectAllCheckboxes" name="selectAll">
                <label for="selectAllCheckboxes">Selecionar Todas</label>
            </div>
            <ul class="assinatura-lista" id="assinaturaLista"></ul>
            <button id="btnAssinarSelecionados" class="assinatura-botao">Assinar</button>
        </div>
    `;
    document.body.appendChild(container);
    container.style.display = 'flex'; // Garante que o container seja visível

    const lista = document.getElementById('assinaturaLista');
    const selectAll = document.getElementById('selectAllCheckboxes');
    const btnAssinar = document.getElementById('btnAssinarSelecionados');
    const btnFechar = document.getElementById('fecharAssinatura');

    lista.innerHTML = producoes.map(p => {
        const variacao = p.variacao || 'N/A';
        return `
            <li>
                <input type="checkbox" name="processo" value="${p.id}" class="processo-checkbox">
                <span>${p.produto} [${variacao}], ${p.processo}, ${p.quantidade}, ${new Date(p.data).toLocaleTimeString('pt-BR')}</span>
            </li>
        `;
    }).join('');

    selectAll.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.processo-checkbox');
        checkboxes.forEach(cb => cb.checked = selectAll.checked);
        atualizarBotaoAssinar();
    });

    document.querySelectorAll('.processo-checkbox').forEach(cb => {
        cb.addEventListener('change', atualizarBotaoAssinar);
    });

    function atualizarBotaoAssinar() {
        const checkboxes = document.querySelectorAll('.processo-checkbox');
        const todasSelecionadas = Array.from(checkboxes).every(cb => cb.checked);
        btnAssinar.textContent = todasSelecionadas ? 'Assinar Tudo' : 'Assinar';
    }

    btnAssinar.onclick = async () => {
        const checkboxes = document.querySelectorAll('.processo-checkbox:checked');
        const idsParaAssinar = Array.from(checkboxes).map(cb => cb.value);

        if (idsParaAssinar.length > 0) {
            await assinarSelecionados(idsParaAssinar);
            container.remove();
            window.location.hash = '';
            await atualizarDashboard();
        }
    };

    // Evento para o botão "X" fechar o card
    btnFechar.onclick = () => {
        container.remove();
        window.location.hash = '';
    };

    // Fechar a tela ao clicar fora (mantido como funcionalidade extra)
    container.addEventListener('click', (e) => {
        if (e.target === container) {
            container.remove();
            window.location.hash = '';
        }
    });
}

async function assinarSelecionados(ids) {
    try {
        const token = localStorage.getItem('token');
        const agora = new Date();
        const assinaturas = JSON.parse(localStorage.getItem('assinaturas')) || [];

        // Buscar as produções atuais para obter o valor de edicoes
        const producoes = await obterProducoes();

        for (const id of ids) {
            const producao = producoes.find(p => p.id === id);
            const edicoesAtual = producao ? (producao.edicoes || 0) : 0; // Mantém o valor atual ou usa 0

            const requestBody = { 
                id, 
                assinada: true, 
                edicoes: edicoesAtual // Inclui edicoes no corpo da requisição
            };
            const response = await fetch('/api/producoes', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            const responseText = await response.text();
            console.log('[assinarSelecionados] Resposta do servidor:', responseText);

            if (!response.ok) {
                throw new Error(`Erro ao assinar produção ${id}: ${responseText}`);
            }
        }

        const registroAssinatura = {
            id: gerarIdUnico(),
            costureira: usuarioLogado.nome,
            dataHora: agora.toISOString(),
            dispositivo: navigator.userAgent,
            producoesAssinadas: ids.map(id => ({
                idProducao: id,
            }))
        };

        if (navigator.geolocation) {
            await new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        registroAssinatura.localizacao = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        };
                        resolve();
                    },
                    () => {
                        registroAssinatura.localizacao = 'Não disponível';
                        resolve();
                    },
                    { timeout: 5000 }
                );
            });
        } else {
            registroAssinatura.localizacao = 'Geolocalização não suportada';
        }

        assinaturas.push(registroAssinatura);
        localStorage.setItem('assinaturas', JSON.stringify(assinaturas));
    } catch (error) {
        console.error('[assinarSelecionados] Erro:', error.message);
        alert('Erro ao assinar processos selecionados: ' + error.message);
    }
}

function gerarIdUnico() {
    return 'assinatura_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function atualizarDetalhamentoProcessos(producoesDaCostureira, produtos) { // Parâmetro é a lista JÁ FILTRADA
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

    // A lista 'producoesDaCostureira' já está filtrada pelo usuário.
    // Apenas aplicamos o sort aqui.
    const producoesUsuarioOrdenadas = producoesDaCostureira.sort((a, b) => new Date(b.data) - new Date(a.data));
    // console.log('Produções ordenadas da costureira para detalhamento:', producoesUsuarioOrdenadas); // Log opcional

    let paginaAtual = 1;
    const itensPorPagina = 8;

    function normalizarData(data) {
        const d = new Date(data);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function filtrarProducoes() {
        // 'producoesUsuarioOrdenadas' já contém apenas as produções do usuário logado.
        // Aplicamos apenas o filtro de período (dia ou semana).
        if (filtroAtivo === 'dia') {
            const diaSelecionado = normalizarData(dataSelecionadaDia);
            return producoesUsuarioOrdenadas.filter(p => {
                const dataProducao = normalizarData(p.data);
                return dataProducao.getTime() === diaSelecionado.getTime();
            });
        } else { // filtroAtivo === 'semana'
            // Calcula o início da semana (Domingo) para dataSelecionadaSemana
            const inicioSemanaSelecionada = normalizarData(dataSelecionadaSemana);
            inicioSemanaSelecionada.setDate(inicioSemanaSelecionada.getDate() - inicioSemanaSelecionada.getDay()); 
            
            const fimSemanaSelecionada = new Date(inicioSemanaSelecionada);
            fimSemanaSelecionada.setDate(inicioSemanaSelecionada.getDate() + 6);
            fimSemanaSelecionada.setHours(23, 59, 59, 999); // Garante que cobre o dia inteiro

            return producoesUsuarioOrdenadas.filter(p => {
                const dataProducao = normalizarData(p.data); // Compara apenas a parte da data
                return dataProducao >= inicioSemanaSelecionada && dataProducao <= fimSemanaSelecionada;
            });
        }
    }

    // O restante da função 'atualizarDetalhamentoProcessos' continua igual,
    // pois as sub-funções (calcularTotalProcessos, renderizarPaginacao, renderizarProcessos, etc.)
    // já usam o resultado de 'filtrarProducoes()', que por sua vez usa 'producoesUsuarioOrdenadas'.

    // --- INÍCIO DO CÓDIGO QUE VOCÊ JÁ TEM E DEVE MANTER ---
    function calcularTotalProcessos(producoesFiltradas) {
        return producoesFiltradas.reduce((total, p) => total + p.quantidade, 0);
    }

    function renderizarPaginacao(producoesFiltradas) {
        const totalPaginas = Math.ceil(producoesFiltradas.length / itensPorPagina);
        paginacaoNumeros.innerHTML = '';

        if (totalPaginas <= 3) {
            for (let i = 1; i <= totalPaginas; i++) {
                const btn = document.createElement('button');
                btn.textContent = i;
                btn.classList.add(i === paginaAtual ? 'active' : 'inactive');
                btn.addEventListener('click', () => {
                    paginaAtual = i;
                    renderizarProcessos();
                    // atualizarBotoesPaginacao(); // renderizarPaginacao já é chamada por renderizarProcessos, que chama esta
                    listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                paginacaoNumeros.appendChild(btn);
            }
        } else {
            const firstPage = 1;
            const lastPage = totalPaginas;

            let btn = document.createElement('button');
            btn.textContent = firstPage;
            btn.classList.add(firstPage === paginaAtual ? 'active' : 'inactive');
            btn.addEventListener('click', () => {
                paginaAtual = firstPage;
                renderizarProcessos();
                listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            paginacaoNumeros.appendChild(btn);

            if (paginaAtual > 2 && paginaAtual < totalPaginas - 1) {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.margin = '0 5px';
                dots.style.color = '#4a5568';
                paginacaoNumeros.appendChild(dots);

                btn = document.createElement('button');
                btn.textContent = paginaAtual;
                btn.classList.add('active');
                // Não precisa de event listener aqui, pois já é a página ativa
                paginacaoNumeros.appendChild(btn);

                const dots2 = document.createElement('span');
                dots2.textContent = '...';
                dots2.style.margin = '0 5px';
                dots2.style.color = '#4a5568';
                paginacaoNumeros.appendChild(dots2);
            } else if (totalPaginas > 2) { // Evita "..." se só houver 2 páginas e a lógica acima não cobrir
                 const dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.margin = '0 5px';
                dots.style.color = '#4a5568';
                paginacaoNumeros.appendChild(dots);
            }


            if (totalPaginas > 1) { // Só adiciona o botão da última página se houver mais de uma página
                btn = document.createElement('button');
                btn.textContent = lastPage;
                btn.classList.add(lastPage === paginaAtual ? 'active' : 'inactive');
                btn.addEventListener('click', () => {
                    paginaAtual = lastPage;
                    renderizarProcessos();
                    listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                paginacaoNumeros.appendChild(btn);
            }
        }

        btnAnterior.disabled = paginaAtual === 1;
        btnProximo.disabled = paginaAtual === totalPaginas || totalPaginas === 0;
    }

    function renderizarProcessos() {
        const producoesFiltradas = filtrarProducoes();
        const inicio = (paginaAtual - 1) * itensPorPagina;
        const fim = inicio + itensPorPagina;
        const processosParaExibir = producoesFiltradas.slice(inicio, fim);

        listaProcessos.innerHTML = processosParaExibir.length > 0 
            ? processosParaExibir.map(p => {
                const produtoNomeNormalizado = normalizarTexto(p.produto);
                // 'produtos' é o array completo de produtos passado como parâmetro para atualizarDetalhamentoProcessos
                const produtoInfo = produtos.find(prod => normalizarTexto(prod.nome) === produtoNomeNormalizado);
                const variacao = p.variacao || 'N/A';
                const statusAssinatura = p.assinada ? 'Assinado' : 'Pendente';

                return `
                    <div class="processo-item" style="background: #F9F9F9; border: 1px solid #EDEDED; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                        <p><strong>Produto:</strong> ${p.produto} [${variacao}]</p>
                        <p><strong>Processo:</strong> ${p.processo}</p>
                        <p><strong>Quantidade:</strong> ${p.quantidade}</p>
                        <p><strong>Hora:</strong> ${new Date(p.data).toLocaleTimeString('pt-BR')}</p>
                        <p><strong>Status:</strong> ${statusAssinatura}</p>
                    </div>
                `;
            }).join('')
            : '<li>Nenhuma produção encontrada para o período selecionado.</li>';

        const total = calcularTotalProcessos(producoesFiltradas);
        totalProcessosEl.textContent = `TOTAL DE PROCESSOS: ${total}`;
        renderizarPaginacao(producoesFiltradas); // Chama renderizarPaginacao aqui
        // Não precisa chamar atualizarBotoesPaginacao separadamente se renderizarPaginacao já cuida disso.
    }

    // 'atualizarBotoesPaginacao' pode ser simplificada ou integrada em 'renderizarPaginacao'
    // Se 'renderizarPaginacao' já atualiza classes active/inactive e o estado dos botões next/prev,
    // 'atualizarBotoesPaginacao' pode não ser necessária como uma função separada chamada externamente.
    // Por segurança, vamos mantê-la, mas garantir que 'renderizarPaginacao' a chame se precisar, ou faça o trabalho ela mesma.
    // No seu código, renderizarPaginacao já define btnAnterior.disabled e btnProximo.disabled.
    // E os botões de número já têm suas classes definidas dentro de renderizarPaginacao.

    btnAnterior.onclick = () => {
        if (paginaAtual > 1) {
            paginaAtual--;
            renderizarProcessos();
            // renderizarPaginacao() é chamada dentro de renderizarProcessos()
            listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    btnProximo.onclick = () => {
        const totalPaginas = Math.ceil(filtrarProducoes().length / itensPorPagina); // Recalcula aqui para garantir
        if (paginaAtual < totalPaginas) {
            paginaAtual++;
            renderizarProcessos();
            // renderizarPaginacao() é chamada dentro de renderizarProcessos()
            listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    filtroDiaTexto.onclick = () => {
        paginaAtual = 1;
        filtroAtivo = 'dia';
        filtroDiaTexto.classList.add('active');
        filtroSemanaTexto.classList.remove('active');
        $("#datepickerDia").datepicker('setDate', dataSelecionadaDia); // Garante que o datepicker reflita a data
        renderizarProcessos();
        listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    filtroSemanaTexto.onclick = () => {
        paginaAtual = 1;
        filtroAtivo = 'semana';
        filtroSemanaTexto.classList.add('active');
        filtroDiaTexto.classList.remove('active');
        atualizarTextoDatepickerSemana(); // Garante que o texto do input da semana seja atualizado
        renderizarProcessos();
        listaProcessos.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // A inicialização dos datepickers e a chamada inicial de renderizarProcessos()
    // já estão no DOMContentLoaded, então não precisam ser repetidas aqui.
    // Apenas garantimos que, ao trocar de filtro, a renderização ocorra.

    // Chamada inicial para renderizar os processos com o filtro padrão (dia ou o que estiver ativo)
    if (!filtroDiaTexto.classList.contains('active') && !filtroSemanaTexto.classList.contains('active')) {
        filtroAtivo = 'dia'; 
        filtroDiaTexto.classList.add('active');
        filtroSemanaTexto.classList.remove('active');
        $("#datepickerDia").datepicker('setDate', dataSelecionadaDia);
   }
   renderizarProcessos();
   // --- FIM DO CÓDIGO QUE VOCÊ JÁ TEM E DEVE MANTER ---
}

// Eventos
document.addEventListener('DOMContentLoaded', async () => {
    usuarioLogado = await verificarAutenticacaoCostureira();
    if (!usuarioLogado) {
        // Se a autenticação falhar, verificarAutenticacaoCostureira já deve redirecionar.
        // Mas por segurança, podemos parar a execução aqui.
        console.error("Falha na autenticação. Interrompendo inicialização do dashboard.");
        return; 
    }

    // Cache para as produções do usuário e produtos para evitar múltiplas chamadas à API
    // dentro dos event handlers dos datepickers.
    let cachedProducoesUsuario = [];
    let cachedProdutos = [];

    // Função para buscar e cachear os dados se necessário
    async function getDadosParaFiltros() {
        if (cachedProducoesUsuario.length === 0 || cachedProdutos.length === 0) {
            console.log("[getDadosParaFiltros] Cache vazio, buscando dados da API...");
            const todasProducoes = await obterProducoes();
            cachedProdutos = await obterProdutos(); // Cacheia produtos
            // Filtra e cacheia produções do usuário
            if (usuarioLogado && usuarioLogado.nome) {
                cachedProducoesUsuario = todasProducoes.filter(p => p.funcionario === usuarioLogado.nome);
            } else {
                console.error("[getDadosParaFiltros] Nome do usuário logado não encontrado para filtrar produções.");
                cachedProducoesUsuario = []; // Evita erros, mas indica um problema
            }
        }
        return { producoes: cachedProducoesUsuario, produtos: cachedProdutos };
    }

    // Inicializar datepickers e outros elementos que dependem de dados
    try {
        // Carrega os dados iniciais para o dashboard principal
        await atualizarDashboard(); // Esta função já popula cachedProducoesUsuario e cachedProdutos através de suas chamadas internas se as ajustarmos

        // Configuração dos Datepickers
        $("#datepickerDia").datepicker({
            dateFormat: 'dd/mm/yy',
            defaultDate: dataSelecionadaDia, // Usa a variável global
            onSelect: async function(dateText) {
                const [dia, mes, ano] = dateText.split('/');
                dataSelecionadaDia = new Date(ano, mes - 1, dia);
                filtroAtivo = 'dia';
                document.getElementById('filtroDia')?.classList.add('active');
                document.getElementById('filtroSemana')?.classList.remove('active');
                
                // USA OS DADOS CACHEADOS para atualizar apenas o detalhamento
                const dados = await getDadosParaFiltros(); // Pega do cache ou busca se necessário
                atualizarDetalhamentoProcessos(dados.producoes, dados.produtos);
            }
        }).datepicker('setDate', dataSelecionadaDia); // Define a data inicial

        $("#datepickerSemana").datepicker({
            dateFormat: 'dd/mm/yy', // A data clicada é apenas uma referência para a semana
            onSelect: async function(dateText) {
                const [dia, mes, ano] = dateText.split('/');
                dataSelecionadaSemana = new Date(ano, mes - 1, dia); 
                atualizarTextoDatepickerSemana(); // Atualiza o display do input para mostrar o intervalo da semana

                filtroAtivo = 'semana';
                document.getElementById('filtroSemana')?.classList.add('active');
                document.getElementById('filtroDia')?.classList.remove('active');

                // USA OS DADOS CACHEADOS
                const dados = await getDadosParaFiltros();
                atualizarDetalhamentoProcessos(dados.producoes, dados.produtos);
            }
        });
        // Define o texto inicial para o datepicker da semana
        dataSelecionadaSemana = new Date(); // Define para hoje
        dataSelecionadaSemana.setHours(0,0,0,0);
        atualizarTextoDatepickerSemana(); // Atualiza o display do input

        // Os event listeners para 'filtroDia' e 'filtroSemana' já estão dentro de 
        // 'atualizarDetalhamentoProcessos' ou podem ser movidos para cá também
        // se 'atualizarDetalhamentoProcessos' for chamada com os dados cacheados.

        // Se os handlers de clique para filtroDiaTexto e filtroSemanaTexto
        // ainda estiverem dentro de atualizarDetalhamentoProcessos, eles usarão
        // a 'producoesDaCostureira' que foi passada para essa instância de atualizarDetalhamentoProcessos.
        // Se eles chamarem uma nova busca de produções, aí está o problema.

        // Vamos garantir que eles também usem dados cacheados se forem definidos aqui:
        document.getElementById('filtroDia')?.addEventListener('click', async () => {
            if (filtroAtivo === 'dia' && $("#datepickerDia").datepicker('getDate').getTime() === dataSelecionadaDia.getTime()) return; // Evita recarregar se já estiver ativo com a mesma data

            paginaAtual = 1; // Resetar paginação (supondo que paginaAtual é global ou acessível)
            filtroAtivo = 'dia';
            document.getElementById('filtroDia')?.classList.add('active');
            document.getElementById('filtroSemana')?.classList.remove('active');
            // Garante que dataSelecionadaDia esteja correta se o usuário não usou o datepicker
             if (!$("#datepickerDia").datepicker('getDate') || $("#datepickerDia").datepicker('getDate').getTime() !== dataSelecionadaDia.getTime()) {
                $("#datepickerDia").datepicker('setDate', dataSelecionadaDia);
            }

            const dados = await getDadosParaFiltros();
            atualizarDetalhamentoProcessos(dados.producoes, dados.produtos);
            document.getElementById('listaProcessos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        document.getElementById('filtroSemana')?.addEventListener('click', async () => {
            if (filtroAtivo === 'semana') return; // Evita recarregar se já estiver ativo

            paginaAtual = 1;
            filtroAtivo = 'semana';
            document.getElementById('filtroSemana')?.classList.add('active');
            document.getElementById('filtroDia')?.classList.remove('active');
            atualizarTextoDatepickerSemana(); // Garante que o texto do input da semana seja atualizado

            const dados = await getDadosParaFiltros();
            atualizarDetalhamentoProcessos(dados.producoes, dados.produtos);
            document.getElementById('listaProcessos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });


    } catch (e) {
        console.error("Erro durante a inicialização dos componentes do dashboard:", e);
        // Tratar erro de inicialização
    }

        document.getElementById('metaSelect')?.addEventListener('change', async () => {
        const metaSelect = document.getElementById('metaSelect');
        const editarMetaBtn = document.getElementById('editarMetaBtn');

        if (!metaSelect) {
            console.warn("Elemento metaSelect não encontrado no evento change.");
            return;
        }
        
        const novaMeta = parseInt(metaSelect.value);
        salvarMetaSelecionada(novaMeta); // Salva a meta selecionada no localStorage

        metaSelect.disabled = true; // Desabilita o select após a escolha
        if (editarMetaBtn) {
            editarMetaBtn.textContent = 'Editar Meta'; // Restaura o texto do botão
        }
        
        // USA OS DADOS CACHEADOS para atualizar o card de meta
        const dados = await getDadosParaFiltros(); // getDadosParaFiltros() já foi definido
        atualizarCardMeta(dados.producoes, dados.produtos); 
    });

    document.getElementById('editarMetaBtn')?.addEventListener('click', async () => {
        const metaSelect = document.getElementById('metaSelect');
        const editarMetaBtn = document.getElementById('editarMetaBtn');

        if (!metaSelect || !editarMetaBtn) { // Verificação de segurança
            console.warn("Elementos metaSelect ou editarMetaBtn não encontrados.");
            return;
        }

        if (metaSelect.disabled) { // Se está desabilitado, o usuário quer habilitar para editar
            metaSelect.disabled = false;
            editarMetaBtn.textContent = 'Escolher Meta'; // Ou 'Salvar Meta', 'Confirmar Meta'
            metaSelect.focus();
        } else { // Se está habilitado, o usuário clicou para "salvar" a escolha
            metaSelect.disabled = true;
            editarMetaBtn.textContent = 'Editar Meta';
            
            // Aqui é o ponto crucial:
            // AO INVÉS DE buscar producoes e produtos da API novamente:
            // const producoes = await obterProducoes();
            // const produtos = await obterProdutos();
            
            // USE OS DADOS CACHEADOS:
            const dados = await getDadosParaFiltros(); // getDadosParaFiltros() é a função que definimos antes
            atualizarCardMeta(dados.producoes, dados.produtos); // Passa os dados corretos (já filtrados pelo usuário)
        }
    });

    document.getElementById('fecharPopupSemAssinaturas').addEventListener('click', () => {
        document.getElementById('popupSemAssinaturas').style.display = 'none';
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        logout();
    });
});