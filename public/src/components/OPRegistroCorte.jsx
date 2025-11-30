// public/src/components/OPRegistroCorte.jsx

import React, { useState } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';

export default function OPRegistroCorte({ produto, variante, usuario, onCorteRegistrado }) {
  const [quantidade, setQuantidade] = useState('');
  const [dataCorte, setDataCorte] = useState(new Date().toISOString().split('T')[0]); 
  const [carregando, setCarregando] = useState(false);

  // CLÁUSULA DE GUARDA: Se o produto for nulo (ex: usuário clicou em voltar), não renderiza nada
  if (!produto) return null;

  // Usa 'grade' se existir, senão usa imagem padrão
  const imagemSrc = (produto.grade && Array.isArray(produto.grade))
    ? produto.grade.find(g => g.variacao === variante)?.imagem 
    : produto.imagem;
    
  const imagemFinal = imagemSrc || '/img/placeholder-image.png';

  const handleRegistrar = async () => {
    if (!quantidade || parseInt(quantidade) <= 0) {
      mostrarMensagem('Por favor, insira uma quantidade válida.', 'aviso');
      return;
    }
    if (!usuario || !usuario.nome) {
        mostrarMensagem('Erro: Não foi possível identificar o usuário logado.', 'erro');
        return;
    }

    setCarregando(true);
    try {
      const token = localStorage.getItem('token');

      const pcResponse = await fetch('/api/cortes/next-pc-number', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!pcResponse.ok) throw new Error('Falha ao obter número do PC.');
      const pcData = await pcResponse.json();

      const payload = {
        produto_id: produto.id,
        variante: variante,
        quantidade: parseInt(quantidade),
        data: dataCorte,
        pn: pcData.nextPC,
        status: 'cortados',
        op: null,
        cortador: usuario.nome
      };

      const response = await fetch('/api/cortes', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao registrar corte.');
      }
      
      mostrarMensagem(`Corte (PC: ${pcData.nextPC}) registrado com sucesso!`, 'sucesso');
      onCorteRegistrado(); 

    } catch (err) {
      console.error("Erro em OPRegistroCorte:", err);
      mostrarMensagem(`Erro: ${err.message}`, 'erro');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="op-corte-registro-container">
        <div className="op-corte-resumo-card">
            <img src={imagemFinal} alt={produto.nome} />
            <div className="op-corte-resumo-info">
                <h4>{produto.nome}</h4>
                <p>{variante}</p>
            </div>
        </div>

        <div className="op-form-estilizado" style={{ maxWidth: '400px', margin: '20px auto' }}>
            <div className="op-form-grupo">
                <label htmlFor="quantidadeCorte">Quantidade Cortada</label>
                <input
                    type="number"
                    id="quantidadeCorte"
                    className="op-input op-input-quantidade-corte"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    placeholder="Ex: 50"
                    min="1"
                />
            </div>
             <div className="op-form-grupo">
                <label htmlFor="dataCorte">Data do Corte</label>
                <input
                    type="date"
                    id="dataCorte"
                    className="op-input"
                    value={dataCorte}
                    onChange={(e) => setDataCorte(e.target.value)}
                />
            </div>
            <div className="op-form-botoes" style={{ justifyContent: 'center', marginTop: '30px' }}>
                <button className="op-botao op-botao-principal" onClick={handleRegistrar} disabled={carregando}>
                    {carregando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-save"></i>}
                    {carregando ? 'Registrando...' : 'Registrar no Estoque de Cortes'}
                </button>
            </div>
        </div>
    </div>
  );
}