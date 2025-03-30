import { verificarAutenticacao } from '/js/utils/auth.js';
import { PRODUTOS, PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';

let filteredOPsGlobal = [];

function mostrarPopupMensagem(mensagem, tipo = 'erro') {
  const popup = document.createElement('div');
  popup.className = `popup-mensagem popup-${tipo}`;
  popup.style.position = 'fixed';
  popup.style.top = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  popup.style.backgroundColor = tipo === 'erro' ? '#f8d7da' : '#d4edda';
  popup.style.color = tipo === 'erro' ? '#721c24' : '#155724';
  popup.style.padding = '20px';
  popup.style.borderRadius = '5px';
  popup.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
  popup.style.zIndex = '1000';
  popup.style.maxWidth = '400px';
  popup.style.textAlign = 'center';

  const mensagemTexto = document.createElement('p');
  mensagemTexto.textContent = mensagem;
  popup.appendChild(mensagemTexto);

  const fecharBtn = document.createElement('button');
  fecharBtn.textContent = 'Fechar';
  fecharBtn.style.marginTop = '10px';
  fecharBtn.style.padding = '5px 10px';
  fecharBtn.style.backgroundColor = tipo === 'erro' ? '#dc3545' : '#28a745';
  fecharBtn.style.color = '#fff';
  fecharBtn.style.border = 'none';
  fecharBtn.style.borderRadius = '3px';
  fecharBtn.style.cursor = 'pointer';

  fecharBtn.addEventListener('click', () => {
    document.body.removeChild(popup);
  });

  popup.appendChild(fecharBtn);
  document.body.appendChild(popup);

  setTimeout(() => {
    if (document.body.contains(popup)) {
      document.body.removeChild(popup);
    }
  }, 5000);
}

// Cache para produtos
let produtosCache = null;
let produtosPromise = null; // Armazena a promessa em andamento


// Conjunto para rastrear IDs únicos
const usedIds = new Set();

// Função para buscar produtos da API com cache no localStorage
async function obterProdutos() {
  const cachedData = localStorage.getItem('produtosCacheData');
  if (cachedData) {
    const { produtos, timestamp } = JSON.parse(cachedData);
    const now = Date.now();
    const cacheDuration = 5 * 60 * 1000; // 5 minutos em milissegundos
    if (now - timestamp < cacheDuration) {
      produtosCache = produtos;
      console.log('[obterProdutos] Retornando produtos do localStorage');
      return produtosCache;
    }
  }

  if (produtosCache) {
    console.log('[obterProdutos] Retornando produtos do cache');
    return produtosCache;
  }

  if (produtosPromise) {
    console.log('[obterProdutos] Aguardando promessa existente');
    return await produtosPromise;
  }

  try {
    produtosPromise = (async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/produtos', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Erro ao carregar produtos');
      produtosCache = await response.json();
      const cacheData = {
        produtos: produtosCache,
        timestamp: Date.now(),
      };
      localStorage.setItem('produtosCacheData', JSON.stringify(cacheData));
      console.log('[obterProdutos] Produtos buscados e armazenados no cache e localStorage:', produtosCache);
      return produtosCache;
    })();

    return await produtosPromise;
  } finally {
    produtosPromise = null; // Limpar a promessa após a conclusão
  }
}

// Função para limpar o cache (chamar no logout, por exemplo)
export function limparCacheProdutos() {
  produtosCache = null;
  localStorage.removeItem('produtosCacheData');
  console.log('[obterProdutos] Cache de produtos limpo');
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

  produtoSelect.innerHTML = '<option value="">Carregando produtos...</option>';
  try {
    const produtos = await obterProdutos();
    produtoSelect.innerHTML = '<option value="">Selecione um produto</option>';
    const produtosFiltrados = produtos.filter(produto => 
      PRODUTOS.includes(produto.nome) && !PRODUTOSKITS.includes(produto.nome)
    );
    produtosFiltrados.forEach(produto => {
      const option = document.createElement('option');
      option.value = produto.nome;
      option.textContent = produto.nome;
      produtoSelect.appendChild(option);
    });
  } catch (error) {
    console.error('[loadProdutosSelect] Erro ao carregar produtos:', error);
    produtoSelect.innerHTML = '<option value="">Erro ao carregar produtos</option>';
  }
}

// Função para carregar variantes
async function loadVariantesSelects(produtoNome, produtos = null) {
  const variantesContainer = document.getElementById('variantesContainer');
  const variantesSelects = document.querySelector('.variantes-selects');
  if (!variantesContainer || !variantesSelects) return;

  variantesSelects.innerHTML = '';
  if (!produtoNome) {
    variantesContainer.style.display = 'none';
    return;
  }

  const produtosData = produtos || await obterProdutos();
  const produto = produtosData.find(p => p.nome === produtoNome);

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
  try {
    const ordens = await obterOrdensDeProducao();
    const numeros = ordens.map(op => parseInt(op.numero)).filter(n => !isNaN(n));
    const maxNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
    const nextNumero = (maxNumero + 1).toString();
    console.log('[getNextOPNumber] Próximo número de OP:', nextNumero);
    return nextNumero;
  } catch (error) {
    console.error('[getNextOPNumber] Erro ao calcular próximo número de OP:', error);
    throw error;
  }
}

function setCurrentDate() {
  const dataEntrega = document.getElementById('dataEntregaOP');
  if (dataEntrega) {
    const agora = new Date();
    
    // Ajusta para o fuso de São Paulo (-3 horas)
    agora.setHours(agora.getHours() - 3);
    
    // Converte para o formato YYYY-MM-DD (padrão para inputs de data)
    const hoje = agora.toISOString().split('T')[0];

    dataEntrega.value = hoje;
  }
}


// Carrega a tabela de ordens de produção
async function loadOPTable(filterStatus = 'todas', search = '') {
  const opTableBody = document.getElementById('opTableBody');
  opTableBody.innerHTML = '<tr><td colspan="5"><div class="spinner">Carregando ordens...</div></td></tr>';

  try {
    const ordensDeProducao = await obterOrdensDeProducao();
    console.log('[loadOPTable] Ordens de produção carregadas:', ordensDeProducao);

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

    const fragment = document.createDocumentFragment();
    filteredOPs.forEach((op, index) => {
      if (!op.edit_id) {
        op.edit_id = generateUniqueId();
        usedIds.add(op.edit_id);
      }
      const tr = document.createElement('tr');
      tr.dataset.index = index;
      tr.dataset.numero = op.numero;
      tr.style.cursor = permissoes.includes('editar-op') ? 'pointer' : 'default';
      tr.innerHTML = `
        <td><span class="status-bolinha status-${op.status} ${op.status === 'produzindo' ? 'blink' : ''}"></span></td>
        <td>${op.numero}</td>
        <td>${op.produto}</td>
        <td>${op.variante || '-'}</td>
        <td>${op.quantidade}</td>
      `;
      fragment.appendChild(tr);
    });

    opTableBody.innerHTML = '';
    opTableBody.appendChild(fragment);

    // Remover listeners antigos para evitar acumulação
    opTableBody.removeEventListener('click', handleOPTableClick);
    if (permissoes.includes('editar-op')) {
      opTableBody.addEventListener('click', handleOPTableClick);
    }

    function handleOPTableClick(e) {
      console.log('[loadOPTable] Clique na tabela detectado');
      const tr = e.target.closest('tr');
      if (tr) {
        const index = parseInt(tr.dataset.index);
        console.log('[loadOPTable] Linha clicada, index:', index);
        const op = filteredOPs[index];
        if (op) {
          console.log('[loadOPTable] Ordem selecionada:', op.numero, 'Edit ID:', op.edit_id);
          window.location.hash = `#editar/${op.edit_id}`;
        } else {
          console.error('[loadOPTable] Ordem não encontrada para o índice:', index);
        }
      } else {
        console.log('[loadOPTable] Clique fora de uma linha (tr)');
      }
    }
  } catch (error) {
    console.error('[loadOPTable] Erro ao carregar ordens de produção:', error);
    opTableBody.innerHTML = '<tr><td colspan="5">Erro ao carregar ordens de produção. Tente novamente.</td></tr>';
  }
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

async function updateFinalizarButtonState(op, produtos) {
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
  if (op.etapas && Array.isArray(op.etapas) && op.etapas.length > 0) {
    for (const etapa of op.etapas) {
      const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos);
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

async function verificarEtapasEStatus(op, produtos) {
  if (!op.etapas || !Array.isArray(op.etapas)) return false;

  const todasEtapasCompletas = await Promise.all(op.etapas.map(async (etapa) => {
    const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos);
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

// Salva alterações na OP
async function saveOPChanges(op) {
  await atualizarOrdemDeProducao(op);
  console.log(`[saveOPChanges] Ordem de Produção #${op.numero} atualizada no banco de dados`);
}

async function loadEtapasEdit(op, skipReload = false) {
  console.log(`[loadEtapasEdit] Iniciando carregamento das etapas para OP: ${op ? op.numero : 'undefined'}`);
  const etapasContainer = document.getElementById('etapasContainer');
  const finalizarBtn = document.getElementById('finalizarOP');

  if (!op || !etapasContainer || !finalizarBtn) {
    console.error('[loadEtapasEdit] OP, etapasContainer ou finalizarBtn não encontrados:', { op, etapasContainer, finalizarBtn });
    return;
  }

  if (!op.etapas || !Array.isArray(op.etapas)) {
    console.error('[loadEtapasEdit] Etapas não encontradas ou inválidas na OP:', op);
    return;
  }

  if (!skipReload) {
    etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';
  }

  const produtos = await obterProdutos();
  const todasEtapasCompletas = await verificarEtapasEStatus(op, produtos);
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
      tipoUsuario: await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos),
    }))
  );

  const etapaAtualIndex = await determinarEtapaAtual(op, produtos);
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
      quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, index === etapaAtualIndex, row, produtos);
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
          mostrarPopupMensagem('Por favor, selecione um cortador antes de definir.', 'erro');
          return;
        }
        etapa.usuario = usuarioSelect.value;
        await saveOPChanges(op);
        await loadEtapasEdit(op, true);
        await atualizarVisualEtapas(op, produtos);
        await updateFinalizarButtonState(op, produtos);
      });
    } else {
      usuarioSelect.addEventListener('change', async () => {
        if (op.status === 'finalizado' || op.status === 'cancelada') return;
        const novoUsuario = usuarioSelect.value;
        if (etapa.usuario === novoUsuario) return;
        etapa.usuario = novoUsuario;
        await saveOPChanges(op);
        if (exigeQuantidade && etapa.usuario && !row.querySelector('.quantidade-lancar')) {
          quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, index === etapaAtualIndex, row, produtos);
          row.appendChild(quantidadeDiv);
        }
        await atualizarVisualEtapas(op, produtos);
        await updateFinalizarButtonState(op, produtos);
      });
    }
  }

  await atualizarVisualEtapas(op, produtos);
  await updateFinalizarButtonState(op, produtos);
}


async function salvarProducao(op, etapa, etapaIndex, produtos) {
  const produto = produtos.find(p => p.nome === op.produto);
  if (!produto) {
    throw new Error(`Produto ${op.produto} não encontrado.`);
  }

  const isKit = produto.tipos && produto.tipos.includes('kits');
  if (isKit) {
    throw new Error(`O produto ${op.produto} é um kit e não possui etapas de produção.`);
  }

  const etapaProduto = produto.etapas?.[etapaIndex];
  if (!etapaProduto) {
    throw new Error(`Etapa ${etapaIndex} não encontrada para o produto ${op.produto}.`);
  }

  if (etapaProduto.processo !== etapa.processo) {
    throw new Error(`Processo ${etapa.processo} não corresponde à etapa ${etapaIndex} do produto ${op.produto}.`);
  }

  const maquina = etapaProduto.maquina;
  if (!maquina) {
    throw new Error(`Máquina não definida para o processo ${etapa.processo} do produto ${op.produto}.`);
  }

  const variacao = op.variante || null;

  const dados = {
    opNumero: op.numero,
    etapaIndex: etapaIndex,
    processo: etapa.processo,
    produto: op.produto,
    variacao: variacao,
    maquina: maquina,
    quantidade: parseInt(etapa.quantidade),
    funcionario: etapa.usuario,
    data: new Date(new Date().getTime() - 3 * 60 * 60 * 1000)
  .toISOString()
  .replace('T', ' ')
  .substring(0, 19),

    lancadoPor: usuarioLogado?.nome || 'Sistema',
  };

  if (!dados.opNumero) throw new Error('Número da OP não informado.');
  if (dados.etapaIndex === undefined || dados.etapaIndex === null) throw new Error('Índice da etapa não informado.');
  if (!dados.processo) throw new Error('Processo não informado.');
  if (!dados.produto) throw new Error('Produto não informado.');
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
        mostrarPopupMensagem('Sua sessão expirou. Por favor, faça login novamente.', 'erro');
        localStorage.removeItem('token');
        localStorage.removeItem('usuarioLogado');
        limparCacheProdutos();
        window.location.href = '/login.html';
        return;
      }
      if (responseProducoes.status === 403) {
        mostrarPopupMensagem('Você não tem permissão para lançar produção.', 'erro');
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
async function lancarEtapa(op, etapaIndex, quantidade, produtos) {
  const etapa = op.etapas[etapaIndex];
  etapa.quantidade = parseInt(quantidade);
  etapa.ultimoLancamentoId = await salvarProducao(op, etapa, etapaIndex, produtos);
  etapa.lancado = true;
  await saveOPChanges(op);
  await updateFinalizarButtonState(op, produtos);
}

// Função de debounce
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Função auxiliar para criar a linha de quantidade e botão "Lançar"
function criarQuantidadeDiv(etapa, op, usuarioSelect, isEditable, row, produtos) {
  let quantidadeDiv = row.querySelector('.quantidade-lancar');
  if (!quantidadeDiv) {
    quantidadeDiv = document.createElement('div');
    quantidadeDiv.className = 'quantidade-lancar';
    quantidadeDiv.style.display = 'flex';
    quantidadeDiv.style.alignItems = 'center';
    row.appendChild(quantidadeDiv);
  } else {
    quantidadeDiv.innerHTML = '';
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
  const podeLancar = permissoes.includes('lancar-producao');
  lancarBtn.disabled = !podeLancar || !usuarioSelect.value || !quantidadeInput.value || parseInt(quantidadeInput.value) <= 0 || !isEditable || etapa.lancado;
  lancarBtn.dataset.etapaIndex = op.etapas.indexOf(etapa);

  if (!podeLancar) {
    lancarBtn.style.opacity = '0.5';
    lancarBtn.style.cursor = 'not-allowed';
  }

  quantidadeDiv.appendChild(quantidadeInput);
  quantidadeDiv.appendChild(lancarBtn);

  const updateLancarBtn = () => {
    const oldBtn = quantidadeDiv.querySelector('.botao-lancar');
    if (oldBtn) oldBtn.remove();

    lancarBtn = document.createElement('button');
    lancarBtn.className = 'botao-lancar';
    lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
    lancarBtn.disabled = !podeLancar || !usuarioSelect.value || !quantidadeInput.value || parseInt(quantidadeInput.value) <= 0 || !isEditable || etapa.lancado;
    lancarBtn.dataset.etapaIndex = op.etapas.indexOf(etapa);

    if (!podeLancar) {
      lancarBtn.style.opacity = '0.5';
      lancarBtn.style.cursor = 'not-allowed';
    }

    lancarBtn.addEventListener('click', async () => {
      if (lancarBtn.disabled) return;
    
      const etapaIndex = parseInt(lancarBtn.dataset.etapaIndex);
      const editId = window.location.hash.split('/')[1];
      const ordensDeProducao = await obterOrdensDeProducao();
      const opLocal = ordensDeProducao.find(o => o.edit_id === editId);
    
      if (!opLocal || !opLocal.etapas || !opLocal.etapas[etapaIndex]) {
        mostrarPopupMensagem('Erro: Ordem de Produção ou etapa não encontrada.', 'erro');
        return;
      }
    
      const etapasFuturas = await getEtapasFuturasValidas(opLocal, etapaIndex, produtos);
      if (etapasFuturas.length > 0) {
        mostrarPopupEtapasFuturas(opLocal, etapaIndex, etapasFuturas, quantidadeInput.value, produtos);
      } else {
        try {
          await lancarEtapa(opLocal, etapaIndex, quantidadeInput.value, produtos);
          // Recarregar a OP para garantir consistência
          const updatedOrdens = await obterOrdensDeProducao();
          const updatedOp = updatedOrdens.find(o => o.edit_id === editId);
          if (updatedOp) {
            Object.assign(opLocal, updatedOp);
            etapa.lancado = true;
            etapa.quantidade = parseInt(quantidadeInput.value);
            quantidadeInput.disabled = true;
            lancarBtn.textContent = 'Lançado';
            lancarBtn.disabled = true;
            lancarBtn.classList.add('lancado');
            await loadEtapasEdit(opLocal, true);
            await atualizarVisualEtapas(opLocal, produtos);
            await updateFinalizarButtonState(opLocal, produtos);
            mostrarPopupMensagem('Produção lançada com sucesso!', 'sucesso');
          } else {
            throw new Error('Ordem de Produção não encontrada após lançamento.');
          }
        } catch (error) {
          console.error('[criarQuantidadeDiv] Erro ao lançar etapa:', error);
          mostrarPopupMensagem('Erro ao lançar produção. Tente novamente.', 'erro');
          lancarBtn.textContent = 'Lançar';
          lancarBtn.disabled = false;
          quantidadeInput.disabled = false;
        }
      }
    });

    quantidadeDiv.appendChild(lancarBtn);
  };

  usuarioSelect.addEventListener('change', async () => {
    if (op.status === 'finalizado' || op.status === 'cancelada') return;
    const novoUsuario = usuarioSelect.value;
    if (etapa.usuario === novoUsuario) return;
    etapa.usuario = novoUsuario;
    await saveOPChanges(op);
    quantidadeInput.disabled = !usuarioSelect.value || !isEditable || etapa.lancado;
    if (!quantidadeInput.disabled) quantidadeInput.focus();
    else {
      quantidadeInput.value = etapa.quantidade || '';
    }
    updateLancarBtn();
    await atualizarVisualEtapas(op, produtos);
    await updateFinalizarButtonState(op, produtos);
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
    await atualizarVisualEtapas(op, produtos);
  };

  const debouncedHandleInputChange = debounce(handleInputChange, 500);
  quantidadeInput.addEventListener('input', debouncedHandleInputChange);
  handleInputChange();
  updateLancarBtn();

  return quantidadeDiv;
}

// Função para identificar etapas futuras válidas
async function getEtapasFuturasValidas(op, etapaIndex, produtos) {
  const produto = produtos.find(p => p.nome === op.produto);
  const etapasProduto = produto?.etapas || [];
  const etapasOP = op.etapas || [];
  if (etapaIndex >= etapasProduto.length || etapaIndex >= etapasOP.length) return [];

  const etapaAtual = etapasProduto[etapaIndex];
  const maquinaAtual = etapaAtual?.maquina || 'Não Usa';
  const tipoUsuarioAtual = await getTipoUsuarioPorProcesso(etapaAtual.processo, op.produto, produtos);

  const etapasFuturas = [];
  for (let i = etapaIndex + 1; i < etapasOP.length; i++) {
    const proximaEtapa = etapasProduto[i];
    if (!proximaEtapa) break;
    const tipoUsuarioProximo = await getTipoUsuarioPorProcesso(proximaEtapa.processo, op.produto, produtos);
    const maquinaProxima = proximaEtapa?.maquina || 'Não Usa';

    if (tipoUsuarioProximo !== 'costureira' || maquinaProxima !== maquinaAtual) break;
    if (etapasOP[i].lancado) break;
    etapasFuturas.push({ index: i, processo: proximaEtapa.processo });
  }
  return etapasFuturas;
}

// Função para exibir o popup
function mostrarPopupEtapasFuturas(op, etapaIndex, etapasFuturas, quantidade, produtos) {
  console.log('[mostrarPopupEtapasFuturas] Exibindo popup para etapas futuras:', etapasFuturas);
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

    console.log('[mostrarPopupEtapasFuturas] Salvando etapas selecionadas:', selectedIndices);
    await lancarEtapa(op, etapaIndex, quantidade, produtos);
    const usuarioAtual = op.etapas[etapaIndex].usuario;
    for (const index of selectedIndices) {
      op.etapas[index].usuario = usuarioAtual;
      await lancarEtapa(op, index, quantidade, produtos);
    }

    document.body.removeChild(popup);
    await loadEtapasEdit(op, true);
    await atualizarVisualEtapas(op, produtos);
    await updateFinalizarButtonState(op, produtos);
  });

  cancelBtn.addEventListener('click', async () => {
    console.log('[mostrarPopupEtapasFuturas] Popup cancelado');
    document.body.removeChild(popup);
    await loadEtapasEdit(op, true);
    await atualizarVisualEtapas(op, produtos);
    await updateFinalizarButtonState(op, produtos);
  });

  document.body.appendChild(popup);
  validateCheckboxes();
}

// Mapeia processos para tipos de usuário
async function getTipoUsuarioPorProcesso(processo, produtoNome, produtos) {
  // [AJUSTE] Usar produtos passados como parâmetro em vez de chamar obterProdutos
  const produto = produtos.find(p => p.nome === produtoNome);
  if (produto && produto.etapas) {
    const etapa = produto.etapas.find(e => e.processo === processo);
    return etapa ? etapa.feitoPor : '';
  }
  return '';
}

async function determinarEtapaAtual(op, produtos) {
  for (let index = 0; index < op.etapas.length; index++) {
    const etapa = op.etapas[index];
    // [AJUSTE] Passar produtos para getTipoUsuarioPorProcesso
    const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos);
    const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
    if (exigeQuantidade ? !etapa.lancado : !etapa.usuario) {
      return index;
    }
  }
  return op.etapas.length;
}

async function atualizarVisualEtapas(op, produtos) {
  if (!op || !op.etapas) {
    console.error('[atualizarVisualEtapas] OP ou etapas não definidas:', op);
    return;
  }

  const etapasRows = document.querySelectorAll('.etapa-row');
  const etapaAtualIndex = await determinarEtapaAtual(op, produtos);
  console.log('[atualizarVisualEtapas] Etapas no DOM:', etapasRows.length, 'Etapas na OP:', op.etapas.length);

  // Garantir que o número de elementos no DOM corresponda ao número de etapas
  if (etapasRows.length !== op.etapas.length) {
    console.error('[atualizarVisualEtapas] Inconsistência entre DOM e dados. Recarregando etapas...');
    const etapasContainer = document.getElementById('etapasContainer');
    etapasContainer.innerHTML = ''; // Limpar o DOM
    await loadEtapasEdit(op, false); // Recarregar as etapas do zero
    return;
  }

  for (let index = 0; index < etapasRows.length; index++) {
    const row = etapasRows[index];
    const numero = row.querySelector('.etapa-numero');
    const usuarioSelect = row.querySelector('.select-usuario');
    let quantidadeDiv = row.querySelector('.quantidade-lancar');
    const etapa = op.etapas[index];

    if (!etapa) {
      console.error('[atualizarVisualEtapas] Etapa não encontrada para o índice:', index);
      continue;
    }

    const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos);
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
        quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, true, row, produtos);
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


// Função para alternar entre os modos de visualização
async function toggleView() {
  console.log('[toggleView] Iniciando toggleView, hash atual:', window.location.hash);
  const hash = window.location.hash;
  const opListView = document.getElementById('opListView');
  const opFormView = document.getElementById('opFormView');
  const opEditView = document.getElementById('opEditView');

  if (!opListView || !opFormView || !opEditView) {
    console.log('[toggleView] Elementos DOM principais não encontrados');
    return;
  }

  console.log('[toggleView] Buscando ordens de produção...');
  const ordensDeProducao = await obterOrdensDeProducao();
  console.log('[toggleView] Ordens de produção obtidas:', ordensDeProducao.length);

  if (hash.startsWith('#editar/') && permissoes.includes('editar-op')) {
    const editId = hash.split('/')[1];
    console.log('[toggleView] Modo edição, editId:', editId);
    const op = ordensDeProducao.find(o => o.edit_id === editId);

    if (!op) {
      console.error(`[toggleView] Ordem de Produção não encontrada para editId: ${editId}`);
      mostrarPopupMensagem('Ordem de Produção não encontrada.', 'erro');
      window.location.hash = '';
      return;
    }

    console.log('[toggleView] Editando OP:', op.numero);
    document.getElementById('editProdutoOP').value = op.produto || '';
    const editQuantidadeInput = document.getElementById('editQuantidadeOP');
    editQuantidadeInput.value = op.quantidade || '';
    editQuantidadeInput.disabled = true;
    editQuantidadeInput.style.backgroundColor = '#d3d3d3';

    const editDataEntregaInput = document.getElementById('editDataEntregaOP');
    const dataEntrega = op.data_entrega ? new Date(op.data_entrega).toISOString().split('T')[0] : '';
    editDataEntregaInput.value = dataEntrega;
    editDataEntregaInput.readOnly = true;
    editDataEntregaInput.style.backgroundColor = '#d3d3d3';

    const editVarianteContainer = document.getElementById('editVarianteContainer');
    const editVarianteInput = document.getElementById('editVarianteOP');
    if (op.variante) {
      // Tratar múltiplas variações separadas por " | "
      const variantes = op.variante.split(' | ').join(', ');
      editVarianteInput.value = variantes;
      editVarianteContainer.style.display = 'block';
      // Ajustar o CSS para evitar quebra de layout
      editVarianteInput.style.width = '100%';
      editVarianteInput.style.boxSizing = 'border-box';
    } else {
      editVarianteContainer.style.display = 'none';
    }

    opListView.style.display = 'none';
    opFormView.style.display = 'none';
    opEditView.style.display = 'block';
    document.getElementById('opNumero').textContent = `OP n°: ${op.numero}`;

    console.log('[toggleView] Carregando etapas para edição...');
    await loadEtapasEdit(op);
    console.log('[toggleView] Etapas carregadas com sucesso');
  } else if (hash === '#adicionar' && permissoes.includes('criar-op')) {
    console.log('[toggleView] Modo adicionar nova OP');
    opListView.style.display = 'none';
    opFormView.style.display = 'block';
    opEditView.style.display = 'none';
    console.log('[toggleView] Carregando produtos para o formulário...');
    await loadProdutosSelect();
    setCurrentDate();
    console.log('[toggleView] Carregando variantes...');
    await loadVariantesSelects('');
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
      await loadVariantesSelects('');
    }
    console.log('[toggleView] Formulário de adição configurado');
  } else {
    console.log('[toggleView] Modo lista de OPs');
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

  // Verificar permissões específicas
  console.log('[admin-ordens-de-producao] Permissão para criar OP:', permissoes.includes('criar-op'));
  console.log('[admin-ordens-de-producao] Permissão para editar OP:', permissoes.includes('editar-op'));


  // Carregar IDs existentes do banco de dados
  const ordensDeProducao = await obterOrdensDeProducao();
  ordensDeProducao.forEach(op => {
    if (op.edit_id) usedIds.add(op.edit_id);
  });

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

  window.addEventListener('hashchange', () => {
    console.log('[hashchange] Hash alterado para:', window.location.hash);
    toggleView();
  });


  const incluirOPBtn = document.getElementById('incluirOP');
  if (incluirOPBtn) {
    incluirOPBtn.disabled = !permissoes.includes('criar-op');
    if (!permissoes.includes('criar-op')) {
      incluirOPBtn.style.opacity = '0.5';
      incluirOPBtn.style.cursor = 'not-allowed';
    } else {
      incluirOPBtn.addEventListener('click', () => {
        console.log('[incluirOPBtn] Botão "Incluir OP" clicado');
        window.location.hash = '#adicionar';
      });
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

      if (!produto) {
        mostrarPopupMensagem('Por favor, selecione um produto.', 'erro');
        return;
      }
      if (!quantidade || quantidade <= 0) {
        mostrarPopupMensagem('Por favor, insira uma quantidade válida.', 'erro');
        return;
      }
      if (!dataEntrega) {
        mostrarPopupMensagem('Por favor, selecione a data de entrega.', 'erro');
        return;
      }
      if (variantesSelects.length > 0 && varianteValues.some(v => !v)) {
        mostrarPopupMensagem('Por favor, preencha todas as variações.', 'erro');
        return;
      }

      const ordensDeProducao = await obterOrdensDeProducao();
      if (ordensDeProducao.some(op => op.numero === numero)) {
        mostrarPopupMensagem(`Erro: Já existe uma Ordem de Produção com o número ${numero}!`, 'erro');
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
        data_entrega: dataEntrega,
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

      try {
        await salvarOrdemDeProducao(novaOP);
        mostrarPopupMensagem(`Ordem de Produção #${novaOP.numero} salva com sucesso!`, 'sucesso');
        window.location.hash = '';
        await toggleView();
      } catch (error) {
        console.error('[opForm.submit] Erro ao salvar ordem de produção:', error);
        mostrarPopupMensagem('Erro ao salvar ordem de produção. Tente novamente.', 'erro');
      }
    });
  }

  if (produtoOP) {
    const produtos = await obterProdutos();
    produtoOP.addEventListener('change', async (e) => {
      await loadVariantesSelects(e.target.value, produtos);
    });
  }

  if (searchOP) {
    const debouncedFilterOPs = debounce(() => filterOPs(), 300);
    searchOP.addEventListener('input', debouncedFilterOPs);
  }

  if (finalizarOP) {
    finalizarOP.addEventListener('click', async () => {
        const editId = window.location.hash.split('/')[1];
        const ordensDeProducao = await obterOrdensDeProducao();
        const op = ordensDeProducao.find(o => o.edit_id === editId);

        if (op && !finalizarOP.disabled) {
            op.status = 'finalizado';

            // Obtém a data atual em UTC
            const agora = new Date();
            
            // Ajusta para o fuso horário de São Paulo (-3 horas)
            agora.setHours(agora.getHours() - 3);

            // Formata a data no formato desejado: YYYY-MM-DD HH:MM:SS
            const dataFinalFormatada = agora.toISOString().replace('T', ' ').substring(0, 19);

            op.data_final = dataFinalFormatada;

            await saveOPChanges(op);
            mostrarPopupMensagem(`Ordem de Produção #${op.numero} finalizada com sucesso!`, 'sucesso');
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
          mostrarPopupMensagem(`Erro: A Ordem de Produção #${op.numero} já está cancelada!`, 'erro');
          return;
        }
        if (confirm(`Tem certeza que deseja cancelar a Ordem de Produção #${op.numero}? Esta ação não pode ser desfeita.`)) {
          op.status = 'cancelada';
          await saveOPChanges(op);
          mostrarPopupMensagem(`Ordem de Produção #${op.numero} cancelada com sucesso!`, 'sucesso');
          window.location.hash = '';
          await toggleView();
        }
      }
    });
  }

  if (voltarOP) {
    voltarOP.addEventListener('click', async () => {
      window.location.hash = '';
      if (window.location.hash === '') {
        await toggleView();
      }
    });
  }

  // Adicionar evento de logout (se existir um botão de logout)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      limparCacheProdutos();
      usedIds.clear();
      localStorage.removeItem('token');
      localStorage.removeItem('usuarioLogado');
      window.location.href = '/login.html';
    });
  }

  if (!permissoes.includes('editar-op') || !permissoes.includes('lancar-producao')) {
    document.querySelectorAll('input, select, button.botao-lancar, button#finalizarOP').forEach(el => {
      el.disabled = true;
      el.style.opacity = '0.5';
      el.style.cursor = 'not-allowed';
    });
  }

  await toggleView();
});