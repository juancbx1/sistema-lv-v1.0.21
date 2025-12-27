// public/src/components/BotaoBuscaPipelineProducao.jsx

import React, { useState } from 'react';
import { mostrarConfirmacao } from '/js/utils/popups.js';

export default function CardPipelineProducao({ item, onPlanejar, onDelete, permissoes }) {
    const [expandido, setExpandido] = useState(false);

    const totalPedido = item.demanda_total || 0;
    
    // --- LÓGICA DE DADOS ---
    const emProducao = item.saldo_em_producao || 0;
    const emArremate = item.saldo_disponivel_arremate || 0;
    const emEmbalagem = item.saldo_disponivel_embalagem || 0;
    const emEstoque = item.saldo_disponivel_estoque || 0;
    const emPerda = item.saldo_perda || 0;
    
    const totalConsumido = emProducao + emArremate + emEmbalagem + emEstoque + emPerda;
    const pendenteFila = Math.max(0, totalPedido - totalConsumido);

    const pctEstoque = Math.min(100, (emEstoque / totalPedido) * 100);
    const pctEmbalagem = Math.min(100, (emEmbalagem / totalPedido) * 100);
    const pctArremate = Math.min(100, (emArremate / totalPedido) * 100);
    const pctProducao = Math.min(100, (emProducao / totalPedido) * 100);
    const pctPerda = Math.min(100, (emPerda / totalPedido) * 100);

    const nomeVariante = (item.variante && item.variante !== '-') ? item.variante : (item.variacao && item.variacao !== '-' ? item.variacao : '');

    // --- FUNÇÃO PARA LIMPAR O TÍTULO ---
    const getTituloLimpo = () => {
        let titulo = item.produto_nome;
        if (nomeVariante) {
            // Remove a variante se ela estiver entre parenteses no titulo
            // Ex: "Produto (Azul)" -> remove "(Azul)"
            titulo = titulo.replace(`(${nomeVariante})`, '').trim();
            // Remove parenteses vazios que podem ter sobrado "Produto ()"
            titulo = titulo.replace('()', '').trim();
        }
        return titulo;
    };

    const tituloLimpo = getTituloLimpo();

    const handleDeleteClick = async (e) => {
        e.stopPropagation();
        const confirmado = await mostrarConfirmacao(
            `Apagar demanda de "${tituloLimpo}"?`,
            { tipo: 'perigo', textoConfirmar: 'Apagar', textoCancelar: 'Cancelar' }
        );
        if (confirmado && onDelete) onDelete(item.demanda_id);
    };

    // Ação Principal: Clicar na tesoura
    const handleActionClick = (e) => {
        e.stopPropagation(); // Não abre o accordion
        if (pendenteFila > 0) {
            onPlanejar(item, pendenteFila);
        }
    };

    // Inteligência de Status 2.0 (Baseada em Volume/Dominância)
    const getFeedbackStatus = () => {
        // Verifica se ainda tem algo rodando na fábrica (excluindo estoque e perda)
        const algoEmAndamento = (emProducao > 0 || emArremate > 0 || emEmbalagem > 0);

        // 1. Concluído REAL (Estoque atingiu meta E fábrica parou)
        // Se a meta era 6, mas cortou 10, ele só dá concluído quando os 10 chegarem no estoque e sair do arremate.
        if (emEstoque >= totalPedido && !algoEmAndamento) {
            return { cor: "#27ae60", nome: "CONCLUÍDO", corFundo: "#eafaf1", icone: "fa-check-circle" };
        }

        // 2. Divergência (Perda impede conclusão)
        if (pendenteFila === 0 && emPerda > 0 && totalConsumido < totalPedido && !algoEmAndamento) {
            return { cor: "#c0392b", nome: "DIVERGÊNCIA", corFundo: "#fff5f5", icone: "fa-exclamation-triangle" };
        }

        // 3. Fase de Acabamento (Costura Zerada)
        if (emProducao === 0 && (emArremate > 0 || emEmbalagem > 0)) {
            if (emEmbalagem > emArremate) {
                return { cor: "#e67e22", nome: "EMBALAGEM", corFundo: "#fff5e6", icone: "fa-box-open" };
            } else {
                return { cor: "#8e44ad", nome: "ARREMATE", corFundo: "#f4ecf7", icone: "fa-clipboard-check" };
            }
        }

        // 4. Fase de Produção
        if (emProducao > 0) {
            return { cor: "#3498db", nome: "COSTURA", corFundo: "#ebf5fb", icone: "fa-cut" };
        }
        
        // 5. Estoque Parcial (Tem estoque, mas ainda tem gente trabalhando ou fila)
        // Isso resolve o caso: "6 no estoque, mas 4 no arremate". 
        // Ele vai cair nas regras acima (3 ou 4) ou aqui.
        if (emEstoque > 0 && emEstoque < totalPedido) {
             return { cor: "#2980b9", nome: "ANDAMENTO", corFundo: "#ebf5fb", icone: "fa-spinner" };
        }

        // 6. Fila
        return { cor: "#95a5a6", nome: "AGUARDANDO", corFundo: "#f8f9fa", icone: "fa-clock" };
    };
    
    const statusInfo = getFeedbackStatus();

    return (
        <div 
            className="gs-pipeline-card" 
            style={{ 
                position: 'relative', 
                borderLeftColor: statusInfo.cor, 
                cursor: 'pointer' 
            }}
            onClick={() => setExpandido(!expandido)}
        >
            {permissoes.includes('deletar-demanda') && (
                <button onClick={handleDeleteClick}
                    style={{
                        position: 'absolute', top: '2px', left: '2px', // Mudei para esquerda/topo discreto
                        background: 'rgba(255,255,255,0.8)', border: 'none', color: '#ccc',
                        cursor: 'pointer', fontSize: '1rem', padding: '5px', zIndex: 5, borderRadius: '50%'
                    }}
                >
                    <i className="fas fa-trash"></i>
                </button>
            )}

            {/* --- CABEÇALHO 3.0 (GRID COM AÇÃO RÁPIDA) --- */}
            <div className="pipeline-header-novo">
                
                {/* 1. IMAGEM */}
                <div className="ph-imagem">
                    <img src={item.imagem || '/img/placeholder-image.png'} alt={item.produto_nome} />
                </div>

                {/* 2. INFORMAÇÕES (COM TÍTULO LIMPO) */}
                <div className="ph-info">
                    <h4 title={tituloLimpo}>{tituloLimpo}</h4>
                    {nomeVariante && <div className="ph-variante">{nomeVariante}</div>}
                    <div className="ph-status-badge" style={{ backgroundColor: statusInfo.cor + '20', color: statusInfo.cor }}>
                        {statusInfo.nome}
                    </div>
                </div>

                {/* 3. META/QUANTIDADE */}
                <div className="ph-meta">
                    <span className="valor" style={{ color: pendenteFila > 0 ? '#c0392b' : '#2c3e50' }}>
                        {pendenteFila > 0 ? pendenteFila : totalPedido}
                    </span>
                    <span className="label">
                        {pendenteFila > 0 ? 'Falta' : 'Total'}
                    </span>
                </div>

                {/* 4. AÇÃO RÁPIDA (BOTAO TESOURA) */}
                <div className="ph-acao">
                    {pendenteFila > 0 ? (
                        <button className="gs-btn-turbo-acao" onClick={handleActionClick} title="Produzir Agora">
                            <i className="fas fa-cut"></i>
                        </button>
                    ) : (
                        <div className="gs-icon-concluido">
                            <i className={`fas ${statusInfo.icone}`} style={{color: statusInfo.cor}}></i>
                        </div>
                    )}
                </div>
            </div>

            {/* --- BARRA PIPELINE --- */}
            <div className="pipeline-bar-container" style={{marginTop: '12px'}}>
                <div className="pipeline-bar">
                    <div className="segmento estoque" style={{width: `${pctEstoque}%`}}></div>
                    <div className="segmento embalagem" style={{width: `${pctEmbalagem}%`}}></div>
                    <div className="segmento acabamento" style={{width: `${pctArremate}%`}}></div>
                    <div className="segmento producao" style={{width: `${pctProducao}%`}}></div>
                    <div className="segmento perda" style={{width: `${pctPerda}%`, backgroundColor: '#e74c3c'}}></div>
                </div>
            </div>

            {/* --- ACCORDION SIMPLIFICADO --- */}
            <div className={`pipeline-conteudo-extra ${expandido ? 'visivel' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="pipeline-legenda">
                    <div className="legenda-item"><span className="dot verde"></span> <span>Estoque: <strong>{emEstoque}</strong></span></div>
                    <div className="legenda-item"><span className="dot laranja"></span> <span>Embalagem: <strong>{emEmbalagem}</strong></span></div>
                    <div className="legenda-item"><span className="dot roxo"></span> <span>Arremate: <strong>{emArremate}</strong></span></div>
                    <div className="legenda-item"><span className="dot azul"></span> <span>Costura: <strong>{emProducao}</strong></span></div>
                    {emPerda > 0 && <div className="legenda-item"><span className="dot" style={{backgroundColor: '#e74c3c'}}></span> <span>Perda: <strong>{emPerda}</strong></span></div>}
                    <div className="legenda-item"><span className="dot cinza"></span> <span>Fila: <strong>{pendenteFila}</strong></span></div>
                </div>
            </div>
        </div>
    );
}