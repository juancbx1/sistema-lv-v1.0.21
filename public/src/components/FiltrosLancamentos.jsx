import React, { useState, useEffect, useCallback, useRef } from 'react';

const getLocalDateString = () => {
    const date = new Date();
    // Pega o offset do fuso em minutos (ex: -180 para GMT-3)
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    // Subtrai o offset para "enganar" o toISOString e obter a data local correta
    const localDate = new Date(date.getTime() - timezoneOffset);
    // Retorna a data no formato YYYY-MM-DD
    return localDate.toISOString().split('T')[0];
};

const FiltrosLancamentos = ({ onFiltrosChange, contas }) => {
    
    const getInitialState = (resetCompleto = false) => {
        const hoje = getLocalDateString();
        return {
            termoBusca: '',
            dataInicio: resetCompleto ? '' : hoje,
            dataFim: resetCompleto ? '' : hoje,
            tipo: '', idConta: '', tipoRateio: ''
        };
    };

    // O estado inicial padrão ainda usa a data de hoje
    const [filtros, setFiltros] = useState(getInitialState());
    const [filtrosAvancadosVisiveis, setFiltrosAvancadosVisiveis] = useState(false);

    // Usamos useRef para o debounce, que é a forma mais segura em React
    const debounceTimeout = useRef(null);

    // O useEffect agora observa as mudanças em `filtros` e aplica o debounce
    useEffect(() => {
        // Limpa o timeout anterior sempre que os filtros mudam
        clearTimeout(debounceTimeout.current);

        // Cria um novo timeout
        debounceTimeout.current = setTimeout(() => {
            onFiltrosChange(filtros);
        }, 500); // Espera 500ms após a última mudança para notificar o pai

        // Função de limpeza para desmontagem do componente
        return () => clearTimeout(debounceTimeout.current);
    }, [filtros, onFiltrosChange]);


    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFiltros(prevFiltros => ({ ...prevFiltros, [name]: value }));
        // A notificação ao pai agora é feita exclusivamente pelo useEffect
    };

    const limparTermoBusca = () => {
        setFiltros(prevFiltros => ({ ...prevFiltros, termoBusca: '' }));
    };


    const limparFiltros = () => {
        setFiltros(getInitialState(true));
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
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#888',
                                fontSize: '1.2rem',
                                padding: '0 5px'
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
                    onClick={() => setFiltrosAvancadosVisiveis(!filtrosAvancadosVisiveis)}
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
                        {contas.map(conta => (
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
                    <button type="button" className="fc-btn fc-btn-secundario" onClick={limparFiltros}>
                        <i className="fas fa-times-circle"></i> Limpar Filtros
                    </button>
                </div>
            </form>
        </>
    );
};

export default FiltrosLancamentos;