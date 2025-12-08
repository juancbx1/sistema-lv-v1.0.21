// public/src/components/BotaoBuscaPipelineProducao.jsx

import React from 'react';
import { mostrarConfirmacao } from '/js/utils/popups.js';

export default function CardPipelineProducao({ item, onPlanejar, onDelete, permissoes }) { // Recebe onDelete
    const totalPedido = item.demanda_total || 0;
    
    const emProducao = item.saldo_em_producao || 0;
    const emArremate = item.saldo_disponivel_arremate || 0;
    const emEmbalagem = item.saldo_disponivel_embalagem || 0;
    const emEstoque = item.saldo_disponivel_estoque || 0;
    const emPerda = item.saldo_perda || 0; // <--- NOVO
    
    // Fila é o que sobrou depois de descontar tudo (incluindo a perda, pois a tentativa já foi feita)
    const totalConsumido = emProducao + emArremate + emEmbalagem + emEstoque + emPerda;
    const pendenteFila = Math.max(0, totalPedido - totalConsumido);

    const pctEstoque = Math.min(100, (emEstoque / totalPedido) * 100);
    const pctEmbalagem = Math.min(100, (emEmbalagem / totalPedido) * 100);
    const pctArremate = Math.min(100, (emArremate / totalPedido) * 100);
    const pctProducao = Math.min(100, (emProducao / totalPedido) * 100);
    const pctPerda = Math.min(100, (emPerda / totalPedido) * 100); // <--- NOVO

    // Função de deletar com confirmação
    const handleDeleteClick = async (e) => {
        e.stopPropagation();
        const confirmado = await mostrarConfirmacao(
            `Tem certeza que deseja apagar a demanda de "${item.produto_nome}"? Isso não apaga as OPs já criadas, apenas remove o pedido da lista.`,
            { tipo: 'perigo', textoConfirmar: 'Apagar', textoCancelar: 'Cancelar' }
        );
        if (confirmado && onDelete) {
            onDelete(item.demanda_id);
        }
    };

    // Inteligência de Status
    const getFeedbackStatus = () => {
        if (emEstoque >= totalPedido) return {
            titulo: "Demanda 100% Concluída!", subtitulo: "Disponível no estoque.",
            corFundo: "#eafaf1", corTexto: "#27ae60", icone: "fa-check-circle"
        };

        // Caso Especial: Divergência, mas ainda rodando
        if (emPerda > 0 && pendenteFila === 0 && emEstoque < totalPedido && (emArremate > 0 || emEmbalagem > 0)) {
             return {
                titulo: "Atenção: Quebra Detectada",
                subtitulo: `${emPerda} peças perdidas. Acompanhe o restante (${emArremate + emEmbalagem} pçs) no fluxo.`,
                corFundo: "#fff5f5", corTexto: "#c0392b", icone: "fa-exclamation-triangle"
            };
        }

        // Caso: Encerrado com Divergência (Só aparece se tudo zerar)
        if (emPerda > 0 && pendenteFila === 0 && emEstoque < totalPedido && emArremate === 0 && emEmbalagem === 0 && emProducao === 0) {
             return {
                titulo: "Encerrado com Divergência",
                subtitulo: `${emPerda} peças foram perdidas/canceladas. Demanda incompleta.`,
                corFundo: "#fff5f5", corTexto: "#c0392b", icone: "fa-exclamation-triangle"
            };
        }
        
        // Se a perda for significativa, avisa
        if (emPerda > 0 && pendenteFila === 0 && emEstoque < totalPedido) {
             return {
                titulo: "Encerrado com Divergência",
                subtitulo: `${emPerda} peças foram perdidas/canceladas. Demanda incompleta.`,
                corFundo: "#fff5f5", corTexto: "#c0392b", icone: "fa-exclamation-triangle"
            };
        }
        if (emProducao === 0 && emArremate === 0 && emEmbalagem > 0) return {
            titulo: "Reta Final: Embalagem", subtitulo: `Faltam embalar ${emEmbalagem} peças.`,
            corFundo: "#fff5e6", corTexto: "#e67e22", icone: "fa-box-open"
        };
        if (emArremate > (totalPedido * 0.4)) return {
            titulo: "Gargalo no Arremate", subtitulo: `${emArremate} peças aguardam.`,
            corFundo: "#f4ecf7", corTexto: "#8e44ad", icone: "fa-exclamation-circle"
        };
        if (emProducao > 0) return {
            titulo: "Produção em Andamento", subtitulo: "Costura ativa.",
            corFundo: "#ebf5fb", corTexto: "#2980b9", icone: "fa-cut"
        };
        return {
            titulo: "Aguardando", subtitulo: "Fluxo inicial.",
            corFundo: "#f8f9fa", corTexto: "#7f8c8d", icone: "fa-clock"
        };
    };

    const statusInfo = getFeedbackStatus();

    return (
        <div className="gs-pipeline-card" style={{position: 'relative'}}>
            {/* BOTÃO DE DELETAR (LIXEIRA) */}
            {permissoes.includes('deletar-demanda') && (
        <button onClick={handleDeleteClick}
                style={{
                    position: 'absolute', top: '10px', right: '10px',
                    background: 'none', border: 'none', color: '#ccc',
                    cursor: 'pointer', fontSize: '1rem', padding: '5px'
                }}
                title="Apagar Demanda"
                onMouseOver={(e) => e.currentTarget.style.color = '#c0392b'}
                onMouseOut={(e) => e.currentTarget.style.color = '#ccc'}
            >
                <i className="fas fa-trash"></i>
            </button>
            )}

            <div className="pipeline-header" >
                <div className="produto-info">
                    <img src={item.imagem || '/img/placeholder-image.png'} alt={item.produto_nome} />
                    <div>
                        <h4>{item.produto_nome}</h4>
                        <span>{item.variacao || 'Padrão'}</span>
                        <div style={{fontSize: '0.75rem', color: '#aaa', marginTop: '2px'}}>Pedido Original: <strong>{totalPedido}</strong></div>
                    </div>
                </div>
                
                <div className="total-pedido" style={{
                    backgroundColor: pendenteFila > 0 ? '#fff5f5' : '#f8f9fa',
                    border: pendenteFila > 0 ? '1px solid #fadbd8' : '1px solid #eee'
                }}>
                    <span className="label" style={{color: pendenteFila > 0 ? '#c0392b' : '#7f8c8d'}}>
                        {pendenteFila > 0 ? 'Falta Iniciar' : 'Meta Total'}
                    </span>
                    <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '5px'}}>
                        <span className="valor" style={{color: pendenteFila > 0 ? '#c0392b' : '#2c3e50'}}>
                            {pendenteFila > 0 ? pendenteFila : totalPedido}
                        </span>
                        {pendenteFila > 0 && <span style={{fontSize: '0.75rem', color: '#aaa', fontWeight: 'normal'}}>de {totalPedido}</span>}
                    </div>
                </div>
            </div>

            <div className="pipeline-bar-container">
                <div className="pipeline-bar">
                    <div className="segmento estoque" style={{width: `${pctEstoque}%`}} title={`Estoque: ${emEstoque}`}></div>
                    <div className="segmento embalagem" style={{width: `${pctEmbalagem}%`}} title={`Embalagem: ${emEmbalagem}`}></div>
                    <div className="segmento acabamento" style={{width: `${pctArremate}%`}} title={`Arremate: ${emArremate}`}></div>
                    <div className="segmento producao" style={{width: `${pctProducao}%`}} title={`Costura: ${emProducao}`}></div>
                    {/* BARRA DE PERDA (VERMELHA) */}
                    <div className="segmento perda" style={{width: `${pctPerda}%`, backgroundColor: '#e74c3c'}} title={`Perda/Quebra: ${emPerda}`}></div>
                </div>
                
                <div className="pipeline-legenda">
                    <div className="legenda-item"><span className="dot verde"></span> <span>Estoque: <strong>{emEstoque}</strong></span></div>
                    <div className="legenda-item"><span className="dot laranja"></span> <span>Embalagem: <strong>{emEmbalagem}</strong></span></div>
                    <div className="legenda-item"><span className="dot roxo"></span> <span>Arremate: <strong>{emArremate}</strong></span></div>
                    <div className="legenda-item"><span className="dot azul"></span> <span>Costura: <strong>{emProducao}</strong></span></div>
                    {/* LEGENDA DE PERDA */}
                    {emPerda > 0 && (
                        <div className="legenda-item"><span className="dot" style={{backgroundColor: '#e74c3c'}}></span> <span>Quebra: <strong>{emPerda}</strong></span></div>
                    )}
                    <div className="legenda-item"><span className="dot cinza"></span> <span>Fila: <strong>{pendenteFila}</strong></span></div>
                </div>
            </div>

            <div className="pipeline-footer">
                {pendenteFila > 0 ? (
                    <button 
                        className="gs-btn gs-btn-primario full-width"
                        onClick={() => onPlanejar(item, pendenteFila)} 
                    >
                        <i className="fas fa-cut"></i> Mandar P/ Produção ({pendenteFila} pçs)
                    </button>
                ) : (
                    <div 
                        className="status-dinamico"
                        style={{
                            backgroundColor: statusInfo.corFundo, color: statusInfo.corTexto,
                            padding: '12px', borderRadius: '6px', textAlign: 'center',
                            border: `1px solid ${statusInfo.corTexto}20`
                        }}
                    >
                        <div style={{fontWeight: '700', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}>
                            <i className={`fas ${statusInfo.icone}`}></i> {statusInfo.titulo}
                        </div>
                        <div style={{fontSize: '0.8rem', marginTop: '4px', opacity: 0.9}}>{statusInfo.subtitulo}</div>
                    </div>
                )}
            </div>
        </div>
    );
}