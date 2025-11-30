// public/src/components/OPPainelAtividades.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import OPStatusCard from './OPStatusCard.jsx';
import { mostrarMensagem, mostrarConfirmacao, mostrarPromptNumerico } from '/js/utils/popups.js';
import OPAtribuicaoModal from './OPAtribuicaoModal.jsx';

export default function OPPainelAtividades() {
    const [funcionarios, setFuncionarios] = useState([]);
    const [temposPadraoProducao, setTemposPadraoProducao] = useState({});
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);

    const [modalAberto, setModalAberto] = useState(false);
    const [funcionarioSelecionado, setFuncionarioSelecionado] = useState(null);

    // --- NOVO ESTADO PARA O ACCORDION (SUBSTITUI O JS MANUAL) ---
    const [accordionAberto, setAccordionAberto] = useState(false);

    const pollingTimeoutRef = useRef(null);
    const cronometroIntervalRef = useRef(null);

    // --- 1. BUSCA DE DADOS ---
    const buscarDadosPainel = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const [dataFuncionarios, dataTempos] = await Promise.all([
                fetch('/api/producao/status-funcionarios', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => {
                    if (!res.ok) throw new Error('Falha ao carregar status.');
                    return res.json();
                }),
                fetch('/api/producao/tempos-padrao', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => {
                    if (!res.ok) return {};
                    return res.json();
                })
            ]);

            setFuncionarios(dataFuncionarios);
            setTemposPadraoProducao(dataTempos);
            setErro(null);
        } catch (err) {
            console.error("Erro no polling:", err);
        } finally {
            setCarregando(false);
        }
    }, []);

    // --- 2. POLLING INTELIGENTE ---
    useEffect(() => {
        const POLLING_INTERVAL = 20000; 
        const executarPolling = async () => {
            if (!document.hidden) {
                await buscarDadosPainel();
            }
            pollingTimeoutRef.current = setTimeout(executarPolling, POLLING_INTERVAL);
        };
        executarPolling();

        const handleVisibilityChange = () => {
            if (!document.hidden) {
                clearTimeout(pollingTimeoutRef.current);
                executarPolling();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearTimeout(pollingTimeoutRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [buscarDadosPainel]);

    // --- 3. CRONÔMETRO ---
    useEffect(() => {
        const atualizarCronometros = () => {
            const cards = document.querySelectorAll('.oa-card-status-tiktik.status-produzindo');
            
            cards.forEach(card => {
                const inicioISO = card.dataset.inicio;
                if (!inicioISO) return;
                
                const inicio = new Date(inicioISO).getTime();
                if (isNaN(inicio)) return;

                const agora = Date.now();
                const diferencaEmMilissegundos = Math.max(0, agora - inicio);
                
                const tempoFormatado = new Date(diferencaEmMilissegundos).toISOString().substr(11, 8);
                
                const cronometroEl = card.querySelector('.cronometro-tarefa');
                if (cronometroEl) {
                    cronometroEl.innerHTML = `<i class="fas fa-clock"></i> ${tempoFormatado}`;
                }

                const tpp = parseFloat(card.dataset.tpp);
                const quantidade = parseInt(card.dataset.quantidade, 10);
                const barraEl = card.querySelector('.barra-progresso');
                const indicadorRitmoEl = card.querySelector('.indicador-ritmo-tarefa');
                
                if (barraEl && !isNaN(tpp) && tpp > 0 && !isNaN(quantidade) && quantidade > 0) {
                    const tempoTotalEstimadoMs = tpp * quantidade * 1000;
                    if (tempoTotalEstimadoMs > 0) {
                        const progressoReal = (diferencaEmMilissegundos / tempoTotalEstimadoMs) * 100;
                        const progressoVisual = Math.min(100, progressoReal);
                        
                        barraEl.style.width = `${progressoVisual}%`;
                        
                        let ritmoTexto = '...';
                        let ritmoIcone = '👍';
                        let corClasse = 'normal';

                        if (progressoReal >= 120) {
                            ritmoTexto = 'Lento'; ritmoIcone = '🐢'; corClasse = 'lento';
                        } else if (progressoReal >= 100) {
                            ritmoTexto = 'Atenção'; ritmoIcone = '⚠️'; corClasse = 'atencao';
                        } else if (progressoReal >= 60) {
                            ritmoTexto = 'No Ritmo'; ritmoIcone = '👍'; corClasse = 'normal';
                        } else if (progressoReal >= 30) {
                            ritmoTexto = 'Rápido'; ritmoIcone = '✅'; corClasse = 'rapido';
                        } else {
                            ritmoTexto = 'Super Rápido'; ritmoIcone = '🚀'; corClasse = 'super-rapido';
                        }

                        barraEl.classList.remove('normal', 'lento', 'atencao', 'rapido', 'super-rapido');
                        barraEl.classList.add(corClasse);

                        if (indicadorRitmoEl) {
                            indicadorRitmoEl.innerHTML = `${ritmoIcone} ${ritmoTexto}`;
                        }
                    }
                }
            });
        };

        cronometroIntervalRef.current = setInterval(atualizarCronometros, 1000);
        return () => clearInterval(cronometroIntervalRef.current);
    }, []); 


    const handleAtribuirTarefa = (funcionario) => {
        setFuncionarioSelecionado(funcionario);
        setModalAberto(true);
    };

    const handleCloseModal = () => {
        setModalAberto(false);
        setFuncionarioSelecionado(null);
        buscarDadosPainel();
    };

    const handleAcaoManual = async (funcionario, acao) => {
         const confirmado = await mostrarConfirmacao(`Confirmar ação?`, 'aviso');
         if(!confirmado) return;
         try {
             const token = localStorage.getItem('token');
             await fetch(`/api/usuarios/${funcionario.id}/status`, {
                 method: 'PUT',
                 headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
                 body: JSON.stringify({ status: acao })
             });
             mostrarMensagem('Status atualizado!', 'sucesso');
             buscarDadosPainel();
         } catch(e) { mostrarMensagem(e.message, 'erro'); }
    };

    const handleFinalizarTarefa = async (funcionario) => {
        const { tarefa_atual } = funcionario;
        if (!tarefa_atual || !tarefa_atual.id_sessao) {
            mostrarMensagem("Erro: Sessão inválida.", "erro");
            return;
        }
        const quantidadeFinal = await mostrarPromptNumerico(
            `Finalizar tarefa de ${funcionario.nome}? Confirme a quantidade:`,
            { valorInicial: tarefa_atual.quantidade, tipo: 'info' }
        );
        if (quantidadeFinal === null || quantidadeFinal === '') return;
        
        try {
            const token = localStorage.getItem('token');
            await fetch('/api/producoes/finalizar', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_sessao: tarefa_atual.id_sessao, quantidade_finalizada: Number(quantidadeFinal) })
            });
            mostrarMensagem('Finalizado!', 'sucesso');
            buscarDadosPainel();
        } catch (err) { mostrarMensagem(err.message, 'erro'); }
    };

    const handleCancelarTarefa = async (funcionario) => {
        const { tarefa_atual } = funcionario;
        if (!tarefa_atual || !tarefa_atual.id_sessao) return;
        if(!await mostrarConfirmacao(`Cancelar tarefa de ${funcionario.nome}?`, 'aviso')) return;

        try {
            const token = localStorage.getItem('token');
            await fetch('/api/producao/sessoes/cancelar', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_sessao: tarefa_atual.id_sessao })
            });
            mostrarMensagem('Cancelado!', 'sucesso');
            buscarDadosPainel();
        } catch (err) { mostrarMensagem(err.message, 'erro'); }
    };

    
    if (carregando) return <div className="spinner">Carregando painel...</div>;
    if (erro) return <p style={{ color: 'red', textAlign: 'center' }}>Erro: {erro}</p>;

    const statusPrincipais = ['PRODUZINDO', 'LIVRE', 'LIVRE_MANUAL'];
    const funcionariosPrincipais = funcionarios.filter(f => statusPrincipais.includes(f.status_atual));
    const funcionariosInativos = funcionarios.filter(f => !statusPrincipais.includes(f.status_atual));

    return (
        <>
            <div className="oa-main-content-card">
                <section className="oa-painel-atividades">
                    <div className="oa-secao-header">
                        <h2 className="oa-titulo-secao">Painel de Atividades - Produção</h2>
                    </div>

                    <div className="oa-painel-status-grid">
                        {funcionariosPrincipais.map(func => {
                            const tppDaTarefa = temposPadraoProducao[`${func.tarefa_atual?.produto_id}-${func.tarefa_atual?.processo}`];
                            return (
                                <OPStatusCard 
                                    key={func.id} 
                                    funcionario={func} 
                                    tpp={tppDaTarefa}
                                    onAtribuirTarefa={handleAtribuirTarefa} 
                                    onAcaoManual={handleAcaoManual}
                                    onFinalizarTarefa={handleFinalizarTarefa}
                                    onCancelarTarefa={handleCancelarTarefa}
                                />
                            );
                        })}
                    </div>

                    {/* --- ACCORDION CONTROLADO PELO REACT --- */}
                    {funcionariosInativos.length > 0 && (
                        <div className="oa-accordion-inativos" style={{marginTop: '20px'}}>
                            <button 
                                className={`oa-accordion-header ${accordionAberto ? 'active' : ''}`}
                                onClick={() => setAccordionAberto(!accordionAberto)}
                            >
                                <span>Em Pausa / Inativos</span>
                                <span className="oa-accordion-badge">{funcionariosInativos.length}</span>
                                <i className="fas fa-chevron-down accordion-icone"></i>
                            </button>
                            
                            {/* Controlamos a exibição aqui diretamente */}
                            <div className="oa-accordion-content" style={{ display: accordionAberto ? 'block' : 'none' }}>
                                <div className="oa-painel-status-grid">
                                    {funcionariosInativos.map(func => {
                                        const tppDaTarefa = temposPadraoProducao[`${func.tarefa_atual?.produto_id}-${func.tarefa_atual?.processo}`];
                                        return (
                                            <OPStatusCard 
                                                key={func.id} 
                                                funcionario={func} 
                                                tpp={tppDaTarefa}
                                                onAtribuirTarefa={handleAtribuirTarefa} 
                                                onAcaoManual={handleAcaoManual}
                                                onFinalizarTarefa={handleFinalizarTarefa}
                                                onCancelarTarefa={handleCancelarTarefa}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <OPAtribuicaoModal 
                isOpen={modalAberto}
                onClose={handleCloseModal}
                funcionario={funcionarioSelecionado}
            />
        </>
    );
}