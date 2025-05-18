import { permissoesDisponiveis, permissoesPorTipo } from '/js/utils/permissoes.js';

export const permissoesValidas = new Set(permissoesDisponiveis.map(p => p.id));

export async function sincronizarPermissoesUsuario(usuario) {
  if (!usuario) return null;

  const tipos = Array.isArray(usuario.tipos) ? usuario.tipos : (typeof usuario.tipos === 'string' ? [usuario.tipos] : []);
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

  let permissoesBase = new Set();
  tiposMapeados.forEach(tipoMapeado => {
    (permissoesPorTipo[tipoMapeado] || []).forEach(p => permissoesBase.add(p));
  });

  (usuario.permissoes || []).forEach(p => permissoesBase.add(p));


  if (isAdmin) { // Garante que admin sempre tenha todas as permissões definidas em permissoesPorTipo['admin']
    (permissoesPorTipo['admin'] || []).forEach(permissao => permissoesBase.add(permissao));
  }
  
  // Filtra para garantir que apenas permissões válidas listadas em permissoesDisponiveis sejam mantidas
  usuario.permissoes = Array.from(permissoesBase).filter(p => permissoesValidas.has(p));
  return usuario;
}

export async function verificarAutenticacao(pagina, permissoesDeAcessoRequeridas = []) {
  const token = localStorage.getItem('token');
  if (!token) {
    console.log('[verificarAutenticacao] Token não encontrado, redirecionando para index.');
    window.location.href = '/index.html'; // Página de login principal
    return null;
  }

  let permissoesPrincipaisParaPagina = permissoesDeAcessoRequeridas;
  if (permissoesPrincipaisParaPagina.length === 0 && pagina) {
    const permissaoCalculada = `acesso-${pagina.replace('.html', '')}`;
    if (permissoesValidas.has(permissaoCalculada)) {
        permissoesPrincipaisParaPagina = [permissaoCalculada];
    } else {
        console.warn(`[verificarAutenticacao] Permissão de acesso calculada "${permissaoCalculada}" não é uma permissão válida. Acesso pode ser negado indevidamente se não fornecida explicitamente.`);
    }
  }

  const permissoesCache = JSON.parse(localStorage.getItem('permissoes') || '[]');
  if (permissoesCache.length > 0 && permissoesPrincipaisParaPagina.length > 0) {
    const temPermissaoCache = permissoesPrincipaisParaPagina.some(p => permissoesCache.includes(p));
    if (!temPermissaoCache) {
      console.log('[verificarAutenticacao] Cache: Sem permissão de acesso principal, redirecionando para acesso-negado.');
      window.location.href = '/admin/acesso-negado.html';
      return null;
    }
  }

  const fetchWithRetry = async (url, options, retries = 2, delay = 500) => { // Reduzido retries e delay
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          if (response.status === 401) throw new Error('Token expirado');
          let errorBody = await response.text(); // Tenta ler o corpo como texto
          try { errorBody = JSON.parse(errorBody); } catch (e) { /* não era JSON, ok */ }
          console.error(`[fetchWithRetry] Resposta API falhou: ${response.status}`, errorBody);
          throw new Error(`API falhou: ${response.status}`);
        }
        return response;
      } catch (error) {
        if (error.message === 'Token expirado') throw error;
        if (i < retries - 1) {
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
    let usuarioLogadoServer = await response.json();
    
    if (!usuarioLogadoServer || !usuarioLogadoServer.tipos) {
        console.error('[verificarAutenticacao] Resposta de /api/usuarios/me inválida ou sem tipos.');
        throw new Error('Dados do usuário inválidos');
    }
    usuarioLogadoServer = await sincronizarPermissoesUsuario(usuarioLogadoServer);
    const permissoesUsuarioServer = usuarioLogadoServer.permissoes || [];
    localStorage.setItem('permissoes', JSON.stringify(permissoesUsuarioServer));

    const tipos = usuarioLogadoServer.tipos || []; // Garante que tipos seja um array
    const isCostureira = Array.isArray(tipos) && tipos.includes('costureira');

    if (isCostureira) {
      const allowedPaths = ['/costureira/dashboard.html', '/index.html', '/costureira/acesso-restrito-costureira.html'];
      if (!allowedPaths.includes(window.location.pathname.toLowerCase())) { // toLowerCase para consistência
        console.log('[verificarAutenticacao] Costureira em página não permitida, redirecionando.');
        window.location.href = '/costureira/acesso-restrito-costureira.html';
        return null;
      }
    } else { // Não é costureira (admin, supervisor, etc.)
      // Verifica se o usuário tem PELO MENOS UMA das permissões principais de acesso à página.
      if (permissoesPrincipaisParaPagina.length > 0) {
        const temPermissaoDeAcesso = permissoesPrincipaisParaPagina.some(p => permissoesUsuarioServer.includes(p));
        if (!temPermissaoDeAcesso) {
          console.log(`[verificarAutenticacao] API: Sem permissão de acesso principal (${permissoesPrincipaisParaPagina.join('/')}) para ${pagina}, redirecionando.`);
          window.location.href = '/admin/acesso-negado.html';
          return null;
        }
      } else if (pagina && pagina !== 'index.html' && pagina !== 'admin/token-expirado.html' && pagina !== 'admin/acesso-negado.html') {
        console.warn(`[verificarAutenticacao] Nenhuma permissão de acesso principal especificada para ${pagina}. Acesso pode ser bloqueado.`);
      }
    }

    document.body.classList.add('autenticado');
    return { usuario: usuarioLogadoServer, permissoes: permissoesUsuarioServer };

  } catch (error) {
    console.error('[verificarAutenticacao] Erro final:', error.message);
    localStorage.removeItem('token');
    localStorage.removeItem('permissoes');
    if (error.message === 'Token expirado') {
      console.log('[verificarAutenticacao] Token expirado, redirecionando para token-expirado.html');
      window.location.href = '/admin/token-expirado.html';
    } else {
      console.log('[verificarAutenticacao] Outro erro, redirecionando para index.html');
      window.location.href = '/index.html'; // Redireciona para login em outros erros graves
    }
    return null;
  }
}

export function logout() {
  console.log('[logout] Removendo dados de sessão e redirecionando para /index.html');
  localStorage.removeItem('token');
  localStorage.removeItem('permissoes');
  localStorage.removeItem('usuarioLogado'); // Se você usava isso para guardar o objeto do usuário
  window.location.href = '/index.html';
}