// js/pages/admin-ordens-de-producao.js
import { verificarAutenticacaoSincrona } from './utils/auth.js';
import { obterProdutos, salvarProdutos } from './utils/storage.js';
import { PRODUTOS, PRODUTOSKITS } from './utils/prod-proc-maq.js';
import { obterUsuarios } from './utils/storage.js';
import { permissoesDisponiveis } from './utils/permissoes.js';

// Verificação de autenticação síncrona no topo do script
const auth = verificarAutenticacaoSincrona('ordens-de-producao.html', ['acesso-ordens-de-producao']);
if (!auth) {
    console.error('[admin-ordens-de-producao] Autenticação falhou. Usuário logado:', localStorage.getItem('usuarioLogado'));
    window.location.href = 'acesso-negado.html'; // Redireciona para acesso-negado.html
    throw new Error('Autenticação falhou, redirecionando para acesso-negado.html...');
}

let permissoes = auth.permissoes || [];
let usuarioLogado = auth.usuario;
console.log('[admin-ordens-de-producao] Autenticação bem-sucedida, permissões:', permissoes);

// Elementos DOM com verificação
const opListView = document.getElementById('opListView');
const opFormView = document.getElementById('opFormView');
const opEditView = document.getElementById('opEditView');
const opTableBody = document.getElementById('opTableBody');
const searchOP = document.getElementById('searchOP');
const statusFilter = document.getElementById('statusFilter');
const opForm = document.getElementById('opForm');
const produtoOP = document.getElementById('produtoOP');
const quantidadeOP = document.getElementById('quantidadeOP');
const numeroOP = document.getElementById('numeroOP');
const variantesContainer = document.getElementById('variantesContainer');
const variantesSelects = document.querySelector('.variantes-selects');
const dataEntregaOP = document.getElementById('dataEntregaOP');
const observacoesOP = document.getElementById('observacoesOP');
const editProdutoOP = document.getElementById('editProdutoOP');
const editVarianteOP = document.getElementById('editVarianteOP');
const editVarianteContainer = document.getElementById('editVarianteContainer');
const editQuantidadeOP = document.getElementById('editQuantidadeOP');
const editDataEntregaOP = document.getElementById('editDataEntregaOP');
const etapasContainer = document.getElementById('etapasContainer');
const opNumero = document.getElementById('opNumero');
const finalizarOP = document.getElementById('finalizarOP');
const cancelarOP = document.getElementById('cancelarOP');
const voltarOP = document.getElementById('voltarOP');

// Verificação dos elementos DOM
const requiredElements = [
    opListView, opFormView, opEditView, opTableBody, searchOP, statusFilter, opForm,
    produtoOP, quantidadeOP, numeroOP, variantesContainer, variantesSelects, dataEntregaOP,
    observacoesOP, editProdutoOP, editVarianteOP, editVarianteContainer, editQuantidadeOP,
    editDataEntregaOP, etapasContainer, opNumero, finalizarOP, cancelarOP, voltarOP
];
if (requiredElements.some(el => !el)) {
    throw new Error('Elementos DOM necessários não encontrados');
}

// Inicialização de dados
let ordensDeProducao = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];

let tempNextOPNumber = getNextOPNumber();
let usedIds = new Set(ordensDeProducao.map(op => op.editId));

// Gera um ID único de 9 dígitos
function generateUniqueId() {
    let id;
    do {
        id = Math.floor(100000000 + Math.random() * 900000000).toString();
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
}

// Função auxiliar para personalizar o placeholder do select de usuários
function getUsuarioPlaceholder(tipoUsuario) {
    switch (tipoUsuario) {
        case 'costureira': return 'Selecione a(o) Costureira(o)';
        case 'cortador': return 'Selecione a(o) Cortador(a)';
        case 'tiktik': return 'Selecione a(o) TikTik';
        default: return 'Selecione o usuário';
    }
}

// Função para carregar produtos no select, excluindo kits
function loadProdutosSelect() {
    const produtoSelect = document.getElementById('produtoOP');
    if (!produtoSelect) return;

    produtoSelect.innerHTML = '<option value="">Selecione um produto</option>';
    const produtos = obterProdutos();
    const produtosFiltrados = produtos.filter(produto => 
        PRODUTOS.includes(produto.nome) && !PRODUTOSKITS.includes(produto.nome)
    );
    produtosFiltrados.forEach(produto => {
        const option = document.createElement('option');
        option.value = produto.nome;
        option.textContent = produto.nome;
        produtoSelect.appendChild(option);
    });
}

// Função para carregar variantes
function loadVariantesSelects(produtoNome) {
    const variantesContainer = document.getElementById('variantesContainer');
    const variantesSelects = document.querySelector('.variantes-selects');
    if (!variantesContainer || !variantesSelects) return;

    variantesSelects.innerHTML = '';
    if (!produtoNome) {
        variantesContainer.style.display = 'none';
        return;
    }

    const produtos = obterProdutos();
    const produto = produtos.find(p => p.nome === produtoNome);

    let variantesDisponiveis = [];
    if (produto.variantes && produto.variantes.length > 0) {
        variantesDisponiveis = produto.variantes.map(v => v.valores.split(',')).flat().map(v => v.trim());
    } else if (produto.grade && produto.grade.length > 0) {
        variantesDisponiveis = [...new Set(produto.grade.map(g => g.variacao))];
    }

    if (variantesDisponiveis.length > 0) {
        const select = document.createElement('select');
        select.innerHTML = '<option value="">Selecione uma variação</option>';
        variantesDisponiveis.forEach(variante => {
            const option = document.createElement('option');
            option.value = variante;
            option.textContent = variante;
            select.appendChild(option);
        });
        variantesSelects.appendChild(select);
        variantesContainer.style.display = 'block';
    } else {
        variantesContainer.style.display = 'none';
    }
}

// Gera o próximo número de OP
function getNextOPNumber() {
    const ordens = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
    const numeros = ordens.map(op => parseInt(op.numero)).filter(n => !isNaN(n));
    const maxNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
    return (maxNumero + 1).toString();
}

// Define a data atual ajustada ao horário local
function setCurrentDate() {
    const dataEntrega = document.getElementById('dataEntregaOP');
    if (dataEntrega) {
        const hoje = new Date().toISOString().split('T')[0];
        dataEntrega.value = hoje;
    }
}

// Carrega a tabela de ordens de produção
function loadOPTable(filterStatus = 'todas', search = '') {
    const opTableBody = document.getElementById('opTableBody');
    opTableBody.innerHTML = '';
    let filteredOPs = ordensDeProducao;

    if (filterStatus === 'todas') {
        filteredOPs = ordensDeProducao.filter(op => op.status !== 'cancelada' && op.status !== 'finalizado');
    } else {
        filteredOPs = ordensDeProducao.filter(op => op.status === filterStatus);
    }

    filteredOPs = filteredOPs.filter(op => 
        op.produto.toLowerCase().includes(search.toLowerCase()) || 
        op.numero.toString().includes(search) ||
        (op.variante && op.variante.toLowerCase().includes(search.toLowerCase()))
    );

    filteredOPs.forEach((op, index) => {
        if (!op.editId) op.editId = generateUniqueId();
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        tr.style.cursor = permissoes.includes('editar-op') ? 'pointer' : 'default';
        tr.innerHTML = `
            <td><span class="status-bolinha status-${op.status} ${op.status === 'produzindo' ? 'blink' : ''}"></span></td>
            <td>${op.numero}</td>
            <td>${op.produto}</td>
            <td>${op.variante || '-'}</td>
            <td>${op.quantidade}</td>
        `;
        if (permissoes.includes('editar-op')) {
            tr.addEventListener('click', () => {
                window.location.hash = `#editar/${op.editId}`;
            });
        }
        opTableBody.appendChild(tr);
    });
}

// Filtra ordens de produção
function filterOPs() {
    const activeStatus = statusFilter.querySelector('.status-btn.active')?.dataset.status || 'todas';
    loadOPTable(activeStatus, searchOP.value);
}

// Configura os botões de filtro
statusFilter.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        statusFilter.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterOPs();
    });
});

// Função loadEtapasEdit 1
function loadEtapasEdit(op, skipReload = false) {
    console.log(`[loadEtapasEdit] Iniciando carregamento das etapas para OP: ${op ? op.numero : 'undefined'}`);
    const etapasContainer = document.getElementById('etapasContainer');
    const finalizarBtn = document.getElementById('finalizarOPBtn');

    if (!op || !op.etapas) {
        console.error('[loadEtapasEdit] OP ou etapas não encontradas:', op);
        return;
    }

    // Verificar se todas as etapas estão completas e ajustar o status, se necessário
    const todasEtapasCompletas = verificarEtapasEStatus(op);
    if (op.status === 'finalizado' && !todasEtapasCompletas) {
        op.status = 'produzindo';
        saveOPChanges(op);
        console.log(`[loadEtapasEdit] OP ${op.numero} ajustada para "produzindo" porque nem todas as etapas estão completas.`);
    }

    if (!skipReload) {
        etapasContainer.innerHTML = '';
    }

    console.log('[loadEtapasEdit] Etapas do produto:', op.etapas);

    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    console.log(`[loadEtapasEdit] Produções carregadas: ${producoes.length}, Usuários disponíveis: ${usuarios.length}`);

    const etapaAtualIndex = determinarEtapaAtual(op);
    console.log(`[loadEtapasEdit] Etapa atual index calculada: ${etapaAtualIndex}`);

    op.etapas.forEach((etapa, index) => {
        console.log(`[loadEtapasEdit] Processando etapa ${index + 1}: ${etapa.processo}, lancado: ${etapa.lancado}, usuario: ${etapa.usuario || ''}`);

        let row = skipReload ? etapasContainer.children[index] : null;
        if (!row) {
            row = document.createElement('div');
            row.className = 'etapa-row';
            row.dataset.index = index;
            etapasContainer.appendChild(row);
        } else {
            row.innerHTML = '';
        }

        const numero = document.createElement('span');
        numero.className = 'etapa-numero';
        numero.textContent = index + 1;
        row.appendChild(numero);

        const processo = document.createElement('input');
        processo.type = 'text';
        processo.className = 'etapa-processo';
        processo.value = etapa.processo;
        processo.readOnly = true;
        row.appendChild(processo);

        const usuarioSelect = document.createElement('select');
        usuarioSelect.className = 'select-usuario';
        usuarioSelect.disabled = op.status === 'finalizado' || op.status === 'cancelada';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Selecione um usuário';
        usuarioSelect.appendChild(defaultOption);

        const tipoUsuario = getTipoUsuarioPorProcesso(etapa.processo, op.produto);
        const usuariosFiltrados = usuarios.filter(u => {
            const tipos = u.tipos && Array.isArray(u.tipos) ? u.tipos : (u.tipo ? [u.tipo] : []);
            return tipos.includes(tipoUsuario);
        });
        console.log(`[loadEtapasEdit] Etapa ${index + 1}, tipoUsuario: ${tipoUsuario}, usuários filtrados:`, usuariosFiltrados.map(u => u.nome));

        usuariosFiltrados.forEach(u => {
            const option = document.createElement('option');
            option.value = u.nome;
            option.textContent = u.nome;
            if (etapa.usuario === u.nome) option.selected = true;
            usuarioSelect.appendChild(option);
        });

        row.appendChild(usuarioSelect);

        const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
        let quantidadeDiv = null;

        if (index <= etapaAtualIndex && (etapa.usuario || index === etapaAtualIndex) && exigeQuantidade) {
            quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, true, row);
            row.appendChild(quantidadeDiv);
            console.log(`[loadEtapasEdit] QuantidadeDiv criada para etapa ${index + 1}, lancado: ${etapa.lancado}, quantidade: ${etapa.quantidade}, isEditable: true`);
        } else {
            console.log(`[loadEtapasEdit] QuantidadeDiv não criada para etapa ${index + 1} - exigeQuantidade: ${exigeQuantidade}, usuario: ${etapa.usuario || ''}, index <= etapaAtualIndex: ${index <= etapaAtualIndex}`);
        }

        if (etapa.processo === 'Corte' && !etapa.usuario) {
            const definirBtn = document.createElement('button');
            definirBtn.className = 'botao-definir';
            definirBtn.textContent = 'Definir';
            definirBtn.disabled = !usuarioSelect.value;
            row.appendChild(definirBtn);

            usuarioSelect.addEventListener('change', () => {
                definirBtn.disabled = !usuarioSelect.value;
            });

            definirBtn.addEventListener('click', () => {
                if (!usuarioSelect.value) {
                    alert('Por favor, selecione um cortador antes de definir.');
                    return;
                }
                etapa.usuario = usuarioSelect.value;
                console.log(`[definirBtn.click] Usuário definido para etapa 1: ${etapa.usuario}`);
                saveOPChanges(op);
                loadEtapasEdit(op, true);
                updateFinalizarButtonState(op);
            });
        } else {
            usuarioSelect.addEventListener('change', () => {
                if (op.status === 'finalizado' || op.status === 'cancelada') return;
                etapa.usuario = usuarioSelect.value;
                console.log(`[usuarioSelect.change] Usuário selecionado para etapa ${index + 1}: ${etapa.usuario}`);
                saveOPChanges(op);
                if (exigeQuantidade && etapa.usuario && !row.querySelector('.quantidade-lancar')) {
                    quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, true, row);
                    row.appendChild(quantidadeDiv);
                    console.log(`[usuarioSelect.change] QuantidadeDiv adicionada para etapa ${index + 1}`);
                }
                atualizarVisualEtapas(op);
                updateFinalizarButtonState(op);
            });
        }
    });

    if (finalizarBtn) {
        finalizarBtn.disabled = !todasEtapasCompletas || !op.dataFinal;
    }
    console.log('[loadEtapasEdit] Finalizado carregamento das etapas');
    atualizarVisualEtapas(op);
    updateFinalizarButtonState(op);
}


// Salva alterações na OP 2
function saveOPChanges(op) {
    let ordensDeProducaoLocal = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
    const index = ordensDeProducaoLocal.findIndex(o => o.editId === op.editId);
    if (index !== -1) {
        ordensDeProducaoLocal[index] = op;
    } else {
        ordensDeProducaoLocal.push(op);
    }
    localStorage.setItem('ordensDeProducao', JSON.stringify(ordensDeProducaoLocal));
    ordensDeProducao = ordensDeProducaoLocal;
}

// Atualiza o estado do botão Finalizar 3
function updateFinalizarButtonState(op) {
    const finalizarBtn = document.getElementById('finalizarOP');
    if (!finalizarBtn || !op) return;

    const editProduto = document.getElementById('editProdutoOP')?.value || op.produto;
    const editQuantidade = parseInt(document.getElementById('editQuantidadeOP')?.value) || op.quantidade || 0;
    const editDataEntrega = document.getElementById('editDataEntregaOP')?.value || op.dataEntrega;

    const camposPrincipaisPreenchidos = editProduto && editQuantidade > 0 && editDataEntrega;

    const todasEtapasCompletas = op.etapas && op.etapas.length > 0 ? op.etapas.every((etapa) => {
        const tipoUsuario = getTipoUsuarioPorProcesso(etapa.processo, op.produto);
        const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
        const etapaCompleta = etapa.usuario && (!exigeQuantidade || (etapa.lancado && etapa.quantidade > 0));
        console.log(`[updateFinalizarButtonState] Etapa ${etapa.processo}: usuario=${etapa.usuario}, exigeQuantidade=${exigeQuantidade}, lancado=${etapa.lancado}, quantidade=${etapa.quantidade}, completa=${etapaCompleta}`);
        return etapaCompleta;
    }) : false;

    const podeFinalizar = camposPrincipaisPreenchidos && todasEtapasCompletas && op.status !== 'finalizado' && op.status !== 'cancelada';
    finalizarBtn.disabled = !podeFinalizar;
    finalizarBtn.style.backgroundColor = podeFinalizar ? '#4CAF50' : '#ccc'; // Verde (ou ajuste para azul)
    console.log(`[updateFinalizarButtonState] Pode finalizar: ${podeFinalizar}, campos preenchidos: ${camposPrincipaisPreenchidos}, todas etapas completas: ${todasEtapasCompletas}`);
}

// Função salvar producao 4
function salvarProducao(op, etapa) {
    const producoes = JSON.parse(localStorage.getItem('producoes')) || [];
    const novoId = Date.now().toString();

    const dataHora = new Date();
    const dataHoraFormatada = dataHora.toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    if (!etapa.usuario || !etapa.quantidade || etapa.quantidade <= 0) {
        throw new Error('Usuário ou quantidade inválidos');
    }

    const produtos = obterProdutos();
    const produto = produtos.find(p => p.nome === op.produto);
    const etapaProduto = produto?.etapas.find(e => e.processo === etapa.processo);
    const maquina = etapaProduto?.maquina || 'Não Usa';

    const producao = {
        id: novoId,
        opNumero: op.numero,
        produto: op.produto,
        processo: etapa.processo,
        variacao: op.variante || 'N/A', // Adiciona a variação da ordem de produção
        maquina: maquina,
        funcionario: etapa.usuario,
        quantidade: parseInt(etapa.quantidade),
        data: dataHora.toISOString(),
        dataHoraFormatada: dataHoraFormatada,
        assinada: false,
        edicoes: 0,
        editadoPorAdmin: usuarioLogado?.nome || 'Sistema',
        lancadoPor: usuarioLogado?.nome || 'Sistema',

    };

    producoes.push(producao);
    localStorage.setItem('producoes', JSON.stringify(producoes));
    return novoId;
}

//funcao lancar etapa 5
function lancarEtapa(op, etapaIndex, quantidade) {
    const etapa = op.etapas[etapaIndex];
    etapa.quantidade = parseInt(quantidade);
    etapa.ultimoLancamentoId = salvarProducao(op, etapa);
    etapa.lancado = true;
    saveOPChanges(op);
    updateFinalizarButtonState(op);
}

// Função auxiliar para criar a linha de quantidade e botão "Lançar" 6
function criarQuantidadeDiv(etapa, op, usuarioSelect, isEditable, row) {
    const quantidadeDiv = document.createElement('div');
    quantidadeDiv.className = 'quantidade-lancar';
    quantidadeDiv.style.display = 'flex';
    quantidadeDiv.style.alignItems = 'center';

    const quantidadeInput = document.createElement('input');
    quantidadeInput.type = 'number';
    quantidadeInput.min = '1';
    quantidadeInput.value = etapa.quantidade || '';
    quantidadeInput.placeholder = 'Qtde';
    quantidadeInput.className = 'quantidade-input';
    quantidadeInput.disabled = !usuarioSelect.value || !isEditable || etapa.lancado;

    let lancarBtn = document.createElement('button');
    lancarBtn.className = 'botao-lancar';
    lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
    lancarBtn.disabled = !usuarioSelect.value || !etapa.quantidade || etapa.quantidade <= 0 || !isEditable || etapa.lancado;
    lancarBtn.dataset.etapaIndex = op.etapas.indexOf(etapa);

    quantidadeDiv.appendChild(quantidadeInput);
    quantidadeDiv.appendChild(lancarBtn);

    if (etapa.lancado && etapa.editadoPorAdmin) {
        const editInfo = document.createElement('span');
        editInfo.className = 'edit-info';
        editInfo.textContent = `Editado por: ${etapa.editadoPorAdmin}`;
        editInfo.style.marginLeft = '10px';
        quantidadeDiv.appendChild(editInfo);
    }

    // Função para atualizar o estado do botão "Lançar"
    const updateLancarBtn = () => {
        const oldBtn = quantidadeDiv.querySelector('.botao-lancar');
        if (oldBtn) oldBtn.remove();

        lancarBtn = document.createElement('button');
        lancarBtn.className = 'botao-lancar';
        lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
        lancarBtn.disabled = !usuarioSelect.value || !etapa.quantidade || etapa.quantidade <= 0 || !isEditable || etapa.lancado;
        lancarBtn.dataset.etapaIndex = op.etapas.indexOf(etapa);

        lancarBtn.addEventListener('click', () => {
            if (lancarBtn.disabled) return;

            const etapaIndex = parseInt(lancarBtn.dataset.etapaIndex);
            const editId = window.location.hash.split('/')[1];
            const ordensDeProducaoLocal = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
            const opLocal = ordensDeProducaoLocal.find(o => o.editId === editId);

            if (!opLocal || !opLocal.etapas[etapaIndex]) {
                alert('Erro: Ordem de Produção ou etapa não encontrada.');
                return;
            }

            const etapasFuturas = getEtapasFuturasValidas(opLocal, etapaIndex);
            if (etapasFuturas.length > 0) {
                // Exibir popup se houver etapas futuras válidas
                mostrarPopupEtapasFuturas(opLocal, etapaIndex, etapasFuturas, quantidadeInput.value);
            } else {
                // Lançar apenas a etapa atual se não houver etapas futuras válidas (Corrige BUG 1)
                lancarEtapa(opLocal, etapaIndex, quantidadeInput.value);
                loadEtapasEdit(opLocal, true);
                atualizarVisualEtapas(opLocal);
            }
        });

        quantidadeDiv.appendChild(lancarBtn);
    };

    usuarioSelect.addEventListener('change', () => {
        if (op.status === 'finalizado' || op.status === 'cancelada') return;
        etapa.usuario = usuarioSelect.value;
        saveOPChanges(op);
        quantidadeInput.disabled = !usuarioSelect.value || !isEditable || etapa.lancado;
        if (!quantidadeInput.disabled) quantidadeInput.focus();
        else {
            quantidadeInput.value = '';
            etapa.quantidade = 0;
        }
        updateLancarBtn();
        atualizarVisualEtapas(op);
        updateFinalizarButtonState(op); // Adiciona atualização do botão Finalizar
    });

    const handleInputChange = () => {
        if (etapa.lancado || !isEditable || !usuarioSelect.value) {
            quantidadeInput.value = etapa.quantidade || '';
            return;
        }
        const novaQuantidade = parseInt(quantidadeInput.value) || 0;
        etapa.quantidade = novaQuantidade;
        quantidadeInput.value = novaQuantidade > 0 ? novaQuantidade : '';
        saveOPChanges(op);
        updateLancarBtn();
        atualizarVisualEtapas(op);
    };

    quantidadeInput.addEventListener('input', handleInputChange);
    handleInputChange();
    updateLancarBtn();

    return quantidadeDiv;
}

// Função para identificar etapas futuras válidas 7
function getEtapasFuturasValidas(op, etapaIndex) {
    const produtos = obterProdutos();
    const produto = produtos.find(p => p.nome === op.produto);
    const etapasProduto = produto?.etapas || [];
    const etapasOP = op.etapas;
    const etapaAtual = etapasProduto[etapaIndex];
    const maquinaAtual = etapaAtual?.maquina || 'Não Usa';
    const tipoUsuarioAtual = getTipoUsuarioPorProcesso(etapaAtual.processo, op.produto);

    const etapasFuturas = [];
    for (let i = etapaIndex + 1; i < etapasOP.length; i++) {
        const proximaEtapa = etapasProduto[i];
        const tipoUsuarioProximo = getTipoUsuarioPorProcesso(proximaEtapa.processo, op.produto);
        const maquinaProxima = proximaEtapa?.maquina || 'Não Usa';

        if (tipoUsuarioProximo !== 'costureira' || maquinaProxima !== maquinaAtual) break;
        if (etapasOP[i].lancado) break; // Para se já foi lançada
        etapasFuturas.push({ index: i, processo: proximaEtapa.processo });
    }
    return etapasFuturas;
}


// Função para exibir o popup 8
function mostrarPopupEtapasFuturas(op, etapaIndex, etapasFuturas, quantidade) {
    const popup = document.createElement('div');
    popup.className = 'popup-etapas';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#fff';
    popup.style.padding = '20px';
    popup.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    popup.style.zIndex = '1000';

    const title = document.createElement('h3');
    title.textContent = 'Deseja preencher os próximos processos?';
    popup.appendChild(title);

    const checkboxContainer = document.createElement('div');
    const checkboxes = etapasFuturas.map((etapa, idx) => {
        const div = document.createElement('div');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `etapa-${etapa.index}`;
        checkbox.value = etapa.index;
        checkbox.checked = true; // Marcado por padrão
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = `${etapa.processo} (Etapa ${etapa.index + 1})`;
        div.appendChild(checkbox);
        div.appendChild(label);
        return { checkbox, index: etapa.index };
    });

    checkboxes.forEach(({ checkbox }) => checkboxContainer.appendChild(checkbox.parentElement));
    popup.appendChild(checkboxContainer);

    const errorMsg = document.createElement('p');
    errorMsg.style.color = 'red';
    errorMsg.style.display = 'none';
    popup.appendChild(errorMsg);

    // Novo aviso em itálico
    const skipWarning = document.createElement('p');
    skipWarning.style.color = 'red';
    skipWarning.style.fontStyle = 'italic';
    skipWarning.style.display = 'none';
    skipWarning.textContent = 'Não é permitido pular etapas. Selecione todas as etapas anteriores à desejada.';
    popup.appendChild(skipWarning);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Salvar';
    saveBtn.style.marginTop = '10px';
    saveBtn.style.backgroundColor = '#4CAF50';
    saveBtn.style.color = '#fff';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.marginTop = '10px';
    cancelBtn.style.marginLeft = '10px';
    cancelBtn.style.backgroundColor = '#f44336';
    cancelBtn.style.color = '#fff';

    popup.appendChild(saveBtn);
    popup.appendChild(cancelBtn);

    // Validação das regras
    const validateCheckboxes = () => {
        const checkedIndices = checkboxes
            .filter(cb => cb.checkbox.checked)
            .map(cb => cb.index)
            .sort((a, b) => a - b);

        // Se nenhuma etapa for selecionada, é válido (apenas a etapa atual será lançada)
        if (checkedIndices.length === 0) {
            saveBtn.disabled = false;
            saveBtn.style.backgroundColor = '#4CAF50';
            errorMsg.style.display = 'none';
            skipWarning.style.display = 'none';
            return true;
        }

        // Verificar se a primeira etapa selecionada é a próxima imediata
        const nextEtapaIndex = etapaIndex + 1;
        const minIndex = Math.min(...checkedIndices);
        const maxIndex = Math.max(...checkedIndices);
        const expectedSequence = Array.from(
            { length: maxIndex - minIndex + 1 },
            (_, i) => minIndex + i
        );

        // Verifica se há etapas puladas antes da primeira selecionada
        if (minIndex !== nextEtapaIndex) {
            skipWarning.style.display = 'block';
            errorMsg.style.display = 'none';
            saveBtn.disabled = true;
            saveBtn.style.backgroundColor = '#ccc';
            cancelBtn.style.backgroundColor = '#f44336';
            console.log(`[validateCheckboxes] Tentativa de pular etapas. Próxima etapa esperada: ${nextEtapaIndex}, selecionada: ${minIndex}`);
            return false;
        }

        // Verifica se as etapas selecionadas formam uma sequência contínua
        const isSequential = expectedSequence.every(idx => checkedIndices.includes(idx));
        if (!isSequential) {
            errorMsg.textContent = 'Não é possível pular etapas. Selecione as etapas em sequência.';
            errorMsg.style.display = 'block';
            skipWarning.style.display = 'none';
            saveBtn.disabled = true;
            saveBtn.style.backgroundColor = '#ccc';
            cancelBtn.style.backgroundColor = '#ccc';
            return false;
        }

        saveBtn.disabled = false;
        saveBtn.style.backgroundColor = '#4CAF50';
        errorMsg.style.display = 'none';
        skipWarning.style.display = 'none';
        return true;
    };

    checkboxes.forEach(({ checkbox }) => {
        checkbox.addEventListener('change', validateCheckboxes);
    });

    saveBtn.addEventListener('click', () => {
        if (!validateCheckboxes()) return;
    
        const selectedIndices = checkboxes
            .filter(cb => cb.checkbox.checked)
            .map(cb => cb.index);
    
        // Lançar a etapa atual (já foi lançada antes do popup, mas mantemos a consistência)
        lancarEtapa(op, etapaIndex, quantidade);
    
        // Propagar o usuário da etapa atual para as etapas futuras selecionadas
        const usuarioAtual = op.etapas[etapaIndex].usuario;
        selectedIndices.forEach(index => {
            op.etapas[index].usuario = usuarioAtual;
            lancarEtapa(op, index, quantidade);
        });
    
        document.body.removeChild(popup);
        loadEtapasEdit(op, true);
        atualizarVisualEtapas(op);
        updateFinalizarButtonState(op);
    });

    cancelBtn.addEventListener('click', () => {
        console.log('[cancelBtn.click] Cancelando popup e fechando');
        document.body.removeChild(popup);
        loadEtapasEdit(op, true);
        atualizarVisualEtapas(op);
        updateFinalizarButtonState(op);
    });

    document.body.appendChild(popup);
    validateCheckboxes();
}


// Mapeia processos para tipos de usuário
function getTipoUsuarioPorProcesso(processo, produtoNome) {
    const produtos = obterProdutos();
    const produto = produtos.find(p => p.nome === produtoNome);
    if (produto && produto.etapas) {
        const etapa = produto.etapas.find(e => e.processo === processo);
        return etapa ? etapa.feitoPor : '';
    }
    return '';
}


function determinarEtapaAtual(op) {
    const produtos = obterProdutos();
    const produto = produtos.find(p => p.nome === op.produto);
    const etapas = produto?.etapas || [];

    const etapaAtualIndex = op.etapas.findIndex((etapa, index) => {
        const tipoUsuario = getTipoUsuarioPorProcesso(etapa.processo, op.produto);
        const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
        return exigeQuantidade ? !etapa.lancado : !etapa.usuario;
    });
    console.log(`[determinarEtapaAtual] Etapa atual index: ${etapaAtualIndex}, etapas:`, op.etapas);
    return etapaAtualIndex === -1 ? op.etapas.length : etapaAtualIndex;
}

function atualizarVisualEtapas(op) {
    if (!op || !op.etapas) return;

    const etapasRows = document.querySelectorAll('.etapa-row');
    const etapaAtualIndex = determinarEtapaAtual(op);

    etapasRows.forEach((row, index) => {
        const numero = row.querySelector('.etapa-numero');
        const usuarioSelect = row.querySelector('.select-usuario');
        const quantidadeDiv = row.querySelector('.quantidade-lancar');
        const etapa = op.etapas[index];
        const tipoUsuario = getTipoUsuarioPorProcesso(etapa.processo, op.produto);
        const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
        const concluida = exigeQuantidade ? etapa.lancado : etapa.usuario;

        numero.classList.remove('etapa-cinza', 'etapa-verde', 'etapa-azul');
        if (index < etapaAtualIndex || concluida) {
            numero.classList.add('etapa-azul');
        } else if (index === etapaAtualIndex && op.status !== 'finalizado' && op.status !== 'cancelada') {
            numero.classList.add('etapa-verde');
        } else {
            numero.classList.add('etapa-cinza');
        }

        if (concluida && (op.status === 'finalizado' || op.status === 'cancelada' || etapa.lancado)) {
            usuarioSelect.disabled = true;
            if (quantidadeDiv) {
                const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
                const botaoLancar = quantidadeDiv.querySelector('.botao-lancar');
                quantidadeInput.disabled = true;
                botaoLancar.disabled = true;
                botaoLancar.textContent = 'Lançado';
                botaoLancar.classList.add('lancado');
            }
        } else if (index === etapaAtualIndex && op.status !== 'finalizado' && op.status !== 'cancelada') {
            usuarioSelect.disabled = false;
            if (quantidadeDiv) {
                const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
                const botaoLancar = quantidadeDiv.querySelector('.botao-lancar');
                quantidadeInput.disabled = !usuarioSelect.value || etapa.lancado;
                botaoLancar.disabled = !usuarioSelect.value || etapa.quantidade <= 0;
                botaoLancar.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
                if (etapa.lancado) botaoLancar.classList.add('lancado');
            }
        } else {
            usuarioSelect.disabled = true;
            if (quantidadeDiv) {
                const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
                const botaoLancar = quantidadeDiv.querySelector('.botao-lancar');
                quantidadeInput.disabled = true;
                botaoLancar.disabled = true;
                botaoLancar.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
                if (etapa.lancado) botaoLancar.classList.add('lancado');
            }
        }
    });

    if (op.status !== 'finalizado' && op.status !== 'cancelada') {
        op.status = op.etapas.some(e => e.usuario || e.quantidade) ? 'produzindo' : 'em-aberto';
        saveOPChanges(op);
    }
}


function verificarEtapasEStatus(op) {
    const todasEtapasCompletas = op.etapas.every((etapa) => {
        const tipoUsuario = getTipoUsuarioPorProcesso(etapa.processo, op.produto);
        const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
        return etapa.usuario && (!exigeQuantidade || (etapa.lancado && etapa.quantidade > 0));
    });

    if (op.status === 'finalizado' && !todasEtapasCompletas) {
        op.status = 'produzindo';
        saveOPChanges(op);
    }

    return todasEtapasCompletas;
}

// Função para alternar entre os modos de visualização
function toggleView() {
    const hash = window.location.hash;

    const opListView = document.getElementById('opListView');
    const opFormView = document.getElementById('opFormView');
    const opEditView = document.getElementById('opEditView');

    if (!opListView || !opFormView || !opEditView) {
        console.log('[toggleView] Elementos DOM principais não encontrados');
        return;
    }

    let ordensDeProducaoLocal = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
    if (!Array.isArray(ordensDeProducaoLocal)) {
        console.error('[toggleView] Dados de ordensDeProducao corrompidos no localStorage');
        ordensDeProducaoLocal = [];
        localStorage.setItem('ordensDeProducao', JSON.stringify([]));
    }

    if (hash.startsWith('#editar/')&& permissoes.includes('editar-op')) {
        const editId = hash.split('/')[1];
        const op = ordensDeProducaoLocal.find(o => o.editId === editId);

        if (!op) {
            console.error(`[toggleView] Ordem de Produção não encontrada para editId: ${editId}`);
            alert('Ordem de Produção não encontrada.');
            window.location.hash = '';
            return;
        }

        console.log('[toggleView] Editando OP:', op.numero);
        document.getElementById('editProdutoOP').value = op.produto || '';
        const editQuantidadeInput = document.getElementById('editQuantidadeOP');
        editQuantidadeInput.value = op.quantidade || '';
        editQuantidadeInput.disabled = true;
        editQuantidadeInput.style.backgroundColor = '#d3d3d3';
        document.getElementById('editDataEntregaOP').value = op.dataEntrega || '';
        if (op.variante) {
            document.getElementById('editVarianteContainer').style.display = 'block';
            document.getElementById('editVarianteOP').value = op.variante || '';
        } else {
            document.getElementById('editVarianteContainer').style.display = 'none';
        }

        opListView.style.display = 'none';
        opFormView.style.display = 'none';
        opEditView.style.display = 'block';
        document.getElementById('opNumero').textContent = `OP n°: ${op.numero}`;

        loadEtapasEdit(op);
        setTimeout(() => {
            atualizarVisualEtapas(op);
            updateFinalizarButtonState(op);
            const etapasContainer = document.getElementById('etapasContainer');
            if (etapasContainer) {
                const etapa2Row = etapasContainer.querySelector('.etapa-row[data-index="1"]');
                if (etapa2Row) {
                    const quantidadeDiv = etapa2Row.querySelector('.quantidade-lancar');
                    if (quantidadeDiv) {
                        quantidadeDiv.style.display = 'flex';
                        const lancarBtn = quantidadeDiv.querySelector('.botao-lancar');
                        lancarBtn.style.display = 'inline-block';
                        lancarBtn.style.visibility = 'visible';
                        console.log('[toggleView] Forçando visibilidade do botão Lançar na etapa 2');
                    }
                }
            }
            console.log('[toggleView] Etapas recarregadas e DOM atualizado para OP:', op.numero);
        }, 100); // Aumentado para garantir sincronia
    } else if (hash === '#editar') {
        window.location.hash = '';
        toggleView();
    } else if (hash === '#adicionar' && permissoes.includes('criar-op')) {
        opListView.style.display = 'none';
        opFormView.style.display = 'block';
        opEditView.style.display = 'none';
        loadProdutosSelect();
        setCurrentDate();
        loadVariantesSelects('');
        document.getElementById('numeroOP').value = getNextOPNumber();
        document.getElementById('quantidadeOP').value = '';
        const quantidadeInput = document.getElementById('quantidadeOP');
        if (quantidadeInput) {
            quantidadeInput.disabled = false;
            quantidadeInput.style.backgroundColor = '';
        }
        document.getElementById('observacoesOP').value = '';
        const produtoSelect = document.getElementById('produtoOP');
        if (produtoSelect) {
            produtoSelect.value = '';
            loadVariantesSelects('');
        }
    } else {
        loadOPTable();
        opListView.style.display = 'block';
        opFormView.style.display = 'none';
        opEditView.style.display = 'none';
        const todasBtn = statusFilter.querySelector('[data-status="todas"]');
        if (todasBtn) {
            statusFilter.querySelectorAll('.status-btn').forEach(btn => btn.classList.remove('active'));
            todasBtn.classList.add('active');
        }
    }
}

// Eventos

    // Delegação de eventos no container de etapas
    document.addEventListener('DOMContentLoaded', () => {
        // Verifica autenticação
    if (!auth) {
        return; // Redireciona se não autenticado
    }
        console.log('Inicializando ordens-de-producao para usuário:', usuarioLogado.nome, 'Permissões:', permissoes);
        console.log('[DOMContentLoaded] Página carregada, inicializando toggleView');
    // Ocultar o botão "Incluir OP" se o usuário não tiver a permissão criar-op
    const incluirOpBtn = document.getElementById('btnIncluirOP'); // Ajuste o ID conforme o seu HTML
    if (incluirOpBtn && !permissoes.includes('criar-op')) {
        incluirOpBtn.disabled = true; // Desabilita o botão
        incluirOpBtn.classList.add('disabled'); // Adiciona uma classe para estilização
    }

        toggleView();
        loadOPTable();

        window.addEventListener('hashchange', () => {
            console.log('[hashchange] Hash alterado para:', window.location.hash);
            toggleView();
            const incluirOPBtn = document.getElementById('incluirOP');
            if (incluirOPBtn) {
                incluirOPBtn.disabled = !permissoes.includes('criar-op');
                if (!permissoes.includes('criar-op')) {
                    incluirOPBtn.style.opacity = '0.5';
                    incluirOPBtn.style.cursor = 'not-allowed';
                }
            }
        
            // Desabilitar edição em etapas para usuários sem permissão
        if (!permissoes.includes('editar-op')) {
            document.querySelectorAll('input, select, button.botao-lancar, button.finalizarOP').forEach(el => {
                el.disabled = true;
                el.style.opacity = '0.5';
                el.style.cursor = 'not-allowed';
            });
            }
        
            window.addEventListener('hashchange', toggleView);


        });
    
    const debugReloadBtn = document.getElementById('debugReload');
    if (debugReloadBtn) {
        debugReloadBtn.addEventListener('click', () => {
            const editId = window.location.hash.split('/')[1];
            const ordensDeProducao = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
            const op = ordensDeProducao.find(o => o.editId === editId);
            if (op) {
                loadEtapasEdit(op);
                atualizarVisualEtapas(op);
                console.log('[debugReload] Etapas recarregadas manualmente');
            }
        });
    }

    const voltarBtn = document.getElementById('voltarOP');
    if (voltarBtn) {
        voltarBtn.addEventListener('click', () => {
            window.location.hash = '';
        });
    }

    const opForm = document.getElementById('opForm');
    if (opForm) {
        opForm.addEventListener('submit', (e) => {
            e.preventDefault();
        
            const numero = document.getElementById('numeroOP').value.trim();
            const produto = document.getElementById('produtoOP').value;
            const quantidade = parseInt(document.getElementById('quantidadeOP').value) || 0;
            const dataEntrega = document.getElementById('dataEntregaOP').value;
            const observacoes = document.getElementById('observacoesOP').value.trim();
            const variantesSelects = document.querySelectorAll('.variantes-selects select');
            const varianteValues = Array.from(variantesSelects).map(select => select.value);
            const variante = varianteValues.length > 0 ? varianteValues.join(' | ') : '';
        
            if (!produto || !quantidade || !dataEntrega) {
                alert('Preencha todos os campos obrigatórios!');
                return;
            }
            if (variantesSelects.length > 0 && varianteValues.some(v => !v)) {
                alert('Por favor, preencha todas as variações.');
                return;
            }
        
            let ordensDeProducaoLocal = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
            if (ordensDeProducaoLocal.some(op => op.numero === numero)) {
                alert(`Erro: Já existe uma Ordem de Produção com o número ${numero}!`);
                return;
            }
        
            const produtos = obterProdutos();
            const produtoObj = produtos.find(p => p.nome === produto);
            const etapas = produtoObj?.etapas || [];
        
            const novaOP = {
                numero,
                produto,
                variante: variante || null,
                quantidade,
                dataEntrega,
                observacoes,
                status: 'em-aberto',
                editId: Date.now().toString(),
                etapas: etapas.map(etapa => ({
                    processo: etapa.processo,
                    usuario: '',
                    quantidade: '',
                    lancado: false,
                    ultimoLancamentoId: null
                }))
            };
        
            ordensDeProducaoLocal.push(novaOP);
            localStorage.setItem('ordensDeProducao', JSON.stringify(ordensDeProducaoLocal));
            ordensDeProducao = ordensDeProducaoLocal;
            alert(`Ordem de Produção #${novaOP.numero} salva com sucesso!`);
        
            const quantidadeInput = document.getElementById('quantidadeOP');
            if (quantidadeInput) {
                quantidadeInput.disabled = true;
                quantidadeInput.style.backgroundColor = '#d3d3d3';
            }
        
            loadOPTable();
            toggleView();
            window.location.hash = '';
        });
    }

    const produtoSelect = document.getElementById('produtoOP');
    if (produtoSelect) {
        produtoSelect.addEventListener('change', (e) => {
            loadVariantesSelects(e.target.value);
        });
    }

    document.getElementById('editQuantidadeOP').addEventListener('input', () => {
        const editId = window.location.hash.split('/')[1];
        let ordensDeProducaoLocal = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
        const op = ordensDeProducaoLocal.find(o => o.editId === editId);
        if (op) {
            op.quantidade = parseInt(document.getElementById('editQuantidadeOP').value) || 0;
            saveOPChanges(op);
            ordensDeProducao = ordensDeProducaoLocal; // Sincroniza
            updateFinalizarButtonState(op);
        }
    });

    document.getElementById('editDataEntregaOP').addEventListener('change', () => {
        const editId = window.location.hash.split('/')[1];
        let ordensDeProducaoLocal = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
        const op = ordensDeProducaoLocal.find(o => o.editId === editId);
        if (op) {
            op.dataEntrega = document.getElementById('editDataEntregaOP').value;
            saveOPChanges(op);
            ordensDeProducao = ordensDeProducaoLocal; // Sincroniza
            updateFinalizarButtonState(op);
        }
    });
});

// Finaliza a OP
finalizarOP.addEventListener('click', () => {
    const editId = window.location.hash.split('/')[1];
    let ordensDeProducaoLocal = JSON.parse(localStorage.getItem('ordensDeProducao')) || [];
    const op = ordensDeProducaoLocal.find(o => o.editId === editId);
    if (op && !finalizarOP.disabled) {
        op.status = 'finalizado';
        op.dataFinal = new Date().toISOString();
        saveOPChanges(op);
        ordensDeProducao = ordensDeProducaoLocal; // Sincroniza a variável global
        alert(`Ordem de Produção #${op.numero} finalizada com sucesso!`);
        window.location.hash = '';
        loadOPTable(); // Recarrega a tabela para refletir o novo status
        toggleView(); // Garante que a visualização volte para a lista
    } else {
        console.log('[finalizarOP.click] Botão desabilitado ou OP não encontrada');
    }
});

// Evento para o botão Cancelar
cancelarOP.addEventListener('click', () => {
    const editId = window.location.hash.split('/')[1];
    const op = ordensDeProducao.find(o => o.editId === editId);
    if (op) {
        if (op.status === 'cancelada') {
            alert(`Erro: A Ordem de Produção #${op.numero} já está cancelada!`);
            return;
        }
        if (confirm(`Tem certeza que deseja cancelar a Ordem de Produção #${op.numero}? Esta ação não pode ser desfeita.`)) {
            op.status = 'cancelada';
            saveOPChanges(op);
            alert(`Ordem de Produção #${op.numero} cancelada com sucesso!`);
            window.location.hash = '';
        }
    }
});

// Evento para o botão Voltar
voltarOP.addEventListener('click', () => {
    window.location.hash = '';
    loadOPTable();
    toggleView();

    const todasBtn = statusFilter.querySelector('[data-status="todas"]');
    if (todasBtn) {
        statusFilter.querySelectorAll('.status-btn').forEach(btn => btn.classList.remove('active'));
        todasBtn.classList.add('active');
        loadOPTable('todas', searchOP.value);
    }
});

// Eventos adicionais
produtoOP.addEventListener('change', (e) => loadVariantesSelects(e.target.value));
searchOP.addEventListener('input', () => filterOPs());
