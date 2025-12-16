import React, { useState } from 'react';
import { fetchAPI } from '/js/utils/api-utils.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';

export default function DashCofreModal({ dadosCofre, metaDoDia, pontosHoje, aoResgatarSucesso, onClose }) {
    const [loading, setLoading] = useState(false);
    const [tela, setTela] = useState('resumo'); 
    const [historico, setHistorico] = useState([]);

    if (!dadosCofre) return null;

    const saldo = parseFloat(dadosCofre.saldo || 0);
    const usos = dadosCofre.usos || 0;
    const limiteUsos = 5;
    const resgatesRestantes = Math.max(0, limiteUsos - usos);
    
    // Cálculos de Regra
    const faltaParaMeta = metaDoDia ? Math.max(0, metaDoDia.pontos_meta - pontosHoje) : 0;
    const temSaldoSuficiente = saldo >= faltaParaMeta;
    const temVidas = usos < limiteUsos;
    const podeResgatar = faltaParaMeta > 0 && temSaldoSuficiente && temVidas;

    // --- LÓGICA VISUAL DO PORQUINHO ---
    // A felicidade do porquinho depende exclusivamente do SALDO ACUMULADO.
    // Se tiver saldo para ajudar (mesmo que pouco), ele está feliz.
    const isRico = saldo > 10; // Ex: Consideramos "Rico" se tiver mais de 10 pts guardados
    
    // Bloqueado: É rico, mas não tem vidas.
    const isBloqueado = isRico && !temVidas;

    // Definição das Imagens (Coloque suas URLs reais aqui)
    const imgRico = "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/dashboard_empregados/porquinho_rico.png";
    const imgPobre = "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/dashboard_empregados/porquinho_pobre.png";

    let classeCofre = isRico ? 'ds-cofre-rico' : 'ds-cofre-pobre';
    let imagemAtual = isRico ? imgRico : imgPobre;
    
    if (isBloqueado) {
        classeCofre = 'ds-cofre-bloqueado'; // Visual específico
    }

    // --- FUNÇÕES DE AÇÃO ---
    const handleResgatar = async () => {
        const confirmado = await mostrarConfirmacao(`Usar ${faltaParaMeta} pts do cofre para completar o dia?`);
        if (!confirmado) return;

        setLoading(true);
        try {
            await fetchAPI('/api/dashboard/resgatar-pontos', {
                method: 'POST',
                body: JSON.stringify({ quantidade: faltaParaMeta })
            });
            mostrarMensagem('Resgate realizado com sucesso!', 'sucesso');
            aoResgatarSucesso();
            onClose();
        } catch (error) {
            mostrarMensagem(`Erro: ${error.message}`, 'erro');
        } finally {
            setLoading(false);
        }
    };

    const carregarExtrato = async () => {
        setLoading(true);
        try {
            const dados = await fetchAPI('/api/dashboard/cofre/extrato');
            setHistorico(dados);
            setTela('extrato');
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    const renderVidas = () => {
        const moedas = [];
        for (let i = 0; i < limiteUsos; i++) {
            const gasta = i < usos;
            moedas.push(
                <i key={i} className="fas fa-coins" style={{
                    color: gasta ? '#e0e0e0' : '#ffc107', 
                    fontSize: '1.2rem', margin: '0 2px', 
                    filter: gasta ? 'none' : 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))'
                }}></i>
            );
        }
        return (
            <div style={{marginTop: '10px'}}>
                <div style={{display:'flex', justifyContent:'center', gap:'5px'}}>{moedas}</div>
                <div style={{fontSize: '0.8rem', color: resgatesRestantes > 0 ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-perigo)', marginTop: '5px', fontWeight: '600'}}>
                    {resgatesRestantes > 0 
                        ? `Você ainda tem ${resgatesRestantes} resgates neste ciclo.` 
                        : `Acabaram seus resgates deste ciclo.`
                    }
                </div>
            </div>
        );
    };

    // --- RENDERIZAÇÃO RESUMO ---
    const renderResumo = () => (
        <>
            {/* IMAGEM VIVA COM ESTADOS */}
            <div className={`ds-cofre-container ${classeCofre}`}>
                <img src={imagemAtual} alt="Estado do Cofre" className="ds-cofre-img" />
                {isBloqueado && (
                    <div className="ds-cofre-overlay-icon" title="Bloqueado por limite de usos">
                        <i className="fas fa-lock"></i>
                    </div>
                )}
            </div>
            
             <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', marginBottom:'5px'}}>
                <h2 style={{color: 'var(--ds-cor-azul-escuro)', margin:0}}>Banco de Resgate</h2>
                <button 
                    onClick={() => mostrarMensagem(`
                        <p><strong>Como ganhar pontos para o cofre?</strong></p>
                        <p>Sempre que você bater a <strong>Segunda Meta (Prata)</strong> ou superior, os pontos que sobrarem acima dela serão guardados aqui.</p>
                        <p>Exemplo: Meta Prata é 800. Você fez 850. Você ganha 50 pts no cofre!</p>
                        <p><em>*A Meta Bronze (mínima) não gera sobra.</em></p>
                    `, 'info')}
                    style={{background:'none', border:'none', color:'var(--ds-cor-primaria)', cursor:'pointer', fontSize:'1.2rem'}}
                >
                    <i className="fas fa-info-circle"></i>
                </button>
            </div>
            
            <p style={{color: '#666', fontSize: '0.9rem', marginBottom: '20px'}}>
                Acumule sobras de produção para usar em emergências.
            </p>

            <div style={{backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', marginBottom: '20px'}}>
                <div style={{fontSize: '0.9rem', color: '#666', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'600'}}>Saldo do Cofre</div>
                <div style={{fontSize: '2.5rem', fontWeight: '800', color: isRico ? 'var(--ds-cor-primaria)' : '#666'}}>
                    {Math.round(saldo)} <span style={{fontSize:'1rem'}}>pts</span>
                </div>
                {renderVidas()}
            </div>

            {faltaParaMeta > 0 ? (
                <div style={{marginBottom: '20px'}}>
                    {podeResgatar ? (
                        <button 
                            className="ds-btn-resgate-especial efeito-pulso"
                            disabled={loading}
                            onClick={handleResgatar}
                            style={{width: '100%', padding: '18px', display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}
                        >
                            <i className="fas fa-bolt"></i> USAR RESGATE AGORA
                        </button>
                    ) : (
                        <div style={{backgroundColor: '#fff3cd', borderRadius: '12px', padding: '15px', border: '1px solid #ffeeba', color: '#856404'}}>
                            {usos >= limiteUsos ? (
                                <><div style={{fontWeight: 'bold', marginBottom:'5px'}}><i className="fas fa-ban"></i> Limite Atingido</div><div style={{fontSize:'0.85rem'}}>Aguarde o próximo ciclo.</div></>
                            ) : (
                                <><div style={{fontWeight: 'bold', marginBottom:'5px'}}><i className="fas fa-piggy-bank"></i> Saldo Insuficiente</div><div style={{fontSize:'0.85rem'}}>Faltam {Math.ceil(faltaParaMeta - saldo)} pts.</div></>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div style={{padding: '15px', backgroundColor: '#e6fffa', color: '#2c7a7b', borderRadius: '8px', marginBottom: '20px'}}>
                    <i className="fas fa-check-circle"></i> Parabéns! A meta de hoje já foi batida.
                </div>
            )}

            <button className="ds-btn ds-btn-secundario" style={{width: '100%'}} onClick={carregarExtrato} disabled={loading}>
                Ver Extrato
            </button>
        </>
    );

    // --- RENDERIZAÇÃO EXTRATO (Inalterado, apenas mantendo) ---
    const renderExtrato = () => (
        <div style={{textAlign: 'left'}}>
            <div style={{display:'flex', alignItems:'center', marginBottom:'20px'}}>
                <button onClick={() => setTela('resumo')} className="ds-btn-fechar-painel-padrao" style={{position:'static', marginRight:'15px', backgroundColor:'var(--ds-cor-cinza-claro-fundo)', color:'#666', border:'none'}}><i class="fas fa-arrow-left"></i></button>
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

    return (
        <div className="ds-popup-overlay ativo" onClick={onClose} style={{zIndex: 1200}}>
            <div className="ds-modal-assinatura-content" onClick={e => e.stopPropagation()} style={{textAlign: 'center', padding: '30px', position:'relative', maxWidth:'400px'}}>
                <button className="ds-modal-close-simple" onClick={onClose}><i class="fas fa-times"></i></button>
                {tela === 'resumo' ? renderResumo() : renderExtrato()}
            </div>
        </div>
    );
}