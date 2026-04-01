// public/src/components/LogItem.jsx

import React from 'react';

// Função para formatar a data e hora de forma amigável
const formatarDataHora = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Objeto de configuração para mapear o tipo de ação para um ícone e cor
const logConfig = {
    // Padrão
    default: { icon: 'fa-info-circle', color: '#7f8c8d' },
    // Criações (Verde)
    CRIACAO_LANCAMENTO: { icon: 'fa-plus', color: '#27ae60' },
    CRIACAO_LANCAMENTO_DETALHADO: { icon: 'fa-shopping-cart', color: '#27ae60' },
    CRIACAO_TRANSFERENCIA: { icon: 'fa-exchange-alt', color: '#27ae60' },
    CRIACAO_AGENDAMENTO: { icon: 'fa-calendar-plus', color: '#27ae60' },
    CRIACAO_LOTE_AGENDAMENTO: { icon: 'fa-layer-group', color: '#27ae60' },
    CRIACAO_ENTIDADE: { icon: 'fa-folder-plus', color: '#27ae60' },
    // Edições (Azul)
    EDICAO_LANCAMENTO: { icon: 'fa-pencil-alt', color: '#2980b9' },
    EDICAO_AGENDAMENTO: { icon: 'fa-pencil-alt', color: '#2980b9' },
    EDICAO_ENTIDADE: { icon: 'fa-pencil-alt', color: '#2980b9' },
    ALTERACAO_STATUS_CONTATO: { icon: 'fa-toggle-on', color: '#2980b9' },
    // Exclusões (Vermelho)
    EXCLUSAO_LANCAMENTO: { icon: 'fa-trash', color: '#c0392b' },
    EXCLUSAO_AGENDAMENTO: { icon: 'fa-trash', color: '#c0392b' },
    // Ações de Fluxo (Laranja/Amarelo)
    BAIXA_AGENDAMENTO: { icon: 'fa-check-circle', color: '#f39c12' },
    SOLICITACAO_EDICAO: { icon: 'fa-question-circle', color: '#f39c12' },
    SOLICITACAO_EXCLUSAO: { icon: 'fa-question-circle', color: '#f39c12' },
    // Aprovações (Verde Escuro)
    APROVACAO_SOLICITACAO: { icon: 'fa-check-double', color: '#16a085' },
    // Rejeições (Vermelho Escuro)
    REJEICAO_SOLICITACAO: { icon: 'fa-times-circle', color: '#a32316' },
};

export default function LogItem({ log }) {
    // Pega a configuração (ícone e cor) para a ação atual, ou usa o padrão se não encontrar
    const config = logConfig[log.acao] || logConfig.default;

    return (
        // O container principal com layout flex
        <div className="log-item-container">
            {/* Coluna Esquerda: Ícone e a linha da timeline */}
            <div className="log-item-timeline">
                <div className="log-item-icone" style={{ backgroundColor: config.color }}>
                    <i className={`fas ${config.icon}`}></i>
                </div>
                <div className="log-item-linha"></div>
            </div>

            {/* Coluna Direita: Conteúdo do log */}
            <div className="log-item-conteudo">
                {/* O HTML da mensagem vem direto do backend, usamos dangerouslySetInnerHTML para renderizar o <strong> */}
                <p 
                    className="log-item-detalhes" 
                    dangerouslySetInnerHTML={{ __html: log.detalhes }} 
                />
                <p className="log-item-meta">
                    <span className="log-item-usuario">{log.nome_usuario}</span>
                    <span className="log-item-data">{formatarDataHora(log.data_evento)}</span>
                </p>
            </div>
        </div>
    );
}