// public/js/admin-permissoes-usuarios.js
import { verificarAutenticacao } from '/js/utils/auth.js';
// NOVO: Importa a estrutura categorizada e as permissões por tipo
import { permissoesCategorizadas, permissoesPorTipo } from '/js/utils/permissoes.js'; 

// --- Variáveis de Estado da Página ---
let todosOsUsuariosCache = [];
let usuarioSelecionado = null;
let permissoesAlteradas = false;

// --- Referências a Elementos do DOM ---
let filtroUsuarioInput, listaUsuariosEl, nomeUsuarioPermissoesEl,
    permissoesCheckboxesContainerEl, salvarPermissoesBtnEl;

// --- Funções Utilitárias (Mantidas do seu código original) ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function mostrarPopupPermissoes(mensagem, tipo = 'info', duracao = 4000) {
    const popupId = `popup-perm-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `pu-popup-mensagem popup-${tipo}`; 
    const overlay = document.createElement('div');
    overlay.className = 'pu-popup-overlay';
    popup.innerHTML = `<p>${mensagem}</p><button>OK</button>`;
    
    const closePopup = () => {
        popup.style.animation = 'pu-fadeOutPopup 0.3s forwards'; 
        overlay.style.animation = 'pu-fadeOutOverlayPopup 0.3s forwards';
        setTimeout(() => { popup.remove(); overlay.remove(); }, 300);
    };

    popup.querySelector('button').onclick = closePopup;
    overlay.onclick = closePopup;
    
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    
    if (duracao > 0) {
        setTimeout(() => {
            const el = document.getElementById(popupId);
            if (el) closePopup();
        }, duracao);
    }
}

async function fetchPermissoesAPI(endpoint, options = {}) {
    // 1. Obter o token de autenticação do localStorage.
    const token = localStorage.getItem('token');

    // 2. Verificação de Segurança (Fail-Fast): Se não houver token, interrompe a requisição
    // antes mesmo de tentar contato com o servidor.
    if (!token) {
        mostrarPopupPermissoes('Erro de autenticação. Por favor, faça login novamente.', 'erro');
        // Atraso para o popup ser visível antes do redirecionamento.
        setTimeout(() => {
            // Limpa qualquer dado de sessão antigo para garantir um login limpo.
            localStorage.clear(); 
            window.location.href = '/login.html'; // Redireciona para a página de login.
        }, 1500);
        // Lança um erro para parar a execução da função que chamou a API.
        throw new Error('Token não encontrado, acesso não autorizado.');
    }

    // 3. Configuração dos Headers Padrão para todas as requisições.
    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    // 4. Mescla as opções padrão com as opções específicas passadas para a função.
    // Isso permite sobrescrever ou adicionar headers e outras configurações conforme necessário.
    const finalOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    // 5. Prevenção de Cache (Cache Busting): Para requisições GET, adiciona um parâmetro
    // com o timestamp atual para garantir que o navegador não use uma resposta antiga do cache.
    let url = `/api${endpoint}`;
    if (!finalOptions.method || finalOptions.method.toUpperCase() === 'GET') {
        url += url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
    }

    try {
        // 6. Executa a requisição fetch.
        const response = await fetch(url, finalOptions);

        // 7. Tratamento de Respostas de Erro (qualquer status fora da faixa 200-299).
        if (!response.ok) {
            let errorData = { error: `Erro HTTP ${response.status} - ${response.statusText}` };
            
            // Tenta obter detalhes do erro do corpo da resposta, que geralmente vem em JSON.
            try {
                const jsonError = await response.json();
                errorData = jsonError || errorData;
            } catch (e) {
                // Se o corpo do erro não for JSON, tenta lê-lo como texto.
                try {
                    const textError = await response.text();
                    if (textError) errorData.error = textError;
                } catch (textE) { /* Ignora se não conseguir ler como texto */ }
            }
            
            console.error(`[fetchPermissoesAPI] Erro ${response.status} em ${endpoint}:`, errorData);

            // 7a. Tratamento específico para erro 401 (Não Autorizado):
            // Isso significa que o token é inválido, expirado ou ausente. A identidade do usuário é desconhecida.
            // A ação correta é forçar um novo login.
            if (response.status === 401) {
                mostrarPopupPermissoes(errorData.error || 'Sessão inválida ou expirada. Faça login novamente.', 'erro');
                setTimeout(() => {
                    localStorage.clear();
                    window.location.href = '/login.html';
                }, 1500);
            } 
            // 7b. Tratamento para erro 403 (Proibido - Forbidden):
            // O token é válido, o servidor sabe quem é o usuário, mas ele não tem permissão para esta ação específica.
            // A função que chamou a API deve tratar este caso e mostrar a mensagem de erro apropriada.

            // 8. Cria e lança um objeto de erro enriquecido para ser capturado pela função chamadora.
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status; // Adiciona o status HTTP ao erro.
            err.data = errorData;         // Adiciona os dados completos do erro.
            throw err;
        }

        // 9. Tratamento de Respostas de Sucesso.
        // Se a resposta for 204 (No Content), comum em requisições DELETE, não há corpo para ser lido.
        if (response.status === 204) {
            return { success: true, message: 'Operação realizada com sucesso.' };
        }
        
        // Para outras respostas de sucesso (200, 201), retorna o corpo da resposta em formato JSON.
        return await response.json();

    } catch (error) {
        // 10. Tratamento de Erros de Rede ou Falhas na Requisição.
        // Este bloco 'catch' captura erros como falha de conexão, servidor offline, ou os erros que lançamos no bloco `if (!response.ok)`.
        console.error(`[fetchPermissoesAPI] Falha geral ao acessar ${url}:`, error);

        // Se o erro não for um erro de status HTTP (que já foi tratado acima),
        // provavelmente é um problema de rede.
        if (!error.status) { 
            mostrarPopupPermissoes('Erro de comunicação com o servidor. Verifique sua conexão e tente novamente.', 'erro');
        }
        
        // Re-lança o erro para que a função que chamou a API saiba que a operação falhou
        // e possa tomar as ações necessárias (ex: parar um spinner, reabilitar um botão).
        throw error;
    }
}

// --- Funções Principais da Página (Refatoradas) ---

// 1. Carregar e Renderizar Lista de Usuários
async function carregarListaUsuarios() {
    listaUsuariosEl.innerHTML = '<li class="pu-spinner">Carregando usuários...</li>';
    try {
        // Seu backend já retorna as permissões totais para cada usuário, o que é perfeito!
        todosOsUsuariosCache = await fetchPermissoesAPI('/usuarios');
        renderizarListaUsuarios(todosOsUsuariosCache);
    } catch (error) {
        listaUsuariosEl.innerHTML = '<li style="color:red; text-align:center;">Erro ao carregar usuários.</li>';
    }
}

function renderizarListaUsuarios(usuarios) {
    listaUsuariosEl.innerHTML = '';
    if (!usuarios || usuarios.length === 0) {
        listaUsuariosEl.innerHTML = '<li>Nenhum usuário encontrado.</li>';
        return;
    }
    usuarios.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(usuario => {
        const li = document.createElement('li');
        li.textContent = usuario.nome;
        li.dataset.userId = usuario.id;
        li.addEventListener('click', () => selecionarUsuario(usuario));
        listaUsuariosEl.appendChild(li);
    });
}

// 2. Filtrar Usuários
function filtrarUsuarios() {
    const termo = filtroUsuarioInput.value.toLowerCase();
    const filtrados = todosOsUsuariosCache.filter(u => u.nome.toLowerCase().includes(termo));
    renderizarListaUsuarios(filtrados);
}

// 3. Selecionar um Usuário
function selecionarUsuario(usuario) {
    usuarioSelecionado = usuario;
    
    // Atualiza a classe 'active' na lista
    Array.from(listaUsuariosEl.children).forEach(li => {
        li.classList.toggle('active', li.dataset.userId == usuario.id);
    });

    nomeUsuarioPermissoesEl.textContent = `Editando permissões para: ${usuario.nome}`;
    renderizarCheckboxesPermissoes(usuario); // Passa o objeto do usuário inteiro
    salvarPermissoesBtnEl.disabled = true;
    permissoesAlteradas = false;
}

// 4. RENDERIZAR CHECKBOXES (AGORA COMO UM ACORDEÃO INTERATIVO)
function renderizarCheckboxesPermissoes(usuario) {
    permissoesCheckboxesContainerEl.innerHTML = ''; // Limpa a área

    // Calcula as permissões que vêm do 'tipo' do usuário (ex: 'admin')
    const permissoesBase = new Set();
    (usuario.tipos || []).forEach(tipo => {
        (permissoesPorTipo[tipo] || []).forEach(p => permissoesBase.add(p));
    });

    // Cria o container principal do acordeão
    const acordeaoContainer = document.createElement('div');
    acordeaoContainer.className = 'pu-acordeao-container';

    // Ordena as categorias em ordem alfabética para consistência
    const categoriasOrdenadas = Object.keys(permissoesCategorizadas).sort();

    // Itera sobre as categorias ORDENADAS para criar cada item do acordeão
    for (const categoria of categoriasOrdenadas) {
        const permissoesDaCategoria = permissoesCategorizadas[categoria];

        // Cria o item do acordeão (que contém título e conteúdo)
        const itemEl = document.createElement('div');
        itemEl.className = 'pu-acordeao-item';

        // Cria o título clicável
        const tituloEl = document.createElement('div');
        tituloEl.className = 'pu-acordeao-titulo';
        tituloEl.textContent = categoria; // Ex: "Usuários e Permissões"

        // Cria o container para o conteúdo (que será expandido/recolhido)
        const conteudoEl = document.createElement('div');
        conteudoEl.className = 'pu-acordeao-conteudo';

        // Cria a grid para organizar os checkboxes
        const gridEl = document.createElement('div');
        gridEl.className = 'pu-permissoes-grid';

        // Adiciona cada permissão da categoria na grid
        permissoesDaCategoria.sort((a,b) => a.label.localeCompare(b.label)).forEach(permissao => {
            const permissaoItemEl = document.createElement('div');
            permissaoItemEl.className = 'pu-permissao-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `perm-${permissao.id}`;
            checkbox.dataset.permissaoId = permissao.id;

            // Lógica de checked e disabled (sem alterações aqui)
            checkbox.checked = (usuario.permissoes || []).includes(permissao.id);
            const ePermissaoBase = permissoesBase.has(permissao.id);
            if (ePermissaoBase) {
                checkbox.disabled = true;
                permissaoItemEl.title = `Permissão herdada do(s) tipo(s): ${usuario.tipos.join(', ')}`;
            }
            
            const label = document.createElement('label');
            label.htmlFor = `perm-${permissao.id}`;
            label.textContent = permissao.label;

            permissaoItemEl.appendChild(checkbox);
            permissaoItemEl.appendChild(label);
            gridEl.appendChild(permissaoItemEl);
        });

        // Monta a estrutura: grid dentro do conteúdo, título e conteúdo dentro do item
        conteudoEl.appendChild(gridEl);
        itemEl.appendChild(tituloEl);
        itemEl.appendChild(conteudoEl);
        
        // Adiciona o item completo ao container do acordeão
        acordeaoContainer.appendChild(itemEl);

        // --- LÓGICA DE INTERATIVIDADE DO ACORDEÃO ---
        tituloEl.addEventListener('click', () => {
            // Verifica se o item clicado já está ativo
            const isActive = itemEl.classList.contains('active');

            // Opcional: Fecha todos os outros itens abertos para ter apenas um aberto por vez
            // Comente a linha abaixo se quiser permitir múltiplos itens abertos simultaneamente
            acordeaoContainer.querySelectorAll('.pu-acordeao-item.active').forEach(openItem => openItem.classList.remove('active'));

            // Alterna o estado 'active' do item clicado
            if (!isActive) {
                itemEl.classList.add('active');
            }
            
            // Anima a abertura/fechamento dos conteúdos
            acordeaoContainer.querySelectorAll('.pu-acordeao-conteudo').forEach(content => {
                const parentItem = content.closest('.pu-acordeao-item');
                if (parentItem.classList.contains('active')) {
                    // Se o item está ativo, define a max-height para a altura real do conteúdo para animar a abertura
                    content.style.maxHeight = content.scrollHeight + 'px';
                    content.style.padding = '0 15px'; // Restaura o padding
                } else {
                    // Se não, define a max-height para 0 para animar o fechamento
                    content.style.maxHeight = '0';
                    content.style.padding = '0 15px';
                }
            });
        });
    }

    // Adiciona o acordeão completo à página
    permissoesCheckboxesContainerEl.appendChild(acordeaoContainer);

    // Adiciona o listener de 'change' para habilitar o botão de salvar
    permissoesCheckboxesContainerEl.addEventListener('change', () => {
        permissoesAlteradas = true;
        salvarPermissoesBtnEl.disabled = false;
    });
}


// 5. SALVAR PERMISSÕES (A CORREÇÃO DO BUG ACONTECE AQUI)
async function handleSalvarPermissoes() {
    if (!usuarioSelecionado || !permissoesAlteradas) return;

    salvarPermissoesBtnEl.disabled = true;
    salvarPermissoesBtnEl.innerHTML = '<span class="pu-spinner-btn-interno"></span> Salvando...';

    // Coleta APENAS as permissões INDIVIDUAIS (marcadas e que NÃO estão desabilitadas)
    const permissoesIndividuaisParaSalvar = [];
    permissoesCheckboxesContainerEl.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => {
        if (cb.checked) {
            permissoesIndividuaisParaSalvar.push(cb.dataset.permissaoId);
        }
    });

    try {
        // Usamos a rota PUT /api/usuarios que é mais simples para um único usuário
        const usuarioAtualizado = await fetchPermissoesAPI('/usuarios', {
            method: 'PUT',
            body: JSON.stringify({
                id: usuarioSelecionado.id,
                permissoes: permissoesIndividuaisParaSalvar // A API já espera as permissões individuais
            })
        });

        // --- A CORREÇÃO DO BUG 1 ---
        // 1. Atualizamos o objeto do usuário no nosso cache com os dados novos do backend
        const indice = todosOsUsuariosCache.findIndex(u => u.id === usuarioAtualizado.id);
        if (indice !== -1) {
            // A sua API retorna 'permissoes_totais', vamos renomear para 'permissoes'
            // para manter a consistência com o que a lista inicial espera.
            usuarioAtualizado.permissoes = usuarioAtualizado.permissoes_totais; 
            delete usuarioAtualizado.permissoes_totais;
            
            // Atualiza o cache e a variável de estado
            todosOsUsuariosCache[indice] = { ...todosOsUsuariosCache[indice], ...usuarioAtualizado };
            usuarioSelecionado = todosOsUsuariosCache[indice];
        }
        
        // 2. Renderizamos as permissões novamente com os dados atualizados
        renderizarCheckboxesPermissoes(usuarioSelecionado);
        
        mostrarPopupPermissoes('Permissões salvas com sucesso!', 'sucesso');
        permissoesAlteradas = false; // Reseta o estado de alteração
        salvarPermissoesBtnEl.disabled = true; // Desabilita o botão até a próxima mudança

    } catch (error) {
        mostrarPopupPermissoes(`Erro ao salvar: ${error.message || 'Verifique o console.'}`, 'erro');
        salvarPermissoesBtnEl.disabled = false; // Reabilita o botão em caso de erro
    } finally {
        salvarPermissoesBtnEl.innerHTML = '<i class="fas fa-save"></i> Salvar Permissões Alteradas';
    }
}

// --- Inicialização da Página ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await verificarAutenticacao('admin/permissoes-usuarios.html', ['acesso-permissoes-usuarios']);
        document.body.classList.add('autenticado');

        // Atribuir elementos DOM
        filtroUsuarioInput = document.getElementById('filtroUsuarioPermissoes');
        listaUsuariosEl = document.getElementById('listaUsuariosParaPermissao');
        nomeUsuarioPermissoesEl = document.getElementById('nomeUsuarioPermissoes');
        permissoesCheckboxesContainerEl = document.getElementById('permissoesCheckboxesContainer');
        salvarPermissoesBtnEl = document.getElementById('salvarPermissoesBtn');

        await carregarListaUsuarios();

        filtroUsuarioInput.addEventListener('input', debounce(filtrarUsuarios, 300));
        salvarPermissoesBtnEl.addEventListener('click', handleSalvarPermissoes);

    } catch (error) {
        console.error("Erro na inicialização da página de permissões:", error);
    }
});