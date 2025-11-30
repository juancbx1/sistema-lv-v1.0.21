// public/src/components/OPTelaConfirmacaoQtd.jsx

import React, { useState, useEffect, useMemo } from 'react'; // Adicione useEffect
import { mostrarMensagem } from '/js/utils/popups.js';
// Precisamos buscar a lista de produtos para encontrar as etapas
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';

export default function OPTelaConfirmacaoQtd({ etapa, funcionario, onClose }) {
    // Estado para a quantidade, já convertido para número para facilitar a manipulação
    const [quantidade, setQuantidade] = useState(etapa.quantidade_disponivel);
    const [carregando, setCarregando] = useState(false);
    const [produtoCompleto, setProdutoCompleto] = useState(null);

    useEffect(() => {
        async function buscarDetalhesProduto() {
            const todosProdutos = await obterProdutosDoStorage();
            const produtoEncontrado = todosProdutos.find(p => p.id === etapa.produto_id);
            setProdutoCompleto(produtoEncontrado);
        }
        buscarDetalhesProduto();
    }, [etapa.produto_id]);

    // Função para encontrar a imagem correta da variante
    const imagemSrc = useMemo(() => {
        if (!produtoCompleto) return '/img/placeholder-image.png';
        const gradeInfo = produtoCompleto.grade?.find(g => g.variacao === etapa.variante);
        return gradeInfo?.imagem || produtoCompleto.imagem || '/img/placeholder-image.png';
    }, [produtoCompleto, etapa.variante]);


    // Lógica para o novo seletor de quantidade
    const handleQuantidadeChange = (e) => {
        const valor = e.target.value;
        // Permite campo vazio, mas converte para 0 para validação
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
    setCarregando(true);
    try {
        // Validação que já temos:
        if (!produtoCompleto || !produtoCompleto.etapas) {
            throw new Error("Detalhes do produto ou suas etapas não foram encontrados.");
        }

        // --- INÍCIO DA CORREÇÃO DEFINITIVA ---
        // 1. Procuramos o índice da etapa CORRETA dentro da configuração do produto
        const etapaIndex = produtoCompleto.etapas.findIndex(e => (e.processo || e) === etapa.processo);

        // 2. Adicionamos uma validação para garantir que a etapa foi encontrada
        if (etapaIndex === -1) {
            throw new Error(`Erro de configuração: A etapa "${etapa.processo}" não foi encontrada no cadastro do produto "${produtoCompleto.nome}".`);
        }
        // --- FIM DA CORREÇÃO DEFINITIVA ---

        const token = localStorage.getItem('token');
        
        // --- INÍCIO DA CORREÇÃO DO PAYLOAD ---
        const payload = {
            // A API de criar sessão espera esses campos:
            opNumero: etapa.origem_ops[0],
            produto_id: etapa.produto_id,
            variante: etapa.variante || '-',
            processo: etapa.processo, // <<< PRECISAMOS ENVIAR O PROCESSO
            quantidade: Number(quantidade),
            funcionario_id: funcionario.id,
            // A API de sessão não precisa de 'etapaIndex', 'funcionario', 'data', etc.
            // ela calcula isso no backend.
        };
        // --- FIM DA CORREÇÃO DO PAYLOAD ---

        console.log("================ PAYLOAD ENVIADO PARA API (CORRIGIDO) ================");
        console.log(JSON.stringify(payload, null, 2));
        console.log("=====================================================================");

        const response = await fetch('/api/producoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

            // Tratamento de erro robusto
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro ${response.status} ao atribuir tarefa.`);
            }

            mostrarMensagem('Tarefa atribuída com sucesso!', 'sucesso');
            onClose();

        } catch (err) {
            mostrarMensagem(`Erro ao atribuir tarefa: ${err.message}`, 'erro');
        } finally {
            setCarregando(false);
        }
    };

    return (
        <div className="op-confirmacao-container">
            {/* 1. CABEÇALHO COM INFORMAÇÕES DO PRODUTO */}
            <div className="op-confirmacao-produto-header">
                <img src={imagemSrc} alt={etapa.produto_nome} className="op-confirmacao-imagem" />
                <div className="op-confirmacao-produto-info">
                    <h4>{etapa.produto_nome}</h4>
                    <p>{etapa.variante || 'Padrão'}</p>
                </div>
            </div>

            {/* 2. DESTAQUE DA ETAPA ATUAL */}
            <div className="op-confirmacao-etapa-destaque">
                <span className="label">Etapa a ser produzida</span>
                <span className="processo">{etapa.processo}</span>
            </div>

            {/* 3. NOVO SELETOR DE QUANTIDADE PREMIUM */}
            <div className="seletor-quantidade-wrapper" style={{ boxShadow: 'none', border: 'none', padding: '10px 0'}}>
                <label htmlFor="inputQuantidadeAtribuir">Definir Quantidade</label>
                <div className="input-container">
                    <button type="button" className="ajuste-qtd-btn" onClick={() => ajustarQuantidade(-1)}>-</button>
                    <input 
                        type="number" 
                        id="inputQuantidadeAtribuir"
                        className="op-input-tarefas"
                        value={quantidade}
                        onChange={handleQuantidadeChange}
                        max={etapa.quantidade_disponivel}
                    />
                    <button type="button" className="ajuste-qtd-btn" onClick={() => ajustarQuantidade(1)}>+</button>
                </div>
                <div className="atalhos-qtd-container">
                    <button type="button" className="atalho-qtd-btn" onClick={() => ajustarQuantidade(10)}>+10</button>
                    <button type="button" className="atalho-qtd-btn" onClick={() => ajustarQuantidade(50)}>+50</button>
                    <button type="button" className="atalho-qtd-btn" onClick={() => setQuantidade(etapa.quantidade_disponivel)}>Máx.</button>
                </div>
                <small style={{marginTop: '10px', color: 'var(--op-cor-cinza-texto)'}}>
                    Disponível na fila: <strong>{etapa.quantidade_disponivel}</strong> pçs
                </small>
            </div>
            
            {/* 4. BOTÃO DE CONFIRMAÇÃO NO FINAL */}
            <div className="op-confirmacao-footer">
                <button 
                    className="op-botao op-botao-sucesso"
                    onClick={handleConfirmar}
                    disabled={carregando || !produtoCompleto || !quantidade || Number(quantidade) <= 0 || Number(quantidade) > etapa.quantidade_disponivel}
                >
                    {carregando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-check"></i>}
                    {carregando ? 'Atribuindo...' : `Atribuir a ${funcionario.nome}`}
                </button>
            </div>
        </div>
    );
}