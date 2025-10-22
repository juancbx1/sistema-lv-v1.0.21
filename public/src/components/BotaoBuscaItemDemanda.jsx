// public/src/components/BotaoBuscaItemDemanda.jsx
import React, { useState } from 'react';
import { mostrarConfirmacao } from '/js/utils/popups.js';

// Subcomponente para diagnóstico de ITEM SIMPLES
const DiagnosticoItemSimples = ({ nome, variacao, saldos, necessario, deficit }) => (
    <div className="componente-diagnostico">
        <div className="componente-info">
            <span className="nome">{nome}</span>
            {variacao && variacao !== '-' && <span className="variante">{variacao}</span>}
        </div>
        <div className="componente-saldos">
            <div><span>Necessário</span><strong className="necessario">{necessario}</strong></div>
            <div><span>Arremate</span><strong>{saldos.saldoArremate}</strong></div>
            <div><span>Embalagem</span><strong>{saldos.saldoEmbalagem}</strong></div>
            <div><span>Estoque</span><strong>{saldos.saldoEstoque}</strong></div>
        </div>
        <div className={`componente-deficit ${deficit <= 0 ? 'sem-deficit' : ''}`}>
            <span>Falta</span>
            <strong className="deficit-valor">{deficit}</strong>
        </div>
    </div>
);

// Subcomponente para diagnóstico de COMPONENTE DE KIT
// Mostra apenas Arremate e Embalagem, pois o estoque não conta.
const DiagnosticoComponenteKit = ({ nome, variacao, saldos, necessarioParaDeficit, deficit }) => (
    <div className="componente-diagnostico kit-componente">
        <div className="componente-info">
            <span className="nome">{nome}</span>
            {variacao && variacao !== '-' && <span className="variante">{variacao}</span>}
        </div>
        <div className="componente-saldos">
            {/* Mostramos quanto precisa para cobrir o déficit de kits */}
            <div><span title="Necessário para cobrir o déficit de kits">Necess. (Déficit)</span><strong className="necessario">{necessarioParaDeficit}</strong></div>
            <div><span>Arremate</span><strong>{saldos.saldoArremate}</strong></div>
            <div><span>Embalagem</span><strong>{saldos.saldoEmbalagem}</strong></div>
            {/* Estoque removido daqui visualmente para não confundir */}
             <div className="saldo-bloqueado" title="Estoque não utilizável para kits"><span>Estoque</span><strong>-</strong></div>
        </div>
        <div className={`componente-deficit ${deficit <= 0 ? 'sem-deficit' : ''}`}>
            <span>Falta Produzir</span>
            <strong className="deficit-valor">{deficit}</strong>
        </div>
    </div>
);

export default function BotaoBuscaItemDemanda({ demanda, onDelete }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditingPriority, setIsEditingPriority] = useState(false);
    const [newPriority, setNewPriority] = useState(demanda.prioridade);

    const {
        produto_nome,
        produto_imagem,
        is_kit,
        quantidade_solicitada,
        diagnostico_geral,
        componentes
    } = demanda;

    const deficitPrincipal = diagnostico_geral.deficit_producao;

    const handleDelete = async (e) => {
        e.stopPropagation();

        const confirmado = await mostrarConfirmacao(
            `Tem certeza que deseja remover a demanda para "${demanda.produto_nome}"?`,
            {
                tipo: 'perigo', // Usa a cor vermelha
                textoConfirmar: 'Sim, remover',
                textoCancelar: 'Cancelar'
            }
        );

        if (confirmado) {
            onDelete(demanda.id);
        }
    };

    const handlePriorityClick = (e) => {
        e.stopPropagation(); // Evita que o card expanda
        setIsEditingPriority(true);
    };

    const handlePriorityBlur = () => {
        setIsEditingPriority(false);
        // Só chama a API se o valor realmente mudou
        if (String(newPriority) !== String(demanda.prioridade)) {
            onUpdate(demanda.id, { prioridade: newPriority });
        }
    };

    const handlePriorityKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur(); // O blur vai salvar
        } else if (e.key === 'Escape') {
            setNewPriority(demanda.prioridade); // Reverte a mudança
            setIsEditingPriority(false);
        }
    };

    return (
        <div className={`gs-demanda-card ${isExpanded ? 'expandido' : ''} ${deficitPrincipal > 0 ? 'com-deficit' : 'sem-deficit'}`}>
            {/* CABEÇALHO (MANTIDO IGUAL) */}
            <div className="gs-demanda-card-header" onClick={() => setIsExpanded(!isExpanded)}>
                {isEditingPriority ? (
                    <input
                        type="number"
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value)}
                        onBlur={handlePriorityBlur}
                        onKeyDown={handlePriorityKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="prioridade-input"
                    />
                ) : (
                    <span className="prioridade-tag" onClick={handlePriorityClick} title="Clique para editar a prioridade">
                        P:{demanda.prioridade}
                    </span>
                )}
                <img src={produto_imagem || '/img/placeholder-image.png'} alt={produto_nome} />
                <div className="info-principal">
                    <span className="nome">{produto_nome}</span>
                    {/* O SKU agora está em um span separado, que será estilizado para quebrar a linha */}
                    <span className="sku">SKU: {demanda.produto_sku}</span>
                </div>
                <div className={`metricas-resumo ${deficitPrincipal <= 0 ? 'sem-deficit' : ''}`}>
                    <div>
                        <span>Solicitado</span><strong>{quantidade_solicitada}</strong>
                    </div>
                    <div>
                        <span>Falta (Real)</span>
                        <strong className="deficit-valor">{deficitPrincipal}</strong>
                    </div>
                </div>

                <div className="acoes-card">
                    <button className="btn-acao-demanda deletar" onClick={handleDelete} title="Remover Demanda">
                        <i className="fas fa-trash-alt"></i>
                    </button>
                    <div className="expansor">
                        <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                    </div>
                </div>
            </div>

            {/* CORPO (ADAPTADO PARA A NOVA LÓGICA) */}
            {isExpanded && (
                <div className="gs-demanda-card-body">
                    {is_kit ? (
                        <>
                            <div className="kit-resumo-geral">
                                <h4>Situação Geral do Kit</h4>
                                <div className="kit-metricas-grid">
                                    <div className="kit-metrica"><span>Solicitado</span><strong>{quantidade_solicitada}</strong></div>
                                    <div className="kit-metrica estoque"><span>Prontos em Estoque</span><strong>{diagnostico_geral.kits_prontos_estoque}</strong></div>
                                    <div className="kit-metrica potencial"><span>Potencial Montagem</span><strong>{diagnostico_geral.potencial_montagem_chao_fabrica}</strong></div>
                                    <div className="kit-metrica total"><span>Total Disponível</span><strong>{diagnostico_geral.total_disponivel}</strong></div>
                                </div>
                            </div>
                            <h4 className="diagnostico-titulo" style={{marginTop: '25px'}}>Diagnóstico dos Componentes (para cobrir déficit de {deficitPrincipal} kits)</h4>
                            <div className="lista-componentes-diagnostico">
                                {componentes.map(comp => (
                                    <DiagnosticoComponenteKit
                                        key={comp.produto_id + comp.variacao}
                                        nome={comp.produto_nome}
                                        variacao={comp.variacao}
                                        saldos={comp.saldos}
                                        necessarioParaDeficit={comp.quantidade_necessaria_para_deficit}
                                        deficit={comp.deficit_producao}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <h4 className="diagnostico-titulo">Diagnóstico da Demanda</h4>
                            <DiagnosticoItemSimples
                                nome={produto_nome}
                                variacao={demanda.variante}
                                saldos={diagnostico_geral}
                                necessario={quantidade_solicitada}
                                deficit={diagnostico_geral.deficit_producao}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}