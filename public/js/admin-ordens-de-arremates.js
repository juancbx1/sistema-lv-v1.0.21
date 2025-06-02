// public/js/admin-ordens-de-arremates.js
        import { verificarAutenticacao } from '/js/utils/auth.js';
        import { obterProdutos as obterProdutosDoStorage, invalidateCache as invalidateProdutosStorageCache } from '/js/utils/storage.js'; // Se precisar de dados de produtos
        // Se precisar de CONST_PRODUTOS, etc., importe também.

        // --- Variáveis Globais ---
        let usuarioLogado = null;
        let permissoes = [];
        let todosOsProdutosCadastrados = []; // Para imagens, nomes de produtos
        let todosOsUsuarios = []; // Para o select de Tiktik
        
        let opsFinalizadasCompletas = []; // Cache das OPs finalizadas do backend
        let todosArrematesRegistradosCache = []; // Cache dos arremates já feitos

        let produtosAgregadosParaArremateGlobal = []; // Array dos itens agregados (produto|variante) pendentes
        let arremateAgregadoEmVisualizacao = null; // Objeto do item agregado atualmente na tela de detalhe

        let currentPageArremateCards = 1;
        const itemsPerPageArremateCards = 6; // Quantos cards por página

        const lancamentosArremateEmAndamento = new Set(); // Para evitar duplo clique

        // --- Funções de Fetch (similares às de admin-ordens-de-producao.js e embalagem) ---
        async function fetchFromAPI(endpoint, options = {}) {
            const token = localStorage.getItem('token');
            // ... (lógica de fetch, tratamento de erro 401, etc. - PODE COPIAR DA SUA embalagem-de-produtos.js OU ordens-de-producao.js)
            // IMPORTANTE: Adapte o redirecionamento em caso de 401 para '/login.html' ou sua página de login principal
            // Exemplo simples (você tem uma mais completa):
            const response = await fetch(`/api${endpoint}`, { 
                ...options, 
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json', 
                    ...options.headers 
                }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP Error ${response.status}` }));
                if (response.status === 401) {
                    mostrarPopupMensagem('Sessão expirada ou token inválido. Faça login novamente.', 'erro');
                    localStorage.removeItem('token');
                    window.location.href = '/login.html'; // Redireciona para o login
                }
                throw new Error(errorData.error || `Erro ${response.status}`);
            }
            return response.status === 204 ? null : response.json();
        }

        async function buscarOpsFinalizadasCompletas() {
            // Chama a API /api/ops-para-embalagem (que lista OPs com status 'finalizado')
            // ou uma nova API se você criar uma específica para 'arrematáveis'.
            // Por enquanto, vamos assumir que /api/ops-para-embalagem é suficiente.
            try {
                const data = await fetchFromAPI('/ops-para-embalagem?all=true'); // Pega todas as finalizadas
                opsFinalizadasCompletas = data?.rows || [];
                console.log('[buscarOpsFinalizadasCompletas] OPs finalizadas carregadas:', opsFinalizadasCompletas.length);
                return opsFinalizadasCompletas;
            } catch (error) {
                console.error('[buscarOpsFinalizadasCompletas] Erro:', error);
                mostrarPopupMensagem('Erro ao buscar Ordens de Produção para arremate.', 'erro');
                return [];
            }
        }

        async function buscarArrematesJaRegistrados() {
            try {
                const arremates = await fetchFromAPI('/arremates'); // Busca todos os arremates
                todosArrematesRegistradosCache = Array.isArray(arremates) ? arremates : (arremates?.rows || []);
                console.log('[buscarArrematesJaRegistrados] Arremates existentes carregados:', todosArrematesRegistradosCache.length);
                return todosArrematesRegistradosCache;
            } catch (error) {
                console.error('[buscarArrematesJaRegistrados] Erro:', error);
                mostrarPopupMensagem('Erro ao buscar registros de arremate existentes.', 'erro');
                return [];
            }
        }
        
        async function buscarUsuariosDoSistema() {
            if (todosOsUsuarios.length > 0) return todosOsUsuarios;
            try {
                const data = await fetchFromAPI('/usuarios');
                todosOsUsuarios = Array.isArray(data) ? data : (data?.rows || []);
                return todosOsUsuarios;
            } catch (error) {
                console.error('[buscarUsuariosDoSistema] Erro:', error);
                mostrarPopupMensagem('Erro ao buscar usuários.', 'erro');
                return [];
            }
        }

        // --- Lógica Principal de Cálculo e Agregação ---
        async function calcularEAgruparPendenciasArremate() {
            await Promise.all([
                buscarOpsFinalizadasCompletas(),
                buscarArrematesJaRegistrados(),
                // obterProdutosDoStorage().then(p => todosOsProdutosCadastrados = p) // Já deve estar no escopo global se importado
            ]);
            // Garante que todosOsProdutosCadastrados está populado
            if (todosOsProdutosCadastrados.length === 0) {
                 todosOsProdutosCadastrados = await obterProdutosDoStorage();
            }


            const opsComSaldoParaArremate = [];
            for (const op of opsFinalizadasCompletas) {
                // A função obterQuantidadeFinalProduzida(op) já existe no seu admin-embalagem-de-produtos.js
                // Você pode copiá-la para cá ou criar um utilitário.
                // Por agora, vamos simular:
                const quantidadeProduzidaOriginal = obterQuantidadeFinalProduzida(op); // COPIE ESTA FUNÇÃO

                let totalJaArrematadoParaEstaOP = 0;
                todosArrematesRegistradosCache
                    .filter(arremate => arremate.op_numero === op.numero)
                    .forEach(arremate => {
                        totalJaArrematadoParaEstaOP += parseInt(arremate.quantidade_arrematada) || 0;
                    });
                
                const quantidadePendenteDeArremate = quantidadeProduzidaOriginal - totalJaArrematadoParaEstaOP;
                if (quantidadePendenteDeArremate > 0) {
                    opsComSaldoParaArremate.push({
                        ...op, // Spread da OP original
                        quantidade_produzida_original: quantidadeProduzidaOriginal,
                        quantidade_pendente_arremate: quantidadePendenteDeArremate,
                    });
                }
            }

            // Agregação por produto|variante (similar ao que você já faz)
            const aggregatedMap = new Map();
            opsComSaldoParaArremate.forEach(op => {
                const produtoKey = `${op.produto}|${op.variante || '-'}`;
                if (!aggregatedMap.has(produtoKey)) {
                    aggregatedMap.set(produtoKey, {
                        produto: op.produto,
                        variante: op.variante || '-',
                        total_quantidade_pendente_arremate: 0,
                        ops_detalhe: [] // Guarda as OPs individuais que compõem este agregado
                    });
                }
                const aggregatedItem = aggregatedMap.get(produtoKey);
                aggregatedItem.total_quantidade_pendente_arremate += op.quantidade_pendente_arremate;
                aggregatedItem.ops_detalhe.push({ // Adiciona apenas os dados relevantes da OP
                    numero: op.numero,
                    edit_id: op.edit_id,
                    produto: op.produto, // redundante, mas pode ser útil
                    variante: op.variante || '-', // redundante
                    quantidade_produzida_original_op: op.quantidade_produzida_original,
                    quantidade_pendente_nesta_op: op.quantidade_pendente_arremate
                });
            });
            produtosAgregadosParaArremateGlobal = Array.from(aggregatedMap.values());
            console.log('[calcularEAgruparPendenciasArremate] Produtos agregados para arremate:', produtosAgregadosParaArremateGlobal.length, produtosAgregadosParaArremateGlobal);
        }

        // --- Funções de Renderização ---
        async function renderizarCardsArremate() {
            const container = document.getElementById('arremateCardsContainer');
            const paginationContainer = document.getElementById('arrematePaginationContainer');
            if (!container || !paginationContainer) return;

            container.innerHTML = ''; // Limpa
            paginationContainer.innerHTML = ''; // Limpa

            if (produtosAgregadosParaArremateGlobal.length === 0) {
                container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--op-cor-cinza-texto);">Nenhum item aguardando arremate no momento. Bom trabalho!</p>';
                paginationContainer.style.display = 'none';
                return;
            }
            paginationContainer.style.display = 'flex';

            const totalItems = produtosAgregadosParaArremateGlobal.length;
            const totalPages = Math.ceil(totalItems / itemsPerPageArremateCards);
            currentPageArremateCards = Math.min(currentPageArremateCards, Math.max(1, totalPages));
            const startIndex = (currentPageArremateCards - 1) * itemsPerPageArremateCards;
            const endIndex = Math.min(startIndex + itemsPerPageArremateCards, totalItems);
            const paginatedItems = produtosAgregadosParaArremateGlobal.slice(startIndex, endIndex);

            const fragment = document.createDocumentFragment();
            // Garante que todosOsProdutosCadastrados foi carregado para as imagens
            if (todosOsProdutosCadastrados.length === 0) {
                todosOsProdutosCadastrados = await obterProdutosDoStorage();
            }

            paginatedItems.forEach(item => {
                const card = document.createElement('div');
                // Usar as classes CSS do ordens-de-producao.css para os cards de "corte" como referência
                // ou criar novas classes no seu CSS e aplicar aqui.
                // Exemplo com uma classe 'op-arremate-card' que você precisará estilizar.
                card.className = 'op-arremate-card'; // Você precisará criar este estilo no CSS
                                                    // Inspirado em .ep-arremate-card (seu CSS atual) ou .op-card-estilizado
                
                const produtoCadastrado = todosOsProdutosCadastrados.find(p => p.nome === item.produto);
                let imagemSrc = '/path/to/default-image.png'; // Imagem padrão
                if (produtoCadastrado) {
                    if (item.variante && item.variante !== '-') {
                        const gradeInfo = produtoCadastrado.grade?.find(g => g.variacao === item.variante);
                        if (gradeInfo?.imagem) imagemSrc = gradeInfo.imagem;
                        else if (produtoCadastrado.imagem) imagemSrc = produtoCadastrado.imagem; // Fallback para imagem principal do produto
                    } else if (produtoCadastrado.imagem) {
                        imagemSrc = produtoCadastrado.imagem;
                    }
                }


                card.innerHTML = `
                    <div class="op-arremate-card-thumbnail"> <!-- Estilizar -->
                        <img src="${imagemSrc}" alt="${item.produto}" onerror="this.style.display='none'">
                    </div>
                    <div class="op-arremate-card-info"> <!-- Estilizar -->
                        <h3 class="op-arremate-card-produto">${item.produto}</h3>
                        <p class="op-arremate-card-variante">${item.variante !== '-' ? item.variante : 'Padrão'}</p>
                    </div>
                    <div class="op-arremate-card-pendente"> <!-- Estilizar -->
                        <span>Pendente:</span> <strong>${item.total_quantidade_pendente_arremate}</strong>
                    </div>
                `;
                // Armazena o objeto agregado no dataset para fácil acesso ao clicar
                card.dataset.arremateAgregado = JSON.stringify(item);
                card.addEventListener('click', handleArremateCardClick);
                fragment.appendChild(card);
            });
            container.appendChild(fragment);

            // Paginação (similar à de ordens-de-producao.js)
            if (totalPages > 1) {
                let paginationHTML = `<button class="pagination-btn prev" data-page="${Math.max(1, currentPageArremateCards - 1)}" ${currentPageArremateCards === 1 ? 'disabled' : ''}>Anterior</button>`;
                paginationHTML += `<span class="pagination-current">Pág. ${currentPageArremateCards} de ${totalPages}</span>`;
                paginationHTML += `<button class="pagination-btn next" data-page="${Math.min(totalPages, currentPageArremateCards + 1)}" ${currentPageArremateCards === totalPages ? 'disabled' : ''}>Próximo</button>`;
                paginationContainer.innerHTML = paginationHTML;

                paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        currentPageArremateCards = parseInt(btn.dataset.page);
                        renderizarCardsArremate();
                    });
                });
            }
        }

        async function handleArremateCardClick(event) {
            const card = event.currentTarget; // Pega o card que foi clicado
            const agregadoString = card.dataset.arremateAgregado;
            if (!agregadoString) return;

            arremateAgregadoEmVisualizacao = JSON.parse(agregadoString);
            console.log('Card de arremate clicado:', arremateAgregadoEmVisualizacao);
            
            // Salva no localStorage para persistir se o usuário recarregar a página com hash
            localStorage.setItem('arremateDetalheAtual', JSON.stringify(arremateAgregadoEmVisualizacao));
            window.location.hash = '#lancar-arremate'; // Muda o hash para mostrar a view de detalhe
        }

        async function carregarDetalhesArremateView(agregado) {
            document.getElementById('arrematesListView').style.display = 'none';
            document.getElementById('arremateDetalheView').style.display = 'block';

            arremateAgregadoEmVisualizacao = agregado; // Define o item globalmente

            // Preencher título e imagem
            document.getElementById('arremateDetalheTitulo').textContent = `Lançar Arremate para: ${agregado.produto} ${agregado.variante !== '-' ? '('+agregado.variante+')' : ''}`;
            const produtoCad = todosOsProdutosCadastrados.find(p => p.nome === agregado.produto);
            let imgDetalheSrc = '/path/to/default-image.png';
            if (produtoCad) {
                 if (agregado.variante && agregado.variante !== '-') {
                    const gradeDet = produtoCad.grade?.find(g => g.variacao === agregado.variante);
                    if (gradeDet?.imagem) imgDetalheSrc = gradeDet.imagem;
                    else if (produtoCad.imagem) imgDetalheSrc = produtoCad.imagem;
                } else if (produtoCad.imagem) {
                    imgDetalheSrc = produtoCad.imagem;
                }
            }
            const thumbDetalheEl = document.getElementById('arremateDetalheThumbnail');
            thumbDetalheEl.innerHTML = `<img src="${imgDetalheSrc}" alt="${agregado.produto}" onerror="this.style.display='none'">`;
            document.getElementById('arremateProdutoNomeDetalhe').textContent = agregado.produto;
            document.getElementById('arremateVarianteNomeDetalhe').textContent = agregado.variante !== '-' ? agregado.variante : 'Padrão';
            document.getElementById('arremateTotalPendenteAgregado').textContent = agregado.total_quantidade_pendente_arremate;


            // Popular select de usuários Tiktik
            const selectUser = document.getElementById('selectUsuarioArremate');
            selectUser.innerHTML = '<option value="">Carregando...</option>';
            const usuariosTiktik = await obterUsuariosTiktikParaProduto(agregado.produto); // Copie esta função
            selectUser.innerHTML = '<option value="">Selecione o Tiktik</option>';
            usuariosTiktik.forEach(user => {
                selectUser.add(new Option(user.nome, user.nome));
            });
            if (usuariosTiktik.length === 0) {
                selectUser.innerHTML = '<option value="">Nenhum Tiktik configurado para este produto</option>';
                selectUser.disabled = true;
            } else {
                selectUser.disabled = false;
            }

            // Configurar input de quantidade
            const inputQtd = document.getElementById('inputQuantidadeArrematar');
            inputQtd.value = ''; // Limpa
            inputQtd.max = agregado.total_quantidade_pendente_arremate;
            inputQtd.disabled = agregado.total_quantidade_pendente_arremate === 0 || usuariosTiktik.length === 0;

            // Listar OPs de origem
            const opsOrigemContainer = document.getElementById('arremateOpsOrigemContainer');
            opsOrigemContainer.innerHTML = '';
            if (agregado.ops_detalhe && agregado.ops_detalhe.length > 0) {
                const ul = document.createElement('ul');
                ul.style.listStyleType = 'none';
                ul.style.paddingLeft = '0';
                agregado.ops_detalhe.forEach(opDet => {
                    if (opDet.quantidade_pendente_nesta_op > 0) { // Mostra apenas OPs com saldo
                        const li = document.createElement('li');
                        li.textContent = `OP ${opDet.numero}: Pendente ${opDet.quantidade_pendente_nesta_op} (Produzido: ${opDet.quantidade_produzida_original_op})`;
                        li.style.fontSize = '0.9em';
                        li.style.marginBottom = '5px';
                        ul.appendChild(li);
                    }
                });
                if (ul.children.length > 0) {
                    opsOrigemContainer.appendChild(ul);
                } else {
                    opsOrigemContainer.innerHTML = '<p style="text-align:center; color: var(--op-cor-cinza-texto);">Todas as OPs deste item agregado já foram arrematadas.</p>';
                }
            } else {
                 opsOrigemContainer.innerHTML = '<p style="text-align:center; color: var(--op-cor-cinza-texto);">Nenhuma OP de origem detalhada para este item.</p>';
            }


            // Habilitar/desabilitar botão de lançar
            const btnLancar = document.getElementById('btnLancarArremateAgregado');
            const checkCanLaunch = () => {
                const qtdVal = parseInt(inputQtd.value) || 0;
                const userVal = selectUser.value;
                btnLancar.disabled = !(
                    qtdVal > 0 && 
                    qtdVal <= agregado.total_quantidade_pendente_arremate && 
                    userVal &&
                    permissoes.includes('lancar-arremate') && // Verifica permissão aqui
                    !lancamentosArremateEmAndamento.has(agregado.produto + agregado.variante) // Previne duplo clique
                );
            };
            inputQtd.oninput = checkCanLaunch;
            selectUser.onchange = checkCanLaunch;
            checkCanLaunch(); // Estado inicial
        }
        
        // --- Funções Auxiliares (copiar de embalagem-de-produtos.js ou ordens-de-producao.js) ---
        function mostrarPopupMensagem(mensagem, tipo = 'erro', duracao = 5000) { /* ... sua implementação ... */ 
            // Adapte para usar o estilo de popup de ordens-de-producao.css (ex: popup-mensagem, popup-sucesso)
            const popup = document.createElement('div');
            popup.className = `popup-mensagem popup-${tipo}`; // Use as classes do CSS de OPs
            popup.innerHTML = `<p>${mensagem}</p>`;
            const fecharBtnManual = document.createElement('button');
            fecharBtnManual.textContent = 'OK';
            fecharBtnManual.onclick = () => popup.remove(); // Simples remoção
            popup.appendChild(fecharBtnManual);
            document.body.appendChild(popup);
            if (duracao > 0) setTimeout(() => popup.remove(), duracao);
        }
        
        // COPIAR as funções:
        // - obterQuantidadeFinalProduzida(op)
        // - obterUsuariosTiktikParaProduto(produtoNome) (adapte para usar buscarUsuariosDoSistema)
        // Função obterQuantidadeFinalProduzida
        function obterQuantidadeFinalProduzida(op) {
            if (!op || !op.etapas || !Array.isArray(op.etapas) || op.etapas.length === 0) {
                // Se não há etapas, ou a OP é inválida, retorna a quantidade principal da OP ou 0
                return parseInt(op?.quantidade) || 0;
            }
            // Tenta encontrar a quantidade da última etapa lançada
            for (let i = op.etapas.length - 1; i >= 0; i--) {
                const etapa = op.etapas[i];
                if (etapa && etapa.lancado && typeof etapa.quantidade !== 'undefined' && etapa.quantidade !== null) {
                    const qtdEtapa = parseInt(etapa.quantidade, 10);
                    if (!isNaN(qtdEtapa) && qtdEtapa >= 0) {
                        return qtdEtapa;
                    }
                }
            }
            // Fallback se nenhuma etapa lançada com quantidade foi encontrada
            return parseInt(op.quantidade) || 0;
        }

        // Função obterUsuariosTiktikParaProduto
        async function obterUsuariosTiktikParaProduto(produtoNome) {
            // Garante que todosOsProdutosCadastrados e todosOsUsuarios estão carregados
            if (todosOsProdutosCadastrados.length === 0) {
                todosOsProdutosCadastrados = await obterProdutosDoStorage();
            }
            if (todosOsUsuarios.length === 0) {
                todosOsUsuarios = await buscarUsuariosDoSistema();
            }

            const produto = todosOsProdutosCadastrados.find(p => p.nome === produtoNome);
            if (!produto || !produto.etapasTiktik || !Array.isArray(produto.etapasTiktik) || produto.etapasTiktik.length === 0) {
                console.warn(`Produto "${produtoNome}" não encontrado ou sem etapasTiktik.`);
                return [];
            }
            
            const tipoFeitoPor = produto.etapasTiktik[0]?.feitoPor; // Pega o tipo da primeira etapa Tiktik
            if (!tipoFeitoPor) {
                console.warn(`'feitoPor' não definido para a primeira etapaTiktik de ${produtoNome}.`);
                return [];
            }
            
            const tipoFeitoPorLower = tipoFeitoPor.toLowerCase();
            return todosOsUsuarios.filter(u => 
                u.tipos && Array.isArray(u.tipos) && u.tipos.some(type => typeof type === 'string' && type.toLowerCase() === tipoFeitoPorLower)
            );
        }


        // --- Lógica de Lançamento do Arremate Agregado ---
        async function lancarArremateAgregado() {
            if (!arremateAgregadoEmVisualizacao) return;

            const selectUser = document.getElementById('selectUsuarioArremate');
            const inputQtd = document.getElementById('inputQuantidadeArrematar');
            const btnLancar = document.getElementById('btnLancarArremateAgregado');

            const usuarioTiktik = selectUser.value;
            const quantidadeTotalParaArrematar = parseInt(inputQtd.value);

            if (!usuarioTiktik) { mostrarPopupMensagem('Selecione o usuário Tiktik.', 'aviso'); return; }
            if (isNaN(quantidadeTotalParaArrematar) || quantidadeTotalParaArrematar <= 0) {
                mostrarPopupMensagem('Quantidade a arrematar inválida.', 'aviso'); return;
            }
            if (quantidadeTotalParaArrematar > arremateAgregadoEmVisualizacao.total_quantidade_pendente_arremate) {
                mostrarPopupMensagem('Quantidade excede o total pendente.', 'aviso'); return;
            }

            const lockKey = arremateAgregadoEmVisualizacao.produto + arremateAgregadoEmVisualizacao.variante;
            if (lancamentosArremateEmAndamento.has(lockKey)) return;
            lancamentosArremateEmAndamento.add(lockKey);

            const originalButtonHTML = btnLancar.innerHTML;
            btnLancar.disabled = true;
            btnLancar.innerHTML = '<div class="spinner-btn-interno"></div> Lançando...'; // Use spinner do ordens-de-producao.css
            selectUser.disabled = true;
            inputQtd.disabled = true;

            let quantidadeRestanteDaMeta = quantidadeTotalParaArrematar;
            let sucessoGeral = true;
            let errosLancamento = [];

            // Ordena as OPs de detalhe por número (FIFO)
            const opsParaConsumir = [...arremateAgregadoEmVisualizacao.ops_detalhe]
                .filter(opDet => opDet.quantidade_pendente_nesta_op > 0) // Apenas OPs com saldo
                .sort((a, b) => {
                    const numA = parseInt(a.numero.match(/\d+/)?.[0] || a.numero); // Tenta pegar só o número
                    const numB = parseInt(b.numero.match(/\d+/)?.[0] || b.numero);
                    return (isNaN(numA) || isNaN(numB)) ? a.numero.localeCompare(b.numero) : numA - numB;
                });

            for (const opDetalhe of opsParaConsumir) {
                if (quantidadeRestanteDaMeta <= 0) break;

                const qtdArrematarDestaOP = Math.min(quantidadeRestanteDaMeta, opDetalhe.quantidade_pendente_nesta_op);

                if (qtdArrematarDestaOP > 0) {
                    const arremateData = {
                        op_numero: opDetalhe.numero,
                        op_edit_id: opDetalhe.edit_id,
                        produto: arremateAgregadoEmVisualizacao.produto, // Usa do agregado
                        variante: arremateAgregadoEmVisualizacao.variante === '-' ? null : arremateAgregadoEmVisualizacao.variante,
                        quantidade_arrematada: qtdArrematarDestaOP,
                        usuario_tiktik: usuarioTiktik
                    };
                    try {
                        console.log(`Lançando arremate para OP ${opDetalhe.numero}:`, arremateData);
                        await fetchFromAPI('/arremates', { method: 'POST', body: JSON.stringify(arremateData) });
                        quantidadeRestanteDaMeta -= qtdArrematarDestaOP;
                    } catch (error) {
                        console.error(`Erro ao lançar arremate para OP ${opDetalhe.numero}:`, error);
                        errosLancamento.push(`OP ${opDetalhe.numero}: ${error.message}`);
                        sucessoGeral = false;
                        // Decide se quer parar no primeiro erro ou tentar os próximos
                        // Por simplicidade, vamos parar no primeiro erro aqui.
                        break; 
                    }
                }
            }

            lancamentosArremateEmAndamento.delete(lockKey);
            btnLancar.innerHTML = originalButtonHTML; // Restaura o botão

            if (sucessoGeral && quantidadeRestanteDaMeta === 0) {
                mostrarPopupMensagem(`Arremate de ${quantidadeTotalParaArrematar} unidade(s) lançado com sucesso!`, 'sucesso');
                // Recarregar tudo
                await inicializarDadosEViews(); // Função para recarregar dados e re-renderizar
                window.location.hash = ''; // Volta para a lista
            } else if (sucessoGeral && quantidadeRestanteDaMeta > 0) {
                 mostrarPopupMensagem(`Parcialmente lançado. ${quantidadeTotalParaArrematar - quantidadeRestanteDaMeta} unidades arrematadas. Saldo insuficiente nas OPs de origem.`, 'aviso');
                 await inicializarDadosEViews();
                 window.location.hash = '';
            } else {
                mostrarPopupMensagem(`Falha ao lançar arremate. Detalhes: ${errosLancamento.join('; ')}`, 'erro');
                // Reabilitar campos para correção do usuário, mas NÃO recarrega tudo automaticamente
                selectUser.disabled = false;
                inputQtd.disabled = false;
                btnLancar.disabled = false; // Reabilita para nova tentativa
            }
        }

        // --- Controle de Views (Hash e LocalStorage) ---
        async function handleHashChangeArremate() {
            const hash = window.location.hash;
            const arrematesListViewEl = document.getElementById('arrematesListView');
            const arremateDetalheViewEl = document.getElementById('arremateDetalheView');

            if (hash === '#lancar-arremate') {
                const data = localStorage.getItem('arremateDetalheAtual');
                if (data) {
                    await carregarDetalhesArremateView(JSON.parse(data));
                } else {
                    // Se não há dados, volta para a lista
                    window.location.hash = '';
                }
            } else {
                // Hash vazio ou desconhecido, mostra a lista principal
                arrematesListViewEl.style.display = 'block';
                arremateDetalheViewEl.style.display = 'none';
                localStorage.removeItem('arremateDetalheAtual');
                arremateAgregadoEmVisualizacao = null; // Limpa o item em visualização
                // Recarrega os cards da lista principal
                await calcularEAgruparPendenciasArremate();
                await renderizarCardsArremate();
            }
        }

        // --- Inicialização ---
        async function inicializarDadosEViews() {
            // Garante que os produtos e usuários sejam carregados primeiro
            await Promise.all([
                obterProdutosDoStorage().then(p => todosOsProdutosCadastrados = p),
                buscarUsuariosDoSistema()
            ]);
            await handleHashChangeArremate(); // Carrega a view correta (lista ou detalhe)
        }

        document.addEventListener('DOMContentLoaded', async () => {
            const auth = await verificarAutenticacao('ordens-de-arremates.html', ['acesso-ordens-de-arremates']); // Crie esta permissão
            if (!auth) { /* Redireciona ou mostra erro */ return; }
            usuarioLogado = auth.usuario;
            permissoes = auth.permissoes || [];
            document.body.classList.add('autenticado'); // Para o CSS

            await inicializarDadosEViews();

            window.addEventListener('hashchange', handleHashChangeArremate);
            document.getElementById('fecharArremateDetalheBtn')?.addEventListener('click', () => {
                window.location.hash = ''; // Limpa o hash para voltar à lista
            });
            document.getElementById('btnLancarArremateAgregado')?.addEventListener('click', lancarArremateAgregado);
        });