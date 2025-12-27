// public/src/components/OPRegistroCorte.jsx

import React, { useState } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';

export default function OPRegistroCorte({ produto, variante, usuario, onCorteRegistrado, quantidadeInicial, demandaId }) {
  // Inicializa o estado com a quantidade da demanda (se houver) ou string vazia
  const [quantidade, setQuantidade] = useState(quantidadeInicial || '');
  const [dataCorte, setDataCorte] = useState(new Date().toISOString().split('T')[0]); 
  const [carregando, setCarregando] = useState(false);

  if (!produto) return null;

  const imagemSrc = (produto.grade && Array.isArray(produto.grade))
    ? produto.grade.find(g => g.variacao === variante)?.imagem 
    : produto.imagem;
  const imagemFinal = imagemSrc || '/img/placeholder-image.png';

  // --- LÓGICA DO SELETOR INTELIGENTE ---
  const handleQuantidadeChange = (e) => {
      const val = e.target.value;
      // Permite limpar o campo ou digitar números positivos
      if (val === '' || parseInt(val) >= 0) {
          setQuantidade(val);
      }
  };

  const ajustarQuantidade = (delta) => {
      setQuantidade(prev => {
          const atual = parseInt(prev) || 0;
          const novo = Math.max(0, atual + delta); // Não deixa ficar negativo
          return novo.toString();
      });
  };

  const handleRegistrar = async () => {
     if (!quantidade || parseInt(quantidade) <= 0) {
      mostrarMensagem('Por favor, insira uma quantidade válida.', 'aviso');
      return;
    }
    if (!usuario || !usuario.nome) {
        mostrarMensagem('Erro: Usuário não identificado.', 'erro');
        return;
    }

    setCarregando(true);
    try {
      const token = localStorage.getItem('token');
      const pcResponse = await fetch('/api/cortes/next-pc-number', { headers: { 'Authorization': `Bearer ${token}` } });
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
        cortador: usuario.nome,
        demanda_id: demandaId
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
      
      const corteCriado = await response.json();
      mostrarMensagem(`Corte (PC: ${pcData.nextPC}) registrado com sucesso!`, 'sucesso');
      onCorteRegistrado(corteCriado);

    } catch (err) {
      console.error("Erro em OPRegistroCorte:", err);
      mostrarMensagem(`Erro: ${err.message}`, 'erro');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="op-corte-registro-container">
        
        {/* CABEÇALHO RESUMO */}
        <div className="op-corte-resumo-card">
            <img src={imagemFinal} alt={produto.nome} />
            <div className="op-corte-resumo-info">
                <h4>{produto.nome}</h4>
                <p>{variante}</p>
            </div>
        </div>

        <div className="op-form-estilizado" style={{ maxWidth: '400px', margin: '0 auto' }}>
            
            {/* --- NOVO SELETOR DE QUANTIDADE (MOBILE FRIENDLY) --- */}
            <div className="item-controles-qtd" style={{ border: 'none', padding: '0 0 20px 0' }}>
                <label style={{ fontWeight: '600', color: '#555', marginBottom: '5px' }}>Quantidade Cortada</label>
                
                <div className="qtd-display-linha">
                    <button className="btn-ajuste mini" onClick={() => ajustarQuantidade(-1)}>-</button>
                    <input 
                        type="number" 
                        value={quantidade}
                        onChange={handleQuantidadeChange}
                        placeholder="0"
                        style={{ width: '100px', fontSize: '1.6rem' }} // Input maior
                    />
                    <button className="btn-ajuste mini" onClick={() => ajustarQuantidade(1)}>+</button>
                </div>

                <div className="qtd-atalhos-linha" style={{ marginTop: '10px' }}>
                    <button onClick={() => ajustarQuantidade(10)}>+10</button>
                    <button onClick={() => ajustarQuantidade(50)}>+50</button>
                    <button onClick={() => ajustarQuantidade(100)}>+100</button>
                </div>

                {quantidadeInicial && (
                    <div style={{ fontSize: '0.8rem', color: '#27ae60', marginTop: '8px' }}>
                        <i className="fas fa-check-circle"></i> Sugerido: {quantidadeInicial} pçs
                    </div>
                )}
            </div>

            {/* INPUT DE DATA (Mantido simples) */}
             <div className="op-form-grupo">
                <label htmlFor="dataCorte">Data do Corte</label>
                <input 
                    type="date" 
                    id="dataCorte" 
                    className="op-input" 
                    style={{ textAlign: 'center', fontSize: '1.1rem', padding: '10px' }}
                    value={dataCorte} 
                    onChange={(e) => setDataCorte(e.target.value)} 
                />
            </div>

            {/* BOTÃO DE AÇÃO MELHORADO */}
            <div className="op-form-botoes" style={{ justifyContent: 'center', marginTop: '30px' }}>
                <button 
                    className="op-botao op-botao-sucesso" 
                    onClick={handleRegistrar} 
                    disabled={carregando}
                    style={{ width: '100%', padding: '15px', fontSize: '1.1rem' }} // Botão grande
                >
                    {carregando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-check"></i>}
                    {carregando ? 'Salvando...' : 'Confirmar Corte'}
                </button>
            </div>
        </div>
    </div>
  );
}