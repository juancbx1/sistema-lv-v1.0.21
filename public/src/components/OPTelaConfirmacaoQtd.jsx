// public/src/components/OPTelaConfirmacaoQtd.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';

async function fetchDetalhesOPs(ids) {
    const token = localStorage.getItem('token');
    const promises = ids.map(id => 
        fetch(`/api/ordens-de-producao/${id}`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .catch(() => null)
    );
    return await Promise.all(promises);
}

export default function OPTelaConfirmacaoQtd({ etapa, funcionario, onClose }) {
    const [quantidade, setQuantidade] = useState(etapa.quantidade_disponivel);
    const [carregando, setCarregando] = useState(false);
    const [produtoCompleto, setProdutoCompleto] = useState(null);
    const [opsDetalhadas, setOpsDetalhadas] = useState([]);
    const [carregandoOps, setCarregandoOps] = useState(true);

    useEffect(() => {
        async function carregarTudo() {
            setCarregandoOps(true);
            try {
                const todosProdutos = await obterProdutosDoStorage();
                const produtoEncontrado = todosProdutos.find(p => p.id === etapa.produto_id);
                setProdutoCompleto(produtoEncontrado);

                if (etapa.origem_ops && etapa.origem_ops.length > 0) {
                    const ops = await fetchDetalhesOPs(etapa.origem_ops);
                    setOpsDetalhadas(ops.filter(op => op));
                }
            } catch (err) {
                console.error("Erro ao carregar detalhes:", err);
            } finally {
                setCarregandoOps(false);
            }
        }
        carregarTudo();
    }, [etapa]);

    const imagemSrc = useMemo(() => {
        if (!produtoCompleto) return '/img/placeholder-image.png';
        const gradeInfo = produtoCompleto.grade?.find(g => g.variacao === etapa.variante);
        return gradeInfo?.imagem || produtoCompleto.imagem || '/img/placeholder-image.png';
    }, [produtoCompleto, etapa.variante]);

    const handleQuantidadeChange = (e) => {
        const valor = e.target.value;
        const valorNum = valor === '' ? 0 : parseInt(valor, 10);
        if (valor === '' || (!isNaN(valorNum) && valorNum >= 0 && valorNum <= etapa.quantidade_disponivel)) {
            setQuantidade(valor);
        }
    };

    const ajustarQuantidade = (ajuste) => {
        const atual = Number(quantidade) || 0;
        const novoValor = Math.max(0, Math.min(etapa.quantidade_disponivel, atual + ajuste));
        setQuantidade(novoValor);
    };

    const handleConfirmar = async () => {
        if (!produtoCompleto || !quantidade || Number(quantidade) <= 0) return;

        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                opNumero: etapa.origem_ops[0], 
                produto_id: etapa.produto_id,
                variante: etapa.variante || '-',
                processo: etapa.processo, 
                quantidade: Number(quantidade),
                funcionario_id: funcionario.id,
            };

            const response = await fetch('/api/producoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Erro ao atribuir.");
            }
            
            mostrarMensagem('Tarefa atribuída!', 'sucesso');
            onClose();

        } catch (err) {
            mostrarMensagem(err.message, 'erro');
        } finally {
            setCarregando(false);
        }
    };

    return (
        <div className="op-confirmacao-container">
            <div className="op-confirmacao-produto-header">
                <img src={imagemSrc} alt={etapa.produto_nome} className="op-confirmacao-imagem" />
                <div className="op-confirmacao-produto-info">
                    <h4>{etapa.produto_nome}</h4>
                    <p>{etapa.variante || 'Padrão'}</p>
                </div>
            </div>

            <div className="op-confirmacao-etapa-destaque">
                <span className="label">Etapa a ser produzida</span>
                <span className="processo">{etapa.processo}</span>
            </div>

            <div className="seletor-quantidade-wrapper" style={{ boxShadow: 'none', border: 'none'}}>
                <label>Definir Quantidade</label>
                <div className="input-container">
                    <button type="button" className="ajuste-qtd-btn" onClick={() => ajustarQuantidade(-1)}>-</button>
                    <input 
                        type="number" className="op-input-tarefas"
                        value={quantidade} onChange={handleQuantidadeChange}
                        max={etapa.quantidade_disponivel}
                    />
                    <button type="button" className="ajuste-qtd-btn" onClick={() => ajustarQuantidade(1)}>+</button>
                </div>
                <div className="atalhos-qtd-container">
                    <button type="button" className="atalho-qtd-btn" onClick={() => ajustarQuantidade(10)}>+10</button>
                    <button type="button" className="atalho-qtd-btn" onClick={() => ajustarQuantidade(50)}>+50</button>
                    <button type="button" className="atalho-qtd-btn" onClick={() => setQuantidade(etapa.quantidade_disponivel)}>Máx.</button>
                </div>
                <small style={{marginTop: '10px', color: '#7f8c8d'}}>
                    Disponível na fila: <strong>{etapa.quantidade_disponivel}</strong> pçs
                </small>
            </div>

            {/* Extrato de OPs */}
            {opsDetalhadas.length > 0 && (
                <div style={{borderTop: '1px solid #eee'}}>
                    <h5 style={{margin: '0 0 10px 0', fontSize: '0.9rem', color: '#555'}}>Origem do Saldo (OPs):</h5>
                    <div style={{maxHeight: '100px', overflowY: 'auto', fontSize: '0.85rem'}}>
                        {opsDetalhadas.map((op, idx) => (
                            <div key={op.id} style={{display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dotted #f0f0f0'}}>
                                <span><i className="fas fa-hashtag"></i> {op.numero}</span>
                                <span style={{color: '#27ae60', fontWeight: 'bold'}}>Disponível</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="op-confirmacao-footer">
                <button 
                    className="op-botao op-botao-sucesso"
                    onClick={handleConfirmar}
                    disabled={carregando || !produtoCompleto || !quantidade || Number(quantidade) <= 0}
                >
                    {carregando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-check"></i>}
                    {carregando ? 'Atribuindo...' : `Atribuir a ${funcionario.nome}`}
                </button>
            </div>
        </div>
    );
}