// public/js/utils/Paginacao.js

export function renderizarPaginacao(containerEl, totalPages, currentPage, onPageChange) {
  if (!containerEl) {
    console.error("Paginacao.js: Container para paginação não fornecido.");
    return;
  }
  
  containerEl.innerHTML = '';
  
  if (totalPages <= 1) {
    containerEl.style.display = 'none';
    return;
  }
  
  containerEl.style.display = 'flex';

  containerEl.innerHTML = `
    <button class="gs-paginacao-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>
    <span class="gs-paginacao-info">Pág. ${currentPage} de ${totalPages}</span>
    <button class="gs-paginacao-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Próximo</button>
  `;

  containerEl.querySelectorAll('.gs-paginacao-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPage = parseInt(btn.dataset.page);
      onPageChange(targetPage);
    });
  });
}