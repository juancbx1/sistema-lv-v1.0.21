// /js/carregar-menu-lateral.js
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  let usuarioLogado = null;

  if (!token) {
    console.log('Nenhum token encontrado, redirecionando para login');
    window.location.href = '/index.html';
    return;
  }

  try {
    const response = await fetch('/api/usuarios/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (response.ok) {
      usuarioLogado = await response.json();
    } else {
      console.error('Erro ao buscar usuário logado:', response.status);
      window.location.href = '/admin/acesso-negado.html'; // Redireciona sem remover token
      return;
    }
  } catch (error) {
    console.error('Erro na requisição ao /api/usuarios/me:', error);
    window.location.href = '/admin/acesso-negado.html'; // Redireciona sem remover token
    return;
  }

  const menuContainer = document.createElement('div');
  menuContainer.id = 'menu-lateral-container';
  document.body.appendChild(menuContainer);

  try {
    const response = await fetch('/admin/menu-lateral.html');
    if (!response.ok) throw new Error('Falha ao carregar menu-lateral.html');
    const data = await response.text();
    menuContainer.innerHTML = data;

    const nomeUsuarioSpan = document.getElementById('nomeUsuario');
    if (usuarioLogado && usuarioLogado.nome) {
      nomeUsuarioSpan.textContent = usuarioLogado.nome;
    } else {
      nomeUsuarioSpan.textContent = 'Usuário Desconhecido';
      console.log('Menu Lateral - 2. Usuário desconhecido exibido.');
    }

    // Configurar seções expansíveis
    const menuSections = document.querySelectorAll('.menu-section-title');
    menuSections.forEach(section => {
    const subsection = section.nextElementSibling;
    // Definir estado inicial (ex: todos abertos ou fechados)
    // Se quiser começar fechado (exceto talvez o da página atual):
    // subsection.style.maxHeight = null; 
    // section.classList.remove('expanded');

    // Para começar aberto:
    if (subsection) { // Adiciona verificação se subsection existe
         subsection.style.maxHeight = subsection.scrollHeight + "px";
         section.classList.add('expanded');
    }


    section.addEventListener('click', () => {
        section.classList.toggle('expanded');
        if (subsection) { // Adiciona verificação
            if (section.classList.contains('expanded')) {
                subsection.style.maxHeight = subsection.scrollHeight + "px";
            } else {
                subsection.style.maxHeight = null;
            }
        }
    });
});

    // Marcar página atual
    const currentPage = window.location.pathname.split('/').pop();
    const menuLinks = document.querySelectorAll('.menu-lateral a');
    menuLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage) {
        link.classList.add('active');
      }
    });

    // Configurar logout
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn?.addEventListener('click', () => {
      const confirmLogout = confirm('Tem certeza que deseja sair?');
      if (confirmLogout) {
        localStorage.removeItem('token');
        window.location.href = '/index.html';
      } else {
      }
      limparCacheProdutos();
    });

    // Inicializar o menu hambúrguer
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const menuLateral = document.querySelector('.menu-lateral');

    if (!hamburgerMenu || !menuLateral) {
      console.warn('Elementos .hamburger-menu ou .menu-lateral não encontrados.');
      return;
    }

    hamburgerMenu.addEventListener('click', () => {
      menuLateral.classList.toggle('active');
      hamburgerMenu.classList.toggle('active');
    });

    menuLinks.forEach(link => {
      link.addEventListener('click', () => {
        menuLateral.classList.remove('active');
        hamburgerMenu.classList.remove('active');
      });
    });

    document.addEventListener('click', (e) => {
      if (!menuLateral.contains(e.target) && !hamburgerMenu.contains(e.target)) {
        menuLateral.classList.remove('active');
        hamburgerMenu.classList.remove('active');
      }
    });

  } catch (error) {
    console.error('Erro ao carregar o menu lateral:', error);
    window.location.href = '/admin/acesso-negado.html'; // Redireciona sem remover token
  }
});