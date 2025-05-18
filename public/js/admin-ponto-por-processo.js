// public/js/admin-ponto-por-processo.js
import { verificarAutenticacao } from '/js/utils/auth.js';

(async () => {
    let usuarioLogado = null;
    let permissoesUsuario = [];
    let todasConfiguracoesPontos = []; // Cache das configurações de pontos padrão
    let listaDeProdutosDisponiveis = []; // Cache dos produtos e seus processos

    const feedbackMensagemEl = document.getElementById('ppp-mensagem-feedback');
    const corpoTabelaPontosPadraoEl = document.getElementById('corpoTabelaPontosPadrao');
    const filtroProdutoEl = document.getElementById('filtroProduto');
    const btnAdicionarNovaConfiguracaoEl = document.getElementById('btnAdicionarNovaConfiguracao');

    function mostrarFeedback(mensagem, tipo = 'sucesso') {
        feedbackMensagemEl.textContent = mensagem;
        feedbackMensagemEl.className = `ppp-mensagem ppp-mensagem-${tipo}`;
        feedbackMensagemEl.style.display = 'block';
        setTimeout(() => {
            feedbackMensagemEl.style.display = 'none';
        }, 5000);
    }

    // Função para buscar produtos e seus processos (da API /api/produtos)
async function carregarProdutosDoServidor() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/produtos', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error(`Erro ao carregar produtos: ${response.statusText}`);
        }
        const produtosDaApi = await response.json(); // Pega a resposta crua

        // Exemplo: Logar as etapas do primeiro produto ou de um produto específico
        if (produtosDaApi.length > 0) {
            const produtoExemplo = produtosDaApi.find(p => p.nome === 'Fronha'); // Ou outro produto
            if (produtoExemplo) {
                console.log(`[PontosPorProcesso - carregarProdutosDoServidor] Etapas do produto "${produtoExemplo.nome}":`, produtoExemplo.etapas);
            } else {
                console.log('[PontosPorProcesso - carregarProdutosDoServidor] Produto "Fronha" não encontrado na lista da API.');
            }
        }

        listaDeProdutosDisponiveis = produtosDaApi; // Atribui à variável global
        popularFiltroProdutos();
    } catch (error) {
        console.error('Erro ao carregar produtos do servidor:', error);
        mostrarFeedback(`Erro ao carregar lista de produtos: ${error.message}`, 'erro');
        listaDeProdutosDisponiveis = [];
    }
}

    function popularFiltroProdutos() {
        filtroProdutoEl.innerHTML = '<option value="">Todos os Produtos</option>';
        const nomesProdutosUnicos = [...new Set(listaDeProdutosDisponiveis.map(p => p.nome))].sort();
        nomesProdutosUnicos.forEach(nomeProduto => {
            const option = document.createElement('option');
            option.value = nomeProduto;
            option.textContent = nomeProduto;
            filtroProdutoEl.appendChild(option);
        });
    }

    // Função para buscar configurações de pontos padrão
    async function carregarConfiguracoesPontos() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/configuracao-pontos/padrao', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) {
                throw new Error(`Erro ao carregar configurações: ${response.statusText}`);
            }
            todasConfiguracoesPontos = await response.json();
            renderizarTabelaPontosPadrao();
        } catch (error) {
            console.error('Erro ao carregar configurações de pontos:', error);
            mostrarFeedback(`Erro ao carregar configurações: ${error.message}`, 'erro');
            todasConfiguracoesPontos = []; // Limpa para evitar dados inconsistentes
        }
    }

    function renderizarTabelaPontosPadrao(filtroProduto = '') {
        corpoTabelaPontosPadraoEl.innerHTML = ''; // Limpa a tabela
        if (!Array.isArray(todasConfiguracoesPontos)) {
            console.error("todasConfiguracoesPontos não é um array", todasConfiguracoesPontos);
            return;
        }

        const configuracoesFiltradas = filtroProduto
            ? todasConfiguracoesPontos.filter(config => config.produto_nome === filtroProduto)
            : todasConfiguracoesPontos;

        if (configuracoesFiltradas.length === 0 && filtroProduto) {
            corpoTabelaPontosPadraoEl.innerHTML = `<tr><td colspan="5">Nenhuma configuração de ponto encontrada para "${filtroProduto}". Você pode adicionar uma.</td></tr>`;
        } else if (configuracoesFiltradas.length === 0 && !filtroProduto){
             corpoTabelaPontosPadraoEl.innerHTML = `<tr><td colspan="5">Nenhuma configuração de ponto cadastrada. Clique em "Adicionar Nova Configuração".</td></tr>`;
        }

        configuracoesFiltradas.forEach(config => {
            const tr = document.createElement('tr');
            tr.dataset.configId = config.id;

            tr.innerHTML = `
                <td>${config.produto_nome}</td>
                <td>${config.processo_nome}</td>
                <td><input type="number" class="ppp-input-pontos" value="${config.pontos_padrao}" step="0.1" min="0.1" style="width:100px;"></td>
                <td><input type="checkbox" class="ppp-checkbox-ativo" ${config.ativo ? 'checked' : ''}></td>
                <td>
                    <button class="ppp-botao ppp-botao-salvar" data-id="${config.id}"><i class="fas fa-save"></i> Salvar</button>
                    <button class="ppp-botao ppp-botao-excluir" data-id="${config.id}"><i class="fas fa-trash"></i> Excluir</button>
                </td>
            `;
            corpoTabelaPontosPadraoEl.appendChild(tr);
        });
    }

    async function salvarConfiguracaoPonto(configId, produtoNome, processoNome, pontosValor, ativo) {
        try {
            const token = localStorage.getItem('token');
            const payload = {
                produto_nome: produtoNome,
                processo_nome: processoNome,
                pontos_padrao: parseFloat(pontosValor),
                ativo: ativo
            };
            let url = '/api/configuracao-pontos/padrao';
            let method = 'POST'; // Para criar nova ou UPSERT

            if (configId && configId !== 'novo') { // Se tem ID, é atualização específica por ID
                payload.id = parseInt(configId); // API espera 'id' no corpo para PUT por ID
            }


            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const responseData = await response.json();
            if (!response.ok) {
                throw new Error(responseData.error || `Erro ao salvar: ${response.statusText}`);
            }

            mostrarFeedback('Configuração salva com sucesso!', 'sucesso');
            await carregarConfiguracoesPontos(); // Recarrega e renderiza a tabela
            return responseData; // Retorna a configuração salva/atualizada

        } catch (error) {
            console.error('Erro ao salvar configuração:', error);
            mostrarFeedback(`Erro ao salvar: ${error.message}`, 'erro');
            return null;
        }
    }

    async function excluirConfiguracaoPonto(configId) {
        if (!confirm('Tem certeza que deseja excluir esta configuração de ponto?')) {
            return;
        }
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/configuracao-pontos/padrao/${configId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro ao excluir: ${response.statusText}`);
            }
            mostrarFeedback('Configuração excluída com sucesso!', 'sucesso');
            await carregarConfiguracoesPontos(); // Recarrega
        } catch (error) {
            console.error('Erro ao excluir configuração:', error);
            mostrarFeedback(`Erro ao excluir: ${error.message}`, 'erro');
        }
    }


    function adicionarLinhaNovaConfiguracao() {
        const tr = document.createElement('tr');
        tr.dataset.configId = "novo"; // Identificador para nova linha

        // --- TD 1: Select de Produtos ---
        const selectProdutoTd = document.createElement('td');
        const selectProduto = document.createElement('select');
        selectProduto.className = 'ppp-select ppp-input-novo-produto';
        selectProduto.innerHTML = '<option value="">Selecione Produto</option>';
        const nomesProdutosUnicos = [...new Set(listaDeProdutosDisponiveis.map(p => p.nome))].sort();
        nomesProdutosUnicos.forEach(nome => {
            const opt = document.createElement('option');
            opt.value = nome;
            opt.textContent = nome;
            selectProduto.appendChild(opt);
        });
        selectProdutoTd.appendChild(selectProduto);
        tr.appendChild(selectProdutoTd); // Adiciona o TD à linha

        // --- TD 2: Select de Processos ---
        const selectProcessoTd = document.createElement('td');
        const selectProcesso = document.createElement('select');
        selectProcesso.className = 'ppp-select ppp-input-novo-processo';
        selectProcesso.innerHTML = '<option value="">Selecione Processo</option>';
        selectProcesso.disabled = true;
        selectProcessoTd.appendChild(selectProcesso);
        tr.appendChild(selectProcessoTd); // Adiciona o TD à linha

        // Event listener para popular processos quando um produto é selecionado
        selectProduto.addEventListener('change', () => {
            const produtoSelecionadoNome = selectProduto.value;
            console.log('[Nova Config] Produto selecionado:', produtoSelecionadoNome); // Log para depuração
            selectProcesso.innerHTML = '<option value="">Selecione Processo</option>';
            selectProcesso.disabled = true;
            if (produtoSelecionadoNome) {
                const produtoObj = listaDeProdutosDisponiveis.find(p => p.nome === produtoSelecionadoNome);
                console.log('[Nova Config] Objeto do produto encontrado:', produtoObj); // Log para depuração
                if (produtoObj && produtoObj.etapas && Array.isArray(produtoObj.etapas)) {
                    if (produtoObj.etapas.length === 0) {
                        console.warn("Produto selecionado não tem etapas cadastradas:", produtoSelecionadoNome);
                        selectProcesso.innerHTML = '<option value="">Produto sem processos</option>';
                    } else {
                        produtoObj.etapas.forEach(etapa => {
                            const processoNome = typeof etapa === 'object' ? etapa.processo : etapa;
                            if (processoNome) { // Garante que o processoNome não seja undefined ou null
                                const opt = document.createElement('option');
                                opt.value = processoNome;
                                opt.textContent = processoNome;
                                selectProcesso.appendChild(opt);
                            }
                        });
                        selectProcesso.disabled = false;
                    }
                } else {
                     console.warn("Produto selecionado não tem etapas configuradas ou o formato é inesperado:", produtoSelecionadoNome, produtoObj);
                     selectProcesso.innerHTML = '<option value="">Erro ao carregar processos</option>';
                }
            }
        });

        // --- TD 3: Input de Pontos ---
        const pontosTd = document.createElement('td');
        const pontosInput = document.createElement('input');
        pontosInput.type = 'number';
        pontosInput.className = 'ppp-input-pontos ppp-input-novo-pontos';
        pontosInput.value = '1.0';
        pontosInput.step = '0.1';
        pontosInput.min = '0.1';
        pontosInput.style.width = '100px';
        pontosTd.appendChild(pontosInput);
        tr.appendChild(pontosTd);

        // --- TD 4: Checkbox Ativo ---
        const ativoTd = document.createElement('td');
        const ativoCheckbox = document.createElement('input');
        ativoCheckbox.type = 'checkbox';
        ativoCheckbox.className = 'ppp-checkbox-ativo ppp-input-novo-ativo';
        ativoCheckbox.checked = true;
        ativoTd.appendChild(ativoCheckbox);
        tr.appendChild(ativoTd);

        // --- TD 5: Botões de Ação ---
        const acoesTd = document.createElement('td');
        const btnSalvarNovo = document.createElement('button');
        btnSalvarNovo.className = 'ppp-botao ppp-botao-salvar ppp-botao-salvar-novo';
        btnSalvarNovo.innerHTML = '<i class="fas fa-save"></i> Salvar';

        const btnCancelarNovo = document.createElement('button');
        btnCancelarNovo.className = 'ppp-botao ppp-botao-excluir ppp-botao-cancelar-novo'; // Usar ppp-botao-cancelar ou similar se tiver estilo específico
        btnCancelarNovo.innerHTML = '<i class="fas fa-times"></i> Cancelar';

        acoesTd.appendChild(btnSalvarNovo);
        acoesTd.appendChild(btnCancelarNovo);
        tr.appendChild(acoesTd);

        // Adicionar a linha construída no topo da tabela
        corpoTabelaPontosPadraoEl.insertBefore(tr, corpoTabelaPontosPadraoEl.firstChild);

        // Adicionar event listeners para os botões da nova linha
        btnSalvarNovo.addEventListener('click', async () => {
            const produtoNome = selectProduto.value; // Pega dos elementos corretos
            const processoNome = selectProcesso.value;
            const pontosValor = pontosInput.value;
            const ativo = ativoCheckbox.checked;

            if (!produtoNome || !processoNome) {
                mostrarFeedback('Selecione o produto e o processo.', 'erro');
                return;
            }
             if (parseFloat(pontosValor) <= 0 || isNaN(parseFloat(pontosValor))) {
                 mostrarFeedback('O valor dos pontos deve ser um número positivo.', 'erro');
                return;
            }

            const configSalva = await salvarConfiguracaoPonto(null, produtoNome, processoNome, pontosValor, ativo);
            if (configSalva) {
                // A tabela será recarregada por salvarConfiguracaoPonto() que chama carregarConfiguracoesPontos()
                // Se a linha de "novo" for removida automaticamente por recarregar a tabela, ótimo.
                // Caso contrário, você pode querer remover a linha 'tr' aqui se o salvamento foi bem-sucedido
                // e a tabela não for totalmente recarregada (o que não é o caso atual, já que carregarConfiguracoesPontos recarrega tudo).
            }
        });

        btnCancelarNovo.addEventListener('click', () => {
            tr.remove();
        });
    }


    // Inicialização e Event Listeners
    async function init() {
        try {
            const auth = await verificarAutenticacao('ponto-por-processo.html', ['acesso-ponto-por-processo']);
            if (!auth) return; // Redirecionamento já ocorreu

            usuarioLogado = auth.usuario;
            permissoesUsuario = auth.permissoes || [];
            document.body.classList.add('autenticado'); // Mostra o corpo

            await carregarProdutosDoServidor(); // Carrega produtos para os filtros
            await carregarConfiguracoesPontos(); // Carrega e renderiza a tabela

            filtroProdutoEl.addEventListener('change', (e) => {
                renderizarTabelaPontosPadrao(e.target.value);
            });

            btnAdicionarNovaConfiguracaoEl.addEventListener('click', adicionarLinhaNovaConfiguracao);

            // Delegação de eventos para botões Salvar e Excluir na tabela
            corpoTabelaPontosPadraoEl.addEventListener('click', async (e) => {
                const target = e.target.closest('button');
                if (!target) return;

                const tr = target.closest('tr');
                if (!tr) return;

                const configId = tr.dataset.configId;

                if (target.classList.contains('ppp-botao-salvar') && configId !== 'novo') {
                    const produtoNome = tr.cells[0].textContent;
                    const processoNome = tr.cells[1].textContent;
                    const pontosInput = tr.querySelector('.ppp-input-pontos');
                    const ativoCheckbox = tr.querySelector('.ppp-checkbox-ativo');

                    if (pontosInput && ativoCheckbox) {
                        const pontosValor = pontosInput.value;
                        const ativo = ativoCheckbox.checked;
                        if (parseFloat(pontosValor) <= 0 || isNaN(parseFloat(pontosValor))) {
                             mostrarFeedback('O valor dos pontos deve ser um número positivo.', 'erro');
                            return;
                        }
                        await salvarConfiguracaoPonto(configId, produtoNome, processoNome, pontosValor, ativo);
                    }
                } else if (target.classList.contains('ppp-botao-excluir') && configId !== 'novo') {
                    await excluirConfiguracaoPonto(configId);
                }
            });


        } catch (error) {
            console.error("Erro na inicialização da página de Pontos por Processo:", error);
            document.body.innerHTML = `<p style="color: red; padding: 20px;">Erro crítico ao carregar a página: ${error.message}. Verifique o console.</p>`;
        }
    }

    // Garantir que o DOM esteja carregado antes de executar init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

// polyfill para closest se necessário para navegadores mais antigos
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