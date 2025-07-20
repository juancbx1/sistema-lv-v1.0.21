// /js/carregar-menu-lateral.js
import { logout } from '/js/utils/auth.js';

// Função para mostrar/fechar o popup
let popupAtual = null; // Guarda a referência do popup de loading

function mostrarPopup(mensagem, tipo = 'info', duracao = 4000) {
    // Fecha qualquer popup existente antes de abrir um novo
    if (popupAtual && popupAtual.parentNode) {
        popupAtual.parentNode.removeChild(popupAtual);
    }

    const container = document.createElement('div');
    const popup = document.createElement('div');
    const overlay = document.createElement('div');

    popup.className = `ml-popup-mensagem popup-${tipo}`;
    overlay.className = 'ml-popup-overlay';
    
    const p = document.createElement('p');
    p.textContent = mensagem;
    popup.appendChild(p);

    container.appendChild(overlay);
    container.appendChild(popup);
    document.body.appendChild(container);

    // Se a duração for 0, é um popup de "carregando", então guardamos a referência
    if (duracao === 0) {
        popupAtual = container;
        popup.classList.add('popup-loading'); // Adiciona classe para estilização específica
    } else {
        popupAtual = null; // Limpa a referência se não for de loading
        setTimeout(() => {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }, duracao);
    }
}

//Popup de Confirmação (Sim/Não)
function mostrarPopupConfirmacao(mensagem, tipo = 'aviso') {
    return new Promise((resolve) => {
        const container = document.createElement('div');
        const popup = document.createElement('div');
        popup.className = `ml-popup-mensagem popup-${tipo}`;
        
        const overlay = document.createElement('div');
        overlay.className = 'ml-popup-overlay';

        const p = document.createElement('p');
        p.textContent = mensagem;
        popup.appendChild(p);

        const botoesContainer = document.createElement('div');
        botoesContainer.className = 'ml-popup-botoes';

        const fecharEResolver = (valor) => {
            container.remove();
            resolve(valor);
        };

        const btnConfirmar = document.createElement('button');
        btnConfirmar.textContent = 'Sim, excluir';
        btnConfirmar.className = 'ml-btn-confirmar';
        btnConfirmar.onclick = () => fecharEResolver(true);

        const btnCancelar = document.createElement('button');
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.className = 'ml-btn-cancelar';
        btnCancelar.onclick = () => fecharEResolver(false);
        
        botoesContainer.appendChild(btnCancelar);
        botoesContainer.appendChild(btnConfirmar);
        popup.appendChild(botoesContainer);

        container.appendChild(overlay);
        container.appendChild(popup);
        document.body.appendChild(container);
    });
}

// Função para fechar o popup de "carregando"
function fecharPopupCarregando() {
    if (popupAtual && popupAtual.parentNode) {
        popupAtual.parentNode.removeChild(popupAtual);
        popupAtual = null;
    }
}

// --- LÓGICA DO MODAL DE AVATARES ---

const MAX_AVATARES = 3;

async function carregarAvataresNoModal() {
    const token = localStorage.getItem('token');
    const grid = document.getElementById('mlAvatarGrid');
    const helpText = document.getElementById('mlAvatarHelpText');
    const hiddenUploadInput = document.createElement('input'); // Input de upload dinâmico
    hiddenUploadInput.type = 'file';
    hiddenUploadInput.accept = 'image/*';
    hiddenUploadInput.style.display = 'none';

    grid.innerHTML = '<div class="ml-modal-spinner"></div>';

    try {
        const response = await fetch('/api/avatares', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar avatares.');
        const avatares = await response.json();

        grid.innerHTML = '';
        let avataresRenderizados = 0;

        avatares.forEach(avatar => {
            const slot = document.createElement('div');
            slot.className = 'ml-avatar-slot'; 
            if (avatar.ativo) slot.classList.add('ativo');

            slot.innerHTML = `<img src="${avatar.url_blob}" alt="Avatar"><button class="ml-avatar-delete-btn" title="Excluir avatar">×</button>`;
            grid.appendChild(slot);
            avataresRenderizados++;
            
            // AÇÃO: Selecionar avatar como ativo
            slot.querySelector('img').addEventListener('click', async () => {
                if (avatar.ativo || slot.classList.contains('loading')) return;

                // Adiciona o overlay de loading no slot clicado
                slot.classList.add('loading');
                slot.insertAdjacentHTML('beforeend', '<div class="loading-overlay"></div>');

                try {
                    const res = await fetch(`/api/avatares/definir-ativo/${avatar.id}`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.error);
                    
                    document.getElementById('mlUserPhoto').src = result.newAvatarUrl;
                    
                    // Não precisamos mais do popup genérico aqui, o feedback visual é suficiente.
                    // A remoção da classe e o fechamento do modal já indicam sucesso.

                    fecharModalAvatares();
                } catch(e) { 
                    mostrarPopup(e.message, 'erro'); 
                    // Remove o estado de loading em caso de erro
                    slot.classList.remove('loading');
                    slot.querySelector('.loading-overlay')?.remove();
                }
            });

            // AÇÃO: Excluir avatar
            slot.querySelector('.ml-avatar-delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation(); 
                const confirmado = await mostrarPopupConfirmacao('Tem certeza que deseja excluir este avatar permanentemente?', 'erro');
                
                if (confirmado) {
                    mostrarPopup('Excluindo avatar...', 'info', 0);
                    // O resto da lógica try/catch permanece o mesmo
                    try {
                        const res = await fetch(`/api/avatares/${avatar.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        
                        // --- INÍCIO DA MUDANÇA ---
                        const result = await res.json(); // Lemos a resposta JSON em qualquer caso
                        if (!res.ok) {
                            // Se a resposta não for OK, jogamos um erro com a mensagem da API
                            throw new Error(result.error || 'Falha ao excluir.');
                        }
                        // --- FIM DA MUDANÇA ---

                        fecharPopupCarregando();
                        carregarAvataresNoModal(); // Recarrega o modal para mostrar a mudança
                    } catch(e) { 
                        fecharPopupCarregando();
                        // Agora o popup de erro mostrará a mensagem correta (ex: "Não é possível excluir o avatar ativo")
                        mostrarPopup(e.message, 'erro');

                    }
                }
            });
        });

        const slotsVazios = MAX_AVATARES - avataresRenderizados;
        for (let i = 0; i < slotsVazios; i++) {
            const slotVazio = document.createElement('div');
            slotVazio.className = 'ml-avatar-slot slot-vazio';
            slotVazio.innerHTML = '<i class="fas fa-plus"></i>';
            slotVazio.title = 'Adicionar novo avatar';
            grid.appendChild(slotVazio);
            
            slotVazio.addEventListener('click', () => hiddenUploadInput.click());
        }

        hiddenUploadInput.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            mostrarPopup('Enviando e compactando...', 'info', 0);
            
            try {
                // Usando a abordagem de script tag, a função está global
                const compressedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 800 });

                const formData = new FormData();
                formData.append('foto', compressedFile, compressedFile.name);

                const res = await fetch('/api/avatares/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                
                fecharPopupCarregando();
                const result = await res.json();
                if (!res.ok) throw new Error(result.error);
                
                carregarAvataresNoModal();

            } catch (e) { fecharPopupCarregando(); mostrarPopup(e.message, 'erro'); }
            
            hiddenUploadInput.value = '';
        };

        if (avataresRenderizados >= MAX_AVATARES) {
            helpText.textContent = 'Limite de 3 avatares atingido. Exclua um para adicionar outro.';
        } else {
            helpText.textContent = 'Clique em um avatar para torná-lo ativo ou em "+" para adicionar.';
        }

    } catch (error) {
        grid.innerHTML = `<p style="color:red;">${error.message}</p>`;
    }
}

function criarModalAvatares() {
    const modalHTML = `
        <div class="ml-modal-overlay" id="mlAvatarModalOverlay">
            <div class="ml-modal-container">
                <div class="ml-modal-header">
                    <h3>Seus Avatares</h3>
                    <button class="ml-modal-close-btn" id="mlCloseModalBtn">×</button>
                </div>
                <div class="ml-modal-body">
                    <div class="ml-avatar-grid" id="mlAvatarGrid"></div>
                </div>
                <div class="ml-modal-footer">
                    <p id="mlAvatarHelpText">Clique em um avatar para torná-lo ativo.</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('mlCloseModalBtn').addEventListener('click', fecharModalAvatares);
    document.getElementById('mlAvatarModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'mlAvatarModalOverlay') {
            fecharModalAvatares();
        }
    });
}

function abrirModalAvatares() {
    const modalOverlay = document.getElementById('mlAvatarModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.add('visible');
        carregarAvataresNoModal();
    }
}

function fecharModalAvatares() {
    const modalOverlay = document.getElementById('mlAvatarModalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('visible');
    }
}

// Função que busca os avatares na API e os exibe no modal
async function inicializarMenu() {
    // Busca o menu hambúrguer no início de tudo
    const hamburgerMenu = document.querySelector('.hamburger-menu');

    // Adiciona o spinner de carregamento, mas só se o menu hambúrguer estiver visível (telas menores)
    if (hamburgerMenu && getComputedStyle(hamburgerMenu).display !== 'none') {
        hamburgerMenu.classList.add('loading');
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('Nenhum token encontrado, redirecionando para login');
            window.location.href = '/index.html';
            return;
        }

        // Injeta o HTML do menu na página
        const menuContainer = document.createElement('div');
        menuContainer.id = 'menu-lateral-container';
        document.body.prepend(menuContainer);

        // Carrega o template do menu
        const response = await fetch('/admin/menu-lateral.html');
        if (!response.ok) throw new Error('Falha ao carregar o template do menu.');
        const menuHTML = await response.text();
        menuContainer.innerHTML = menuHTML;
        
        // Busca os dados do usuário para popular o menu
        const userResponse = await fetch('/api/usuarios/me', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!userResponse.ok) throw new Error('Sessão inválida. Faça login novamente.');
        const usuarioLogado = await userResponse.json();

        // Popula os dados do usuário
        document.getElementById('mlUserName').textContent = usuarioLogado.nome || 'Usuário';
        if (usuarioLogado.avatar_url) {
            document.getElementById('mlUserPhoto').src = usuarioLogado.avatar_url;
        } else {
            console.log('[Frontend] Nenhum avatar_url encontrado. Usando imagem placeholder.');
        }

        // --- Configuração dos Eventos do Menu ---

        // Logout (Funcionalidade antiga mantida)
        document.getElementById('mlLogoutBtn')?.addEventListener('click', async () => {
            const confirmado = await mostrarPopupConfirmacao('Tem certeza que deseja sair do sistema?', 'aviso');
            
            if (confirmado) {
                logout();
            }
        });

        // MODIFICADO: O clique na foto de perfil agora abre o modal de avatares
        // A lógica de upload foi movida para dentro do modal.
        document.getElementById('mlUserPhotoTrigger')?.addEventListener('click', abrirModalAvatares);

        // Marcar link ativo (Funcionalidade antiga mantida)
        const currentPagePath = window.location.pathname;
        document.querySelectorAll('.ml-nav a').forEach(link => {
            if (link.pathname === currentPagePath) {
                link.classList.add('active');
            }
        });

        // Lógica do Menu Hambúrguer (Funcionalidade antiga mantida)
        const menuLateral = document.querySelector('.ml-menu-lateral');

        if (hamburgerMenu && menuLateral) {
            if (!hamburgerMenu.innerHTML.trim()) {
                hamburgerMenu.innerHTML = '<i class="fas fa-bars"></i><i class="fas fa-times"></i>';
            }

            hamburgerMenu.addEventListener('click', () => {
                if (hamburgerMenu.classList.contains('loading')) return;
                menuLateral.classList.toggle('active');
                hamburgerMenu.classList.toggle('active');
            });

            document.querySelectorAll('.ml-nav a').forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 1024) {
                        menuLateral.classList.remove('active');
                        hamburgerMenu.classList.remove('active');
                    }
                });
            });
            
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 1024) {
                    const isClickInsideMenu = menuLateral.contains(e.target);
                    const isClickOnHamburger = hamburgerMenu.contains(e.target);
                    if (!isClickInsideMenu && !isClickOnHamburger && menuLateral.classList.contains('active')) {
                        menuLateral.classList.remove('active');
                        hamburgerMenu.classList.remove('active');
                    }
                }
            });
        }

    } catch (error) {
        console.error('Erro crítico ao inicializar o menu:', error);
        if (error.message.includes('Sessão inválida')) {
            logout();
        } else {
            const menuContainer = document.getElementById('menu-lateral-container');
            if (menuContainer) {
                menuContainer.innerHTML = `<p style="color:red; padding:20px;">Erro crítico ao carregar o menu. Tente recarregar a página.</p>`;
            }
        }
    } finally {
        // Bloco 'finally' sempre executa, com sucesso ou erro.
        if (hamburgerMenu) {
            hamburgerMenu.classList.remove('loading');
        }
    }

    // Cria a estrutura do modal e a deixa pronta na página, mas escondida.
    // Isso é feito por último para não impactar o carregamento inicial.
    criarModalAvatares();
}

// Função para exibir feedback visual durante o upload
function setUploadFeedback(isUploading) {
    const icon = document.getElementById('mlPhotoIcon');
    if (!icon) return;

    if (isUploading) {
        icon.classList.remove('fa-camera');
        icon.classList.add('fa-spinner', 'fa-spin');
    } else {
        icon.classList.remove('fa-spinner', 'fa-spin');
        icon.classList.add('fa-camera');
    }
}

// Função para lidar com o upload do arquivo, agora com compressão
async function handlePhotoUpload(file, token) {
    if (!file) return;

    setUploadFeedback(true);
    mostrarPopup('Enviando e compactando sua nova foto...', 'info', 0); // Popup de "Carregando"

    try {
        const imageCompression = await import('/js/libs/browser-image-compression.js').then(mod => mod.default);

        const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 800,
            useWebWorker: true,
            fileType: 'image/jpeg',
        };

        const compressedFile = await imageCompression(file, options);
        
        const formData = new FormData();
        formData.append('foto', compressedFile, compressedFile.name);

        const response = await fetch('/api/upload-foto', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        fecharPopupCarregando(); // Fecha o popup de "carregando"

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Falha na API: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        const userPhoto = document.getElementById('mlUserPhoto');
        userPhoto.src = `${result.url}?t=${new Date().getTime()}`;
        
        mostrarPopup('Foto de perfil atualizada com sucesso!', 'sucesso', 3000);

    } catch (error) {
        console.error('Erro no upload da foto:', error);
        fecharPopupCarregando();
        mostrarPopup(`Erro: ${error.message}`, 'erro', 5000);
    } finally {
        setUploadFeedback(false);
    }
}

// Inicia todo o processo quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', inicializarMenu);