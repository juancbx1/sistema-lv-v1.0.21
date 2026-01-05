import React, { useEffect, useState } from 'react';
import { formatarMoeda } from '/js/utils/formataDtHr.js';
import { mostrarToast } from '/js/utils/popups.js';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import Paginacao from './Paginacao';

export default function CPAGGerenciadorRecibosVT({ isOpen, onClose }) {
    const [lotes, setLotes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [nomeAdmin, setNomeAdmin] = useState('Administrador'); // Estado para o nome

    // PAGINAÇÃO
    const [paginaAtual, setPaginaAtual] = useState(1);
    const ITENS_POR_PAGINA = 10;

     // Reseta paginação quando abre
    useEffect(() => {
        if (isOpen) {
            setPaginaAtual(1);
            carregarDados();
        }
    }, [isOpen]);

    // Lógica de corte (Slice)
    const totalPaginas = Math.ceil(lotes.length / ITENS_POR_PAGINA);
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const lotesVisiveis = lotes.slice(inicio, inicio + ITENS_POR_PAGINA);

    // Carrega lotes e o nome do usuário logado
    const carregarDados = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` };

            // Promise.all para carregar tudo junto
            const [resLotes, resMe] = await Promise.all([
                fetch('/api/pagamentos/lotes-vt-agrupados', { headers }),
                fetch('/api/usuarios/me', { headers })
            ]);

            const dataLotes = await resLotes.json();
            const dataMe = await resMe.json();

            setLotes(dataLotes);
            if (dataMe && dataMe.nome) setNomeAdmin(dataMe.nome);

        } catch (error) {
            console.error(error);
            mostrarToast('Erro ao carregar dados.', 'erro');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) carregarDados();
    }, [isOpen]);

    const gerarPDFLote = async (lote) => {
        try {
            const doc = new jsPDF();
            const token = localStorage.getItem('token');

            // 1. Extrai os IDs dos itens deste lote para marcar como impresso
            const idsParaMarcar = lote.itens.map(item => item.id);

            // 2. Chama a API com a nova lógica de IDs
            await fetch('/api/pagamentos/marcar-lote-impresso', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ids: idsParaMarcar })
            });

            // 3. Atualiza UI localmente para "Verde" na hora
            setLotes(prev => prev.map(l => 
                (l.data_pagamento === lote.data_pagamento && l.descricao === lote.descricao) 
                ? { ...l, ja_impresso: true } : l
            ));

            // 4. GERAÇÃO DO PDF
            lote.itens.forEach((item, index) => {
                if (index > 0) doc.addPage();

                const nomeFuncionario = item.nome_funcionario;
                const valorTotal = item.valor;
                let detalhes = {};
                try { detalhes = (typeof item.detalhes === 'string') ? JSON.parse(item.detalhes) : item.detalhes; } catch(e){}
                
                const datasPagas = detalhes.datas_pagas || [];
                const diasQtd = datasPagas.length;
                const valorDiario = diasQtd > 0 ? (valorTotal / diasQtd) : 0;

                // --- CABEÇALHO ---
                doc.setFontSize(16);
                doc.text("RECIBO DE VALE TRANSPORTE", 105, 20, null, null, "center");
                
                doc.setFontSize(10);
                doc.text(`Data do Pagamento: ${new Date(lote.data_pagamento).toLocaleDateString('pt-BR')}`, 14, 30);
                doc.text(`Empregado: ${nomeFuncionario}`, 14, 36);
                
                // --- TABELA ---
                const bodyData = datasPagas.map(data => {
                    // Garante timezone UTC para não voltar um dia
                    const dataFormatada = new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                    return [dataFormatada, formatarMoeda(valorDiario)];
                });

                autoTable(doc, {
                    startY: 45,
                    // Mudamos o título para refletir que é um rateio do valor pago, não a tarifa cheia
                    head: [['Referente ao Dia', 'Valor Repassado']], 
                    body: bodyData,
                    theme: 'grid',
                    foot: [['TOTAL RECEBIDO', formatarMoeda(valorTotal)]],
                    headStyles: { 
                        fillColor: [41, 128, 185], 
                        halign: 'center', 
                        valign: 'middle' 
                    },
                    footStyles: { 
                        fillColor: [240, 240, 240], 
                        textColor: [0,0,0], 
                        fontStyle: 'bold', 
                        halign: 'right' 
                    },
                    columnStyles: { 
                        0: { halign: 'center' }, // Centraliza Data
                        1: { halign: 'center' }  // Centraliza Valor
                    },
                    styles: { cellPadding: 4, fontSize: 10 }
                });

                const finalY = doc.lastAutoTable.finalY + 40;

                // --- ASSINATURA ---
                doc.setLineWidth(0.5);
                doc.line(60, finalY, 150, finalY);
                doc.setFontSize(10);
                doc.text(nomeFuncionario, 105, finalY + 5, null, null, "center");
                doc.text("Assinatura do Empregado", 105, finalY + 10, null, null, "center");

                doc.setFontSize(8);
                doc.text("Declaro ter recebido a importância supra referente ao Vale Transporte para os dias discriminados.", 105, finalY + 20, null, null, "center");

                // --- RODAPÉ DE AUDITORIA (AGORA DENTRO DO LOOP) ---
                const pageHeight = doc.internal.pageSize.height;
                doc.setFontSize(7);
                doc.setTextColor(150); // Cinza claro
                
                const dataGeracao = new Date().toLocaleString('pt-BR');
                
                // Texto Esquerdo
                doc.text(`Gerado em ${dataGeracao} por ${nomeAdmin}`, 14, pageHeight - 10);
                
                // Texto Direito
                doc.text(`Ref. Lote: ${lote.descricao} | Data Lote: ${new Date(lote.data_pagamento).toLocaleDateString('pt-BR')}`, 196, pageHeight - 10, null, null, "right");
                
                // Reseta a cor para a próxima página
                doc.setTextColor(0); 
            });

            // Nome do arquivo
            const dataNome = new Date(lote.data_pagamento).toLocaleDateString('pt-BR').replace(/\//g, '-');
            doc.save(`Recibos_VT_Lote_${dataNome}.pdf`);
            
            mostrarToast('Recibos gerados e lote marcado como impresso!', 'sucesso');

        } catch (error) {
            console.error(error);
            mostrarToast('Erro ao gerar PDF.', 'erro');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="cpg-modal-overlay">
            <div className="cpg-modal-content" style={{ maxWidth: '900px' }}>
                <div className="cpg-modal-header">
                    <h2>Gerenciador de Recibos de VT</h2>
                    <button className="cpg-modal-close-btn" onClick={onClose}>×</button>
                </div>
                <div className="cpg-modal-body">
                    {loading ? <div className="cpg-spinner">Carregando...</div> : (
                        lotes.length === 0 ? <p>Nenhum lote encontrado.</p> : (
                            <table className="cpg-tabela-detalhes">
                                <thead>
                                    <tr>
                                        <th>Data Lote</th>
                                        <th>Descrição</th>
                                        <th style={{textAlign:'center'}}>Qtd. Emp.</th>
                                        <th style={{textAlign:'right'}}>Total</th>
                                        <th style={{textAlign:'center'}}>Status</th>
                                        <th style={{textAlign:'center'}}>Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Usa lotesVisiveis em vez de lotes */}
                                    {lotesVisiveis.map((lote, idx) => (
                                        <tr key={idx}>
                                            <td>{new Date(lote.data_pagamento).toLocaleDateString('pt-BR')} {new Date(lote.data_pagamento).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
                                            <td>{lote.descricao}</td>
                                            <td style={{textAlign:'center'}}>{lote.qtd_funcionarios}</td>
                                            <td style={{textAlign:'right', fontWeight:'bold'}}>{formatarMoeda(lote.valor_total)}</td>
                                            <td style={{textAlign:'center'}}>
                                                {lote.ja_impresso ? 
                                                    <span style={{color:'var(--cpg-cor-receita)', fontWeight:'bold'}}><i className="fas fa-check"></i> Impresso</span> : 
                                                    <span style={{color:'#f39c12'}}><i className="fas fa-clock"></i> Pendente</span>
                                                }
                                            </td>
                                            <td style={{textAlign:'center'}}>
                                                <button 
                                                    className="cpg-btn cpg-btn-secundario" 
                                                    onClick={() => gerarPDFLote(lote)}
                                                    title="Gerar PDF com Recibos"
                                                >
                                                    <i className="fas fa-print"></i> PDF
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            
                        )
                    )}
                    {/*  COMPONENTE DE PAGINAÇÃO */}
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