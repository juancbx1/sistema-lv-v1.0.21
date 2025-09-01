// public/src/components/ModalLancamento.jsx

import React, { useState, useEffect } from 'react';
import SearchableSelect from './SearchableSelect.jsx';
import AutocompleteAPI from './AutocompleteAPI.jsx';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';

const getLocalDateString = () => {
    const date = new Date();
    // Pega o offset do fuso em minutos (ex: -180 para GMT-3)
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    // Subtrai o offset para "enganar" o toISOString e obter a data local correta
    const localDate = new Date(date.getTime() - timezoneOffset);
    // Retorna a data no formato YYYY-MM-DD
    return localDate.toISOString().split('T')[0];
};

// =================================================================
// Subcomponente para a linha de item de Compra
// =================================================================
const ItemCompraRow = ({ item, onItemChange, onItemRemove, categoryOptions }) => {
    // << MUDANÇA: A função agora passa o campo e o valor separadamente >>
    const handleChange = (field, value) => onItemChange(item.id, field, value);
    const valorTotalItem = (parseFloat(item.quantidade) || 0) * (parseFloat(item.valor_unitario) || 0);

    return (
        <div className="fc-rateio-linha" style={{ gridTemplateColumns: 'minmax(0, 2.5fr) 90px 110px 110px minmax(0, 2fr) 40px' }}>
            <input type="text" className="fc-input" placeholder="Nome do Produto" value={item.descricao_item || ''} onChange={(e) => handleChange('descricao_item', e.target.value)} />
            <input type="number" className="fc-input" placeholder="Qtd" step="0.001" min="0" required value={item.quantidade || ''} onChange={(e) => handleChange('quantidade', e.target.value)} />
            <input type="number" className="fc-input" placeholder="V. Unitário" step="0.01" min="0" required value={item.valor_unitario || ''} onChange={(e) => handleChange('valor_unitario', e.target.value)} />
            <input type="text" className="fc-input" value={valorTotalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} disabled />
            <SearchableSelect options={categoryOptions} placeholder="Categoria..." onChange={(val) => handleChange('id_categoria', val)} initialValue={item.id_categoria} />
            <button type="button" className="remover-item-btn" onClick={() => onItemRemove(item.id)}><i className="fas fa-trash"></i></button>
        </div>
    );
};

// =================================================================
// Subcomponente para a linha de item de Rateio
// =================================================================
const ItemRateioRow = ({ item, onItemChange, onItemRemove, categoryOptions }) => {
    // << MUDANÇA: A função agora passa o campo e o valor separadamente >>
    const handleChange = (field, value) => onItemChange(item.id, field, value);

    return (
        <div className="fc-rateio-linha" style={{ gridTemplateColumns: '2.5fr 2.5fr 2fr 130px 40px' }}>
            <AutocompleteAPI apiEndpoint="/api/financeiro/contatos" placeholder="Buscar funcionário/sócio..." onSelectionChange={(selection) => handleChange('favorecido', selection)} initialSelection={item.favorecido} />
            <SearchableSelect options={categoryOptions} placeholder="Categoria..." onChange={(val) => handleChange('id_categoria', val)} initialValue={item.id_categoria} />
            <input type="text" className="fc-input" placeholder="Descrição (opcional)" value={item.descricao_item || ''} onChange={(e) => handleChange('descricao_item', e.target.value)} />
            <input type="number" className="fc-input" placeholder="Valor" step="0.01" min="0.01" required value={item.valor_item || ''} onChange={(e) => handleChange('valor_item', e.target.value)} />
            <button type="button" className="remover-item-btn" onClick={() => onItemRemove(item.id)}><i className="fas fa-trash"></i></button>
        </div>
    );
};


// =================================================================
// Componente Principal do Modal
// =================================================================
export default function ModalLancamento({ isOpen, onClose, lancamentoParaEditar, contas, categorias, grupos }) {
    const isEditMode = !!lancamentoParaEditar;

    const getInitialState = (formType) => {
        const today = getLocalDateString();
        switch (formType) {
            case 'compra': 
                return { data: today, id_conta_bancaria: '', favorecido: null, descricao: '', desconto: '0.00', itens: [{ id: Date.now(), descricao_item: '', quantidade: '1', valor_unitario: '', id_categoria: null }] };
            case 'rateio': 
                return { data: today, id_conta_bancaria: '', favorecido: null, id_categoria_geral: null, descricao: '', itens: [{ id: Date.now(), favorecido: null, id_categoria: null, descricao_item: '', valor_item: '' }] };
            default: // simples
                return { tipo: 'DESPESA', valor: '', data_transacao: today, id_categoria: null, id_conta_bancaria: '', favorecido: null, descricao: '' };
        }
    };
    
    const [abaAtiva, setAbaAtiva] = useState('simples');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formSimples, setFormSimples] = useState(getInitialState('simples'));
    const [formCompra, setFormCompra] = useState(getInitialState('compra'));
    const [formRateio, setFormRateio] = useState(getInitialState('rateio'));

    useEffect(() => {
        if (!isOpen) return;
        if (isEditMode && lancamentoParaEditar) {
            const l = lancamentoParaEditar;
            const tipoRateio = l.tipo_rateio;
            
            if (!tipoRateio && !l.id_transferencia_vinculada) {
                setAbaAtiva('simples');
                const categoriaDoLancamento = categorias.find(c => c.id === l.id_categoria);
                const grupoPai = grupos.find(g => g.id === categoriaDoLancamento?.id_grupo);
                setFormSimples({ tipo: grupoPai?.tipo || 'DESPESA', valor: l.valor, data_transacao: l.data_transacao.split('T')[0], id_categoria: l.id_categoria, id_conta_bancaria: l.id_conta_bancaria, favorecido: l.id_contato ? { id: l.id_contato, nome: l.nome_favorecido } : null, descricao: l.descricao || '' });
            } else if (tipoRateio === 'COMPRA') {
                setAbaAtiva('compra');
                setFormCompra({ data: l.data_transacao.split('T')[0], id_conta_bancaria: l.id_conta_bancaria, favorecido: l.id_contato ? { id: l.id_contato, nome: l.nome_favorecido } : null, descricao: l.descricao || '', desconto: l.valor_desconto || '0.00', itens: l.itens.map(item => ({ ...item, id: item.id || Date.now() })) });
            } else if (tipoRateio === 'DETALHADO') {
                setAbaAtiva('rateio');
                setFormRateio({
                    data: l.data_transacao.split('T')[0],
                    id_conta_bancaria: l.id_conta_bancaria,
                    favorecido: l.id_contato ? { id: l.id_contato, nome: l.nome_favorecido } : null,
                    id_categoria_geral: l.id_categoria,
                    descricao: l.descricao || '',
                    itens: l.itens.map(item => ({
                        ...item,
                        id: item.id || Date.now(),
                        valor_item: item.valor_total_item, // Corrige o nome do campo de valor
                        favorecido: item.id_contato_item 
                            ? { id: item.id_contato_item, nome: item.nome_contato_item } 
                            : null
                    }))
                });
            }
        } else {
            // Se for modo de CRIAÇÃO, reseta todos os formulários
            setFormSimples(getInitialState('simples'));
            setFormCompra(getInitialState('compra'));
            setFormRateio(getInitialState('rateio'));
            setAbaAtiva('simples'); // Garante que sempre comece na aba 'simples'
        }
    }, [isOpen, isEditMode, lancamentoParaEditar, categorias, grupos]);

    const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(v) || 0);

    const getCategoryOptions = (tipo) => categorias?.filter(c => grupos?.find(g => g.id === c.id_grupo)?.tipo === tipo).map(c => ({ value: c.id, label: `${c.nome} [${grupos.find(g => g.id === c.id_grupo)?.nome}]` })) || [];
    const getAccountOptions = () => contas?.map(c => ({ value: c.id, label: c.nome_conta })) || [];
    const getPurchaseItemCategoryOptions = () => categorias?.filter(c => grupos?.find(g => g.id === c.id_grupo)?.tipo === 'DESPESA').map(c => ({ value: c.id, label: c.nome })) || [];

    // --- Handlers para Compra ---
    const handleAddItemCompra = () => setFormCompra(p => ({ ...p, itens: [...p.itens, { id: Date.now(), descricao_item: '', quantidade: '1', valor_unitario: '', id_categoria: null }] }));
    const handleRemoveItemCompra = (id) => setFormCompra(p => ({ ...p, itens: p.itens.filter(i => i.id !== id) }));
    const handleItemCompraChange = (id, field, value) => {
        setFormCompra(prevState => {
            const newItems = prevState.itens.map(item => {
                if (item.id === id) {
                    return { ...item, [field]: value };
                }
                return item;
            });
            return { ...prevState, itens: newItems };
        });
    };
    const somaItensCompra = formCompra.itens?.reduce((t, i) => t + ((parseFloat(i.quantidade) || 0) * (parseFloat(i.valor_unitario) || 0)), 0) || 0;
    const totalPagoCompra = somaItensCompra - (parseFloat(formCompra.desconto) || 0);

    // --- Handlers para Rateio ---
    const handleAddItemRateio = () => setFormRateio(p => ({ ...p, itens: [...p.itens, { id: Date.now(), favorecido: null, id_categoria: null, descricao_item: '', valor_item: '' }] }));
    const handleRemoveItemRateio = (id) => setFormRateio(p => ({ ...p, itens: p.itens.filter(i => i.id !== id) }));
    const handleItemRateioChange = (id, field, value) => {
        setFormRateio(prevState => {
            const newItems = prevState.itens.map(item => {
                if (item.id === id) {
                    return { ...item, [field]: value };
                }
                return item;
            });
            return { ...prevState, itens: newItems };
        });
    };
    const totalRateio = formRateio.itens?.reduce((t, i) => t + (parseFloat(i.valor_item) || 0), 0) || 0;

    const handleSubmit = async () => {
    // A confirmação de data vem primeiro
    const dataSelecionada = abaAtiva === 'simples' ? formSimples.data_transacao : (abaAtiva === 'compra' ? formCompra.data : formRateio.data);
    const hoje = getLocalDateString()
        
        if (dataSelecionada !== hoje && !isEditMode) {
            const dataFormatada = new Date(dataSelecionada + 'T12:00:00Z').toLocaleDateString('pt-BR');
            const confirmado = await mostrarConfirmacao(
                `A data selecionada (${dataFormatada}) é diferente de hoje. Deseja continuar com esta data?`,
                'aviso'
            );
            if (!confirmado) return; // Interrompe se o usuário cancelar
        }

        setIsSubmitting(true);
        let endpoint = '';
        let payload = {};
        let method = isEditMode ? 'PUT' : 'POST';

        try {
            if (abaAtiva === 'simples') {
                endpoint = isEditMode ? `/api/financeiro/lancamentos/${lancamentoParaEditar.id}` : '/api/financeiro/lancamentos';
                payload = { ...formSimples, valor: parseFloat(formSimples.valor), id_contato: formSimples.favorecido?.id || null };
                if (!payload.valor || !payload.id_categoria || !payload.id_conta_bancaria) throw new Error("Preencha todos os campos obrigatórios (*).");
            } else if (abaAtiva === 'compra') {
                endpoint = isEditMode ? `/api/financeiro/lancamentos/detalhado/${lancamentoParaEditar.id}` : '/api/financeiro/lancamentos/detalhado';
                payload = { tipo_rateio: 'COMPRA', dados_pai: { data_transacao: formCompra.data, id_conta_bancaria: formCompra.id_conta_bancaria, id_contato: formCompra.favorecido?.id || null, descricao: formCompra.descricao, valor_desconto: parseFloat(formCompra.desconto) || 0 }, itens_filho: formCompra.itens.map(i => ({ descricao_item: i.descricao_item, quantidade: parseFloat(i.quantidade), valor_unitario: parseFloat(i.valor_unitario), id_categoria: i.id_categoria })) };
                if (!payload.dados_pai.id_conta_bancaria || !payload.dados_pai.id_contato || payload.itens_filho.some(i => !i.id_categoria)) throw new Error("Conta, Fornecedor e Categoria de todos os itens são obrigatórios.");
            } else if (abaAtiva === 'rateio') {
                
                endpoint = isEditMode ? `/api/financeiro/lancamentos/detalhado/${lancamentoParaEditar.id}` : '/api/financeiro/lancamentos/detalhado';
                payload = {
                    tipo_rateio: 'DETALHADO',
                    dados_pai: {
                        data_transacao: formRateio.data,
                        id_conta_bancaria: formRateio.id_conta_bancaria,
                        id_contato: formRateio.favorecido?.id || null,
                        id_categoria: formRateio.id_categoria_geral,
                        descricao: formRateio.descricao
                    },
                    itens_filho: formRateio.itens.map(i => ({
                        valor_item: parseFloat(i.valor_item),
                        id_contato_item: i.favorecido?.id || null,
                        id_categoria: i.id_categoria,
                        descricao_item: i.descricao_item
                    })),
                };

                // A validação agora checa o payload final
                if (!payload.dados_pai.id_conta_bancaria || !payload.dados_pai.id_categoria || payload.itens_filho.some(i => !i.id_contato_item || !i.id_categoria)) {
                     throw new Error("Conta, Categoria Geral, e Favorecido/Categoria de todos os itens são obrigatórios.");
                }
            } 
            
            const token = localStorage.getItem('token');
            const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Erro ${response.status}`);
            
            mostrarMensagem(result.message || 'Operação realizada com sucesso!', 'sucesso', 3000);
            
            onClose();
            window.dispatchEvent(new CustomEvent('lancamentoCriadoComSucesso'));

        } catch (error) {
            console.error("Erro ao salvar lançamento:", error);
            mostrarMensagem(`Erro: ${error.message}`, 'erro');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fc-modal" style={{ display: 'flex' }}><div className="fc-modal-content">
            <button onClick={onClose} className="fc-modal-close" disabled={isSubmitting}><i className="fas fa-times"></i></button>
            <h3 className="fc-section-title" style={{ textAlign: 'center', border: 0 }}>{isEditMode ? 'Editar Lançamento' : 'Novo Lançamento'}</h3>
            <div className="fc-modal-body">
                <div className="fc-form-group"><label>Qual o tipo de lançamento?</label><div className="fc-segmented-control" style={ isEditMode ? { pointerEvents: 'none', opacity: 0.7 } : {}}> <button type="button" className={`fc-segment-btn ${abaAtiva === 'simples' ? 'active' : ''}`} onClick={() => setAbaAtiva('simples')}>Simples</button> <button type="button" className={`fc-segment-btn ${abaAtiva === 'compra' ? 'active' : ''}`} onClick={() => setAbaAtiva('compra')}>Compra Detalhada</button> <button type="button" className={`fc-segment-btn ${abaAtiva === 'rateio' ? 'active' : ''}`} onClick={() => setAbaAtiva('rateio')}>Rateio Detalhado</button></div></div>
                
                {abaAtiva === 'simples' && formSimples && (<form id="formSimples">
                    <div className="fc-form-row"><div className="fc-form-group"><label>Valor (R$)*</label><input type="number" className="fc-input" step="0.01" required value={formSimples.valor || ''} onChange={e => setFormSimples(p => ({ ...p, valor: e.target.value }))} /></div><div className="fc-form-group"><label>Data*</label><input type="date" className="fc-input" required value={formSimples.data_transacao || ''} onChange={e => setFormSimples(p => ({ ...p, data_transacao: e.target.value }))} /></div></div>
                    <div className="fc-form-row"><div className="fc-form-group"><label>Tipo*</label><select className="fc-select" value={formSimples.tipo || 'DESPESA'} onChange={e => setFormSimples(p => ({ ...p, tipo: e.target.value, id_categoria: null }))} disabled={isEditMode}><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option></select></div><div className="fc-form-group"><label>Categoria*</label><SearchableSelect options={getCategoryOptions(formSimples.tipo)} placeholder="Buscar categoria..." onChange={val => setFormSimples(p => ({ ...p, id_categoria: val }))} initialValue={formSimples.id_categoria} /></div></div>
                    <div className="fc-form-group"><label>Conta Bancária*</label><SearchableSelect options={getAccountOptions()} placeholder="Buscar conta..." onChange={val => setFormSimples(p => ({ ...p, id_conta_bancaria: val }))} initialValue={formSimples.id_conta_bancaria} /></div>
                    <div className="fc-form-group"><label>Favorecido / Pagador</label><AutocompleteAPI apiEndpoint="/api/financeiro/contatos" placeholder="Buscar favorecido..." onSelectionChange={sel => setFormSimples(p => ({ ...p, favorecido: sel }))} initialSelection={formSimples.favorecido} /></div>
                    <div className="fc-form-group"><label>Descrição</label><textarea className="fc-input" rows="2" value={formSimples.descricao || ''} onChange={e => setFormSimples(p => ({ ...p, descricao: e.target.value }))}></textarea></div>
                </form>)}
                
                {abaAtiva === 'compra' && formCompra.itens && (<form id="formCompra">
                    <div className="fc-form-row"><div className="fc-form-group"><label>Data*</label><input type="date" className="fc-input" value={formCompra.data || ''} onChange={e => setFormCompra(p => ({ ...p, data: e.target.value }))} required /></div><div className="fc-form-group"><label>Conta*</label><SearchableSelect options={getAccountOptions()} onChange={val => setFormCompra(p => ({ ...p, id_conta_bancaria: val }))} initialValue={formCompra.id_conta_bancaria} placeholder="Conta de saída..." /></div></div>
                    <div className="fc-form-row"><div className="fc-form-group" style={{ flex: 2 }}><label>Fornecedor*</label><AutocompleteAPI apiEndpoint="/api/financeiro/contatos" placeholder="Buscar fornecedor..." onSelectionChange={sel => setFormCompra(p => ({ ...p, favorecido: sel }))} initialSelection={formCompra.favorecido} /></div><div className="fc-form-group" style={{ flex: 1 }}><label>Desconto (R$)</label><input type="number" className="fc-input" step="0.01" value={formCompra.desconto || ''} onChange={e => setFormCompra(p => ({ ...p, desconto: e.target.value }))} /></div></div>
                    <div className="fc-form-group"><label>Descrição Geral*</label><input type="text" className="fc-input" value={formCompra.descricao || ''} onChange={e => setFormCompra(p => ({ ...p, descricao: e.target.value }))} required /></div><hr style={{ margin: '20px 0' }} /><h4 className="fc-section-title" style={{ fontSize: '1.1rem', border: 0, marginBottom: '10px' }}>Itens da Compra</h4>
                    <div className="fc-rateio-header" style={{ gridTemplateColumns: 'minmax(0, 2.5fr) 90px 110px 110px minmax(0, 2fr) 40px' }}><span>Produto</span><span>Qtd</span><span>V. Unit.</span><span>V. Total</span><span>Categoria*</span><span>Ação</span></div>
                    <div className="grade-itens-rateio">{formCompra.itens.map(item => (<ItemCompraRow key={item.id} item={item} onItemChange={handleItemCompraChange} onItemRemove={handleRemoveItemCompra} categoryOptions={getPurchaseItemCategoryOptions()} />))}</div>
                    <button type="button" className="fc-btn fc-btn-outline" style={{ marginTop: '10px' }} onClick={handleAddItemCompra}><i className="fas fa-plus"></i> Adicionar Item</button>
                    <div className="resumo-rateio" style={{ textAlign: 'right', marginTop: '20px', fontWeight: 'bold' }}><span>Soma: <strong>{formatCurrency(somaItensCompra)}</strong></span> |<span> Desconto: <strong>- {formatCurrency(formCompra.desconto)}</strong></span> |<span style={{ color: 'var(--fc-cor-primaria)' }}> Total: <strong>{formatCurrency(totalPagoCompra)}</strong></span></div>
                </form>)}

                {abaAtiva === 'rateio' && formRateio.itens && (<form id="formRateio">
                    <div className="fc-form-row"><div className="fc-form-group"><label>Data*</label><input type="date" className="fc-input" value={formRateio.data || ''} onChange={e => setFormRateio(p => ({ ...p, data: e.target.value }))} required /></div><div className="fc-form-group"><label>Conta*</label><SearchableSelect options={getAccountOptions()} onChange={val => setFormRateio(p => ({ ...p, id_conta_bancaria: val }))} initialValue={formRateio.id_conta_bancaria} placeholder="Conta de saída..." /></div></div>
                    <div className="fc-form-group"><label>Favorecido (Órgão)</label><AutocompleteAPI apiEndpoint="/api/financeiro/contatos" placeholder="Buscar favorecido principal..." onSelectionChange={sel => setFormRateio(p => ({ ...p, favorecido: sel }))} initialSelection={formRateio.favorecido} /></div>
                    <div className="fc-form-group"><label>Categoria Geral*</label><SearchableSelect options={getCategoryOptions('DESPESA')} onChange={val => setFormRateio(p => ({ ...p, id_categoria_geral: val }))} initialValue={formRateio.id_categoria_geral} placeholder="Categoria principal..." /></div>
                    <div className="fc-form-group"><label>Descrição Geral*</label><input type="text" className="fc-input" value={formRateio.descricao || ''} onChange={e => setFormRateio(p => ({ ...p, descricao: e.target.value }))} required /></div><hr style={{ margin: '20px 0' }} /><h4 className="fc-section-title" style={{ fontSize: '1.1rem', border: 0, marginBottom: '10px' }}>Detalhamento dos Custos</h4>
                    <div className="fc-rateio-header" style={{ gridTemplateColumns: '2.5fr 2.5fr 2fr 130px 40px' }}><span>Favorecido*</span><span>Categoria*</span><span>Descrição</span><span>Valor (R$)*</span><span>Ação</span></div>
                    <div className="grade-itens-rateio">{formRateio.itens.map(item => (<ItemRateioRow key={item.id} item={item} onItemChange={handleItemRateioChange} onItemRemove={handleRemoveItemRateio} categoryOptions={getCategoryOptions('DESPESA')} />))}</div>
                    <button type="button" className="fc-btn fc-btn-outline" style={{ marginTop: '10px' }} onClick={handleAddItemRateio}><i className="fas fa-plus"></i> Adicionar Rateio</button>
                    <div className="resumo-rateio" style={{ textAlign: 'right', marginTop: '20px', fontWeight: 'bold' }}><span style={{ color: 'var(--fc-cor-primaria)' }}>Total Distribuído: <strong>{formatCurrency(totalRateio)}</strong></span></div>
                </form>)}
            </div>
            <div className="fc-modal-footer">
                <button type="button" onClick={onClose} className="fc-btn fc-btn-secundario" disabled={isSubmitting}>Cancelar</button>
                <button
                    type="button" // Muda para "button" para não submeter o form
                    onClick={handleSubmit} // Chama nossa função diretamente
                    className="fc-btn fc-btn-primario"
                    disabled={isSubmitting}>
                    {isSubmitting ? <><i className="fas fa-spinner fa-spin"></i> Salvando...</> : (isEditMode ? 'Salvar Alterações' : 'Salvar')}
                </button>
            </div>
        </div></div>
    );
}