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


// Paginação
let currentPageArremateCards = 1;
const itemsPerPageArremateCards = 6; // Aumentado para preencher melhor a tela
let currentPageHistorico = 1;
const itemsPerPageHistorico = 10;

let historicoArrematesCurrentPage = 1;


// Controle de UI
const lancamentosArremateEmAndamento = new Set();

// ==========================================================================
// # LÓGICA DO NOVO PAINEL DE ATIVIDADES
// ==========================================================================
let painelUpdateInterval; // Variável para controlar o auto-update
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
        const { statusFinal, classeStatus } = determinarStatusFinal(tiktik);

        // Se estiver trabalhando, armazena a data de início no próprio card
        if (statusFinal === 'TRABALHANDO') {
            card.dataset.inicioTarefa = tiktik.data_inicio;
        }

        card.className = `oa-card-status-tiktik ${classeStatus}`;
        card.innerHTML = criarHTMLCardStatus(tiktik, statusFinal, classeStatus);
            
            // Separa em qual container o card será inserido
            if (statusFinal === 'LIVRE' || statusFinal === 'TRABALHANDO') {
                containerDisponiveis.appendChild(card);
            } else {
                containerInativos.appendChild(card);
                contadorInativos++;
            }
            
        });
        
        if(badgeInativos) badgeInativos.textContent = contadorInativos;

        // Ao final da renderização bem-sucedida:
        ultimaAtualizacaoTimestamp = Date.now(); // <<< ATUALIZA O TIMESTAMP
        atualizarFeedbackTempo(); // <<< CHAMA UMA PRIMEIRA VEZ PARA O TEXTO APARECER IMEDIATAMENTE

    } catch (error) {
        console.error("Erro ao renderizar painel de status:", error);
        containerDisponiveis.innerHTML = `<p class="erro-painel">Erro ao carregar o painel. Tente atualizar a página.</p>`;
        if (feedbackEl) feedbackEl.textContent = 'Falha ao atualizar';
    }
}


function atualizarCronometros() {
    // Procura por todos os cards que estão no estado 'trabalhando' e têm o data-attribute
    document.querySelectorAll('.oa-card-status-tiktik.status-trabalhando[data-inicio-tarefa]').forEach(card => {
        const cronometroEl = card.querySelector('.cronometro-tarefa');
        const dataInicioStr = card.dataset.inicioTarefa;

        if (cronometroEl && dataInicioStr) {
            const tempoDecorridoMs = new Date() - new Date(dataInicioStr);
            // Garante que o tempo não seja negativo caso haja dessincronia de relógios
            const tempoSeguroMs = Math.max(0, tempoDecorridoMs);
            const tempoDecorridoStr = new Date(tempoSeguroMs).toISOString().substr(11, 8);
            
            cronometroEl.innerHTML = `<i class="fas fa-clock"></i> ${tempoDecorridoStr}`;
        }
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
    // 1. Verifica FALTOU (prioridade máxima)
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // Formato 'YYYY-MM-DD'

    // Compara apenas a parte da data (YYYY-MM-DD) de 'status_data_modificacao'
    if (tiktik.status_atual === 'FALTOU' && tiktik.status_data_modificacao?.startsWith(hoje)) {
        return { statusFinal: 'FALTOU', classeStatus: 'status-faltou' };
    }

    // 2. Verifica pausas automáticas baseadas no horário
    const agora = new Date();
    const horaAtualStr = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

    const entrada1 = tiktik.horario_entrada_1;
    const saida1 = tiktik.horario_saida_1;
    const entrada2 = tiktik.horario_entrada_2;
    const saida2 = tiktik.horario_saida_2;
    const entrada3 = tiktik.horario_entrada_3;
    const saida3 = tiktik.horario_saida_3;
    
    // Define a saída final do dia, considerando os turnos existentes
    const saidaFinal = saida3 || saida2 || saida1 || '23:59';
    const entradaInicial = entrada1 || '00:00';

    if (horaAtualStr < entradaInicial || horaAtualStr > saidaFinal) {
        return { statusFinal: 'FORA DO HORÁRIO', classeStatus: 'status-fora-horario' };
    }
    if (saida1 && entrada2 && horaAtualStr > saida1 && horaAtualStr < entrada2) {
        return { statusFinal: 'ALMOÇO', classeStatus: 'status-almoco' };
    }
    if (saida2 && entrada3 && horaAtualStr > saida2 && horaAtualStr < entrada3) {
        return { statusFinal: 'PAUSA', classeStatus: 'status-pausa' };
    }

    // 3. Se passou por tudo, usa o status do banco
    switch (tiktik.status_atual) {
        case 'TRABALHANDO':
            return { statusFinal: 'TRABALHANDO', classeStatus: 'status-trabalhando' };
        case 'LIVRE':
        default:
            return { statusFinal: 'LIVRE', classeStatus: 'status-livre' };
    }
}

/**
 * Cria o HTML interno de um card de status de um empregado.
 */
function criarHTMLCardStatus(tiktik, statusFinal, classeStatus) {
    let infoTarefaHTML = '';
    let botoesAcaoHTML = '';

    if (statusFinal === 'TRABALHANDO') {
        // Calcula o tempo decorrido uma vez para usar em vários lugares
        const tempoDecorridoMs = new Date() - new Date(tiktik.data_inicio);
        const tempoDecorridoStr = new Date(tempoDecorridoMs).toISOString().substr(11, 8);
        
        let progresso = 0;
        let classeProgresso = '';
        let mediaInfoHTML = '<p class="media-info">Sem média de tempo registrada para este produto.</p>'; // Mensagem padrão

        // Lógica da barra de progresso e texto informativo
        if (tiktik.media_tempo_por_peca && tiktik.quantidade_entregue > 0) {
            const tempoMedioTotalSegundos = tiktik.media_tempo_por_peca * tiktik.quantidade_entregue;
            const tempoDecorridoSegundos = tempoDecorridoMs / 1000;
            
            progresso = Math.min(100, (tempoDecorridoSegundos / tempoMedioTotalSegundos) * 100);
            
            if (progresso >= 100) {
                classeProgresso = 'lento';
            } else if (progresso > 75) {
                classeProgresso = 'atencao';
            }

            // Formata o tempo médio para HH:MM:SS para exibição
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
        botoesAcaoHTML = `<button class="btn-acao finalizar" data-action="finalizar" data-tiktik-id="${tiktik.id}"><i class="fas fa-check-double"></i> Finalizar Tarefa</button>`;

    } else if (statusFinal === 'LIVRE') {
        botoesAcaoHTML = `<button class="btn-acao iniciar" data-action="iniciar" data-tiktik-id="${tiktik.id}"><i class="fas fa-play"></i> Atribuir Tarefa</button>`;
    }
    
    // Lógica para o botão de "Marcar Falta"
    const podeMarcarFalta = ['LIVRE', 'TRABALHANDO', 'FALTOU'].includes(statusFinal);
    const textoBotaoFalta = statusFinal === 'FALTOU' ? 'Remover Falta' : 'Marcar Falta';
    const iconeBotaoFalta = statusFinal === 'FALTOU' ? 'fa-user-check' : 'fa-user-slash';

    // Montagem final do HTML do card
    return `
        <div class="card-status-header">
            <img src="${tiktik.avatar_url || '/img/placeholder-image.png'}" alt="Avatar" class="avatar-tiktik oa-avatar-foco" onerror="this.onerror=null; this.src='/img/placeholder-image.png';">
            <div class="info-empregado">
                <span class="nome-tiktik">${tiktik.nome}</span>
                <span class="status-selo ${classeStatus}">${statusFinal.replace('_', ' ')}</span>
            </div>
            ${podeMarcarFalta ? `<button class="btn-marcar-falta" data-action="marcar-falta" data-tiktik-id="${tiktik.id}" title="${textoBotaoFalta}"><i class="fas ${iconeBotaoFalta}"></i></button>` : ''}
        </div>
        ${infoTarefaHTML}
        <div class="card-status-footer">
            ${botoesAcaoHTML}
        </div>
    `;
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
        // Remove do body após fechar para manter o DOM limpo
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
            .filter(t => t.status_atual === 'TRABALHANDO' && t.produto_id)
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

            // Mapa de produtos em trabalho, para garantir a informação mais recente
            const produtosEmTrabalho = new Map();
            statusTiktiksCache
                .filter(t => t.status_atual === 'TRABALHANDO' && t.produto_id)
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
            saldoDisponivel = saldoDisponivel > 0 ? saldoDisponivel : 0; // Garante que não seja negativo

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
                <div class="oa-form-grupo-atribuir">
                    <label for="inputQuantidadeAtribuir">Qtd. a Arrematar:</label>
                    <input type="number" id="inputQuantidadeAtribuir" class="oa-input-tarefas" min="1" max="${saldoDisponivel}" required>
                </div>
                <button id="btnConfirmarAtribuicao" class="oa-btn oa-btn-sucesso" disabled><i class="fas fa-check"></i> Confirmar</button>
            `;

            const inputQtd = formContainer.querySelector('#inputQuantidadeAtribuir');
            const btnConfirmar = formContainer.querySelector('#btnConfirmarAtribuicao');
            const saldoRestanteEl = formContainer.querySelector('#saldoRestante');

            formContainer.querySelector('#btnVoltarParaLista').addEventListener('click', () => mostrarTela('lista'));
            
            inputQtd.focus();
            
            inputQtd.oninput = () => {
                const qtd = parseInt(inputQtd.value) || 0;
                const restante = saldoDisponivel - qtd;
                saldoRestanteEl.textContent = restante >= 0 ? restante : '--';
                btnConfirmar.disabled = !(qtd > 0 && qtd <= saldoDisponivel);
            };

            // Passa o 'tiktik' do escopo externo de 'handleAtribuirTarefa'
            btnConfirmar.onclick = () => confirmarAtribuicao(tiktik, itemSelecionado, parseInt(inputQtd.value));
            
            mostrarTela('confirmacao');
        }
    };

    const confirmarAtribuicao = async (tiktik, item, quantidade) => {
        const btnConfirmar = formContainer.querySelector('#btnConfirmarAtribuicao');
        if (btnConfirmar) {
            btnConfirmar.disabled = true;
            btnConfirmar.innerHTML = '<div class="spinner-btn-interno"></div> Confirmando...';
        }
        try {
            const opDeOrigem = item.ops_detalhe.sort((a,b) => a.numero - b.numero)[0];
            
            const payload = {
                usuario_tiktik_id: tiktik.id,
                produto_id: item.produto_id,
                variante: item.variante === '-' ? null : item.variante,
                quantidade_entregue: quantidade,
                op_numero: opDeOrigem.numero,
                op_edit_id: opDeOrigem.edit_id,
                dados_ops: item.ops_detalhe // A chave do sucesso!
            };

            await fetchFromAPI('/arremates/sessoes/iniciar', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            mostrarMensagem('Tarefa iniciada com sucesso!', 'sucesso');
            fecharModal();
            await renderizarPainelStatus();
            await forcarAtualizacaoFilaDeArremates();
        } catch (error) {
            mostrarMensagem(`Deu ruim!!: ${error.message}`, 'erro');
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar';
            }
        }
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

async function handleMarcarFalta(tiktik, statusAtual) {
    const novoStatus = statusAtual === 'FALTOU' ? 'LIVRE' : 'FALTOU';
    const acao = novoStatus === 'FALTOU' ? 'registrar a falta' : 'remover a falta';
    
    const confirmado = await mostrarConfirmacao(`Deseja ${acao} para ${tiktik.nome} hoje?`);
    if (!confirmado) {
        console.log("Ação cancelada pelo usuário.");
        return;
    }

    try {
        await fetchFromAPI(`/arremates/usuarios/${tiktik.id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: novoStatus })
        });
        
        mostrarMensagem(`Status de ${tiktik.nome} atualizado.`, 'sucesso');
        
        await renderizarPainelStatus();

    } catch (error) {
        // ✨ LOG DE DEPURAÇÃO 3 ✨
        console.error("Erro em handleMarcarFalta:", error);
        mostrarMensagem(`Erro ao atualizar status: ${error.message}`, 'erro');
    }
}

/**
 * Inicia ou para o intervalo de atualização automática do painel.
 */
function controlarAtualizacaoPainel(iniciar = true) {
    clearInterval(painelUpdateInterval);
    clearInterval(cronometrosUpdateInterval);
    clearInterval(feedbackUpdateInterval);

    if (iniciar) {
        painelUpdateInterval = setInterval(renderizarPainelStatus, 20000);
        cronometrosUpdateInterval = setInterval(atualizarCronometros, 1000);
        feedbackUpdateInterval = setInterval(atualizarFeedbackTempo, 5000); // <<< INICIA O NOVO INTERVALO (a cada 5s)
    }
}

async function abrirModoFoco(tiktik) {
    const modal = document.getElementById('modalModoFoco');
    if (!modal) return;

    // Preenche os dados básicos e mostra o modal com spinners
    modal.querySelector('#focoAvatar').src = tiktik.avatar_url || '/img/placeholder-image.png';
    modal.querySelector('#focoNome').textContent = `Desempenho de ${tiktik.nome}`;
    modal.querySelector('#focoMetricas').innerHTML = '<div class="spinner"></div>';
    modal.querySelector('#focoTimeline').innerHTML = '<div class="spinner">Calculando timeline...</div>';
    modal.querySelector('#focoTarefas').innerHTML = '<div class="spinner"></div>';

    const fecharModal = () => { modal.style.display = 'none'; };
    modal.querySelector('.popup-overlay').onclick = fecharModal;
    modal.querySelector('.oa-modal-fechar-btn').onclick = fecharModal;
    modal.style.display = 'flex';

    try {
        // Chama a nova API
        const dados = await fetchFromAPI(`/arremates/desempenho-diario/${tiktik.id}`);
        
        // Renderiza as seções com os dados recebidos
        renderizarMetricasFoco(dados);
        renderizarTimelineFoco(dados);
        renderizarTarefasFoco(dados);
        
    } catch (error) {
        mostrarMensagem(`Erro ao carregar dados de desempenho: ${error.message}`, 'erro');
        fecharModal();
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

function renderizarTimelineFoco(dados) {
    // Esta é uma função complexa. Vamos começar com uma versão simplificada.
    const container = document.getElementById('focoTimeline');
    container.innerHTML = `<p style="text-align:center;"><i>(Timeline visual em desenvolvimento)</i></p>`;
    // A lógica completa para a timeline pode ser um próximo passo.
}

function renderizarTarefasFoco(dados) {
    const container = document.getElementById('focoTarefas');
    const { sessoes } = dados;

    if (sessoes.length === 0) {
        container.innerHTML = '<p>Nenhuma tarefa finalizada hoje.</p>';
        return;
    }

    container.innerHTML = `
        <table class="oa-tabela-historico">
            <thead><tr><th>Início</th><th>Produto</th><th>Qtd.</th><th>Duração</th></tr></thead>
            <tbody>
                ${sessoes.map(s => `
                    <tr>
                        <td>${new Date(s.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>${s.produto_nome} ${s.variante ? `(${s.variante})` : ''}</td>
                        <td>${s.quantidade_finalizada || 0}</td>
                        <td>${s.data_fim ? new Date((new Date(s.data_fim) - new Date(s.data_inicio))).toISOString().substr(14, 5) + ' min' : 'Em andamento'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
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
            
            // Antes: usava item.produto_nome, item.saldo_para_arrematar
            // Agora: usa os nomes traduzidos e padronizados
            const produtoInfo = todosOsProdutosCadastrados.find(p => p.id == item.produto_id);
            const imagemSrc = obterImagemProduto(produtoInfo, item.variante);
            const opsOrigemCount = item.ops_detalhe?.length || 0;
            
            card.innerHTML = `
                <img src="${imagemSrc}" alt="${item.produto}" class="oa-card-img" onerror="...">
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
    if (!produtoInfo) return '/img/placeholder-image.png';
    if (varianteNome && varianteNome !== '-') {
        const gradeItem = produtoInfo.grade?.find(g => g.variacao === varianteNome);
        if (gradeItem?.imagem) return gradeItem.imagem;
    }
    return produtoInfo.imagem || '/img/placeholder-image.png';
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

function configurarEventListeners() {
    // Botão para fechar a view de detalhes (quando se usa o hash #)
    document.getElementById('fecharArremateDetalheBtn')?.addEventListener('click', () => window.location.hash = '');

    // Botão principal para abrir o modal de histórico geral (agora no header React)
    // Usamos 'document' para o listener funcionar mesmo que o botão seja renderizado depois
    document.addEventListener('click', (event) => {
        if (event.target.closest('#btnAbrirHistorico')) {
            mostrarHistoricoArremates(); // Sua função para abrir o modal
        }
    });

    // Botão para atualizar manualmente o painel de atividades
    document.getElementById('btnAtualizarPainel')?.addEventListener('click', renderizarPainelStatus);
    
    // --- LISTENERS PARA AS ABAS E BOTÕES DENTRO DA VIEW DE DETALHES (#lancar-arremate) ---
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

    // Botão de confirmar ajuste/perda da view de detalhes
    document.getElementById('btnConfirmarRegistroAjuste')?.addEventListener('click', registrarAjuste);

    window.addEventListener('forcarAtualizacaoFila', () => {
    // Usamos o 'then' para mostrar a mensagem apenas depois que a atualização terminar
    forcarAtualizacaoFilaDeArremates().then(() => {
        mostrarMensagem('Fila de arremates atualizada!', 'sucesso', 2000);
    });
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

        // ADICIONADO DE VOLTA: "Sequestra" o modal de atribuição de tarefa
        const modalOriginal = document.getElementById('modalAtribuirTarefa');
        if (modalOriginal) {
            modalAtribuirTarefaElemento = modalOriginal;
            modalOriginal.parentNode.removeChild(modalOriginal);
        } else {
            console.error("CRÍTICO: Elemento do modal #modalAtribuirTarefa não encontrado no HTML inicial.");
        }

        // 1. CARREGAMENTO DE DADOS ESSENCIAIS
        const [produtosCadastrados, respostaFila, usuarios] = await Promise.all([
            obterProdutosDoStorage(true),
            fetchFromAPI('/arremates/fila?fetchAll=true'),
            fetchFromAPI('/usuarios')
        ]);
        
        todosOsProdutosCadastrados = produtosCadastrados || [];
        todosOsUsuarios = usuarios || [];
        const itensOriginaisDaFila = respostaFila.rows || [];

        // >>>>> A MÁGICA ACONTECE AQUI: A TRADUÇÃO <<<<<
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

        //  Delegação de eventos para o painel de atividades e accordion
        const painelDisponiveisContainer = document.getElementById('painelDisponiveisContainer');
        const painelInativosContainer = document.getElementById('painelInativosContainer');
        const painelClickHandler = async (event) => {
            // 1. Identifica os elementos clicados
            const actionButton = event.target.closest('[data-action]');
            
            // MODIFICADO: Agora procuramos especificamente pelo avatar
            const avatarClicado = event.target.closest('.oa-avatar-foco');

            // 2. Se não clicou em nada interativo (botão ou avatar), para a execução
            if (!actionButton && !avatarClicado) {
                return;
            }

            // 3. Encontra o card pai do elemento que foi clicado
            const card = event.target.closest('.oa-card-status-tiktik');
            if (!card) return;

            // 4. Pega o ID do tiktik a partir do dataset do card
            const tiktikId = parseInt(card.dataset.tiktikId);
            if (!tiktikId) return;

            // 5. Decide qual ação tomar com base no que foi clicado
            try {
                const tiktiksComSessao = await fetchFromAPI('/arremates/status-tiktiks');
                const tiktikData = tiktiksComSessao.find(t => t.id === tiktikId);
                if (!tiktikData) throw new Error(`Dados do tiktik ID ${tiktikId} não encontrados.`);

                // --- AÇÃO: Abrir o "Modo Foco" ---
                // MODIFICADO: A condição agora é se o avatar foi clicado
                if (avatarClicado) {
                    abrirModoFoco(tiktikData);
                    return; 
                }

                // --- AÇÃO: Executar um Botão ---
                if (actionButton) {
                    const action = actionButton.dataset.action;
                    switch(action) {
                        case 'iniciar': handleAtribuirTarefa(tiktikData); break;
                        case 'finalizar': handleFinalizarTarefa(tiktikData); break;
                        case 'marcar-falta':
                            const statusAtual = determinarStatusFinal(tiktikData).statusFinal;
                            handleMarcarFalta(tiktikData, statusAtual);
                            break;
                    }
                }
            } catch (error) {
                mostrarMensagem(`Erro ao processar ação: ${error.message}`, 'erro');
            }
        };
        if (painelDisponiveisContainer) painelDisponiveisContainer.addEventListener('click', painelClickHandler);
        if (painelInativosContainer) painelInativosContainer.addEventListener('click', painelClickHandler);

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