import { verificarAutenticacao } from '/js/utils/auth.js';
import { PRODUTOS, PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';

// Cache para produtos
let produtosCache = null;

// Conjunto para rastrear IDs únicos
const usedIds = new Set();

// Função para buscar produtos da API
async function obterProdutos() {
  if (produtosCache) {
    console.log('[obterProdutos] Retornando produtos do cache');
    return produtosCache;
  }

  const token = localStorage.getItem('token');
  const response = await fetch('/api/produtos', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Erro ao carregar produtos');
  produtosCache = await response.json();
  console.log('[obterProdutos] Produtos buscados e armazenados no cache:', produtosCache);
  return produtosCache;
}

// Funções para interagir com a API de ordens de produção
async function obterOrdensDeProducao() {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/ordens-de-producao', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Erro ao carregar ordens de produção');
  return await response.json();
}

async function salvarOrdemDeProducao(ordem) {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/ordens-de-producao', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ordem),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao salvar ordem de produção: ${error.error}`);
  }
  return await response.json();
}

async function atualizarOrdemDeProducao(ordem) {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/ordens-de-producao', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ordem),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao atualizar ordem de produção: ${error.error}`);
  }
  return await response.json();
}

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
async function loadProdutosSelect() {
  const produtoSelect = document.getElementById('produtoOP');
  if (!produtoSelect) return;

  produtoSelect.innerHTML = '<option value="">Selecione um produto</option>';
  const produtos = await obterProdutos();
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
async function loadVariantesSelects(produtoNome) {
  const variantesContainer = document.getElementById('variantesContainer');
  const variantesSelects = document.querySelector('.variantes-selects');
  if (!variantesContainer || !variantesSelects) return;

  variantesSelects.innerHTML = '';
  if (!produtoNome) {
    variantesContainer.style.display = 'none';
    return;
  }

  const produtos = await obterProdutos();
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
async function getNextOPNumber() {
  const ordens = await obterOrdensDeProducao();
  const numeros = ordens.map(op => parseInt(op.numero)).filter(n => !isNaN(n));
  const maxNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
  const nextNumero = (maxNumero + 1).toString();
  console.log('[getNextOPNumber] Próximo número de OP:', nextNumero);
  return nextNumero;
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
async function loadOPTable(filterStatus = 'todas', search = '') {
  const opTableBody = document.getElementById('opTableBody');
  opTableBody.innerHTML = ''; // Garante que a tabela seja limpa antes de renderizar

  const ordensDeProducao = await obterOrdensDeProducao();
  console.log('[loadOPTable] Ordens de produção carregadas:', ordensDeProducao);

  // Remover duplicatas com base no número da OP (garantia extra no frontend)
  const ordensUnicas = [];
  const numerosVistos = new Set();
  ordensDeProducao.forEach(op => {
    if (!numerosVistos.has(op.numero)) {
      numerosVistos.add(op.numero);
      ordensUnicas.push(op);
    }
  });

  let filteredOPs = ordensUnicas;
  if (filterStatus === 'todas') {
    filteredOPs = ordensUnicas.filter(op => op.status !== 'cancelada' && op.status !== 'finalizado');
  } else {
    filteredOPs = ordensUnicas.filter(op => op.status === filterStatus);
  }

  filteredOPs = filteredOPs.filter(op => 
    op.produto.toLowerCase().includes(search.toLowerCase()) || 
    op.numero.toString().includes(search) ||
    (op.variante && op.variante.toLowerCase().includes(search.toLowerCase()))
  );

  filteredOPs.forEach((op, index) => {
    if (!op.edit_id) {
      op.edit_id = generateUniqueId();
      usedIds.add(op.edit_id); // Adiciona ao conjunto de IDs usados
    }
    const tr = document.createElement('tr');
    tr.dataset.index = index;
    tr.dataset.numero = op.numero; // Adiciona o número da OP como identificador
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
        window.location.hash = `#editar/${op.edit_id}`;
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
const statusFilter = document.getElementById('statusFilter');
if (statusFilter) {
  statusFilter.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      statusFilter.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterOPs();
    });
  });
}

async function updateFinalizarButtonState(op) {
  const finalizarBtn = document.getElementById('finalizarOP');
  if (!finalizarBtn || !op) return;

  // Validar campos principais
  const editProduto = document.getElementById('editProdutoOP')?.value || op.produto;
  const editQuantidade = parseInt(document.getElementById('editQuantidadeOP')?.value) || op.quantidade || 0;
  const editDataEntrega = document.getElementById('editDataEntregaOP')?.value || op.data_entrega;
  const editVariante = document.getElementById('editVarianteOP')?.value || op.variante;

  const camposPrincipaisPreenchidos = editProduto && editQuantidade > 0 && editDataEntrega && (op.variante ? editVariante : true);

  // Validar todas as etapas
  let todasEtapasCompletas = true;
  if (op.etapas && op.etapas.length > 0) {
    for (const etapa of op.etapas) {
      const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
      const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
      const etapaCompleta = etapa.usuario && (!exigeQuantidade || (etapa.lancado && etapa.quantidade > 0));
      if (!etapaCompleta) {
        todasEtapasCompletas = false;
        break;
      }
    }
  } else {
    todasEtapasCompletas = false;
  }

  const podeFinalizar = camposPrincipaisPreenchidos && todasEtapasCompletas && op.status !== 'finalizado' && op.status !== 'cancelada';
  finalizarBtn.disabled = !podeFinalizar;
  finalizarBtn.style.backgroundColor = podeFinalizar ? '#4CAF50' : '#ccc';
}

// Salva alterações na OP
async function saveOPChanges(op) {
  await atualizarOrdemDeProducao(op);
  console.log(`[saveOPChanges] Ordem de Produção #${op.numero} atualizada no banco de dados`);
}


async function loadEtapasEdit(op, skipReload = false) {
  console.log(`[loadEtapasEdit] Iniciando carregamento das etapas para OP: ${op ? op.numero : 'undefined'}`);
  const etapasContainer = document.getElementById('etapasContainer');
  const finalizarBtn = document.getElementById('finalizarOP');

  if (!op || !op.etapas) {
    console.error('[loadEtapasEdit] OP ou etapas não encontradas:', op);
    return;
  }

  const todasEtapasCompletas = await verificarEtapasEStatus(op);
  if (op.status === 'finalizado' && !todasEtapasCompletas) {
    op.status = 'produzindo';
    await saveOPChanges(op);
    console.log(`[loadEtapasEdit] OP ${op.numero} ajustada para "produzindo" porque nem todas as etapas estão completas.`);
  }

  if (!skipReload) {
    etapasContainer.innerHTML = '';
  }

  const responseUsuarios = await fetch('/api/usuarios', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
  });
  const usuarios = await responseUsuarios.json();

  const tiposUsuarios = await Promise.all(
    op.etapas.map(async (etapa) => ({
      processo: etapa.processo,
      tipoUsuario: await getTipoUsuarioPorProcesso(etapa.processo, op.produto),
    }))
  );

  const etapaAtualIndex = await determinarEtapaAtual(op);
  console.log(`[loadEtapasEdit] Etapa atual index calculada: ${etapaAtualIndex}`);

  for (let index = 0; index < op.etapas.length; index++) {
    const etapa = op.etapas[index];
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
    usuarioSelect.disabled = op.status === 'finalizado' || op.status === 'cancelada' || index > etapaAtualIndex;

    const tipoUsuario = tiposUsuarios[index].tipoUsuario;
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = getUsuarioPlaceholder(tipoUsuario);
    usuarioSelect.appendChild(defaultOption);

    const usuariosFiltrados = usuarios.filter(u => {
      const tipos = Array.isArray(u.tipos) ? u.tipos : [u.tipos];
      return tipos.includes(tipoUsuario);
    });

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

    if (exigeQuantidade && (etapa.usuario || usuarioSelect.value)) {
      quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, index === etapaAtualIndex, row);
      row.appendChild(quantidadeDiv);
    }

    if (etapa.processo === 'Corte' && !etapa.usuario && index === etapaAtualIndex) {
      const definirBtn = document.createElement('button');
      definirBtn.className = 'botao-definir';
      definirBtn.textContent = 'Definir';
      definirBtn.disabled = !usuarioSelect.value;
      row.appendChild(definirBtn);

      usuarioSelect.addEventListener('change', () => {
        definirBtn.disabled = !usuarioSelect.value;
      });

      definirBtn.addEventListener('click', async () => {
        if (!usuarioSelect.value) {
          alert('Por favor, selecione um cortador antes de definir.');
          return;
        }
        etapa.usuario = usuarioSelect.value;
        await saveOPChanges(op);
        await loadEtapasEdit(op, true);
        await atualizarVisualEtapas(op);
        await updateFinalizarButtonState(op);
      });
    } else {
      usuarioSelect.addEventListener('change', async () => {
        if (op.status === 'finalizado' || op.status === 'cancelada') return;
        etapa.usuario = usuarioSelect.value;
        await saveOPChanges(op);
        if (exigeQuantidade && etapa.usuario && !row.querySelector('.quantidade-lancar')) {
          quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, index === etapaAtualIndex, row);
          row.appendChild(quantidadeDiv);
        }
        await atualizarVisualEtapas(op);
        await updateFinalizarButtonState(op);
      });
    }
  }

  await atualizarVisualEtapas(op);
  await updateFinalizarButtonState(op);
}


// Função para salvar produção
async function salvarProducao(op, etapa, etapaIndex) {
  // Buscar o produto para obter a máquina associada ao processo
  const produtos = await obterProdutos();
  const produto = produtos.find(p => p.nome === op.produto);
  if (!produto) {
    throw new Error(`Produto ${op.produto} não encontrado.`);
  }

  // Verificar se o produto é um kit
  const isKit = produto.tipos && produto.tipos.includes('kits');
  if (isKit) {
    throw new Error(`O produto ${op.produto} é um kit e não possui etapas de produção.`);
  }

  // Buscar a etapa correspondente no produto
  const etapaProduto = produto.etapas?.[etapaIndex];
  if (!etapaProduto) {
    throw new Error(`Etapa ${etapaIndex} não encontrada para o produto ${op.produto}.`);
  }

  // Verificar se o processo da etapa corresponde ao processo esperado
  if (etapaProduto.processo !== etapa.processo) {
    throw new Error(`Processo ${etapa.processo} não corresponde à etapa ${etapaIndex} do produto ${op.produto}.`);
  }

  // Obter a máquina associada à etapa
  const maquina = etapaProduto.maquina;
  if (!maquina) {
    throw new Error(`Máquina não definida para o processo ${etapa.processo} do produto ${op.produto}.`);
  }

  // Obter a variação da OP
  const variacao = op.variante;
  if (!variacao) {
    throw new Error(`Variação não definida para a OP ${op.numero}.`);
  }

  // Montar os dados para a requisição
  const dados = {
    opNumero: op.numero,
    etapaIndex: etapaIndex,
    processo: etapa.processo,
    produto: op.produto,
    variacao: variacao,
    maquina: maquina,
    quantidade: parseInt(etapa.quantidade),
    funcionario: etapa.usuario,
    data: new Date().toISOString(),
    lancadoPor: usuarioLogado?.nome || 'Sistema',
  };

  // Validação dos campos obrigatórios
  if (!dados.opNumero) throw new Error('Número da OP não informado.');
  if (dados.etapaIndex === undefined || dados.etapaIndex === null) throw new Error('Índice da etapa não informado.');
  if (!dados.processo) throw new Error('Processo não informado.');
  if (!dados.produto) throw new Error('Produto não informado.');
  if (!dados.variacao) throw new Error('Variação não informada.');
  if (!dados.maquina) throw new Error('Máquina não informada.');
  if (!dados.quantidade || dados.quantidade <= 0) throw new Error('Quantidade inválida.');
  if (!dados.funcionario) throw new Error('Funcionário não informado.');
  if (!dados.data) throw new Error('Data não informada.');
  if (!dados.lancadoPor) throw new Error('Usuário lançador não identificado.');

  console.log('[salvarProducao] Enviando dados para /api/producoes:', dados);

  try {
    const responseProducoes = await fetch('/api/producoes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dados),
    });

    if (!responseProducoes.ok) {
      const error = await responseProducoes.json();
      if (error.details === 'jwt expired') {
        alert('Sua sessão expirou. Por favor, faça login novamente.');
        localStorage.removeItem('token');
        localStorage.removeItem('usuarioLogado');
        window.location.href = '/login.html';
        return;
      }
      throw new Error(`Erro ao salvar produção: ${error.error}`);
    }

    const producao = await responseProducoes.json();
    return producao.id;
  } catch (error) {
    console.error('[salvarProducao] Erro:', error);
    throw error;
  }
}

// Função para lançar etapa
async function lancarEtapa(op, etapaIndex, quantidade) {
  const etapa = op.etapas[etapaIndex];
  etapa.quantidade = parseInt(quantidade);
  etapa.ultimoLancamentoId = await salvarProducao(op, etapa, etapaIndex);
  etapa.lancado = true;
  await saveOPChanges(op);
  await updateFinalizarButtonState(op);
}

// Função auxiliar para criar a linha de quantidade e botão "Lançar"
function criarQuantidadeDiv(etapa, op, usuarioSelect, isEditable, row) {
  let quantidadeDiv = row.querySelector('.quantidade-lancar');
  if (!quantidadeDiv) { // Corrigido o erro de sintaxe
    quantidadeDiv = document.createElement('div');
    quantidadeDiv.className = 'quantidade-lancar';
    quantidadeDiv.style.display = 'flex';
    quantidadeDiv.style.alignItems = 'center';
    row.appendChild(quantidadeDiv); // Garantir que o elemento seja adicionado ao DOM
  } else {
    quantidadeDiv.innerHTML = ''; // Limpar o conteúdo, mas manter o elemento
  }

  const quantidadeInput = document.createElement('input');
  quantidadeInput.type = 'number';
  quantidadeInput.min = '1';
  quantidadeInput.value = etapa.quantidade || '';
  quantidadeInput.placeholder = 'Qtde';
  quantidadeInput.className = 'quantidade-input';
  quantidadeInput.disabled = !isEditable || etapa.lancado || !usuarioSelect.value;

  let lancarBtn = document.createElement('button');
  lancarBtn.className = 'botao-lancar';
  lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
  lancarBtn.disabled = !usuarioSelect.value || !quantidadeInput.value || parseInt(quantidadeInput.value) <= 0 || !isEditable || etapa.lancado;
  lancarBtn.dataset.etapaIndex = op.etapas.indexOf(etapa);

  quantidadeDiv.appendChild(quantidadeInput);
  quantidadeDiv.appendChild(lancarBtn);

  const updateLancarBtn = () => {
    const oldBtn = quantidadeDiv.querySelector('.botao-lancar');
    if (oldBtn) oldBtn.remove();

    lancarBtn = document.createElement('button');
    lancarBtn.className = 'botao-lancar';
    lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
    lancarBtn.disabled = !usuarioSelect.value || !quantidadeInput.value || parseInt(quantidadeInput.value) <= 0 || !isEditable || etapa.lancado;
    lancarBtn.dataset.etapaIndex = op.etapas.indexOf(etapa);

    lancarBtn.addEventListener('click', async () => {
      if (lancarBtn.disabled) return;

      const etapaIndex = parseInt(lancarBtn.dataset.etapaIndex);
      const editId = window.location.hash.split('/')[1];
      const ordensDeProducao = await obterOrdensDeProducao();
      const opLocal = ordensDeProducao.find(o => o.edit_id === editId);

      if (!opLocal || !opLocal.etapas[etapaIndex]) {
        alert('Erro: Ordem de Produção ou etapa não encontrada.');
        return;
      }

      const etapasFuturas = await getEtapasFuturasValidas(opLocal, etapaIndex);
      if (etapasFuturas.length > 0) {
        mostrarPopupEtapasFuturas(opLocal, etapaIndex, etapasFuturas, quantidadeInput.value);
      } else {
        await lancarEtapa(opLocal, etapaIndex, quantidadeInput.value);
        etapa.lancado = true; // Garantir que o estado seja atualizado
        etapa.quantidade = parseInt(quantidadeInput.value); // Garantir que a quantidade seja salva
        await saveOPChanges(opLocal);
        quantidadeInput.disabled = true; // Desabilitar o input após o lançamento
        lancarBtn.textContent = 'Lançado'; // Mudar o texto do botão
        lancarBtn.disabled = true; // Desabilitar o botão
        lancarBtn.classList.add('lancado'); // Adicionar classe para estilização (se necessário)
        await loadEtapasEdit(opLocal, true);
        await atualizarVisualEtapas(opLocal);
        await updateFinalizarButtonState(opLocal);
      }
    });

    quantidadeDiv.appendChild(lancarBtn);
  };

  usuarioSelect.addEventListener('change', async () => {
    if (op.status === 'finalizado' || op.status === 'cancelada') return;
    etapa.usuario = usuarioSelect.value;
    await saveOPChanges(op);
    quantidadeInput.disabled = !usuarioSelect.value || !isEditable || etapa.lancado;
    if (!quantidadeInput.disabled) quantidadeInput.focus();
    else {
      quantidadeInput.value = etapa.quantidade || '';
    }
    updateLancarBtn();
    await atualizarVisualEtapas(op);
    await updateFinalizarButtonState(op);
  });

  const handleInputChange = async () => {
    if (etapa.lancado || !isEditable || !usuarioSelect.value) {
      quantidadeInput.value = etapa.quantidade || '';
      return;
    }
    const novaQuantidade = parseInt(quantidadeInput.value) || 0;
    etapa.quantidade = novaQuantidade;
    quantidadeInput.value = novaQuantidade > 0 ? novaQuantidade : '';
    await saveOPChanges(op);
    updateLancarBtn();
    await atualizarVisualEtapas(op);
  };

  quantidadeInput.addEventListener('input', handleInputChange);
  handleInputChange();
  updateLancarBtn();

  return quantidadeDiv;
}

// Função para identificar etapas futuras válidas
async function getEtapasFuturasValidas(op, etapaIndex) {
  const produtos = await obterProdutos();
  const produto = produtos.find(p => p.nome === op.produto);
  const etapasProduto = produto?.etapas || [];
  const etapasOP = op.etapas;
  const etapaAtual = etapasProduto[etapaIndex];
  const maquinaAtual = etapaAtual?.maquina || 'Não Usa';
  const tipoUsuarioAtual = await getTipoUsuarioPorProcesso(etapaAtual.processo, op.produto);

  const etapasFuturas = [];
  for (let i = etapaIndex + 1; i < etapasOP.length; i++) {
    const proximaEtapa = etapasProduto[i];
    const tipoUsuarioProximo = await getTipoUsuarioPorProcesso(proximaEtapa.processo, op.produto);
    const maquinaProxima = proximaEtapa?.maquina || 'Não Usa';

    if (tipoUsuarioProximo !== 'costureira' || maquinaProxima !== maquinaAtual) break;
    if (etapasOP[i].lancado) break;
    etapasFuturas.push({ index: i, processo: proximaEtapa.processo });
  }
  return etapasFuturas;
}

// Função para exibir o popup
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
    checkbox.checked = true;
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

  const validateCheckboxes = () => {
    const checkedIndices = checkboxes
      .filter(cb => cb.checkbox.checked)
      .map(cb => cb.index)
      .sort((a, b) => a - b);

    if (checkedIndices.length === 0) {
      saveBtn.disabled = false;
      saveBtn.style.backgroundColor = '#4CAF50';
      errorMsg.style.display = 'none';
      skipWarning.style.display = 'none';
      return true;
    }

    const nextEtapaIndex = etapaIndex + 1;
    const minIndex = Math.min(...checkedIndices);
    const maxIndex = Math.max(...checkedIndices);
    const expectedSequence = Array.from(
      { length: maxIndex - minIndex + 1 },
      (_, i) => minIndex + i
    );

    if (minIndex !== nextEtapaIndex) {
      skipWarning.style.display = 'block';
      errorMsg.style.display = 'none';
      saveBtn.disabled = true;
      saveBtn.style.backgroundColor = '#ccc';
      return false;
    }

    const isSequential = expectedSequence.every(idx => checkedIndices.includes(idx));
    if (!isSequential) {
      errorMsg.textContent = 'Não é possível pular etapas. Selecione as etapas em sequência.';
      errorMsg.style.display = 'block';
      skipWarning.style.display = 'none';
      saveBtn.disabled = true;
      saveBtn.style.backgroundColor = '#ccc';
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

  saveBtn.addEventListener('click', async () => {
    if (!validateCheckboxes()) return;

    const selectedIndices = checkboxes
      .filter(cb => cb.checkbox.checked)
      .map(cb => cb.index);

    await lancarEtapa(op, etapaIndex, quantidade);
    const usuarioAtual = op.etapas[etapaIndex].usuario;
    for (const index of selectedIndices) {
      op.etapas[index].usuario = usuarioAtual;
      await lancarEtapa(op, index, quantidade);
    }

    document.body.removeChild(popup);
    loadEtapasEdit(op, true);
    atualizarVisualEtapas(op);
    await updateFinalizarButtonState(op);
  });

  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(popup);
    loadEtapasEdit(op, true);
    atualizarVisualEtapas(op);
    updateFinalizarButtonState(op);
  });

  document.body.appendChild(popup);
  validateCheckboxes();
}

// Mapeia processos para tipos de usuário
async function getTipoUsuarioPorProcesso(processo, produtoNome) {
  const produtos = await obterProdutos(); // Agora usa o cache
  const produto = produtos.find(p => p.nome === produtoNome);
  if (produto && produto.etapas) {
    const etapa = produto.etapas.find(e => e.processo === processo);
    return etapa ? etapa.feitoPor : '';
  }
  return '';
}

async function determinarEtapaAtual(op) {
  for (let index = 0; index < op.etapas.length; index++) {
    const etapa = op.etapas[index];
    const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
    const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
    if (exigeQuantidade ? !etapa.lancado : !etapa.usuario) {
      return index;
    }
  }
  return op.etapas.length;
}

async function atualizarVisualEtapas(op) {
  if (!op || !op.etapas) return;

  const etapasRows = document.querySelectorAll('.etapa-row');
  const etapaAtualIndex = await determinarEtapaAtual(op);

  for (let index = 0; index < etapasRows.length; index++) {
    const row = etapasRows[index];
    const numero = row.querySelector('.etapa-numero');
    const usuarioSelect = row.querySelector('.select-usuario');
    let quantidadeDiv = row.querySelector('.quantidade-lancar');
    const etapa = op.etapas[index];
    const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
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

    if (concluida || op.status === 'finalizado' || op.status === 'cancelada') {
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
        botaoLancar.disabled = !usuarioSelect.value || !quantidadeInput.value || parseInt(quantidadeInput.value) <= 0 || etapa.lancado;
        botaoLancar.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
        if (etapa.lancado) botaoLancar.classList.add('lancado');
      } else if (exigeQuantidade && etapa.usuario) {
        quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, true, row);
        row.appendChild(quantidadeDiv);
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
  }

  if (op.status !== 'finalizado' && op.status !== 'cancelada') {
    op.status = op.etapas.some(e => e.usuario || e.quantidade) ? 'produzindo' : 'em-aberto';
    await saveOPChanges(op);
  }
}

async function verificarEtapasEStatus(op) {
  const todasEtapasCompletas = await Promise.all(op.etapas.map(async (etapa) => {
    const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto);
    const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
    return etapa.usuario && (!exigeQuantidade || (etapa.lancado && etapa.quantidade > 0));
  }));

  const resultado = todasEtapasCompletas.every(completa => completa);

  if (op.status === 'finalizado' && !resultado) {
    op.status = 'produzindo';
    await saveOPChanges(op);
  }

  return resultado;
}

// Função para alternar entre os modos de visualização
async function toggleView() {
  const hash = window.location.hash;
  const opListView = document.getElementById('opListView');
  const opFormView = document.getElementById('opFormView');
  const opEditView = document.getElementById('opEditView');

  if (!opListView || !opFormView || !opEditView) {
    console.log('[toggleView] Elementos DOM principais não encontrados');
    return;
  }

  const ordensDeProducao = await obterOrdensDeProducao();

  if (hash.startsWith('#editar/') && permissoes.includes('editar-op')) {
    const editId = hash.split('/')[1];
    const op = ordensDeProducao.find(o => o.edit_id === editId);

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

    // Ajuste para o campo "Data Prevista"
    const editDataEntregaInput = document.getElementById('editDataEntregaOP');
    editDataEntregaInput.value = op.data_entrega || ''; // Preencher com o valor de "Entregar OP em"
    editDataEntregaInput.readOnly = true; // Bloquear edição
    editDataEntregaInput.style.backgroundColor = '#d3d3d3'; // Visual de campo bloqueado

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

    await loadEtapasEdit(op);
    setTimeout(async () => {
      await atualizarVisualEtapas(op);
      await updateFinalizarButtonState(op);
    }, 100);
  } else if (hash === '#adicionar' && permissoes.includes('criar-op')) {
    opListView.style.display = 'none';
    opFormView.style.display = 'block';
    opEditView.style.display = 'none';
    await loadProdutosSelect();
    setCurrentDate();
    loadVariantesSelects('');
    document.getElementById('numeroOP').value = await getNextOPNumber();
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
    await loadOPTable();
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

// Variáveis globais
let permissoes = [];
let usuarioLogado = null;

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  const auth = await verificarAutenticacao('ordens-de-producao.html', ['acesso-ordens-de-producao']);
  if (!auth) {
    console.error('[admin-ordens-de-producao] Autenticação falhou');
    return;
  }

  usuarioLogado = auth.usuario;
  permissoes = auth.permissoes || [];
  console.log('[admin-ordens-de-producao] Autenticação bem-sucedida, usuário:', usuarioLogado.nome, 'Permissões:', permissoes);

  // Carregar IDs existentes do banco de dados
  const ordensDeProducao = await obterOrdensDeProducao();
  ordensDeProducao.forEach(op => usedIds.add(op.edit_id));

  // Elementos DOM
  const opListView = document.getElementById('opListView');
  const opFormView = document.getElementById('opFormView');
  const opEditView = document.getElementById('opEditView');
  const opTableBody = document.getElementById('opTableBody');
  const searchOP = document.getElementById('searchOP');
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

  if ([opListView, opFormView, opEditView, opTableBody, searchOP, statusFilter, opForm,
      produtoOP, quantidadeOP, numeroOP, variantesContainer, variantesSelects, dataEntregaOP,
      observacoesOP, editProdutoOP, editVarianteOP, editVarianteContainer, editQuantidadeOP,
      editDataEntregaOP, etapasContainer, opNumero, finalizarOP, cancelarOP, voltarOP].some(el => !el)) {
    throw new Error('Elementos DOM necessários não encontrados');
  }


  
  // Eventos
// Função de debounce
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Ajuste no evento hashchange
window.addEventListener('hashchange', debounce(toggleView, 100));

  const incluirOPBtn = document.getElementById('incluirOP');
  if (incluirOPBtn) {
    incluirOPBtn.disabled = !permissoes.includes('criar-op');
    if (!permissoes.includes('criar-op')) {
      incluirOPBtn.style.opacity = '0.5';
      incluirOPBtn.style.cursor = 'not-allowed';
    }
  }

  if (opForm) {
    opForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const numero = numeroOP.value.trim();
      const produto = produtoOP.value;
      const quantidade = parseInt(quantidadeOP.value) || 0;
      const dataEntrega = dataEntregaOP.value;
      const observacoes = observacoesOP.value.trim();
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
  
      const ordensDeProducao = await obterOrdensDeProducao();
      if (ordensDeProducao.some(op => op.numero === numero)) {
        alert(`Erro: Já existe uma Ordem de Produção com o número ${numero}!`);
        return;
      }
  
      const produtos = await obterProdutos();
      const produtoObj = produtos.find(p => p.nome === produto);
      const etapas = produtoObj?.etapas || [];
  
      const novaOP = {
        numero,
        produto,
        variante: variante || null,
        quantidade,
        data_entrega: dataEntrega, // Garantir que a data seja salva
        observacoes,
        status: 'em-aberto',
        edit_id: generateUniqueId(),
        etapas: etapas.map(etapa => ({
          processo: etapa.processo,
          usuario: '',
          quantidade: '',
          lancado: false,
          ultimoLancamentoId: null
        }))
      };
  
      await salvarOrdemDeProducao(novaOP);
      alert(`Ordem de Produção #${novaOP.numero} salva com sucesso!`);
      window.location.hash = '';
      await toggleView();
    });
  }

  if (produtoOP) {
    produtoOP.addEventListener('change', (e) => loadVariantesSelects(e.target.value));
  }

  if (searchOP) {
    searchOP.addEventListener('input', () => filterOPs());
  }

  if (finalizarOP) {
    finalizarOP.addEventListener('click', async () => {
      const editId = window.location.hash.split('/')[1];
      const ordensDeProducao = await obterOrdensDeProducao();
      const op = ordensDeProducao.find(o => o.edit_id === editId);
      if (op && !finalizarOP.disabled) {
        op.status = 'finalizado';
        op.data_final = new Date().toISOString();
        await saveOPChanges(op);
        alert(`Ordem de Produção #${op.numero} finalizada com sucesso!`);
        window.location.hash = '';
        await toggleView();
      }
    });
  }

  if (cancelarOP) {
    cancelarOP.addEventListener('click', async () => {
      const editId = window.location.hash.split('/')[1];
      const ordensDeProducao = await obterOrdensDeProducao();
      const op = ordensDeProducao.find(o => o.edit_id === editId);
      if (op) {
        if (op.status === 'cancelada') {
          alert(`Erro: A Ordem de Produção #${op.numero} já está cancelada!`);
          return;
        }
        if (confirm(`Tem certeza que deseja cancelar a Ordem de Produção #${op.numero}? Esta ação não pode ser desfeita.`)) {
          op.status = 'cancelada';
          await saveOPChanges(op);
          alert(`Ordem de Produção #${op.numero} cancelada com sucesso!`);
          window.location.hash = '';
          await toggleView();
        }
      }
    });
  }

  if (voltarOP) {
    voltarOP.addEventListener('click', async () => {
      window.location.hash = '';
      // Evitar múltiplas chamadas ao toggleView
      if (window.location.hash === '') {
        await toggleView();
      }
    });
  }

  if (!permissoes.includes('editar-op')) {
    document.querySelectorAll('input, select, button.botao-lancar, button#finalizarOP').forEach(el => {
      el.disabled = true;
      el.style.opacity = '0.5';
      el.style.cursor = 'not-allowed';
    });
  }
  // Chamar toggleView explicitamente na inicialização
  await toggleView();

});