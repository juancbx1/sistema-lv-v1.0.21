// public/src/components/BotaoBuscaItemAgregado.jsx
import React from 'react';

// --- SUBCOMPONENTE REUTILIZÁVEL PARA O TOOLTIP ---
const TooltipIcon = ({ text }) => (
    <div className="tooltip-container">
        i
        <span className="tooltip-text">{text}</span>
    </div>
);

export default function BotaoBuscaItemAgregado({ item }) {
    return (
        <div className="gs-agregado-card">
            <div className="agregado-header">
                <img src={item.imagem || '/img/placeholder-image.png'} alt={item.produto_nome} />
                <div className="agregado-info">
                    <span className="nome">{item.produto_nome}</span>
                    {/* A variação agora é um 'span' separado, que por padrão já fica abaixo */}
                    <span className="variante">{item.variacao || 'Padrão'}</span>
                </div>
            </div>
            <div className="agregado-body">
                <div className="necessidade-principal">
                    <span>Necessidade Total de Produção</span>
                    <strong className="valor-deficit">{item.necessidade_total_producao}</strong>
                    <span>peças</span>
                </div>

                <div className="saldos-disponiveis">
                    <div className="saldo-bloco">
                        <span>Disponível no Arremate</span>
                        <strong>{item.saldo_disponivel_arremate}</strong>
                    </div>
                    <div className="saldo-bloco">
                        <span>Disponível na Embalagem</span>
                        <strong>{item.saldo_disponivel_embalagem}</strong>
                    </div>

                    {/* --- INÍCIO DA MODIFICAÇÃO COM TOOLTIPS --- */}
                    {item.is_demanded_as_unit ? (
                        // Cenário VERDE: Estoque é relevante
                        <div className="saldo-bloco estoque">
                            <span>
                                Disponível no Estoque
                                <TooltipIcon text="Este saldo de estoque será usado para atender às demandas de unidades avulsas." />
                            </span>
                            <strong>{item.saldo_disponivel_estoque}</strong>
                        </div>
                    ) : (
                        // Cenário CINZA: Estoque não é relevante para kits
                        <div className="saldo-bloco bloqueado">
                            <span>
                                Estoque (Unidades)
                                <TooltipIcon text="O estoque de unidades prontas não pode ser usado para montar kits. Este valor NÃO é abatido da 'Necessidade Total de Produção' de componentes." />
                            </span>
                            <strong>{item.saldo_disponivel_estoque}</strong>
                        </div>
                    )}
                    {/* --- FIM DA MODIFICAÇÃO COM TOOLTIPS --- */}
                </div>

            </div>

            <div className="agregado-footer">
                <p>Esta produção impacta <strong>{item.demandas_dependentes.length}</strong> demanda(s):</p>
                <ul>
                    {item.demandas_dependentes.map(dep => <li key={dep}>{dep}</li>)}
                </ul>
            </div>
        </div>
    );
}