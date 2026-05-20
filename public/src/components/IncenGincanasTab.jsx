// public/src/components/IncenGincanasTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { mostrarMensagem, mostrarConfirmacao } from '/js/utils/popups.js';
import UICarregando from './UICarregando.jsx';
import IncenGincanaCard from './IncenGincanaCard.jsx';
import IncenGincanaModal from './IncenGincanaModal.jsx';
import IncenGincanaRankingModal from './IncenGincanaRankingModal.jsx';

const FILTROS = [
    { id: 'ativas',    label: 'Ao Vivo',   icon: 'fas fa-circle' },
    { id: 'proximas',  label: 'Próximas',  icon: 'fas fa-clock' },
    { id: 'rascunhos', label: 'Rascunhos', icon: 'fas fa-pencil-alt' },
    { id: 'arquivo',   label: 'Arquivo',   icon: 'fas fa-archive' },
];

export default function IncenGincanasTab({ modalNovaGincanaAberto, onFecharModalNova }) {
    const [filtro, setFiltro] = useState('ativas');
    const [gincanas, setGincanas] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [contagens, setContagens] = useState({});

    // Modais (implementados no Bloco 3)
    const [gincanaEditando, setGincanaEditando] = useState(null);
    const [gincanaRanking, setGincanaRanking] = useState(null);
    const [gincanaPublicando, setGincanaPublicando] = useState(null);

    const token = localStorage.getItem('token');

    const buscarGincanas = useCallback(async (filtroAtual) => {
        setCarregando(true);
        try {
            const res = await fetch(`/api/gincanas?filtro=${filtroAtual}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao buscar gincanas');
            setGincanas(data);
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        } finally {
            setCarregando(false);
        }
    }, [token]);

    const buscarContagens = useCallback(async () => {
        const filtroIds = ['ativas', 'proximas', 'rascunhos'];
        try {
            const resultados = await Promise.all(
                filtroIds.map(f =>
                    fetch(`/api/gincanas?filtro=${f}`, { headers: { Authorization: `Bearer ${token}` } })
                        .then(r => r.json())
                        .then(d => ({ [f]: Array.isArray(d) ? d.length : 0 }))
                        .catch(() => ({ [f]: 0 }))
                )
            );
            setContagens(Object.assign({}, ...resultados));
        } catch (_) {}
    }, [token]);

    useEffect(() => {
        buscarGincanas(filtro);
        buscarContagens();
    }, [filtro]);

    // Abre modal de nova gincana via prop do pai
    useEffect(() => {
        if (modalNovaGincanaAberto) {
            setGincanaEditando({ _novo: true });
        }
    }, [modalNovaGincanaAberto]);

    // Fecha modal de nova gincana quando o componente de modal fechar
    const handleFecharModal = () => {
        setGincanaEditando(null);
        onFecharModalNova?.();
        buscarGincanas(filtro);
        buscarContagens();
    };

    const handlePublicar = (g) => setGincanaPublicando(g);

    const handleCancelar = async (g) => {
        const ok = await mostrarConfirmacao(
            `Cancelar a gincana "${g.nome}"? Esta ação não pode ser desfeita.`
        );
        if (!ok) return;
        try {
            const res = await fetch(`/api/gincanas/${g.id}/cancelar`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            mostrarMensagem('Gincana cancelada.', 'sucesso');
            buscarGincanas(filtro);
            buscarContagens();
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    };

    const handleDeletar = async (g) => {
        const ok = await mostrarConfirmacao(
            `Deletar o rascunho "${g.nome}"? Não é possível desfazer.`
        );
        if (!ok) return;
        try {
            const res = await fetch(`/api/gincanas/${g.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            mostrarMensagem('Rascunho deletado.', 'sucesso');
            buscarGincanas(filtro);
            buscarContagens();
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    };

    const handleConfirmarPublicacao = async (g, notificar) => {
        try {
            const res = await fetch(`/api/gincanas/${g.id}/publicar`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ notificar }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            mostrarMensagem('Gincana publicada!', 'sucesso');
            setGincanaPublicando(null);
            buscarGincanas(filtro);
            buscarContagens();
        } catch (err) {
            mostrarMensagem(`Erro: ${err.message}`, 'erro');
        }
    };

    return (
        <>
            <div className="gs-card">
                <div className="incen-subfiltros">
                    {FILTROS.map(f => (
                        <button
                            key={f.id}
                            className={`incen-subfiltro-btn ${filtro === f.id ? 'ativo' : ''}`}
                            onClick={() => setFiltro(f.id)}
                        >
                            <i className={f.icon}></i>
                            {f.label}
                            {contagens[f.id] > 0 && (
                                <span className="incen-subfiltro-badge">{contagens[f.id]}</span>
                            )}
                        </button>
                    ))}
                </div>

                {carregando ? (
                    <UICarregando variante="bloco" />
                ) : gincanas.length === 0 ? (
                    <div className="incen-lista-vazia">
                        <i className="fas fa-trophy"></i>
                        <p>Nenhuma gincana encontrada neste filtro.</p>
                    </div>
                ) : (
                    <div className="incen-gincana-grid">
                        {gincanas.map(g => (
                            <IncenGincanaCard
                                key={g.id}
                                gincana={g}
                                onEditar={setGincanaEditando}
                                onPublicar={handlePublicar}
                                onCancelar={handleCancelar}
                                onDeletar={handleDeletar}
                                onVerRanking={setGincanaRanking}
                            />
                        ))}
                    </div>
                )}
            </div>

            {gincanaEditando && (
                <IncenGincanaModal
                    gincana={gincanaEditando}
                    onFechar={handleFecharModal}
                    onSalvo={handleFecharModal}
                />
            )}

            {gincanaRanking && (
                <IncenGincanaRankingModal
                    gincana={gincanaRanking}
                    onFechar={() => setGincanaRanking(null)}
                />
            )}

            {/* Modal de confirmação de publicação */}
            {gincanaPublicando && (
                <ModalPublicacao
                    gincana={gincanaPublicando}
                    onFechar={() => setGincanaPublicando(null)}
                    onConfirmar={handleConfirmarPublicacao}
                />
            )}
        </>
    );
}

// Modal de confirmação de publicação
function ModalPublicacao({ gincana, onFechar, onConfirmar }) {
    const [notificar, setNotificar] = useState(true);
    const [salvando, setSalvando] = useState(false);

    const handleConfirmar = async () => {
        setSalvando(true);
        await onConfirmar(gincana, notificar);
        setSalvando(false);
    };

    const formatarDataHora = (iso) => {
        if (!iso) return '';
        return new Date(iso).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    };

    return (
        <div className="gs-modal-overlay" onClick={onFechar}>
            <div className="gs-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <div className="gs-modal-cabecalho">
                    <h2>Publicar Gincana</h2>
                    <button className="gs-btn-fechar" onClick={onFechar}><i className="fas fa-times"></i></button>
                </div>
                <div className="gs-modal-corpo">
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>
                        {gincana.banner_emoji} {gincana.nome}
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--gs-texto-secundario)', marginBottom: 16 }}>
                        {formatarDataHora(gincana.datetime_inicio)} → {formatarDataHora(gincana.datetime_fim)}
                    </p>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.9rem' }}>
                        <input
                            type="checkbox"
                            checked={notificar}
                            onChange={e => setNotificar(e.target.checked)}
                            style={{ width: 16, height: 16 }}
                        />
                        Notificar participantes via popup ao publicar
                    </label>
                    <p style={{ fontSize: '0.78rem', color: 'var(--gs-texto-secundario)', marginTop: 4, paddingLeft: 26 }}>
                        Aparecerá na dashboard delas ao abrir.
                    </p>
                </div>
                <div className="gs-modal-rodape">
                    <button className="gs-btn gs-btn-secundario" onClick={onFechar} disabled={salvando}>
                        Cancelar
                    </button>
                    <button className="gs-btn gs-btn-primario" onClick={handleConfirmar} disabled={salvando}>
                        {salvando ? 'Publicando...' : <><i className="fas fa-play"></i> Publicar</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
