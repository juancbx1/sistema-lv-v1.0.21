// public/src/components/OPEtapasModal.jsx

import React, { useState, useEffect, useCallback } from 'react';
import OPEtapaRow from './OPEtapaRow.jsx';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js'; 

// Função auxiliar para buscar dados da API
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

export default function OPEtapasModal({ op, isOpen, onClose, onUpdateOP, onUpdateGlobal }) {
    const [opDetalhada, setOpDetalhada] = useState(null);
    const [usuarios, setUsuarios] = useState([]);
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
                // ADICIONADO: ?_=${Date.now()} para evitar cache do navegador e trazer o status 'lancado' real
                fetchAPI(`/api/ordens-de-producao/${op.edit_id}?_=${Date.now()}`),
                fetchAPI('/api/usuarios'),
                obterProdutosDoStorage()
            ]);

            setOpDetalhada(opData);
            setUsuarios(usuariosData);
            setProdutoCompleto(todosProdutos.find(p => p.id === opData.produto_id));
        } catch (err) {
            setErro(err.message);
            mostrarMensagem(`Erro ao carregar detalhes: ${err.message}`, 'erro');
        } finally {
            setCarregando(false);
        }
    }, [op]);

    // Resetar estados ao abrir
    useEffect(() => {
        if (isOpen) {
            setFinalizando(false); // <--- OBRIGATÓRIO: Destrava o botão para a nova OP
            setOpDetalhada(null);  // Limpa os dados da OP anterior para não piscar informação velha
            buscarDadosDetalhados();
        }
    }, [isOpen, buscarDadosDetalhados]);

    // Função chamada pelo OPEtapaRow para lançar uma produção
    const handleLancarProducao = async (etapaIndex, usuarioId, quantidade) => {
        try {
            const etapa = opDetalhada.etapas[etapaIndex];
            const usuario = usuarios.find(u => u.id == usuarioId);

            const payload = {
                id: `prod_${Date.now()}`,
                opNumero: opDetalhada.numero,
                etapaIndex: etapaIndex,
                processo: etapa.processo,
                produto_id: opDetalhada.produto_id,
                variacao: opDetalhada.variante,
                maquina: etapa.maquina || 'Não Usa',
                quantidade: parseInt(quantidade),
                funcionario: usuario.nome,
                funcionario_id: parseInt(usuarioId),
                data: new Date().toISOString(),
                lancadoPor: 'Sistema'
            };

            await fetchAPI('/api/producoes', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            mostrarMensagem('Produção lançada com sucesso!', 'sucesso');
            onUpdateOP(); // Notifica pai
            buscarDadosDetalhados(); // Atualiza modal

        } catch (err) {
            mostrarMensagem(`Erro ao lançar produção: ${err.message}`, 'erro');
            throw err;
        }
    };

    const handleFinalizarOP = async () => {
        if (!opDetalhada) return;
        
        const confirmado = await mostrarConfirmacao(
            `Tem certeza que deseja finalizar a OP #${opDetalhada.numero}? Esta ação define a OP como concluída e libera para o Arremate.`,
            { tipo: 'aviso', textoConfirmar: 'Sim, Finalizar', textoCancelar: 'Cancelar' }
        );
        
        if (!confirmado) return;

        setFinalizando(true);

        try {
            const opParaFinalizar = {
                edit_id: opDetalhada.edit_id,
                numero: opDetalhada.numero,
                produto_id: parseInt(opDetalhada.produto_id),
                variante: opDetalhada.variante,
                quantidade: parseInt(opDetalhada.quantidade),
                data_entrega: opDetalhada.data_entrega,
                observacoes: opDetalhada.observacoes,
                etapas: opDetalhada.etapas,
                status: 'finalizado',
                data_final: new Date().toISOString()
            };

            await fetchAPI('/api/ordens-de-producao', {
                method: 'PUT',
                body: JSON.stringify(opParaFinalizar)
            });

            mostrarMensagem(`OP #${opDetalhada.numero} finalizada com sucesso!`, 'sucesso');
            
            // 1. Fecha o modal
            onClose(); 
            
            // 2. Atualiza a lista local
            if (onUpdateOP) onUpdateOP(); 

            // 3. ATUALIZA O CONTADOR GLOBAL (BADGE/AVISO AMARELO) IMEDIATAMENTE!
            if (onUpdateGlobal) onUpdateGlobal();

        } catch (err) {
            console.error('Erro ao finalizar OP:', err);
            mostrarMensagem(`Erro ao finalizar OP: ${err.message}`, 'erro');
            setFinalizando(false); // Só reseta se der erro
        }
    };

    if (!isOpen) return null;
    
    // Lógica da imagem da variante
    let imagemSrc = '/img/placeholder-image.png';
    if (produtoCompleto && opDetalhada) {
        const gradeInfo = produtoCompleto.grade?.find(g => g.variacao === opDetalhada.variante);
        imagemSrc = gradeInfo?.imagem || produtoCompleto.imagem || imagemSrc;
    }

    return (
        // CLASSE RENOMEADA PARA EVITAR CONFLITO COM POPUPS.JS
        <div 
            className="op-modal-wrapper-react" 
            style={{ 
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000, pointerEvents: 'auto'
            }}
        >
            <div 
                className="popup-overlay" 
                onClick={onClose}
                style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1001
                }}
            ></div>

            <div 
                className="op-modal" 
                id="opEditView" 
                style={{ 
                    display: 'block', maxWidth: '700px', zIndex: 1002, 
                    position: 'relative', maxHeight: '90vh', overflowY: 'auto', padding: '10px'
                }}
            >
                <div className="op-modal-header">
                    <h3 className="op-modal-titulo">Detalhes da OP #{opDetalhada?.numero}</h3>
                    <button className="op-modal-fechar-btn" onClick={onClose}>×</button>
                </div>

                <div className="op-modal-body">
                    {carregando && <div className="spinner">Carregando detalhes...</div>}
                    {erro && <p style={{ color: 'red', textAlign: 'center' }}>{erro}</p>}

                    {opDetalhada && !carregando && (
                        <>
                            {/* --- CÁLCULO DA QUANTIDADE FINAL --- */}
                            {(() => {
                                const ultimaEtapa = opDetalhada.etapas[opDetalhada.etapas.length - 1];
                                const qtdReal = ultimaEtapa && ultimaEtapa.lancado ? ultimaEtapa.quantidade : null;
                                const qtdPlanejada = opDetalhada.quantidade;
                                const temDivergencia = qtdReal !== null && qtdReal !== qtdPlanejada;
                                const corDivergencia = qtdReal > qtdPlanejada ? 'green' : 'red';
                                
                                return (
                                    <div className="op-corte-resumo-card" style={{maxWidth: '100%', marginBottom: '25px'}}>
                                        <img src={imagemSrc} alt={opDetalhada.produto} />
                                        <div className="op-corte-resumo-info">
                                            <h4>{opDetalhada.produto}</h4>
                                            <p>{opDetalhada.variante || 'Padrão'}</p>
                                        </div>
                                        
                                        <div className="op-corte-estoque-quantidade" style={{padding: '0 15px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
                                            {qtdReal !== null ? (
                                                <div title="Quantidade Real Finalizada (Última Etapa)">
                                                    <span className="valor" style={{ color: temDivergencia ? corDivergencia : 'inherit' }}>
                                                        {qtdReal}
                                                        {temDivergencia && <i className="fas fa-exclamation-triangle" style={{fontSize:'0.6em', marginLeft:'5px'}}></i>}
                                                    </span>
                                                    <span className="label">Real (Final)</span>
                                                </div>
                                            ) : (
                                                <div title="Aguardando finalização da última etapa">
                                                    <span className="valor" style={{color: '#ccc'}}>--</span>
                                                    <span className="label">Real (Pendente)</span>
                                                </div>
                                            )}
                                            <div style={{fontSize: '0.8rem', color: '#7f8c8d', marginTop: '5px'}}>
                                                Planejado/Corte: <strong>{qtdPlanejada}</strong>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                            
                            <h3 className="op-subtitulo-secao">Progresso das Etapas</h3>
                            <div id="etapasContainer" className="op-etapas-container-wrapper">
                                {opDetalhada.etapas.map((etapa, index) => (
                                    <OPEtapaRow
                                        key={index}
                                        etapa={etapa}
                                        index={index}
                                        op={opDetalhada}
                                        usuarios={usuarios}
                                        onLancarProducao={handleLancarProducao}
                                    />
                                ))}
                            </div>
                            
                            <div className="op-form-botoes" style={{ margin: '25px', justifyContent: 'flex-end' }}>
                                <button
                                    id="finalizarOP"
                                    className="op-botao op-botao-sucesso"
                                    onClick={handleFinalizarOP}
                                    disabled={finalizando || opDetalhada?.status !== 'produzindo' || !opDetalhada?.etapas.every(e => e.lancado)}
                                >
                                    {finalizando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-check-double"></i>}
                                    {opDetalhada?.status === 'finalizado' ? 'OP Finalizada' : 'Finalizar OP'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}