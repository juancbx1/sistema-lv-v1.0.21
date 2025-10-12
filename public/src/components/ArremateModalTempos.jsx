//public/src/components/ArremateModalTempos.jsx

import React, { useState, useEffect } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';
import { getImagemVariacao } from '../utils/ArremateProdutoHelpers.js';


// Função para buscar dados da API com token
async function fetchApiWithToken(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro na requisição');
    }
    return response.json();
}

export default function ArremateModalTempos({ isOpen, onClose }) {
    const [produtos, setProdutos] = useState([]);
    const [tempos, setTempos] = useState({});
    const [busca, setBusca] = useState('');
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setCarregando(true);
            // Usamos Promise.all para buscar produtos e tempos em paralelo
            Promise.all([
                fetchApiWithToken('/api/produtos'),
                fetchApiWithToken('/api/arremates/tempos-padrao')
            ]).then(([produtosData, temposData]) => {
                // Filtramos para pegar apenas produtos que não são kits
                setProdutos(produtosData.filter(p => !p.is_kit));
                setTempos(temposData);
            }).catch(err => {
                mostrarMensagem(`Erro ao carregar dados: ${err.message}`, 'erro');
            }).finally(() => {
                setCarregando(false);
            });
        }
    }, [isOpen]);

    const handleTempoChange = (produtoId, valor) => {
        setTempos(prevTempos => ({
            ...prevTempos,
            [produtoId]: valor,
        }));
    };

    const handleSalvar = async () => {
        setSalvando(true);
        try {
            await fetchApiWithToken('/api/arremates/tempos-padrao', {
                method: 'POST',
                body: JSON.stringify({ tempos }),
            });
            mostrarMensagem('Tempos padrão salvos com sucesso!', 'sucesso');
            onClose();
        } catch (err) {
            mostrarMensagem(`Erro ao salvar: ${err.message}`, 'erro');
        } finally {
            setSalvando(false);
        }
    };

    const produtosFiltrados = produtos.filter(p =>
        p.nome.toLowerCase().includes(busca.toLowerCase())
    );

    if (!isOpen) {
        return null;
    }

    return (
        <div className="popup-container" style={{ display: 'flex' }}>
            <div className="popup-overlay" onClick={onClose}></div>
            {/* O modal agora usa a altura total disponível (vh) */}
            <div className="oa-modal" style={{ maxWidth: '700px', height: '85vh' }}>
                <div className="oa-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="oa-modal-titulo" style={{ flexGrow: 1, padding: '15px' }}>
                        Configurar TPA
                    </h3>
                    <button className="oa-modal-fechar-btn" onClick={onClose} style={{ flexShrink: 0, marginRight: 10}}>
                        X
                    </button>
                </div>
                <div className="oa-modal-body" style={{ padding: '0 15px 15px 15px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="input-wrapper-com-limpar" style={{ padding: '15px 0', flexShrink: 0 }}>
                        <input
                            type="text"
                            className="oa-input"
                            placeholder="Buscar produto por nome..."
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                        />
                        {busca && (
                            <button 
                                className="btn-limpar-input"
                                onClick={() => setBusca('')}
                                title="Limpar busca"
                            >
                                &times; 
                            </button>
                        )}
                    </div>
                    
                    {carregando ? (
                        <div className="spinner">Carregando produtos...</div>
                    ) : (
                        // <<< 2. O WRAPPER DA TABELA AGORA É FLEXÍVEL E TEM SCROLL >>>
                        <div className="oa-tabela-wrapper" style={{ flexGrow: 1, overflowY: 'auto' }}>
                            <table className="oa-tabela-historico">
                                <thead>
                                    <tr>
                                        <th>Produto</th>
                                        <th style={{ width: '200px' }}>Tempo por Peça (segundos)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {produtosFiltrados.map(produto => (
                                        <tr key={produto.id}>
                                            <td data-label="Produto">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                    <img 
                                                        src={getImagemVariacao(produto, null)} 
                                                        alt={produto.nome}
                                                        style={{ width: '45px', height: '45px', borderRadius: '6px', objectFit: 'cover' }}
                                                    />
                                                    <span>{produto.nome}</span>
                                                </div>
                                            </td>
                                            <td data-label="Tempo (s)">
                                                <input
                                                    type="number"
                                                    className="oa-input"
                                                    style={{ textAlign: 'center' }}
                                                    value={tempos[produto.id] || ''}
                                                    onChange={e => handleTempoChange(produto.id, e.target.value)}
                                                    placeholder="Ex: 45.5"
                                                    min="0.1"
                                                    step="0.1"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="oa-modal-footer footer-lote">
                    <button className="gs-btn gs-btn-sucesso" onClick={handleSalvar} disabled={salvando}>
                        {salvando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-save"></i>}
                        {salvando ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    );
}