export function preencherSelectCostureiras(selectElement, placeholder, costureiras) {
    if (!selectElement) return;
    selectElement.innerHTML = placeholder;
    costureiras.forEach(c => {
        const option = document.createElement('option');
        option.value = c.email;
        option.textContent = c.nome;
        selectElement.appendChild(option);
    });
}

// js/utils/dom-utils.js
export function toggleVisibilidade(botao) {
    const dadoElement = botao.previousElementSibling;
    const dadoOriginal = dadoElement.getAttribute('data-original');
    const estaOculto = dadoElement.textContent === '***';

    if (estaOculto) {
        dadoElement.textContent = dadoOriginal;
        botao.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        dadoElement.textContent = '***';
        botao.innerHTML = '<i class="fas fa-eye"></i>';
    }
}