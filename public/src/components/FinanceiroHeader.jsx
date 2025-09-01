import React, { useState, useEffect, useCallback, useRef } from 'react';

// (Componente IconeComBadge e função formatTimeAgo não mudam)
const IconeComBadge = ({ icone, contagem, temNovidade, corBadge = 'red', onClick }) => ( <button className="fc-btn-icon" onClick={onClick} style={{ position: 'relative' }}> <i className={`fas ${icone}`}></i> {contagem > 0 && ( <span className="fc-badge" style={{ position: 'absolute', top: '-5px', right: '-8px', backgroundColor: corBadge, border: '2px solid white', minWidth: '22px', height: '22px', borderRadius: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} > {contagem} </span> )} {temNovidade && !contagem && ( <span className="fc-badge-dot" style={{ position: 'absolute', top: '2px', right: '2px', width: '10px', height: '10px', backgroundColor: corBadge, borderRadius: '50%', border: '2px solid white' }} ></span> )} </button> );
function formatTimeAgo(dateString) { if (!dateString) return 'há pouco'; const date = new Date(dateString); const now = new Date(); const seconds = Math.round((now - date) / 1000); if (seconds < 60) return `agora mesmo`; const minutes = Math.round(seconds / 60); if (minutes < 60) return `há ${minutes} min`; const hours = Math.round(minutes / 60); if (hours < 24) return `há ${hours}h`; const days = Math.round(hours / 24); return `há ${days}d`; }

// Componente principal do Header
export default function FinanceiroHeader() {
    // --- ESTADOS ---
    const [statusData, setStatusData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [abaAtiva, setAbaAtiva] = useState('Dashboard');
    const [periodoAtivo, setPeriodoAtivo] = useState('Este Mês');
    const [buscaAtiva, setBuscaAtiva] = useState(false);
    const [viewAtiva, setViewAtiva] = useState('main');
    
    // --- REFs PARA CONTROLE ---
    const initialLoadDone = useRef(false);
    const etagRef = useRef(null); 

    const formatCurrency = (value) => { if (typeof value !== 'number') return 'R$ 0,00'; return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); };

    // --- LÓGICA E EFEITOS ---
    const fetchHeaderData = useCallback(async (isPolling = false) => {
        // Se for uma chamada de polling e já estivermos carregando, aborta para evitar sobreposição
        if (isPolling && isLoading) return;

        // Na busca inicial, ativamos o isLoading
        if (!isPolling) {
            setIsLoading(true);
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Token não encontrado");

            const headers = { 'Authorization': `Bearer ${token}` };
            if (etagRef.current) {
                headers['If-None-Match'] = etagRef.current;
            }

            const response = await fetch('/api/financeiro/header-status', { headers });

            if (response.status === 304) {
                return; // Não faz nada, os dados estão atualizados
            }
            
            if (!response.ok) { const errorData = await response.json().catch(() => ({ error: 'Falha ao buscar dados do header' })); throw new Error(errorData.error); }
            
            const data = await response.json();
            
            const newEtag = response.headers.get('ETag');
            if (newEtag) {
                etagRef.current = newEtag;
            }
            
            setStatusData({ ...data, ultimaAtividade: { texto: `${data.ultimaAtividade.detalhes} (${formatTimeAgo(data.ultimaAtividade.data_evento)})`, nova: false }, novasAtividadesFeed: false });

        } catch (err) {
            console.error("Erro ao buscar dados do Header:", err);
            setError(err.message);
        } finally {
            if (!isPolling) {
                setIsLoading(false);
                if (!initialLoadDone.current) {
                    window.dispatchEvent(new CustomEvent('reactHeaderReady'));
                    initialLoadDone.current = true;
                }
            }
        }
    }, [isLoading]); // Depende de isLoading para evitar sobreposição

    // Efeito para a busca INICIAL
    useEffect(() => {
        fetchHeaderData(false); // Chama com isPolling = false
    }, []); // Roda apenas uma vez na montagem inicial

    // Efeito para o POLLING (inicia APÓS a carga inicial)
    useEffect(() => {
        if (isLoading) return; // Espera a carga inicial terminar

        const intervalId = setInterval(() => {
            fetchHeaderData(true); // Chama com isPolling = true
        }, 10000); // Intervalo de 10 segundos

        return () => clearInterval(intervalId);
    }, [isLoading, fetchHeaderData]);

    // Efeito para ouvir eventos do JavaScript legado
    useEffect(() => {
        const handleMudancaDeAba = (event) => { if (event.detail && event.detail.nomeAba) { setAbaAtiva(event.detail.nomeAba); setViewAtiva('main'); } };
        const handleMudancaDeView = (event) => { if (event.detail && event.detail.view) { setViewAtiva(event.detail.view); } };
        window.addEventListener('abaFinanceiroAlterada', handleMudancaDeAba);
        window.addEventListener('navegarParaViewFinanceiro', handleMudancaDeView);
        return () => { window.removeEventListener('abaFinanceiroAlterada', handleMudancaDeAba); window.removeEventListener('navegarParaViewFinanceiro', handleMudancaDeView); };
    }, []);

    // --- FUNÇÕES DE INTERAÇÃO ---
    const handleVoltar = () => { window.dispatchEvent(new CustomEvent('navegarParaViewFinanceiro', { detail: { view: 'main' } })); };
    const handleAlertaClick = (filtro) => { window.dispatchEvent(new CustomEvent('filtrarAgendaPorAlerta', { detail: { filtro } })); };
    const navegarParaView = (view) => { window.dispatchEvent(new CustomEvent('navegarParaViewFinanceiro', { detail: { view } })); };

    // --- RENDERIZAÇÃO ---
    if (isLoading) { return <div className="financeiro-header-react" style={{ height: '145px', backgroundColor: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '10px', borderRadius: '8px' }}>Carregando Painel...</div>; }
    if (error) { return <div className="financeiro-header-react" style={{ borderColor: '#e74c3c' }}><p style={{color: '#c0392b'}}>Erro ao carregar o painel: {error}</p></div>; }

    return (
        <header className="financeiro-header-react">
            {/* LINHA 1: Painel de Alertas e Status */}
            <div className="header-linha-status">
                <div className="alertas-container">
                    {statusData.contasAtrasadas.count > 0 ? (
                        <div className="alerta-card-header alerta-atrasado" role="button" tabIndex="0" onClick={() => handleAlertaClick('atrasadas')}>
                            <i className="fas fa-exclamation-triangle alerta-icone-principal"></i>
                            <div className="alerta-texto">
                                <strong className="alerta-contagem">{statusData.contasAtrasadas.count} Atrasada(s)</strong>
                                <span className="alerta-total">{formatCurrency(statusData.contasAtrasadas.total)}</span>
                            </div>
                            <i className="fas fa-arrow-right alerta-icone-acao"></i>
                        </div>
                    ) : (
                        <div className="alerta-card-header alerta-ok" role="button" tabIndex="0">
                            <i className="fas fa-check-circle alerta-icone-principal"></i>
                            <div className="alerta-texto">
                                <strong className="alerta-contagem">Contas em Dia</strong>
                                <span className="alerta-total">Nenhuma pendência atrasada.</span>
                            </div>
                        </div>
                    )}

                    {statusData.contasVencendoHoje.count > 0 ? (
                        <div className="alerta-card-header alerta-hoje" role="button" tabIndex="0" onClick={() => handleAlertaClick('hoje')}>
                            <i className="fas fa-calendar-day alerta-icone-principal"></i>
                            <div className="alerta-texto">
                                <strong className="alerta-contagem">{statusData.contasVencendoHoje.count} para Hoje</strong>
                                <span className="alerta-total">{formatCurrency(statusData.contasVencendoHoje.total)}</span>
                            </div>
                             <i className="fas fa-arrow-right alerta-icone-acao"></i>
                        </div>
                    ) : (
                        <div className="alerta-card-header alerta-ok" role="button" tabIndex="0">
                            <i className="fas fa-check-circle alerta-icone-principal"></i>
                            <div className="alerta-texto">
                                <strong className="alerta-contagem">Nada para Hoje</strong>
                                <span className="alerta-total">Sem vencimentos hoje.</span>
                            </div>
                        </div>
                    )}
                </div>
                {statusData.ultimaAtividade && (
                    <div 
                        className={`ultima-atividade ${statusData.ultimaAtividade.nova ? 'nova-atividade' : ''}`}
                        role="button"
                        tabIndex="0"
                        onClick={() => navegarParaView('historico')}
                    >
                        <i className="fas fa-history"></i>
                        <span className="texto-atividade">{statusData.ultimaAtividade.texto}</span>
                    </div>
                )}
            </div>

            {/* LINHA 2: Navegação e Ferramentas */}
            <div className={`header-linha-acoes ${buscaAtiva ? 'modo-busca' : ''}`}>
                <div className="navegacao-titulo">
                    {viewAtiva !== 'main' ? (
                        <button className="btn-voltar-header" onClick={handleVoltar}>
                            <i className="fas fa-chevron-left"></i>
                            <h1>
                                {viewAtiva === 'config' && 'Configurações'}
                                {viewAtiva === 'aprovacoes' && 'Aprovações'}
                                {viewAtiva === 'historico' && 'Histórico'}
                            </h1>
                        </button>
                    ) : (
                        <h1>{abaAtiva}</h1>
                    )}
                </div>

                <div className="acoes-principais">
                    <div className="busca-global-wrapper">
                        <button className="btn-abrir-busca" onClick={() => setBuscaAtiva(true)}>
                            <i className="fas fa-search"></i>
                        </button>
                        <i className="fas fa-search icone-input-busca"></i>
                        <input type="text" placeholder={`Buscar em ${abaAtiva}...`} className="busca-global-input" />
                        <button className="btn-fechar-busca" onClick={() => setBuscaAtiva(false)}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>

                    <div className="seletor-periodo-wrapper">
                        <button className="seletor-periodo-btn">
                            <i className="fas fa-calendar-alt"></i>
                            <span>{periodoAtivo}</span>
                            <i className="fas fa-chevron-down"></i>
                        </button>
                    </div>

                    <div className="grupo-icones-status">
                        <IconeComBadge 
                            icone="fa-check-double" 
                            contagem={statusData.aprovacoesPendentes} 
                            corBadge="var(--fc-cor-aviso)" 
                            onClick={() => navegarParaView('aprovacoes')}
                        />
                        <IconeComBadge 
                            icone="fa-stream" 
                            temNovidade={statusData.novasAtividadesFeed} 
                            corBadge="var(--fc-cor-primaria)"
                            onClick={() => navegarParaView('historico')}
                        />
                        <button className="fc-btn-icon" onClick={() => navegarParaView('config')}>
                            <i className="fas fa-cog"></i>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}