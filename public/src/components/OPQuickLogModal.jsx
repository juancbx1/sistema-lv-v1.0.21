// public/src/components/OPQuickLogModal.jsx
// Painel inline de lançamento rápido de corte — 3 passos: produto → variante → quantidade

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { mostrarMensagem } from '/js/utils/popups.js';

function normalizarTexto(str) {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

// preenchido: { produto, variante, quantidadeSugerida } — quando vindo do Agente de Planejamento
export default function OPQuickLogModal({ produtos, usuario, onClose, onSuccess, preenchido }) {
    // Se veio do agente, abre direto no passo de quantidade com tudo preenchido
    const [step, setStep] = useState(preenchido ? 'quantidade' : 'produto');
    const [produtoSelecionado, setProdutoSelecionado] = useState(preenchido?.produto || null);
    const [varianteSelecionada, setVarianteSelecionada] = useState(preenchido?.variante || null);
    const [busca, setBusca] = useState('');
    const [quantidade, setQuantidade] = useState(
        preenchido?.quantidadeSugerida ? preenchido.quantidadeSugerida.toString() : ''
    );
    const [salvando, setSalvando] = useState(false);
    const [feito, setFeito] = useState(false);

    const inputBuscaRef = useRef(null);
    const inputQtdRef = useRef(null);

    // Foca automaticamente no input correto ao mudar de passo
    useEffect(() => {
        if (step === 'produto' && inputBuscaRef.current) {
            setTimeout(() => inputBuscaRef.current?.focus(), 80);
        }
        if (step === 'quantidade' && inputQtdRef.current) {
            setTimeout(() => inputQtdRef.current?.focus(), 80);
        }
    }, [step]);

    const produtosFiltrados = useMemo(() => {
        if (!busca.trim()) return produtos;
        const t = normalizarTexto(busca);
        return produtos.filter(p => normalizarTexto(p.nome).includes(t));
    }, [produtos, busca]);

    // Grade do produto selecionado (cada item = uma variação individual)
    const variantes = useMemo(() => {
        if (!produtoSelecionado?.grade || produtoSelecionado.grade.length === 0) return [];
        return produtoSelecionado.grade;
    }, [produtoSelecionado]);

    const temVariantes = variantes.length > 0;

    // Imagem contextual para o passo de quantidade
    const imagemAtual = useMemo(() => {
        if (!produtoSelecionado) return '/img/placeholder-image.png';
        if (varianteSelecionada && produtoSelecionado.grade) {
            const g = produtoSelecionado.grade.find(g => g.variacao === varianteSelecionada);
            if (g?.imagem) return g.imagem;
        }
        return produtoSelecionado.imagem || '/img/placeholder-image.png';
    }, [produtoSelecionado, varianteSelecionada]);

    const labelVariante = varianteSelecionada || 'Padrão';

    // ── Handlers de seleção ──

    const handleSelecionarProduto = (produto) => {
        setProdutoSelecionado(produto);
        setBusca('');
        if (!produto.grade || produto.grade.length === 0) {
            setVarianteSelecionada(null);
            setStep('quantidade');
        } else {
            setStep('variante');
        }
    };

    const handleSelecionarVariante = (grade) => {
        setVarianteSelecionada(grade.variacao);
        setStep('quantidade');
    };

    const voltarPasso = () => {
        // Se veio pré-preenchido pelo agente, "Voltar" fecha o painel
        if (preenchido) { onClose(); return; }

        if (step === 'quantidade') {
            if (temVariantes) {
                setStep('variante');
            } else {
                setProdutoSelecionado(null);
                setVarianteSelecionada(null);
                setStep('produto');
            }
        } else if (step === 'variante') {
            setProdutoSelecionado(null);
            setVarianteSelecionada(null);
            setStep('produto');
        }
    };

    const ajustarQtd = (delta) => {
        setQuantidade(prev => {
            const novo = Math.max(0, (parseInt(prev) || 0) + delta);
            return novo.toString();
        });
    };

    const definirQtd = (valor) => {
        setQuantidade(valor.toString());
    };

    // ── Confirmação ──

    const handleConfirmar = async () => {
        const qty = parseInt(quantidade);
        if (!qty || qty <= 0) {
            mostrarMensagem('Informe uma quantidade válida.', 'aviso');
            return;
        }
        setSalvando(true);
        try {
            const token = localStorage.getItem('token');

            const pcRes = await fetch('/api/cortes/next-pc-number', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!pcRes.ok) throw new Error('Falha ao obter número do PC.');
            const { nextPC } = await pcRes.json();

            const payload = {
                produto_id: produtoSelecionado.id,
                variante: varianteSelecionada || null,
                quantidade: qty,
                data: new Date().toISOString().split('T')[0],
                pn: nextPC,
                status: 'cortados',
                op: null,
                cortador: usuario?.nome || 'Sistema'
            };

            const res = await fetch('/api/cortes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao registrar corte.');
            }

            setFeito(true);
            setTimeout(() => {
                onSuccess();
            }, 1100);

        } catch (err) {
            mostrarMensagem(err.message, 'erro');
        } finally {
            setSalvando(false);
        }
    };

    const tituloPasso = {
        produto: 'Qual produto foi cortado?',
        variante: `${produtoSelecionado?.nome} — Qual variante?`,
        quantidade: preenchido
            ? `${produtoSelecionado?.nome}${varianteSelecionada ? ' — ' + varianteSelecionada : ''}`
            : 'Quantas peças foram cortadas?'
    }[step];

    return (
        <div className="op-quicklog-panel">

            {/* ── HEADER ── */}
            <div className="op-quicklog-header">
                <div className="op-quicklog-titulo">
                    {step !== 'produto' && !feito && (
                        <button className="op-quicklog-voltar" onClick={voltarPasso} title="Voltar">
                            <i className="fas fa-arrow-left"></i>
                        </button>
                    )}
                    <i className="fas fa-bolt op-quicklog-icone-titulo"></i>
                    <span>{feito ? 'Corte registrado!' : tituloPasso}</span>
                </div>
                <button className="op-quicklog-fechar" onClick={onClose} title="Fechar">
                    <i className="fas fa-times"></i>
                </button>
            </div>

            {/* ── CORPO ── */}
            <div className="op-quicklog-corpo">

                {/* SUCCESS */}
                {feito && (
                    <div className="op-quicklog-sucesso">
                        <i className="fas fa-check-circle"></i>
                        <span>{quantidade} pçs de <strong>{produtoSelecionado?.nome}</strong> {labelVariante !== 'Padrão' ? `— ${labelVariante}` : ''} adicionadas ao estoque.</span>
                    </div>
                )}

                {/* STEP: Produto */}
                {!feito && step === 'produto' && (
                    <>
                        <div className="op-quicklog-busca">
                            <i className="fas fa-search"></i>
                            <input
                                ref={inputBuscaRef}
                                type="text"
                                placeholder="Buscar produto..."
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                            />
                            {busca && (
                                <button onClick={() => setBusca('')}>
                                    <i className="fas fa-times"></i>
                                </button>
                            )}
                        </div>
                        <div className="op-quicklog-grid">
                            {produtosFiltrados.length === 0 ? (
                                <div className="op-quicklog-vazio">
                                    <i className="fas fa-search"></i>
                                    <span>Nenhum produto encontrado</span>
                                </div>
                            ) : (
                                produtosFiltrados.map(p => (
                                    <div
                                        key={p.id}
                                        className="op-quicklog-produto-card"
                                        onClick={() => handleSelecionarProduto(p)}
                                    >
                                        <img
                                            src={p.imagem || '/img/placeholder-image.png'}
                                            alt={p.nome}
                                        />
                                        <span>{p.nome}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                {/* STEP: Variante */}
                {!feito && step === 'variante' && (
                    <div className="op-quicklog-grid">
                        {variantes.map((g, i) => (
                            <div
                                key={i}
                                className="op-quicklog-produto-card"
                                onClick={() => handleSelecionarVariante(g)}
                            >
                                <img
                                    src={g.imagem || produtoSelecionado?.imagem || '/img/placeholder-image.png'}
                                    alt={g.variacao}
                                />
                                <span>{g.variacao}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* STEP: Quantidade */}
                {!feito && step === 'quantidade' && (
                    <div className="op-quicklog-qty-area">
                        {/* Resumo do produto selecionado */}
                        <div className="op-quicklog-resumo">
                            <img src={imagemAtual} alt={labelVariante} className="op-quicklog-resumo-img" />
                            <div className="op-quicklog-resumo-texto">
                                <div className="op-quicklog-resumo-nome">{produtoSelecionado?.nome}</div>
                                <div className="op-quicklog-resumo-variante">{labelVariante}</div>
                            </div>
                        </div>

                        {/* Controles de quantidade */}
                        <div className="op-quicklog-qty-controles">
                            <button
                                className="op-quicklog-qty-btn"
                                onClick={() => ajustarQtd(-1)}
                            >−</button>
                            <input
                                ref={inputQtdRef}
                                type="number"
                                className="op-quicklog-qty-input"
                                value={quantidade}
                                onChange={e => {
                                    const v = e.target.value;
                                    if (v === '' || parseInt(v) >= 0) setQuantidade(v);
                                }}
                                placeholder="0"
                                min="0"
                            />
                            <button
                                className="op-quicklog-qty-btn"
                                onClick={() => ajustarQtd(1)}
                            >+</button>
                        </div>

                        {/* Atalhos de quantidade */}
                        <div className="op-quicklog-qty-atalhos">
                            {[10, 30, 60, 100].map(n => (
                                <button key={n} onClick={() => definirQtd(n)}>
                                    {n} pçs
                                </button>
                            ))}
                        </div>

                        {/* Botão confirmar */}
                        <button
                            className="op-quicklog-confirmar"
                            onClick={handleConfirmar}
                            disabled={salvando || !quantidade || parseInt(quantidade) <= 0}
                        >
                            {salvando
                                ? <><div className="op-spinner-btn"></div> Salvando...</>
                                : <><i className="fas fa-check"></i> Confirmar Corte</>
                            }
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
