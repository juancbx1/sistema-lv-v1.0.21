import React, { useState, useEffect, useCallback, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import allLocales from '@fullcalendar/core/locales-all';
import UIHeaderPagina from './UIHeaderPagina.jsx';

const TOKEN = () => localStorage.getItem('token');

const TIPOS = [
    { value: 'feriado_nacional',  label: 'Feriado Nacional',  cor: '#e74c3c' },
    { value: 'feriado_regional',  label: 'Feriado Regional',  cor: '#c0392b' },
    { value: 'folga_empresa',     label: 'Folga Coletiva',    cor: '#e67e22' },
    { value: 'falta',             label: 'Falta Individual',  cor: '#f39c12' },
    { value: 'dia_util_especial', label: 'Dia Útil Especial', cor: '#2980b9' },
];

const corPorTipo  = Object.fromEntries(TIPOS.map(t => [t.value, t.cor]));
const labelPorTipo = Object.fromEntries(TIPOS.map(t => [t.value, t.label]));

const FORM_VAZIO = {
    id: null, data: '', tipo: 'feriado_regional', funcionario_id: '',
    descricao: '', conta_como_dia_util_pagamento: false, visivel_dashboard: true,
};

function decodeJwt(token) {
    try { return JSON.parse(atob(token.split('.')[1])); }
    catch { return null; }
}

function formatarDataBR(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export default function CalendarioCompleto() {
    const [eventos, setEventos] = useState([]);
    const [funcionarios, setFuncionarios] = useState([]);
    const [form, setForm]       = useState(null);   // modal edição/criação
    const [dayModal, setDayModal] = useState(null); // { data: 'YYYY-MM-DD', lista: [] }
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro]       = useState('');
    const [ctxMenu, setCtxMenu] = useState(null);   // { x, y, data }
    const intervaloVisivelRef   = useRef({ inicio: '', fim: '' });
    const eventosRef            = useRef([]);        // espelho p/ filtrar sem state
    const calRef                = useRef(null);
    const ctxMenuRef            = useRef(null);

    const payload = decodeJwt(TOKEN());
    const isAdmin = payload?.tipos?.some(t => ['administrador', 'supervisor'].includes(t));

    // ── Fecha context menu ao clicar fora ─────────────────────────────────
    useEffect(() => {
        if (!ctxMenu) return;
        const fechar = (e) => {
            if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target)) setCtxMenu(null);
        };
        document.addEventListener('mousedown', fechar);
        return () => document.removeEventListener('mousedown', fechar);
    }, [ctxMenu]);

    // ── Carrega eventos da API ─────────────────────────────────────────────
    const carregarEventos = useCallback(async (inicio, fim) => {
        if (!inicio || !fim) return;
        try {
            const res = await fetch(`/api/calendario?inicio=${inicio}&fim=${fim}&contexto=admin`, {
                headers: { Authorization: `Bearer ${TOKEN()}` }
            });
            if (!res.ok) throw new Error();
            const rows = await res.json();
            const mapped = rows.map(r => ({
                id: String(r.id),
                title: r.descricao + (r.funcionario_nome ? ` (${r.funcionario_nome})` : ''),
                date: r.data.slice(0, 10),
                backgroundColor: corPorTipo[r.tipo] || '#888',
                borderColor: corPorTipo[r.tipo] || '#888',
                extendedProps: r,
            }));
            eventosRef.current = mapped;
            setEventos(mapped);
        } catch {
            console.error('Erro ao carregar calendário');
        }
    }, []);

    // ── Funcionários ativos com admissão e sem demissão ───────────────────
    useEffect(() => {
        if (!isAdmin) return;
        fetch('/api/usuarios?ativo=true', { headers: { Authorization: `Bearer ${TOKEN()}` } })
            .then(r => r.json())
            .then(data => {
                const lista = Array.isArray(data) ? data : (data.usuarios || []);
                setFuncionarios(lista.filter(u => u.data_admissao && !u.data_demissao));
            })
            .catch(() => {});
    }, [isAdmin]);

    // ── FullCalendar: navegar entre meses ─────────────────────────────────
    const handleDatesSet = useCallback((info) => {
        const inicio = info.startStr.slice(0, 10);
        const fim    = info.endStr.slice(0, 10);
        intervaloVisivelRef.current = { inicio, fim };
        carregarEventos(inicio, fim);
    }, [carregarEventos]);

    // ── Abre modal do dia (lista de eventos + botão adicionar) ────────────
    const abrirDayModal = useCallback((dateStr) => {
        const lista = eventosRef.current.filter(e => e.date === dateStr);
        setDayModal({ data: dateStr, lista });
    }, []);

    // ── Clique esquerdo num dia → abre modal do dia ───────────────────────
    const handleDateClick = useCallback((info) => {
        abrirDayModal(info.dateStr);
    }, [abrirDayModal]);

    // ── Clique direito num dia (context menu — só PC) ─────────────────────
    const handleDayContextMenu = useCallback((e, dateStr) => {
        if (!isAdmin) return;
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, data: dateStr });
    }, [isAdmin]);

    // ── Injeta contextmenu nas células ────────────────────────────────────
    const handleDayCellDidMount = useCallback((info) => {
        if (!isAdmin) return;
        const dateStr = info.date.toLocaleDateString('en-CA');
        info.el.addEventListener('contextmenu', (e) => handleDayContextMenu(e, dateStr));
    }, [isAdmin, handleDayContextMenu]);

    // ── Clique num evento → abre modal de edição ──────────────────────────
    const handleEventClick = useCallback((info) => {
        if (!isAdmin) return;
        info.jsEvent.stopPropagation();
        const r = info.event.extendedProps;
        setErro('');
        setForm({
            id: r.id, data: r.data.slice(0, 10), tipo: r.tipo,
            funcionario_id: r.funcionario_id || '',
            descricao: r.descricao,
            conta_como_dia_util_pagamento: r.conta_como_dia_util_pagamento,
            visivel_dashboard: r.visivel_dashboard,
        });
    }, [isAdmin]);

    // ── Abre form de criação ──────────────────────────────────────────────
    const abrirFormNovo = (data) => {
        setDayModal(null);
        setCtxMenu(null);
        setErro('');
        setForm({ ...FORM_VAZIO, data });
    };

    // ── Abre form de edição a partir do dayModal ──────────────────────────
    const abrirFormEditar = (r) => {
        setDayModal(null);
        setErro('');
        setForm({
            id: r.id, data: r.data.slice(0, 10), tipo: r.tipo,
            funcionario_id: r.funcionario_id || '',
            descricao: r.descricao,
            conta_como_dia_util_pagamento: r.conta_como_dia_util_pagamento,
            visivel_dashboard: r.visivel_dashboard,
        });
    };

    const recarregar = () => carregarEventos(intervaloVisivelRef.current.inicio, intervaloVisivelRef.current.fim);

    // ── Salvar ────────────────────────────────────────────────────────────
    const handleSalvar = async (e) => {
        e.preventDefault();
        setErro('');
        setSalvando(true);
        const body = {
            data: form.data, tipo: form.tipo,
            funcionario_id: form.tipo === 'falta' ? (form.funcionario_id || null) : null,
            descricao: form.descricao.trim(),
            conta_como_dia_util_pagamento: form.conta_como_dia_util_pagamento,
            visivel_dashboard: form.visivel_dashboard,
        };
        try {
            const url    = form.id ? `/api/calendario/${form.id}` : '/api/calendario';
            const method = form.id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}` },
                body: JSON.stringify(body),
            });
            if (!res.ok) { const err = await res.json(); setErro(err.error || 'Erro ao salvar.'); return; }
            setForm(null);
            recarregar();
        } catch { setErro('Erro de conexão.'); }
        finally { setSalvando(false); }
    };

    // ── Deletar (direto, sem abrir form) ──────────────────────────────────
    const handleDeletar = async (id) => {
        if (!confirm('Remover este evento do calendário?')) return;
        setSalvando(true);
        try {
            await fetch(`/api/calendario/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${TOKEN()}` },
            });
            setForm(null);
            setDayModal(null);
            recarregar();
        } catch { setErro('Erro ao deletar.'); }
        finally { setSalvando(false); }
    };

    const fecharForm   = () => { setForm(null); setErro(''); };
    const fecharDayModal = () => setDayModal(null);

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    return (
        <>
            <UIHeaderPagina titulo="Calendário da Empresa">
                {isAdmin && (
                    <button className="gs-btn gs-btn-primario" onClick={() => abrirFormNovo(hoje)} title="Novo evento">
                        <i className="fas fa-plus"></i> Novo Evento
                    </button>
                )}
                <button className="gs-btn gs-btn-secundario" title="Importar feriados (em breve)" disabled>
                    <i className="fas fa-file-import"></i>
                </button>
            </UIHeaderPagina>

            <div className="gs-conteudo-pagina">
                {/* Legenda */}
                <div className="gs-card gs-card--compacto">
                    <div className="cal-legenda">
                        {TIPOS.map(t => (
                            <span key={t.value} className="cal-legenda-item">
                                <span className="cal-legenda-dot" style={{ background: t.cor }}></span>
                                {t.label}
                            </span>
                        ))}
                    </div>
                    {!isAdmin && (
                        <p className="cal-aviso-somente-leitura">
                            <i className="fas fa-lock"></i> Visualização somente leitura.
                        </p>
                    )}
                </div>

                {/* Calendário */}
                <div className="gs-card cal-wrapper">
                    <FullCalendar
                        ref={calRef}
                        plugins={[dayGridPlugin, interactionPlugin]}
                        initialView="dayGridMonth"
                        locales={allLocales}
                        locale="pt-br"
                        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
                        events={eventos}
                        datesSet={handleDatesSet}
                        dateClick={handleDateClick}
                        eventClick={isAdmin ? handleEventClick : undefined}
                        dayCellDidMount={isAdmin ? handleDayCellDidMount : undefined}
                        eventDisplay="block"
                        dayMaxEvents={3}
                        height="auto"
                        validRange={{ start: '2020-01-01', end: '2030-12-31' }}
                    />
                </div>
            </div>

            {/* ── Context menu (clique direito — PC) ── */}
            {ctxMenu && (
                <div ref={ctxMenuRef} className="cal-ctx-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
                    <button className="cal-ctx-menu-item" onClick={() => abrirFormNovo(ctxMenu.data)}>
                        <i className="fas fa-plus"></i>
                        Novo evento em {new Date(ctxMenu.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </button>
                </div>
            )}

            {/* ── Modal do dia (lista de eventos) ── */}
            {dayModal && (
                <div className="cal-modal-overlay" onClick={fecharDayModal}>
                    <div className="cal-modal cal-modal-dia" onClick={e => e.stopPropagation()}>
                        <div className="cal-modal-header">
                            <h2>
                                <i className="fas fa-calendar-day"></i>{' '}
                                {formatarDataBR(dayModal.data)}
                            </h2>
                            <button className="cal-modal-fechar" onClick={fecharDayModal}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="cal-dia-corpo">
                            {dayModal.lista.length === 0 ? (
                                <p className="cal-dia-vazio">Nenhum evento neste dia.</p>
                            ) : (
                                <ul className="cal-dia-lista">
                                    {dayModal.lista.map(ev => {
                                        const r = ev.extendedProps;
                                        return (
                                            <li key={ev.id} className="cal-dia-item">
                                                <span className="cal-dia-dot" style={{ background: ev.backgroundColor }}></span>
                                                <div className="cal-dia-item-info">
                                                    <span className="cal-dia-item-desc">{r.descricao}</span>
                                                    <span className="cal-dia-item-tipo">{labelPorTipo[r.tipo] || r.tipo}</span>
                                                    {r.funcionario_nome && (
                                                        <span className="cal-dia-item-func"><i className="fas fa-user"></i> {r.funcionario_nome}</span>
                                                    )}
                                                </div>
                                                {isAdmin && (
                                                    <div className="cal-dia-item-acoes">
                                                        <button className="cal-dia-btn-editar" title="Editar" onClick={() => abrirFormEditar(r)}>
                                                            <i className="fas fa-pen"></i>
                                                        </button>
                                                        <button className="cal-dia-btn-deletar" title="Remover" disabled={salvando} onClick={() => handleDeletar(r.id)}>
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {isAdmin && (
                                <button className="cal-dia-btn-novo" onClick={() => abrirFormNovo(dayModal.data)}>
                                    <i className="fas fa-plus"></i> Adicionar evento neste dia
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal de criação/edição ── */}
            {form && (
                <div className="cal-modal-overlay" onClick={fecharForm}>
                    <div className="cal-modal" onClick={e => e.stopPropagation()}>
                        <div className="cal-modal-header">
                            <h2>{form.id ? 'Editar Evento' : 'Novo Evento'}</h2>
                            <button className="cal-modal-fechar" onClick={fecharForm}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSalvar} className="cal-form">
                            <div className="cal-form-grupo">
                                <label>Data</label>
                                <input type="date" required value={form.data}
                                    onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
                            </div>

                            <div className="cal-form-grupo">
                                <label>Tipo</label>
                                <select value={form.tipo}
                                    onChange={e => setForm(f => ({ ...f, tipo: e.target.value, funcionario_id: '' }))}>
                                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>

                            {form.tipo === 'falta' && (
                                <div className="cal-form-grupo">
                                    <label>Funcionário</label>
                                    <select value={form.funcionario_id}
                                        onChange={e => setForm(f => ({ ...f, funcionario_id: e.target.value }))}>
                                        <option value="">— Todos os funcionários —</option>
                                        {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="cal-form-grupo">
                                <label>Descrição</label>
                                <input type="text" required placeholder="Ex: Aniversário de Belo Horizonte"
                                    value={form.descricao}
                                    onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
                            </div>

                            <div className="cal-form-opcoes">
                                <label className="cal-form-toggle">
                                    <input type="checkbox" checked={form.visivel_dashboard}
                                        onChange={e => setForm(f => ({ ...f, visivel_dashboard: e.target.checked }))} />
                                    <span>Visível para empregados</span>
                                </label>
                                <label className="cal-form-toggle">
                                    <input type="checkbox" checked={form.conta_como_dia_util_pagamento}
                                        onChange={e => setForm(f => ({ ...f, conta_como_dia_util_pagamento: e.target.checked }))} />
                                    <span>
                                        Conta como dia útil para pagamento (CLT)
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#888', fontWeight: '400', marginTop: '2px' }}>
                                            Apenas para exceções. Sábados já contam automaticamente (CLT Art. 459).
                                        </span>
                                    </span>
                                </label>
                            </div>

                            {erro && <p className="cal-erro">{erro}</p>}

                            <div className="cal-form-acoes">
                                {form.id && (
                                    <button type="button" className="cal-btn-deletar" disabled={salvando}
                                        onClick={() => handleDeletar(form.id)}>
                                        <i className="fas fa-trash"></i> Remover
                                    </button>
                                )}
                                <button type="button" className="cal-btn-cancelar" onClick={fecharForm} disabled={salvando}>
                                    Cancelar
                                </button>
                                <button type="submit" className="cal-btn-salvar" disabled={salvando}>
                                    {salvando ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                                    {form.id ? ' Salvar' : ' Criar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
