// public/src/components/RelatoriosView.jsx

import React, { useState, useEffect, useCallback } from 'react';
import GraficoDespesasPizza from './GraficoDespesasPizza.jsx';


// Função para formatar números como moeda (R$)
const formatCurrency = (value) => {
    if (typeof value !== 'number') return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Hook customizado para pegar datas (ex: início do mês e hoje)
const useDatePresets = () => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Formata as datas para o formato YYYY-MM-DD que o input[type=date] aceita
    const formatDate = (date) => date.toISOString().split('T')[0];

    return {
        today: formatDate(today),
        firstDayOfMonth: formatDate(firstDayOfMonth),
    };
};

export default function RelatoriosView() {
    const { today, firstDayOfMonth } = useDatePresets();

    // Estado para os filtros de data
    const [datas, setDatas] = useState({ inicio: firstDayOfMonth, fim: today });
    
    // Estados para armazenar os dados dos relatórios
    const [dadosDRE, setDadosDRE] = useState(null);
    const [dadosCategorias, setDadosCategorias] = useState(null);
    
    // Estados de controle da UI
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Função para buscar os dados da API
    const fetchRelatorios = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            const token = localStorage.getItem('token');
            const { inicio, fim } = datas;
            
            if (!inicio || !fim) {
                throw new Error("Por favor, selecione as datas de início e fim.");
            }

            // Cria os parâmetros de URL
            const params = new URLSearchParams({ dataInicio: inicio, dataFim: fim });

            // Busca os dois relatórios em paralelo para mais performance
            const [resDRE, resCategorias] = await Promise.all([
                fetch(`/api/financeiro/relatorios/dre-simplificado?${params.toString()}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`/api/financeiro/relatorios/despesas-por-categoria?${params.toString()}`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (!resDRE.ok || !resCategorias.ok) {
                throw new Error('Falha ao buscar os dados dos relatórios.');
            }

            const dreData = await resDRE.json();
            const categoriasData = await resCategorias.json();
            
            // Mapeia os dados das categorias, convertendo o campo 'valor' para número
            const categoriasDataNumericas = categoriasData.map(categoria => ({
                ...categoria,
                valor: parseFloat(categoria.valor) // Converte a string "1234.00" para o número 1234.00
            }));
            
            setDadosDRE(dreData);
            setDadosCategorias(categoriasDataNumericas); // << Salva os dados já convertidos no estado

        } catch (err) {
            setError(err.message);
            setDadosDRE(null);
            setDadosCategorias(null);
        } finally {
            setIsLoading(false);
        }
    }, [datas]); // A função será recriada se o estado 'datas' mudar

    // Efeito para buscar os dados na primeira vez que o componente carrega
    useEffect(() => {
        fetchRelatorios();
    }, []); // O array vazio [] garante que rode apenas uma vez

    // Handler para atualizar o estado das datas
    const handleDateChange = (e) => {
        setDatas(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    return (
        <div className="fc-card" style={{ padding: '25px' }}>
            {/* Cabeçalho com Filtros */}
            <header className="fc-table-header" style={{ marginBottom: '30px' }}>
                <h2 className="fc-section-title" style={{ border: 0, margin: 0 }}>Central de Relatórios</h2>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <div className="fc-form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="inicio">De:</label>
                        <input type="date" name="inicio" id="inicio" className="fc-input" value={datas.inicio} onChange={handleDateChange} />
                    </div>
                    <div className="fc-form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="fim">Até:</label>
                        <input type="date" name="fim" id="fim" className="fc-input" value={datas.fim} onChange={handleDateChange} />
                    </div>
                    <button onClick={fetchRelatorios} className="fc-btn fc-btn-primario" disabled={isLoading}>
                        {isLoading ? 'Gerando...' : 'Gerar Relatório'}
                    </button>
                </div>
            </header>

            {/* Corpo dos Relatórios */}
            {isLoading && <div className="fc-spinner"><span>Carregando dados...</span></div>}
            
            {error && <p style={{ color: 'red', textAlign: 'center' }}>Erro: {error}</p>}

            {!isLoading && !error && dadosDRE && (
                <div className="relatorios-grid">
                    {/* Linha 1: KPIs do DRE */}
                    <div className="kpi-card" style={{ backgroundColor: 'var(--gs-positivo-fundo)', borderLeftColor: 'var(--gs-sucesso)' }}>
                        <div className="kpi-label">Total de Receitas</div>
                        <div className="kpi-value" style={{ color: 'var(--gs-sucesso)' }}>{formatCurrency(dadosDRE.totalReceitas)}</div>
                    </div>
                    <div className="kpi-card" style={{ backgroundColor: 'var(--gs-negativo-fundo)', borderLeftColor: 'var(--gs-perigo)' }}>
                        <div className="kpi-label">Total de Despesas</div>
                        <div className="kpi-value" style={{ color: 'var(--gs-perigo)' }}>{formatCurrency(dadosDRE.totalDespesas)}</div>
                    </div>
                    <div className="kpi-card" style={{ backgroundColor: 'var(--gs-fundo-alternativo)', borderLeftColor: dadosDRE.resultado >= 0 ? 'var(--gs-sucesso)' : 'var(--gs-perigo)' }}>
                        <div className="kpi-label">Resultado (Receitas - Despesas)</div>
                        <div className="kpi-value" style={{ color: dadosDRE.resultado >= 0 ? 'var(--gs-sucesso)' : 'var(--gs-perigo)' }}>{formatCurrency(dadosDRE.resultado)}</div>
                    </div>

                    {/* Espaço para o Gráfico de Despesas por Categoria */}
                    <div className="relatorio-widget" style={{ gridColumn: '1 / -1' }}>
                        <h3 className="widget-title">Top 10 Despesas por Categoria</h3>
                        {dadosCategorias && dadosCategorias.length > 0 ? (
                            <GraficoDespesasPizza data={dadosCategorias} />
                        ) : (
                            <p style={{ textAlign: 'center', color: '#7f8c8d' }}>
                                Nenhuma despesa registrada no período para exibir no gráfico.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}