window.saveOPChanges = null; // Inicializa como null para garantir que existe
import { verificarAutenticacao } from '/js/utils/auth.js';
import { PRODUTOS, PRODUTOSKITS } from '/js/utils/prod-proc-maq.js';

let filteredOPsGlobal = [];
let lancamentosEmAndamento = new Set();
let ordensCache = null;
let ordensPromise = null;
let cachedProdutos = null;
const ordensCacheMap = new Map();
const CACHE_EXPIRATION_MS_ORDENS = 30 * 1000; // Exemplo: Cache de ordens expira após 30 segundos (pode ajustar)
let lastOrdensFetchTimestamp = 0; // Para controlar a expiração do cache
let currentPage = 1;
const itemsPerPage = 10;
let permissoes = [];
let usuarioLogado = null;
const usedIds = new Set();
let isLoadingAbaContent = false; 
let isEditingQuantidade = false;

let usuariosCache = null;
let usuariosPromise = null;
const CACHE_EXPIRATION_MS_USUARIOS = 5 * 60 * 1000; // Cache de usuários expira após 5 minutos (ajuste se necessário)
let lastUsuariosFetchTimestamp = 0;

let lancamentosCache = new Map(); // Cache de lançamentos por op_numero
let lancamentosPromise = new Map(); // Promise em andamento por op_numero
const CACHE_EXPIRATION_MS_LANCAMENTOS = 30 * 1000; // Cache de lançamentos expira após 30 segundos

async function obterUsuarios(forceUpdate = false) {
  const cacheKey = 'all_users'; // Chave simples para cache de todos os usuários

  // 1. Verificar requisição em andamento
  if (usuariosPromise) {
      console.log('[obterUsuarios] Requisição em andamento, aguardando...');
      return await usuariosPromise;
  }

  // 2. Verificar cache
  if (usuariosCache && !forceUpdate && (Date.now() - lastUsuariosFetchTimestamp < CACHE_EXPIRATION_MS_USUARIOS)) {
      console.log('[obterUsuarios] Retornando usuários do cache.');
      return usuariosCache;
  }

  // 3. Fazer requisição
  console.log('[obterUsuarios] Buscando usuários diretamente do servidor...');
  usuariosPromise = (async () => {
      try {
          const token = localStorage.getItem('token');
          const response = await fetch('/api/usuarios', {
              headers: { 'Authorization': `Bearer ${token}` },
          });

          if (!response.ok) {
               const errorText = await response.text();
               console.error('[obterUsuarios] Erro na resposta da API:', response.status, errorText);
              throw new Error(`Erro ao carregar usuários: ${response.status}`);
          }

          const usuarios = await response.json();
          console.log('[obterUsuarios] Usuários recebidos do servidor:', usuarios.length);

          // 4. Armazenar no cache
          usuariosCache = usuarios;
          lastUsuariosFetchTimestamp = Date.now();

          return usuarios;
      } finally {
          // Limpar promise em finally
          usuariosPromise = null;
      }
  })();

  // 5. Aguardar e retornar
  return await usuariosPromise;
}


async function obterLancamentos(opNumero, forceUpdate = false) {
   const cacheKey = opNumero; // Cache por número da OP

   // 1. Verificar requisição em andamento para esta OP
   if (lancamentosPromise.has(cacheKey)) {
       console.log(`[obterLancamentos] Requisição em andamento para OP ${opNumero}, aguardando...`);
       return await lancamentosPromise.get(cacheKey);
   }

   // 2. Verificar cache para esta OP
   const cacheEntry = lancamentosCache.get(cacheKey);
   if (cacheEntry && !forceUpdate && (Date.now() - cacheEntry.timestamp < CACHE_EXPIRATION_MS_LANCAMENTOS)) {
       console.log(`[obterLancamentos] Retornando lançamentos do cache para OP ${opNumero}.`);
       return cacheEntry.data;
   }

   // 3. Fazer requisição
   console.log(`[obterLancamentos] Buscando lançamentos para OP ${opNumero} diretamente do servidor...`);
   const promise = (async () => { // Armazena a Promise
       try {
           const token = localStorage.getItem('token');
           const timestamp = Date.now();
           const response = await fetch(`/api/producoes?op_numero=${opNumero}&_=${timestamp}`, {
               headers: { 'Authorization': `Bearer ${token}` },
           });

           let rawData;
           if (!response.ok) {
                let errorDetails = `Erro HTTP: ${response.status}`;
                try { const errorJson = await response.json(); errorDetails += ' - ' + (errorJson.error || JSON.stringify(errorJson)); } catch (e) { /* ignore */ }
                console.error(`[obterLancamentos] Erro na resposta da API para OP ${opNumero}:`, response.status, errorDetails);
               throw new Error(`Erro ao carregar lançamentos para OP ${opNumero}: ${errorDetails}`);
           }

           rawData = await response.json();
           console.log(`[obterLancamentos] Lançamentos recebidos do servidor para OP ${opNumero}:`, rawData.length);

           const cacheEntry = { data: rawData, timestamp: Date.now() };
           lancamentosCache.set(cacheKey, cacheEntry);
           console.log(`[obterLancamentos] Dados cacheados para OP ${opNumero}.`);


           return rawData; // Retorna o array de lançamentos
       } finally {
           lancamentosPromise.delete(cacheKey); // Limpa a promise para ESTA OP
            console.log(`[obterLancamentos] Promise para OP ${opNumero} finalizada.`);
       }
   })();
   lancamentosPromise.set(cacheKey, promise); // Armazena a promise no Map

   return await promise;
}

function mostrarPopupMensagem(mensagem, tipo = 'erro') {
  const popup = document.createElement('div');
  popup.className = `popup-mensagem popup-${tipo}`;
  popup.style.position = 'fixed';
  popup.style.top = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  popup.style.backgroundColor =
    tipo === 'erro' ? '#f8d7da' :
    tipo === 'sucesso' ? '#d4edda' :
    tipo === 'aviso' ? '#fff3cd' : '#d4edda'; // Amarelo claro para aviso
  popup.style.color =
    tipo === 'erro' ? '#721c24' :
    tipo === 'sucesso' ? '#155724' :
    tipo === 'aviso' ? '#856404' : '#155724'; // Texto amarelo escuro para aviso
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
  fecharBtn.style.backgroundColor =
    tipo === 'erro' ? '#dc3545' :
    tipo === 'sucesso' ? '#28a745' :
    tipo === 'aviso' ? '#ffc107' : '#28a745'; // Botão amarelo para aviso
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
let produtosCache = null; // Declarada globalmente
let produtosPromise = null; // Declarada globalmente

async function obterProdutos() {
  // 1. Verificar se já existe uma requisição em andamento
  if (produtosPromise) {
    console.log('[obterProdutos] Requisição em andamento, aguardando...');
    return await produtosPromise;
  }

  // 2. Verificar se os dados já estão no cache
  // Você pode adicionar uma verificação de validade do cache aqui se quiser (ex: tempo), mas por enquanto, apenas verificar se existe já ajuda muito
  if (produtosCache) {
    console.log('[obterProdutos] Retornando produtos do cache.');
    return produtosCache;
  }

  // 3. Se não está no cache e não há requisição em andamento, fazer a requisição
  console.log('[obterProdutos] Buscando produtos diretamente do servidor...');
  produtosPromise = (async () => { // Armazena a Promise da requisição em andamento
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/produtos', {
        headers: { 'Authorization': `Bearer ${token}` },
        // Removido cache: 'no-store'
      });

      if (!response.ok) {
         const errorText = await response.text(); // Capture o texto do erro para debugging
         console.error('[obterProdutos] Erro na resposta da API:', response.status, errorText);
         throw new Error(`Erro ao carregar produtos: ${response.status}`);
      }
      const produtos = await response.json();
      console.log('[obterProdutos] Produtos recebidos do servidor:', produtos);

      // 4. Armazenar os dados no cache antes de retornar
      produtosCache = produtos;

      return produtos;
    } finally {
      // Limpar a Promise apenas depois que a requisição (sucesso ou erro) terminar
      produtosPromise = null;
    }
  })();

  // 5. Aguardar e retornar o resultado da Promise
  return await produtosPromise;
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
  produtosCache = null; // Limpa a variável em memória
  console.log('[obterProdutos] Cache de produtos limpo');
}

window.limparCacheProdutos = limparCacheProdutos;


function ordenarOPs(ops, criterio, ordem = 'asc') {
  return ops.sort((a, b) => {
    switch (criterio) {
      case 'status':
        const statusOrder = a.status.localeCompare(b.status);
        if (statusOrder === 0) {
          return ordem === 'asc' ? parseInt(a.numero) - parseInt(b.numero) : parseInt(b.numero) - parseInt(a.numero);
        }
        return ordem === 'asc' ? statusOrder : -statusOrder;
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
        return ordem === 'asc' ? parseInt(a.numero) - parseInt(b.numero) : parseInt(b.numero) - parseInt(a.numero);
    }
  });
}

async function obterOrdensDeProducao(page = 1, fetchAll = false, forceUpdate = false, statusFilter = null, noStatusFilter = false) {
  let url;
  if (noStatusFilter) {
    url = '/api/ordens-de-producao?all=true&noStatusFilter=true';
  } else {
    url = fetchAll
      ? '/api/ordens-de-producao?all=true'
      : `/api/ordens-de-producao?page=${page}&limit=${itemsPerPage}${statusFilter ? `&status=${statusFilter}` : ''}`;
  }

  const cacheKey = url; // A URL completa é a chave do cache

  const cacheEntry = ordensCacheMap.get(cacheKey);
  if (cacheEntry && !forceUpdate && (Date.now() - cacheEntry.timestamp < CACHE_EXPIRATION_MS_ORDENS)) {
      console.log(`[obterOrdensDeProducao] Retornando ordens do cache para ${cacheKey}.`);
      return cacheEntry.data; // Retorna os dados cacheados
  }

  if (ordensPromise && ordensPromise.cacheKey === cacheKey) {
    console.log(`[obterOrdensDeProducao] Requisição em andamento para ${cacheKey}, aguardando...`);
    return await ordensPromise; // Aguarda a Promise existente
  }

  console.log(`[obterOrdensDeProducao] Buscando ordens diretamente do servidor para ${cacheKey}...`);
  ordensPromise = (async () => { // Armazena a Promise para in-flight caching
      try {
          const token = localStorage.getItem('token');
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          let rawData; // Variável para armazenar o corpo lido (texto ou json)

          if (!response.ok) {
              let errorDetails = `Erro HTTP: ${response.status}`;
              console.error('[obterOrdensDeProducao] Resposta da API NÃO OK:', response.status, response.statusText);

              try {
                  const errorJson = await response.json(); // <-- LÊ O CORPO AQUI NO CAMINHO DO ERRO
                  errorDetails += ' - ' + (errorJson.error || JSON.stringify(errorJson));
                   console.error('[obterOrdensDeProducao] Detalhes do erro (JSON):', errorJson);
              } catch (jsonError) {
                   console.warn('[obterOrdensDeProducao] Não foi possível ler o corpo do erro como JSON, tentando como texto.', jsonError);
                   try {
                      const errorText = await response.text(); // <-- OU LÊ O CORPO AQUI NO CAMINHO DO ERRO
                      errorDetails += ' - ' + errorText;
                       console.error('[obterOrdensDeProducao] Detalhes do erro (Texto):', errorText);
                   } catch (textError) {
                      console.error('[obterOrdensDeProducao] Não foi possível ler o corpo do erro como texto.', textError);
                   }
              }
              throw new Error(`Erro ao carregar ordens de produção: ${errorDetails}`);

          } else {

              rawData = await response.json(); // <-- LÊ O CORPO AQUI NO CAMINHO DO SUCESSO
              console.log('[obterOrdensDeProducao] Resposta OK recebida.');
          }

          console.log(`[obterOrdensDeProducao] Dados brutos recebidos:`, Array.isArray(rawData) ? rawData.length : (rawData?.rows?.length || 0));

           if (!rawData) {
                throw new Error("Dados inesperados recebidos do servidor (rawData is null/undefined)");
           }

          const formattedData = Array.isArray(rawData) ?
             { rows: rawData, total: rawData.length, pages: Math.ceil(rawData.length / itemsPerPage) || 1 } // Se for um array direto (API fetchAll)
            : { // Se for um objeto paginado { rows: [...], total: ..., pages: ... }
               rows: rawData.rows || [],
               total: rawData.total || (rawData.rows ? rawData.rows.length : 0),
               pages: rawData.pages || (rawData.total ? Math.ceil(rawData.total / itemsPerPage) : (rawData.rows ? Math.ceil(rawData.rows.length / itemsPerPage) : 1)),
            };


          console.log('[obterOrdensDeProducao] Dados formatados para cache:', formattedData);

           const cacheMapEntry = { data: formattedData, timestamp: Date.now() };
           ordensCacheMap.set(cacheKey, cacheMapEntry); // Usa a url como chave no Map
           console.log(`[obterOrdensDeProducao] Dados cacheados para ${cacheKey}.`);

          return formattedData; // Retorna os dados formatados e cacheados

      } catch (error) {
        console.error('[obterOrdensDeProducao] Erro capturado na promise:', error);
        throw error;

      } finally {
         if(ordensPromise && ordensPromise.cacheKey === cacheKey) {
           ordensPromise = null; // Limpa a promise em andamento para esta URL/chave
         }
          console.log(`[obterOrdensDeProducao] Promise para ${cacheKey} finalizada.`);
      }
  })();
  ordensPromise.cacheKey = cacheKey; // Associa a chave do cache à Promise (para o in-flight check)

  return await ordensPromise; // Retorna a Promise (o chamador aguarda aqui)
}

export function limparCacheOrdens() {
  ordensCacheMap.clear();
}

export function limparCacheCortes() {
  cortesCache = {}; // Limpa o objeto de cache por status
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

async function loadOPTable(filterStatus = 'todas', search = '', sortCriterio = 'numero', sortOrdem = 'desc', page = 1, forceUpdate = false, statusFilter = null) {
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
    let totalItems = data.total;
    let totalPages = data.pages;

    console.log('[loadOPTable] Ordens recebidas:', ordensDeProducao.length, 'Dados brutos:', ordensDeProducao, 'Total:', totalItems, 'Páginas:', totalPages);

    // Deduplicação
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

    // Filtro de busca (aplicado apenas localmente)
    if (search) {
      filteredOPs = filteredOPs.filter(op => {
        const matchesProduto = op.produto?.toLowerCase().includes(search.toLowerCase()) || false;
        const matchesNumero = op.numero.toString().includes(search);
        const matchesVariante = op.variante?.toLowerCase().includes(search.toLowerCase()) || false;
        return matchesProduto || matchesNumero || matchesVariante;
      });
      console.log('[loadOPTable] Após filtro de busca:', filteredOPs.length, 'Busca:', search);

      // Recalcular paginação apenas se houver busca
      totalItems = filteredOPs.length;
      totalPages = Math.ceil(totalItems / itemsPerPage);
    } else {
      console.log('[loadOPTable] Nenhum filtro de busca aplicado');
    }

    // Confiar na ordenação da API (numero DESC) e aplicar ordenação local apenas se o critério for diferente
    if (sortCriterio !== 'numero' || sortOrdem !== 'desc') {
      filteredOPs = ordenarOPs(filteredOPs, sortCriterio, sortOrdem);
      console.log('[loadOPTable] Após ordenação local:', filteredOPs.length);
    } else {
      console.log('[loadOPTable] Usando ordenação da API (numero DESC)');
    }

    // Paginação
    let paginatedOPs;
    if (filterStatus === 'todas' && search) {
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
      paginatedOPs = filteredOPs.slice(startIndex, endIndex);
    } else {
      paginatedOPs = filteredOPs; // API já paginou
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
        tr.dataset.index = index;
        tr.dataset.numero = op.numero || `OP-${op.id}`;
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
    const numero = tr.dataset.numero;
    if (numero) {
      const op = filteredOPsGlobal.find(o => o.numero === numero); // Use filteredOPsGlobal

      if (op) {
        window.location.hash = `#editar/${op.edit_id}`;

      } else {
        console.error('[handleOPTableClick] Ordem não encontrada nos dados carregados para o número:', numero);
        mostrarPopupMensagem('Ordem de Produção não encontrada nos dados visíveis.', 'aviso'); // Use aviso talvez?
      }
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
  if (!finalizarBtn || !op) {
    console.error('[updateFinalizarButtonState] FinalizarBtn ou OP não encontrados');
    return;
  }

  const editProduto = document.getElementById('editProdutoOP')?.value || op.produto;
  const editQuantidade = parseInt(document.getElementById('editQuantidadeOP')?.value) || op.quantidade || 0;
  const editDataEntrega = document.getElementById('editDataEntregaOP')?.value || op.data_entrega;
  const editVariante = document.getElementById('editVarianteOP')?.value || op.variante;

  const camposPrincipaisPreenchidos = editProduto && editQuantidade > 0 && editDataEntrega && (op.variante ? editVariante : true);
  console.log('[updateFinalizarButtonState] Campos principais preenchidos:', camposPrincipaisPreenchidos, {
    produto: editProduto,
    quantidade: editQuantidade,
    dataEntrega: editDataEntrega,
    variante: editVariante
  });

  let todasEtapasCompletas = true;
  if (op.etapas && Array.isArray(op.etapas) && op.etapas.length > 0) {
    for (const etapa of op.etapas) {
      const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos);
      const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
      const isCorte = etapa.processo === 'Corte';
      const etapaCompleta = etapa.usuario && etapa.lancado && (!exigeQuantidade || etapa.quantidade > 0);

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
  console.log('[updateFinalizarButtonState] Pode finalizar:', podeFinalizar, {
    camposPrincipaisPreenchidos,
    todasEtapasCompletas,
    status: op.status
  });
  finalizarBtn.disabled = !podeFinalizar;
  finalizarBtn.style.backgroundColor = podeFinalizar ? '#4CAF50' : '#ccc';
}

async function verificarEtapasEStatus(op, produtos) {
  if (!op.etapas || !Array.isArray(op.etapas)) {
    op.status = 'em-aberto';
    await saveOPChanges(op);
    return false;
  }

  const todasEtapasCompletas = await Promise.all(op.etapas.map(async (etapa) => {
    const tipoUsuario = await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos);
    const exigeQuantidade = tipoUsuario === 'costureira' || tipoUsuario === 'tiktik';
    const isCorte = etapa.processo === 'Corte';
    return etapa.usuario && (isCorte ? etapa.lancado : (!exigeQuantidade || (etapa.lancado && etapa.quantidade > 0)));
  }));

  const resultado = todasEtapasCompletas.every(completa => completa);

  if (op.status === 'finalizado' && !resultado) {
    op.status = 'produzindo';
    await saveOPChanges(op);
    console.log(`[verificarEtapasEStatus] OP #${op.numero} voltou para 'produzindo' devido a etapa incompleta`);
    // Exibe notificação ao usuário
    mostrarPopupMensagem(
      `A Ordem de Produção #${op.numero} voltou para o status 'Produzindo' porque uma etapa está incompleta.`,
      'aviso'
    );
  } else if (op.status !== 'finalizado' && op.status !== 'cancelada') {
    op.status = resultado ? 'produzindo' : 'em-aberto';
    await saveOPChanges(op);
  }

  return resultado;
}

async function saveOPChanges(op) {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/ordens-de-producao', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      edit_id: op.edit_id,
      numero: op.numero,
      produto: op.produto,
      variante: op.variante,
      quantidade: op.quantidade,
      data_entrega: op.data_entrega,
      observacoes: op.observacoes,
      status: op.status,
      etapas: op.etapas,
      data_final: op.data_final
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erro ao atualizar ordem de produção: ${error.error}`);
  }
  console.log(`[saveOPChanges] Ordem de Produção #${op.numero} atualizada no banco de dados`);
  return await response.json();
}

window.saveOPChanges = saveOPChanges;

let isLoadingEtapas = false; // Nova flag para evitar carregamentos múltiplos

async function loadEtapasEdit(op, skipReload = false) {
    console.log(`[loadEtapasEdit] Iniciando carregamento das etapas para OP: ${op ? op.numero : 'undefined'} com skipReload: ${skipReload}`);
  
      if (isLoadingEtapas && !skipReload) {
      console.log(`[loadEtapasEdit] Já está carregando etapas para OP ${op?.numero}, ignorando nova chamada`);
      return;
    }
      isLoadingEtapas = true; // Marca como carregando
  
    // Pega as referências dos elementos DOM necessários
    const etapasContainer = document.getElementById('etapasContainer');
    const finalizarBtn = document.getElementById('finalizarOP');
  
    // Verifica se elementos essenciais existem antes de continuar
    if (!op || !etapasContainer || !finalizarBtn) {
      console.error('[loadEtapasEdit] OP, etapasContainer ou finalizarBtn não encontrados:', { op, etapasContainer, finalizarBtn });
      isLoadingEtapas = false; // Reseta a flag
      return;
    }
  
    // Limpa o conteúdo atual e mostra spinner
    etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';
  
    try {
      // ** <-- INÍCIO: GRUPAR TODAS AS BUSCAS DE DADOS EM PARALELO COM Promise.all --> **
      console.log('[loadEtapasEdit] Iniciando buscas de dados em paralelo...');
  
      // Cria um array de Promises. Chame as funções SEM 'await' aqui.
      const promises = [
        obterProdutos(), // Retorna uma Promise
        obterUsuarios(), // Retorna uma Promise (função helper que criamos)
        obterLancamentos(op.numero), // Retorna uma Promise (função helper que criamos, precisa de op.numero)
        obterCortes('pendente'), // Retorna uma Promise
        obterCortes('cortados'), // Retorna uma Promise
        obterCortes('verificado'), // Retorna uma Promise
        obterCortes('usado'), // Retorna uma Promise
      ];
  

      const [
        produtos, // Resultado da Promise 0 (obterProdutos)
        usuarios, // Resultado da Promise 1 (obterUsuarios)
        lancamentos, // Resultado da Promise 2 (obterLancamentos)
        cortesPendentes, // Resultado da Promise 3 (obterCortes 'pendente')
        cortesCortados, // Resultado da Promise 4
        cortesVerificados, // Resultado da Promise 5
        cortesUsados // Resultado da Promise 6
      ] = await Promise.all(promises); // Espera por todos os resultados em paralelo!
  
      console.log('[loadEtapasEdit] Todas as buscas de dados concluídas.');
      console.log('[loadEtapasEdit] Array de usuários recebido (do cache ou API):', usuarios)

  
      // Combina todos os arrays de cortes buscados em um único array (usado na lógica da etapa Corte)
      const todosCortes = [...cortesPendentes, ...cortesCortados, ...cortesVerificados, ...cortesUsados];
      console.log('[loadEtapasEdit] Total de cortes relevantes buscados:', todosCortes.length);
  
      // ** <-- FIM: GRUPAR TODAS AS BUSCAS DE DADOS EM PARALELO --> **
  
  
      // ** 3. Lógica de sincronização de etapas DA OP com lançamentos (usa 'lancamentos' e 'op.etapas' originais) **
      // Esta lógica AGORA usa o array 'lancamentos' populado por Promise.all (vindo da busca paralela)
  
      if (op.etapas && Array.isArray(op.etapas)) {
        op.etapas = op.etapas.map((etapa, index) => {
          const lancamento = lancamentos.find(l => l.etapa_index === index && l.processo === etapa.processo);
          if (lancamento) { // Se um lançamento correspondente for encontrado
            return {
              ...etapa, // Começa com as propriedades existentes da etapa
              usuario: lancamento.funcionario || etapa.usuario || '', // Usa usuário do lançamento
              quantidade: lancamento.quantidade || etapa.quantidade || 0, // Usa quantidade do lançamento
              lancado: true, // Marca como lançado
              ultimoLancamentoId: lancamento.id || etapa.ultimoLancamentoId // Usa ID do lançamento
            };
          } else if (etapa.processo === 'Corte') {
            // Se não houver lançamento para a etapa Corte, mantém o objeto da etapa como está
            return etapa; // Seu estado 'lancado', 'usuario' etc. será atualizado no bloco Corte update abaixo
          } else {
            // Se não houver lançamento para outras etapas, reseta quantidade e marca como não lançado
            return {
              ...etapa, // Começa com as propriedades existentes
              quantidade: 0,
              lancado: false,
              ultimoLancamentoId: null
            };
          }
        });
      } else {
        // Lógica para criar etapas iniciais se a OP não tiver nenhuma (baseado no produto)
        const produto = produtos.find(p => p.nome === op.produto); // Usa 'produtos' populado por Promise.all
        if (produto && produto.etapas) {
          op.etapas = produto.etapas.map(etapa => ({
            processo: etapa.processo,
            usuario: '',
            quantidade: 0,
            lancado: false,
            ultimoLancamentoId: null
          }));
        } else {
          op.etapas = [];
        }
      }
      console.log('[loadEtapasEdit] Etapas sincronizadas da OP após atualização:', op.etapas);
  
  
      // ** <-- 4. SEÇÃO DE ATUALIZAÇÃO DA ETAPA "CORTE" BASEADA EM CORTES ENCONTRADOS --> **
      // Este bloco usa 'op.etapas' (sincronizado acima) e 'todosCortes' (buscado antes em paralelo).
      // Ele atualiza o estado da etapa Corte no objeto OP ANTES da renderização.
  
      // 4a. Encontra a etapa Corte no array op.etapas (AGORA SINCRONIZADO)
      const corteEtapaIndex = op.etapas.findIndex(e => e.processo === 'Corte'); // Encontra o índice da etapa Corte
      const corteEtapa = corteEtapaIndex !== -1 ? op.etapas[corteEtapaIndex] : null; // Pega a referência do objeto da etapa
  
      // 4b. Se existir uma etapa Corte na OP e a OP não estiver finalizada/cancelada
      if (corteEtapa && op.status !== 'finalizado' && op.status !== 'cancelada') {
        // Use todosCortes (buscado antes) para encontrar o corte relevante para esta OP
        const corteEncontrado = todosCortes.find(c =>
          (c.op && c.op === op.numero) || // Procura pelo número da OP no corte
          (c.produto === op.produto && c.variante === op.variante) // Ou por produto/variante
        );
  
        // 4c. Atualize o objeto da etapa Corte DIRETAMENTE no array op.etapas (se um corte foi encontrado)
        if (corteEncontrado) {
          console.log('[loadEtapasEdit] Corte encontrado para OP:', op.numero, corteEncontrado);
          // Certifica que o índice da etapa Corte ainda é válido antes de tentar atualizar (segurança)
          if (corteEtapaIndex !== -1) {
            if (['cortados', 'verificado', 'usado'].includes(corteEncontrado.status)) {
              // Atualiza o objeto no ARRAY op.etapas no índice correto
              op.etapas[corteEtapaIndex] = {
                ...op.etapas[corteEtapaIndex], // Começa com os dados atuais da etapa no array
                usuario: corteEncontrado.cortador || 'Sistema',
                lancado: true, // Marca como lançado
                quantidade: corteEncontrado.quantidade || op.etapas[corteEtapaIndex].quantidade || 1 // Usa quantidade do corte
              };
              console.log('[loadEtapasEdit] Atualizando etapa Corte na memória para "Corte Realizado".');
              // NÃO CHAME saveOPChanges(op) AQUI!
            } else { // Status 'pendente' ou outro
              // Se o corte existe mas está pendente, marca a etapa como pendente
              op.etapas[corteEtapaIndex] = {
                ...op.etapas[corteEtapaIndex],
                usuario: '', lancado: false, quantidade: op.etapas[corteEtapaIndex].quantidade || 0
              };
              console.log('[loadEtapasEdit] Corte pendente para OP:', op.numero);
            }
          }
        } else { // Nenhum corte encontrado em 'todosCortes' para esta OP/produto/variante
          // Se não encontrou nenhum corte, marca a etapa Corte como pendente
          if (corteEtapaIndex !== -1) {
            op.etapas[corteEtapaIndex] = {
              ...op.etapas[corteEtapaIndex],
              usuario: '', lancado: false, quantidade: op.etapas[corteEtapaIndex].quantidade || 0
            };
            console.log('[loadEtapasEdit] Nenhum corte encontrado para OP:', op.numero);
          }
        }
  
        // 4d. Lógica para exibir o popup de corte pendente (verifica o objeto NO ARRAY op.etapas após a atualização)
        if (corteEtapaIndex !== -1 && !op.etapas[corteEtapaIndex].lancado) {
          mostrarPopupMensagem(
            `O corte para a Ordem de Produção #${op.numero} ainda está pendente. Conclua o corte antes de prosseguir com as outras etapas.`,
            'aviso'
          );
        }
      }
      // ** <-- FIM DA SEÇÃO DE ATUALIZAÇÃO DA ETAPA "CORTE" --> **
  
  
      // ** 5. Lógica para verificar status geral da OP e etapa atual (usa 'op.etapas' já atualizado) **
      const todasEtapasCompletas = await verificarEtapasEStatus(op, produtos); // Usa 'op.etapas' e 'produtos'
      // verificarEtapasEStatus chama saveOPChanges se o status 'em-aberto'/'produzindo' mudar (se necessário)
      const etapaAtualIndex = await determinarEtapaAtual(op, produtos); // Usa 'op.etapas' e 'produtos'
      console.log(`[loadEtapasEdit] Etapa atual index calculada: ${etapaAtualIndex}`);
  
  
      // ** 6. Obter tipos de usuários para selects (baseado em op.etapas e produtos) **
      const tiposUsuarios = await Promise.all(
        op.etapas.map(async (etapa) => ({
          processo: etapa.processo,
          tipoUsuario: await getTipoUsuarioPorProcesso(etapa.processo, op.produto, produtos), // Usa 'produtos'
        }))
      );
  
  
      // Limpa o container DOM antes de adicionar os novos elementos
      etapasContainer.innerHTML = '';
      // Cria um fragmento temporário para construir os elementos DOM eficientemente
      const fragment = document.createDocumentFragment();
  
      // ** 7. LOOP for - RENDERIZAÇÃO DAS ETAPAS **
      // Itera sobre o array 'op.etapas' (que já está preparado com o estado correto)
      for (let index = 0; index < op.etapas.length; index++) {
        const etapa = op.etapas[index]; // Obtém o objeto etapa para a iteração atual
  
        // ** <-- CRIAÇÃO E CONFIGURAÇÃO DA DIV DA LINHA (row) --> **
        // Esta linha deve estar AQUI, no início do corpo do loop
        const row = document.createElement('div');
        row.className = 'etapa-row'; // Adiciona a classe CSS
        row.dataset.index = index; // Adiciona um data attribute com o índice
        // ** <-----------------------------------------------------> **
  
        // Cria e configura o número da etapa
        const numero = document.createElement('span');
        numero.className = 'etapa-numero';
        numero.textContent = index + 1;
        row.appendChild(numero); // Adiciona numero a row
  
        // Cria e configura o input do processo
        const processo = document.createElement('input');
        processo.type = 'text';
        processo.className = 'etapa-processo';
        processo.value = etapa.processo;
        processo.readOnly = true;
        row.appendChild(processo); // Adiciona processo a row
  
  
        // ** Lógica para criar elementos específicos da etapa (Corte ou outras) **
        if (etapa.processo === 'Corte') {
          // Cria e configura os inputs de status e nome para a etapa Corte
          const usuarioStatusInput = document.createElement('input');
          usuarioStatusInput.type = 'text';
          usuarioStatusInput.className = 'etapa-usuario-status';
          usuarioStatusInput.readOnly = true;
          usuarioStatusInput.style.backgroundColor = '#d3d3d3';
          usuarioStatusInput.style.marginRight = '5px';
  
          const usuarioNomeInput = document.createElement('input');
          usuarioNomeInput.type = 'text';
          usuarioNomeInput.className = 'etapa-usuario-nome';
          usuarioNomeInput.readOnly = true;
          usuarioNomeInput.style.backgroundColor = '#d3d3d3';
  
          // Preenche os inputs usando os dados JÁ ATUALIZADOS no objeto 'etapa'
          usuarioStatusInput.value = etapa.lancado ? 'Corte Realizado' : 'Aguardando corte';
          usuarioNomeInput.value = etapa.usuario || ''; // Usa etapa.usuario diretamente
  
          console.log('[loadEtapasEdit] Renderizando etapa Corte. Status da etapa OP (na memória):', usuarioStatusInput.value, 'Usuário:', usuarioNomeInput.value);
  
          // Adiciona os inputs na linha
          row.appendChild(usuarioStatusInput);
          row.appendChild(usuarioNomeInput);
  
      } else { // Se não for a etapa Corte (Outras etapas que precisam de select de usuário e quantidade)

          const exigeQuantidade = tiposUsuarios[index].tipoUsuario === 'costureira' || tiposUsuarios[index].tipoUsuario === 'tiktik'; // Determina se exige quantidade
  
          // ** <-- CRIAÇÃO E CONFIGURAÇÃO DO SELECT DE USUÁRIO --> **
          const usuarioSelect = document.createElement('select'); // Cria o select
          usuarioSelect.className = 'select-usuario'; // Adiciona classe
          // Define o estado disabled do select baseado no status da OP, etapa atual, e se a etapa já foi lançada e exige quantidade
          usuarioSelect.disabled = op.status === 'finalizado' || op.status === 'cancelada' || index > etapaAtualIndex || (exigeQuantidade && etapa.lancado);
  
          // Adiciona a opção padrão
          usuarioSelect.innerHTML = '';
          const defaultOption = document.createElement('option');
          defaultOption.value = '';
          defaultOption.textContent = getUsuarioPlaceholder(tiposUsuarios[index].tipoUsuario); // Define o texto da opção padrão (ex: "Selecione a(o) Costureira(o)")
          usuarioSelect.appendChild(defaultOption);
  
          // ** <-- INÍCIO: LÓGICA DE FILTRAGEM E POPULAÇÃO DO SELECT --> **
  
          // Filtra o array 'usuarios' (recebido do Promise.all) pelo tipo de usuário esperado para esta etapa
          const usuariosFiltrados = usuarios.filter(u => { // Usa o array 'usuarios' completo
            const tipos = Array.isArray(u.tipos) ? u.tipos : []; // Garante que u.tipos é um array
            return tipos.includes(tiposUsuarios[index].tipoUsuario); // Filtra: usuário tem o tipo da etapa?
          });
  
          // Log para depuração: Mostra quais usuários foram encontrados para este select
          console.log(`[loadEtapasEdit] Etapa ${index} (${etapa.processo}): Filtrando usuários por tipo '${tiposUsuarios[index].tipoUsuario}'. Usuários filtrados (${usuariosFiltrados.length}):`, usuariosFiltrados);
  
  
          // Popula o select com os nomes dos usuários filtrados como <option>s
          usuariosFiltrados.forEach(user => {
              const option = document.createElement('option');
              option.value = user.nome; // O valor da opção é o nome do usuário
              option.textContent = user.nome; // O texto exibido é o nome do usuário
              usuarioSelect.appendChild(option); // Adiciona a opção ao select
          });
  
          // Seleciona o usuário salvo na etapa (se houver e estiver na lista de usuários filtrados)
          // O valor de 'etapa.usuario' deve ser o NOME do usuário salvo, não o tipo.
          if (etapa.usuario && usuariosFiltrados.some(u => u.nome === etapa.usuario)) {
              usuarioSelect.value = etapa.usuario; // Define o valor selecionado no select
          } else if (etapa.usuario) {
              // Caso raro: Usuário salvo (etapa.usuario) existe mas NÃO está na lista filtrada (talvez inativo?)
              // Adiciona o usuário salvo como uma opção desabilitada para mostrar o valor anterior
               const existingOption = usuarioSelect.querySelector(`option[value="${etapa.usuario}"]`);
               if (!existingOption) { // Evita duplicar se já foi adicionado manualmente (menos comum)
                   const userOption = document.createElement('option');
                   userOption.value = etapa.usuario;
                   userOption.textContent = etapa.usuario + ' (Inativo/Tipo incorreto)'; // Indica que algo está estranho
                   userOption.selected = true;
                   userOption.disabled = true; // Não pode ser alterado para ele
                   usuarioSelect.appendChild(userOption);
               }
               usuarioSelect.value = etapa.usuario; // Tenta definir o valor mesmo que a option esteja desabilitada
               console.warn(`[loadEtapasEdit] Usuário salvo '${etapa.usuario}' não encontrado na lista de usuários ativos para a etapa ${etapa.processo}.`);
          }
  
  
          // Adiciona o select de usuário à linha (tr)
          row.appendChild(usuarioSelect);
  
  
          // ** <-- INÍCIO: LÓGICA DE CRIAÇÃO DA QUANTIDADE DIV --> **
          // Cria e configura a div de quantidade (se exigir quantidade)
          if (exigeQuantidade) {
              // criarQuantidadeDiv cria os elementos de input e botão e os adiciona à div 'quantidade-lancar'
              // Nota: A função criarQuantidadeDiv também configura o valor inicial do input com etapa.quantidade
              // e adiciona os event listeners para o input e o botão "Lançar".
              const quantidadeDiv = criarQuantidadeDiv(etapa, op, usuarioSelect, index === etapaAtualIndex, row, produtos);
              // Adiciona a div de quantidade à linha
              row.appendChild(quantidadeDiv);
          }
  
       } // Fim do if/else para tipo de etapa

         fragment.appendChild(row);  
       } // Fim do loop for
  
      etapasContainer.appendChild(fragment);
  
      await atualizarVisualEtapas(op, produtos, true); // Usa 'op.etapas', 'produtos', chama saveOPChanges se status 'em-aberto'/'produzindo' mudar
      await updateFinalizarButtonState(op, produtos); // Usa 'op.etapas', 'produtos'
  
    } catch (error) {
      console.error('[loadEtapasEdit] Erro ao carregar etapas:', error);
      etapasContainer.innerHTML = '<p>Erro ao carregar etapas. Tente novamente.</p>';
      mostrarPopupMensagem('Erro ao carregar etapas. Tente novamente.', 'erro');
    } finally {
      isLoadingEtapas = false; // Garante que a flag seja resetada
    }
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
    // Atualizar etapa no op.etapas
    op.etapas[etapaIndex] = {
      ...etapa,
      usuario: dados.funcionario,
      quantidade: dados.quantidade,
      lancado: true,
      ultimoLancamentoId: producao.id
    };
    await saveOPChanges(op); // Sincronizar com o banco
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
    // Não precisamos de saveOPChanges aqui, pois já foi chamado em salvarProducao
    await updateFinalizarButtonState(op, produtos);

    const row = document.querySelector(`.etapa-row[data-index="${etapaIndex}"]`);
    if (row) {
      const quantidadeDiv = row.querySelector('.quantidade-lancar');
      if (quantidadeDiv) {
        const quantidadeInput = quantidadeDiv.querySelector('.quantidade-input');
        const lancarBtn = quantidadeDiv.querySelector('.botao-lancar');

        if (quantidadeInput && lancarBtn) {
          quantidadeInput.disabled = true;
          quantidadeInput.style.backgroundColor = '#d3d3d3';
          lancarBtn.textContent = 'Lançado';
          lancarBtn.disabled = true;
          lancarBtn.classList.add('lancado');
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
  // Adicionar apenas quantidadeInput e lancarBtn
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
const ordensData = await obterOrdensDeProducao(1, true, false, null, true);
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
    const updatedOrdensData = await obterOrdensDeProducao(1, true, false, null, true);
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
    await updateLancarBtn();
    if (!quantidadeInput.disabled) quantidadeInput.focus();
    await atualizarVisualEtapas(op, produtos);
    await updateFinalizarButtonState(op, produtos);
  });

  const handleInputChange = async () => {
    const etapaAtualIndex = await determinarEtapaAtual(op, produtos);
    const isCurrentEtapa = op.etapas.indexOf(etapa) === etapaAtualIndex;
    if (etapa.lancado || !isCurrentEtapa) {
      quantidadeInput.value = etapa.quantidade || '';
      return;
    }
    const novaQuantidade = parseInt(quantidadeInput.value) || 0;
    if (novaQuantidade !== etapa.quantidade) {
      etapa.quantidade = novaQuantidade;
      await saveOPChanges(op);
      await updateLancarBtn();
      await atualizarVisualEtapas(op, produtos);
    }
  };
  const debouncedHandleInputChange = debounce(handleInputChange, 200);
  quantidadeInput.addEventListener('input', debouncedHandleInputChange);
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
    // Exige lancado: true para todas as etapas, e quantidade > 0 para etapas que exigem
    if (!etapa.lancado || (exigeQuantidade && etapa.quantidade <= 0)) {
      return index;
    }
  }
  return op.etapas.length;
}

async function atualizarVisualEtapas(op, produtos, isFirstRender = false) {
  if (isEditingQuantidade) {
    console.log('[atualizarVisualEtapas] Ignorando atualização durante edição de quantidade');
    return;
  }

  const etapasRows = document.querySelectorAll('.etapa-row');
  const etapaAtualIndex = await determinarEtapaAtual(op, produtos);

  // Só verifica inconsistência se não for a primeira renderização
  if (!isFirstRender && etapasRows.length !== op.etapas.length) {
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
  
      const editProdutoOP = document.getElementById('editProdutoOP');
      const editQuantidadeInput = document.getElementById('editQuantidadeOP');
      const editDataEntregaInput = document.getElementById('editDataEntregaOP');
      const editVarianteContainer = document.getElementById('editVarianteContainer');
      const editVarianteInput = document.getElementById('editVarianteOP');
      const opNumeroElement = document.getElementById('opNumero');
      const etapasContainer = document.getElementById('etapasContainer');
  
      if (!editProdutoOP || !editQuantidadeInput || !editDataEntregaInput || !editVarianteContainer || !editVarianteInput || !opNumeroElement || !etapasContainer) {
        throw new Error('Elementos da tela de edição não encontrados no DOM.');
      }
  
      editProdutoOP.value = '';
      editQuantidadeInput.value = '';
      editQuantidadeInput.disabled = true;
      editQuantidadeInput.style.backgroundColor = '#d3d3d3';
      editDataEntregaInput.value = '';
      editDataEntregaInput.readOnly = true;
      editDataEntregaInput.style.backgroundColor = '#d3d3d3';
      editVarianteInput.value = '';
      editVarianteContainer.style.display = 'none';
      opNumeroElement.textContent = 'Carregando...';
      etapasContainer.innerHTML = '<div class="spinner">Carregando etapas...</div>';
  
      const ordensData = await obterOrdensDeProducao(1, true, false, null, true);
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
  
      // Força a verificação do status antes de carregar as etapas
      const produtos = await obterProdutos();
      await verificarEtapasEStatus(op, produtos);
  
      editProdutoOP.value = op.produto || '';
      editQuantidadeInput.value = op.quantidade || '';
      const dataEntrega = op.data_entrega ? new Date(op.data_entrega).toISOString().split('T')[0] : '';
      editDataEntregaInput.value = dataEntrega;
      if (op.variante) {
        const variantes = op.variante.split(' | ').join(', ');
        editVarianteInput.value = variantes;
        editVarianteContainer.style.display = 'block';
        editVarianteInput.style.width = '100%';
        editVarianteInput.style.boxSizing = 'border-box';
      } else {
        editVarianteContainer.style.display = 'none';
      }
      opNumeroElement.textContent = `OP n°: ${op.numero}`;
  
      opListView.style.display = 'none';
      opFormView.style.display = 'none';
      opEditView.style.display = 'block';
      await loadEtapasEdit(op, false);
  
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
    await loadOPTable('todas', '', 'numero', 'desc', 1, true, null);
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
let cortesPromise = {}; // Para requisições em andamento por status


async function obterCortes(status, forceRefresh = false) {
  const cacheKey = status;

  if (cortesPromise[cacheKey]) {
    console.log(`[obterCortes] Requisição em andamento para status "${status}", aguardando...`);
    return await cortesPromise[cacheKey];
  }

  if (cortesCache[cacheKey] && !forceRefresh) {
    console.log(`[obterCortes] Retornando cortes do cache para status "${status}".`);
    return cortesCache[cacheKey];
  }

  console.log(`[obterCortes] Buscando cortes diretamente do servidor para status "${status}"...`);
  cortesPromise[cacheKey] = (async () => { // Armazena a Promise
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/cortes?status=${status}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
         const errorText = await response.text(); // Capture o texto do erro para debugging
         console.error('[obterCortes] Erro na resposta da API:', response.status, errorText);
        throw new Error('Erro ao carregar cortes');
      }

      const cortes = await response.json();
      console.log(`[obterCortes] Cortes recebidos do servidor para status "${status}":`, cortes.length);

      cortesCache[cacheKey] = cortes;

      return cortes;
    } finally {
      delete cortesPromise[cacheKey];
    }
  })();

  return await cortesPromise[cacheKey];
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
    // **NÃO CHAME obterOrdensDeProducao(1, true) AQUI!**
    // Use os dados que já estão no cache global de ordens (ordensCache)
    // Verifique se ordensCache existe e se tem dados relevantes
     if (ordensCache && Array.isArray(ordensCache.rows)) {
       // Procurar a OP pelo número retornado pelo backend
       const op = ordensCache.rows.find(o => o.numero === updatedCorte.op);

       if (op) {
         const corteEtapa = op.etapas.find(e => e.processo === 'Corte');
         if (corteEtapa) {
           // Atualizar a etapa no objeto OP que está no cache (ou na memória local)
           corteEtapa.usuario = cortador;
           corteEtapa.lancado = true;
           // Agora, salve a OP atualizada no banco de dados
           await saveOPChanges(op); // Esta chamada PUT é necessária aqui.
           console.log(`[atualizarCorte] Etapa Corte atualizada na OP #${op.numero} para "Corte Realizado"`);
          limparCacheOrdens();
         }
       } else {
         console.warn('[atualizarCorte] OP não encontrada no cache para o número:', updatedCorte.op, 'Não foi possível atualizar a etapa Corte.');
        }
     } else {
        console.warn('[atualizarCorte] Cache de ordens não disponível ou inválido. Não foi possível atualizar a etapa Corte na OP.');
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

  cachedProdutos = await obterProdutos(); 

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
  await loadOPTable('todas', '', 'numero', 'desc', 1, true, null); // Alterado de 'status' para 'numero'
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
    produtoOP.addEventListener('change', async (e) => {
      await loadVariantesSelects(e.target.value, cachedProdutos); // Passe o cache
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