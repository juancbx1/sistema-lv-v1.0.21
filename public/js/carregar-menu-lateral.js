// js/pages/carregar-menu-lateral.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('Menu Lateral - 1. Estado inicial do usuarioLogado:', localStorage.getItem('usuarioLogado'));

    const menuContainer = document.createElement('div');
    menuContainer.id = 'menu-lateral-container';
    document.body.appendChild(menuContainer);

    fetch('/admin/menu-lateral.html')
        .then(response => {
            if (!response.ok) throw new Error('Falha ao carregar menu-lateral.html');
            return response.text();
        })
        .then(data => {
            menuContainer.innerHTML = data;
            console.log('Menu Lateral - Fetch concluído com sucesso.');

            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            console.log('Menu Lateral - 2. Usuário logado recuperado:', usuarioLogado);

            const nomeUsuarioSpan = document.getElementById('nomeUsuario');
            if (usuarioLogado && usuarioLogado.nome) {
                nomeUsuarioSpan.textContent = usuarioLogado.nome;
                console.log('Menu Lateral - 3. Nome do usuário exibido:', usuarioLogado.nome);
            } else {
                nomeUsuarioSpan.textContent = 'Usuário Desconhecido';
                console.log('Menu Lateral - 3. Usuário desconhecido exibido.');
            }

            const menuSections = document.querySelectorAll('.menu-section-title');
            menuSections.forEach(section => {
                const subsection = section.nextElementSibling;
                subsection.style.display = 'block';
                section.classList.add('expanded');

                section.addEventListener('click', () => {
                    const isExpanded = subsection.style.display === 'block';
                    subsection.style.display = isExpanded ? 'none' : 'block';
                    section.classList.toggle('expanded', !isExpanded);
                });
            });

            const currentPage = window.location.pathname.split('/').pop();
            const menuLinks = document.querySelectorAll('.menu-lateral a');
            menuLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href === currentPage) {
                    link.classList.add('active');
                }
            });

            const logoutBtn = document.getElementById('logoutBtn');
            logoutBtn?.addEventListener('click', () => {
                console.log('Menu Lateral - 4. Botão de logout clicado.');
                const confirmLogout = confirm('Tem certeza que deseja sair?');
                if (confirmLogout) {
                    console.log('Menu Lateral - 5. Logout confirmado. Removendo usuarioLogado.');
                    localStorage.removeItem('usuarioLogado');
                    console.log('Menu Lateral - 6. Estado do usuarioLogado após logout:', localStorage.getItem('usuarioLogado'));
                    window.location.href = '../index.html';
                } else {
                    console.log('Menu Lateral - 5. Logout cancelado.');
                }
            });

            console.log('Menu Lateral - 7. Estado final do usuarioLogado:', localStorage.getItem('usuarioLogado'));
        })
        .catch(error => {
            console.error('Erro ao carregar o menu lateral:', error);
        });
});