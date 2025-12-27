import { verificarAutenticacao } from '/js/utils/auth.js';
import { obterUsuarios } from '/js/utils/storage.js';


// Lista de páginas disponíveis com suas permissões necessárias
const paginasDisponiveis = [
    { href: "ordens-de-producao.html", texto: "Ordens de Produção", permissao: "acesso-ordens-de-producao" },
    { href: "producao-diaria.html", texto: "Ver Produção Diária", permissao: "acesso-producao-diaria" },
    { href: "embalagem-de-produtos.html", texto: "Embalagem de Produtos", permissao: "acesso-embalagem-de-produtos" },
    { href: "gerenciar-producao.html", texto: "Gerenciar Produção", permissao: "acesso-gerenciar-producao" }
];

// Função para selecionar 3 páginas aleatórias permitidas
function gerarLinksAleatorios(permissoesUsuario) {
    const paginasPermitidas = paginasDisponiveis.filter(pagina => permissoesUsuario.includes(pagina.permissao));
    for (let i = paginasPermitidas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [paginasPermitidas[i], paginasPermitidas[j]] = [paginasPermitidas[j], paginasPermitidas[i]];
    }
    return paginasPermitidas.slice(0, Math.min(3, paginasPermitidas.length));
}

// Função para renderizar os botões no card
function renderizarAcoes(permissoes) {
    const acoesMenu = document.getElementById("acoesMenu");
    if (!acoesMenu) {
        console.error('[renderizarAcoes] Elemento #acoesMenu não encontrado');
        return;
    }

    const paginasSelecionadas = gerarLinksAleatorios(permissoes);
    acoesMenu.innerHTML = "";
    paginasSelecionadas.forEach(pagina => {
        const link = document.createElement("a");
        link.href = pagina.href;
        link.className = "acao-btn";
        link.textContent = pagina.texto;
        acoesMenu.appendChild(link);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await verificarAutenticacao('home.html', []);
        if (!auth) {
            console.log('[admin-home] Autenticação falhou, redirecionando para acesso-negado');
            window.location.href = '/admin/acesso-negado.html';
            return;
        }

        const usuarioLogado = auth.usuario;
        const permissoes = auth.permissoes || [];
        const nomeAdmin = document.getElementById('nomeAdmin');
        if (nomeAdmin && usuarioLogado) {
            nomeAdmin.textContent = usuarioLogado.nome;
        }
        
        renderizarAcoes(permissoes);
    } catch (error) {
        console.error('[admin-home] Erro ao carregar home:', error);
        window.location.href = '/admin/acesso-negado.html';
    }
});