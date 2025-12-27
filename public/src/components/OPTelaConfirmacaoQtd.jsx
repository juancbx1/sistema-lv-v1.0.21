// public/src/components/OPTelaConfirmacaoQtd.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';

export default function OPTelaConfirmacaoQtd({ etapa, funcionario, onClose }) {
    const itensLote = Array.isArray(etapa) ? etapa : [etapa];
    
    const [quantidades, setQuantidades] = useState({});
    const [carregando, setCarregando] = useState(false);
    
    // Novo: Estado para guardar as imagens carregadas
    const [mapaImagens, setMapaImagens] = useState({});

    // 1. Carregar Imagens dos Produtos ao Iniciar
    useEffect(() => {
        async function carregarImagens() {
            try {
                const todosProdutos = await obterProdutosDoStorage();
                const novoMapa = {};

                itensLote.forEach(item => {
                    const produto = todosProdutos.find(p => p.id === item.produto_id);
                    let img = '/img/placeholder-image.png'; // Fallback

                    if (produto) {
                        img = produto.imagem; // Imagem padrão
                        // Tenta achar a variante específica
                        if (item.variante && produto.grade) {
                            const varObj = produto.grade.find(g => g.variacao === item.variante);
                            if (varObj && varObj.imagem) img = varObj.imagem;
                        }
                    }
                    // Chave única para o mapa
                    novoMapa[`${item.produto_id}-${item.variante}`] = img;
                });
                setMapaImagens(novoMapa);
            } catch (error) {
                console.error("Erro ao carregar imagens:", error);
            }
        }
        carregarImagens();
    }, [etapa]); // Roda quando a prop 'etapa' muda

    // 2. Inicializar Quantidades (igual antes)
    useEffect(() => {
        const inits = {};
        itensLote.forEach(item => {
            const key = `${item.produto_id}-${item.variante}-${item.processo}`;
            inits[key] = item.quantidade_disponivel;
        });
        setQuantidades(inits);
    }, [etapa]);

    // 3. Funções de Ajuste (Manual e Botões)
    const handleQtdChange = (key, valor, max) => {
        const num = parseInt(valor);
        if (valor === '' || (!isNaN(num) && num >= 0 && num <= max)) {
            setQuantidades(prev => ({ ...prev, [key]: valor }));
        }
    };

    const ajustarQuantidade = (key, delta, max) => {
        setQuantidades(prev => {
            const atual = parseInt(prev[key]) || 0;
            const novo = Math.max(0, Math.min(max, atual + delta));
            return { ...prev, [key]: novo };
        });
    };

    const definirMaximo = (key, max) => {
        setQuantidades(prev => ({ ...prev, [key]: max }));
    };

    const handleConfirmar = async () => {
        setCarregando(true);
        try {
            const token = localStorage.getItem('token');
            
            const payloadItens = itensLote.map(item => {
                const key = `${item.produto_id}-${item.variante}-${item.processo}`;
                const qtd = parseInt(quantidades[key]);
                if (!qtd || qtd <= 0) return null;

                return {
                    opNumero: item.origem_ops[0],
                    produto_id: item.produto_id,
                    variante: item.variante || '-',
                    processo: item.processo,
                    quantidade: qtd
                };
            }).filter(i => i !== null);

            if (payloadItens.length === 0) throw new Error("Defina pelo menos uma quantidade válida.");

            const response = await fetch('/api/producoes/lote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    itens: payloadItens,
                    funcionario_id: funcionario.id,
                    funcionario_nome: funcionario.nome
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Erro ao atribuir lote.");
            }

            mostrarMensagem(`Sucesso! ${payloadItens.length} tarefas atribuídas.`, 'sucesso');
            onClose();

        } catch (err) {
            mostrarMensagem(err.message, 'erro');
        } finally {
            setCarregando(false);
        }
    };

    return (
        <div className="op-confirmacao-container" style={{ padding: '10px 5px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            <h3 className="op-titulo-secao" style={{ textAlign: 'center', fontSize: '1.2rem', padding: '0 0 15px 0' }}>
                Confirmar Lote para <span style={{color: 'var(--op-cor-azul-claro)'}}>{funcionario.nome}</span>
            </h3>

            {/* LISTA DE CARDS COM SCROLL */}
            <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '5px' }}>
                {itensLote.map((item, idx) => {
                    const key = `${item.produto_id}-${item.variante}-${item.processo}`;
                    const qtd = quantidades[key] !== undefined ? quantidades[key] : item.quantidade_disponivel;
                    const imgUrl = mapaImagens[`${item.produto_id}-${item.variante}`] || '/img/placeholder-image.png';

                    return (
                        <div key={idx} className="op-item-confirmacao-card">
                            {/* LADO ESQUERDO: IMAGEM E INFO */}
                            <div className="item-info-visual">
                                <img src={imgUrl} alt={item.produto_nome} />
                                <div>
                                    <h4>{item.produto_nome}</h4>
                                    <p className="variante">{item.variante}</p>
                                    <p className="processo">{item.processo}</p>
                                </div>
                            </div>

                            {/* LADO DIREITO: CONTROLES DE QUANTIDADE */}
                            <div className="item-controles-qtd">
                                <div className="qtd-display-linha">
                                    <button className="btn-ajuste mini" onClick={() => ajustarQuantidade(key, -1, item.quantidade_disponivel)}>-</button>
                                    <input 
                                        type="number" 
                                        value={qtd}
                                        onChange={(e) => handleQtdChange(key, e.target.value, item.quantidade_disponivel)}
                                    />
                                    <button className="btn-ajuste mini" onClick={() => ajustarQuantidade(key, 1, item.quantidade_disponivel)}>+</button>
                                </div>
                                <div className="qtd-atalhos-linha">
                                    <button onClick={() => ajustarQuantidade(key, 10, item.quantidade_disponivel)}>+10</button>
                                    <button className="btn-max" onClick={() => definirMaximo(key, item.quantidade_disponivel)}>
                                        Max ({item.quantidade_disponivel})
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="op-confirmacao-footer" style={{ marginTop: '15px' }}>
                <button 
                    className="op-botao op-botao-sucesso"
                    onClick={handleConfirmar}
                    disabled={carregando}
                    style={{ width: '100%', padding: '15px', fontSize: '1.1rem' }}
                >
                    {carregando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-check-double"></i>}
                    {carregando ? 'Processando...' : `Confirmar Tudo (${itensLote.length} itens)`}
                </button>
            </div>
        </div>
    );
}