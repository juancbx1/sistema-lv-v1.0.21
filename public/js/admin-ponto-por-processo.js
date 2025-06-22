// public/js/admin-ponto-por-processo.js
import { verificarAutenticacao } from '/js/utils/auth.js';

(async () => { 
    let usuarioLogado = null;
    let todasConfiguracoesPontos = []; // Cache das configurações de pontos
    let listaDeProdutosDisponiveis = []; // Cache dos produtos e seus processos/etapas

    // Elementos do DOM
    const feedbackMensagemEl = document.getElementById('ppp-mensagem-feedback');
    const corpoTabelaPontosPadraoEl = document.getElementById('corpoTabelaPontosPadrao');
    const filtroProdutoEl = document.getElementById('filtroProduto');
    const filtroTipoAtividadeEl = document.getElementById('filtroTipoAtividade');
    const btnAdicionarNovaConfiguracaoEl = document.getElementById('btnAdicionarNovaConfiguracao');

    const NOME_PROCESSO_ARREMATE_PADRAO = "Arremate (Config)"; // Nome padrão para processo de arremate

    function mostrarFeedback(mensagem, tipo = 'sucesso', duracao = 4000) {
        if (!feedbackMensagemEl) {
            console.log(`Feedback (${tipo}): ${mensagem}`); // Fallback para console se elemento não encontrado
            return;
        }
        feedbackMensagemEl.textContent = mensagem;
        feedbackMensagemEl.className = `ppp-mensagem ppp-mensagem-${tipo}`; // Garante que a classe base ppp-mensagem esteja lá
        feedbackMensagemEl.style.display = 'block';
        
        // Limpa timeout anterior se houver, para evitar múltiplos fechamentos
        if (feedbackMensagemEl.timeoutId) {
            clearTimeout(feedbackMensagemEl.timeoutId);
        }

        if (duracao > 0) {
            feedbackMensagemEl.timeoutId = setTimeout(() => {
                if (feedbackMensagemEl) feedbackMensagemEl.style.display = 'none';
            }, duracao);
        }
    }

    async function carregarProdutosDoServidor() {
    try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error("Token de autenticação não encontrado.");
        
        const response = await fetch('/api/produtos', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
            throw new Error(errorData.error || `Erro ${response.status} ao carregar produtos.`);
        }
        const produtosCrus = await response.json();
        if (!Array.isArray(produtosCrus)) {
            console.warn("API de produtos não retornou um array:", produtosCrus);
            listaDeProdutosDisponiveis = [];
        } else {
            // Garante que cada produto tenha um ID numérico e um nome.
            // Filtra produtos sem ID ou nome, se houver, para evitar erros posteriores.
            listaDeProdutosDisponiveis = produtosCrus.filter(p => p && typeof p.id === 'number' && typeof p.nome === 'string');
        }
        popularFiltroProdutos(); // Popula o select com os produtos carregados (ID como value)
    } catch (error) {
        console.error('Erro ao carregar produtos do servidor:', error);
        mostrarFeedback(`Erro ao carregar lista de produtos: ${error.message}`, 'erro');
        listaDeProdutosDisponiveis = [];
        popularFiltroProdutos();
    }
}

        function popularFiltroProdutos() {
    if (!filtroProdutoEl) return;
    filtroProdutoEl.innerHTML = '<option value="">Todos os Produtos</option>'; // Reseta
    if (Array.isArray(listaDeProdutosDisponiveis) && listaDeProdutosDisponiveis.length > 0) {
        // Ordena os produtos pelo nome para exibição no select
        const produtosOrdenados = [...listaDeProdutosDisponiveis].sort((a, b) => a.nome.localeCompare(b.nome));
        produtosOrdenados.forEach(produto => {
            // O VALOR do option é o produto.id, o TEXTO exibido é produto.nome
            filtroProdutoEl.add(new Option(produto.nome, produto.id));
        });
    }
}

    async function carregarConfiguracoesPontos() {
    if (!corpoTabelaPontosPadraoEl) {
        console.error("Elemento corpoTabelaPontosPadraoEl não encontrado.");
        return;
    }
    corpoTabelaPontosPadraoEl.innerHTML = '<tr><td colspan="6" class="ppp-carregando"><div class="ppp-spinner"></div> Carregando configurações...</td></tr>';
    
    try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error("Token de autenticação não encontrado.");

        const produtoIdFiltro = filtroProdutoEl.value; // Pega o ID do produto do select
        const tipoAtividadeFiltro = filtroTipoAtividadeEl.value;
        
        const params = new URLSearchParams();
        if (produtoIdFiltro) {
            params.append('produto_id', produtoIdFiltro); // Envia produto_id para a API
        }
        if (tipoAtividadeFiltro) {
            params.append('tipo_atividade', tipoAtividadeFiltro);
        }
        // Exemplo: para buscar apenas ativos por padrão
        // params.append('ativo', 'true'); 
        
        const apiUrl = `/api/configuracao-pontos/padrao?${params.toString()}`;
        const response = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${token}` } });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
            throw new Error(errorData.error || `Erro ${response.status} ao carregar configurações.`);
        }
        todasConfiguracoesPontos = await response.json();
        if (!Array.isArray(todasConfiguracoesPontos)) {
            console.warn("API de configurações não retornou um array:", todasConfiguracoesPontos);
            todasConfiguracoesPontos = [];
        }
        // A API GET /padrao agora deve retornar 'produto_nome' (do JOIN) e 'produto_id'
        renderizarTabelaPontosPadrao();
    } catch (error) {
        console.error('Erro ao carregar configurações de pontos:', error);
        mostrarFeedback(`Erro ao carregar configurações: ${error.message}`, 'erro');
        todasConfiguracoesPontos = [];
        if (corpoTabelaPontosPadraoEl) corpoTabelaPontosPadraoEl.innerHTML = '<tr><td colspan="6" class="ppp-erro-carregar">Falha ao carregar configurações. Tente novamente.</td></tr>';
    }
}

    function getTipoAtividadeTexto(tipo) {
        if (tipo === 'costura_op_costureira') return 'Costura OP (Costureira)';
        if (tipo === 'processo_op_tiktik') return 'Processo OP (Tiktik)';
        if (tipo === 'arremate_tiktik') return 'Arremate (Tiktik)';
        return tipo || 'Não Definido';
    }

    function renderizarTabelaPontosPadrao() {
    if (!corpoTabelaPontosPadraoEl) return;
    corpoTabelaPontosPadraoEl.innerHTML = '';

    const configuracoesParaExibir = todasConfiguracoesPontos;

    if (configuracoesParaExibir.length === 0) {
        corpoTabelaPontosPadraoEl.innerHTML = `<tr><td colspan="6">Nenhuma configuração de ponto encontrada para os filtros selecionados.</td></tr>`;
        return;
    }

    configuracoesParaExibir.forEach(config => {
        const tr = corpoTabelaPontosPadraoEl.insertRow();
        tr.dataset.configId = config.id;
        // Armazena o produto_id e o produto_nome (vindo do JOIN na API)
        tr.dataset.produtoIdOriginal = config.produto_id;
        tr.dataset.produtoNomeOriginal = config.produto_nome; // Usado para exibição e referência se necessário
        tr.dataset.processoNomeOriginal = config.processo_nome || '';
        tr.dataset.tipoAtividadeOriginal = config.tipo_atividade;

        tr.innerHTML = `
            <td>${config.produto_nome}</td>
            <td>${config.processo_nome || (config.tipo_atividade === 'arremate_tiktik' ? NOME_PROCESSO_ARREMATE_PADRAO : '-')}</td>
            <td>${getTipoAtividadeTexto(config.tipo_atividade)}</td>
            <td><input type="number" class="ppp-input-pontos" value="${parseFloat(config.pontos_padrao || 0).toFixed(2)}" step="0.01" min="0.01"></td>
            <td><input type="checkbox" class="ppp-checkbox-ativo" ${config.ativo ? 'checked' : ''}></td>
            <td>
                <button class="ppp-botao ppp-botao-salvar" title="Salvar Alterações"><i class="fas fa-save"></i> Salvar</button>
                <button class="ppp-botao ppp-botao-excluir" title="Excluir Configuração"><i class="fas fa-trash"></i> Excluir</button>
            </td>
        `;
    });
}

    async function salvarConfiguracaoPonto(configId, produtoId, processoNome, tipoAtividade, pontosValor, ativo) {
    const isNovaConfiguracao = (configId === 'novo' || !configId);
    try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error("Token de autenticação não encontrado.");

        if (!produtoId || !tipoAtividade ) {
             mostrarFeedback('Produto e Tipo de Atividade são obrigatórios.', 'erro'); return null;
        }
        const produtoIdNum = parseInt(produtoId);
        if (isNaN(produtoIdNum) || produtoIdNum <= 0) {
            mostrarFeedback('ID do Produto inválido.', 'erro'); return null;
        }

        if (tipoAtividade !== 'arremate_tiktik' && !processoNome) {
             mostrarFeedback('Processo é obrigatório para este tipo de atividade.', 'erro'); return null;
        }
        
        // ---- INÍCIO DO BLOCO DE DEBUG PARA PONTOS ----
        console.log("[salvarConfiguracaoPonto] Valor de 'pontosValor' ANTES do parseFloat:", pontosValor, "Tipo:", typeof pontosValor); // DEBUG
        const pontosFloat = parseFloat(pontosValor);
        console.log("[salvarConfiguracaoPonto] Valor de 'pontosFloat' DEPOIS do parseFloat:", pontosFloat, "Tipo:", typeof pontosFloat); // DEBUG
        // ---- FIM DO BLOCO DE DEBUG PARA PONTOS ----

        if (isNaN(pontosFloat) || pontosFloat <= 0) {
             console.error("[salvarConfiguracaoPonto] Validação FALHOU: isNaN(pontosFloat) =", isNaN(pontosFloat), "|| pontosFloat <= 0 =", (pontosFloat <= 0)); // DEBUG
             mostrarFeedback('Pontos devem ser um número positivo.', 'erro'); return null;
        }

        

        const payload = {
            produto_id: produtoIdNum, // Envia o ID numérico do produto
            processo_nome: (tipoAtividade === 'arremate_tiktik') ? NOME_PROCESSO_ARREMATE_PADRAO : processoNome,
            tipo_atividade: tipoAtividade,
            pontos_padrao: pontosFloat,
            ativo: ativo
        };
        
        // A API POST /padrao foi ajustada para fazer UPSERT usando (produto_id, processo_nome, tipo_atividade)
        const url = '/api/configuracao-pontos/padrao';
        const method = 'POST'; 

        const response = await fetch(url, {
            method: method,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || `Erro ${response.status} ao salvar configuração.`);
        }
        
        mostrarFeedback(`Configuração ${isNovaConfiguracao ? 'adicionada' : 'atualizada'} com sucesso!`, 'sucesso');
        // É importante que a API POST retorne o objeto completo, incluindo o nome do produto (do JOIN)
        // para que a tabela seja recarregada corretamente se a API não for chamada novamente.
        // No entanto, a forma mais segura é sempre recarregar da API GET.
        await carregarConfiguracoesPontos(); 
        return responseData;

    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        mostrarFeedback(`Erro ao salvar: ${error.message}`, 'erro');
        return null;
    }
}

    async function excluirConfiguracaoPonto(configId) {
        if (!confirm('Tem certeza que deseja excluir esta configuração de ponto? Esta ação não pode ser desfeita.')) return;
        
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Token de autenticação não encontrado.");

            const response = await fetch(`/api/configuracao-pontos/padrao/${configId}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({error: `Erro HTTP ${response.status}`}));
                throw new Error(errorData.error || `Erro ${response.status} ao excluir.`);
            }
            mostrarFeedback('Configuração excluída com sucesso!', 'sucesso');
            await carregarConfiguracoesPontos();
        } catch (error) {
            console.error('Erro ao excluir configuração:', error);
            mostrarFeedback(`Erro ao excluir: ${error.message}`, 'erro');
        }
    }

    function adicionarLinhaNovaConfiguracao() {
    if (corpoTabelaPontosPadraoEl.querySelector('tr[data-config-id="novo"]')) {
        mostrarFeedback("Finalize ou cancele a adição da configuração atual antes de adicionar outra.", "aviso");
        corpoTabelaPontosPadraoEl.querySelector('tr[data-config-id="novo"] .ppp-select-novo.ppp-input-novo-produto')?.focus();
        return;
    }

    const tr = corpoTabelaPontosPadraoEl.insertRow(0);
    tr.dataset.configId = "novo";
    tr.classList.add('ppp-nova-linha');

    const criarCellComSelect = (optionsArray, className, defaultOptionText = "Selecione") => {
        const cell = tr.insertCell();
        const select = document.createElement('select');
        select.className = `ppp-select ppp-select-novo ${className}`;
        select.add(new Option(defaultOptionText, ""));
        optionsArray.forEach(opt => {
            // opt é esperado como { texto: "Nome Produto", valor: ID_DO_PRODUTO }
            // ou string para tipos de atividade fixos, mas para produtos usamos o objeto.
            select.add(new Option(opt.texto, opt.valor));
        });
        cell.appendChild(select);
        return select;
    };

    // Prepara a lista de produtos para o select: { texto: nome, valor: id }
    const produtosParaSelect = listaDeProdutosDisponiveis
        .map(p => ({ texto: p.nome, valor: p.id }))
        .sort((a,b) => a.texto.localeCompare(b.texto));
    
    const selectProduto = criarCellComSelect(produtosParaSelect, 'ppp-input-novo-produto', "Selecione Produto");

    const cellProcesso = tr.insertCell();
    const selectProcesso = document.createElement('select');
    selectProcesso.className = 'ppp-select ppp-select-novo ppp-input-novo-processo';
    selectProcesso.disabled = true;
    cellProcesso.appendChild(selectProcesso);

    const tiposAtividade = [
        { texto: "Selecione Tipo", valor: "" },
        { texto: "Costura OP (Costureira)", valor: "costura_op_costureira" },
        { texto: "Processo OP (Tiktik)", valor: "processo_op_tiktik" },
        { texto: "Arremate (Tiktik)", valor: "arremate_tiktik" }
    ];
    const selectTipoAtividade = criarCellComSelect(tiposAtividade, 'ppp-input-novo-tipo', "Selecione Tipo");
    
    const atualizarCamposProcesso = () => {
        const produtoIdSelecionado = selectProduto.value; // Pega o ID do produto
        const tipoAtividade = selectTipoAtividade.value;
        selectProcesso.innerHTML = '';
        selectProcesso.disabled = true;

        if (tipoAtividade === 'arremate_tiktik') {
            selectProcesso.add(new Option(NOME_PROCESSO_ARREMATE_PADRAO, NOME_PROCESSO_ARREMATE_PADRAO, true, true));
            // selectProcesso.disabled = true; // Mantém desabilitado ou habilita se quiser que seja editável (não recomendado)
        } else if (produtoIdSelecionado && (tipoAtividade === 'costura_op_costureira' || tipoAtividade === 'processo_op_tiktik')) {
            // Encontra o objeto produto completo usando o ID
            const produtoObj = listaDeProdutosDisponiveis.find(p => String(p.id) === String(produtoIdSelecionado));
            selectProcesso.add(new Option("Selecione Processo OP", ""));
            if (produtoObj && Array.isArray(produtoObj.etapas) && produtoObj.etapas.length > 0) {
                // Remove duplicados e ordena as etapas/processos do produto selecionado
                const nomesProcessosUnicos = [...new Set(produtoObj.etapas.map(etapa => 
                    (typeof etapa === 'object' && etapa.processo) ? etapa.processo : String(etapa)
                ).filter(Boolean))].sort();

                nomesProcessosUnicos.forEach(nomeProc => {
                    selectProcesso.add(new Option(nomeProc, nomeProc));
                });
                selectProcesso.disabled = false;
            } else {
                 selectProcesso.add(new Option("Produto sem processos OP", ""));
            }
        } else {
             selectProcesso.add(new Option("----", ""));
        }
    };
    selectProduto.addEventListener('change', atualizarCamposProcesso);
    selectTipoAtividade.addEventListener('change', atualizarCamposProcesso);

    const cellPontos = tr.insertCell();
    const inputPontos = document.createElement('input');
    inputPontos.type = 'number'; inputPontos.className = 'ppp-input-pontos ppp-input-novo-pontos';
    inputPontos.value = '1.00'; inputPontos.step = '0.01'; inputPontos.min = '0.01';
    cellPontos.appendChild(inputPontos);

    const cellAtivo = tr.insertCell();
    const checkboxAtivo = document.createElement('input');
    checkboxAtivo.type = 'checkbox'; checkboxAtivo.className = 'ppp-checkbox-ativo ppp-input-novo-ativo';
    checkboxAtivo.checked = true;
    cellAtivo.appendChild(checkboxAtivo);

    const cellAcoes = tr.insertCell();
    const btnSalvarNovo = document.createElement('button');
    btnSalvarNovo.className = 'ppp-botao ppp-botao-salvar';
    btnSalvarNovo.innerHTML = '<i class="fas fa-save"></i> Salvar';
    btnSalvarNovo.title = "Salvar Nova Configuração";
    btnSalvarNovo.onclick = async () => {
        // Envia o produtoId (que é o value do selectProduto)
        await salvarConfiguracaoPonto(
            'novo',
            selectProduto.value, // Este agora é o ID do produto
            selectProcesso.value,
            selectTipoAtividade.value,
            inputPontos.value,
            checkboxAtivo.checked
        );
    };

    const btnCancelarNovo = document.createElement('button');
    btnCancelarNovo.className = 'ppp-botao ppp-botao-excluir';
    btnCancelarNovo.innerHTML = '<i class="fas fa-times"></i> Cancelar';
    btnCancelarNovo.title = "Cancelar Adição";
    btnCancelarNovo.onclick = () => tr.remove();
    
    cellAcoes.appendChild(btnSalvarNovo);
    cellAcoes.appendChild(btnCancelarNovo);
    selectProduto.focus();
}

    async function init() {
        try {
            const auth = await verificarAutenticacao('ponto-por-processo.html', ['acesso-ponto-por-processo']);
            if (!auth || !auth.usuario) { // Verifica se auth e auth.usuario existem
                 console.error("Autenticação falhou ou dados do usuário não retornados.");
                 document.body.innerHTML = '<p style="color: red; padding: 20px;">Falha na autenticação. Acesso negado.</p>';
                 return; // Interrompe a execução se a autenticação falhar
            }
            usuarioLogado = auth.usuario;
            document.body.classList.add('autenticado');

            await carregarProdutosDoServidor();
            await carregarConfiguracoesPontos(); // Carga inicial da tabela

            if(filtroProdutoEl) filtroProdutoEl.addEventListener('change', carregarConfiguracoesPontos);
            if(filtroTipoAtividadeEl) filtroTipoAtividadeEl.addEventListener('change', carregarConfiguracoesPontos);
            if(btnAdicionarNovaConfiguracaoEl) btnAdicionarNovaConfiguracaoEl.addEventListener('click', adicionarLinhaNovaConfiguracao);

            if(corpoTabelaPontosPadraoEl) {
            corpoTabelaPontosPadraoEl.addEventListener('click', async (e) => {
                const targetButton = e.target.closest('button.ppp-botao');
                if (!targetButton) return;

                const tr = targetButton.closest('tr');
                if (!tr) return;
                const configId = tr.dataset.configId;

                if (targetButton.classList.contains('ppp-botao-salvar') && configId !== 'novo') {
                    const produtoIdOriginal = tr.dataset.produtoIdOriginal; 
                    const processoNomeOriginal = tr.dataset.processoNomeOriginal;
                    const tipoAtividadeOriginal = tr.dataset.tipoAtividadeOriginal;

                    const pontosInput = tr.querySelector('.ppp-input-pontos');
                    const ativoCheckbox = tr.querySelector('.ppp-checkbox-ativo');

                    if (pontosInput && ativoCheckbox) {
                        const pontosValor = pontosInput.value; // Valor lido do input
                        const ativo = ativoCheckbox.checked;

                        // ---- INÍCIO DO BLOCO DE DEBUG ----
                        console.log("[Listener Salvar Edição] Tentando salvar. Config ID:", configId);
                        console.log("[Listener Salvar Edição] Valor lido do input de pontos (pontosValor):", pontosValor, "Tipo:", typeof pontosValor);
                        console.log("[Listener Salvar Edição] Checkbox 'ativo':", ativo);
                        // ---- FIM DO BLOCO DE DEBUG ----
                        
                        // A validação original estava aqui, mas é melhor centralizar em salvarConfiguracaoPonto
                        // if (parseFloat(pontosValor) <= 0 || isNaN(parseFloat(pontosValor))) {
                        //     mostrarFeedback('Ao editar, os pontos devem ser um número positivo.', 'erro'); return;
                        // }

                        await salvarConfiguracaoPonto(
                            configId, 
                            produtoIdOriginal, 
                            processoNomeOriginal, 
                            tipoAtividadeOriginal, 
                            pontosValor, // Passa o valor lido
                            ativo
                        );
                    }
                } else if (targetButton.classList.contains('ppp-botao-excluir') && configId !== 'novo') {
                    await excluirConfiguracaoPonto(configId);
                }
            });
        }
        } catch (error) {
            console.error("Erro na inicialização da página de Pontos por Processo:", error);
            document.body.innerHTML = `<p style="color: red; padding: 20px;">Erro crítico ao carregar a página: ${error.message || 'Erro desconhecido'}. Verifique o console.</p>`;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init(); // Call init directly if DOM is already loaded
    }
})();

// Polyfill para closest (se ainda não o tiver globalmente)
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        var el = this;
        do {
            if (Element.prototype.matches.call(el, s)) return el;
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}