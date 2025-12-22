import React, { useState } from 'react';
import { fetchAPI } from '/js/utils/api-utils.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';

// ADICIONADA A PROP 'metaMinima' NA ASSINATURA DA FUNÇÃO
export default function DashCofreModal({ dadosCofre, metaDoDia, pontosHoje, metaMinima, aoResgatarSucesso, onClose }) {
    const [loading, setLoading] = useState(false);
    const [tela, setTela] = useState('resumo'); 
    const [historico, setHistorico] = useState([]);
    const [paginaExtrato, setPaginaExtrato] = useState(1);
    const [temMaisExtrato, setTemMaisExtrato] = useState(false);

    if (!dadosCofre) return null;

    const saldo = parseFloat(dadosCofre.saldo || 0);
    const usos = dadosCofre.usos || 0;
    const limiteUsos = 5;
    const resgatesRestantes = Math.max(0, limiteUsos - usos);
    
    // --- CÁLCULOS DE REGRA ---
    
    // 1. Quanto falta?
    const faltaParaMeta = metaDoDia ? Math.max(0, metaDoDia.pontos_meta - pontosHoje) : 0;
    
    // 2. Tem Saldo?
    const temSaldoSuficiente = saldo >= faltaParaMeta;
    
    // 3. Tem Vidas?
    const temVidas = usos < limiteUsos;

    // 4. Anti-Fraude: Produção Mínima (50% da Meta Bronze/Mínima)
    const pontosMinimosNecessarios = metaMinima ? Math.round(metaMinima.pontos_meta * 0.5) : 0;
    const temProducaoMinima = pontosHoje >= pontosMinimosNecessarios;

    // CONDIÇÃO FINAL PARA O BOTÃO
    const podeResgatar = faltaParaMeta > 0 && temSaldoSuficiente && temVidas && temProducaoMinima;


    // --- LÓGICA VISUAL DO PORQUINHO ---
    const isRico = saldo > 10; 
    const isBloqueado = isRico && (!temVidas || !temProducaoMinima); // Bloqueado se rico mas sem vida ou sem produção mínima

    const imgRico = "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/dashboard_empregados/porquinho_rico.png";
    const imgPobre = "https://ock3xwuhzid9sows.public.blob.vercel-storage.com/dashboard_empregados/porquinho_pobre.png";

    let classeCofre = isRico ? 'ds-cofre-rico' : 'ds-cofre-pobre';
    let imagemAtual = isRico ? imgRico : imgPobre;
    
    if (isBloqueado) {
        classeCofre = 'ds-cofre-bloqueado';
    }

    // --- AÇÕES ---
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

     // Função para carregar (ou carregar mais)
    const carregarExtrato = async (reset = true) => {
        setLoading(true);
        try {
            const pg = reset ? 1 : paginaExtrato + 1;
            const dados = await fetchAPI(`/api/dashboard/cofre/extrato?page=${pg}&limit=8`);
            
            if (reset) {
                setHistorico(dados.rows);
            } else {
                setHistorico(prev => [...prev, ...dados.rows]);
            }
            
            setPaginaExtrato(pg);
            setTemMaisExtrato(pg < dados.pagination.totalPages);
            
            if (reset) setTela('extrato'); // Só muda de tela se for a primeira carga
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Função auxiliar para calcular o saldo histórico reverso
    // Função auxiliar para calcular o saldo histórico reverso
    const itensComSaldo = (() => {
        let saldoVolatil = saldo; // Saldo ATUAL do usuário (do banco)
        let encontrouReset = false;

        return historico.map(item => {
            // Se já passamos por um reset (estamos no passado profundo), paramos de calcular saldo
            if (encontrouReset) {
                return { ...item, saldoApos: null }; // Null indica para não exibir
            }

            const qtd = parseFloat(item.quantidade);
            const isGanho = item.tipo === 'GANHO';
            const isReset = item.tipo === 'RESET';
            
            if (isReset) {
                encontrouReset = true; // Marca que achamos a barreira do ciclo
                return { ...item, saldoApos: 0 }; // No momento do reset, o saldo era 0
            }

            // O saldo DEPOIS dessa operação (linha atual) é o saldoVolatil atual
            const saldoMomento = saldoVolatil;
            
            // Prepara para a próxima linha (passado)
            // Desfazemos a operação para descobrir quanto tinha ANTES
            if (isGanho) saldoVolatil -= qtd;
            else if (item.tipo === 'RESGATE') saldoVolatil += qtd;
            
            return { ...item, saldoApos: saldoMomento };
        });
    })();

    // --- RENDERIZADORES ---

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

    const renderResumo = () => (
        <>
            {/* IMAGEM VIVA COM ESTADOS */}
            <div className={`ds-cofre-container ${classeCofre}`}>
                <img src={imagemAtual} alt="Estado do Cofre" className="ds-cofre-img" />
                {isBloqueado && (
                    <div className="ds-cofre-overlay-icon" title="Bloqueado">
                        <i className="fas fa-lock"></i>
                    </div>
                )}
            </div>
            
            {/* TÍTULO COM TOOLTIP */}
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
            
            <p style={{color: '#666', fontSize: '0.7rem', marginBottom: '10px'}}>
                Acumule pontos excedentes de produção para usar em dias que sua produção foi menor.
            </p>

            <div style={{backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', marginBottom: '10px'}}>
                <div style={{fontSize: '0.9rem', color: '#666', textTransform:'uppercase', letterSpacing:'1px', fontWeight:'600'}}>Saldo do Cofre</div>
                <div style={{fontSize: '2.5rem', fontWeight: '800', color: isRico ? 'var(--ds-cor-primaria)' : '#666'}}>
                    {Math.round(saldo)} <span style={{fontSize:'1rem'}}>pts</span>
                </div>
                {renderVidas()}
            </div>

            {/* ÁREA DE AÇÃO / FEEDBACK */}
            {faltaParaMeta > 0 ? (
                <div style={{marginBottom: '20px'}}>
                    
                    {podeResgatar ? (
                        // CENÁRIO 1: TUDO CERTO PARA RESGATAR
                         <button 
                            className="ds-btn-resgate-especial efeito-pulso"
                            disabled={loading}
                            onClick={handleResgatar}
                            style={{width: '100%', padding: '18px', display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}
                        >
                            <i className="fas fa-bolt"></i> USAR RESGATE AGORA
                        </button>
                    ) : (
                        // CENÁRIO 2: BLOQUEADO (MENSAGENS ESPECÍFICAS SEM REPETIÇÃO)
                        <div style={{
                            backgroundColor: '#fff3cd', 
                            borderRadius: '12px', 
                            padding: '15px', 
                            border: '1px solid #ffeeba',
                            color: '#856404',
                            textAlign: 'left'
                        }}>
                            {!temProducaoMinima ? (
                                // A. BLOQUEIO ANTI-FRAUDE
                                <>
                                    <div style={{fontWeight: 'bold', marginBottom:'5px', color:'#d35400'}}>
                                        <i className="fas fa-lock"></i> Produção Mínima Necessária
                                    </div>
                                    <div style={{fontSize:'0.85rem'}}>
                                        Para usar o cofre, você precisa produzir pelo menos <strong>{pontosMinimosNecessarios} pts</strong> hoje (50% da Meta Bronze).
                                    </div>
                                </>
                            ) : usos >= limiteUsos ? (
                                // B. BLOQUEIO DE VIDAS
                                <>
                                    <div style={{fontWeight: 'bold', marginBottom:'5px'}}><i className="fas fa-ban"></i> Limite Atingido</div>
                                    <div style={{fontSize:'0.85rem'}}>Você já usou seus 5 resgates neste ciclo.</div>
                                </>
                            ) : (
                                // C. BLOQUEIO DE SALDO (Sem repetir números)
                                <>
                                    <div style={{fontWeight: 'bold', marginBottom:'5px'}}><i className="fas fa-piggy-bank"></i> Saldo Insuficiente</div>
                                    <div style={{fontSize:'0.85rem'}}>
                                        Seu saldo atual não cobre a falta de hoje. Tente produzir um pouco mais!
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                // CENÁRIO 3: META JÁ BATIDA
                <div style={{padding: '15px', backgroundColor: '#e6fffa', color: '#2c7a7b', borderRadius: '8px', marginBottom: '20px'}}>
                    <i className="fas fa-check-circle"></i> Parabéns! A meta de hoje já foi batida.
                </div>
            )}

            <button className="ds-btn ds-btn-secundario" style={{width: '100%'}} onClick={carregarExtrato} disabled={loading}>
                Ver Extrato
            </button>
        </>
    );

    const renderExtrato = () => (
        <div style={{textAlign: 'left'}}>
            <div style={{display:'flex', alignItems:'center', marginBottom:'20px'}}>
                <button onClick={() => setTela('resumo')} className="ds-btn-fechar-painel-padrao" style={{position:'static', marginRight:'15px', backgroundColor:'var(--ds-cor-cinza-claro-fundo)', color:'#666', border:'none'}}><i class="fas fa-arrow-left"></i></button>
                <h3 style={{margin:0, color:'var(--ds-cor-azul-escuro)'}}>Extrato</h3>
            </div>
            
            <div style={{maxHeight:'400px', overflowY:'auto', borderTop:'1px solid #eee', paddingRight:'5px'}}>
                {itensComSaldo.length === 0 ? <p style={{padding:'20px', textAlign:'center', color:'#999'}}>Vazio.</p> : 
                    itensComSaldo.map((item, idx) => {
                        const isGanho = item.tipo === 'GANHO';
                        const isReset = item.tipo === 'RESET';
                        
                        if (isReset) {
                            return (
                                <div key={idx} style={{
                                    backgroundColor: '#e3f2fd', 
                                    padding: '15px', 
                                    borderRadius: '8px', 
                                    margin: '10px 0', 
                                    textAlign: 'center',
                                    color: '#0d47a1',
                                    fontSize: '0.9rem',
                                    border: '1px solid #bbdefb'
                                }}>
                                    <i className="fas fa-calendar-check" style={{fontSize:'1.2rem', marginBottom:'5px', display:'block'}}></i>
                                    <strong>Novo Ciclo</strong>
                                    <div style={{fontSize:'0.8rem', marginTop:'3px'}}>Saldo Zerado: Novo ciclo iniciado!</div>
                                    <div style={{fontSize:'0.7rem', opacity: 0.7, marginTop:'5px'}}>{new Date(item.data_evento).toLocaleDateString('pt-BR')}</div>
                                </div>
                            );
                        }

                        return (
                            <div key={idx} style={{padding: '15px 0', borderBottom: '1px solid #eee'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                    <div>
                                        <div style={{fontWeight:'600', fontSize:'0.9rem', color:'#333', marginBottom:'4px'}}>{item.descricao}</div>
                                        <div style={{fontSize:'0.75rem', color:'#999'}}>
                                            {new Date(item.data_evento).toLocaleDateString('pt-BR')} às {new Date(item.data_evento).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                    <div style={{
                                        fontWeight:'700', 
                                        color: isGanho ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-perigo)',
                                        textAlign: 'right'
                                    }}>
                                        <div>{isGanho ? '+' : '-'}{Math.round(item.quantidade)}</div>
                                    </div>
                                </div>
                                
                                {/* LINHA DE SALDO APÓS A OPERAÇÃO */}
                                {/* Só mostra se saldoApos não for null */}
                                {item.saldoApos !== null && (
                                    <div style={{
                                        marginTop: '8px', 
                                        paddingTop: '8px', 
                                        borderTop: '1px dashed #eee', 
                                        display: 'flex', 
                                        justifyContent: 'space-between',
                                        color: '#666',
                                        fontSize: '0.8rem'
                                    }}>
                                        <span>Saldo Disponível:</span>
                                        <strong>{Math.round(item.saldoApos)} pts</strong>
                                    </div>
                                )}
                            </div>
                        );
                    })
                }
                
                {/* BOTÃO CARREGAR MAIS */}
                {temMaisExtrato && (
                    <button 
                        onClick={() => carregarExtrato(false)} 
                        className="ds-btn ds-btn-secundario" 
                        style={{width: '100%', marginTop: '15px'}}
                        disabled={loading}
                    >
                        {loading ? 'Carregando...' : 'Carregar Mais Antigos'}
                    </button>
                )}
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