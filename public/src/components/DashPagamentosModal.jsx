import React, { useState, useEffect } from 'react';
import { fetchAPI } from '/js/utils/api-utils';
import { getDataPagamentoEstimada } from '/js/utils/periodos-fiscais';

// Recebe a nova prop 'pagamentoPendente'
export default function DashPagamentosModal({ pagamentoPendente, onClose }) {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const carregar = async () => {
            try {
                const dados = await fetchAPI('/api/dashboard/meus-pagamentos');
                setHistorico(dados);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        carregar();
    }, []);

    // Se não tiver pendente (ex: já pagou ou usuário novo), mostra zerado ou busca o próximo
    const valorExibir = pagamentoPendente ? pagamentoPendente.valor : 0.00;
    const dataExibir = pagamentoPendente ? pagamentoPendente.data : '--/--/----';
    const periodoExibir = pagamentoPendente ? pagamentoPendente.periodo : 'Nenhum ciclo fechado';

    return (
        <div className="ds-popup-overlay ativo" onClick={onClose} style={{zIndex: 1400}}>
            <div className="ds-modal-assinatura-content" onClick={e => e.stopPropagation()} style={{textAlign: 'center', padding: '30px', position:'relative', maxWidth:'450px'}}>
                
                <button className="ds-modal-close-simple" onClick={onClose}><i class="fas fa-times"></i></button>

                <h2 style={{color: 'var(--ds-cor-azul-escuro)', marginBottom: '25px'}}>PRÓXIMO PAGAMENTO</h2>
                
                {/* CARD DE PRÓXIMO PAGAMENTO (FECHADO) */}
                <div style={{
                    background: 'linear-gradient(135deg, #007bff 0%, #0062cc 100%)',
                    borderRadius: '15px',
                    padding: '20px',
                    color: '#fff',
                    marginBottom: '30px',
                    boxShadow: '0 5px 15px rgba(0, 123, 255, 0.3)',
                    textAlign: 'left'
                }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <div>
                            <div style={{fontSize:'0.8rem', opacity: 0.8, textTransform:'uppercase', letterSpacing:'1px', marginBottom:'2px'}}>Pagamento Estimado</div>
                            <div style={{fontSize:'2.2rem', fontWeight:'700', lineHeight:'1'}}>
                                R$ {valorExibir.toFixed(2)}
                            </div>
                        </div>
                        <i className="fas fa-money-bill-wave" style={{fontSize:'2rem', opacity:0.3}}></i>
                    </div>

                    <div style={{marginTop:'20px', paddingTop:'15px', borderTop:'1px solid rgba(255,255,255,0.2)', fontSize:'0.85rem'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px'}}>
                            <span style={{opacity:0.8}}>Data Prevista:</span>
                            <strong style={{fontSize:'1rem'}}>{dataExibir}</strong>
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between'}}>
                            <span style={{opacity:0.8}}>Ref. Ciclo:</span>
                            <span>{periodoExibir}</span>
                        </div>
                    </div>
                </div>

                {/* LISTA DE HISTÓRICO (Igual ao anterior) */}
                <h3 style={{textAlign:'left', fontSize:'1.1rem', color:'#666', borderBottom:'1px solid #eee', paddingBottom:'10px', marginBottom:'15px'}}>
                    Pagamentos Realizados
                </h3>

                <div style={{maxHeight:'250px', overflowY:'auto'}}>
                    {loading ? <div className="ds-spinner"></div> : 
                        historico.length === 0 ? <p style={{color:'#999', padding:'20px'}}>Nenhum pagamento anterior encontrado.</p> :
                        historico.map((pgto, idx) => (
                            <div key={idx} style={{
                                display:'flex', justifyContent:'space-between', alignItems:'center',
                                padding: '15px 0', borderBottom:'1px dashed #eee'
                            }}>
                                <div style={{textAlign:'left'}}>
                                    <div style={{fontWeight:'600', color:'#333'}}>{pgto.ciclo_nome || pgto.descricao}</div>
                                    <div style={{fontSize:'0.8rem', color:'#999'}}>
                                        Pago em: {new Date(pgto.data_pagamento).toLocaleDateString('pt-BR')}
                                    </div>
                                </div>
                                <div style={{textAlign:'right'}}>
                                    <div style={{fontWeight:'700', color:'var(--ds-cor-sucesso)', fontSize:'1.1rem'}}>
                                        R$ {parseFloat(pgto.valor_liquido_pago).toFixed(2)}
                                    </div>
                                    <div style={{fontSize:'0.7rem', color:'var(--ds-cor-sucesso)', backgroundColor:'#e8f5e9', padding:'2px 6px', borderRadius:'4px', display:'inline-block', marginTop:'4px'}}>
                                        CONCLUÍDO
                                    </div>
                                </div>
                            </div>
                        ))
                    }
                </div>

            </div>
        </div>
    );
}