import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import { formatarMoeda } from '/js/utils/formataDtHr.js';
import { mostrarConfirmacao, mostrarToast } from '/js/utils/popups.js';

export default function CPAGSalario({ usuarios, contas }) {
    // ESTADOS GLOBAIS
    const [selectedConta, setSelectedConta] = useState(null);
    const [selectedReferencia, setSelectedReferencia] = useState(null); 
    const [opcoesReferencia, setOpcoesReferencia] = useState([])
    const [historicoSalarios, setHistoricoSalarios] = useState([]);
    
    // TABELA (STATE)
    // Estrutura: { id, nome, base, inss, vt, liquidoCalculado, liquidoFinal, selecionado }
    const [folha, setFolha] = useState([]);
    
    const [loading, setLoading] = useState(false);

    // Gera lista de meses (12 para trás, 2 para frente)
    useEffect(() => {
        const opcoes = [];
        const hoje = new Date();
        // Começa 2 meses na frente
        const cursor = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 1);
        
        for (let i = 0; i < 15; i++) { // Gera 15 opções
            const mesStr = cursor.toLocaleString('pt-BR', { month: 'long' });
            const mesCap = mesStr.charAt(0).toUpperCase() + mesStr.slice(1);
            const ano = cursor.getFullYear();
            const label = `${mesCap}/${ano}`;
            
            opcoes.push({ value: label, label: label });
            cursor.setMonth(cursor.getMonth() - 1); // Volta 1 mês
        }
        setOpcoesReferencia(opcoes);

        // Seleciona o mês passado por padrão
        const mesPassado = new Date();
        mesPassado.setMonth(mesPassado.getMonth() - 1);
        const mesPStr = mesPassado.toLocaleString('pt-BR', { month: 'long' });
        const mesPCap = mesPStr.charAt(0).toUpperCase() + mesPStr.slice(1);
        const labelPadrao = `${mesPCap}/${mesPassado.getFullYear()}`;
        
        setSelectedReferencia({ value: labelPadrao, label: labelPadrao });
    }, []);

    // Busca histórico de pagamentos de salário para a referência atual
    useEffect(() => {
        if (!selectedReferencia) return; // Mudou aqui
        const refTexto = selectedReferencia.value; 

        async function fetchHistorico() {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/pagamentos/historico', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                
                // Filtra apenas pagamentos de salário da referência atual
                // A descrição salva é "Pagamento de Salário (Salário Janeiro/2026)..." ou o ciclo_nome
                const pagos = data.filter(h => 
                (h.ciclo_nome && h.ciclo_nome.includes(refTexto) && h.descricao.includes('Salário')) ||
                (h.descricao && h.descricao.includes(`Salário ${refTexto}`))
            );
            setHistoricoSalarios(pagos);
            } catch (err) {
                console.error("Erro ao buscar histórico de salários", err);
            }
        }
        fetchHistorico();
    }, [selectedReferencia]);  // Recarrega sempre que mudar o mês de referência

    // Inicializa a Folha (Carrega todos os elegíveis)
    useEffect(() => {        
        const novaFolha = usuarios.map(u => {
            // Conversão Segura de Tipos
            const base = parseFloat(u.salario_fixo) || 0;
            
            // Tratamento e LOGS
            const rawINSS = u.desconto_inss_percentual;
            const rawVT = u.desconto_vt_percentual;
            
            const pINSS = rawINSS !== undefined && rawINSS !== null ? parseFloat(rawINSS) : 0;
            const pVT = rawVT !== undefined && rawVT !== null ? parseFloat(rawVT) : 0;
            const valINSS = base * (pINSS / 100);
            const valVT = base * (pVT / 100);
            
            // Cálculo do Líquido
            // Salário - INSS - VT
            const liquido = base - valINSS - valVT;

            // Verifica se este usuário já recebeu nesta referência
            const jaPago = historicoSalarios.some(h => h.usuario_id === u.id);
            return {
                id: u.id,
                nome: u.nome,
                base,
                inss: valINSS,
                vt: valVT,
                liquidoCalculado: liquido,
                liquidoFinal: liquido.toFixed(2), 
                selecionado: !jaPago, // Se já pagou, não seleciona por padrão
                pago: jaPago // Marca visualmente
            };
        });
        setFolha(novaFolha);
    }, [usuarios, historicoSalarios]);

    // Handlers
    const handleValorChange = (id, novoValor) => {
        setFolha(prev => prev.map(item => 
            item.id === id ? { ...item, liquidoFinal: novoValor } : item
        ));
    };

    const handleSelectChange = (id) => {
        setFolha(prev => prev.map(item => 
            item.id === id ? { ...item, selecionado: !item.selecionado } : item
        ));
    };

    // Toggle All Inteligente
    const handleToggleAll = (e) => {
        const checked = e.target.checked;
        setFolha(prev => prev.map(item => {
            // Se o item já está pago, nunca muda o selecionado (fica sempre false)
            if (item.pago) return item; 
            
            // Senão, segue o checkbox mestre
            return { ...item, selecionado: checked };
        }));
    };

    // Totais
    const selecionados = folha.filter(f => f.selecionado);
    const totalPagar = selecionados.reduce((acc, f) => acc + (parseFloat(f.liquidoFinal) || 0), 0);

    const handleProcessarFolha = async () => {
        if (!selectedConta) {
            mostrarToast('Selecione a conta de débito.', 'aviso');
            return;
        }
        if (selecionados.length === 0) {
            mostrarToast('Selecione pelo menos um empregado.', 'aviso');
            return;
        }

        const confirmado = await mostrarConfirmacao(
            `Confirma o pagamento da folha para <strong>${selecionados.length} empregados</strong>?<br><br>Total: <strong>${formatarMoeda(totalPagar)}</strong><br>Ref: ${selectedReferencia.label}`,
            { tipo: 'aviso', textoConfirmar: 'Confirmar Folha' }
        );
        if (!confirmado) return;

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            
            // Vamos iterar e mandar um request por funcionário (para manter registros individuais no banco)
            // Ou criar uma rota de lote para salário.
            // Pela simplicidade e volume (geralmente < 50), loop de requests funciona bem e mantém a lógica de registro individual.
            // Para ultra-performance, criaríamos rota de lote, mas vamos reutilizar a /efetuar que já é robusta.
            
            // Faremos em paralelo com Promise.all para ser rápido
            const promises = selecionados.map(item => {
                const valorFinal = parseFloat(item.liquidoFinal) || 0;
                
                const payload = {
                    calculo: {
                        detalhes: {
                            funcionario: { id: item.id, nome: item.nome },
                            ciclo: { nome: `Salário ${selectedReferencia.value}` },
                            tipoPagamento: 'SALARIO'
                        },
                        proventos: { salarioProporcional: item.base, comissao: 0, valeTransporte: 0, beneficios: 0 },
                        descontos: { inss: item.inss, valeTransporte: item.vt },
                        totais: { totalLiquidoAPagar: valorFinal }
                    },
                    id_conta_debito: selectedConta.value
                };

                return fetch('/api/pagamentos/efetuar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                }).then(async res => {
                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(`${item.nome}: ${err.error}`);
                    }
                    return item.nome; // Sucesso
                });
            });

            await Promise.all(promises);

            mostrarToast('Folha de pagamento processada com sucesso!', 'sucesso');
            
            // Marca como pago visualmente na hora
            setFolha(prev => prev.map(item => 
                item.selecionado ? { ...item, selecionado: false, pago: true } : item
            ));

        } catch (error) {
            console.error(error);
            mostrarToast('Erro ao processar alguns pagamentos. Verifique o console.', 'erro');
        } finally {
            setLoading(false);
        }
    };

    const contaOptions = contas.map(c => ({ value: c.id, label: c.nome_conta }));

    return (
        <div className="cpg-card">
            <h2 className="cpg-section-title">Folha de Pagamento Mensal</h2>

            <div className="cpg-form-row" style={{alignItems:'flex-end'}}>
                <div className="cpg-form-group" style={{minWidth:'200px'}}>
                    <label>Referência</label>
                    <Select
                        options={opcoesReferencia}
                        value={selectedReferencia}
                        onChange={setSelectedReferencia}
                        placeholder="Selecione..."
                        styles={{ control: (base) => ({ ...base, borderColor: '#ced4da', borderRadius: '6px' }) }}
                    />
                </div>
                <div className="cpg-form-group">
                    <label>Conta de Saída</label>
                    <Select options={contaOptions} value={selectedConta} onChange={setSelectedConta} placeholder="Selecione..." />
                </div>
                <div className="cpg-form-group">
                    <div style={{background:'#f8f9fa', padding:'10px', borderRadius:'6px', textAlign:'right'}}>
                        <small>Total Selecionado</small>
                        <div style={{fontSize:'1.2rem', fontWeight:'bold', color:'var(--cpg-cor-despesa)'}}>
                            {formatarMoeda(totalPagar)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="cpg-tabela-container" style={{marginTop:'20px'}}>
                <table className="cpg-tabela-detalhes">
                    <thead>
                        <tr>
                            <th style={{textAlign:'center', width:'40px'}}>
                                <input type="checkbox" onChange={handleToggleAll} checked={selecionados.length > 0 && selecionados.length === folha.filter(f=>!f.pago).length} />
                            </th>
                            <th>Empregado</th>
                            <th style={{textAlign:'right'}}>Salário Base</th>
                            <th style={{textAlign:'right', color:'#e74c3c'}}>(-) INSS</th>
                            <th style={{textAlign:'right', color:'#e74c3c'}}>(-) VT</th>
                            <th style={{textAlign:'right'}}>Líquido (Editável)</th>
                            <th style={{textAlign:'center'}}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {folha.map(item => (
                            <tr key={item.id} style={{opacity: item.pago ? 0.5 : 1, background: item.selecionado ? '#f0f8ff' : 'transparent'}}>
                                <td style={{textAlign:'center'}}>
                                    <input 
                                        type="checkbox" 
                                        checked={item.selecionado} 
                                        onChange={() => handleSelectChange(item.id)}
                                        disabled={item.pago}
                                    />
                                </td>
                                <td>{item.nome}</td>
                                <td style={{textAlign:'right'}}>{formatarMoeda(item.base)}</td>
                                <td style={{textAlign:'right', color:'#e74c3c'}}>{formatarMoeda(item.inss)}</td>
                                <td style={{textAlign:'right', color:'#e74c3c'}}>{formatarMoeda(item.vt)}</td>
                                <td style={{textAlign:'right'}}>
                                    <input 
                                        type="number" step="0.01"
                                        className="cpg-input"
                                        style={{width:'100px', textAlign:'right', padding:'5px', fontWeight:'bold'}}
                                        value={item.liquidoFinal}
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

            <button 
                className="cpg-btn cpg-btn-primario" 
                style={{width:'100%', marginTop:'20px', height:'50px', fontSize:'1.1rem'}}
                onClick={handleProcessarFolha}
                disabled={loading || selecionados.length === 0}
            >
                {loading ? 'Processando...' : `Confirmar Pagamento (${selecionados.length})`}
            </button>
        </div>
    );
}