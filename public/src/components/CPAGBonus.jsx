import React, { useState } from 'react';
import Select, { components } from 'react-select';

import { formatarMoeda } from '/js/utils/formataDtHr.js';
import { mostrarConfirmacao, mostrarToast } from '/js/utils/popups.js';
import FeedbackNotFound from './FeedbackNotFound';

const CustomNoOptions = (props) => {
    return (
        <components.NoOptionsMessage {...props}>
            <div style={{ padding: '10px' }}>
                <FeedbackNotFound 
                    icon="fa-search" 
                    titulo="Sem resultados" 
                    mensagem="Tente buscar por outro termo." 
                />
            </div>
        </components.NoOptionsMessage>
    );
};

export default function CPAGBonus({ usuarios, contas }) {
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedConta, setSelectedConta] = useState(null);
    const [valor, setValor] = useState(''); // String para facilitar digitação
    const [motivo, setMotivo] = useState('');
    
    const [loading, setLoading] = useState(false);

    // Converte usuários e contas para formato do Select
    const userOptions = usuarios.map(u => ({ value: u.id, label: u.nome }));
    const contaOptions = contas.map(c => ({ value: c.id, label: c.nome_conta }));

    // Função de Atalho (Calculadora)
    const ajustarValor = (delta) => {
        const atual = parseFloat(valor) || 0;
        const novo = Math.max(0, atual + delta); // Não permite negativo
        setValor(novo.toFixed(2));
    };

    const handleConcederBonus = async () => {
        if (!selectedUser || !valor || !motivo || !selectedConta) {
            mostrarToast('Preencha todos os campos obrigatórios.', 'aviso');
            return;
        }
        if (parseFloat(valor) <= 0) {
            mostrarToast('O valor deve ser maior que zero.', 'aviso');
            return;
        }

        // CONFIRMAÇÃO MODERNA
        const confirmado = await mostrarConfirmacao(
            `Confirma o bônus de ${formatarMoeda(valor)} para ${selectedUser.label}?`,
            { tipo: 'aviso', textoConfirmar: 'Sim, Conceder' }
        );
        if (!confirmado) return;

        setLoading(true);

        try {
            const token = localStorage.getItem('token');
            const payload = {
                calculo: {
                    detalhes: {
                        funcionario: { id: selectedUser.value, nome: selectedUser.label },
                        ciclo: { nome: motivo },
                        tipoPagamento: 'BONUS'
                    },
                    proventos: {
                        salarioProporcional: 0, comissao: 0, valeTransporte: 0,
                        beneficios: parseFloat(valor)
                    },
                    descontos: { valeTransporte: 0 },
                    totais: { totalLiquidoAPagar: parseFloat(valor) }
                },
                id_conta_debito: selectedConta.value
            };

            const response = await fetch('/api/pagamentos/efetuar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erro ao conceder bônus.');

            // TOAST DE SUCESSO
            mostrarToast('Bônus registrado com sucesso!', 'sucesso');
            setValor('');
            setMotivo('');
            
        } catch (error) {
            mostrarToast(error.message, 'erro');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="">
            <div className="cpg-bonus-container">
                
                {/* COLUNA ESQUERDA: MONEY PAD */}
                <div className="cpg-money-card">
                    <h3 style={{color: '#7f8c8d', fontSize: '1rem', fontWeight: '500'}}>Valor do Bônus</h3>
                    
                    <div className="cpg-money-display">
                        <div className="cpg-money-input-wrapper">
                            <span style={{fontSize: '1.5rem', color: '#aaa', fontWeight: '600'}}>R$</span>
                            <input 
                                type="number" 
                                className="cpg-money-input"
                                placeholder="0.00"
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="cpg-money-shortcuts">
                        <button className="cpg-btn-shortcut plus" onClick={() => ajustarValor(10)}>+10</button>
                        <button className="cpg-btn-shortcut plus" onClick={() => ajustarValor(50)}>+50</button>
                        <button className="cpg-btn-shortcut plus" onClick={() => ajustarValor(100)}>+100</button>
                        
                        <button className="cpg-btn-shortcut plus" onClick={() => ajustarValor(200)}>+200</button>
                        <button className="cpg-btn-shortcut plus" onClick={() => ajustarValor(500)}>+500</button>
                        <button className="cpg-btn-shortcut minus" onClick={() => setValor('')}>Limpar</button>
                    </div>
                </div>

                {/* COLUNA DIREITA: DETALHES */}
                <div className="cpg-card" style={{border: '1px solid #e9ecef', boxShadow: 'none'}}>
                    <h3 className="cpg-section-title" style={{border: 'none', paddingBottom: 0, marginBottom: 15}}>Detalhes</h3>
                    
                    <div className="cpg-form-group">
                        <label>Empregado*</label>
                        <Select
                            options={userOptions}
                            value={selectedUser}
                            onChange={setSelectedUser}
                            placeholder="Buscar..."
                            styles={{ control: (base) => ({ ...base, borderRadius: '8px', minHeight: '45px' }) }}
                        />
                    </div>

                    <div className="cpg-form-group">
                        <label>Motivo*</label>
                        <textarea 
                            className="cpg-input" 
                            rows="2" 
                            placeholder="Ex: Premiação por meta extra"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            style={{resize: 'none'}}
                        ></textarea>
                    </div>

                    <div className="cpg-form-group">
                        <label>Conta de Débito*</label>
                        <Select
                            options={contaOptions}
                            value={selectedConta}
                            onChange={setSelectedConta}
                            placeholder="Selecione..."
                            components={{ NoOptionsMessage: CustomNoOptions }}
                            styles={{ control: (base) => ({ ...base, borderRadius: '8px' }) }}
                        />
                    </div>

                    <button 
                        className="cpg-btn cpg-btn-primario" 
                        style={{ width: '100%', marginTop: '15px', height: '50px', fontSize: '1.1rem' }}
                        onClick={handleConcederBonus}
                        disabled={loading}
                    >
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                        {loading ? ' Processando...' : ' Confirmar Bônus'}
                    </button>
                </div>

            </div>
        </div>
    );
}