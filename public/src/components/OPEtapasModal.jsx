// public/src/components/OPEtapasModal.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js'; 

async function fetchAPI(url, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(url, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` }));
    throw new Error(errorData.error);
  }
  return response.json();
}

// --- SUBCOMPONENTE: Linha de Detalhe da Etapa ---
const EtapaAccordion = ({ etapa, index, op, lancamentos, usuariosMap }) => {
    const [expandido, setExpandido] = useState(false);

    const lancamentosDaEtapa = lancamentos.filter(l => l.etapa_index === index);
    const totalProduzido = lancamentosDaEtapa.reduce((sum, l) => sum + l.quantidade, 0);
    const metaTotal = op.quantidade;
    const progresso = Math.min(100, Math.round((totalProduzido / metaTotal) * 100));

    let corBarra = '#3498db'; // Azul
    if (progresso >= 100) corBarra = '#27ae60'; // Verde
    else if (totalProduzido === 0) corBarra = '#ecf0f1'; // Cinza

    return (
        <div className="op-etapa-accordion" style={{marginBottom: '10px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden'}}>
            <div 
                className="etapa-header" 
                onClick={() => setExpandido(!expandido)}
                style={{
                    padding: '12px 15px', backgroundColor: '#f8f9fa', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
            >
                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <div style={{
                        width: '24px', height: '24px', borderRadius: '50%', 
                        backgroundColor: corBarra, color: '#fff', fontSize: '0.8rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
                    }}>
                        {index + 1}
                    </div>
                    <div>
                        <strong style={{fontSize: '0.95rem', color: '#2c3e50'}}>{etapa.processo}</strong>
                        <div style={{fontSize: '0.8rem', color: '#7f8c8d'}}>
                            {totalProduzido} de {metaTotal} peças ({progresso}%)
                        </div>
                    </div>
                </div>
                <i className={`fas fa-chevron-${expandido ? 'up' : 'down'}`} style={{color: '#ccc'}}></i>
            </div>

            <div style={{height: '4px', width: '100%', backgroundColor: '#eee'}}>
                <div style={{height: '100%', width: `${progresso}%`, backgroundColor: corBarra, transition: 'width 0.3s'}}></div>
            </div>

            {expandido && (
                <div className="etapa-body" style={{padding: '15px'}}>
                    {lancamentosDaEtapa.length > 0 ? (
                        <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                            {lancamentosDaEtapa.map(lanc => {
                                // Busca o avatar no mapa usando o nome (ou ID se disponível)
                                const user = usuariosMap.get(lanc.funcionario);
                                const avatarUrl = user?.avatar_url || '/img/placeholder-image.png'; // Avatar padrão se não achar
                                
                                return (
                                    <li key={lanc.id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0',
                                        borderBottom: '1px dashed #eee', fontSize: '0.9rem'
                                    }}>
                                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                            <img 
                                                src={avatarUrl} 
                                                alt={lanc.funcionario} 
                                                style={{width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #ddd'}}
                                            />
                                            <span style={{fontWeight: '500', color: '#555'}}>{lanc.funcionario}</span>
                                        </div>
                                        <div style={{textAlign: 'right'}}>
                                            <strong style={{color: '#2c3e50'}}>{lanc.quantidade} pçs</strong>
                                            <div style={{fontSize: '0.75rem', color: '#aaa'}}>
                                                {new Date(lanc.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p style={{color: '#aaa', fontStyle: 'italic', fontSize: '0.9rem', textAlign: 'center', margin: '10px 0'}}>Nenhum lançamento ainda.</p>
                    )}
                </div>
            )}
        </div>
    );
};


export default function OPEtapasModal({ op, isOpen, onClose, onUpdateOP, onUpdateGlobal }) {
    const [opDetalhada, setOpDetalhada] = useState(null);
    const [usuariosMap, setUsuariosMap] = useState(new Map()); // Mapa para busca rápida
    const [produtoCompleto, setProdutoCompleto] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [finalizando, setFinalizando] = useState(false);

    const buscarDadosDetalhados = useCallback(async () => {
        if (!op?.edit_id) return;
        setCarregando(true);
        setErro(null);
        try {
            const [opData, usuariosData, todosProdutos] = await Promise.all([
                fetchAPI(`/api/ordens-de-producao/${op.edit_id}?_=${Date.now()}`),
                fetchAPI('/api/usuarios'),
                obterProdutosDoStorage()
            ]);
            setOpDetalhada(opData);
            
            // Cria um mapa: Nome -> Dados do Usuário (para buscar avatar fácil)
            const mapUsers = new Map();
            if (Array.isArray(usuariosData)) {
                usuariosData.forEach(u => mapUsers.set(u.nome, u));
            }
            setUsuariosMap(mapUsers);

            setProdutoCompleto(todosProdutos.find(p => p.id === opData.produto_id));
        } catch (err) {
            setErro(err.message);
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        } finally {
            setCarregando(false);
        }
    }, [op]);

    useEffect(() => {
        if (isOpen) {
            setFinalizando(false);
            setOpDetalhada(null);
            buscarDadosDetalhados();
        }
    }, [isOpen, buscarDadosDetalhados]);

    const handleFinalizarOP = async () => {
        if (!opDetalhada) return;
        
        const lancamentosDetalhados = opDetalhada.lancamentos_detalhados || [];
        const ultimoIndex = opDetalhada.etapas.length - 1;
        const totalFinalizado = lancamentosDetalhados
            .filter(l => l.etapa_index === ultimoIndex)
            .reduce((sum, l) => sum + l.quantidade, 0);
        
        const meta = opDetalhada.quantidade;
        const incompleto = totalFinalizado < meta;
        
        let mensagem = `Tem certeza que deseja finalizar a OP #${opDetalhada.numero}?`;
        let tipoAlerta = 'aviso';
        let textoConfirmar = 'Sim, Finalizar';

        if (incompleto) {
            mensagem = `ATENÇÃO: A meta era ${meta}, mas apenas ${totalFinalizado} foram finalizadas. O saldo de ${meta - totalFinalizado} será considerado PERDA/QUEBRA. Deseja encerrar com divergência?`;
            tipoAlerta = 'perigo';
            textoConfirmar = 'Sim, Encerrar com Perda';
        }

        const confirmado = await mostrarConfirmacao(
            mensagem,
            { tipo: tipoAlerta, textoConfirmar, textoCancelar: 'Cancelar' }
        );
        
        if (!confirmado) return;

        setFinalizando(true);

        try {
            const opParaFinalizar = {
                ...opDetalhada,
                status: 'finalizado',
                data_final: new Date().toISOString()
            };

            await fetchAPI('/api/ordens-de-producao', { method: 'PUT', body: JSON.stringify(opParaFinalizar) });

            mostrarMensagem(`OP #${opDetalhada.numero} encerrada com sucesso!`, 'sucesso');
            onClose(); 
            if (onUpdateOP) onUpdateOP(); 
            if (onUpdateGlobal) onUpdateGlobal();

        } catch (err) {
            console.error('Erro ao finalizar:', err);
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
            setFinalizando(false);
        }
    };

    if (!isOpen) return null;
    
    // Lógica Inteligente para o Botão Finalizar
    let classeBotao = 'op-botao-sucesso';
    let textoBotao = 'Finalizar OP';
    let botaoHabilitado = false; // Começa travado

    const lancamentosDetalhados = opDetalhada?.lancamentos_detalhados || [];
    const ultimoIndex = opDetalhada?.etapas ? opDetalhada.etapas.length - 1 : -1;
    
    // Calcula o total produzido na ÚLTIMA etapa
    const totalFinalizadoNaUltimaEtapa = lancamentosDetalhados
        .filter(l => l.etapa_index === ultimoIndex)
        .reduce((sum, l) => sum + l.quantidade, 0);
    
    const meta = opDetalhada?.quantidade || 0;

    // REGRA DE OURO: Só permite ação se a última etapa teve movimento
    if (opDetalhada?.status === 'finalizado') {
        textoBotao = 'OP Encerrada';
        classeBotao = 'op-finalizada-btn-estilo';
        botaoHabilitado = false;
    } else if (totalFinalizadoNaUltimaEtapa > 0) {
        // Se já tem produção na última etapa, pode finalizar
        botaoHabilitado = true;
        
        if (totalFinalizadoNaUltimaEtapa < meta) {
            // Se for parcial, muda para laranja
            classeBotao = 'op-botao-laranja';
            textoBotao = 'Encerrar (Parcial)';
        } else {
            // Se for total ou maior, verde
            classeBotao = 'op-botao-sucesso';
            textoBotao = 'Finalizar OP';
        }
    } else {
        // Se a última etapa está zerada, não pode finalizar ainda
        botaoHabilitado = false;
        textoBotao = 'Aguardando Produção Final';
        classeBotao = 'op-botao-disabled'; // (Estilo cinza padrão do disabled)
    }

    let imagemSrc = '/img/placeholder-image.png';
    if (produtoCompleto && opDetalhada) {
        const gradeInfo = produtoCompleto.grade?.find(g => g.variacao === opDetalhada.variante);
        imagemSrc = gradeInfo?.imagem || produtoCompleto.imagem || imagemSrc;
    }

    return (
        <div className="op-modal-wrapper-react" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, pointerEvents: 'auto' }}>
            <div className="popup-overlay" onClick={onClose} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1001 }}></div>
            <div className="op-modal" id="opEditView" style={{ display: 'block', maxWidth: '700px', zIndex: 1002, position: 'relative', maxHeight: '90vh', overflowY: 'auto', padding: '10px' }}>
                
                <div className="op-modal-header">
                    <h3 className="op-modal-titulo">Detalhes da OP #{opDetalhada?.numero}</h3>
                    <button className="op-modal-fechar-btn" onClick={onClose}>×</button>
                </div>

                <div className="op-modal-body">
                    {carregando && <div className="spinner">Carregando histórico...</div>}
                    {erro && <p style={{ color: 'red', textAlign: 'center' }}>{erro}</p>}

                    {opDetalhada && !carregando && (
                        <>
                            <div className="op-corte-resumo-card" style={{maxWidth: '100%', marginBottom: '25px'}}>
                                <img src={imagemSrc} alt={opDetalhada.produto} />
                                <div className="op-corte-resumo-info">
                                    <h4>{opDetalhada.produto}</h4>
                                    <p>{opDetalhada.variante || 'Padrão'}</p>
                                </div>
                                <div className="op-corte-estoque-quantidade" style={{padding: '0 15px', alignItems: 'flex-end'}}>
                                    <span className="valor">{opDetalhada.quantidade}</span>
                                    <span className="label">Meta</span>
                                </div>
                            </div>
                            
                            <h3 className="op-subtitulo-secao">Histórico de Produção</h3>
                            <div className="op-etapas-container-wrapper" style={{border: 'none'}}>
                                {opDetalhada.etapas.map((etapa, index) => (
                                    <EtapaAccordion
                                        key={index}
                                        index={index}
                                        etapa={etapa}
                                        op={opDetalhada}
                                        lancamentos={opDetalhada.lancamentos_detalhados || []}
                                        usuariosMap={usuariosMap}
                                    />
                                ))}
                            </div>
                            
                            {/* --- ALERTA AGRESSIVO DE PERDA --- */}
                            {opDetalhada.status !== 'finalizado' && classeBotao === 'op-botao-laranja' && (
                                <div style={{
                                    margin: '0 25px',
                                    padding: '15px',
                                    backgroundColor: '#fff5f5',
                                    border: '1px solid #feb2b2',
                                    borderRadius: '6px',
                                    color: '#c53030',
                                    fontSize: '0.9rem',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px'
                                }}>
                                    <i className="fas fa-exclamation-triangle" style={{fontSize: '1.2rem', marginTop: '2px'}}></i>
                                    <div>
                                        <strong>Atenção: Encerramento Parcial Detectado</strong>
                                        <p style={{margin: '5px 0 0 0', lineHeight: '1.4'}}>
                                            A meta não foi atingida. Ao encerrar agora, o saldo restante será considerado <strong>PERDA</strong> e a OP (e suas etapas) sairão da fila de produção imediatamente.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="op-form-botoes" style={{ margin: '25px', justifyContent: 'flex-end' }}>
                                {/* Botão Finalizar Inteligente */}
                                <button
                                    id="finalizarOP"
                                    className={`op-botao ${classeBotao}`}
                                    onClick={handleFinalizarOP}
                                    style={classeBotao === 'op-botao-laranja' ? {backgroundColor: '#e67e22'} : {}}
                                    disabled={finalizando || !botaoHabilitado}
                                    title={!botaoHabilitado && opDetalhada?.status !== 'finalizado' ? "Complete a última etapa para finalizar." : ""}
                                >
                                    {finalizando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-check-double"></i>}
                                    {textoBotao}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}