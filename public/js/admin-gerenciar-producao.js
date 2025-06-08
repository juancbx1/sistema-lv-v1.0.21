import { verificarAutenticacao } from '/js/utils/auth.js';

// --- Variáveis Globais para controle e cache de dados ---
let allProducoes = [];
let allOrdens = [];
let allUsuarios = [];
let permissoes = [];
let usuarioLogado = null;

let currentPage = 1;
const registrosPorPagina = 10;

/**
 * Exibe um popup customizado na tela.
 * @param {string} mensagem - O texto a ser exibido.
 * @param {string} tipo - 'sucesso', 'erro', ou 'aviso' para estilização.
 * @param {number} duracao - Tempo em milissegundos para o popup fechar sozinho. Se 0, não fecha.
 */
function mostrarPopup(mensagem, tipo = 'aviso', duracao = 5000) {
    // Remove qualquer popup antigo para não acumular
    const popupAntigo = document.querySelector('.popup-mensagem');
    const overlayAntigo = document.querySelector('.popup-overlay');
    if (popupAntigo) popupAntigo.remove();
    if (overlayAntigo) overlayAntigo.remove();

    // Cria o overlay (fundo escurecido)
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    
    // Cria o contêiner do popup
    const popup = document.createElement('div');
    popup.className = `popup-mensagem popup-${tipo}`;

    // Cria o parágrafo da mensagem
    const p = document.createElement('p');
    p.innerHTML = mensagem; // Usamos innerHTML para permitir tags como <strong>
    popup.appendChild(p);

    // Cria o botão de fechar
    const fecharBtn = document.createElement('button');
    fecharBtn.textContent = 'OK';
    
    const fecharPopup = () => {
        if (document.body.contains(popup)) document.body.removeChild(popup);
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
    };

    fecharBtn.onclick = fecharPopup;
    popup.appendChild(fecharBtn);

    // Adiciona tudo ao corpo da página
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    // Lógica para fechar sozinho após um tempo
    if (duracao > 0) {
        setTimeout(fecharPopup, duracao);
    }
}

// --- FUNÇÕES DE CARREGAMENTO DE DADOS (APENAS 1 VEZ) ---

/**
 * Busca todos os dados essenciais do backend de uma só vez para otimizar a performance.
 * Roda apenas uma vez no carregamento da página.
 */
async function carregarDadosIniciais() {
    try {
        const token = localStorage.getItem('token');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        console.log('[carregarDadosIniciais] Buscando todos os dados necessários...');
        
        const [resProducoes, resOrdens, resUsuarios, resProdutos] = await Promise.all([
            fetch('/api/producoes', { headers }),
            fetch('/api/ordens-de-producao?all=true&noStatusFilter=true', { headers }),
            fetch('/api/usuarios', { headers }),
            fetch('/api/produtos', { headers })
        ]);

        if (!resProducoes.ok) throw new Error(`Falha ao buscar produções`);
        if (!resOrdens.ok) throw new Error(`Falha ao buscar OPs`);
        if (!resUsuarios.ok) throw new Error(`Falha ao buscar usuários`);
        if (!resProdutos.ok) throw new Error(`Falha ao buscar produtos`);

        const producoesData = await resProducoes.json();
        const ordensData = await resOrdens.json();
        const usuariosData = await resUsuarios.json();
        const produtosData = await resProdutos.json();

        allOrdens = ordensData.rows || [];
        allUsuarios = usuariosData || [];
        
        // Processa as produções para adicionar as informações extras
        allProducoes = producoesData.map(p => {
            const ordem = allOrdens.find(o => String(o.numero).trim() === String(p.op_numero).trim());
            
            let feitoPor = 'desconhecido';
            const produtoConfig = produtosData.find(prod => prod.nome === p.produto);
            
            if (produtoConfig && Array.isArray(produtoConfig.etapas)) {
                // ==========================================================
                // >> CORREÇÃO: Encontrar a etapa pelo NOME DO PROCESSO <<
                // ==========================================================
                // Em vez de usar o índice, usamos o nome do processo, que é mais seguro.
                const etapaConfig = produtoConfig.etapas.find(etapa => 
                    (typeof etapa === 'object' ? etapa.processo : etapa) === p.processo
                );
                // ==========================================================

                if (etapaConfig && typeof etapaConfig === 'object' && etapaConfig.feitoPor) {
                    feitoPor = etapaConfig.feitoPor;
                }
            }

            return {
                ...p,
                variacao: ordem ? (ordem.variante || 'Não especificado') : (p.variacao || 'Sem variante'),
                dataHoraFormatada: new Date(p.data).toLocaleString('pt-BR'),
                feitoPor: feitoPor,
            };
        });

        console.log(`[carregarDadosIniciais] Dados carregados e processados.`);
        
        popularFiltroFuncionarios();
        popularFiltroProdutos(produtosData);

    } catch (error) {
        console.error('[carregarDadosIniciais] Erro fatal ao carregar dados:', error);
        mostrarPopup('Erro ao carregar dados da produção. A página pode não funcionar corretamente.', 'erro');    }
}


/** Popula o filtro de funcionários com base nos dados já carregados em `allUsuarios`. */
function popularFiltroFuncionarios() {
    const select = document.getElementById('filtroCostureira');
    if (!select) return;

    const funcionarios = allUsuarios.filter(u => u.tipos?.includes('costureira') || u.tipos?.includes('tiktik'));
    
    select.innerHTML = '<option value="">Todos</option>';
    funcionarios.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(f => {
        const option = new Option(f.nome, f.nome);
        select.appendChild(option);
    });
}

/** Popula o filtro de produtos com a lista de produtos recebida. */
function popularFiltroProdutos(produtos) {
    const select = document.getElementById('filtroProduto');
    if (!select) return;

    select.innerHTML = '<option value="">Todos</option>';
    produtos.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(p => {
        const option = new Option(p.nome, p.nome);
        select.appendChild(option);
    });
}


// --- FUNÇÕES DE RENDERIZAÇÃO E FILTRO ---

/** Filtra e renderiza os dados que já estão em memória. */
function aplicarFiltros(page = 1) {
    currentPage = page;

    const filtroFuncionario = document.getElementById('filtroCostureira')?.value || '';
    const filtroData = document.getElementById('filtroData')?.value || '';
    const filtroMaquina = document.getElementById('filtroMaquina')?.value || '';
    const filtroProcesso = document.getElementById('filtroProcesso')?.value || '';
    const filtroProduto = document.getElementById('filtroProduto')?.value || '';
    const filtroAssinatura = document.getElementById('filtroAssinatura')?.value || '';

    const filteredProducoes = allProducoes.filter(p => {
        const dataProducao = p.data.substring(0, 10);
        const matchesData = !filtroData || dataProducao === filtroData;
        const matchesFuncionario = !filtroFuncionario || p.funcionario === filtroFuncionario;
        const matchesMaquina = !filtroMaquina || p.maquina === filtroMaquina;
        const matchesProcesso = !filtroProcesso || p.processo === filtroProcesso;
        const matchesProduto = !filtroProduto || p.produto === filtroProduto;
        const matchesAssinatura = filtroAssinatura === '' || (filtroAssinatura === 'sim' && p.assinada) || (filtroAssinatura === 'nao' && !p.assinada);
        
        return matchesData && matchesFuncionario && matchesMaquina && matchesProcesso && matchesProduto && matchesAssinatura;
    });

    filteredProducoes.sort((a, b) => new Date(b.data) - new Date(a.data));

    renderizarTabela(filteredProducoes);
}

/** Renderiza a tabela e a paginação com base nos dados filtrados. */
function renderizarTabela(producoesFiltradas) {
    const corpoTabela = document.getElementById('corpoTabelaProducoes');
    const paginacaoContainer = document.getElementById('paginacao');
    const tabelaContainer = document.getElementById('tabelaProducoes');
    const noRecordsMessage = document.getElementById('noRecordsMessage');

    if (!corpoTabela || !tabelaContainer || !noRecordsMessage) return;

    document.querySelectorAll('.edit-mode').forEach(row => desativarModoEdicao(row));

    if (producoesFiltradas.length === 0) {
        tabelaContainer.style.display = 'none';
        if (paginacaoContainer) paginacaoContainer.innerHTML = '';
        noRecordsMessage.style.display = 'block';
        return;
    }

    tabelaContainer.style.display = 'table';
    noRecordsMessage.style.display = 'none';

    const totalRegistros = producoesFiltradas.length;
    const totalPaginas = Math.ceil(totalRegistros / registrosPorPagina);
    const inicio = (currentPage - 1) * registrosPorPagina;
    const fim = inicio + registrosPorPagina;
    const producoesPagina = producoesFiltradas.slice(inicio, fim);

    corpoTabela.innerHTML = '';
    producoesPagina.forEach(p => {
        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        tr.dataset.opNumero = p.op_numero;

        tr.innerHTML = `
            <td data-label="Feito Por:" data-field="funcionario">${p.funcionario}</td>
            <td data-label="Produto">${p.produto}</td>
            <td data-label="Variação">${p.variacao}</td>
            <td data-label="Proc./Máq.">${p.processo} / ${p.maquina}</td>
            <td data-label="OP">${p.op_numero || '-'}</td>
            <td data-label="Qtde" data-field="quantidade">${p.quantidade}</td>
            <td data-label="Data/Hora">${p.dataHoraFormatada} ${p.edicoes > 0 ? `<span class="edicao-info">(E${p.edicoes}x)</span>`: ''}</td>
            <td data-label="Assinou?">${p.assinada ? 'Sim' : 'Não'}</td>
            <td data-label="Por">${p.lancado_por || 'Desconhecido'}</td>
            <td data-label="Ação">
                <div class="botoes-acao">
                    ${permissoes.includes('editar-registro-producao') ? '<button class="btn-editar-registro">Editar</button>' : ''}
                    ${permissoes.includes('excluir-registro-producao') ? '<button class="btn-excluir-registro">Excluir</button>' : ''}
                </div>
            </td>
        `;
        corpoTabela.appendChild(tr);
    });

    renderizarPaginacao(totalPaginas);
}

/** Renderiza os botões de paginação. */
function renderizarPaginacao(totalPaginas) {
    const paginacao = document.getElementById('paginacao');
    if (!paginacao) return;
    paginacao.innerHTML = '';

    if (totalPaginas <= 1) return;

    const criarBotao = (texto, pagina, desabilitado = false, ativo = false) => {
        const btn = document.createElement('button');
        btn.textContent = texto;
        btn.disabled = desabilitado;
        if (ativo) btn.classList.add('active');
        btn.addEventListener('click', () => aplicarFiltros(pagina));
        return btn;
    };

    paginacao.appendChild(criarBotao('Anterior', currentPage - 1, currentPage === 1));

    for (let i = 1; i <= totalPaginas; i++) {
        paginacao.appendChild(criarBotao(i, i, false, i === currentPage));
    }

    paginacao.appendChild(criarBotao('Próximo', currentPage + 1, currentPage === totalPaginas));
}


// --- LÓGICA DE AÇÕES (EDITAR, SALVAR, CANCELAR, EXCLUIR) ---

/** Ativa o modo de edição para uma linha da tabela. */
function ativarModoEdicao(tr) {
    // Desativa a edição em qualquer outra linha primeiro
    document.querySelectorAll('.edit-mode').forEach(row => {
        if (row !== tr) desativarModoEdicao(row);
    });

    tr.classList.add('edit-mode');

    const id = tr.dataset.id;
    const producao = allProducoes.find(p => p.id === id);
    if (!producao) {
        console.error(`Não foi possível encontrar os dados para a produção com ID: ${id}`);
        return;
    }
    
    // --- CÉLULA DO FUNCIONÁRIO (COM FILTRO) ---
    const tdFuncionario = tr.querySelector('[data-field="funcionario"]');
    const nomeAtual = tdFuncionario.textContent;
    tdFuncionario.innerHTML = '';
    const selectFuncionario = document.createElement('select');

    const tipoUsuarioDaEtapa = producao.feitoPor;

    allUsuarios
        .filter(u => u.tipos?.includes(tipoUsuarioDaEtapa))
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .forEach(u => {
            const option = new Option(u.nome, u.nome);
            selectFuncionario.appendChild(option);
        });
    
    selectFuncionario.value = nomeAtual;
    tdFuncionario.appendChild(selectFuncionario);

    // --- CÉLULA DA QUANTIDADE ---
    const tdQuantidade = tr.querySelector('[data-field="quantidade"]');
    const qtdAtual = tdQuantidade.textContent;
    tdQuantidade.innerHTML = `<input type="number" value="${qtdAtual}" min="1" class="edit-input-qtd"/>`;

    // --- CÉLULA DE AÇÕES ---
    const tdAcao = tr.querySelector('[data-label="Ação"]');
    tdAcao.innerHTML = `
        <div class="botoes-acao">
            <button class="btn-salvar-edicao">Salvar</button>
            <button class="btn-cancelar-edicao">Cancelar</button>
        </div>
    `;
}



/** Desativa o modo de edição, restaurando a visualização original da linha. */
function desativarModoEdicao(tr, dadosNovos = null) {
    tr.classList.remove('edit-mode');
    const id = tr.dataset.id;
    
    // Se recebemos dados novos (após salvar), usamos eles.
    // Senão, buscamos os dados originais no nosso array em memória.
    const producao = dadosNovos || allProducoes.find(p => p.id === id);
    if (!producao) {
        console.error(`Produção com ID ${id} não encontrada para restaurar a linha.`);
        tr.remove(); // Remove a linha se os dados sumiram por algum motivo
        return;
    }

    // Restaura as células de dados para texto simples
    tr.querySelector('[data-field="funcionario"]').textContent = producao.funcionario;
    tr.querySelector('[data-field="quantidade"]').textContent = producao.quantidade;

    // Restaura os botões de ação originais
    const tdAcao = tr.querySelector('[data-label="Ação"]');
    if (tdAcao) {
        tdAcao.innerHTML = `
            <div class="botoes-acao">
                ${permissoes.includes('editar-registro-producao') ? '<button class="btn-editar-registro">Editar</button>' : ''}
                ${permissoes.includes('excluir-registro-producao') ? '<button class="btn-excluir-registro">Excluir</button>' : ''}
            </div>
        `;
    }
}

/** Salva as alterações feitas no modo de edição. */
async function salvarEdicao(tr) {
    const id = tr.dataset.id;
    const producaoOriginal = allProducoes.find(p => p.id === id);

    const novoFuncionario = tr.querySelector('select').value;
    const novaQuantidade = parseInt(tr.querySelector('input[type="number"]').value);

    if (isNaN(novaQuantidade) || novaQuantidade <= 0) {
        mostrarPopup('A quantidade deve ser um número positivo.', 'aviso');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/producoes', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                quantidade: novaQuantidade,
                funcionario: novoFuncionario,
                edicoes: (producaoOriginal.edicoes || 0) + 1,
            }),
        });

        if (!response.ok) throw new Error('Falha ao salvar alterações na API.');
        
        const producaoAtualizada = await response.json();

        const index = allProducoes.findIndex(p => p.id === id);
        if (index !== -1) {
            // ==========================================================
            // >> CORREÇÃO AQUI <<
            // ==========================================================
            // Mantemos todas as propriedades que já tínhamos calculado no frontend
            // (como 'variacao' e 'feitoPor') e sobrescrevemos apenas as que
            // a API retornou (como 'quantidade', 'funcionario', 'edicoes').
            allProducoes[index] = {
                ...allProducoes[index], // <-- Mantém o objeto antigo como base
                ...producaoAtualizada,  // <-- Sobrescreve com os dados novos da API
                // Recalculamos a data formatada pois a API não retorna isso
                dataHoraFormatada: new Date(producaoAtualizada.data).toLocaleString('pt-BR'),
            };
        }

        await verificarEAtualizarStatusOP(producaoAtualizada.op_numero);
        
        mostrarPopup('Alterações salvas com sucesso!', 'sucesso');
         // ==========================================================
        // >> Passar os dados atualizados <<
        // ==========================================================
        desativarModoEdicao(tr, allProducoes[index]); // Passamos o objeto totalmente atualizado


    } catch (error) {
        console.error('Erro ao salvar edição:', error);
        mostrarPopup('Não foi possível salvar as alterações.', 'erro');
        desativarModoEdicao(tr);
    }
}

/** Exclui um registro de produção. */
async function excluirRegistro(id) {
    if (!confirm("Tem certeza que deseja excluir este registro de produção?")) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/producoes', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        
        if (!response.ok) throw new Error('Falha ao excluir o registro na API.');

        const producaoExcluida = await response.json();
        
        allProducoes = allProducoes.filter(p => p.id !== id);
        
        await verificarEAtualizarStatusOP(producaoExcluida.op_numero);
        
        mostrarPopup('Registro excluído com sucesso!', 'sucesso');
        aplicarFiltros(currentPage);

    } catch (error) {
        console.error('Erro ao excluir registro:', error);
        mostrarPopup('Não foi possível excluir o registro.', 'erro');
    }
}

/** Função auxiliar para reverter status da OP. */
async function verificarEAtualizarStatusOP(opNumero) {
    if (!opNumero) return;

    const op = allOrdens.find(o => String(o.numero).trim() === String(opNumero).trim());
    if (!op || op.status !== 'finalizado') return;

    const producoesDaOP = allProducoes.filter(p => String(p.op_numero).trim() === String(opNumero).trim());
    const etapasLancadasIndices = new Set(producoesDaOP.map(p => p.etapa_index));

    if (etapasLancadasIndices.size < op.etapas.length) {
        console.log(`[StatusCheck] OP #${opNumero} não está mais completa. Revertendo para 'produzindo'.`);
        op.status = 'produzindo';
        
        const token = localStorage.getItem('token');
        await fetch('/api/ordens-de-producao', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(op),
        });

        const opIndex = allOrdens.findIndex(o => o.id === op.id);
        if (opIndex !== -1) allOrdens[opIndex].status = 'produzindo';
    }
}


// --- INICIALIZAÇÃO E EVENT LISTENERS GLOBAIS ---

/** Configura um único event listener na tabela para lidar com todos os cliques. */
function setupEventListeners() {
    const corpoTabela = document.getElementById('corpoTabelaProducoes');
    
    if (corpoTabela) {
        // Um único listener para a tabela inteira!
        corpoTabela.addEventListener('click', (event) => {
            const target = event.target; // O elemento exato que foi clicado
            const tr = target.closest('tr'); // A linha (tr) mais próxima do clique
            
            // Se o clique foi fora de uma linha, não faz nada
            if (!tr) return;

            // Verifica qual botão foi clicado pela sua classe
            if (target.classList.contains('btn-editar-registro')) {
                console.log('Botão Editar clicado');
                ativarModoEdicao(tr);
            } 
            else if (target.classList.contains('btn-excluir-registro')) {
                console.log('Botão Excluir clicado');
                excluirRegistro(tr.dataset.id);
            } 
            else if (target.classList.contains('btn-salvar-edicao')) {
                console.log('Botão Salvar clicado');
                salvarEdicao(tr);
            } 
            else if (target.classList.contains('btn-cancelar-edicao')) {
                console.log('Botão Cancelar clicado');
                desativarModoEdicao(tr);
            }
        });
    }

    // Os listeners para os filtros continuam os mesmos
    document.getElementById('filtroCostureira')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroData')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroMaquina')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroProcesso')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroProduto')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('filtroAssinatura')?.addEventListener('change', () => aplicarFiltros(1));
    document.getElementById('limparFiltros')?.addEventListener('click', () => {
        document.getElementById('filtroCostureira').value = '';
        document.getElementById('filtroData').value = new Date().toISOString().substring(0, 10); // Volta para data de hoje
        document.getElementById('filtroMaquina').value = '';
        document.getElementById('filtroProcesso').value = '';
        document.getElementById('filtroProduto').value = '';
        document.getElementById('filtroAssinatura').value = '';
        aplicarFiltros(1);
    });
}

/** Função principal que inicializa a página. */
async function inicializar() {
    const auth = await verificarAutenticacao('gerenciar-producao.html', ['acesso-gerenciar-producao']);
    if (!auth) return;
    permissoes = auth.permissoes || [];
    usuarioLogado = auth.usuario;

    document.getElementById('filtroData').value = new Date().toISOString().substring(0, 10);

     const corpoTabela = document.getElementById('corpoTabelaProducoes');
    if (corpoTabela) {
        corpoTabela.innerHTML = `
            <tr>
                <td colspan="10" class="loading-cell">
                    <div class="spinner">Carregando todos os dados, por favor aguarde...</div>
                </td>
            </tr>
        `;
    }
    
    await carregarDadosIniciais();

    aplicarFiltros(1);

    setupEventListeners();
}

// Inicia a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', inicializar);