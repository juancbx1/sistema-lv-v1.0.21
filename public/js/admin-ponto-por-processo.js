// public/js/admin-ponto-por-processo.js
import { verificarAutenticacao } from '/js/utils/auth.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';

(async () => {
    // --- ESTADO GLOBAL DA PÁGINA ---
    let usuarioLogado = null;
    let listaDeProdutosDisponiveis = [];
    let todasAsVersoes = [];
    let versaoSelecionadaInfo = null;
    let regrasDaVersao = [];

    // --- ELEMENTOS DO DOM ---
    const feedbackEl = document.getElementById('ppp-mensagem-feedback');
    const tabsContainer = document.querySelector('.ppp-tabs-container');
    const tabPanels = document.querySelectorAll('.ppp-tab-panel');
    const selectVersaoEl = document.getElementById('filtroVersaoMeta');
    const btnCriarNovaVersaoEl = document.getElementById('btnCriarNovaVersao');
    const containerDetalhesEl = document.getElementById('containerDetalhesVersao');
    const tituloTabelaEl = document.getElementById('tituloTabelaRegras');
    const corpoTabelaRegrasEl = document.getElementById('corpoTabelaRegrasMeta');
    const btnAdicionarNovaRegraEl = document.getElementById('btnAdicionarNovaRegra');
    const filtroProdutoPontosEl = document.getElementById('filtroProdutoPontos');
    const filtroTipoAtividadePontosEl = document.getElementById('filtroTipoAtividadePontos');
    const btnAdicionarNovaConfigPontoEl = document.getElementById('btnAdicionarNovaConfigPonto');
    const corpoTabelaPontosEl = document.getElementById('corpoTabelaPontosPadrao');

    // ==========================================================================
    // FUNÇÕES UTILITÁRIAS
    // ==========================================================================

    async function fetchApi(endpoint, options = {}) {
        const token = localStorage.getItem('token');
        if (!token) throw new Error("Token não encontrado.");
        const defaultOptions = { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
        const response = await fetch(endpoint, { ...defaultOptions, ...options });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
        return data;
    }

    // <<< CORREÇÃO 1: Função única para carregar produtos >>>
    async function carregarProdutosDoServidor() {
        try {
            const produtosCrus = await fetchApi('/api/produtos');
            if (!Array.isArray(produtosCrus)) {
                listaDeProdutosDisponiveis = [];
                throw new Error("API de produtos não retornou um array.");
            }
            listaDeProdutosDisponiveis = produtosCrus.filter(p => p && typeof p.id === 'number' && typeof p.nome === 'string');
        } catch (error) {
            console.error('Erro ao carregar produtos do servidor:', error);
            mostrarMensagem(`Erro fatal ao carregar produtos: ${error.message}`, 'erro', 0);
            listaDeProdutosDisponiveis = [];
        }
    }
    
    function getTipoAtividadeTexto(tipo) {
        const mapa = {
            'costura_op_costureira': 'Costura OP (Costureira)',
            'processo_op_tiktik': 'Processo OP (Tiktik)',
            'arremate_tiktik': 'Arremate (Tiktik)'
        };
        return mapa[tipo] || tipo || 'Não Definido';
    }
    
    // ==========================================================================
    // LÓGICA DAS ABAS
    // ==========================================================================
    function mudarAba(abaAtiva) {
        tabsContainer.querySelectorAll('.ppp-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === abaAtiva));
        tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `tab-panel-${abaAtiva}`));
    }

    // ==========================================================================
    // ABA 1: GESTÃO DE METAS E COMISSÕES
    // ==========================================================================
    
    // Todas as funções que já criamos para metas vão aqui:
    // Substitua a sua função carregarEpopularVersoes por esta versão com LOGS

async function carregarEpopularVersoes() {
    try {
        selectVersaoEl.disabled = true;
        selectVersaoEl.innerHTML = '<option>Carregando...</option>';
        todasAsVersoes = await fetchApi('/api/metas/versoes');
        
        selectVersaoEl.innerHTML = '<option value="">-- Selecione uma versão --</option>';
        
        const hoje = new Date();
        const hojeStr = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
        
        const ativasOuPassadas = todasAsVersoes.filter(v => {
            // <<< CORREÇÃO PRINCIPAL: Extrai apenas a data da string completa >>>
            const dataDaVersaoStr = v.data_inicio_vigencia.split('T')[0];
            return dataDaVersaoStr <= hojeStr;
        });

        let versaoAtiva = null;
        if (ativasOuPassadas.length > 0) {
            versaoAtiva = ativasOuPassadas.sort((a, b) => new Date(b.data_inicio_vigencia) - new Date(a.data_inicio_vigencia))[0];
        }

        todasAsVersoes.forEach(versao => {
            let status = '';
            const dataDaVersaoStr = versao.data_inicio_vigencia.split('T')[0]; // <<< USA A MESMA LÓGICA AQUI >>>

            if (dataDaVersaoStr > hojeStr) {
                status = '[Futura]';
            } else if (versaoAtiva && versao.id === versaoAtiva.id) {
                status = '[ATIVA]';
            } else {
                status = '[Arquivada]';
            }
            
            // Agora que temos a string 'YYYY-MM-DD', o método de formatação anterior funciona perfeitamente
            const [ano, mes, dia] = dataDaVersaoStr.split('-').map(Number);
            const dataObj = new Date(ano, mes - 1, dia);
            const dataFormatada = dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

            const option = new Option(`${status} ${versao.nome_versao} (Início: ${dataFormatada})`, versao.id);
            option.dataset.status = status.replace(/\[|\]/g, '').toLowerCase();
            selectVersaoEl.add(option);
        });
        selectVersaoEl.disabled = false;
    } catch (error) {
        console.error("Erro em carregarEpopularVersoes:", error);
        mostrarMensagem(`Erro ao carregar versões: ${error.message}`, 'erro');
        selectVersaoEl.innerHTML = '<option>Falha ao carregar</option>';
    }
}

     /**
     * Carrega as regras da versão selecionada e as renderiza na tabela.
     */
    async function carregarRegrasDaVersaoSelecionada() {
    const idVersao = selectVersaoEl.value;
    const selectedOption = selectVersaoEl.options[selectVersaoEl.selectedIndex];
    if (!idVersao) {
        containerDetalhesEl.style.display = 'none';
        return;
    }

    versaoSelecionadaInfo = todasAsVersoes.find(v => v.id == idVersao);
    const status = selectedOption.dataset.status;
    const isEditavel = (status === 'futura');

    tituloTabelaEl.textContent = `Regras da Versão: "${versaoSelecionadaInfo.nome_versao}"`;
    containerDetalhesEl.style.display = 'block';
    // O botão de adicionar nova regra agora será controlado pela função de renderização
    btnAdicionarNovaRegraEl.style.display = 'none'; 

    // Limpa a tabela antiga e prepara o container para o acordeão
    corpoTabelaRegrasEl.innerHTML = `<tr><td colspan="7" class="ppp-carregando"><div class="ppp-spinner"></div> Carregando regras...</td></tr>`;

    try {
        regrasDaVersao = await fetchApi(`/api/metas/regras/${idVersao}`);
        // A função de renderização agora recebe o container principal do acordeão
        renderizarLayoutAcordeao(regrasDaVersao, isEditavel);
    } catch (error) {
        mostrarMensagem(`Erro ao carregar regras: ${error.message}`, 'erro');
        // Limpa a área de detalhes em caso de erro
        document.getElementById('containerDetalhesVersao').innerHTML = `<p class="ppp-erro-carregar">Falha ao carregar regras.</p>`;
    }
}

// Substitua sua função renderizarLayoutAcordeao por esta versão completa

function renderizarLayoutAcordeao(regras, editavel) {
    const containerAcordeao = document.getElementById('containerDetalhesVersao');
    
    const grupos = regras.reduce((acc, regra) => {
        const chave = `${regra.tipo_usuario}-${regra.nivel}`;
        if (!acc[chave]) {
            acc[chave] = {
                titulo: `${regra.tipo_usuario.charAt(0).toUpperCase() + regra.tipo_usuario.slice(1)} - Nível ${regra.nivel}`,
                regras: []
            };
        }
        acc[chave].regras.push(regra);
        return acc;
    }, {});

    // Limpa o container e adiciona o título
    containerAcordeao.innerHTML = `
        <h3 id="tituloTabelaRegras" class="ppp-titulo-secao" style="font-size: 1.4rem; margin-top: 30px;">
            Regras da Versão: "${versaoSelecionadaInfo.nome_versao}"
        </h3>`;

    if (Object.keys(grupos).length === 0) {
        containerAcordeao.innerHTML += `<p style="padding: 20px; text-align: center;">Nenhuma regra encontrada para esta versão.</p>`;
    } else {
        for (const chave in grupos) {
            const grupo = grupos[chave];
            
            const grupoHtml = `
                <div class="ppp-grupo-acordeao">
                    <div class="ppp-acordeao-cabecalho">
                        <h4>${grupo.titulo} (${grupo.regras.length} regras)</h4>
                        <i class="fas fa-chevron-down ppp-acordeao-icone"></i>
                    </div>
                    <div class="ppp-acordeao-conteudo">
                        <!-- Container para a tabela de Desktop -->
                        <div class="ppp-tabela-container">
                            <table class="ppp-tabela">
                                <thead>
                                    <tr>
                                        <th>Descrição</th>
                                        <th>Pontos</th>
                                        <th>Comissão (R$)</th>
                                        <th>Condições</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${grupo.regras.map(regra => renderizarLinhaTabela(regra, editavel)).join('')}
                                </tbody>
                            </table>
                        </div>
                        <!-- Container para os cards de Mobile -->
                        <div class="ppp-cards-container-mobile">
                            ${grupo.regras.map(regra => renderizarCardRegra(regra, editavel)).join('')}
                        </div>
                    </div>
                </div>
            `;
            containerAcordeao.innerHTML += grupoHtml;
        }
    }
    
    // 5. Adiciona o botão "Adicionar Nova Regra" no final, se a versão for editável
    if (editavel) {
        const btnHtml = `
            <button id="btnAdicionarNovaRegra" class="ppp-botao ppp-botao-adicionar" style="margin-top: 20px;">
                <i class="fas fa-plus-circle"></i> Adicionar Nova Regra a esta Versão
            </button>`;
        containerAcordeao.insertAdjacentHTML('beforeend', btnHtml);
        
        // Re-associa o listener ao novo botão que acabamos de criar
        document.getElementById('btnAdicionarNovaRegra').addEventListener('click', () => {
             // Por enquanto, vamos usar um prompt simples para perguntar em qual grupo adicionar
             // Esta parte pode ser melhorada com um modal no futuro
            const gruposDisponiveis = Object.values(grupos).map((g, i) => `${i + 1}: ${g.titulo}`).join('\n');
            const escolha = prompt(`Em qual grupo deseja adicionar a nova regra?\n\n${gruposDisponiveis}\n\nDigite o número do grupo:`);
            
            if (escolha && Object.values(grupos)[parseInt(escolha) - 1]) {
                const chaveGrupo = Object.keys(grupos)[parseInt(escolha) - 1];
                const [tipo, nivel] = chaveGrupo.split('-');
                adicionarLinhaNovaRegra(chaveGrupo, { tipo_usuario: tipo, nivel: nivel });
            }
        });
    }
}

function renderizarLinhaTabela(regra, editavel) {
    const condicoesTexto = (regra.condicoes && regra.condicoes.length > 0) ? `${regra.condicoes.length} condição(ões)` : 'Nenhuma';
    const acoesHtml = editavel
        ? `<button class="ppp-botao ppp-botao-salvar btn-salvar-regra" title="Salvar"><i class="fas fa-save"></i></button>
           <button class="ppp-botao ppp-botao-excluir btn-excluir-regra" title="Excluir"><i class="fas fa-trash"></i></button>`
        : `<button class="ppp-botao" disabled><i class="fas fa-eye"></i></button>`;
    
    return `
        <tr data-regra-id="${regra.id}">
            <td><input class="ppp-input" name="descricao_meta" type="text" value="${regra.descricao_meta}" ${!editavel && 'disabled'}></td>
            <td><input class="ppp-input" name="pontos_meta" type="number" value="${regra.pontos_meta}" step="1" ${!editavel && 'disabled'}></td>
            <td><input class="ppp-input" name="valor_comissao" type="number" value="${parseFloat(regra.valor_comissao).toFixed(2)}" step="0.01" ${!editavel && 'disabled'}></td>
            <td><button class="ppp-botao btn-condicoes" ${!editavel && 'disabled'}>${condicoesTexto}</button></td>
            <td>${acoesHtml}</td>
        </tr>`;
}

function renderizarCardRegra(regra, editavel) {
    const condicoesTexto = (regra.condicoes && regra.condicoes.length > 0) ? `${regra.condicoes.length} condição(ões)` : 'Nenhuma';
    const acoesHtml = editavel
        ? `<div class="ppp-botao-acoes">
             <button class="ppp-botao ppp-botao-salvar btn-salvar-regra" title="Salvar"><i class="fas fa-save"></i> Salvar</button>
             <button class="ppp-botao ppp-botao-excluir btn-excluir-regra" title="Excluir"><i class="fas fa-trash"></i> Excluir</button>
           </div>`
        : `<div class="ppp-botao-acoes"><button class="ppp-botao" disabled><i class="fas fa-eye"></i> Ver</button></div>`;

    return `
        <div class="ppp-card-regra-mobile" data-regra-id="${regra.id}">
            <div class="ppp-card-header">
                <input class="ppp-input" name="descricao_meta" type="text" value="${regra.descricao_meta}" ${!editavel && 'disabled'}>
            </div>
            <div class="ppp-card-body">
                <div class="ppp-card-data-point">
                    <label>Pontos</label>
                    <input class="ppp-input" name="pontos_meta" type="number" value="${regra.pontos_meta}" step="1" ${!editavel && 'disabled'}>
                </div>
                <div class="ppp-card-data-point">
                    <label>Comissão (R$)</label>
                    <input class="ppp-input" name="valor_comissao" type="number" value="${parseFloat(regra.valor_comissao).toFixed(2)}" step="0.01" ${!editavel && 'disabled'}>
                </div>
            </div>
            <div class="ppp-card-footer">
                <button class="ppp-botao btn-condicoes" ${!editavel && 'disabled'}><i class="fas fa-tasks"></i> ${condicoesTexto}</button>
                ${acoesHtml}
            </div>
        </div>`;
}

    /**
     * Renderiza as linhas da tabela de regras com base no estado 'regrasDaVersao'.
     * @param {boolean} editavel - Se a tabela deve permitir edição.
     */
    function renderizarTabelaRegras(editavel) {
        corpoTabelaRegrasEl.innerHTML = '';
        if (regrasDaVersao.length === 0) {
            corpoTabelaRegrasEl.innerHTML = `<tr><td colspan="7">Nenhuma regra encontrada para esta versão. Clique em "Adicionar Nova Regra" para começar.</td></tr>`;
            return;
        }

        regrasDaVersao.forEach(regra => {
            const tr = corpoTabelaRegrasEl.insertRow();
            // Armazenamos todos os dados da regra no próprio elemento TR para fácil acesso
            tr.dataset.regra = JSON.stringify(regra); 
            
            const condicoesTexto = (regra.condicoes && regra.condicoes.length > 0) ? `${regra.condicoes.length} condição(ões)` : 'Nenhuma';
            const acoesHtml = editavel
                ? `<button class="ppp-botao ppp-botao-salvar btn-salvar-regra" title="Salvar Alterações"><i class="fas fa-save"></i></button>
                   <button class="ppp-botao ppp-botao-excluir btn-excluir-regra" title="Excluir Regra"><i class="fas fa-trash"></i></button>`
                : `<button class="ppp-botao" disabled title="Visualizar (Somente Leitura)"><i class="fas fa-eye"></i></button>`;

            tr.innerHTML = `
                <td>${regra.tipo_usuario}</td>
                <td>${regra.nivel}</td>
                <td><input class="ppp-input" type="text" value="${regra.descricao_meta}" ${!editavel && 'disabled'}></td>
                <td><input class="ppp-input" type="number" value="${regra.pontos_meta}" step="1" ${!editavel && 'disabled'}></td>
                <td><input class="ppp-input" type="number" value="${parseFloat(regra.valor_comissao).toFixed(2)}" step="0.01" ${!editavel && 'disabled'}></td>
                <td><button class="ppp-botao btn-condicoes" ${!editavel && 'disabled'}>${condicoesTexto}</button></td>
                <td>${acoesHtml}</td>
            `;
        });
    }

    // FUNÇÃO PARA SALVAR UMA REGRA ALTERADA >>>
     async function salvarRegra(containerRegra, regra) {
        const payload = {
            ...regra, // Pega id, id_versao, tipo_usuario, nivel da regra original
            descricao_meta: containerRegra.querySelector('[name="descricao_meta"]').value,
            pontos_meta: parseInt(containerRegra.querySelector('[name="pontos_meta"]').value, 10),
            valor_comissao: parseFloat(containerRegra.querySelector('[name="valor_comissao"]').value),
            condicoes: JSON.parse(containerRegra.dataset.condicoes || '[]')
        };
        try {
            const confirmado = await mostrarConfirmacao('Salvar as alterações para esta regra?', 'aviso');
            if (!confirmado) return;
            mostrarMensagem('Salvando regra...', 'aviso', 0);
            const regraAtualizada = await fetchApi(`/api/metas/regras/${regra.id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            // Atualiza a regra no nosso array de estado local
            const index = regrasDaVersao.findIndex(r => r.id === regra.id);
            if (index > -1) regrasDaVersao[index] = regraAtualizada;
            mostrarMensagem('Regra salva com sucesso!', 'sucesso');
        } catch (error) {
            mostrarMensagem(`Erro ao salvar regra: ${error.message}`, 'erro');
        }
    }

    // <<< FUNÇÃO PARA EXCLUIR UMA REGRA >>>
    async function excluirRegra(containerRegra, regra) {
        const confirmado = await mostrarConfirmacao(`Tem certeza que deseja excluir a regra "${regra.descricao_meta}"?`, 'perigo');
        if (!confirmado) return;
        try {
            mostrarMensagem('Excluindo regra...', 'aviso', 0);
            await fetchApi(`/api/metas/regras/${regra.id}`, { method: 'DELETE' });
            containerRegra.remove();
            mostrarMensagem('Regra excluída com sucesso!', 'sucesso');
        } catch (error) {
            mostrarMensagem(`Erro ao excluir regra: ${error.message}`, 'erro');
        }
    }

    /**
         * Adiciona uma nova linha em branco na tabela para inserção de uma nova regra.
         */
         function adicionarLinhaNovaRegra(chaveGrupo, dadosGrupo) {
            const acordeaoConteudo = document.querySelector(`.ppp-grupo-acordeao[data-grupo-chave="${chaveGrupo}"] .ppp-acordeao-conteudo`);
            if (!acordeaoConteudo) return;

            const tabelaBody = acordeaoConteudo.querySelector('.ppp-tabela tbody');
            if (tabelaBody.querySelector('tr.nova-regra')) {
                mostrarMensagem('Finalize a adição da regra atual.', 'aviso');
                return;
            }
            const tr = tabelaBody.insertRow(0);
            tr.className = 'nova-regra';
            tr.dataset.condicoes = '[]';
            tr.innerHTML = `
                <td>${dadosGrupo.tipo_usuario}</td>
                <td>${dadosGrupo.nivel}</td>
                <td><input class="ppp-input" name="descricao_meta" placeholder="Ex: Meta Bronze"></td>
                <td><input class="ppp-input" name="pontos_meta" type="number" placeholder="Ex: 4900"></td>
                <td><input class="ppp-input" name="valor_comissao" type="number" placeholder="Ex: 110.00"></td>
                <td><button class="ppp-botao btn-condicoes">Nenhuma</button></td>
                <td>
                    <button class="ppp-botao ppp-botao-salvar btn-salvar-nova-regra" title="Salvar"><i class="fas fa-check"></i></button>
                    <button class="ppp-botao ppp-botao-excluir btn-cancelar-nova-regra" title="Cancelar"><i class="fas fa-times"></i></button>
                </td>`;
        }

        
    /**
     * Coleta os dados de uma nova linha e envia para a API para criação.
     * @param {HTMLTableRowElement} trElemento - O elemento TR da nova linha.
     */
    async function salvarNovaRegra(trElemento) {
        const payload = {
            id_versao: versaoSelecionadaInfo.id,
            tipo_usuario: trElemento.querySelector('[name="tipo_usuario"]').value,
            nivel: parseInt(trElemento.querySelector('[name="nivel"]').value, 10),
            descricao_meta: trElemento.querySelector('[name="descricao_meta"]').value,
            pontos_meta: parseInt(trElemento.querySelector('[name="pontos_meta"]').value, 10),
            valor_comissao: parseFloat(trElemento.querySelector('[name="valor_comissao"]').value),
            condicoes: JSON.parse(trElemento.dataset.condicoes || '[]')
        };
        
        // Validação simples
        if (!payload.descricao_meta || !payload.pontos_meta || !payload.valor_comissao) {
            mostrarMensagem('Descrição, Pontos e Valor da Comissão são obrigatórios.', 'erro');
            return;
        }

        try {
            mostrarMensagem('Criando nova regra...', 'aviso', 0);
            // Usa a nova API POST /api/metas/regras
            await fetchApi('/api/metas/regras', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            mostrarMensagem('Nova regra criada com sucesso! A lista será atualizada.', 'sucesso');
            // Recarrega as regras da versão para mostrar o novo item e limpar a linha de adição
            await carregarRegrasDaVersaoSelecionada();

        } catch (error) {
            mostrarMensagem(`Erro ao criar nova regra: ${error.message}`, 'erro');
        }
    }

    // <<< FUNÇÕES PARA OS MODAIS >>>
    function abrirModalCriarVersao() {
    const versaoAtiva = todasAsVersoes.find(v => {
        const opt = selectVersaoEl.querySelector(`option[value="${v.id}"]`);
        return opt && opt.dataset.status === 'ativa';
    });

    if (!versaoAtiva) {
        mostrarMensagem('Não foi possível encontrar uma versão ativa para clonar.', 'erro');
        return;
    }

    // A data sugerida no campo de data será o próximo domingo
    let dataSugerida = new Date();
    dataSugerida.setDate(dataSugerida.getDate() + (7 - dataSugerida.getDay()) % 7);
    const dataDefault = dataSugerida.toISOString().split('T')[0];

        // Lógica para criar um modal dinamicamente (para não poluir o HTML)
        const modalHtml = `
            <div id="modal-nova-versao" class="ppp-modal-overlay">
                <div class="ppp-modal-content">
                    <h2>Criar Nova Versão de Metas</h2>
                    <p>Uma nova versão será criada como uma cópia da versão ativa ("${versaoAtiva.nome_versao}"). Você poderá editá-la antes que ela entre em vigor.</p>
                    <div class="ppp-form-group">
                        <label for="modal-nome-versao">Nome da Nova Versão:</label>
                        <input type="text" id="modal-nome-versao" class="ppp-input" placeholder="Ex: Metas Agosto/2025">
                    </div>
                    <div class="ppp-form-group">
                        <label for="modal-data-inicio">Data de Início da Vigência (deve ser uma segunda-feira):</label>
                        <input type="date" id="modal-data-inicio" class="ppp-input" value="${dataDefault}">
                    </div>
                    <div class="ppp-modal-actions">
                        <button id="btn-cancelar-modal" class="ppp-botao">Cancelar</button>
                        <button id="btn-confirmar-modal" class="ppp-botao ppp-botao-adicionar">Criar e Clonar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const overlay = document.getElementById('modal-nova-versao');
        const btnConfirmar = document.getElementById('btn-confirmar-modal');
        
        const fecharModal = () => overlay.remove();

        overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });
        document.getElementById('btn-cancelar-modal').addEventListener('click', fecharModal);

        // <<< LÓGICA DE AGENDAMENTO ALTERADA NO BOTÃO CONFIRMAR >>>
    btnConfirmar.addEventListener('click', async () => {
        const nome = document.getElementById('modal-nome-versao').value;
        const dataSelecionadaStr = document.getElementById('modal-data-inicio').value;
        
        let dataDeInicioFinal = new Date(dataSelecionadaStr + 'T12:00:00'); // Usar meio-dia para evitar bugs de fuso
        
        // A SUA NOVA REGRA DE NEGÓCIO IMPLEMENTADA AQUI:
        // Se o dia selecionado não for domingo (getDay() === 0)
        if (dataDeInicioFinal.getDay() !== 0) {
            // Calcula o próximo domingo a partir da data selecionada
            dataDeInicioFinal.setDate(dataDeInicioFinal.getDate() + (7 - dataDeInicioFinal.getDay()) % 7);
            const dataCorrigidaStr = dataDeInicioFinal.toLocaleDateString('pt-BR');
            mostrarMensagem(`A data selecionada não é um domingo. A nova versão foi agendada para: ${dataCorrigidaStr}`, 'info');
            }
        
        const dataParaApi = dataDeInicioFinal.toISOString().split('T')[0];
        
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Criando...';
        
        try {
            await fetchApi('/api/metas/versoes', {
                method: 'POST',
                body: JSON.stringify({
                    nome_versao: nome,
                    data_inicio_vigencia: dataParaApi, // Envia a data corrigida
                    id_versao_origem_clone: versaoAtiva.id
                })
            });
                mostrarMensagem('Nova versão criada com sucesso! A página será recarregada.', 'sucesso');
                setTimeout(() => window.location.reload(), 2000);
            } catch (error) {
                mostrarMensagem(`Erro: ${error.message}`, 'erro');
                btnConfirmar.disabled = false;
                btnConfirmar.textContent = 'Criar e Clonar';
            }
        });
    }

    // <<< VERSÃO COMPLETA DA FUNÇÃO DO MODAL DE CONDIÇÕES >>>
    function abrirModalCondicoes(containerRegra, regra) {
    let condicoesAtuais = [...(regra.condicoes || [])];

    // O <select> de produtos agora usará o ID como 'value'
    const produtosOptions = listaDeProdutosDisponiveis
        .map(p => `<option value="${p.id}">${p.nome}</option>`)
        .join('');

    const modalHtml = `
        <div id="modal-condicoes" class="ppp-modal-overlay">
            <div class="ppp-modal-content" style="max-width: 600px;">
                <h2>Condições para: "${regra.descricao_meta}"</h2>
                <p>Adicione objetivos específicos que o funcionário deve cumprir, além dos pontos, para atingir esta meta.</p>
                
                <div id="lista-condicoes-container"></div>

                <div class="ppp-card-nova-condicao">
                    <h4>Adicionar Novo Objetivo</h4>
                    <form id="form-nova-condicao">
                        <div class="ppp-form-row">
                            <div class="ppp-form-group">
                                <label>Tipo de Objetivo</label>
                                <select id="modal-tipo-condicao" class="ppp-select">
                                    <option value="arremate_produto">Arremate por Produto</option>
                                    <option value="producao_produto" disabled>Produção (Em breve)</option>
                                </select>
                            </div>
                            <div class="ppp-form-group">
                                <label>Produto</label>
                                <!-- <<< ALTERADO AQUI >>> -->
                                <select id="modal-produto-condicao" class="ppp-select">
                                    <option value="">Selecione...</option>
                                    ${produtosOptions}
                                </select>
                            </div>
                        </div>
                        <div class="ppp-form-row">
                            <div class="ppp-form-group">
                                <label>Quantidade Mínima Semanal</label>
                                <input type="number" id="modal-qtd-condicao" class="ppp-input" min="1" step="1">
                            </div>
                            <div class="ppp-form-group">
                                <button type="submit" class="ppp-botao ppp-botao-adicionar" style="margin-top: 28px;">
                                    <i class="fas fa-plus"></i> Adicionar
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="ppp-modal-actions">
                    <button id="btn-cancelar-modal-cond" class="ppp-botao">Cancelar</button>
                    <button id="btn-salvar-modal-cond" class="ppp-botao ppp-botao-salvar">Salvar Condições</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

            const overlay = document.getElementById('modal-condicoes');
            const form = document.getElementById('form-nova-condicao');
            const listaContainer = document.getElementById('lista-condicoes-container');

            // Função para renderizar a lista de condições dentro do modal
            const renderizarListaCondicoes = () => {
                if (condicoesAtuais.length === 0) {
                    listaContainer.innerHTML = '<p class="ppp-sem-condicoes">Nenhuma condição definida para esta meta.</p>';
                    return;
                }
                
             listaContainer.innerHTML = condicoesAtuais.map((cond, index) => {
                    // Procura o nome do produto na nossa lista em cache para exibir
                    const produto = listaDeProdutosDisponiveis.find(p => p.id === cond.produto_id);
                    const nomeProduto = produto ? produto.nome : `Produto ID ${cond.produto_id} (Não encontrado)`;

                    return `
                    <div class="ppp-condicao-item">
                        <span>- <strong>Arremate</strong> de <strong>${nomeProduto}</strong>: Mínimo de <strong>${cond.quantidade_minima}</strong> un/semana.</span>
                        <button class="ppp-botao-remover-cond" data-index="${index}" title="Remover">&times;</button>
                    </div>
                `}).join('');
            };


            // Listeners do Modal
            const fecharModal = () => overlay.remove();
            document.getElementById('btn-cancelar-modal-cond').addEventListener('click', fecharModal);
            overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });

            // Salvar as condições
            document.getElementById('btn-salvar-modal-cond').addEventListener('click', () => {
                containerRegra.dataset.condicoes = JSON.stringify(condicoesAtuais);
                const btnCondicoes = containerRegra.querySelector('.btn-condicoes');
                btnCondicoes.textContent = condicoesAtuais.length > 0 ? `${condicoesAtuais.length} condição(ões)` : 'Nenhuma';
                if (btnCondicoes.querySelector('i')) btnCondicoes.prepend(btnCondicoes.querySelector('i')); // Mantém o ícone no mobile
                mostrarMensagem('Condições atualizadas. Clique em "Salvar" para persistir.', 'aviso');
                fecharModal();
            });

            // Adicionar nova condição
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                const selectProdutoEl = document.getElementById('modal-produto-condicao');
                const produtoIdSelecionado = parseInt(selectProdutoEl.value, 10);
                
                const novaCondicao = {
                    tipo: document.getElementById('modal-tipo-condicao').value,
                    produto_id: produtoIdSelecionado, // SALVA O ID
                    quantidade_minima: parseInt(document.getElementById('modal-qtd-condicao').value, 10)
                };

                if (!novaCondicao.produto_id || !novaCondicao.quantidade_minima) {
                    mostrarMensagem('Por favor, preencha todos os campos para adicionar a condição.', 'aviso');
                    return;
                }

                condicoesAtuais.push(novaCondicao);
                renderizarListaCondicoes();
                form.reset();
            });

            // Remover uma condição (usando delegação de evento)
            listaContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('ppp-botao-remover-cond')) {
                    const indexToRemove = parseInt(e.target.dataset.index, 10);
                    condicoesAtuais.splice(indexToRemove, 1); // Remove o item do array
                    renderizarListaCondicoes(); // Re-renderiza a lista
                }
            });

            // Renderiza a lista inicial ao abrir o modal
            renderizarListaCondicoes();
        }

     // ==========================================================================
    // ABA 2: CONFIGURAÇÃO DE PONTOS POR ATIVIDADE
    // ==========================================================================
    function popularFiltrosDePontos() {
        filtroProdutoPontosEl.innerHTML = '<option value="">Todos os Produtos</option>';
        listaDeProdutosDisponiveis.forEach(p => filtroProdutoPontosEl.add(new Option(p.nome, p.id)));
        filtroTipoAtividadePontosEl.innerHTML = `<option value="">Todos</option><option value="costura_op_costureira">Costura OP (Costureira)</option><option value="processo_op_tiktik">Processo OP (Tiktik)</option><option value="arremate_tiktik">Arremate (Tiktik)</option>`;
    }

    async function carregarConfiguracoesPontos() {
        corpoTabelaPontosEl.innerHTML = `<tr><td colspan="6" class="ppp-carregando"><div class="ppp-spinner"></div> Carregando...</td></tr>`;
        try {
            const params = new URLSearchParams();
            if(filtroProdutoPontosEl.value) params.append('produto_id', filtroProdutoPontosEl.value);
            if(filtroTipoAtividadePontosEl.value) params.append('tipo_atividade', filtroTipoAtividadePontosEl.value);
            
            const configs = await fetchApi(`/api/configuracao-pontos/padrao?${params.toString()}`);
            renderizarTabelaPontos(configs);
        } catch (error) {
            mostrarMensagem(`Erro ao carregar pontos: ${error.message}`, 'erro');
            corpoTabelaPontosEl.innerHTML = `<tr><td colspan="6" class="ppp-erro-carregar">Falha ao carregar.</td></tr>`;
        }
    }

    function renderizarTabelaPontos(configs) {
        corpoTabelaPontosEl.innerHTML = '';
        if (configs.length === 0) {
            corpoTabelaPontosEl.innerHTML = `<tr><td colspan="6">Nenhuma configuração de ponto encontrada.</td></tr>`;
            return;
        }
        configs.forEach(config => {
            const tr = corpoTabelaPontosEl.insertRow();
            tr.dataset.configId = config.id;
            tr.innerHTML = `
                <td>${config.produto_nome}</td>
                <td>${config.processo_nome}</td>
                <td>${getTipoAtividadeTexto(config.tipo_atividade)}</td>
                <td><input class="ppp-input" type="number" value="${parseFloat(config.pontos_padrao).toFixed(2)}" step="0.01"></td>
                <td><input type="checkbox" ${config.ativo ? 'checked' : ''}></td>
                <td>
                    <button class="ppp-botao ppp-botao-salvar btn-salvar-ponto" title="Salvar Ponto"><i class="fas fa-save"></i></button>
                    <button class="ppp-botao ppp-botao-excluir btn-excluir-ponto" title="Excluir Ponto"><i class="fas fa-trash"></i></button>
                </td>`;
        });
    }

    function adicionarLinhaNovoPonto() {
        if (corpoTabelaPontosEl.querySelector('tr.nova-config-ponto')) {
            mostrarMensagem('Finalize a adição da configuração de ponto atual.', 'aviso');
            return;
        }
        const tr = corpoTabelaPontosEl.insertRow(0);
        tr.className = 'nova-config-ponto';
        const produtosOptions = listaDeProdutosDisponiveis.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        tr.innerHTML = `
            <td><select class="ppp-select select-produto-ponto">${produtosOptions}</select></td>
            <td><select class="ppp-select select-processo-ponto" disabled><option>Selecione produto/tipo</option></select></td>
            <td><select class="ppp-select select-tipo-ponto"><option value="costura_op_costureira">Costura OP</option><option value="processo_op_tiktik">Processo OP</option><option value="arremate_tiktik">Arremate</option></select></td>
            <td><input class="ppp-input" name="pontos_padrao" type="number" value="1.00" step="0.01" min="0.01"></td>
            <td><input type="checkbox" name="ativo" checked></td>
            <td><button class="ppp-botao ppp-botao-salvar btn-salvar-novo-ponto" title="Salvar"><i class="fas fa-check"></i></button><button class="ppp-botao ppp-botao-excluir btn-cancelar-novo-ponto" title="Cancelar"><i class="fas fa-times"></i></button></td>`;
        
        const selectProduto = tr.querySelector('.select-produto-ponto');
        const selectTipo = tr.querySelector('.select-tipo-ponto');
        const selectProcesso = tr.querySelector('.select-processo-ponto');

        const atualizarProcessos = () => {
            const produtoId = selectProduto.value;
            const tipo = selectTipo.value;
            const produto = listaDeProdutosDisponiveis.find(p => p.id == produtoId);
            selectProcesso.innerHTML = '';
            if (tipo === 'arremate_tiktik') {
                selectProcesso.innerHTML = '<option value="Arremate (Config)">Arremate (Config)</option>';
                selectProcesso.disabled = true;
            } else if (produto && produto.etapas && produto.etapas.length > 0) {
                [...new Set(produto.etapas.map(e => e.processo || e))].forEach(p => selectProcesso.add(new Option(p, p)));
                selectProcesso.disabled = false;
            } else {
                selectProcesso.innerHTML = '<option value="">Sem Processos</option>';
                selectProcesso.disabled = true;
            }
        };
        selectProduto.addEventListener('change', atualizarProcessos);
        selectTipo.addEventListener('change', atualizarProcessos);
        atualizarProcessos();
    }

    async function salvarPonto(trElemento) {
        const isNova = trElemento.classList.contains('nova-config-ponto');
        const configId = isNova ? null : trElemento.dataset.configId;
        const payload = {
            pontos_padrao: trElemento.querySelector('input[type="number"]').value,
            ativo: trElemento.querySelector('input[type="checkbox"]').checked
        };
        if (isNova) {
            Object.assign(payload, {
                produto_id: trElemento.querySelector('.select-produto-ponto').value,
                processo_nome: trElemento.querySelector('.select-processo-ponto').value,
                tipo_atividade: trElemento.querySelector('.select-tipo-ponto').value,
            });
        }
        try {
            mostrarMensagem('Salvando...', 'aviso', 0);
            const url = isNova ? '/api/configuracao-pontos/padrao' : `/api/configuracao-pontos/padrao/${configId}`;
            const method = isNova ? 'POST' : 'PUT';
            await fetchApi(url, { method, body: JSON.stringify(payload) });
            mostrarMensagem('Configuração de ponto salva!', 'sucesso');
            await carregarConfiguracoesPontos();
        } catch (error) {
            mostrarMensagem(`Erro ao salvar ponto: ${error.message}`, 'erro');
        }
    }

    async function excluirPonto(trElemento) {
        const configId = trElemento.dataset.configId;
        if (!configId) return;
        const confirmado = await mostrarConfirmacao('Tem certeza que deseja excluir esta configuração de ponto?', 'perigo');
        if (!confirmado) return;
        try {
            mostrarMensagem('Excluindo...', 'aviso', 0);
            await fetchApi(`/api/configuracao-pontos/padrao/${configId}`, { method: 'DELETE' });
            mostrarMensagem('Configuração de ponto excluída.', 'sucesso');
            trElemento.remove();
        } catch (error) {
            mostrarMensagem(`Erro ao excluir ponto: ${error.message}`, 'erro');
        }
    }
    
    // ==========================================================================
    // INICIALIZAÇÃO E EVENT LISTENERS GLOBAIS
    // ==========================================================================
    function configurarEventListeners() {
        // Listener das abas
        tabsContainer.addEventListener('click', e => {
            if (e.target.matches('.ppp-tab-btn')) {
                mudarAba(e.target.dataset.tab);
            }
        });
        
        // Listeners dos botões principais
        selectVersaoEl.addEventListener('change', carregarRegrasDaVersaoSelecionada);
        btnCriarNovaVersaoEl.addEventListener('click', abrirModalCriarVersao);
        // O listener do btnAdicionarNovaRegra é adicionado dinamicamente dentro de renderizarLayoutAcordeao

        // Listener para todas as interações dentro da área de detalhes das metas (acordeão, botões, etc.)
        containerDetalhesEl.addEventListener('click', async (e) => {
            const botaoClicado = e.target.closest('button');
            
            // Lógica para abrir/fechar o acordeão
            const cabecalho = e.target.closest('.ppp-acordeao-cabecalho');
            if (cabecalho) {
                cabecalho.classList.toggle('ativo');
                const conteudo = cabecalho.nextElementSibling;
                conteudo.classList.toggle('ativo');
                return;
            }

            // Se não foi um clique no cabeçalho, verifica se foi em um botão de ação
            if (!botaoClicado) return;

            // Encontra o container da regra (seja TR da tabela ou o CARD mobile) que contém o botão
            const containerRegra = botaoClicado.closest('[data-regra-id]');
            if (!containerRegra) return;
            
            const regraId = containerRegra.dataset.regraId;
            const regra = regrasDaVersao.find(r => r.id == regraId);

            // Se por algum motivo a regra não for encontrada, para a execução
            if (!regra) {
                console.error(`Regra com ID ${regraId} não encontrada no estado da aplicação.`);
                mostrarMensagem('Ocorreu um erro ao encontrar os dados desta regra. Por favor, recarregue a página.', 'erro');
                return;
            }

            // Delega a ação para a função correta
            if (botaoClicado.classList.contains('btn-salvar-regra')) {
                await salvarRegra(containerRegra, regra);
            } else if (botaoClicado.classList.contains('btn-excluir-regra')) {
                await excluirRegra(containerRegra, regra);
            } else if (botaoClicado.classList.contains('btn-condicoes')) {
                abrirModalCondicoes(containerRegra, regra);
            }
        });

        // --- Listeners da ABA DE PONTOS (sem alterações) ---
        filtroProdutoPontosEl.addEventListener('change', carregarConfiguracoesPontos);
        filtroTipoAtividadePontosEl.addEventListener('change', carregarConfiguracoesPontos);
        btnAdicionarNovaConfigPontoEl.addEventListener('click', adicionarLinhaNovoPonto);

        corpoTabelaPontosEl.addEventListener('click', (e) => {
            const botaoClicado = e.target.closest('button');
            if (!botaoClicado) return;
            const tr = botaoClicado.closest('tr');
            if (!tr) return;
            
            const isNova = tr.classList.contains('nova-config-ponto');
            if (isNova) {
                if (botaoClicado.matches('.btn-salvar-novo-ponto')) salvarPonto(tr);
                else if (botaoClicado.matches('.btn-cancelar-novo-ponto')) tr.remove();
            } else {
                if (botaoClicado.matches('.btn-salvar-ponto')) salvarPonto(tr);
                else if (botaoClicado.matches('.btn-excluir-ponto')) excluirPonto(tr);
            }
        });
    }

    async function init() {
        try {
            const auth = await verificarAutenticacao('ponto-por-processo.html', ['acesso-ponto-por-processo']);
            if (!auth || !auth.usuario) throw new Error("Autenticação falhou.");
            usuarioLogado = auth.usuario;
            document.body.classList.add('autenticado');
            
            await carregarProdutosDoServidor();
            await carregarEpopularVersoes();
            
            popularFiltrosDePontos();
            await carregarConfiguracoesPontos();
            
            configurarEventListeners();
            mudarAba('metas');
        } catch (error) {
            console.error("Erro na inicialização da página:", error);
            document.body.innerHTML = `<p style="color: red; padding: 20px;">Erro crítico: ${error.message}. Acesso negado.</p>`;
        }
    }
    
    init();
})();