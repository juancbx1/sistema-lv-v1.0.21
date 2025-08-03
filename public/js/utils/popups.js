/* public/js/utils/popups.js */

/**
 * Remove qualquer popup existente da tela com uma animação suave.
 */
function removerPopupExistente() {
    const containerExistente = document.querySelector('.popup-container');
    if (containerExistente) {
        const popupBox = containerExistente.querySelector('.popup-box');
        const overlay = containerExistente.querySelector('.popup-overlay');
        
        if (popupBox) popupBox.style.animation = 'popup-slide-out 0.3s ease-out forwards';
        if (overlay) overlay.style.animation = 'popup-fade-out 0.3s ease-out forwards';
        
        setTimeout(() => {
            containerExistente.remove();
        }, 300);
    }
}


/**
 * Exibe uma mensagem simples para o usuário com um botão "OK".
 * @param {string} mensagem - O texto a ser exibido.
 * @param {'sucesso'|'erro'|'aviso'|'info'} [tipo='info'] - O tipo de popup (controla a cor da borda).
 * @param {number} [duracao=0] - Tempo em milissegundos para fechar automaticamente. 0 para não fechar.
 */
export function mostrarMensagem(mensagem, tipo = 'info', duracao = 0) {
    removerPopupExistente();

    const container = document.createElement('div');
    container.className = 'popup-container';

    container.innerHTML = `
        <div class="popup-overlay"></div>
        <div class="popup-box popup-${tipo}">
            <p>${mensagem}</p>
            <div class="popup-botoes">
                <button class="popup-btn popup-btn-ok">OK</button>
            </div>
        </div>
    `;

    document.body.appendChild(container);

    const btnOk = container.querySelector('.popup-btn-ok');
    const overlay = container.querySelector('.popup-overlay');

    const fecharPopup = () => removerPopupExistente();

    btnOk.onclick = fecharPopup;
    overlay.onclick = fecharPopup;

    if (duracao > 0) {
        setTimeout(fecharPopup, duracao);
    }
}


/**
 * Exibe um popup de confirmação e retorna uma Promise que resolve para true (confirmar) ou false (cancelar).
 * @param {string} mensagem - A pergunta a ser exibida.
 * @param {'perigo'|'aviso'|'sucesso'} [tipo='aviso'] - O tipo de popup (controla a cor da borda).
 * @returns {Promise<boolean>} - true se o usuário confirmar, false se cancelar.
 */
export function mostrarConfirmacao(mensagem, tipo = 'aviso') {
    removerPopupExistente();

    return new Promise((resolve) => {
        const container = document.createElement('div');
        container.className = 'popup-container';
        
        // Define o texto dos botões com base no tipo
        const textoCancelar = (tipo === 'perigo') ? 'Não, Cancelar' : 'Não';
        const textoConfirmar = (tipo === 'perigo') ? 'Sim, Confirmar' : 'Sim';

        container.innerHTML = `
            <div class="popup-overlay"></div>
            <div class="popup-box popup-${tipo}">
                <p>${mensagem}</p>
                <div class="popup-botoes">
                    <button class="popup-btn popup-btn-cancelar">${textoCancelar}</button>
                    <button class="popup-btn popup-btn-confirmar">${textoConfirmar}</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        const btnConfirmar = container.querySelector('.popup-btn-confirmar');
        const btnCancelar = container.querySelector('.popup-btn-cancelar');
        const overlay = container.querySelector('.popup-overlay');

        const fecharPopup = (valorResolvido) => {
            removerPopupExistente();
            resolve(valorResolvido);
        };
        
        btnConfirmar.onclick = () => fecharPopup(true);
        btnCancelar.onclick = () => fecharPopup(false);
        overlay.onclick = () => fecharPopup(false); // Clicar fora cancela
    });
}