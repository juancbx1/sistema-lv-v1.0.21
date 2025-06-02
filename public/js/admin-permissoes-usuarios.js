// public/js/admin-permissoes-usuarios.js
import { verificarAutenticacao } from '/js/utils/auth.js';
// Importa as definições de permissões do frontend para saber o 'label' e agrupar
import { permissoesDisponiveis, permissoesPorTipo } from '/js/utils/permissoes.js'; 

// --- Variáveis Globais ---
let usuarioLogadoPermissoes = null;
let todosOsUsuariosCache = []; // Cache da lista de usuários
let usuarioSelecionadoParaPermissoes = null; // { id, nome, nome_usuario, permissoes_individuais: [] }
let permissoesOriginaisDoUsuario = []; // Para detectar mudanças

// Referências a elementos DOM principais (serão atribuídas no DOMContentLoaded)
let filtroUsuarioInput, listaUsuariosElement, nomeUsuarioPermissoesEl,
    permissoesCheckboxesContainerEl, salvarPermissoesBtnEl;

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

// --- Funções Utilitárias (Popup) ---
function mostrarPopupPermissoes(mensagem, tipo = 'info', duracao = 4000) {
    // Adapte sua função de popup global ou use a que definimos para estoque/precificação
    // com as classes pu-popup-mensagem e pu-popup-overlay
    const popupId = `popup-perm-${Date.now()}`;
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = `pu-popup-mensagem popup-${tipo}`; 
    const overlay = document.createElement('div');
    overlay.id = `overlay-${popupId}`;
    overlay.className = 'pu-popup-overlay';
    popup.innerHTML = `<p>${mensagem}</p><button>OK</button>`;
    popup.querySelector('button').onclick = () => { 
        popup.style.animation = 'pu-fadeOutPopup 0.3s forwards'; 
        overlay.style.animation = 'pu-fadeOutOverlayPopup 0.3s forwards';
        setTimeout(() => { popup.remove(); overlay.remove(); }, 300);
    };
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    if (duracao > 0) {
        setTimeout(() => {
            const el = document.getElementById(popupId);
            if (el) {
                el.style.animation = 'pu-fadeOutPopup 0.3s forwards';
                const ov = document.getElementById(`overlay-${popupId}`);
                if (ov) ov.style.animation = 'pu-fadeOutOverlayPopup 0.3s forwards';
                setTimeout(() => { el.remove(); if (ov) ov.remove(); }, 300);
            }
        }, duracao);
    }
}

// Em public/js/admin-permissoes-usuarios.js

async function fetchPermissoesAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');

    // Se não há token, e não é uma chamada GET pública (o que não temos nesta API de permissões)
    // impede a chamada e redireciona.
    if (!token) {
        mostrarPopupPermissoes('Erro de autenticação. Faça login novamente.', 'erro');
        // Atraso para o popup ser visível antes do redirecionamento
        setTimeout(() => {
            localStorage.removeItem('token'); // Limpa o token antigo
            localStorage.removeItem('usuarioLogado'); // Limpa dados do usuário se houver
            localStorage.removeItem('permissoes'); // Limpa cache de permissões
            window.location.href = '/login.html'; // Sua página de login principal
        }, 1500);
        throw new Error('Token não encontrado, acesso não autorizado.');
    }

    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    const finalOptions = {
        ...options, // Permite sobrescrever method, body, etc.
        headers: {
            ...defaultHeaders,
            ...options.headers, // Permite adicionar ou sobrescrever headers específicos
        },
    };

    // Adiciona cache-busting para GET requests se não for especificado de outra forma
    let url = `/api${endpoint}`;
    if ((!finalOptions.method || finalOptions.method.toUpperCase() === 'GET')) {
        url += url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
    }

    try {
        const response = await fetch(url, finalOptions);

        if (!response.ok) {
            let errorData = { error: `Erro HTTP ${response.status} - ${response.statusText}` };
            try {
                // Tenta parsear o corpo do erro como JSON
                const jsonError = await response.json();
                errorData = jsonError || errorData; // Usa o erro do JSON se disponível
            } catch (e) {
                // Se não for JSON, tenta ler como texto
                try {
                    const textError = await response.text();
                    if (textError) errorData.error = textError;
                } catch (textE) { /* Ignora se não conseguir ler como texto */ }
            }
            
            console.error(`[fetchPermissoesAPI] Erro ${response.status} em ${endpoint}:`, errorData);

            // Tratamento específico para erros de autenticação/autorização
            if (response.status === 401) { // Unauthorized - problema com o token (inválido, expirado)
                mostrarPopupPermissoes(errorData.error || 'Sessão inválida ou expirada. Faça login novamente.', 'erro');
                // Atraso para o popup ser visível antes do redirecionamento
                setTimeout(() => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('usuarioLogado');
                    localStorage.removeItem('permissoes');
                    window.location.href = '/login.html';
                }, 1500);
            } else if (response.status === 403) { // Forbidden - usuário autenticado, mas sem permissão para a ação
                // O popup já deve ser mostrado pela função que chamou a API e tratou o erro 403
                // Mas podemos ter um fallback aqui se a função chamadora não tratar.
                // mostrarPopupPermissoes(errorData.error || 'Você não tem permissão para realizar esta ação.', 'erro');
            }
            // Para outros erros, o popup será mostrado pela função que chamou fetchPermissoesAPI
            
            const err = new Error(errorData.error || `Erro ${response.status}`);
            err.status = response.status; // Adiciona o status ao objeto de erro
            err.data = errorData; // Adiciona os dados completos do erro
            throw err; // Re-lança o erro para ser tratado pela função chamadora
        }

        // Se a resposta for 204 No Content (comum para DELETE bem-sucedido sem corpo de resposta)
        // ou se for um método DELETE (mesmo que retorne 200 com corpo, mas geralmente é 204)
        if (response.status === 204 || finalOptions.method === 'DELETE') {
            return { success: true, message: 'Operação realizada com sucesso.' }; // Retorna um objeto de sucesso
        }
        
        return await response.json(); // Para GET, POST, PUT que retornam corpo JSON

    } catch (error) {
        console.error(`[fetchPermissoesAPI] Falha geral ao acessar ${url}:`, error);
        // A função chamadora é responsável por mostrar o popup específico do seu contexto,
        // a menos que seja um erro crítico de token já tratado acima.
        // Se não for um erro de status (ex: erro de rede), mostra um popup genérico.
        if (!error.status && !error.message.toLowerCase().includes('token')) { 
            mostrarPopupPermissoes(`Erro de comunicação com o servidor ao tentar acessar ${endpoint}. Verifique sua conexão.`, 'erro');
        }
        throw error; // Re-lança o erro para ser tratado pela função que chamou
    }
}


// 1. Buscar e Renderizar Lista de Usuários
async function carregarListaUsuarios() {
    if (!listaUsuariosElement) return;
    listaUsuariosElement.innerHTML = '<li class="pu-spinner">Carregando usuários...</li>';
    try {
        const usuarios = await fetchPermissoesAPI('/usuarios'); // API GET /api/usuarios
        todosOsUsuariosCache = usuarios || [];
        renderizarListaUsuarios(todosOsUsuariosCache);
    } catch (error) {
        listaUsuariosElement.innerHTML = '<li style="color:red; text-align:center;">Erro ao carregar usuários.</li>';
    }
}

function renderizarListaUsuarios(usuariosParaRenderizar) {
    if (!listaUsuariosElement) return;
    listaUsuariosElement.innerHTML = ''; // Limpa
    if (usuariosParaRenderizar.length === 0) {
        listaUsuariosElement.innerHTML = '<li style="text-align:center; color: var(--pu-cor-cinza-texto-secundario);">Nenhum usuário encontrado.</li>';
        return;
    }

    usuariosParaRenderizar.sort((a, b) => a.nome.localeCompare(b.nome)); // Ordena por nome

    usuariosParaRenderizar.forEach(usuario => {
        const li = document.createElement('li');
        li.textContent = `${usuario.nome} (${usuario.nome_usuario || 'N/A'})`;
        li.dataset.userId = usuario.id;
        li.addEventListener('click', () => selecionarUsuarioParaPermissoes(usuario.id));
        listaUsuariosElement.appendChild(li);
    });
}

// 2. Filtrar Lista de Usuários
function filtrarUsuarios() {
    if (!filtroUsuarioInput || !todosOsUsuariosCache) return;
    const termo = filtroUsuarioInput.value.toLowerCase();
    const usuariosFiltrados = todosOsUsuariosCache.filter(u => 
        u.nome.toLowerCase().includes(termo) || 
        (u.nome_usuario && u.nome_usuario.toLowerCase().includes(termo))
    );
    renderizarListaUsuarios(usuariosFiltrados);
    // Limpa a área de permissões se a busca resultar em nenhum usuário selecionado
    if (!usuariosFiltrados.some(u => u.id === usuarioSelecionadoParaPermissoes?.id)) {
        limparAreaPermissoes();
    }
}

// 3. Selecionar Usuário e Carregar Suas Permissões
async function selecionarUsuarioParaPermissoes(userId) {
    // Remove a classe 'active' de todos os LIs e adiciona ao clicado
    if (listaUsuariosElement) {
        Array.from(listaUsuariosElement.children).forEach(li => li.classList.remove('active'));
        const liSelecionado = listaUsuariosElement.querySelector(`li[data-user-id="${userId}"]`);
        if (liSelecionado) liSelecionado.classList.add('active');
    }

    usuarioSelecionadoParaPermissoes = todosOsUsuariosCache.find(u => u.id == userId);
    if (!usuarioSelecionadoParaPermissoes) {
        limparAreaPermissoes();
        return;
    }

    if (nomeUsuarioPermissoesEl) {
        nomeUsuarioPermissoesEl.textContent = `Editando permissões para: ${usuarioSelecionadoParaPermissoes.nome}`;
    }

    // As permissões que vêm de /api/usuarios no GET podem ser as individuais ou as totais.
    // Para esta tela, precisamos das permissões INDIVIDUAIS que foram explicitamente dadas
    // (aquelas que não vêm do tipo de usuário).
    // Se a sua API GET /usuarios já retorna as individuais na propriedade 'permissoes', ótimo.
    // Caso contrário, pode ser necessário buscar o usuário individualmente:
    // const usuarioDetalhado = await fetchPermissoesAPI(`/usuarios/${userId}`); // Se tiver essa rota que retorna detalhes
    // permissoesOriginaisDoUsuario = usuarioDetalhado.permissoes_individuais || [];
    
    // Assumindo que `usuarioSelecionadoParaPermissoes.permissoes` contém as permissões individuais
    // Se `permissoes` no objeto `usuario` são as totais, você precisaria calcular as individuais
    // subtraindo as permissões do tipo. Por simplicidade, vamos assumir que `usuarioSelecionadoParaPermissoes.permissoes`
    // são as permissões individuais que podem ser diretamente gerenciadas/salvas.
    permissoesOriginaisDoUsuario = Array.isArray(usuarioSelecionadoParaPermissoes.permissoes) 
        ? [...usuarioSelecionadoParaPermissoes.permissoes] 
        : [];

    renderizarCheckboxesPermissoes(permissoesOriginaisDoUsuario);
    if (salvarPermissoesBtnEl) salvarPermissoesBtnEl.disabled = true; // Desabilita salvar até haver mudança
}

function limparAreaPermissoes() {
    if (nomeUsuarioPermissoesEl) nomeUsuarioPermissoesEl.textContent = 'Selecione um usuário para ver/editar permissões';
    if (permissoesCheckboxesContainerEl) permissoesCheckboxesContainerEl.innerHTML = '<p style="text-align:center; color: var(--pu-cor-cinza-texto-secundario);">As permissões para o usuário selecionado aparecerão aqui.</p>';
    if (salvarPermissoesBtnEl) salvarPermissoesBtnEl.disabled = true;
    usuarioSelecionadoParaPermissoes = null;
    permissoesOriginaisDoUsuario = [];
}

// 4. Renderizar Checkboxes de Permissões (Agrupados)
function renderizarCheckboxesPermissoes(permissoesAtuaisDoUsuario = []) {
    if (!permissoesCheckboxesContainerEl) return;
    permissoesCheckboxesContainerEl.innerHTML = ''; // Limpa

    // Agrupar permissoesDisponiveis por uma nova propriedade 'grupo' se você adicionar ao permissoes.js
    // Ex: { id: 'criar-op', label: 'Criar Ordem de Produção', grupo: 'Ordens de Produção' }
    const grupos = {};
    permissoesDisponiveis.forEach(p => {
        const grupoNome = p.grupo || 'Outras Permissões'; // Fallback para grupo
        if (!grupos[grupoNome]) {
            grupos[grupoNome] = [];
        }
        grupos[grupoNome].push(p);
    });

    for (const nomeGrupo in grupos) {
        const divGrupo = document.createElement('div');
        divGrupo.className = 'pu-grupo-permissao';
        
        const tituloGrupo = document.createElement('h4');
        tituloGrupo.className = 'pu-grupo-permissao-titulo';
        tituloGrupo.textContent = nomeGrupo;
        divGrupo.appendChild(tituloGrupo);

        const gridPermissoes = document.createElement('div');
        gridPermissoes.className = 'pu-permissoes-grid';

        grupos[nomeGrupo].sort((a,b) => a.label.localeCompare(b.label)).forEach(permissao => {
            const divItem = document.createElement('div');
            divItem.className = 'pu-permissao-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `perm-${permissao.id}`;
            checkbox.value = permissao.id;
            checkbox.checked = permissoesAtuaisDoUsuario.includes(permissao.id);
            checkbox.addEventListener('change', () => {
                if (salvarPermissoesBtnEl) salvarPermissoesBtnEl.disabled = false; // Habilita ao mudar
            });

            const label = document.createElement('label');
            label.htmlFor = `perm-${permissao.id}`;
            label.textContent = permissao.label;
            
            divItem.appendChild(checkbox);
            divItem.appendChild(label);
            gridPermissoes.appendChild(divItem);
        });
        divGrupo.appendChild(gridPermissoes);
        permissoesCheckboxesContainerEl.appendChild(divGrupo);
    }
}

// 5. Salvar Permissões Alteradas
async function salvarPermissoes() {
    if (!usuarioSelecionadoParaPermissoes || !permissoesCheckboxesContainerEl || !salvarPermissoesBtnEl) return;

    const permissoesSelecionadas = [];
    permissoesCheckboxesContainerEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        permissoesSelecionadas.push(cb.value);
    });

    salvarPermissoesBtnEl.disabled = true;
    salvarPermissoesBtnEl.innerHTML = '<i class="fas fa-spinner fa-spin pu-spinner-btn-interno"></i> Salvando...';

    try {
        // A API PUT /api/usuarios/batch espera um array de usuários.
        // Aqui estamos salvando para um único usuário, então podemos usar PUT /api/usuarios
        // que espera um objeto de usuário no corpo, incluindo o array 'permissoes' (individuais).
        // Ou, se você quer usar a rota /batch, seria um array com um único usuário.

        // Usando PUT /api/usuarios (assumindo que ela aceita a atualização de 'permissoes')
        const payload = {
            id: usuarioSelecionadoParaPermissoes.id,
            permissoes: permissoesSelecionadas // Estas são as permissões INDIVIDUAIS
        };
        // Se sua API PUT /usuarios não atualiza o campo 'permissoes', você precisará
        // da rota PUT /api/usuarios/batch ou uma rota específica para permissões.
        // Vamos assumir que PUT /usuarios/batch é a preferida e adaptamos o payload.
        
        const payloadBatch = [{
            id: usuarioSelecionadoParaPermissoes.id,
            permissoes: permissoesSelecionadas
        }];

        await fetchPermissoesAPI('/usuarios/batch', { // Endpoint da API de lote
            method: 'PUT',
            body: JSON.stringify(payloadBatch) 
        });

        mostrarPopupPermissoes('Permissões salvas com sucesso!', 'sucesso');
        permissoesOriginaisDoUsuario = [...permissoesSelecionadas]; // Atualiza o original para o novo estado salvo
        salvarPermissoesBtnEl.disabled = true; // Desabilita novamente após salvar
        
        // Opcional: Recarregar a lista de usuários para refletir quaisquer mudanças (se a API de usuários retornar o usuário atualizado)
        // await carregarListaUsuarios(); 
        // E re-selecionar o usuário para atualizar o cache local dele
        // const usuarioAtualizado = todosOsUsuariosCache.find(u => u.id === usuarioSelecionadoParaPermissoes.id);
        // if(usuarioAtualizado) usuarioSelecionadoParaPermissoes = usuarioAtualizado;


    } catch (error) {
        mostrarPopupPermissoes(`Erro ao salvar permissões: ${error.message}`, 'erro');
        salvarPermissoesBtnEl.disabled = false; // Reabilita em caso de erro
    } finally {
        salvarPermissoesBtnEl.innerHTML = '<i class="fas fa-save"></i> Salvar Permissões Alteradas';
    }
}


// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/permissoes-usuarios.html', ['acesso-permissoes-usuarios']);
        if (!auth) {
             // verificarAutenticacao já deve redirecionar
            return; 
        }
        usuarioLogadoPermissoes = auth.usuario;
        document.body.classList.add('autenticado');

        // Atribuir elementos DOM
        filtroUsuarioInput = document.getElementById('filtroUsuarioPermissoes');
        listaUsuariosElement = document.getElementById('listaUsuariosParaPermissao');
        nomeUsuarioPermissoesEl = document.getElementById('nomeUsuarioPermissoes');
        permissoesCheckboxesContainerEl = document.getElementById('permissoesCheckboxesContainer');
        salvarPermissoesBtnEl = document.getElementById('salvarPermissoesBtn');

        await carregarListaUsuarios();

        if (filtroUsuarioInput) {
            filtroUsuarioInput.addEventListener('input', debounce(filtrarUsuarios, 300));
        }
        if (salvarPermissoesBtnEl) {
            salvarPermissoesBtnEl.addEventListener('click', salvarPermissoes);
        }

    } catch (error) {
        console.error("Erro na inicialização da página de permissões:", error);
        mostrarPopupPermissoes("Erro crítico ao carregar a página.", "erro");
    }
});