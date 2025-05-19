// public/js/admin-estoque.js
import { verificarAutenticacao } from '/js/utils/auth.js';
// Se você tiver 'obterProdutos' em utils/storage.js para pegar definições e imagens de produtos, mantenha.
import { obterProdutos, invalidateCache } from '/js/utils/storage.js'; 

// --- Variáveis Globais Específicas para esta Página ---
let permissoesGlobaisEstoque = [];
let usuarioLogadoEstoque = null;
let itemEstoqueEmEdicao = null; // Guarda o produto/variante { produto_nome, variante_nome, saldo_atual }

// --- FUNÇÃO DE POPUP DE MENSAGEM (Simples - Adapte ou use uma global se tiver) ---
function mostrarPopupEstoque(mensagem, tipo = 'info') { // Renomeada para evitar conflito
    console.log(`[POPUP ESTOQUE - ${tipo.toUpperCase()}]: ${mensagem}`);
    // Implementação básica. Se você tem uma função global de popup, use-a.
    // Esta é apenas para que as chamadas não quebrem.
    const popupId = `popup-estoque-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    // Adicione classes CSS para estilizar seu popup (ex: ep-popup-mensagem ep-popup-sucesso)
    popup.className = `meu-popup-estoque meu-popup-${tipo}`; 
    popup.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        padding: 15px 25px; background-color: ${tipo === 'sucesso' ? '#27ae60' : tipo === 'erro' ? '#e74c3c' : '#3498db'};
        color: white; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 2000; transition: opacity 0.5s;
    `;
    popup.textContent = mensagem;
    document.body.appendChild(popup);
    setTimeout(() => {
        popup.style.opacity = '0';
        setTimeout(() => {
            const activePopup = document.getElementById(popupId);
            if (activePopup) activePopup.remove();
        }, 500);
    }, 3500);
}


// --- FUNÇÃO PARA CHAMADAS À API (Autenticada) ---
async function fetchEstoqueAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        mostrarPopupEstoque('Erro de autenticação. Faça login novamente.', 'erro');
        window.location.href = '/index.html'; // Ou sua página de login
        throw new Error('Token não encontrado');
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Adiciona cache-busting para GET requests se não for especificado de outra forma
    let url = `/api${endpoint}`;
    if ((!options.method || options.method.toUpperCase() === 'GET') && !url.includes('?')) {
        url += `?_=${Date.now()}`;
    } else if ((!options.method || options.method.toUpperCase() === 'GET') && url.includes('?')) {
        url += `&_=${Date.now()}`;
    }

    try {
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            let errorData = { error: `Erro ${response.status} - ${response.statusText}` };
            try {
                const jsonError = await response.json();
                errorData = jsonError || errorData;
            } catch (e) { /* Ignora se o corpo do erro não for JSON */ }
            
            console.error(`[fetchEstoqueAPI] Erro ${response.status} em ${endpoint}:`, errorData);

            if (response.status === 401 || (errorData.error || '').toLowerCase().includes('token')) {
                localStorage.removeItem('token');
                // Limpar outros caches de usuário se houver
                mostrarPopupEstoque('Sessão expirada ou inválida. Faça login novamente.', 'erro');
                window.location.href = '/index.html'; // Redireciona para o login
            }
            
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status;
            err.data = errorData;
            throw err;
        }
        if (response.status === 204 || options.method === 'DELETE') { // 204 No Content
            return { success: true };
        }
        return await response.json();
    } catch (error) {
        console.error(`[fetchEstoqueAPI] Falha ao acessar ${url}:`, error);
        // Não mostra popup aqui para evitar duplicidade se a função chamadora já o fizer.
        throw error; 
    }
}

// --- INICIALIZAÇÃO DA PÁGINA ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/estoque.html', ['acesso-estoque']);
        if (!auth) { 
            // verificarAutenticacao já deve redirecionar se falhar
            return; 
        }
        permissoesGlobaisEstoque = auth.permissoes || [];
        usuarioLogadoEstoque = auth.usuario;
        console.log('[Estoque Auth OK] Usuário:', usuarioLogadoEstoque?.nome, 'Permissões:', permissoesGlobaisEstoque);
        await inicializarPaginaEstoque();
    } catch (error) {
        console.error('[Estoque DOMContentLoaded] Erro na autenticação ou inicialização:', error);
        mostrarPopupEstoque('Erro crítico ao carregar a página de estoque. Tente recarregar.', 'erro');
        // Opcionalmente redirecionar para acesso negado se o erro for de autenticação
        // if (error.message.toLowerCase().includes('token') || error.status === 401 || error.status === 403) {
        //     window.location.href = '/admin/acesso-negado.html';
        // }
    }
});

async function inicializarPaginaEstoque() {
    console.log('[Estoque inicializarPaginaEstoque]');
    // Idealmente, invalidar um cache específico para o saldo do estoque se você implementar cache em obterSaldoEstoqueAtualAPI
    // Ex: invalidateCache('saldoEstoque'); 
    await carregarTabelaEstoque();
    setupEventListenersEstoque();
    handleHashChangeEstoque(); // Processar hash inicial para mostrar a view correta
    console.log('[Estoque inicializarPaginaEstoque] Concluído.');
}

function setupEventListenersEstoque() {
    const searchEstoqueInput = document.getElementById('searchEstoque');
    if (searchEstoqueInput) {
        searchEstoqueInput.addEventListener('input', debounce(() => carregarTabelaEstoque(searchEstoqueInput.value), 350));
    }

    const voltarBtn = document.getElementById('voltarBtnEstoque');
    if (voltarBtn) {
        voltarBtn.addEventListener('click', () => {
            window.location.hash = ''; // Limpa hash para acionar handleHashChangeEstoque
        });
    }

    const salvarEstoqueBtn = document.getElementById('salvarEstoqueBtn');
    if (salvarEstoqueBtn) {
        salvarEstoqueBtn.addEventListener('click', salvarMovimentoManualEstoque);
    }

    window.addEventListener('hashchange', handleHashChangeEstoque);
    console.log('[Estoque setupEventListenersEstoque] Listeners configurados.');
}

function debounce(func, wait) { 
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// --- LÓGICA DE DADOS E TABELA ---
async function obterSaldoEstoqueAtualAPI() {
    console.log('[obterSaldoEstoqueAtualAPI] Buscando saldo do estoque...');
    try {
        const saldo = await fetchEstoqueAPI('/estoque/saldo'); // Usa a fetchEstoqueAPI definida acima
        return saldo || [];
    } catch (error) {
        console.error('[obterSaldoEstoqueAtualAPI] Erro ao buscar saldo:', error);
        mostrarPopupEstoque('Falha ao carregar dados do estoque.', 'erro');
        return [];
    }
}

async function carregarTabelaEstoque(search = '') {
    console.log('[carregarTabelaEstoque] Carregando com busca:', search);
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) {
        console.error("[carregarTabelaEstoque] Elemento tbody #estoqueTableBody não encontrado.");
        return;
    }
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Carregando estoque...</td></tr>`;

    try {
        const [saldosDoEstoque, todosOsProdutosDef] = await Promise.all([
            obterSaldoEstoqueAtualAPI(),
            obterProdutos() // Usando a função de utils/storage.js
        ]);

        let itensFiltrados = saldosDoEstoque.filter(item =>
            item.produto_nome.toLowerCase().includes(search.toLowerCase()) ||
            (item.variante_nome && item.variante_nome !== '-' && item.variante_nome.toLowerCase().includes(search.toLowerCase()))
        );
        itensFiltrados.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
        
        renderizarTabelaEstoque(itensFiltrados, todosOsProdutosDef || []);
    } catch (error) {
        console.error('[carregarTabelaEstoque] Erro ao carregar dados para tabela:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red;">Erro ao carregar dados do estoque.</td></tr>`;
    }
}

function renderizarTabelaEstoque(itensDeEstoque, produtosDefinicoes) {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) { // Adicionando uma verificação para tbody também
        console.error("[renderizarTabelaEstoque] Elemento tbody #estoqueTableBody não encontrado!");
        return;
    }
    tbody.innerHTML = '';

    if (itensDeEstoque.length === 0) {
        const searchVal = document.getElementById('searchEstoque')?.value;
        const msg = searchVal ? 'Nenhum item encontrado para esta busca.' : 'Estoque vazio.';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">${msg}</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    itensDeEstoque.forEach(item => {
        // Se saldo_atual for 0 ou negativo e você não quiser mostrar, pode filtrar aqui
        if (item.saldo_atual <= 0 && !document.getElementById('searchEstoque')?.value) { // Não mostra saldo 0 a menos que buscando
            // return; // Descomente se não quiser mostrar itens com saldo zero ou negativo por padrão
        }

        const produtoDef = produtosDefinicoes.find(p => p.nome === item.produto_nome);
        let imagemSrc = '/images/placeholder.png'; 
        if (produtoDef) { 
            if (item.variante_nome && item.variante_nome !== '-') {
                const gradeItem = produtoDef.grade?.find(g => g.variacao === item.variante_nome);
                if (gradeItem?.imagem) imagemSrc = gradeItem.imagem;
                else if (produtoDef.imagem) imagemSrc = produtoDef.imagem;
            } else if (produtoDef.imagem) {
                imagemSrc = produtoDef.imagem;
            }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="thumbnail">${imagemSrc !== '/images/placeholder.png' ? `<img src="${imagemSrc}" alt="${item.produto_nome}">` : '<span></span>'}</div></td>
            <td>${item.produto_nome}</td>
            <td>${item.variante_nome || '-'}</td>
            <td class="saldo-estoque">${item.saldo_atual}</td>
            <td>
                ${permissoesGlobaisEstoque.includes('gerenciar-estoque') ? 
                `<button class="ep-btn ep-btn-small btn-ajustar-estoque" title="Ajustar Estoque">
                    <i class="fas fa-edit"></i> Ajustar
                 </button>` : ''}
            </td>
        `;

        // --- Anexar o Event Listener AQUI ---
        if (permissoesGlobaisEstoque.includes('gerenciar-estoque')) {
            const ajustarBtn = tr.querySelector('.btn-ajustar-estoque');
            if (ajustarBtn) {
                // Certifique-se de que handleAjustarEstoqueClick está no escopo correto
                // ou passe 'item' diretamente se a função não estiver definida globalmente.
                // Se handleAjustarEstoqueClick é uma função global ou no mesmo escopo, isso funciona:
                ajustarBtn.addEventListener('click', () => {
                    console.log('[Event Listener Tabela] Botão Ajustar clicado para item:', item); // LOG DE DEBUG
                    handleAjustarEstoqueClick(item);
                });
            } else {
                // Isso não deveria acontecer se a permissão estiver correta e o HTML do botão foi inserido.
                console.warn("[renderizarTabelaEstoque] Botão .btn-ajustar-estoque não encontrado na linha, mesmo com permissão.");
            }
        }
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    console.log('[renderizarTabelaEstoque] Tabela de estoque renderizada com itens:', itensDeEstoque.length);
}

// --- LÓGICA DE EDIÇÃO/MOVIMENTAÇÃO DE ESTOQUE ---
function handleAjustarEstoqueClick(item) {
    console.log(`[handleAjustarEstoqueClick] Item:`, item);
    itemEstoqueEmEdicao = { ...item }; // Copia o item para edição

    document.getElementById('editEstoqueTitle').textContent = `Ajustar Estoque: ${item.produto_nome} ${item.variante_nome && item.variante_nome !== '-' ? `(${item.variante_nome})` : ''}`;
    document.getElementById('produtoNomeEstoque').value = item.produto_nome;
    document.getElementById('varianteNomeEstoque').value = item.variante_nome || '-'; // Mostra '-' se for null/vazio
    document.getElementById('saldoAtualDisplay').textContent = item.saldo_atual; 
    
    const tipoMovSelect = document.getElementById('tipoMovimentoEstoque');
    const qtdInput = document.getElementById('quantidadeMovimentoEstoque');
    const qtdLabel = document.querySelector('label[for="quantidadeMovimentoEstoque"]');
    
    tipoMovSelect.value = 'ENTRADA_MANUAL'; // Default ao abrir
    qtdInput.value = '';
    document.getElementById('observacaoMovimentoEstoque').value = '';
    
    const updateLabelAndInput = () => {
        if (!qtdLabel || !qtdInput) return;
        if (tipoMovSelect.value === 'BALANCO') {
            qtdLabel.textContent = 'Ajustar Saldo Para (Nova Quantidade Total):';
            qtdInput.placeholder = `Ex: ${itemEstoqueEmEdicao.saldo_atual}`; // Sugere o saldo atual
            qtdInput.value = itemEstoqueEmEdicao.saldo_atual; // Preenche com o saldo atual para balanço
            qtdInput.min = "0"; 
        } else {
            qtdLabel.textContent = 'Quantidade a Movimentar:';
            qtdInput.placeholder = 'Ex: 10';
            qtdInput.value = ''; // Limpa para entrada/saída
            qtdInput.min = "1"; 
        }
    };

    if (tipoMovSelect._changeListener) {
        tipoMovSelect.removeEventListener('change', tipoMovSelect._changeListener);
    }
    tipoMovSelect.addEventListener('change', updateLabelAndInput);
    tipoMovSelect._changeListener = updateLabelAndInput;
    updateLabelAndInput(); 

    window.location.hash = '#editar-estoque';
}

async function salvarMovimentoManualEstoque() {
    if (!itemEstoqueEmEdicao) {
        mostrarPopupEstoque('Nenhum item selecionado para edição.', 'erro');
        return;
    }

    const tipoOperacao = document.getElementById('tipoMovimentoEstoque').value;
    const quantidadeStr = document.getElementById('quantidadeMovimentoEstoque').value;
    const observacao = document.getElementById('observacaoMovimentoEstoque').value;

    if (quantidadeStr.trim() === '') {
        mostrarPopupEstoque('O campo de quantidade é obrigatório.', 'aviso');
        return;
    }
    const quantidade = parseInt(quantidadeStr);

    if (isNaN(quantidade)) {
        mostrarPopupEstoque('Quantidade deve ser um número.', 'aviso');
        return;
    }
    if ((tipoOperacao === 'ENTRADA_MANUAL' || tipoOperacao === 'SAIDA_MANUAL') && quantidade <= 0) {
        mostrarPopupEstoque('Quantidade para entrada/saída manual deve ser maior que zero.', 'aviso');
        return;
    }
    if (tipoOperacao === 'BALANCO' && quantidade < 0) {
        mostrarPopupEstoque('Quantidade para balanço não pode ser negativa.', 'aviso');
        return;
    }

    const payload = {
        produto_nome: itemEstoqueEmEdicao.produto_nome,
        variante_nome: (itemEstoqueEmEdicao.variante_nome === '-' || !itemEstoqueEmEdicao.variante_nome) ? null : itemEstoqueEmEdicao.variante_nome,
        quantidade_movimentada: quantidade,
        tipo_operacao: tipoOperacao,
        observacao: observacao
    };

    console.log('[salvarMovimentoManualEstoque] Enviando Payload:', payload);
    const salvarBtn = document.getElementById('salvarEstoqueBtn');
    salvarBtn.disabled = true;
    salvarBtn.textContent = 'Salvando...'; // Mais simples que innerHTML com ícone aqui

    try {
        const resultado = await fetchEstoqueAPI('/estoque/movimento-manual', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        mostrarPopupEstoque(resultado.message || 'Movimento de estoque salvo com sucesso!', 'sucesso');
        
        invalidateCache('saldoEstoque'); // Invalida um possível cache de saldo
        window.location.hash = ''; // Volta para a lista e aciona handleHashChangeEstoque
    } catch (error) {
        console.error('[salvarMovimentoManualEstoque] Erro ao salvar:', error);
        mostrarPopupEstoque(error.data?.details || error.message || 'Erro desconhecido ao salvar movimento.', 'erro');
    } finally {
        salvarBtn.disabled = false;
        salvarBtn.textContent = 'Salvar Movimento';
    }
}

function handleHashChangeEstoque() {
    const mainView = document.getElementById('mainViewEstoque');
    const editView = document.getElementById('editEstoqueView');
    if (!mainView || !editView) {
        console.error("[handleHashChangeEstoque] Views não encontradas.");
        return;
    }

    if (window.location.hash === '#editar-estoque') {
        // A lógica de preencher o formulário já está em handleAjustarEstoqueClick
        // que é chamado ANTES da hash mudar.
        // Aqui apenas controlamos a visibilidade das views.
        if (!itemEstoqueEmEdicao) { // Se o usuário digitou a hash manualmente sem clicar em um item
            console.warn("[handleHashChangeEstoque] Tentativa de acessar #editar-estoque sem item em edição. Voltando para lista.");
            window.location.hash = ''; // Força a voltar para a lista
            return;
        }
        mainView.style.display = 'none';
        editView.style.display = 'block'; 
    } else { // Hash vazia ou qualquer outra
        mainView.style.display = 'block';
        editView.style.display = 'none';
        itemEstoqueEmEdicao = null; 
        // Recarrega a tabela ao voltar para a lista principal,
        // mas apenas se a view principal estiver de fato se tornando visível.
        // Evita recargas desnecessárias se a hash mudar para algo não relacionado.
        if(mainView.style.display === 'block') {
            carregarTabelaEstoque(document.getElementById('searchEstoque')?.value || '');
        }
    }
}