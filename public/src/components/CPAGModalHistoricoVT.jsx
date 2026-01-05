import React, { useEffect, useState } from 'react';
import { formatarMoeda } from '/js/utils/formataDtHr.js';
import { mostrarConfirmacao, mostrarToast } from '/js/utils/popups.js';
import Paginacao from './Paginacao';

export default function CPAGModalHistoricoVT({ isOpen, onClose, usuarioId }) {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(false);

    // PAGINAÇÃO
    const [paginaAtual, setPaginaAtual] = useState(1);
    const ITENS_POR_PAGINA = 10;

    useEffect(() => {
        if (isOpen) {
            setPaginaAtual(1); // Reseta
            carregarHistorico();
        }
    }, [isOpen, usuarioId]);

    // Lógica de corte
    const totalPaginas = Math.ceil(historico.length / ITENS_POR_PAGINA);
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const itensVisiveis = historico.slice(inicio, inicio + ITENS_POR_PAGINA);

    const carregarHistorico = async () => {
        if (!usuarioId) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/pagamentos/historico-vt?usuario_id=${usuarioId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setHistorico(data);
        } catch (error) {
            console.error(error);
            mostrarToast('Erro ao carregar histórico.', 'erro');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) carregarHistorico();
    }, [isOpen, usuarioId]);

    const handleEstornar = async (recargaId) => {
        const confirmado = await mostrarConfirmacao(
            'Tem certeza que deseja estornar esta recarga? Os dias pagos serão liberados novamente.',
            { tipo: 'perigo', textoConfirmar: 'Sim, Estornar' }
        );
        if (!confirmado) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/pagamentos/estornar-vt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ recarga_id: recargaId })
            });
            
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error);
            }

            mostrarToast('Recarga estornada com sucesso!', 'sucesso');
            carregarHistorico(); // Recarrega a lista
        } catch (error) {
            mostrarToast(error.message, 'erro');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="cpg-modal-overlay">
            <div className="cpg-modal-content" style={{ maxWidth: '700px' }}>
                <div className="cpg-modal-header">
                    <h2>Histórico de Recargas</h2>
                    <button className="cpg-modal-close-btn" onClick={onClose}>×</button>
                </div>
                <div className="cpg-modal-body">
                    {loading ? <p>Carregando...</p> : (
                        historico.length === 0 ? <p>Nenhuma recarga encontrada.</p> : (
                            <table className="cpg-tabela-detalhes">
                                <thead>
                                    <tr>
                                        <th>Data Pgto</th>
                                        <th>Descrição</th>
                                        <th>Valor</th>
                                        <th style={{textAlign:'center'}}>Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Usa itensVisiveis */}
                                    {itensVisiveis.map(h => (
                                        <tr key={h.id} style={{opacity: h.estornado_em ? 0.5 : 1}}>
                                            <td>{new Date(h.data_pagamento).toLocaleDateString('pt-BR')}</td>
                                            <td>
                                                {h.descricao}
                                                {h.estornado_em && <div style={{color:'red', fontSize:'0.8em'}}>Estornado em {new Date(h.estornado_em).toLocaleDateString()}</div>}
                                            </td>
                                            <td>{formatarMoeda(h.valor_liquido_pago)}</td>
                                            <td style={{textAlign:'center'}}>
                                                {!h.estornado_em && (
                                                    <button className="cpg-btn cpg-btn-aviso" style={{padding:'5px 10px', fontSize:'0.8rem'}} onClick={() => handleEstornar(h.id)}>
                                                        Estornar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                        
                    )}
                    {/* SEU COMPONENTE DE PAGINAÇÃO */}
                    <Paginacao 
                        paginaAtual={paginaAtual} 
                        totalPaginas={totalPaginas} 
                        onPageChange={setPaginaAtual} 
                    />
                </div>
            </div>
        </div>
    );
}