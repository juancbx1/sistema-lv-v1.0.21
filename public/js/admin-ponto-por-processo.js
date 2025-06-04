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
            listaDeProdutosDisponiveis = await response.json();
            if (!Array.isArray(listaDeProdutosDisponiveis)) {
                console.warn("API de produtos não retornou um array:", listaDeProdutosDisponiveis);
                listaDeProdutosDisponiveis = [];
            }
            popularFiltroProdutos();
        } catch (error) {
            console.error('Erro ao carregar produtos do servidor:', error);
            mostrarFeedback(`Erro ao carregar lista de produtos: ${error.message}`, 'erro');
            listaDeProdutosDisponiveis = []; // Garante que seja um array em caso de falha
            popularFiltroProdutos(); // Chama para limpar o filtro se deu erro
        }
    }

    function popularFiltroProdutos() {
        if (!filtroProdutoEl) return;
        filtroProdutoEl.innerHTML = '<option value="">Todos os Produtos</option>'; // Reseta
        if (Array.isArray(listaDeProdutosDisponiveis)) {
            const nomesProdutosUnicos = [...new Set(listaDeProdutosDisponiveis.map(p => p.nome))].sort();
            nomesProdutosUnicos.forEach(nomeProduto => {
                filtroProdutoEl.add(new Option(nomeProduto, nomeProduto));
            });
        }
    }

    async function carregarConfiguracoesPontos() {
        if (!corpoTabelaPontosPadraoEl) {
            console.error("Elemento corpoTabelaPontosPadraoEl não encontrado.");
            return;
        }
        corpoTabelaPontosPadraoEl.innerHTML = '<tr><td colspan="6" class="ppp-carregando"><div class="ppp-spinner"></div> Carregando configurações...</td></tr>'; // Adicionado spinner
        
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Token de autenticação não encontrado.");

            const produtoFiltro = filtroProdutoEl.value;
            const tipoAtividadeFiltro = filtroTipoAtividadeEl.value;
            
            const params = new URLSearchParams();
            if (produtoFiltro) params.append('produto_nome', produtoFiltro); // API usa ILIKE, não precisa de % aqui
            if (tipoAtividadeFiltro) params.append('tipo_atividade', tipoAtividadeFiltro);
            // Adicionar filtro de 'ativo=true' se quiser buscar apenas os ativos por padrão
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
            tr.dataset.produtoNomeOriginal = config.produto_nome;
            tr.dataset.processoNomeOriginal = config.processo_nome || ''; // Garante string
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

    async function salvarConfiguracaoPonto(configId, produtoNome, processoNome, tipoAtividade, pontosValor, ativo) {
        const isNovaConfiguracao = (configId === 'novo' || !configId);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Token de autenticação não encontrado.");

            // Validação dos campos antes de enviar
            if (!produtoNome || !tipoAtividade ) {
                 mostrarFeedback('Produto e Tipo de Atividade são obrigatórios.', 'erro'); return null;
            }
            if (tipoAtividade !== 'arremate_tiktik' && !processoNome) {
                 mostrarFeedback('Processo é obrigatório para este tipo de atividade.', 'erro'); return null;
            }
            const pontosFloat = parseFloat(pontosValor);
            if (isNaN(pontosFloat) || pontosFloat <= 0) {
                 mostrarFeedback('Pontos devem ser um número positivo.', 'erro'); return null;
            }

            const payload = {
                produto_nome: produtoNome,
                processo_nome: (tipoAtividade === 'arremate_tiktik') ? NOME_PROCESSO_ARREMATE_PADRAO : processoNome,
                tipo_atividade: tipoAtividade,
                pontos_padrao: pontosFloat,
                ativo: ativo
            };
            
            // A API POST faz UPSERT. Para editar uma linha existente, se não quisermos depender
            // do UPSERT pela chave (produto, processo, tipo), precisaríamos de um PUT por ID.
            // Por ora, manteremos o POST para criar/UPSERT.
            const url = '/api/configuracao-pontos/padrao';
            const method = 'POST';
            
            // Se configId existe e é diferente de 'novo', estamos tentando editar.
            // A API POST com ON CONFLICT cuidará de atualizar se a chave (produto, processo, tipo) for a mesma.
            // Se a chave mudar, ele criará um novo. Isso pode não ser o ideal para "editar".
            // Para uma edição verdadeira via ID, a API PUT /:id seria usada,
            // e o payload não deveria incluir as chaves (produto, processo, tipo) se elas não puderem ser alteradas.
            // Por simplicidade, deixamos o POST fazer o trabalho de UPSERT.

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
            await carregarConfiguracoesPontos(); // Recarrega e renderiza
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
            corpoTabelaPontosPadraoEl.querySelector('tr[data-config-id="novo"] .ppp-input-novo-produto')?.focus();
            return;
        }

        const tr = corpoTabelaPontosPadraoEl.insertRow(0);
        tr.dataset.configId = "novo";
        tr.classList.add('ppp-nova-linha'); // Para estilização opcional

        const criarCellComSelect = (optionsArray, className, defaultOptionText = "Selecione") => {
            const cell = tr.insertCell();
            const select = document.createElement('select');
            select.className = `ppp-select ppp-select-novo ${className}`;
            select.add(new Option(defaultOptionText, ""));
            optionsArray.forEach(opt => {
                if (typeof opt === 'string') select.add(new Option(opt, opt));
                else select.add(new Option(opt.texto, opt.valor)); // Para {texto, valor}
            });
            cell.appendChild(select);
            return select;
        };

        const nomesProdutos = [...new Set(listaDeProdutosDisponiveis.map(p => p.nome))].sort();
        const selectProduto = criarCellComSelect(nomesProdutos, 'ppp-input-novo-produto', "Selecione Produto");

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
            const produtoNome = selectProduto.value;
            const tipoAtividade = selectTipoAtividade.value;
            selectProcesso.innerHTML = ''; // Limpa
            selectProcesso.disabled = true;

            if (tipoAtividade === 'arremate_tiktik') {
                selectProcesso.add(new Option(NOME_PROCESSO_ARREMATE_PADRAO, NOME_PROCESSO_ARREMATE_PADRAO, true, true));
                // selectProcesso.disabled = true; // Opcional: desabilitar pois é fixo
            } else if (produtoNome && (tipoAtividade === 'costura_op_costureira' || tipoAtividade === 'processo_op_tiktik')) {
                const produtoObj = listaDeProdutosDisponiveis.find(p => p.nome === produtoNome);
                selectProcesso.add(new Option("Selecione Processo OP", ""));
                if (produtoObj && Array.isArray(produtoObj.etapas) && produtoObj.etapas.length > 0) {
                    const etapasRelevantes = produtoObj.etapas; // Usar estas para OPs
                    etapasRelevantes.forEach(etapa => {
                        const nomeProc = (typeof etapa === 'object' && etapa.processo) ? etapa.processo : String(etapa);
                        if(nomeProc) selectProcesso.add(new Option(nomeProc, nomeProc));
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
        // Chamada inicial para o caso de um tipo já estar selecionado (não deve acontecer com "Selecione Tipo")
        // atualizarCamposProcesso(); 

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
            await salvarConfiguracaoPonto(
                'novo',
                selectProduto.value,
                selectProcesso.value,
                selectTipoAtividade.value,
                inputPontos.value,
                checkboxAtivo.checked
            );
            // A tabela é recarregada pela função salvarConfiguracaoPonto
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
                        const produtoNomeOriginal = tr.dataset.produtoNomeOriginal;
                        const processoNomeOriginal = tr.dataset.processoNomeOriginal;
                        const tipoAtividadeOriginal = tr.dataset.tipoAtividadeOriginal;

                        const pontosInput = tr.querySelector('.ppp-input-pontos');
                        const ativoCheckbox = tr.querySelector('.ppp-checkbox-ativo');

                        if (pontosInput && ativoCheckbox) {
                            const pontosValor = pontosInput.value;
                            const ativo = ativoCheckbox.checked;
                            
                            if (parseFloat(pontosValor) <= 0 || isNaN(parseFloat(pontosValor))) {
                                mostrarFeedback('Ao editar, os pontos devem ser um número positivo.', 'erro'); return;
                            }
                            // Para editar uma linha existente, só atualizamos pontos_padrao e ativo.
                            // A chave (produto, processo, tipo) não deve ser alterada aqui.
                            // A API POST com ON CONFLICT fará o UPSERT se a chave for a mesma.
                            // Se a API PUT /:id fosse usada, ela só atualizaria pontos e ativo.
                            await salvarConfiguracaoPonto(
                                configId, // Passar o ID não é estritamente necessário para o POST com UPSERT, mas não prejudica
                                produtoNomeOriginal, 
                                processoNomeOriginal, 
                                tipoAtividadeOriginal, 
                                pontosValor, 
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