import { permissoesDisponiveis, permissoesPorTipo } from '/js/utils/permissoes.js';

export const permissoesValidas = new Set(permissoesDisponiveis.map(p => p.id));

export async function sincronizarPermissoesUsuario(usuario) {
  if (!usuario) return null;

  const tipos = Array.isArray(usuario.tipos) ? usuario.tipos : [usuario.tipos];
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

  let permissoesAtualizadas = new Set(usuario.permissoes || []);
  if (isAdmin) {
    permissoesPorTipo['admin'].forEach(permissao => permissoesAtualizadas.add(permissao));
  }

  usuario.permissoes = Array.from(permissoesAtualizadas).filter(p => permissoesValidas.has(p));
  console.log('[sincronizarPermissoesUsuario] Permissões sincronizadas:', usuario.permissoes);
  return usuario;
}

export async function verificarAutenticacao(pagina, permissoesRequeridas = [], customValidation = null) {
  const token = localStorage.getItem('token');
  if (!token) {
    console.log('[verificarAutenticacao] Nenhum token encontrado, redirecionando para /index.html');
    window.location.href = '/index.html';
    return null;
  }

  // Verificação rápida com cache para redirecionamento imediato
  const permissoesCache = JSON.parse(localStorage.getItem('permissoes') || '[]');
  const permissaoAcesso = `acesso-${pagina.replace('.html', '')}`;
  if (permissoesCache.length > 0 && !permissoesCache.includes(permissaoAcesso)) {
    console.log(`[verificarAutenticacao] Cache: Usuário não tem ${permissaoAcesso}, redirecionando para acesso-negado`);
    window.location.href = '/admin/acesso-negado.html';
    return null;
  }

  const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`Resposta da API falhou: ${response.status}`);
        return response;
      } catch (error) {
        if (i < retries - 1) {
          console.log(`[verificarAutenticacao] Tentativa ${i + 1} falhou, retry em ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  };

  try {
    const response = await fetchWithRetry('/api/usuarios/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    let usuarioLogado = await response.json();
    usuarioLogado = await sincronizarPermissoesUsuario(usuarioLogado);

    localStorage.setItem('permissoes', JSON.stringify(usuarioLogado.permissoes));

    const tipos = usuarioLogado.tipos || [];
    const isCostureira = tipos.includes('costureira');
    const permissoesUsuario = usuarioLogado.permissoes || [];

    if (isCostureira) {
      const allowedPaths = ['/costureira/dashboard.html', '/index.html', '/costureira/acesso-restrito-costureira.html'];
      if (!allowedPaths.includes(window.location.pathname)) {
        console.log('[verificarAutenticacao] Costureira em página não permitida, redirecionando');
        window.location.href = '/costureira/acesso-restrito-costureira.html';
        return null;
      }
    } else {
      if (!permissoesUsuario.includes(permissaoAcesso)) {
        console.log(`[verificarAutenticacao] Usuário não tem ${permissaoAcesso}, redirecionando para acesso-negado`);
        window.location.href = '/admin/acesso-negado.html';
        return null;
      }

      if (permissoesRequeridas.length > 0 && !permissoesRequeridas.every(p => permissoesUsuario.includes(p))) {
        console.log('[verificarAutenticacao] Permissões requeridas não atendidas:', permissoesRequeridas);
        window.location.href = '/admin/acesso-negado.html';
        return null;
      }

      if (customValidation && !customValidation(permissoesUsuario)) {
        console.log('[verificarAutenticacao] Validação personalizada falhou');
        window.location.href = '/admin/acesso-negado.html';
        return null;
      }
    }

    // Mostrar o conteúdo após autenticação bem-sucedida
    document.body.classList.add('autenticado');
    return { usuario: usuarioLogado, permissoes: usuarioLogado.permissoes };
  } catch (error) {
    console.error('[verificarAutenticacao] Erro ao verificar autenticação:', error);
    window.location.href = '/admin/acesso-negado.html'; // Redireciona sem logout
    return null;
  }
}

export function logout() {
  console.log('[logout] Removendo token e redirecionando para /index.html');
  localStorage.removeItem('token');
  localStorage.removeItem('permissoes');
  window.location.href = '/index.html';
}