// public/src/components/LancamentoFinanceiroCard.jsx
import React from 'react';
import Badge from './Badge.jsx';
import LancamentoDetalhes from './LancamentoDetalhes.jsx';

// Funções de formatação
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(value) || 0);
const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    // Adiciona 'T00:00:00' para garantir que a data seja interpretada como local e não UTC
    return new Date(isoString.split('T')[0] + 'T00:00:00').toLocaleDateString('pt-BR');
};
const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    // O formato 'toLocaleString' já lida com o fuso horário local corretamente
    return new Date(isoString).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
};


const LancamentoFinanceiroCard = ({ lancamento, onEdit, onDelete, onEstorno, onReverterEstorno, onToggleDetails, isExpanded }) => {
    // Constantes de estado para facilitar a leitura do código
    const isReceita = lancamento.tipo === 'RECEITA';
    const isPendente = lancamento.status_edicao?.startsWith('PENDENTE');
    const isEstornado = lancamento.status_edicao === 'ESTORNADO';
    const isEstorno = !!lancamento.id_estorno_de;
    const isDetalhado = lancamento.itens && lancamento.itens.length > 0;
    const isTransferencia = !!lancamento.id_transferencia_vinculada;

    const bordaClasse = isReceita ? 'receita' : (isTransferencia ? 'transferencia' : 'despesa');
    const valorClasse = isReceita ? 'valor-receita' : 'valor-despesa';

    let categoriaPrincipalExibida = lancamento.nome_categoria;
    if (lancamento.tipo_rateio === 'COMPRA') {
        // Para Compra Detalhada, mostra a categoria do primeiro item como referência
        categoriaPrincipalExibida = lancamento.itens?.[0]?.nome_categoria || 'Várias Categorias';
    } else if (isTransferencia) {
        categoriaPrincipalExibida = 'Transferência';
    }

    // Função para renderizar as "pílulas" (badges)
    const renderBadge = () => {
        if (isPendente) return <Badge text="Pendente" color="orange" icon="fa-clock" />;
        if (isEstornado) return <Badge text="Estornado" color="gray" />;
        if (isEstorno) return <Badge text="Estorno Recebido" color="green" icon="fa-undo-alt" />;
        if (isTransferencia) return <Badge text="Transferência" color="gray" />;
        if (lancamento.tipo_rateio === 'COMPRA') return <Badge text="Compra Detalhada" color="blue" />;
        if (lancamento.tipo_rateio === 'DETALHADO') return <Badge text="Rateio" color="purple" />;
        return null;
    };

    return (
        <div className={`fc-smart-card ${bordaClasse}`}>
            {/* SEÇÃO HEADER */}
            <div className="card-header">
                <div className="header-info">
                    <span className="lancamento-id">#{lancamento.id}</span>
                    {renderBadge()}
                </div>
                <div className={`lancamento-valor ${valorClasse}`}>
                    {isReceita ? '+' : '-'} {formatCurrency(lancamento.valor)}
                </div>
            </div>

            {/* SEÇÃO CORPO COMPACTO */}
            <div className="card-body-compact">
                <h3 className="card-title">{lancamento.descricao || 'Lançamento sem descrição'}</h3>
                <div className="card-info-compact">
                    <span className="detail-item" title={categoriaPrincipalExibida}><i className="fas fa-tag"></i> <span>{categoriaPrincipalExibida}</span></span>
                    <span className="detail-item" title={lancamento.nome_conta}><i className="fas fa-university"></i> <span>{lancamento.nome_conta}</span></span>
                    <span className="detail-item" title={lancamento.nome_favorecido}><i className="fas fa-user-friends"></i> <span>{lancamento.nome_favorecido || 'N/A'}</span></span>
                </div>
            </div>
            
            {/* SEÇÃO FOOTER */}
            <div className="card-footer">
                <div className="meta-info">
                    <span title={`Criado por ${lancamento.nome_usuario} em ${formatDateTime(lancamento.data_lancamento)}`}>
                        Criado por: <i className="fas fa-user-tie"></i> <strong>{lancamento.nome_usuario}</strong> em {formatDateTime(lancamento.data_lancamento)}
                    </span>
                    {lancamento.nome_usuario_edicao && (
                        <span title={`Editado por ${lancamento.nome_usuario_edicao} em ${formatDateTime(lancamento.atualizado_em)}`}>
                             • Editado por: <i className="fas fa-history" style={{color: 'var(--gs-aviso)'}}></i> <strong>{lancamento.nome_usuario_edicao}</strong> em {formatDateTime(lancamento.atualizado_em)}
                        </span>
                    )}
                </div>

                <div className="card-actions">
                    {isDetalhado && (
                        <button onClick={() => onToggleDetails(lancamento.id)} className="action-btn" title={isExpanded ? "Ocultar Detalhes" : "Ver Detalhes"}>
                            <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                        </button>
                    )}
                    
                    {isEstorno ? (
                        <button onClick={() => onReverterEstorno(lancamento.id)} className="action-btn action-btn--delete" title="Reverter Estorno" disabled={isPendente}>
                            <i className="fas fa-history"></i>
                        </button>
                    ) : (
                        !isReceita && !isTransferencia && (
                            <button onClick={() => onEstorno(lancamento)} className="action-btn action-btn--estorno" title="Registrar Estorno" disabled={isPendente || isEstornado}>
                                <i className="fas fa-undo-alt"></i>
                            </button>
                        )
                    )}

                    {!isTransferencia && (
                         <>
                            {/* O lápis usa a classe base, sem modificador de cor */}
                            <button onClick={() => onEdit(lancamento)} className="action-btn" title="Editar" disabled={isPendente || isEstornado || isEstorno}>
                                <i className="fas fa-pencil-alt"></i>
                            </button>
                            {/* <<< Usa a nova classe com "--" >>> */}
                            <button onClick={onDelete} className="action-btn action-btn--delete" title="Excluir" disabled={isPendente || isEstornado || isEstorno}>
                                <i className="fas fa-trash"></i>
                            </button>
                         </>
                    )}
                </div>
            </div>

            {/* SEÇÃO EXPANSÍVEL */}
            {isExpanded && <LancamentoDetalhes lancamento={lancamento} />}
        </div>
    );
};

export default LancamentoFinanceiroCard;