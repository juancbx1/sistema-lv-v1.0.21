import React, { useState } from 'react';
import Select from 'react-select';
import { formatarDataParaInput, formatarHora } from '/js/utils/formataDtHr.js';

const TIPOS_DISPONIVEIS = [
    { id: 'administrador', label: 'Administrador' },
    { id: 'socio', label: 'Sócio' },
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'lider_setor', label: 'Líder de Setor' },
    { id: 'costureira', label: 'Costureira' },
    { id: 'tiktik', label: 'TikTik' },
    { id: 'cortador', label: 'Cortador' }
];

export default function UserCardEdicao({ usuario, onSalvar, onCancelar, salvando, concessionarias }) {
    console.log("Dados do Usuário na Edição:", usuario);
    console.log("IDs de Concessionária:", usuario.concessionarias_vt);
    
    // Estado local com os dados do formulário
    const [formData, setFormData] = useState({
        id: usuario.id,
        nome_completo: usuario.nome_completo || '',
        nomeUsuario: usuario.nome_usuario || '',
        email: usuario.email || '',
        data_admissao: formatarDataParaInput(usuario.data_admissao),
        data_demissao: formatarDataParaInput(usuario.data_demissao),
        tipos: usuario.tipos || [],
        nivel: usuario.nivel || '',
        
        
        // Jornada
        horario_entrada_1: formatarHora(usuario.horario_entrada_1) || '07:30',
        horario_saida_1: formatarHora(usuario.horario_saida_1) || '11:30',
        horario_entrada_2: formatarHora(usuario.horario_entrada_2) || '12:30',
        horario_saida_2: formatarHora(usuario.horario_saida_2) || '17:18',
        horario_entrada_3: formatarHora(usuario.horario_entrada_3) || '',
        horario_saida_3: formatarHora(usuario.horario_saida_3) || '',

        // Financeiro
        salario_fixo: usuario.salario_fixo || 0,
        valor_passagem_diaria: usuario.valor_passagem_diaria || 0,
        elegivel_pagamento: usuario.elegivel_pagamento || false,
        id_contato_financeiro: usuario.id_contato_financeiro, // Mantém o ID hidden
        desconto_inss_percentual: usuario.desconto_inss_percentual || 9.0,
        desconto_vt_percentual: usuario.desconto_vt_percentual || 6.0,
        concessionaria_ids: usuario.concessionarias_vt || [] 
    });

    // Opções React Select
    const concessOptions = concessionarias ? concessionarias.map(c => ({ value: c.id, label: c.nome })) : [];
    // Valor Atual para React Select (Com conversão segura)
    const concessValue = concessOptions.filter(opt => 
        formData.concessionaria_ids.some(idSalvo => parseInt(idSalvo) === parseInt(opt.value))
    );

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleTipoChange = (tipoId) => {
        setFormData(prev => {
            const novosTipos = prev.tipos.includes(tipoId)
                ? prev.tipos.filter(t => t !== tipoId) // Remove
                : [...prev.tipos, tipoId]; // Adiciona
            return { ...prev, tipos: novosTipos };
        });
    };

    const handleSubmit = () => {
        // Formata os dados numéricos antes de enviar
        const payload = {
            ...formData,
            nivel: formData.nivel ? parseInt(formData.nivel) : null,
            salario_fixo: parseFloat(formData.salario_fixo),
            valor_passagem_diaria: parseFloat(formData.valor_passagem_diaria),
            // Datas vazias viram null
            data_admissao: formData.data_admissao || null,
            data_demissao: formData.data_demissao || null,
            // Horários vazios viram null
            horario_entrada_3: formData.horario_entrada_3 || null,
            horario_saida_3: formData.horario_saida_3 || null,
        };
        onSalvar(payload);
    };

    return (
        <div className="gs-card usuario-card-custom edit-mode-active">
            <div className="card-cabecalho">
                <h3 className="card-titulo-nome">Editando: {usuario.nome}</h3>
            </div>

            {/* DADOS PESSOAIS */}
            <div className="card-secao">
                <h4 className="card-secao-titulo">Dados Pessoais</h4>
                <div className="uc-form-group">
                    <label>Nome Completo:</label>
                    <input type="text" name="nome_completo" className="gs-input" value={formData.nome_completo} onChange={handleChange} />
                </div>
                <div className="uc-form-group">
                    <label>Usuário:</label>
                    <input type="text" name="nomeUsuario" className="gs-input" value={formData.nomeUsuario} onChange={handleChange} />
                </div>
                <div className="uc-form-group">
                    <label>Email:</label>
                    <input type="email" name="email" className="gs-input" value={formData.email} onChange={handleChange} />
                </div>
            </div>

            {/* TIPOS E DATAS */}
            <div className="card-secao">
                <h4 className="card-secao-titulo">Vínculo</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                        <label>Admissão:</label>
                        <input type="date" name="data_admissao" className="gs-input" value={formData.data_admissao} onChange={handleChange} />
                    </div>
                    <div>
                        <label>Demissão:</label>
                        <input type="date" name="data_demissao" className="gs-input" value={formData.data_demissao} onChange={handleChange} />
                    </div>
                </div>

                <div className="uc-tipos-container" style={{ marginTop: '10px' }}>
                    <label>Tipos de Usuário:</label>
                    {TIPOS_DISPONIVEIS.map(tipo => (
                        <label key={tipo.id} style={{ display: 'block' }}>
                            <input 
                                type="checkbox" 
                                checked={formData.tipos.includes(tipo.id)}
                                onChange={() => handleTipoChange(tipo.id)}
                            /> {tipo.label}
                        </label>
                    ))}
                </div>

                <div style={{ marginTop: '10px' }}>
                    <label>Nível:</label>
                    <select name="nivel" className="gs-input" value={formData.nivel} onChange={handleChange}>
                        <option value="">Sem Nível</option>
                        <option value="1">Nível 1</option>
                        <option value="2">Nível 2</option>
                        <option value="3">Nível 3</option>
                        <option value="4">Nível 4</option>
                    </select>
                </div>
            </div>

            {/* JORNADA (Edita para todos) */}
            <div className="card-secao">
                <h4 className="card-secao-titulo">Jornada de Trabalho</h4>
                <div className="jornada-grid">
                    <div><label>Entrada 1</label><input type="time" name="horario_entrada_1" className="gs-input" value={formData.horario_entrada_1} onChange={handleChange} /></div>
                    <div><label>Saída 1</label><input type="time" name="horario_saida_1" className="gs-input" value={formData.horario_saida_1} onChange={handleChange} /></div>
                    
                    <div><label>Entrada 2</label><input type="time" name="horario_entrada_2" className="gs-input" value={formData.horario_entrada_2} onChange={handleChange} /></div>
                    <div><label>Saída 2</label><input type="time" name="horario_saida_2" className="gs-input" value={formData.horario_saida_2} onChange={handleChange} /></div>
                    
                    <div><label>Entrada 3</label><input type="time" name="horario_entrada_3" className="gs-input" value={formData.horario_entrada_3} onChange={handleChange} /></div>
                    <div><label>Saída 3</label><input type="time" name="horario_saida_3" className="gs-input" value={formData.horario_saida_3} onChange={handleChange} /></div>
                </div>
            </div>

            {/* FINANCEIRO */}
            <div className="card-secao">
                <h4 className="card-secao-titulo">Financeiro</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                        <label>Salário Fixo</label>
                        <input type="number" name="salario_fixo" className="gs-input" step="0.01" value={formData.salario_fixo} onChange={handleChange} />
                    </div>
                    <div>
                        <label>Passagem/Dia</label>
                        <input type="number" name="valor_passagem_diaria" className="gs-input" step="0.01" value={formData.valor_passagem_diaria} onChange={handleChange} />
                    </div>
                </div>

                {/* NOVOS CAMPOS */}
                <div style={{ marginBottom: '10px' }}>
                    <label>Concessionárias VT</label>
                    <Select
                        isMulti
                        options={concessOptions}
                        value={concessValue}
                        onChange={(opts) => setFormData(prev => ({ ...prev, concessionaria_ids: opts.map(o => o.value) }))}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                        <label>% Desc. INSS</label>
                        <input type="number" name="desconto_inss_percentual" className="gs-input" step="0.1" value={formData.desconto_inss_percentual} onChange={handleChange} />
                    </div>
                    <div>
                        <label>% Desc. VT</label>
                        <input type="number" name="desconto_vt_percentual" className="gs-input" step="0.1" value={formData.desconto_vt_percentual} onChange={handleChange} />
                    </div>
                </div>    

                <div style={{ marginTop: '10px' }}>
                    <label>
                        <input type="checkbox" name="elegivel_pagamento" checked={formData.elegivel_pagamento} onChange={handleChange} />
                        Elegível para pagamentos
                    </label>
                </div>
            </div>

            <div className="uc-card-botoes-container">
                <button className="gs-btn gs-btn-secundario" onClick={onCancelar} disabled={salvando}>
                    Cancelar
                </button>
                <button className="gs-btn gs-btn-sucesso" onClick={handleSubmit} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar'}
                </button>
            </div>
        </div>
    );
}