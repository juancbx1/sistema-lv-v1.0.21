import React, { useState } from 'react';
import { fetchAPI } from '/js/utils/api-utils.js';
import { mostrarMensagem } from '/js/utils/popups.js';

export default function UserFinanceiroModal({ usuario, onClose, aoSalvar }) {
    const [termo, setTermo] = useState('');
    const [resultados, setResultados] = useState([]);
    const [loading, setLoading] = useState(false);

    const handleBuscar = async (valor) => {
        setTermo(valor);
        if (valor.length < 3) {
            setResultados([]);
            return;
        }

        try {
            setLoading(true);
            const dados = await fetchAPI(`/api/usuarios/buscar-contatos-empregado?q=${encodeURIComponent(valor)}`);
            setResultados(dados || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleVincular = async (contatoId) => {
        try {
            // Vamos atualizar apenas o id_contato_financeiro do usuário
            // Reutilizando a rota PUT /api/usuarios que aceita atualização parcial
            await fetchAPI('/api/usuarios', {
                method: 'PUT',
                body: JSON.stringify({
                    id: usuario.id,
                    id_contato_financeiro: contatoId
                })
            });

            mostrarMensagem('Vínculo financeiro atualizado com sucesso!', 'sucesso');
            aoSalvar(); // Fecha e recarrega a lista
        } catch (error) {
            mostrarMensagem(`Erro ao vincular: ${error.message}`, 'erro');
        }
    };

    if (!usuario) return null;

    return (
        <div className="uc-modal-overlay" onClick={onClose}>
            <div className="uc-modal-content" onClick={e => e.stopPropagation()}>
                <div className="uc-modal-header">
                    <h2>Vincular Contato Financeiro</h2>
                    <button className="uc-modal-close-btn" onClick={onClose}>&times;</button>
                </div>
                
                <div className="uc-modal-body">
                    <p>Vinculando usuário: <strong>{usuario.nome}</strong></p>
                    
                    <div className="uc-form-group" style={{ marginTop: '15px' }}>
                        <label>Buscar Contato (Digite nome):</label>
                        <input 
                            type="text" 
                            className="gs-input" 
                            placeholder="Mínimo 3 letras..."
                            value={termo}
                            onChange={e => handleBuscar(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <ul className="uc-lista-contatos" style={{ marginTop: '15px', border: '1px solid #ddd', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', listStyle: 'none', padding: 0 }}>
                        {loading && <li style={{ padding: '10px' }}>Buscando...</li>}
                        
                        {!loading && termo.length >= 3 && resultados.length === 0 && (
                            <li style={{ padding: '10px', color: '#7f8c8d' }}>Nenhum contato encontrado.</li>
                        )}
                        
                        {resultados.map(contato => (
                            <li 
                                key={contato.id} 
                                style={{ padding: '10px', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onClick={() => handleVincular(contato.id)}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <span>{contato.nome}</span>
                                <button className="gs-btn gs-btn-pequeno gs-btn-secundario">Selecionar</button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}