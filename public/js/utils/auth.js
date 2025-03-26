// js/utils/auth.js
import { permissoesPorTipo, permissoesDisponiveis } from '../utils/permissoes.js';

console.log('[auth.js] permissoesPorTipo:', permissoesPorTipo);

const permissoesValidas = new Set(permissoesDisponiveis.map(p => p.id));

export function sincronizarPermissoesUsuario(usuarioLogado) {
    if (!usuarioLogado) {
        console.log('[sincronizarPermissoesUsuario] Usuário não encontrado, abortando sincronização.');
        return usuarioLogado;
    }

    const tipos = Array.isArray(usuarioLogado.tipos) ? usuarioLogado.tipos : (usuarioLogado.tipos ? [usuarioLogado.tipos] : []);
    if (tipos.length === 0) {
        console.warn('[sincronizarPermissoesUsuario] Campo tipos vazio ou inválido:', usuarioLogado.tipos);
        return usuarioLogado;
    }

    const tipoMap = {
        'administrador': 'admin',
        'tiktik': 'tiktik',
        'cortador': 'cortador',
        'costureira': 'costureira',
        'lider_setor': 'lider_setor',
        'supervisor': 'supervisor',
    };

    const tiposMapeados = tipos.map(tipo => tipoMap[tipo.toLowerCase()] || tipo.toLowerCase());
    const isAdmin = tiposMapeados.includes('admin');

    let permissoesAtualizadas;

    if (isAdmin) {
        // Força a substituição completa pelas permissões de admin
        permissoesAtualizadas = new Set(permissoesPorTipo['admin']);
        console.log('[sincronizarPermissoesUsuario] Usuário é admin, atribuindo permissões:', Array.from(permissoesAtualizadas));
    } else {
        // Para não-admin, mantém apenas permissões válidas que já existem
        permissoesAtualizadas = new Set(usuarioLogado.permissoes || []);
        console.log('[sincronizarPermissoesUsuario] Usuário não é admin, mantendo permissões existentes:', Array.from(permissoesAtualizadas));
    }

    // Filtra apenas permissões válidas definidas em permissoesDisponiveis
    permissoesAtualizadas = new Set(
        Array.from(permissoesAtualizadas).filter(permissao => {
            if (permissoesValidas.has(permissao)) {
                return true;
            } else {
                console.warn(`[sincronizarPermissoesUsuario] Permissão inválida removida: ${permissao}`);
                return false;
            }
        })
    );

    const permissoesAntigas = usuarioLogado.permissoes || [];
    usuarioLogado.permissoes = Array.from(permissoesAtualizadas);

    // Log para depuração
    console.log('[sincronizarPermissoesUsuario] Permissões antigas:', permissoesAntigas);
    console.log('[sincronizarPermissoesUsuario] Permissões atualizadas:', usuarioLogado.permissoes);

    // Salva no localStorage
    localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
    return usuarioLogado;
}

export function verificarAutenticacao(pagina, permissoesRequeridas = [], customValidation = null) {
    const usuarioLogadoRaw = localStorage.getItem('usuarioLogado');
    let usuarioLogado;
    try {
        usuarioLogado = JSON.parse(usuarioLogadoRaw);
    } catch (e) {
        console.error('[verificarAutenticacao] Erro ao parsear usuarioLogado:', e);
    }

    if (!usuarioLogado) {
        console.log('[verificarAutenticacao] Nenhum usuário logado, redirecionando para public/index.html');
        window.location.href = '/public/index.html';
        return null;
    }

    usuarioLogado = sincronizarPermissoesUsuario(usuarioLogado);

    const tipos = usuarioLogado.tipos || [];
    const isCostureira = tipos.includes('costureira');

    // Se o usuário for costureira, ele só pode acessar páginas na pasta /costureira
    if (isCostureira) {
        const allowedPaths = ['/costureira/dashboard.html', '/public/index.html', '/costureira/acesso-restrito-costureira.html'];
        const currentPath = window.location.pathname;
        if (!allowedPaths.includes(currentPath)) {
            console.warn('[verificarAutenticacao] Usuário do tipo costureira tentou acessar uma página não permitida:', currentPath);
            window.location.href = '/costureira/acesso-restrito-costureira.html';
            return null; // Interrompe o fluxo aqui
        }
    } else {
        // Para usuários que não são costureiras, prossegue com a verificação de permissões
        const permissoesUsuario = usuarioLogado.permissoes || [];
        if (!pagina) {
            console.error('[verificarAutenticacao] Nome da página não fornecido.');
            window.location.href = '/public/index.html';
            return null;
        }

        const permissaoAcesso = `acesso-${pagina.replace('.html', '')}`;

        console.log('[verificarAutenticacao] Permissões do usuário:', permissoesUsuario);
        console.log('[verificarAutenticacao] Permissão de acesso requerida:', permissaoAcesso);

        if (!permissoesUsuario.includes(permissaoAcesso)) {
            console.log(`[verificarAutenticacao] Acesso negado à ${pagina}. Usuário não tem a permissão ${permissaoAcesso}.`);
            window.location.href = '/public/admin/acesso-negado.html';
            return null;
        }

        if (permissoesRequeridas.length > 0) {
            const temPermissao = permissoesRequeridas.every(perm => {
                const tem = permissoesUsuario.includes(perm);
                console.log(`[verificarAutenticacao] Verificando permissão requerida ${perm}: ${tem}`);
                return tem;
            });
            if (!temPermissao) {
                console.log(`[verificarAutenticacao] Permissões insuficientes para ${pagina}. Permissões requeridas: ${permissoesRequeridas}`);
                window.location.href = '/public/admin/acesso-negado.html';
                return null;
            }
        }

        if (customValidation && typeof customValidation === 'function') {
            const customResult = customValidation(permissoesUsuario);
            if (!customResult) {
                console.log(`[verificarAutenticacao] Validação personalizada falhou para ${pagina}.`);
                window.location.href = '/public/admin/acesso-negado.html';
                return null;
            }
        }
    }

    return { usuario: usuarioLogado, permissoes: usuarioLogado.permissoes || [] };
}

export function verificarAutenticacaoSincrona(pagina, permissoesNecessarias = [], callback = () => true) {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        console.warn('[verificarAutenticacaoSincrona] Nenhum usuário logado. Redirecionando para login...');
        window.location.href = '/public/index.html';
        return null;
    }

    const tipos = usuarioLogado.tipos || [];
    const isCostureira = tipos.includes('costureira');

    // Se o usuário for costureira, ele só pode acessar páginas na pasta /costureira
    if (isCostureira) {
        const allowedPaths = ['/costureira/dashboard.html', '/public/index.html', '/costureira/acesso-restrito-costureira.html'];
        const currentPath = window.location.pathname;
        if (!allowedPaths.includes(currentPath)) {
            console.warn('[verificarAutenticacaoSincrona] Usuário do tipo costureira tentou acessar uma página não permitida:', currentPath);
            window.location.href = '/costureira/acesso-restrito-costureira.html';
            return null; // Interrompe o fluxo aqui
        }
    } else {
        // Para usuários que não são costureiras, prossegue com a verificação de permissões
        const permissoesUsuario = usuarioLogado.permissoes || [];
        const temPermissoes = permissoesNecessarias.every(permissao => permissoesUsuario.includes(permissao));
        if (!temPermissoes) {
            console.warn('[verificarAutenticacaoSincrona] Usuário não tem as permissões necessárias:', permissoesNecessarias);
            window.location.href = '/public/admin/acesso-negado.html';
            return null;
        }

        const callbackResult = callback(permissoesUsuario);
        if (!callbackResult) {
            console.warn('[verificarAutenticacaoSincrona] Callback de autenticação retornou false.');
            window.location.href = '/public/admin/acesso-negado.html';
            return null;
        }
    }

    return { usuario: usuarioLogado, permissoes: usuarioLogado.permissoes || [] };
}

export function logout() {
    localStorage.removeItem('usuarioLogado');
    localStorage.removeItem('keepLoggedIn');
    window.location.href = '/public/index.html';
}