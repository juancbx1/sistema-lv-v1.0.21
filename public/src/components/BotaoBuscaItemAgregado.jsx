// public/src/components/BotaoBuscaItemAgregado.jsx
import React from 'react';

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

                     <div className="saldo-bloco estoque">
                        <span>Disponível no Estoque</span>
                        <strong>{item.saldo_disponivel_estoque}</strong>
                    </div>


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