import React, { useState, useEffect } from 'react';
import { fetchAPI } from '/js/utils/api-utils.js';
import { formatarDataDisplay } from '/js/utils/formataDtHr.js';
import { mostrarMensagem } from '/js/utils/popups.js';

export default function UserFeriasModal({ usuario, onClose, aoSalvar }) {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');

    // Busca o histórico ao montar o componente
    useEffect(() => {
        if (usuario) {
            carregarHistorico();
        }
    }, [usuario]);

    const carregarHistorico = async () => {
        try {
            setLoading(true);
            const dados = await fetchAPI(`/api/usuarios/${usuario.id}/ferias`);
            setHistorico(dados);
        } catch (error) {
            console.error(error);
            mostrarMensagem('Erro ao carregar histórico de férias.', 'erro');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!dataInicio || !dataFim) {
            mostrarMensagem('Preencha as datas de início e fim.', 'aviso');
            return;
        }

        try {
            await fetchAPI(`/api/usuarios/${usuario.id}/ferias`, {
                method: 'POST',
                body: JSON.stringify({
                    data_inicio: dataInicio,
                    data_fim: dataFim,
                    observacoes: 'Adicionado via Painel React'
                })
            });
            
            mostrarMensagem('Férias registradas com sucesso!', 'sucesso');
            setDataInicio('');
            setDataFim('');
            
            // Recarrega histórico e avisa o pai para atualizar a pílula de status na lista
            await carregarHistorico();
            aoSalvar(); 
        } catch (error) {
            mostrarMensagem(`Erro ao salvar: ${error.message}`, 'erro');
        }
    };

    if (!usuario) return null;

    return (
        <div className="uc-modal-overlay" onClick={onClose}>
            <div className="uc-modal-content" onClick={e => e.stopPropagation()}>
                <div className="uc-modal-header">
                    <h2>Gerenciar Férias</h2>
                    <button className="uc-modal-close-btn" onClick={onClose}>&times;</button>
                </div>
                
                <div className="uc-modal-body">
                    <p>Funcionário: <strong>{usuario.nome}</strong></p>

                    <h3 style={{ marginTop: '20px', color: 'var(--gs-primaria)' }}>
                        <i className="fas fa-plus-circle"></i> Adicionar Período
                    </h3>
                    
                    <form className="uc-form-ferias" onSubmit={handleSubmit}>
                        <div className="uc-form-group">
                            <label>Data Início</label>
                            <input 
                                type="date" 
                                className="gs-input" 
                                value={dataInicio} 
                                onChange={e => setDataInicio(e.target.value)} 
                                required
                            />
                        </div>
                        <div className="uc-form-group">
                            <label>Data Fim</label>
                            <input 
                                type="date" 
                                className="gs-input" 
                                value={dataFim} 
                                onChange={e => setDataFim(e.target.value)} 
                                required
                            />
                        </div>
                        <button type="submit" className="gs-btn gs-btn-primario" style={{ height: '42px' }}>
                            Salvar
                        </button>
                    </form>

                    <h3 style={{ marginTop: '20px', color: 'var(--gs-primaria)' }}>
                        <i className="fas fa-history"></i> Histórico
                    </h3>
                    
                    <ul className="uc-historico-ferias-lista">
                        {loading ? (
                            <li className="nenhum-registro">Carregando...</li>
                        ) : historico.length === 0 ? (
                            <li className="nenhum-registro">Nenhum registro encontrado.</li>
                        ) : (
                            historico.map(item => (
                                <li key={item.id}>
                                    <span>
                                        De <strong>{formatarDataDisplay(item.data_inicio)}</strong> até <strong>{formatarDataDisplay(item.data_fim)}</strong>
                                    </span>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}