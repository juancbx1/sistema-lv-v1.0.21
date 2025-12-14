import React, { useState } from 'react';
import { fetchAPI } from '/js/utils/api-utils.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';

export default function DashCofreModal({ dadosCofre, metaDoDia, pontosHoje, aoResgatarSucesso, onClose }) {
    const [loading, setLoading] = useState(false);
    const [tela, setTela] = useState('resumo'); 
    const [historico, setHistorico] = useState([]);
    const [celebrando, setCelebrando] = useState(false); // Estado para controlar o confete

    if (!dadosCofre) return null;

    const saldo = parseFloat(dadosCofre.saldo || 0);
    const usos = dadosCofre.usos || 0;
    const limiteUsos = 5;
    
    const faltaParaMeta = metaDoDia ? Math.max(0, metaDoDia.pontos_meta - pontosHoje) : 0;
    const podeResgatar = faltaParaMeta > 0 && saldo >= faltaParaMeta && usos < limiteUsos;

    // Usando um placeholder transparente por enquanto se não tiver a imagem
    const gifConfeteUrl = "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/dashboard_empregados/confetti_pop_2.gif"; // Exemplo online

    const handleResgatar = async () => {
        const confirmado = await mostrarConfirmacao(`Usar ${faltaParaMeta} pts do cofre para completar o dia?`);
        if (!confirmado) return;

        setLoading(true);
        try {
            await fetchAPI('/api/dashboard/resgatar-pontos', {
                method: 'POST',
                body: JSON.stringify({ quantidade: faltaParaMeta })
            });
            
            // --- INÍCIO DA CELEBRAÇÃO ---
            setLoading(false);
            setCelebrando(true); // Ativa o GIF
            
            // Toca um som se quiser (opcional)
            // const audio = new Audio('/sounds/success.mp3'); audio.play();

            // Espera 3 segundos curtindo o momento
            setTimeout(() => {
                setCelebrando(false);
                aoResgatarSucesso(); // Atualiza os dados da dashboard
                onClose(); // Fecha o modal
                mostrarMensagem('Meta batida com sucesso! Muito bem!!', 'sucesso');
            }, 3000);
            
        } catch (error) {
            mostrarMensagem(`Erro: ${error.message}`, 'erro');
            setLoading(false);
        }
    };

    // --- RENDERIZAÇÃO DAS VIDAS (MOEDAS) ---
    const renderVidas = () => {
        const moedas = [];
        for (let i = 0; i < limiteUsos; i++) {
            // Se i < usos, a moeda já foi gasta (Cinza)
            // Se i >= usos, a moeda está disponível (Dourada)
            const gasta = i < usos;
            moedas.push(
                <i key={i} 
                   className="fas fa-coins" 
                   title={gasta ? "Uso gasto" : "Uso disponível"}
                   style={{
                       color: gasta ? '#e0e0e0' : '#ffc107', // Cinza vs Dourado
                       fontSize: '1.2rem',
                       margin: '0 2px',
                       filter: gasta ? 'none' : 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))'
                   }}
                ></i>
            );
        }
        return (
            <div style={{marginTop: '5px', display:'flex', justifyContent:'center', gap:'5px'}}>
                {moedas}
            </div>
        );
    };

    const carregarExtrato = async () => {
        setLoading(true);
        try {
            const dados = await fetchAPI('/api/dashboard/cofre/extrato');
            setHistorico(dados);
            setTela('extrato');
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const imgPorquinho = "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/dashboard_empregados/porquinho_dashboard.png"; 

    // --- TELA EXTRATO (Sem alterações de lógica, só mantendo) ---
    const renderExtrato = () => (
        <div style={{textAlign: 'left'}}>
            <div style={{display:'flex', alignItems:'center', marginBottom:'20px'}}>
                <button onClick={() => setTela('resumo')} className="ds-btn-fechar-painel-padrao" style={{position:'static', marginRight:'15px', backgroundColor:'var(--ds-cor-cinza-claro-fundo)', color:'#666', border:'none'}}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h3 style={{margin:0, color:'var(--ds-cor-azul-escuro)'}}>Extrato</h3>
            </div>
            <div style={{maxHeight:'300px', overflowY:'auto', borderTop:'1px solid #eee'}}>
                {historico.length === 0 ? <p style={{padding:'20px', textAlign:'center', color:'#999'}}>Vazio.</p> : 
                    historico.map((item, idx) => (
                        <div key={idx} style={{padding: '12px 0', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between'}}>
                            <div>
                                <div style={{fontWeight:'600', fontSize:'0.9rem'}}>{item.descricao}</div>
                                <div style={{fontSize:'0.75rem', color:'#999'}}>{new Date(item.data_evento).toLocaleDateString('pt-BR')}</div>
                            </div>
                            <div style={{fontWeight:'700', color: item.tipo === 'GANHO' ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-perigo)'}}>
                                {item.tipo === 'GANHO' ? '+' : '-'}{Math.round(item.quantidade)}
                            </div>
                        </div>
                    ))
                }
            </div>
        </div>
    );

   // --- Renderização do Resumo (COM O NOVO BOTÃO) ---
    const renderResumo = () => (
        <>
            <img src={imgPorquinho} alt="Cofre" style={{width:'80px', height:'80px', borderRadius:'50%', margin: '0 auto 10px auto', boxShadow: '0 4px 10px rgba(0,0,0,0.1)'}} />
            
            <div style={{backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', marginBottom: '20px'}}>
                <div style={{fontSize: '0.9rem', color: '#666', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'600'}}>Saldo do Cofre</div>
                <div style={{fontSize: '2.2rem', fontWeight: '800', color: 'var(--ds-cor-primaria)'}}>
                    {Math.round(saldo)}
                </div>
                {renderVidas()}
            </div>

            {faltaParaMeta > 0 ? (
                <div style={{marginBottom: '20px'}}>
                    {podeResgatar ? (
                        <div>
                            <p style={{color: '#666', marginBottom: '15px', fontSize:'0.9rem'}}>
                                Use seu saldo para cobrir os <strong>{faltaParaMeta} pts</strong> faltantes.
                            </p>
                            
                            {/* O BOTÃO ESPECIAL */}
                            <button 
                                className="ds-btn-resgate-especial efeito-pulso"
                                disabled={loading}
                                onClick={handleResgatar}
                                style={{width: '100%', padding: '18px', display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}
                            >
                                <i className="fas fa-bolt"></i> USAR RESGATE AGORA
                            </button>

                        </div>
                    ) : (
                        <div style={{backgroundColor: '#fff3cd', borderRadius: '12px', padding: '15px', border: '1px solid #ffeeba', color: '#856404'}}>
                            {usos >= limiteUsos ? (
                                <><div style={{fontWeight: 'bold', marginBottom:'5px'}}><i className="fas fa-ban"></i> Limite Atingido</div><div style={{fontSize:'0.85rem'}}>Ciclo encerrado.</div></>
                            ) : (
                                <><div style={{fontWeight: 'bold', marginBottom:'5px'}}><i className="fas fa-piggy-bank"></i> Saldo Insuficiente</div><div style={{fontSize:'0.85rem'}}>Junte mais pontos!</div></>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div style={{padding: '15px', backgroundColor: '#e6fffa', color: '#2c7a7b', borderRadius: '8px', marginBottom: '20px'}}>
                    <i className="fas fa-check-circle"></i> Meta de hoje já batida!
                </div>
            )}

            <button className="ds-btn ds-btn-secundario" style={{width: '100%'}} onClick={carregarExtrato} disabled={loading}>
                Ver Extrato
            </button>
        </>
    );

    return (
        <>
            {/* OVERLAY DE CONFETE (Fora do container do modal para cobrir a tela toda) */}
            <div className={`ds-confete-overlay ${celebrando ? 'ativo' : ''}`}>
                <img src={gifConfeteUrl} alt="Celebração" className="ds-confete-img" />
            </div>

            <div className="ds-popup-overlay ativo" onClick={!celebrando ? onClose : undefined} style={{zIndex: 1200, opacity: celebrando ? 0 : 1, transition: 'opacity 0.5s'}}>
                <div className="ds-modal-assinatura-content" onClick={e => e.stopPropagation()} style={{textAlign: 'center', padding: '30px', position:'relative', maxWidth:'400px'}}>
                    <button className="ds-modal-close-simple" onClick={onClose} disabled={celebrando}>
                        <i className="fas fa-times"></i>
                    </button>
                    {tela === 'resumo' ? renderResumo() : renderExtrato()}
                </div>
            </div>
        </>
    );
}