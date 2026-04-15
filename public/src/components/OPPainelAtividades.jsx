// public/src/components/OPPainelAtividades.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import OPStatusCard from './OPStatusCard.jsx';
import { mostrarMensagem, mostrarConfirmacao, mostrarPromptNumerico, mostrarPromptTexto, mostrarPromptHorario } from '/js/utils/popups.js';
import OPAtribuicaoModal from './OPAtribuicaoModal.jsx';

export default function OPPainelAtividades() {
    const [funcionarios, setFuncionarios] = useState([]);
    const [temposPadraoProducao, setTemposPadraoProducao] = useState({});
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);

    const [modalAberto, setModalAberto] = useState(false);
    const [funcionarioSelecionado, setFuncionarioSelecionado] = useState(null);
    const [inativoInfoId, setInativoInfoId] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

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

    // MELHORIA-05: refresh manual sem recarregar a página
    const handleRefreshManual = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await buscarDadosPainel();
        } finally {
            setIsRefreshing(false);
        }
    }, [isRefreshing, buscarDadosPainel]);

    const handleAcaoManual = async (funcionario, acao, mensagem) => {
        // Intercepta ações de ponto — não são status de usuário, vão para api/ponto
        if (acao === 'SAIDA_ANTECIPADA' || acao === 'ATRASO') {
            return handleExcecao(funcionario.id, acao);
        }
        const textoConfirmacao = mensagem || `Confirmar ação para ${funcionario.nome}?`;
        const confirmado = await mostrarConfirmacao(textoConfirmacao, 'aviso');
        if(!confirmado) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/usuarios/${funcionario.id}/status`, {
                method: 'PUT',
                headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
                body: JSON.stringify({ status: acao })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro ao atualizar status');
            const msg = acao === 'LIVRE_MANUAL'
                ? 'Usuário liberado para uma sessão de tarefas'
                : 'Status atualizado!';
            mostrarMensagem(msg, 'sucesso');
            buscarDadosPainel();
        } catch(e) { mostrarMensagem(e.message, 'erro'); }
    };

    const handleFinalizarTarefa = async (funcionario, pausaManualMs = 0) => {
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
                body: JSON.stringify({
                    id_sessao: tarefa_atual.id_sessao,
                    quantidade_finalizada: Number(quantidadeFinal),
                    pausa_manual_ms: Math.round(pausaManualMs) || 0
                })
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

    // --- EXCEÇÕES DE PONTO (saída antecipada / chegada atrasada) ---
    const handleExcecao = useCallback(async (funcionarioId, tipoExcecao) => {
        let horario, motivo = '';

        if (tipoExcecao === 'SAIDA_ANTECIPADA') {
            // 1. Confirmar a ação
            const confirmado = await mostrarConfirmacao('Confirmar saída antecipada?', 'aviso');
            if (!confirmado) return;
            // 2. Pedir motivo opcional
            const motivoDigitado = await mostrarPromptTexto('Motivo da saída (opcional — pressione Confirmar para pular):', {
                placeholder: 'Ex: consulta médica, problema pessoal...',
                tipo: 'aviso',
                textoConfirmar: 'Registrar saída'
            });
            if (motivoDigitado === null) return; // cancelou no popup de motivo
            motivo = motivoDigitado;
            // BUG-13: horário real será calculado no servidor; enviamos string vazia
            horario = '';

            // BUG-09: atualização otimista — muda o card imediatamente sem esperar a API
            const horaOtimistaSP = new Date().toLocaleTimeString('en-GB', {
                timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
            });
            setFuncionarios(prev => prev.map(f =>
                f.id === funcionarioId
                    ? { ...f, status_atual: 'FORA_DO_HORARIO', ponto_hoje: { ...(f.ponto_hoje || {}), horario_real_s3: horaOtimistaSP, saida_desfeita: false } }
                    : f
            ));
        } else if (tipoExcecao === 'ATRASO') {
            const entrada = await mostrarPromptHorario('Horário real de chegada:', {
                tipo: 'info',
                textoConfirmar: 'Registrar chegada'
            });
            if (!entrada) return;
            horario = entrada;
        } else {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/ponto/excecao', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ funcionario_id: funcionarioId, tipo_excecao: tipoExcecao, horario, motivo })
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                // Reverte estado otimista em caso de falha
                buscarDadosPainel();
                mostrarMensagem(body.error || 'Erro ao registrar exceção. Tente novamente.', 'erro');
                return;
            }
            mostrarMensagem('Exceção registrada.', 'sucesso');
            buscarDadosPainel(); // sincroniza com o banco (confirma o estado otimista)
        } catch (err) {
            buscarDadosPainel(); // reverte estado otimista
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    }, [buscarDadosPainel]);

    // --- LIBERAÇÃO ANTECIPADA PARA INTERVALO ---
    const handleLiberarIntervalo = useCallback(async (funcionarioId, tipo) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/ponto/liberar-intervalo', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ funcionario_id: funcionarioId, tipo })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro');
            const data = await res.json();
            mostrarMensagem(`Retorno previsto: ${data.retorno_previsto}`, 'sucesso');
            buscarDadosPainel();
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    }, [buscarDadosPainel]);

    // BUG-10: Desfazer saída antecipada lançada por engano
    const handleDesfazerSaida = useCallback(async (funcionarioId) => {
        const confirmado = await mostrarConfirmacao(
            'Desfazer saída antecipada?',
            'aviso'
        );
        if (!confirmado) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/ponto/desfazer-saida', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ funcionario_id: funcionarioId })
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                mostrarMensagem(body.error || 'Erro ao desfazer saída.', 'erro');
                return;
            }
            mostrarMensagem('Saída antecipada desfeita. Funcionário disponível.', 'sucesso');
            buscarDadosPainel();
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    }, [buscarDadosPainel]);

    
    if (carregando) return <div className="spinner">Carregando painel...</div>;
    if (erro) return <p style={{ color: 'red', textAlign: 'center' }}>Erro: {erro}</p>;

    const statusPrincipais = ['PRODUZINDO', 'LIVRE', 'LIVRE_MANUAL'];
    const funcionariosPrincipais = funcionarios.filter(f => statusPrincipais.includes(f.status_atual));
    const funcionariosInativos = funcionarios.filter(f => !statusPrincipais.includes(f.status_atual));

    const qtdProduzindo = funcionarios.filter(f => f.status_atual === 'PRODUZINDO').length;
    const qtdDisponivel = funcionarios.filter(f => ['LIVRE', 'LIVRE_MANUAL'].includes(f.status_atual)).length;
    const temAlguemProduzindo = qtdProduzindo > 0;

    // Determina se hoje é dia de trabalho para o funcionário (mesmo fallback do servidor)
    const ehDiaDeTrabalhoHoje = (diasTrabalho) => {
        const efetivo = diasTrabalho || { '1': true, '2': true, '3': true, '4': true, '5': true };
        const agora = new Date();
        const hojeSPStr = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const [yr, mo, dy] = hojeSPStr.split('-').map(Number);
        const diaKey = String(new Date(Date.UTC(yr, mo - 1, dy, 12)).getDay());
        return !!efetivo[diaKey];
    };

    const getInfoInativo = (func) => {
        const s = func.status_atual;
        const n = (t) => t ? String(t).substring(0, 5) : null;

        // Verifica se é dia de folga (para diferenciar "Fora do Horário" de "Folga")
        const eDiaFolga = s === 'FORA_DO_HORARIO' && !ehDiaDeTrabalhoHoje(func.dias_trabalho);

        const map = {
            PAUSA:           { icone: 'fa-coffee',        label: 'Em Pausa',        cor: '#f59e0b' },
            PAUSA_MANUAL:    { icone: 'fa-coffee',        label: 'Em Pausa',        cor: '#f59e0b' },
            ALMOCO:          { icone: 'fa-utensils',      label: 'Almoço',          cor: '#f97316' },
            FORA_DO_HORARIO: { icone: 'fa-moon',          label: eDiaFolga ? 'Folga' : 'Fora do Horário', cor: '#6366f1' },
            FALTOU:          { icone: 'fa-user-times',    label: 'Faltou',          cor: '#ef4444' },
            ALOCADO_EXTERNO: { icone: 'fa-shipping-fast', label: 'Outro Setor',     cor: '#8b5cf6' },
        };
        const info = map[s] || { icone: 'fa-question-circle', label: s, cor: '#aaa' };

        // Em dia de folga não exibir retorno nem ponto_diario (dados sem significado para esse dia)
        if (eDiaFolga) return { ...info, retorno: null, tempoFalta: null, eDiaFolga: true };

        // Calcular horário de retorno e tempo faltando
        let retorno = null;
        if (s === 'ALMOCO') {
            retorno = n(func.ponto_hoje?.horario_real_e2) || n(func.horario_entrada_2);
        } else if (s === 'PAUSA' || s === 'PAUSA_MANUAL') {
            retorno = n(func.ponto_hoje?.horario_real_e3) || n(func.horario_entrada_3);
        } else if (s === 'FORA_DO_HORARIO') {
            const temSaidaAntecipada = func.ponto_hoje?.horario_real_s3 && !func.ponto_hoje?.saida_desfeita;
            if (!temSaidaAntecipada) {
                // Só mostra "Retorno: HH:MM" se for ANTES do E1 (funcionário ainda não chegou hoje).
                // Depois do S3 o turno já encerrou — não faz sentido mostrar "atrasado X min".
                const horaAtual = new Date().toLocaleTimeString('en-GB', {
                    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
                });
                const e1 = n(func.horario_entrada_1);
                if (e1 && horaAtual < e1) {
                    retorno = e1; // antes do início do turno → mostra horário de entrada
                }
                // depois do S3 → retorno = null (turno encerrado normalmente)
            }
        }

        let tempoFalta = null;
        if (retorno) {
            const agora = new Date();
            const horaAtual = agora.toLocaleTimeString('en-GB', {
                timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
            });
            const [rh, rm] = retorno.split(':').map(Number);
            const [ah, am] = horaAtual.split(':').map(Number);
            const diff = (rh * 60 + rm) - (ah * 60 + am);
            if (diff > 0) tempoFalta = `em ${diff} min`;
            else if (diff < 0) tempoFalta = `atrasado ${Math.abs(diff)} min`;
            else tempoFalta = 'agora';
        }

        return { ...info, retorno, tempoFalta, eDiaFolga: false };
    };

    const fmtH = (t) => t ? String(t).substring(0, 5) : '--:--';

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
                            {/* MELHORIA-05: botão de refresh manual */}
                            <button
                                className="oa-btn-refresh"
                                onClick={handleRefreshManual}
                                disabled={isRefreshing}
                                title="Atualizar dados do painel"
                            >
                                <i className={`fas fa-sync-alt ${isRefreshing ? 'girando' : ''}`}></i>
                            </button>
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
                                        onExcecao={handleExcecao}
                                        onLiberarIntervalo={handleLiberarIntervalo}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {funcionariosInativos.length > 0 && (
                        <div className="oa-inativos-secao">
                            <div className="oa-inativos-titulo">Em pausa / inativos</div>
                            <div className="oa-inativos-grid">
                                {funcionariosInativos.map(func => {
                                    const info = getInfoInativo(func);
                                    const primeiroNome = func.nome.split(' ')[0];
                                    return (
                                        <div key={func.id} className="oa-inativo-card">
                                            <div className="oa-inativo-card-topo">
                                                {/* Avatar miniatura */}
                                                {(() => {
                                                    const foto = (func.avatar_url && !func.avatar_url.includes('image.jfif')) ? func.avatar_url : func.foto_oficial;
                                                    return foto
                                                        ? <div className="oa-inativo-avatar" style={{ backgroundImage: `url('${foto}')` }} />
                                                        : <div className="oa-inativo-avatar oa-inativo-avatar-vazio"><i className="fas fa-user"></i></div>;
                                                })()}
                                                <div className="oa-inativo-card-info">
                                                    <span className="oa-inativo-nome">{primeiroNome}</span>
                                                    <span className="oa-inativo-status" style={{ color: info.cor }}>
                                                        <i className={`fas ${info.icone}`}></i> {info.label}
                                                    </span>
                                                    {info.retorno && (
                                                        <span className="oa-inativo-retorno">
                                                            Retorno: <strong>{info.retorno}</strong>
                                                            {info.tempoFalta && (
                                                                <span className={`oa-inativo-tempo ${info.tempoFalta.startsWith('atrasado') ? 'atrasado' : ''}`}>
                                                                    {' '}({info.tempoFalta})
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                    {/* "Saída antecipada" só aparece em dias de trabalho, nunca em folga */}
                                                    {!info.eDiaFolga && func.status_atual === 'FORA_DO_HORARIO' && func.ponto_hoje?.horario_real_s3 && (
                                                        <span className="oa-inativo-retorno">Saída antecipada: <strong>{String(func.ponto_hoje.horario_real_s3).substring(0, 5)}</strong></span>
                                                    )}
                                                </div>
                                                <button
                                                    className="oa-inativo-btn-info"
                                                    onClick={() => setInativoInfoId(func.id)}
                                                    title="Ver jornada"
                                                >
                                                    <i className="fas fa-info-circle"></i>
                                                </button>
                                            </div>
                                            {/* BUG-11: saída antecipada ativa → Desfazer; outros casos → Liberar */}
                                            {func.status_atual === 'FORA_DO_HORARIO' && func.ponto_hoje?.horario_real_s3 && !func.ponto_hoje?.saida_desfeita ? (
                                                <button
                                                    className="oa-inativo-btn-desfazer"
                                                    onClick={() => handleDesfazerSaida(func.id)}
                                                    title="Desfazer saída antecipada"
                                                >
                                                    <i className="fas fa-undo"></i> Desfazer Saída
                                                </button>
                                            ) : (
                                                <button
                                                    className="oa-inativo-btn-liberar"
                                                    onClick={() => handleAcaoManual(func, 'LIVRE_MANUAL', `Liberar ${primeiroNome} para o trabalho?`)}
                                                    title="Liberar para o trabalho"
                                                >
                                                    <i className="fas fa-play"></i> Liberar
                                                </button>
                                            )}

                                            {/* Bottom sheet de jornada do inativo */}
                                            {inativoInfoId === func.id && ReactDOM.createPortal(
                                                <>
                                                    <div className="bs-overlay" onClick={() => setInativoInfoId(null)} />
                                                    <div className="bs-sheet">
                                                        <div className="bs-cabecalho">
                                                            {(() => {
                                                                const foto = (func.avatar_url && !func.avatar_url.includes('image.jfif')) ? func.avatar_url : func.foto_oficial;
                                                                return foto
                                                                    ? <div className="bs-avatar" style={{ backgroundImage: `url('${foto}')` }}></div>
                                                                    : <div className="bs-avatar bs-avatar-vazio"><i className="fas fa-user"></i></div>;
                                                            })()}
                                                            <div>
                                                                <div className="bs-nome">{func.nome}</div>
                                                                <div className="bs-role">Jornada de Trabalho</div>
                                                            </div>
                                                        </div>

                                                        <div className="bs-info-secao">
                                                            <div className="bs-info-label">Dias de trabalho</div>
                                                            <div className="bs-dias-chips">
                                                                {[['0','Dom'],['1','Seg'],['2','Ter'],['3','Qua'],['4','Qui'],['5','Sex'],['6','Sáb']].map(([d, l]) => {
                                                                    const ativo = (func.dias_trabalho || {'1':true,'2':true,'3':true,'4':true,'5':true})[d];
                                                                    return <span key={d} className={`bs-dia-chip ${ativo ? 'ativo' : ''}`}>{l}</span>;
                                                                })}
                                                            </div>
                                                        </div>

                                                        <div className="bs-info-secao">
                                                            <div className="bs-info-label">Horários</div>
                                                            <div className="bs-horarios-lista">
                                                                <div className="bs-horario-linha">
                                                                    <span className="bs-horario-icone"><i className="fas fa-sign-in-alt"></i></span>
                                                                    <span className="bs-horario-desc">Entrada <span className="bs-horario-ref">(E1)</span></span>
                                                                    <span className="bs-horario-valor">{fmtH(func.horario_entrada_1)}</span>
                                                                </div>
                                                                {func.horario_saida_1 && (
                                                                    <div className="bs-horario-linha bs-horario-intervalo">
                                                                        <span className="bs-horario-icone"><i className="fas fa-utensils"></i></span>
                                                                        <span className="bs-horario-desc">Almoço <span className="bs-horario-ref">(S1 → E2)</span></span>
                                                                        <span className="bs-horario-valor">{fmtH(func.horario_saida_1)} → {fmtH(func.horario_entrada_2)}</span>
                                                                    </div>
                                                                )}
                                                                {func.horario_saida_2 && (
                                                                    <div className="bs-horario-linha bs-horario-intervalo">
                                                                        <span className="bs-horario-icone"><i className="fas fa-coffee"></i></span>
                                                                        <span className="bs-horario-desc">Pausa <span className="bs-horario-ref">(S2 → E3)</span></span>
                                                                        <span className="bs-horario-valor">{fmtH(func.horario_saida_2)} → {fmtH(func.horario_entrada_3)}</span>
                                                                    </div>
                                                                )}
                                                                <div className="bs-horario-linha">
                                                                    <span className="bs-horario-icone"><i className="fas fa-sign-out-alt"></i></span>
                                                                    <span className="bs-horario-desc">Saída <span className="bs-horario-ref">(S3)</span></span>
                                                                    <span className="bs-horario-valor">{fmtH(func.horario_saida_3 || func.horario_saida_2 || func.horario_saida_1)}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Registros de hoje */}
                                                        {func.ponto_hoje && (func.ponto_hoje.horario_real_s1 || func.ponto_hoje.horario_real_s2 || func.ponto_hoje.horario_real_s3) && (
                                                            <div className="bs-info-secao">
                                                                <div className="bs-info-label">Registros de hoje</div>
                                                                <div className="bs-registros-hoje">
                                                                    {func.ponto_hoje.horario_real_s1 && (
                                                                        <div className="bs-registro-linha">
                                                                            <span className="bs-registro-icone"><i className="fas fa-utensils"></i></span>
                                                                            <span className="bs-registro-desc">Saída almoço</span>
                                                                            <span className="bs-registro-valor registrado">{fmtH(func.ponto_hoje.horario_real_s1)}</span>
                                                                        </div>
                                                                    )}
                                                                    {func.ponto_hoje.horario_real_e2 && (
                                                                        <div className="bs-registro-linha">
                                                                            <span className="bs-registro-icone"><i className="fas fa-utensils"></i></span>
                                                                            <span className="bs-registro-desc">Retorno almoço</span>
                                                                            <span className="bs-registro-valor registrado">{fmtH(func.ponto_hoje.horario_real_e2)}</span>
                                                                        </div>
                                                                    )}
                                                                    {func.ponto_hoje.horario_real_s2 && (
                                                                        <div className="bs-registro-linha">
                                                                            <span className="bs-registro-icone"><i className="fas fa-coffee"></i></span>
                                                                            <span className="bs-registro-desc">Saída pausa</span>
                                                                            <span className="bs-registro-valor registrado">{fmtH(func.ponto_hoje.horario_real_s2)}</span>
                                                                        </div>
                                                                    )}
                                                                    {func.ponto_hoje.horario_real_e3 && (
                                                                        <div className="bs-registro-linha">
                                                                            <span className="bs-registro-icone"><i className="fas fa-coffee"></i></span>
                                                                            <span className="bs-registro-desc">Retorno pausa</span>
                                                                            <span className="bs-registro-valor registrado">{fmtH(func.ponto_hoje.horario_real_e3)}</span>
                                                                        </div>
                                                                    )}
                                                                    {func.ponto_hoje.horario_real_s3 && (
                                                                        <div className={`bs-registro-linha${func.ponto_hoje.saida_desfeita ? ' desfeito' : ''}`}>
                                                                            <span className="bs-registro-icone"><i className="fas fa-sign-out-alt"></i></span>
                                                                            <span className="bs-registro-desc">
                                                                                Saída antecipada
                                                                                {func.ponto_hoje.saida_desfeita && (
                                                                                    <em className="bs-registro-desfeito"> — desfeita por {func.ponto_hoje.saida_desfeita_por || 'supervisor'}</em>
                                                                                )}
                                                                            </span>
                                                                            <span className="bs-registro-valor registrado">{fmtH(func.ponto_hoje.horario_real_s3)}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <button className="bs-cancelar" onClick={() => setInativoInfoId(null)}>Fechar</button>
                                                    </div>
                                                </>,
                                                document.body
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                </section>
            </div>

            <OPAtribuicaoModal
                isOpen={modalAberto}
                onClose={handleCloseModal}
                funcionario={funcionarioSelecionado}
                tpp={temposPadraoProducao}
            />
        </>
    );
}