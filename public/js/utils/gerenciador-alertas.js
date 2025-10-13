//public/js/utils/gerenciador-alertas.js

// Usa as funções de popup que já temos
import { mostrarConfirmacao, mostrarToast  } from './popups.js';

// --- CONFIGURAÇÕES ---
const INTERVALO_VERIFICACAO_MS = 30000; // 30 segundos
const SOM_ALERTA_SRC = '/sounds/alerta.mp3';

// --- VARIÁVEIS DE CONTROLE ---
let audioAlerta = null;
let ultimoAlertaDisparado = {}; // Ex: { "OCIOSIDADE_ARREMATE_4": 167... (timestamp) }

/**
 * Toca o som de notificação.
 */
function tocarSomAlerta() {
    if (!audioAlerta) {
        audioAlerta = new Audio(SOM_ALERTA_SRC);
    }
    audioAlerta.play().catch(error => {
        // Navegadores modernos podem bloquear a reprodução automática de áudio.
        // O primeiro clique do usuário na página geralmente libera essa permissão.
        console.warn("Não foi possível tocar o som do alerta:", error.message);
    });
}

/**
 * Envia uma notificação do navegador, se a permissão for concedida.
 * @param {string} mensagem O texto da notificação.
 */
function mostrarNotificacaoNavegador(mensagem) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return; // Não faz nada se não houver suporte ou permissão
    }
    new Notification('Alerta do Sistema', {
        body: mensagem,
        icon: '/img/favicon.ico' // Opcional: ícone para a notificação
    });
}

/**
 * Função principal que verifica e dispara os alertas.
 * @param {object} alerta O objeto de alerta vindo da API.
 */
function dispararAlerta(alerta) {
    // Determina o tipo/cor do toast. Usa o 'nivel' enviado pela API, ou 'aviso' como padrão.
    const tipoToast = alerta.nivel || 'aviso';
    
    // Determina a duração. Se for um alerta de erro (lentidão), dura 7s. Senão, 5s.
    const duracaoToast = (tipoToast === 'erro') ? 7000 : 5000;

    if (alerta.config.acao_popup) {
        mostrarToast(alerta.mensagem, tipoToast, duracaoToast); 
        tocarSomAlerta();
    }
    if (alerta.config.acao_notificacao) {
        mostrarNotificacaoNavegador(alerta.mensagem);
    }
}

/**
 * Função de polling que chama a API e processa a resposta.
 */
async function verificarStatusParaAlertas() {
    // Só executa se a aba estiver visível para não perturbar o usuário desnecessariamente
    if (document.hidden) {
        // Agenda a próxima verificação e para por aqui
        setTimeout(verificarStatusParaAlertas, INTERVALO_VERIFICACAO_MS);
        return;
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) return; // Se não estiver logado, para o motor

        const response = await fetch('/api/alertas/verificar-status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const alertas = await response.json();
            if (Array.isArray(alertas) && alertas.length > 0) {
                // Se a API retornou alertas, processa cada um
                alertas.forEach(dispararAlerta);
            }
        }
    } catch (error) {
        console.error("Erro no motor de verificação de alertas:", error);
    } finally {
        // Agenda a próxima execução, com ou sem erro.
        setTimeout(verificarStatusParaAlertas, INTERVALO_VERIFICACAO_MS);
    }
}

/**
 * Inicia todo o sistema de alertas.
 */
async function iniciarMotorDeAlertas() {
    // 1. Verifica se as notificações são suportadas e se a permissão ainda não foi pedida ('default')
    if ('Notification' in window && Notification.permission === 'default') {
        
        // Espera 5 segundos para não ser intrusivo
        setTimeout(async () => {
            const aceitou = await mostrarConfirmacao(
                "Deseja ativar as notificações no navegador para os alertas do sistema? <br><br>Você será avisado sobre eventos importantes mesmo quando não estiver olhando para esta aba.",
                {
                    tipo: 'info',
                    textoConfirmar: 'Sim, Ativar',
                    textoCancelar: 'Agora Não'
                }
            );

            if (aceitou) {
                await Notification.requestPermission();
            }
        }, 5000);
    }

    // 2. Inicia o loop de verificação (isso não muda)
    verificarStatusParaAlertas();
}

// --- PONTO DE ENTRADA ---
// Inicia o motor assim que o script é carregado
iniciarMotorDeAlertas();