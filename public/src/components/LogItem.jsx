import React from 'react';

// << FUNÇÃO getLogStyle MODIFICADA >>
const getLogStyle = (log) => {
    // Caso especial para criação
    if (log.acao.includes('CRIACAO')) {
        if (log.contexto?.tipo_lancamento === 'RECEITA') {
            return { icone: 'fa-plus-circle', cor: 'var(--fc-cor-receita)' };
        }
        // Por padrão, criação é uma despesa ou ação neutra
        return { icone: 'fa-minus-circle', cor: 'var(--fc-cor-despesa)' };
    }
    
    // Mantém a lógica antiga para as outras ações
    if (log.acao.includes('EDICAO')) return { icone: 'fa-pencil-alt', cor: 'var(--fc-cor-primaria)' };
    if (log.acao.includes('EXCLUSAO')) return { icone: 'fa-trash-alt', cor: '#34495e' };
    if (log.acao.includes('APROVACAO')) return { icone: 'fa-check-double', cor: 'var(--fc-cor-receita)' };
    if (log.acao.includes('REJEICAO')) return { icone: 'fa-times-circle', cor: 'var(--fc-cor-despesa)' };
    if (log.acao.includes('SOLICITACAO')) return { icone: 'fa-hourglass-half', cor: 'var(--fc-cor-aviso)' };
    
    return { icone: 'fa-info-circle', cor: 'var(--fc-cor-texto-secundario)' };
};

export default function LogItem({ log }) {
    // << A CHAMADA AGORA PASSA O 'log' INTEIRO >>
    const { icone, cor } = getLogStyle(log);
    const dataFormatada = new Date(log.data_evento).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    return (
        <div className="log-item-container">
            <div className="log-item-icone" style={{ backgroundColor: cor }}>
                <i className={`fas ${icone}`}></i>
            </div>
            <div className="log-item-conteudo">
                <p className="log-item-detalhes" dangerouslySetInnerHTML={{ __html: log.detalhes }}></p>
                <p className="log-item-meta">
                    Por <strong>{log.nome_usuario}</strong> em {dataFormatada}
                </p>
            </div>
        </div>
    );
}