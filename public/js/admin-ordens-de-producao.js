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
let isLoadingAbaContent = false; 
let isEditingQuantidade = false;



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

// Função auxiliar (já definida, mas confirmada)
function generateUniquePN() {
  let pn;
  const usedPNs = new Set(); // Garante que os PNs sejam únicos
  do {
      pn = Math.floor(1000 + Math.random() * 9000).toString();
  } while (usedPNs.has(pn));
  usedPNs.add(pn);
  return pn;
}

// Função para atualizar o status de um corte
async function atualizarStatusCorte(id, novoStatus) {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/cortes', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, status: novoStatus }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao atualizar status do corte: ${error.error}`);
  }
  return await response.json();
}

// Função ajustada para mudança no produto
async function handleProdutoChange(e) {
  const produtoNome = e.target.value;
  await loadVariantesSelects(produtoNome); // Apenas carrega as variantes, sem verificar corte
}

// Função verificarCorte ajustada (sem popup imediato)
async function verificarCorte() {
  const produto = document.getElementById('produtoOP').value;
  const varianteSelect = document.querySelector('.variantes-selects select');
  const variante = varianteSelect ? varianteSelect.value : '';

  // Remove a validação com popup aqui; será feita no submit
  const opForm = document.getElementById('opForm');
  const camposDinamicos = [
    document.getElementById('quantidadeOP'),
    document.getElementById('numeroOP'),
    document.getElementById('dataEntregaOP'),
    document.getElementById('observacoesOP')
  ];

  camposDinamicos.forEach(campo => {
    campo.parentElement.style.display = 'none';
  });

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.textContent = 'Buscando...';
  opForm.appendChild(spinner);

  try {
    const cortes = await obterCortes('cortados');
    const corteEncontrado = cortes.find(c => c.produto === produto && c.variante === variante);

    spinner.remove();

    const existingFoiCortado = opForm.querySelector('.grupo-form-op.foi-cortado');
    if (existingFoiCortado) existingFoiCortado.remove();

    if (corteEncontrado) {
      const foiCortadoDiv = document.createElement('div');
      foiCortadoDiv.className = 'grupo-form-op foi-cortado';
      foiCortadoDiv.innerHTML = '<label class="label-small">Foi cortado?</label><input type="text" value="Sim" readonly class="input-numero-novaOP">';
      foiCortadoDiv.dataset.corteId = corteEncontrado.id;
      opForm.insertBefore(foiCortadoDiv, camposDinamicos[0].parentElement);

      camposDinamicos[0].parentElement.style.display = 'block';
      camposDinamicos[0].value = corteEncontrado.quantidade;
      camposDinamicos[0].disabled = true;
      camposDinamicos[0].style.backgroundColor = '#d3d3d3';

      camposDinamicos[1].parentElement.style.display = 'block';
      camposDinamicos[1].value = await getNextOPNumber();

      camposDinamicos[2].parentElement.style.display = 'block';
      setCurrentDate();

      camposDinamicos[3].parentElement.style.display = 'block';
      camposDinamicos[3].value = '';
    } else {
      const pn = generateUniquePN();
      const foiCortadoDiv = document.createElement('div');
      foiCortadoDiv.className = 'grupo-form-op foi-cortado';
      foiCortadoDiv.innerHTML = `<label class="label-small">Foi cortado?</label><input type="text" value="Pedido de corte: ${pn}" readonly class="input-numero-novaOP">`;
      opForm.insertBefore(foiCortadoDiv, camposDinamicos[0].parentElement);

      camposDinamicos[0].parentElement.style.display = 'block';
      camposDinamicos[0].value = '';
      camposDinamicos[0].disabled = false;
      camposDinamicos[0].style.backgroundColor = '';

      camposDinamicos[1].parentElement.style.display = 'block';
      camposDinamicos[1].value = await getNextOPNumber();

      camposDinamicos[2].parentElement.style.display = 'block';
      setCurrentDate();

      camposDinamicos[3].parentElement.style.display = 'block';
      camposDinamicos[3].value = '';
    }
  } catch (error) {
    console.error('[verificarCorte] Erro:', error);
    spinner.remove();
  }
}

export function limparCacheProdutos() {
  produtosCache = null;
  localStorage.removeItem('produtosCacheData');
  console.log('[obterProdutos] Cache de produtos limpo');
}

window.limparCacheProdutos = limparCacheProdutos;


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

async function obterOrdensDeProducao(page = 1, fetchAll = false, forceUpdate = false, statusFilter = null) {
  const cacheKey = `ordensCacheData_${fetchAll ? 'all' : `page_${page}${statusFilter ? `_${statusFilter}` : ''}`}`;
  const cachedData = localStorage.getItem(cacheKey);

  if (!forceUpdate && !fetchAll && cachedData) {
    try {
      const { ordens, timestamp, total, pages } = JSON.parse(cachedData);
      const now = Date.now();
      const cacheDuration = 15 * 60 * 1000;
      if (now - timestamp < cacheDuration) {
        ordensCache = { rows: ordens, total, pages };
        console.log(`[obterOrdensDeProducao] Retornando ordens do localStorage para ${fetchAll ? 'todas' : `página ${page}${statusFilter ? `_${statusFilter}` : ''}`}`);
        return ordensCache;
      }
    } catch (error) {
      console.error('[obterOrdensDeProducao] Cache corrompido, limpando:', error);
      localStorage.removeItem(cacheKey);
    }
  }

  if (!forceUpdate && !fetchAll && ordensCache && !statusFilter) {
    console.log(`[obterOrdensDeProducao] Retornando ordens do cache para página ${page}`);
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
        : `/api/ordens-de-producao?page=${page}&limit=${itemsPerPage}${statusFilter ? `&status=${statusFilter}` : ''}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Erro ao carregar ordens de produção');
      const data = await response.json();

      // Garantir que o retorno seja sempre um objeto com rows, total, pages
      ordensCache = {
        rows: Array.isArray(data) ? data : data.rows || [],
        total: data.total || (Array.isArray(data) ? data.length : data.rows.length),
        pages: data.pages || (fetchAll ? Math.ceil((data.total || data.rows.length) / itemsPerPage) : 1),
      };

      if (!fetchAll) {
        const cacheData = {
          ordens: ordensCache.rows,
          timestamp: Date.now(),
          total: ordensCache.total,
          pages: ordensCache.pages,
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      }
      console.log(`[obterOrdensDeProducao] Ordens buscadas e armazenadas: ${fetchAll ? 'todas' : `página ${page}${statusFilter ? `_${statusFilter}` : ''}`}`);
      return ordensCache;
    })();

    return await ordensPromise;
  } catch (error) {
    console.error('[obterOrdensDeProducao] Erro ao buscar ordens:', error);
    throw error;
  } finally {
    ordensPromise = null;
  }
}

export function limparCacheOrdens() {
  ordensCache = null;
  localStorage.removeItem('ordensCacheData');
  console.log('[obterOrdensDeProducao] Cache de ordens limpo');
}

// Adicione isso após a função limparCacheOrdens
export function limparCacheCortes() {
  localStorage.removeItem('cortesCacheData');
  console.log('[limparCacheCortes] Cache de cortes limpo');
}

// Expondo a função globalmente para o console
window.limparCacheOrdens = limparCacheOrdens;

async function salvarOrdemDeProducao(ordem) {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Token de autenticação não encontrado. Faça login novamente.');
  }

  console.log('[salvarOrdemDeProducao] Dados enviados:', ordem);

  const response = await fetch('/api/ordens-de-producao', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ordem),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[salvarOrdemDeProducao] Resposta do servidor:', errorText);
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido do servidor' }));
    throw new Error(`Erro ao salvar ordem de produção: ${error.error || 'Erro interno no servidor'}`);
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

// Função para carregar produtos no select
async function loadProdutosSelect() {
  const produtoSelect = document.getElementById('produtoOP');
  if (!produtoSelect) return;

  produtoSelect.disabled = true;
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

    produtoSelect.disabled = false;

    produtoSelect.removeEventListener('change', handleProdutoChange);
    produtoSelect.addEventListener('change', handleProdutoChange);
  } catch (error) {
    console.error('[loadProdutosSelect] Erro ao carregar produtos:', error);
    produtoSelect.innerHTML = '<option value="">Erro ao carregar produtos</option>';
    produtoSelect.disabled = false;
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

    // Adiciona evento para verificar corte ao selecionar variação
    select.addEventListener('change', async () => {
      await verificarCorte(); // Chama verificarCorte, mas sem popup imediato
    });
  } else {
    variantesContainer.style.display = 'none';
  }
}

async function getNextOPNumber() {
  try {
    const token = localStorage.getItem('token');
    // Usa o novo parâmetro getNextNumber para buscar todos os números
    const timestamp = Date.now();
    const response = await fetch(`/api/ordens-de-producao?getNextNumber=true&_=${timestamp}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao carregar números de OPs: ${errorText}`);
    }

    const numeros = await response.json(); // Recebe apenas os números
    const parsedNumeros = numeros.map(n => parseInt(n)).filter(n => !isNaN(n));
    const maxNumero = parsedNumeros.length > 0 ? Math.max(...parsedNumeros) : 0;
    const nextNumero = (maxNumero + 1).toString();
    console.log('[getNextOPNumber] Próximo número de OP gerado:', nextNumero);
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

async function loadOPTable(filterStatus = 'todas', search = '', sortCriterio = 'status', sortOrdem = 'desc', page = 1, forceUpdate = false, statusFilter = null) {
  const opTableBody = document.getElementById('opTableBody');
  if (!opTableBody) {
    console.error('[loadOPTable] opTableBody não encontrado no DOM');
    return;
  }

  const paginationContainer = document.createElement('div');
  paginationContainer.id = 'paginationContainer';
  paginationContainer.className = 'pagination-container';

  if (opTableBody.dataset.isLoading) {
    console.log('[loadOPTable] Já está carregando, ignorando chamada');
    return;
  }
  opTableBody.dataset.isLoading = 'true';

  if (!opTableBody.dataset.rendered) {
    opTableBody.innerHTML = '<tr><td colspan="5"><div class="spinner">Carregando ordens...</div></td></tr>';
  }

  try {
    console.log('[loadOPTable] Iniciando carregamento da tabela');
    const data = await obterOrdensDeProducao(page, filterStatus === 'todas', forceUpdate, statusFilter);
    if (!data || !data.rows) {
      throw new Error('Dados inválidos retornados por obterOrdensDeProducao');
    }

    let ordensDeProducao = data.rows;
    let totalItems = data.total || ordensDeProducao.length;
    let totalPages = data.pages || Math.ceil(totalItems / itemsPerPage);

    console.log('[loadOPTable] Ordens recebidas:', ordensDeProducao.length, 'Dados brutos:', ordensDeProducao, 'Total:', totalItems, 'Páginas:', totalPages);

    const ordensUnicas = [];
    const numerosVistos = new Set();
    ordensDeProducao.forEach(op => {
      if (!numerosVistos.has(op.numero)) {
        numerosVistos.add(op.numero);
        ordensUnicas.push(op);
      }
    });
    console.log('[loadOPTable] Ordens únicas após deduplicação:', ordensUnicas.length);

    let filteredOPs = [...ordensUnicas];

    // Para filtros específicos (não "todas"), confie nos dados paginados do backend
    if (filterStatus !== 'todas') {
      filteredOPs = filteredOPs.filter(op => op.status === filterStatus); // Filtro de segurança
      // Não recalcula totalItems e totalPages aqui; usa os valores do backend
    }

    console.log('[loadOPTable] Após filtro de status:', filteredOPs.length, 'Filtro aplicado:', filterStatus);

    // Aplica filtro de busca
    filteredOPs = filteredOPs.filter(op => {
      const matchesProduto = op.produto?.toLowerCase().includes(search.toLowerCase()) || false;
      const matchesNumero = op.numero.toString().includes(search);
      const matchesVariante = op.variante?.toLowerCase().includes(search.toLowerCase()) || false;
      return matchesProduto || matchesNumero || matchesVariante;
    });
    console.log('[loadOPTable] Após filtro de busca:', filteredOPs.length, 'Busca:', search);

    // Ordena os itens
    filteredOPs = ordenarOPs(filteredOPs, sortCriterio, sortOrdem);
    console.log('[loadOPTable] Após ordenação:', filteredOPs.length);

    // Define os itens paginados
    let paginatedOPs;
    if (filterStatus === 'todas') {
      // Para "todas", pagina localmente após filtros
      totalItems = filteredOPs.length;
      totalPages = Math.ceil(totalItems / itemsPerPage);
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
      paginatedOPs = filteredOPs.slice(startIndex, endIndex);
    } else {
      // Para outros filtros, usa os dados paginados do backend diretamente
      paginatedOPs = filteredOPs;
      // totalItems e totalPages já vêm do backend
    }

    filteredOPsGlobal = filteredOPs;

    console.log('[loadOPTable] Itens paginados:', paginatedOPs.length, 'Página:', page, 'Total de páginas:', totalPages);

    if (paginatedOPs.length === 0 && totalItems > 0 && page > totalPages) {
      console.log('[loadOPTable] Página fora do intervalo, ajustando para a primeira página');
      return loadOPTable(filterStatus, search, sortCriterio, sortOrdem, 1, forceUpdate, statusFilter);
    }

    const fragment = document.createDocumentFragment();
    if (paginatedOPs.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5" style="text-align: center; padding: 20px;">Nenhuma ordem encontrada com os filtros atuais.</td>';
      fragment.appendChild(tr);
    } else {
      paginatedOPs.forEach((op, index) => {
        if (!op.edit_id) {
          op.edit_id = generateUniqueId();
          usedIds.add(op.edit_id);
        }
        const tr = document.createElement('tr');
        tr.dataset.index = index; // Mantém o index para referência local
        tr.dataset.numero = op.numero || `OP-${op.id}`; // Fallback caso numero esteja ausente
        tr.style.cursor = permissoes.includes('editar-op') ? 'pointer' : 'default';
        tr.innerHTML = `
          <td><span class="status-bolinha status-${op.status} ${op.status === 'produzindo' ? 'blink' : ''}"></span></td>
          <td>${op.numero || 'N/A'}</td>
          <td>${op.produto || 'N/A'}</td>
          <td>${op.variante || '-'}</td>
          <td>${op.quantidade || 0}</td>
        `;
        fragment.appendChild(tr);
      });
    }

    while (opTableBody.firstChild) {
      opTableBody.removeChild(opTableBody.firstChild);
    }
    opTableBody.appendChild(fragment);
    opTableBody.dataset.rendered = 'true';
    console.log('[loadOPTable] Tabela atualizada com sucesso');

    opTableBody.removeEventListener('click', handleOPTableClick);
    if (permissoes.includes('editar-op')) {
      opTableBody.addEventListener('click', handleOPTableClick);
    }

    let paginationHTML = '';
    if (totalPages > 1) {
      paginationHTML += `<button class="pagination-btn prev" data-page="${Math.max(1, page - 1)}" ${page === 1 ? 'disabled' : ''}>Anterior</button>`;
      paginationHTML += `<span class="pagination-current">Pág. ${page} de ${totalPages}</span>`;
      paginationHTML += `<button class="pagination-btn next" data-page="${Math.min(totalPages, page + 1)}" ${page === totalPages ? 'disabled' : ''}>Próximo</button>`;
    } else {
      console.log('[loadOPTable] Total de páginas <= 1, não exibindo paginação');
    }

    paginationContainer.innerHTML = paginationHTML;
    const existingPagination = document.getElementById('paginationContainer');
    if (existingPagination) {
      existingPagination.replaceWith(paginationContainer);
    } else {
      opTableBody.parentElement.parentElement.appendChild(paginationContainer);
    }

    document.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newPage = parseInt(btn.dataset.page);
        loadOPTable(filterStatus, search, sortCriterio, sortOrdem, newPage, forceUpdate, statusFilter);
      });
    });

  } catch (error) {
    console.error('[loadOPTable] Erro ao carregar ordens de produção:', error);
    opTableBody.innerHTML = '<tr><td colspan="5">Erro ao carregar ordens de produção. Tente novamente.</td></tr>';
    opTableBody.dataset.rendered = 'true';
  } finally {
    delete opTableBody.dataset.isLoading;
    console.log('[loadOPTable] Carregamento concluído');
  }
}


function handleOPTableClick(e) {
  const tr = e.target.closest('tr');
  if (tr) {
    const numero = tr.dataset.numero; // Usa o número da OP diretamente da linha
    if (numero) {
      // Busca a OP correta em todas as ordens, independentemente da página
      obterOrdensDeProducao(1, true).then(data => {
        const ordensDeProducao = data.rows;
        const op = ordensDeProducao.find(o => o.numero === numero);
        if (op) {
          window.location.hash = `#editar/${op.edit_id}`;
        } else {
          console.error('[handleOPTableClick] Ordem não encontrada para o número:', numero);
          mostrarPopupMensagem('Ordem de Produção não encontrada.', 'erro');
        }
      }).catch(error => {
        console.error('[handleOPTableClick] Erro ao buscar ordens:', error);
        mostrarPopupMensagem('Erro ao carregar ordem. Tente novamente.', 'erro');
      });
    } else {
      console.error('[handleOPTableClick] Número da OP não encontrado na linha.');
    }
  }
}

function filterOPs(page = 1) {
  const statusFilter = document.getElementById('statusFilter');
  const searchOP = document.getElementById('searchOP');
  const activeStatus = statusFilter.querySelector('.status-btn.active')?.dataset.status || 'todas';
  const sortCriterio = document.querySelector('.tabela-op th[data-sort]')?.id.replace('sort', '') || 'status';
  const sortOrdem = document.querySelector('.tabela-op th[data-sort]')?.dataset.sort || 'desc';
  
  // Passa o status como parâmetro para o backend, exceto para 'todas'
  const statusToFetch = activeStatus === 'todas' ? null : activeStatus;
  loadOPTable(activeStatus, searchOP.value, sortCriterio, sortOrdem, page, true, statusToFetch);
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
      // Exceção para a etapa "Corte": não exige quantidade
      const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
      const isCorte = etapa.processo === 'Corte';
      const etapaCompleta = etapa.usuario && (isCorte ? etapa.lancado : (!exigeQuantidade || (etapa.lancado && etapa.quantidade > 0)));
      
      // Log para depuração
      console.log('[updateFinalizarButtonState] Etapa:', etapa.processo, {
        usuario: etapa.usuario,
        lancado: etapa.lancado,
        quantidade: etapa.quantidade,
        tipoUsuario,
        exigeQuantidade,
        isCorte,
        etapaCompleta
      });

      if (!etapaCompleta) {
        todasEtapasCompletas = false;
        break;
      }
    }
  } else {
    todasEtapasCompletas = false;
  }

  const podeFinalizar = camposPrincipaisPreenchidos && todasEtapasCompletas && op.status !== 'finalizado' && op.status !== 'cancelada';
  console.log('[updateFinalizarButtonState] Pode finalizar:', podeFinalizar);
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

  console.log('[loadEtapasEdit] Etapas carregadas da OP:', op.etapas);

  if (!skipReload) {
    etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';
  }

  const produtos = await obterProdutos();
  const responseUsuarios = await fetch('/api/usuarios', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
  });
  const usuarios = await responseUsuarios.json();

  const todasEtapasCompletas = await verificarEtapasEStatus(op, produtos);
  if (op.status === 'finalizado' && !todasEtapasCompletas) {
    op.status = 'produzindo';
    await saveOPChanges(op);
  }

  const etapaAtualIndex = await determinarEtapaAtual(op, produtos);
  console.log(`[loadEtapasEdit] Etapa atual index calculada: ${etapaAtualIndex}`);

  const tiposUsuarios = await Promise.all(
    op.etapas.map(async (etapa) => ({
      processo: etapa.processo,
      tipoUsuario: await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos),
    }))
  );

  if (!skipReload) {
    etapasContainer.innerHTML = '';
  }

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < op.etapas.length; index++) {
    const etapa = op.etapas[index];

    let row = skipReload ? etapasContainer.children[index] : null;
    if (!row) {
      row = document.createElement('div');
      row.className = 'etapa-row';
      row.dataset.index = index;

      // Criar elementos iniciais apenas se a linha é nova
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
    } else {
      // Não limpar o conteúdo da row, apenas atualizar elementos existentes
      const numero = row.querySelector('.etapa-numero');
      if (numero) numero.textContent = index + 1;

      const processo = row.querySelector('.etapa-processo');
      if (processo) processo.value = etapa.processo;
    }

    // Lógica específica para a etapa "Corte"
    if (etapa.processo === 'Corte') {
      let usuarioStatusInput = row.querySelector('.etapa-usuario-status');
      if (!usuarioStatusInput) {
        usuarioStatusInput = document.createElement('input');
        usuarioStatusInput.type = 'text';
        usuarioStatusInput.className = 'etapa-usuario-status';
        usuarioStatusInput.readOnly = true;
        usuarioStatusInput.style.backgroundColor = '#d3d3d3';
        usuarioStatusInput.style.marginRight = '5px';
        row.appendChild(usuarioStatusInput);
      }

      let usuarioNomeInput = row.querySelector('.etapa-usuario-nome');
      if (!usuarioNomeInput) {
        usuarioNomeInput = document.createElement('input');
        usuarioNomeInput.type = 'text';
        usuarioNomeInput.className = 'etapa-usuario-nome';
        usuarioNomeInput.readOnly = true;
        usuarioNomeInput.style.backgroundColor = '#d3d3d3';
        row.appendChild(usuarioNomeInput);
      }

      if (op.status !== 'finalizado' && op.status !== 'cancelada' && index === etapaAtualIndex && !etapa.usuario) {
        const cortes = await obterCortes('cortados');
        const corteEncontrado = cortes.find(c => c.op === op.numero && c.processo === 'Corte');
        if (corteEncontrado) {
          etapa.usuario = corteEncontrado.cortador;
          etapa.lancado = true;
          await saveOPChanges(op);
        } else {
          const cortesPendentes = await obterCortes('pendente');
          const cortePendente = cortesPendentes.find(c => c.op === op.numero && c.processo === 'Corte');
          if (cortePendente) {
            etapa.usuario = cortePendente.cortador;
            await saveOPChanges(op);
          } else {
            const cortesVerificados = await obterCortes('verificado');
            const corteVerificado = cortesVerificados.find(c => c.op === op.numero && c.processo === 'Corte');
            if (corteVerificado) {
              etapa.usuario = corteVerificado.cortador;
              etapa.lancado = true;
              await saveOPChanges(op);
            }
          }
        }
        usuarioStatusInput.value = etapa.lancado ? 'Corte Realizado' : 'Aguardando corte';
        usuarioNomeInput.value = etapa.usuario || '';
      } else if (etapa.lancado) {
        usuarioStatusInput.value = 'Corte Realizado';
        usuarioNomeInput.value = etapa.usuario || '';
      }
    } else {
      // Para todas as outras etapas (não "Corte")
      let usuarioSelect = row.querySelector('.select-usuario');
      if (!usuarioSelect) {
        usuarioSelect = document.createElement('select');
        usuarioSelect.className = 'select-usuario';
        row.appendChild(usuarioSelect);
      }
      usuarioSelect.disabled = op.status === 'finalizado' || op.status === 'cancelada' || index > etapaAtualIndex;

      const tipoUsuario = tiposUsuarios[index].tipoUsuario;
      usuarioSelect.innerHTML = ''; // Limpa opções existentes
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

      const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';

      // Garantir que quantidadeDiv seja preservado ou criado
      let quantidadeDiv = row.querySelector('.quantidade-lancar');
      if (exigeQuantidade && etapa.usuario && !quantidadeDiv) {
        quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, index === etapaAtualIndex, row, produtos);
        row.appendChild(quantidadeDiv);
      } else if (quantidadeDiv) {
        // Atualizar o estado do quantidadeDiv existente
        const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
        const lancarBtn = quantidadeDiv.querySelector('.botao-lancar');
        if (quantidadeInput) {
          quantidadeInput.value = etapa.quantidade || '';
          quantidadeInput.disabled = !index === etapaAtualIndex || etapa.lancado || !usuarioSelect.value;
        }
        if (lancarBtn) {
          lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
          lancarBtn.disabled = !permissoes.includes('lancar-producao') || !usuarioSelect.value || !quantidadeInput.value || parseInt(quantidadeInput.value) <= 0 || etapa.lancado;
          if (etapa.lancado) lancarBtn.classList.add('lancado');
        }
      }

      usuarioSelect.removeEventListener('change', usuarioSelect.changeHandler); // Remove handler antigo
      usuarioSelect.changeHandler = debounce(async () => {
        if (op.status === 'finalizado' || op.status === 'cancelada') return;
        const novoUsuario = usuarioSelect.value;
        if (etapa.usuario === novoUsuario) return;

        etapa.usuario = novoUsuario;
        await saveOPChanges(op);

        if (exigeQuantidade && !row.querySelector('.quantidade-lancar')) {
          const quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, index === etapaAtualIndex, row, produtos);
          row.appendChild(quantidadeDiv);
        }

        await atualizarVisualEtapas(op, produtos);
        await updateFinalizarButtonState(op, produtos);
      }, 300);
      usuarioSelect.addEventListener('change', usuarioSelect.changeHandler);
    }

    if (!skipReload) {
      fragment.appendChild(row);
    }
  }

  if (!skipReload) {
    etapasContainer.appendChild(fragment);
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

    // Atualiza visualmente a etapa atual sem remover os campos
    const row = document.querySelector(`.etapa-row[data-index="${etapaIndex}"]`);
    if (row) {
      const quantidadeDiv = row.querySelector('.quantidade-lancar');
      if (quantidadeDiv) {
        const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
        const lancarBtn = quantidadeDiv.querySelector('.botao-lancar');

        if (quantidadeInput && lancarBtn) {
          quantidadeInput.disabled = true; // Desabilita o input de quantidade
          quantidadeInput.style.backgroundColor = '#d3d3d3'; // Deixa cinza para indicar que está concluído
          lancarBtn.textContent = 'Lançado'; // Muda o texto para "Lançado"
          lancarBtn.disabled = true; // Desabilita o botão
          lancarBtn.classList.add('lancado'); // Adiciona classe para estilização
        }
      }
    }

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

  let lancarBtn = quantidadeDiv.querySelector('.botao-lancar') || document.createElement('button');
  lancarBtn.className = 'botao-lancar';
  lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
  const podeLancar = permissoes.includes('lancar-producao');

  quantidadeDiv.appendChild(quantidadeInput);
  quantidadeDiv.appendChild(lancarBtn);

  const updateLancarBtn = async () => {
    const etapaAtualIndex = await determinarEtapaAtual(op, produtos);
    const isCurrentEtapa = op.etapas.indexOf(etapa) === etapaAtualIndex;
    quantidadeInput.disabled = !isCurrentEtapa || etapa.lancado || !usuarioSelect.value;
    lancarBtn.disabled = !podeLancar || !usuarioSelect.value || !quantidadeInput.value || parseInt(quantidadeInput.value) <= 0 || !isCurrentEtapa || etapa.lancado;
    lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
    lancarBtn.dataset.etapaIndex = op.etapas.indexOf(etapa);

    if (!podeLancar) {
      lancarBtn.style.opacity = '0.5';
      lancarBtn.style.cursor = 'not-allowed';
    }

    lancarBtn.removeEventListener('click', lancarBtnClickHandler);
    lancarBtn.addEventListener('click', lancarBtnClickHandler);
  };

  const lancarBtnClickHandler = async () => {
    if (lancarBtn.disabled || lancamentosEmAndamento.has(op.edit_id + '-' + etapa.processo)) return;
  
    lancamentosEmAndamento.add(op.edit_id + '-' + etapa.processo);
    lancarBtn.disabled = true;
    lancarBtn.textContent = 'Processando...';
  
    const etapaIndex = parseInt(lancarBtn.dataset.etapaIndex);
    const editId = window.location.hash.split('/')[1];
    const ordensData = await obterOrdensDeProducao(1, true);
    const ordensDeProducao = ordensData.rows;
    const opLocal = ordensDeProducao.find(o => o.edit_id === editId);
  
    if (!opLocal || !opLocal.etapas || !opLocal.etapas[etapaIndex]) {
      mostrarPopupMensagem('Erro: Ordem de Produção ou etapa não encontrada.', 'erro');
      lancamentosEmAndamento.delete(op.edit_id + '-' + etapa.processo);
      lancarBtn.disabled = false;
      lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
      return;
    }
  
    const etapasFuturas = await getEtapasFuturasValidas(opLocal, etapaIndex, produtos);
    try {
      let sucesso = false;
      if (etapasFuturas.length > 0) {
        await mostrarPopupEtapasFuturas(opLocal, etapaIndex, etapasFuturas, quantidadeInput.value, produtos);
        sucesso = true;
      } else {
        sucesso = await lancarEtapa(opLocal, etapaIndex, quantidadeInput.value, produtos);
      }
  
      if (sucesso) {
        const updatedOrdensData = await obterOrdensDeProducao(1, true);
        const updatedOrdens = updatedOrdensData.rows;
        const updatedOp = updatedOrdens.find(o => o.edit_id === editId);
        if (updatedOp) {
          Object.assign(opLocal, updatedOp);
          etapa.lancado = true;
          quantidadeInput.disabled = true;
          quantidadeInput.style.backgroundColor = '#d3d3d3';
          lancarBtn.textContent = 'Lançado';
          lancarBtn.disabled = true;
          lancarBtn.classList.add('lancado');
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
      lancarBtn.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
      lancarBtn.disabled = false;
    } finally {
      lancamentosEmAndamento.delete(op.edit_id + '-' + etapa.processo);
    }
  };

  usuarioSelect.addEventListener('change', async () => {
    if (op.status === 'finalizado' || op.status === 'cancelada') return;
    const novoUsuario = usuarioSelect.value;
    if (etapa.usuario === novoUsuario) return;
    etapa.usuario = novoUsuario;
    await saveOPChanges(op);
    await updateLancarBtn(); // Atualiza o estado do input após mudar o usuário
    if (!quantidadeInput.disabled) quantidadeInput.focus();
    await atualizarVisualEtapas(op, produtos);
    await updateFinalizarButtonState(op, produtos);
  });

  const handleInputChange = async () => {
    console.log('[handleInputChange] Início - Etapa:', etapa.processo, 'Valor atual do input:', quantidadeInput.value, 'Estado da etapa:', etapa);
    const etapaAtualIndex = await determinarEtapaAtual(op, produtos);
    const isCurrentEtapa = op.etapas.indexOf(etapa) === etapaAtualIndex;
    if (etapa.lancado || !isCurrentEtapa) {
      console.log('[handleInputChange] Etapa lançada ou não é a atual - Mantendo valor:', etapa.quantidade || '');
      quantidadeInput.value = etapa.quantidade || '';
      return;
    }
    const novaQuantidade = parseInt(quantidadeInput.value) || 0;
    console.log('[handleInputChange] Nova quantidade digitada:', novaQuantidade);
    if (novaQuantidade !== etapa.quantidade) {
      etapa.quantidade = novaQuantidade;
      await saveOPChanges(op);
      console.log('[handleInputChange] Após salvar - Etapa atualizada:', etapa);
      await updateLancarBtn();
      await atualizarVisualEtapas(op, produtos);
    }
  };

  const debouncedHandleInputChange = debounce(handleInputChange, 200);
  quantidadeInput.addEventListener('input', (e) => {
    console.log('[quantidadeInput:input] Evento disparado - Valor digitado:', e.target.value, 'Timestamp:', Date.now());
    debouncedHandleInputChange();
  });

  updateLancarBtn(); // Inicializa o estado do botão e input

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
  if (isEditingQuantidade) {
    console.log('[atualizarVisualEtapas] Ignorando atualização durante edição de quantidade');
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
    const quantidadeDiv = row.querySelector('.quantidade-lancar');
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
      if (usuarioSelect) usuarioSelect.disabled = true;
      if (quantidadeDiv) {
        const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
        const botaoLancar = quantidadeDiv.querySelector('.botao-lancar');
        if (quantidadeInput) {
          quantidadeInput.disabled = true;
          quantidadeInput.style.backgroundColor = '#d3d3d3';
        }
        if (botaoLancar) {
          botaoLancar.disabled = true;
          botaoLancar.textContent = 'Lançado';
          botaoLancar.classList.add('lancado');
        }
      }
    } else if (index === etapaAtualIndex && op.status !== 'finalizado' && op.status !== 'cancelada') {
      if (usuarioSelect) usuarioSelect.disabled = false;
      if (quantidadeDiv) {
        const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
        const botaoLancar = quantidadeDiv.querySelector('.botao-lancar');
        if (quantidadeInput) {
          quantidadeInput.disabled = !usuarioSelect || !usuarioSelect.value || etapa.lancado;
        }
        if (botaoLancar) {
          botaoLancar.disabled = !permissoes.includes('lancar-producao') || !usuarioSelect.value || !quantidadeInput.value || parseInt(quantidadeInput.value) <= 0 || etapa.lancado;
          botaoLancar.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
          if (etapa.lancado) botaoLancar.classList.add('lancado');
        }
      } else if (exigeQuantidade && etapa.usuario && usuarioSelect) {
        quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, true, row, produtos);
        row.appendChild(quantidadeDiv);
      }
    } else {
      if (usuarioSelect) usuarioSelect.disabled = true;
      if (quantidadeDiv) {
        const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
        const botaoLancar = quantidadeDiv.querySelector('.botao-lancar');
        if (quantidadeInput) {
          quantidadeInput.disabled = true;
        }
        if (botaoLancar) {
          botaoLancar.disabled = true;
          botaoLancar.textContent = etapa.lancado ? 'Lançado' : 'Lançar';
          if (etapa.lancado) botaoLancar.classList.add('lancado');
        }
      }
    }
  }

  if (op.status !== 'finalizado' && op.status !== 'cancelada') {
    op.status = op.etapas.some(e => e.usuario || e.quantidade) ? 'produzindo' : 'em-aberto';
    await saveOPChanges(op);
  }
}

// Função para limpar o formulário de OP
function limparFormularioOP() {
  const opForm = document.getElementById('opForm');
  if (!opForm) return;

  // Limpar campos de entrada
  document.getElementById('produtoOP').value = '';
  document.getElementById('quantidadeOP').value = '';
  document.getElementById('numeroOP').value = '';
  document.getElementById('dataEntregaOP').value = '';
  document.getElementById('observacoesOP').value = '';

  // Remover campo "Foi cortado?" se existir
  const foiCortadoDiv = opForm.querySelector('.foi-cortado');
  if (foiCortadoDiv) foiCortadoDiv.remove();

  // Limpar e esconder variantes
  const variantesContainer = document.getElementById('variantesContainer');
  const variantesSelects = document.querySelector('.variantes-selects');
  if (variantesContainer && variantesSelects) {
    variantesSelects.innerHTML = '';
    variantesContainer.style.display = 'none';
  }

  // Restaurar estado inicial dos campos dinâmicos
  const camposDinamicos = [
    document.getElementById('quantidadeOP'),
    document.getElementById('numeroOP'),
    document.getElementById('dataEntregaOP'),
    document.getElementById('observacoesOP')
  ];
  camposDinamicos.forEach(campo => {
    campo.parentElement.style.display = 'none';
    if (campo.id === 'quantidadeOP') {
      campo.disabled = false;
      campo.style.backgroundColor = '';
    }
  });
}

// Função movida para o escopo global
function setCurrentDateForCorte() {
  const dataCorte = document.getElementById('dataCorte');
  if (dataCorte) {
    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    dataCorte.value = hoje;
  }
}

async function toggleView() {
  const opListView = document.getElementById('opListView');
  const opFormView = document.getElementById('opFormView');
  const opEditView = document.getElementById('opEditView');
  const corteView = document.getElementById('corteView');
  const acessocortesView = document.getElementById('acessocortesView');

  [opListView, opFormView, opEditView, corteView, acessocortesView].forEach(section => {
    section.style.display = 'none';
  });

  const hash = window.location.hash;

  if (hash.startsWith('#editar/') && permissoes.includes('editar-op')) {
    try {
      const editId = hash.split('/')[1];
      if (!editId) {
        mostrarPopupMensagem('ID da Ordem de Produção não encontrado na URL.', 'erro');
        window.location.hash = '';
        return;
      }

      limparCacheProdutos();
      const ordensData = await obterOrdensDeProducao(1, true);
      const ordensDeProducao = ordensData.rows || [];
      if (!Array.isArray(ordensDeProducao)) {
        throw new Error('Dados de ordens inválidos retornados pela API.');
      }

      const op = ordensDeProducao.find(o => o.edit_id === editId) || ordensDeProducao.find(o => o.numero === editId);
      if (!op) {
        mostrarPopupMensagem('Ordem de Produção não encontrada.', 'erro');
        window.location.hash = '';
        return;
      }

      const editProdutoOP = document.getElementById('editProdutoOP');
      const editQuantidadeInput = document.getElementById('editQuantidadeOP');
      const editDataEntregaInput = document.getElementById('editDataEntregaOP');
      const editVarianteContainer = document.getElementById('editVarianteContainer');
      const editVarianteInput = document.getElementById('editVarianteOP');
      const opNumeroElement = document.getElementById('opNumero');

      if (!editProdutoOP || !editQuantidadeInput || !editDataEntregaInput || !editVarianteContainer || !editVarianteInput || !opNumeroElement) {
        throw new Error('Elementos da tela de edição não encontrados no DOM.');
      }

      editProdutoOP.value = op.produto || '';
      editQuantidadeInput.value = op.quantidade || '';
      editQuantidadeInput.disabled = true;
      editQuantidadeInput.style.backgroundColor = '#d3d3d3';
      const dataEntrega = op.data_entrega ? new Date(op.data_entrega).toISOString().split('T')[0] : '';
      editDataEntregaInput.value = dataEntrega;
      editDataEntregaInput.readOnly = true;
      editDataEntregaInput.style.backgroundColor = '#d3d3d3';

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
      opNumeroElement.textContent = `OP n°: ${op.numero}`;

      await loadEtapasEdit(op, true);
    } catch (error) {
      console.error('[toggleView] Erro ao carregar tela de edição:', error);
      mostrarPopupMensagem(`Erro ao carregar detalhes da OP: ${error.message}. Tente novamente.`, 'erro');
      window.location.hash = '';
    }
  } else if (hash === '#adicionar' && permissoes.includes('criar-op')) {
    opListView.style.display = 'none';
    opFormView.style.display = 'block';
    opEditView.style.display = 'none';
    limparFormularioOP();
    await loadProdutosSelect();
    setCurrentDate();
    document.getElementById('numeroOP').value = await getNextOPNumber();
    await loadVariantesSelects('');
  } else if (hash === '#corte' && permissoes.includes('criar-op')) {
    opListView.style.display = 'none';
    opFormView.style.display = 'none';
    opEditView.style.display = 'none';
    corteView.style.display = 'block';

    limparFormularioCorte();
    await loadProdutosCorte();
    setCurrentDateForCorte();

    const produtoCorte = document.getElementById('produtoCorte');
    if (produtoCorte) {
      produtoCorte.removeEventListener('change', loadVariantesCorteHandler);
      loadVariantesCorteHandler = async (e) => {
        const produtoNome = e.target.value;
        if (produtoNome) await loadVariantesCorte(produtoNome);
      };
      produtoCorte.addEventListener('change', loadVariantesCorteHandler);
      await loadVariantesCorte('');
    }
  } else if (hash === '#acessocortes' && permissoes.includes('acesso-ordens-de-producao')) {
    opListView.style.display = 'none';
    opFormView.style.display = 'none';
    opEditView.style.display = 'none';
    acessocortesView.style.display = 'block';
    await loadAcessocortes();
  } else {
    opListView.style.display = 'block';
    opFormView.style.display = 'none';
    opEditView.style.display = 'none';
    const statusFilter = document.getElementById('statusFilter');
    const todasBtn = statusFilter.querySelector('[data-status="todas"]');
    if (todasBtn) {
      statusFilter.querySelectorAll('.status-btn').forEach(btn => btn.classList.remove('active'));
      todasBtn.classList.add('active');
    }
    // Força o recarregamento da tabela ao voltar para a página principal
    await loadOPTable('todas', '', 'status', 'desc', 1, true, null);
    console.log('[toggleView] Tela inicial carregada com tabela atualizada');
  }
}

// Handler global para variantes
let loadVariantesCorteHandler = null;

async function loadProdutosCorte() {
  const produtoSelect = document.getElementById('produtoCorte');
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
      console.error('[loadProdutosCorte] Erro ao carregar produtos:', error);
      produtoSelect.innerHTML = '<option value="">Erro ao carregar produtos</option>';
  }
}

async function loadVariantesCorte(produtoNome) {
  const variantesContainer = document.getElementById('variantesCorteContainer');
  const variantesSelects = document.querySelector('.variantes-selects-corte');
  if (!variantesContainer || !variantesSelects) {
    console.warn('[loadVariantesCorte] variantesContainer ou variantesSelects não encontrado');
    return;
  }

  variantesSelects.innerHTML = ''; // Sempre limpa o select
  variantesContainer.style.display = 'none'; // Sempre esconde inicialmente

  if (!produtoNome) {
    console.log('[loadVariantesCorte] Nenhum produto selecionado, variações limpas');
    return;
  }

  const produtos = await obterProdutos();
  const produto = produtos.find(p => p.nome === produtoNome);

  let variantesDisponiveis = [];
  if (produto?.variantes && produto.variantes.length > 0) {
    variantesDisponiveis = produto.variantes.map(v => v.valores.split(',')).flat().map(v => v.trim());
  } else if (produto?.grade && produto.grade.length > 0) {
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
    console.log('[loadVariantesCorte] Variações carregadas para', produtoNome);
  } else {
    console.log('[loadVariantesCorte] Nenhuma variação disponível para', produtoNome);
  }
}

function limparFormularioCorte() {
  const produtoCorte = document.getElementById('produtoCorte');
  const quantidadeCorte = document.getElementById('quantidadeCorte');
  const dataCorte = document.getElementById('dataCorte');
  const cortadorCorte = document.getElementById('cortadorCorte');
  const variantesContainer = document.getElementById('variantesCorteContainer');
  const variantesSelects = document.querySelector('.variantes-selects-corte');

  if (produtoCorte) produtoCorte.value = '';
  else console.warn('[limparFormularioCorte] produtoCorte não encontrado');
  
  if (quantidadeCorte) quantidadeCorte.value = '';
  else console.warn('[limparFormularioCorte] quantidadeCorte não encontrado');
  
  if (dataCorte) dataCorte.value = '';
  else console.warn('[limparFormularioCorte] dataCorte não encontrado');
  
  if (cortadorCorte) {
    cortadorCorte.value = usuarioLogado?.nome || 'Usuário não identificado';
    console.log('[limparFormularioCorte] cortadorCorte inicializado com:', cortadorCorte.value);
  } else {
    console.warn('[limparFormularioCorte] cortadorCorte não encontrado');
  }
  
  if (variantesContainer && variantesSelects) {
    variantesSelects.innerHTML = '';
    variantesContainer.style.display = 'none';
  } else {
    console.warn('[limparFormularioCorte] variantesContainer ou variantesSelects não encontrado');
  }

  console.log('[limparFormularioCorte] Formulário de corte limpo');
}

async function salvarCorte() {
  const produto = document.getElementById('produtoCorte').value;
  const variante = document.querySelector('.variantes-selects-corte select')?.value || '';
  const quantidade = parseInt(document.getElementById('quantidadeCorte').value) || 0;
  const dataCorte = document.getElementById('dataCorte').value;
  const cortador = document.getElementById('cortadorCorte').value;

  if (!produto || !variante || !quantidade || !dataCorte || !cortador) {
    mostrarPopupMensagem('Por favor, preencha todos os campos.', 'erro');
    return;
  }

  const corteData = {
    produto,
    variante,
    quantidade,
    data: dataCorte,
    cortador,
    status: 'cortados'
  };

  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/cortes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corteData),
    });

    if (!response.ok) throw new Error('Erro ao salvar corte');

    const savedCorte = await response.json();
    console.log('[salvarCorte] Corte salvo:', savedCorte);

    mostrarPopupMensagem('Corte salvo com sucesso!', 'sucesso');
    limparCacheCortes(); // Limpa o cache antes de mudar de tela
    limparFormularioCorte(); // Limpa o formulário após salvar
    window.location.hash = '#acessocortes';
    await loadAbaContent('cortados', true); // Força a atualização da aba "Cortados" com dados frescos
  } catch (error) {
    console.error('[salvarCorte] Erro:', error);
    mostrarPopupMensagem('Erro ao salvar corte. Tente novamente.', 'erro');
  }
}

async function loadAcessocortes() {
  const abas = document.querySelectorAll('.aba-btn');
  const conteudoAba = document.getElementById('conteudoAba');
  let activeTab = 'pendente'; // Padrão inicial

  if (window.location.hash === '#acessocortes' && document.referrer.includes('#corte')) {
      activeTab = 'cortados';
  } else if (window.location.hash === '#acessocortes') {
      activeTab = 'cortados';
  }

  abas.forEach(aba => {
      aba.classList.remove('active');
      if (aba.dataset.aba === activeTab) {
          aba.classList.add('active');
      }
      aba.addEventListener('click', async (e) => {
          e.preventDefault();
          if (aba.classList.contains('active')) return; // Evita recarregar se já ativo
          abas.forEach(a => a.classList.remove('active'));
          aba.classList.add('active');
          await loadAbaContent(aba.dataset.aba, true);
      });
  });

  // Carrega apenas se não estiver carregando
  if (!isLoadingAbaContent) {
      await loadAbaContent(activeTab, true);
  }
}

async function loadAbaContent(aba, forceRefresh = true) {
  const conteudoAba = document.getElementById('conteudoAba');
  
  // Verifica se já está carregando
  if (isLoadingAbaContent) {
    console.log(`[loadAbaContent] Já está carregando a aba ${aba}, ignorando nova chamada`);
    return;
  }

  isLoadingAbaContent = true; // Marca como carregando
  conteudoAba.innerHTML = '<div class="spinner">Carregando...</div>';

  try {
    const cortes = await obterCortes(aba === 'pendente' ? 'pendente' : 'cortados', forceRefresh);
    let html = '';

    if (aba === 'pendente') {
      html += '<h3>Produtos pendentes de corte</h3>';
      html += `
        <table class="tabela-corte-pendente">
          <thead>
            <tr>
              <th></th>
              <th>PN</th>
              <th>Produto</th>
              <th>Variação</th>
              <th>Qtd</th>
              <th>OP</th>
            </tr>
          </thead>
          <tbody id="tabelaPendenteBody"></tbody>
        </table>
        <div class="botoes-tabela">
          <button id="cortarSelecionados" class="botao-cortar">Cortar</button>
          <button id="excluirSelecionados" class="botao-excluir">Excluir</button>
        </div>
      `;
    } else {
      html += '<h3>Produtos cortados</h3>';
      html += `
        <table class="tabela-cortados">
          <thead>
            <tr>
              <th></th>
              <th>Produto</th>
              <th>Variação</th>
              <th>Qtd</th>
            </tr>
          </thead>
          <tbody id="tabelaCortadosBody"></tbody>
        </table>
        <div class="botoes-tabela">
          <button id="excluirCortados" class="botao-excluir">Excluir</button>
        </div>
      `;
    }

    conteudoAba.innerHTML = html;

    conteudoAba.classList.add('refresh-animation');
    setTimeout(() => conteudoAba.classList.remove('refresh-animation'), 500);

    if (aba === 'pendente') {
      await carregarTabelaPendente(cortes);
      adicionarEventosTabelaPendente();
    } else {
      await carregarTabelaCortados(cortes);
      adicionarEventosTabelaCortados();
    }

    console.log(`[loadAbaContent] Carregou aba ${aba} com sucesso`);
  } catch (error) {
    console.error('[loadAbaContent] Erro:', error);
    conteudoAba.innerHTML = '<p>Erro ao carregar cortes. Tente novamente.</p>';
  } finally {
    isLoadingAbaContent = false; // Marca como não carregando ao terminar
  }
}

let cortesCache = {}; // Cache específico para cortes

async function obterCortes(status, forceRefresh = false) {
  const cacheKey = `cortesCache_${status}`;
  const cachedData = localStorage.getItem(cacheKey);

  // Se forceRefresh for true, ignora o cache e busca no servidor
  if (!forceRefresh && cachedData) {
    const { cortes, timestamp } = JSON.parse(cachedData);
    const now = Date.now();
    const cacheDuration = 15 * 60 * 1000; // 15 minutos
    if (now - timestamp < cacheDuration) {
      console.log(`[obterCortes] Retornando cortes do cache para status ${status}`);
      return cortes;
    }
  }

  const token = localStorage.getItem('token');
  const response = await fetch(`/api/cortes?status=${status}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Erro ao carregar cortes');

  const cortes = await response.json();
  const cacheData = {
    cortes,
    timestamp: Date.now(),
  };
  localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  console.log(`[obterCortes] Cortes buscados e armazenados no cache para status ${status}`);
  return cortes;
}


// Ajuste nas funções carregarTabela para evitar duplicatas
async function carregarTabelaPendente(cortes) {
  const tbody = document.getElementById('tabelaPendenteBody');
  tbody.innerHTML = ''; // Limpa antes de adicionar
  const cortesUnicos = [...new Set(cortes.map(JSON.stringify))].map(JSON.parse); // Remove duplicatas

  if (cortesUnicos.length === 0) {
    // Exibe mensagem quando não há cortes pendentes
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Muito bem! Sem cortes pendentes no momento!</td></tr>';
  } else {
    cortesUnicos.forEach(corte => {
      console.log('[carregarTabelaPendente] Dados do corte:', corte);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="checkbox-corte" data-id="${corte.id}"></td>
        <td>${corte.pn || 'N/A'}</td>
        <td>${corte.produto || 'Sem produto'}</td>
        <td>${corte.variante || 'Sem variação'}</td>
        <td>${corte.quantidade || 0}</td>
        <td>${corte.op || 'Sem OP'}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

async function carregarTabelaCortados(cortes) {
  const tbody = document.getElementById('tabelaCortadosBody');
  tbody.innerHTML = ''; // Limpa antes de adicionar
  const cortesUnicos = [...new Set(cortes.map(JSON.stringify))].map(JSON.parse); // Remove duplicatas

  if (cortesUnicos.length === 0) {
    // Exibe mensagem quando não há cortes cortados
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Não existe nenhum produto cortado.</td></tr>';
  } else {
    cortesUnicos.forEach(corte => {
      console.log('[carregarTabelaCortados] Dados do corte:', corte);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="checkbox-corte" data-id="${corte.id}"></td>
        <td>${corte.produto || 'Sem produto'}</td>
        <td>${corte.variante || 'Sem variação'}</td>
        <td>${corte.quantidade || 0}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function adicionarEventosTabelaPendente() {
  document.getElementById('cortarSelecionados').addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('#tabelaPendenteBody .checkbox-corte:checked');
    if (checkboxes.length === 0) {
      mostrarPopupMensagem('Selecione pelo menos um item para cortar.', 'erro');
      return;
    }

    try {
      for (const cb of checkboxes) {
        const id = cb.dataset.id;
        await atualizarCorte(id, 'cortados', usuarioLogado?.nome || 'Sistema');
        await atualizarCorte(id, 'verificado', usuarioLogado?.nome || 'Sistema');
      }
      mostrarPopupMensagem('Itens cortados e verificados com sucesso!', 'sucesso');
      await loadAbaContent('pendente', true); // Força atualização do backend
      limparCacheCortes();
    } catch (error) {
      console.error('[adicionarEventosTabelaPendente] Erro ao cortar:', error);
      mostrarPopupMensagem(`Erro ao cortar: ${error.message}`, 'erro');
    }
  });

  document.getElementById('excluirSelecionados').addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('#tabelaPendenteBody .checkbox-corte:checked');
    if (checkboxes.length === 0) {
      mostrarPopupMensagem('Selecione pelo menos um item para excluir.', 'erro');
      return;
    }

    if (confirm('Tem certeza que deseja excluir os itens selecionados?')) {
      try {
        for (const cb of checkboxes) {
          await excluirCorte(cb.dataset.id);
        }
        mostrarPopupMensagem('Itens excluídos com sucesso!', 'sucesso');
        await loadAbaContent('pendente', true); // Força atualização do backend
      } catch (error) {
        console.error('[adicionarEventosTabelaPendente] Erro ao excluir:', error);
        mostrarPopupMensagem(`Erro ao excluir: ${error.message}`, 'erro');
      }
    }
  });
}

function adicionarEventosTabelaCortados() {
  document.getElementById('excluirCortados').addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('#tabelaCortadosBody .checkbox-corte:checked');
    if (checkboxes.length === 0) {
      mostrarPopupMensagem('Selecione pelo menos um item para excluir.', 'erro');
      return;
    }

    if (confirm('Tem certeza que deseja excluir os itens selecionados?')) {
      try {
        for (const cb of checkboxes) {
          await excluirCorte(cb.dataset.id);
        }
        mostrarPopupMensagem('Itens excluídos com sucesso!', 'sucesso');
        // Recarrega a aba "Cortados" forçando a busca no backend
        await loadAbaContent('cortados', true);
      } catch (error) {
        console.error('[adicionarEventosTabelaCortados] Erro ao excluir:', error);
        mostrarPopupMensagem(`Erro ao excluir: ${error.message}`, 'erro');
      }
    }
  });
}

async function atualizarCorte(id, status, cortador) {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch(`/api/cortes`, { // Remova o ${id} da URL
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, status, cortador }), // Inclua o id no body
    });

    if (!response.ok) {
      const text = await response.text();
      console.log('[atualizarCorte] Resposta bruta do servidor:', text);
      throw new Error(`Erro ao atualizar corte: Status ${response.status}`);
    }

    const updatedCorte = await response.json();

    if (updatedCorte.op && updatedCorte.status === 'verificado') {
      const ordensData = await obterOrdensDeProducao(1, true);
      const op = ordensData.rows.find(o => o.numero === updatedCorte.op);
      if (op) {
        const corteEtapa = op.etapas.find(e => e.processo === 'Corte');
        if (corteEtapa) {
          corteEtapa.usuario = cortador;
          corteEtapa.lancado = true;
          await saveOPChanges(op);
          console.log(`[atualizarCorte] Etapa Corte atualizada na OP #${op.numero} para "Corte Realizado"`);
        }
      }
    }

    return updatedCorte;
  } catch (error) {
    console.error('[atualizarCorte] Erro:', error);
    mostrarPopupMensagem(`Erro ao atualizar corte: ${error.message}`, 'erro');
    throw error;
  }
}

async function excluirCorte(id) {
  console.log('[excluirCorte] Tentando excluir corte com ID:', id);
  const token = localStorage.getItem('token');
  const response = await fetch('/api/cortes', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[excluirCorte] Resposta do servidor:', text);
    throw new Error(`Erro ao excluir corte: Status ${response.status}`);
  }

  // Limpa o cache após exclusão
  limparCacheCortes();
  console.log('[excluirCorte] Corte excluído com sucesso');
  return await response.json();
}

// Adicione o evento ao botão "Cortar"
document.getElementById('btnCorte').addEventListener('click', () => {
  if (permissoes.includes('criar-op')) {
      window.location.hash = '#corte';
  }
});

document.getElementById('btnCortar').addEventListener('click', salvarCorte);


document.addEventListener('DOMContentLoaded', async () => {
  const auth = await verificarAutenticacao('ordens-de-producao.html', ['acesso-ordens-de-producao']);
  if (!auth) {
    console.error('[admin-ordens-de-producao] Autenticação falhou');
    return;
  }

  usuarioLogado = auth.usuario;
  permissoes = auth.permissoes || [];

  limparCacheOrdens(); // Limpa o cache para garantir dados atualizados

  const ordensData = await obterOrdensDeProducao(1, true); // Busca todas as ordens (filtradas por "em-aberto" e "produzindo")
  const ordensDeProducao = ordensData.rows;
  if (Array.isArray(ordensDeProducao)) {
    ordensDeProducao.forEach(op => {
      if (op.edit_id) usedIds.add(op.edit_id);
    });
  } else {
    console.error('[DOMContentLoaded] ordensDeProducao não é um array:', ordensDeProducao);
  }

  console.log('[DOMContentLoaded] Iniciando carregamento inicial da tabela');
  await loadOPTable('todas', '', 'status', 'desc', 1, true, null);
  document.body.dataset.initialLoadComplete = 'true';


  window.removeEventListener('hashchange', toggleView);
  window.addEventListener('hashchange', toggleView);

  await toggleView();
  await loadProdutosSelect();

  // Resto do código de inicialização (eventos, botões, etc.)
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
  const btnIncluirOP = document.getElementById('btnIncluirOP');
  const btnCorte = document.getElementById('btnCorte');
  const btnAcessarCortes = document.getElementById('btnAcessarCortes');

  // Verificação dos elementos essenciais (mantida)
  if ([opListView, opFormView, opEditView, opTableBody, searchOP, statusFilter, opForm,
    produtoOP, quantidadeOP, numeroOP, variantesContainer, variantesSelects, dataEntregaOP,
    observacoesOP, editProdutoOP, editVarianteOP, editVarianteContainer, editQuantidadeOP,
    editDataEntregaOP, etapasContainer, opNumero, finalizarOP, cancelarOP, voltarOP].some(el => !el)) {
    console.error('Elementos DOM faltantes:', [
      'opListView', 'opFormView', 'opEditView', 'opTableBody', 'searchOP', 'statusFilter', 'opForm',
      'produtoOP', 'quantidadeOP', 'numeroOP', 'variantesContainer', 'variantesSelects', 'dataEntregaOP',
      'observacoesOP', 'editProdutoOP', 'editVarianteOP', 'editVarianteContainer', 'editQuantidadeOP',
      'editDataEntregaOP', 'etapasContainer', 'opNumero', 'finalizarOP', 'cancelarOP', 'voltarOP'
    ].filter(id => !document.getElementById(id)));
    throw new Error('Elementos DOM necessários não encontrados');
  }

  // Configura eventos após o carregamento inicial
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
        const searchValue = searchOP.value || '';
        // Reinicia para a primeira página ao ordenar
        loadOPTable(activeStatus, searchValue, criterio, newOrder, 1, true, activeStatus === 'todas' ? null : activeStatus);
      });
    }
  });

  const statusHeader = document.getElementById('sortStatus');
  if (statusHeader) statusHeader.dataset.sort = 'desc';

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

  if (btnIncluirOP) {
    btnIncluirOP.disabled = !permissoes.includes('criar-op');
    if (!permissoes.includes('criar-op')) {
      btnIncluirOP.style.opacity = '0.5';
      btnIncluirOP.style.cursor = 'not-allowed';
    } else {
      btnIncluirOP.addEventListener('click', async () => {
        window.location.hash = '#adicionar';
        await toggleView();
      });
    }
  }

  if (btnCorte) {
    btnCorte.addEventListener('click', async () => {
      window.location.hash = '#corte';
      await toggleView();
    });
  }

  if (btnAcessarCortes) {
    btnAcessarCortes.addEventListener('click', async () => {
      window.location.hash = '#acessocortes';
      await toggleView();
    });
  }

  if (opForm) {
    opForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      let numero = document.getElementById('numeroOP').value.trim();
      const produto = document.getElementById('produtoOP').value;
      const varianteSelect = document.querySelector('.variantes-selects select');
      const variante = varianteSelect ? varianteSelect.value : '';
      const quantidade = parseInt(document.getElementById('quantidadeOP').value) || 0;
      const dataEntrega = document.getElementById('dataEntregaOP').value;
      const observacoes = document.getElementById('observacoesOP').value.trim();
  
      // Validação dos campos obrigatórios
      let erros = [];
      if (!produto) erros.push('produto');
      if (!variante && document.querySelector('.variantes-selects select')) erros.push('variação');
      if (!quantidade || quantidade <= 0) erros.push('quantidade');
      if (!dataEntrega) erros.push('data de entrega');
  
      if (erros.length > 0) {
        mostrarPopupMensagem(`Por favor, preencha os seguintes campos obrigatórios: ${erros.join(', ')}.`, 'erro');
        return;
      }
  
      let novaOP = {
        numero,
        produto,
        variante: variante || null,
        quantidade,
        data_entrega: dataEntrega,
        observacoes: observacoes || '',
        status: 'em-aberto',
        edit_id: generateUniqueId(),
        etapas: []
      };
  
      const produtos = await obterProdutos();
      const produtoObj = produtos.find(p => p.nome === produto);
      if (!produtoObj) {
        mostrarPopupMensagem('Produto não encontrado. Verifique a lista de produtos.', 'erro');
        return;
      }
  
      novaOP.etapas = produtoObj.etapas?.map(etapa => ({
        processo: etapa.processo,
        usuario: etapa.processo === 'Corte' && document.getElementById('quantidadeOP').disabled ? (usuarioLogado?.nome || 'Sistema') : '',
        quantidade: etapa.processo === 'Corte' && document.getElementById('quantidadeOP').disabled ? quantidade : 0,
        lancado: etapa.processo === 'Corte' && document.getElementById('quantidadeOP').disabled,
        ultimoLancamentoId: null
      })) || [];
  
      console.log('[opForm.submit] Nova OP a ser salva:', novaOP);
  
      const foiCortadoDiv = opForm.querySelector('.foi-cortado');
      const foiCortadoInput = foiCortadoDiv?.querySelector('input');
  
      try {
        const savedOP = await salvarOrdemDeProducao(novaOP);
        console.log('[opForm.submit] Ordem salva:', savedOP);
  
        if (foiCortadoInput && foiCortadoInput.value === 'Sim' && foiCortadoDiv.dataset.corteId) {
          const corteId = foiCortadoDiv.dataset.corteId;
          await atualizarStatusCorte(corteId, 'usado');
          limparCacheCortes();
        }
  
        if (foiCortadoInput && foiCortadoInput.value.startsWith('Pedido de corte:')) {
          const pn = foiCortadoInput.value.replace('Pedido de corte: ', '');
          const corteData = {
            pn,
            produto,
            variante,
            quantidade,
            data: new Date().toISOString().split('T')[0],
            cortador: usuarioLogado?.nome || 'Sistema',
            status: 'pendente',
            op: numero
          };
          await fetch('/api/cortes', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(corteData),
          });
        }
  
        mostrarPopupMensagem(`Ordem de Produção #${novaOP.numero} salva com sucesso!`, 'sucesso');
        limparCacheOrdens();
        window.location.hash = '';
        await loadOPTable('todas', '', 'status', 'desc', 1, true);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (error) {
        console.error('[opForm.submit] Erro detalhado:', error.message);
        if (error.message.includes('Número da OP já existe')) {
          mostrarPopupMensagem('O número da Ordem de Produção já existe. Gere um novo número e tente novamente.', 'erro');
          const novoNumero = await getNextOPNumber();
          document.getElementById('numeroOP').value = novoNumero;
          novaOP.numero = novoNumero;
          console.log('[opForm.submit] Novo número gerado após erro:', novoNumero);
        } else {
          mostrarPopupMensagem(`Erro ao salvar ordem de produção: ${error.message}. Verifique o console para mais detalhes.`, 'erro');
        }
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
      const ordensDeProducao = ordensData.rows;
      const op = ordensDeProducao.find(o => o.edit_id === editId);
  
      if (op && !finalizarOP.disabled) {
        op.status = 'finalizado';
        const agora = new Date();
        agora.setHours(agora.getHours() - 3);
        const dataFinalFormatada = agora.toISOString().replace('T', ' ').substring(0, 19);
        op.data_final = dataFinalFormatada;
  
        await saveOPChanges(op);
        mostrarPopupMensagem(`Ordem de Produção #${op.numero} finalizada com sucesso!`, 'sucesso');
  
        // Limpa o cache de ordens para garantir dados atualizados
        limparCacheOrdens();
  
        // Redireciona para a página principal e força o recarregamento da tabela
        window.location.hash = '';
        await loadOPTable('todas', '', 'status', 'desc', 1, true, null); // Força atualização com filtro "todas"
      }
    });
  }

  if (cancelarOP) {
    cancelarOP.addEventListener('click', async () => {
      const editId = window.location.hash.split('/')[1];
      const ordensData = await obterOrdensDeProducao(1, true);
      const ordensDeProducao = ordensData.rows;
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

  window.addEventListener('hashchange', toggleView);

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

//alguns bugs como o input qtde que fica limpando o dado inserido, de resto funciona bem