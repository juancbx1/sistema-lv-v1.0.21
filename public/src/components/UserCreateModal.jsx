import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import { mostrarToast } from '/js/utils/popups.js';
import { fetchAPI } from '/js/utils/api-utils.js';

const TIPOS_DISPONIVEIS = [
    { id: 'administrador', label: 'Administrador' },
    { id: 'socio', label: 'Sócio' },
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'lider_setor', label: 'Líder de Setor' },
    { id: 'costureira', label: 'Costureira' },
    { id: 'tiktik', label: 'TikTik' },
    { id: 'cortador', label: 'Cortador' }
];

export default function UserCreateModal({ onClose, aoSalvar, concessionarias }) {
    const [formData, setFormData] = useState({
        nome: '',
        nomeUsuario: '',
        email: '',
        senha: '',
        tipos: [],
        nivel: '',
        salario_fixo: 0,
        valor_passagem_diaria: 0,
        desconto_inss_percentual: 9.0,
        desconto_vt_percentual: 6.0,
        concessionaria_ids: [] // Array de IDs
    });
    
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [loading, setLoading] = useState(false);

    // Opções para o Select de Concessionária
    const concessOptions = concessionarias.map(c => ({ value: c.id, label: c.nome }));

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTipoChange = (tipoId) => {
        setFormData(prev => {
            const novosTipos = prev.tipos.includes(tipoId)
                ? prev.tipos.filter(t => t !== tipoId)
                : [...prev.tipos, tipoId];
            return { ...prev, tipos: novosTipos };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validações básicas
        if (!formData.nome || !formData.nomeUsuario || !formData.email || !formData.senha || formData.tipos.length === 0) {
            mostrarToast('Preencha todos os campos obrigatórios.', 'erro');
            return;
        }
        if (formData.senha.length < 6) {
            mostrarToast('A senha deve ter no mínimo 6 caracteres.', 'aviso');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                nivel: formData.nivel ? parseInt(formData.nivel) : null,
                salario_fixo: parseFloat(formData.salario_fixo),
                valor_passagem_diaria: parseFloat(formData.valor_passagem_diaria),
                desconto_inss_percentual: parseFloat(formData.desconto_inss_percentual),
                desconto_vt_percentual: parseFloat(formData.desconto_vt_percentual),
            };

            await fetchAPI('/api/usuarios', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            mostrarToast('Usuário cadastrado com sucesso!', 'sucesso');
            aoSalvar(); // Fecha e atualiza lista
        } catch (error) {
            mostrarToast(error.message, 'erro');
        } finally {
            setLoading(false);
        }
    };

    // Verifica se precisa mostrar campos financeiros
    const ehFuncionario = formData.tipos.some(t => ['costureira', 'tiktik', 'cortador', 'supervisor'].includes(t));

    return (
        <div className="uc-modal-overlay">
            <div className="uc-modal-content" style={{ maxWidth: '700px' }}>
                <div className="uc-modal-header">
                    <h2>Cadastrar Novo Usuário</h2>
                    <button className="uc-modal-close-btn" onClick={onClose}>&times;</button>
                </div>
                
                <form className="uc-modal-body" onSubmit={handleSubmit}>
                    
                    {/* DADOS PESSOAIS */}
                    <div className="jornada-grid" style={{marginBottom:'15px'}}>
                        <div>
                            <label>Nome Completo*</label>
                            <input type="text" name="nome" className="gs-input" value={formData.nome} onChange={handleChange} placeholder="Ex: Maria Silva" />
                        </div>
                        <div>
                            <label>Usuário (Login)*</label>
                            <input type="text" name="nomeUsuario" className="gs-input" value={formData.nomeUsuario} onChange={handleChange} placeholder="Ex: maria.silva" />
                        </div>
                    </div>
                    
                    <div className="jornada-grid" style={{marginBottom:'15px'}}>
                        <div>
                            <label>Email*</label>
                            <input type="email" name="email" className="gs-input" value={formData.email} onChange={handleChange} placeholder="email@exemplo.com" />
                        </div>
                        <div>
                            <label>Senha*</label>
                            <div style={{position:'relative'}}>
                                <input 
                                    type={mostrarSenha ? "text" : "password"} 
                                    name="senha" className="gs-input" 
                                    value={formData.senha} onChange={handleChange} 
                                    placeholder="Mínimo 6 caracteres" 
                                />
                                <i 
                                    className={`fas ${mostrarSenha ? 'fa-eye-slash' : 'fa-eye'}`}
                                    style={{position:'absolute', right:'10px', top:'10px', cursor:'pointer', color:'#666'}}
                                    onClick={() => setMostrarSenha(!mostrarSenha)}
                                ></i>
                            </div>
                        </div>
                    </div>

                    {/* TIPOS */}
                    <div className="uc-tipos-container" style={{marginBottom:'15px'}}>
                        <label style={{marginBottom:'5px', display:'block'}}>Tipos de Acesso*</label>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'5px'}}>
                            {TIPOS_DISPONIVEIS.map(tipo => (
                                <label key={tipo.id} style={{ fontSize:'0.9rem', cursor:'pointer' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={formData.tipos.includes(tipo.id)}
                                        onChange={() => handleTipoChange(tipo.id)}
                                    /> {tipo.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* FINANCEIRO (Condicional) */}
                    {ehFuncionario && (
                        <div className="card-secao" style={{border:'1px solid #eee', padding:'10px', borderRadius:'8px', background:'#fcfcfc'}}>
                            <h4 className="card-secao-titulo">Dados Financeiros</h4>
                            
                            <div className="jornada-grid" style={{marginBottom:'10px'}}>
                                <div>
                                    <label>Nível</label>
                                    <select name="nivel" className="gs-input" value={formData.nivel} onChange={handleChange}>
                                        <option value="">Selecione</option>
                                        <option value="1">Nível 1</option>
                                        <option value="2">Nível 2</option>
                                        <option value="3">Nível 3</option>
                                        <option value="4">Nível 4</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Salário Fixo (R$)</label>
                                    <input type="number" name="salario_fixo" className="gs-input" step="0.01" value={formData.salario_fixo} onChange={handleChange} />
                                </div>
                            </div>

                            <div className="jornada-grid" style={{marginBottom:'10px'}}>
                                <div>
                                    <label>Passagem/Dia (R$)</label>
                                    <input type="number" name="valor_passagem_diaria" className="gs-input" step="0.01" value={formData.valor_passagem_diaria} onChange={handleChange} />
                                </div>
                                <div>
                                    <label>Concessionária(s)</label>
                                    <Select
                                        isMulti
                                        options={concessOptions}
                                        placeholder="Selecione..."
                                        onChange={(opts) => setFormData(prev => ({ ...prev, concessionaria_ids: opts.map(o => o.value) }))}
                                        styles={{ control: (base) => ({ ...base, minHeight: '38px', borderRadius: '4px', borderColor: '#ccc' }) }}
                                    />
                                </div>
                            </div>

                            <div className="jornada-grid">
                                <div>
                                    <label>% Desc. INSS</label>
                                    <input type="number" name="desconto_inss_percentual" className="gs-input" step="0.1" value={formData.desconto_inss_percentual} onChange={handleChange} />
                                </div>
                                <div>
                                    <label>% Desc. VT</label>
                                    <input type="number" name="desconto_vt_percentual" className="gs-input" step="0.1" value={formData.desconto_vt_percentual} onChange={handleChange} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{marginTop:'20px', display:'flex', justifyContent:'flex-end', gap:'10px'}}>
                        <button type="button" className="gs-btn gs-btn-secundario" onClick={onClose} disabled={loading}>Cancelar</button>
                        <button type="submit" className="gs-btn gs-btn-primario" disabled={loading}>
                            {loading ? 'Salvando...' : 'Criar Usuário'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}