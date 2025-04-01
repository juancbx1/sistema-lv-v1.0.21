window.saveOPChanges = null; // Inicializa como null para garantir que existe
import { verificarAutenticacao } from '/js/utils/auth.js';
import { PRODUTOS, PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';

let filteredOPsGlobal = [];
let lancamentosEmAndamento = new Set();
let ordensCache = null;
let ordensPromise = null;
let currentPage = 1;
const itemsPerPage = 10;
let permissoes = [];
let usuarioLogado = null;
const usedIds = new Set();

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
let produtosPromise = null;

async function obterProdutos() {
  const cachedData = localStorage.getItem('produtosCacheData');
  if (cachedData) {
    const { produtos, timestamp } = JSON.parse(cachedData);
    const now = Date.now();
    const cacheDuration = 5 * 60 * 1000;
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
    produtosPromise = null;
  }
}

export function limparCacheProdutos() {
  produtosCache = null;
  localStorage.removeItem('produtosCacheData');
  console.log('[obterProdutos] Cache de produtos limpo');
}

function ordenarOPs(ops, criterio, ordem = 'asc') {
  return ops.sort((a, b) => {
    switch (criterio) {
      case 'status':
        // Usar numero como fallback
        return ordem === 'asc' ? parseInt(a.numero) - parseInt(b.numero) : parseInt(b.numero) - parseInt(a.numero);
      case 'numero':
        return ordem === 'asc' ? parseInt(a.numero) - parseInt(b.numero) : parseInt(b.numero) - parseInt(a.numero);
      case 'produto':
        return ordem === 'asc' ? a.produto.localeCompare(b.produto) : b.produto.localeCompare(a.produto);
      case 'variante':
        const varA = a.variante || '-';
        const varB = b.variante || '-';
        return ordem === 'asc' ? varA.localeCompare(varB) : varB.localeCompare(varA);
      case 'quantidade':
        return ordem === 'asc' ? parseInt(a.quantidade) - parseInt(b.quantidade) : parseInt(b.quantidade) - parseInt(a.quantidade);
      default:
        return 0;
    }
  });
}

async function obterOrdensDeProducao(page = 1, fetchAll = false) {
  const cachedData = localStorage.getItem('ordensCacheData');
  if (!fetchAll && cachedData) { // Só usa cache se não for fetchAll
    const { ordens, timestamp, total, pages } = JSON.parse(cachedData);
    const now = Date.now();
    const cacheDuration = 5 * 60 * 1000; // 5 minutos
    if (now - timestamp < cacheDuration) {
      ordensCache = { rows: ordens, total, pages };
      console.log('[obterOrdensDeProducao] Retornando ordens do localStorage');
      return ordensCache;
    }
  }

  if (!fetchAll && ordensCache) { // Só usa cache se não for fetchAll
    console.log('[obterOrdensDeProducao] Retornando ordens do cache');
    return ordensCache;
  }

  if (ordensPromise) {
    return await ordensPromise;
  }

  try {
    ordensPromise = (async () => {
      const token = localStorage.getItem('token');
      const url = fetchAll
        ? '/api/ordens-de-producao?all=true'
        : `/api/ordens-de-producao?page=${page}&limit=${itemsPerPage}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Erro ao carregar ordens de produção');
      const data = await response.json();

      // Normaliza o retorno para sempre ser um objeto paginado
      ordensCache = fetchAll
        ? { rows: data, total: data.length, pages: 1 }
        : data;

      if (!fetchAll) { // Cache só para chamadas paginadas
        const cacheData = {
          ordens: ordensCache.rows,
          timestamp: Date.now(),
          total: ordensCache.total,
          pages: ordensCache.pages,
        };
        localStorage.setItem('ordensCacheData', JSON.stringify(cacheData));
      }
      console.log('[obterOrdensDeProducao] Ordens buscadas e armazenadas:', fetchAll ? 'todas' : 'paginadas');
      return ordensCache;
    })();

    return await ordensPromise;
  } finally {
    ordensPromise = null;
  }
}


export function limparCacheOrdens() {
  ordensCache = null;
  localStorage.removeItem('ordensCacheData');
  console.log('[obterOrdensDeProducao] Cache de ordens limpo');
}

// Expondo a função globalmente para o console
window.limparCacheOrdens = limparCacheOrdens;

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

function generateUniqueId() {
  let id;
  do {
    id = Math.floor(100000000 + Math.random() * 900000000).toString();
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

function getUsuarioPlaceholder(tipoUsuario) {
  switch (tipoUsuario) {
    case 'costureira': return 'Selecione a(o) Costureira(o)';
    case 'cortador': return 'Selecione a(o) Cortador(a)';
    case 'tiktik': return 'Selecione a(o) TikTik';
    default: return 'Selecione o usuário';
  }
}

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

async function getNextOPNumber() {
  try {
    const ordensData = await obterOrdensDeProducao(1, true); // Busca todas as OPs
    const ordens = ordensData.rows; // Acessa .rows
    const numeros = ordens.map(op => parseInt(op.numero)).filter(n => !isNaN(n));
    const maxNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
    const nextNumero = (maxNumero + 1).toString();
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
    const hoje = agora.toISOString().split('T')[0];
    dataEntrega.value = hoje;
  }
}

async function loadOPTable(filterStatus = 'todas', search = '', sortCriterio = 'status', sortOrdem = 'desc', page = 1) {
  const opTableBody = document.getElementById('opTableBody');
  const paginationContainer = document.createElement('div');
  paginationContainer.id = 'paginationContainer';
  paginationContainer.className = 'pagination-container';

  opTableBody.innerHTML = '<tr><td colspan="5"><div class="spinner">Carregando ordens...</div></td></tr>';

  try {
    // Usa fetchAll=true para carregar todas as OPs
    const data = await obterOrdensDeProducao(1, true);
    let ordensDeProducao = data.rows;

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

    filteredOPs = ordenarOPs(filteredOPs, sortCriterio, sortOrdem);

    // Paginação no frontend com base no total real de OPs
    const totalItems = filteredOPs.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const paginatedOPs = filteredOPs.slice(startIndex, endIndex);

    filteredOPsGlobal = filteredOPs;

    const fragment = document.createDocumentFragment();
    paginatedOPs.forEach((op, index) => {
      if (!op.edit_id) {
        op.edit_id = generateUniqueId();
        usedIds.add(op.edit_id);
      }
      const tr = document.createElement('tr');
      tr.dataset.index = startIndex + index;
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

    opTableBody.removeEventListener('click', handleOPTableClick);
    if (permissoes.includes('editar-op')) {
      opTableBody.addEventListener('click', handleOPTableClick);
    }

    // Renderiza a paginação
    let paginationHTML = '';
    if (totalPages > 1) {
      paginationHTML += `<button class="pagination-btn prev" data-page="${Math.max(1, page - 1)}" ${page === 1 ? 'disabled' : ''}>Anterior</button>`;
      paginationHTML += `<span class="pagination-current">Pág. ${page} de ${totalPages}</span>`;
      paginationHTML += `<button class="pagination-btn next" data-page="${Math.min(totalPages, page + 1)}" ${page === totalPages ? 'disabled' : ''}>Próximo</button>`;
    }

    paginationContainer.innerHTML = paginationHTML;
    const existingPagination = document.getElementById('paginationContainer');
    if (existingPagination) {
      existingPagination.replaceWith(paginationContainer);
    } else {
      opTableBody.parentElement.parentElement.appendChild(paginationContainer); // Adiciona após a tabela
    }

    document.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newPage = parseInt(btn.dataset.page);
        loadOPTable(filterStatus, search, sortCriterio, sortOrdem, newPage);
      });
    });

  } catch (error) {
    console.error('[loadOPTable] Erro ao carregar ordens de produção:', error);
    opTableBody.innerHTML = '<tr><td colspan="5">Erro ao carregar ordens de produção. Tente novamente.</td></tr>';
  }
}



function handleOPTableClick(e) {
  const tr = e.target.closest('tr');
  if (tr) {
    const index = parseInt(tr.dataset.index);
    const op = filteredOPsGlobal[index];
    if (op) {
      window.location.hash = `#editar/${op.edit_id}`;
    } else {
      console.error('[handleOPTableClick] Ordem não encontrada para o índice:', index);
    }
  }
}

function filterOPs(page = 1) {
  const statusFilter = document.getElementById('statusFilter');
  const searchOP = document.getElementById('searchOP');
  const activeStatus = statusFilter.querySelector('.status-btn.active')?.dataset.status || 'todas';
  const sortCriterio = document.querySelector('.tabela-op th[data-sort]')?.id.replace('sort', '') || 'status';
  const sortOrdem = document.querySelector('.tabela-op th[data-sort]')?.dataset.sort || 'desc';
  loadOPTable(activeStatus, searchOP.value, sortCriterio, sortOrdem, page);
}

async function updateFinalizarButtonState(op, produtos) {
  const finalizarBtn = document.getElementById('finalizarOP');
  if (!finalizarBtn || !op) return;

  const editProduto = document.getElementById('editProdutoOP')?.value || op.produto;
  const editQuantidade = parseInt(document.getElementById('editQuantidadeOP')?.value) || op.quantidade || 0;
  const editDataEntrega = document.getElementById('editDataEntregaOP')?.value || op.data_entrega;
  const editVariante = document.getElementById('editVarianteOP')?.value || op.variante;

  const camposPrincipaisPreenchidos = editProduto && editQuantidade > 0 && editDataEntrega && (op.variante ? editVariante : true);

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

async function saveOPChanges(op) {
  await atualizarOrdemDeProducao(op);
  console.log(`[saveOPChanges] Ordem de Produção #${op.numero} atualizada no banco de dados`);
}

window.saveOPChanges = saveOPChanges; // Torna a função global


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

  // Mostra o spinner apenas se não for um reload parcial
  if (!skipReload) {
    etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';
  }

  // Carrega produtos e usuários uma vez antes do loop
  const produtos = await obterProdutos();
  const responseUsuarios = await fetch('/api/usuarios', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
  });
  const usuarios = await responseUsuarios.json();

  // Verifica etapas e status uma vez
  const todasEtapasCompletas = await verificarEtapasEStatus(op, produtos);
  if (op.status === 'finalizado' && !todasEtapasCompletas) {
    op.status = 'produzindo';
    await saveOPChanges(op); // Chama a função restaurada
  }

  // Calcula o índice da etapa atual uma vez
  const etapaAtualIndex = await determinarEtapaAtual(op, produtos);
  console.log(`[loadEtapasEdit] Etapa atual index calculada: ${etapaAtualIndex}`);

  // Pré-calcula os tipos de usuário para evitar chamadas repetidas no loop
  const tiposUsuarios = await Promise.all(
    op.etapas.map(async (etapa) => ({
      processo: etapa.processo,
      tipoUsuario: await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos),
    }))
  );

  // Limpa o container apenas se necessário
  if (!skipReload) {
    etapasContainer.innerHTML = ''; // Limpa apenas uma vez antes de construir
  }

  const fragment = document.createDocumentFragment(); // Usa fragment para evitar reflows múltiplos
  for (let index = 0; index < op.etapas.length; index++) {
    const etapa = op.etapas[index];
    console.log(`[loadEtapasEdit] Processando etapa ${index + 1}: ${etapa.processo}, lancado: ${etapa.lancado}, usuario: ${etapa.usuario || ''}`);

    let row = skipReload ? etapasContainer.children[index] : null;
    if (!row) {
      row = document.createElement('div');
      row.className = 'etapa-row';
      row.dataset.index = index;
    } else {
      row.innerHTML = ''; // Limpa apenas o conteúdo interno se já existe
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
        await saveOPChanges(op); // Chama a função restaurada
        await loadEtapasEdit(op, true); // Reload parcial
        await atualizarVisualEtapas(op, produtos);
        await updateFinalizarButtonState(op, produtos);
      });
    } else {
      usuarioSelect.addEventListener('change', debounce(async () => {
        if (op.status === 'finalizado' || op.status === 'cancelada') return;
        const novoUsuario = usuarioSelect.value;
        if (etapa.usuario === novoUsuario) return;
        etapa.usuario = novoUsuario;
        await saveOPChanges(op); // Chama a função restaurada
        if (exigeQuantidade && etapa.usuario && !row.querySelector('.quantidade-lancar')) {
          quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, index === etapaAtualIndex, row, produtos);
          row.appendChild(quantidadeDiv);
        }
        await atualizarVisualEtapas(op, produtos);
        await updateFinalizarButtonState(op, produtos);
      }, 300)); // Debounce para evitar chamadas repetidas
    }

    if (!skipReload) {
      fragment.appendChild(row); // Adiciona ao fragment apenas na primeira carga
    }
  }

  if (!skipReload) {
    etapasContainer.appendChild(fragment); // Adiciona tudo de uma vez ao DOM
  }

  await atualizarVisualEtapas(op, produtos);
  await updateFinalizarButtonState(op, produtos);
}

async function salvarProducao(op, etapa, etapaIndex, produtos) {
  const produto = produtos.find(p => p.nome === op.produto);
  if (!produto) throw new Error(`Produto ${op.produto} não encontrado.`);

  const isKit = produto.tipos && produto.tipos.includes('kits');
  if (isKit) throw new Error(`O produto ${op.produto} é um kit e não possui etapas de produção.`);

  const etapaProduto = produto.etapas?.[etapaIndex];
  if (!etapaProduto) throw new Error(`Etapa ${etapaIndex} não encontrada para o produto ${op.produto}.`);

  if (etapaProduto.processo !== etapa.processo) throw new Error(`Processo ${etapa.processo} não corresponde à etapa ${etapaIndex} do produto ${op.produto}.`);

  const maquina = etapaProduto.maquina;
  if (!maquina) throw new Error(`Máquina não definida para o processo ${etapa.processo} do produto ${op.produto}.`);

  const variacao = op.variante || null;

  const dados = {
    id: Date.now().toString(),
    opNumero: op.numero,
    etapaIndex: etapaIndex,
    processo: etapa.processo,
    produto: op.produto,
    variacao: variacao,
    maquina: maquina,
    quantidade: parseInt(etapa.quantidade) || 0,
    funcionario: etapa.usuario || 'Sistema', // Valor padrão se não houver usuário
    data: new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T'),
    lancadoPor: usuarioLogado?.nome || 'Sistema',
  };
  console.log('[salvarProducao] Dados enviados para o servidor:', dados);

  if (!dados.opNumero) throw new Error('Número da OP não informado.');
  if (dados.etapaIndex === undefined || dados.etapaIndex === null) throw new Error('Índice da etapa não informado.');
  if (!dados.processo) throw new Error('Processo não informado.');
  if (!dados.produto) throw new Error('Produto não informado.');
  if (!dados.maquina) throw new Error('Máquina não informada.');
  if (!dados.quantidade || dados.quantidade <= 0) throw new Error('Quantidade inválida.');
  // Removido o check de funcionário, já que agora tem valor padrão
  if (!dados.data) throw new Error('Data não informada.');
  if (!dados.lancadoPor) throw new Error('Usuário lançador não identificado.');

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
      } else if (responseProducoes.status === 409) {
        mostrarPopupMensagem('Já existe um lançamento para esta OP, etapa e funcionário. Nenhum novo registro foi criado.', 'aviso');
        return null;
      }
      throw new Error(`Erro ao salvar produção: ${error.error || 'Erro desconhecido'}`);
    }

    const producao = await responseProducoes.json();
    return producao.id;
  } catch (error) {
    console.error('[salvarProducao] Erro:', error);
    throw error;
  }
}

async function lancarEtapa(op, etapaIndex, quantidade, produtos) {
  const etapa = op.etapas[etapaIndex];
  etapa.quantidade = parseInt(quantidade);
  const novoId = await salvarProducao(op, etapa, etapaIndex, produtos);
  if (novoId) {
    etapa.ultimoLancamentoId = novoId;
    etapa.lancado = true;
    await saveOPChanges(op);
    await updateFinalizarButtonState(op, produtos);
    return true;
  }
  return false;
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

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
      if (lancarBtn.disabled || lancamentosEmAndamento.has(op.edit_id + '-' + etapa.processo)) return;

      lancamentosEmAndamento.add(op.edit_id + '-' + etapa.processo);
      lancarBtn.disabled = true;
      lancarBtn.textContent = 'Processando...';

      const etapaIndex = parseInt(lancarBtn.dataset.etapaIndex);
      const editId = window.location.hash.split('/')[1];
      const ordensData = await obterOrdensDeProducao(1, true); // Busca todas as OPs
      const ordensDeProducao = ordensData.rows; // Acessa .rows
      const opLocal = ordensDeProducao.find(o => o.edit_id === editId);

      if (!opLocal || !opLocal.etapas || !opLocal.etapas[etapaIndex]) {
        mostrarPopupMensagem('Erro: Ordem de Produção ou etapa não encontrada.', 'erro');
        lancamentosEmAndamento.delete(op.edit_id + '-' + etapa.processo);
        lancarBtn.disabled = false;
        lancarBtn.textContent = 'Lançar';
        return;
      }

      const etapasFuturas = await getEtapasFuturasValidas(opLocal, etapaIndex, produtos);
      try {
        let sucesso = false;
        if (etapasFuturas.length > 0) {
          await mostrarPopupEtapasFuturas(opLocal, etapaIndex, etapasFuturas, quantidadeInput.value, produtos);
          sucesso = true;
        } else {
          const novoId = await lancarEtapa(opLocal, etapaIndex, quantidadeInput.value, produtos);
          if (novoId) sucesso = true;
        }

        if (sucesso) {
          const updatedOrdensData = await obterOrdensDeProducao(1, true);
          const updatedOrdens = updatedOrdensData.rows; // Acessa .rows
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
        }
      } catch (error) {
        console.error('[criarQuantidadeDiv] Erro ao lançar etapa:', error);
        mostrarPopupMensagem('Erro ao lançar produção. Tente novamente.', 'erro');
        lancarBtn.textContent = 'Lançar';
        lancarBtn.disabled = false;
      } finally {
        if (!etapa.lancado) {
          lancamentosEmAndamento.delete(op.edit_id + '-' + etapa.processo);
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
    else quantidadeInput.value = etapa.quantidade || '';
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

function mostrarPopupEtapasFuturas(op, etapaIndex, etapasFuturas, quantidade, produtos) {
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
    document.body.removeChild(popup);
    await loadEtapasEdit(op, true);
    await atualizarVisualEtapas(op, produtos);
    await updateFinalizarButtonState(op, produtos);
  });

  document.body.appendChild(popup);
  validateCheckboxes();
}

async function getTipoUsuarioPorProcesso(processo, produtoNome, produtos) {
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

  if (etapasRows.length !== op.etapas.length) {
    console.error('[atualizarVisualEtapas] Inconsistência entre DOM e dados. Recarregando etapas...');
    const etapasContainer = document.getElementById('etapasContainer');
    etapasContainer.innerHTML = '';
    await loadEtapasEdit(op, false);
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
    await saveOPChanges(op); // Chama a função restaurada
  }
}



async function toggleView() {
  const hash = window.location.hash;
  const opListView = document.getElementById('opListView');
  const opFormView = document.getElementById('opFormView');
  const opEditView = document.getElementById('opEditView');

  if (!opListView || !opFormView || !opEditView) return;

  const ordensData = await obterOrdensDeProducao(1, true); // Sempre busca todas as OPs
  const ordensDeProducao = ordensData.rows; // Sempre acessa .rows

  if (hash.startsWith('#editar/') && permissoes.includes('editar-op')) {
    const editId = hash.split('/')[1];
    const op = ordensDeProducao.find(o => o.edit_id === editId);

    if (!op) {
      console.error(`[toggleView] Ordem de Produção não encontrada para editId: ${editId}`);
      mostrarPopupMensagem('Ordem de Produção não encontrada.', 'erro');
      window.location.hash = '';
      return;
    }

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
      const variantes = op.variante.split(' | ').join(', ');
      editVarianteInput.value = variantes;
      editVarianteContainer.style.display = 'block';
      editVarianteInput.style.width = '100%';
      editVarianteInput.style.boxSizing = 'border-box';
    } else {
      editVarianteContainer.style.display = 'none';
    }

    opListView.style.display = 'none';
    opFormView.style.display = 'none';
    opEditView.style.display = 'block';
    document.getElementById('opNumero').textContent = `OP n°: ${op.numero}`;

    await loadEtapasEdit(op);
  } else if (hash === '#adicionar' && permissoes.includes('criar-op')) {
    opListView.style.display = 'none';
    opFormView.style.display = 'block';
    opEditView.style.display = 'none';
    await loadProdutosSelect();
    setCurrentDate();
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
  } else {
    // Só atualiza se necessário, evitando duplicação na inicialização
    if (window.location.hash !== '') { // Evita refresh ao carregar a página inicial
      limparCacheOrdens(); // Limpa o cache ao voltar para a página principal
      await loadOPTable('todas', '', 'status', 'desc', 1); // Mini-refresh com todas as OPs
    }
    opListView.style.display = 'block';
    opFormView.style.display = 'none';
    opEditView.style.display = 'none';
    const statusFilter = document.getElementById('statusFilter');
    const todasBtn = statusFilter.querySelector('[data-status="todas"]');
    if (todasBtn) {
      statusFilter.querySelectorAll('.status-btn').forEach(btn => btn.classList.remove('active'));
      todasBtn.classList.add('active');
    }
  }
}


document.addEventListener('DOMContentLoaded', async () => {
  const auth = await verificarAutenticacao('ordens-de-producao.html', ['acesso-ordens-de-producao']);
  if (!auth) {
    console.error('[admin-ordens-de-producao] Autenticação falhou');
    return;
  }

  usuarioLogado = auth.usuario;
  permissoes = auth.permissoes || [];

  const ordensData = await obterOrdensDeProducao(1, true); // Busca todas as OPs inicialmente
  const ordensDeProducao = ordensData.rows; // Sempre acessa .rows
  ordensDeProducao.forEach(op => {
    if (op.edit_id) usedIds.add(op.edit_id);
  });

  // Elementos DOM
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

  if ([opListView, opFormView, opEditView, opTableBody, searchOP, statusFilter, opForm,
      produtoOP, quantidadeOP, numeroOP, variantesContainer, variantesSelects, dataEntregaOP,
      observacoesOP, editProdutoOP, editVarianteOP, editVarianteContainer, editQuantidadeOP,
      editDataEntregaOP, etapasContainer, opNumero, finalizarOP, cancelarOP, voltarOP].some(el => !el)) {
    throw new Error('Elementos DOM necessários não encontrados');
  }

  const sortHeaders = {
    'sortStatus': 'status',
    'sortNumero': 'numero',
    'sortProduto': 'produto',
    'sortVariante': 'variante',
    'sortQuantidade': 'quantidade'
  };

  Object.entries(sortHeaders).forEach(([headerId, criterio]) => {
    const header = document.getElementById(headerId);
    if (header) {
      header.addEventListener('click', () => {
        let newOrder = 'asc';
        if (header.dataset.sort === 'asc') {
          newOrder = 'desc';
        } else if (header.dataset.sort === 'desc') {
          newOrder = 'asc';
        } else {
          newOrder = 'asc';
        }
        header.dataset.sort = newOrder;

        Object.keys(sortHeaders).forEach(h => {
          if (h !== headerId) document.getElementById(h).dataset.sort = '';
        });

        const activeStatus = statusFilter.querySelector('.status-btn.active')?.dataset.status || 'todas';
        loadOPTable(activeStatus, searchOP.value, criterio, newOrder);
      });
    }
  });

  const statusHeader = document.getElementById('sortStatus');
  if (statusHeader) statusHeader.dataset.sort = 'desc';

  // Carrega a tabela uma vez na inicialização
  await loadOPTable('todas', '', 'status', 'desc', 1);

  if (statusFilter) {
    statusFilter.querySelectorAll('.status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        statusFilter.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterOPs(1);
      });
    });
  }

  if (searchOP) {
    const debouncedFilterOPs = debounce((page = 1) => filterOPs(page), 300);
    searchOP.addEventListener('input', () => debouncedFilterOPs(1));
  }

  window.addEventListener('hashchange', toggleView);

  const incluirOPBtn = document.getElementById('incluirOP');
  if (incluirOPBtn) {
    incluirOPBtn.disabled = !permissoes.includes('criar-op');
    if (!permissoes.includes('criar-op')) {
      incluirOPBtn.style.opacity = '0.5';
      incluirOPBtn.style.cursor = 'not-allowed';
    } else {
      incluirOPBtn.addEventListener('click', () => {
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

      const ordensData = await obterOrdensDeProducao(1, true);
      const ordensDeProducao = ordensData.rows;
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
        limparCacheOrdens(); // Limpa o cache para garantir dados atualizados
        await loadOPTable('todas', '', 'status', 'desc', 1); // Mini-refresh com todas as OPs
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

  if (finalizarOP) {
    finalizarOP.addEventListener('click', async () => {
      const editId = window.location.hash.split('/')[1];
      const ordensData = await obterOrdensDeProducao(1, true);
      const ordensDeProducao = ordensData.rows; // Acessa .rows
      const op = ordensDeProducao.find(o => o.edit_id === editId);

      if (op && !finalizarOP.disabled) {
        op.status = 'finalizado';
        const agora = new Date();
        agora.setHours(agora.getHours() - 3);
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
      const ordensData = await obterOrdensDeProducao(1, true);
      const ordensDeProducao = ordensData.rows; // Acessa .rows
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
      if (window.location.hash === '') await toggleView();
    });
  }

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
});