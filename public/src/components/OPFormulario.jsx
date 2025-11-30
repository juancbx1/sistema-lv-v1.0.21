// public/src/components/OPFormulario.jsx

import React, { useState, useEffect } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import { obterProdutos as obterProdutosDoStorage } from '/js/utils/storage.js';

export default function OPFormulario({ corteSelecionado, onOPCriada, onSetGerando }) {
  const [numeroOP, setNumeroOP] = useState('');
  const [dataEntrega, setDataEntrega] = useState(new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState('');
  const [carregando, setCarregando] = useState(true);
  
  // Estado para guardar a imagem correta da variante
  const [imagemVariante, setImagemVariante] = useState('/img/placeholder-image.png');

  useEffect(() => {
    async function inicializarDados() {
      try {
        setCarregando(true);
        const token = localStorage.getItem('token');
        
        // 1. Busca número da OP
        const numResponse = await fetch(`/api/ordens-de-producao?getNextNumber=true`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!numResponse.ok) throw new Error('Falha ao buscar numeração.');
        const numeros = await numResponse.json();
        const proximoNumero = (numeros.map(n => parseInt(n)).filter(n => !isNaN(n)).reduce((max, cur) => Math.max(max, cur), 0) || 0) + 1;
        setNumeroOP(proximoNumero.toString());

        // 2. Busca Detalhes do Produto para pegar a Imagem da Variante
        const todosProdutos = await obterProdutosDoStorage();
        const produtoPai = todosProdutos.find(p => p.id === corteSelecionado.produto_id);
        
        if (produtoPai) {
            // Tenta achar a imagem na grade
            let img = produtoPai.imagem; // Começa com a do pai
            if (corteSelecionado.variante && produtoPai.grade) {
                const variacaoItem = produtoPai.grade.find(g => g.variacao === corteSelecionado.variante);
                if (variacaoItem && variacaoItem.imagem) {
                    img = variacaoItem.imagem;
                }
            }
            setImagemVariante(img || '/img/placeholder-image.png');
        }

      } catch (err) {
        console.error(err);
        mostrarMensagem(err.message, 'erro');
        setNumeroOP((8000 + Math.floor(Math.random() * 1000)).toString());
      } finally {
        setCarregando(false);
      }
    }
    
    if (corteSelecionado) {
        inicializarDados();
    }
  }, [corteSelecionado]);

  const handleSalvarOP = async () => {
        if (!dataEntrega) {
            mostrarMensagem("Por favor, selecione uma data de entrega.", "aviso");
            return;
        }

        setCarregando(true);
        if(onSetGerando) onSetGerando(corteSelecionado.id);

        try {
            const token = localStorage.getItem('token');
            
            const opPayload = {
                numero: numeroOP,
                produto_id: corteSelecionado.produto_id,
                variante: corteSelecionado.variante,
                quantidade: corteSelecionado.quantidade,
                data_entrega: dataEntrega,
                observacoes: observacoes,
                status: 'em-aberto',
                corte_origem_id: corteSelecionado.id 
            };

            const response = await fetch('/api/ordens-de-producao', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(opPayload)
            });
            
            const opCriada = await response.json();
            if (opCriada.error) throw new Error(opCriada.error);
            
            mostrarMensagem(`OP #${opCriada.numero} criada com sucesso a partir do corte PC #${corteSelecionado.pn}!`, 'sucesso');
            onOPCriada();

        } catch (err) {
            if(onSetGerando) onSetGerando(null);
            console.error("Erro ao salvar OP:", err);
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        } finally {
            setCarregando(false);
        }
    };

  return (
    <div className="op-corte-registro-container">
        <div className="op-corte-resumo-card">
            {/* Agora usamos o estado com a imagem correta */}
            <img src={imagemVariante} alt={corteSelecionado.produto} />
            <div className="op-corte-resumo-info">
                <h4>{corteSelecionado.produto}</h4>
                <p>{corteSelecionado.variante || 'Padrão'}</p>
                <div className="op-corte-estoque-detalhes" style={{marginTop: '10px'}}>
                    <span><strong>PC:</strong> {corteSelecionado.pn}</span>
                    <span><strong>Qtd:</strong> {corteSelecionado.quantidade}</span>
                </div>
            </div>
        </div>

        <div className="op-form-estilizado" style={{ maxWidth: '500px', margin: '20px auto' }}>
            <div className="op-form-linha">
                <div className="op-form-grupo">
                    <label>Número da OP</label>
                    <input type="text" className="op-input" value={numeroOP} readOnly disabled />
                </div>
                <div className="op-form-grupo">
                    <label htmlFor="dataEntregaOP">Data de Entrega</label>
                    <input type="date" id="dataEntregaOP" className="op-input" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} />
                </div>
            </div>
            <div className="op-form-grupo">
                <label htmlFor="observacoesOP">Observações (Opcional)</label>
                <textarea id="observacoesOP" className="op-input" rows="3" value={observacoes} onChange={(e) => setObservacoes(e.target.value)}></textarea>
            </div>

            <div className="op-form-botoes" style={{ justifyContent: 'center', marginTop: '30px' }}>
                <button className="op-botao op-botao-principal" onClick={handleSalvarOP} disabled={carregando}>
                    {carregando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-check"></i>}
                    {carregando ? 'Aguarde...' : 'Confirmar e Criar OP'}
                </button>
            </div>
        </div>
    </div>
  );
}