// utils/menu-hamburguer.js
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno atraso para garantir que o DOM esteja completamente carregado
    setTimeout(() => {
        const hamburgerMenu = document.querySelector('.hamburger-menu');
        const menuLateral = document.querySelector('.menu-lateral');

        // Verifica se os elementos existem antes de prosseguir
        if (!hamburgerMenu || !menuLateral) {
            console.warn('Elementos .hamburger-menu ou .menu-lateral não encontrados. O menu hambúrguer não será inicializado.');
            console.log('hamburgerMenu:', hamburgerMenu);
            console.log('menuLateral:', menuLateral);
            return;
        }

        console.log('Menu hambúrguer inicializado com sucesso!');

        // Alterna a visibilidade do menu ao clicar no botão hambúrguer
        hamburgerMenu.addEventListener('click', () => {
            menuLateral.classList.toggle('active');
            hamburgerMenu.classList.toggle('active'); // Adiciona/remova a classe active no hamburger-menu
            console.log('Menu hambúrguer clicado. Estado do menu:', menuLateral.classList.contains('active') ? 'aberto' : 'fechado');
        });

        // Fecha o menu ao clicar em um link
        const menuLinks = document.querySelectorAll('.menu-lateral a');
        menuLinks.forEach(link => {
            link.addEventListener('click', () => {
                menuLateral.classList.remove('active');
                hamburgerMenu.classList.remove('active'); // Remove a classe active do hamburger-menu
                console.log('Link clicado. Menu fechado.');
            });
        });

        // Fecha o menu ao clicar fora dele
        document.addEventListener('click', (e) => {
            if (!menuLateral.contains(e.target) && !hamburgerMenu.contains(e.target)) {
                menuLateral.classList.remove('active');
                hamburgerMenu.classList.remove('active'); // Remove a classe active do hamburger-menu
                console.log('Clicado fora do menu. Menu fechado.');
            }
        });
    }, 100); // Atraso de 100ms para garantir que o DOM esteja pronto
});