import { verificarAutenticacao } from '/js/utils/auth.js';

// ==========================================================================
// INICIALIZAÇÃO
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('admin/gerenciar-comunicacoes.html', ['gerenciar-comunicacoes']);
        if (!auth) return;

        configurarEventListeners();
        carregarComunicados();
    } catch (error) {
        console.error("Erro na inicialização:", error);
        document.body.innerHTML = '<p>Erro ao carregar a página.</p>';
    }
});

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================
function configurarEventListeners() {
    const form = document.getElementById('form-novo-comunicado');
    form.addEventListener('submit', enviarNovoComunicado);

    // Adiciona listener para os botões de exclusão (usando delegação de eventos)
    const listaContainer = document.getElementById('lista-comunicados-enviados');
    listaContainer.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('button[data-action="excluir-comunicado"]');
        if (deleteButton) {
            const id = deleteButton.dataset.id;
            const titulo = deleteButton.dataset.titulo;
            if (confirm(`Tem certeza que deseja excluir o comunicado "${titulo}"?`)) {
                excluirComunicado(id);
            }
        }
    });
}

// ==========================================================================
// FUNÇÕES DA API
// ==========================================================================
async function carregarComunicados() {
    const listaEl = document.getElementById('lista-comunicados-enviados');
    listaEl.innerHTML = '<div class="spinner">Carregando comunicados...</div>';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/comunicacoes/admin', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Falha ao buscar comunicados enviados.');
        
        const comunicados = await response.json();
        
        if (comunicados.length === 0) {
            listaEl.innerHTML = '<p style="text-align: center; color: #777;">Nenhum comunicado do tipo "Mural Geral" foi enviado ainda.</p>';
        } else {
            listaEl.innerHTML = comunicados.map(comunicado => `
                <div class="gc-comunicado-item">
                    <div class="gc-comunicado-info">
                        <h4>${comunicado.titulo} ${comunicado.is_fixado ? '<span class="fixado-tag">FIXADO</span>' : ''}</h4>
                        <p class="meta">Por: ${comunicado.nome_autor} em ${new Date(comunicado.data_criacao).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div class="gc-comunicado-actions">
                        <button class="gc-btn" data-action="excluir-comunicado" data-id="${comunicado.id}" data-titulo="${comunicado.titulo}" title="Excluir">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }

    } catch (error) {
        console.error("Erro ao carregar comunicados:", error);
        listaEl.innerHTML = '<p style="text-align: center; color: red;">Erro ao carregar comunicados.</p>';
    }
}

async function enviarNovoComunicado(event) {
    event.preventDefault();
    const btn = document.getElementById('btn-enviar-comunicado');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-btn-interno"></div> Enviando...';

    const titulo = document.getElementById('input-gc-titulo').value;
    const conteudo = document.getElementById('textarea-gc-conteudo').value;
    const isFixado = document.getElementById('check-gc-fixado').checked;

    const payload = {
        titulo,
        conteudo,
        is_fixado: isFixado,
        tipo_post: 'Mural Geral'
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/comunicacoes', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Falha ao enviar comunicado.');
        }

        alert('Comunicado enviado com sucesso!');
        event.target.reset();
        await carregarComunicados(); // Atualiza a lista após o envio

    } catch (error) {
        console.error("Erro ao enviar comunicado:", error);
        alert(`Erro: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Comunicado';
    }
}

async function excluirComunicado(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/comunicacoes/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Falha ao excluir o comunicado.');
        }
        
        alert('Comunicado excluído com sucesso.');
        await carregarComunicados(); // Recarrega a lista para refletir a exclusão

    } catch (error) {
        console.error("Erro ao excluir comunicado:", error);
        alert(`Erro: ${error.message}`);
    }
}