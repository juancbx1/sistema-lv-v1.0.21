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

    const pollingTimeoutRef = useRef(null);

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

    // --- 2. POLLING OTIMIZADO (SEM LOOP INFINITO) ---
    useEffect(() => {
        // Busca inicial
        buscarDadosPainel();

        // Configura atualização ao voltar para a aba
        const handleFocus = () => {
            // console.log("Foco na aba Painel: Atualizando...");
            buscarDadosPainel();
        };

        window.addEventListener('focus', handleFocus);

        return () => {
            window.removeEventListener('focus', handleFocus);
        };
    }, [buscarDadosPainel]);

 


    const handleAtribuirTarefa = (funcionario) => {
        setFuncionarioSelecionado(funcionario);
        setModalAberto(true);
    };

    const handleCloseModal = () => {
        setModalAberto(false);
        setFuncionarioSelecionado(null);
        buscarDadosPainel();
    };

    const handleAcaoManual = async (funcionario, acao, mensagem) => {
         const textoConfirmacao = mensagem || `Confirmar ação para ${funcionario.nome}?`;
         const confirmado = await mostrarConfirmacao(textoConfirmacao, 'aviso');
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

    const qtdProduzindo = funcionarios.filter(f => f.status_atual === 'PRODUZINDO').length;
    const qtdDisponivel = funcionarios.filter(f => ['LIVRE', 'LIVRE_MANUAL'].includes(f.status_atual)).length;
    const temAlguemProduzindo = qtdProduzindo > 0;

    const getIconeInativo = (status) => {
        const map = {
            PAUSA: 'fa-coffee', PAUSA_MANUAL: 'fa-coffee',
            ALMOCO: 'fa-utensils', FORA_DO_HORARIO: 'fa-moon',
            FALTOU: 'fa-user-times', ALOCADO_EXTERNO: 'fa-shipping-fast',
        };
        return map[status] || 'fa-question-circle';
    };

    return (
        <>
            <div className="oa-main-content-card">
                <section className="oa-painel-atividades">

                    <div className="oa-secao-header">
                        <div className="oa-header-esquerda">
                            <h2 className="oa-titulo-secao">Painel de Atividades</h2>
                            {temAlguemProduzindo && (
                                <span className="oa-ao-vivo">
                                    <span className="oa-ao-vivo-dot"></span>
                                    AO VIVO
                                </span>
                            )}
                        </div>
                        <div className="oa-kpi-strip">
                            <span className={`oa-kpi-item${qtdProduzindo > 0 ? ' produzindo' : ''}`}>
                                <i className="fas fa-bolt"></i> {qtdProduzindo} produzindo
                            </span>
                            <span className={`oa-kpi-item${qtdDisponivel > 0 ? ' disponivel' : ''}`}>
                                <i className="fas fa-check-circle"></i> {qtdDisponivel} disponível
                            </span>
                            {funcionariosInativos.length > 0 && (
                                <span className="oa-kpi-item">
                                    <i className="fas fa-pause-circle"></i> {funcionariosInativos.length} em pausa
                                </span>
                            )}
                        </div>
                    </div>

                    {funcionariosPrincipais.length === 0 ? (
                        <div className="oa-empty-state">
                            <i className="fas fa-tshirt oa-empty-state-icon"></i>
                            <p className="oa-empty-state-titulo">Nenhum colaborador em atividade</p>
                            <p className="oa-empty-state-subtitulo">Aguardando início das atividades ou verifique as escalas</p>
                        </div>
                    ) : (
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
                    )}

                    {funcionariosInativos.length > 0 && (
                        <div className="oa-inativos-strip">
                            <span className="oa-inativos-label">Em pausa / inativos</span>
                            {funcionariosInativos.map(func => (
                                <button
                                    key={func.id}
                                    className="oa-inativo-chip"
                                    title={`${func.nome} — clique para liberar`}
                                    onClick={() => handleAcaoManual(func, 'LIVRE_MANUAL', `Liberar ${func.nome.split(' ')[0]} para o trabalho?`)}
                                >
                                    <i className={`fas ${getIconeInativo(func.status_atual)}`}></i>
                                    {func.nome.split(' ')[0]}
                                </button>
                            ))}
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