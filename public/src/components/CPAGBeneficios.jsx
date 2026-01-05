import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import { formatarMoeda } from '/js/utils/formataDtHr.js';
import { mostrarConfirmacao, mostrarToast } from '/js/utils/popups.js';

export default function CPAGBeneficios({ usuarios, contas }) {
    const [selectedConta, setSelectedConta] = useState(null);
    const [selectedReferencia, setSelectedReferencia] = useState(null);
    const [opcoesReferencia, setOpcoesReferencia] = useState([]);
    
    // Valor Padrão para facilitar preenchimento em lote
    const [valorPadrao, setValorPadrao] = useState('200.00'); 

    const [folha, setFolha] = useState([]);
    const [historicoBeneficios, setHistoricoBeneficios] = useState([]);
    const [loading, setLoading] = useState(false);

    // 1. Gera Datas (Igual Salário)
    useEffect(() => {
        const opcoes = [];
        const hoje = new Date();
        const cursor = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 1);
        for (let i = 0; i < 15; i++) {
            const mesStr = cursor.toLocaleString('pt-BR', { month: 'long' });
            const label = `${mesStr.charAt(0).toUpperCase() + mesStr.slice(1)}/${cursor.getFullYear()}`;
            opcoes.push({ value: label, label: label });
            cursor.setMonth(cursor.getMonth() - 1);
        }
        setOpcoesReferencia(opcoes);
        
        // Seleciona mês SEGUINTE por padrão (VA é adiantado)
        const mesSeguinte = new Date();
        mesSeguinte.setMonth(mesSeguinte.getMonth() + 1); // <--- MÊS + 1
        
        const mesStr = mesSeguinte.toLocaleString('pt-BR', { month: 'long' });
        const labelSeguinte = `${mesStr.charAt(0).toUpperCase() + mesStr.slice(1)}/${mesSeguinte.getFullYear()}`;
        
        setSelectedReferencia({ value: labelSeguinte, label: labelSeguinte });
    }, []);

    // 2. Busca Histórico
    useEffect(() => {
        if (!selectedReferencia) return;
        async function fetchHistorico() {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/pagamentos/historico', { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                const ref = selectedReferencia.value;
                
                const pagos = data.filter(h => {
                    if (!h.descricao) return false;
                    
                    // Verifica se a descrição contém a referência (ex: "Fevereiro/2026")
                    const temRef = h.descricao.includes(ref);
                    
                    // Verifica se é um registro de VA (aceita "VA" ou "Vale Alimentação" ou "Benefício")
                    // Usamos toLowerCase() para garantir que não falhe por maiúsculas/minúsculas
                    const descLower = h.descricao.toLowerCase();
                    const ehBeneficio = descLower.includes('va ') || descLower.includes('vale alimentação') || descLower.includes('benefício');

                    const temRefCiclo = h.ciclo_nome && h.ciclo_nome.includes(ref);

                    // Se a descrição bater com "VA Mês/Ano" já é suficiente
                    if (temRef && ehBeneficio) return true;
                    
                    // Se o ciclo bater, também serve
                    if (temRefCiclo) return true;

                    return false;
                });
                setHistoricoBeneficios(pagos);
            } catch (err) { console.error(err); }
        }
        fetchHistorico();
    }, [selectedReferencia]);

    // 3. Monta a Lista
    useEffect(() => {
        const novaFolha = usuarios.map(u => {
            const jaPago = historicoBeneficios.some(h => h.usuario_id === u.id);
            return {
                id: u.id,
                nome: u.nome,
                valor: valorPadrao, // Inicializa com o padrão
                selecionado: !jaPago,
                pago: jaPago
            };
        });
        setFolha(novaFolha);
    }, [usuarios, historicoBeneficios]); // Nota: Não depende de valorPadrao para não resetar edições manuais

    // Função para aplicar valor padrão a todos NÃO PAGOS
    const aplicarValorPadrao = () => {
        setFolha(prev => prev.map(item => 
            !item.pago ? { ...item, valor: valorPadrao } : item
        ));
    };

    const handleValorChange = (id, novoValor) => {
        setFolha(prev => prev.map(item => item.id === id ? { ...item, valor: novoValor } : item));
    };

    const handleSelectChange = (id) => {
        setFolha(prev => prev.map(item => {
            // Se já pagou, não deixa marcar de jeito nenhum
            if (item.id === id && !item.pago) { 
                return { ...item, selecionado: !item.selecionado };
            }
            return item;
        }));
    };

    const selecionados = folha.filter(f => f.selecionado);

    const handleProcessar = async () => {
        if (!selectedConta) { mostrarToast('Selecione a conta.', 'aviso'); return; }
        if (selecionados.length === 0) { mostrarToast('Selecione alguém.', 'aviso'); return; }

        const total = selecionados.reduce((acc, f) => acc + (parseFloat(f.valor) || 0), 0);

        const confirmado = await mostrarConfirmacao(
            `Pagar VA para <strong>${selecionados.length} pessoas</strong>?<br>Total: <strong>${formatarMoeda(total)}</strong>`,
            { tipo: 'aviso', textoConfirmar: 'Confirmar' }
        );
        if (!confirmado) return;

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const promises = selecionados.map(item => {
                const payload = {
                    calculo: {
                        detalhes: {
                            funcionario: { id: item.id, nome: item.nome },
                            ciclo: { nome: `VA ${selectedReferencia.value}` },
                            tipoPagamento: 'BENEFICIOS'
                        },
                        proventos: { beneficios: parseFloat(item.valor) || 0, salarioProporcional: 0, comissao: 0, valeTransporte: 0 },
                        totais: { totalLiquidoAPagar: parseFloat(item.valor) || 0 }
                    },
                    id_conta_debito: selectedConta.value
                };
                return fetch('/api/pagamentos/efetuar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
            });

            await Promise.all(promises);
            mostrarToast('Vale Alimentação pago com sucesso!', 'sucesso');
            
            // Marca como pago visualmente
            setFolha(prev => prev.map(item => item.selecionado ? { ...item, selecionado: false, pago: true } : item));

        } catch (error) {
            mostrarToast('Erro ao processar.', 'erro');
        } finally {
            setLoading(false);
        }
    };

    // Toggle All (Só marca quem NÃO pagou)
    const handleToggleAll = (e) => {
        const checked = e.target.checked;
        setFolha(prev => prev.map(item => {
            if (item.pago) return item; // Ignora quem pagou
            return { ...item, selecionado: checked };
        }));
    };

    const contaOptions = contas.map(c => ({ value: c.id, label: c.nome_conta }));

    return (
        <div className="cpg-card">
            <h2 className="cpg-section-title">Vale Alimentação (VA)</h2>

            <div className="cpg-form-row" style={{alignItems:'flex-end'}}>
                <div className="cpg-form-group" style={{minWidth:'200px'}}>
                    <label>Referência</label>
                    <Select options={opcoesReferencia} value={selectedReferencia} onChange={setSelectedReferencia} placeholder="Selecione..." />
                </div>
                
                <div className="cpg-form-group">
                    <label>Valor Padrão (R$)</label>
                    <div style={{display:'flex', gap:'10px'}}>
                        <input 
                            type="number" className="cpg-input" 
                            value={valorPadrao} onChange={e => setValorPadrao(e.target.value)}
                        />
                        <button className="cpg-btn cpg-btn-secundario" onClick={aplicarValorPadrao} title="Aplicar a todos">
                            <i className="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>

                <div className="cpg-form-group">
                    <label>Conta Saída</label>
                    <Select options={contaOptions} value={selectedConta} onChange={setSelectedConta} placeholder="Selecione..." />
                </div>
            </div>

            <div className="cpg-tabela-container" style={{marginTop:'20px'}}>
                <table className="cpg-tabela-detalhes">
                    <thead>
                        <tr>
                            <th style={{width:'40px', textAlign:'center'}}>
                                <input type="checkbox" onChange={e => setFolha(prev => prev.map(i => !i.pago ? {...i, selecionado: e.target.checked} : i))} />
                            </th>
                            <th>Empregado</th>
                            <th style={{textAlign:'right'}}>Valor (R$)</th>
                            <th style={{textAlign:'center'}}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {folha.map(item => (
                            <tr key={item.id} style={{opacity: item.pago ? 0.5 : 1, background: item.selecionado ? '#f0f8ff' : 'transparent'}}>
                                <td style={{textAlign:'center'}}>
                                    <input type="checkbox" checked={item.selecionado} onChange={() => handleSelectChange(item.id)} disabled={item.pago} />
                                </td>
                                <td>{item.nome}</td>
                                <td style={{textAlign:'right'}}>
                                    <input 
                                        type="number" className="cpg-input"
                                        style={{width:'100px', textAlign:'right'}}
                                        value={item.valor}
                                        onChange={e => handleValorChange(item.id, e.target.value)}
                                        disabled={item.pago}
                                    />
                                </td>
                                <td style={{textAlign:'center'}}>
                                    {item.pago ? <span style={{color:'green', fontWeight:'bold'}}>PAGO</span> : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button className="cpg-btn cpg-btn-primario" style={{width:'100%', marginTop:'20px', height:'50px'}} onClick={handleProcessar} disabled={loading || selecionados.length === 0}
            >
                {loading ? 'Processando...' : 'Pagar Selecionados'}
            </button>
        </div>
    );
}