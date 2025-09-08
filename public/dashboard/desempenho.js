// public/dashboard/desempenho.js (VERSÃO SIMPLIFICADA)

import { verificarAutenticacao } from '/js/utils/auth.js';
import { ciclos, getObjetoCicloCompletoAtual } from '/js/utils/ciclos.js';

// --- FUNÇÃO DE INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('ds-body');
    
    try {
        const auth = await verificarAutenticacao('dashboard/desempenho.html', ['acesso-desempenho']);
        if (!auth) return;

        document.body.classList.add('autenticado');
        
        // A API /desempenho agora é chamada diretamente aqui
        const token = localStorage.getItem('token');
        const response = await fetch('/api/dashboard/desempenho', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Falha ao buscar dados de desempenho.');
        
        const dados = await response.json();
        
        popularHeader(dados.usuario);
        renderizarCiclos(dados);
        configurarEventListenersDesempenho();

    } catch (err) {
        console.error("Erro crítico na inicialização:", err);
        document.getElementById('ciclos-container').innerHTML = '<p style="color:red; text-align: center;">Erro grave ao carregar a página. Tente novamente.</p>';
    }
});


// --- FUNÇÕES DE RENDERIZAÇÃO ---

function popularHeader(usuario) {
    document.getElementById('header-nome-usuario').textContent = usuario.nome;
    document.getElementById('header-cargo-nivel').textContent = `${usuario.tipo.charAt(0).toUpperCase() + usuario.tipo.slice(1)} - Nível ${usuario.nivel || 'N/A'}`;
    document.getElementById('header-avatar-img').src = usuario.avatar_url || '/img/default-avatar.png';
}

function renderizarCiclos(dados) {
    const container = document.getElementById('ciclos-container');
    const { cicloAtual } = dados;

    if (!cicloAtual) {
        container.innerHTML = '<p style="text-align:center;">Nenhum ciclo de trabalho ativo no momento.</p>';
        return;
    }

    // Encontra o índice do ciclo atual na lista de todos os ciclos
    const indiceCicloAtual = ciclos.findIndex(c => c.nome === cicloAtual.nome);
    const proximoCiclo = (indiceCicloAtual !== -1 && indiceCicloAtual + 1 < ciclos.length) 
        ? ciclos[indiceCicloAtual + 1] 
        : null;

    let html = '';
    
    // Renderiza o card do ciclo atual
    html += criarCardCiclo(cicloAtual, cicloAtual.atividades, true);

    // Renderiza o card do próximo ciclo (se houver)
    if (proximoCiclo) {
        // Para o próximo ciclo, não há atividades, então passamos um array vazio
        html += criarCardCiclo(proximoCiclo, [], false);
    }
    
    container.innerHTML = html;
}

function criarCardCiclo(ciclo, atividades, isCicloAtual) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const totalPontosCiclo = atividades.reduce((acc, atv) => acc + (parseFloat(atv.pontos_gerados) || 0), 0);

    const semanasHtml = ciclo.semanas.map((semana, index) => {
        const inicioSemana = new Date(semana.inicio + 'T00:00:00');
        const fimSemana = new Date(semana.fim + 'T23:59:59');

        const atividadesDaSemana = atividades.filter(atv => {
            const dataAtv = new Date(atv.data);
            return dataAtv >= inicioSemana && dataAtv <= fimSemana;
        });
        const pontosFeitos = atividadesDaSemana.reduce((acc, atv) => acc + (parseFloat(atv.pontos_gerados) || 0), 0);
        
        let classeSemana = '';
        let statusTexto = 'Semana futura';
        if (isCicloAtual) {
            if (hoje >= inicioSemana && hoje <= fimSemana) {
                classeSemana = 'semana-atual';
                statusTexto = 'Em andamento';
            } else if (hoje > fimSemana) {
                classeSemana = 'semana-passada';
                statusTexto = 'Concluída';
            }
        }

        return `
            <div class="ds-semana-item ${classeSemana}">
                <div class="ds-semana-info">
                    <div class="periodo">Semana ${index + 1} (${inicioSemana.toLocaleDateString('pt-BR')} - ${fimSemana.toLocaleDateString('pt-BR')})</div>
                    <div class="status">${statusTexto}</div>
                </div>
                <div class="ds-semana-pontos ${pontosFeitos > 0 ? '' : 'zerado'}">
                    ${Math.round(pontosFeitos)} pts
                </div>
            </div>
        `;
    }).join('');

    const isAcordeao = !isCicloAtual; // O próximo ciclo será um acordeão
    const classeCard = isAcordeao ? 'ds-ciclo-acordeao' : '';

    let statusHeader, iconeAcordeao = '';

    if (isCicloAtual) {
        statusHeader = `<span class="status-atual">(Ciclo Atual)</span>`;
    } else {
        statusHeader = `<span class="status-proximo">(Próximo Ciclo)</span>`;
        iconeAcordeao = `<i class="fas fa-chevron-down ds-acordeao-icone"></i>`;
    }

    const totalizadorHtml = isCicloAtual
        ? `<div class="ds-ciclo-total">Total de Pontos no Ciclo: <span>${Math.round(totalPontosCiclo)}</span></div>`
        : '';

    return `
        <div class="ds-ciclo-card ${classeCard}">
            <div class="ds-ciclo-header">
                <h3>${ciclo.nome} ${statusHeader}</h3>
                ${iconeAcordeao}
            </div>
            <div class="ds-ciclo-body">
                ${totalizadorHtml}
                <div class="ds-semanas-lista">
                    ${semanasHtml}
                </div>
            </div>
        </div>
    `;
}

function configurarEventListenersDesempenho() {
    const container = document.getElementById('ciclos-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
        // Procura por um clique no cabeçalho de um acordeão
        const header = e.target.closest('.ds-ciclo-acordeao .ds-ciclo-header');
        if (header) {
            header.classList.toggle('ativo');
            const body = header.nextElementSibling;
            // A mágica acontece no CSS, aqui só alternamos a classe
        }
    });
}
