// public/src/components/BotaoBuscaItemAgregado.jsx
import React, { useState, useEffect, useMemo } from 'react';

const TooltipIcon = ({ text }) => (
    <div className="tooltip-container">
        i
        <span className="tooltip-text">{text}</span>
    </div>
);

export default function BotaoBuscaItemAgregado({ item, itemAnterior, demandasSource, onAssumir }) {
    const [highlight, setHighlight] = useState(false);
    const [needsAcknowledgement, setNeedsAcknowledgement] = useState(false);

    const diffInfo = useMemo(() => {
        if (!itemAnterior) {
            return { diferenca: 0, novasDemandas: [] };
        }

        const diferenca = item.necessidade_total_producao - itemAnterior.necessidade_total_producao;

        const idsAnteriores = new Set(itemAnterior.demandas_dependentes_ids);
        const novasDemandasIds = item.demandas_dependentes_ids.filter(id => !idsAnteriores.has(id));

        const novasDemandas = demandasSource
            .filter(demanda => novasDemandasIds.includes(demanda.id))
            .map(demanda => demanda.produto_nome);
        
        return { diferenca, novasDemandas };

    }, [item, itemAnterior, demandasSource]);

    // A chave única do componente que será enviada para a API
    const componenteChave = `${item.produto_id}|${item.variacao || '-'}`;

    // Função para ser chamada pelo botão
    const handleAssumirClick = () => {
        // Envia a chave do componente, e não a lista de IDs de demanda
        onAssumir(componenteChave);
    };

    // A informação de atribuição agora vem diretamente da propriedade 'atribuida_a' do item agregado
    const atribuicao = item.atribuida_a;

    useEffect(() => {
        // Apenas executa se houver uma diferença positiva
        if (diffInfo.diferenca > 0) {
            // 1. Força o estado para 'false' primeiro.
            setHighlight(false);
            setNeedsAcknowledgement(true);

            // 2. Usa um pequeno timeout para aplicar o 'true' no "próximo frame".
            // Isso dá tempo ao navegador para registrar a mudança de false -> true e reiniciar a animação.
            const startHighlightTimer = setTimeout(() => {
                setHighlight(true);
            }, 50); // 50ms é o suficiente

            // 3. Agenda a remoção do destaque após a duração total.
            const stopHighlightTimer = setTimeout(() => {
                setHighlight(false);
            }, 7000);

            // A função de limpeza garante que os timers sejam cancelados se o componente for desmontado.
            return () => {
                clearTimeout(startHighlightTimer);
                clearTimeout(stopHighlightTimer);
            };
        }
    }, [diffInfo]);


    return (
        <div className={`gs-agregado-card ${highlight ? 'highlight-change' : ''}`}>
            <div className="agregado-header">
                <img src={item.imagem || '/img/placeholder-image.png'} alt={item.produto_nome} />
                <div className="agregado-info">
                    <span className="nome">{item.produto_nome}</span>
                    <span className="variante">{item.variacao || 'Padrão'}</span>
                </div>
            </div>

            <div className="agregado-body">
                <div className="necessidade-principal">
                    <span>
                        Necessidade de Produção
                        {/* O ícone de alerta persistente */}
                        {needsAcknowledgement && <i className="fas fa-arrow-up fa-beat" style={{ color: 'var(--gs-aviso)', marginLeft: '8px' }}></i>}
                    </span>
                    {/* Apenas UM strong para o valor */}
                    <strong className="valor-deficit">{item.necessidade_total_producao}</strong>
                    <span>peças</span>
                </div>
                
                <div className="saldos-disponiveis">
                    <div className="saldo-bloco">
                        <span>No Arremate</span>
                        <strong>{item.saldo_disponivel_arremate}</strong>
                    </div>
                    <div className="saldo-bloco">
                        <span>Na Embalagem</span>
                        <strong>{item.saldo_disponivel_embalagem}</strong>
                    </div>
                    {item.is_demanded_as_unit ? (
                        <div className="saldo-bloco estoque">
                            <span>No Estoque</span>
                            <TooltipIcon text="Este saldo será usado para atender às demandas de unidades avulsas." />
                            <strong>{item.saldo_disponivel_estoque}</strong>
                        </div>
                    ) : (
                        <div className="saldo-bloco bloqueado">
                            <span>Estoque (Unid.)</span>
                            <TooltipIcon text="Estoque de unidades prontas não é usado para montar kits e não abate a necessidade de produção de componentes." />
                            <strong>{item.saldo_disponivel_estoque}</strong>
                        </div>
                    )}
                </div>
            </div>

            {/* --- NOVA SEÇÃO DE NOTIFICAÇÃO DE MUDANÇA --- */}
            {highlight && diffInfo.diferenca > 0 && (
                <div className="agregado-notificacao-mudanca">
                    <div className="notificacao-titulo">
                        <i className="fas fa-arrow-up"></i>
                        AUMENTOU {diffInfo.diferenca} PÇS
                    </div>
                    {diffInfo.novasDemandas.length > 0 && (
                        <div className="notificacao-causa">
                            <small>Causa:</small>
                            <ul>
                                {diffInfo.novasDemandas.map(nome => <li key={nome}>{nome}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            <div className="agregado-footer">
                {atribuicao ? ( // <-- Usa a nova variável 'atribuicao'
                    <div className="atribuicao-info">
                        <i className="fas fa-user-check"></i>
                        Produção com: <strong>{atribuicao}</strong> {/* <-- Usa a nova variável 'atribuicao' */}
                    </div>
                ) : (
                    <button className="gs-btn gs-btn-primario" onClick={handleAssumirClick}>
                        <i className="fas fa-hammer"></i> Assumir Produção
                    </button>
                )}
            </div>
        </div>
    );
}
