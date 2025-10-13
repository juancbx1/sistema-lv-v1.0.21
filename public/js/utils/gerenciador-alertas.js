//public/js/utils/gerenciador-alertas.js

// Usa as funções de popup que já temos
import { mostrarConfirmacao, mostrarToast  } from './popups.js';

// --- CONFIGURAÇÕES ---
const INTERVALO_VERIFICACAO_MS = 30000; // 30 segundos
const SOM_ALERTA_SRC = '/sounds/alerta.mp3';

// --- VARIÁVEIS DE CONTROLE ---
let audioAlerta = null;
let audioDesbloqueado = false

/**
 * Tenta "desbloquear" a permissão de áudio.
 * Esta função deve ser chamada após o primeiro clique do usuário.
 */
function desbloquearAudio() {
    if (audioDesbloqueado || !audioAlerta) return;
    
    // A técnica é dar um "play" mudo e pausar imediatamente.
    // Isso satisfaz a exigência do navegador de interação do usuário.
    audioAlerta.muted = true;
    audioAlerta.play().then(() => {
        audioAlerta.pause();
        audioAlerta.currentTime = 0;
        audioAlerta.muted = false;
        audioDesbloqueado = true;
        console.log('[ÁUDIO] Permissão de áudio desbloqueada com sucesso.');
    }).catch(error => {
        // Não mostra um erro para o usuário, apenas no console.
        console.warn('[ÁUDIO] Tentativa de desbloqueio de áudio falhou:', error.message);
    });
}

/**
 * Toca o som de notificação, se o áudio estiver desbloqueado.
 */
function tocarSomAlerta() {
    if (audioDesbloqueado && audioAlerta) {
        audioAlerta.currentTime = 0; // Reinicia o som
        audioAlerta.play().catch(error => {
            console.error("Erro ao tocar som do alerta:", error.message);
        });
    } else {
        console.warn("Áudio não pôde ser tocado (ainda não desbloqueado ou falha no carregamento).");
    }
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
    const tipoToast = alerta.nivel || 'aviso';
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
function iniciarMotorDeAlertas() {
    // 1. Pré-carrega o objeto de áudio
    audioAlerta = new Audio(SOM_ALERTA_SRC);
    audioAlerta.addEventListener('error', () => {
        console.error(`ERRO: Não foi possível carregar o arquivo de som em: ${SOM_ALERTA_SRC}. Verifique o caminho.`);
        audioAlerta = null; // Anula o objeto de áudio se der erro
    });

    // 2. Adiciona um listener global para o primeiro clique do usuário
    document.body.addEventListener('click', desbloquearAudio, { once: true });
    // 'once: true' é uma otimização: o listener se remove automaticamente após ser disparado uma vez.

    // 3. Pede permissão para notificações (lógica não muda)
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