// js/pages/admin-usuarios-cadastrados.js
import { verificarAutenticacaoSincrona } from './utils/auth.js';
import { obterUsuarios, salvarUsuarios } from './utils/storage.js';
import { toggleVisibilidade } from './utils/dom-utils.js';

// A verificação já foi feita no HTML, mas mantemos para segurança
const auth = verificarAutenticacaoSincrona('usuarios-cadastrados.html', ['acesso-usuarios-cadastrados']);
if (!auth) {
    throw new Error('Autenticação falhou, redirecionamento já tratado.');
}

const permissoes = auth.permissoes || [];
console.log('[admin-usuarios-cadastrados] Autenticação bem-sucedida, permissões:', permissoes);

function carregarUsuariosCadastrados() {
    const lista = document.getElementById('usuariosLista');
    const filtroTipo = document.getElementById('filtroTipoUsuario')?.value || '';
    if (!lista) return;

    const usuarios = obterUsuarios();
    const excluidos = JSON.parse(localStorage.getItem('usuariosExcluidos')) || [];
    let usuariosFiltrados;

    if (filtroTipo === 'excluidos') {
        usuariosFiltrados = excluidos;
    } else if (filtroTipo) {
        usuariosFiltrados = usuarios.filter(u => (u.tipos || []).includes(filtroTipo));
    } else {
        usuariosFiltrados = usuarios;
    }

    lista.innerHTML = '';
    usuariosFiltrados.forEach((usuario, index) => {
        const card = document.createElement('div');
        card.className = `usuario-card ${filtroTipo === 'excluidos' ? 'excluido' : ''}`;

        const tiposLabels = (usuario.tipos || []).map(tipo =>
            tipo === 'administrador' ? 'Administrador' :
            tipo === 'supervisor' ? 'Supervisor' :
            tipo === 'lider_setor' ? 'Líder de Setor' :
            tipo === 'costureira' ? 'Costureira' :
            tipo === 'tiktik' ? 'TikTik' :
            tipo === 'cortador' ? 'Cortador' : 'Desconhecido'
        ).join(', ') || 'Nenhum tipo';

        card.innerHTML = `
            <div class="usuario-info">
                <p><span>Nome:</span> ${usuario.nome}</p>
                <p><span>Nome de Usuário:</span> 
                    <span class="nome-usuario-texto" data-index="${index}">${usuario.nomeUsuario || 'Não definido'}</span>
                    <input type="text" class="nome-usuario-input" data-index="${index}" value="${usuario.nomeUsuario || ''}" style="display: none;">
                    ${filtroTipo !== 'excluidos' && permissoes.includes('editar-usuarios') ? `
                        <button class="editar-nome-usuario" data-index="${index}">Editar</button>
                        <button class="salvar-nome-usuario" data-index="${index}" style="display: none;">Salvar</button>
                    ` : ''}
                </p>
                <p><span>Email:</span> 
                    <span class="dado-oculto" data-original="${usuario.email}">***</span>
                    <button class="toggle-visibilidade"><i class="fas fa-eye"></i></button>
                </p>
                <p><span>Senha:</span> 
                    <span class="dado-oculto" data-original="${usuario.senha}">***</span>
                    <button class="toggle-visibilidade"><i class="fas fa-eye"></i></button>
                </p>
                <p><span>Tipos:</span> ${tiposLabels}${filtroTipo === 'excluidos' ? ' (Excluído)' : ''}</p>
                <p><span>Nível:</span> 
                    ${(usuario.tipos || []).includes('costureira') ? `
                        <select class="nivel-select" data-index="${index}" ${!permissoes.includes('editar-usuarios') || filtroTipo === 'excluidos' ? 'disabled' : ''}>
                            <option value="1" ${usuario.nivel === 1 ? 'selected' : ''}>Nível 1 (Reta)</option>
                            <option value="2" ${usuario.nivel === 2 ? 'selected' : ''}>Nível 2 (Reta ou Overloque)</option>
                            <option value="3" ${usuario.nivel === 3 ? 'selected' : ''}>Nível 3 (Reta ou Galoneira)</option>
                            <option value="4" ${usuario.nivel === 4 ? 'selected' : ''}>Nível 4 (Todas)</option>
                        </select>
                        ${filtroTipo !== 'excluidos' && permissoes.includes('editar-usuarios') ? `
                            <button class="editar-nivel" data-index="${index}">Editar</button>
                            <button class="salvar-nivel" data-index="${index}" style="display: none;">Salvar</button>
                        ` : ''}
                    ` : '-'}
                </p>
            </div>
            ${filtroTipo !== 'excluidos' && permissoes.includes('excluir-usuarios') ? `<button class="btn-excluir" data-index="${index}">Excluir Usuário</button>` : ''}
        `;
        lista.appendChild(card);
    });

    if (filtroTipo !== 'excluidos') {
        // Edição do nomeUsuario
        if (permissoes.includes('editar-usuarios')) {
            document.querySelectorAll('.editar-nome-usuario').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    const texto = btn.parentElement.querySelector('.nome-usuario-texto');
                    const input = btn.parentElement.querySelector('.nome-usuario-input');
                    const salvarBtn = btn.nextElementSibling;

                    texto.style.display = 'none';
                    input.style.display = 'inline-block';
                    btn.style.display = 'none';
                    salvarBtn.style.display = 'inline-block';
                });
            });

            document.querySelectorAll('.salvar-nome-usuario').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    const texto = btn.parentElement.querySelector('.nome-usuario-texto');
                    const input = btn.parentElement.querySelector('.nome-usuario-input');
                    const editarBtn = btn.previousElementSibling;

                    const novoNomeUsuario = input.value.trim();
                    const usuarios = obterUsuarios();

                    // Validação do nome de usuário
                    const validarNomeUsuario = (nomeUsuario) => {
                        const re = /^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*$/;
                        return re.test(nomeUsuario);
                    };

                    // Verifica se o nome de usuário é válido
                    if (!validarNomeUsuario(novoNomeUsuario)) {
                        alert('O nome de usuário só pode conter letras, números e pontos (ex: joao.silva).');
                        return;
                    }

                    // Verifica se o nome de usuário já existe (exceto para o próprio usuário)
                    const outrosUsuarios = usuarios.filter((_, i) => i !== index);
                    if (outrosUsuarios.some(u => u.nomeUsuario === novoNomeUsuario)) {
                        alert('Este nome de usuário já está em uso. Escolha outro.');
                        return;
                    }

                    // Atualiza o nome de usuário
                    usuarios[index].nomeUsuario = novoNomeUsuario;
                    salvarUsuarios(usuarios);

                    // Atualiza a interface
                    texto.textContent = novoNomeUsuario;
                    texto.style.display = 'inline';
                    input.style.display = 'none';
                    btn.style.display = 'none';
                    editarBtn.style.display = 'inline-block';
                });
            });

            // Edição do nível (já existente)
            document.querySelectorAll('.editar-nivel').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    const select = btn.previousElementSibling;
                    const salvarBtn = btn.nextElementSibling;
                    select.disabled = false;
                    btn.style.display = 'none';
                    salvarBtn.style.display = 'inline-block';
                });
            });

            document.querySelectorAll('.salvar-nivel').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    const select = btn.previousElementSibling.previousElementSibling;
                    const editarBtn = btn.previousElementSibling;
                    const novoNivel = parseInt(select.value);

                    const usuarios = obterUsuarios();
                    usuarios[index].nivel = novoNivel;
                    salvarUsuarios(usuarios);

                    select.disabled = true;
                    btn.style.display = 'none';
                    editarBtn.style.display = 'inline-block';
                });
            });
        }

        // Exclusão de usuários (já existente)
        if (permissoes.includes('excluir-usuarios')) {
            document.querySelectorAll('.btn-excluir').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    excluirUsuario(index);
                });
            });
        }
    }

    document.querySelectorAll('.toggle-visibilidade').forEach(btn => {
        btn.addEventListener('click', () => toggleVisibilidade(btn));
    });
}

function excluirUsuario(index) {
    const confirmacao = confirm("Tem certeza que deseja excluir este usuário?");
    if (!confirmacao) return;

    const usuarios = obterUsuarios();
    const usuarioExcluido = usuarios.splice(index, 1)[0];
    salvarUsuarios(usuarios);

    const excluidos = JSON.parse(localStorage.getItem('usuariosExcluidos')) || [];
    excluidos.push(usuarioExcluido);
    localStorage.setItem('usuariosExcluidos', JSON.stringify(excluidos));

    carregarUsuariosCadastrados();
}

window.toggleVisibilidade = toggleVisibilidade;

carregarUsuariosCadastrados();
document.getElementById('filtroTipoUsuario')?.addEventListener('change', carregarUsuariosCadastrados);
