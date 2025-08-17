// public/js/utils/botoes-fechar.js

/**
 * Adiciona um botão de fechar padronizado (X).
 * Funciona tanto para modais (procurando .es-modal-conteudo)
 * quanto para seções de tela cheia.
 * @param {HTMLElement} elementoPai - O elemento container (seja o overlay do modal ou a section da tela).
 * @param {Function} callbackFechar - A função que será executada quando o botão for clicado.
 */
export function adicionarBotaoFechar(elementoPai, callbackFechar) {
    if (!elementoPai || typeof callbackFechar !== 'function') {
        console.error('Erro ao criar botão fechar: elemento pai ou callback inválido.');
        return;
    }

    // Tenta encontrar a caixa de conteúdo de um modal.
    let alvoDoBotao = elementoPai.querySelector('.es-modal-conteudo');

    // Se não encontrar (ou seja, não é um modal, é uma section),
    // o alvo será o próprio elemento pai.
    if (!alvoDoBotao) {
        alvoDoBotao = elementoPai;
    }

    // Remove qualquer botão de fechar antigo para evitar duplicatas
    const botaoExistente = alvoDoBotao.querySelector('.botao-fechar-padrao');
    if (botaoExistente) {
        botaoExistente.remove();
    }

    const botao = document.createElement('button');
    botao.className = 'botao-fechar-padrao';
    botao.title = 'Fechar';
    botao.innerHTML = '×';

    botao.addEventListener('click', callbackFechar);
    
    // Adicionamos o botão dentro do alvo que encontramos
    alvoDoBotao.prepend(botao);
}