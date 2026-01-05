import React, { useState } from 'react';

export default function CPAGMultiDatePicker({ 
    diasSelecionados, 
    onToggleDia, 
    readOnly = false, 
    diasBloqueados = [],
    legendaBloqueado = "Já Pago", // <--- NOVA PROP COM VALOR PADRÃO
    legendaSelecionado = "Selecionado" // <--- NOVA PROP
}) {
    const [dataBase, setDataBase] = useState(new Date());

    const ano = dataBase.getFullYear();
    const mes = dataBase.getMonth();

    const nomesDias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    const mudarMes = (offset) => {
        setDataBase(new Date(ano, mes + offset, 1));
    };

    const getDataStr = (d) => d.toLocaleDateString('en-CA');

    // --- LÓGICA DE GRADE COMPLETA (Mês Anterior + Atual + Próximo) ---
    const gerarGradeDias = () => {
        const primeiroDiaMes = new Date(ano, mes, 1);
        const ultimoDiaMes = new Date(ano, mes + 1, 0);
        
        const diaSemanaInicio = primeiroDiaMes.getDay(); // 0 (Dom) a 6 (Sab)
        const totalDiasMes = ultimoDiaMes.getDate();
        
        const dias = [];

        // Dias do mês anterior (para preencher o começo)
        const ultimoDiaMesAnterior = new Date(ano, mes, 0).getDate();
        for (let i = diaSemanaInicio - 1; i >= 0; i--) {
            const d = new Date(ano, mes - 1, ultimoDiaMesAnterior - i);
            dias.push({ data: d, outroMes: true });
        }

        // Dias do mês atual
        for (let i = 1; i <= totalDiasMes; i++) {
            const d = new Date(ano, mes, i);
            dias.push({ data: d, outroMes: false });
        }

        // Dias do mês seguinte (para completar 42 slots - 6 semanas)
        const diasFaltantes = 42 - dias.length;
        for (let i = 1; i <= diasFaltantes; i++) {
            const d = new Date(ano, mes + 1, i);
            dias.push({ data: d, outroMes: true });
        }

        return dias;
    };

    const grade = gerarGradeDias();

    const handleDiaClick = (dataObj) => {
        const str = getDataStr(dataObj.data);
        // Removemos a verificação de diasBloqueados.includes(str) para permitir re-seleção
        if (readOnly) return; 
        
        onToggleDia(str);
    };

    return (
        <div className="cpg-datepicker-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '10px', background: '#fff', width: '100%', maxWidth: '320px' }}>
            {/* Header Navegação */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                <button onClick={() => mudarMes(-1)} className="cpg-btn-icon-small" style={{cursor:'pointer'}}>&lt;</button>
                <span style={{ fontWeight: 'bold' }}>{meses[mes]} {ano}</span>
                <button onClick={() => mudarMes(1)} className="cpg-btn-icon-small" style={{cursor:'pointer'}}>&gt;</button>
            </div>

            {/* Dias da Semana */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '5px', fontSize: '0.8rem', color: '#666' }}>
                {nomesDias.map((d, i) => <div key={i}>{d}</div>)}
            </div>

            {/* Grid de Dias */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {grade.map((item, i) => {
                    const dataStr = getDataStr(item.data);
                    const selecionado = diasSelecionados.includes(dataStr);
                    const bloqueado = diasBloqueados.includes(dataStr);

                    // Estilo
                    let bg = 'transparent';
                    let color = item.outroMes ? '#ccc' : '#333'; // Dias de outro mês mais claros
                    let cursor = readOnly ? 'default' : 'pointer';
                    let border = 'none';
                    let fontWeight = 'normal';

                    // PRIORIDADE 1: Se está selecionado agora, fica AZUL (para vc ver o que está fazendo)
                    if (selecionado) {
                        bg = 'var(--cpg-cor-primaria)';
                        color = '#fff';
                        fontWeight = 'bold';
                    } 
                    // PRIORIDADE 2: Se não está selecionado, mas já foi gerado, fica CINZA
                    else if (bloqueado) {
                        bg = '#e0e0e0';
                        color = '#999';
                        cursor = 'pointer'; // Libera o cursor para permitir clique
                        border = '1px solid #ccc';
                    } else if (!item.outroMes) {
                        // Hover apenas para dias do mês atual não selecionados
                        // (feito via JS inline ou classe CSS seria melhor, mas mantendo padrão)
                    }

                    return (
                        <div
                            key={i}
                            onClick={() => handleDiaClick(item)}
                            style={{
                                padding: '8px 0',
                                textAlign: 'center',
                                borderRadius: '4px',
                                backgroundColor: bg,
                                color: color,
                                border: border,
                                cursor: cursor,
                                fontWeight: fontWeight,
                                fontSize: '0.9rem',
                                opacity: (item.outroMes && !selecionado) ? 0.6 : 1 // Suaviza visualmente dias de fora
                            }}
                        >
                            {item.data.getDate()}
                        </div>
                    );
                })}
            </div>
            
            {/* LEGENDA INTERNA (AGORA DINÂMICA) */}
            <div style={{marginTop:'10px', display:'flex', gap:'10px', justifyContent:'center', fontSize:'0.75rem', borderTop:'1px solid #eee', paddingTop:'10px'}}>
                <div style={{display:'flex', alignItems:'center', gap:'4px'}}>
                    <div style={{width:'10px', height:'10px', background:'var(--cpg-cor-primaria)', borderRadius:'50%'}}></div>
                    <span>{legendaSelecionado}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'4px'}}>
                    <div style={{width:'10px', height:'10px', background:'#e0e0e0', border:'1px solid #ccc', borderRadius:'50%'}}></div>
                    <span>{legendaBloqueado}</span>
                </div>
            </div>
        </div>
    );
}