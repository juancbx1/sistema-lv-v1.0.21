// public/src/components/FiltrosLancamentos.jsx
import React, { useState } from 'react';

const FiltrosLancamentos = ({ filtros, onFiltrosChange, onLimparFiltros }) => {
    const [filtrosAvancadosVisiveis, setFiltrosAvancadosVisiveis] = useState(false);

    const handleInputChange = (e) => {
        onFiltrosChange(e.target.name, e.target.value);
    };
    
    const limparTermoBusca = () => {
        onFiltrosChange('termoBusca', '');
    };

    return (
        <>
            <div className="fc-busca-e-filtros-linha">
                <div className="fc-form-grupo" style={{ flexGrow: 1, position: 'relative' }}>
                    <input 
                        type="text" 
                        name="termoBusca"
                        className="fc-input" 
                        placeholder="Buscar por #ID, descrição, favorecido ou valor..."
                        value={filtros.termoBusca}
                        onChange={handleInputChange}
                    />
                    {filtros.termoBusca && (
                        <button 
                            type="button" 
                            onClick={limparTermoBusca}
                            style={{
                                position: 'absolute', right: '10px', top: '50%',
                                transform: 'translateY(-50%)', background: 'none', border: 'none',
                                cursor: 'pointer', color: '#888', fontSize: '1.2rem', padding: '0 5px'
                            }}
                            title="Limpar busca"
                        >
                            &times;
                        </button>
                    )}
                </div>
                <button 
                    type="button"
                    className="fc-btn fc-btn-filtro fc-btn-outline" 
                    onClick={() => setFiltrosAvancadosVisiveis(prev => !prev)}
                >
                    <i className="fas fa-filter"></i> Filtros Avançados
                </button>
            </div>

            <form className={`fc-filtros-container ${!filtrosAvancadosVisiveis ? 'hidden' : ''}`}>
                <div className="fc-form-grupo">
                    <label>Data Início</label>
                    <input type="date" name="dataInicio" className="fc-input" value={filtros.dataInicio} onChange={handleInputChange} />
                </div>
                <div className="fc-form-grupo">
                    <label>Data Fim</label>
                    <input type="date" name="dataFim" className="fc-input" value={filtros.dataFim} onChange={handleInputChange} />
                </div>
                <div className="fc-form-grupo">
                    <label>Tipo</label>
                    <select name="tipo" className="fc-select" value={filtros.tipo} onChange={handleInputChange}>
                        <option value="">Todos</option>
                        <option value="RECEITA">Receita</option>
                        <option value="DESPESA">Despesa</option>
                    </select>
                </div>
                
                <div className="fc-form-grupo">
                    <label>Conta</label>
                    <select name="idConta" className="fc-select" value={filtros.idConta} onChange={handleInputChange}>
                        <option value="">Todas as Contas</option>
                        {(window.contasCache || []).map(conta => (
                            <option key={conta.id} value={conta.id}>{conta.nome_conta}</option>
                        ))}
                    </select>
                </div>

                <div className="fc-form-grupo">
                    <label>Tipo de Lançamento</label>
                    <select name="tipoRateio" className="fc-select" value={filtros.tipoRateio} onChange={handleInputChange}>
                        <option value="">Todos</option>
                        <option value="simples">Simples</option>
                        <option value="COMPRA">Compra Detalhada</option>
                        <option value="DETALHADO">Rateio Detalhado</option>
                        <option value="transferencia">Transferência</option>
                    </select>
                </div>

                <div className="fc-form-grupo full-width button-container">
                    <button type="button" className="fc-btn fc-btn-secundario" onClick={onLimparFiltros}>
                        <i className="fas fa-times-circle"></i> Limpar Filtros
                    </button>
                </div>
            </form>
        </>
    );
};
export default FiltrosLancamentos;