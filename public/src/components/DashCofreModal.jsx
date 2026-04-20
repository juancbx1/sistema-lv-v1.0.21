import React, { useState } from 'react';
import { fetchAPI } from '/js/utils/api-utils.js';
import { mostrarConfirmacao } from '/js/utils/popups.js';

export default function DashCofreModal({ dadosCofre, metaDoDia, pontosHoje, aoResgatarSucesso, onClose }) {
    const [loading, setLoading] = useState(false);
    const [tela, setTela] = useState('resumo');
    const [historico, setHistorico] = useState([]);
    const [paginaExtrato, setPaginaExtrato] = useState(1);
    const [temMaisExtrato, setTemMaisExtrato] = useState(false);

    if (!dadosCofre) return null;

    const saldo = parseFloat(dadosCofre.saldo || 0);
    const usosEssaSemana = dadosCofre.usosEssaSemana || 0;

    const LIMITE_SEMANAL = 2;
    const resgatesRestantesSemana = Math.max(0, LIMITE_SEMANAL - usosEssaSemana);
    const temVidas = usosEssaSemana < LIMITE_SEMANAL;

    const PONTOS_MINIMOS = 500;
    const temProducaoMinima = pontosHoje >= PONTOS_MINIMOS;

    const faltaParaMeta = metaDoDia ? Math.max(0, metaDoDia.pontos_meta - pontosHoje) : 0;
    const temSaldoSuficiente = saldo >= faltaParaMeta;

    const podeResgatar = faltaParaMeta > 0 && temSaldoSuficiente && temVidas && temProducaoMinima;

    // --- AÇÕES ---
    const handleResgatar = async () => {
        const confirmado = await mostrarConfirmacao(`Usar ${faltaParaMeta} pts do cofre para completar o dia?`);
        if (!confirmado) return;

        setLoading(true);
        try {
            await fetchAPI('/api/dashboard/resgatar-pontos', {
                method: 'POST',
                body: JSON.stringify({ quantidade: faltaParaMeta })
            });
            aoResgatarSucesso();
            onClose();
        } catch (error) {
            // Exibe o erro diretamente sem usar mostrarMensagem (evita dep extra)
            alert(`Erro: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const carregarExtrato = async (reset = true) => {
        setLoading(true);
        try {
            const pg = reset ? 1 : paginaExtrato + 1;
            const dados = await fetchAPI(`/api/dashboard/cofre/extrato?page=${pg}&limit=8`);
            if (reset) {
                setHistorico(dados.rows);
            } else {
                setHistorico(prev => [...prev, ...dados.rows]);
            }
            setPaginaExtrato(pg);
            setTemMaisExtrato(pg < dados.pagination.totalPages);
            if (reset) setTela('extrato');
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Saldo histórico reverso (mantém lógica original)
    const itensComSaldo = (() => {
        let saldoVolatil = saldo;
        let encontrouReset = false;
        return historico.map(item => {
            if (encontrouReset) return { ...item, saldoApos: null };
            const qtd = parseFloat(item.quantidade);
            const isReset = item.tipo === 'RESET';
            if (isReset) {
                encontrouReset = true;
                return { ...item, saldoApos: 0 };
            }
            const saldoMomento = saldoVolatil;
            if (item.tipo === 'GANHO') saldoVolatil -= qtd;
            else if (item.tipo === 'RESGATE') saldoVolatil += qtd;
            return { ...item, saldoApos: saldoMomento };
        });
    })();

    // --- RENDERIZADORES ---

    const renderSlotsSemana = () => (
        <div className="ds-cofre-slots-semana">
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#666', marginBottom: '8px' }}>
                Resgates desta semana:
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                {[0, 1].map(i => {
                    const usado = i < usosEssaSemana;
                    return (
                        <div key={i} className={`ds-cofre-slot ${usado ? 'usado' : 'disponivel'}`}>
                            <i className={`fas ${usado ? 'fa-lock' : 'fa-unlock'}`}></i>
                            <span>{usado ? 'Usado' : 'Disponível'}</span>
                        </div>
                    );
                })}
            </div>
            <div style={{
                fontSize: '0.8rem', marginTop: '8px', fontWeight: '600',
                color: resgatesRestantesSemana > 0 ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-perigo)'
            }}>
                {resgatesRestantesSemana > 0
                    ? `${resgatesRestantesSemana} resgate(s) disponível(is) esta semana`
                    : 'Limite semanal atingido. Volta no próximo domingo.'}
            </div>
        </div>
    );

    const renderCondicaoHoje = () => (
        <div className="ds-cofre-condicao-hoje">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '5px' }}>
                <span>Produção hoje</span>
                <strong style={{ color: temProducaoMinima ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-perigo)' }}>
                    {Math.round(pontosHoje)} / {PONTOS_MINIMOS} pts
                </strong>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', background: '#e9ecef', overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${Math.min((pontosHoje / PONTOS_MINIMOS) * 100, 100)}%`,
                    background: temProducaoMinima ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-aviso)',
                    borderRadius: '4px',
                    transition: 'width 0.5s ease'
                }}></div>
            </div>
            <small style={{ color: '#999', fontSize: '0.72rem' }}>
                {temProducaoMinima
                    ? '✅ Produção mínima atingida'
                    : `Faltam ${PONTOS_MINIMOS - Math.round(pontosHoje)} pts para liberar o resgate`}
            </small>
        </div>
    );

    const renderResumo = () => (
        <>
            {/* Ícone do cofre + saldo */}
            <div className="ds-cofre-icone-container">
                <i className="fas fa-vault ds-cofre-vault-icon"></i>
                <div className="ds-cofre-saldo-grande">
                    <span>{Math.round(saldo)}</span>
                    <small>pontos</small>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '5px' }}>
                <h2 style={{ color: 'var(--ds-cor-azul-escuro)', margin: 0, fontSize: '1.2rem' }}>Banco de Resgate</h2>
                <button
                    onClick={() => setTela('info')}
                    style={{ background: 'none', border: 'none', color: 'var(--ds-cor-primaria)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px' }}
                >
                    <i className="fas fa-info-circle"></i>
                </button>
            </div>

            <p style={{ color: '#666', fontSize: '0.78rem', marginBottom: '14px' }}>
                Pontos excedentes guardados para dias de menor produção.
            </p>

            {/* Slots semanais */}
            {renderSlotsSemana()}

            {/* Condição de hoje */}
            {renderCondicaoHoje()}

            {/* Área de ação */}
            <div style={{ marginTop: '14px', marginBottom: '14px' }}>
                {faltaParaMeta > 0 ? (
                    podeResgatar ? (
                        <button
                            className="ds-btn-resgate-especial efeito-pulso"
                            disabled={loading}
                            onClick={handleResgatar}
                            style={{ width: '100%', padding: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
                        >
                            <i className="fas fa-bolt"></i> USAR RESGATE AGORA
                        </button>
                    ) : (
                        <div style={{ backgroundColor: '#fff3cd', borderRadius: '12px', padding: '15px', border: '1px solid #ffeeba', color: '#856404', textAlign: 'left' }}>
                            {!temProducaoMinima ? (
                                <>
                                    <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#d35400' }}>
                                        <i className="fas fa-lock"></i> Produção Mínima Necessária
                                    </div>
                                    <div style={{ fontSize: '0.85rem' }}>
                                        Produza pelo menos <strong>{PONTOS_MINIMOS} pts</strong> hoje para liberar o resgate.
                                    </div>
                                </>
                            ) : !temVidas ? (
                                <>
                                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}><i className="fas fa-ban"></i> Limite Semanal Atingido</div>
                                    <div style={{ fontSize: '0.85rem' }}>Você já usou seus 2 resgates desta semana. Volta na segunda-feira!</div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}><i className="fas fa-vault"></i> Saldo Insuficiente</div>
                                    <div style={{ fontSize: '0.85rem' }}>Seu saldo não cobre a falta de hoje. Continue produzindo!</div>
                                </>
                            )}
                        </div>
                    )
                ) : (
                    <div style={{ padding: '15px', backgroundColor: '#e6fffa', color: '#2c7a7b', borderRadius: '8px' }}>
                        <i className="fas fa-check-circle"></i> A meta de hoje já foi batida!
                    </div>
                )}
            </div>

            <button className="ds-btn ds-btn-secundario" style={{ width: '100%' }} onClick={carregarExtrato} disabled={loading}>
                Ver Extrato
            </button>
        </>
    );

    const renderExtrato = () => {
        // Agrupar itens por data, intercalando cabeçalhos
        const itensAgrupados = [];
        let ultimaData = null;
        itensComSaldo.forEach((item) => {
            if (item.tipo === 'RESET') {
                itensAgrupados.push({ tipo: '_RESET', item });
                ultimaData = null;
                return;
            }
            const dataStr = new Date(item.data_evento).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo'
            });
            if (dataStr !== ultimaData) {
                itensAgrupados.push({ tipo: '_DATA_HEADER', dataStr });
                ultimaData = dataStr;
            }
            itensAgrupados.push({ tipo: '_ITEM', item });
        });

        return (
            <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                    <button
                        onClick={() => setTela('resumo')}
                        className="ds-btn-fechar-painel-padrao"
                        style={{ position: 'static', marginRight: '15px', backgroundColor: 'var(--ds-cor-cinza-claro-fundo)', color: '#666', border: 'none' }}
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <h3 style={{ margin: 0, color: 'var(--ds-cor-azul-escuro)' }}>Extrato do Cofre</h3>
                </div>

                {/* Saldo fixado no topo */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: 'var(--ds-cor-primaria)', color: '#fff',
                    borderRadius: '10px', padding: '12px 16px', marginBottom: '16px'
                }}>
                    <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>Saldo atual no Cofre</span>
                    <strong style={{ fontSize: '1.4rem' }}>{Math.round(saldo)} pts</strong>
                </div>

                <div style={{ maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                    {itensAgrupados.length === 0
                        ? <p style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Vazio.</p>
                        : itensAgrupados.map((entrada, idx) => {
                            if (entrada.tipo === '_DATA_HEADER') return (
                                <div key={`h-${idx}`} style={{
                                    fontSize: '0.72rem', fontWeight: '700', color: '#aaa',
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                    padding: '10px 0 4px', marginTop: '4px'
                                }}>
                                    {entrada.dataStr}
                                </div>
                            );

                            if (entrada.tipo === '_RESET') return (
                                <div key={`r-${idx}`} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    margin: '16px 0', color: '#999'
                                }}>
                                    <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0e0' }}></div>
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: '700', color: '#bbb',
                                        whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px'
                                    }}>
                                        <i className="fas fa-rotate-right" style={{ marginRight: '4px' }}></i>
                                        Início do Ciclo · {new Date(entrada.item.data_evento).toLocaleDateString('pt-BR', {
                                            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo'
                                        })}
                                    </span>
                                    <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0e0' }}></div>
                                </div>
                            );

                            const { item } = entrada;
                            const isGanho = item.tipo === 'GANHO';
                            return (
                                <div key={`i-${idx}`} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '12px 0', borderBottom: '1px solid #f0f0f0'
                                }}>
                                    {/* Ícone circulado */}
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        backgroundColor: isGanho ? '#e8f5e9' : '#fdecea',
                                        color: isGanho ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-perigo)'
                                    }}>
                                        <i className={`fas ${isGanho ? 'fa-arrow-up' : 'fa-arrow-down'}`} style={{ fontSize: '0.9rem' }}></i>
                                    </div>

                                    {/* Texto central */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#333' }}>
                                            {isGanho ? 'Depósito' : 'Saque'}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#999' }}>
                                            {new Date(item.data_evento).toLocaleTimeString('pt-BR', {
                                                hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
                                            })}
                                        </div>
                                    </div>

                                    {/* Valor à direita */}
                                    <div style={{
                                        fontWeight: '800', fontSize: '1.1rem', flexShrink: 0,
                                        color: isGanho ? 'var(--ds-cor-sucesso)' : 'var(--ds-cor-perigo)'
                                    }}>
                                        {isGanho ? '+' : '-'}{Math.round(item.quantidade)} pts
                                    </div>
                                </div>
                            );
                        })
                    }
                    {temMaisExtrato && (
                        <button onClick={() => carregarExtrato(false)} className="ds-btn ds-btn-secundario" style={{ width: '100%', marginTop: '15px' }} disabled={loading}>
                            {loading ? 'Carregando...' : 'Carregar Mais Antigos'}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderInfo = () => (
        <div style={{ textAlign: 'left', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                <button
                    onClick={() => setTela('resumo')}
                    className="ds-btn-fechar-painel-padrao"
                    style={{ position: 'static', marginRight: '15px', backgroundColor: 'var(--ds-cor-cinza-claro-fundo)', color: '#666', border: 'none' }}
                >
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h3 style={{ margin: 0, color: 'var(--ds-cor-azul-escuro)' }}>Como funciona o Cofre</h3>
            </div>

            <div className="ds-info-secao">
                <h4>🏦 O que é o Banco de Resgate?</h4>
                <p>O Cofre guarda <strong>pontos excedentes</strong> da sua produção. Quando você bate a Meta Prata ou Ouro e ainda sobram pontos acima da meta, essa sobra vai direto pro cofre. É uma reserva para os dias mais difíceis.</p>
            </div>

            <div className="ds-info-secao">
                <h4>📈 Como acumulo pontos no Cofre?</h4>
                <p>Ao atingir a <strong>Meta Prata ou superior</strong>, os pontos que você fizer <em>acima</em> da meta vão para o cofre automaticamente.</p>
                <p><em>Exemplo: Meta Prata = 800 pts. Você fez 870. Os 70 pontos extras vão para o cofre.</em></p>
                <p style={{ color: '#999', fontSize: '0.82rem' }}>⚠️ A Meta Bronze não gera sobra no cofre.</p>
            </div>

            <div className="ds-info-secao">
                <h4>🔓 Como usar o Resgate?</h4>
                <p>Para usar o cofre em um dia que não bateu a meta, você precisa:</p>
                <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                    <li>Ter <strong>pelo menos 500 pts de produção</strong> no dia</li>
                    <li>Ter <strong>saldo suficiente</strong> no cofre para cobrir o que falta</li>
                    <li>Não ter usado seus <strong>2 resgates da semana</strong> (conta de domingo a sábado)</li>
                </ul>
            </div>

            <div className="ds-info-secao" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
                <h4>📅 E no início de cada ciclo?</h4>
                <p>No dia 21 de cada mês, quando começa um novo ciclo, o saldo do cofre é <strong>zerado</strong>. Os resgates semanais reiniciam toda segunda-feira.</p>
            </div>
        </div>
    );

    return (
        <div className="ds-popup-overlay ativo" onClick={onClose} style={{ zIndex: 1200 }}>
            <div className="ds-modal-assinatura-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', padding: '30px', position: 'relative', maxWidth: '400px' }}>
                <button className="ds-modal-close-simple" onClick={onClose}><i className="fas fa-times"></i></button>
                {tela === 'resumo' && renderResumo()}
                {tela === 'extrato' && renderExtrato()}
                {tela === 'info' && renderInfo()}
            </div>
        </div>
    );
}
