// public/src/components/OPModalTempos.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';

// Função auxiliar para buscar dados da API
async function fetchApiWithToken(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro na requisição');
    }
    return response.json();
}

export default function OPModalTempos({ isOpen, onClose }) {
    const [produtos, setProdutos] = useState([]);
    const [tempos, setTempos] = useState({});
    const [busca, setBusca] = useState('');
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    // Expande os produtos em uma lista de {produto, processo}
    const tarefas = useMemo(() => {
        const lista = [];
        produtos.forEach(p => {
            if (p.etapas && p.etapas.length > 0) {
                p.etapas.forEach(etapa => {
                    const nomeProcesso = typeof etapa === 'object' ? etapa.processo : etapa;
                    lista.push({ ...p, processo: nomeProcesso });
                });
            }
        });
        return lista;
    }, [produtos]);

    useEffect(() => {
        if (isOpen) {
            setCarregando(true);
            Promise.all([
                fetchApiWithToken('/api/produtos'),
                fetchApiWithToken('/api/producao/tempos-padrao')
            ]).then(([produtosData, temposData]) => {
                setProdutos(produtosData.filter(p => !p.is_kit && p.etapas?.length > 0));
                setTempos(temposData);
            }).catch(err => {
                mostrarMensagem(`Erro ao carregar dados: ${err.message}`, 'erro');
            }).finally(() => {
                setCarregando(false);
            });
        }
    }, [isOpen]);

    const handleTempoChange = (chave, valor) => {
        setTempos(prevTempos => ({
            ...prevTempos,
            [chave]: valor,
        }));
    };

    const handleSalvar = async () => {
        setSalvando(true);
        try {
            await fetchApiWithToken('/api/producao/tempos-padrao', {
                method: 'POST',
                body: JSON.stringify({ tempos }),
            });
            mostrarMensagem('Tempos Padrão de Produção (TPP) salvos com sucesso!', 'sucesso');
            onClose();
        } catch (err) {
            mostrarMensagem(`Erro ao salvar: ${err.message}`, 'erro');
        } finally {
            setSalvando(false);
        }
    };

    const tarefasFiltradas = tarefas.filter(t =>
        t.nome.toLowerCase().includes(busca.toLowerCase()) ||
        t.processo.toLowerCase().includes(busca.toLowerCase())
    );

    if (!isOpen) {
        return null;
    }

    return (
        <div className="popup-container" style={{ display: 'flex' }}>
            <div className="popup-overlay" onClick={onClose}></div>
            <div className="op-modal" style={{ maxWidth: '800px', height: '85vh' }}>
                <div className="op-modal-header">
                    <h3 className="op-modal-titulo">Configurar TPP (Tempo Padrão de Produção)</h3>
                    <button className="op-modal-fechar-btn" onClick={onClose}>×</button>
                </div>
                <div className="op-modal-body" style={{ padding: '0 15px 15px 15px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="input-wrapper-com-limpar" style={{ padding: '15px 0', flexShrink: 0 }}>
                        <input
                            type="text"
                            className="op-input"
                            placeholder="Buscar por produto ou processo..."
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                        />
                        {busca && <button className="btn-limpar-input" onClick={() => setBusca('')}>&times;</button>}
                    </div>
                    
                    {carregando ? (
                        <div className="spinner">Carregando...</div>
                    ) : (
                        <div className="op-tabela-wrapper" style={{ flexGrow: 1, overflowY: 'auto' }}>
                            <table className="op-tabela-estilizada">
                                <thead>
                                    <tr>
                                        <th>Produto</th>
                                        <th>Etapa (Processo)</th>
                                        <th style={{ width: '200px' }}>Tempo por Peça (segundos)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tarefasFiltradas.map(tarefa => {
                                        const chave = `${tarefa.id}-${tarefa.processo}`;
                                        return (
                                            <tr key={chave}>
                                                <td data-label="Produto">{tarefa.nome}</td>
                                                <td data-label="Etapa"><strong>{tarefa.processo}</strong></td>
                                                <td data-label="Tempo (s)">
                                                    <input
                                                        type="number"
                                                        className="op-input"
                                                        style={{ textAlign: 'center' }}
                                                        value={tempos[chave] || ''}
                                                        onChange={e => handleTempoChange(chave, e.target.value)}
                                                        placeholder="Ex: 45.5"
                                                        min="0.1"
                                                        step="0.1"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="op-modal-footer">
                    <button className="op-botao op-botao-principal" onClick={handleSalvar} disabled={salvando}>
                        {salvando ? <div className="spinner-btn-interno"></div> : <i className="fas fa-save"></i>}
                        {salvando ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    );
}